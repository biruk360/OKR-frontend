/**
 * Work dependencies (DEP-1…5, DEP-7) — server service. Server only: imported by
 * direct path from `app/api/dependencies/**` and the profile summary.
 *
 * Dependencies are company-level records (D8): inbound / outbound per person is
 * derived from WorkDependencyParty rows (DEP-1), never stored.
 *
 * Access (§8, lib/package/access.ts → getDependencyAccess):
 *   - every signed-in user sees the company map rows as title + status (summary rows);
 *   - parties, the creator, and anyone who may see a party's dependencies area
 *     (manager chain, department lead, peer, HR, Exec/Admin) see the full record;
 *   - editors (creator, a party's managers / department lead, Exec/Admin) change
 *     everything; providers may change the status, including DONE.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'
import {
  canViewPackageArea,
  canViewPackageAreaResolved,
  getDependencyAccess,
  loadPackageViewer,
  primePackageSubjects,
  resolvePackageAccessFacts,
  type DependencyAccess,
  type PackageViewer,
} from '@/lib/package/access'
import { recordPackageActivity, recordPackageUpdateIfChanged } from '@/lib/package/audit'
import { dependencyMapHref } from '@/lib/package/links'
import { loadViewerContext, type ViewerContext } from '@/lib/okr/visibility-scope'
import { resolveOkrItems, type OkrRef } from '@/lib/connections/okr-items'
import { kpiArea } from '@/lib/connections/visibility'
import { developmentHref, dutyHref, kpiHref, todoHref } from '@/lib/connections/flags'
import {
  isDependencyLinkEntityType,
  isDependencyStatus,
  isDependencyType,
  type DependencyLinkEntityType,
  type DependencyStatus,
  type DependencyType,
} from '@/types/package'
import type {
  DeliveryTaskResult,
  DependencyDetailRow,
  DependencyLinkedItem,
  DependencyListResponse,
  DependencyPerson,
  DependencyRow,
  DependencyStatusResult,
  PersonDependenciesResponse,
} from '../types'
import type {
  CreateDependencyInput,
  DependencyStatusInput,
  ListDependenciesQuery,
  PersonDependenciesQuery,
  UpdateDependencyInput,
} from './schemas'
import {
  canSetStatus,
  dependencyTiming,
  isPackageLinkRef,
  matchesDueWindow,
  personCounts,
  personRoles,
  sortDependencies,
  splitParties,
  splitPersonRows,
  statusTransition,
} from './rules'

type Tx = Prisma.TransactionClient

/** Upper bound for one list / export (the company map is a few hundred rows). */
const LIST_LIMIT = 2000

export class DependencyError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409 | 423,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'DependencyError'
  }
}

const PERSON_SELECT = { id: true, name: true, avatar: true } as const

