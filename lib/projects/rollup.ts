/**
 * Progress rollup for the Project Management module.
 *
 * Rollup order: Activity % → Milestone % → Phase % → Project %, each a weighted
 * average. Sub-activities roll up into their parent Activity (whose % then becomes
 * derived/read-only). Planned % is derived from the *baseline* dates.
 *
 * The DB recompute (`recalcProjectRollup` / `recalcActivityAndAncestors`) MUST run in
 * the same transaction as the mutation that triggered it (Critical Invariant #9) — the
 * caller passes a Prisma transaction client.
 *
 * Pure math helpers are exported separately for unit testing (build spec §B1 examples:
 * weights 2/1 at 100%/0% → 66.7%).
 */

import type { Prisma } from '@prisma/client'
import type { WeightedNode } from '@/features/projects/types'
import { recalcKrsAndAncestors } from './okr-bridge'

/** Clamp a number into [0, 1]. */
export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/**
 * Weighted average of `percentComplete` by `weight`. If all weights are 0, falls back
 * to a simple mean (so a parent with unweighted children still rolls up sensibly). An
 * empty list returns 0.
 */
export function weightedAverage(nodes: readonly WeightedNode[]): number {
  if (nodes.length === 0) return 0
  const totalWeight = nodes.reduce((s, n) => s + (n.weight || 0), 0)
  if (totalWeight <= 0) {
    const mean = nodes.reduce((s, n) => s + (n.percentComplete || 0), 0) / nodes.length
    return round1(mean)
  }
  const acc = nodes.reduce((s, n) => s + (n.percentComplete || 0) * (n.weight || 0), 0)
  return round1(acc / totalWeight)
}

/** Round to 1 decimal place (matches the spec's 66.7% presentation). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** True if a parent's children weights do not sum to ~100 (non-blocking warning). */
export function weightsMismatch(weights: readonly number[]): boolean {
  if (weights.length === 0) return false
  const sum = weights.reduce((s, w) => s + (w || 0), 0)
  return Math.abs(sum - 100) > 0.01
}

/**
 * Slip days for a baselined node: how many days later the current end is vs baseline.
 * Returns 0 when not baselined or when ahead of / on baseline (slip is never negative).
 */
