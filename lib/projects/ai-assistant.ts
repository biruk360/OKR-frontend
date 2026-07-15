import type { Prisma, Project } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { AI_SUMMARY_MAX_BULLETS, AI_SUMMARY_MAX_CHARS, SLIP_REASON_LABEL } from '@/features/projects/types'
import { recordGenerationLog } from '@/lib/ai/generation-log'
import { AI_FEATURE_KEYS } from '@/lib/ai/config'
import { businessDaysBetween } from './business-days'

/**
 * Constrained AI Assistant for the Project Management module (J6).
 *
 * Allowed uses:
 *  - capped executive summaries
 *  - risk detection grounded in existing project data
 *  - delay-pattern insights
 *  - estimate suggestions from historical actuals
 *
 * Forbidden:
 *  - generating requirements/specs
 *  - client-facing prose without PM review
 *  - output above configured caps
 *  - auto-sending anything
 *
 * All outputs are deterministic, data-grounded, post-validated, and logged via
 * AiGenerationLog. PM approval is required before any external use.
 */

export const AI_ASSISTANT_INTENTS = [
  'EXECUTIVE_SUMMARY',
  'RISK_DETECTION',
  'DELAY_PATTERN',
  'ESTIMATE_SUGGESTION',
] as const
export type AiAssistantIntent = (typeof AI_ASSISTANT_INTENTS)[number]

export const AI_ASSISTANT_FORBIDDEN_INTENTS = [
  'REQUIREMENTS',
  'CLIENT_PROSE',
  'AUTO_SEND',
] as const

export interface AiAssistantRequest {
  intent: string
  context?: string | null
}

export interface AiAssistantResponse {
  intent: AiAssistantIntent
  output: string
  groundedIn: string[]
  capped: boolean
  approved: false
  requiresPmApproval: true
  bullets: number
  chars: number
}

export interface AssistantFacts {
  project: Pick<
    Project,
    | 'id'
    | 'code'
    | 'name'
    | 'status'
    | 'ragStatus'
    | 'confidence'
    | 'percentComplete'
    | 'percentPlanned'
    | 'spi'
    | 'cpi'
    | 'plannedStart'
    | 'plannedEnd'
    | 'jiraLinked'
  >
  activityCount: number
  unassignedActivities: number
  approvalWaitingCount: number
  approvalWaitingDays: number
  delayedActivityCount: number
  totalSlipDays: number
  openRiskCount: number
  highRiskCount: number
  overdueClientDependencies: number
  pendingChangeRequests: number
  topDelayReasons: Array<{ reason: string; count: number; daysLost: number }>
  delayByPhase: Array<{ phase: string; count: number; daysLost: number }>
  delayByOwner: Array<{ owner: string; daysLost: number }>
  estimateRows: Array<{
    source: 'PROJECT_ACTIVITY' | 'JIRA'
    key: string
    title: string
    estimateHours: number
    actualHours: number
    accuracy: number
  }>
  activitiesWithoutEstimate: number
}

export function isAllowedIntent(intent: string): intent is AiAssistantIntent {
  return AI_ASSISTANT_INTENTS.includes(intent as AiAssistantIntent)
}

export function isForbiddenIntent(intent: string): boolean {
  return AI_ASSISTANT_FORBIDDEN_INTENTS.includes(intent as (typeof AI_ASSISTANT_FORBIDDEN_INTENTS)[number])
}

export function classifyIntent(intent: string): AiAssistantIntent {
  if (!isAllowedIntent(intent)) {
    throw new Error(`AI assistant intent '${intent}' is not allowed`)
  }
  return intent
}

