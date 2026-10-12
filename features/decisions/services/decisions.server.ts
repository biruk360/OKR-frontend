/**
 * Decisions (DEC-1…4): server service. It touches Prisma, so import it by
 * direct path from `app/` (routes, page loaders) only.
 *
 * Access (spec §8, lib/package/access.ts resolveDecisionAccess):
 *   - view:    decider, requester, linked users (USER links and owners of
 *              linked items), anyone who may view one of those people's
 *              'decisions' area (manager chain, department, HR), Exec/Admin.
 *   - edit:    the request (title, needed by, batch, options, links):
 *              requester, decider, Executive, Admin.
 *   - decide:  record or change the decision (DEC-2, DEC-4): decider,
 *              Executive or Admin, AND feature `button.decision.decide`.
 *   - withdraw: the requester (while nothing is decided) or a decider.
 * Comments (DEC-4) are not built: the existing Comment model is tied to
 * objectives / key results, so there is no generic comment thread to reuse.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { emit } from '@/lib/notifications'
import {
  canEditPackageArea,
  canViewPackageAreaResolved,
  primePackageSubjects,
  resolveDecisionAccess,
  resolvePackageAccessFacts,
  type DecisionAccess,
  type PackageViewer,
} from '@/lib/package/access'
import { diffPackageFields, recordPackageActivity } from '@/lib/package/audit'
import { dependencyMapHref } from '@/lib/package/links'
import { developmentHref, dutyHref, kpiHref, todoHref } from '@/lib/connections/flags'
import { resolveOkrItems, type OkrRef } from '@/lib/connections/okr-items'
import { loadViewerContext, type ViewerContext } from '@/lib/okr/visibility-scope'
import { resolveDefaultTimeframe } from '@/lib/okr/active-timeframe'
import {
  DEPENDENCY_CLOSED_STATUSES,
  PACKAGE_FEATURE_KEYS,
  isDecisionLinkEntityType,
  isDecisionStatus,
  isDependencyStatus,
  profileTabHref,
  type DecisionLinkEntityType,
  type DecisionStatus,
  type PackageArea,
} from '@/types/package'
import type {
  DecideDecisionResult,
  DecisionDTO,
  DecisionDependencyView,
  DecisionDetailDTO,
  DecisionLinkView,
  DecisionListResponse,
  DecisionPerson,
  DecisionRelation,
} from '../types'
import {
  NO_BATCH_FILTER,
  type CreateDecisionInput,
  type DecideDecisionInput,
  type DecisionLinkInput,
  type ListDecisionsQuery,
  type UpdateDecisionInput,
} from './schemas'
import { canWithdrawDecision, compareByNeededBy, isDecisionOverdue, linkKey, planStatusChange } from './rules'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type DecisionErrorStatus = 400 | 403 | 404 | 409

export class DecisionError extends Error {
  constructor(
    public readonly status: DecisionErrorStatus,
    message: string,
    public readonly code: string = 'DECISION_ERROR',
  ) {
    super(message)
    this.name = 'DecisionError'
  }
}

export function isDecisionError(error: unknown): error is DecisionError {
  return error instanceof DecisionError
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

type Db = typeof prisma | Prisma.TransactionClient

const DECISION_INCLUDE = {
  timeframe: { select: { id: true, name: true } },
  links: { select: { id: true, entityType: true, entityId: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.DecisionInclude

type DecisionRow = Prisma.DecisionGetPayload<{ include: typeof DECISION_INCLUDE }>
type LinkRow = DecisionRow['links'][number]

const PERSON_SELECT = { id: true, name: true, avatar: true } satisfies Prisma.UserSelect

/** Fields an UPDATED activity row diffs. */
const TRACKED_FIELDS = [
  'title',
  'externalRef',
  'requestedByText',
  'deciderId',
  'neededBy',
  'batch',
  'optionsText',
  'unblocksText',
  'status',
  'decisionText',
  'decidedAt',
  'decidedById',
] as const

/** Non-USER link types, i.e. links to someone's item. */
const ITEM_LINK_TYPES: readonly DecisionLinkEntityType[] = [
  'OBJECTIVE',
  'KEY_RESULT',
  'TODO',
  'KPI',
  'DUTY',
  'DEVELOPMENT',
  'DEPENDENCY',
]

const DEFAULT_LIST_LIMIT = 200

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

async function loadPeople(db: Db, ids: Iterable<string | null | undefined>): Promise<Map<string, DecisionPerson>> {
  const unique = [...new Set([...ids].filter((id): id is string => !!id))]
  if (unique.length === 0) return new Map()
  const rows = await db.user.findMany({ where: { id: { in: unique } }, select: PERSON_SELECT })
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, avatar: row.avatar ?? null }]))
}

async function loadDecisionRow(db: Db, id: string): Promise<DecisionRow> {
  const row = await db.decision.findUnique({ where: { id }, include: DECISION_INCLUDE })
  if (!row) throw new DecisionError(404, 'Decision not found', 'NOT_FOUND')
  return row
}

// ---------------------------------------------------------------------------
// Link targets (owners + display)
// ---------------------------------------------------------------------------

interface LinkTarget {
  /** People the target belongs to (owner / assignee / dependency parties / the user). */
  ownerIds: string[]
  title: string
  ref: string | null
  href: string | null
  status: string | null
  owner: DecisionPerson | null
  /** §8 area that governs who may see the target's title (null = everyone, e.g. dependencies). */
  area: PackageArea | null
  /** Viewer-independent reasons the viewer sees it anyway (todo creator / assignee). */
  participantIds?: string[]
}

type TargetMap = Map<string, LinkTarget>

function personOf(row: { id: string; name: string; avatar: string | null } | null | undefined): DecisionPerson | null {
  return row ? { id: row.id, name: row.name, avatar: row.avatar ?? null } : null
}

