import type { Prisma } from '@prisma/client'

export type ClientOwnerLabel = 'Your Team' | '360Ground'

export interface ClientProject {
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
  plannedStart: string
  plannedEnd: string
  baselineCommittedAt: string | null
  baselineVersion: number
  phases: ClientPhase[]
}

export interface ClientPhase {
  id: string
  name: string
  position: number
  percentComplete: number
  status: string
  baselineStart: string | null
  baselineEnd: string | null
  currentStart: string | null
  currentEnd: string | null
  milestones: ClientMilestone[]
}

export interface ClientMilestone {
  id: string
  name: string
  position: number
  percentComplete: number
  status: string
  baselineDate: string | null
  currentDate: string | null
  isKeyMilestone: boolean
  activities: ClientActivity[]
}

export interface ClientActivity {
  id: string
  title: string
  owner: ClientOwnerLabel
  baselineStart: string | null
  baselineEnd: string | null
  currentStart: string | null
  currentEnd: string | null
  status: string
  percentComplete: number
  isMilestone: boolean
  slipDays: number
  slipReason: string | null
  slipOwner: string | null
  waitingSince: string | null
}

export interface ClientDelayEvent {
  id: string
  activityId: string | null
  eventType: string
  reason: string
  reasonDetail: string | null
  owner: string
  daysLost: number
  startedAt: string
  endedAt: string | null
  phaseAtTime: string | null
  isAutoDetected: boolean
  recoveryPlan: string | null
  recoveryDate: string | null
}

export interface ClientRaidItem {
  id: string
  type: string
  refCode: string
  title: string
  description: string | null
  category: string | null
  probability: number | null
  impact: number | null
  score: number | null
  mitigation: string | null
  contingency: string | null
  severity: string | null
  resolution: string | null
  dependsOnParty: string | null
  neededByDate: string | null
  validated: boolean | null
  validatedAt: string | null
  impactIfFalse: string | null
  status: string
  reviewDate: string | null
  createdAt: string
  closedAt: string | null
}

export interface ClientActivityComment {
  id: string
  activityId: string
  content: string
  parentId: string | null
  visibility: 'CLIENT_VISIBLE'
  isClientAuthor: boolean
  createdAt: string
  author: { name: 'Client' | '360Ground' }
  replies: ClientActivityComment[]
}

export interface ClientActivityAttachment {
  id: string
  activityId: string
  fileName: string
  fileSize: number
  mimeType: string
  createdAt: string
}

export interface ClientProjectReport {
  id: string
  type: string
  periodStart: string
  periodEnd: string
  status: string
  aiSummary: string | null
  contentJson: unknown
  generatedAt: string
  approvedAt: string | null
  sentAt: string | null
}

export const PORTAL_FORBIDDEN_KEYS = new Set([
  'assigneeId',
  'ownerId',
  'authorId',
  'uploadedById',
  'recordedById',
  'approvedById',
  'fixOwnerId',
  'projectManagerId',
  'createdById',
  'userId',
  'avatar',
  'avatarUrl',
  'email',
  'members',
  'estimatedHours',
  'actualHours',
  'estimatedCost',
  'actualCost',
  'costImpact',
  'contractValue',
  'budgetAtCompletion',
  'actualCostTotal',
  'jiraIssueKeys',
  'jiraConnectionId',
  'jiraLinked',
  'jiraAutoRollup',
  'mentions',
])

export function portalProjectWhere(projectIds: readonly string[]): Prisma.ProjectWhereInput {
  return {
    id: { in: [...projectIds] },
    portalEnabled: true,
    archivedAt: null,
  }
}

export function portalActivityCommentWhere(activityId: string): Prisma.ActivityCommentWhereInput {
  return { activityId, visibility: 'CLIENT_VISIBLE' }
}

export function portalActivityAttachmentWhere(activityId: string): Prisma.ActivityAttachmentWhereInput {
  return { activityId, visibility: 'CLIENT_VISIBLE' }
}

export function portalRaidItemWhere(projectId: string): Prisma.RaidItemWhereInput {
  return { projectId, clientVisible: true }
}

export function portalReportWhere(projectId: string): Prisma.ProjectReportWhereInput {
  return {
    projectId,
    status: { in: ['APPROVED', 'SENT'] },
    type: { in: ['CLIENT_BIMONTHLY', 'STEERING', 'PORTFOLIO'] },
  }
}

export function ownerLabelForClient(ownerParty: string | null | undefined): ClientOwnerLabel {
  return ownerParty === 'CLIENT' ? 'Your Team' : '360Ground'
}

