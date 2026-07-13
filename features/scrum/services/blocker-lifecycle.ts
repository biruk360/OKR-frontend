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
  sameBlockerConfirmed?: boolean
}

export interface BlockerDecision {
  hasBlocker: boolean
  status: BlockerStatus | null
  daysOpen: number
  firstRaisedAt: Date | null
  similarity: number
  shouldAskSameBlocker: boolean
}

export function decideBlockerLifecycle(input: BlockerDecisionInput): BlockerDecision {
  if (!input.text?.trim()) {
    return { hasBlocker: false, status: null, daysOpen: 0, firstRaisedAt: null, similarity: 0, shouldAskSameBlocker: false }
  }

  const similarity = blockerSimilarity(input.previousText ?? '', input.text)
  const sameCategory = !!input.category && input.category === input.previousCategory
  const likelySame = sameCategory && similarity >= 0.8
  const confirmed = input.sameBlockerConfirmed || likelySame
  const firstRaisedAt = confirmed && input.previousFirstRaisedAt ? input.previousFirstRaisedAt : input.now
  const daysOpen = Math.max(1, scrumBusinessDaysBetween(firstRaisedAt, input.now, input.settings))
  const recurringThreshold = input.settings.recurringThresholdDays ?? 2
  const escalationThreshold = input.settings.escalationThresholdDays ?? 3
  let status: BlockerStatus = 'OPEN'
  if (daysOpen >= escalationThreshold) status = 'ESCALATED'
  else if (daysOpen >= recurringThreshold) status = 'RECURRING'

  // Once escalated, a blocker stays escalated until it is resolved (status here is
  // freshly computed and can only be OPEN/RECURRING/ESCALATED).
  if (input.previousStatus === 'ESCALATED') status = 'ESCALATED'

  return {
    hasBlocker: true,
    status,
    daysOpen,
    firstRaisedAt,
    similarity,
    shouldAskSameBlocker: sameCategory && similarity >= 0.65 && similarity < 0.8,
  }
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
