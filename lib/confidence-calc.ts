import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { absoluteUrl } from '@/lib/notifications/deep-link'

function krLink(id: string): string {
  return absoluteUrl(`/dashboard/key-results/${id}`)
}

/**
 * Bi-weekly confidence auto-calculation.
 *
 * Runs every two weeks starting at the 1st and ~15th of each month.
 * For each active Key Result:
 *   1. Compute a 0–100 confidence score based on:
 *      - Progress % vs expected progress % (time-elapsed curve)
 *      - Absolute progress distance to target
 *      - Velocity (recent check-in delta vs time remaining)
 *      - Initiative completion ratio
 *      - Days since last check-in (staleness penalty)
 *   2. Map score → ON_TRACK / AT_RISK / OFF_TRACK
 *   3. Persist a ConfidenceSnapshot row
 *   4. Update KR.confidence + Objective.goalStatus
 *
 * For each Objective:
 *   goalStatus = worst(child KR confidences) — if any KR is OFF_TRACK, the
 *   objective is OFF_TRACK; if any is AT_RISK, AT_RISK; else ON_TRACK.
 *
 * Email: one digest per owner (individual), one per department lead, one for admins.
 */

// ─── Score computation ───

export interface KrForCalc {
  id: string
  title: string
  startValue: number
  targetValue: number
  currentValue: number
  progress: number
  confidence: string
  ownerId: string
  objectiveId: string
  createdAt: Date
  updatedAt?: Date
  _count?: { checkIns: number; todos: number }
  objective: {
    id: string
    title: string
    ownerId: string
    endDate: Date | null
    startDate: Date | null
    timeframe: { startDate: Date; endDate: Date }
    departmentId: string | null
  }
  /** Linked initiatives. Either this or `todoStats` (pre-aggregated counts) is required. */
  todos?: { status: string }[]
  todoStats?: { total: number; completed: number }
  checkIns: { asOfDate: Date; value: number }[]
}

interface ScoreResult {
  score: number
  confidence: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'
  factors: {
    progressPct: number
    expectedProgressPct: number
    timeElapsedPct: number
    velocity: number
    initiativeCompletionPct: number
    daysSinceLastCheckIn: number | null
    stalenessPenalty: number
  }
}

