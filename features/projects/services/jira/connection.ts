export interface JiraConnectionSafe {
  id: string
  name: string
  siteUrl: string
  authType: 'API_TOKEN' | 'OAUTH2'
  email: string | null
  projectKey: string
  isActive: boolean
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastSyncError: string | null
  tokenMasked: '••••'
  createdAt: string
}

export interface JiraConnectionTestInput {
  siteUrl: string
  email: string
  apiToken: string
  projectKey: string
}

export interface JiraConnectionTestResult {
  accountName: string
  accountEmail: string | null
  issueCount: number
  sprintCount: number
}

export class JiraConnectionError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
    this.name = 'JiraConnectionError'
  }
}

type FetchLike = typeof fetch

export function normalizeJiraSiteUrl(value: string): string {
  const raw = value.trim().replace(/\/+$/, '')
  if (!raw) throw new JiraConnectionError('Jira Site URL is required.', 400, 'JIRA_SITE_REQUIRED')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new JiraConnectionError('Jira Site URL must be a valid https:// URL.', 400, 'JIRA_SITE_INVALID')
  }
  if (url.protocol !== 'https:') {
    throw new JiraConnectionError('Jira Site URL must use https://.', 400, 'JIRA_SITE_HTTPS_REQUIRED')
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}

export function normalizeJiraProjectKey(value: string): string {
  const key = value.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(key)) {
    throw new JiraConnectionError('Project key must be 2-32 uppercase letters, numbers, or underscores.', 400, 'JIRA_PROJECT_KEY_INVALID')
  }
  return key
}

export function serializeJiraConnection<T extends {
  id: string
  name: string
  siteUrl: string
  authType: string
  email: string | null
  projectKey: string
  isActive: boolean
  lastSyncAt: Date | null
  lastSyncStatus: string | null
  createdAt: Date
}>(connection: T, opts: { lastSyncError?: string | null } = {}): JiraConnectionSafe {
  return {
    id: connection.id,
    name: connection.name,
    siteUrl: connection.siteUrl,
    authType: connection.authType === 'OAUTH2' ? 'OAUTH2' : 'API_TOKEN',
    email: connection.email,
    projectKey: connection.projectKey,
    isActive: connection.isActive,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: connection.lastSyncStatus,
    lastSyncError: opts.lastSyncError ?? null,
    tokenMasked: '••••',
    createdAt: connection.createdAt.toISOString(),
  }
}

export function mapJiraHttpError(status: number): JiraConnectionError {
  if (status === 401) return new JiraConnectionError('Invalid Jira token or email.', 401, 'JIRA_INVALID_TOKEN')
  if (status === 403) return new JiraConnectionError('Jira access denied for this account.', 403, 'JIRA_FORBIDDEN')
  if (status === 404) return new JiraConnectionError('Project key not found.', 404, 'JIRA_PROJECT_NOT_FOUND')
  if (status === 429) return new JiraConnectionError('Jira rate limit reached. Try again shortly.', 429, 'JIRA_RATE_LIMITED')
  return new JiraConnectionError(`Jira request failed with status ${status}.`, 502, 'JIRA_REQUEST_FAILED')
}

export async function testJiraConnection(
  input: JiraConnectionTestInput,
  fetchImpl: FetchLike = fetch,
): Promise<JiraConnectionTestResult> {
  const siteUrl = normalizeJiraSiteUrl(input.siteUrl)
  const projectKey = normalizeJiraProjectKey(input.projectKey)
  const headers = authHeaders(input.email, input.apiToken)

  const me = await jiraJson<{ displayName?: string; emailAddress?: string }>(`${siteUrl}/rest/api/3/myself`, headers, fetchImpl)
  const issueResult = await jiraJson<{ total?: number }>(
    `${siteUrl}/rest/api/3/search?jql=${encodeURIComponent(`project = ${projectKey}`)}&maxResults=0`,
    headers,
    fetchImpl,
  )
  const sprintCount = await countProjectSprints(siteUrl, projectKey, headers, fetchImpl)

  return {
    accountName: me.displayName ?? input.email,
    accountEmail: me.emailAddress ?? input.email,
    issueCount: issueResult.total ?? 0,
    sprintCount,
  }
}

function authHeaders(email: string, apiToken: string): HeadersInit {
  const token = Buffer.from(`${email.trim()}:${apiToken}`, 'utf8').toString('base64')
  return {
    Authorization: `Basic ${token}`,
    Accept: 'application/json',
  }
}

async function jiraJson<T>(url: string, headers: HeadersInit, fetchImpl: FetchLike): Promise<T> {
  const res = await fetchImpl(url, { method: 'GET', headers, cache: 'no-store' })
  if (!res.ok) throw mapJiraHttpError(res.status)
  return await res.json() as T
}

async function countProjectSprints(siteUrl: string, projectKey: string, headers: HeadersInit, fetchImpl: FetchLike): Promise<number> {
  try {
    const boards = await jiraJson<{ values?: { id: number }[] }>(
      `${siteUrl}/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=1`,
      headers,
      fetchImpl,
    )
    const boardId = boards.values?.[0]?.id
    if (!boardId) return 0
    const sprints = await jiraJson<{ total?: number }>(
      `${siteUrl}/rest/agile/1.0/board/${boardId}/sprint?maxResults=0`,
      headers,
      fetchImpl,
    )
    return sprints.total ?? 0
  } catch (error) {
    if (error instanceof JiraConnectionError && error.status === 404) return 0
    throw error
  }
}