const DEPENDENCY_INCLUDE = {
  timeframe: { select: { id: true, name: true, endDate: true } },
  parties: {
    select: { userId: true, role: true, user: { select: PERSON_SELECT } },
    orderBy: { id: 'asc' },
  },
  links: { select: { entityType: true, entityId: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.WorkDependencyInclude

type DependencyRecord = Prisma.WorkDependencyGetPayload<{ include: typeof DEPENDENCY_INCLUDE }>

/** Fields compared for the UPDATED audit row. */
const AUDITED_FIELDS = [
  'title',
  'externalRef',
  'depType',
  'neededByDate',
  'unblocksText',
  'note',
  'decisionId',
  'providerIds',
  'neederIds',
  'links',
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function isTimeframeClosed(timeframe: { endDate: Date }, now: Date): boolean {
  return timeframe.endDate.getTime() < startOfTodayUtc(now).getTime()
}

function assertWritableTimeframe(viewer: PackageViewer, timeframe: { endDate: Date }, now: Date) {
  if (!viewer.seesAll && isTimeframeClosed(timeframe, now)) {
    throw new DependencyError(423, 'TIMEFRAME_CLOSED', 'This timeframe has ended; its dependencies are read-only')
  }
}

function asType(value: string): DependencyType {
  return isDependencyType(value) ? value : 'OTHER'
}

function asStatus(value: string): DependencyStatus {
  return isDependencyStatus(value) ? value : 'OPEN'
}

function partyIdsOf(record: DependencyRecord) {
  return splitParties(record.parties)
}

async function accessFor(viewer: PackageViewer, record: DependencyRecord): Promise<DependencyAccess> {
  const { providerIds, neederIds } = partyIdsOf(record)
  return getDependencyAccess(viewer, { providerIds, neederIds, createdById: record.createdById })
}

async function loadRecord(id: string, db: Tx | typeof prisma = prisma): Promise<DependencyRecord> {
  const record = await db.workDependency.findUnique({ where: { id }, include: DEPENDENCY_INCLUDE })
  if (!record) throw new DependencyError(404, 'NOT_FOUND', 'Dependency not found')
  return record
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/** PKG-3: any party's package for the timeframe is APPROVED. */
async function editedAfterApproval(timeframeId: string, userIds: readonly string[]): Promise<boolean> {
  if (userIds.length === 0) return false
  const approved = await prisma.operatingPackage.findFirst({
    where: { timeframeId, userId: { in: [...userIds] }, status: 'APPROVED' },
    select: { id: true },
  })
  return !!approved
}

async function assertUsersExist(ids: readonly string[]) {
  if (ids.length === 0) return
  const rows = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true } })
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length > 0) throw new DependencyError(400, 'USER_NOT_FOUND', 'One or more people were not found')
}

async function assertDecisionExists(decisionId: string | null | undefined) {
  if (!decisionId) return
  const decision = await prisma.decision.findUnique({ where: { id: decisionId }, select: { id: true } })
  if (!decision) throw new DependencyError(400, 'DECISION_NOT_FOUND', 'Linked decision not found')
}

async function resolveTimeframe(timeframeId: string | undefined) {
  if (timeframeId) {
    const timeframe = await prisma.timeframe.findUnique({
      where: { id: timeframeId },
      select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
    })
    if (!timeframe) throw new DependencyError(404, 'TIMEFRAME_NOT_FOUND', 'Timeframe not found')
    return timeframe
  }
  const all = await prisma.timeframe.findMany({
    select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
    orderBy: { startDate: 'asc' },
  })
  const current = pickCurrentTimeframe(all)
  if (!current) throw new DependencyError(400, 'NO_TIMEFRAME', 'No timeframe exists yet; create one first')
  return current
}

// ---------------------------------------------------------------------------
// Linked items (WorkDependencyLink) — resolution + validation (CON-8)
// ---------------------------------------------------------------------------

interface LinkKey {
  entityType: string
  entityId: string
}

interface ResolvedLink {
  item: DependencyLinkedItem
  /** False when the target no longer exists. */
  exists: boolean
}

/** One batched resolution of every link on the given records, redacted for the viewer. */
async function resolveLinks(
  viewer: PackageViewer,
  links: readonly LinkKey[],
  getCtx: () => Promise<ViewerContext>,
): Promise<Map<string, ResolvedLink>> {
  const out = new Map<string, ResolvedLink>()
  const key = (l: LinkKey) => `${l.entityType}:${l.entityId}`
  const idsOf = (type: DependencyLinkEntityType) =>
    Array.from(new Set(links.filter((l) => l.entityType === type).map((l) => l.entityId)))

  const okrRefs: OkrRef[] = [
    ...idsOf('OBJECTIVE').map((id) => ({ type: 'OBJECTIVE' as const, id, via: 'ATTACHED' as const })),
    ...idsOf('KEY_RESULT').map((id) => ({ type: 'KEY_RESULT' as const, id, via: 'ATTACHED' as const })),
  ]
  const kpiIds = idsOf('KPI')
  const dutyIds = idsOf('DUTY')
  const devIds = idsOf('DEVELOPMENT')
  const todoIds = idsOf('TODO')

  const [okrItems, kpis, duties, devItems, todos] = await Promise.all([
    okrRefs.length ? getCtx().then((ctx) => resolveOkrItems(prisma, ctx, okrRefs)) : Promise.resolve([]),
    kpiIds.length
      ? prisma.kpi.findMany({
          where: { id: { in: kpiIds } },
          select: { id: true, name: true, externalRef: true, ownerId: true, isSensitive: true },
        })
      : Promise.resolve([]),
    dutyIds.length
      ? prisma.recurringDuty.findMany({
          where: { id: { in: dutyIds } },
          select: { id: true, title: true, externalRef: true, ownerId: true },
        })
      : Promise.resolve([]),
    devIds.length
      ? prisma.developmentItem.findMany({
          where: { id: { in: devIds } },
          select: { id: true, title: true, externalRef: true, ownerId: true },
        })
      : Promise.resolve([]),
    todoIds.length
      ? prisma.todo.findMany({
          where: { id: { in: todoIds } },
          select: {
            id: true,
            title: true,
            cardNumber: true,
            assigneeId: true,
            creatorId: true,
            members: { select: { userId: true } },
          },
        })
      : Promise.resolve([]),
  ])

  // Package-item owners: one membership query for the whole batch.
  const owners = [...kpis, ...duties, ...devItems].map((r) => r.ownerId)
  await primePackageSubjects(viewer, owners)
  const sees = (area: Parameters<typeof canViewPackageAreaResolved>[1], ownerId: string) =>
    viewer.seesAll || ownerId === viewer.userId || canViewPackageAreaResolved(resolvePackageAccessFacts(viewer, ownerId), area)

  const put = (entityType: DependencyLinkEntityType, entityId: string, visible: { title: string; ref: string | null; href: string } | null) => {
    out.set(key({ entityType, entityId }), {
      exists: true,
      item: visible
        ? { entityType, entityId, redacted: false, ...visible }
        : { entityType, entityId, redacted: true, title: null, ref: null, href: null },
    })
  }

  for (const item of okrItems) {
    const type = item.type as 'OBJECTIVE' | 'KEY_RESULT'
    put(type, item.id, item.redacted ? null : { title: item.title, ref: item.ref, href: item.href })
  }
  for (const k of kpis) put('KPI', k.id, sees(kpiArea(k), k.ownerId) ? { title: k.name, ref: k.externalRef, href: kpiHref(k.ownerId) } : null)
  for (const d of duties) put('DUTY', d.id, sees('duties', d.ownerId) ? { title: d.title, ref: d.externalRef, href: dutyHref(d.ownerId) } : null)
  for (const d of devItems) {
    put('DEVELOPMENT', d.id, sees('development', d.ownerId) ? { title: d.title, ref: d.externalRef, href: developmentHref(d.ownerId) } : null)
  }
  for (const t of todos) {
    const visible =
      viewer.seesAll ||
      t.creatorId === viewer.userId ||
      t.assigneeId === viewer.userId ||
      t.members.some((m) => m.userId === viewer.userId) ||
      viewer.managedUserIds.has(t.creatorId) ||
      (!!t.assigneeId && viewer.managedUserIds.has(t.assigneeId))
    put('TODO', t.id, visible ? { title: t.title, ref: `#${t.cardNumber}`, href: todoHref(t.id) } : null)
  }
  return out
}

/**
 * Validates links the viewer is ADDING: the target must exist and be visible to
 * the viewer (you cannot attach a dependency to an item you cannot see).
 */
async function assertLinkTargets(viewer: PackageViewer, links: readonly LinkKey[]) {
  if (links.length === 0) return
  for (const link of links) {
    if (!isDependencyLinkEntityType(link.entityType)) {
      throw new DependencyError(400, 'INVALID_LINK', `Unsupported linked item type: ${link.entityType}`)
    }
  }
  let ctx: Promise<ViewerContext> | null = null
  const resolved = await resolveLinks(viewer, links, () => (ctx ??= loadViewerContext({ id: viewer.userId, role: viewer.role })))
  for (const link of links) {
    const hit = resolved.get(`${link.entityType}:${link.entityId}`)
    if (!hit) throw new DependencyError(400, 'LINK_TARGET_NOT_FOUND', 'A linked item was not found')
    if (hit.item.redacted) throw new DependencyError(403, 'LINK_TARGET_FORBIDDEN', 'You cannot link an item you do not have access to')
  }
}

// ---------------------------------------------------------------------------
// Row building
// ---------------------------------------------------------------------------

interface BuildContext {
  viewer: PackageViewer
  now: Date
  getCtx: () => Promise<ViewerContext>
}

function makeBuildContext(viewer: PackageViewer, now = new Date()): BuildContext {
  let ctx: Promise<ViewerContext> | null = null
  return { viewer, now, getCtx: () => (ctx ??= loadViewerContext({ id: viewer.userId, role: viewer.role })) }
}

function person(user: { id: string; name: string | null; avatar: string | null }): DependencyPerson {
  return { id: user.id, name: user.name, avatar: user.avatar }
}

/** Records → rows (detail or summary) with one batch of access + link + creator lookups. */
async function buildRows(
  build: BuildContext,
  records: readonly DependencyRecord[],
): Promise<Array<{ record: DependencyRecord; row: DependencyRow; access: DependencyAccess }>> {
  const { viewer, now } = build
  await primePackageSubjects(
    viewer,
    records.flatMap((r) => r.parties.map((p) => p.userId)),
  )
  const accesses = await Promise.all(records.map((r) => accessFor(viewer, r)))

  const detailRecords = records.filter((_, i) => accesses[i].canViewDetail)
  const [resolvedLinks, creators, liveTodos] = await Promise.all([
    resolveLinks(
      viewer,
      detailRecords.flatMap((r) => r.links),
      build.getCtx,
    ),
    (async () => {
      const ids = Array.from(new Set(detailRecords.map((r) => r.createdById).filter((id): id is string => !!id)))
      if (ids.length === 0) return new Map<string, DependencyPerson>()
      const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: PERSON_SELECT })
      return new Map(users.map((u) => [u.id, person(u)]))
    })(),
    (async () => {
      const ids = detailRecords.map((r) => r.deliveryTodoId).filter((id): id is string => !!id)
      if (ids.length === 0) return new Set<string>()
      const todos = await prisma.todo.findMany({ where: { id: { in: ids } }, select: { id: true } })
      return new Set(todos.map((t) => t.id))
    })(),
  ])

  return records.map((record, index) => {
    const access = accesses[index]
    const timing = dependencyTiming(record, now)
    const base = {
      ...timing,
      id: record.id,
      ref: record.externalRef,
      title: record.title,
      depType: asType(record.depType),
      status: asStatus(record.status),
      neededByDate: iso(record.neededByDate),
      timeframe: record.timeframe ? { id: record.timeframe.id, name: record.timeframe.name } : null,
      href: dependencyMapHref(record.id),
    }
    if (!access.canViewDetail) {
      return { record, access, row: { ...base, detail: false as const } }
    }
    const providers: DependencyPerson[] = []
    const needers: DependencyPerson[] = []
    for (const party of record.parties) {
      const target = party.role === 'PROVIDER' ? providers : party.role === 'NEEDER' ? needers : null
      if (target && !target.some((p) => p.id === party.userId)) target.push(person(party.user))
    }
    const links = record.links
      .map((l) => resolvedLinks.get(`${l.entityType}:${l.entityId}`))
      .filter((hit): hit is ResolvedLink => !!hit && hit.exists)
      .map((hit) => hit.item)
    const deliveryTodoId = record.deliveryTodoId && liveTodos.has(record.deliveryTodoId) ? record.deliveryTodoId : null
    const row: DependencyDetailRow = {
      ...base,
      detail: true,
      unblocksText: record.unblocksText,
      note: record.note,
      doneAt: iso(record.doneAt),
      decisionId: record.decisionId,
      deliveryTodoId,
      isPackageLink: isPackageLinkRef(record.externalRef),
      providers,
      needers,
      links,
      createdBy: record.createdById ? creators.get(record.createdById) ?? null : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      permissions: {
        canEdit: access.canEdit,
        canChangeStatus: access.canChangeStatus,
        canDrop: access.canEdit,
        canCreateDeliveryTask: (access.canEdit || access.isProvider) && !deliveryTodoId && providers.length > 0,
      },
      viewerIsProvider: access.isProvider,
      viewerIsNeeder: access.isNeeder,
    }
    return { record, access, row }
  })
}