export function computeKrConfidence(kr: KrForCalc, now: Date = new Date()): ScoreResult {
  const tfStart = kr.objective.startDate ?? kr.objective.timeframe.startDate
  const tfEnd = kr.objective.endDate ?? kr.objective.timeframe.endDate
  const totalMs = Math.max(tfEnd.getTime() - tfStart.getTime(), 1)
  const elapsedMs = Math.max(now.getTime() - tfStart.getTime(), 0)
  const timeElapsedPct = Math.min((elapsedMs / totalMs) * 100, 100)

  const range = Math.abs(kr.targetValue - kr.startValue) || 1
  const progressPct = Math.min(Math.max((Math.abs(kr.currentValue - kr.startValue) / range) * 100, 0), 100)

  // Expected progress: linear interpolation of time elapsed
  const expectedProgressPct = timeElapsedPct

  // Velocity: progress gain per day over the last 14 days from check-ins
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400_000)
  const recentCheckIns = (kr.checkIns || [])
    .filter((c) => c.asOfDate >= twoWeeksAgo)
    .sort((a, b) => a.asOfDate.getTime() - b.asOfDate.getTime())
  let velocity = 0
  if (recentCheckIns.length >= 2) {
    const first = recentCheckIns[0]
    const last = recentCheckIns[recentCheckIns.length - 1]
    const daySpan = Math.max((last.asOfDate.getTime() - first.asOfDate.getTime()) / 86400_000, 1)
    velocity = ((last.value - first.value) / range * 100) / daySpan
  }

  // Initiative completion ratio
  const totalInitiatives = kr.todoStats ? kr.todoStats.total : (kr.todos?.length ?? 0)
  const completedInitiatives = kr.todoStats
    ? kr.todoStats.completed
    : (kr.todos ?? []).filter((t) => t.status === 'COMPLETED').length
  const initiativeCompletionPct = totalInitiatives > 0 ? (completedInitiatives / totalInitiatives) * 100 : 50

  // Staleness: days since last check-in or last update
  const lastCheckIn = kr.checkIns.length > 0
    ? kr.checkIns.reduce((latest, c) => (c.asOfDate > latest ? c.asOfDate : latest), kr.checkIns[0].asOfDate)
    : null
  const daysSinceLastCheckIn = lastCheckIn
    ? Math.floor((now.getTime() - lastCheckIn.getTime()) / 86400_000)
    : null
  // Penalty: 0 if checked in within 7 days, up to -20 if 30+ days stale
  const stalenessPenalty = daysSinceLastCheckIn !== null
    ? Math.min(Math.max((daysSinceLastCheckIn - 7) * 1.5, 0), 20)
    : 10 // No check-ins at all → moderate penalty

  // Composite score (0–100)
  // Weight: progress gap (40%), velocity projection (25%), initiative completion (15%), staleness (20%)
  const progressGapScore = Math.max(100 - Math.abs(progressPct - expectedProgressPct) * 2, 0)
  const velocityScore = velocity > 0 ? Math.min(velocity * 20, 100) : Math.max(50 + velocity * 10, 0)
  const initiativeScore = initiativeCompletionPct

  let score =
    progressGapScore * 0.4 +
    velocityScore * 0.25 +
    initiativeScore * 0.15 +
    (100 - stalenessPenalty * 5) * 0.2

  score = Math.round(Math.min(Math.max(score, 0), 100))

  // If progress is already 100%, it's ON_TRACK regardless
  if (progressPct >= 100) score = 100

  const confidence: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' =
    score >= 65 ? 'ON_TRACK' : score >= 35 ? 'AT_RISK' : 'OFF_TRACK'

  return {
    score,
    confidence,
    factors: {
      progressPct: Math.round(progressPct * 10) / 10,
      expectedProgressPct: Math.round(expectedProgressPct * 10) / 10,
      timeElapsedPct: Math.round(timeElapsedPct * 10) / 10,
      velocity: Math.round(velocity * 100) / 100,
      initiativeCompletionPct: Math.round(initiativeCompletionPct),
      daysSinceLastCheckIn,
      stalenessPenalty: Math.round(stalenessPenalty * 10) / 10,
    },
  }
}

// ─── Loading + batching helpers (shared by the daily and bi-weekly jobs) ───

type Confidence = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'

const DAY_MS = 86400_000
/**
 * KRs whose objective window ended more than this long ago are out of scope for
 * the crons. The grace lets the first bi-weekly run after a period closes record
 * one final assessment; after that the KR's confidence stays as last computed.
 */
export const ENDED_GRACE_DAYS = 14
/** Mirrors the velocity window in computeKrConfidence. */
const VELOCITY_WINDOW_DAYS = 14
/** Mirrors the historic `checkIns: { take: 30 }` per KR. */
const MAX_CHECKINS_PER_KR = 30
/** Rows per `$transaction([...])` write batch. */
const WRITE_CHUNK = 100
/** Ids per `IN (...)` read. */
const READ_CHUNK = 1000

/** Worst-of rollup: any OFF_TRACK → OFF_TRACK, else any AT_RISK → AT_RISK, else ON_TRACK. */
export function worstOfConfidences(list: Iterable<string>): Confidence {
  let worst: Confidence = 'ON_TRACK'
  for (const c of Array.from(list)) {
    if (c === 'OFF_TRACK') return 'OFF_TRACK'
    if (c === 'AT_RISK') worst = 'AT_RISK'
  }
  return worst
}