export function serializeProjectForClient<T extends {
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
  plannedStart: Date
  plannedEnd: Date
  baselineCommittedAt: Date | null
  baselineVersion: number
  phases: readonly ClientPhaseSource[]
}>(project: T, opts: PortalSerializeOptions = {}): ClientProject {
  return scrubPortalPayload({
    id: project.id,
    code: project.code,
    name: project.name,
    description: project.description,
    clientName: project.clientName,
    status: project.status,
    ragStatus: project.ragStatus,
    confidence: project.confidence,
    percentComplete: project.percentComplete,
    percentPlanned: project.percentPlanned,
    spi: project.spi,
    plannedStart: project.plannedStart.toISOString(),
    plannedEnd: project.plannedEnd.toISOString(),
    baselineCommittedAt: project.baselineCommittedAt?.toISOString() ?? null,
    baselineVersion: project.baselineVersion,
    phases: project.phases.map((phase) => serializePhaseForClient(phase, opts)),
  }, opts) as ClientProject
}

export interface ClientPhaseSource {
  id: string
  name: string
  position: number
  percentComplete: number
  status: string
  baselineStart: Date | null
  baselineEnd: Date | null
  currentStart: Date | null
  currentEnd: Date | null
  milestones: readonly ClientMilestoneSource[]
}

export function serializePhaseForClient(phase: ClientPhaseSource, opts: PortalSerializeOptions = {}): ClientPhase {
  return scrubPortalPayload({
    id: phase.id,
    name: phase.name,
    position: phase.position,
    percentComplete: phase.percentComplete,
    status: phase.status,
    baselineStart: phase.baselineStart?.toISOString() ?? null,
    baselineEnd: phase.baselineEnd?.toISOString() ?? null,
    currentStart: phase.currentStart?.toISOString() ?? null,
    currentEnd: phase.currentEnd?.toISOString() ?? null,
    milestones: phase.milestones.map((milestone) => serializeMilestoneForClient(milestone, opts)),
  }, opts) as ClientPhase
}

export interface ClientMilestoneSource {
  id: string
  name: string
  position: number
  percentComplete: number
  status: string
  baselineDate: Date | null
  currentDate: Date | null
  isKeyMilestone: boolean
  activities: readonly ClientActivitySource[]
}

export function serializeMilestoneForClient(milestone: ClientMilestoneSource, opts: PortalSerializeOptions = {}): ClientMilestone {
  return scrubPortalPayload({
    id: milestone.id,
    name: milestone.name,
    position: milestone.position,
    percentComplete: milestone.percentComplete,
    status: milestone.status,
    baselineDate: milestone.baselineDate?.toISOString() ?? null,
    currentDate: milestone.currentDate?.toISOString() ?? null,
    isKeyMilestone: milestone.isKeyMilestone,
    activities: milestone.activities.map((activity) => serializeActivityForClient(activity, opts)),
  }, opts) as ClientMilestone
}

export interface ClientActivitySource {
  id: string
  title: string
  ownerParty: string
  baselineStart: Date | null
  baselineEnd: Date | null
  currentStart: Date | null
  currentEnd: Date | null
  status: string
  percentComplete: number
  isMilestone: boolean
  slipDays: number
  slipReason: string | null
  slipOwner: string | null
  waitingSince: Date | null
}

export function serializeActivityForClient(activity: ClientActivitySource, opts: PortalSerializeOptions = {}): ClientActivity {
  return scrubPortalPayload({
    id: activity.id,
    title: activity.title,
    owner: ownerLabelForClient(activity.ownerParty),
    baselineStart: activity.baselineStart?.toISOString() ?? null,
    baselineEnd: activity.baselineEnd?.toISOString() ?? null,
    currentStart: activity.currentStart?.toISOString() ?? null,
    currentEnd: activity.currentEnd?.toISOString() ?? null,
    status: activity.status,
    percentComplete: activity.percentComplete,
    isMilestone: activity.isMilestone,
    slipDays: activity.slipDays,
    slipReason: activity.slipReason,
    slipOwner: activity.slipOwner,
    waitingSince: activity.waitingSince?.toISOString() ?? null,
  }, opts) as ClientActivity
}

export function serializeDelayForClient<T extends {
  id: string
  activityId: string | null
  eventType: string
  reason: string
  reasonDetail: string | null
  owner: string
  daysLost: number
  startedAt: Date
  endedAt: Date | null
  phaseAtTime: string | null
  isAutoDetected: boolean
  recoveryPlan: string | null
  recoveryDate: Date | null
}>(delay: T, opts: PortalSerializeOptions = {}): ClientDelayEvent {
  return scrubPortalPayload({
    id: delay.id,
    activityId: delay.activityId,
    eventType: delay.eventType,
    reason: delay.reason,
    reasonDetail: delay.reasonDetail,
    owner: delay.owner,
    daysLost: delay.daysLost,
    startedAt: delay.startedAt.toISOString(),
    endedAt: delay.endedAt?.toISOString() ?? null,
    phaseAtTime: delay.phaseAtTime,
    isAutoDetected: delay.isAutoDetected,
    recoveryPlan: delay.recoveryPlan,
    recoveryDate: delay.recoveryDate?.toISOString() ?? null,
  }, opts) as ClientDelayEvent
}

