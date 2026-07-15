import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { decryptJiraToken } from '@/lib/projects/jira-crypto'
import { mapJiraHttpError, normalizeJiraSiteUrl } from './connection'
import { applyJiraAutoRollups } from './rollup'

type Db = PrismaClient | Prisma.TransactionClient
type FetchLike = typeof fetch
type SleepFn = (ms: number) => Promise<void>

export interface JiraSyncOptions {
  trigger: 'CRON' | 'MANUAL' | 'WEBHOOK'
  connectionId?: string
  fetchImpl?: FetchLike
  sleep?: SleepFn
  minRequestIntervalMs?: number
  retryBaseMs?: number
}

export interface JiraSyncConnectionResult {
  connectionId: string
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
  issuesPulled: number
  sprintsPulled: number
  worklogsPulled: number
  errors: string | null
  durationMs: number
}

interface JiraConnectionForSync {
  id: string
  siteUrl: string
  email: string | null
  encryptedToken: string
  projectKey: string
}

interface JiraIssuePayload {
  id: string
  key: string
  fields: {
    summary?: string
    issuetype?: { name?: string }
    status?: { name?: string; statusCategory?: { key?: string; name?: string } }
    assignee?: { emailAddress?: string }
    parent?: { key?: string }
    customfield_10014?: string
    customfield_10016?: number
    customfield_10020?: { id?: number | string }[]
    labels?: string[]
    components?: { name?: string }[]
    created?: string
    updated?: string
    resolutiondate?: string | null
    timeoriginalestimate?: number | null
    aggregatetimeoriginalestimate?: number | null
    timespent?: number | null
    aggregatetimespent?: number | null
  }
}

interface JiraSearchResponse {
  issues?: JiraIssuePayload[]
  total?: number
  startAt?: number
  maxResults?: number
}

interface JiraSprintPayload {
  id: number | string
  name?: string
  state?: string
  startDate?: string
  endDate?: string
  completeDate?: string
}

interface JiraWorklogPayload {
  author?: { emailAddress?: string }
  timeSpentSeconds?: number
  started?: string
}

interface JiraChangelogPayload {
  created?: string
  author?: { emailAddress?: string }
  items?: { field?: string; fromString?: string; toString?: string }[]
}

export function incrementalJql(projectKey: string): string {
  return `project = ${projectKey} AND updated >= -35m ORDER BY updated ASC`
}

export function jiraStatusCategory(value: string | undefined): 'TODO' | 'IN_PROGRESS' | 'DONE' {
  const normalized = (value ?? '').toLowerCase()
  if (normalized === 'done') return 'DONE'
  if (normalized === 'indeterminate' || normalized === 'in_progress' || normalized === 'in progress') return 'IN_PROGRESS'
  return 'TODO'
}

export function jiraIssueToDb(issue: JiraIssuePayload, userByEmail: Map<string, string>, connectionId: string) {
  const fields = issue.fields ?? {}
  const assigneeEmail = fields.assignee?.emailAddress ?? null
  const sprint = fields.customfield_10020?.at(-1)
  const labels = fields.labels ?? []
  const components = (fields.components ?? []).map((component) => component.name).filter(Boolean) as string[]
  const status = fields.status?.name ?? 'Unknown'
  return {
    connectionId,
    jiraKey: issue.key,
    jiraId: issue.id,
    summary: fields.summary ?? issue.key,
    issueType: fields.issuetype?.name ?? 'Task',
    status,
    statusCategory: jiraStatusCategory(fields.status?.statusCategory?.key ?? fields.status?.statusCategory?.name),
    assigneeEmail,
    assigneeUserId: assigneeEmail ? userByEmail.get(assigneeEmail.toLowerCase()) ?? null : null,
    epicKey: fields.customfield_10014 ?? fields.parent?.key ?? null,
    sprintId: sprint?.id != null ? String(sprint.id) : null,
    storyPoints: typeof fields.customfield_10016 === 'number' ? fields.customfield_10016 : null,
    originalEstimateSeconds: fields.timeoriginalestimate ?? fields.aggregatetimeoriginalestimate ?? null,
    timeSpentSeconds: fields.timespent ?? fields.aggregatetimespent ?? null,
    labels,
    components,
    jiraCreatedAt: parseJiraDate(fields.created) ?? new Date(),
    jiraUpdatedAt: parseJiraDate(fields.updated) ?? new Date(),
    resolvedAt: parseJiraDate(fields.resolutiondate),
    isBlocked: status.toLowerCase().includes('block'),
    blockedSince: status.toLowerCase().includes('block') ? parseJiraDate(fields.updated) ?? null : null,
    lastActivityAt: latestDate([fields.updated, fields.resolutiondate]),
  }
}

export async function syncActiveJiraConnections(options: JiraSyncOptions): Promise<{ results: JiraSyncConnectionResult[] }> {
  const where: Prisma.JiraConnectionWhereInput = {
    isActive: true,
    ...(options.connectionId ? { id: options.connectionId } : {}),
  }
  const connections = await prisma.jiraConnection.findMany({
    where,
    select: { id: true, siteUrl: true, email: true, encryptedToken: true, projectKey: true },
    orderBy: { createdAt: 'asc' },
  })

  const results: JiraSyncConnectionResult[] = []
  for (const connection of connections) {
    results.push(await syncJiraConnection(connection, options))
  }
  return { results }
}

