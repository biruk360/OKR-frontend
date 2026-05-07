/**
 * PATCH  /api/dtp/trip-types/:id — admin edits a trip type.
 * DELETE /api/dtp/trip-types/:id — soft-delete (sets isActive=false to preserve
 *   historical TripStop.purposeCode references).
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiForbidden, apiNotFound } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { readJson } from '@/lib/dtp/api-helpers'

export const PATCH = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') return apiForbidden('Admin only')
  const body = (await readJson<Record<string, unknown>>(req)) ?? {}
  const existing = await prisma.dtpTripType.findUnique({ where: { id: params.id } })
  if (!existing) return apiNotFound('Trip type not found')
  const data: Record<string, unknown> = {}
  for (const f of ['label', 'icon', 'color', 'defaultDwellMin', 'sortOrder', 'isActive'] as const) {
    if (f in body) data[f] = body[f]
  }
  const updated = await prisma.dtpTripType.update({ where: { id: params.id }, data })
  return apiSuccess(updated)
})

export const DELETE = withAuth<{ id: string }>(async (_req, { session, params }) => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') return apiForbidden('Admin only')
  const updated = await prisma.dtpTripType.update({ where: { id: params.id }, data: { isActive: false } })
  return apiSuccess(updated)
})
