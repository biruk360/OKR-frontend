/**
 * End-to-end orchestrator for an AI sprint generation. Takes a request, runs:
 *   1. Context bundle (provider-agnostic; AUTO or MANUAL scope)
 *   2. Carryover classification + server-forced rules
 *   3. Deterministic allocation math
 *   4. Provider call (OpenAI today; Anthropic + Gemini once their impls land)
 *   5. Persist Sprint (DRAFT) + Todos (aiSuggested) + AiSprintPlan + AiGenerationLog
 *
 * Used by POST /api/sprints/ai/generate and /regenerate. Keeping the heavy
 * lifting here means route handlers stay thin and the same pipeline can be
 * exercised from CLI scripts.
 */

import { prisma } from '@/lib/prisma'
import { getProvider, ProviderCallError, ProviderNotConfiguredError } from './providers'
import { buildContextBundle, type GenerationMode } from './context-bundler'
import { selectIncomplete, classifyCandidate, carryoverDeltaByKr, summarize } from './carryover'
import {
  buildAllocations,
  type KrForMath,
  type PrevSprintTodoOutcome,
} from './sprint-math'
import { recordGenerationLog } from './generation-log'
import { AI_FEATURE_KEYS, AI_MODELS, type AiProviderId } from './config'
import type { SprintPlan } from './sprint-plan-schema'

export interface PipelineRequest {
  subjectUserId: string
  requester: { userId: string; role: 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE' }
  mode: GenerationMode
  objectiveIds?: string[]
  keyResultIds?: string[]
  /** Existing sprint to attach AI-generated todos to. AI never creates a sprint anymore — */
  /** the team sprint must exist first (created by the user via the sprint board). */
  sprintId: string
  feedback?: string | null
  provider: AiProviderId
  modelId?: string
}

export interface PipelineResult {
  planId: string
  sprintId: string
  proposedTodoIds: string[]
  outOfScopeCarryover: Array<{ todoId: string; keyResultId: string; keyResultTitle: string }>
  plan: SprintPlan
  provider: AiProviderId
  modelId: string
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number }
  latencyMs: number
}

