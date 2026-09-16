/**
 * Run executor — walks a compiled plan and produces a Briefing.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §10, FR-06 … FR-11.
 *
 * Invoked by the worker (scripts/automations-worker.ts) once it holds a lease on
 * the run row, and by the manual-run path. Everything it needs is on the run and
 * its automation — it never reads the schedule or decides whether to fire.
 *
 * Failure posture: a refused or failing STEP degrades the run (a warning callout
 * in the Briefing) rather than aborting it. Only a failure that makes the whole
 * document meaningless — no AI credential, an invalid plan, the timeout, the
 * cost cap — fails the run.
 */

import { prisma } from '@/lib/prisma'
import type { AutomationRecipient, Finding, PlanSpec, StepTrace, ToolGrant } from '@/types/automations'
import { MAX_CONSECUTIVE_FAILURES } from '@/types/automations'
import { assembleBriefingBlocks, buildBriefingTitle } from './briefing'
import { deliverBriefing, notifyOwnerForReview, notifyOwnerOfFailure, seedRecipientRows, briefingUrl } from './delivery'
import { diffFindings, shouldSuppressDelivery } from './findings'
import { resolveTemplates, validatePlan, withPlanDefaults } from './plan'
import { renderAppHtml, renderEmailHtml, renderPlainText } from './render'
import { synthesizeBriefing } from './synthesis'
import type { SynthesisInput, SynthesisOutput } from './synthesis'
import { resolveTool, type ToolActor, type ToolRow } from './tools'

/** Transcript previews are truncated — a run must stay debuggable without being huge. */
const PREVIEW_CHARS = 600
const MAX_ROWS_PER_STEP = 500

export interface RunOutcome {
  runId: string
  status: 'SUCCEEDED' | 'FAILED'
  briefingId?: string
  findingCount: number
  newCount: number
  changedCount: number
  costUsd: number
  durationMs: number
  suppressed: boolean
  warnings: string[]
  error?: string
}

class RunTimeoutError extends Error {
  readonly code = 'RUN_TIMEOUT'
  constructor(seconds: number) {
    super(`Run exceeded its ${seconds}s timeout`)
    this.name = 'RunTimeoutError'
  }
}

class CostCapError extends Error {
  readonly code = 'COST_CAP'
  constructor(capUsd: number) {
    super(`Run exceeded its cost cap of $${capUsd.toFixed(2)}`)
    this.name = 'CostCapError'
  }
}

/** Resolve the identity the run executes as — always the automation's owner. */
async function resolveActor(ownerId: string): Promise<ToolActor> {
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: {
      id: true, name: true, role: true, isActive: true,
      departmentMemberships: { where: { endedAt: null }, select: { departmentId: true } },
    },
  })
  if (!owner) throw new Error(`Automation owner ${ownerId} no longer exists`)
  if (!owner.isActive) throw new Error(`Automation owner ${owner.name} is deactivated`)
  return {
    userId: owner.id,
    name: owner.name,
    role: owner.role as ToolActor['role'],
    departmentIds: owner.departmentMemberships.map((m) => m.departmentId),
  }
}

function previewOf(rows: ToolRow[]): string {
  return rows
    .slice(0, 5)
    .map((r) => `${r.kind}: ${r.title}`)
    .join(' | ')
    .slice(0, PREVIEW_CHARS)
}

/**
 * Injection seam. The only reason it exists is so the smoke harness
 * (scripts/smoke-automations.ts) can drive the real pipeline end to end without
 * spending money on a provider call — everything else stays exactly as it runs
 * in production, which is the point of a smoke test.
 */
export interface RunDeps {
  synthesize?: (input: SynthesisInput) => Promise<SynthesisOutput>
}

/**
 * Execute one run to completion. The caller owns the lease and is responsible for
 * heartbeating; this function only writes terminal state.
 */
