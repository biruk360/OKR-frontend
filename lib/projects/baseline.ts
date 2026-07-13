/**
 * Baseline commit (Epic C1) + the Invariant #1 server guard.
 *
 * Committing the baseline freezes the agreed schedule: every Phase/Milestone/
 * Activity copies its `current*` dates into `baseline*`, the project records
 * `baselineCommittedAt` + `baselineVersion = 1`, and a full-schedule
 * `BaselineSnapshot` (v1) is written for later variance reporting.
 *
 * Critical Invariant #1: after commit, `baseline*` fields are IMMUTABLE. No
 * Zod schema in the schedule routes accepts them (unknown keys are stripped),
 * and every schedule PATCH route additionally rejects raw payloads containing
 * them with 403 via `hasBaselineFieldWrite()`. The ONLY writers are in this
 * module: the initial commit (C1) and formal re-baseline (C2, versioned — prior
 * snapshots are preserved so variance vs v1 stays computable).
 *
 * `commitBaseline` performs ONLY transactional reads/writes; the caller fires
 * audit + notifications after the transaction commits (Standing Rule #1).
 *
 * Build spec: docs/project_management_module_BUILD_SPEC.md §C1.
 */

import type { Prisma } from '@prisma/client'

/** Fields frozen at baseline commit — never writable via schedule routes (Invariant #1). */
export const BASELINE_FIELD_NAMES = [
  'baselineStart',
  'baselineEnd',
  'baselineDate',
  'baselineCommittedAt',
  'baselineVersion',
] as const

/**
 * True if a raw (pre-Zod) request payload attempts to write a frozen baseline
 * field. Top-level keys only — schedule payloads are flat. Used by every
 * schedule PATCH route to return 403 instead of silently stripping the keys.
 */
export function hasBaselineFieldWrite(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  return BASELINE_FIELD_NAMES.some((f) => f in payload)
}

export interface CommitBaselineResult {
  phaseCount: number
  milestoneCount: number
  activityCount: number
  snapshotId: string
  committedAt: Date
}

/** One activity whose dates will change on (re-)baseline — drives the C2 diff preview. */
export interface BaselineDateChange {
  activityId: string
  title: string
  phaseName: string
  oldStart: string | null
  oldEnd: string | null
  newStart: string | null
  newEnd: string | null
}

export interface RebaselineDiffActivity {
  id: string
  title: string
  phaseName: string
  baselineStart: Date | null
  baselineEnd: Date | null
  currentStart: Date | null
  currentEnd: Date | null
}

/** Null-safe Date equality (date-only value comparison). */
export function datesEqual(a: Date | null, b: Date | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.getTime() === b.getTime()
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

/**
 * Pure diff: every activity whose current dates differ from its baseline dates.
 * Used by the C2 re-baseline preview and returned by the re-baseline mutation.
 */
export function computeRebaselineDiff(activities: readonly RebaselineDiffActivity[]): BaselineDateChange[] {
  const out: BaselineDateChange[] = []
  for (const a of activities) {
    if (datesEqual(a.baselineStart, a.currentStart) && datesEqual(a.baselineEnd, a.currentEnd)) continue
    out.push({
      activityId: a.id,
      title: a.title,
      phaseName: a.phaseName,
      oldStart: iso(a.baselineStart),
      oldEnd: iso(a.baselineEnd),
      newStart: iso(a.currentStart),
      newEnd: iso(a.currentEnd),
    })
  }
  return out
}

type PhaseTree = Prisma.PhaseGetPayload<{
  include: { milestones: { include: { activities: true } } }
}>[]

/** Copy current* → baseline* across a loaded schedule tree. Shared by commit + re-baseline. */
async function copyCurrentToBaseline(tx: Prisma.TransactionClient, phases: PhaseTree): Promise<{ milestoneCount: number; activityCount: number }> {
  let milestoneCount = 0
  let activityCount = 0
  for (const phase of phases) {
    await tx.phase.update({
      where: { id: phase.id },
      data: { baselineStart: phase.currentStart, baselineEnd: phase.currentEnd },
    })
    for (const milestone of phase.milestones) {
      milestoneCount += 1
      await tx.milestone.update({ where: { id: milestone.id }, data: { baselineDate: milestone.currentDate } })
      for (const activity of milestone.activities) {
        activityCount += 1
        await tx.activity.update({
          where: { id: activity.id },
          data: { baselineStart: activity.currentStart, baselineEnd: activity.currentEnd },
        })
      }
    }
  }
  return { milestoneCount, activityCount }
}

/** Full-schedule snapshot JSON (Dates → ISO strings; Prisma Json rejects Date objects). */
function buildSnapshotJson(projectId: string, version: number, now: Date, phases: PhaseTree) {
  return {
    projectId,
    version,
    committedAt: now.toISOString(),
    phases: phases.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      weight: p.weight,
      baselineStart: iso(p.currentStart),
      baselineEnd: iso(p.currentEnd),
      milestones: p.milestones.map((m) => ({
        id: m.id,
        name: m.name,
        position: m.position,
        weight: m.weight,
        isKeyMilestone: m.isKeyMilestone,
        baselineDate: iso(m.currentDate),
        activities: m.activities.map((a) => ({
          id: a.id,
          title: a.title,
          position: a.position,
          weight: a.weight,
          ownerParty: a.ownerParty,
          baselineStart: iso(a.currentStart),
          baselineEnd: iso(a.currentEnd),
        })),
      })),
    })),
  }
}