export async function runSprintPlanPipeline(req: PipelineRequest): Promise<PipelineResult> {
  const modelId = req.modelId ?? AI_MODELS[req.provider].planner

  // 0. Load the target sprint. Dates come from the sprint, not the request — the
  //    AI is filling tasks into an existing team sprint, not creating one.
  const targetSprint = await prisma.sprint.findUnique({
    where: { id: req.sprintId },
    select: { id: true, startDate: true, endDate: true, state: true },
  })
  if (!targetSprint) {
    throw new Error(`Sprint not found: ${req.sprintId}`)
  }
  if (targetSprint.state !== 'PLANNING') {
    throw new Error(`Sprint is not in PLANNING state (current: ${targetSprint.state}); AI generation only allowed before the sprint starts`)
  }
  if (!targetSprint.startDate || !targetSprint.endDate) {
    throw new Error('Sprint must have startDate and endDate set before AI generation')
  }
  const sprintStart = targetSprint.startDate
  const sprintEnd = targetSprint.endDate
  const durationDays = Math.max(1, Math.round((sprintEnd.getTime() - sprintStart.getTime()) / 86400000))

  // 1. Context.
  const bundle = await buildContextBundle({
    subjectUserId: req.subjectUserId,
    requester: req.requester,
    mode: req.mode,
    objectiveIds: req.objectiveIds,
    keyResultIds: req.keyResultIds,
    sprintStart,
  })

  // 2. Carryover triage.
  const incomplete = selectIncomplete(bundle.carryoverCandidates)
  const classified = incomplete.map((t) => ({
    todo: t,
    candidate: classifyCandidate(t, sprintStart),
  }))

  // 3. Allocation math.
  const krsForMath: KrForMath[] = bundle.keyResults.map((k) => ({
    id: k.id,
    objectiveId: k.objectiveId,
    startValue: k.startValue,
    targetValue: k.targetValue,
    currentValue: k.currentValue,
    weight: k.weight,
    confidence: k.confidence,
  }))
  const velocityHistory: PrevSprintTodoOutcome[] = bundle.priorSprints.flatMap((s) =>
    s.todos.map((t) => ({
      planned: t.progressValue ?? 0,
      delivered: t.status === 'COMPLETED' ? t.progressValue ?? 0 : 0,
    }))
  )
  const carryoverByKr = carryoverDeltaByKr(
    classified.map((c) => ({ candidate: c.candidate, todo: c.todo }))
  )
  const tfEnd = bundle.timeframe?.endDate ?? new Date(sprintStart.getTime() + 90 * 86400000)
  const allocations = buildAllocations({
    krs: krsForMath,
    timeframeEnd: tfEnd,
    sprintStart,
    sprintDurationWeeks: Math.max(1, Math.round(durationDays / 7)),
    carryoverByKr,
    velocityHistory,
  })

  // 4. Provider call.
  const provider = getProvider(req.provider) // throws ProviderNotConfiguredError → caller surfaces 503
  const t0 = Date.now()
  let aiResult
  try {
    aiResult = await provider.generateSprintPlan(
      {
        bundle,
        allocations,
        carryoverCandidates: await hydrateCarryoverForProvider(classified),
        sprintStart,
        sprintEnd,
        durationDays,
      },
      // 32k headroom is needed because gpt-5.5 (and other reasoning models) consume
      // thousands of "reasoning tokens" before emitting visible output. With 8k we hit
      // the limit and the API returns empty content. See lib/ai/providers/openai.ts.
      { modelId, maxOutputTokens: 32000 }
    )
  } catch (err) {
    const latencyMs = Date.now() - t0
    await recordGenerationLog({
      userId: req.requester.userId,
      feature: AI_FEATURE_KEYS.SPRINT_PLAN,
      provider: req.provider,
      modelId,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      latencyMs,
      status: 'ERROR',
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    if (err instanceof ProviderCallError) throw err
    if (err instanceof ProviderNotConfiguredError) throw err
    throw err
  }
  const latencyMs = Date.now() - t0

  // 5. Persist (single transaction so partial writes can't leak).
  const krIdSet = new Set(bundle.keyResults.map((k) => k.id))
  const objIdSet = new Set(bundle.objectives.map((o) => o.id))

  const persisted = await prisma.$transaction(async (tx) => {
    // Reuse the existing team sprint — the AI never creates one.
    const sprint = targetSprint

    // Persist proposed todos. Filter out any that reference KRs/objectives outside scope.
    // Note: aiSuggested=true means "still pending review" — these only become real
    // board cards after /accept moves them out of draft. To avoid mixing draft tasks
    // into the kanban prematurely, we leave aiSuggested=true and rely on the board
    // query to filter them out (or surface them with a badge).
    const todosToCreate = aiResult.plan.proposedTodos.filter(
      (t) => (t.keyResultId && krIdSet.has(t.keyResultId)) || (t.objectiveId && objIdSet.has(t.objectiveId))
    )
    const proposedTodoIds: string[] = []
    for (const t of todosToCreate) {
      const created = await tx.todo.create({
        data: {
          title: t.title,
          description: t.description ?? null,
          status: 'PENDING',
          priority: t.priority,
          assigneeId: req.subjectUserId,
          creatorId: req.requester.userId,
          keyResultId: t.keyResultId ?? null,
          objectiveId: t.objectiveId ?? null,
          dueDate: parseDateSafe(t.dueDate),
          progressValue: t.progressValue,
          taskType: t.taskType,
          sprintId: sprint.id,
          aiSuggested: true,
          ambitionLevel: t.ambitionLevel,
          originalSprintId: sprint.id,
          carryoverCount: 0,
        },
      })
      proposedTodoIds.push(created.id)
    }

    // Carryover plan: store the per-todo disposition on the Todo row so /accept can apply it.
    // Forced dispositions win over the AI's choice.
    for (const c of classified) {
      const aiDecision = aiResult.plan.carryoverDispositions.find((d) => d.todoId === c.todo.id)
      const finalDisposition = c.candidate.forcedDisposition ?? aiDecision?.disposition ?? null
      if (!finalDisposition) continue
      await tx.todo.update({
        where: { id: c.todo.id },
        data: { carryoverDisposition: finalDisposition },
      })
    }

    // AiSprintPlan record.
    const plan = await tx.aiSprintPlan.create({
      data: {
        sprintId: sprint.id,
        subjectUserId: req.subjectUserId,
        generatedById: req.requester.userId,
        provider: req.provider,
        modelId,
        promptTokens: aiResult.usage.inputTokens,
        outputTokens: aiResult.usage.outputTokens,
        cachedTokens: aiResult.usage.cachedTokens,
        rationale: aiResult.plan.rationale,
        allocations: allocations as unknown as object,
        prevSprintReview: aiResult.plan.prevSprintReview as unknown as object,
        carryoverSummary: summarize(
          classified.map((c) => ({
            candidate: c.candidate,
            aiDisposition: aiResult.plan.carryoverDispositions.find((d) => d.todoId === c.todo.id)?.disposition,
          }))
        ) as unknown as object,
        feedback: req.feedback ?? null,
        status: 'DRAFT',
      },
    })

    // ActivityLog.
    await tx.activityLog.create({
      data: {
        entityType: 'SPRINT',
        sprintId: sprint.id,
        action: 'SPRINT_AI_GENERATED',
        actorId: req.requester.userId,
        metadata: {
          provider: req.provider,
          modelId,
          mode: req.mode,
          proposedTodoCount: proposedTodoIds.length,
        } as unknown as object,
      },
    })

    return { sprint, plan, proposedTodoIds }
  })

  // Audit log row (best-effort; outside the txn so a logging failure doesn't roll the plan back).
  await recordGenerationLog({
    userId: req.requester.userId,
    feature: AI_FEATURE_KEYS.SPRINT_PLAN,
    provider: req.provider,
    modelId,
    inputTokens: aiResult.usage.inputTokens,
    outputTokens: aiResult.usage.outputTokens,
    cachedTokens: aiResult.usage.cachedTokens,
    latencyMs,
    status: 'OK',
    planId: persisted.plan.id,
  })

  return {
    planId: persisted.plan.id,
    sprintId: persisted.sprint.id,
    proposedTodoIds: persisted.proposedTodoIds,
    outOfScopeCarryover: bundle.outOfScopeCarryover,
    plan: aiResult.plan,
    provider: req.provider,
    modelId,
    usage: aiResult.usage,
    latencyMs,
  }
}

// Hydrate the carryover input shape with todo titles (the bundler stripped them).
async function hydrateCarryoverForProvider(
  classified: Array<{
    todo: { id: string }
    candidate: import('./carryover').CarryoverCandidate
  }>
) {
  if (!classified.length) return []
  const todos = await prisma.todo.findMany({
    where: { id: { in: classified.map((c) => c.todo.id) } },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      progressValue: true,
      carryoverCount: true,
    },
  })
  const byId = new Map(todos.map((t) => [t.id, t]))
  return classified
    .map((c) => {
      const t = byId.get(c.todo.id)
      if (!t) return null
      return {
        candidate: c.candidate,
        todo: {
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          progressValue: t.progressValue,
          carryoverCount: t.carryoverCount,
        },
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}

function parseDateSafe(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}
