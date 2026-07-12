import { prisma } from '@/lib/prisma'
import {
  getUserActiveRoleKeys,
  resolveDocTypePermission,
  resolveFeaturePermission,
  type DocTypeAction,
} from '@/lib/permission-resolver'
import type { PerformanceActor } from './types'

export async function hasPerformancePermission(
  actor: PerformanceActor,
  doctype: string,
  action: DocTypeAction,
): Promise<boolean> {
  try {
    return await resolveDocTypePermission(actor.userId, doctype, action)
  } catch {
    return false
  }
}

export async function hasPerformanceFeature(actor: PerformanceActor, featureKey: string): Promise<boolean> {
  try {
    return await resolveFeaturePermission(actor.userId, featureKey)
  } catch {
    return false
  }
}

async function hasCapability(
  actor: PerformanceActor,
  featureKey: string,
  doctype: string,
  action: DocTypeAction,
): Promise<boolean> {
  const [moduleAccess, featureAccess, doctypeAccess] = await Promise.all([
    hasPerformanceFeature(actor, 'module.performance'),
    hasPerformanceFeature(actor, featureKey),
    hasPerformancePermission(actor, doctype, action),
  ])
  return moduleAccess && featureAccess && doctypeAccess
}

/**
 * Performance administration is module-scoped. Global ADMIN and the seeded
 * PERFORMANCE_ADMIN role qualify, as do custom roles granted the settings
 * write capability.
 */
export async function isPerformanceAdmin(actor: PerformanceActor): Promise<boolean> {
  const roleKeys: string[] = await getUserActiveRoleKeys(actor.userId).catch((): string[] => [])
  if (roleKeys.includes('ADMIN') || roleKeys.includes('PERFORMANCE_ADMIN')) return true
  return hasCapability(actor, 'page.settings.performance', 'performance_settings', 'write')
}

export async function canReadTemplates(actor: PerformanceActor): Promise<boolean> {
  return hasCapability(actor, 'page.performance.templates', 'scorecard_template', 'read')
}

export async function canCreateTemplates(actor: PerformanceActor): Promise<boolean> {
  return hasCapability(actor, 'button.performance.template.create', 'scorecard_template', 'create')
}

export async function canManageTemplates(
  actor: PerformanceActor,
  featureKey = 'button.performance.template.edit',
  action: DocTypeAction = 'write',
): Promise<boolean> {
  return hasCapability(actor, featureKey, 'scorecard_template', action)
}

export async function canReadCycles(actor: PerformanceActor): Promise<boolean> {
  return hasCapability(actor, 'page.performance.cycles', 'review_cycle', 'read')
}

export async function canCreateCycles(actor: PerformanceActor): Promise<boolean> {
  return hasCapability(actor, 'button.performance.cycle.create', 'review_cycle', 'create')
}

export async function canManageCycles(
  actor: PerformanceActor,
  featureKey: 'button.performance.cycle.open' | 'button.performance.cycle.close',
): Promise<boolean> {
  if (!await hasCapability(actor, featureKey, 'review_cycle', 'submit')) return false
  if (featureKey === 'button.performance.cycle.close') return true
  const generatedRecordPermissions = await Promise.all([
    hasPerformancePermission(actor, 'evaluation', 'create'),
    hasPerformancePermission(actor, 'evaluator_assignment', 'create'),
    hasPerformancePermission(actor, 'review_cycle_issue', 'create'),
    hasPerformancePermission(actor, 'evaluation_metric_source', 'create'),
  ])
  return generatedRecordPermissions.every(Boolean)
}

export async function canListEvaluations(actor: PerformanceActor): Promise<boolean> {
  return hasCapability(actor, 'page.performance.evaluations', 'evaluation', 'read')
}

export async function canViewEvaluation(actor: PerformanceActor, evaluationId: string): Promise<boolean> {
  if (!await canListEvaluations(actor)) return false
  if (await isPerformanceAdmin(actor)) return true
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    select: {
      employeeId: true,
      assignments: { where: { evaluatorId: actor.userId }, select: { id: true } },
    },
  })
  return !!evaluation && (evaluation.employeeId === actor.userId || evaluation.assignments.length > 0)
}

export async function canScoreEvaluation(
  actor: PerformanceActor,
  evaluationId: string,
  action: 'write' | 'submit' = 'write',
): Promise<boolean> {
  const feature = action === 'submit' ? 'button.performance.score.submit' : 'button.performance.score.save'
  const permissions = action === 'write'
    ? Promise.all([
        hasCapability(actor, feature, 'evaluator_score', 'write'),
        hasPerformancePermission(actor, 'evaluator_score', 'create'),
      ]).then((values) => values.every(Boolean))
    : hasCapability(actor, feature, 'evaluator_score', 'submit')
  if (!await permissions) return false

  const assignment = await prisma.evaluatorAssignment.findUnique({
    where: { evaluationId_evaluatorId: { evaluationId, evaluatorId: actor.userId } },
    select: { status: true, evaluation: { select: { status: true, cycle: { select: { status: true } } } } },
  })
  return !!assignment
    && assignment.status === 'PENDING'
    && ['ASSIGNED', 'IN_PROGRESS'].includes(assignment.evaluation.status)
    && assignment.evaluation.cycle.status === 'OPEN'
}

export async function canManagePanel(actor: PerformanceActor, evaluationId: string): Promise<boolean> {
  const allowed = await Promise.all([
    hasCapability(actor, 'button.performance.panel.manage', 'evaluator_assignment', 'write'),
    hasPerformancePermission(actor, 'evaluation', 'read'),
    hasPerformancePermission(actor, 'evaluator_assignment', 'create'),
    hasPerformancePermission(actor, 'evaluator_assignment', 'delete'),
  ])
  if (!allowed.every(Boolean)) return false
  if (await isPerformanceAdmin(actor)) return true
  const lead = await prisma.evaluatorAssignment.findUnique({
    where: { evaluationId_evaluatorId: { evaluationId, evaluatorId: actor.userId } },
    select: { role: true, evaluation: { select: { status: true } } },
  })
  return lead?.role === 'LEAD' && ['ASSIGNED', 'IN_PROGRESS'].includes(lead.evaluation.status)
}

