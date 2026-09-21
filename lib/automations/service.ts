/**
 * Queue mechanics: enqueue due slots, claim work, reclaim dead leases.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §10.
 *
 * The tick is deliberately cheap and idempotent — it only reads an index and
 * inserts rows, so it is safe to run every minute and schedule fidelity survives
 * a worker restart. All the slow work happens in the worker.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  LEASE_TTL_SECONDS,
  MAX_RUN_ATTEMPTS,
  type PlanSpec,
  type ScheduleSpec,
} from '@/types/automations'
import { computeNextRunAt, planTickActions } from './schedule'

export interface TickSummary {
  evaluated: number
  enqueued: number
  missed: number
  ended: number
  skippedByOverlap: number
  globallyPaused: boolean
}

/** Org settings row, created on first read so a fresh install just works. */
export async function getAutomationSettings() {
  return prisma.automationSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  })
}

/**
 * Fiscal quarter ends, injected into the schedule engine so QUARTERLY/FISCAL
 * follows the org's real calendar rather than Jan–Mar.
 */
async function fiscalQuarterEnds(): Promise<Date[]> {
  const timeframes = await prisma.timeframe.findMany({
    where: { endDate: { gte: new Date(Date.now() - 366 * 86_400_000) } },
    select: { endDate: true },
    orderBy: { endDate: 'asc' },
    take: 40,
  })
  return timeframes.map((t) => t.endDate)
}

/**
 * One tick. Finds automations whose nominal slot has arrived and inserts a
 * QUEUED run per slot. The unique constraint on (automationId, scheduledFor) is
 * what makes this exactly-once even if two ticks overlap.
 */
export async function runAutomationsTick(now = new Date()): Promise<TickSummary> {
  const settings = await getAutomationSettings()
  const summary: TickSummary = {
    evaluated: 0, enqueued: 0, missed: 0, ended: 0, skippedByOverlap: 0,
    globallyPaused: settings.globalPaused,
  }
  if (settings.globalPaused) return summary

  const due = await prisma.automation.findMany({
    where: {
      status: 'ENABLED',
      deletedAt: null,
      nextRunAt: { not: null, lte: new Date(now.getTime() + 60_000) },
    },
    select: {
      id: true, scheduleJson: true, nextRunAt: true, runCount: true, planVersion: true,
    },
    take: 500,
  })
  if (due.length === 0) return summary

  const quarterEnds = await fiscalQuarterEnds()

  for (const automation of due) {
    summary.evaluated++
    const schedule = automation.scheduleJson as unknown as ScheduleSpec

    let actions
    try {
      actions = planTickActions(
        {
          id: automation.id,
          scheduleJson: schedule,
          nextRunAt: automation.nextRunAt,
          runCount: automation.runCount,
        },
        now,
        { fiscalQuarterEnds: quarterEnds }
      )
    } catch (error) {
      // A schedule that cannot be evaluated pauses rather than spinning every minute.
      await prisma.automation.update({
        where: { id: automation.id },
        data: { status: 'PAUSED', nextRunAt: null },
      })
      console.error('[automations-tick] unevaluable schedule', automation.id, error)
      continue
    }

    // Overlap policy: a still-running slot blocks the next one unless QUEUE.
    if (actions.enqueue.length > 0 && (schedule.overlapPolicy ?? 'SKIP') === 'SKIP') {
      const inFlight = await prisma.automationRun.count({
        where: { automationId: automation.id, status: { in: ['QUEUED', 'LEASED', 'RUNNING'] } },
      })
      if (inFlight > 0) {
        summary.skippedByOverlap++
        await prisma.automation.update({
          where: { id: automation.id },
          data: { nextRunAt: actions.nextRunAt },
        })
        continue
      }
    }

    for (const slot of actions.enqueue) {
      try {
        await prisma.automationRun.create({
          data: {
            automationId: automation.id,
            planVersion: automation.planVersion,
            scheduledFor: slot,
            status: 'QUEUED',
            trigger: 'SCHEDULE',
          },
        })
        summary.enqueued++
      } catch (error) {
        // P2002 = this slot is already queued. That is the constraint doing its job.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
      }
    }

    for (const slot of actions.missed) {
      try {
        await prisma.automationRun.create({
          data: {
            automationId: automation.id,
            planVersion: automation.planVersion,
            scheduledFor: slot,
            status: 'MISSED',
            trigger: 'SCHEDULE',
            finishedAt: now,
            errorMessage: 'Slot passed the catch-up window while the system was unavailable',
          },
        })
        summary.missed++
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
      }
    }

    if (actions.ended) summary.ended++
    await prisma.automation.update({
      where: { id: automation.id },
      data: {
        nextRunAt: actions.nextRunAt,
        ...(actions.ended ? { status: 'ENDED' } : {}),
      },
    })
  }

  return summary
}

/**
 * Claim the next queued run for this worker.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes multiple workers safe without Redis:
 * concurrent claimers step over each other's locked rows instead of blocking or
 * double-claiming.
 */
