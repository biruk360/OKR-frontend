// Server-only: imports Prisma. Do not import from client components, and do
// not re-export from the feature barrel (features/daily-trip-plan/index.ts),
// which client components import. (The `server-only` package is not installed;
// this comment is the marker.)
/**
 * Data loaders for the server-rendered Travel pages under app/dashboard/travel/**.
 * Moved verbatim from the pages (CLAUDE.md: routes are thin composition). The
 * API still enforces authorization; these flags only decide which UI renders.
 */

import { prisma } from '@/lib/prisma'
import type { Session } from 'next-auth'
import { canActAsCoordinator } from '@/lib/dtp/permissions'

/** /dashboard/travel/runsheet/:driverId/:date — is the viewer the assigned driver? */
export async function loadRunSheetDriverMode(driverId: string, viewerId: string): Promise<boolean> {
  const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { userId: true } })
  return driver?.userId === viewerId
}

/**
 * /dashboard/travel/plans/:id — the plan plus the viewer's relation to it.
 * `null` when the plan does not exist.
 */
export async function loadPlanDetailPage(planId: string, session: Pick<Session, 'user'>) {
  const plan = await prisma.dailyTripPlan.findUnique({ where: { id: planId } })
  if (!plan) return null

  const isRequester = plan.requesterId === session.user.id
  const isCoord = await canActAsCoordinator(session, plan.departmentId)
  return { plan, isRequester, isCoord }
}
