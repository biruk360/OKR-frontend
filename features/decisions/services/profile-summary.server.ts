/**
 * Decisions: profile summary (profile composition contract, PRF-2 / PRF-17).
 * Server-only; import it by direct path from `app/` or the profile loader.
 */
import { canViewPackageArea, loadPackageViewer } from '@/lib/package/access'
import type { DecisionsProfileSummary } from '../types'
import { DECISION_LIST_LIMIT_MAX } from './schemas'
import { listDecisions } from './decisions.server'
import { summarizeDecisions } from './rules'

/**
 * `{ openAffecting, awaitingMyDecision, awaitingOverdue, affectingOverdue }` for
 * the subject, counting only decisions the viewer may see. Open decisions
 * count whatever their timeframe (an undecided request from last quarter still
 * blocks), so `timeframeId` is accepted for the contract but not used to filter.
 * Returns `null` when the viewer may not see the subject's decisions area.
 */
export async function getDecisionsProfileSummary(
  viewerId: string,
  userId: string,
  _timeframeId: string,
): Promise<DecisionsProfileSummary | null> {
  const viewer = await loadPackageViewer(viewerId)
  if (!(await canViewPackageArea(viewer, userId, 'decisions'))) return null

  const [affecting, awaiting] = await Promise.all([
    listDecisions(viewer, {
      affectingUserId: userId,
      status: ['OPEN'],
      openAnyTimeframe: false,
      limit: DECISION_LIST_LIMIT_MAX,
    }),
    listDecisions(viewer, {
      deciderId: userId,
      status: ['OPEN'],
      openAnyTimeframe: false,
      limit: DECISION_LIST_LIMIT_MAX,
    }),
  ])
  const summary = summarizeDecisions(affecting.items, awaiting.items)
  // `items` is capped; totals come from the uncapped counts.
  return { ...summary, openAffecting: affecting.total, awaitingMyDecision: awaiting.total }
}
