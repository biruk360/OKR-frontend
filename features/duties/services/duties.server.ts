/**
 * Recurring duties — server service (DUT-1 … DUT-8).
 *
 * Owns the Todo recurrence head lifecycle: every change to a duty and its head
 * happens in one transaction. The head is an ordinary series head
 * (lib/todos/recurrence-generator.ts generates its occurrences) with
 * `kind = DUTY`, `dutyId`, `progressValue = null` and
 * `recurrenceCountsProgress = false`, so duties never inflate KR progress
 * (DUT-7 / FND-6).
 *
 * Access: lib/package/access.ts, area 'duties' (spec §8). Linked OKR items are
 * redacted through lib/okr/visibility-scope.ts.
 *
 * Imported by direct path from app/ only (never from client code).
 */
import { Prisma } from '@prisma/client'
import { addDays } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { resolveFeaturePermission } from '@/lib/permission-resolver'
import { recordPackageActivity, recordPackageUpdateIfChanged } from '@/lib/package/audit'
import {
  canEditPackageArea,
  canViewPackageArea,
  getPackageAreaAccess,
  type PackageViewer,
} from '@/lib/package/access'
import {
  canViewKeyResultInMemory,
  canViewObjectiveInMemory,
  loadViewerContext,
  REDACTED_KEY_RESULT_TITLE,
  REDACTED_OBJECTIVE_TITLE,
  type ViewerContext,
} from '@/lib/okr/visibility-scope'
import { anchorDayForDue, storedAnchorDay } from '@/lib/todos/recurrence'
import { purgeDeletedTodoAttachments, snapshotTodoAttachmentFiles } from '@/lib/attachments/todo-delete'
import { PACKAGE_FEATURE_KEYS, isDutyCadence, isDutyStatus, type DutyCadence, type DutyStatus } from '@/types/package'
import {
  completedOccurrenceCount,
  computeDutyAdherence,
  computeNextDue,
  overdueCount,
  type DutyTodoRow,
} from './adherence'
import {
  atMidnight,
  cadenceToRecurrenceRule,
  dutyCardDescription,
  dutyPlannerTimes,
  dutyWantsHead,
  firstDutyOccurrence,
  nextFutureOccurrence,
  parseTimingText,
  planHeadCursor,
  toDutyDateKey,
} from './schedule'
import type { CreateDutyInput, DutyAction, LogDutyOccurrenceInput, UpdateDutyInput } from './schemas'
import type { DutyDTO, DutyListPayload, DutyListPermissions, DutyLogResult, DutyPerson } from '../types'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type DutyErrorStatus = 400 | 403 | 404 | 409 | 423

export class DutyError extends Error {
  constructor(
    readonly status: DutyErrorStatus,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'DutyError'
  }
}

type Tx = Prisma.TransactionClient

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const PERSON_SELECT = { id: true, name: true, avatar: true } as const

const OKR_OBJECTIVE_SELECT = {
  id: true,
  title: true,
  ownerId: true,
  isPrivate: true,
  level: true,
  departmentId: true,
} as const

const DUTY_INCLUDE = {
  owner: { select: PERSON_SELECT },
  collaborators: { select: { userId: true, user: { select: PERSON_SELECT } } },
  keyResult: {
    select: {
      id: true,
      title: true,
      ownerId: true,
      isPrivate: true,
      objectiveId: true,
      objective: { select: OKR_OBJECTIVE_SELECT },
    },
  },
  objective: { select: OKR_OBJECTIVE_SELECT },
  timeframe: { select: { id: true, name: true, startDate: true, endDate: true } },
} satisfies Prisma.RecurringDutyInclude

type DutyRecord = Prisma.RecurringDutyGetPayload<{ include: typeof DUTY_INCLUDE }>

const TODO_ROW_SELECT = {
  id: true,
  dutyId: true,
  status: true,
  dueDate: true,
  completedAt: true,
  archivedAt: true,
  recurrenceRule: true,
  recurrenceParentId: true,
  recurrenceAnchorDay: true,
} satisfies Prisma.TodoSelect

type TodoRow = Prisma.TodoGetPayload<{ select: typeof TODO_ROW_SELECT }>

const ADHERENCE_WINDOW_DAYS = 90
const OPEN_STATUSES_EXCLUDED = ['COMPLETED', 'CANCELLED']

/**
 * The duty cards the card needs, per duty: everything due in the last 90 days
 * or later, every head, and every open card (for the overdue count). Heads
 * whose generated occurrences are older than the window are flagged
 * `hasChildren` so they are not mistaken for a first occurrence.
 */