export async function executeRun(runId: string, deps: RunDeps = {}): Promise<RunOutcome> {
  const synthesize = deps.synthesize ?? synthesizeBriefing
  const startedAt = Date.now()

  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: { automation: true },
  })
  if (!run) throw new Error(`Run ${runId} not found`)
  const automation = run.automation

  await prisma.automationRun.update({
    where: { id: runId },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  const warnings: string[] = []
  const steps: StepTrace[] = []
  let costUsd = 0

  try {
    // --- Plan -------------------------------------------------------------
    const grants = (automation.toolGrants ?? []) as unknown as ToolGrant[]
    const plan: PlanSpec = withPlanDefaults(
      validatePlan(automation.planJson, { grants, maxCostUsdPerRun: automation.maxCostUsdPerRun })
    )

    const timeoutSeconds = plan.limits?.timeoutSeconds ?? automation.timeoutSeconds
    const deadline = startedAt + timeoutSeconds * 1000
    const costCap = plan.limits?.maxCostUsd ?? automation.maxCostUsdPerRun
    const checkDeadline = () => {
      if (Date.now() > deadline) throw new RunTimeoutError(timeoutSeconds)
    }

    const actor = await resolveActor(automation.ownerId)
    const now = run.scheduledFor ?? new Date()
    const templateCtx = {
      now,
      timezone: automation.timezone,
      lastRunAt: automation.lastRunAt,
      ownerName: actor.name,
    }

    // --- Steps ------------------------------------------------------------
    const stepOutputs: Array<{ stepId: string; label: string; tool: string; rows: ToolRow[] }> = []

    for (const step of plan.steps) {
      checkDeadline()
      const stepStarted = Date.now()
      const params = resolveTemplates(step.params, templateCtx)

      try {
        const tool = resolveTool(step.tool, grants)
        // The grant travels with the call so tools that narrow by grant params
        // (Odoo model allowlists) read them from one place the plan cannot widen.
        const grant = grants.find((g) => g.tool === step.tool)
        const result = await tool.execute(params, { actor, now, grant })
        const rows = result.rows.slice(0, MAX_ROWS_PER_STEP)
        if (result.rows.length > MAX_ROWS_PER_STEP) {
          warnings.push(`Step "${step.label}" returned ${result.rows.length} rows; only the first ${MAX_ROWS_PER_STEP} were used.`)
        }
        stepOutputs.push({ stepId: step.id, label: step.label, tool: step.tool, rows })
        steps.push({
          stepId: step.id,
          tool: step.tool,
          label: step.label,
          args: params as Record<string, unknown>,
          startedAt: new Date(stepStarted).toISOString(),
          durationMs: Date.now() - stepStarted,
          status: 'OK',
          resultCount: rows.length,
          resultBytes: JSON.stringify(rows).length,
          preview: result.summary ? `${result.summary} — ${previewOf(rows)}` : previewOf(rows),
        })
      } catch (error) {
        // A refused or failing step degrades the run; it does not end it.
        const message = error instanceof Error ? error.message : String(error)
        const refused = (error as { code?: string })?.code === 'TOOL_REFUSED' || (error as { code?: string })?.code === 'TOOL_UNAVAILABLE'
        warnings.push(`Step "${step.label}" ${refused ? 'was refused' : 'failed'}: ${message}`)
        steps.push({
          stepId: step.id,
          tool: step.tool,
          label: step.label,
          args: params as Record<string, unknown>,
          startedAt: new Date(stepStarted).toISOString(),
          durationMs: Date.now() - stepStarted,
          status: refused ? 'REFUSED' : 'ERROR',
          error: message,
        })
      }
    }

    // --- Synthesis --------------------------------------------------------
    checkDeadline()
    const synthesis = await synthesize({
      plan,
      stepOutputs,
      automationName: automation.name,
      ownerUserId: automation.ownerId,
      runId,
    })
    costUsd += synthesis.costUsd
    if (costUsd > costCap) throw new CostCapError(costCap)

    // --- Diff against the previous successful run -------------------------
    const previousRun = await prisma.automationRun.findFirst({
      where: { automationId: automation.id, status: 'SUCCEEDED', id: { not: runId } },
      orderBy: { scheduledFor: 'desc' },
      select: { findingsJson: true },
    })
    const previousFindings = (previousRun?.findingsJson ?? []) as unknown as Finding[]
    const dedupeKeyFields = plan.synthesis.findingSchema?.dedupeKeyFields ?? ['title']
    const diff = diffFindings(synthesis.findings, previousFindings, dedupeKeyFields)

    // --- Assemble and render ---------------------------------------------
    const blocks = assembleBriefingBlocks({
      plan,
      summary: synthesis.summary,
      narrative: synthesis.blocks,
      diff,
      warnings,
    })
    const title = buildBriefingTitle(
      resolveTemplates(plan.briefing.titleTemplate, templateCtx),
      `${automation.name} — ${now.toISOString().slice(0, 10)}`
    )

    const suppressed = shouldSuppressDelivery(diff, plan.notify.onEmpty ?? 'SKIP')
    const briefingStatus =
      automation.mode === 'DRY_RUN' ? 'DRAFT'
      : automation.mode === 'REVIEW' ? 'PENDING_REVIEW'
      : 'PUBLISHED'

    const htmlApp = renderAppHtml(blocks)
    const textPlain = renderPlainText(blocks, { title, summary: synthesis.summary })

    const briefing = await prisma.automationBriefing.create({
      data: {
        runId,
        automationId: automation.id,
        title,
        summary: synthesis.summary.slice(0, 300),
        blocksJson: blocks as unknown as object,
        htmlApp,
        // Rendered with the real URL once the id exists — patched immediately below.
        htmlEmail: '',
        textPlain,
        status: briefingStatus,
        newCount: diff.newCount,
        changedCount: diff.changedCount,
        unchangedCount: diff.unchangedCount,
        resolvedCount: diff.resolved.length,
        publishedAt: briefingStatus === 'PUBLISHED' ? new Date() : null,
      },
      select: { id: true },
    })

    const htmlEmail = renderEmailHtml(blocks, {
      title,
      summary: synthesis.summary,
      viewUrl: briefingUrl(briefing.id),
      footerNote: `Generated by the "${automation.name}" automation. Manage it in Automations → ${automation.name}.`,
    })
    await prisma.automationBriefing.update({ where: { id: briefing.id }, data: { htmlEmail } })

    // --- Distribute -------------------------------------------------------
    const recipients = (automation.recipientsJson ?? []) as unknown as AutomationRecipient[]
    if (automation.mode === 'AUTO' && !suppressed) {
      await seedRecipientRows(briefing.id, recipients)
      await deliverBriefing(
        {
          id: briefing.id,
          automationId: automation.id,
          automationName: automation.name,
          title,
          summary: synthesis.summary,
          htmlEmail,
          textPlain,
          newCount: diff.newCount,
          changedCount: diff.changedCount,
        },
        recipients
      )
    } else if (automation.mode === 'REVIEW' && !suppressed) {
      await seedRecipientRows(briefing.id, recipients)
      await notifyOwnerForReview(automation.ownerId, {
        id: briefing.id,
        title,
        automationId: automation.id,
        newCount: diff.newCount,
        changedCount: diff.changedCount,
      })
    }

    // --- Persist terminal state ------------------------------------------
    const durationMs = Date.now() - startedAt
    await prisma.$transaction([
      prisma.automationRun.update({
        where: { id: runId },
        data: {
          status: 'SUCCEEDED',
          finishedAt: new Date(),
          stepsJson: steps as unknown as object,
          findingsJson: diff.findings as unknown as object,
          costUsd,
          inputTokens: synthesis.usage.inputTokens,
          outputTokens: synthesis.usage.outputTokens,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      }),
      prisma.automation.update({
        where: { id: automation.id },
        data: {
          lastRunAt: new Date(),
          consecutiveFailures: 0,
          runCount: { increment: 1 },
        },
      }),
    ])

    return {
      runId,
      status: 'SUCCEEDED',
      briefingId: briefing.id,
      findingCount: diff.findings.length,
      newCount: diff.newCount,
      changedCount: diff.changedCount,
      costUsd,
      durationMs,
      suppressed,
      warnings,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failures = automation.consecutiveFailures + 1
    const shouldDisable = failures >= MAX_CONSECUTIVE_FAILURES

    await prisma.$transaction([
      prisma.automationRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          stepsJson: steps as unknown as object,
          costUsd,
          errorMessage: message.slice(0, 2000),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      }),
      prisma.automation.update({
        where: { id: automation.id },
        data: {
          lastRunAt: new Date(),
          consecutiveFailures: failures,
          runCount: { increment: 1 },
          // Never let an automation fail silently forever.
          ...(shouldDisable ? { status: 'DISABLED_ON_FAILURE' } : {}),
        },
      }),
    ])

    await notifyOwnerOfFailure(
      automation.ownerId,
      { id: automation.id, name: automation.name, consecutiveFailures: failures },
      message
    ).catch(() => undefined)

    return {
      runId,
      status: 'FAILED',
      findingCount: 0,
      newCount: 0,
      changedCount: 0,
      costUsd,
      durationMs: Date.now() - startedAt,
      suppressed: false,
      warnings,
      error: message,
    }
  }
}