/**
 * Only KRs in a timeframe that has not ended (effective end = objective.endDate
 * override, else timeframe.endDate — the same end computeKrConfidence uses), with
 * a short grace window. Ended periods used to be rescored on every run for nothing.
 */
export function inScopeKrWhere(now: Date): Prisma.KeyResultWhereInput {
  const cutoff = new Date(now.getTime() - ENDED_GRACE_DAYS * DAY_MS)
  return {
    status: 'ACTIVE',
    objective: {
      OR: [
        { endDate: { gte: cutoff } },
        { endDate: null, timeframe: { endDate: { gte: cutoff } } },
      ],
    },
  }
}

const krBaseSelect = {
  id: true,
  title: true,
  startValue: true,
  targetValue: true,
  currentValue: true,
  progress: true,
  confidence: true,
  ownerId: true,
  objectiveId: true,
  createdAt: true,
  objective: {
    select: {
      id: true,
      title: true,
      ownerId: true,
      startDate: true,
      endDate: true,
      departmentId: true,
      timeframe: { select: { startDate: true, endDate: true } },
    },
  },
} satisfies Prisma.KeyResultSelect

type KrBase = Prisma.KeyResultGetPayload<{ select: typeof krBaseSelect }>

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Assemble the scoring input from batched reads. Produces the same score as the
 * old per-KR include (`todos` + newest 30 check-ins): the scorer only looks at
 * check-ins inside the velocity window plus the single latest check-in.
 *
 * - `recentCheckIns`: this KR's check-ins with asOfDate >= now - 14d, newest first.
 * - `lastCheckInAt`: this KR's newest check-in date overall (null if none).
 */
export function buildKrForCalc(
  base: KrBase | KrForCalc,
  todoStats: { total: number; completed: number },
  recentCheckIns: Array<{ asOfDate: Date; value: number }>,
  lastCheckInAt: Date | null,
): KrForCalc {
  const checkIns = recentCheckIns.slice(0, MAX_CHECKINS_PER_KR)
  // No check-in inside the window: the latest one (outside the window) still
  // drives the staleness penalty. Its value is never read — it is older than
  // the velocity window, so computeKrConfidence filters it out.
  if (checkIns.length === 0 && lastCheckInAt) checkIns.push({ asOfDate: lastCheckInAt, value: 0 })
  return { ...(base as KrForCalc), todos: undefined, todoStats, checkIns }
}

/** Newest check-in date per KR (one grouped query per id chunk). */
async function loadLastCheckInAt(krIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>()
  for (const ids of chunk(krIds, READ_CHUNK)) {
    const rows = await prisma.keyResultCheckIn.groupBy({
      by: ['keyResultId'],
      where: { keyResultId: { in: ids } },
      _max: { asOfDate: true },
    })
    for (const r of rows) if (r._max.asOfDate) out.set(r.keyResultId, r._max.asOfDate)
  }
  return out
}