async function detailRowFor(viewer: PackageViewer, id: string): Promise<DependencyDetailRow> {
  const record = await loadRecord(id)
  const [built] = await buildRows(makeBuildContext(viewer), [record])
  if (!built.row.detail) throw new DependencyError(403, 'FORBIDDEN', 'You do not have access to this dependency')
  return built.row
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function listWhere(viewer: PackageViewer, query: ListDependenciesQuery): Prisma.WorkDependencyWhereInput {
  const and: Prisma.WorkDependencyWhereInput[] = []
  if (query.timeframeId) and.push({ timeframeId: query.timeframeId })
  if (query.status?.length) and.push({ status: { in: query.status } })
  if (query.type?.length) and.push({ depType: { in: query.type } })
  if (query.providerId) and.push({ parties: { some: { userId: query.providerId, role: 'PROVIDER' } } })
  if (query.neederId) and.push({ parties: { some: { userId: query.neederId, role: 'NEEDER' } } })
  if (query.partyId) and.push({ parties: { some: { userId: query.partyId } } })
  if (query.mine) and.push({ parties: { some: { userId: viewer.userId } } })
  if (query.deliveryTodoId) and.push({ deliveryTodoId: query.deliveryTodoId })
  if (query.linkedType || query.linkedId) {
    and.push({
      links: {
        some: {
          ...(query.linkedType && { entityType: query.linkedType }),
          ...(query.linkedId && { entityId: query.linkedId }),
        },
      },
    })
  }
  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { externalRef: { contains: query.q, mode: 'insensitive' } },
      ],
    })
  }
  if (query.scope === 'package') and.push({ externalRef: { startsWith: 'X', mode: 'insensitive' } })
  return and.length ? { AND: and } : {}
}

