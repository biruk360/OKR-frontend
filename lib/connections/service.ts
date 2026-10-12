/**
 * Connections aggregator (CON-1 / CON-2 / CON-3 / CON-8) — everything linked to one
 * OBJECTIVE | KEY_RESULT | TODO | KPI | DUTY | DEVELOPMENT, in one call.
 *
 *   alignsTo      parentObjectiveId (objective), own objective (KR), own KR / objective /
 *                 duty (task, KPI, duty, development) + CONTRIBUTES_TO out
 *   supportedBy   child objectives + CONTRIBUTES_TO in
 *   predecessors  SUCCEEDS out, plus `rolledFromId` when no SUCCEEDS link covers it
 *   successors    SUCCEEDS in, plus items whose `rolledFromId` is the subject
 *   dependencies  WorkDependencyLink → inbound / outbound with DEP-2 late / dueSoon
 *   decisions     DecisionLink → OPEN decisions
 *   kpis / duties / development / milestones — attached to a KR (duties also to an objective)
 *
 * Visibility:
 *   - the subject must be viewable (objective/KR: lib/okr/visibility-scope.ts incl.
 *     record scope; task: `canReadTodo`; package items: ./visibility.ts) — else null (404);
 *   - each linked item the viewer may not see is `{ redacted: true }` with no title (CON-8);
 *   - dependencies are company-level records: title, status and timing are public (§8,
 *     DEP-6) and never redacted; the parties (providers / needers) and the linked
 *     decision are detail, shown only when `getDependencyAccess(...).canViewDetail`;
 *   - decisions use the record-level §8 rule (`resolveDecisionAccess`), never the
 *     subject's visibility — a public KR does not expose its linked decisions.
 *
 * Loads in a handful of batched queries; no per-row permission calls.
 */
import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  canViewPackageAreaResolved,
  getDependencyAccess,
  loadPackageViewer,
  primePackageSubjects,
  resolveDecisionAccess,
  resolvePackageAccessFacts,
  type PackageAccessLoaders,
  type PackageViewer,
} from '@/lib/package/access'
import { canReadTodo } from '@/lib/todos/access'
import {
  canViewKeyResultInMemory,
  canViewObjectiveInMemory,
  type ViewerContext,
} from '@/lib/okr/visibility-scope'
import { canEditOkrNode, linkRef, loadOkrNode } from '@/lib/okr-links/service'
import {
  buildConnectionSummary,
  decisionHref,
  decisionOverdue,
  dedupeConnectionItems,
  dependencyDirection,
  dependencyHref,
  dependencyTiming,
  developmentHref,
  dutyHref,
  groupDependencies,
  isoOrNull,
  kpiHref,
  projectHref,
} from './flags'
import { objectiveIdsInScope, resolveOkrItems, type ConnectionsDb, type OkrRef } from './okr-items'
import {
  decisionVisible,
  kpiArea,
  projectReadable,
  type PackageItemArea,
  type PackageVisibilityFn,
} from './visibility'
import type {
  ConnectionDecision,
  ConnectionDependency,
  ConnectionEntityType,
  ConnectionItem,
  ConnectionRelation,
  ConnectionsPayload,
  ConnectionVia,
} from './types'

export interface GetConnectionsOptions {
  db?: PrismaClient
  now?: Date
  /** Session `userType` — client-portal sessions never read internal tasks. */
  userType?: string | null
  /**
   * Override the duty / KPI / development verdict (default: lib/package/access.ts via
   * `buildPackageVisibility`). Receives the owner ids of every package item in the payload.
   */
  packageVisibility?: (ownerIds: string[]) => Promise<PackageVisibilityFn>
  /** §8 data loaders for the lazy package viewer (tests inject an in-memory org). */
  packageLoaders?: PackageAccessLoaders
}

const PERSON = { select: { id: true, name: true, avatar: true } } as const

// ---------------------------------------------------------------------------
// Package (duty / KPI / development) rows
// ---------------------------------------------------------------------------