/** Load every link target in one query per type. Missing / deleted targets are absent from the map. */
async function loadLinkTargets(db: Db, links: readonly { entityType: string; entityId: string }[]): Promise<TargetMap> {
  const idsByType = new Map<DecisionLinkEntityType, Set<string>>()
  for (const link of links) {
    if (!isDecisionLinkEntityType(link.entityType)) continue
    const set = idsByType.get(link.entityType) ?? new Set<string>()
    set.add(link.entityId)
    idsByType.set(link.entityType, set)
  }
  const ids = (type: DecisionLinkEntityType) => Array.from(idsByType.get(type) ?? [])
  const none = <T,>() => Promise.resolve([] as T[])

  const [users, objectives, keyResults, todos, kpis, duties, devItems, dependencies] = await Promise.all([
    ids('USER').length ? db.user.findMany({ where: { id: { in: ids('USER') } }, select: PERSON_SELECT }) : none<{ id: string; name: string; avatar: string | null }>(),
    ids('OBJECTIVE').length
      ? db.objective.findMany({
          where: { id: { in: ids('OBJECTIVE') }, status: { not: 'DELETED' } },
          select: { id: true, title: true, externalRef: true, ownerId: true, owner: { select: PERSON_SELECT } },
        })
      : none<{ id: string; title: string; externalRef: string | null; ownerId: string; owner: { id: string; name: string; avatar: string | null } }>(),
    ids('KEY_RESULT').length
      ? db.keyResult.findMany({
          where: { id: { in: ids('KEY_RESULT') }, status: { not: 'DELETED' } },
          select: { id: true, title: true, externalRef: true, ownerId: true, owner: { select: PERSON_SELECT } },
        })
      : none<{ id: string; title: string; externalRef: string | null; ownerId: string; owner: { id: string; name: string; avatar: string | null } }>(),
    ids('TODO').length
      ? db.todo.findMany({
          where: { id: { in: ids('TODO') } },
          select: {
            id: true,
            title: true,
            status: true,
            assigneeId: true,
            creatorId: true,
            assignee: { select: PERSON_SELECT },
            creator: { select: PERSON_SELECT },
          },
        })
      : none<{
          id: string
          title: string
          status: string
          assigneeId: string | null
          creatorId: string
          assignee: { id: string; name: string; avatar: string | null } | null
          creator: { id: string; name: string; avatar: string | null }
        }>(),
    ids('KPI').length
      ? db.kpi.findMany({
          where: { id: { in: ids('KPI') } },
          select: { id: true, name: true, externalRef: true, status: true, ownerId: true, owner: { select: PERSON_SELECT } },
        })
      : none<{ id: string; name: string; externalRef: string | null; status: string; ownerId: string; owner: { id: string; name: string; avatar: string | null } }>(),
    ids('DUTY').length
      ? db.recurringDuty.findMany({
          where: { id: { in: ids('DUTY') } },
          select: { id: true, title: true, externalRef: true, status: true, ownerId: true, owner: { select: PERSON_SELECT } },
        })
      : none<{ id: string; title: string; externalRef: string | null; status: string; ownerId: string; owner: { id: string; name: string; avatar: string | null } }>(),
    ids('DEVELOPMENT').length
      ? db.developmentItem.findMany({
          where: { id: { in: ids('DEVELOPMENT') } },
          select: { id: true, title: true, externalRef: true, status: true, ownerId: true, owner: { select: PERSON_SELECT } },
        })
      : none<{ id: string; title: string; externalRef: string | null; status: string; ownerId: string; owner: { id: string; name: string; avatar: string | null } }>(),
    ids('DEPENDENCY').length
      ? db.workDependency.findMany({
          where: { id: { in: ids('DEPENDENCY') } },
          select: { id: true, title: true, externalRef: true, status: true, parties: { select: { userId: true } } },
        })
      : none<{ id: string; title: string; externalRef: string | null; status: string; parties: { userId: string }[] }>(),
  ])

  const map: TargetMap = new Map()
  for (const u of users) {
    map.set(linkKey('USER', u.id), {
      ownerIds: [u.id],
      title: u.name,
      ref: null,
      href: profileTabHref(u.id, 'decisions'),
      status: null,
      owner: personOf(u),
      area: null,
    })
  }
  for (const o of objectives) {
    // Display comes from resolveOkrItems (redaction); this entry carries the owner.
    map.set(linkKey('OBJECTIVE', o.id), { ownerIds: [o.ownerId], title: o.title, ref: o.externalRef, href: null, status: null, owner: personOf(o.owner), area: 'okr' })
  }
  for (const k of keyResults) {
    map.set(linkKey('KEY_RESULT', k.id), { ownerIds: [k.ownerId], title: k.title, ref: k.externalRef, href: null, status: null, owner: personOf(k.owner), area: 'okr' })
  }
  for (const t of todos) {
    const ownerId = t.assigneeId ?? t.creatorId
    map.set(linkKey('TODO', t.id), {
      ownerIds: [ownerId],
      title: t.title,
      ref: null,
      href: todoHref(t.id),
      status: t.status,
      owner: personOf(t.assignee ?? t.creator),
      area: 'duties',
      participantIds: [t.creatorId, ...(t.assigneeId ? [t.assigneeId] : [])],
    })
  }
  for (const k of kpis) {
    map.set(linkKey('KPI', k.id), { ownerIds: [k.ownerId], title: k.name, ref: k.externalRef, href: kpiHref(k.ownerId), status: k.status, owner: personOf(k.owner), area: 'kpis' })
  }
  for (const d of duties) {
    map.set(linkKey('DUTY', d.id), { ownerIds: [d.ownerId], title: d.title, ref: d.externalRef, href: dutyHref(d.ownerId), status: d.status, owner: personOf(d.owner), area: 'duties' })
  }
  for (const d of devItems) {
    map.set(linkKey('DEVELOPMENT', d.id), {
      ownerIds: [d.ownerId],
      title: d.title,
      ref: d.externalRef,
      href: developmentHref(d.ownerId),
      status: d.status,
      owner: personOf(d.owner),
      area: 'development',
    })
  }
  for (const d of dependencies) {
    map.set(linkKey('DEPENDENCY', d.id), {
      ownerIds: Array.from(new Set(d.parties.map((p) => p.userId))),
      title: d.title,
      ref: d.externalRef,
      href: dependencyMapHref(d.id),
      status: d.status,
      owner: null,
      // §8: the company Dependency Map shows titles + status to everyone.
      area: null,
    })
  }
  return map
}