export async function syncJiraConnection(
  connection: JiraConnectionForSync,
  options: JiraSyncOptions,
): Promise<JiraSyncConnectionResult> {
  const startedAt = Date.now()
  let issuesPulled = 0
  let sprintsPulled = 0
  let worklogsPulled = 0
  let status: JiraSyncConnectionResult['status'] = 'SUCCESS'
  const errors: string[] = []

  try {
    if (!connection.email) throw new Error('Jira connection is missing an email address.')
    const token = decryptJiraToken(connection.encryptedToken)
    const client = new JiraSyncClient(connection.siteUrl, connection.email, token, options)
    const issues = await client.searchIssues(incrementalJql(connection.projectKey))
    const sprints = await client.fetchSprints(connection.projectKey)

    const userByEmail = await resolveUsersByEmail(prisma, issueEmails(issues))
    sprintsPulled = await upsertSprints(prisma, connection.id, sprints)

    for (const issue of issues) {
      try {
        const issueRecord = await upsertIssue(prisma, connection.id, issue, userByEmail)
        issuesPulled += 1
        const worklogs = await client.fetchWorklogs(issue.key)
        const transitions = await client.fetchTransitions(issue.key)
        worklogsPulled += await replaceWorklogs(prisma, issueRecord.id, worklogs, userByEmail)
        await replaceTransitions(prisma, issueRecord.id, transitions)
      } catch (error) {
        status = 'PARTIAL'
        errors.push(`${issue.key}: ${errorMessage(error)}`)
      }
    }
    await prisma.$transaction((tx) => applyJiraAutoRollups(tx, connection.id))
  } catch (error) {
    status = status === 'PARTIAL' ? 'PARTIAL' : 'FAILED'
    errors.push(errorMessage(error))
  }

  const durationMs = Date.now() - startedAt
  const errorsText = errors.length ? errors.join('\n').slice(0, 4000) : null
  await prisma.$transaction(async (tx) => {
    await tx.jiraSyncLog.create({
      data: {
        connectionId: connection.id,
        trigger: options.trigger,
        status,
        issuesPulled,
        sprintsPulled,
        worklogsPulled,
        errors: errorsText,
        durationMs,
      },
    })
    await tx.jiraConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: status,
      },
    })
  })

  return { connectionId: connection.id, status, issuesPulled, sprintsPulled, worklogsPulled, errors: errorsText, durationMs }
}

class JiraSyncClient {
  private readonly siteUrl: string
  private readonly headers: HeadersInit
  private readonly fetchImpl: FetchLike
  private readonly sleep: SleepFn
  private readonly minRequestIntervalMs: number
  private readonly retryBaseMs: number
  private lastRequestAt = 0

  constructor(siteUrl: string, email: string, token: string, options: JiraSyncOptions) {
    this.siteUrl = normalizeJiraSiteUrl(siteUrl)
    this.fetchImpl = options.fetchImpl ?? fetch
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? 100
    this.retryBaseMs = options.retryBaseMs ?? 250
    this.headers = {
      Authorization: `Basic ${Buffer.from(`${email}:${token}`, 'utf8').toString('base64')}`,
      Accept: 'application/json',
    }
  }

  async searchIssues(jql: string): Promise<JiraIssuePayload[]> {
    const issues: JiraIssuePayload[] = []
    let startAt = 0
    const maxResults = 50
    while (true) {
      const params = new URLSearchParams({
        jql,
        startAt: String(startAt),
        maxResults: String(maxResults),
        fields: [
          'summary',
          'issuetype',
          'status',
          'assignee',
          'parent',
          'customfield_10014',
          'customfield_10016',
          'customfield_10020',
          'labels',
          'components',
          'created',
          'updated',
          'resolutiondate',
          'timeoriginalestimate',
          'aggregatetimeoriginalestimate',
          'timespent',
          'aggregatetimespent',
        ].join(','),
      })
      const page = await this.json<JiraSearchResponse>(`/rest/api/3/search?${params.toString()}`)
      issues.push(...(page.issues ?? []))
      startAt += page.maxResults ?? maxResults
      if (startAt >= (page.total ?? issues.length)) break
    }
    return issues
  }

  async fetchSprints(projectKey: string): Promise<JiraSprintPayload[]> {
    const boards = await this.json<{ values?: { id: number }[] }>(`/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=1`)
    const boardId = boards.values?.[0]?.id
    if (!boardId) return []
    const sprints: JiraSprintPayload[] = []
    let startAt = 0
    const maxResults = 50
    while (true) {
      const page = await this.json<{ values?: JiraSprintPayload[]; total?: number; maxResults?: number }>(
        `/rest/agile/1.0/board/${boardId}/sprint?startAt=${startAt}&maxResults=${maxResults}`,
      )
      sprints.push(...(page.values ?? []))
      startAt += page.maxResults ?? maxResults
      if (startAt >= (page.total ?? sprints.length)) break
    }
    return sprints
  }