const KPI_SELECT = {
  id: true,
  name: true,
  externalRef: true,
  ownerId: true,
  isSensitive: true,
  status: true,
  owner: PERSON,
} as const
const DUTY_SELECT = {
  id: true,
  title: true,
  externalRef: true,
  ownerId: true,
  status: true,
  cadence: true,
  owner: PERSON,
} as const
const DEVELOPMENT_SELECT = {
  id: true,
  title: true,
  externalRef: true,
  ownerId: true,
  status: true,
  dueDate: true,
  owner: PERSON,
} as const

type KpiRow = { id: string; name: string; externalRef: string | null; ownerId: string; isSensitive: boolean; status: string; owner: { id: string; name: string; avatar: string | null } }
type DutyRow = { id: string; title: string; externalRef: string | null; ownerId: string; status: string; cadence: string; owner: { id: string; name: string; avatar: string | null } }
type DevelopmentRow = { id: string; title: string; externalRef: string | null; ownerId: string; status: string; dueDate: Date | null; owner: { id: string; name: string; avatar: string | null } }

function relation(type: ConnectionRelation['type'], id: string, via: ConnectionVia): ConnectionRelation {
  return { type, id, via }
}

function kpiItem(row: KpiRow, via: ConnectionVia, visible: PackageVisibilityFn): ConnectionItem {
  const rel = relation('KPI', row.id, via)
  if (!visible(kpiArea(row), row.ownerId)) return { ...rel, redacted: true }
  return {
    ...rel,
    redacted: false,
    title: row.name,
    ref: row.externalRef,
    href: kpiHref(row.ownerId),
    status: row.status,
    progress: null,
    owner: row.owner,
  }
}

function dutyItem(row: DutyRow, via: ConnectionVia, visible: PackageVisibilityFn): ConnectionItem {
  const rel = relation('DUTY', row.id, via)
  if (!visible('duties', row.ownerId)) return { ...rel, redacted: true }
  return {
    ...rel,
    redacted: false,
    title: row.title,
    ref: row.externalRef,
    href: dutyHref(row.ownerId),
    status: row.status,
    progress: null,
    owner: row.owner,
    parentLabel: row.cadence,
  }
}

function developmentItem(row: DevelopmentRow, via: ConnectionVia, visible: PackageVisibilityFn): ConnectionItem {
  const rel = relation('DEVELOPMENT', row.id, via)
  if (!visible('development', row.ownerId)) return { ...rel, redacted: true }
  return {
    ...rel,
    redacted: false,
    title: row.title,
    ref: row.externalRef,
    href: developmentHref(row.ownerId),
    status: row.status,
    progress: null,
    owner: row.owner,
    dueDate: isoOrNull(row.dueDate),
  }
}

/**
 * Lazily loaded §8 viewer (lib/package/access.ts). Loading it costs a few queries
 * (features, manager tree, memberships), so it is only built when a package row or
 * a decision actually needs it — and never for ADMIN / EXECUTIVE.
 */
function lazyPackageViewer(ctx: ViewerContext, loaders?: PackageAccessLoaders): () => Promise<PackageViewer> {
  let viewer: Promise<PackageViewer> | null = null
  return () => (viewer ??= loadPackageViewer({ id: ctx.userId, role: ctx.role }, loaders))
}

/** Default duty / KPI / development verdict: the §8 matrix in lib/package/access.ts. */
export async function buildPackageVisibility(
  ctx: ViewerContext,
  ownerIds: readonly string[],
  getViewer: () => Promise<PackageViewer> = lazyPackageViewer(ctx),
  loaders?: PackageAccessLoaders,
): Promise<PackageVisibilityFn> {
  if (ctx.seesAll) return () => true
  const others = Array.from(new Set(ownerIds.filter((id) => id && id !== ctx.userId)))
  if (others.length === 0) return () => true
  const viewer = await getViewer()
  await primePackageSubjects(viewer, others, loaders)
  return (area: PackageItemArea, ownerId: string) =>
    canViewPackageAreaResolved(resolvePackageAccessFacts(viewer, ownerId), area)
}

// ---------------------------------------------------------------------------
// Subject resolution
// ---------------------------------------------------------------------------