export function validateAssistantOutput(output: string): {
  valid: boolean
  bullets: number
  chars: number
  errors: string[]
} {
  const text = output.trim()
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const bulletLines = lines.filter((line) => /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
  const bullets = bulletLines.length || lines.length
  const errors: string[] = []
  if (!text) errors.push('Output is required')
  if (bullets > AI_SUMMARY_MAX_BULLETS) errors.push(`Output must be ${AI_SUMMARY_MAX_BULLETS} bullets or fewer`)
  if (text.length > AI_SUMMARY_MAX_CHARS) errors.push(`Output must be ${AI_SUMMARY_MAX_CHARS} characters or fewer`)
  return { valid: errors.length === 0, bullets, chars: text.length, errors }
}

export function enforceAssistantCaps(items: string[]): string {
  const capped = items.slice(0, AI_SUMMARY_MAX_BULLETS).map((item) => item.trim()).filter(Boolean)
  while (capped.join('\n').length > AI_SUMMARY_MAX_CHARS && capped.length > 1) capped.pop()
  let text = capped.join('\n')
  if (text.length > AI_SUMMARY_MAX_CHARS) {
    text = `${text.slice(0, AI_SUMMARY_MAX_CHARS - 1).trimEnd()}…`
  }
  return text
}

export async function generateAssistantOutput(
  projectId: string,
  request: AiAssistantRequest,
  actorId: string,
  now = new Date(),
): Promise<AiAssistantResponse> {
  const intent = classifyIntent(request.intent)
  if (request.context && detectForbiddenContext(request.context)) {
    throw new Error('Request context contains a forbidden use case')
  }

  const facts = await gatherAssistantFacts(projectId, now)
  const rawOutput = buildGroundedResponse(intent, facts)
  const output = enforceAssistantCaps(rawOutput.split('\n'))
  const validation = validateAssistantOutput(output)
  if (!validation.valid) {
    throw new Error(`Generated output failed validation: ${validation.errors.join(', ')}`)
  }

  const groundedIn = buildGroundedIn(intent, facts)

  await recordGenerationLog({
    userId: actorId,
    feature: AI_FEATURE_KEYS.PROJECT_AI_ASSISTANT,
    provider: 'openai',
    modelId: 'deterministic-constrained-assistant',
    inputTokens: JSON.stringify({ intent, context: request.context, facts }).length,
    outputTokens: output.length,
    status: 'OK',
    responseJson: { intent, output, groundedIn, capped: true, approved: false },
  })

  return {
    intent,
    output,
    groundedIn,
    capped: true,
    approved: false,
    requiresPmApproval: true,
    bullets: validation.bullets,
    chars: validation.chars,
  }
}

export async function gatherAssistantFacts(projectId: string, now = new Date()): Promise<AssistantFacts> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      ragStatus: true,
      confidence: true,
      percentComplete: true,
      percentPlanned: true,
      spi: true,
      cpi: true,
      plannedStart: true,
      plannedEnd: true,
      jiraLinked: true,
    },
  })
  if (!project) throw new Error('Project not found')

  const [phases, delayEvents, raidItems, changeRequests, jiraConnection] = await Promise.all([
    prisma.phase.findMany({
      where: { projectId },
      include: { milestones: { include: { activities: true } } },
      orderBy: { position: 'asc' },
    }),
    prisma.delayEvent.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } }),
    prisma.raidItem.findMany({
      where: { projectId, status: { not: 'CLOSED' } },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.changeRequest.findMany({
      where: { projectId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { jiraConnectionId: true },
    }).then((p) => (p?.jiraConnectionId ? prisma.jiraConnection.findUnique({ where: { id: p.jiraConnectionId }, select: { id: true } }) : null)),
  ])

  const activities = phases.flatMap((phase) =>
    phase.milestones.flatMap((milestone) =>
      milestone.activities.map((activity) => ({ phase: phase.name, milestone: milestone.name, activity }))
    )
  )

  const unassignedActivities = activities.filter(({ activity }) => !activity.assigneeId && activity.status !== 'APPROVED' && activity.status !== 'FINISHED').length
  const waiting = activities.filter(({ activity }) => activity.status === 'APPROVAL_REQUESTED')
  const approvalWaitingCount = waiting.length
  const approvalWaitingDays = waiting.reduce((sum, { activity }) => sum + (activity.waitingSince ? businessDaysBetween(activity.waitingSince, now) : 0), 0)
  const delayedActivityCount = activities.filter(({ activity }) => activity.slipDays > 0).length
  const totalSlipDays = activities.reduce((sum, { activity }) => sum + activity.slipDays, 0)

  const highRiskCount = raidItems.filter((item) => item.type === 'RISK' && (item.score ?? 0) >= 15).length
  const overdueClientDependencies = raidItems.filter(
    (item) => item.type === 'DEPENDENCY' && item.dependsOnParty === 'CLIENT' && item.neededByDate && item.neededByDate < now,
  ).length

  const activitiesWithEstimate = activities.filter(({ activity }) => activity.estimatedHours != null && activity.estimatedHours > 0)
  const activitiesWithActual = activities.filter(({ activity }) => activity.actualHours != null && activity.actualHours > 0)
  const activitiesWithoutEstimate = activities.filter(({ activity }) => (activity.estimatedHours ?? 0) <= 0).length

  const estimateRows: AssistantFacts['estimateRows'] = []
  for (const { activity } of activitiesWithEstimate) {
    if (activity.actualHours == null) continue
    const accuracy = activity.estimatedHours! > 0 ? activity.actualHours / activity.estimatedHours! : 0
    estimateRows.push({
      source: 'PROJECT_ACTIVITY',
      key: activity.id,
      title: activity.title,
      estimateHours: activity.estimatedHours!,
      actualHours: activity.actualHours,
      accuracy: Math.round(accuracy * 100) / 100,
    })
  }

  if (jiraConnection?.id) {
    const jiraIssues = await prisma.jiraIssue.findMany({
      where: { connectionId: jiraConnection.id, originalEstimateSeconds: { not: null }, timeSpentSeconds: { not: null } },
      orderBy: { jiraUpdatedAt: 'desc' },
      take: 100,
    })
    for (const issue of jiraIssues) {
      const estimateHours = (issue.originalEstimateSeconds ?? 0) / 3600
      const actualHours = (issue.timeSpentSeconds ?? 0) / 3600
      if (estimateHours <= 0) continue
      estimateRows.push({
        source: 'JIRA',
        key: issue.jiraKey,
        title: issue.summary,
        estimateHours,
        actualHours,
        accuracy: Math.round((actualHours / estimateHours) * 100) / 100,
      })
    }
  }

  const delayReasonMap = new Map<string, { count: number; daysLost: number }>()
  for (const event of delayEvents) {
    const entry = delayReasonMap.get(event.reason) ?? { count: 0, daysLost: 0 }
    entry.count += 1
    entry.daysLost += event.daysLost
    delayReasonMap.set(event.reason, entry)
  }
  const topDelayReasons = [...delayReasonMap.entries()]
    .map(([reason, data]) => ({ reason: labelReason(reason), ...data }))
    .sort((a, b) => b.daysLost - a.daysLost)
    .slice(0, 5)

  const delayPhaseMap = new Map<string, { count: number; daysLost: number }>()
  for (const event of delayEvents) {
    const phase = event.phaseAtTime ?? 'Unknown phase'
    const entry = delayPhaseMap.get(phase) ?? { count: 0, daysLost: 0 }
    entry.count += 1
    entry.daysLost += event.daysLost
    delayPhaseMap.set(phase, entry)
  }
  const delayByPhase = [...delayPhaseMap.entries()]
    .map(([phase, data]) => ({ phase, ...data }))
    .sort((a, b) => b.daysLost - a.daysLost)
    .slice(0, 5)

  const ownerMap = new Map<string, number>()
  for (const event of delayEvents) {
    ownerMap.set(event.owner, (ownerMap.get(event.owner) ?? 0) + event.daysLost)
  }
  const delayByOwner = [...ownerMap.entries()].map(([owner, daysLost]) => ({ owner, daysLost })).sort((a, b) => b.daysLost - a.daysLost)

  return {
    project,
    activityCount: activities.length,
    unassignedActivities,
    approvalWaitingCount,
    approvalWaitingDays,
    delayedActivityCount,
    totalSlipDays,
    openRiskCount: raidItems.filter((item) => item.type === 'RISK').length,
    highRiskCount,
    overdueClientDependencies,
    pendingChangeRequests: changeRequests.length,
    topDelayReasons,
    delayByPhase,
    delayByOwner,
    estimateRows: estimateRows.slice(0, 50),
    activitiesWithoutEstimate,
  }
}

