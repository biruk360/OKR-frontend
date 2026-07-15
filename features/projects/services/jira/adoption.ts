import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export interface JiraAdoptionIssueInput {
  jiraKey: string
  assigneeUserId?: string | null
  assigneeEmail?: string | null
  originalEstimateSeconds?: number | null
  storyPoints?: number | null
  jiraUpdatedAt: Date
}

export interface JiraAdoptionScore {
  issueCount: number
  assigneePct: number
  estimatePct: number
  updatedRecentlyPct: number
  storyPointsPct: number | null
  score: number
  warning: boolean
}

export interface JiraTeamAdoptionScore extends JiraAdoptionScore {
  teamKey: string
  label: string
}

export interface JiraAdoptionResult {
  jiraLinked: boolean
  project: JiraAdoptionScore
  teams: JiraTeamAdoptionScore[]
}

export function computeJiraAdoptionScore(
  issues: readonly JiraAdoptionIssueInput[],
  now = new Date(),
): JiraAdoptionScore {
  const issueCount = issues.length
  if (issueCount === 0) {
    return {
      issueCount: 0,
      assigneePct: 0,
      estimatePct: 0,
      updatedRecentlyPct: 0,
      storyPointsPct: null,
      score: 0,
      warning: true,
    }
  }

  const assigneePct = pct(issues.filter((issue) => issue.assigneeUserId || issue.assigneeEmail).length, issueCount)
  const estimatePct = pct(issues.filter((issue) => (issue.originalEstimateSeconds ?? 0) > 0).length, issueCount)
  const updatedRecentlyPct = pct(issues.filter((issue) => now.getTime() - issue.jiraUpdatedAt.getTime() <= THREE_DAYS_MS).length, issueCount)
  const storyPointsUsed = issues.some((issue) => (issue.storyPoints ?? 0) > 0)
  const storyPointsPct = storyPointsUsed ? pct(issues.filter((issue) => (issue.storyPoints ?? 0) > 0).length, issueCount) : null
  const parts = [assigneePct, estimatePct, updatedRecentlyPct, ...(storyPointsPct == null ? [] : [storyPointsPct])]
  const score = round1(parts.reduce((sum, value) => sum + value, 0) / parts.length)

  return {
    issueCount,
    assigneePct,
    estimatePct,
    updatedRecentlyPct,
    storyPointsPct,
    score,
    warning: score < 60,
  }
}

export function computeJiraAdoption(
  issues: readonly JiraAdoptionIssueInput[],
  now = new Date(),
): JiraAdoptionResult {
  const teams = new Map<string, JiraAdoptionIssueInput[]>()
  for (const issue of issues) {
    const key = issue.assigneeUserId ? `user:${issue.assigneeUserId}` : issue.assigneeEmail ? `email:${issue.assigneeEmail.toLowerCase()}` : 'unassigned'
    const bucket = teams.get(key) ?? []
    bucket.push(issue)
    teams.set(key, bucket)
  }

  return {
    jiraLinked: true,
    project: computeJiraAdoptionScore(issues, now),
    teams: [...teams.entries()]
      .map(([teamKey, rows]) => ({
        teamKey,
        label: teamKey === 'unassigned' ? 'Unassigned' : teamKey.replace(/^(user|email):/, ''),
        ...computeJiraAdoptionScore(rows, now),
      }))
      .sort((a, b) => a.score - b.score || b.issueCount - a.issueCount),
  }
}

export async function getJiraAdoption(db: Db, projectId: string, now = new Date()): Promise<JiraAdoptionResult> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { jiraLinked: true, jiraConnectionId: true },
  })
  if (!project?.jiraLinked || !project.jiraConnectionId) {
    return {
      jiraLinked: false,
      project: computeJiraAdoptionScore([], now),
      teams: [],
    }
  }
  const issues = await db.jiraIssue.findMany({
    where: { connectionId: project.jiraConnectionId },
    select: {
      jiraKey: true,
      assigneeUserId: true,
      assigneeEmail: true,
      originalEstimateSeconds: true,
      storyPoints: true,
      jiraUpdatedAt: true,
    },
  })
  return computeJiraAdoption(issues, now)
}

function pct(count: number, total: number): number {
  return round1((count / total) * 100)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