/** Todo counts + in-window check-ins for a set of KRs, then the scoring input for each. */
async function hydrateKrs(
  bases: KrBase[],
  lastCheckIns: Map<string, Date>,
  now: Date,
): Promise<KrForCalc[]> {
  const todoStats = new Map<string, { total: number; completed: number }>()
  const recent = new Map<string, Array<{ asOfDate: Date; value: number }>>()
  const windowStart = new Date(now.getTime() - VELOCITY_WINDOW_DAYS * DAY_MS)

  for (const ids of chunk(bases.map((k) => k.id), READ_CHUNK)) {
    const [todoGroups, checkIns] = await Promise.all([
      prisma.todo.groupBy({
        by: ['keyResultId', 'status'],
        where: { keyResultId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.keyResultCheckIn.findMany({
        where: { keyResultId: { in: ids }, asOfDate: { gte: windowStart } },
        select: { keyResultId: true, asOfDate: true, value: true },
        orderBy: { asOfDate: 'desc' },
      }),
    ])
    for (const g of todoGroups) {
      if (!g.keyResultId) continue
      const s = todoStats.get(g.keyResultId) ?? { total: 0, completed: 0 }
      s.total += g._count._all
      if (g.status === 'COMPLETED') s.completed += g._count._all
      todoStats.set(g.keyResultId, s)
    }
    for (const c of checkIns) {
      const list = recent.get(c.keyResultId)
      if (list) list.push({ asOfDate: c.asOfDate, value: c.value })
      else recent.set(c.keyResultId, [{ asOfDate: c.asOfDate, value: c.value }])
    }
  }

  return bases.map((kr) =>
    buildKrForCalc(
      kr,
      todoStats.get(kr.id) ?? { total: 0, completed: 0 },
      recent.get(kr.id) ?? [],
      lastCheckIns.get(kr.id) ?? null,
    ),
  )
}

/**
 * Run writes in `$transaction([...])` batches of WRITE_CHUNK items. If a batch
 * fails, retry its items one by one so a single bad row costs one error, not a
 * hundred (preserves the old per-row error accounting).
 */
async function writeInChunks<T>(
  items: T[],
  build: (item: T) => Prisma.PrismaPromise<unknown>[],
  onItemError: (item: T, err: unknown) => void,
): Promise<T[]> {
  const ok: T[] = []
  for (const batch of chunk(items, WRITE_CHUNK)) {
    const ops = batch.flatMap(build)
    try {
      if (ops.length > 0) await prisma.$transaction(ops)
      ok.push(...batch)
    } catch {
      for (const item of batch) {
        try {
          const itemOps = build(item)
          if (itemOps.length > 0) await prisma.$transaction(itemOps)
          ok.push(item)
        } catch (err) {
          onItemError(item, err)
        }
      }
    }
  }
  return ok
}

function krSnapshotUpsert(
  kr: KrForCalc,
  result: ScoreResult,
  periodStart: string,
  factors: string,
): Prisma.PrismaPromise<unknown> {
  const data = { confidence: result.confidence, score: result.score, factors, previousConf: kr.confidence }
  return prisma.confidenceSnapshot.upsert({
    where: { entityType_entityId_periodStart: { entityType: 'KEY_RESULT', entityId: kr.id, periodStart } },
    create: { entityType: 'KEY_RESULT', entityId: kr.id, periodStart, ...data },
    update: data,
  })
}

/**
 * Daily auto-confidence recompute for *stale* OKRs only.
 *
 * Triggered once per day. For each active KR in a not-yet-ended timeframe whose
 * last user-driven update (i.e. last KeyResultCheckIn.asOfDate) is more than
 * `staleDays` ago, recompute confidence using the same scoring function used by
 * the bi-weekly job, then propagate to the parent objective's goalStatus.
 * Snapshots are stored with today's date as the periodStart so we get one row
 * per (entity, day).
 *
 * Does NOT send emails — daily noise would be excessive. The bi-weekly job
 * still owns the emailing.
 */
export async function runDailyAutoConfidence(opts: { staleDays?: number; now?: Date } = {}): Promise<{
  scanned: number
  staleProcessed: number
  objectivesUpdated: number
  errors: number
}> {
  const now = opts.now ?? new Date()
  const staleDays = opts.staleDays ?? 14
  const cutoff = new Date(now.getTime() - staleDays * DAY_MS)
  const periodStart = now.toISOString().slice(0, 10)

  let errors = 0

  // Stale = no check-in since cutoff. Base rows first (narrow select), then the
  // newest check-in per KR in one grouped query; only stale KRs get hydrated.
  const bases = await prisma.keyResult.findMany({ where: inScopeKrWhere(now), select: krBaseSelect })
  const scanned = bases.length
  const lastCheckIns = await loadLastCheckInAt(bases.map((k) => k.id))
  const staleBases = bases.filter((kr) => (lastCheckIns.get(kr.id) ?? kr.createdAt) < cutoff)
  const staleKrs = await hydrateKrs(staleBases, lastCheckIns, now)

  const scored: Array<{ kr: KrForCalc; result: ScoreResult }> = []
  for (const kr of staleKrs) {
    try {
      scored.push({ kr, result: computeKrConfidence(kr, now) })
    } catch (err) {
      console.error(`[auto-confidence] failed for KR ${kr.id}:`, err)
      errors++
    }
  }

  const written = await writeInChunks(
    scored,
    ({ kr, result }) => {
      const ops: Prisma.PrismaPromise<unknown>[] = [
        krSnapshotUpsert(kr, result, periodStart, JSON.stringify({ ...result.factors, source: 'daily-auto', staleDays })),
      ]
      if (kr.confidence !== result.confidence) {
        ops.push(prisma.keyResult.update({ where: { id: kr.id }, data: { confidence: result.confidence } }))
      }
      return ops
    },
    ({ kr }, err) => {
      console.error(`[auto-confidence] failed for KR ${kr.id}:`, err)
      errors++
    },
  )
  const staleProcessed = written.length

  // Rollup objective goalStatus = worst-of(all ACTIVE children, which now include
  // the recomputed stale ones). One batched read instead of one per objective.
  const objectiveIds = Array.from(new Set(written.map(({ kr }) => kr.objectiveId)))
  const childConfidences = new Map<string, string[]>()
  for (const ids of chunk(objectiveIds, READ_CHUNK)) {
    const rows = await prisma.keyResult.findMany({
      where: { objectiveId: { in: ids }, status: 'ACTIVE' },
      select: { objectiveId: true, confidence: true },
    })
    for (const r of rows) {
      const list = childConfidences.get(r.objectiveId)
      if (list) list.push(r.confidence)
      else childConfidences.set(r.objectiveId, [r.confidence])
    }
  }

  const objectivesDone = await writeInChunks(
    objectiveIds,
    (objectiveId) => [
      prisma.objective.update({
        where: { id: objectiveId },
        data: { goalStatus: worstOfConfidences(childConfidences.get(objectiveId) ?? []) },
      }),
    ],
    (objectiveId, err) => {
      console.error(`[auto-confidence] objective rollup failed for ${objectiveId}:`, err)
      errors++
    },
  )

  return { scanned, staleProcessed, objectivesUpdated: objectivesDone.length, errors }
}

// ─── Bi-weekly period helpers ───

/** Returns the current bi-weekly period start date: 1st or 15th of the month. */
export function currentPeriodStart(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  const periodDay = d < 15 ? 1 : 15
  const start = new Date(y, m, periodDay)
  return start.toISOString().slice(0, 10)
}

// ─── Full run ───

export interface ConfidenceRunResult {
  krsProcessed: number
  objectivesUpdated: number
  snapshotsCreated: number
  emailsSent: number
  errors: number
}

export async function runConfidenceCalculation(now: Date = new Date()): Promise<ConfidenceRunResult> {
  const periodStart = currentPeriodStart(now)
  let emailsSent = 0
  let errors = 0

  // Active KRs in not-yet-ended timeframes, with the data needed for scoring.
  const bases = await prisma.keyResult.findMany({ where: inScopeKrWhere(now), select: krBaseSelect })
  const lastCheckIns = await loadLastCheckInAt(bases.map((k) => k.id))
  const krs = await hydrateKrs(bases, lastCheckIns, now)

  // Score each KR (pure), then persist in batched transactions.
  const scored: Array<{ kr: KrForCalc; result: ScoreResult }> = []
  for (const kr of krs) {
    try {
      scored.push({ kr, result: computeKrConfidence(kr, now) })
    } catch (err) {
      console.error(`[confidence-calc] failed for KR ${kr.id}:`, err)
      errors++
    }
  }

  // Snapshot upsert (idempotent within a period) + live KR confidence.
  const krResults = await writeInChunks(
    scored,
    ({ kr, result }) => {
      const ops: Prisma.PrismaPromise<unknown>[] = [
        krSnapshotUpsert(kr, result, periodStart, JSON.stringify(result.factors)),
      ]
      if (kr.confidence !== result.confidence) {
        ops.push(prisma.keyResult.update({ where: { id: kr.id }, data: { confidence: result.confidence } }))
      }
      return ops
    },
    ({ kr }, err) => {
      console.error(`[confidence-calc] failed for KR ${kr.id}:`, err)
      errors++
    },
  )
  const krsProcessed = krResults.length
  const snapshotsCreated = krResults.length

  // Aggregate objective-level confidence: worst-of-children (grouped once, not
  // re-filtered per objective).
  const byObjective = new Map<string, Array<{ kr: KrForCalc; result: ScoreResult }>>()
  for (const r of krResults) {
    const list = byObjective.get(r.kr.objectiveId)
    if (list) list.push(r)
    else byObjective.set(r.kr.objectiveId, [r])
  }

  const objectiveRollups = Array.from(byObjective.entries()).map(([objId, childResults]) => ({
    objId,
    worstConfidence: worstOfConfidences(childResults.map((r) => r.result.confidence)),
    avgScore: Math.round(childResults.reduce((sum, r) => sum + r.result.score, 0) / childResults.length),
    childCount: childResults.length,
  }))

  const objectivesDone = await writeInChunks(
    objectiveRollups,
    ({ objId, worstConfidence, avgScore, childCount }) => {
      const data = {
        confidence: worstConfidence,
        score: avgScore,
        factors: JSON.stringify({ method: 'worst-of-children', childCount }),
      }
      return [
        prisma.confidenceSnapshot.upsert({
          where: { entityType_entityId_periodStart: { entityType: 'OBJECTIVE', entityId: objId, periodStart } },
          create: { entityType: 'OBJECTIVE', entityId: objId, periodStart, ...data },
          update: data,
        }),
        prisma.objective.update({ where: { id: objId }, data: { goalStatus: worstConfidence } }),
      ]
    },
    ({ objId }, err) => {
      console.error(`[confidence-calc] failed for objective ${objId}:`, err)
      errors++
    },
  )

  // Send email digests
  try {
    emailsSent = await sendConfidenceEmails(krResults, periodStart)
  } catch (err) {
    console.error('[confidence-calc] email sending failed:', err)
    errors++
  }

  return { krsProcessed, objectivesUpdated: objectivesDone.length, snapshotsCreated, emailsSent, errors }
}

// ─── Email digests ───

async function sendConfidenceEmails(
  krResults: Array<{ kr: KrForCalc; result: ScoreResult }>,
  periodStart: string
): Promise<number> {
  let sent = 0

  // Group KRs by owner
  const byOwner = new Map<string, typeof krResults>()
  for (const r of krResults) {
    const ownerId = r.kr.ownerId
    if (!byOwner.has(ownerId)) byOwner.set(ownerId, [])
    byOwner.get(ownerId)!.push(r)
  }

  // Fetch owners + admins + department leads
  const userIds = Array.from(byOwner.keys())
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { id: true, email: true, name: true, role: true },
  })
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true, email: true, name: true },
  })

  // Individual emails
  for (const user of users) {
    const items = byOwner.get(user.id) || []
    if (items.length === 0) continue

    const atRisk = items.filter((i) => i.result.confidence === 'AT_RISK')
    const offTrack = items.filter((i) => i.result.confidence === 'OFF_TRACK')

    const lines = [
      `Hi ${user.name},`,
      '',
      `Your bi-weekly OKR confidence assessment for the period starting ${periodStart}:`,
      '',
      `Total key results: ${items.length}`,
      `  On track: ${items.filter((i) => i.result.confidence === 'ON_TRACK').length}`,
      `  At risk: ${atRisk.length}`,
      `  Off track: ${offTrack.length}`,
      '',
    ]

    if (offTrack.length > 0) {
      lines.push('OFF TRACK key results:')
      for (const r of offTrack) {
        lines.push(`  - ${r.kr.title} (score: ${r.result.score}, progress: ${r.result.factors.progressPct}% vs expected ${r.result.factors.expectedProgressPct}%)`)
        lines.push(`    Open: ${krLink(r.kr.id)}`)
      }
      lines.push('')
    }
    if (atRisk.length > 0) {
      lines.push('AT RISK key results:')
      for (const r of atRisk) {
        lines.push(`  - ${r.kr.title} (score: ${r.result.score})`)
        lines.push(`    Open: ${krLink(r.kr.id)}`)
      }
    }
    lines.push('', '— OKR System')

    await sendMail({
      to: user.email,
      toName: user.name,
      subject: `OKR Confidence Report — ${periodStart}`,
      text: lines.join('\n'),
      template: 'confidence-biweekly',
      metadata: { userId: user.id, periodStart, offTrackCount: offTrack.length },
    })
    sent++
  }

  // Dept leads: one email per department lead summarizing their department's KRs
  const deptLeads = await prisma.user.findMany({
    where: { role: 'DEPARTMENT_LEAD', isActive: true },
    include: {
      departmentMemberships: { select: { departmentId: true } },
    },
  })

  const byDepartment = new Map<string, typeof krResults>()
  for (const r of krResults) {
    const deptId = r.kr.objective.departmentId
    if (!deptId) continue
    const list = byDepartment.get(deptId)
    if (list) list.push(r)
    else byDepartment.set(deptId, [r])
  }

  for (const lead of deptLeads) {
    const deptIds = Array.from(new Set(lead.departmentMemberships.map((m) => m.departmentId)))
    const deptKrs = deptIds.flatMap((id) => byDepartment.get(id) ?? [])
    if (deptKrs.length === 0) continue

    const offTrack = deptKrs.filter((i) => i.result.confidence === 'OFF_TRACK')
    const atRisk = deptKrs.filter((i) => i.result.confidence === 'AT_RISK')

    const lines = [
      `Hi ${lead.name},`,
      '',
      `Department OKR confidence summary for ${periodStart}:`,
      `  ${deptKrs.length} KRs · ${offTrack.length} off track · ${atRisk.length} at risk`,
      '',
    ]
    if (offTrack.length > 0) {
      lines.push('Off-track:')
      for (const r of offTrack) {
        lines.push(`  - ${r.kr.title} (${r.kr.objective.title}) score=${r.result.score}`)
        lines.push(`    Open: ${krLink(r.kr.id)}`)
      }
    }
    lines.push('', '— OKR System')

    await sendMail({
      to: lead.email,
      toName: lead.name,
      subject: `Department OKR Confidence — ${periodStart}`,
      text: lines.join('\n'),
      template: 'confidence-biweekly-lead',
    })
    sent++
  }

  // Admin summary
  for (const admin of admins) {
    const offTrack = krResults.filter((i) => i.result.confidence === 'OFF_TRACK')
    const atRisk = krResults.filter((i) => i.result.confidence === 'AT_RISK')

    await sendMail({
      to: admin.email,
      toName: admin.name,
      subject: `[Admin] OKR Confidence Report — ${periodStart}`,
      text: [
        `Hi ${admin.name},`,
        '',
        `Organization-wide confidence assessment for ${periodStart}:`,
        `  ${krResults.length} KRs total · ${offTrack.length} off track · ${atRisk.length} at risk`,
        '',
        ...offTrack.slice(0, 20).flatMap((r) => [
          `  OFF: ${r.kr.title} (${r.kr.objective.title}) score=${r.result.score}`,
          `       Open: ${krLink(r.kr.id)}`,
        ]),
        '',
        '— OKR System',
      ].join('\n'),
      template: 'confidence-biweekly-admin',
    })
    sent++
  }

  return sent
}