export function buildGroundedResponse(intent: AiAssistantIntent, facts: AssistantFacts): string {
  switch (intent) {
    case 'EXECUTIVE_SUMMARY':
      return buildExecutiveSummary(facts)
    case 'RISK_DETECTION':
      return buildRiskDetection(facts)
    case 'DELAY_PATTERN':
      return buildDelayPattern(facts)
    case 'ESTIMATE_SUGGESTION':
      return buildEstimateSuggestion(facts)
    default:
      throw new Error(`Unhandled intent: ${intent}`)
  }
}

function buildExecutiveSummary(facts: AssistantFacts): string {
  const p = facts.project
  const items = [
    `- ${p.name} is ${p.ragStatus} at ${round(p.percentComplete)}% complete vs ${round(p.percentPlanned)}% planned (confidence ${p.confidence}).`,
    `- ${facts.delayedActivityCount} activity/activities are delayed with a total of ${facts.totalSlipDays} slip day(s); ${facts.approvalWaitingCount} item(s) await client approval.`,
    `- ${facts.openRiskCount} open risk(s) including ${facts.highRiskCount} high-score risk(s); ${facts.overdueClientDependencies} overdue client dependency/dependencies.`,
    `- ${facts.pendingChangeRequests} pending change request(s) and ${facts.unassignedActivities} unassigned active activity/activities require attention.`,
    `- Jira ${p.jiraLinked ? 'is linked' : 'is not linked'}; estimate learning draws from ${facts.estimateRows.length} historical estimate/estimates.`,
  ]
  return enforceAssistantCaps(items)
}