async function loadPhaseTree(tx: Prisma.TransactionClient, projectId: string): Promise<PhaseTree> {
  return tx.phase.findMany({
    where: { projectId },
    orderBy: { position: 'asc' },
    include: {
      milestones: { orderBy: { position: 'asc' }, include: { activities: { orderBy: { position: 'asc' } } } },
    },
  })
}

/**
 * Commit the project's baseline in one transaction. Assumes the caller has
 * already verified the project is not yet baselined.
 */
export async function commitBaseline(
  tx: Prisma.TransactionClient,
  projectId: string,
  opts: { actorId: string; notes?: string | null; now?: Date }
): Promise<CommitBaselineResult> {
  const now = opts.now ?? new Date()
  const phases = await loadPhaseTree(tx, projectId)
  const { milestoneCount, activityCount } = await copyCurrentToBaseline(tx, phases)

  await tx.project.update({
    where: { id: projectId },
    data: { baselineCommittedAt: now, baselineVersion: 1 },
  })

  const snapshot = await tx.baselineSnapshot.create({
    data: {
      projectId,
      version: 1,
      reason: opts.notes?.trim() || 'Initial baseline commit',
      approvedById: opts.actorId,
      snapshotJson: buildSnapshotJson(projectId, 1, now, phases),
    },
    select: { id: true },
  })

  return {
    phaseCount: phases.length,
    milestoneCount,
    activityCount,
    snapshotId: snapshot.id,
    committedAt: now,
  }
}

export interface RebaselineResult extends CommitBaselineResult {
  version: number
  changes: BaselineDateChange[]
}

/**
 * Formal re-baseline (C2): increments `baselineVersion`, copies current→baseline
 * again, and writes a NEW `BaselineSnapshot` — prior snapshots are never touched,
 * so variance vs v1 (the honest client number) remains computable forever.
 * Assumes the caller verified a baseline exists and validated reason (≥20 chars).
 */
export async function rebaseline(
  tx: Prisma.TransactionClient,
  projectId: string,
  opts: { actorId: string; approverId: string; reason: string; now?: Date }
): Promise<RebaselineResult> {
  const now = opts.now ?? new Date()
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { baselineVersion: true, baselineCommittedAt: true },
  })
  if (!project.baselineCommittedAt) throw new Error('Cannot re-baseline: no baseline committed')
  const version = project.baselineVersion + 1

  const phases = await loadPhaseTree(tx, projectId)
  const changes = computeRebaselineDiff(
    phases.flatMap((p) =>
      p.milestones.flatMap((m) =>
        m.activities.map((a) => ({
          id: a.id,
          title: a.title,
          phaseName: p.name,
          baselineStart: a.baselineStart,
          baselineEnd: a.baselineEnd,
          currentStart: a.currentStart,
          currentEnd: a.currentEnd,
        }))
      )
    )
  )

  const { milestoneCount, activityCount } = await copyCurrentToBaseline(tx, phases)

  await tx.project.update({ where: { id: projectId }, data: { baselineVersion: version } })

  const snapshot = await tx.baselineSnapshot.create({
    data: {
      projectId,
      version,
      reason: opts.reason,
      approvedById: opts.approverId,
      snapshotJson: buildSnapshotJson(projectId, version, now, phases),
    },
    select: { id: true },
  })

  return {
    version,
    changes,
    phaseCount: phases.length,
    milestoneCount,
    activityCount,
    snapshotId: snapshot.id,
    committedAt: now,
  }
}
