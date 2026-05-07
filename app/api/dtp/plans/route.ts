/**
 * GET  /api/dtp/plans — list plans the caller is allowed to see (filterable).
 * POST /api/dtp/plans — create or open the caller's plan for a given trip date.
 *
 * AC-01 (single plan per day): if a plan already exists for the (requester,
 * tripDate) pair, POST returns the existing one with status 200 instead of
 * creating a duplicate. Clients then route the user into edit mode.
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiPaginated } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { canReadAllDtp, isAnyTravelCoordinator, isPoolCoordinator } from '@/lib/dtp/permissions'
import { recordDtpEvent } from '@/lib/dtp/audit'
import { readJson } from '@/lib/dtp/api-helpers'

export const GET = withAuth(async (req, { session }) => {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const dept = url.searchParams.get('department')
  const date = url.searchParams.get('date') // YYYY-MM-DD
  const requester = url.searchParams.get('requester')
  const flag = url.searchParams.get('flag') // late | emergency
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '50')))

  const where: Record<string, unknown> = { deletedAt: null }
  if (status) where.status = { in: status.split(',') }
  if (dept) where.departmentId = dept
  if (requester) where.requesterId = requester
  if (flag === 'late') where.late = true
  if (flag === 'emergency') where.emergency = true
  if (date) {
    const d = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return apiBadRequest('Invalid date')
    const next = new Date(d.getTime() + 86_400_000)
    where.tripDate = { gte: d, lt: next }
  }

  // Visibility scoping unless the caller can read all.
  const canAll = await canReadAllDtp(session)
  if (!canAll) {
    const isCoord = await isAnyTravelCoordinator(session.user.id)
    const isPool = await isPoolCoordinator(session.user.id)
    if (!isCoord && !isPool) {
      where.requesterId = session.user.id
    }
    // Coordinators / pool coordinators see all departments for now; per-dept
    // scoping is the responsibility of the UI's filter chips.
  }

  const [rows, total] = await Promise.all([
    prisma.dailyTripPlan.findMany({
      where,
      include: {
        requester: { select: { id: true, name: true, email: true } },
        stops: { select: { id: true, seq: true, plannedStart: true, dwellMinutes: true, destinationName: true, tripMode: true, requiresVehicle: true } },
        _count: { select: { legs: true, events: true } },
      },
      orderBy: [{ tripDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.dailyTripPlan.count({ where }),
  ])

  return apiPaginated(rows, { page, limit, total })
})

interface CreateBody {
  tripDate?: string // YYYY-MM-DD
  departmentId?: string | null
  priority?: 'NORMAL' | 'URGENT'
  defaultModeOfMovement?: string
}

export const POST = withAuth(async (req: NextRequest, { session }) => {
  const body = (await readJson<CreateBody>(req)) ?? {}
  if (!body.tripDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.tripDate)) {
    return apiBadRequest('tripDate (YYYY-MM-DD) is required')
  }
  const tripDate = new Date(`${body.tripDate}T00:00:00Z`)

  // Resolve department: explicit value > primary membership > null.
  let departmentId = body.departmentId ?? null
  if (!departmentId) {
    const m = await prisma.departmentMembership.findFirst({
      where: { userId: session.user.id, endedAt: null, isPrimary: true },
      select: { departmentId: true },
    })
    departmentId = m?.departmentId ?? null
  }

  const existing = await prisma.dailyTripPlan.findFirst({
    where: { requesterId: session.user.id, tripDate, deletedAt: null },
  })
  if (existing) {
    return apiSuccess(existing, { message: 'Existing plan returned' })
  }

  const created = await prisma.dailyTripPlan.create({
    data: {
      requesterId: session.user.id,
      tripDate,
      departmentId,
      priority: body.priority === 'URGENT' ? 'URGENT' : 'NORMAL',
      defaultModeOfMovement: body.defaultModeOfMovement ?? 'COMPANY_VEHICLE',
      status: 'DRAFT',
    },
  })
  await recordDtpEvent({
    planId: created.id,
    actorId: session.user.id,
    action: 'EDIT',
    toStatus: 'DRAFT',
    payload: { event: 'created' },
  })
  return apiSuccess(created, { status: 201 })
})
