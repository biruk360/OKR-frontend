import { prisma } from '@/lib/prisma'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { hasPerformanceFeature, hasPerformancePermission } from '@/lib/performance'

export const GET = withAuth(async (_request, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  const allowed = await Promise.all([
    hasPerformanceFeature(actor, 'module.performance'),
    hasPerformanceFeature(actor, 'page.performance.my'),
    hasPerformancePermission(actor, 'evaluation', 'read'),
    hasPerformancePermission(actor, 'improvement_focus', 'read'),
  ])
  if (!allowed.every(Boolean)) return apiForbidden('You do not have access to My Performance')
  const [focuses, evaluations] = await Promise.all([
    prisma.improvementFocus.findMany({
      where: { employeeId: session.user.id, status: 'ACTIVE' },
      include: { criterion: { select: { id: true, title: true, type: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.evaluation.findMany({
      where: { employeeId: session.user.id },
      select: {
        id: true,
        status: true,
        normalized: true,
        decisionBand: true,
        gatekeeperPass: true,
        cycle: { select: { id: true, name: true, periodStart: true, periodEnd: true } },
        template: { select: { family: { select: { name: true } } } },
      },
      orderBy: { cycle: { periodStart: 'desc' } },
    }),
  ])
  return apiSuccess({
    focuses,
    evaluations: evaluations.map((evaluation) => ({
      id: evaluation.id,
      status: evaluation.status,
      cycle: evaluation.cycle,
      templateName: evaluation.template.family.name,
      ...(['DRAFT_SHARED', 'FINALIZED'].includes(evaluation.status)
        ? {
            normalized: evaluation.normalized,
            decisionBand: evaluation.decisionBand,
            gatekeeperPass: evaluation.gatekeeperPass,
          }
        : { sealed: true }),
    })),
  })
})
