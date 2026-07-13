/**
 * Project health recompute (B2 + EVM).
 *
 * Gathers live inputs, recomputes rollup (%complete/%planned), confidence, RAG, and EVM
 * (SPI/CPI/EAC), and persists them on the Project. Emits PROJECT_RAG_CHANGED /
 * PROJECT_WENT_RED when the RAG transitions. Runs per-project (on demand) and for all
 * active projects (nightly cron `/api/cron/project-health`).
 */

import { prisma } from '@/lib/prisma'
import { recalcProjectRollup } from './rollup'
import { computeProjectConfidence, deriveRag } from './confidence'
import { computeEvm } from './evm'
import { businessDaysBetween } from './business-days'
import { emit } from '@/lib/notifications'
import type { RagStatus } from '@/features/projects/types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface HealthResult {
  projectId: string
  confidence: number
  ragStatus: RagStatus
  percentComplete: number
  percentPlanned: number
  spi: number | null
}

/** Recompute and persist health for a single project. */
export async function recomputeProjectHealth(projectId: string, now: Date = new Date()): Promise<HealthResult | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ragStatus: true, budgetAtCompletion: true, actualCost: true, projectManagerId: true, name: true },
  })
  if (!project) return null

  // 1) Rollup (%complete / %planned) in a transaction, then read inputs.
  const { percentComplete, percentPlanned } = await prisma.$transaction((tx) => recalcProjectRollup(tx, projectId, now))

  // 2) Gather penalty inputs.
  const [slipAgg, highRisks, blockedEvents, pendingApprovals, lastActivity] = await Promise.all([
    prisma.activity.aggregate({ where: { milestone: { phase: { projectId } } }, _sum: { slipDays: true } }),
    prisma.raidItem.count({ where: { projectId, type: 'RISK', status: { in: ['OPEN', 'MITIGATING'] }, score: { gte: 15 } } }),
    prisma.delayEvent.count({ where: { projectId, eventType: 'BLOCKED', endedAt: null } }),
    prisma.activity.findMany({
      where: { milestone: { phase: { projectId } }, status: 'APPROVAL_REQUESTED', waitingSince: { not: null } },
      select: { waitingSince: true },
    }),
    prisma.activity.findFirst({
      where: { milestone: { phase: { projectId } } },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
  ])

  const totalSlipDays = slipAgg._sum.slipDays ?? 0
  const pendingApprovalDays = pendingApprovals.reduce(
    (s, a) => s + (a.waitingSince ? businessDaysBetween(a.waitingSince, now) : 0),
    0
  )
  const daysSinceLastUpdate = lastActivity?.updatedAt
    ? Math.floor((now.getTime() - lastActivity.updatedAt.getTime()) / MS_PER_DAY)
    : 0

  // 3) Confidence + EVM + RAG.
  const { confidence } = computeProjectConfidence({
    percentComplete,
    percentPlanned,
    totalSlipDays,
    openHighRisks: highRisks,
    blockedActivities: blockedEvents,
    pendingApprovalDays,
    daysSinceLastUpdate,
  })
  const evm = computeEvm({ budgetAtCompletion: project.budgetAtCompletion, percentComplete, percentPlanned, actualCost: project.actualCost })
  const ragStatus = deriveRag(confidence, evm.spi)

  await prisma.project.update({
    where: { id: projectId },
    data: {
      confidence: Math.round(confidence),
      ragStatus,
      spi: evm.spi,
      cpi: evm.cpi,
      eac: evm.eac,
      plannedValue: evm.plannedValue,
      earnedValue: evm.earnedValue,
    },
  })

  // 4) Notify on RAG transition.
  if (ragStatus !== project.ragStatus) {
    await emit('PROJECT_RAG_CHANGED', {
      entityType: 'PROJECT', entityId: projectId, entityTitle: project.name,
      data: { from: project.ragStatus, to: ragStatus, deepLink: `/dashboard/projects/${projectId}` },
    })
    if (ragStatus === 'RED') {
      await emit('PROJECT_WENT_RED', {
        entityType: 'PROJECT', entityId: projectId, entityTitle: project.name,
        data: { confidence: Math.round(confidence), deepLink: `/dashboard/projects/${projectId}` },
      })
    }
  }

  return { projectId, confidence: Math.round(confidence), ragStatus, percentComplete, percentPlanned, spi: evm.spi }
}

/** Recompute all active (non-archived, not completed/cancelled) projects. */
export async function recomputeAllActiveProjects(now: Date = new Date()): Promise<{ processed: number }> {
  const projects = await prisma.project.findMany({
    where: { archivedAt: null, status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] } },
    select: { id: true },
  })
  let processed = 0
  for (const p of projects) {
    try {
      await recomputeProjectHealth(p.id, now)
      processed++
    } catch (err) {
      console.error('[project-health] failed for', p.id, err)
    }
  }
  return { processed }
}