/** Filters that reveal who is on a dependency or what it links to. */
function usesPartyOrLinkFilter(query: ListDependenciesQuery): boolean {
  return !!(query.providerId || query.neederId || query.partyId || query.linkedType || query.linkedId || query.deliveryTodoId)
}

/**
 * GET /api/dependencies — the company list (DEP-6) with filters. Rows the
 * viewer may not open come back as title + status summaries; party / link
 * filters only match rows the viewer may open (they would otherwise reveal
 * who is on a dependency).
 */
export async function listDependencies(
  viewer: PackageViewer,
  query: ListDependenciesQuery,
  now: Date = new Date(),
): Promise<DependencyListResponse> {
  const records = await prisma.workDependency.findMany({
    where: listWhere(viewer, query),
    include: DEPENDENCY_INCLUDE,
    orderBy: [{ neededByDate: { sort: 'asc', nulls: 'last' } }, { externalRef: 'asc' }, { createdAt: 'asc' }],
    take: LIST_LIMIT,
  })
  const filtered = records.filter((r) => {
    if (query.scope === 'package' && !isPackageLinkRef(r.externalRef)) return false
    if (query.scope === 'company' && isPackageLinkRef(r.externalRef)) return false
    if (query.due && !matchesDueWindow(r, query.due, now)) return false
    return true
  })
  const built = await buildRows(makeBuildContext(viewer, now), filtered)
  const restrictToDetail = usesPartyOrLinkFilter(query)
  const rows = sortDependencies(built.map((b) => b.row).filter((row) => !restrictToDetail || row.detail))
  return {
    dependencies: rows,
    total: rows.length,
    permissions: { canCreate: true, canExport: true },
  }
}

