import { prisma } from '@/lib/prisma'
import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { canReadCycles, isPerformanceAdmin } from '@/lib/performance'

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canReadCycles(actor)) return apiForbidden('You do not have access to review cycles')
  const admin = await isPerformanceAdmin(actor)
  if (!admin) {
    const accessible = await prisma.evaluation.findFirst({
      where: {
        cycleId: id,
        OR: [{ employeeId: session.user.id }, { assignments: { some: { evaluatorId: session.user.id } } }],
      },
      select: { id: true },
    })
    if (!accessible) return apiForbidden('You do not have access to this review cycle')
  }
  const cycle = await prisma.reviewCycle.findUnique({
    where: { id },
    include: {
      departments: { include: { department: { select: { id: true, name: true } } } },
      issues: {
        where: admin ? undefined : { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      },
      evaluations: {
        where: admin
          ? undefined
          : { OR: [{ employeeId: session.user.id }, { assignments: { some: { evaluatorId: session.user.id } } }] },
        include: {
          employee: { select: { id: true, name: true, designation: true } },
          template: { include: { family: { select: { name: true } } } },
          assignments: { include: { evaluator: { select: { id: true, name: true } } } },
        },
        orderBy: { employee: { name: 'asc' } },
      },
    },
  })
  if (!cycle) return apiNotFound('Review cycle not found')
  return apiSuccess(cycle)
})
