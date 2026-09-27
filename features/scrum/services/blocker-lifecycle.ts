import { scrumBusinessDaysBetween } from './working-days'
import type { ScrumWorkingDaySettings } from './working-days'

export type BlockerStatus = 'OPEN' | 'RECURRING' | 'ESCALATED' | 'RESOLVED'

export interface BlockerDecisionInput {
  previousText?: string | null
  previousCategory?: string | null
  previousStatus?: string | null
  previousFirstRaisedAt?: Date | null
  text?: string | null
  category?: string | null
  now: Date
  settings: ScrumWorkingDaySettings & {
    recurringThresholdDays?: number | null
    escalationThresholdDays?: number | null
  }
  /**
   * The submitter's answer to "Is this the same blocker as yesterday?".
   * `true` = same blocker (keeps first-raised date), `false` = a new blocker
   * (restarts the clock), `undefined` = not asked → auto-match on ≥0.8 similarity.
   */
  sameBlockerConfirmed?: boolean
}

export interface BlockerDecision {
  hasBlocker: boolean
  status: BlockerStatus | null
  daysOpen: number
  firstRaisedAt: Date | null
  similarity: number
  shouldAskSameBlocker: boolean
  /** True when this blocker continues the previous working day's open blocker (same lifecycle chain). */
  continuesPrevious: boolean
}

export function decideBlockerLifecycle(input: BlockerDecisionInput): BlockerDecision {
  if (!input.text?.trim()) {
    return { hasBlocker: false, status: null, daysOpen: 0, firstRaisedAt: null, similarity: 0, shouldAskSameBlocker: false, continuesPrevious: false }
  }

  const similarity = blockerSimilarity(input.previousText ?? '', input.text)
  const sameCategory = !!input.category && input.category === input.previousCategory
  const likelySame = sameCategory && similarity >= 0.8
  // A resolved blocker never carries its clock into a new one.
  const previousOpen = !!input.previousText?.trim() && input.previousStatus !== 'RESOLVED'
  const confirmed = previousOpen && (input.sameBlockerConfirmed ?? likelySame)
  const firstRaisedAt = confirmed && input.previousFirstRaisedAt ? input.previousFirstRaisedAt : input.now
  const daysOpen = Math.max(1, scrumBusinessDaysBetween(firstRaisedAt, input.now, input.settings))
  const recurringThreshold = input.settings.recurringThresholdDays ?? 2
  const escalationThreshold = input.settings.escalationThresholdDays ?? 3
  let status: BlockerStatus = 'OPEN'
  if (daysOpen >= escalationThreshold) status = 'ESCALATED'
  else if (daysOpen >= recurringThreshold) status = 'RECURRING'

  // Once escalated, a blocker stays escalated until it is resolved (status here is
  // freshly computed and can only be OPEN/RECURRING/ESCALATED).
  if (confirmed && input.previousStatus === 'ESCALATED') status = 'ESCALATED'

  return {
    hasBlocker: true,
    status,
    daysOpen,
    firstRaisedAt,
    similarity,
    shouldAskSameBlocker: sameCategory && similarity >= 0.65 && similarity < 0.8,
    continuesPrevious: confirmed,
  }
}

/** Escalation facts that belong to a blocker's lifecycle chain, not to a single day's row. */
export interface BlockerEscalationState {
  escalatedAt: Date | null
  escalatedToUserId: string | null
  raidItemId: string | null
}

export const CLEARED_BLOCKER_ESCALATION: BlockerEscalationState = { escalatedAt: null, escalatedToUserId: null, raidItemId: null }

/**
 * Which escalation columns a (re-)submitted update should carry, so a blocker is
 * escalated at most once per lifecycle (RAID issue, DelayEvent, notifications).
 *
 * - The same blocker as the previous working day inherits that row's escalation.
 * - A same-day re-save keeps today's escalation, unless the submitter now says a
 *   carried-over blocker is a *new* one (then the new blocker may escalate again).
 * - A new blocker (resolved then reopened, or "not the same blocker") starts clean.
 *
 * Returns `null` when the stored columns should be left untouched.
 */
export function carryBlockerEscalation(input: {
  hasBlocker: boolean
  continuesPrevious: boolean
  previous?: BlockerEscalationState | null
  existingSameDay?: (BlockerEscalationState & { chainStartedBeforeToday: boolean }) | null
}): BlockerEscalationState | null {
  if (!input.hasBlocker) return null
  const existing = input.existingSameDay
  if (existing?.escalatedAt) {
    if (!input.continuesPrevious && existing.chainStartedBeforeToday) return { ...CLEARED_BLOCKER_ESCALATION }
    return null
  }
  if (input.continuesPrevious && input.previous?.escalatedAt) {
    return {
      escalatedAt: input.previous.escalatedAt,
      escalatedToUserId: input.previous.escalatedToUserId ?? null,
      raidItemId: input.previous.raidItemId ?? null,
    }
  }
  if (existing && (existing.raidItemId || existing.escalatedToUserId)) return { ...CLEARED_BLOCKER_ESCALATION }
  return null
}

/**
 * Finalize-cron decision for one candidate blocker: escalate (side-effects run),
 * inherit an escalation already done earlier in the same chain (no side-effects),
 * or skip because this row is already escalated (same-day re-run).
 */
export function decideAutoEscalation(input: {
  rowEscalatedAt: Date | null
  chainEscalation: BlockerEscalationState | null
}): 'skip' | 'inherit' | 'escalate' {
  if (input.rowEscalatedAt) return 'skip'
  if (input.chainEscalation?.escalatedAt) return 'inherit'
  return 'escalate'
}

/** Similarity at/above which the submit form asks "Is this the same blocker as yesterday?". */
export const SAME_BLOCKER_PROMPT_SIMILARITY = 0.65

/**
 * Client-side gate for the same-blocker confirm prompt (spec S5.1): the previous
 * working day has an unresolved blocker in the same category whose text is
 * similar to what is being submitted now.
 */
export function shouldPromptSameBlocker(input: {
  previousText?: string | null
  previousCategory?: string | null
  text?: string | null
  category?: string | null
}): boolean {
  if (!input.previousText?.trim() || !input.text?.trim()) return false
  if (!input.category || input.category !== input.previousCategory) return false
  return blockerSimilarity(input.previousText, input.text) >= SAME_BLOCKER_PROMPT_SIMILARITY
}

/**
 * SCRUM_BLOCKER_RECURRING fires once, on the save that first moves a blocker
 * into RECURRING — not again on same-day re-saves or on later days.
 */
export function shouldNotifyRecurringBlocker(input: {
  status: BlockerStatus | null
  previousDayStatus?: string | null
  existingSameDayStatus?: string | null
}): boolean {
  if (input.status !== 'RECURRING') return false
  const alreadyFlagged = (value?: string | null) => value === 'RECURRING' || value === 'ESCALATED'
  return !alreadyFlagged(input.previousDayStatus) && !alreadyFlagged(input.existingSameDayStatus)
}

export function blockerSimilarity(a: string, b: string): number {
  const aTokens = tokenize(a)
  const bTokens = tokenize(b)
  if (aTokens.size === 0 || bTokens.size === 0) return 0
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length
  const union = new Set([...aTokens, ...bTokens]).size
  return intersection / union
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2),
  )
}
