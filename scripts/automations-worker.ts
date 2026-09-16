/**
 * Automations worker — the long-lived process that actually executes runs.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §10.1.
 *
 * Run under pm2 alongside the Next app:
 *   pm2 start "npm run worker:automations" --name okr-automations-worker
 *
 * Why a separate process rather than the existing synchronous /api/cron pattern:
 * an agent run takes 30s–5min, needs retries, and must not block a batch or a
 * request. The tick stays cheap; this loop owns the slow work.
 *
 * Concurrency is safe across multiple workers — claimNextRun uses
 * FOR UPDATE SKIP LOCKED, so two workers never take the same run.
 */

import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { executeRun } from '../lib/automations/runner'
import { claimNextRun, getAutomationSettings, heartbeatRun } from '../lib/automations/service'
import { LEASE_HEARTBEAT_SECONDS, LEASE_TTL_SECONDS } from '../types/automations'

const WORKER_ID = `${process.env.HOSTNAME ?? 'worker'}-${process.pid}-${randomUUID().slice(0, 8)}`
const IDLE_POLL_MS = Number(process.env.AUTOMATIONS_WORKER_POLL_MS) || 5000

let shuttingDown = false
let active = 0

function log(message: string, extra?: Record<string, unknown>) {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : ''
  console.log(`[automations-worker ${WORKER_ID}] ${message}${suffix}`)
}

/**
 * Hold the lease for as long as the run takes. If the heartbeat ever reports the
 * lease is gone, the reaper has already handed this run to someone else — we
 * stop renewing and let the other worker own it.
 */
function startHeartbeat(runId: string): () => void {
  const timer = setInterval(async () => {
    try {
      const held = await heartbeatRun(runId, WORKER_ID, LEASE_TTL_SECONDS)
      if (!held) {
        log('lease lost, stopping heartbeat', { runId })
        clearInterval(timer)
      }
    } catch (error) {
      log('heartbeat failed', { runId, error: String(error) })
    }
  }, LEASE_HEARTBEAT_SECONDS * 1000)
  timer.unref?.()
  return () => clearInterval(timer)
}

async function processOne(): Promise<boolean> {
  const runId = await claimNextRun(WORKER_ID, LEASE_TTL_SECONDS)
  if (!runId) return false

  active++
  const stopHeartbeat = startHeartbeat(runId)
  const startedAt = Date.now()
  try {
    const outcome = await executeRun(runId)
    log(`run ${outcome.status.toLowerCase()}`, {
      runId,
      briefingId: outcome.briefingId,
      findings: outcome.findingCount,
      new: outcome.newCount,
      changed: outcome.changedCount,
      suppressed: outcome.suppressed,
      costUsd: Number(outcome.costUsd.toFixed(4)),
      ms: outcome.durationMs,
      ...(outcome.error ? { error: outcome.error } : {}),
    })
  } catch (error) {
    // executeRun handles its own failures; reaching here means something outside
    // it broke. Release the lease so the reaper can retry rather than stranding it.
    log('run threw outside the executor', { runId, error: String(error), ms: Date.now() - startedAt })
    await prisma.automationRun
      .updateMany({
        where: { id: runId, leaseOwner: WORKER_ID },
        data: { status: 'QUEUED', leaseOwner: null, leaseExpiresAt: null },
      })
      .catch(() => undefined)
  } finally {
    stopHeartbeat()
    active--
  }
  return true
}

async function loop(): Promise<void> {
  log('started', { poll: `${IDLE_POLL_MS}ms`, lease: `${LEASE_TTL_SECONDS}s` })

  while (!shuttingDown) {
    try {
      const settings = await getAutomationSettings()
      if (settings.globalPaused) {
        await sleep(IDLE_POLL_MS * 2)
        continue
      }
      if (active >= settings.maxConcurrentRuns) {
        await sleep(500)
        continue
      }

      const claimed = await processOne()
      if (!claimed) await sleep(IDLE_POLL_MS)
    } catch (error) {
      log('loop error', { error: String(error) })
      await sleep(IDLE_POLL_MS)
    }
  }

  // Let in-flight work finish before the process exits; the lease keeps it ours.
  const deadline = Date.now() + 30_000
  while (active > 0 && Date.now() < deadline) await sleep(250)
  await prisma.$disconnect()
  log('stopped')
  process.exit(0)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1)
    shuttingDown = true
    log(`${signal} received, draining ${active} in-flight run(s)`)
  })
}

loop().catch((error) => {
  console.error('[automations-worker] fatal', error)
  process.exit(1)
})
