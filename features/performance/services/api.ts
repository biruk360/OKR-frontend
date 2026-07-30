import type {
  CalibrationDetail,
  CultureLibraryEntry,
  CycleIssueStatus,
  EvaluationDetail,
  EvaluationSummary,
  MetricActual,
  PanelAssignment,
  PanelMember,
  PerformanceMetricMapping,
  PerformanceTemplateDetail,
  PerformanceTemplateSummary,
  ReviewCycleDetail,
  ReviewCycleIssue,
  ReviewCycleSummary,
} from '../types'

type Envelope<T> = { success: boolean; data?: T; error?: string; details?: unknown }

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await response.json().catch(() => null) as Envelope<T> | null
  if (!response.ok || !body?.success) {
    const error = new Error(body?.error ?? `Request failed: ${response.status}`) as Error & { details?: unknown }
    error.details = body?.details
    throw error
  }
  return body.data as T
}

export const performanceApi = {
  getMyPerformance: () => request<{
    focuses: Array<{ id: string; targetText: string; weeklyStep: string | null; status: string; criterion: { id: string; title: string; type: string } }>
    evaluations: Array<{ id: string; status: string; sealed?: boolean; normalized?: number | null; decisionBand?: string | null; cycle: { id: string; name: string }; templateName: string }>
  }>('/api/performance/me'),
  updateWeeklyStep: (id: string, weeklyStep: string) =>
    request<unknown>(`/api/performance/focuses/${id}/weekly-step`, { method: 'PUT', body: JSON.stringify({ weeklyStep }) }),
  listTemplates: () => request<PerformanceTemplateSummary[]>('/api/performance/templates'),
  getTemplate: (id: string) => request<PerformanceTemplateDetail>(`/api/performance/templates/${id}`),
  createTemplate: (body: { name: string; roleLabel?: string }) =>
    request<PerformanceTemplateDetail>('/api/performance/templates', { method: 'POST', body: JSON.stringify(body) }),
  saveBuilder: (id: string, tiers: unknown[]) =>
    request<PerformanceTemplateDetail>(`/api/performance/templates/${id}/builder`, { method: 'PUT', body: JSON.stringify({ tiers }) }),
  insertCultureBlock: (id: string, tierId: string) =>
    request<{ inserted: number; template: PerformanceTemplateDetail }>(`/api/performance/templates/${id}/culture-block`, { method: 'POST', body: JSON.stringify({ tierId }) }),
  listCultureLibrary: () => request<CultureLibraryEntry[]>('/api/performance/culture-library'),
  createCultureLibraryEntry: (body: {
    code: string
    name: string
    version?: number
    type?: 'RUBRIC' | 'METRIC'
    definitionJson?: Record<string, unknown>
    isActive?: boolean
  }) => request<CultureLibraryEntry>('/api/performance/culture-library', { method: 'POST', body: JSON.stringify(body) }),
  updateCultureLibraryEntry: (id: string, body: {
    name?: string
    definitionJson?: Record<string, unknown>
    isActive?: boolean
  }) => request<CultureLibraryEntry>(`/api/performance/culture-library/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  publishTemplate: (id: string) =>
    request<PerformanceTemplateDetail>(`/api/performance/templates/${id}/publish`, { method: 'POST' }),
  archiveTemplate: (id: string) =>
    request<PerformanceTemplateDetail>(`/api/performance/templates/${id}/archive`, { method: 'POST' }),
  forkTemplate: (id: string) =>
    request<PerformanceTemplateDetail>(`/api/performance/templates/${id}/fork`, { method: 'POST' }),
  listTemplateMappings: () => request<Array<{ id: string; designationKey: string; priority: number; isActive: boolean; family: { id: string; name: string }; department: { id: string; name: string } | null }>>('/api/performance/template-mappings'),
  saveTemplateMapping: (body: { designationKey: string; familyId: string; priority?: number }) =>
    request<unknown>('/api/performance/template-mappings', { method: 'PUT', body: JSON.stringify(body) }),
  deleteTemplateMapping: (id: string) =>
    request<unknown>(`/api/performance/template-mappings?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listMetricMappings: (templateId: string) =>
    request<PerformanceMetricMapping[]>(`/api/performance/metric-mappings?templateId=${encodeURIComponent(templateId)}`),
  saveMetricMappings: (body: { criterionId: string; employeeId: string; keyResultIds: string[]; scrumMetricKeys?: string[] }) =>
    request<unknown>('/api/performance/metric-mappings', { method: 'PUT', body: JSON.stringify(body) }),
  listMetricKeyResults: (employeeId: string) =>
    request<Array<{ id: string; title: string; currentValue: number; targetValue: number; unit: string }>>(
      `/api/keyresults?ownerId=${encodeURIComponent(employeeId)}&limit=100`,
    ),

  listCycles: () => request<ReviewCycleSummary[]>('/api/performance/cycles'),
  createCycle: (body: { name: string; cadence: string; periodStart: string; periodEnd: string; allCompany: boolean; departmentIds?: string[] }) =>
    request<ReviewCycleSummary>('/api/performance/cycles', { method: 'POST', body: JSON.stringify(body) }),
  openCycle: (id: string) =>
    request<{ createdEvaluations: number; issueCount: number; alreadyOpen: boolean }>(`/api/performance/cycles/${id}/open`, { method: 'POST' }),
  getCycle: (id: string) => request<ReviewCycleDetail>(`/api/performance/cycles/${id}`),
  closeCycle: (id: string, overrideReason?: string) =>
    request<ReviewCycleSummary>(`/api/performance/cycles/${id}/close`, { method: 'POST', body: JSON.stringify(overrideReason ? { overrideReason } : {}) }),
  updateCycleIssue: (cycleId: string, issueId: string, status: CycleIssueStatus) =>
    request<ReviewCycleIssue>(`/api/performance/cycles/${cycleId}/issues/${issueId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  listEvaluations: () => request<EvaluationSummary[]>('/api/performance/evaluations'),
  getEvaluation: (id: string) => request<EvaluationDetail>(`/api/performance/evaluations/${id}`),
  getMetricActual: (evaluationId: string, criterionId: string) =>
    request<MetricActual>(`/api/performance/okr-actual/${criterionId}?evaluationId=${encodeURIComponent(evaluationId)}`),
  saveManualActual: (evaluationId: string, criterionId: string, actual: number, note?: string) =>
    request<unknown>(`/api/performance/evaluations/${evaluationId}/manual-actual`, {
      method: 'PUT',
      body: JSON.stringify(note ? { criterionId, actual, note } : { criterionId, actual }),
    }),
  removeManualActual: (evaluationId: string, criterionId: string) =>
    request<unknown>(`/api/performance/evaluations/${evaluationId}/manual-actual`, {
      method: 'DELETE',
      body: JSON.stringify({ criterionId }),
    }),
  saveScores: (id: string, scores: Array<{ criterionId: string; score: number; remark?: string }>) =>
    request<{ saved: number }>(`/api/performance/evaluations/${id}/scores`, { method: 'PUT', body: JSON.stringify({ scores }) }),
  submitEvaluation: (id: string) =>
    request<{ submitted: boolean; consolidated: unknown }>(`/api/performance/evaluations/${id}/submit`, { method: 'POST' }),
  acknowledgeEvaluation: (id: string, comment?: string) =>
    request<unknown>(`/api/performance/evaluations/${id}/acknowledge`, { method: 'POST', body: JSON.stringify({ comment }) }),
  disputeEvaluation: (id: string, comment: string) =>
    request<unknown>(`/api/performance/evaluations/${id}/dispute`, { method: 'POST', body: JSON.stringify({ comment }) }),
  savePanel: (id: string, panel: PanelMember[], confirmDiscardSubmitted?: boolean) =>
    request<PanelAssignment[]>(`/api/performance/evaluations/${id}/panel`, {
      method: 'PUT',
      body: JSON.stringify(confirmDiscardSubmitted ? { panel, confirmDiscardSubmitted: true } : { panel }),
    }),
  getCalibration: (id: string) => request<CalibrationDetail>(`/api/performance/evaluations/${id}/calibration`),
  retryConsolidation: (id: string) =>
    request<{ status?: string }>(`/api/performance/evaluations/${id}/consolidate`, { method: 'POST' }),
  resolveCalibration: (id: string, notes: Array<{ criterionId: string; note: string }>) =>
    request<unknown>(`/api/performance/evaluations/${id}/calibration`, { method: 'PUT', body: JSON.stringify({ notes }) }),
  shareDraft: (id: string) =>
    request<unknown>(`/api/performance/evaluations/${id}/share-draft`, { method: 'POST' }),
  finalizeEvaluation: (id: string, overrideReason?: string) =>
    request<unknown>(`/api/performance/evaluations/${id}/finalize`, { method: 'POST', body: JSON.stringify({ overrideReason }) }),
  listActions: () => request<Array<{
    id: string
    type: string
    status: string
    decisionReason: string | null
    evaluation: { id: string; decisionBand: string | null; normalized: number | null; employee: { name: string; designation: string | null }; cycle: { name: string } }
  }>>('/api/performance/actions'),
  transitionAction: (id: string, status: string, reason: string) =>
    request<unknown>(`/api/performance/actions/${id}`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
}
