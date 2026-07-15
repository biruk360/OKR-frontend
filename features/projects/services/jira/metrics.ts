import type { Prisma, PrismaClient } from '@prisma/client'
import { toDateKey, workingDaysInRange } from '@/lib/projects/business-days'

type Db = PrismaClient | Prisma.TransactionClient

export type JiraActivityEventType = 'TRANSITION' | 'WORKLOG' | 'COMMENT'
export type EstimateBias = 'SYSTEMATICALLY_UNDERESTIMATES' | 'SYSTEMATICALLY_OVERESTIMATES' | 'BALANCED' | 'UNKNOWN'

export interface JiraMetricsIssueInput {
  jiraKey: string
  summary?: string | null
  assigneeUserId?: string | null
  assigneeEmail?: string | null
  assigneeName?: string | null
  originalEstimateSeconds?: number | null
  timeSpentSeconds?: number | null
}

export interface JiraActivityEventInput {
  userId?: string | null
  email?: string | null
  name?: string | null
  occurredAt: Date
  type: JiraActivityEventType
}

export interface JiraIssueEstimateMetric {
  jiraKey: string
  summary: string | null
  estimateHours: number
  actualHours: number
  estimateAccuracy: number
}

export interface JiraDeveloperMetric {
  userId: string | null
  email: string | null
  name: string
  assignedIssues: number
  estimatedIssues: number
  idleDays: number
  idleDayKeys: string[]
  activeDayKeys: string[]
  medianEstimateAccuracy: number | null
  estimateBias: EstimateBias
  issueEstimates: JiraIssueEstimateMetric[]
}

export interface JiraDeveloperMetricsResult {
  jiraLinked: boolean
  period: { from: string; to: string }
  workingDays: string[]
  rows: JiraDeveloperMetric[]
}

interface PersonBucket {
  userId: string | null
  email: string | null
  name: string
  activeDayKeys: Set<string>
  issueEstimates: JiraIssueEstimateMetric[]
  assignedIssues: number
}

export function computeJiraDeveloperMetrics(input: {
  from: Date
  to: Date
  issues: readonly JiraMetricsIssueInput[]
  events: readonly JiraActivityEventInput[]
  holidays?: ReadonlySet<string>
}): JiraDeveloperMetricsResult {
  const workingDays = workingDaysInRange(input.from, input.to, input.holidays).map(toDateKey)
  const workingDaySet = new Set(workingDays)
  const people = new Map<string, PersonBucket>()

  for (const issue of input.issues) {
    const key = personKey(issue.assigneeUserId, issue.assigneeEmail)
    if (!key) continue
    const bucket = ensurePerson(people, key, issue.assigneeUserId ?? null, issue.assigneeEmail ?? null, issue.assigneeName)
    bucket.assignedIssues += 1
    const estimate = issueEstimateMetric(issue)
    if (estimate) bucket.issueEstimates.push(estimate)
  }

  for (const event of input.events) {
    const key = personKey(event.userId, event.email)
    if (!key) continue
    const dayKey = toDateKey(event.occurredAt)
    if (!workingDaySet.has(dayKey)) continue
    ensurePerson(people, key, event.userId ?? null, event.email ?? null, event.name).activeDayKeys.add(dayKey)
  }

  const rows = [...people.values()]
    .map((bucket) => {
      const activeDayKeys = [...bucket.activeDayKeys].sort()
      const idleDayKeys = workingDays.filter((day) => !bucket.activeDayKeys.has(day))
      const accuracies = bucket.issueEstimates.map((issue) => issue.estimateAccuracy)
      const medianEstimateAccuracy = median(accuracies)
      return {
        userId: bucket.userId,
        email: bucket.email,
        name: bucket.name,
        assignedIssues: bucket.assignedIssues,
        estimatedIssues: bucket.issueEstimates.length,
        idleDays: idleDayKeys.length,
        idleDayKeys,
        activeDayKeys,
        medianEstimateAccuracy,
        estimateBias: estimateBias(medianEstimateAccuracy),
        issueEstimates: bucket.issueEstimates.sort((a, b) => a.jiraKey.localeCompare(b.jiraKey)),
      }
    })
    .sort((a, b) => b.idleDays - a.idleDays || a.name.localeCompare(b.name))

  return {
    jiraLinked: true,
    period: { from: toDateKey(input.from), to: toDateKey(input.to) },
    workingDays,
    rows,
  }
}