export function computeSlipDays(baselineEnd: Date | null, currentEnd: Date | null): number {
  if (!baselineEnd || !currentEnd) return 0
  const ms = currentEnd.getTime() - baselineEnd.getTime()
  if (ms <= 0) return 0
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

/**
 * Expected (planned) % of a phase as of `today`, derived from its baseline window:
 * 0% before baselineStart, 100% after baselineEnd, linear in between.
 */
export function phasePlannedPercent(
  baselineStart: Date | null,
  baselineEnd: Date | null,
  today: Date
): number {
  if (!baselineStart || !baselineEnd) return 0
  const span = baselineEnd.getTime() - baselineStart.getTime()
  if (span <= 0) return today >= baselineEnd ? 100 : 0
  const frac = (today.getTime() - baselineStart.getTime()) / span
  return round1(clamp01(frac) * 100)
}

/**
 * Project planned % = Σ(phase.weight × phasePlannedFraction) / Σ(phase.weight).
 * Build spec §B1 formula.
 */
export function projectPlannedPercent(
  phases: readonly { weight: number; baselineStart: Date | null; baselineEnd: Date | null }[],
  today: Date
): number {
  return weightedAverage(
    phases.map((p) => ({
      weight: p.weight,
      percentComplete: phasePlannedPercent(p.baselineStart, p.baselineEnd, today),
    }))
  )
}

// --- DB recompute (transactional) -------------------------------------------

/**
 * Recompute the entire schedule tree for a project — activity (from subtasks) →
 * milestone → phase → project — plus each activity's slipDays and the project's
 * percentComplete / percentPlanned. Runs inside the caller's transaction.
 *
 * Full-tree recompute is intentional: it is O(nodes) per mutation, always correct
 * (no partial-update drift), and reused by the nightly project-health cron.
 */
export async function recalcProjectRollup(
  tx: Prisma.TransactionClient,
  projectId: string,
  now: Date = new Date()
): Promise<{ percentComplete: number; percentPlanned: number }> {
  const phases = await tx.phase.findMany({
    where: { projectId },
    include: {
      milestones: {
        include: { activities: true },
      },
    },
  })

  const dirtyKeyResultIds = new Set<string>()

  for (const phase of phases) {
    for (const milestone of phase.milestones) {
      // Activity level: subtasks roll into their parent; top-level activities keep their own %.
      const byParent = new Map<string, typeof milestone.activities>()
      for (const a of milestone.activities) {
        if (a.parentActivityId) {
          const list = byParent.get(a.parentActivityId) ?? []
          list.push(a)
          byParent.set(a.parentActivityId, list)
        }
      }

      const topLevel = milestone.activities.filter((a) => !a.parentActivityId)

      for (const a of topLevel) {
        const subtasks = byParent.get(a.id)
        let pc = a.percentComplete
        if (subtasks && subtasks.length > 0) {
          pc = weightedAverage(subtasks)
          if (pc !== a.percentComplete) {
            await tx.activity.update({ where: { id: a.id }, data: { percentComplete: pc } })
            a.percentComplete = pc
          }
        }
        const slip = computeSlipDays(a.baselineEnd, a.currentEnd)
        if (slip !== a.slipDays) {
          await tx.activity.update({ where: { id: a.id }, data: { slipDays: slip } })
          a.slipDays = slip
        }
      }

      const milestonePct = weightedAverage(topLevel.map((a) => ({ weight: a.weight, percentComplete: a.percentComplete })))
      if (milestonePct !== milestone.percentComplete) {
        await tx.milestone.update({ where: { id: milestone.id }, data: { percentComplete: milestonePct } })
        milestone.percentComplete = milestonePct
      }
      if (milestone.keyResultId) {
        dirtyKeyResultIds.add(milestone.keyResultId)
      }
    }

    const phasePct = weightedAverage(
      phase.milestones.map((m) => ({ weight: m.weight, percentComplete: m.percentComplete }))
    )
    if (phasePct !== phase.percentComplete) {
      await tx.phase.update({ where: { id: phase.id }, data: { percentComplete: phasePct } })
      phase.percentComplete = phasePct
    }
  }

  const percentComplete = weightedAverage(
    phases.map((p) => ({ weight: p.weight, percentComplete: p.percentComplete }))
  )
  const percentPlanned = projectPlannedPercent(
    phases.map((p) => ({ weight: p.weight, baselineStart: p.baselineStart, baselineEnd: p.baselineEnd })),
    now
  )

  await tx.project.update({
    where: { id: projectId },
    data: { percentComplete, percentPlanned },
  })

  // K1: propagate milestone progress into linked Key Results and up through
  // ancestor objectives, all inside the same transaction.
  if (dirtyKeyResultIds.size > 0) {
    await recalcKrsAndAncestors(tx, dirtyKeyResultIds)
  }

  return { percentComplete, percentPlanned }
}

/**
 * Convenience alias named per the build spec (§B1 DoD). Given an activity id, recompute
 * that activity and every ancestor up to the project. Implemented as a full-project
 * recompute (correct + simple); the caller provides the transaction.
 */
export async function recalcActivityAndAncestors(
  tx: Prisma.TransactionClient,
  activityId: string,
  now: Date = new Date()
): Promise<void> {
  const activity = await tx.activity.findUnique({
    where: { id: activityId },
    select: { milestone: { select: { phase: { select: { projectId: true } } } } },
  })
  const projectId = activity?.milestone?.phase?.projectId
  if (!projectId) return
  await recalcProjectRollup(tx, projectId, now)
}