  async fetchWorklogs(issueKey: string): Promise<JiraWorklogPayload[]> {
    const result = await this.json<{ worklogs?: JiraWorklogPayload[] }>(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`)
    return result.worklogs ?? []
  }

  async fetchTransitions(issueKey: string): Promise<JiraChangelogPayload[]> {
    const result = await this.json<{ values?: JiraChangelogPayload[] }>(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog`)
    return result.values ?? []
  }

  private async json<T>(path: string): Promise<T> {
    const url = `${this.siteUrl}${path}`
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.throttle()
      const res = await this.fetchImpl(url, { method: 'GET', headers: this.headers, cache: 'no-store' })
      if (res.ok) return await res.json() as T
      if (res.status === 429 && attempt < 2) {
        await this.sleep(this.retryBaseMs * (2 ** attempt))
        continue
      }
      throw mapJiraHttpError(res.status)
    }
    throw mapJiraHttpError(429)
  }

  private async throttle() {
    if (this.minRequestIntervalMs <= 0) return
    const now = Date.now()
    const wait = Math.max(0, this.minRequestIntervalMs - (now - this.lastRequestAt))
    if (wait > 0) await this.sleep(wait)
    this.lastRequestAt = Date.now()
  }
}

async function upsertIssue(db: Db, connectionId: string, issue: JiraIssuePayload, userByEmail: Map<string, string>) {
  const data = jiraIssueToDb(issue, userByEmail, connectionId)
  return db.jiraIssue.upsert({
    where: { connectionId_jiraKey: { connectionId, jiraKey: issue.key } },
    create: data,
    update: data,
    select: { id: true },
  })
}

async function upsertSprints(db: Db, connectionId: string, sprints: JiraSprintPayload[]): Promise<number> {
  for (const sprint of sprints) {
    await db.jiraSprint.upsert({
      where: { connectionId_jiraSprintId: { connectionId, jiraSprintId: String(sprint.id) } },
      create: {
        connectionId,
        jiraSprintId: String(sprint.id),
        name: sprint.name ?? `Sprint ${sprint.id}`,
        state: sprint.state ?? 'unknown',
        startDate: parseJiraDate(sprint.startDate),
        endDate: parseJiraDate(sprint.endDate),
        completeDate: parseJiraDate(sprint.completeDate),
      },
      update: {
        name: sprint.name ?? `Sprint ${sprint.id}`,
        state: sprint.state ?? 'unknown',
        startDate: parseJiraDate(sprint.startDate),
        endDate: parseJiraDate(sprint.endDate),
        completeDate: parseJiraDate(sprint.completeDate),
      },
    })
  }
  return sprints.length
}

async function replaceWorklogs(db: Db, issueId: string, worklogs: JiraWorklogPayload[], userByEmail: Map<string, string>): Promise<number> {
  await db.jiraWorklog.deleteMany({ where: { issueId } })
  const rows = worklogs
    .filter((worklog) => worklog.started)
    .map((worklog) => {
      const authorEmail = worklog.author?.emailAddress ?? ''
      return {
        issueId,
        authorEmail,
        authorUserId: authorEmail ? userByEmail.get(authorEmail.toLowerCase()) ?? null : null,
        timeSpentSeconds: worklog.timeSpentSeconds ?? 0,
        startedAt: parseJiraDate(worklog.started) ?? new Date(),
      }
    })
  if (rows.length > 0) await db.jiraWorklog.createMany({ data: rows })
  return rows.length
}

async function replaceTransitions(db: Db, issueId: string, changelogs: JiraChangelogPayload[]): Promise<number> {
  await db.jiraTransition.deleteMany({ where: { issueId } })
  const rows = changelogs.flatMap((change) =>
    (change.items ?? [])
      .filter((item) => item.field?.toLowerCase() === 'status' && item.toString)
      .map((item) => ({
        issueId,
        fromStatus: item.fromString ?? null,
        toStatus: item.toString ?? 'Unknown',
        transitionedAt: parseJiraDate(change.created) ?? new Date(),
        authorEmail: change.author?.emailAddress ?? null,
      }))
  )
  if (rows.length > 0) await db.jiraTransition.createMany({ data: rows })
  return rows.length
}

async function resolveUsersByEmail(db: Db, emails: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(emails.map((email) => email.toLowerCase()).filter(Boolean)))
  if (unique.length === 0) return new Map()
  const users = await db.user.findMany({
    where: { email: { in: unique } },
    select: { id: true, email: true },
  })
  return new Map(users.map((user) => [user.email.toLowerCase(), user.id]))
}

function issueEmails(issues: JiraIssuePayload[]): string[] {
  return issues.flatMap((issue) => {
    const emails = [issue.fields.assignee?.emailAddress]
    return emails.filter(Boolean) as string[]
  })
}

function parseJiraDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function latestDate(values: (string | null | undefined)[]): Date | null {
  const dates = values.map(parseJiraDate).filter(Boolean) as Date[]
  if (dates.length === 0) return null
  return new Date(Math.max(...dates.map((date) => date.getTime())))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