export async function getJiraDeveloperMetrics(db: Db, input: {
  projectId: string
  from: Date
  to: Date
  holidays?: ReadonlySet<string>
}): Promise<JiraDeveloperMetricsResult> {
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { jiraLinked: true, jiraConnectionId: true },
  })
  if (!project?.jiraLinked || !project.jiraConnectionId) {
    const workingDays = workingDaysInRange(input.from, input.to, input.holidays).map(toDateKey)
    return {
      jiraLinked: false,
      period: { from: toDateKey(input.from), to: toDateKey(input.to) },
      workingDays,
      rows: [],
    }
  }

  const [issues, worklogs, transitions] = await Promise.all([
    db.jiraIssue.findMany({
      where: { connectionId: project.jiraConnectionId },
      select: {
        jiraKey: true,
        summary: true,
        assigneeUserId: true,
        assigneeEmail: true,
        originalEstimateSeconds: true,
        timeSpentSeconds: true,
        jiraUpdatedAt: true,
        lastActivityAt: true,
      },
    }),
    db.jiraWorklog.findMany({
      where: {
        issue: { connectionId: project.jiraConnectionId },
        startedAt: { gte: startOfUtcDay(input.from), lte: endOfUtcDay(input.to) },
      },
      select: { authorUserId: true, authorEmail: true, startedAt: true },
    }),
    db.jiraTransition.findMany({
      where: {
        issue: { connectionId: project.jiraConnectionId },
        transitionedAt: { gte: startOfUtcDay(input.from), lte: endOfUtcDay(input.to) },
      },
      select: { authorEmail: true, transitionedAt: true },
    }),
  ])

  const users = await usersByIdentity(db, {
    userIds: [
      ...issues.map((issue) => issue.assigneeUserId),
      ...worklogs.map((worklog) => worklog.authorUserId),
    ],
    emails: [
      ...issues.map((issue) => issue.assigneeEmail),
      ...worklogs.map((worklog) => worklog.authorEmail),
      ...transitions.map((transition) => transition.authorEmail),
    ],
  })

  const normalizedIssues: JiraMetricsIssueInput[] = issues.map((issue) => {
    const user = identityLookup(users, issue.assigneeUserId, issue.assigneeEmail)
    return {
      jiraKey: issue.jiraKey,
      summary: issue.summary,
      assigneeUserId: issue.assigneeUserId,
      assigneeEmail: issue.assigneeEmail,
      assigneeName: user?.name ?? user?.email ?? issue.assigneeEmail,
      originalEstimateSeconds: issue.originalEstimateSeconds,
      timeSpentSeconds: issue.timeSpentSeconds,
    }
  })

  const commentOrUpdateEvents: JiraActivityEventInput[] = issues
    .map((issue) => {
      const occurredAt = issue.lastActivityAt ?? issue.jiraUpdatedAt
      if (!occurredAt || !issue.assigneeUserId && !issue.assigneeEmail) return null
      const user = identityLookup(users, issue.assigneeUserId, issue.assigneeEmail)
      return {
        type: 'COMMENT' as const,
        userId: issue.assigneeUserId,
        email: issue.assigneeEmail,
        name: user?.name ?? user?.email ?? issue.assigneeEmail,
        occurredAt,
      }
    })
    .filter(Boolean) as JiraActivityEventInput[]

  const events: JiraActivityEventInput[] = [
    ...worklogs.map((worklog) => {
      const user = identityLookup(users, worklog.authorUserId, worklog.authorEmail)
      return {
        type: 'WORKLOG' as const,
        userId: worklog.authorUserId,
        email: worklog.authorEmail,
        name: user?.name ?? user?.email ?? worklog.authorEmail,
        occurredAt: worklog.startedAt,
      }
    }),
    ...transitions.map((transition) => {
      const user = identityLookup(users, null, transition.authorEmail)
      return {
        type: 'TRANSITION' as const,
        userId: user?.id ?? null,
        email: transition.authorEmail,
        name: user?.name ?? user?.email ?? transition.authorEmail,
        occurredAt: transition.transitionedAt,
      }
    }),
    ...commentOrUpdateEvents,
  ]

  return computeJiraDeveloperMetrics({
    from: input.from,
    to: input.to,
    holidays: input.holidays,
    issues: normalizedIssues,
    events,
  })
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  return round2(value)
}