interface SubjectPlan {
  title: string
  /** Owner used for dependency direction and package visibility. */
  ownerId: string | null
  /** Subject visibility verdict, decided before or after package facts are loaded. */
  check: (visible: PackageVisibilityFn) => { canView: boolean; full: boolean }
  alignsTo: Array<OkrRef | { type: 'DUTY'; id: string; via: ConnectionVia }>
  supportedBy: OkrRef[]
  predecessors: OkrRef[]
  successors: OkrRef[]
  /** OBJECTIVE / KEY_RESULT subjects only. */
  okrNode: { type: 'OBJECTIVE' | 'KEY_RESULT'; id: string } | null
  attachedTo: { keyResultId: string | null; objectiveId: string | null }
}

type LinkRow = { id: string; fromType: string; fromId: string; toType: string; toId: string; kind: string; subKind: string | null; isPrimary: boolean }

const LINK_SELECT = {
  id: true,
  fromType: true,
  fromId: true,
  toType: true,
  toId: true,
  kind: true,
  subKind: true,
  isPrimary: true,
} as const

/** CON-1 OKR groups from the subject's OkrLinks, child objectives and rolledFrom/rolledTo. */
async function okrGroups(
  db: ConnectionsDb,
  type: 'OBJECTIVE' | 'KEY_RESULT',
  id: string,
  rolledFromId: string | null,
): Promise<Pick<SubjectPlan, 'alignsTo' | 'supportedBy' | 'predecessors' | 'successors'>> {
  const [outgoing, incoming, children, rolledTo] = await Promise.all([
    db.okrLink.findMany({ where: { fromType: type, fromId: id }, select: LINK_SELECT, orderBy: { createdAt: 'asc' } }),
    db.okrLink.findMany({ where: { toType: type, toId: id }, select: LINK_SELECT, orderBy: { createdAt: 'asc' } }),
    type === 'OBJECTIVE'
      ? db.objective.findMany({
          where: { parentObjectiveId: id, status: { not: 'DELETED' } },
          select: { id: true },
          orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
        })
      : Promise.resolve([] as Array<{ id: string }>),
    type === 'OBJECTIVE'
      ? db.objective.findMany({ where: { rolledFromId: id, status: { not: 'DELETED' } }, select: { id: true } })
      : db.keyResult.findMany({ where: { rolledFromId: id, status: { not: 'DELETED' } }, select: { id: true } }),
  ])
  const out = (kind: string) => (outgoing as LinkRow[]).filter((l) => l.kind === kind)
  const inc = (kind: string) => (incoming as LinkRow[]).filter((l) => l.kind === kind)

  const predecessors: OkrRef[] = out('SUCCEEDS').map((l) => linkRef(l, l.toType, l.toId))
  if (rolledFromId && !predecessors.some((p) => p.type === type && p.id === rolledFromId)) {
    predecessors.push({ type, id: rolledFromId, via: 'ROLLED_FROM' })
  }
  const successors: OkrRef[] = inc('SUCCEEDS').map((l) => linkRef(l, l.fromType, l.fromId))
  for (const row of rolledTo) {
    if (!successors.some((s) => s.type === type && s.id === row.id)) {
      successors.push({ type, id: row.id, via: 'ROLLED_FROM' })
    }
  }
  return {
    alignsTo: out('CONTRIBUTES_TO').map((l) => linkRef(l, l.toType, l.toId)),
    supportedBy: [
      ...children.map((c) => ({ type: 'OBJECTIVE' as const, id: c.id, via: 'CHILD' as const })),
      ...inc('CONTRIBUTES_TO').map((l) => linkRef(l, l.fromType, l.fromId)),
    ],
    predecessors,
    successors,
  }
}

const EMPTY_GROUPS = { supportedBy: [], predecessors: [], successors: [] }

function parentRefs(keyResultId: string | null, objectiveId: string | null): OkrRef[] {
  const refs: OkrRef[] = []
  if (keyResultId) refs.push({ type: 'KEY_RESULT', id: keyResultId, via: 'PARENT' })
  if (objectiveId) refs.push({ type: 'OBJECTIVE', id: objectiveId, via: 'PARENT' })
  return refs
}

