import type { Prisma, PrismaClient } from '@prisma/client'
import { recalcProjectRollup } from '@/lib/projects/rollup'

type Db = PrismaClient | Prisma.TransactionClient

export type JiraMappingType = 'MANUAL' | 'EPIC' | 'LABEL' | 'COMPONENT' | 'SPRINT'

export interface JiraIssueForRollup {
  jiraKey: string
  statusCategory: string
  epicKey: string | null
  sprintId: string | null
  storyPoints: number | null
  labels: string[]
  components: string[]
}

export interface JiraRollupResult {
  totalIssues: number
  doneIssues: number
  totalPoints: number
  donePoints: number
  percentComplete: number
  weightedByPoints: boolean
}

export function buildJiraMappingKeys(type: JiraMappingType, values: readonly string[]): string[] {
  const cleaned = values.map((value) => value.trim()).filter(Boolean)
  if (type === 'MANUAL') return cleaned.map((value) => value.toUpperCase())
  return cleaned.map((value) => `${type}:${type === 'LABEL' || type === 'COMPONENT' ? value : value.toUpperCase()}`)
}

export function parseJiraMappingKeys(keys: readonly string[]): { type: JiraMappingType; values: string[] } {
  const firstToken = keys.find((key) => key.includes(':'))
  if (!firstToken) return { type: 'MANUAL', values: [...keys] }
  const [rawType] = firstToken.split(':', 1)
  const type = isMappingType(rawType) ? rawType : 'MANUAL'
  if (type === 'MANUAL') return { type, values: [...keys] }
  return {
    type,
    values: keys
      .filter((key) => key.startsWith(`${type}:`))
      .map((key) => key.slice(type.length + 1))
      .filter(Boolean),
  }
}

export function computeJiraRollup(issues: readonly JiraIssueForRollup[]): JiraRollupResult {
  const totalIssues = issues.length
  const doneIssues = issues.filter(isDoneIssue).length
  const totalPoints = issues.reduce((sum, issue) => sum + Math.max(0, issue.storyPoints ?? 0), 0)
  const donePoints = issues.filter(isDoneIssue).reduce((sum, issue) => sum + Math.max(0, issue.storyPoints ?? 0), 0)
  const weightedByPoints = totalPoints > 0
  const percentComplete = totalIssues === 0
    ? 0
    : weightedByPoints
      ? (donePoints / totalPoints) * 100
      : (doneIssues / totalIssues) * 100
  return {
    totalIssues,
    doneIssues,
    totalPoints,
    donePoints,
    percentComplete: Math.round(percentComplete * 10) / 10,
    weightedByPoints,
  }
}

export function filterIssuesForMapping(issues: readonly JiraIssueForRollup[], keys: readonly string[]): JiraIssueForRollup[] {
  const mapping = parseJiraMappingKeys(keys)
  const values = new Set(mapping.values.map((value) => normalizeMappingValue(mapping.type, value)))
  if (values.size === 0) return []

  return issues.filter((issue) => {
    if (mapping.type === 'MANUAL') return values.has(issue.jiraKey.toUpperCase())
    if (mapping.type === 'EPIC') return issue.epicKey ? values.has(issue.epicKey.toUpperCase()) : false
    if (mapping.type === 'SPRINT') return issue.sprintId ? values.has(issue.sprintId.toUpperCase()) : false
    if (mapping.type === 'LABEL') return issue.labels.some((label) => values.has(label.toLowerCase()))
    if (mapping.type === 'COMPONENT') return issue.components.some((component) => values.has(component.toLowerCase()))
    return false
  })
}

export async function applyJiraAutoRollups(db: Db, connectionId: string): Promise<{ activitiesUpdated: number; projectsUpdated: number }> {
  const [activities, issues] = await Promise.all([
    db.activity.findMany({
      where: {
        jiraAutoRollup: true,
        milestone: { phase: { project: { jiraConnectionId: connectionId } } },
      },
      select: {
        id: true,
        jiraIssueKeys: true,
        percentComplete: true,
        milestone: { select: { phase: { select: { projectId: true } } } },
      },
    }),
    db.jiraIssue.findMany({
      where: { connectionId },
      select: {
        jiraKey: true,
        statusCategory: true,
        epicKey: true,
        sprintId: true,
        storyPoints: true,
        labels: true,
        components: true,
      },
    }),
  ])

  const projectIds = new Set<string>()
  let activitiesUpdated = 0
  for (const activity of activities) {
    const rollup = computeJiraRollup(filterIssuesForMapping(issues, activity.jiraIssueKeys))
    if (activity.percentComplete !== rollup.percentComplete) {
      await db.activity.update({
        where: { id: activity.id },
        data: { percentComplete: rollup.percentComplete },
      })
      activitiesUpdated += 1
      projectIds.add(activity.milestone.phase.projectId)
    }
  }

  for (const projectId of projectIds) {
    await recalcProjectRollup(db, projectId)
  }
  return { activitiesUpdated, projectsUpdated: projectIds.size }
}

export async function previewJiraRollup(db: Db, projectId: string, keys: readonly string[]): Promise<JiraRollupResult & { sampleIssueKeys: string[] }> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { jiraConnectionId: true },
  })
  if (!project?.jiraConnectionId) {
    return { ...computeJiraRollup([]), sampleIssueKeys: [] }
  }
  const issues = await db.jiraIssue.findMany({
    where: { connectionId: project.jiraConnectionId },
    select: {
      jiraKey: true,
      statusCategory: true,
      epicKey: true,
      sprintId: true,
      storyPoints: true,
      labels: true,
      components: true,
    },
  })
  const matched = filterIssuesForMapping(issues, keys)
  return { ...computeJiraRollup(matched), sampleIssueKeys: matched.slice(0, 8).map((issue) => issue.jiraKey) }
}

function isDoneIssue(issue: JiraIssueForRollup) {
  return issue.statusCategory === 'DONE'
}

function normalizeMappingValue(type: JiraMappingType, value: string): string {
  return type === 'LABEL' || type === 'COMPONENT' ? value.toLowerCase() : value.toUpperCase()
}

function isMappingType(value: string): value is JiraMappingType {
  return value === 'MANUAL' || value === 'EPIC' || value === 'LABEL' || value === 'COMPONENT' || value === 'SPRINT'
}