export async function claimNextRun(workerId: string, leaseTtlSeconds = LEASE_TTL_SECONDS): Promise<string | null> {
  const expiresAt = new Date(Date.now() + leaseTtlSeconds * 1000)
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE automation_runs
    SET status = 'LEASED', "leaseOwner" = ${workerId}, "leaseExpiresAt" = ${expiresAt}
    WHERE id = (
      SELECT id FROM automation_runs
      WHERE status = 'QUEUED'
      ORDER BY "scheduledFor" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `
  return rows[0]?.id ?? null
}

/** Extend the lease while a run is in flight. Returns false if the lease was stolen. */
export async function heartbeatRun(runId: string, workerId: string, leaseTtlSeconds = LEASE_TTL_SECONDS): Promise<boolean> {
  const result = await prisma.automationRun.updateMany({
    where: { id: runId, leaseOwner: workerId, status: { in: ['LEASED', 'RUNNING'] } },
    data: { leaseExpiresAt: new Date(Date.now() + leaseTtlSeconds * 1000) },
  })
  return result.count > 0
}

export interface ReapSummary {
  requeued: number
  failed: number
}

/**
 * Reclaim runs whose lease expired — the worker crashed or was killed. Retries
 * up to MAX_RUN_ATTEMPTS, then gives up with an explicit error so the run does
 * not sit in a permanently ambiguous state.
 */
export async function reapExpiredLeases(now = new Date()): Promise<ReapSummary> {
  const stale = await prisma.automationRun.findMany({
    where: {
      status: { in: ['LEASED', 'RUNNING'] },
      leaseExpiresAt: { lt: now },
    },
    select: { id: true, attempt: true, automationId: true },
    take: 100,
  })

  const summary: ReapSummary = { requeued: 0, failed: 0 }

  for (const run of stale) {
    if (run.attempt < MAX_RUN_ATTEMPTS) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: 'QUEUED',
          trigger: 'RETRY',
          attempt: run.attempt + 1,
          leaseOwner: null,
          leaseExpiresAt: null,
          startedAt: null,
        },
      })
      summary.requeued++
    } else {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          errorMessage: `Abandoned after ${MAX_RUN_ATTEMPTS} attempts — the worker died mid-run each time`,
        },
      })
      summary.failed++
    }
  }

  return summary
}

/**
 * Queue a manual run. Manual runs never consume or shift the schedule, so they
 * take a distinct `scheduledFor` (now) and leave nextRunAt untouched.
 */
export async function enqueueManualRun(automationId: string): Promise<string> {
  const automation = await prisma.automation.findUnique({
    where: { id: automationId },
    select: { id: true, planVersion: true, status: true, deletedAt: true },
  })
  if (!automation || automation.deletedAt) throw new Error('Automation not found')

  const run = await prisma.automationRun.create({
    data: {
      automationId,
      planVersion: automation.planVersion,
      scheduledFor: new Date(),
      status: 'QUEUED',
      trigger: 'MANUAL',
    },
    select: { id: true },
  })
  return run.id
}

/** Recompute nextRunAt after a schedule edit, resume, or creation. */
export async function refreshNextRunAt(automationId: string, from = new Date()): Promise<Date | null> {
  const automation = await prisma.automation.findUnique({
    where: { id: automationId },
    select: { scheduleJson: true, status: true },
  })
  if (!automation) return null
  if (automation.status !== 'ENABLED') {
    await prisma.automation.update({ where: { id: automationId }, data: { nextRunAt: null } })
    return null
  }

  const next = computeNextRunAt(automation.scheduleJson as unknown as ScheduleSpec, from, {
    fiscalQuarterEnds: await fiscalQuarterEnds(),
  })
  await prisma.automation.update({ where: { id: automationId }, data: { nextRunAt: next } })
  return next
}

/** The schedule block is mirrored out of the plan so the tick never parses the whole plan. */
export function scheduleFromPlan(plan: PlanSpec): ScheduleSpec {
  return plan.schedule
}

/**
 * Step transcripts are the bulky part of a run row — redacted tool args, result
 * previews, per-step timings — and stop being useful once nobody is debugging
 * that run any more. They are dropped well before the briefing retention window
 * so run history stays queryable (cost, tokens, status) without carrying the
 * payload. `findingsJson` is deliberately NOT touched: it is the baseline the
 * next run diffs against, so nulling it would report every finding as new.
 */
const TRANSCRIPT_RETENTION_DAYS = 30

export interface PruneSummary {
  transcriptsCleared: number
  briefingsDeleted: number
  retentionDays: number
}

/**
 * Nightly retention sweep. Scheduled by scripts/install-crontab.sh at 03:30.
 */
export async function pruneAutomationHistory(now = new Date()): Promise<PruneSummary> {
  const { retentionDays } = await getAutomationSettings()

  const transcriptCutoff = new Date(now.getTime() - TRANSCRIPT_RETENTION_DAYS * 86_400_000)
  const briefingCutoff = new Date(now.getTime() - retentionDays * 86_400_000)

  // Only finished runs: a QUEUED/LEASED/RUNNING row older than the cutoff is a
  // stuck run, and the reaper — not the pruner — is what should resolve it.
  const transcripts = await prisma.automationRun.updateMany({
    where: {
      finishedAt: { lt: transcriptCutoff },
      // Already-cleared rows are excluded so the reported count is the number
      // actually cleared by this run rather than every old row.
      stepsJson: { not: Prisma.DbNull },
    },
    data: { stepsJson: Prisma.DbNull },
  })

  // The run row survives; only the rendered briefing (blocks + three HTML/text
  // bodies) is dropped, which is what actually grows the table.
  const briefings = await prisma.automationBriefing.deleteMany({
    where: { createdAt: { lt: briefingCutoff } },
  })

  return {
    transcriptsCleared: transcripts.count,
    briefingsDeleted: briefings.count,
    retentionDays,
  }
}