function buildRiskDetection(facts: AssistantFacts): string {
  const items = [
    `- ${facts.unassignedActivities} active activity/activities have no assignee, which is a schedule risk if they are on the critical path.`,
    `- ${facts.highRiskCount} open risk(s) score 15+ and ${facts.overdueClientDependencies} client dependency/dependencies are past their needed-by date.`,
    `- ${facts.approvalWaitingCount} deliverable(s) are awaiting client approval (${facts.approvalWaitingDays} total business day(s) waiting).`,
    `- Top delay driver: ${facts.topDelayReasons[0]?.reason ?? 'none recorded'} (${facts.topDelayReasons[0]?.daysLost ?? 0} days).`,
    `- Review pending change requests (${facts.pendingChangeRequests}) and unestimated activities (${facts.activitiesWithoutEstimate}) before committing to dates.`,
  ]
  return enforceAssistantCaps(items)
}

function buildDelayPattern(facts: AssistantFacts): string {
  const topPhase = facts.delayByPhase[0]
  const topOwner = facts.delayByOwner[0]
  const items = [
    `- Delay clusters in phase: ${topPhase?.phase ?? 'none recorded'} (${topPhase?.daysLost ?? 0} days lost across ${topPhase?.count ?? 0} event(s)).`,
    `- Largest delay owner is ${topOwner?.owner ?? 'unknown'} with ${topOwner?.daysLost ?? 0} day(s) lost.`,
    `- Top reason: ${facts.topDelayReasons[0]?.reason ?? 'none recorded'} (${facts.topDelayReasons[0]?.daysLost ?? 0} days).`,
    `- ${facts.approvalWaitingCount} approval clock event(s) account for ${facts.approvalWaitingDays} business day(s) of client-side waiting.`,
    `- Compare phase totals to baseline capacity: ${facts.delayByPhase.slice(0, 3).map((d) => `${d.phase} ${d.daysLost}d`).join(', ') || 'no data'}.`,
  ]
  return enforceAssistantCaps(items)
}

