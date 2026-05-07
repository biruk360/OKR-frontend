/**
 * Builds the context bundle handed to the AI for sprint generation.
 *
 * Modes (see docs/AI_SPRINT_PLANNING.md §3.0–§3.1):
 *   - AUTO   — load every active objective + KR the subject owns or contributes to.
 *   - MANUAL — load only the curated objectiveIds + keyResultIds the user picked,
 *              plus their direct parents (1 hop up) for hierarchical context.
 *
 * Privacy: items marked isPrivate=true belonging to other users are excluded
 * unless the subject is owner/contributor or the requester is ADMIN/EXECUTIVE.
 *
 * This module is provider-agnostic — the bundle it returns is a plain JSON
 * structure consumed by every provider's generateSprintPlan() implementation.
 */

import { prisma } from '@/lib/prisma'
import type { CarryoverTodoInput } from './carryover'

export type GenerationMode = 'AUTO' | 'MANUAL'

export interface BundleSubject {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
}

export interface BundleObjective {
  id: string
  title: string
  description: string | null
  level: 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL'
  status: string
  goalStatus: string
  progress: number
  confidence: number
  startDate: Date | null
  endDate: Date | null
  weight: number
  ownerId: string
  ownerName: string
  parentObjectiveId: string | null
  departmentId: string | null
}

export interface BundleKeyResult {
  id: string
  objectiveId: string
  title: string
  description: string | null
  startValue: number
  targetValue: number
  currentValue: number
  unit: string
  confidence: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'
  progress: number
  weight: number
  ownerId: string
  ownerName: string
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED'
  archivedAt: Date | null
}

export interface BundlePriorSprintTodo {
  id: string
  title: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  progressValue: number | null
  keyResultId: string | null
  /** Number of times this todo has already been carried over. */
  carryoverCount: number
  completedAt: Date | null
}

export interface BundlePriorSprint {
  id: string
  name: string
  state: string
  startDate: Date | null
  endDate: Date | null
  todos: BundlePriorSprintTodo[]
  /** Aggregate roll-up the AI uses for prevSprintReview without re-counting. */
  totals: { planned: number; completed: number; pending: number; cancelled: number }
}

export interface BundleTimeframe {
  id: string
  name: string
  type: string
  startDate: Date
  endDate: Date
}

export interface ContextBundle {
  mode: GenerationMode
  subject: BundleSubject
  timeframe: BundleTimeframe | null
  objectives: BundleObjective[]
  /** Direct parents of in-scope objectives (1 hop up). Empty when none. */
  parentObjectives: BundleObjective[]
  keyResults: BundleKeyResult[]
  /** Last 1–2 prior sprints for the subject (most recent first). */
  priorSprints: BundlePriorSprint[]
  /** Incomplete todos eligible for carryover triage (see lib/ai/carryover.ts). */
  carryoverCandidates: CarryoverTodoInput[]
  /** MANUAL only: incomplete todos linked to KRs the user did NOT pick. AUTO mode → []. */
  outOfScopeCarryover: Array<{ todoId: string; keyResultId: string; keyResultTitle: string }>
  /** AUTO only: cross-team off-track KRs the subject contributes to. MANUAL → []. */
  crossTeamOffTrackKrs: Array<{ keyResultId: string; objectiveTitle: string; ownerName: string }>
}

