/**
 * Phase 3 end-to-end smoke test for the OpenAI sprint-plan provider.
 *
 * Loads a real subject from the local DB, runs the full deterministic pipeline
 * (context bundle → math allocations → carryover triage), then calls the
 * OpenAI provider and prints the resulting sprint_plan. Exits non-zero on any
 * failure so a CI / shell can detect it.
 *
 * Costs $$ — every run hits the OpenAI API. Keep it short.
 *
 * Usage:
 *   tsx scripts/test-openai-provider.ts [--subject=<userId|email>] [--model=<id>] [--mode=AUTO|MANUAL]
 *
 * Defaults: first ADMIN user, AUTO mode, model from AI_OPENAI_PLANNER_MODEL env
 * or `gpt-5.5-thinking` if unset.
 */

import { prisma } from '../lib/prisma'
import { buildContextBundle, type GenerationMode } from '../lib/ai/context-bundler'
import { buildAllocations, type KrForMath, type PrevSprintTodoOutcome } from '../lib/ai/sprint-math'
import { selectIncomplete, classifyCandidate, carryoverDeltaByKr } from '../lib/ai/carryover'
import { getProvider } from '../lib/ai/providers'
import { ProviderCallError, ProviderNotConfiguredError } from '../lib/ai/providers/types'
import { hasProviderKey } from '../lib/ai/config'
import { estimateCostUsd } from '../lib/ai/cost'

interface CliArgs {
  subject?: string
  model: string
  mode: GenerationMode
}

function parseArgs(): CliArgs {
  const flag = (name: string) => {
    const a = process.argv.find((x) => x.startsWith(`--${name}=`))
    return a ? a.slice(name.length + 3) : undefined
  }
  return {
    subject: flag('subject'),
    model: flag('model') ?? process.env.AI_OPENAI_PLANNER_MODEL ?? 'gpt-5.5-thinking',
    mode: ((flag('mode') ?? 'AUTO').toUpperCase() as GenerationMode) || 'AUTO',
  }
}

async function resolveSubject(input?: string) {
  if (input) {
    if (input.includes('@')) return prisma.user.findUnique({ where: { email: input } })
    return prisma.user.findUnique({ where: { id: input } })
  }
  return prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true, ownedObjectives: { some: { status: 'ACTIVE' } } },
  })
}

function nextMonday(from: Date): Date {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const delta = ((1 - dow + 7) % 7) || 7
  d.setDate(d.getDate() + delta)
  return d
}

