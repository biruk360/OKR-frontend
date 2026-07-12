import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export async function createEvaluationReport(evaluationId: string) {
  return prisma.$transaction(async (tx) => {
    const evaluation = await tx.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        employee: { select: { id: true, name: true, designation: true } },
        cycle: { select: { id: true, name: true, periodStart: true, periodEnd: true } },
        scores: { select: { criterionId: true, remark: true, evaluator: { select: { name: true } } } },
        results: true,
        template: {
          include: {
            family: { select: { name: true, roleLabel: true } },
            tiers: { orderBy: { position: 'asc' }, include: { criteria: { orderBy: { position: 'asc' } } } },
          },
        },
      },
    })
    if (!evaluation) throw new Error('Evaluation not found')
    if (!['CONSOLIDATED', 'DRAFT_SHARED'].includes(evaluation.status)) {
      throw new Error('Only consolidated evaluations can produce a report')
    }
    const unresolved = evaluation.results.filter((result) => result.flagged && !result.resolvedAt)
    if (unresolved.length > 0) throw new Error('Resolve every calibration flag before sharing a draft')

    // Remark attribution is a global setting: when enabled the synthesized
    // feedback carries evaluator names ("Name: remark"); when disabled remarks
    // stay unattributed. Numeric scores are never included either way.
    const settings = await tx.performanceSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    })

    const resultByCriterion = new Map(evaluation.results.map((result) => [result.criterionId, result]))
    const remarksByCriterion = new Map<string, string[]>()
    for (const score of evaluation.scores) {
      const remark = score.remark?.trim()
      if (!remark) continue
      const entry = settings.remarkAttributionEnabled ? `${score.evaluator.name}: ${remark}` : remark
      const rows = remarksByCriterion.get(score.criterionId) ?? []
      if (!rows.includes(entry)) rows.push(entry)
      remarksByCriterion.set(score.criterionId, rows)
    }
    const tierBreakdown = evaluation.template.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      maxPoints: tier.maxPoints,
      subtotal: tier.criteria.reduce((sum, criterion) => sum + (resultByCriterion.get(criterion.id)?.consolidated ?? 0), 0),
      criteria: tier.criteria.map((criterion) => {
        const result = resultByCriterion.get(criterion.id)
        const remarks = remarksByCriterion.get(criterion.id) ?? []
        return {
          id: criterion.id,
          title: criterion.title,
          type: criterion.type,
          maxPoints: criterion.maxPoints,
          consolidated: result?.consolidated ?? null,
          actualValue: result?.actualValue ?? null,
          feedbackSummary: remarks.length > 0
            ? `Panel feedback: ${remarks.join(settings.remarkAttributionEnabled ? '; ' : ' ')}`
            : null,
        }
      }),
    }))
    // Multi-cycle trend: this employee's prior finalized evaluations, ordered by period.
    const priorFinalized = await tx.evaluation.findMany({
      where: {
        employeeId: evaluation.employeeId,
        status: 'FINALIZED',
        id: { not: evaluationId },
        cycle: { periodEnd: { lte: evaluation.cycle.periodEnd } },
      },
      select: {
        normalized: true,
        cycle: { select: { id: true, name: true, periodStart: true, periodEnd: true } },
      },
      orderBy: { cycle: { periodStart: 'asc' } },
    })
    const trend = priorFinalized.map((prior) => ({
      cycleId: prior.cycle.id,
      cycleName: prior.cycle.name,
      periodEnd: prior.cycle.periodEnd.toISOString(),
      normalized: prior.normalized,
    }))

    // Employee-scoped OKR attainment for objectives whose timeframe overlaps the cycle period.
    const objectives = await tx.objective.findMany({
      where: {
        ownerId: evaluation.employeeId,
        status: { not: 'DELETED' },
        timeframe: {
          startDate: { lte: evaluation.cycle.periodEnd },
          endDate: { gte: evaluation.cycle.periodStart },
        },
      },
      select: {
        id: true,
        title: true,
        progress: true,
        timeframe: { select: { name: true } },
        keyResults: {
          where: { status: { not: 'DELETED' } },
          select: {
            id: true,
            title: true,
            unit: true,
            startValue: true,
            targetValue: true,
            currentValue: true,
            progress: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    const okrAttainment = {
      periodStart: evaluation.cycle.periodStart.toISOString(),
      periodEnd: evaluation.cycle.periodEnd.toISOString(),
      objectives: objectives.map((objective) => ({
        id: objective.id,
        title: objective.title,
        progress: objective.progress,
        timeframeName: objective.timeframe.name,
        keyResults: objective.keyResults,
      })),
    }

    const content = {
      employee: evaluation.employee,
      cycle: evaluation.cycle,
      template: evaluation.template.family,
      rawTotal: evaluation.rawTotal,
      maxTotal: evaluation.maxTotal,
      normalized: evaluation.normalized,
      gatekeeperPass: evaluation.gatekeeperPass,
      decisionBand: evaluation.decisionBand,
      tierBreakdown,
      trend,
      okrAttainment,
      generatedAt: new Date().toISOString(),
    }
    const latest = await tx.evaluationReport.findFirst({
      where: { evaluationId },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    return tx.evaluationReport.create({
      data: {
        evaluationId,
        version: (latest?.version ?? 0) + 1,
        status: 'SHARED',
        contentJson: content as unknown as Prisma.InputJsonValue,
        sharedAt: new Date(),
      },
    })
  })
}