export interface BuildContextBundleParams {
  subjectUserId: string
  /** Identity of the caller — used for privacy gating across other users' data. */
  requester: { userId: string; role: 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE' }
  mode: GenerationMode
  /** Required when mode=MANUAL. Ignored otherwise. */
  objectiveIds?: string[]
  /** Required when mode=MANUAL. Ignored otherwise. */
  keyResultIds?: string[]
  /** Defaults to the active timeframe. */
  timeframeId?: string
  /** Sprint window (used to scope prior-sprint queries, etc.). */
  sprintStart: Date
}

/**
 * Thrown when MANUAL mode references ids the requester / subject can't see or that
 * don't belong to active OKRs. The route returns 403 with details.invalidIds.
 */
export class InvalidScopeError extends Error {
  constructor(public readonly invalidIds: string[]) {
    super(`Invalid scope ids: ${invalidIds.join(', ')}`)
    this.name = 'InvalidScopeError'
  }
}

const PRIVATE_ROLES_BYPASS = new Set(['ADMIN', 'EXECUTIVE'])

export async function buildContextBundle(params: BuildContextBundleParams): Promise<ContextBundle> {
  const subject = await prisma.user.findUnique({
    where: { id: params.subjectUserId },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  })
  if (!subject) {
    throw new Error(`Subject not found: ${params.subjectUserId}`)
  }

  const timeframe = await resolveTimeframe(params.timeframeId)

  const canSeePrivate = PRIVATE_ROLES_BYPASS.has(params.requester.role) || params.requester.userId === subject.id

  // ---- Objectives + KRs --------------------------------------------------
  const { objectives, keyResults, parentObjectives } =
    params.mode === 'AUTO'
      ? await loadScopeAuto({ subjectId: subject.id, timeframeId: timeframe?.id, canSeePrivate, requesterId: params.requester.userId })
      : await loadScopeManual({
          subjectId: subject.id,
          objectiveIds: params.objectiveIds ?? [],
          keyResultIds: params.keyResultIds ?? [],
          canSeePrivate,
          requesterId: params.requester.userId,
        })

  const inScopeKrIds = new Set(keyResults.map((k) => k.id))

  // ---- Prior sprints ------------------------------------------------------
  const priorSprints = await loadPriorSprints(subject.id, params.sprintStart, 2)

  // ---- Carryover candidates (incomplete todos from latest prior sprint) ---
  const latestPrior = priorSprints[0]
  const { carryoverCandidates, outOfScopeCarryover } = latestPrior
    ? await partitionCarryover({
        priorSprintId: latestPrior.id,
        inScopeKrIds,
        applyScopeFilter: params.mode === 'MANUAL',
      })
    : { carryoverCandidates: [], outOfScopeCarryover: [] }

  // ---- AUTO-only cross-team off-track signal -----------------------------
  const crossTeamOffTrackKrs =
    params.mode === 'AUTO'
      ? await loadCrossTeamOffTrack({ subjectId: subject.id, timeframeId: timeframe?.id, canSeePrivate, requesterId: params.requester.userId })
      : []

  return {
    mode: params.mode,
    subject,
    timeframe,
    objectives,
    parentObjectives,
    keyResults,
    priorSprints,
    carryoverCandidates,
    outOfScopeCarryover,
    crossTeamOffTrackKrs,
  }
}

// ============================================================================
// Internal loaders
// ============================================================================

async function resolveTimeframe(timeframeId?: string): Promise<BundleTimeframe | null> {
  const tf = timeframeId
    ? await prisma.timeframe.findUnique({ where: { id: timeframeId } })
    : await prisma.timeframe.findFirst({ where: { isActive: true }, orderBy: { startDate: 'desc' } })
  if (!tf) return null
  return {
    id: tf.id,
    name: tf.name,
    type: tf.type,
    startDate: tf.startDate,
    endDate: tf.endDate,
  }
}

async function loadScopeAuto(params: {
  subjectId: string
  timeframeId: string | undefined
  canSeePrivate: boolean
  requesterId: string
}): Promise<{ objectives: BundleObjective[]; keyResults: BundleKeyResult[]; parentObjectives: BundleObjective[] }> {
  // Subject's owned + contributed ACTIVE objectives. We first try scoped to the
  // active timeframe; if the user has no objectives in that timeframe (a real
  // case in this org where many KRs sit in FY2024/25 or quarterly windows that
  // aren't currently isActive), we fall back to all-timeframes rather than
  // returning an empty bundle and producing an empty plan.
  const baseWhere = {
    status: 'ACTIVE' as const,
    OR: [
      { ownerId: params.subjectId },
      { contributors: { some: { userId: params.subjectId } } },
    ],
  }

  let objs = await prisma.objective.findMany({
    where: {
      ...baseWhere,
      ...(params.timeframeId && { timeframeId: params.timeframeId }),
    },
    include: {
      owner: { select: { id: true, name: true } },
      keyResults: {
        where: { status: 'ACTIVE' },
        include: { owner: { select: { id: true, name: true } } },
      },
    },
  })

  if (objs.length === 0 && params.timeframeId) {
    objs = await prisma.objective.findMany({
      where: baseWhere,
      include: {
        owner: { select: { id: true, name: true } },
        keyResults: {
          where: { status: 'ACTIVE' },
          include: { owner: { select: { id: true, name: true } } },
        },
      },
    })
  }

  const objectives = objs
    .filter((o) => filterPrivacy(o, params.canSeePrivate, params.requesterId, params.subjectId))
    .map(toBundleObjective)

  const keyResults = objs.flatMap((o) =>
    o.keyResults
      .filter((kr) => filterPrivacy(kr, params.canSeePrivate, params.requesterId, params.subjectId))
      .map(toBundleKeyResult)
  )

  const parentIds = Array.from(new Set(objectives.map((o) => o.parentObjectiveId).filter((v): v is string => Boolean(v))))
  const parents = parentIds.length
    ? await prisma.objective.findMany({
        where: { id: { in: parentIds } },
        include: { owner: { select: { id: true, name: true } } },
      })
    : []
  const parentObjectives = parents
    .filter((p) => filterPrivacy(p, params.canSeePrivate, params.requesterId, params.subjectId))
    .map(toBundleObjective)

  return { objectives, keyResults, parentObjectives }
}

async function loadScopeManual(params: {
  subjectId: string
  objectiveIds: string[]
  keyResultIds: string[]
  canSeePrivate: boolean
  requesterId: string
}) {
  if (params.keyResultIds.length === 0) {
    throw new InvalidScopeError(['keyResultIds is empty'])
  }

  // Resolve KRs first, then derive objectives (KRs are the leaves the user planned around).
  const krs = await prisma.keyResult.findMany({
    where: { id: { in: params.keyResultIds } },
    include: {
      owner: { select: { id: true, name: true } },
      objective: { include: { owner: { select: { id: true, name: true } } } },
    },
  })

  const foundKrIds = new Set(krs.map((k) => k.id))
  const missing = params.keyResultIds.filter((id) => !foundKrIds.has(id))
  if (missing.length) throw new InvalidScopeError(missing)

  const visibleKrs = krs.filter((k) => filterPrivacy(k, params.canSeePrivate, params.requesterId, params.subjectId))
  const hidden = krs.length - visibleKrs.length
  if (hidden > 0) {
    throw new InvalidScopeError(krs.filter((k) => !visibleKrs.includes(k)).map((k) => k.id))
  }

  // Verify each KR is ACTIVE — picker should have filtered, but defensive.
  const inactive = visibleKrs.filter((k) => k.status !== 'ACTIVE')
  if (inactive.length) throw new InvalidScopeError(inactive.map((k) => k.id))

  const keyResults = visibleKrs.map(toBundleKeyResult)

  // Objectives: union of (a) the KRs' parent objectives + (b) the user's explicitly picked objectiveIds.
  const objIdSet = new Set<string>([
    ...visibleKrs.map((k) => k.objectiveId),
    ...(params.objectiveIds ?? []),
  ])
  const objs = objIdSet.size
    ? await prisma.objective.findMany({
        where: { id: { in: Array.from(objIdSet) } },
        include: {
          owner: { select: { id: true, name: true } },
          keyResults: {
            where: { status: 'ACTIVE', id: { in: params.keyResultIds } },
            include: { owner: { select: { id: true, name: true } } },
          },
        },
      })
    : []

  const visibleObjs = objs.filter((o) => filterPrivacy(o, params.canSeePrivate, params.requesterId, params.subjectId))
  const hiddenObjIds = objs.filter((o) => !visibleObjs.includes(o)).map((o) => o.id)
  if (hiddenObjIds.length) throw new InvalidScopeError(hiddenObjIds)

  const objectives = visibleObjs.map(toBundleObjective)

  // Parents (1 hop up) — context only.
  const parentIds = Array.from(new Set(objectives.map((o) => o.parentObjectiveId).filter((v): v is string => Boolean(v))))
  const parents = parentIds.length
    ? await prisma.objective.findMany({
        where: { id: { in: parentIds } },
        include: { owner: { select: { id: true, name: true } } },
      })
    : []
  const parentObjectives = parents
    .filter((p) => filterPrivacy(p, params.canSeePrivate, params.requesterId, params.subjectId))
    .map(toBundleObjective)

  return { objectives, keyResults, parentObjectives }
}

async function loadPriorSprints(subjectId: string, before: Date, limit: number): Promise<BundlePriorSprint[]> {
  const sprints = await prisma.sprint.findMany({
    where: {
      ownerId: subjectId,
      OR: [{ endDate: { lt: before } }, { state: { in: ['COMPLETED', 'CANCELLED'] } }, { state: 'ACTIVE' }],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      todos: {
        select: {
          id: true,
          title: true,
          status: true,
          progressValue: true,
          keyResultId: true,
          carryoverCount: true,
          completedAt: true,
        },
      },
    },
  })

  return sprints.map((s) => {
    const todos = s.todos.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status as BundlePriorSprintTodo['status'],
      progressValue: t.progressValue,
      keyResultId: t.keyResultId,
      carryoverCount: t.carryoverCount,
      completedAt: t.completedAt,
    }))
    const totals = {
      planned: todos.length,
      completed: todos.filter((t) => t.status === 'COMPLETED').length,
      pending: todos.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length,
      cancelled: todos.filter((t) => t.status === 'CANCELLED').length,
    }
    return {
      id: s.id,
      name: s.name,
      state: s.state,
      startDate: s.startDate,
      endDate: s.endDate,
      todos,
      totals,
    }
  })
}