export function estimateBias(value: number | null): EstimateBias {
  if (value == null) return 'UNKNOWN'
  if (value >= 1.25) return 'SYSTEMATICALLY_UNDERESTIMATES'
  if (value <= 0.8) return 'SYSTEMATICALLY_OVERESTIMATES'
  return 'BALANCED'
}

function issueEstimateMetric(issue: JiraMetricsIssueInput): JiraIssueEstimateMetric | null {
  const estimateSeconds = issue.originalEstimateSeconds ?? 0
  if (estimateSeconds <= 0) return null
  const actualSeconds = Math.max(0, issue.timeSpentSeconds ?? 0)
  const estimateHours = estimateSeconds / 3600
  const actualHours = actualSeconds / 3600
  return {
    jiraKey: issue.jiraKey,
    summary: issue.summary ?? null,
    estimateHours: round2(estimateHours),
    actualHours: round2(actualHours),
    estimateAccuracy: round2(actualHours / estimateHours),
  }
}

function personKey(userId?: string | null, email?: string | null): string | null {
  if (userId) return `user:${userId}`
  const normalizedEmail = email?.trim().toLowerCase()
  return normalizedEmail ? `email:${normalizedEmail}` : null
}

function ensurePerson(
  people: Map<string, PersonBucket>,
  key: string,
  userId: string | null,
  email: string | null,
  name?: string | null,
): PersonBucket {
  const existing = people.get(key)
  if (existing) return existing
  const normalizedEmail = email?.trim().toLowerCase() || null
  const bucket: PersonBucket = {
    userId,
    email: normalizedEmail,
    name: name?.trim() || normalizedEmail || userId || 'Unknown developer',
    activeDayKeys: new Set(),
    issueEstimates: [],
    assignedIssues: 0,
  }
  people.set(key, bucket)
  return bucket
}

async function usersByIdentity(db: Db, input: { userIds: Array<string | null>; emails: Array<string | null> }) {
  const userIds = [...new Set(input.userIds.filter(Boolean) as string[])]
  const emails = [...new Set(input.emails.map((email) => email?.toLowerCase()).filter(Boolean) as string[])]
  if (userIds.length === 0 && emails.length === 0) return { byId: new Map<string, UserIdentity>(), byEmail: new Map<string, UserIdentity>() }
  const or: Prisma.UserWhereInput[] = []
  if (userIds.length) or.push({ id: { in: userIds } })
  if (emails.length) or.push({ email: { in: emails } })
  const users = await db.user.findMany({
    where: { OR: or },
    select: { id: true, email: true, name: true },
  })
  return {
    byId: new Map(users.map((user) => [user.id, user])),
    byEmail: new Map(users.map((user) => [user.email.toLowerCase(), user])),
  }
}

interface UserIdentity {
  id: string
  email: string
  name: string | null
}

function identityLookup(users: { byId: Map<string, UserIdentity>; byEmail: Map<string, UserIdentity> }, userId?: string | null, email?: string | null) {
  if (userId && users.byId.has(userId)) return users.byId.get(userId)
  const normalizedEmail = email?.toLowerCase()
  return normalizedEmail ? users.byEmail.get(normalizedEmail) : undefined
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999))
}
