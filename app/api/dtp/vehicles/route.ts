/**
 * GET  /api/dtp/vehicles — list active vehicles.
 * POST /api/dtp/vehicles — admin-only create.
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiConflict, apiForbidden } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { readJson } from '@/lib/dtp/api-helpers'

export const GET = withAuth(async (_req, _ctx) => {
  const vehicles = await prisma.vehicle.findMany({
    where: { isActive: true },
    orderBy: { plate: 'asc' },
    include: { defaultDriver: { select: { id: true, fullName: true } } },
  })
  return apiSuccess(vehicles)
})

interface Body {
  plate: string
  model?: string
  capacity?: number
  defaultDriverId?: string
  notes?: string
}

export const POST = withAuth(async (req: NextRequest, { session }) => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') return apiForbidden('Admin only')
  const body = await readJson<Body>(req)
  if (!body?.plate?.trim()) return apiBadRequest('plate is required')
  const existing = await prisma.vehicle.findUnique({ where: { plate: body.plate.trim() } })
  if (existing) return apiConflict('A vehicle with that plate already exists')
  const created = await prisma.vehicle.create({
    data: {
      plate: body.plate.trim(),
      model: body.model ?? null,
      capacity: body.capacity ?? 4,
      defaultDriverId: body.defaultDriverId ?? null,
      notes: body.notes ?? null,
    },
  })
  return apiSuccess(created, { status: 201 })
})