export async function canViewCalibration(actor: PerformanceActor, evaluationId: string): Promise<boolean> {
  const allowed = await Promise.all([
    hasPerformanceFeature(actor, 'module.performance'),
    hasPerformanceFeature(actor, 'page.performance.calibration'),
    hasPerformancePermission(actor, 'evaluation', 'read'),
    hasPerformancePermission(actor, 'evaluator_score', 'read'),
    hasPerformancePermission(actor, 'criterion_result', 'read'),
  ])
  if (!allowed.every(Boolean)) return false
  if (await isPerformanceAdmin(actor)) return true
  const lead = await prisma.evaluatorAssignment.findUnique({
    where: { evaluationId_evaluatorId: { evaluationId, evaluatorId: actor.userId } },
    select: { role: true, evaluation: { select: { status: true } } },
  })
  return lead?.role === 'LEAD'
    && ['CALIBRATION', 'CONSOLIDATED', 'DRAFT_SHARED', 'FINALIZED'].includes(lead.evaluation.status)
}

export async function canResolveCalibration(actor: PerformanceActor, evaluationId: string): Promise<boolean> {
  return await canViewCalibration(actor, evaluationId)
    && await hasCapability(actor, 'button.performance.calibration.resolve', 'criterion_result', 'write')
}

/** Retry consolidation (e.g. after re-mapping an unavailable metric source). Lead or admin. */
export async function canTriggerConsolidation(actor: PerformanceActor, evaluationId: string): Promise<boolean> {
  const allowed = await Promise.all([
    hasPerformanceFeature(actor, 'module.performance'),
    hasPerformancePermission(actor, 'evaluation', 'read'),
    hasPerformancePermission(actor, 'criterion_result', 'write'),
  ])
  if (!allowed.every(Boolean)) return false
  if (await isPerformanceAdmin(actor)) return true
  const lead = await prisma.evaluatorAssignment.findUnique({
    where: { evaluationId_evaluatorId: { evaluationId, evaluatorId: actor.userId } },
    select: { role: true },
  })
  return lead?.role === 'LEAD'
}

/** Resolve or waive review-cycle issues (NO_TEMPLATE, NO_LEAD, ACTUAL_UNAVAILABLE, ...). */
export async function canResolveCycleIssue(actor: PerformanceActor): Promise<boolean> {
  if (await isPerformanceAdmin(actor)) return true
  return hasCapability(actor, 'page.performance.cycles', 'review_cycle_issue', 'write')
}

export async function canShareDraft(actor: PerformanceActor, evaluationId: string): Promise<boolean> {
  const allowed = await Promise.all([
    hasCapability(actor, 'button.performance.draft.share', 'evaluation_report', 'share'),
    hasPerformancePermission(actor, 'evaluation_report', 'create'),
    hasPerformancePermission(actor, 'evaluation_acknowledgement', 'create'),
  ])
  if (!allowed.every(Boolean)) return false
  if (await isPerformanceAdmin(actor)) return true
  const lead = await prisma.evaluatorAssignment.findUnique({
    where: { evaluationId_evaluatorId: { evaluationId, evaluatorId: actor.userId } },
    select: { role: true },
  })
  return lead?.role === 'LEAD'
}

export async function canFinalizeEvaluation(actor: PerformanceActor, evaluationId: string): Promise<boolean> {
  const allowed = await Promise.all([
    hasCapability(actor, 'button.performance.evaluation.finalize', 'evaluation', 'submit'),
    hasPerformancePermission(actor, 'evaluation', 'read'),
  ])
  if (!allowed.every(Boolean)) return false
  if (await isPerformanceAdmin(actor)) return true
  const lead = await prisma.evaluatorAssignment.findUnique({
    where: { evaluationId_evaluatorId: { evaluationId, evaluatorId: actor.userId } },
    select: { role: true },
  })
  return lead?.role === 'LEAD'
}

export async function canViewEmployeeReport(actor: PerformanceActor, evaluationId: string): Promise<boolean> {
  const allowed = await Promise.all([
    hasPerformanceFeature(actor, 'module.performance'),
    hasPerformancePermission(actor, 'evaluation_report', 'read'),
  ])
  if (!allowed.every(Boolean)) return false
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    select: { employeeId: true, status: true },
  })
  if (!evaluation) return false
  if (await isPerformanceAdmin(actor)) return true
  if (evaluation.employeeId !== actor.userId) return canViewCalibration(actor, evaluationId)
  return ['DRAFT_SHARED', 'FINALIZED'].includes(evaluation.status)
}

export async function canRespondToReport(actor: PerformanceActor, action: 'acknowledge' | 'dispute'): Promise<boolean> {
  const allowed = await Promise.all([
    hasCapability(actor, `button.performance.report.${action}`, 'evaluation_acknowledgement', 'submit'),
    hasPerformancePermission(actor, 'evaluation_acknowledgement', 'write'),
  ])
  return allowed.every(Boolean)
}

export async function canReadDevelopmentActions(actor: PerformanceActor): Promise<boolean> {
  return hasCapability(actor, 'page.performance.actions', 'development_action', 'read')
}

export async function canManageDevelopmentAction(
  actor: PerformanceActor,
  action: 'approve' | 'reject' | 'execute',
): Promise<boolean> {
  return hasCapability(actor, `button.performance.action.${action}`, 'development_action', 'write')
}
