/**
 * Automation CRUD services. Routes stay thin; the rules live here.
 * Spec: docs/AI_Automations_Requirements_v1.0.md FR-01 … FR-05, FR-15.
 */

import { prisma } from '@/lib/prisma'
import {
  DEFAULT_TIMEZONE,
  type AutomationRecipient,
  type DistributionMode,
  type PlanSpec,
  type ToolGrant,
} from '@/types/automations'
import { validatePlan, withPlanDefaults } from './plan'
import { describeSchedule } from './schedule'
import { refreshNextRunAt } from './service'

export interface CreateAutomationInput {
  name: string
  description?: string
  instructionText: string
  plan: unknown
  toolGrants: ToolGrant[]
  recipients: AutomationRecipient[]
  ownerId: string
  createdById: string
  maxCostUsdPerRun?: number
  maxCostUsdMonth?: number
}

export async function createAutomation(input: CreateAutomationInput) {
  const maxCostUsdPerRun = input.maxCostUsdPerRun ?? 0.5
  const plan: PlanSpec = withPlanDefaults(
    validatePlan(input.plan, { grants: input.toolGrants, maxCostUsdPerRun })
  )

  const automation = await prisma.automation.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      ownerId: input.ownerId,
      createdById: input.createdById,
      instructionText: input.instructionText,
      planJson: plan as unknown as object,
      planVersion: 1,
      scheduleKind: plan.schedule.kind,
      scheduleJson: plan.schedule as unknown as object,
      timezone: plan.schedule.timezone || DEFAULT_TIMEZONE,
      // Every new automation starts in DRY_RUN — the graduation gate (spec §4.1).
      mode: 'DRY_RUN',
      status: 'ENABLED',
      toolGrants: input.toolGrants as unknown as object,
      recipientsJson: input.recipients as unknown as object,
      maxCostUsdPerRun,
      maxCostUsdMonth: input.maxCostUsdMonth ?? 10,
      timeoutSeconds: plan.limits?.timeoutSeconds ?? 600,
    },
  })

  await refreshNextRunAt(automation.id)
  return automation
}

export interface UpdateAutomationInput {
  name?: string
  description?: string | null
  instructionText?: string
  plan?: unknown
  toolGrants?: ToolGrant[]
  recipients?: AutomationRecipient[]
  maxCostUsdPerRun?: number
  maxCostUsdMonth?: number
  status?: 'ENABLED' | 'PAUSED'
}

export async function updateAutomation(id: string, input: UpdateAutomationInput) {
  const existing = await prisma.automation.findUnique({ where: { id } })
  if (!existing || existing.deletedAt) throw new Error('Automation not found')

  const grants = (input.toolGrants ?? existing.toolGrants) as unknown as ToolGrant[]
  const maxCostUsdPerRun = input.maxCostUsdPerRun ?? existing.maxCostUsdPerRun

  let planFields = {}
  if (input.plan !== undefined) {
    const plan = withPlanDefaults(validatePlan(input.plan, { grants, maxCostUsdPerRun }))
    planFields = {
      planJson: plan as unknown as object,
      // Every plan edit is a new version; runs record the version they executed.
      planVersion: existing.planVersion + 1,
      scheduleKind: plan.schedule.kind,
      scheduleJson: plan.schedule as unknown as object,
      timezone: plan.schedule.timezone || existing.timezone,
      timeoutSeconds: plan.limits?.timeoutSeconds ?? existing.timeoutSeconds,
    }
  }

  const automation = await prisma.automation.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.instructionText !== undefined ? { instructionText: input.instructionText } : {}),
      ...(input.toolGrants !== undefined ? { toolGrants: input.toolGrants as unknown as object } : {}),
      ...(input.recipients !== undefined ? { recipientsJson: input.recipients as unknown as object } : {}),
      ...(input.maxCostUsdPerRun !== undefined ? { maxCostUsdPerRun: input.maxCostUsdPerRun } : {}),
      ...(input.maxCostUsdMonth !== undefined ? { maxCostUsdMonth: input.maxCostUsdMonth } : {}),
      ...(input.status !== undefined
        ? { status: input.status, ...(input.status === 'ENABLED' ? { consecutiveFailures: 0 } : {}) }
        : {}),
      ...planFields,
    },
  })

  await refreshNextRunAt(id)
  return automation
}

/**
 * Mode change. Promotion to AUTO requires a successful run first — an automation
 * that has never produced a Briefing must not start emailing people.
 */
export async function changeMode(id: string, mode: DistributionMode) {
  if (mode === 'AUTO') {
    const successes = await prisma.automationRun.count({
      where: { automationId: id, status: 'SUCCEEDED' },
    })
    if (successes === 0) {
      throw new Error('Run this automation successfully at least once before switching it to AUTO')
    }
  }
  return prisma.automation.update({ where: { id }, data: { mode } })
}

/** Soft delete — Briefings are retained per AutomationSettings.retentionDays. */
export async function softDeleteAutomation(id: string) {
  return prisma.automation.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'PAUSED', nextRunAt: null },
  })
}

/**
 * Month-to-date spend for one automation (FR-17). Summed from AutomationRun
 * rather than AiGenerationLog so it includes runs that failed after spending —
 * a run that burned tokens and then hit the timeout still cost real money.
 */
export async function monthToDateSpend(automationId: string, now = new Date()): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const result = await prisma.automationRun.aggregate({
    where: { automationId, createdAt: { gte: monthStart } },
    _sum: { costUsd: true },
  })
  return Number((result._sum.costUsd ?? 0).toFixed(6))
}

/** Shape used by the list and detail views. */
export function toAutomationSummary(automation: {
  id: string
  name: string
  description: string | null
  ownerId: string
  mode: string
  status: string
  scheduleKind: string
  scheduleJson: unknown
  timezone: string
  nextRunAt: Date | null
  lastRunAt: Date | null
  consecutiveFailures: number
  runCount: number
  planVersion: number
  updatedAt: Date
}) {
  return {
    id: automation.id,
    name: automation.name,
    description: automation.description,
    ownerId: automation.ownerId,
    mode: automation.mode,
    status: automation.status,
    scheduleKind: automation.scheduleKind,
    scheduleSummary: describeSchedule(automation.scheduleJson as never),
    timezone: automation.timezone,
    nextRunAt: automation.nextRunAt,
    lastRunAt: automation.lastRunAt,
    consecutiveFailures: automation.consecutiveFailures,
    runCount: automation.runCount,
    planVersion: automation.planVersion,
    updatedAt: automation.updatedAt,
  }
}