/** GET /api/dependencies/[id] — full record when allowed, otherwise the title + status summary. */
export async function getDependency(viewer: PackageViewer, id: string): Promise<DependencyRow> {
  const record = await loadRecord(id)
  const [built] = await buildRows(makeBuildContext(viewer), [record])
  return built.row
}

/**
 * GET /api/dependencies/person/[userId] — DEP-1 / PRF-16. Inbound (the person
 * needs it, "clear first") and outbound (the person provides it, "others wait
 * on you"), each sorted late → due soon → open → done.
 */
export async function listPersonDependencies(
  viewer: PackageViewer,
  userId: string,
  query: PersonDependenciesQuery,
  now: Date = new Date(),
): Promise<PersonDependenciesResponse> {
  const subject = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!subject) throw new DependencyError(404, 'USER_NOT_FOUND', 'Person not found')
  if (query.timeframeId) {
    const timeframe = await prisma.timeframe.findUnique({ where: { id: query.timeframeId }, select: { id: true } })
    if (!timeframe) throw new DependencyError(404, 'TIMEFRAME_NOT_FOUND', 'Timeframe not found')
  }

  const canViewArea = await canViewPackageArea(viewer, userId, 'dependencies')
  const records = await prisma.workDependency.findMany({
    where: {
      parties: { some: { userId } },
      ...(query.timeframeId && { timeframeId: query.timeframeId }),
      ...(query.includeClosed === false && { status: { notIn: ['DONE', 'DROPPED'] } }),
    },
    include: DEPENDENCY_INCLUDE,
    orderBy: [{ neededByDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: LIST_LIMIT,
  })
  const built = await buildRows(makeBuildContext(viewer, now), records)
  // Without area access only the records the viewer may open (party / creator / a
  // related party) are listed — never title-only rows tied to this person.
  const visible = built.filter((b) => b.row.detail)
  const { inbound, outbound } = splitPersonRows(
    visible.map((b) => ({ row: b.row, ...personRoles(b.record.parties, userId) })),
  )
  return {
    userId,
    timeframeId: query.timeframeId ?? null,
    inbound,
    outbound,
    counts: personCounts(inbound, outbound),
    restricted: !canViewArea,
    permissions: { canCreate: true, canCreateForPerson: canViewArea },
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function snapshot(record: {
  title: string
  externalRef: string | null
  depType: string
  neededByDate: Date | null
  unblocksText: string | null
  note: string | null
  decisionId: string | null
  parties: ReadonlyArray<{ userId: string; role: string }>
  links: ReadonlyArray<{ entityType: string; entityId: string }>
}) {
  const { providerIds, neederIds } = splitParties(record.parties)
  return {
    title: record.title,
    externalRef: record.externalRef,
    depType: record.depType,
    neededByDate: record.neededByDate,
    unblocksText: record.unblocksText,
    note: record.note,
    decisionId: record.decisionId,
    providerIds: [...providerIds].sort(),
    neederIds: [...neederIds].sort(),
    links: record.links.map((l) => `${l.entityType}:${l.entityId}`).sort(),
  }
}

export interface MutationOptions {
  actorName?: string | null
  now?: Date
}

/** POST /api/dependencies — any employee may raise a dependency (§8 / seed: SELF_WRITE). */
export async function createDependency(
  viewer: PackageViewer,
  input: CreateDependencyInput,
  options: MutationOptions = {},
): Promise<{ dependency: DependencyDetailRow; deliveryTask: DeliveryTaskResult['todo'] | null }> {
  const now = options.now ?? new Date()
  const timeframe = await resolveTimeframe(input.timeframeId)
  assertWritableTimeframe(viewer, timeframe, now)
  await assertUsersExist([...input.providerIds, ...input.neederIds])
  await assertDecisionExists(input.decisionId)
  await assertLinkTargets(viewer, input.links)

  const transition = statusTransition({ status: 'OPEN', doneAt: null }, input.status, now)
  let created: { id: string }
  try {
    created = await prisma.$transaction(async (tx) => {
      const row = await tx.workDependency.create({
        data: {
          timeframeId: timeframe.id,
          title: input.title,
          externalRef: input.externalRef ?? null,
          depType: input.depType,
          neededByDate: input.neededByDate ?? null,
          unblocksText: input.unblocksText ?? null,
          note: input.note ?? null,
          decisionId: input.decisionId ?? null,
          status: input.status,
          doneAt: input.status === 'DONE' ? transition.doneAt : null,
          createdById: viewer.userId,
        },
        select: { id: true },
      })
      await tx.workDependencyParty.createMany({
        data: [
          ...input.providerIds.map((userId) => ({ dependencyId: row.id, userId, role: 'PROVIDER' })),
          ...input.neederIds.map((userId) => ({ dependencyId: row.id, userId, role: 'NEEDER' })),
        ],
        skipDuplicates: true,
      })
      if (input.links.length > 0) {
        await tx.workDependencyLink.createMany({
          data: input.links.map((l) => ({ dependencyId: row.id, entityType: l.entityType, entityId: l.entityId })),
          skipDuplicates: true,
        })
      }
      return row
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DependencyError(409, 'DUPLICATE_REF', 'A dependency with this reference already exists in this timeframe')
    }
    throw error
  }

  await recordPackageActivity({
    entityType: 'WORK_DEPENDENCY',
    action: 'CREATED',
    entityId: created.id,
    subjectUserId: input.providerIds[0] ?? null,
    timeframeId: timeframe.id,
    actorId: viewer.userId,
    editedAfterApproval: await editedAfterApproval(timeframe.id, [...input.providerIds, ...input.neederIds]),
    metadata: {
      title: input.title,
      externalRef: input.externalRef ?? null,
      depType: input.depType,
      providerIds: input.providerIds,
      neederIds: input.neederIds,
    },
  })

  let deliveryTask: DeliveryTaskResult['todo'] | null = null
  if (input.createDeliveryTask) {
    const result = await createDeliveryTask(viewer, created.id, options)
    deliveryTask = result.todo
  }
  return { dependency: await detailRowFor(viewer, created.id), deliveryTask }
}

/** PATCH /api/dependencies/[id] — fields, parties (replace per role) and links (replace). */
export async function updateDependency(
  viewer: PackageViewer,
  id: string,
  input: UpdateDependencyInput,
  options: MutationOptions = {},
): Promise<DependencyDetailRow> {
  const now = options.now ?? new Date()
  const before = await loadRecord(id)
  const access = await accessFor(viewer, before)
  if (!access.canEdit) {
    throw new DependencyError(403, 'FORBIDDEN', 'Only the creator, a party’s manager, an Executive or an Admin can edit this dependency')
  }
  assertWritableTimeframe(viewer, before.timeframe, now)

  const current = splitParties(before.parties)
  const addedUsers = [
    ...(input.providerIds ?? []).filter((u) => !current.providerIds.includes(u)),
    ...(input.neederIds ?? []).filter((u) => !current.neederIds.includes(u)),
  ]
  await assertUsersExist(addedUsers)
  if (input.decisionId !== undefined && input.decisionId !== before.decisionId) await assertDecisionExists(input.decisionId)
  const existingLinkKeys = new Set(before.links.map((l) => `${l.entityType}:${l.entityId}`))
  if (input.links) {
    await assertLinkTargets(
      viewer,
      input.links.filter((l) => !existingLinkKeys.has(`${l.entityType}:${l.entityId}`)),
    )
  }

  try {
    await prisma.$transaction(async (tx) => {
      const data: Prisma.WorkDependencyUpdateInput = {}
      if (input.title !== undefined) data.title = input.title
      if (input.externalRef !== undefined) data.externalRef = input.externalRef
      if (input.depType !== undefined) data.depType = input.depType
      if (input.neededByDate !== undefined) data.neededByDate = input.neededByDate
      if (input.unblocksText !== undefined) data.unblocksText = input.unblocksText
      if (input.note !== undefined) data.note = input.note
      if (input.decisionId !== undefined) {
        data.decision = input.decisionId ? { connect: { id: input.decisionId } } : { disconnect: true }
      }
      if (Object.keys(data).length > 0) await tx.workDependency.update({ where: { id }, data })

      for (const [role, next] of [
        ['PROVIDER', input.providerIds],
        ['NEEDER', input.neederIds],
      ] as const) {
        if (!next) continue
        await tx.workDependencyParty.deleteMany({ where: { dependencyId: id, role, userId: { notIn: next } } })
        await tx.workDependencyParty.createMany({
          data: next.map((userId) => ({ dependencyId: id, userId, role })),
          skipDuplicates: true,
        })
      }

      if (input.links) {
        const keep = input.links
        await tx.workDependencyLink.deleteMany({
          where: {
            dependencyId: id,
            NOT: keep.length ? { OR: keep.map((l) => ({ entityType: l.entityType, entityId: l.entityId })) } : undefined,
          },
        })
        if (keep.length) {
          await tx.workDependencyLink.createMany({
            data: keep.map((l) => ({ dependencyId: id, entityType: l.entityType, entityId: l.entityId })),
            skipDuplicates: true,
          })
        }
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DependencyError(409, 'DUPLICATE_REF', 'A dependency with this reference already exists in this timeframe')
    }
    throw error
  }

  const after = await loadRecord(id)
  const parties = splitParties(after.parties)
  await recordPackageUpdateIfChanged({
    entityType: 'WORK_DEPENDENCY',
    entityId: id,
    subjectUserId: parties.providerIds[0] ?? null,
    timeframeId: after.timeframeId,
    actorId: viewer.userId,
    editedAfterApproval: await editedAfterApproval(after.timeframeId, [...parties.providerIds, ...parties.neederIds]),
    before: snapshot(before),
    after: snapshot(after),
    fields: AUDITED_FIELDS,
    metadata: { title: after.title, externalRef: after.externalRef },
  })
  return detailRowFor(viewer, id)
}

/**
 * POST /api/dependencies/[id]/status. DEP-5: entering DONE stamps `doneAt` and
 * notifies every NEEDER once (DEPENDENCY_DONE); reopening clears `doneAt`.
 * Completing the delivery Todo never gets here on its own (DEP-4).
 */
export async function changeDependencyStatus(
  viewer: PackageViewer,
  id: string,
  input: DependencyStatusInput,
  options: MutationOptions = {},
): Promise<DependencyStatusResult> {
  const now = options.now ?? new Date()
  const before = await loadRecord(id)
  const access = await accessFor(viewer, before)
  if (!canSetStatus({ canChangeStatus: access.canChangeStatus, canDrop: access.canEdit }, input.status)) {
    throw new DependencyError(
      403,
      'FORBIDDEN',
      input.status === 'DROPPED' && access.canChangeStatus
        ? 'Only the creator, a party’s manager, an Executive or an Admin can drop a dependency'
        : 'Only a provider, the creator, a party’s manager, an Executive or an Admin can change this status',
    )
  }

  const transition = statusTransition(before, input.status, now)
  const noteChanged = input.note !== undefined && input.note !== before.note
  if (!transition.changed && !noteChanged) {
    return { dependency: await detailRowFor(viewer, id), changed: false, notifiedNeeders: false }
  }

  // Conditional write: two people marking DONE at once notify the needers once.
  const write = await prisma.workDependency.updateMany({
    where: { id, status: before.status },
    data: {
      status: input.status,
      doneAt: transition.doneAt,
      ...(input.note !== undefined && { note: input.note }),
    },
  })
  if (write.count === 0) {
    throw new DependencyError(409, 'STATUS_CONFLICT', 'The status changed while you were editing; reload and try again')
  }

  const { providerIds, neederIds } = splitParties(before.parties)
  await recordPackageActivity({
    entityType: 'WORK_DEPENDENCY',
    action: transition.becameDone ? 'COMPLETED' : 'STATUS_CHANGED',
    entityId: id,
    subjectUserId: providerIds[0] ?? null,
    timeframeId: before.timeframeId,
    actorId: viewer.userId,
    editedAfterApproval: await editedAfterApproval(before.timeframeId, [...providerIds, ...neederIds]),
    changes: {
      ...(transition.changed && { status: { from: before.status, to: input.status } }),
      ...(noteChanged && { note: { from: before.note, to: input.note ?? null } }),
    },
    metadata: { title: before.title, externalRef: before.externalRef, reopened: transition.reopened || undefined },
  })

  let notifiedNeeders = false
  if (transition.becameDone && neederIds.length > 0) {
    const providerNames = before.parties
      .filter((p) => p.role === 'PROVIDER')
      .map((p) => p.user.name)
      .filter(Boolean)
      .join(', ')
    await emit('DEPENDENCY_DONE', {
      actorId: viewer.userId,
      entityType: 'WORK_DEPENDENCY',
      entityId: id,
      entityTitle: before.title,
      data: {
        externalRef: before.externalRef,
        neededByDate: before.neededByDate ? before.neededByDate.toISOString().slice(0, 10) : null,
        providerNames,
        unblocksText: before.unblocksText,
        actorName: options.actorName ?? null,
      },
    })
    notifiedNeeders = true
  }

  return { dependency: await detailRowFor(viewer, id), changed: transition.changed, notifiedNeeders }
}

/**
 * DEP-4 — POST /api/dependencies/[id]/delivery-task. Creates a Todo
 * (kind = DEPENDENCY) for the first provider, due on `neededByDate`, and links it
 * through `deliveryTodoId`. Idempotent: an existing live delivery Todo is returned.
 * Completing the Todo does NOT close the dependency.
 */
export async function createDeliveryTask(
  viewer: PackageViewer,
  id: string,
  options: MutationOptions = {},
): Promise<DeliveryTaskResult> {
  const record = await loadRecord(id)
  const access = await accessFor(viewer, record)
  if (!access.canEdit && !access.isProvider) {
    throw new DependencyError(403, 'FORBIDDEN', 'Only a provider or an editor of this dependency can create its delivery task')
  }

  const todoSelect = { id: true, title: true, assigneeId: true, dueDate: true } as const
  if (record.deliveryTodoId) {
    const existing = await prisma.todo.findUnique({ where: { id: record.deliveryTodoId }, select: todoSelect })
    if (existing) {
      return {
        dependency: await detailRowFor(viewer, id),
        todo: { ...existing, dueDate: iso(existing.dueDate), href: todoHref(existing.id) },
        created: false,
      }
    }
  }
  if (isDependencyClosed(record.status)) {
    throw new DependencyError(400, 'DEPENDENCY_CLOSED', 'This dependency is already closed')
  }
  const providerId = splitParties(record.parties).providerIds[0]
  if (!providerId) throw new DependencyError(400, 'NO_PROVIDER', 'Add a provider before creating the delivery task')

  const title = `${record.externalRef ? `${record.externalRef} · ` : ''}${record.title}`.slice(0, 500)
  const description = [
    'Delivery task for a work dependency.',
    record.unblocksText ? `Unblocks: ${record.unblocksText}` : null,
    'Completing this task does not close the dependency — mark it Done on the dependency once delivered.',
  ]
    .filter(Boolean)
    .join('\n\n')

  const todo = await prisma.$transaction(async (tx) => {
    const created = await tx.todo.create({
      data: {
        title,
        description,
        status: 'PENDING',
        priority: 'MEDIUM',
        dueDate: record.neededByDate,
        kind: 'DEPENDENCY',
        assigneeId: providerId,
        creatorId: viewer.userId,
        members: { create: [{ userId: providerId }] },
      },
      select: todoSelect,
    })
    // Conditional link: a concurrent request that linked first wins, this one rolls back.
    const linked = await tx.workDependency.updateMany({
      where: {
        id,
        OR: [{ deliveryTodoId: null }, ...(record.deliveryTodoId ? [{ deliveryTodoId: record.deliveryTodoId }] : [])],
      },
      data: { deliveryTodoId: created.id },
    })
    if (linked.count === 0) {
      throw new DependencyError(409, 'DELIVERY_TASK_EXISTS', 'A delivery task was just created for this dependency')
    }
    return created
  })

  const { providerIds, neederIds } = splitParties(record.parties)
  await recordActivity({
    entityType: 'TODO',
    todoId: todo.id,
    action: 'INITIATIVE_CREATED',
    actorId: viewer.userId,
    metadata: { title: todo.title, assigneeId: todo.assigneeId, kind: 'DEPENDENCY', dependencyId: id },
  })
  await recordPackageActivity({
    entityType: 'WORK_DEPENDENCY',
    action: 'UPDATED',
    entityId: id,
    subjectUserId: providerId,
    timeframeId: record.timeframeId,
    actorId: viewer.userId,
    editedAfterApproval: await editedAfterApproval(record.timeframeId, [...providerIds, ...neederIds]),
    changes: { deliveryTodoId: { from: record.deliveryTodoId, to: todo.id } },
    metadata: { title: record.title, externalRef: record.externalRef, deliveryTodoId: todo.id },
  })
  if (todo.assigneeId && todo.assigneeId !== viewer.userId) {
    await emit('TODO_ASSIGNED', {
      actorId: viewer.userId,
      entityType: 'TODO',
      entityId: todo.id,
      entityTitle: todo.title,
      data: {
        actorName: options.actorName ?? null,
        dueDate: todo.dueDate ? todo.dueDate.toISOString().slice(0, 10) : null,
        deepLink: todoHref(todo.id),
      },
    })
  }

  return {
    dependency: await detailRowFor(viewer, id),
    todo: { ...todo, dueDate: iso(todo.dueDate), href: todoHref(todo.id) },
    created: true,
  }
}

function isDependencyClosed(status: string): boolean {
  return status === 'DONE' || status === 'DROPPED'
}

// ---------------------------------------------------------------------------
// Profile helpers
// ---------------------------------------------------------------------------

/** Loads the viewer for a userId (profile summaries are called with ids, not sessions). */
export async function loadViewerById(viewerId: string): Promise<PackageViewer> {
  return loadPackageViewer(viewerId)
}