async function partitionCarryover(params: {
  priorSprintId: string
  inScopeKrIds: Set<string>
  applyScopeFilter: boolean
}): Promise<{
  carryoverCandidates: CarryoverTodoInput[]
  outOfScopeCarryover: Array<{ todoId: string; keyResultId: string; keyResultTitle: string }>
}> {
  const todos = await prisma.todo.findMany({
    where: {
      sprintId: params.priorSprintId,
      status: { in: ['PENDING', 'IN_PROGRESS'] },
    },
    include: {
      assignee: { select: { id: true, isActive: true } },
      keyResult: { select: { id: true, title: true, status: true, archivedAt: true, targetValue: true, currentValue: true } },
    },
  })

  const inScope: CarryoverTodoInput[] = []
  const outOfScope: Array<{ todoId: string; keyResultId: string; keyResultTitle: string }> = []

  for (const t of todos) {
    const krId = t.keyResultId
    if (params.applyScopeFilter && krId && !params.inScopeKrIds.has(krId)) {
      if (t.keyResult) {
        outOfScope.push({ todoId: t.id, keyResultId: t.keyResult.id, keyResultTitle: t.keyResult.title })
      }
      continue
    }
    inScope.push({
      id: t.id,
      status: t.status as CarryoverTodoInput['status'],
      carryoverCount: t.carryoverCount,
      dueDate: t.dueDate,
      progressValue: t.progressValue,
      assignee: t.assignee ? { id: t.assignee.id, isActive: t.assignee.isActive } : { id: '', isActive: false },
      keyResult: t.keyResult
        ? {
            id: t.keyResult.id,
            status: t.keyResult.status as 'ACTIVE' | 'ARCHIVED' | 'DELETED',
            archivedAt: t.keyResult.archivedAt,
            targetValue: t.keyResult.targetValue,
            currentValue: t.keyResult.currentValue,
          }
        : null,
    })
  }

  return { carryoverCandidates: inScope, outOfScopeCarryover: outOfScope }
}

