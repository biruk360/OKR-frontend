import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { canCreateCycles, canReadCycles, hasPerformancePermission, isPerformanceAdmin } from '@/lib/performance'

const VALID_CADENCES = ['MONTHLY', 'EVERY_TWO_MONTHS', 'QUARTERLY']

export const GET = withAuth(async (_request, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canReadCycles(actor)) return apiForbidden('You do not have access to review cycles')
  const admin = await isPerformanceAdmin(actor)
  const cycles = await prisma.reviewCycle.findMany({
    where: admin
      ? undefined
      : {
          evaluations: {
            some: {
              OR: [
                { employeeId: session.user.id },
                { assignments: { some: { evaluatorId: session.user.id } } },
              ],
            },
          },
        },
    include: {
      departments: { include: { department: { select: { id: true, name: true } } } },
      _count: { select: { evaluations: true, issues: true } },
    },
    orderBy: { periodStart: 'desc' },
  })
  return apiSuccess(cycles)
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canCreateCycles(actor)) return apiForbidden('You do not have permission to create review cycles')
  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const cadence = typeof body.cadence === 'string' ? body.cadence : ''
  const start = new Date(body.periodStart)
  const end = new Date(body.periodEnd)
  const departmentIds: string[] = Array.isArray(body.departmentIds)
    ? body.departmentIds.filter((id: unknown): id is string => typeof id === 'string')
    : []
  const allCompany = body.allCompany !== false

  if (!name) return apiBadRequest('Cycle name is required')
  if (!VALID_CADENCES.includes(cadence)) return apiBadRequest('Cadence must be MONTHLY, EVERY_TWO_MONTHS, or QUARTERLY')
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return apiBadRequest('periodEnd must be after periodStart')
  }
  if (!allCompany && departmentIds.length === 0) return apiBadRequest('Select at least one department for a scoped cycle')
  if (!allCompany && !await hasPerformancePermission(actor, 'review_cycle_department', 'create')) {
    return apiForbidden('You do not have permission to create department-scoped review cycles')
  }

  const cycle = await prisma.reviewCycle.create({
    data: {
      name,
      cadence,
      periodStart: start,
      periodEnd: end,
      allCompany,
      createdById: session.user.id,
      departments: allCompany
        ? undefined
        : { createMany: { data: departmentIds.map((departmentId: string) => ({ departmentId })), skipDuplicates: true } },
    },
    include: { departments: { include: { department: true } } },
  })
  return apiSuccess(cycle, { status: 201 })
})
