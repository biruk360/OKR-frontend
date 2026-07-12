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
        cycle: { select: { id: true, name: true, periodStart: true, periodEnd: true, status: true } },
        template: { select: { family: { select: { name: true } } } },
      },
      orderBy: { cycle: { periodStart: 'desc' } },
    }),
  ])
  // Latest finalized evaluation's shared/final report content for dashboard charts.
  // Finalized-only, consolidated data — never raw per-evaluator scores.
  const latestFinalized = evaluations.find((evaluation) => evaluation.status === 'FINALIZED')
  let latestReport: { evaluationId: string; cycleName: string; contentJson: unknown } | null = null
  if (latestFinalized) {
    const report = await prisma.evaluationReport.findFirst({
      where: { evaluationId: latestFinalized.id, status: { in: ['SHARED', 'FINAL'] } },
      orderBy: { version: 'desc' },
      select: { contentJson: true },
    })
    if (report) {
      latestReport = {
        evaluationId: latestFinalized.id,
        cycleName: latestFinalized.cycle.name,
        contentJson: report.contentJson,
      }
    }
  }
  return apiSuccess({
    latestReport,
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