export async function loadDutyTodoRows(
  dutyIds: readonly string[],
  now: Date,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Map<string, DutyTodoRow[]>> {
  const out = new Map<string, DutyTodoRow[]>()
  if (dutyIds.length === 0) return out
  const from = addDays(atMidnight(now), -(ADHERENCE_WINDOW_DAYS - 1))
  const rows: TodoRow[] = await db.todo.findMany({
    where: {
      dutyId: { in: [...dutyIds] },
      OR: [
        { dueDate: { gte: from } },
        { recurrenceRule: { not: null } },
        { status: { notIn: OPEN_STATUSES_EXCLUDED }, archivedAt: null },
      ],
    },
    select: TODO_ROW_SELECT,
  })
  const headIds = rows.filter((r) => r.recurrenceRule).map((r) => r.id)
  const withChildren = new Set<string>()
  if (headIds.length > 0) {
    const children = await db.todo.findMany({
      where: { recurrenceParentId: { in: headIds } },
      distinct: ['recurrenceParentId'],
      select: { recurrenceParentId: true },
    })
    for (const c of children) if (c.recurrenceParentId) withChildren.add(c.recurrenceParentId)
  }
  for (const r of rows) {
    if (!r.dutyId) continue
    const list = out.get(r.dutyId) ?? []
    list.push({ ...r, hasChildren: withChildren.has(r.id) })
    out.set(r.dutyId, list)
  }
  return out
}

async function completedCounts(dutyIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (dutyIds.length === 0) return out
  const groups = await prisma.todo.groupBy({
    by: ['dutyId'],
    where: { dutyId: { in: [...dutyIds] }, status: 'COMPLETED' },
    _count: { _all: true },
  })
  for (const g of groups) if (g.dutyId) out.set(g.dutyId, g._count._all)
  return out
}

async function loadDuty(id: string): Promise<DutyRecord> {
  const duty = await prisma.recurringDuty.findUnique({ where: { id }, include: DUTY_INCLUDE })
  if (!duty) throw new DutyError(404, 'NOT_FOUND', 'Duty not found')
  return duty
}

/** The head row, when `todoHeadId` still points at a Todo of this duty (a user may have deleted the card). */
async function loadHead(db: Tx | typeof prisma, duty: { id: string; todoHeadId: string | null }) {
  if (!duty.todoHeadId) return null
  const head = await db.todo.findUnique({
    where: { id: duty.todoHeadId },
    select: {
      ...TODO_ROW_SELECT,
      title: true,
      description: true,
      startDate: true,
      recurrenceEndsAt: true,
      assigneeId: true,
    },
  })
  if (!head || head.dutyId !== duty.id) return null
  return head
}

type HeadRow = NonNullable<Awaited<ReturnType<typeof loadHead>>>

async function headHasChildren(db: Tx | typeof prisma, headId: string): Promise<boolean> {
  const child = await db.todo.findFirst({ where: { recurrenceParentId: headId }, select: { id: true } })
  return Boolean(child)
}

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

function person(p: { id: string; name: string | null; avatar: string | null } | null | undefined): DutyPerson | null {
  if (!p) return null
  return { id: p.id, name: p.name ?? 'Unknown', avatar: p.avatar ?? null }
}

function isTimeframeClosed(timeframe: { endDate: Date }, now: Date): boolean {
  return atMidnight(timeframe.endDate) < atMidnight(now)
}

interface DtoContext {
  okrCtx: ViewerContext
  canEdit: boolean
  readOnly: boolean
  now: Date
}

function toDutyDTO(duty: DutyRecord, rows: DutyTodoRow[], completed: number, ctx: DtoContext): DutyDTO {
  const head = duty.todoHeadId ? rows.find((r) => r.id === duty.todoHeadId) ?? null : null
  const status: DutyStatus = isDutyStatus(duty.status) ? duty.status : 'ACTIVE'
  const cadence: DutyCadence = isDutyCadence(duty.cadence) ? duty.cadence : 'EVENT'

  let keyResult: DutyDTO['keyResult'] = null
  if (duty.keyResult) {
    const objVerdict = canViewObjectiveInMemory(ctx.okrCtx, duty.keyResult.objective)
    const verdict = canViewKeyResultInMemory(ctx.okrCtx, duty.keyResult, objVerdict)
    keyResult = {
      id: duty.keyResult.id,
      objectiveId: duty.keyResult.objectiveId,
      title: verdict.isRedacted ? REDACTED_KEY_RESULT_TITLE : duty.keyResult.title,
      isRedacted: verdict.isRedacted,
    }
  }
  let objective: DutyDTO['objective'] = null
  if (duty.objective) {
    const verdict = canViewObjectiveInMemory(ctx.okrCtx, duty.objective)
    objective = {
      id: duty.objective.id,
      title: verdict.isRedacted ? REDACTED_OBJECTIVE_TITLE : duty.objective.title,
      isRedacted: verdict.isRedacted,
    }
  }

  const nextDue = computeNextDue(rows, head, ctx.now, { active: status === 'ACTIVE', endsOn: duty.endsOn })
  const writable = ctx.canEdit && !ctx.readOnly
  return {
    id: duty.id,
    externalRef: duty.externalRef,
    ownerId: duty.ownerId,
    owner: person(duty.owner),
    timeframeId: duty.timeframeId,
    packageId: duty.packageId,
    title: duty.title,
    cadence,
    eventLabel: duty.eventLabel,
    timingText: duty.timingText,
    durationMin: duty.durationMin,
    outputText: duty.outputText,
    keyResult,
    objective,
    autoTask: duty.autoTask,
    todoHeadId: duty.todoHeadId,
    status,
    startsOn: toDutyDateKey(duty.startsOn),
    endsOn: toDutyDateKey(duty.endsOn),
    retiredAt: duty.retiredAt ? duty.retiredAt.toISOString() : null,
    collaborators: duty.collaborators.map((c) => person(c.user)).filter((p): p is DutyPerson => p !== null),
    nextDue: toDutyDateKey(nextDue),
    overdue: overdueCount(rows, ctx.now),
    adherence: computeDutyAdherence(rows, ctx.now),
    completedCount: completed,
    canEdit: writable && status !== 'RETIRED',
    canDelete: writable && completed === 0,
    canLog: writable && status !== 'RETIRED',
    createdAt: duty.createdAt.toISOString(),
    updatedAt: duty.updatedAt.toISOString(),
  }
}

async function okrContext(viewer: PackageViewer): Promise<ViewerContext> {
  return loadViewerContext({ id: viewer.userId, role: viewer.role })
}

async function canCreateDutiesFeature(viewer: PackageViewer): Promise<boolean> {
  if (viewer.role === 'ADMIN') return true
  try {
    return await resolveFeaturePermission(viewer.userId, PACKAGE_FEATURE_KEYS.buttonDutyCreate)
  } catch {
    // Fail closed, like withFeature.
    return false
  }
}

async function buildDtos(viewer: PackageViewer, duties: DutyRecord[], now: Date): Promise<DutyDTO[]> {
  if (duties.length === 0) return []
  const ids = duties.map((d) => d.id)
  const [rows, completed, okrCtx] = await Promise.all([
    loadDutyTodoRows(ids, now),
    completedCounts(ids),
    okrContext(viewer),
  ])
  const editByOwner = new Map<string, boolean>()
  for (const ownerId of new Set(duties.map((d) => d.ownerId))) {
    editByOwner.set(ownerId, await canEditPackageArea(viewer, ownerId, 'duties'))
  }
  return duties.map((duty) =>
    toDutyDTO(duty, rows.get(duty.id) ?? [], completed.get(duty.id) ?? 0, {
      okrCtx,
      canEdit: editByOwner.get(duty.ownerId) ?? false,
      readOnly: isTimeframeClosed(duty.timeframe, now) && !viewer.seesAll,
      now,
    }),
  )
}

/** Display order within the API: cadence (PRF-13 order), then status, then title. */
const CADENCE_RANK: Record<string, number> = {
  DAILY: 0,
  WEEKDAYS: 1,
  WEEKLY: 2,
  BIWEEKLY: 3,
  MONTHLY: 4,
  QUARTERLY: 5,
  SEMIANNUAL: 6,
  YEARLY: 7,
  EVERY_SPRINT: 8,
  EVENT: 9,
}
const STATUS_RANK: Record<string, number> = { ACTIVE: 0, PAUSED: 1, RETIRED: 2 }

function sortDuties<T extends { cadence: string; status: string; title: string }>(duties: T[]): T[] {
  return [...duties].sort(
    (a, b) =>
      (CADENCE_RANK[a.cadence] ?? 99) - (CADENCE_RANK[b.cadence] ?? 99) ||
      (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
      a.title.localeCompare(b.title),
  )
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listDuties(
  viewer: PackageViewer,
  params: { userId?: string; timeframeId?: string; includeRetired?: boolean },
  now = new Date(),
): Promise<DutyListPayload> {
  const userId = params.userId ?? viewer.userId
  const access = await getPackageAreaAccess(viewer, userId)
  if (!access.view.duties) throw new DutyError(403, 'FORBIDDEN', "You cannot view this person's duties")

  let readOnly = false
  if (params.timeframeId) {
    const timeframe = await prisma.timeframe.findUnique({
      where: { id: params.timeframeId },
      select: { endDate: true },
    })
    if (!timeframe) throw new DutyError(404, 'TIMEFRAME_NOT_FOUND', 'Timeframe not found')
    readOnly = isTimeframeClosed(timeframe, now) && !viewer.seesAll
  }

  const duties = await prisma.recurringDuty.findMany({
    where: {
      ownerId: userId,
      ...(params.timeframeId && { timeframeId: params.timeframeId }),
      ...(params.includeRetired === false && { status: { not: 'RETIRED' } }),
    },
    include: DUTY_INCLUDE,
  })

  const canEdit = access.edit.duties
  const permissions: DutyListPermissions = {
    canView: true,
    canCreate: canEdit && !readOnly && Boolean(params.timeframeId) && (await canCreateDutiesFeature(viewer)),
    canEdit: canEdit && !readOnly,
    canLog: canEdit && !readOnly,
    readOnly,
  }
  return { duties: sortDuties(await buildDtos(viewer, duties, now)), permissions }
}

export async function getDuty(viewer: PackageViewer, id: string, now = new Date()): Promise<DutyDTO> {
  const duty = await loadDuty(id)
  if (!(await canViewPackageArea(viewer, duty.ownerId, 'duties'))) {
    throw new DutyError(403, 'FORBIDDEN', 'You cannot view this duty')
  }
  const [dto] = await buildDtos(viewer, [duty], now)
  return dto
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

async function assertCanEdit(viewer: PackageViewer, ownerId: string, message = "You cannot change this person's duties") {
  if (!(await canEditPackageArea(viewer, ownerId, 'duties'))) throw new DutyError(403, 'FORBIDDEN', message)
}

function assertWritableTimeframe(viewer: PackageViewer, timeframe: { endDate: Date }, now: Date) {
  if (!viewer.seesAll && isTimeframeClosed(timeframe, now)) {
    throw new DutyError(423, 'TIMEFRAME_CLOSED', 'This timeframe has ended; its duties are read-only')
  }
}

async function assertUsersExist(ids: readonly string[], label: string) {
  if (ids.length === 0) return
  const found = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true } })
  if (found.length !== new Set(ids).size) throw new DutyError(400, 'INVALID_USER', `Unknown ${label}`)
}

/**
 * A duty may link only to OKR items the actor can read in full (a private item
 * shown as "[Private Key Result]" cannot be picked), and a KR + objective pair
 * must agree.
 */
async function validateOkrLinks(
  viewer: PackageViewer,
  keyResultId: string | null,
  objectiveId: string | null,
): Promise<void> {
  if (!keyResultId && !objectiveId) return
  const ctx = await okrContext(viewer)
  if (keyResultId) {
    const kr = await prisma.keyResult.findUnique({
      where: { id: keyResultId },
      select: { id: true, ownerId: true, isPrivate: true, objectiveId: true, objective: { select: OKR_OBJECTIVE_SELECT } },
    })
    if (!kr) throw new DutyError(400, 'INVALID_KEY_RESULT', 'Key result not found')
    const verdict = canViewKeyResultInMemory(ctx, kr, canViewObjectiveInMemory(ctx, kr.objective))
    if (!verdict.canView || verdict.isRedacted) {
      throw new DutyError(403, 'KEY_RESULT_NOT_VISIBLE', 'You cannot link a duty to this key result')
    }
    if (objectiveId && objectiveId !== kr.objectiveId) {
      throw new DutyError(400, 'OKR_MISMATCH', 'The key result does not belong to that objective')
    }
  }
  if (objectiveId) {
    const obj = await prisma.objective.findUnique({ where: { id: objectiveId }, select: OKR_OBJECTIVE_SELECT })
    if (!obj) throw new DutyError(400, 'INVALID_OBJECTIVE', 'Objective not found')
    const verdict = canViewObjectiveInMemory(ctx, obj)
    if (!verdict.canView || verdict.isRedacted) {
      throw new DutyError(403, 'OBJECTIVE_NOT_VISIBLE', 'You cannot link a duty to this objective')
    }
  }
}

async function packageFor(ownerId: string, timeframeId: string) {
  return prisma.operatingPackage.findUnique({
    where: { userId_timeframeId: { userId: ownerId, timeframeId } },
    select: { id: true, status: true },
  })
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

// ---------------------------------------------------------------------------
// Head lifecycle (inside a transaction)
// ---------------------------------------------------------------------------

interface DutyScheduleState {
  id: string
  ownerId: string
  title: string
  cadence: string
  eventLabel: string | null
  timingText: string | null
  durationMin: number | null
  outputText: string | null
  keyResultId: string | null
  objectiveId: string | null
  autoTask: boolean
  status: string
  startsOn: Date | null
  endsOn: Date | null
  collaboratorIds: string[]
}

function memberIdsOf(state: Pick<DutyScheduleState, 'ownerId' | 'collaboratorIds'>): string[] {
  return Array.from(new Set([state.ownerId, ...state.collaboratorIds]))
}

/** DUT-1: create the head for a duty that wants one. Returns the head id, or null (EVENT / no future date). */
async function createHead(
  tx: Tx,
  state: DutyScheduleState,
  actorId: string,
  now: Date,
): Promise<{ id: string; dueDate: Date } | null> {
  const rule = cadenceToRecurrenceRule(state.cadence)
  if (!rule || !dutyWantsHead(state)) return null
  const due = firstDutyOccurrence({
    cadence: state.cadence,
    startsOn: state.startsOn,
    endsOn: state.endsOn,
    timingText: state.timingText,
    now,
  })
  if (!due) return null
  const times = dutyPlannerTimes(parseTimingText(state.timingText), state.durationMin)
  const head = await tx.todo.create({
    data: {
      title: state.title,
      description: dutyCardDescription(state),
      status: 'PENDING',
      priority: 'MEDIUM',
      dueDate: due,
      startTime: times.startTime,
      endTime: times.endTime,
      recurrenceRule: rule,
      recurrenceEndsAt: state.endsOn,
      recurrenceAnchorDay: anchorDayForDue(rule, due),
      recurrenceCountsProgress: false,
      progressValue: null,
      kind: 'DUTY',
      dutyId: state.id,
      assigneeId: state.ownerId,
      creatorId: actorId,
      keyResultId: state.keyResultId,
      objectiveId: state.objectiveId,
      // Paused duties keep an archived head: no generation until resumed.
      archivedAt: state.status === 'PAUSED' ? now : null,
      members: { create: memberIdsOf(state).map((userId) => ({ userId })) },
    },
    select: { id: true, dueDate: true },
  })
  await tx.recurringDuty.update({ where: { id: state.id }, data: { todoHeadId: head.id } })
  return { id: head.id, dueDate: due }
}

/** Stop a head for good: archived, series end pulled back to today, detached from the duty. */
async function detachHead(tx: Tx, dutyId: string, head: HeadRow, now: Date) {
  const today = atMidnight(now)
  await tx.todo.update({
    where: { id: head.id },
    data: {
      archivedAt: head.archivedAt ?? now,
      recurrenceEndsAt: head.recurrenceEndsAt && head.recurrenceEndsAt < today ? head.recurrenceEndsAt : today,
    },
  })
  await tx.recurringDuty.update({ where: { id: dutyId }, data: { todoHeadId: null } })
}

async function syncMembers(tx: Tx, headId: string, before: DutyScheduleState, after: DutyScheduleState) {
  const prev = new Set(memberIdsOf(before))
  const next = new Set(memberIdsOf(after))
  const removed = [...prev].filter((id) => !next.has(id))
  const added = [...next].filter((id) => !prev.has(id))
  if (removed.length > 0) await tx.todoMember.deleteMany({ where: { todoId: headId, userId: { in: removed } } })
  if (added.length > 0) {
    await tx.todoMember.createMany({ data: added.map((userId) => ({ todoId: headId, userId })), skipDuplicates: true })
  }
}

/**
 * DUT-4: bring the head in line with the duty after an edit. Creates it when
 * newly needed, detaches it when no longer needed (EVENT, autoTask off, no
 * future date), and otherwise rewrites its schedule only when cadence, timing
 * or start changed, so an edit to the title never moves the series.
 */
async function syncHeadAfterEdit(
  tx: Tx,
  before: DutyScheduleState,
  after: DutyScheduleState,
  head: HeadRow | null,
  actorId: string,
  now: Date,
): Promise<void> {
  if (!dutyWantsHead(after)) {
    if (head) await detachHead(tx, after.id, head, now)
    return
  }
  if (!head) {
    await createHead(tx, after, actorId, now)
    return
  }

  const rule = cadenceToRecurrenceRule(after.cadence) as string
  const data: Prisma.TodoUncheckedUpdateInput = {}
  if (before.title !== after.title) data.title = after.title
  if (before.keyResultId !== after.keyResultId) data.keyResultId = after.keyResultId
  if (before.objectiveId !== after.objectiveId) data.objectiveId = after.objectiveId
  if (before.ownerId !== after.ownerId) data.assigneeId = after.ownerId
  const prevDescription = dutyCardDescription(before)
  const nextDescription = dutyCardDescription(after)
  if (prevDescription !== nextDescription && (head.description ?? null) === prevDescription) {
    data.description = nextDescription
  }

  const scheduleChanged =
    before.cadence !== after.cadence ||
    (before.timingText ?? null) !== (after.timingText ?? null) ||
    (before.startsOn?.getTime() ?? null) !== (after.startsOn?.getTime() ?? null) ||
    head.recurrenceRule !== rule
  if (scheduleChanged) {
    const target = firstDutyOccurrence({
      cadence: after.cadence,
      startsOn: after.startsOn,
      endsOn: after.endsOn,
      timingText: after.timingText,
      now,
    })
    if (!target) {
      await detachHead(tx, after.id, head, now)
      return
    }
    const anchorDay = anchorDayForDue(rule, target)
    const cursor = planHeadCursor({
      rule,
      target,
      headOpen: !OPEN_STATUSES_EXCLUDED.includes(head.status),
      headHasChildren: await headHasChildren(tx, head.id),
      currentDue: head.recurrenceRule === rule ? head.dueDate : null,
      anchorDay,
    })
    data.recurrenceRule = rule
    data.dueDate = cursor
    data.startDate = null
    data.recurrenceAnchorDay = anchorDay
    data.dueReminderSentAt = null
  }
  if (scheduleChanged || (before.endsOn?.getTime() ?? null) !== (after.endsOn?.getTime() ?? null)) {
    data.recurrenceEndsAt = after.endsOn
  }
  if (scheduleChanged || before.durationMin !== after.durationMin) {
    const times = dutyPlannerTimes(parseTimingText(after.timingText), after.durationMin)
    data.startTime = times.startTime
    data.endTime = times.endTime
  }
  if (Object.keys(data).length > 0) await tx.todo.update({ where: { id: head.id }, data })
  await syncMembers(tx, head.id, before, after)
}

function stateOf(duty: {
  id: string
  ownerId: string
  title: string
  cadence: string
  eventLabel: string | null
  timingText: string | null
  durationMin: number | null
  outputText: string | null
  keyResultId: string | null
  objectiveId: string | null
  autoTask: boolean
  status: string
  startsOn: Date | null
  endsOn: Date | null
  collaborators: Array<{ userId: string }>
}): DutyScheduleState {
  return {
    id: duty.id,
    ownerId: duty.ownerId,
    title: duty.title,
    cadence: duty.cadence,
    eventLabel: duty.eventLabel,
    timingText: duty.timingText,
    durationMin: duty.durationMin,
    outputText: duty.outputText,
    keyResultId: duty.keyResultId,
    objectiveId: duty.objectiveId,
    autoTask: duty.autoTask,
    status: duty.status,
    startsOn: duty.startsOn,
    endsOn: duty.endsOn,
    collaboratorIds: duty.collaborators.map((c) => c.userId),
  }
}

/** Fields the audit trail diffs on edit. */
const AUDITED_FIELDS = [
  'title',
  'cadence',
  'eventLabel',
  'timingText',
  'durationMin',
  'outputText',
  'keyResultId',
  'objectiveId',
  'autoTask',
  'startsOn',
  'endsOn',
  'ownerId',
  'collaboratorIds',
  'externalRef',
  'todoHeadId',
] as const

function auditSnapshot(state: DutyScheduleState & { externalRef?: string | null; todoHeadId?: string | null }) {
  return {
    ...state,
    collaboratorIds: [...state.collaboratorIds].sort(),
    startsOn: toDutyDateKey(state.startsOn),
    endsOn: toDutyDateKey(state.endsOn),
  }
}

// ---------------------------------------------------------------------------
// Create (DUT-1, DUT-2, DUT-3, DUT-8)
// ---------------------------------------------------------------------------

export async function createDuty(
  viewer: PackageViewer,
  input: CreateDutyInput,
  opts: { actorName?: string | null; now?: Date } = {},
): Promise<DutyDTO> {
  const now = opts.now ?? new Date()
  const ownerId = input.ownerId ?? viewer.userId
  await assertCanEdit(viewer, ownerId, 'You cannot add duties for this person')
  if (!(await canCreateDutiesFeature(viewer))) {
    throw new DutyError(403, 'FEATURE_DISABLED', 'Creating duties is not enabled for your role')
  }

  const timeframe = await prisma.timeframe.findUnique({
    where: { id: input.timeframeId },
    select: { id: true, endDate: true },
  })
  if (!timeframe) throw new DutyError(404, 'TIMEFRAME_NOT_FOUND', 'Timeframe not found')
  assertWritableTimeframe(viewer, timeframe, now)

  // DUT-8: attendees of a rhythm item are collaborators; the owner is never one.
  const collaboratorIds = (input.collaboratorIds ?? []).filter((id) => id !== ownerId)
  await assertUsersExist([ownerId], 'owner')
  await assertUsersExist(collaboratorIds, 'collaborator')
  await validateOkrLinks(viewer, input.keyResultId ?? null, input.objectiveId ?? null)

  const pkg = await packageFor(ownerId, timeframe.id)
  const endsOn = input.endsOn ?? atMidnight(timeframe.endDate)
  if (input.startsOn && endsOn < input.startsOn) {
    throw new DutyError(400, 'INVALID_DATES', 'End date must be on or after the start date')
  }

  let created: { id: string; head: { id: string; dueDate: Date } | null }
  try {
    created = await prisma.$transaction(async (tx) => {
      const duty = await tx.recurringDuty.create({
        data: {
          externalRef: input.externalRef ?? null,
          ownerId,
          timeframeId: timeframe.id,
          packageId: pkg?.id ?? null,
          title: input.title,
          cadence: input.cadence,
          eventLabel: input.eventLabel ?? null,
          timingText: input.timingText ?? null,
          durationMin: input.durationMin ?? null,
          outputText: input.outputText ?? null,
          keyResultId: input.keyResultId ?? null,
          objectiveId: input.objectiveId ?? null,
          autoTask: input.autoTask,
          status: 'ACTIVE',
          startsOn: input.startsOn ?? null,
          endsOn,
          ...(collaboratorIds.length > 0 && {
            collaborators: { create: collaboratorIds.map((userId) => ({ userId })) },
          }),
        },
        select: { id: true },
      })
      const head = await createHead(
        tx,
        {
          id: duty.id,
          ownerId,
          title: input.title,
          cadence: input.cadence,
          eventLabel: input.eventLabel ?? null,
          timingText: input.timingText ?? null,
          durationMin: input.durationMin ?? null,
          outputText: input.outputText ?? null,
          keyResultId: input.keyResultId ?? null,
          objectiveId: input.objectiveId ?? null,
          autoTask: input.autoTask,
          status: 'ACTIVE',
          startsOn: input.startsOn ?? null,
          endsOn,
          collaboratorIds,
        },
        viewer.userId,
        now,
      )
      return { id: duty.id, head }
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DutyError(409, 'DUPLICATE_REF', 'A duty with this reference already exists for this person and timeframe')
    }
    throw err
  }

  await recordPackageActivity({
    entityType: 'RECURRING_DUTY',
    action: 'CREATED',
    entityId: created.id,
    subjectUserId: ownerId,
    timeframeId: timeframe.id,
    packageId: pkg?.id ?? null,
    actorId: viewer.userId,
    editedAfterApproval: pkg?.status === 'APPROVED',
    metadata: { title: input.title, cadence: input.cadence, todoHeadId: created.head?.id ?? null },
  })
  if (created.head) {
    await recordActivity({
      entityType: 'TODO',
      todoId: created.head.id,
      action: 'INITIATIVE_CREATED',
      actorId: viewer.userId,
      metadata: { title: input.title, assigneeId: ownerId, dutyId: created.id, source: 'recurring-duty' },
    })
    if (ownerId !== viewer.userId) {
      await emit('TODO_ASSIGNED', {
        actorId: viewer.userId,
        entityType: 'TODO',
        entityId: created.head.id,
        entityTitle: input.title,
        data: {
          actorName: opts.actorName ?? null,
          dueDate: toDutyDateKey(created.head.dueDate),
          deepLink: '/dashboard/todos',
        },
      })
    }
  }

  return getDuty(viewer, created.id, now)
}

// ---------------------------------------------------------------------------
// Update (DUT-4)
// ---------------------------------------------------------------------------

export async function updateDuty(
  viewer: PackageViewer,
  id: string,
  input: UpdateDutyInput,
  opts: { now?: Date } = {},
): Promise<DutyDTO> {
  const now = opts.now ?? new Date()
  const { action, ...fields } = input
  const hasFieldEdits = Object.values(fields).some((v) => v !== undefined)
  if (action) {
    if (hasFieldEdits) throw new DutyError(400, 'MIXED_UPDATE', 'Send either an action or field changes, not both')
    return runDutyAction(viewer, id, action, { now })
  }
  if (!hasFieldEdits) return getDuty(viewer, id, now)

  const duty = await loadDuty(id)
  await assertCanEdit(viewer, duty.ownerId)
  if (duty.status === 'RETIRED') throw new DutyError(409, 'DUTY_RETIRED', 'Retired duties are read-only')
  assertWritableTimeframe(viewer, duty.timeframe, now)

  const before = stateOf(duty)
  const ownerId = fields.ownerId ?? duty.ownerId
  if (ownerId !== duty.ownerId) {
    await assertCanEdit(viewer, ownerId, 'You cannot move this duty to that person')
    await assertUsersExist([ownerId], 'owner')
  }
  const collaboratorIds = (fields.collaboratorIds ?? before.collaboratorIds).filter((u) => u !== ownerId)
  if (fields.collaboratorIds) await assertUsersExist(collaboratorIds, 'collaborator')

  const after: DutyScheduleState = {
    ...before,
    ownerId,
    title: fields.title ?? before.title,
    cadence: fields.cadence ?? before.cadence,
    eventLabel: fields.eventLabel !== undefined ? fields.eventLabel : before.eventLabel,
    timingText: fields.timingText !== undefined ? fields.timingText : before.timingText,
    durationMin: fields.durationMin !== undefined ? fields.durationMin : before.durationMin,
    outputText: fields.outputText !== undefined ? fields.outputText : before.outputText,
    keyResultId: fields.keyResultId !== undefined ? fields.keyResultId : before.keyResultId,
    objectiveId: fields.objectiveId !== undefined ? fields.objectiveId : before.objectiveId,
    autoTask: fields.autoTask ?? before.autoTask,
    startsOn: fields.startsOn !== undefined ? fields.startsOn : before.startsOn,
    endsOn: fields.endsOn !== undefined ? fields.endsOn : before.endsOn,
    collaboratorIds,
  }
  if (after.startsOn && after.endsOn && after.endsOn < after.startsOn) {
    throw new DutyError(400, 'INVALID_DATES', 'End date must be on or after the start date')
  }
  if (after.keyResultId !== before.keyResultId || after.objectiveId !== before.objectiveId) {
    await validateOkrLinks(viewer, after.keyResultId, after.objectiveId)
  }
  const externalRef = fields.externalRef !== undefined ? fields.externalRef : duty.externalRef
  const pkg = ownerId !== duty.ownerId ? await packageFor(ownerId, duty.timeframeId) : null

  let todoHeadIdAfter: string | null = null
  try {
    todoHeadIdAfter = await prisma.$transaction(async (tx) => {
      const head = await loadHead(tx, duty)
      await tx.recurringDuty.update({
        where: { id },
        data: {
          ownerId: after.ownerId,
          ...(ownerId !== duty.ownerId && { packageId: pkg?.id ?? null }),
          title: after.title,
          cadence: after.cadence,
          eventLabel: after.eventLabel,
          timingText: after.timingText,
          durationMin: after.durationMin,
          outputText: after.outputText,
          keyResultId: after.keyResultId,
          objectiveId: after.objectiveId,
          autoTask: after.autoTask,
          startsOn: after.startsOn,
          endsOn: after.endsOn,
          externalRef,
          // A head id that points at a deleted card is cleared before the sync recreates it.
          ...(duty.todoHeadId && !head && { todoHeadId: null }),
        },
      })
      if (fields.collaboratorIds) {
        await tx.recurringDutyCollaborator.deleteMany({ where: { dutyId: id, userId: { notIn: collaboratorIds } } })
        await tx.recurringDutyCollaborator.createMany({
          data: collaboratorIds.map((userId) => ({ dutyId: id, userId })),
          skipDuplicates: true,
        })
      }
      await syncHeadAfterEdit(tx, before, after, head, viewer.userId, now)
      const fresh = await tx.recurringDuty.findUnique({ where: { id }, select: { todoHeadId: true } })
      return fresh?.todoHeadId ?? null
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DutyError(409, 'DUPLICATE_REF', 'A duty with this reference already exists for this person and timeframe')
    }
    throw err
  }

  const subjectPkg = pkg ?? (await packageFor(ownerId, duty.timeframeId))
  await recordPackageUpdateIfChanged({
    entityType: 'RECURRING_DUTY',
    entityId: id,
    subjectUserId: ownerId,
    timeframeId: duty.timeframeId,
    packageId: subjectPkg?.id ?? duty.packageId,
    actorId: viewer.userId,
    editedAfterApproval: subjectPkg?.status === 'APPROVED',
    before: auditSnapshot({ ...before, externalRef: duty.externalRef, todoHeadId: duty.todoHeadId }),
    after: auditSnapshot({ ...after, externalRef, todoHeadId: todoHeadIdAfter }),
    fields: AUDITED_FIELDS,
    metadata: { title: after.title },
  })

  return getDuty(viewer, id, now)
}

// ---------------------------------------------------------------------------
// Pause / resume / retire (DUT-4)
// ---------------------------------------------------------------------------

export async function runDutyAction(
  viewer: PackageViewer,
  id: string,
  action: DutyAction,
  opts: { now?: Date } = {},
): Promise<DutyDTO> {
  const now = opts.now ?? new Date()
  const duty = await loadDuty(id)
  await assertCanEdit(viewer, duty.ownerId)
  assertWritableTimeframe(viewer, duty.timeframe, now)

  const state = stateOf(duty)
  let nextDue: Date | null = null

  if (action === 'pause') {
    if (duty.status !== 'ACTIVE') throw new DutyError(409, 'INVALID_STATE', 'Only an active duty can be paused')
    await prisma.$transaction(async (tx) => {
      await tx.recurringDuty.update({ where: { id }, data: { status: 'PAUSED' } })
      const head = await loadHead(tx, duty)
      if (head && !head.archivedAt) await tx.todo.update({ where: { id: head.id }, data: { archivedAt: now } })
    })
  } else if (action === 'resume') {
    if (duty.status !== 'PAUSED') throw new DutyError(409, 'INVALID_STATE', 'Only a paused duty can be resumed')
    nextDue = await prisma.$transaction(async (tx) => {
      await tx.recurringDuty.update({ where: { id }, data: { status: 'ACTIVE' } })
      const resumed: DutyScheduleState = { ...state, status: 'ACTIVE' }
      const head = await loadHead(tx, duty)
      if (!dutyWantsHead(resumed)) {
        if (head) await detachHead(tx, id, head, now)
        return null
      }
      if (!head) {
        if (duty.todoHeadId) await tx.recurringDuty.update({ where: { id }, data: { todoHeadId: null } })
        const created = await createHead(tx, resumed, viewer.userId, now)
        return created?.dueDate ?? null
      }
      const rule = head.recurrenceRule ?? cadenceToRecurrenceRule(duty.cadence)
      const anchorDay = storedAnchorDay(rule, head.recurrenceAnchorDay)
      const from = head.dueDate ?? atMidnight(now)
      // No backfill: the series restarts at its next date on or after today.
      const target = nextFutureOccurrence(rule, from, now, { anchorDay, endsOn: head.recurrenceEndsAt ?? duty.endsOn })
      if (!target || !rule) {
        await detachHead(tx, id, head, now)
        return null
      }
      const cursor = planHeadCursor({
        rule,
        target,
        headOpen: !OPEN_STATUSES_EXCLUDED.includes(head.status),
        headHasChildren: await headHasChildren(tx, head.id),
        currentDue: head.dueDate,
        anchorDay,
      })
      const moved = !head.dueDate || cursor.getTime() !== head.dueDate.getTime()
      await tx.todo.update({
        where: { id: head.id },
        data: {
          archivedAt: null,
          ...(moved && {
            dueDate: cursor,
            dueReminderSentAt: null,
            // Keep the start→due span, as the generator does (REC-FIX-1).
            ...(head.startDate &&
              head.dueDate && { startDate: addDays(cursor, -Math.round((head.dueDate.getTime() - head.startDate.getTime()) / 86_400_000)) }),
          }),
        },
      })
      return target
    })
  } else {
    if (duty.status === 'RETIRED') throw new DutyError(409, 'INVALID_STATE', 'This duty is already retired')
    await prisma.$transaction(async (tx) => {
      await tx.recurringDuty.update({ where: { id }, data: { status: 'RETIRED', retiredAt: now } })
      const head = await loadHead(tx, duty)
      if (head) {
        const today = atMidnight(now)
        // Archived and its series end pulled back, so un-archiving the card cannot restart it.
        await tx.todo.update({
          where: { id: head.id },
          data: {
            archivedAt: head.archivedAt ?? now,
            recurrenceEndsAt: head.recurrenceEndsAt && head.recurrenceEndsAt < today ? head.recurrenceEndsAt : today,
          },
        })
      }
    })
  }

  const pkg = await packageFor(duty.ownerId, duty.timeframeId)
  await recordPackageActivity({
    entityType: 'RECURRING_DUTY',
    action: action === 'pause' ? 'PAUSED' : action === 'resume' ? 'RESUMED' : 'RETIRED',
    entityId: id,
    subjectUserId: duty.ownerId,
    timeframeId: duty.timeframeId,
    packageId: pkg?.id ?? duty.packageId,
    actorId: viewer.userId,
    editedAfterApproval: pkg?.status === 'APPROVED',
    changes: {
      status: {
        from: duty.status,
        to: action === 'pause' ? 'PAUSED' : action === 'resume' ? 'ACTIVE' : 'RETIRED',
      },
    },
    metadata: { title: duty.title, ...(nextDue && { nextDue: toDutyDateKey(nextDue) }) },
  })

  return getDuty(viewer, id, now)
}

// ---------------------------------------------------------------------------
// Delete (DUT-6)
// ---------------------------------------------------------------------------

export async function deleteDuty(viewer: PackageViewer, id: string, opts: { now?: Date } = {}): Promise<{ id: string }> {
  const now = opts.now ?? new Date()
  const duty = await loadDuty(id)
  await assertCanEdit(viewer, duty.ownerId)
  assertWritableTimeframe(viewer, duty.timeframe, now)

  const completed = await prisma.todo.count({ where: { dutyId: id, status: 'COMPLETED' } })
  if (completed > 0) {
    throw new DutyError(
      409,
      'DUTY_HAS_COMPLETED_OCCURRENCES',
      'This duty has completed occurrences, so it cannot be deleted. Retire it instead.',
    )
  }

  // None of the duty's cards is completed, so they go with it (attachments first,
  // as DELETE /api/todos/[id] does: the cascade drops the only record of the files).
  const cards = await prisma.todo.findMany({ where: { dutyId: id }, select: { id: true } })
  const snapshots = await Promise.all(cards.map(async (c) => [c.id, await snapshotTodoAttachmentFiles(c.id)] as const))

  await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction: a card may have been completed meanwhile.
    const late = await tx.todo.count({ where: { dutyId: id, status: 'COMPLETED' } })
    if (late > 0) {
      throw new DutyError(409, 'DUTY_HAS_COMPLETED_OCCURRENCES', 'This duty now has a completed occurrence. Retire it instead.')
    }
    if (cards.length > 0) await tx.todo.deleteMany({ where: { id: { in: cards.map((c) => c.id) } } })
    await tx.recurringDuty.delete({ where: { id } })
  })

  for (const [todoId, snapshot] of snapshots) {
    try {
      await purgeDeletedTodoAttachments(todoId, snapshot)
    } catch (err) {
      console.error('[duties/delete] attachment cleanup failed', { todoId, err })
    }
  }

  const pkg = await packageFor(duty.ownerId, duty.timeframeId)
  await recordPackageActivity({
    entityType: 'RECURRING_DUTY',
    action: 'DELETED',
    entityId: id,
    subjectUserId: duty.ownerId,
    timeframeId: duty.timeframeId,
    packageId: pkg?.id ?? null,
    actorId: viewer.userId,
    editedAfterApproval: pkg?.status === 'APPROVED',
    metadata: { title: duty.title, cadence: duty.cadence, cardsDeleted: cards.length },
  })
  return { id }
}

// ---------------------------------------------------------------------------
// Log occurrence (DUT-3)
// ---------------------------------------------------------------------------

export async function logDutyOccurrence(
  viewer: PackageViewer,
  id: string,
  input: LogDutyOccurrenceInput,
  opts: { now?: Date } = {},
): Promise<DutyLogResult> {
  const now = opts.now ?? new Date()
  const duty = await loadDuty(id)
  await assertCanEdit(viewer, duty.ownerId, 'You cannot log occurrences of this duty')
  if (duty.status === 'RETIRED') throw new DutyError(409, 'DUTY_RETIRED', 'A retired duty cannot log occurrences')
  assertWritableTimeframe(viewer, duty.timeframe, now)

  const state = stateOf(duty)
  const dueDate = input.dueDate ?? atMidnight(now)
  const times = dutyPlannerTimes(parseTimingText(duty.timingText), duty.durationMin)
  const title = duty.eventLabel ? `${duty.title} (${duty.eventLabel})` : duty.title
  const baseDescription = dutyCardDescription(duty)
  const description = input.note ? (baseDescription ? `${input.note}\n\n${baseDescription}` : input.note) : baseDescription

  const todo = await prisma.todo.create({
    data: {
      title,
      description,
      status: input.completed ? 'COMPLETED' : 'PENDING',
      completedAt: input.completed ? now : null,
      priority: 'MEDIUM',
      dueDate,
      startTime: times.startTime,
      endTime: times.endTime,
      kind: 'DUTY',
      dutyId: duty.id,
      progressValue: null,
      assigneeId: duty.ownerId,
      creatorId: viewer.userId,
      keyResultId: duty.keyResultId,
      objectiveId: duty.objectiveId,
      members: { create: memberIdsOf(state).map((userId) => ({ userId })) },
    },
    select: { id: true },
  })

  await recordActivity({
    entityType: 'TODO',
    todoId: todo.id,
    action: 'INITIATIVE_CREATED',
    actorId: viewer.userId,
    metadata: { title, assigneeId: duty.ownerId, dutyId: duty.id, source: 'duty-log', completed: input.completed },
  })
  const pkg = await packageFor(duty.ownerId, duty.timeframeId)
  await recordPackageActivity({
    entityType: 'RECURRING_DUTY',
    action: 'INITIATIVE_ADDED',
    entityId: duty.id,
    subjectUserId: duty.ownerId,
    timeframeId: duty.timeframeId,
    packageId: pkg?.id ?? duty.packageId,
    actorId: viewer.userId,
    metadata: {
      title: duty.title,
      todoId: todo.id,
      dueDate: toDutyDateKey(dueDate),
      completed: input.completed,
    },
  })

  return { todoId: todo.id, duty: await getDuty(viewer, id, now) }
}
