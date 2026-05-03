/**
 * Carryover-candidate detection + server-forced disposition rules.
 *
 * See docs/AI_SPRINT_PLANNING.md §3.5 for the full spec. The functions in this
 * file decide which incomplete todos from a prior sprint are eligible for
 * carryover and apply the rules that the AI is NOT allowed to override (KR
 * archived → DESCOPE, KR target met → DESCOPE, etc.).
 *
 * The AI fills in the disposition for any candidate where forcedDisposition is
 * null. The route handler then applies overrides at accept time.
 */

export type Disposition = 'KEEP' | 'SPLIT' | 'RESCHEDULE' | 'DESCOPE' | 'ESCALATE'

/** Reason codes for an audit trail / UI badges. Free-form strings for now. */
export type ForcedReason =
  | 'KR_INACTIVE'
  | 'KR_TARGET_MET'
  | 'ASSIGNEE_INACTIVE'
  | 'REPEAT_CARRYOVER'

export interface CarryoverTodoInput {
  id: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  carryoverCount: number
  dueDate: Date | null
  progressValue: number | null
  assignee: { id: string; isActive: boolean }
  keyResult: {
    id: string
    status: 'ACTIVE' | 'ARCHIVED' | 'DELETED'
    archivedAt: Date | null
    targetValue: number
    currentValue: number
  } | null
}

export interface CarryoverCandidate {
  todoId: string
  /** When set, the route MUST honor this regardless of AI judgment. */
  forcedDisposition: Disposition | null
  forcedReason: ForcedReason | null
  /** Disallowed dispositions for the AI. Computed even when forcedDisposition=null. */
  disallowed: Disposition[]
  /** True when dueDate is more than 14 days before sprintStart — UI annotates as slipped. */
  staleDueDate: boolean
}

const STALE_DUE_DATE_DAYS = 14
const ESCALATION_CARRYOVER_THRESHOLD = 2

/**
 * Filter incomplete todos from a prior sprint that are eligible for carryover.
 * Excludes COMPLETED and CANCELLED — only PENDING / IN_PROGRESS rows are returned.
 */
export function selectIncomplete(todos: CarryoverTodoInput[]): CarryoverTodoInput[] {
  return todos.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS')
}

/**
 * Apply the server-forced disposition rules from spec §3.5.3 to a single todo.
 * The AI receives the result and either fills in the disposition (when
 * forcedDisposition is null) or honors the forced one. Rules are evaluated in
 * priority order — first match wins, since a single todo can satisfy multiple
 * conditions (e.g. KR archived AND repeat-carryover; archived takes priority
 * because the work no longer matters).
 */
export function classifyCandidate(
  todo: CarryoverTodoInput,
  sprintStart: Date
): CarryoverCandidate {
  const disallowed: Disposition[] = []
  let forcedDisposition: Disposition | null = null
  let forcedReason: ForcedReason | null = null

  const kr = todo.keyResult
  if (!kr || kr.status !== 'ACTIVE' || kr.archivedAt !== null) {
    forcedDisposition = 'DESCOPE'
    forcedReason = 'KR_INACTIVE'
  } else if (kr.targetValue > 0 && kr.currentValue >= kr.targetValue) {
    forcedDisposition = 'DESCOPE'
    forcedReason = 'KR_TARGET_MET'
  } else if (!todo.assignee.isActive) {
    forcedDisposition = 'ESCALATE'
    forcedReason = 'ASSIGNEE_INACTIVE'
  }

  // Repeat-carryover gating: even when not forced, plain KEEP is disallowed.
  if (todo.carryoverCount >= ESCALATION_CARRYOVER_THRESHOLD) {
    disallowed.push('KEEP')
    if (!forcedDisposition) {
      // Don't auto-force ESCALATE here — the AI still chooses among SPLIT/DESCOPE/ESCALATE,
      // but it cannot pick KEEP. The repeat threshold biases the AI without overriding.
      forcedReason = 'REPEAT_CARRYOVER'
    }
  }

  const staleDueDate = isStaleDueDate(todo.dueDate, sprintStart)

  return {
    todoId: todo.id,
    forcedDisposition,
    forcedReason,
    disallowed,
    staleDueDate,
  }
}

/** Older than STALE_DUE_DATE_DAYS days before sprintStart counts as stale. */
export function isStaleDueDate(dueDate: Date | null, sprintStart: Date): boolean {
  if (!dueDate) return false
  const ms = sprintStart.getTime() - dueDate.getTime()
  return ms / (1000 * 60 * 60 * 24) > STALE_DUE_DATE_DAYS
}

/**
 * Sum carryover progressValue per KR for items the AI is expected to KEEP or SPLIT
 * (i.e. count toward this sprint). DESCOPE / RESCHEDULE / ESCALATE-but-rescheduled
 * items are excluded from the budget. ESCALATE that still runs in this sprint IS
 * counted because the work happens — escalation is about routing, not deferral.
 *
 * Use this BEFORE running the AI: pass the forced dispositions only. After the AI
 * has filled in the rest, recompute with the merged dispositions.
 */
export function carryoverDeltaByKr(
  candidates: Array<{
    candidate: CarryoverCandidate
    todo: CarryoverTodoInput
    aiDisposition?: Disposition
  }>
): Map<string, number> {
  const out = new Map<string, number>()
  for (const { candidate, todo, aiDisposition } of candidates) {
    if (!todo.keyResult) continue
    const final = candidate.forcedDisposition ?? aiDisposition
    if (!final) continue
    if (final === 'DESCOPE' || final === 'RESCHEDULE') continue
    const value = todo.progressValue ?? 0
    if (value <= 0) continue
    const prev = out.get(todo.keyResult.id) ?? 0
    out.set(todo.keyResult.id, prev + value)
  }
  return out
}

/**
 * Summary counts shaped for AiSprintPlan.carryoverSummary JSON column.
 */
export interface CarryoverSummary {
  total: number
  kept: number
  split: number
  rescheduled: number
  descoped: number
  escalated: number
  blockers: string[]
}

export function summarize(
  candidates: Array<{
    candidate: CarryoverCandidate
    aiDisposition?: Disposition
    blockerNote?: string | null
  }>
): CarryoverSummary {
  const summary: CarryoverSummary = {
    total: candidates.length,
    kept: 0,
    split: 0,
    rescheduled: 0,
    descoped: 0,
    escalated: 0,
    blockers: [],
  }
  for (const { candidate, aiDisposition, blockerNote } of candidates) {
    const d = candidate.forcedDisposition ?? aiDisposition
    if (d === 'KEEP') summary.kept += 1
    else if (d === 'SPLIT') summary.split += 1
    else if (d === 'RESCHEDULE') summary.rescheduled += 1
    else if (d === 'DESCOPE') summary.descoped += 1
    else if (d === 'ESCALATE') summary.escalated += 1
    if (blockerNote) summary.blockers.push(blockerNote)
  }
  return summary
}
