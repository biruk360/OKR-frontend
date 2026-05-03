/**
 * Phase 2 smoke-test for the AI sprint planning math + carryover + context bundler.
 *
 * Loads a real subject from the live DB, builds a context bundle in AUTO mode,
 * runs the math layer + carryover classifier, and asserts a set of invariants
 * against current production data shape (sparse weights, missing dueDates,
 * placeholder owners, etc.). Used as a manual replacement for unit tests until
 * a test framework is added.
 *
 * Usage:
 *   tsx scripts/validate-ai-math.ts [--subject=<userId|email>] [--mode=AUTO|MANUAL] [--krs=<csv>]
 *
 * Examples:
 *   tsx scripts/validate-ai-math.ts                                 # picks first ADMIN
 *   tsx scripts/validate-ai-math.ts --subject=biruk@360ground.com
 *   tsx scripts/validate-ai-math.ts --mode=MANUAL --subject=biruk@360ground.com --krs=cmnxb...,cmnxb...
 *
 * Exit codes:
 *   0 — all invariants pass
 *   1 — at least one invariant failed (non-zero so CI / shells can detect)
 */

import { prisma } from '../lib/prisma'
import { buildContextBundle, type GenerationMode } from '../lib/ai/context-bundler'
import {
  buildAllocations,
  computeWeeksLeft,
  computeSprintsLeft,
  isSprintDebt,
  type KrForMath,
  type PrevSprintTodoOutcome,
} from '../lib/ai/sprint-math'
import { selectIncomplete, classifyCandidate, carryoverDeltaByKr, summarize } from '../lib/ai/carryover'

interface CliArgs {
  subject?: string
  mode: GenerationMode
  krs?: string[]
}

function parseArgs(): CliArgs {
  const flag = (name: string) => {
    const a = process.argv.find((x) => x.startsWith(`--${name}=`))
    return a ? a.slice(name.length + 3) : undefined
  }
  const mode = (flag('mode') ?? 'AUTO').toUpperCase() as GenerationMode
  const krs = flag('krs')?.split(',').filter(Boolean)
  return { subject: flag('subject'), mode, krs }
}

interface Check {
  name: string
  ok: boolean
  detail?: string
}

const checks: Check[] = []
function assert(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail })
}

async function resolveSubject(input?: string) {
  if (input) {
    if (input.includes('@')) {
      return prisma.user.findUnique({ where: { email: input } })
    }
    return prisma.user.findUnique({ where: { id: input } })
  }
  return prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } })
}

