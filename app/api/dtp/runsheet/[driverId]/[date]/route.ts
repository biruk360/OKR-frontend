/**
 * GET /api/dtp/runsheet/:driverId/:date — driver's Daily Run Sheet.
 * Visible to: the driver themselves (via Driver.userId), Pool Coordinator,
 * Travel Coordinator (any), Operations Manager, ADMIN/EXECUTIVE.
 */

import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { buildRunSheet } from '@/lib/dtp/sheets'
import { canReadAllDtp, isAnyTravelCoordinator, isPoolCoordinator } from '@/lib/dtp/permissions'
import { parsePathDate } from '@/lib/dtp/api-helpers'

export const GET = withAuth<{ driverId: string; date: string }>(async (_req, { session, params }) => {
  const date = parsePathDate(params.date)
  if (!date) return apiBadRequest('Invalid date — expected YYYY-MM-DD')

  const driver = await prisma.driver.findUnique({ where: { id: params.driverId } })
  if (!driver) return apiNotFound('Driver not found')

  const isOwnSheet = driver.userId === session.user.id
  const allowed =
    isOwnSheet ||
    (await canReadAllDtp(session)) ||
    (await isPoolCoordinator(session.user.id)) ||
    (await isAnyTravelCoordinator(session.user.id))
  if (!allowed) return apiForbidden('You do not have access to this run sheet')

  const sheet = await buildRunSheet(params.driverId, date)
  return apiSuccess(sheet)
})