function buildEstimateSuggestion(facts: AssistantFacts): string {
  const median = medianAccuracy(facts.estimateRows)
  const suggestion = median > 0 ? `${median}x actual` : 'no historical data'
  const bias = median > 1.15 ? 'systematically under-estimated' : median < 0.85 ? 'over-estimated' : 'balanced'
  const items = [
    `- Historical estimate accuracy median is ${suggestion} (${bias}) across ${facts.estimateRows.length} item(s).`,
    `- ${facts.activitiesWithoutEstimate} activity/activities currently lack an estimate and should be seeded from similar completed work.`,
    `- Top under-estimate signal: review items with accuracy >1.15 before reusing their assumptions.`,
    `- Jira evidence ${facts.project.jiraLinked ? 'is available' : 'is not linked'}; include synced actuals when calibrating new estimates.`,
    `- Suggested buffer: apply ${median > 1.15 ? '1.2–1.4x' : median < 0.85 ? '0.9–1.0x' : '1.0x'} to uncertain tasks based on current bias.`,
  ]
  return enforceAssistantCaps(items)
}

function buildGroundedIn(intent: AiAssistantIntent, facts: AssistantFacts): string[] {
  const base = [
    `project:${facts.project.id}`,
    `activities:${facts.activityCount}`,
    `delays:${facts.delayByOwner.reduce((sum, row) => sum + row.daysLost, 0)}`,
  ]
  switch (intent) {
    case 'EXECUTIVE_SUMMARY':
      return [...base, `rag:${facts.project.ragStatus}`, `confidence:${facts.project.confidence}`]
    case 'RISK_DETECTION':
      return [...base, `highRisks:${facts.highRiskCount}`, `unassigned:${facts.unassignedActivities}`]
    case 'DELAY_PATTERN':
      return [...base, `topPhase:${facts.delayByPhase[0]?.phase ?? 'none'}`, `topOwner:${facts.delayByOwner[0]?.owner ?? 'none'}`]
    case 'ESTIMATE_SUGGESTION':
      return [...base, `estimateRows:${facts.estimateRows.length}`, `jiraLinked:${facts.project.jiraLinked}`]
    default:
      return base
  }
}

export function detectForbiddenContext(context: string): boolean {
  const lower = context.toLowerCase()
  // Exact phrases first.
  const forbiddenPhrases = [
    'write a requirement',
    'write requirements',
    'generate requirement',
    'generate spec',
    'generate a spec',
    'write a spec',
    'send to client',
    'send this to the client',
    'email client',
    'client email',
    'email to client',
    'auto send',
    'autosend',
  ]
  if (forbiddenPhrases.some((phrase) => lower.includes(phrase))) return true
  // Concept-level guard: requirement/spec generation, client send/email, auto-send.
  const hasRequirementWord = lower.includes('requirement') || lower.includes('spec') || lower.includes('specification')
  const hasGenerateWord = lower.includes('write') || lower.includes('generate') || lower.includes('create') || lower.includes('draft')
  if (hasRequirementWord && hasGenerateWord) return true
  const hasClientWord = lower.includes('client') || lower.includes('customer')
  const hasSendWord = lower.includes('send') || lower.includes('email') || lower.includes('mail') || lower.includes('deliver')
  if (hasClientWord && hasSendWord) return true
  const hasAutoWord = lower.includes('auto') || lower.includes('automatic')
  if (hasAutoWord && hasSendWord) return true
  return false
}

function labelReason(reason: string): string {
  return (SLIP_REASON_LABEL as Record<string, string>)[reason] ?? reason.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function medianAccuracy(rows: AssistantFacts['estimateRows']): number {
  const values = rows.map((row) => row.accuracy).filter((value) => Number.isFinite(value) && value > 0)
  if (values.length === 0) return 0
  values.sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  return values.length % 2 ? Math.round(values[mid] * 100) / 100 : Math.round(((values[mid - 1] + values[mid]) / 2) * 100) / 100
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
