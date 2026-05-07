/**
 * GET  /api/dtp/trip-types — list active trip-type registry.
 * POST /api/dtp/trip-types — admin-only create.
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden, apiConflict } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { readJson } from '@/lib/dtp/api-helpers'

export const GET = withAuth(async (_req, _ctx) => {
  const types = await prisma.dtpTripType.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] })
  return apiSuccess(types)
})

interface CreateBody {
  code: string
  label: string
  icon?: string
  color?: string
  defaultDwellMin?: number
  sortOrder?: number
}

export const POST = withAuth(async (req: NextRequest, { session }) => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') return apiForbidden('Admin only')
  const body = await readJson<CreateBody>(req)
  if (!body?.code || !body.label) return apiBadRequest('code and label are required')
  const existing = await prisma.dtpTripType.findUnique({ where: { code: body.code } })
  if (existing) return apiConflict('A trip type with that code already exists')
  const created = await prisma.dtpTripType.create({
    data: {
      code: body.code,
      label: body.label,
      icon: body.icon ?? null,
      color: body.color ?? null,
      defaultDwellMin: body.defaultDwellMin ?? 60,
      sortOrder: body.sortOrder ?? 0,
    },
  })
  return apiSuccess(created, { status: 201 })
})