async function loadCrossTeamOffTrack(params: {
  subjectId: string
  timeframeId: string | undefined
  canSeePrivate: boolean
  requesterId: string
}): Promise<Array<{ keyResultId: string; objectiveTitle: string; ownerName: string }>> {
  const krs = await prisma.keyResult.findMany({
    where: {
      status: 'ACTIVE',
      confidence: 'OFF_TRACK',
      objective: {
        ...(params.timeframeId && { timeframeId: params.timeframeId }),
        contributors: { some: { userId: params.subjectId } },
      },
      NOT: { ownerId: params.subjectId },
    },
    include: {
      objective: { select: { title: true, isPrivate: true, ownerId: true } },
      owner: { select: { name: true } },
    },
    take: 10,
  })

  return krs
    .filter((k) =>
      filterPrivacy(
        { isPrivate: k.isPrivate, ownerId: k.ownerId } as any,
        params.canSeePrivate,
        params.requesterId,
        params.subjectId
      )
    )
    .map((k) => ({ keyResultId: k.id, objectiveTitle: k.objective.title, ownerName: k.owner.name }))
}

// ============================================================================
// Mappers + privacy
// ============================================================================

function filterPrivacy(
  row: { isPrivate?: boolean | null; ownerId?: string },
  canSeePrivate: boolean,
  requesterId: string,
  subjectId: string
): boolean {
  if (!row.isPrivate) return true
  if (canSeePrivate) return true
  if (row.ownerId === subjectId || row.ownerId === requesterId) return true
  return false
}

function toBundleObjective(o: {
  id: string
  title: string
  description: string | null
  level: string
  status: string
  goalStatus: string
  progress: number
  confidence: number
  startDate: Date | null
  endDate: Date | null
  weight: number
  ownerId: string
  parentObjectiveId: string | null
  departmentId: string | null
  owner: { id: string; name: string }
}): BundleObjective {
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    level: o.level as BundleObjective['level'],
    status: o.status,
    goalStatus: o.goalStatus,
    progress: o.progress,
    confidence: o.confidence,
    startDate: o.startDate,
    endDate: o.endDate,
    weight: o.weight,
    ownerId: o.ownerId,
    ownerName: o.owner.name,
    parentObjectiveId: o.parentObjectiveId,
    departmentId: o.departmentId,
  }
}

function toBundleKeyResult(k: {
  id: string
  objectiveId: string
  title: string
  description: string | null
  startValue: number
  targetValue: number
  currentValue: number
  unit: string
  confidence: string
  progress: number
  weight: number
  ownerId: string
  status: string
  archivedAt: Date | null
  owner: { id: string; name: string }
}): BundleKeyResult {
  return {
    id: k.id,
    objectiveId: k.objectiveId,
    title: k.title,
    description: k.description,
    startValue: k.startValue,
    targetValue: k.targetValue,
    currentValue: k.currentValue,
    unit: k.unit,
    confidence: (k.confidence as BundleKeyResult['confidence']) ?? 'AT_RISK',
    progress: k.progress,
    weight: k.weight,
    ownerId: k.ownerId,
    ownerName: k.owner.name,
    status: k.status as BundleKeyResult['status'],
    archivedAt: k.archivedAt,
  }
}
