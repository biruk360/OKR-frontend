import { prisma } from '@/lib/prisma'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { canListEvaluations, isPerformanceAdmin } from '@/lib/performance'

export const GET = withAuth(async (_request, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canListEvaluations(actor)) return apiForbidden('You do not have access to evaluations')
  const admin = await isPerformanceAdmin(actor)
  const evaluations = await prisma.evaluation.findMany({
    where: admin
      ? undefined
      : {
          OR: [
            { employeeId: session.user.id },
            { assignments: { some: { evaluatorId: session.user.id } } },
          ],
        },
    include: {
      employee: { select: { id: true, name: true, designation: true, avatar: true } },
      cycle: { select: { id: true, name: true, status: true, periodStart: true, periodEnd: true } },
      template: { include: { family: { select: { name: true, roleLabel: true } } } },
      assignments: {
        where: admin ? undefined : { evaluatorId: session.user.id },
        select: { evaluatorId: true, role: true, status: true, submittedAt: true },
      },
    },
    orderBy: [{ cycle: { periodStart: 'desc' } }, { employee: { name: 'asc' } }],
  })

  const payload = evaluations.map((evaluation) => {
    const isEmployee = evaluation.employeeId === session.user.id && !admin
    const scoreVisible = !isEmployee || ['DRAFT_SHARED', 'FINALIZED'].includes(evaluation.status)
    return {
      id: evaluation.id,
      status: evaluation.status,
      employee: evaluation.employee,
      cycle: evaluation.cycle,
      template: evaluation.template.family,
      assignment: evaluation.assignments[0] ?? null,
      ...(scoreVisible
        ? {
            normalized: evaluation.normalized,
            gatekeeperPass: evaluation.gatekeeperPass,
            decisionBand: evaluation.decisionBand,
          }
        : {}),
    }
  })
  return apiSuccess(payload)
})
