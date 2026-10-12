/**
 * Employee OKR profile loader (PRF-7…11) — `GET /api/users/[id]/okr-profile`.
 *
 * One person, one timeframe:
 *   - objectives they own, plus objectives they contribute to (own a KR in, or are an
 *     ObjectiveContributor of) — `buildObjectiveVisibilityWhere` (status + record
 *     scope) and per-row redaction from lib/okr/visibility-scope.ts (PRF-5);
 *   - each KR's next checkpoint, last check-in, milestones (Todo kind=MILESTONE,
 *     with checklist steps), tasks (TASK / DEPENDENCY, with sprint) and the duties
 *     linked to it (package `duties` area, lib/package/access.ts via
 *     `buildPackageVisibility`);
 *   - "blocked" flags from late inbound WorkDependency links (DEP-2/3);
 *   - PRF-11 action verdicts (in-memory mirrors of the lib/permissions.ts rules —
 *     every acting route re-checks);
 *   - Past OKRs (PRF-10): the person's CLOSED objectives from earlier timeframes with
 *     their KRs, outcome, final grade, retrospective availability and SUCCEEDS /
 *     rolled-forward successors (resolved and redacted by lib/connections/okr-items).
 *
 * Batched: a fixed number of queries whatever the tree size. Server only; imported
 * by direct path from app/ (route) and P1's Overview card (`getOkrProfileSummary`).
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveDefaultTimeframe } from '@/lib/okr/active-timeframe'
import { isTimeframeEnded } from '@/lib/okr/period-close'
import {
  buildKeyResultVisibilityWhere,
  buildObjectiveVisibilityWhere,
  canViewKeyResultInMemory,
  canViewObjectiveInMemory,
  loadViewerContext,
  type ViewerContext,
  type VisibilityVerdict,
} from '@/lib/okr/visibility-scope'
import { buildPackageVisibility } from '@/lib/connections/service'
import { resolveOkrItems, type OkrRef } from '@/lib/connections/okr-items'
import { dependencyDirection, dependencyTiming, dutyHref } from '@/lib/connections/flags'
import type { ConnectionItem } from '@/lib/connections/types'
import { isOkrLinkSubKind, isTodoKind, type OkrLinkSubKind } from '@/types/package'
import {
  canEditKeyResultInMemory,
  canEditObjectiveInMemory,
  canOpenCloseFlow,
  canWorkOnKeyResult,
  commitmentOrNull,
  computeHeader,
  isSeesAllRole,
  keyResultStatusKey,
  levelBucket,
  nextPendingCheckpoint,
  objectiveStatusKey,
  pastDisposition,
  sortByRef,
  sortObjectives,
  sortTodos,
  successorLabel,
  successorRelationLabel,
  todoVisibleInProfile,
  type OkrEditViewer,
} from './okr-profile-utils'
import type {
  OkrProfileCheckpoint,
  OkrProfileDuty,
  OkrProfileHeader,
  OkrProfileKeyResult,
  OkrProfileObjective,
  OkrProfilePastKeyResult,
  OkrProfilePastObjective,
  OkrProfilePayload,
  OkrProfilePerson,
  OkrProfileSuccessor,
  OkrProfileTimeframe,
  OkrProfileTodo,
} from './types'

/** Objectives shown in the tree (a person rarely has more than ~30 in one period). */
const MAX_OBJECTIVES = 200
const MAX_TODOS = 2000
const MAX_PAST = 40
const TREE_TODO_KINDS = ['MILESTONE', 'TASK', 'DEPENDENCY'] as const

export class OkrProfileError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'OkrProfileError'
  }
}

export interface OkrProfileViewer {
  id: string
  role: string
}

export interface LoadOkrProfileOptions {
  timeframeId?: string | null
  now?: Date
  /** Skip the Past OKRs queries (summary cards). Default true. */
  includePast?: boolean
}

const PERSON = { select: { id: true, name: true, avatar: true } } as const