export function serializeRaidItemForClient<T extends {
  id: string
  type: string
  refCode: string
  title: string
  description: string | null
  category: string | null
  probability: number | null
  impact: number | null
  score: number | null
  mitigation: string | null
  contingency: string | null
  severity: string | null
  resolution: string | null
  dependsOnParty: string | null
  neededByDate: Date | null
  validated: boolean | null
  validatedAt: Date | null
  impactIfFalse: string | null
  status: string
  clientVisible: boolean
  reviewDate: Date | null
  createdAt: Date
  closedAt: Date | null
}>(item: T, opts: PortalSerializeOptions = {}): ClientRaidItem {
  if (!item.clientVisible) throw new Error('Portal RAID serialization requires clientVisible=true')
  return scrubPortalPayload({
    id: item.id,
    type: item.type,
    refCode: item.refCode,
    title: item.title,
    description: item.description,
    category: item.category,
    probability: item.probability,
    impact: item.impact,
    score: item.score,
    mitigation: item.mitigation,
    contingency: item.contingency,
    severity: item.severity,
    resolution: item.resolution,
    dependsOnParty: item.dependsOnParty,
    neededByDate: item.neededByDate?.toISOString() ?? null,
    validated: item.validated,
    validatedAt: item.validatedAt?.toISOString() ?? null,
    impactIfFalse: item.impactIfFalse,
    status: item.status,
    reviewDate: item.reviewDate?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    closedAt: item.closedAt?.toISOString() ?? null,
  }, opts) as ClientRaidItem
}

export interface ClientCommentSource {
  id: string
  activityId: string
  authorId?: string
  content: string
  parentId: string | null
  visibility: string
  mentions?: readonly string[]
  isClientAuthor: boolean
  createdAt: Date | string
  replies?: readonly ClientCommentSource[]
}

export function serializeCommentForClient(comment: ClientCommentSource, opts: PortalSerializeOptions = {}): ClientActivityComment {
  if (comment.visibility !== 'CLIENT_VISIBLE') throw new Error('Portal comment serialization requires visibility=CLIENT_VISIBLE')
  return scrubPortalPayload({
    id: comment.id,
    activityId: comment.activityId,
    content: comment.content,
    parentId: comment.parentId,
    visibility: 'CLIENT_VISIBLE',
    isClientAuthor: comment.isClientAuthor,
    createdAt: typeof comment.createdAt === 'string' ? comment.createdAt : comment.createdAt.toISOString(),
    author: { name: comment.isClientAuthor ? 'Client' : '360Ground' },
    replies: (comment.replies ?? []).map((reply) => serializeCommentForClient(reply, opts)),
  }, opts) as ClientActivityComment
}

export function serializeAttachmentForClient<T extends {
  id: string
  activityId: string
  fileName: string
  fileSize: number
  mimeType: string
  visibility: string
  createdAt: Date
}>(attachment: T, opts: PortalSerializeOptions = {}): ClientActivityAttachment {
  if (attachment.visibility !== 'CLIENT_VISIBLE') throw new Error('Portal attachment serialization requires visibility=CLIENT_VISIBLE')
  return scrubPortalPayload({
    id: attachment.id,
    activityId: attachment.activityId,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    mimeType: attachment.mimeType,
    createdAt: attachment.createdAt.toISOString(),
  }, opts) as ClientActivityAttachment
}

export function serializeReportForClient<T extends {
  id: string
  type: string
  periodStart: Date
  periodEnd: Date
  status: string
  aiSummary: string | null
  contentJson: unknown
  generatedAt: Date
  approvedAt: Date | null
  sentAt: Date | null
}>(report: T, opts: PortalSerializeOptions = {}): ClientProjectReport {
  return scrubPortalPayload({
    id: report.id,
    type: report.type,
    periodStart: report.periodStart.toISOString(),
    periodEnd: report.periodEnd.toISOString(),
    status: report.status,
    aiSummary: report.aiSummary,
    contentJson: report.contentJson,
    generatedAt: report.generatedAt.toISOString(),
    approvedAt: report.approvedAt?.toISOString() ?? null,
    sentAt: report.sentAt?.toISOString() ?? null,
  }, opts) as ClientProjectReport
}

export interface PortalSerializeOptions {
  forbiddenEmployeeNames?: readonly string[]
}

export function scrubPortalPayload(value: unknown, opts: PortalSerializeOptions = {}): unknown {
  if (typeof value === 'string') return redactForbiddenNames(value, opts.forbiddenEmployeeNames ?? [])
  if (Array.isArray(value)) return value.map((item) => scrubPortalPayload(item, opts))
  if (!value || typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (PORTAL_FORBIDDEN_KEYS.has(key)) continue
    out[key] = scrubPortalPayload(child, opts)
  }
  return out
}

export function redactForbiddenNames(value: string, names: readonly string[]): string {
  let text = value
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed) continue
    text = text.replace(new RegExp(escapeRegExp(trimmed), 'gi'), '360Ground')
  }
  return text
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