async function main() {
  const args = parseArgs()
  console.log(`\nOpenAI provider smoke test`)
  console.log(`  model: ${args.model}`)
  console.log(`  mode:  ${args.mode}`)

  if (!hasProviderKey('openai')) {
    console.error('OPENAI_API_KEY is not set in env. Add it to .env and re-run.')
    process.exit(1)
  }

  const subject = await resolveSubject(args.subject)
  if (!subject) {
    console.error('No subject with active OKRs found. Pass --subject=<email>.')
    process.exit(1)
  }
  console.log(`  subject: ${subject.email} (${subject.role})`)

  const sprintStart = nextMonday(new Date())
  const durationDays = 14
  const sprintEnd = new Date(sprintStart.getTime() + durationDays * 86400000)
  console.log(`  window: ${sprintStart.toISOString().slice(0, 10)} → ${sprintEnd.toISOString().slice(0, 10)}\n`)

  // 1. Context bundle.
  const bundle = await buildContextBundle({
    subjectUserId: subject.id,
    requester: { userId: subject.id, role: subject.role as 'ADMIN' | 'EMPLOYEE' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' },
    mode: args.mode,
    sprintStart,
  })
  console.log(
    `Bundle: ${bundle.objectives.length} objectives, ${bundle.keyResults.length} KRs, ` +
      `${bundle.priorSprints.length} prior sprints, ${bundle.carryoverCandidates.length} carryover candidates`
  )

  if (bundle.keyResults.length === 0) {
    console.error('Subject has no in-scope KRs — nothing to plan around.')
    process.exit(1)
  }

  // 2. Carryover classification.
  const incomplete = selectIncomplete(bundle.carryoverCandidates)
  const classified = incomplete.map((t) => ({
    todo: t,
    candidate: classifyCandidate(t, sprintStart),
  }))

  // 3. Math allocations.
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
    sprintDurationWeeks: 2,
    carryoverByKr,
    velocityHistory,
  })

  // 4. Provider call.
  console.log(`Calling OpenAI (${args.model})…`)
  const t0 = Date.now()
  let result
  try {
    const provider = getProvider('openai')
    result = await provider.generateSprintPlan(
      {
        bundle,
        allocations,
        carryoverCandidates: classified.map((c) => ({
          candidate: c.candidate,
          todo: {
            id: c.todo.id,
            title: 'unknown',
            status: c.todo.status,
            dueDate: c.todo.dueDate,
            progressValue: c.todo.progressValue,
            carryoverCount: c.todo.carryoverCount,
          },
        })),
        sprintStart,
        sprintEnd,
        durationDays,
      },
      { modelId: args.model, maxOutputTokens: 8000 }
    )
  } catch (err) {
    const ms = Date.now() - t0
    if (err instanceof ProviderNotConfiguredError) {
      console.error(`Provider not configured: ${err.provider}`)
    } else if (err instanceof ProviderCallError) {
      console.error(`Provider call failed (${err.provider}/${err.modelId}) after ${ms}ms:`)
      console.error(err.message)
      const cause = err.cause as { status?: number; message?: string; code?: string } | undefined
      if (cause?.status) console.error(`  HTTP status: ${cause.status}`)
      if (cause?.code) console.error(`  Error code: ${cause.code}`)
      if (cause?.message && cause.message !== err.message) console.error(`  Cause: ${cause.message}`)
    } else {
      console.error(err)
    }
    process.exit(1)
  }

  const ms = Date.now() - t0
  const cost = estimateCostUsd({
    modelId: args.model,
    inputTokens: result.usage.inputTokens,
    cachedTokens: result.usage.cachedTokens,
    outputTokens: result.usage.outputTokens,
  })

  console.log(`\n----- OpenAI response -----`)
  console.log(
    `Latency: ${ms}ms | Tokens: ${result.usage.inputTokens} in (${result.usage.cachedTokens} cached) / ${result.usage.outputTokens} out | Cost: $${cost.toFixed(6)}\n`
  )
  console.log(`Rationale (first 500 chars):`)
  console.log(result.plan.rationale.slice(0, 500))
  console.log(
    `\nProposed todos: ${result.plan.proposedTodos.length}, Carryover dispositions: ${result.plan.carryoverDispositions.length}, sprintDebt=${result.plan.sprintDebt}`
  )
  for (const t of result.plan.proposedTodos.slice(0, 5)) {
    console.log(
      `  • [${t.priority}/${t.ambitionLevel}] "${t.title}" → KR ${t.keyResultId?.slice(0, 8) ?? 'none'} (${t.progressValue}, due ${t.dueDate})`
    )
  }
  if (result.plan.proposedTodos.length > 5) {
    console.log(`  … (+${result.plan.proposedTodos.length - 5} more)`)
  }

  // ---- Invariants --------------------------------------------------------
  let pass = 0
  let fail = 0
  const check = (name: string, ok: boolean, detail?: string) => {
    if (ok) {
      console.log(`  ✓ ${name}`)
      pass += 1
    } else {
      console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
      fail += 1
    }
  }
  console.log(`\n----- Invariants -----`)
  check('rationale is non-empty', result.plan.rationale.length >= 20)
  check(
    'every proposed todo has a valid KR or objective link',
    result.plan.proposedTodos.every((t) => t.keyResultId || t.objectiveId)
  )
  check(
    'every proposed todo dueDate is within sprint window',
    result.plan.proposedTodos.every((t) => {
      const d = new Date(t.dueDate)
      return d >= sprintStart && d <= sprintEnd
    })
  )
  check(
    'forced carryover dispositions are honored',
    classified.every((c) => {
      if (!c.candidate.forcedDisposition) return true
      const matched = result.plan.carryoverDispositions.find((d) => d.todoId === c.todo.id)
      return !matched || matched.disposition === c.candidate.forcedDisposition
    })
  )
  check(
    'no proposed todo for a saturated KR',
    allocations.every((a) => {
      if (!a.saturated) return true
      const cnt = result.plan.proposedTodos.filter((t) => t.keyResultId === a.keyResultId).length
      return cnt === 0
    })
  )

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