const KR_SELECT = {
  id: true,
  title: true,
  externalRef: true,
  ownerId: true,
  isPrivate: true,
  progress: true,
  confidence: true,
  closureStatus: true,
  outcome: true,
  finalGrade: true,
  closureNote: true,
  isLocked: true,
  commitment: true,
  unit: true,
  startValue: true,
  currentValue: true,
  targetValue: true,
  direction: true,
  createdAt: true,
  owner: PERSON,
} as const

const OBJECTIVE_SELECT = {
  id: true,
  title: true,
  externalRef: true,
  level: true,
  ownerId: true,
  departmentId: true,
  isPrivate: true,
  progress: true,
  goalStatus: true,
  closureStatus: true,
  outcome: true,
  finalGrade: true,
  closureNote: true,
  isLocked: true,
  owner: PERSON,
  keyResults: { where: { status: 'ACTIVE' }, select: KR_SELECT, orderBy: { createdAt: 'asc' } },
} as const

type ObjectiveRow = Prisma.ObjectiveGetPayload<{ select: typeof OBJECTIVE_SELECT }>
type KeyResultRow = ObjectiveRow['keyResults'][number]

function person(p: { id: string; name: string | null; avatar: string | null } | null | undefined): OkrProfilePerson | null {
  return p ? { id: p.id, name: p.name, avatar: p.avatar } : null
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

function key(type: string, id: string): string {
  return `${type}:${id}`
}

// ---------------------------------------------------------------------------
// Timeframe
// ---------------------------------------------------------------------------

async function resolveTimeframe(timeframeId: string | null | undefined, now: Date): Promise<OkrProfileTimeframe | null> {
  const select = { id: true, name: true, startDate: true, endDate: true } as const
  const tf = timeframeId
    ? await prisma.timeframe.findUnique({ where: { id: timeframeId }, select })
    : await resolveDefaultTimeframe()
  if (!tf) {
    if (timeframeId) throw new OkrProfileError(404, 'Timeframe not found')
    return null
  }
  return {
    id: tf.id,
    name: tf.name,
    startDate: tf.startDate.toISOString(),
    endDate: tf.endDate.toISOString(),
    ended: isTimeframeEnded(tf.endDate, now),
  }
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

interface TreePlanKr {
  row: KeyResultRow
  verdict: VisibilityVerdict
  canEdit: boolean
}

interface TreePlanObjective {
  row: ObjectiveRow
  involvement: 'OWNED' | 'CONTRIBUTED'
  verdict: VisibilityVerdict
  canEdit: boolean
  krs: TreePlanKr[]
  openKeyResults: number
}

function planTree(ctx: ViewerContext, editor: OkrEditViewer, userId: string, rows: ObjectiveRow[]): TreePlanObjective[] {
  return rows.map((row) => {
    const involvement = row.ownerId === userId ? 'OWNED' : 'CONTRIBUTED'
    const verdict = canViewObjectiveInMemory(ctx, row)
    const own = row.keyResults.filter((kr) => kr.ownerId === userId)
    // Contributed objectives show the person's own KRs (all KRs when they only contribute).
    const shown = involvement === 'OWNED' || own.length === 0 ? row.keyResults : own
    return {
      row,
      involvement,
      verdict,
      canEdit: !verdict.isRedacted && canEditObjectiveInMemory(editor, row),
      openKeyResults: row.keyResults.filter((kr) => kr.closureStatus !== 'CLOSED').length,
      krs: shown.map((kr) => {
        const krVerdict = canViewKeyResultInMemory(ctx, kr, verdict)
        return { row: kr, verdict: krVerdict, canEdit: !krVerdict.isRedacted && canEditKeyResultInMemory(editor, kr, row) }
      }),
    }
  })
}

const TODO_SELECT = (viewerId: string) =>
  ({
    id: true,
    cardNumber: true,
    title: true,
    kind: true,
    status: true,
    dueDate: true,
    completedAt: true,
    assigneeId: true,
    creatorId: true,
    keyResultId: true,
    objectiveId: true,
    sprintId: true,
    assignee: PERSON,
    members: { where: { userId: viewerId }, select: { userId: true } },
    sprint: {
      select: {
        id: true,
        name: true,
        ownerId: true,
        participants: { where: { userId: viewerId }, select: { userId: true } },
      },
    },
    checklists: {
      orderBy: { position: 'asc' },
      select: {
        items: {
          orderBy: { position: 'asc' },
          select: { id: true, title: true, completed: true, dueDate: true },
        },
      },
    },
  }) satisfies Prisma.TodoSelect

type TodoRow = Prisma.TodoGetPayload<{ select: ReturnType<typeof TODO_SELECT> }>

function todoDto(t: TodoRow, canViewSprint: boolean, blocked: boolean): OkrProfileTodo {
  const kind = isTodoKind(t.kind) ? t.kind : 'TASK'
  return {
    id: t.id,
    cardNumber: t.cardNumber,
    title: t.title,
    kind,
    status: t.status,
    dueDate: iso(t.dueDate),
    completedAt: iso(t.completedAt),
    assignee: person(t.assignee),
    sprint: t.sprint && canViewSprint ? { id: t.sprint.id, name: t.sprint.name } : null,
    blocked,
    steps:
      kind === 'MILESTONE'
        ? t.checklists.flatMap((c) =>
            c.items.map((i) => ({ id: i.id, title: i.title, completed: i.completed, dueDate: iso(i.dueDate) })),
          )
        : [],
  }
}

interface TreeResult {
  objectives: OkrProfileObjective[]
  lastCheckInAt: string | null
}

async function loadTree(
  ctx: ViewerContext,
  viewer: OkrProfileViewer,
  userId: string,
  timeframe: OkrProfileTimeframe,
  now: Date,
): Promise<TreeResult> {
  const seesAll = isSeesAllRole(viewer.role)
  const editor: OkrEditViewer = {
    id: viewer.id,
    role: viewer.role,
    departmentIds: ctx.departmentIds,
    directReportIds: ctx.directReportIds,
  }

  const rows = await prisma.objective.findMany({
    where: {
      AND: [
        buildObjectiveVisibilityWhere(ctx),
        { timeframeId: timeframe.id, status: 'ACTIVE' },
        {
          OR: [
            { ownerId: userId },
            { keyResults: { some: { ownerId: userId, status: 'ACTIVE' } } },
            { contributors: { some: { userId } } },
          ],
        },
      ],
    },
    select: OBJECTIVE_SELECT,
    take: MAX_OBJECTIVES,
  })

  const plan = planTree(ctx, editor, userId, rows)
  const objIds = plan.map((p) => p.row.id)
  const krIds = plan.flatMap((p) => p.krs.map((k) => k.row.id))
  const fullKrIds = plan.flatMap((p) => p.krs.filter((k) => !k.verdict.isRedacted).map((k) => k.row.id))

  const fullyVisibleKr = buildKeyResultVisibilityWhere(ctx, { includeRedacted: false })

  const [checkpoints, checkInMax, todos, duties, lastCheckIn] = await Promise.all([
    fullKrIds.length
      ? prisma.keyResultCheckpoint.findMany({
          where: { keyResultId: { in: fullKrIds } },
          select: { id: true, keyResultId: true, label: true, dueDate: true, status: true, targetText: true },
          orderBy: { dueDate: 'asc' },
        })
      : Promise.resolve([]),
    fullKrIds.length
      ? prisma.keyResultCheckIn.groupBy({
          by: ['keyResultId'],
          where: { keyResultId: { in: fullKrIds } },
          _max: { createdAt: true },
        })
      : Promise.resolve([]),
    objIds.length
      ? prisma.todo.findMany({
          where: {
            OR: [{ keyResultId: { in: krIds } }, { objectiveId: { in: objIds }, keyResultId: null }],
            kind: { in: [...TREE_TODO_KINDS] },
            archivedAt: null,
            recurrenceParentId: null,
            status: { not: 'CANCELLED' },
          },
          select: TODO_SELECT(viewer.id),
          orderBy: { cardNumber: 'asc' },
          take: MAX_TODOS,
        })
      : Promise.resolve([] as TodoRow[]),
    krIds.length
      ? prisma.recurringDuty.findMany({
          where: { keyResultId: { in: krIds }, status: { not: 'RETIRED' } },
          select: {
            id: true,
            title: true,
            externalRef: true,
            cadence: true,
            status: true,
            timingText: true,
            ownerId: true,
            keyResultId: true,
            owner: PERSON,
          },
          orderBy: { title: 'asc' },
        })
      : Promise.resolve([]),
    // Check-in feeds cannot be redacted: only KRs the viewer sees in full count.
    prisma.keyResultCheckIn.findFirst({
      where: {
        AND: [{ OR: [{ createdById: userId }, { keyResult: { ownerId: userId } }] }, { keyResult: fullyVisibleKr }],
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])

  // Lookups for the plan.
  const objPlanById = new Map(plan.map((p) => [p.row.id, p]))
  const krPlanById = new Map(plan.flatMap((p) => p.krs.map((k) => [k.row.id, { kr: k, obj: p }] as const)))

  // Todo visibility (participants, KR editors, board / OKR viewers).
  const visibleTodos: Array<{ row: TodoRow; canViewSprint: boolean }> = []
  for (const t of todos) {
    const parent = t.keyResultId ? krPlanById.get(t.keyResultId) : null
    const objParent = !parent && t.objectiveId ? objPlanById.get(t.objectiveId) : null
    if (!parent && !objParent) continue
    const canViewSprint =
      !!t.sprint && (seesAll || t.sprint.ownerId === viewer.id || t.sprint.participants.length > 0)
    const isParticipant = t.assigneeId === viewer.id || t.creatorId === viewer.id || t.members.length > 0
    const visible = todoVisibleInProfile({
      seesAll,
      isParticipant,
      canEditParent: parent ? parent.kr.canEdit : objParent!.canEdit,
      inSprint: !!t.sprintId,
      canViewSprint,
      parentFullyVisible: parent ? !parent.kr.verdict.isRedacted : !objParent!.verdict.isRedacted,
    })
    if (visible) visibleTodos.push({ row: t, canViewSprint })
  }

  // DEP-2/3: late inbound dependencies linked to objectives, KRs and visible cards.
  const todoIds = visibleTodos.map((t) => t.row.id)
  const linkOr: Prisma.WorkDependencyLinkWhereInput[] = []
  if (objIds.length) linkOr.push({ entityType: 'OBJECTIVE', entityId: { in: objIds } })
  if (krIds.length) linkOr.push({ entityType: 'KEY_RESULT', entityId: { in: krIds } })
  if (todoIds.length) linkOr.push({ entityType: 'TODO', entityId: { in: todoIds } })
  const depLinks = linkOr.length
    ? await prisma.workDependencyLink.findMany({
        where: { OR: linkOr },
        select: {
          entityType: true,
          entityId: true,
          dependency: {
            select: { status: true, neededByDate: true, parties: { select: { userId: true, role: true } } },
          },
        },
      })
    : []
  const ownerOf = new Map<string, string | null>()
  for (const p of plan) {
    ownerOf.set(key('OBJECTIVE', p.row.id), p.row.ownerId)
    for (const k of p.krs) ownerOf.set(key('KEY_RESULT', k.row.id), k.row.ownerId)
  }
  for (const t of visibleTodos) ownerOf.set(key('TODO', t.row.id), t.row.assigneeId)
  const blocked = new Set<string>()
  for (const link of depLinks) {
    const k = key(link.entityType, link.entityId)
    if (blocked.has(k)) continue
    const direction = dependencyDirection(ownerOf.get(k) ?? null, link.dependency.parties)
    if (direction === 'INBOUND' && dependencyTiming(link.dependency, now).late) blocked.add(k)
  }

  // Duties visible to the viewer (package `duties` area per owner).
  const dutyVisible = duties.length
    ? await buildPackageVisibility(
        ctx,
        duties.map((d) => d.ownerId),
      )
    : () => true
  const dutiesByKr = new Map<string, OkrProfileDuty[]>()
  for (const d of duties) {
    if (!d.keyResultId || !dutyVisible('duties', d.ownerId)) continue
    const list = dutiesByKr.get(d.keyResultId) ?? []
    list.push({
      id: d.id,
      title: d.title,
      ref: d.externalRef,
      cadence: d.cadence,
      status: d.status,
      timingText: d.timingText,
      owner: { id: d.owner.id, name: d.owner.name, avatar: d.owner.avatar },
      href: dutyHref(d.ownerId),
    })
    dutiesByKr.set(d.keyResultId, list)
  }

  const checkpointsByKr = new Map<string, typeof checkpoints>()
  for (const cp of checkpoints) {
    const list = checkpointsByKr.get(cp.keyResultId) ?? []
    list.push(cp)
    checkpointsByKr.set(cp.keyResultId, list)
  }
  const lastCheckInByKr = new Map(checkInMax.map((r) => [r.keyResultId, r._max.createdAt ?? null]))

  const todosByKr = new Map<string, OkrProfileTodo[]>()
  const todosByObjective = new Map<string, OkrProfileTodo[]>()
  for (const { row, canViewSprint } of visibleTodos) {
    const dto = todoDto(row, canViewSprint, blocked.has(key('TODO', row.id)))
    const bucket = row.keyResultId ? todosByKr : todosByObjective
    const id = (row.keyResultId ?? row.objectiveId) as string
    const list = bucket.get(id) ?? []
    list.push(dto)
    bucket.set(id, list)
  }

  const canCloseEarly = seesAll
  const objectives: OkrProfileObjective[] = plan.map((p) => {
    const o = p.row
    const redacted = p.verdict.isRedacted
    const keyResults: OkrProfileKeyResult[] = p.krs.map(({ row: kr, verdict, canEdit }) => {
      const krRedacted = verdict.isRedacted
      const cps = krRedacted ? [] : checkpointsByKr.get(kr.id) ?? []
      const next = nextPendingCheckpoint(cps, now)
      const nextCheckpoint: OkrProfileCheckpoint | null = next
        ? { id: next.id, label: next.label, dueDate: next.dueDate.toISOString(), status: next.status, targetText: next.targetText }
        : null
      const all = todosByKr.get(kr.id) ?? []
      const work = canWorkOnKeyResult({
        canEdit,
        redacted: krRedacted,
        closureStatus: kr.closureStatus,
        krLocked: kr.isLocked,
        objectiveLocked: o.isLocked,
        timeframeEnded: timeframe.ended,
      })
      return {
        id: kr.id,
        redacted: krRedacted,
        title: krRedacted ? null : kr.title,
        ref: krRedacted ? null : kr.externalRef,
        owner: person(kr.owner),
        ownedBySubject: kr.ownerId === userId,
        progress: kr.progress,
        confidence: kr.confidence,
        statusKey: keyResultStatusKey(kr.confidence, kr.closureStatus),
        closureStatus: kr.closureStatus,
        outcome: krRedacted ? null : kr.outcome,
        finalGrade: krRedacted ? null : kr.finalGrade,
        closureNote: krRedacted ? null : kr.closureNote,
        isLocked: kr.isLocked,
        commitment: krRedacted ? null : commitmentOrNull(kr.commitment),
        unit: krRedacted ? null : kr.unit,
        startValue: krRedacted ? null : kr.startValue,
        currentValue: krRedacted ? null : kr.currentValue,
        targetValue: krRedacted ? null : kr.targetValue,
        direction: kr.direction,
        nextCheckpoint,
        checkpointCounts: {
          total: cps.length,
          met: cps.filter((c) => c.status === 'MET').length,
          missed: cps.filter((c) => c.status === 'MISSED').length,
        },
        lastCheckInAt: krRedacted ? null : iso(lastCheckInByKr.get(kr.id) ?? null),
        blocked: !krRedacted && blocked.has(key('KEY_RESULT', kr.id)),
        milestones: sortTodos(all.filter((t) => t.kind === 'MILESTONE')),
        tasks: sortTodos(all.filter((t) => t.kind !== 'MILESTONE')),
        duties: krRedacted ? [] : dutiesByKr.get(kr.id) ?? [],
        actions: {
          canCheckIn: work,
          canAddInitiative: work,
          canClose: canOpenCloseFlow({
            canEdit,
            redacted: krRedacted,
            closureStatus: kr.closureStatus,
            timeframeEnded: timeframe.ended,
            canCloseEarly,
            parentLocked: o.isLocked,
          }),
        },
      }
    })
    return {
      id: o.id,
      redacted,
      title: redacted ? null : o.title,
      ref: redacted ? null : o.externalRef,
      level: o.level,
      involvement: p.involvement,
      levelBucket: levelBucket(p.involvement, o.level),
      owner: person(o.owner),
      progress: o.progress,
      goalStatus: o.goalStatus,
      statusKey: objectiveStatusKey(o.goalStatus, o.closureStatus),
      closureStatus: o.closureStatus,
      outcome: redacted ? null : o.outcome,
      finalGrade: redacted ? null : o.finalGrade,
      closureNote: redacted ? null : o.closureNote,
      isLocked: o.isLocked,
      blocked: !redacted && blocked.has(key('OBJECTIVE', o.id)),
      keyResults: sortByRef(keyResults),
      initiatives: sortTodos(todosByObjective.get(o.id) ?? []),
      actions: {
        canClose: canOpenCloseFlow({
          canEdit: p.canEdit,
          redacted,
          closureStatus: o.closureStatus,
          timeframeEnded: timeframe.ended,
          canCloseEarly,
        }),
        openKeyResults: p.openKeyResults,
      },
    }
  })

  return { objectives: sortObjectives(objectives), lastCheckInAt: iso(lastCheckIn?.createdAt ?? null) }
}

// ---------------------------------------------------------------------------
// Past OKRs (PRF-10)
// ---------------------------------------------------------------------------

interface SuccessorLink {
  type: 'OBJECTIVE' | 'KEY_RESULT'
  id: string
  via: 'SUCCEEDS' | 'ROLLED_FROM'
  linkId?: string
  subKind: OkrLinkSubKind | null
  isPrimary: boolean
}

function successorDto(link: SuccessorLink, item: ConnectionItem): OkrProfileSuccessor {
  return {
    item,
    subKind: link.subKind,
    relationLabel: successorRelationLabel(link.via, link.subKind),
    label: successorLabel(item),
  }
}

async function loadPast(
  ctx: ViewerContext,
  userId: string,
  timeframe: OkrProfileTimeframe | null,
): Promise<{ past: OkrProfilePastObjective[]; truncated: boolean }> {
  const timeframeWhere: Prisma.ObjectiveWhereInput = timeframe
    ? { timeframeId: { not: timeframe.id }, timeframe: { startDate: { lt: new Date(timeframe.startDate) } } }
    : {}
  const rows = await prisma.objective.findMany({
    where: {
      AND: [buildObjectiveVisibilityWhere(ctx), { ownerId: userId, closureStatus: 'CLOSED' }, timeframeWhere],
    },
    select: {
      id: true,
      title: true,
      externalRef: true,
      level: true,
      ownerId: true,
      isPrivate: true,
      closedAt: true,
      outcome: true,
      finalGrade: true,
      finalProgress: true,
      timeframe: { select: { id: true, name: true } },
      retrospective: { select: { id: true } },
      keyResults: {
        where: { status: { not: 'DELETED' } },
        select: {
          id: true,
          title: true,
          externalRef: true,
          ownerId: true,
          isPrivate: true,
          closureStatus: true,
          outcome: true,
          finalGrade: true,
          finalProgress: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ timeframe: { endDate: 'desc' } }, { closedAt: 'desc' }],
    take: MAX_PAST + 1,
  })
  const truncated = rows.length > MAX_PAST
  const shown = rows.slice(0, MAX_PAST)
  if (shown.length === 0) return { past: [], truncated: false }

  const verdicts = new Map<string, VisibilityVerdict>()
  for (const o of shown) {
    const ov = canViewObjectiveInMemory(ctx, o)
    verdicts.set(key('OBJECTIVE', o.id), ov)
    for (const kr of o.keyResults) verdicts.set(key('KEY_RESULT', kr.id), canViewKeyResultInMemory(ctx, kr, ov))
  }
  // Successors are only looked up for items the viewer sees in full.
  const objIds = shown.filter((o) => !verdicts.get(key('OBJECTIVE', o.id))!.isRedacted).map((o) => o.id)
  const krIds = shown.flatMap((o) =>
    o.keyResults.filter((kr) => !verdicts.get(key('KEY_RESULT', kr.id))!.isRedacted).map((kr) => kr.id),
  )

  const linkOr: Prisma.OkrLinkWhereInput[] = []
  if (objIds.length) linkOr.push({ toType: 'OBJECTIVE', toId: { in: objIds } })
  if (krIds.length) linkOr.push({ toType: 'KEY_RESULT', toId: { in: krIds } })
  const [links, rolledObjectives, rolledKrs] = await Promise.all([
    linkOr.length
      ? prisma.okrLink.findMany({
          where: { kind: 'SUCCEEDS', OR: linkOr },
          select: { id: true, fromType: true, fromId: true, toType: true, toId: true, subKind: true, isPrimary: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        })
      : Promise.resolve([]),
    objIds.length
      ? prisma.objective.findMany({
          where: { rolledFromId: { in: objIds }, status: { not: 'DELETED' } },
          select: { id: true, rolledFromId: true },
        })
      : Promise.resolve([]),
    krIds.length
      ? prisma.keyResult.findMany({
          where: { rolledFromId: { in: krIds }, status: { not: 'DELETED' } },
          select: { id: true, rolledFromId: true },
        })
      : Promise.resolve([]),
  ])

  const successorsOf = new Map<string, SuccessorLink[]>()
  const push = (target: string, link: SuccessorLink) => {
    const list = successorsOf.get(target) ?? []
    if (list.some((l) => l.type === link.type && l.id === link.id)) return
    list.push(link)
    successorsOf.set(target, list)
  }
  for (const l of links) {
    if (l.fromType !== 'OBJECTIVE' && l.fromType !== 'KEY_RESULT') continue
    push(key(l.toType, l.toId), {
      type: l.fromType,
      id: l.fromId,
      via: 'SUCCEEDS',
      linkId: l.id,
      subKind: isOkrLinkSubKind(l.subKind) ? l.subKind : null,
      isPrimary: l.isPrimary,
    })
  }
  for (const r of rolledObjectives) {
    if (r.rolledFromId) push(key('OBJECTIVE', r.rolledFromId), { type: 'OBJECTIVE', id: r.id, via: 'ROLLED_FROM', subKind: null, isPrimary: true })
  }
  for (const r of rolledKrs) {
    if (r.rolledFromId) push(key('KEY_RESULT', r.rolledFromId), { type: 'KEY_RESULT', id: r.id, via: 'ROLLED_FROM', subKind: null, isPrimary: true })
  }

  // One batched, redacted resolve for every successor (lib/connections/okr-items).
  const refsByKey = new Map<string, OkrRef>()
  for (const list of Array.from(successorsOf.values())) {
    for (const s of list) {
      const k = key(s.type, s.id)
      if (!refsByKey.has(k)) refsByKey.set(k, { type: s.type, id: s.id, via: s.via })
    }
  }
  const resolved = await resolveOkrItems(prisma, ctx, Array.from(refsByKey.values()))
  const itemByKey = new Map(resolved.map((item) => [key(item.type, item.id), item]))

  const successorsFor = (target: string): OkrProfileSuccessor[] =>
    (successorsOf.get(target) ?? []).flatMap((link) => {
      const item = itemByKey.get(key(link.type, link.id))
      if (!item) return []
      const withRelation: ConnectionItem = {
        ...item,
        via: link.via,
        ...(link.linkId ? { linkId: link.linkId, linkKind: 'SUCCEEDS' as const, subKind: link.subKind, isPrimary: link.isPrimary } : {}),
      }
      return [successorDto(link, withRelation)]
    })

  const past: OkrProfilePastObjective[] = shown.map((o) => {
    const redacted = verdicts.get(key('OBJECTIVE', o.id))!.isRedacted
    const successors = redacted ? [] : successorsFor(key('OBJECTIVE', o.id))
    const keyResults: OkrProfilePastKeyResult[] = redacted
      ? []
      : o.keyResults
          .filter((kr) => verdicts.get(key('KEY_RESULT', kr.id))!.canView)
          .map((kr) => {
            const krRedacted = verdicts.get(key('KEY_RESULT', kr.id))!.isRedacted
            const krSuccessors = krRedacted ? [] : successorsFor(key('KEY_RESULT', kr.id))
            return {
              id: kr.id,
              redacted: krRedacted,
              title: krRedacted ? null : kr.title,
              ref: krRedacted ? null : kr.externalRef,
              closureStatus: kr.closureStatus,
              outcome: krRedacted ? null : kr.outcome,
              finalGrade: krRedacted ? null : kr.finalGrade,
              finalProgress: krRedacted ? null : kr.finalProgress,
              successors: krSuccessors,
              disposition: pastDisposition(krSuccessors.length, krRedacted ? null : kr.outcome),
            }
          })
    return {
      id: o.id,
      redacted,
      title: redacted ? null : o.title,
      ref: redacted ? null : o.externalRef,
      level: o.level,
      timeframe: o.timeframe,
      closedAt: iso(o.closedAt),
      outcome: redacted ? null : o.outcome,
      finalGrade: redacted ? null : o.finalGrade,
      finalProgress: redacted ? null : o.finalProgress,
      hasRetrospective: !redacted && !!o.retrospective,
      successors,
      disposition: pastDisposition(successors.length, redacted ? null : o.outcome),
      keyResults: sortByRef(keyResults),
    }
  })
  return { past, truncated }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * The OKR profile of `userId` for `viewer`, or null when the person does not exist
 * or is inactive. Throws `OkrProfileError(404)` for an unknown `timeframeId`.
 */
export async function loadOkrProfile(
  viewer: OkrProfileViewer,
  userId: string,
  opts: LoadOkrProfileOptions = {},
): Promise<OkrProfilePayload | null> {
  const now = opts.now ?? new Date()
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true, name: true, avatar: true },
  })
  if (!user) return null

  const [timeframe, ctx] = await Promise.all([
    resolveTimeframe(opts.timeframeId, now),
    loadViewerContext({ id: viewer.id, role: viewer.role }),
  ])

  const [tree, pastResult] = await Promise.all([
    timeframe ? loadTree(ctx, viewer, userId, timeframe, now) : Promise.resolve<TreeResult>({ objectives: [], lastCheckInAt: null }),
    opts.includePast === false ? Promise.resolve({ past: [], truncated: false }) : loadPast(ctx, userId, timeframe),
  ])

  return {
    user: { id: user.id, name: user.name, avatar: user.avatar },
    timeframe,
    viewer: { isSelf: viewer.id === userId, canCloseEarly: isSeesAllRole(viewer.role) },
    header: computeHeader(tree.objectives, tree.lastCheckInAt, now),
    objectives: tree.objectives,
    past: pastResult.past,
    pastTruncated: pastResult.truncated,
    generatedAt: now.toISOString(),
  }
}

export interface OkrProfileSummary extends OkrProfileHeader {
  timeframe: { id: string; name: string } | null
}

/**
 * PRF-2 Overview "OKR progress" figures (objectives, KRs, average progress,
 * C/A split, next checkpoint, last check-in) for P1's Package summary card.
 * OKRs are readable by every signed-in user (§8 footnote ²), so this never
 * returns null for a visible person; private rows are redacted, not dropped.
 */
export async function getOkrProfileSummary(
  viewerId: string,
  userId: string,
  timeframeId: string,
  now: Date = new Date(),
): Promise<OkrProfileSummary | null> {
  const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { id: true, role: true } })
  if (!viewer) return null
  let payload: OkrProfilePayload | null
  try {
    payload = await loadOkrProfile(viewer, userId, { timeframeId: timeframeId || null, now, includePast: false })
  } catch (error) {
    if (error instanceof OkrProfileError) return null
    throw error
  }
  if (!payload) return null
  return { ...payload.header, timeframe: payload.timeframe ? { id: payload.timeframe.id, name: payload.timeframe.name } : null }
}
