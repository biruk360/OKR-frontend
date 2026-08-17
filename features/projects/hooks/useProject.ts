'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { projectKeys } from './useProjects'
import type { ActivityStatus, ChangeRequestStatus, ChangeRequestType, ClientObligationType, CoeFixStatus, CoeRootCauseClass, DependencyType, OwnerParty, PaymentInvoiceStatus, PaymentStatus, RaidDependencyParty, RaidSeverity, RaidStatus, RaidType, ReportStatus, ReportType, StageGateStatus, Visibility } from '../types'

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed: ${res.status}`)
  return json.data as T
}

// --- detail shapes (nested tree returned by GET /api/projects/[id]) ----------

export interface ActivityNode {
  id: string
  milestoneId: string
  parentActivityId: string | null
  position: number
  title: string
  description: string | null
  assigneeId: string | null
  ownerParty: OwnerParty
  currentStart: string | null
  currentEnd: string | null
  baselineStart: string | null
  baselineEnd: string | null
  status: ActivityStatus
  percentComplete: number
  weight: number
  priority: string | null
  risk: string | null
  isBlocked: boolean
  blockedSince: string | null
  estimatedHours: number | null
  actualHours: number | null
  estimatedCost: number | null
  actualCost: number | null
  isMilestone: boolean
  color: string | null
  jiraIssueKeys: string[]
  jiraAutoRollup: boolean
  slipDays: number
  waitingSince: string | null
  tags: { id: string; label: string; color: string }[]
  _count: { comments: number; subtasks: number }
}

export interface MilestoneNode {
  id: string
  phaseId: string
  name: string
  position: number
  weight: number
  percentComplete: number
  status: string
  currentDate: string | null
  baselineDate: string | null
  isKeyMilestone: boolean
  keyResultId: string | null
  activities: ActivityNode[]
}

export interface PhaseNode {
  id: string
  projectId: string
  name: string
  position: number
  weight: number
  percentComplete: number
  status: string
  currentStart: string | null
  currentEnd: string | null
  baselineStart: string | null
  baselineEnd: string | null
  milestones: MilestoneNode[]
}

export interface ProjectDetail {
  id: string
  code: string
  name: string
  description: string | null
  clientName: string
  status: string
  ragStatus: string
  confidence: number
  percentComplete: number
  percentPlanned: number
  spi: number | null
  cpi: number | null
  contractValue: number | null
  currency: string
  jiraLinked: boolean
  jiraConnectionId: string | null
  plannedStart: string
  plannedEnd: string
  baselineCommittedAt: string | null
  baselineVersion: number
  projectManagerId: string
  departmentId: string | null
  objectiveId: string | null
  members: { id: string; userId: string; role: string; allocationPct: number }[]
  phases: PhaseNode[]
  dependencies: ActivityDependencyNode[]
}

export interface ActivityDependencyNode {
  id: string
  predecessorId: string
  successorId: string
  type: DependencyType
  lagDays: number
}

export interface ActivityCommentNode {
  id: string
  activityId: string
  authorId: string
  content: string
  parentId: string | null
  visibility: Visibility
  mentions: string[]
  isClientAuthor: boolean
  createdAt: string
  author: {
    id: string | null
    name: string
    email: string | null
    avatar: string | null
  }
  replies: ActivityCommentNode[]
}

export interface ActivityAttachmentNode {
  id: string
  activityId: string
  fileName: string
  fileSize: number
  mimeType: string
  storagePath: string
  uploadedById: string
  visibility: Visibility
  createdAt: string
}

export interface ProjectWorkloadCell {
  weekStart: string
  hours: number
  allocationPct: number
  projectCount: number
}

export interface ProjectWorkloadPerson {
  userId: string | null
  name: string
  avatar: string | null
  totalHours: number
  maxAllocationPct: number
  cells: ProjectWorkloadCell[]
}

export interface ProjectWorkloadData {
  weeks: string[]
  people: ProjectWorkloadPerson[]
}

export interface RaidItemNode {
  id: string
  projectId: string
  type: RaidType
  refCode: string
  title: string
  description: string | null
  category: string | null
  probability: number | null
  impact: number | null
  score: number | null
  riskTone: 'GREEN' | 'AMBER' | 'RED' | 'NONE'
  mitigation: string | null
  contingency: string | null
  severity: RaidSeverity | null
  resolution: string | null
  daysOpen: number
  dependsOnParty: RaidDependencyParty | null
  neededByDate: string | null
  validated: boolean | null
  validatedAt: string | null
  impactIfFalse: string | null
  ownerId: string | null
  owner?: { id: string; name: string | null; email: string; avatar: string | null } | null
  status: RaidStatus
  clientVisible: boolean
  reviewDate: string | null
  createdAt: string
  closedAt: string | null
  isOverdueClientDependency: boolean
}

export interface ChangeRequestNode {
  id: string
  projectId: string
  crCode: string
  title: string
  description: string
  type: ChangeRequestType
  requestedBy: string
  requestedByParty: 'CLIENT' | '360GROUND'
  requestDate: string
  scheduleImpactDays: number
  costImpact: number
  affectedActivityIds: string[]
  status: ChangeRequestStatus
  ccbDecisionDate: string | null
  approvedById: string | null
  clientSignOff: boolean
  clientSignOffAt: string | null
  rejectionReason: string | null
  createdAt: string
}

export interface ChangeRequestData {
  rows: ChangeRequestNode[]
  scopeVolatilityDays: number
}

export interface StageGateNode {
  id: string
  projectId: string
  phaseId: string
  name: string
  entryCriteria: string[]
  exitCriteria: string[]
  requiredDeliverables: string[]
  requiredApprovals: string[]
  status: StageGateStatus
  gateDate: string | null
  approvedById: string | null
  waiverReason: string | null
  waivedById: string | null
  phase?: { id: string; name: string; position: number }
}

export interface ClientObligationNode {
  id: string
  projectId: string
  obligation: string
  type: ClientObligationType
  responsiblePerson: string
  responsibleEmail: string | null
  slaBusinessDays: number
  isContractual: boolean
  breachCount: number
  complianceRate: number | null
  notes: string | null
  healthTone: 'GREEN' | 'AMBER' | 'RED'
  ceoWarning: boolean
}

export interface ClientObligationData {
  rows: ClientObligationNode[]
  clientHealthScore: number
  clientHealthTone: 'GREEN' | 'AMBER' | 'RED'
  ceoWarning: boolean
}

export interface CoeWhyNode {
  why: string
  answer: string
}

export interface CorrectionOfErrorNode {
  id: string
  projectId: string
  coeCode: string
  trigger: string
  daysLost: number
  costImpact: number | null
  timeline: string
  whys: CoeWhyNode[]
  whysComplete: boolean
  rootCauseClass: CoeRootCauseClass
  systemicFix: string
  fixOwnerId: string
  fixDueDate: string
  fixStatus: CoeFixStatus
  fedIntoTemplate: boolean
  closedAt: string | null
  createdAt: string
  isOverdue: boolean
  lessonLearned: string | null
}

export interface CoeTriggerNode {
  kind: 'MILESTONE_SLIP' | 'PROJECT_RED'
  trigger: string
  daysLost: number
  milestoneId?: string
}

export interface CorrectionOfErrorData {
  rows: CorrectionOfErrorNode[]
  triggers: CoeTriggerNode[]
  rootCausePareto: { rootCauseClass: CoeRootCauseClass; count: number }[]
  overdueCount: number
  lessonsLearned: { id: string; coeCode: string; rootCauseClass: CoeRootCauseClass; systemicFix: string }[]
}

export interface PaymentMilestoneNode {
  id: string
  projectId: string
  name: string
  contractClause: string | null
  triggerActivityId: string | null
  amount: number
  currency: string
  plannedInvoiceDate: string | null
  actualInvoiceDate: string | null
  invoiceStatus: PaymentInvoiceStatus
  paymentStatus: PaymentStatus
  daysOutstanding: number | null
  readyToInvoice: boolean
  isOverdue: boolean
}

export interface PaymentMilestoneData {
  rows: PaymentMilestoneNode[]
  readyToInvoiceCount: number
  overdueCount: number
  outstandingAmount: number
}

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

export interface JiraConnectionTestResult {
  accountName: string
  accountEmail: string | null
  issueCount: number
  sprintCount: number
}

export interface JiraMappingPreview {
  totalIssues: number
  doneIssues: number
  totalPoints: number
  donePoints: number
  percentComplete: number
  weightedByPoints: boolean
  sampleIssueKeys: string[]
}

export type JiraEstimateBias = 'SYSTEMATICALLY_UNDERESTIMATES' | 'SYSTEMATICALLY_OVERESTIMATES' | 'BALANCED' | 'UNKNOWN'

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
  estimateBias: JiraEstimateBias
  issueEstimates: JiraIssueEstimateMetric[]
}

export interface JiraDeveloperMetricsData {
  jiraLinked: boolean
  period: { from: string; to: string }
  workingDays: string[]
  rows: JiraDeveloperMetric[]
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

export interface JiraAdoptionData {
  jiraLinked: boolean
  project: JiraAdoptionScore
  teams: JiraTeamAdoptionScore[]
}

export interface ScrumAttendancePerson {
  userId: string
  name: string
  email: string | null
}

export interface ScrumLogNode {
  id: string
  projectId: string
  scrumDate: string
  timeHeld: string
  durationMin: number
  facilitatorId: string
  attendeeIds: string[]
  absenteeIds: string[]
  lateIds: string[]
  blockersRaised: string | null
  notes: string | null
  createdAt: string
}

export interface ScrumAttendanceRow {
  userId: string
  name: string
  email: string | null
  attended: number
  late: number
  absent: number
  attendanceRate: number
  flagged: boolean
}

export interface ScrumAttendanceSummary {
  totalScrumsHeld: number
  teamAttendanceRate: number
  rows: ScrumAttendanceRow[]
}

export interface ScrumLogData {
  logs: ScrumLogNode[]
  people: ScrumAttendancePerson[]
  summary: ScrumAttendanceSummary
}

export interface ProjectReportNode {
  id: string
  projectId: string | null
  type: ReportType
  periodStart: string
  periodEnd: string
  status: ReportStatus
  aiSummary: string | null
  aiSummaryEdited: boolean
  contentJson: unknown
  generatedAt: string
  approvedById: string | null
  approvedAt: string | null
  sentAt: string | null
  sentToEmails: string[]
}

export type PerformanceCadence = 'DAILY' | 'WEEKLY' | 'SPRINT' | 'MONTHLY'
export type ManagementReportCadence = 'MONTHLY' | 'QUARTERLY'

export interface PerformanceReportBundle {
  jiraLinked: boolean
  hidden: boolean
  individualReport: ProjectReportNode | null
  teamReport: ProjectReportNode | null
  reports?: ProjectReportNode[]
}

export interface ManagementReportBundle {
  cadence: ManagementReportCadence
  reports: ProjectReportNode[]
  steeringReport: ProjectReportNode | null
  coeReport: ProjectReportNode | null
  estimationReport: ProjectReportNode | null
  capacityReport: ProjectReportNode | null
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => fetchJson<ProjectDetail>(`/api/projects/${id}`),
    staleTime: 10_000,
    enabled: !!id,
  })
}

export function useProjectWorkload(enabled = true) {
  return useQuery({
    queryKey: [...projectKeys.all, 'workload'],
    queryFn: () => fetchJson<ProjectWorkloadData>('/api/projects/workload?weeks=8'),
    staleTime: 30_000,
    enabled,
  })
}

export function useRaidItems(projectId: string, type?: RaidType) {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'raid', type ?? 'ALL'],
    queryFn: () => fetchJson<RaidItemNode[]>(`/api/projects/${projectId}/raid${type ? `?type=${type}` : ''}`),
    enabled: !!projectId,
    staleTime: 10_000,
  })
}

export function useChangeRequests(projectId: string, reportPending = false) {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'change-requests', reportPending],
    queryFn: () => fetchJson<ChangeRequestData>(`/api/projects/${projectId}/change-requests${reportPending ? '?reportPending=true' : ''}`),
    enabled: !!projectId,
    staleTime: 10_000,
  })
}

export function useStageGates(projectId: string, report = false) {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'stage-gates', report],
    queryFn: () => fetchJson<StageGateNode[]>(`/api/projects/${projectId}/stage-gates${report ? '?report=true' : ''}`),
    enabled: !!projectId,
    staleTime: 10_000,
  })
}

export function useClientObligations(projectId: string, report = false) {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'client-obligations', report],
    queryFn: () => fetchJson<ClientObligationData>(`/api/projects/${projectId}/client-obligations${report ? '?report=true' : ''}`),
    enabled: !!projectId,
    staleTime: 10_000,
  })
}

export function useCorrectionOfErrors(projectId: string, report = false) {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'coes', report],
    queryFn: () => fetchJson<CorrectionOfErrorData>(`/api/projects/${projectId}/coes${report ? '?report=true' : ''}`),
    enabled: !!projectId,
    staleTime: 10_000,
  })
}

export function usePaymentMilestones(projectId: string, report = false) {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'payment-milestones', report],
    queryFn: () => fetchJson<PaymentMilestoneData>(`/api/projects/${projectId}/payment-milestones${report ? '?report=true' : ''}`),
    enabled: !!projectId,
    staleTime: 10_000,
  })
}

export function useJiraConnection(projectId: string) {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'jira'],
    queryFn: () => fetchJson<JiraConnectionSafe | null>(`/api/projects/${projectId}/jira`),
    enabled: !!projectId,
    staleTime: 10_000,
  })
}

export function useJiraMappingPreview(projectId: string, type: string, values: string, enabled = true) {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'jira-mapping-preview', type, values],
    queryFn: () => fetchJson<JiraMappingPreview>(`/api/projects/${projectId}/jira/mapping-preview?type=${encodeURIComponent(type)}&values=${encodeURIComponent(values)}`),
    enabled: !!projectId && enabled && !!values.trim(),
    staleTime: 10_000,
  })
}

export function useJiraDeveloperMetrics(projectId: string, enabled = true) {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'jira-metrics'],
    queryFn: () => fetchJson<JiraDeveloperMetricsData>(`/api/projects/${projectId}/jira/metrics`),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  })
}

export function useJiraAdoption(projectId: string, enabled = true) {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'jira-adoption'],
    queryFn: () => fetchJson<JiraAdoptionData>(`/api/projects/${projectId}/jira/adoption`),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  })
}

export function useScrumLog(projectId: string) {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'scrum-log'],
    queryFn: () => fetchJson<ScrumLogData>(`/api/projects/${projectId}/scrum-log`),
    enabled: !!projectId,
    staleTime: 10_000,
  })
}

export function useProjectReports(projectId: string, type: ReportType = 'CLIENT_BIMONTHLY') {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'reports', type],
    queryFn: () => fetchJson<ProjectReportNode[]>(`/api/projects/${projectId}/reports?type=${type}`),
    enabled: !!projectId,
    staleTime: 10_000,
  })
}

export function usePerformanceReports(projectId: string, cadence: PerformanceCadence = 'WEEKLY', enabled = true) {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'performance-reports', cadence],
    queryFn: () => fetchJson<PerformanceReportBundle>(`/api/projects/${projectId}/performance-reports?cadence=${cadence}`),
    enabled: !!projectId && enabled,
    staleTime: 10_000,
  })
}

export function useGeneratePerformanceReports(projectId: string, cadence: PerformanceCadence) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => fetchJson<PerformanceReportBundle>(`/api/projects/${projectId}/performance-reports`, jsonInit('POST', { cadence })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.detail(projectId), 'performance-reports'] })
      toast.success('Performance reports ready')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useManagementReports(projectId: string, cadence: ManagementReportCadence = 'MONTHLY') {
  return useQuery({
    queryKey: [...projectKeys.detail(projectId), 'management-reports', cadence],
    queryFn: () => fetchJson<ManagementReportBundle>(`/api/projects/${projectId}/management-reports?cadence=${cadence}`),
    enabled: !!projectId,
    staleTime: 10_000,
  })
}

export function useGenerateManagementReports(projectId: string, cadence: ManagementReportCadence) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => fetchJson<ManagementReportBundle>(`/api/projects/${projectId}/management-reports`, jsonInit('POST', { cadence })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.detail(projectId), 'management-reports'] })
      toast.success('Management reports ready')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateManagementReport(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, ...body }: { reportId: string; action: 'UPDATE_SUMMARY'; aiSummary: string } | { reportId: string; action: 'SUBMIT_REVIEW' | 'APPROVE' | 'SEND' }) =>
      fetchJson<ProjectReportNode>(`/api/projects/${projectId}/management-reports/${reportId}`, jsonInit('PATCH', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.detail(projectId), 'management-reports'] })
      toast.success('Management report updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdatePerformanceReport(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, ...body }: { reportId: string; teamInsight?: string; individualInsights?: Record<string, string> }) =>
      fetchJson<ProjectReportNode>(`/api/projects/${projectId}/performance-reports/${reportId}`, jsonInit('PATCH', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.detail(projectId), 'performance-reports'] })
      toast.success('Insight saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useGenerateClientReport(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => fetchJson<ProjectReportNode>(`/api/projects/${projectId}/reports`, jsonInit('POST', { type: 'CLIENT_BIMONTHLY' })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.detail(projectId), 'reports'] })
      toast.success('Client report draft ready')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export interface AiAssistantResponseNode {
  intent: 'EXECUTIVE_SUMMARY' | 'RISK_DETECTION' | 'DELAY_PATTERN' | 'ESTIMATE_SUGGESTION'
  output: string
  groundedIn: string[]
  capped: boolean
  approved: false
  requiresPmApproval: true
  bullets: number
  chars: number
}

export function useAiAssistant(projectId: string) {
  return useMutation({
    mutationFn: (body: { intent: AiAssistantResponseNode['intent']; context?: string }) =>
      fetchJson<AiAssistantResponseNode>(`/api/projects/${projectId}/ai-assistant`, jsonInit('POST', body)),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateProjectReport(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, ...body }: { reportId: string; action: 'UPDATE_SUMMARY'; aiSummary: string } | { reportId: string; action: 'SUBMIT_REVIEW' | 'APPROVE' | 'SEND' }) =>
      fetchJson<ProjectReportNode>(`/api/projects/${projectId}/reports/${reportId}`, jsonInit('PATCH', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.detail(projectId), 'reports'] })
      toast.success('Report updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSaveScrumLog(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      scrumDate: string
      timeHeld: string
      durationMin: number
      facilitatorId: string
      attendeeIds: string[]
      absenteeIds: string[]
      lateIds: string[]
      blockersRaised?: string | null
      notes?: string | null
    }) => fetchJson<ScrumLogData>(`/api/projects/${projectId}/scrum-log`, jsonInit('POST', body)),
    onSuccess: (data) => {
      qc.setQueryData([...projectKeys.detail(projectId), 'scrum-log'], data)
      toast.success('Scrum log saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export const projectCommentKeys = {
  all: (projectId: string) => [...projectKeys.detail(projectId), 'activity-comments'] as const,
  list: (projectId: string, activityId: string | null | undefined) => [...projectCommentKeys.all(projectId), activityId] as const,
}

export function useActivityComments(projectId: string, activityId: string | null | undefined) {
  return useQuery({
    queryKey: projectCommentKeys.list(projectId, activityId),
    queryFn: () => fetchJson<ActivityCommentNode[]>(`/api/projects/${projectId}/activities/${activityId}/comments`),
    enabled: !!projectId && !!activityId,
    staleTime: 10_000,
  })
}

function useActivityCommentMutation<TVars>(
  projectId: string,
  activityId: string,
  fn: (vars: TVars) => Promise<ActivityCommentNode[]>,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (comments) => {
      qc.setQueryData(projectCommentKeys.list(projectId, activityId), comments)
      qc.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      qc.invalidateQueries({ queryKey: projectKeys.all })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddActivityComment(projectId: string, activityId: string) {
  return useActivityCommentMutation(projectId, activityId, (body: { content: string; visibility?: Visibility; parentId?: string | null }) =>
    fetchJson<ActivityCommentNode[]>(`/api/projects/${projectId}/activities/${activityId}/comments`, jsonInit('POST', body)))
}

export function useUpdateActivityComment(projectId: string, activityId: string) {
  return useActivityCommentMutation(projectId, activityId, ({ commentId, ...body }: { commentId: string; content?: string; visibility?: Visibility }) =>
    fetchJson<ActivityCommentNode[]>(`/api/projects/${projectId}/activities/${activityId}/comments/${commentId}`, jsonInit('PATCH', body)))
}

export function useDeleteActivityComment(projectId: string, activityId: string) {
  return useActivityCommentMutation(projectId, activityId, ({ commentId }: { commentId: string }) =>
    fetchJson<ActivityCommentNode[]>(`/api/projects/${projectId}/activities/${activityId}/comments/${commentId}`, { method: 'DELETE' }))
}

export const projectAttachmentKeys = {
  list: (projectId: string, activityId: string | null | undefined) => [...projectKeys.detail(projectId), 'activity-attachments', activityId] as const,
}

export function useActivityAttachments(projectId: string, activityId: string | null | undefined) {
  return useQuery({
    queryKey: projectAttachmentKeys.list(projectId, activityId),
    queryFn: () => fetchJson<ActivityAttachmentNode[]>(`/api/projects/${projectId}/activities/${activityId}/attachments`),
    enabled: !!projectId && !!activityId,
    staleTime: 10_000,
  })
}

function useActivityAttachmentMutation<TVars>(projectId: string, activityId: string, fn: (vars: TVars) => Promise<ActivityAttachmentNode[]>, successMsg: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (attachments) => {
      qc.setQueryData(projectAttachmentKeys.list(projectId, activityId), attachments)
      toast.success(successMsg)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUploadActivityAttachment(projectId: string, activityId: string) {
  return useActivityAttachmentMutation(projectId, activityId, (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return fetchJson<ActivityAttachmentNode[]>(`/api/projects/${projectId}/activities/${activityId}/attachments`, { method: 'POST', body })
  }, 'File attached')
}

export function useDeleteActivityAttachment(projectId: string, activityId: string) {
  return useActivityAttachmentMutation(projectId, activityId, ({ attachmentId }: { attachmentId: string }) =>
    fetchJson<ActivityAttachmentNode[]>(`/api/projects/${projectId}/activities/${activityId}/attachments/${attachmentId}`, { method: 'DELETE' }), 'Attachment deleted')
}

// --- mutations (invalidate the project detail on success) --------------------

function useProjectMutation<TVars>(id: string, fn: (vars: TVars) => Promise<unknown>, successMsg?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(id) })
      qc.invalidateQueries({ queryKey: projectKeys.all })
      if (successMsg) toast.success(successMsg)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function useUpdateProject(id: string) {
  return useProjectMutation(id, (body: Record<string, unknown>) => fetchJson(`/api/projects/${id}`, jsonInit('PATCH', body)), 'Project updated')
}

export function useArchiveProject(id: string) {
  return useProjectMutation<void>(id, () => fetchJson(`/api/projects/${id}`, { method: 'DELETE' }), 'Project archived')
}

export function useAddPhase(id: string) {
  return useProjectMutation(id, (body: { name: string; weight?: number }) => fetchJson(`/api/projects/${id}/phases`, jsonInit('POST', body)), 'Phase added')
}
export function useUpdatePhase(id: string) {
  return useProjectMutation(id, ({ phaseId, ...body }: { phaseId: string } & Record<string, unknown>) => fetchJson(`/api/projects/${id}/phases/${phaseId}`, jsonInit('PATCH', body)))
}
export function useDeletePhase(id: string) {
  return useProjectMutation(id, ({ phaseId }: { phaseId: string }) => fetchJson(`/api/projects/${id}/phases/${phaseId}`, { method: 'DELETE' }), 'Phase deleted')
}

export function useAddMilestone(id: string) {
  return useProjectMutation(id, (body: { phaseId: string; name: string; weight?: number; isKeyMilestone?: boolean }) => fetchJson(`/api/projects/${id}/milestones`, jsonInit('POST', body)), 'Milestone added')
}
export function useUpdateMilestone(id: string) {
  return useProjectMutation(id, ({ milestoneId, ...body }: { milestoneId: string } & Record<string, unknown>) => fetchJson(`/api/projects/${id}/milestones/${milestoneId}`, jsonInit('PATCH', body)))
}
export function useDeleteMilestone(id: string) {
  return useProjectMutation(id, ({ milestoneId }: { milestoneId: string }) => fetchJson(`/api/projects/${id}/milestones/${milestoneId}`, { method: 'DELETE' }), 'Milestone deleted')
}

export function useAddActivity(id: string) {
  return useProjectMutation(id, (body: Record<string, unknown>) => fetchJson(`/api/projects/${id}/activities`, jsonInit('POST', body)), 'Activity added')
}
export function useUpdateActivity(id: string) {
  return useProjectMutation(id, ({ activityId, ...body }: { activityId: string } & Record<string, unknown>) => fetchJson(`/api/projects/${id}/activities/${activityId}`, jsonInit('PATCH', body)))
}
export function useShiftActivitySchedule(id: string) {
  return useProjectMutation(id, (body: {
    activityId: string
    mode: 'move' | 'resize-start' | 'resize-end'
    currentStart?: string | null
    currentEnd?: string | null
    slipReason?: string
    slipOwner?: OwnerParty
    slipDetail?: string
  }) => fetchJson(`/api/projects/${id}/activities/schedule`, jsonInit('PATCH', body)))
}
export function useDeleteActivity(id: string) {
  return useProjectMutation(id, ({ activityId }: { activityId: string }) => fetchJson(`/api/projects/${id}/activities/${activityId}`, { method: 'DELETE' }), 'Activity deleted')
}

export function useReorderSchedule(id: string) {
  return useProjectMutation(id, (body: {
    kind: 'phase' | 'milestone' | 'activity'
    parentId: string
    parentActivityId?: string | null
    orderedIds: string[]
  }) => fetchJson(`/api/projects/${id}/schedule/reorder`, jsonInit('PATCH', body)))
}

export function useCreateActivityDependency(id: string) {
  return useProjectMutation(id, (body: { predecessorId: string; successorId: string; type?: DependencyType; lagDays?: number }) =>
    fetchJson(`/api/projects/${id}/dependencies`, jsonInit('POST', body)), 'Dependency added')
}

export function useDeleteActivityDependency(id: string) {
  return useProjectMutation(id, ({ dependencyId }: { dependencyId: string }) =>
    fetchJson(`/api/projects/${id}/dependencies/${dependencyId}`, { method: 'DELETE' }), 'Dependency deleted')
}

export function useAddRaidItem(id: string) {
  return useProjectMutation(id, (body: Record<string, unknown>) =>
    fetchJson(`/api/projects/${id}/raid`, jsonInit('POST', body)), 'RAID item added')
}

export function useUpdateRaidItem(id: string) {
  return useProjectMutation(id, ({ raidId, ...body }: { raidId: string } & Record<string, unknown>) =>
    fetchJson(`/api/projects/${id}/raid/${raidId}`, jsonInit('PATCH', body)))
}

export function useDeleteRaidItem(id: string) {
  return useProjectMutation(id, ({ raidId }: { raidId: string }) =>
    fetchJson(`/api/projects/${id}/raid/${raidId}`, { method: 'DELETE' }), 'RAID item deleted')
}

export function useCreateRaidDelay(id: string) {
  return useProjectMutation(id, ({ raidId, reasonDetail }: { raidId: string; reasonDetail?: string }) =>
    fetchJson(`/api/projects/${id}/raid/${raidId}/delay`, jsonInit('POST', { reasonDetail })), 'Delay event created')
}

export function useAddChangeRequest(id: string) {
  return useProjectMutation(id, (body: Record<string, unknown>) =>
    fetchJson(`/api/projects/${id}/change-requests`, jsonInit('POST', body)), 'Change request added')
}

export function useUpdateChangeRequest(id: string) {
  return useProjectMutation(id, ({ crId, ...body }: { crId: string } & Record<string, unknown>) =>
    fetchJson(`/api/projects/${id}/change-requests/${crId}`, jsonInit('PATCH', body)))
}

export function useDeleteChangeRequest(id: string) {
  return useProjectMutation(id, ({ crId }: { crId: string }) =>
    fetchJson(`/api/projects/${id}/change-requests/${crId}`, { method: 'DELETE' }), 'Change request deleted')
}

export function useAddStageGate(id: string) {
  return useProjectMutation(id, (body: Record<string, unknown>) =>
    fetchJson(`/api/projects/${id}/stage-gates`, jsonInit('POST', body)), 'Stage gate added')
}

export function useUpdateStageGate(id: string) {
  return useProjectMutation(id, ({ gateId, ...body }: { gateId: string } & Record<string, unknown>) =>
    fetchJson(`/api/projects/${id}/stage-gates/${gateId}`, jsonInit('PATCH', body)))
}

export function useDeleteStageGate(id: string) {
  return useProjectMutation(id, ({ gateId }: { gateId: string }) =>
    fetchJson(`/api/projects/${id}/stage-gates/${gateId}`, { method: 'DELETE' }), 'Stage gate deleted')
}

export function useAddClientObligation(id: string) {
  return useProjectMutation(id, (body: Record<string, unknown>) =>
    fetchJson(`/api/projects/${id}/client-obligations`, jsonInit('POST', body)), 'Client obligation added')
}

export function useUpdateClientObligation(id: string) {
  return useProjectMutation(id, ({ obligationId, ...body }: { obligationId: string } & Record<string, unknown>) =>
    fetchJson(`/api/projects/${id}/client-obligations/${obligationId}`, jsonInit('PATCH', body)))
}

export function useDeleteClientObligation(id: string) {
  return useProjectMutation(id, ({ obligationId }: { obligationId: string }) =>
    fetchJson(`/api/projects/${id}/client-obligations/${obligationId}`, { method: 'DELETE' }), 'Client obligation deleted')
}

export function useAddCorrectionOfError(id: string) {
  return useProjectMutation(id, (body: Record<string, unknown>) =>
    fetchJson(`/api/projects/${id}/coes`, jsonInit('POST', body)), 'COE added')
}

export function useUpdateCorrectionOfError(id: string) {
  return useProjectMutation(id, ({ coeId, ...body }: { coeId: string } & Record<string, unknown>) =>
    fetchJson(`/api/projects/${id}/coes/${coeId}`, jsonInit('PATCH', body)))
}

export function useDeleteCorrectionOfError(id: string) {
  return useProjectMutation(id, ({ coeId }: { coeId: string }) =>
    fetchJson(`/api/projects/${id}/coes/${coeId}`, { method: 'DELETE' }), 'COE deleted')
}

export function useAddPaymentMilestone(id: string) {
  return useProjectMutation(id, (body: Record<string, unknown>) =>
    fetchJson(`/api/projects/${id}/payment-milestones`, jsonInit('POST', body)), 'Payment milestone added')
}

export function useUpdatePaymentMilestone(id: string) {
  return useProjectMutation(id, ({ paymentMilestoneId, ...body }: { paymentMilestoneId: string } & Record<string, unknown>) =>
    fetchJson(`/api/projects/${id}/payment-milestones/${paymentMilestoneId}`, jsonInit('PATCH', body)))
}

export function useDeletePaymentMilestone(id: string) {
  return useProjectMutation(id, ({ paymentMilestoneId }: { paymentMilestoneId: string }) =>
    fetchJson(`/api/projects/${id}/payment-milestones/${paymentMilestoneId}`, { method: 'DELETE' }), 'Payment milestone deleted')
}

export function useTestJiraConnection(id: string) {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<JiraConnectionTestResult>(`/api/projects/${id}/jira/test`, jsonInit('POST', body)),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSaveJiraConnection(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<{ connection: JiraConnectionSafe; test: JiraConnectionTestResult }>(`/api/projects/${id}/jira`, jsonInit('POST', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.detail(id), 'jira'] })
      qc.invalidateQueries({ queryKey: projectKeys.detail(id) })
      qc.invalidateQueries({ queryKey: projectKeys.all })
      toast.success('Jira connection saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSyncJiraConnection(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      fetchJson<{ results: { connectionId: string; status: string; errors: string | null }[] }>(`/api/projects/${id}/jira/sync`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.detail(id), 'jira'] })
      toast.success('Jira sync completed')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useCommitBaseline(id: string) {
  return useProjectMutation(id, (body: { notes?: string }) => fetchJson(`/api/projects/${id}/baseline`, jsonInit('POST', body)), 'Baseline committed (v1)')
}

// --- re-baseline (C2) --------------------------------------------------------

export interface RebaselineChange {
  activityId: string
  title: string
  phaseName: string
  oldStart: string | null
  oldEnd: string | null
  newStart: string | null
  newEnd: string | null
}

export function useRebaselineDiff(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...projectKeys.detail(id), 'rebaseline-diff'],
    queryFn: () => fetchJson<{ changes: RebaselineChange[] }>(`/api/projects/${id}/baseline/rebaseline`),
    enabled: enabled && !!id,
  })
}

export function useRebaseline(id: string) {
  return useProjectMutation(id, (body: { reason: string; approverId?: string }) =>
    fetchJson(`/api/projects/${id}/baseline/rebaseline`, jsonInit('POST', body)), 'Re-baselined')
}

// --- delay ledger (C5) --------------------------------------------------------

export interface DelayLedgerRow {
  id: string
  activityId: string | null
  activityTitle: string | null
  phase: string | null
  eventType: string
  baselineDate: string | null
  currentDate: string | null
  slipDays: number
  daysLost: number
  reason: string
  reasonDetail: string | null
  owner: string
  isAutoDetected: boolean
  slaBreachDays: number | null
  recoveryPlan: string | null
  recoveryOwner: string | null
  recoveryDate: string | null
  startedAt: string
  endedAt: string | null
  createdAt: string
}

export interface DelayLedgerData {
  rows: DelayLedgerRow[]
  totals: { total: number; byOwner: Record<string, number> }
  facets: { owners: string[]; reasons: string[]; phases: string[] }
}

export interface DelayLedgerFilters {
  owner?: string
  reason?: string
  phase?: string
}

export const delayLedgerKey = (id: string, filters: DelayLedgerFilters) =>
  [...projectKeys.detail(id), 'delays', filters] as const

export function useDelayLedger(id: string, filters: DelayLedgerFilters = {}) {
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => !!v) as [string, string][]
  ).toString()
  return useQuery({
    queryKey: delayLedgerKey(id, filters),
    queryFn: () => fetchJson<DelayLedgerData>(`/api/projects/${id}/delays${qs ? `?${qs}` : ''}`),
    enabled: !!id,
  })
}

export function useUpdateDelayRecovery(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { delayId: string; recoveryPlan?: string | null; recoveryOwner?: string | null; recoveryDate?: string | null }) =>
      fetchJson(`/api/projects/${id}/delays`, jsonInit('PATCH', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.detail(id), 'delays'] })
      toast.success('Recovery plan saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
