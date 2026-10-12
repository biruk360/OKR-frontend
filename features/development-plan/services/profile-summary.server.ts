/**
 * Development plan — profile summary (profile composition contract, PRF-2).
 * Server-only; import by direct path from `app/` or the profile loader.
 */
import { prisma } from '@/lib/prisma'
import { canViewPackageArea, loadPackageViewer } from '@/lib/package/access'
import type { DevelopmentProfileSummary } from '../types'
import { isDevelopmentError, loadDevelopmentRuleSettings, resolveDevelopmentTimeframe } from './development.server'
import { computeDevelopmentRule, isDevelopmentOverdue, isOpenStatus } from './rules'

/**
 * `{ itemsDone, itemsRequired, hoursLogged, hoursRequired, overdue }` (+ total,
 * open, rulesMet) for the subject's development plan in `timeframeId`, or
 * `null` when the viewer may not see the development area. An empty plan still
 * returns the rule targets (0 of 1, 0 of 40 h) — the card shows the gap.
 */
export async function getDevelopmentProfileSummary(
  viewerId: string,
  userId: string,
  timeframeId: string,
): Promise<DevelopmentProfileSummary | null> {
  const viewer = await loadPackageViewer(viewerId)
  if (!(await canViewPackageArea(viewer, userId, 'development'))) return null

  let resolvedTimeframeId: string
  try {
    resolvedTimeframeId = (await resolveDevelopmentTimeframe(timeframeId || null)).id
  } catch (error) {
    if (isDevelopmentError(error)) return null
    throw error
  }

  const [rows, settings] = await Promise.all([
    prisma.developmentItem.findMany({
      where: { ownerId: userId, timeframeId: resolvedTimeframeId },
      select: { kind: true, status: true, hoursLogged: true, dueDate: true },
    }),
    loadDevelopmentRuleSettings(),
  ])
  const rule = computeDevelopmentRule(rows, settings)
  const now = new Date()
  return {
    itemsDone: rule.itemsDone,
    itemsRequired: rule.itemsRequired,
    hoursLogged: rule.hoursLogged,
    hoursRequired: rule.hoursRequired,
    overdue: rows.filter((row) => isDevelopmentOverdue(row, now)).length,
    total: rows.length,
    open: rows.filter((row) => isOpenStatus(row.status)).length,
    rulesMet: rule.itemsMet && rule.hoursMet,
  }
}
