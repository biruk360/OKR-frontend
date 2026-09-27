import type { Prisma } from '@prisma/client'
import {
  plannedVsActualSlipState,
  plannedVsActualVarianceDays,
  summarizePlannedVsActual,
  type PlannedVsActualSlipState,
  type PlannedVsActualSummary,
} from '@/lib/projects/portal-planned-vs-actual'

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

/** A client-visible attachment in the project-wide portal documents list. */
export interface ClientProjectAttachment extends ClientActivityAttachment {
  activityTitle: string
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

/**
 * A CLIENT_VISIBLE change request as the client sees it. The free-text
 * `requestedBy` (often an employee's name) and `approvedById` are never
 * emitted — only the party label (invariant 4). Cost impact is internal.
 */
export interface ClientChangeRequest {
  id: string
  crCode: string
  title: string
  description: string
  type: string
  /** Requesting party as a label only: CLIENT → 'Your Team', 360GROUND → '360Ground'. */
  requestedBy: ClientOwnerLabel
  requestDate: string
  scheduleImpactDays: number
  affectedActivityCount: number
  status: string
  /** Who decides a CR is always the delivery side; never a person. Null until decided. */
  decidedBy: '360Ground' | null
  decisionDate: string | null
  clientSignOff: boolean
  clientSignOffAt: string | null
  rejectionReason: string | null
  createdAt: string
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

/**
 * CLIENT_VISIBLE attachments of one activity, or of a set of activities (the
 * portal documents list) — the visibility filter is always in SQL (invariant 5).
 * Callers pin the activities to a portal-enabled project in the session scope.
 */
export function portalActivityAttachmentWhere(activityId: string | readonly string[]): Prisma.ActivityAttachmentWhereInput {
  return {
    activityId: typeof activityId === 'string' ? activityId : { in: [...activityId] },
    visibility: 'CLIENT_VISIBLE',
  }
}

/** Activities of one project that the portal session may see *now* (scope + portalEnabled + not archived). */
export function portalProjectActivityWhere(projectId: string, projectIds: readonly string[]): Prisma.ActivityWhereInput {
  return { milestone: { phase: { project: { AND: [portalProjectWhere(projectIds), { id: projectId }] } } } }
}

export function portalRaidItemWhere(projectId: string): Prisma.RaidItemWhereInput {
  return { projectId, clientVisible: true }
}

/**
 * Change requests the PM has shared with the client. Visibility defaults to
 * INTERNAL (fail-safe) and is filtered here, in SQL — never after the read (invariant 5).
 */
export function portalChangeRequestWhere(projectId: string): Prisma.ChangeRequestWhereInput {
  return { projectId, visibility: 'CLIENT_VISIBLE' }
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
}>(project: T, opts: PortalSerializeOptions): ClientProject {
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

export function serializePhaseForClient(phase: ClientPhaseSource, opts: PortalSerializeOptions): ClientPhase {
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

export function serializeMilestoneForClient(milestone: ClientMilestoneSource, opts: PortalSerializeOptions): ClientMilestone {
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

export function serializeActivityForClient(activity: ClientActivitySource, opts: PortalSerializeOptions): ClientActivity {
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
}>(delay: T, opts: PortalSerializeOptions): ClientDelayEvent {
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
}>(item: T, opts: PortalSerializeOptions): ClientRaidItem {
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

export function serializeCommentForClient(comment: ClientCommentSource, opts: PortalSerializeOptions): ClientActivityComment {
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
}>(attachment: T, opts: PortalSerializeOptions): ClientActivityAttachment {
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

export function serializeProjectAttachmentForClient<T extends {
  id: string
  activityId: string
  fileName: string
  fileSize: number
  mimeType: string
  visibility: string
  createdAt: Date
  activity: { title: string }
}>(attachment: T, opts: PortalSerializeOptions): ClientProjectAttachment {
  const base = serializeAttachmentForClient(attachment, opts)
  return scrubPortalPayload({ ...base, activityTitle: attachment.activity.title }, opts) as ClientProjectAttachment
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
}>(report: T, opts: PortalSerializeOptions): ClientProjectReport {
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

export function serializeChangeRequestForClient<T extends {
  id: string
  crCode: string
  title: string
  description: string
  type: string
  requestedByParty: string
  requestDate: Date
  scheduleImpactDays: number
  affectedActivityIds: readonly string[]
  status: string
  ccbDecisionDate: Date | null
  clientSignOff: boolean
  clientSignOffAt: Date | null
  rejectionReason: string | null
  visibility: string
  createdAt: Date
}>(cr: T, opts: PortalSerializeOptions): ClientChangeRequest {
  if (cr.visibility !== 'CLIENT_VISIBLE') throw new Error('Portal change request serialization requires visibility=CLIENT_VISIBLE')
  const decided = cr.status === 'APPROVED' || cr.status === 'REJECTED' || cr.status === 'IMPLEMENTED'
  return scrubPortalPayload({
    id: cr.id,
    crCode: cr.crCode,
    title: cr.title,
    description: cr.description,
    type: cr.type,
    requestedBy: ownerLabelForClient(cr.requestedByParty),
    requestDate: cr.requestDate.toISOString(),
    scheduleImpactDays: cr.scheduleImpactDays,
    affectedActivityCount: cr.affectedActivityIds.length,
    status: cr.status,
    decidedBy: decided ? PORTAL_REDACTED_LABEL : null,
    decisionDate: cr.ccbDecisionDate?.toISOString() ?? null,
    clientSignOff: cr.clientSignOff,
    clientSignOffAt: cr.clientSignOffAt?.toISOString() ?? null,
    rejectionReason: cr.rejectionReason,
    createdAt: cr.createdAt.toISOString(),
  }, opts) as ClientChangeRequest
}

/**
 * One Planned-vs-Actual row. Milestones carry a single due date, so their
 * baseline/current *start* is always null. Owner is a party label only
 * (invariant 4); milestones have no owner party. The schema has no actual
 * start/finish dates, so none are emitted — `status`/`percentComplete` say
 * whether the item is done.
 */
export interface ClientPlannedVsActualRow {
  id: string
  kind: 'MILESTONE' | 'ACTIVITY'
  name: string
  phaseName: string
  milestoneName: string | null
  owner: ClientOwnerLabel | null
  status: string
  percentComplete: number
  baselineStart: string | null
  baselineEnd: string | null
  currentStart: string | null
  currentEnd: string | null
  /** Signed calendar days, current end − baseline end; null when not baselined. */
  varianceDays: number | null
  slipState: PlannedVsActualSlipState
}

export interface ClientPlannedVsActual {
  baselineVersion: number
  baselineCommittedAt: string | null
  milestones: ClientPlannedVsActualRow[]
  activities: ClientPlannedVsActualRow[]
  milestoneSummary: PlannedVsActualSummary
  activitySummary: PlannedVsActualSummary
}

/**
 * Planned vs Actual for the portal. Takes the same project tree the portal
 * already loads (`projectPortalInclude`, scoped by `portalProjectWhere`), so it
 * exposes exactly the milestones/activities the Milestones and Schedule tabs
 * show — no extra rows. Slip math lives in lib/projects/portal-planned-vs-actual.
 */
export function serializePlannedVsActualForClient(project: {
  baselineVersion: number
  baselineCommittedAt: Date | null
  phases: readonly ClientPhaseSource[]
}, opts: PortalSerializeOptions): ClientPlannedVsActual {
  const milestones: ClientPlannedVsActualRow[] = []
  const activities: ClientPlannedVsActualRow[] = []
  for (const phase of project.phases) {
    for (const milestone of phase.milestones) {
      const milestoneVariance = plannedVsActualVarianceDays(milestone.baselineDate, milestone.currentDate)
      milestones.push({
        id: milestone.id,
        kind: 'MILESTONE',
        name: milestone.name,
        phaseName: phase.name,
        milestoneName: null,
        owner: null,
        status: milestone.status,
        percentComplete: milestone.percentComplete,
        baselineStart: null,
        baselineEnd: milestone.baselineDate?.toISOString() ?? null,
        currentStart: null,
        currentEnd: milestone.currentDate?.toISOString() ?? null,
        varianceDays: milestoneVariance,
        slipState: plannedVsActualSlipState(milestoneVariance),
      })
      for (const activity of milestone.activities) {
        const variance = plannedVsActualVarianceDays(activity.baselineEnd, activity.currentEnd)
        activities.push({
          id: activity.id,
          kind: 'ACTIVITY',
          name: activity.title,
          phaseName: phase.name,
          milestoneName: milestone.name,
          owner: ownerLabelForClient(activity.ownerParty),
          status: activity.status,
          percentComplete: activity.percentComplete,
          baselineStart: activity.baselineStart?.toISOString() ?? null,
          baselineEnd: activity.baselineEnd?.toISOString() ?? null,
          currentStart: activity.currentStart?.toISOString() ?? null,
          currentEnd: activity.currentEnd?.toISOString() ?? null,
          varianceDays: variance,
          slipState: plannedVsActualSlipState(variance),
        })
      }
    }
  }
  return scrubPortalPayload({
    baselineVersion: project.baselineVersion,
    baselineCommittedAt: project.baselineCommittedAt?.toISOString() ?? null,
    milestones,
    activities,
    milestoneSummary: summarizePlannedVsActual(milestones),
    activitySummary: summarizePlannedVsActual(activities),
  }, opts) as ClientPlannedVsActual
}

export interface PortalSerializeOptions {
  /**
   * Every internal user's name and email — active AND inactive — loaded with
   * `loadPortalForbiddenNames()`. Required (not optional) so a portal route
   * cannot forget to pass it and silently skip redaction (Critical Invariant #4).
   */
  forbiddenEmployeeNames: readonly string[]
}

/** What a redacted employee name becomes in any portal payload. */
export const PORTAL_REDACTED_LABEL = '360Ground'

/** Minimum length for a first/last-name token to be redacted on its own. */
export const PORTAL_NAME_TOKEN_MIN_LENGTH = 3

/**
 * Tokens never redacted even when an employee's name contains them: they are
 * the neutral labels the serializer itself emits ('Your Team', '360Ground',
 * 'Client'), so redacting them would corrupt the anonymized output.
 */
const PROTECTED_TOKENS = new Set(['360ground', 'client', 'your', 'team'])

/**
 * Keys whose values are enum constants / identifiers, not free text. An
 * ALL_CAPS constant under one of these keys is left alone so an employee named
 * e.g. "Amber" cannot turn `ragStatus: 'AMBER'` into '360Ground'. Anything
 * that does not look like a constant (e.g. a legacy free-text slipReason) is
 * still redacted.
 */
const PORTAL_ENUM_KEYS = new Set([
  'status',
  'ragStatus',
  'rag',
  'type',
  'eventType',
  'reason',
  'owner',
  'ownerParty',
  'delayOwner',
  'slipReason',
  'slipOwner',
  'dependsOnParty',
  'visibility',
  'severity',
  'category',
  'mimeType',
  'kind',
  'slipState',
])
const ENUM_CONSTANT = /^[A-Z0-9_]+$/

/** Row shape `loadPortalForbiddenNames` needs; satisfied by the Prisma client. */
export interface PortalNameSource {
  user: {
    findMany(args: { select: { name: true; email: true } }): Promise<Array<{ name: string | null; email: string | null }>>
  }
}

/**
 * The single loader every portal route/page uses for the redaction list.
 * Deliberately NOT filtered by `isActive`: a deactivated employee's name can
 * still sit in old comments, slip details and report headers.
 */
export async function loadPortalForbiddenNames(db: PortalNameSource): Promise<string[]> {
  const users = await db.user.findMany({ select: { name: true, email: true } })
  const out: string[] = []
  for (const user of users) {
    if (user.name?.trim()) out.push(user.name)
    if (user.email?.trim()) out.push(user.email)
  }
  return out
}

export function scrubPortalPayload(value: unknown, opts: PortalSerializeOptions): unknown {
  return scrubValue(value, opts, null)
}

function scrubValue(value: unknown, opts: PortalSerializeOptions, key: string | null): unknown {
  if (typeof value === 'string') {
    if (key && isStructuralValue(key, value)) return value
    return redactForbiddenNames(value, opts.forbiddenEmployeeNames)
  }
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, opts, key))
  if (!value || typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [childKey, child] of Object.entries(value)) {
    if (PORTAL_FORBIDDEN_KEYS.has(childKey)) continue
    out[childKey] = scrubValue(child, opts, childKey)
  }
  return out
}

function isStructuralValue(key: string, value: string): boolean {
  if (key === 'id' || /Id$/.test(key)) return true
  return PORTAL_ENUM_KEYS.has(key) && ENUM_CONSTANT.test(value)
}

// Constructed, not a literal: the `u` flag literal is rejected by the TS target.
const NAME_TOKEN_SEPARATOR = new RegExp('[^\\p{L}\\p{N}]+', 'u')

/**
 * Every string that must not reach the portal for these names: the full name
 * (any whitespace), each first/last/middle-name token of at least
 * PORTAL_NAME_TOKEN_MIN_LENGTH characters, full email addresses and their local
 * parts. Longest first, so "Meklit Tadesse" wins over "Meklit".
 */
export function portalRedactionTerms(names: readonly string[]): string[] {
  const terms = new Set<string>()
  const addToken = (token: string) => {
    const t = token.trim()
    if (t.length < PORTAL_NAME_TOKEN_MIN_LENGTH) return
    if (/^\d+$/.test(t)) return
    if (PROTECTED_TOKENS.has(t.toLowerCase())) return
    terms.add(t)
  }
  for (const raw of names) {
    const full = (raw ?? '').trim().replace(/\s+/g, ' ')
    if (!full) continue
    addToken(full)
    const at = full.indexOf('@')
    const tokenSource = at > 0 ? full.slice(0, at) : full
    if (at > 0) addToken(tokenSource)
    for (const part of tokenSource.split(NAME_TOKEN_SEPARATOR)) addToken(part)
  }
  return Array.from(terms).sort((a, b) => b.length - a.length)
}

const redactorCache = new WeakMap<readonly string[], RegExp | null>()

function redactorFor(names: readonly string[]): RegExp | null {
  const cached = redactorCache.get(names)
  if (cached !== undefined) return cached
  const terms = portalRedactionTerms(names)
  const pattern = terms.length
    ? new RegExp(
        `(?<![\\p{L}\\p{N}_])(?:${terms.map((t) => escapeRegExp(t).replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}_])`,
        'giu',
      )
    : null
  redactorCache.set(names, pattern)
  return pattern
}

/**
 * TipTap mention nodes carry the mentioned user's id and name in attributes
 * (`data-id`, `data-mention-id`, `data-label`) as well as the visible text.
 * The whole node becomes a neutral mention before name redaction runs.
 */
const MENTION_ELEMENT =
  /<(span|a)\b[^>]*?(?:data-type\s*=\s*["']mention["']|data-mention-id\s*=|class\s*=\s*["'][^"']*\bmention\b[^"']*["'])[^>]*>[\s\S]*?<\/\1\s*>/gi
const IDENTITY_ATTRIBUTE =
  /\s(?:data-id|data-mention-id|data-label|data-user-id|data-email)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi

export function redactForbiddenNames(value: string, names: readonly string[]): string {
  let text = value
  if (text.includes('<')) {
    text = text
      .replace(MENTION_ELEMENT, `<span class="mention">@${PORTAL_REDACTED_LABEL}</span>`)
      .replace(IDENTITY_ATTRIBUTE, '')
  }
  const pattern = redactorFor(names)
  return pattern ? text.replace(pattern, PORTAL_REDACTED_LABEL) : text
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
