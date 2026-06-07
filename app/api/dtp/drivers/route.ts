/**
 * GET  /api/dtp/drivers — list active drivers.
 * POST /api/dtp/drivers — admin-only create.
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { readJson } from '@/lib/dtp/api-helpers'
import { filterArrayByPermLevel } from '@/lib/field-filter'

export const GET = withAuth(async (_req, { session }) => {
  const drivers = await prisma.driver.findMany({
    where: { isActive: true },
    orderBy: { fullName: 'asc' },
    include: { defaultVehicle: { select: { id: true, plate: true } }, user: { select: { id: true, name: true, email: true } } },
  })
  const filtered = await filterArrayByPermLevel(drivers, 'driver', session.user.id)
  return apiSuccess(filtered)
})

interface Body {
  fullName: string
  phone?: string
  license?: string
  photoUrl?: string
  userId?: string
  defaultVehicleId?: string
  workStart?: string
  workEnd?: string
}

export const POST = withAuth(async (req: NextRequest, { session }) => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') return apiForbidden('Admin only')
  const body = await readJson<Body>(req)
  if (!body?.fullName?.trim()) return apiBadRequest('fullName is required')
  const created = await prisma.driver.create({
    data: {
      fullName: body.fullName.trim(),
      phone: body.phone ?? null,
      license: body.license ?? null,
      photoUrl: body.photoUrl ?? null,
      userId: body.userId ?? null,
      defaultVehicleId: body.defaultVehicleId ?? null,
      workStart: body.workStart ?? null,
      workEnd: body.workEnd ?? null,
    },
  })
  return apiSuccess(created, { status: 201 })
})