async function planSubject(
  db: ConnectionsDb,
  ctx: ViewerContext,
  type: ConnectionEntityType,
  id: string,
  userType: string | null,
): Promise<SubjectPlan | null> {
  switch (type) {
    case 'OBJECTIVE': {
      const o = await db.objective.findUnique({
        where: { id },
        select: { id: true, title: true, ownerId: true, isPrivate: true, status: true, parentObjectiveId: true, rolledFromId: true },
      })
      if (!o || o.status === 'DELETED') return null
      const inScope = (await objectiveIdsInScope(db, ctx, [o.id])).has(o.id)
      if (!inScope) return null
      const verdict = canViewObjectiveInMemory(ctx, o)
      const groups = await okrGroups(db, 'OBJECTIVE', o.id, o.rolledFromId)
      return {
        title: o.title,
        ownerId: o.ownerId,
        check: () => ({ canView: verdict.canView, full: !verdict.isRedacted }),
        ...groups,
        alignsTo: [...parentRefs(null, o.parentObjectiveId), ...groups.alignsTo],
        okrNode: { type: 'OBJECTIVE', id: o.id },
        attachedTo: { keyResultId: null, objectiveId: o.id },
      }
    }
    case 'KEY_RESULT': {
      const k = await db.keyResult.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          ownerId: true,
          isPrivate: true,
          status: true,
          rolledFromId: true,
          objective: { select: { id: true, ownerId: true, isPrivate: true, status: true } },
        },
      })
      if (!k || k.status === 'DELETED' || k.objective.status === 'DELETED') return null
      const inScope = (await objectiveIdsInScope(db, ctx, [k.objective.id])).has(k.objective.id)
      if (!inScope) return null
      const verdict = canViewKeyResultInMemory(ctx, k, canViewObjectiveInMemory(ctx, k.objective))
      const groups = await okrGroups(db, 'KEY_RESULT', k.id, k.rolledFromId)
      return {
        title: k.title,
        ownerId: k.ownerId,
        check: () => ({ canView: verdict.canView, full: !verdict.isRedacted }),
        ...groups,
        alignsTo: [...parentRefs(null, k.objective.id), ...groups.alignsTo],
        okrNode: { type: 'KEY_RESULT', id: k.id },
        attachedTo: { keyResultId: k.id, objectiveId: null },
      }
    }
    case 'TODO': {
      const t = await db.todo.findUnique({
        where: { id },
        select: { id: true, title: true, assigneeId: true, creatorId: true, keyResultId: true, objectiveId: true, dutyId: true },
      })
      if (!t) return null
      const readable = await canReadTodo({ id: ctx.userId, role: ctx.role, userType }, t.id)
      const alignsTo: SubjectPlan['alignsTo'] = parentRefs(t.keyResultId, t.objectiveId)
      if (t.dutyId) alignsTo.push({ type: 'DUTY', id: t.dutyId, via: 'PARENT' })
      return {
        title: t.title,
        ownerId: t.assigneeId ?? t.creatorId,
        check: () => ({ canView: readable, full: readable }),
        alignsTo,
        ...EMPTY_GROUPS,
        okrNode: null,
        attachedTo: { keyResultId: null, objectiveId: null },
      }
    }
    case 'KPI': {
      const row = await db.kpi.findUnique({
        where: { id },
        select: { id: true, name: true, ownerId: true, isSensitive: true, keyResultId: true },
      })
      if (!row) return null
      return {
        title: row.name,
        ownerId: row.ownerId,
        check: (visible) => {
          const ok = visible(kpiArea(row), row.ownerId)
          return { canView: ok, full: ok }
        },
        alignsTo: parentRefs(row.keyResultId, null),
        ...EMPTY_GROUPS,
        okrNode: null,
        attachedTo: { keyResultId: null, objectiveId: null },
      }
    }
    case 'DUTY': {
      const row = await db.recurringDuty.findUnique({
        where: { id },
        select: { id: true, title: true, ownerId: true, keyResultId: true, objectiveId: true },
      })
      if (!row) return null
      return {
        title: row.title,
        ownerId: row.ownerId,
        check: (visible) => {
          const ok = visible('duties', row.ownerId)
          return { canView: ok, full: ok }
        },
        alignsTo: parentRefs(row.keyResultId, row.objectiveId),
        ...EMPTY_GROUPS,
        okrNode: null,
        attachedTo: { keyResultId: null, objectiveId: null },
      }
    }
    case 'DEVELOPMENT': {
      const row = await db.developmentItem.findUnique({
        where: { id },
        select: { id: true, title: true, ownerId: true, keyResultId: true },
      })
      if (!row) return null
      return {
        title: row.title,
        ownerId: row.ownerId,
        check: (visible) => {
          const ok = visible('development', row.ownerId)
          return { canView: ok, full: ok }
        },
        alignsTo: parentRefs(row.keyResultId, null),
        ...EMPTY_GROUPS,
        okrNode: null,
        attachedTo: { keyResultId: null, objectiveId: null },
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

function isOkrRef(ref: SubjectPlan['alignsTo'][number]): ref is OkrRef {
  return ref.type === 'OBJECTIVE' || ref.type === 'KEY_RESULT'
}

/**
 * Everything connected to one item, redacted for the viewer. Returns null when the
 * subject does not exist or the viewer may not see it (callers answer 404).
 */
export async function getConnections(
  ctx: ViewerContext,
  entityType: ConnectionEntityType,
  entityId: string,
  opts: GetConnectionsOptions = {},
): Promise<ConnectionsPayload | null> {
  const db = opts.db ?? prisma
  const now = opts.now ?? new Date()

  const plan = await planSubject(db, ctx, entityType, entityId, opts.userType ?? null)
  if (!plan) return null

  const { keyResultId: attachedKr, objectiveId: attachedObjective } = plan.attachedTo
  const alignsToDutyIds = plan.alignsTo.filter((r) => r.type === 'DUTY').map((r) => r.id)

  const [kpiRows, dutyRows, alignDutyRows, devRows, milestoneRows, depLinks, decisionLinks] = await Promise.all([
    attachedKr
      ? db.kpi.findMany({ where: { keyResultId: attachedKr, status: 'ACTIVE' }, select: KPI_SELECT, orderBy: { name: 'asc' } })
      : Promise.resolve([] as KpiRow[]),
    attachedKr || attachedObjective
      ? db.recurringDuty.findMany({
          where: {
            status: { not: 'RETIRED' },
            ...(attachedKr ? { keyResultId: attachedKr } : { objectiveId: attachedObjective! }),
          },
          select: DUTY_SELECT,
          orderBy: { title: 'asc' },
        })
      : Promise.resolve([] as DutyRow[]),
    alignsToDutyIds.length
      ? db.recurringDuty.findMany({ where: { id: { in: alignsToDutyIds } }, select: DUTY_SELECT })
      : Promise.resolve([] as DutyRow[]),
    attachedKr
      ? db.developmentItem.findMany({
          where: { keyResultId: attachedKr, status: { not: 'DROPPED' } },
          select: DEVELOPMENT_SELECT,
          orderBy: { title: 'asc' },
        })
      : Promise.resolve([] as DevelopmentRow[]),
    attachedKr
      ? db.milestone.findMany({
          where: { keyResultId: attachedKr },
          select: {
            id: true,
            name: true,
            status: true,
            percentComplete: true,
            baselineDate: true,
            currentDate: true,
            phase: {
              select: {
                project: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    projectManagerId: true,
                    departmentId: true,
                    archivedAt: true,
                    members: { select: { userId: true } },
                  },
                },
              },
            },
          },
          orderBy: [{ currentDate: 'asc' }, { position: 'asc' }],
        })
      : Promise.resolve([]),
    db.workDependencyLink.findMany({
      where: { entityType, entityId },
      select: {
        dependency: {
          select: {
            id: true,
            externalRef: true,
            title: true,
            depType: true,
            status: true,
            neededByDate: true,
            decisionId: true,
            createdById: true,
            parties: { select: { userId: true, role: true, user: PERSON } },
          },
        },
      },
    }),
    db.decisionLink.findMany({
      where: { entityType, entityId, decision: { status: 'OPEN' } },
      select: {
        decision: {
          select: {
            id: true,
            externalRef: true,
            title: true,
            status: true,
            neededBy: true,
            batch: true,
            deciderId: true,
            requestedById: true,
            decider: PERSON,
            links: { where: { entityType: 'USER' }, select: { entityId: true } },
          },
        },
      },
    }),
  ])

  // Package visibility covers the subject (when it is a package item) and every attached row.
  const packageOwners = [
    ...(entityType === 'KPI' || entityType === 'DUTY' || entityType === 'DEVELOPMENT' ? [plan.ownerId ?? ''] : []),
    ...kpiRows.map((r) => r.ownerId),
    ...dutyRows.map((r) => r.ownerId),
    ...alignDutyRows.map((r) => r.ownerId),
    ...devRows.map((r) => r.ownerId),
  ].filter(Boolean)
  const loaders = opts.packageLoaders
  const getPackageViewer = lazyPackageViewer(ctx, loaders)
  const visible: PackageVisibilityFn =
    packageOwners.length === 0
      ? () => true
      : opts.packageVisibility
        ? await opts.packageVisibility(packageOwners)
        : await buildPackageVisibility(ctx, packageOwners, getPackageViewer, loaders)

  const verdict = plan.check(visible)
  if (!verdict.canView) return null

  // OKR items (one batched resolve for all four groups).
  const okrAlign = plan.alignsTo.filter(isOkrRef)
  const okrRefs = [...okrAlign, ...plan.supportedBy, ...plan.predecessors, ...plan.successors]
  const okrItems = await resolveOkrItems(db, ctx, okrRefs)
  const take = (refs: readonly OkrRef[]): ConnectionItem[] => {
    const wanted = new Set(refs.map((r) => `${r.type}:${r.id}:${r.via}:${r.linkId ?? ''}`))
    return okrItems.filter((item) => wanted.has(`${item.type}:${item.id}:${item.via}:${item.linkId ?? ''}`))
  }

  const dutyById = new Map(alignDutyRows.map((r) => [r.id, r]))
  const alignsTo: ConnectionItem[] = []
  const okrAlignItems = take(okrAlign)
  for (const ref of plan.alignsTo) {
    if (isOkrRef(ref)) continue
    const row = dutyById.get(ref.id)
    if (row) alignsTo.push(dutyItem(row, 'PARENT', visible))
  }

  // Parties are dependency detail (DEP-6): only parties, their managers / leads / peers,
  // HR and ADMIN / EXECUTIVE see who provides and who needs. Everyone else gets the
  // public summary (title, status, timing) with empty party lists.
  const depDetailIds = new Set<string>()
  if (ctx.seesAll) {
    depLinks.forEach(({ dependency: d }) => depDetailIds.add(d.id))
  } else if (depLinks.length > 0) {
    const viewer = await getPackageViewer()
    await primePackageSubjects(viewer, depLinks.flatMap(({ dependency: d }) => d.parties.map((p) => p.userId)), loaders)
    for (const { dependency: d } of depLinks) {
      const access = await getDependencyAccess(
        viewer,
        {
          providerIds: d.parties.filter((p) => p.role === 'PROVIDER').map((p) => p.userId),
          neederIds: d.parties.filter((p) => p.role === 'NEEDER').map((p) => p.userId),
          createdById: d.createdById,
        },
        loaders,
      )
      if (access.canViewDetail) depDetailIds.add(d.id)
    }
  }

  const dependencies: ConnectionDependency[] = depLinks.map(({ dependency: d }) => {
    const parties = d.parties
    const detail = depDetailIds.has(d.id)
    return {
      type: 'DEPENDENCY',
      id: d.id,
      ref: d.externalRef,
      title: d.title,
      depType: d.depType,
      status: d.status,
      neededByDate: isoOrNull(d.neededByDate),
      direction: dependencyDirection(plan.ownerId, parties),
      providers: detail ? parties.filter((p) => p.role === 'PROVIDER').map((p) => p.user) : [],
      needers: detail ? parties.filter((p) => p.role === 'NEEDER').map((p) => p.user) : [],
      decisionId: detail ? d.decisionId : null,
      href: dependencyHref(d.id),
      ...dependencyTiming(d, now),
    }
  })

  const decisionRows = decisionLinks
    .map(({ decision: d }) => ({ ...d, linkedUserIds: d.links.map((l) => l.entityId) }))
    .sort((a, b) => (a.neededBy?.getTime() ?? Infinity) - (b.neededBy?.getTime() ?? Infinity))
  // Fast path (party / all-seeing), then the §8 record rule — the same one
  // GET /api/decisions/[id] applies, so this payload never shows more than that route.
  const visibleDecisionIds = new Set(
    decisionRows
      .filter((d) => decisionVisible({ userId: ctx.userId, seesAll: ctx.seesAll }, d))
      .map((d) => d.id),
  )
  const undecided = decisionRows.filter((d) => !visibleDecisionIds.has(d.id))
  if (undecided.length > 0) {
    const viewer = await getPackageViewer()
    const relatedOf = (d: (typeof decisionRows)[number]) =>
      [d.requestedById, ...d.linkedUserIds].filter((id): id is string => !!id && id !== viewer.userId)
    await primePackageSubjects(viewer, undecided.flatMap(relatedOf), loaders)
    for (const d of undecided) {
      const partyAccess: Record<string, { view: boolean }> = {}
      for (const id of relatedOf(d)) {
        partyAccess[id] = { view: canViewPackageAreaResolved(resolvePackageAccessFacts(viewer, id), 'decisions') }
      }
      const access = resolveDecisionAccess({
        viewerId: viewer.userId,
        seesAll: viewer.seesAll,
        isHr: viewer.isHr,
        deciderId: d.deciderId,
        requestedById: d.requestedById,
        linkedUserIds: d.linkedUserIds,
        partyAccess,
      })
      if (access.canView) visibleDecisionIds.add(d.id)
    }
  }
  const decisions: ConnectionDecision[] = decisionRows.map((d) => {
    if (!visibleDecisionIds.has(d.id)) return { type: 'DECISION' as const, id: d.id, redacted: true as const }
    return {
      type: 'DECISION' as const,
      id: d.id,
      redacted: false as const,
      ref: d.externalRef,
      title: d.title,
      status: d.status,
      neededBy: isoOrNull(d.neededBy),
      overdue: decisionOverdue(d, now),
      batch: d.batch,
      decider: d.decider,
      href: decisionHref(d.id),
    }
  })

  const milestones: ConnectionItem[] = milestoneRows
    .filter((m) => !m.phase.project.archivedAt)
    .map((m) => {
      const project = m.phase.project
      const rel = relation('MILESTONE', m.id, 'ATTACHED')
      const readable = projectReadable(
        { userId: ctx.userId, seesAll: ctx.seesAll, departmentIds: ctx.departmentIds },
        { projectManagerId: project.projectManagerId, departmentId: project.departmentId, memberIds: project.members.map((x) => x.userId) },
      )
      if (!readable) return { ...rel, redacted: true as const }
      return {
        ...rel,
        redacted: false as const,
        title: m.name,
        ref: project.code,
        href: projectHref(project.id),
        status: m.status,
        progress: m.percentComplete,
        owner: null,
        dueDate: isoOrNull(m.currentDate ?? m.baselineDate),
        project: { id: project.id, code: project.code, name: project.name },
      }
    })

  let canManageLinks = false
  if (plan.okrNode) {
    const node = await loadOkrNode(db, plan.okrNode.type, plan.okrNode.id)
    canManageLinks = !!node && !node.isLocked && (await canEditOkrNode({ id: ctx.userId, role: ctx.role }, node))
  }

  const parts = {
    alignsTo: dedupeConnectionItems([...okrAlignItems, ...alignsTo]),
    supportedBy: dedupeConnectionItems(take(plan.supportedBy)),
    predecessors: dedupeConnectionItems(take(plan.predecessors)),
    successors: dedupeConnectionItems(take(plan.successors)),
    dependencies: groupDependencies(dependencies),
    decisions,
    kpis: kpiRows.map((r) => kpiItem(r, 'ATTACHED', visible)),
    duties: dutyRows.map((r) => dutyItem(r, 'ATTACHED', visible)),
    development: devRows.map((r) => developmentItem(r, 'ATTACHED', visible)),
    milestones,
  }

  return {
    subject: {
      type: entityType,
      id: entityId,
      title: verdict.full ? plan.title : null,
      redacted: !verdict.full,
    },
    ...parts,
    summary: buildConnectionSummary(parts),
    permissions: { canManageLinks },
  }
}
