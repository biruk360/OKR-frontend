/**
 * Decisions (DEC-1…4): pure rules. Client-safe and unit-tested
 * (rules.test.ts). The server service and the components both use them.
 */
import { decisionOverdue } from '@/lib/connections/flags'
import type { DecisionStatus } from '@/types/package'
import type { DecisionBatchGroup, DecisionDTO, DecisionsProfileSummary } from '../types'

export { decisionOverdue }

/** DEC-1: OPEN and neededBy before the start of today. */
export function isDecisionOverdue(
  decision: { status: string; neededBy: Date | string | null },
  now: Date = new Date(),
): boolean {
  return decisionOverdue(decision, now)
}

function time(value: string | Date | null | undefined): number | null {
  if (!value) return null
  const t = (value instanceof Date ? value : new Date(value)).getTime()
  return Number.isNaN(t) ? null : t
}

/** Natural compare for workbook refs, so D9 sorts before D46. Nulls last. */
export function compareRefs(a: string | null | undefined, b: string | null | undefined): number {
  if (a && !b) return -1
  if (!a && b) return 1
  if (!a || !b) return 0
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

type Sortable = { neededBy: string | Date | null; externalRef?: string | null; title: string }

/** DEC-1 order: neededBy ascending (undated last), then workbook ref, then title. */
export function compareByNeededBy(a: Sortable, b: Sortable): number {
  const ta = time(a.neededBy)
  const tb = time(b.neededBy)
  if (ta !== null && tb !== null && ta !== tb) return ta - tb
  if (ta !== null && tb === null) return -1
  if (ta === null && tb !== null) return 1
  return compareRefs(a.externalRef, b.externalRef) || a.title.localeCompare(b.title)
}

export function sortByNeededBy<T extends Sortable>(items: readonly T[]): T[] {
  return [...items].sort(compareByNeededBy)
}

/**
 * DEC-1: group the decider's queue by batch. Items inside a batch are sorted
 * by neededBy; batches are ordered by their earliest neededBy (undated batches
 * after dated ones, by label), and "No batch" comes last.
 */
export function groupDecisionsByBatch<T extends Sortable & Pick<DecisionDTO, 'batch' | 'overdue'>>(
  items: readonly T[],
): DecisionBatchGroup<T>[] {
  const groups = new Map<string, T[]>()
  const NONE = '\u0000none'
  for (const item of items) {
    const key = item.batch?.trim() ? item.batch.trim() : NONE
    const list = groups.get(key)
    if (list) list.push(item)
    else groups.set(key, [item])
  }
  const result = Array.from(groups.entries()).map(([key, list]) => {
    const sorted = sortByNeededBy(list)
    const earliest = sorted.map((i) => time(i.neededBy)).find((t): t is number => t !== null) ?? null
    return {
      group: {
        batch: key === NONE ? null : key,
        items: sorted,
        overdueCount: sorted.filter((i) => i.overdue).length,
      } satisfies DecisionBatchGroup<T>,
      earliest,
    }
  })
  result.sort((a, b) => {
    if (a.group.batch === null && b.group.batch !== null) return 1
    if (a.group.batch !== null && b.group.batch === null) return -1
    if (a.earliest !== null && b.earliest !== null && a.earliest !== b.earliest) return a.earliest - b.earliest
    if (a.earliest !== null && b.earliest === null) return -1
    if (a.earliest === null && b.earliest !== null) return 1
    return compareRefs(a.group.batch, b.group.batch)
  })
  return result.map((r) => r.group)
}

// ---------------------------------------------------------------------------
// Status transitions (PATCH; DECIDED goes through POST …/decide)
// ---------------------------------------------------------------------------

export interface StatusChangeActor {
  /** Decider, Executive or Admin (DEC-4). */
  canDecide: boolean
  isRequester: boolean
}

export type StatusChangePlan =
  | { ok: true; clearDecision: boolean }
  | { ok: false; status: 400 | 403 | 409; code: string; message: string }

/**
 * Who may move a decision between statuses:
 *   - → DECIDED: never here (POST /api/decisions/[id]/decide, DEC-2).
 *   - OPEN ⇄ DEFERRED, and reopening a DECIDED one: decider / Executive / Admin.
 *   - → WITHDRAWN, and WITHDRAWN → OPEN: also the requester (it is their request,
 *     not a decision), but only while nothing has been decided.
 * Leaving DECIDED clears decisionText / decidedAt / decidedById (the activity
 * log keeps the old values).
 */
export function planStatusChange(from: DecisionStatus, to: DecisionStatus, actor: StatusChangeActor): StatusChangePlan {
  if (from === to) return { ok: true, clearDecision: false }
  if (to === 'DECIDED') {
    return {
      ok: false,
      status: 400,
      code: 'USE_DECIDE',
      message: 'Record a decision with “Record decision”, which requires the decision text.',
    }
  }
  if (from === 'DECIDED') {
    if (!actor.canDecide) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Only the decider, an Executive or an Admin can change a decision.' }
    }
    return { ok: true, clearDecision: true }
  }
  const requesterMove = (to === 'WITHDRAWN' || (from === 'WITHDRAWN' && to === 'OPEN')) && actor.isRequester
  if (actor.canDecide || requesterMove) return { ok: true, clearDecision: false }
  return {
    ok: false,
    status: 403,
    code: 'FORBIDDEN',
    message:
      to === 'WITHDRAWN'
        ? 'Only the requester, the decider, an Executive or an Admin can withdraw this request.'
        : 'Only the decider, an Executive or an Admin can change the status.',
  }
}

/** Whether the viewer may withdraw (shown as a menu action). */
export function canWithdrawDecision(status: DecisionStatus, actor: StatusChangeActor): boolean {
  if (status === 'WITHDRAWN') return false
  if (status === 'DECIDED') return actor.canDecide
  return actor.canDecide || actor.isRequester
}

// ---------------------------------------------------------------------------
// Profile summary
// ---------------------------------------------------------------------------

type SummaryRow = Pick<DecisionDTO, 'id' | 'status' | 'deciderId' | 'overdue'>

/** Profile summary counts from the subject's "affecting" list and their decider queue. */
export function summarizeDecisions(affecting: readonly SummaryRow[], awaiting: readonly SummaryRow[]): DecisionsProfileSummary {
  const openAffecting = affecting.filter((d) => d.status === 'OPEN')
  const openAwaiting = awaiting.filter((d) => d.status === 'OPEN')
  return {
    openAffecting: openAffecting.length,
    affectingOverdue: openAffecting.filter((d) => d.overdue).length,
    awaitingMyDecision: openAwaiting.length,
    awaitingOverdue: openAwaiting.filter((d) => d.overdue).length,
  }
}

/** `TYPE:id` key for link maps. */
export function linkKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`
}

/** Short label for a person-free request ("Meklit (structure)") or the requester's name. */
export function requesterLabel(decision: Pick<DecisionDTO, 'requestedBy' | 'requestedByText'>): string | null {
  return decision.requestedBy?.name ?? decision.requestedByText ?? null
}
