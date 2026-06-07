import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertCycleTransition } from './state-machine'

type DbClient = Prisma.TransactionClient

function normalizeDesignation(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalized || null
}

async function createIssue(
  tx: DbClient,
  input: {
    cycleId: string
    employeeId?: string
    evaluationId?: string
    type: string
    detail?: Record<string, unknown>
  },
) {
  await tx.reviewCycleIssue.create({
    data: {
      cycleId: input.cycleId,
      employeeId: input.employeeId,
      evaluationId: input.evaluationId,
      type: input.type,
      detailJson: input.detail as Prisma.InputJsonValue | undefined,
    },
  })
}

export async function openReviewCycle(cycleId: string): Promise<{
  createdEvaluations: number
  issueCount: number
  alreadyOpen: boolean
}> {
  return prisma.$transaction(async (tx) => {
    const cycle = await tx.reviewCycle.findUnique({
      where: { id: cycleId },
      include: { departments: { select: { departmentId: true } } },
    })
    if (!cycle) throw new Error('Review cycle not found')

    if (cycle.status !== 'PLANNED') {
      const [createdEvaluations, issueCount] = await Promise.all([
        tx.evaluation.count({ where: { cycleId } }),
        tx.reviewCycleIssue.count({ where: { cycleId, status: 'OPEN' } }),
      ])
      return { createdEvaluations, issueCount, alreadyOpen: true }
    }
    assertCycleTransition(cycle.status, 'OPEN')

    const scopedDepartmentIds = cycle.departments.map((item) => item.departmentId)
    const employees = await tx.user.findMany({
      where: {
        isActive: true,
        ...(cycle.allCompany
          ? {}
          : { departmentMemberships: { some: { endedAt: null, departmentId: { in: scopedDepartmentIds } } } }),
      },
      select: {
        id: true,
        designation: true,
        departmentMemberships: {
          where: { endedAt: null },
          select: { departmentId: true, isPrimary: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    let createdEvaluations = 0
    let issueCount = 0

    for (const employee of employees) {
      const explicit = await tx.employeeTemplateAssignment.findFirst({
        where: {
          employeeId: employee.id,
          effectiveFrom: { lte: cycle.periodEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: cycle.periodStart } }],
        },
        orderBy: { effectiveFrom: 'desc' },
        select: { familyId: true },
      })

      let familyId = explicit?.familyId ?? null
      if (!familyId) {
        const designationKey = normalizeDesignation(employee.designation)
        if (designationKey) {
          const departmentIds = employee.departmentMemberships.map((membership) => membership.departmentId)
          const mapping = await tx.templateRoleMapping.findFirst({
            where: {
              designationKey,
              isActive: true,
              OR: [{ departmentId: null }, { departmentId: { in: departmentIds } }],
            },
            orderBy: [{ priority: 'desc' }],
            select: { familyId: true },
          })
          familyId = mapping?.familyId ?? null
        }
      }

      const template = familyId
        ? await tx.scorecardTemplate.findFirst({
            where: { familyId, status: 'PUBLISHED' },
            orderBy: { version: 'desc' },
            include: {
              tiers: {
                include: { criteria: { orderBy: { position: 'asc' } } },
                orderBy: { position: 'asc' },
              },
            },
          })
        : null

      if (!template) {
        await createIssue(tx, {
          cycleId,
          employeeId: employee.id,
          type: 'NO_TEMPLATE',
          detail: { designation: employee.designation },
        })
        issueCount++
        continue
      }

      const evaluation = await tx.evaluation.create({
        data: {
          cycleId,
          templateId: template.id,
          employeeId: employee.id,
          maxTotal: template.maxTotal,
          status: 'ASSIGNED',
        },
      })
      createdEvaluations++

      const managers = await tx.managerRelationship.findMany({
        where: { directReportId: employee.id, endedAt: null },
        select: { managerId: true },
      })
      if (managers.length === 1 && managers[0].managerId !== employee.id) {
        await tx.evaluatorAssignment.create({
          data: { evaluationId: evaluation.id, evaluatorId: managers[0].managerId, role: 'LEAD' },
        })
      } else {
        const type = managers.length === 0 ? 'NO_LEAD' : 'AMBIGUOUS_LEAD'
        await createIssue(tx, {
          cycleId,
          employeeId: employee.id,
          evaluationId: evaluation.id,
          type,
          detail: { managerIds: managers.map((manager) => manager.managerId) },
        })
        issueCount++
      }

      const metricCriteria = template.tiers.flatMap((tier) => tier.criteria).filter((criterion) => criterion.type === 'METRIC')
      for (const criterion of metricCriteria) {
        const rule = criterion.scoringRuleJson as Record<string, unknown> | null
        if (rule?.type === 'MANUAL') continue
        const mappings = await tx.metricSourceMapping.findMany({
          where: { criterionId: criterion.id, employeeId: employee.id },
          include: { keyResult: { select: { id: true, title: true } } },
          orderBy: { position: 'asc' },
        })
        if (mappings.length === 0) {
          await createIssue(tx, {
            cycleId,
            employeeId: employee.id,
            evaluationId: evaluation.id,
            type: 'METRIC_SOURCE_MISSING',
            detail: { criterionId: criterion.id, criterionTitle: criterion.title },
          })
          issueCount++
          continue
        }
        await tx.evaluationMetricSource.createMany({
          data: mappings.map((mapping) => ({
            evaluationId: evaluation.id,
            criterionId: criterion.id,
            keyResultId: mapping.keyResultId,
            keyResultTitleSnapshot: mapping.keyResult.title,
            position: mapping.position,
          })),
          skipDuplicates: true,
        })
      }
    }

    await tx.reviewCycle.update({
      where: { id: cycleId },
      data: { status: 'OPEN', openedAt: new Date() },
    })

    return { createdEvaluations, issueCount, alreadyOpen: false }
  })
}

