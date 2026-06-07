import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveNextAnchor } from './scoring'
import type { RubricAnchors } from './types'

export async function finalizeEvaluation(evaluationId: string, actorId: string, overrideReason?: string) {
  return prisma.$transaction(async (tx) => {
    const evaluation = await tx.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        acknowledgements: { orderBy: { createdAt: 'desc' }, take: 1 },
        reports: { orderBy: { version: 'desc' }, take: 1 },
        results: {
          include: { criterion: true },
          orderBy: { consolidated: 'asc' },
        },
        employee: { select: { id: true } },
      },
    })
    if (!evaluation) throw new Error('Evaluation not found')
    if (evaluation.status !== 'DRAFT_SHARED') throw new Error('Only a shared draft can be finalized')
    const acknowledgement = evaluation.acknowledgements[0]
    if (acknowledgement?.status !== 'ACKNOWLEDGED' && !overrideReason?.trim()) {
      throw new Error('Employee acknowledgement or an administrator override reason is required')
    }

    const settings = await tx.performanceSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    })
    const lowest = evaluation.results.slice(0, Math.max(1, settings.improvementFocusLimit))
    for (const result of lowest) {
      const criterion = result.criterion
      let targetText: string
      if (criterion.type === 'RUBRIC') {
        targetText = resolveNextAnchor(result.consolidated, (criterion.anchorJson ?? {}) as RubricAnchors)
          ?? 'Sustain performance at the highest rubric anchor.'
      } else {
        targetText = criterion.target == null
          ? `Improve ${criterion.title} in the next cycle.`
          : `Reach the target of ${criterion.target}${criterion.unit ? ` ${criterion.unit}` : ''}.`
      }
      await tx.improvementFocus.upsert({
        where: { evaluationId_criterionId: { evaluationId, criterionId: criterion.id } },
        create: {
          evaluationId,
          employeeId: evaluation.employeeId,
          criterionId: criterion.id,
          currentLevel: result.consolidated,
          targetText,
        },
        update: { currentLevel: result.consolidated, targetText, status: 'ACTIVE' },
      })
    }

    async function recommend(type: string, detail: Record<string, unknown>) {
      const existing = await tx.developmentAction.findFirst({
        where: { evaluationId, type, recommendedBy: 'system', detailJson: { equals: detail as Prisma.InputJsonValue } },
        select: { id: true },
      })
      if (!existing) {
        await tx.developmentAction.create({
          data: { evaluationId, type, recommendedBy: 'system', detailJson: detail as Prisma.InputJsonValue },
        })
      }
    }

    if (evaluation.gatekeeperPass && evaluation.decisionBand === 'Ready') {
      await recommend('SALARY_ADJUSTMENT', { reason: 'Ready decision band' })
      const prior = await tx.evaluation.findFirst({
        where: { employeeId: evaluation.employeeId, status: 'FINALIZED', finalizedAt: { not: null } },
        orderBy: { finalizedAt: 'desc' },
        select: { normalized: true },
      })
      if (prior?.normalized != null && evaluation.normalized != null && evaluation.normalized > prior.normalized) {
        await recommend('PROMOTION', { reason: 'Ready decision band with improving trend' })
      }
    } else if (evaluation.decisionBand === 'On Track') {
      await recommend('BONUS', { reason: 'On Track decision band' })
    }
    for (const result of evaluation.results.filter((item) => item.consolidated < 4)) {
      await recommend('TRAINING', { criterionId: result.criterionId, criterionTitle: result.criterion.title })
    }

    if (evaluation.reports[0]) {
      await tx.evaluationReport.update({
        where: { id: evaluation.reports[0].id },
        data: { status: 'FINAL', finalizedAt: new Date() },
      })
    }
    return tx.evaluation.update({
      where: { id: evaluationId },
      data: { status: 'FINALIZED', finalizedAt: new Date() },
    })
  })
}