/** USER links plus owners of linked items: the decision's "linked users". */
function linkedUserIdsOf(links: readonly LinkRow[], targets: TargetMap): string[] {
  const out = new Set<string>()
  for (const link of links) {
    if (link.entityType === 'USER') {
      out.add(link.entityId)
      continue
    }
    for (const id of targets.get(linkKey(link.entityType, link.entityId))?.ownerIds ?? []) out.add(id)
  }
  return Array.from(out)
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

interface RequestScope {
  viewer: PackageViewer
  /** Lazily loaded OKR visibility context (only when OKR links are shown). */
  okrContext: () => Promise<ViewerContext>
  /** Lazily resolved `button.decision.decide`. */
  decideFeature: () => Promise<boolean>
}

function makeScope(viewer: PackageViewer): RequestScope {
  let ctx: Promise<ViewerContext> | null = null
  let feature: Promise<boolean> | null = null
  return {
    viewer,
    okrContext: () => (ctx ??= loadViewerContext({ id: viewer.userId, role: viewer.role })),
    decideFeature: () => (feature ??= hasDecideFeature(viewer)),
  }
}

/** Fail closed: a feature lookup we could not complete is not a grant. ADMIN always passes. */
async function hasDecideFeature(viewer: PackageViewer): Promise<boolean> {
  if (viewer.role === 'ADMIN') return true
  try {
    const { resolveFeaturePermission } = await import('@/lib/permission-resolver')
    return await resolveFeaturePermission(viewer.userId, PACKAGE_FEATURE_KEYS.buttonDecisionDecide)
  } catch (error) {
    console.error('[decisions] feature lookup failed; denying decide', {
      userId: viewer.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/** Pure per-decision verdict once every related person has been primed on the viewer. */
function accessFor(
  viewer: PackageViewer,
  row: Pick<DecisionRow, 'deciderId' | 'requestedById'>,
  linkedUserIds: readonly string[],
): DecisionAccess {
  // The decider is excluded: they see it via isDecider, and their peers/leads must not.
  const related = new Set([row.requestedById, ...linkedUserIds].filter((id): id is string => !!id))
  const partyAccess: Record<string, { view: boolean }> = {}
  related.forEach((id) => {
    if (id === viewer.userId) return
    partyAccess[id] = { view: canViewPackageAreaResolved(resolvePackageAccessFacts(viewer, id), 'decisions') }
  })
  return resolveDecisionAccess({
    viewerId: viewer.userId,
    seesAll: viewer.seesAll,
    isHr: viewer.isHr,
    deciderId: row.deciderId,
    requestedById: row.requestedById,
    linkedUserIds,
    partyAccess,
  })
}

/** May the viewer see the title of a non-OKR link target? */
function canSeeTarget(viewer: PackageViewer, target: LinkTarget): boolean {
  if (target.area === null || viewer.seesAll) return true
  if (target.participantIds?.includes(viewer.userId)) return true
  return target.ownerIds.some(
    (id) => id === viewer.userId || canViewPackageAreaResolved(resolvePackageAccessFacts(viewer, id), target.area!),
  )
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

interface MapContext {
  scope: RequestScope
  targets: TargetMap
  people: Map<string, DecisionPerson>
  /** OKR link display, keyed `TYPE:id`. */
  okrViews: Map<string, DecisionLinkView>
  canDecideFeature: boolean
  now: Date
}

async function buildOkrViews(scope: RequestScope, links: readonly LinkRow[]): Promise<Map<string, DecisionLinkView>> {
  const refs: OkrRef[] = []
  const seen = new Set<string>()
  for (const link of links) {
    if (link.entityType !== 'OBJECTIVE' && link.entityType !== 'KEY_RESULT') continue
    const key = linkKey(link.entityType, link.entityId)
    if (seen.has(key)) continue
    seen.add(key)
    refs.push({ type: link.entityType, id: link.entityId, via: 'ATTACHED' })
  }
  const views = new Map<string, DecisionLinkView>()
  if (refs.length === 0) return views
  const items = await resolveOkrItems(prisma, await scope.okrContext(), refs)
  for (const item of items) {
    if (item.type !== 'OBJECTIVE' && item.type !== 'KEY_RESULT') continue
    const key = linkKey(item.type, item.id)
    if (item.redacted) {
      views.set(key, { id: '', entityType: item.type, entityId: item.id, title: null, ref: null, href: null, status: null, owner: null, redacted: true, missing: false })
    } else {
      views.set(key, {
        id: '',
        entityType: item.type,
        entityId: item.id,
        title: item.title,
        ref: item.ref,
        href: item.href,
        status: item.status,
        owner: item.owner ? { id: item.owner.id, name: item.owner.name ?? '', avatar: item.owner.avatar ?? null } : null,
        redacted: false,
        missing: false,
      })
    }
  }
  return views
}

function toLinkView(link: LinkRow, m: MapContext): DecisionLinkView {
  const entityType: DecisionLinkEntityType = isDecisionLinkEntityType(link.entityType) ? link.entityType : 'USER'
  const key = linkKey(link.entityType, link.entityId)
  const base = { id: link.id, entityType, entityId: link.entityId }
  if (entityType === 'OBJECTIVE' || entityType === 'KEY_RESULT') {
    const view = m.okrViews.get(key)
    if (view) return { ...view, ...base }
    return { ...base, title: null, ref: null, href: null, status: null, owner: null, redacted: false, missing: true }
  }
  const target = m.targets.get(key)
  if (!target) return { ...base, title: null, ref: null, href: null, status: null, owner: null, redacted: false, missing: true }
  if (!canSeeTarget(m.scope.viewer, target)) {
    return { ...base, title: null, ref: null, href: null, status: null, owner: null, redacted: true, missing: false }
  }
  return {
    ...base,
    title: target.title,
    ref: target.ref,
    href: target.href,
    status: target.status,
    owner: target.owner,
    redacted: false,
    missing: false,
  }
}

function toDTO(row: DecisionRow, access: DecisionAccess, m: MapContext, relations?: DecisionRelation[]): DecisionDTO {
  const status: DecisionStatus = isDecisionStatus(row.status) ? row.status : 'OPEN'
  const canDecide = access.canDecide && m.canDecideFeature
  return {
    id: row.id,
    externalRef: row.externalRef,
    timeframeId: row.timeframeId,
    timeframeName: row.timeframe?.name ?? null,
    title: row.title,
    requestedById: row.requestedById,
    requestedBy: row.requestedById ? m.people.get(row.requestedById) ?? null : null,
    requestedByText: row.requestedByText,
    deciderId: row.deciderId,
    decider: m.people.get(row.deciderId) ?? null,
    neededBy: iso(row.neededBy),
    batch: row.batch,
    optionsText: row.optionsText,
    unblocksText: row.unblocksText,
    status,
    decisionText: row.decisionText,
    decidedAt: iso(row.decidedAt),
    decidedById: row.decidedById,
    decidedBy: row.decidedById ? m.people.get(row.decidedById) ?? null : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    overdue: isDecisionOverdue({ status, neededBy: row.neededBy }, m.now),
    links: row.links.map((link) => toLinkView(link, m)),
    ...(relations ? { relations } : {}),
    access: {
      canDecide,
      canEdit: access.canEdit,
      canWithdraw: canWithdrawDecision(status, { canDecide, isRequester: access.isRequester }),
      canComment: access.canComment,
    },
  }
}

/**
 * Load targets, prime access facts and compute the verdict for many rows at
 * once. Returns only the rows the viewer may view, with their access.
 */
async function resolveRows(
  scope: RequestScope,
  rows: readonly DecisionRow[],
): Promise<{ visible: Array<{ row: DecisionRow; access: DecisionAccess }>; ctx: MapContext }> {
  const allLinks = rows.flatMap((r) => r.links)
  const targets = await loadLinkTargets(prisma, allLinks)
  const linkedByRow = new Map(rows.map((r) => [r.id, linkedUserIdsOf(r.links, targets)]))

  const related = new Set<string>()
  for (const r of rows) {
    if (r.requestedById) related.add(r.requestedById)
    for (const id of linkedByRow.get(r.id) ?? []) related.add(id)
  }
  targets.forEach((t) => t.ownerIds.forEach((id) => related.add(id)))
  related.delete(scope.viewer.userId)
  await primePackageSubjects(scope.viewer, related)

  const visible = rows
    .map((row) => ({ row, access: accessFor(scope.viewer, row, linkedByRow.get(row.id) ?? []) }))
    .filter((entry) => entry.access.canView)

  const visibleRows = visible.map((v) => v.row)
  const [people, okrViews, canDecideFeature] = await Promise.all([
    loadPeople(
      prisma,
      visibleRows.flatMap((r) => [r.requestedById, r.deciderId, r.decidedById]),
    ),
    buildOkrViews(scope, visibleRows.flatMap((r) => r.links)),
    visible.some((v) => v.access.canDecide) ? scope.decideFeature() : Promise.resolve(false),
  ])
  return { visible, ctx: { scope, targets, people, okrViews, canDecideFeature, now: new Date() } }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * DEC-3: ids of decisions "affecting" a person: linked to them (USER link),
 * linked to one of their items, or requested by them; with the reasons.
 */
async function affectingDecisionIds(
  userId: string,
  baseWhere: Prisma.DecisionWhereInput,
): Promise<Map<string, Set<DecisionRelation>>> {
  const [userLinks, itemLinks, requested, decided] = await Promise.all([
    prisma.decisionLink.findMany({
      where: { entityType: 'USER', entityId: userId, decision: baseWhere },
      select: { decisionId: true },
    }),
    prisma.decisionLink.findMany({
      where: { entityType: { in: [...ITEM_LINK_TYPES] }, decision: baseWhere },
      select: { decisionId: true, entityType: true, entityId: true },
    }),
    prisma.decision.findMany({ where: { AND: [baseWhere, { requestedById: userId }] }, select: { id: true } }),
    prisma.decision.findMany({ where: { AND: [baseWhere, { deciderId: userId }] }, select: { id: true } }),
  ])
  const out = new Map<string, Set<DecisionRelation>>()
  const add = (id: string, relation: DecisionRelation) => {
    const set = out.get(id) ?? new Set<DecisionRelation>()
    set.add(relation)
    out.set(id, set)
  }
  for (const link of userLinks) add(link.decisionId, 'LINKED')
  if (itemLinks.length > 0) {
    const targets = await loadLinkTargets(prisma, itemLinks)
    for (const link of itemLinks) {
      if (targets.get(linkKey(link.entityType, link.entityId))?.ownerIds.includes(userId)) add(link.decisionId, 'ITEM')
    }
  }
  for (const d of requested) add(d.id, 'REQUESTER')
  // The decider relation is reported only on decisions that also affect the person otherwise.
  const affecting = new Set(out.keys())
  for (const d of decided) if (affecting.has(d.id)) add(d.id, 'DECIDER')
  return out
}

function buildBaseWhere(viewer: PackageViewer, query: Partial<ListDecisionsQuery>): Prisma.DecisionWhereInput {
  const and: Prisma.DecisionWhereInput[] = []
  if (query.status?.length) and.push({ status: { in: query.status } })
  if (query.deciderId) and.push({ deciderId: query.deciderId === 'me' ? viewer.userId : query.deciderId })
  if (query.requestedById) and.push({ requestedById: query.requestedById === 'me' ? viewer.userId : query.requestedById })
  if (query.batch) and.push(query.batch === NO_BATCH_FILTER ? { batch: null } : { batch: query.batch })
  if (query.timeframeId) {
    and.push(query.openAnyTimeframe ? { OR: [{ timeframeId: query.timeframeId }, { status: 'OPEN' }] } : { timeframeId: query.timeframeId })
  }
  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { externalRef: { contains: query.q, mode: 'insensitive' } },
        { batch: { contains: query.q, mode: 'insensitive' } },
      ],
    })
  }
  return and.length ? { AND: and } : {}
}

/** OrganizationSettings.companyCeoUserId: the default decider ("default: CEO"). */
export async function getDefaultDeciderId(): Promise<string | null> {
  const settings = await prisma.organizationSettings.findFirst({
    where: { companyCeoUserId: { not: null } },
    select: { companyCeoUserId: true },
  })
  return settings?.companyCeoUserId ?? null
}

/**
 * GET /api/decisions. Filters by status, decider ('me'), affecting user (DEC-3),
 * requester, batch, timeframe and text; returns only the decisions the viewer
 * may view, ordered by neededBy (DEC-1).
 */
export async function listDecisions(viewer: PackageViewer, query: Partial<ListDecisionsQuery>): Promise<DecisionListResponse> {
  const scope = makeScope(viewer)
  const baseWhere = buildBaseWhere(viewer, query)

  let relations: Map<string, Set<DecisionRelation>> | null = null
  let where = baseWhere
  if (query.affectingUserId) {
    const subjectId = query.affectingUserId === 'me' ? viewer.userId : query.affectingUserId
    relations = await affectingDecisionIds(subjectId, baseWhere)
    where = { AND: [baseWhere, { id: { in: Array.from(relations.keys()) } }] }
  }

  const rows = await prisma.decision.findMany({
    where,
    include: DECISION_INCLUDE,
    orderBy: [{ neededBy: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: 2000,
  })

  const [{ visible, ctx }, defaultDeciderId, canDecideFeature] = await Promise.all([
    resolveRows(scope, rows),
    getDefaultDeciderId(),
    scope.decideFeature(),
  ])
  const items = visible
    .map(({ row, access }) => toDTO(row, access, ctx, relations ? Array.from(relations.get(row.id) ?? []) : undefined))
    .sort(compareByNeededBy)
  const limit = query.limit ?? DEFAULT_LIST_LIMIT
  return {
    items: items.slice(0, limit),
    total: items.length,
    permissions: { canCreate: true, canDecideFeature },
    defaultDeciderId,
  }
}

async function loadDependencies(decisionId: string, links: readonly LinkRow[]): Promise<DecisionDependencyView[]> {
  const linkedIds = links.filter((l) => l.entityType === 'DEPENDENCY').map((l) => l.entityId)
  const rows = await prisma.workDependency.findMany({
    where: { OR: [{ decisionId }, ...(linkedIds.length ? [{ id: { in: linkedIds } }] : [])] },
    select: { id: true, externalRef: true, title: true, status: true, neededByDate: true },
    orderBy: [{ neededByDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })
  return rows.map((d) => ({
    id: d.id,
    externalRef: d.externalRef,
    title: d.title,
    status: isDependencyStatus(d.status) ? d.status : 'OPEN',
    neededByDate: iso(d.neededByDate),
  }))
}

async function detailFor(scope: RequestScope, row: DecisionRow): Promise<DecisionDetailDTO> {
  const { visible, ctx } = await resolveRows(scope, [row])
  const entry = visible[0]
  if (!entry) throw new DecisionError(403, 'You do not have access to this decision', 'FORBIDDEN')
  const dependencies = await loadDependencies(row.id, row.links)
  return { ...toDTO(row, entry.access, ctx), dependencies }
}

/** GET /api/decisions/[id]: the decision, its resolved links, waiting dependencies and the viewer's access. */
export async function getDecision(viewer: PackageViewer, id: string): Promise<DecisionDetailDTO> {
  const row = await loadDecisionRow(prisma, id)
  return detailFor(makeScope(viewer), row)
}

/** The viewer's access to one decision (for routes that only need the verdict). */
async function loadWithAccess(scope: RequestScope, id: string) {
  const row = await loadDecisionRow(prisma, id)
  const targets = await loadLinkTargets(prisma, row.links)
  const linkedUserIds = linkedUserIdsOf(row.links, targets)
  await primePackageSubjects(
    scope.viewer,
    [row.requestedById, ...linkedUserIds].filter((x): x is string => !!x && x !== scope.viewer.userId),
  )
  const access = accessFor(scope.viewer, row, linkedUserIds)
  if (!access.canView) throw new DecisionError(404, 'Decision not found', 'NOT_FOUND')
  return { row, access, targets, linkedUserIds }
}

// ---------------------------------------------------------------------------
// Writes: validation helpers
// ---------------------------------------------------------------------------

async function assertActiveUser(id: string, label: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true, name: true } })
  if (!user || !user.isActive) throw new DecisionError(400, `${label} must be an active user`, 'INVALID_USER')
  return user
}

async function resolveTimeframeId(timeframeId: string | null | undefined): Promise<string> {
  if (timeframeId) {
    const exists = await prisma.timeframe.findUnique({ where: { id: timeframeId }, select: { id: true } })
    if (!exists) throw new DecisionError(404, 'Timeframe not found', 'TIMEFRAME_NOT_FOUND')
    return timeframeId
  }
  const fallback = await resolveDefaultTimeframe()
  if (!fallback) throw new DecisionError(400, 'Choose a timeframe for the decision', 'TIMEFRAME_REQUIRED')
  return fallback.id
}

/**
 * Every new link must point at something that exists and that the viewer can
 * see: you cannot attach a decision to an item hidden from you.
 */
async function assertLinkTargets(scope: RequestScope, links: readonly DecisionLinkInput[]): Promise<void> {
  if (links.length === 0) return
  const targets = await loadLinkTargets(prisma, links)
  await primePackageSubjects(
    scope.viewer,
    Array.from(targets.values()).flatMap((t) => t.ownerIds).filter((id) => id !== scope.viewer.userId),
  )
  const okrRows = links.map((l, i) => ({ id: `${i}`, entityType: l.entityType, entityId: l.entityId }))
  const okrViews = await buildOkrViews(scope, okrRows)
  for (const link of links) {
    const key = linkKey(link.entityType, link.entityId)
    const target = targets.get(key)
    if (!target) throw new DecisionError(400, `Linked ${link.entityType.toLowerCase().replace('_', ' ')} not found`, 'INVALID_LINK')
    if (link.entityType === 'OBJECTIVE' || link.entityType === 'KEY_RESULT') {
      const view = okrViews.get(key)
      if (!view || view.redacted) throw new DecisionError(403, 'You cannot link a private OKR item you cannot see', 'LINK_FORBIDDEN')
      continue
    }
    if (!canSeeTarget(scope.viewer, target)) {
      throw new DecisionError(403, 'You cannot link an item you do not have access to', 'LINK_FORBIDDEN')
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function snapshot(row: Pick<DecisionRow, (typeof TRACKED_FIELDS)[number]>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of TRACKED_FIELDS) out[field] = row[field]
  return out
}

async function actorName(viewer: PackageViewer): Promise<string | undefined> {
  const user = await prisma.user.findUnique({ where: { id: viewer.userId }, select: { name: true } })
  return user?.name ?? undefined
}

function emitSafely(promise: Promise<void>, context: string) {
  promise.catch((error) => console.error(`[decisions] ${context} notification failed`, error))
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/** POST /api/decisions: request a decision. Notifies the decider (DECISION_REQUESTED). */
export async function createDecision(viewer: PackageViewer, input: CreateDecisionInput): Promise<DecisionDetailDTO> {
  const scope = makeScope(viewer)
  const timeframeId = await resolveTimeframeId(input.timeframeId)

  const requestedById = input.requestedById === undefined ? viewer.userId : input.requestedById
  if (requestedById && requestedById !== viewer.userId) {
    await assertActiveUser(requestedById, 'Requester')
    if (!viewer.seesAll && !(await canEditPackageArea(viewer, requestedById, 'decisions'))) {
      throw new DecisionError(403, 'You can only request decisions for yourself or people whose decisions you manage', 'FORBIDDEN')
    }
  }

  const deciderId = input.deciderId ?? (await getDefaultDeciderId())
  if (!deciderId) throw new DecisionError(400, 'Choose who decides (no company CEO is set)', 'DECIDER_REQUIRED')
  await assertActiveUser(deciderId, 'Decider')

  await assertLinkTargets(scope, input.links)

  let created: DecisionRow
  try {
    created = await prisma.$transaction(async (tx) => {
      const row = await tx.decision.create({
        data: {
          timeframeId,
          title: input.title,
          externalRef: input.externalRef ?? null,
          requestedById: requestedById ?? null,
          requestedByText: input.requestedByText ?? null,
          deciderId,
          neededBy: input.neededBy ?? null,
          batch: input.batch ?? null,
          optionsText: input.optionsText ?? null,
          unblocksText: input.unblocksText ?? null,
          status: 'OPEN',
          links: { create: input.links.map((l) => ({ entityType: l.entityType, entityId: l.entityId })) },
        },
        include: DECISION_INCLUDE,
      })
      await recordPackageActivity(
        {
          entityType: 'DECISION',
          action: 'CREATED',
          entityId: row.id,
          timeframeId,
          actorId: viewer.userId,
          metadata: {
            title: row.title,
            externalRef: row.externalRef ?? undefined,
            deciderId,
            requestedById: requestedById ?? undefined,
            linkCount: input.links.length,
          },
        },
        { client: tx, required: true },
      )
      return row
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DecisionError(409, `Reference "${input.externalRef}" is already used in this timeframe`, 'DUPLICATE_REF')
    }
    throw error
  }

  emitSafely(
    emit('DECISION_REQUESTED', {
      actorId: viewer.userId,
      entityType: 'DECISION',
      entityId: created.id,
      entityTitle: created.title,
      data: {
        externalRef: created.externalRef,
        requesterName: created.requestedByText ?? (await actorName(viewer)),
        neededBy: iso(created.neededBy),
        batch: created.batch,
        decisionId: created.id,
      },
    }),
    'DECISION_REQUESTED',
  )

  return detailFor(scope, created)
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * PATCH /api/decisions/[id].
 *   - request fields + links: requester, decider, Executive, Admin (canEdit)
 *   - deciderId, decisionText: decider, Executive, Admin (canDecide + feature)
 *   - status: planStatusChange (DECIDED only through …/decide)
 */
export async function updateDecision(viewer: PackageViewer, id: string, input: UpdateDecisionInput): Promise<DecisionDetailDTO> {
  const scope = makeScope(viewer)
  const { row, access } = await loadWithAccess(scope, id)
  const canDecide = access.canDecide && (await scope.decideFeature())
  const currentStatus: DecisionStatus = isDecisionStatus(row.status) ? row.status : 'OPEN'

  const requestFields = ['title', 'externalRef', 'requestedByText', 'neededBy', 'batch', 'optionsText', 'unblocksText', 'links'] as const
  const touchesRequest = requestFields.some((field) => input[field] !== undefined)
  if (touchesRequest && !access.canEdit) {
    throw new DecisionError(403, 'Only the requester, the decider, an Executive or an Admin can edit this request', 'FORBIDDEN')
  }

  const data: Prisma.DecisionUncheckedUpdateInput = {}
  if (input.title !== undefined) data.title = input.title
  if (input.externalRef !== undefined) data.externalRef = input.externalRef
  if (input.requestedByText !== undefined) data.requestedByText = input.requestedByText
  if (input.neededBy !== undefined) data.neededBy = input.neededBy
  if (input.batch !== undefined) data.batch = input.batch
  if (input.optionsText !== undefined) data.optionsText = input.optionsText
  if (input.unblocksText !== undefined) data.unblocksText = input.unblocksText

  let deciderChanged = false
  if (input.deciderId !== undefined && input.deciderId !== row.deciderId) {
    if (!canDecide) throw new DecisionError(403, 'Only the decider, an Executive or an Admin can reassign the decision', 'FORBIDDEN')
    await assertActiveUser(input.deciderId, 'Decider')
    data.deciderId = input.deciderId
    deciderChanged = true
  }

  let nextStatus = currentStatus
  if (input.status !== undefined && input.status !== currentStatus) {
    const plan = planStatusChange(currentStatus, input.status, { canDecide, isRequester: access.isRequester })
    if (!plan.ok) throw new DecisionError(plan.status, plan.message, plan.code)
    data.status = input.status
    nextStatus = input.status
    if (plan.clearDecision) {
      data.decisionText = null
      data.decidedAt = null
      data.decidedById = null
    }
  }

  if (input.decisionText !== undefined) {
    if (!canDecide) throw new DecisionError(403, 'Only the decider, an Executive or an Admin can change a decision', 'FORBIDDEN')
    if (nextStatus !== 'DECIDED') {
      throw new DecisionError(409, 'Only a decided decision has decision text. Use “Record decision”.', 'NOT_DECIDED')
    }
    data.decisionText = input.decisionText
  }

  // Links: replace the set; only new links are validated.
  let addedLinks: DecisionLinkInput[] = []
  let removedLinks: LinkRow[] = []
  if (input.links !== undefined) {
    const current = new Map(row.links.map((l) => [linkKey(l.entityType, l.entityId), l]))
    const next = new Set(input.links.map((l) => linkKey(l.entityType, l.entityId)))
    addedLinks = input.links.filter((l) => !current.has(linkKey(l.entityType, l.entityId)))
    removedLinks = row.links.filter((l) => !next.has(linkKey(l.entityType, l.entityId)))
    await assertLinkTargets(scope, addedLinks)
  }

  if (Object.keys(data).length === 0 && addedLinks.length === 0 && removedLinks.length === 0) {
    return detailFor(scope, row)
  }

  let updated: DecisionRow
  try {
    updated = await prisma.$transaction(async (tx) => {
      if (removedLinks.length) await tx.decisionLink.deleteMany({ where: { id: { in: removedLinks.map((l) => l.id) } } })
      if (addedLinks.length) {
        await tx.decisionLink.createMany({
          data: addedLinks.map((l) => ({ decisionId: id, entityType: l.entityType, entityId: l.entityId })),
          skipDuplicates: true,
        })
      }
      const after = Object.keys(data).length
        ? await tx.decision.update({ where: { id }, data, include: DECISION_INCLUDE })
        : await loadDecisionRow(tx, id)

      const changes = diffPackageFields(snapshot(row), snapshot(after), TRACKED_FIELDS)
      if (changes) {
        const keys = Object.keys(changes)
        await recordPackageActivity(
          {
            entityType: 'DECISION',
            action: keys.includes('status') ? 'STATUS_CHANGED' : 'UPDATED',
            entityId: id,
            timeframeId: after.timeframeId,
            actorId: viewer.userId,
            changes,
            metadata: { title: after.title, externalRef: after.externalRef ?? undefined },
          },
          { client: tx, required: true },
        )
      }
      for (const link of addedLinks) {
        await recordPackageActivity(
          {
            entityType: 'DECISION',
            action: 'LINKED',
            entityId: id,
            timeframeId: after.timeframeId,
            actorId: viewer.userId,
            metadata: { title: after.title, linkEntityType: link.entityType, linkEntityId: link.entityId },
          },
          { client: tx, required: true },
        )
      }
      for (const link of removedLinks) {
        await recordPackageActivity(
          {
            entityType: 'DECISION',
            action: 'UNLINKED',
            entityId: id,
            timeframeId: after.timeframeId,
            actorId: viewer.userId,
            metadata: { title: after.title, linkEntityType: link.entityType, linkEntityId: link.entityId },
          },
          { client: tx, required: true },
        )
      }
      return after
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DecisionError(409, `Reference "${input.externalRef}" is already used in this timeframe`, 'DUPLICATE_REF')
    }
    throw error
  }

  if (deciderChanged && updated.status === 'OPEN') {
    emitSafely(
      emit('DECISION_REQUESTED', {
        actorId: viewer.userId,
        entityType: 'DECISION',
        entityId: updated.id,
        entityTitle: updated.title,
        data: {
          externalRef: updated.externalRef,
          requesterName: updated.requestedByText ?? undefined,
          neededBy: iso(updated.neededBy),
          batch: updated.batch,
          decisionId: updated.id,
        },
      }),
      'DECISION_REQUESTED (reassigned)',
    )
  }

  return detailFor(scope, updated)
}

// ---------------------------------------------------------------------------
// Decide (DEC-2)
// ---------------------------------------------------------------------------

/**
 * POST /api/decisions/[id]/decide. Records the decision (decisionText
 * required), stamps decidedAt / decidedById, closes linked WorkDependency rows
 * of type DECISION (they can be reopened from the dependency), then notifies
 * the requester and every linked user (DECISION_DECIDED) and each closed
 * dependency's needers (DEPENDENCY_DONE, DEP-5).
 */
export async function decideDecision(viewer: PackageViewer, id: string, input: DecideDecisionInput): Promise<DecideDecisionResult> {
  const scope = makeScope(viewer)
  const { row, access, targets } = await loadWithAccess(scope, id)
  if (!access.canDecide) {
    throw new DecisionError(403, 'Only the decider, an Executive or an Admin can record this decision', 'FORBIDDEN')
  }
  if (!(await scope.decideFeature())) {
    throw new DecisionError(403, 'Your role is not allowed to record decisions', 'FEATURE_DISABLED')
  }
  if (row.status === 'DECIDED') {
    throw new DecisionError(409, 'This decision is already recorded. Edit the decision text instead.', 'ALREADY_DECIDED')
  }
  if (row.status === 'WITHDRAWN') {
    throw new DecisionError(409, 'This request was withdrawn. Reopen it before recording a decision.', 'WITHDRAWN')
  }

  const now = new Date()
  const decidedAt = input.decidedAt ?? now
  const linkedDependencyIds = row.links.filter((l) => l.entityType === 'DEPENDENCY').map((l) => l.entityId)

  const { updated, closed } = await prisma.$transaction(async (tx) => {
    const updated = await tx.decision.update({
      where: { id },
      data: { status: 'DECIDED', decisionText: input.decisionText, decidedAt, decidedById: viewer.userId },
      include: DECISION_INCLUDE,
    })
    await recordPackageActivity(
      {
        entityType: 'DECISION',
        action: 'DECIDED',
        entityId: id,
        timeframeId: updated.timeframeId,
        actorId: viewer.userId,
        changes: diffPackageFields(snapshot(row), snapshot(updated), TRACKED_FIELDS),
        metadata: { title: updated.title, externalRef: updated.externalRef ?? undefined },
      },
      { client: tx, required: true },
    )

    let closed: Array<{ id: string; externalRef: string | null; title: string; unblocksText: string | null; timeframeId: string; status: string }> = []
    if (input.closeDependencies) {
      closed = await tx.workDependency.findMany({
        where: {
          depType: 'DECISION',
          status: { notIn: [...DEPENDENCY_CLOSED_STATUSES] },
          OR: [{ decisionId: id }, ...(linkedDependencyIds.length ? [{ id: { in: linkedDependencyIds } }] : [])],
        },
        select: { id: true, externalRef: true, title: true, unblocksText: true, timeframeId: true, status: true },
      })
      if (closed.length) {
        await tx.workDependency.updateMany({
          where: { id: { in: closed.map((d) => d.id) } },
          data: { status: 'DONE', doneAt: now },
        })
        for (const dep of closed) {
          await recordPackageActivity(
            {
              entityType: 'WORK_DEPENDENCY',
              action: 'STATUS_CHANGED',
              entityId: dep.id,
              timeframeId: dep.timeframeId,
              actorId: viewer.userId,
              changes: { status: { from: dep.status, to: 'DONE' }, doneAt: { from: null, to: now.toISOString() } },
              metadata: { title: dep.title, externalRef: dep.externalRef ?? undefined, closedByDecisionId: id },
            },
            { client: tx, required: true },
          )
        }
      }
    }
    return { updated, closed }
  })

  // Notifications (after commit). The dispatcher adds the requester and USER
  // links; owners of linked items are passed explicitly (never the actor).
  const name = await actorName(viewer)
  const itemOwners = new Set<string>()
  for (const link of row.links) {
    if (link.entityType === 'USER') continue
    for (const ownerId of targets.get(linkKey(link.entityType, link.entityId))?.ownerIds ?? []) itemOwners.add(ownerId)
  }
  itemOwners.delete(viewer.userId)
  emitSafely(
    emit('DECISION_DECIDED', {
      actorId: viewer.userId,
      entityType: 'DECISION',
      entityId: id,
      entityTitle: updated.title,
      explicitRecipients: itemOwners.size ? Array.from(itemOwners) : undefined,
      data: {
        externalRef: updated.externalRef,
        actorName: name,
        decisionText: updated.decisionText,
        decidedAt: iso(updated.decidedAt),
        decisionId: id,
      },
    }),
    'DECISION_DECIDED',
  )
  for (const dep of closed) {
    emitSafely(
      emit('DEPENDENCY_DONE', {
        actorId: viewer.userId,
        entityType: 'WORK_DEPENDENCY',
        entityId: dep.id,
        entityTitle: dep.title,
        data: { externalRef: dep.externalRef, actorName: name, unblocksText: dep.unblocksText, decisionId: id },
      }),
      'DEPENDENCY_DONE',
    )
  }

  return { decision: await detailFor(scope, updated), closedDependencyIds: closed.map((d) => d.id) }
}
