/**
 * Automations API client. Every response uses the standard envelope
 * `{ success, data, error }` — see lib/api/apiResponse.ts.
 */

import type { DistributionMode, PlanSpec, ToolGrant, AutomationRecipient } from '@/types/automations'
import type { PlanDiff } from '@/lib/automations/plan-diff'
import type {
  AutomationDetail,
  AutomationSummary,
  BriefingDetail,
  BriefingSummary,
  RunDetail,
  RunSummary,
} from '../types'

interface Envelope<T> {
  success: boolean
  data?: T
  error?: string
  details?: unknown
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await response.json().catch(() => ({}))) as Envelope<T>
  if (!response.ok || !body.success) {
    const issues = (body.details as { issues?: string[] } | undefined)?.issues
    throw new Error(issues?.length ? `${body.error}: ${issues.join('; ')}` : body.error || 'Request failed')
  }
  return body.data as T
}

export interface CreateAutomationPayload {
  name: string
  description?: string
  instructionText: string
  plan: PlanSpec
  toolGrants: ToolGrant[]
  recipients: AutomationRecipient[]
  maxCostUsdPerRun?: number
}

export interface CompileResponse {
  plan: PlanSpec
  grants: ToolGrant[]
  suggestedName: string
  notes: string
  repaired: boolean
  costUsd: number
  modelId: string
  diff: PlanDiff
}

export interface PromoteFindingPayload {
  dedupeKey: string
  target: 'TODO' | 'RISK'
  title?: string
  assigneeId?: string
  dueDate?: string
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

export interface AutomationSettings {
  id: string
  globalPaused: boolean
  domainAllowlist: string[]
  orgDailyCostCapUsd: number
  maxConcurrentRuns: number
  defaultTimezone: string
  retentionDays: number
  updatedAt: string
}

export interface ToolAvailability {
  tool: string
  label: string
  description: string
  phase: string
  available: boolean
  configured: boolean
}

export interface ToolCatalog {
  tools: ToolAvailability[]
  aiConfigured: boolean
}

export const automationsApi = {
  tools: () => request<ToolCatalog>('/api/automations/tools'),

  compile: (instruction: string, options: { timezone?: string; previousPlan?: PlanSpec } = {}) =>
    request<CompileResponse>('/api/automations/compile', {
      method: 'POST',
      body: JSON.stringify({ instruction, ...options }),
    }),

  list: (scope: 'mine' | 'all' = 'mine') =>
    request<AutomationSummary[]>(`/api/automations?scope=${scope}`),

  get: (id: string) => request<AutomationDetail>(`/api/automations/${id}`),

  create: (payload: CreateAutomationPayload) =>
    request<AutomationSummary>('/api/automations', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: Partial<CreateAutomationPayload> & { status?: 'ENABLED' | 'PAUSED' }) =>
    request<AutomationSummary>(`/api/automations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  remove: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/api/automations/${id}`, { method: 'DELETE' }),

  runNow: (id: string) =>
    request<{ runId: string; status: string }>(`/api/automations/${id}/run`, { method: 'POST' }),

  setMode: (id: string, mode: DistributionMode) =>
    request<AutomationSummary>(`/api/automations/${id}/mode`, { method: 'POST', body: JSON.stringify({ mode }) }),

  runs: (id: string) => request<RunSummary[]>(`/api/automations/${id}/runs`),

  run: (runId: string) => request<RunDetail>(`/api/automations/runs/${runId}`),

  briefings: (automationId?: string) =>
    request<BriefingSummary[]>(`/api/automations/briefings${automationId ? `?automationId=${automationId}` : ''}`),

  briefing: (id: string) => request<BriefingDetail>(`/api/automations/briefings/${id}`),

  approveBriefing: (id: string) =>
    request<{ id: string; status: string }>(`/api/automations/briefings/${id}/approve`, { method: 'POST' }),

  promoteFinding: (id: string, payload: PromoteFindingPayload) =>
    request<{ id: string; type: string; dedupeKey: string }>(
      `/api/automations/briefings/${id}/promote`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  /** Exports stream a file, so they bypass the JSON envelope entirely. */
  exportUrl: (id: string, format: 'pdf' | 'docx') =>
    `/api/automations/briefings/${id}/export?format=${format}`,

  settings: () => request<AutomationSettings>('/api/automations/settings'),

  updateSettings: (payload: Partial<AutomationSettings>) =>
    request<AutomationSettings>('/api/automations/settings', { method: 'PATCH', body: JSON.stringify(payload) }),
}