async function main() {
  const args = parseArgs()
  console.log(`\nAI math validator — mode=${args.mode}\n`)

  const subject = await resolveSubject(args.subject)
  if (!subject) {
    console.error('No subject found.')
    process.exit(1)
  }
  console.log(`Subject: ${subject.email} (${subject.role})`)

  const sprintStart = nextMonday(new Date())
  console.log(`Sprint start: ${sprintStart.toISOString().slice(0, 10)}`)

  let bundle
  try {
    bundle = await buildContextBundle({
      subjectUserId: subject.id,
      requester: { userId: subject.id, role: subject.role as 'ADMIN' | 'EMPLOYEE' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' },
      mode: args.mode,
      objectiveIds: [],
      keyResultIds: args.krs ?? [],
      sprintStart,
    })
  } catch (err) {
    console.error('Bundle build failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  console.log(
    `Bundle: ${bundle.objectives.length} objectives, ${bundle.keyResults.length} KRs, ` +
      `${bundle.priorSprints.length} prior sprints, ` +
      `${bundle.carryoverCandidates.length} carryover candidates, ` +
      `${bundle.crossTeamOffTrackKrs.length} cross-team off-track KRs\n`
  )

  // ---- Bundle invariants -------------------------------------------------
  assert('subject is active', bundle.subject.isActive)
  assert(
    'every KR references an in-bundle objective',
    bundle.keyResults.every((k) => bundle.objectives.some((o) => o.id === k.objectiveId)),
    'orphan KRs found'
  )
  assert('mode field round-trips', bundle.mode === args.mode)
  if (args.mode === 'MANUAL') {
    const wantSet = new Set(args.krs ?? [])
    assert(
      'MANUAL bundle KRs match requested ids',
      bundle.keyResults.length === wantSet.size && bundle.keyResults.every((k) => wantSet.has(k.id))
    )
    assert('MANUAL has no cross-team signal', bundle.crossTeamOffTrackKrs.length === 0)
  }

  // ---- Carryover classification -----------------------------------------
  const incomplete = selectIncomplete(bundle.carryoverCandidates)
  const classified = incomplete.map((t) => ({
    todo: t,
    candidate: classifyCandidate(t, sprintStart),
  }))

  const forced = classified.filter((c) => c.candidate.forcedDisposition !== null)
  console.log(
    `Carryover: ${incomplete.length} incomplete, ${forced.length} server-forced, ` +
      `${classified.filter((c) => c.candidate.staleDueDate).length} stale due-dates\n`
  )
  for (const c of classified) {
    if (c.candidate.forcedDisposition) {
      console.log(
        `  [forced ${c.candidate.forcedDisposition}/${c.candidate.forcedReason}] ${c.todo.id.slice(0, 8)}…`
      )
    }
  }

  assert(
    'no archived KR allowed plain KEEP',
    classified.every(
      (c) =>
        !(c.todo.keyResult && (c.todo.keyResult.status !== 'ACTIVE' || c.todo.keyResult.archivedAt)) ||
        c.candidate.forcedDisposition === 'DESCOPE'
    )
  )
  assert(
    'inactive assignee is forced ESCALATE',
    classified.every((c) => c.todo.assignee.isActive || c.candidate.forcedDisposition === 'ESCALATE')
  )
  assert(
    'repeat carryover (>=2) disallows KEEP',
    classified.every((c) => c.todo.carryoverCount < 2 || c.candidate.disallowed.includes('KEEP'))
  )

  // ---- Math layer --------------------------------------------------------
  const krsForMath: KrForMath[] = bundle.keyResults.map((k) => ({
    id: k.id,
    objectiveId: k.objectiveId,
    startValue: k.startValue,
    targetValue: k.targetValue,
    currentValue: k.currentValue,
    weight: k.weight,
    confidence: k.confidence,
  }))

  // Use prior sprint outcomes for velocity. progressValue || 0 so binary tasks don't skew.
  const velocityHistory: PrevSprintTodoOutcome[] = bundle.priorSprints.flatMap((s) =>
    s.todos.map((t) => ({
      planned: t.progressValue ?? 0,
      delivered: t.status === 'COMPLETED' ? t.progressValue ?? 0 : 0,
    }))
  )

  // Carryover delta from forced dispositions only — Phase 2 doesn't run the AI yet.
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

  console.log(
    `Math: weeksLeft=${computeWeeksLeft(tfEnd, sprintStart)}, ` +
      `sprintsLeft=${computeSprintsLeft(computeWeeksLeft(tfEnd, sprintStart), 2)}, ` +
      `${allocations.length} allocation rows, ` +
      `velocityFactor=${allocations[0]?.velocityFactor.toFixed(2) ?? 'n/a'}\n`
  )

  assert('one allocation row per KR', allocations.length === krsForMath.length)
  assert(
    'no NaN in allocations',
    allocations.every(
      (r) =>
        Number.isFinite(r.linearShare) &&
        Number.isFinite(r.plannedDelta) &&
        Number.isFinite(r.velocityFactor) &&
        Number.isFinite(r.timeBudgetPct) &&
        Number.isFinite(r.weightShare)
    )
  )
  assert(
    'velocityFactor in [0.5, 1.5]',
    allocations.every((r) => r.velocityFactor >= 0.5 && r.velocityFactor <= 1.5)
  )
  assert('plannedDelta non-negative', allocations.every((r) => r.plannedDelta >= 0))
  assert(
    'saturated rows have plannedDelta == 0',
    allocations.every((r) => !r.saturated || r.plannedDelta === 0)
  )

  // Weight-share sums to ~1 per objective. Group rows by objective via the KR map.
  const krToObj = new Map(krsForMath.map((k) => [k.id, k.objectiveId]))
  const sumsByObj = new Map<string, number>()
  for (const r of allocations) {
    const oid = krToObj.get(r.keyResultId)
    if (!oid) continue
    sumsByObj.set(oid, (sumsByObj.get(oid) ?? 0) + r.weightShare)
  }
  let weightOk = true
  sumsByObj.forEach((s) => {
    if (Math.abs(s - 1) > 0.001) weightOk = false
  })
  assert('weightShare sums to 1.0 per objective (within 0.001)', weightOk)

  console.log(`Sprint debt? ${isSprintDebt(allocations)}`)
  console.log(`Carryover summary:`, summarize(classified.map((c) => ({ candidate: c.candidate }))))

  // ---- Report ------------------------------------------------------------
  console.log('\n----- Invariants -----')
  let pass = 0
  let fail = 0
  for (const c of checks) {
    if (c.ok) {
      console.log(`  ✓ ${c.name}`)
      pass += 1
    } else {
      console.log(`  ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
      fail += 1
    }
  }
  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

function nextMonday(from: Date): Date {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const delta = ((1 - dow + 7) % 7) || 7
  d.setDate(d.getDate() + delta)
  return d
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
