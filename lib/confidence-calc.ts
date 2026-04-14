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

interface KrForCalc {
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
  updatedAt: Date
  _count: { checkIns: number; todos: number }
  objective: {
    id: string
    title: string
    ownerId: string
    endDate: Date | null
    startDate: Date | null
    timeframe: { startDate: Date; endDate: Date }
    departmentId: string | null
  }
  todos: { status: string }[]
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
  const totalInitiatives = kr.todos.length
  const completedInitiatives = kr.todos.filter((t) => t.status === 'COMPLETED').length
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

/**
 * Daily auto-confidence recompute for *stale* OKRs only.
 *
 * Triggered once per day. For each active KR whose last user-driven update
 * (i.e. last KeyResultCheckIn.asOfDate) is more than `staleDays` ago, recompute
 * confidence using the same scoring function used by the bi-weekly job, then
 * propagate to the parent objective's goalStatus. Snapshots are stored with
 * today's date as the periodStart so we get one row per (entity, day).
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
  const cutoff = new Date(now.getTime() - staleDays * 86400_000)
  const periodStart = now.toISOString().slice(0, 10)

  let scanned = 0
  let staleProcessed = 0
  let objectivesUpdated = 0
  let errors = 0

  // Stale = no check-in since cutoff. We pull all active KRs and filter in JS to
  // keep the query simple; volume is bounded by org size (typically <10k KRs).
  const krs = await prisma.keyResult.findMany({
    where: { status: 'ACTIVE' },
    include: {
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
      todos: { select: { status: true } },
      checkIns: {
        select: { asOfDate: true, value: true },
        orderBy: { asOfDate: 'desc' },
        take: 30,
      },
      _count: { select: { checkIns: true, todos: true } },
    },
  })
  scanned = krs.length

  // Map of objectiveId → list of recomputed confidences for the worst-of rollup.
  const perObjective = new Map<string, Array<'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'>>()

  for (const kr of krs) {
    const lastCheckIn = kr.checkIns[0]?.asOfDate ?? kr.createdAt
    if (lastCheckIn >= cutoff) continue // user updated recently — skip
    try {
      const result = computeKrConfidence(kr as unknown as KrForCalc, now)
      await prisma.confidenceSnapshot.upsert({
        where: { entityType_entityId_periodStart: { entityType: 'KEY_RESULT', entityId: kr.id, periodStart } },
        create: {
          entityType: 'KEY_RESULT', entityId: kr.id, periodStart,
          confidence: result.confidence, score: result.score,
          factors: JSON.stringify({ ...result.factors, source: 'daily-auto', staleDays }),
          previousConf: kr.confidence,
        },
        update: {
          confidence: result.confidence, score: result.score,
          factors: JSON.stringify({ ...result.factors, source: 'daily-auto', staleDays }),
          previousConf: kr.confidence,
        },
      })
      if (kr.confidence !== result.confidence) {
        await prisma.keyResult.update({ where: { id: kr.id }, data: { confidence: result.confidence } })
      }
      if (!perObjective.has(kr.objectiveId)) perObjective.set(kr.objectiveId, [])
      perObjective.get(kr.objectiveId)!.push(result.confidence)
      staleProcessed++
    } catch (err) {
      console.error(`[auto-confidence] failed for KR ${kr.id}:`, err)
      errors++
    }
  }

  // Rollup objective goalStatus = worst-of(stale recomputed children + non-stale current confidences)
  for (const [objectiveId] of Array.from(perObjective.entries())) {
    try {
      const allChildren = await prisma.keyResult.findMany({
        where: { objectiveId, status: 'ACTIVE' },
        select: { confidence: true },
      })
      const worst: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' = allChildren.some((c) => c.confidence === 'OFF_TRACK')
        ? 'OFF_TRACK'
        : allChildren.some((c) => c.confidence === 'AT_RISK')
        ? 'AT_RISK'
        : 'ON_TRACK'
      await prisma.objective.update({ where: { id: objectiveId }, data: { goalStatus: worst } })
      objectivesUpdated++
    } catch (err) {
      console.error(`[auto-confidence] objective rollup failed for ${objectiveId}:`, err)
      errors++
    }
  }

  return { scanned, staleProcessed, objectivesUpdated, errors }
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
  let krsProcessed = 0
  let objectivesUpdated = 0
  let snapshotsCreated = 0
  let emailsSent = 0
  let errors = 0

  // Fetch all active KRs with the data needed for scoring
  const krs = await prisma.keyResult.findMany({
    where: { status: 'ACTIVE' },
    include: {
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
      todos: { select: { status: true } },
      checkIns: {
        select: { asOfDate: true, value: true },
        orderBy: { asOfDate: 'desc' },
        take: 30,
      },
      _count: { select: { checkIns: true, todos: true } },
    },
  })

  // Score each KR
  const krResults: Array<{ kr: typeof krs[0]; result: ScoreResult }> = []

  for (const kr of krs) {
    try {
      const result = computeKrConfidence(kr as unknown as KrForCalc, now)

      // Persist snapshot (upsert so re-runs within the same period are idempotent)
      await prisma.confidenceSnapshot.upsert({
        where: {
          entityType_entityId_periodStart: {
            entityType: 'KEY_RESULT',
            entityId: kr.id,
            periodStart,
          },
        },
        create: {
          entityType: 'KEY_RESULT',
          entityId: kr.id,
          periodStart,
          confidence: result.confidence,
          score: result.score,
          factors: JSON.stringify(result.factors),
          previousConf: kr.confidence,
        },
        update: {
          confidence: result.confidence,
          score: result.score,
          factors: JSON.stringify(result.factors),
          previousConf: kr.confidence,
        },
      })
      snapshotsCreated++

      // Update the KR's live confidence field
      if (kr.confidence !== result.confidence) {
        await prisma.keyResult.update({
          where: { id: kr.id },
          data: { confidence: result.confidence },
        })
      }

      krResults.push({ kr, result })
      krsProcessed++
    } catch (err) {
      console.error(`[confidence-calc] failed for KR ${kr.id}:`, err)
      errors++
    }
  }

  // Aggregate objective-level confidence: worst-of-children
  const objectiveIds = Array.from(new Set(krs.map((kr) => kr.objectiveId)))
  for (const objId of objectiveIds) {
    try {
      const childResults = krResults.filter((r) => r.kr.objectiveId === objId)
      if (childResults.length === 0) continue

      const worstConfidence = childResults.some((r) => r.result.confidence === 'OFF_TRACK')
        ? 'OFF_TRACK'
        : childResults.some((r) => r.result.confidence === 'AT_RISK')
        ? 'AT_RISK'
        : 'ON_TRACK'

      const avgScore = Math.round(
        childResults.reduce((sum, r) => sum + r.result.score, 0) / childResults.length
      )

      await prisma.confidenceSnapshot.upsert({
        where: {
          entityType_entityId_periodStart: {
            entityType: 'OBJECTIVE',
            entityId: objId,
            periodStart,
          },
        },
        create: {
          entityType: 'OBJECTIVE',
          entityId: objId,
          periodStart,
          confidence: worstConfidence,
          score: avgScore,
          factors: JSON.stringify({ method: 'worst-of-children', childCount: childResults.length }),
        },
        update: {
          confidence: worstConfidence,
          score: avgScore,
          factors: JSON.stringify({ method: 'worst-of-children', childCount: childResults.length }),
        },
      })

      await prisma.objective.update({
        where: { id: objId },
        data: { goalStatus: worstConfidence },
      })
      objectivesUpdated++
    } catch (err) {
      console.error(`[confidence-calc] failed for objective ${objId}:`, err)
      errors++
    }
  }

  // Send email digests
  try {
    emailsSent = await sendConfidenceEmails(krResults, periodStart)
  } catch (err) {
    console.error('[confidence-calc] email sending failed:', err)
    errors++
  }

  return { krsProcessed, objectivesUpdated, snapshotsCreated, emailsSent, errors }
}

// ─── Email digests ───

async function sendConfidenceEmails(
  krResults: Array<{ kr: any; result: ScoreResult }>,
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

  for (const lead of deptLeads) {
    const deptIds = lead.departmentMemberships.map((m) => m.departmentId)
    const deptKrs = krResults.filter((r) => deptIds.includes(r.kr.objective.departmentId))
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
