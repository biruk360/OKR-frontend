/**
 * OKR links (LNK-1 … LNK-4) — create / delete / list `OkrLink` rows.
 *
 * Rules live in `./validation.ts` (pure, unit-tested); this file loads the facts,
 * checks permissions and writes inside one transaction:
 *
 *   - Editing a link requires edit rights on its FROM item (`canEditObjective` /
 *     `canEditKeyResultWithObjectiveContext` from lib/permissions.ts); ADMIN and
 *     EXECUTIVE always may. Creating one also requires seeing the TO item in full,
 *     so nobody can attach to (or probe) an item they only see redacted.
 *   - A locked (closed) FROM item cannot gain or lose links (423) unless the
 *     caller passes `ignoreLock` (data scripts that relink closed items).
 *   - LNK-2: a primary SUCCEEDS between two items of the same type sets
 *     `rolledFromId` / `lineageRootId` / `lineageDepth` on the FROM item in the same
 *     transaction; at most one SUCCEEDS link per FROM item is primary (a new primary
 *     demotes the old one). Deleting — or demoting — the mirrored link clears the
 *     lineage fields again when they still point at that predecessor.
 *   - LNK-3: no roll-up changes. LNK-4 (`setParent`) is opt-in: an objective with no
 *     parent that CONTRIBUTES_TO a KR may adopt that KR's objective as its parent.
 *   - Every mutation writes one `OKR_LINK` activity entry (LINKED / UNLINKED) on the FROM item.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { ActivityAction, ChangeMap } from '@/lib/activity-log'
import { recordPackageActivity } from '@/lib/package/audit'
import { canEditKeyResultWithObjectiveContext, canEditObjective, type UserRole } from '@/lib/permissions'
import {
  canViewKeyResultInMemory,
  canViewObjectiveInMemory,
  loadViewerContext,
  makeViewerContext,
  SEES_ALL_ROLES,
  type ViewerContext,
} from '@/lib/okr/visibility-scope'
import { objectiveIdsInScope, resolveOkrItems, type OkrRef } from '@/lib/connections/okr-items'
import type { ConnectionItem } from '@/lib/connections/types'
import type { OkrLinkEntityType, OkrLinkKind, OkrLinkSubKind } from '@/types/package'
import {
  EMPTY_LINEAGE,
  lineageFromPredecessor,
  shouldMirrorLineage,
  validateOkrLink,
  validateOkrLinkShape,
  type LineageFields,
  type OkrLinkErrorCode,
  type OkrLinkInput,
  type OkrNodeFacts,
} from './validation'

type Db = PrismaClient | Prisma.TransactionClient

export interface OkrLinkActor {
  id: string
  role: string
}

export type OkrLinkServiceErrorCode = OkrLinkErrorCode | 'NOT_FOUND' | 'FORBIDDEN' | 'LOCKED' | 'DUPLICATE'

/** Thrown by the service; routes map `status` onto the response envelope. */
export class OkrLinkError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409 | 423,
    public readonly code: OkrLinkServiceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'OkrLinkError'
  }
}

/** The facts the rules and the permission check need about one end. */
export interface OkrNode extends OkrNodeFacts {
  title: string
  isPrivate: boolean
  departmentId: string | null
  /** Parent objective owner (= ownerId for an objective). */
  objectiveOwnerId: string
  objectiveIsPrivate: boolean
  parentObjectiveId: string | null
}

const NODE_OBJECTIVE_SELECT = {
  id: true,
  title: true,
  timeframeId: true,
  timeframe: { select: { startDate: true } },
  level: true,
  status: true,
  createdAt: true,
  ownerId: true,
  isPrivate: true,
  isLocked: true,
  departmentId: true,
  parentObjectiveId: true,
  rolledFromId: true,
  lineageRootId: true,
  lineageDepth: true,
} as const

/** Load one end of a link (objective or KR), or null when it does not exist. */
export async function loadOkrNode(db: Db, type: OkrLinkEntityType, id: string): Promise<OkrNode | null> {
  if (type === 'OBJECTIVE') {
    const o = await db.objective.findUnique({ where: { id }, select: NODE_OBJECTIVE_SELECT })
    if (!o) return null
    return {
      type,
      id: o.id,
      title: o.title,
      objectiveId: o.id,
      timeframeId: o.timeframeId,
      timeframeStart: o.timeframe.startDate,
      level: o.level,
      status: o.status,
      createdAt: o.createdAt,
      ownerId: o.ownerId,
      isPrivate: o.isPrivate,
      isLocked: o.isLocked,
      departmentId: o.departmentId,
      objectiveOwnerId: o.ownerId,
      objectiveIsPrivate: o.isPrivate,
      parentObjectiveId: o.parentObjectiveId,
      rolledFromId: o.rolledFromId,
      lineageRootId: o.lineageRootId,
      lineageDepth: o.lineageDepth,
    }
  }
  const k = await db.keyResult.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      ownerId: true,
      isPrivate: true,
      isLocked: true,
      rolledFromId: true,
      lineageRootId: true,
      lineageDepth: true,
      objective: { select: NODE_OBJECTIVE_SELECT },
    },
  })
  if (!k) return null
  const o = k.objective
  return {
    type,
    id: k.id,
    title: k.title,
    objectiveId: o.id,
    timeframeId: o.timeframeId,
    timeframeStart: o.timeframe.startDate,
    level: o.level,
    // A KR under a deleted objective is as good as deleted.
    status: o.status === 'DELETED' ? 'DELETED' : k.status,
    createdAt: k.createdAt,
    ownerId: k.ownerId,
    isPrivate: k.isPrivate,
    // Transitive lock, as in lib/okr/lock-guard.ts.
    isLocked: k.isLocked || o.isLocked,
    departmentId: o.departmentId,
    objectiveOwnerId: o.ownerId,
    objectiveIsPrivate: o.isPrivate,
    parentObjectiveId: null,
    rolledFromId: k.rolledFromId,
    lineageRootId: k.lineageRootId,
    lineageDepth: k.lineageDepth,
  }
}

/** Edit rights on an OKR item — the rule for adding / removing links that start at it. */
export async function canEditOkrNode(actor: OkrLinkActor, node: OkrNode): Promise<boolean> {
  if (SEES_ALL_ROLES.includes(actor.role)) return true
  const role = actor.role as UserRole
  if (node.type === 'OBJECTIVE') {
    return canEditObjective(role, actor.id, {
      level: node.level,
      ownerId: node.ownerId,
      departmentId: node.departmentId,
    })
  }
  return canEditKeyResultWithObjectiveContext(
    role,
    actor.id,
    { ownerId: node.ownerId, objectiveId: node.objectiveId },
    { level: node.level, ownerId: node.objectiveOwnerId, departmentId: node.departmentId },
  )
}

/**
 * Whether the actor sees the item without redaction — the `canViewObjective` /
 * `canViewKeyResult` rule (lib/permissions.ts), evaluated in memory through
 * lib/okr/visibility-scope.ts with only the one fact it needs loaded.
 */
async function seesNodeInFull(db: Db, actor: OkrLinkActor, node: OkrNode): Promise<boolean> {
  if (SEES_ALL_ROLES.includes(actor.role)) return true
  const owners = Array.from(new Set([node.ownerId, node.objectiveOwnerId])).filter((id) => id !== actor.id)
  const needsManagerFact = (node.isPrivate || node.objectiveIsPrivate) && owners.length > 0
  const directReportIds = needsManagerFact
    ? (
        await db.managerRelationship.findMany({
          where: { managerId: actor.id, directReportId: { in: owners }, endedAt: null },
          select: { directReportId: true },
        })
      ).map((r) => r.directReportId)
    : []
  const ctx = makeViewerContext({ id: actor.id, role: actor.role }, { directReportIds })
  const objectiveVerdict = canViewObjectiveInMemory(ctx, {
    ownerId: node.objectiveOwnerId,
    isPrivate: node.objectiveIsPrivate,
  })
  const verdict =
    node.type === 'OBJECTIVE'
      ? objectiveVerdict
      : canViewKeyResultInMemory(ctx, { ownerId: node.ownerId, isPrivate: node.isPrivate }, objectiveVerdict)
  return verdict.canView && !verdict.isRedacted
}

const LINKED: ActivityAction = 'LINKED'
const UNLINKED: ActivityAction = 'UNLINKED'

/**
 * AUD-1 / AUD-2: one `OKR_LINK` row per mutation, following the package metadata
 * convention (lib/package/audit.ts: metadata.entityId = link id, userId = FROM owner,
 * plus the link ends). The FROM item's objectiveId / keyResultId columns are filled
 * so the row also shows in that item's activity panel.
 */
async function logLinkActivity(
  tx: Db,
  action: ActivityAction,
  actor: OkrLinkActor,
  link: Pick<OkrLinkRecord, 'id' | 'kind' | 'subKind' | 'isPrimary' | 'fromType' | 'fromId' | 'toType' | 'toId'>,
  from: OkrNode | null,
  changes: ChangeMap | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await recordPackageActivity(
    {
      entityType: 'OKR_LINK',
      action,
      entityId: link.id,
      subjectUserId: from?.ownerId ?? null,
      timeframeId: from?.timeframeId ?? null,
      actorId: actor.id,
      changes,
      objectiveId: from?.objectiveId ?? null,
      keyResultId: from?.type === 'KEY_RESULT' ? from.id : null,
      metadata: {
        kind: link.kind,
        subKind: link.subKind,
        isPrimary: link.isPrimary,
        fromType: link.fromType,
        fromId: link.fromId,
        toType: link.toType,
        toId: link.toId,
        ...extra,
      },
    },
    { client: tx },
  )
}

async function writeLineage(tx: Db, node: Pick<OkrNode, 'type' | 'id'>, fields: LineageFields): Promise<void> {
  if (node.type === 'OBJECTIVE') {
    await tx.objective.update({ where: { id: node.id }, data: fields })
  } else {
    await tx.keyResult.update({ where: { id: node.id }, data: fields })
  }
}

function lineageChanges(before: LineageFields, after: LineageFields): ChangeMap | null {
  const changes: ChangeMap = {}
  for (const key of ['rolledFromId', 'lineageRootId', 'lineageDepth'] as const) {
    if (before[key] !== after[key]) changes[key] = { from: before[key], to: after[key] }
  }
  return Object.keys(changes).length ? changes : null
}

export interface CreateOkrLinkInput extends OkrLinkInput {
  /**
   * LNK-4: when an OBJECTIVE with no parent CONTRIBUTES_TO a KEY_RESULT, also set its
   * `parentObjectiveId` to that KR's objective (opt-in; the importer passes true).
   */
  setParent?: boolean
}

export interface CreateOkrLinkOptions {
  /** Skip the 423 guard on a locked FROM item (data scripts only). */
  ignoreLock?: boolean
  /** Skip the actor permission checks (data scripts only — never from a route). */
  skipPermission?: boolean
  db?: PrismaClient
}

export interface OkrLinkRecord {
  id: string
  fromType: string
  fromId: string
  toType: string
  toId: string
  kind: string
  subKind: string | null
  isPrimary: boolean
  note: string | null
  createdById: string | null
  createdAt: Date
}

const LINK_SELECT = {
  id: true,
  fromType: true,
  fromId: true,
  toType: true,
  toId: true,
  kind: true,
  subKind: true,
  isPrimary: true,
  note: true,
  createdById: true,
  createdAt: true,
} as const

/** Create an OkrLink (LNK-1 validation, LNK-2 lineage mirror, optional LNK-4 parent). */
export async function createOkrLink(
  actor: OkrLinkActor,
  input: CreateOkrLinkInput,
  opts: CreateOkrLinkOptions = {},
): Promise<OkrLinkRecord> {
  const db = opts.db ?? prisma
  const shape = validateOkrLinkShape(input)
  if (shape) throw new OkrLinkError(400, shape.code, shape.message)

  const [from, to] = await Promise.all([
    loadOkrNode(db, input.fromType, input.fromId),
    loadOkrNode(db, input.toType, input.toId),
  ])
  if (!from || from.status === 'DELETED') throw new OkrLinkError(404, 'NOT_FOUND', 'The item to link from was not found.')
  if (!to || to.status === 'DELETED') throw new OkrLinkError(404, 'NOT_FOUND', 'The item to link to was not found.')

  if (!opts.skipPermission) {
    if (!(await canEditOkrNode(actor, from))) {
      throw new OkrLinkError(403, 'FORBIDDEN', 'You do not have permission to change links on this item.')
    }
    if (!(await seesNodeInFull(db, actor, to))) {
      throw new OkrLinkError(403, 'FORBIDDEN', 'You cannot link to an item you do not have access to.')
    }
  }
  if (from.isLocked && !opts.ignoreLock) {
    throw new OkrLinkError(423, 'LOCKED', 'This item is closed and locked. Reopen it to change its links.')
  }

  const [reverse, existing] = await Promise.all([
    db.okrLink.findFirst({
      where: { fromType: to.type, fromId: to.id, toType: from.type, toId: from.id, kind: input.kind },
      select: { id: true },
    }),
    db.okrLink.findFirst({
      where: { fromType: from.type, fromId: from.id, toType: to.type, toId: to.id, kind: input.kind },
      select: { id: true },
    }),
  ])
  const violation = validateOkrLink(input, from, to, { reverseExists: !!reverse })
  if (violation) {
    throw new OkrLinkError(violation.code === 'REVERSE_EXISTS' ? 409 : 400, violation.code, violation.message)
  }
  if (existing) throw new OkrLinkError(409, 'DUPLICATE', 'These items are already linked.')

  const kind: OkrLinkKind = input.kind
  const isPrimary = kind === 'SUCCEEDS' && input.isPrimary === true
  const subKind: OkrLinkSubKind | null = kind === 'SUCCEEDS' ? input.subKind ?? null : null
  const note = input.note?.trim() ? input.note.trim() : null
  const setParent =
    input.setParent === true &&
    kind === 'CONTRIBUTES_TO' &&
    from.type === 'OBJECTIVE' &&
    to.type === 'KEY_RESULT' &&
    !from.parentObjectiveId &&
    !to.isLocked

  return db.$transaction(async (tx) => {
    let demotedToIds: string[] = []
    if (isPrimary) {
      const demoted = await tx.okrLink.findMany({
        where: { fromType: from.type, fromId: from.id, kind: 'SUCCEEDS', isPrimary: true },
        select: { id: true, toType: true, toId: true },
      })
      if (demoted.length) {
        await tx.okrLink.updateMany({
          where: { id: { in: demoted.map((d) => d.id) } },
          data: { isPrimary: false },
        })
        demotedToIds = demoted.filter((d) => d.toType === from.type).map((d) => d.toId)
      }
    }

    const link = await tx.okrLink.create({
      data: {
        fromType: from.type,
        fromId: from.id,
        toType: to.type,
        toId: to.id,
        kind,
        subKind,
        isPrimary,
        note,
        createdById: actor.id,
      },
      select: LINK_SELECT,
    })

    const beforeLineage: LineageFields = {
      rolledFromId: from.rolledFromId,
      lineageRootId: from.lineageRootId,
      lineageDepth: from.lineageDepth,
    }
    let afterLineage = beforeLineage
    if (shouldMirrorLineage(link)) {
      afterLineage = lineageFromPredecessor(to)
    } else if (from.rolledFromId && demotedToIds.includes(from.rolledFromId)) {
      // The previous primary was mirrored and is no longer primary.
      afterLineage = EMPTY_LINEAGE
    }
    const changes: ChangeMap = lineageChanges(beforeLineage, afterLineage) ?? {}
    if (lineageChanges(beforeLineage, afterLineage)) await writeLineage(tx, from, afterLineage)

    if (setParent) {
      await tx.objective.update({ where: { id: from.id }, data: { parentObjectiveId: to.objectiveId } })
      changes.parentObjectiveId = { from: null, to: to.objectiveId }
    }

    await logLinkActivity(tx, LINKED, actor, link, from, Object.keys(changes).length ? changes : null, {
      toTitle: to.title,
    })
    return link
  })
}

export interface DeleteOkrLinkOptions {
  ignoreLock?: boolean
  skipPermission?: boolean
  db?: PrismaClient
}

/** Delete an OkrLink; clears the LNK-2 mirror when it still points at the removed predecessor. */
export async function deleteOkrLink(
  actor: OkrLinkActor,
  linkId: string,
  opts: DeleteOkrLinkOptions = {},
): Promise<{ id: string }> {
  const db = opts.db ?? prisma
  const link = await db.okrLink.findUnique({ where: { id: linkId }, select: LINK_SELECT })
  if (!link) throw new OkrLinkError(404, 'NOT_FOUND', 'Link not found.')

  const fromType = link.fromType as OkrLinkEntityType
  const from = await loadOkrNode(db, fromType, link.fromId)

  if (!opts.skipPermission) {
    // An orphaned link (its FROM item is gone) can only be cleaned up by ADMIN / EXECUTIVE.
    const allowed = from ? await canEditOkrNode(actor, from) : SEES_ALL_ROLES.includes(actor.role)
    if (!allowed) throw new OkrLinkError(403, 'FORBIDDEN', 'You do not have permission to change links on this item.')
  }
  if (from?.isLocked && !opts.ignoreLock) {
    throw new OkrLinkError(423, 'LOCKED', 'This item is closed and locked. Reopen it to change its links.')
  }

  await db.$transaction(async (tx) => {
    await tx.okrLink.delete({ where: { id: link.id } })

    let changes: ChangeMap | null = null
    if (from && shouldMirrorLineage(link) && from.rolledFromId === link.toId) {
      const before: LineageFields = {
        rolledFromId: from.rolledFromId,
        lineageRootId: from.lineageRootId,
        lineageDepth: from.lineageDepth,
      }
      await writeLineage(tx, from, EMPTY_LINEAGE)
      changes = lineageChanges(before, EMPTY_LINEAGE)
    }

    await logLinkActivity(tx, UNLINKED, actor, link, from, changes)
  })
  return { id: link.id }
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export interface OkrLinkView {
  id: string
  kind: OkrLinkKind
  subKind: OkrLinkSubKind | null
  isPrimary: boolean
  note: string | null
  createdAt: string
  /** OUTGOING: the subject is FROM. INCOMING: the subject is TO. */
  direction: 'OUTGOING' | 'INCOMING'
  /** The other end, redacted per CON-8 when the viewer may not see it. */
  counterpart: ConnectionItem
  /** Viewer may delete this link (edit rights on its FROM item, and it is not locked). */
  canDelete: boolean
}

export interface OkrLinkList {
  links: OkrLinkView[]
  permissions: { canCreate: boolean }
}

/**
 * Every link that starts or ends at the subject, with each counterpart resolved
 * (and redacted) through `resolveOkrItems`. Returns null when the subject does not
 * exist, is deleted, or is outside the viewer's visibility (CON-8); notes are
 * withheld when the viewer sees the subject only redacted.
 */
export async function listLinksFor(
  actor: OkrLinkActor,
  type: OkrLinkEntityType,
  id: string,
  opts: { db?: PrismaClient; ctx?: ViewerContext } = {},
): Promise<OkrLinkList | null> {
  const db = opts.db ?? prisma
  const subject = await loadOkrNode(db, type, id)
  if (!subject || subject.status === 'DELETED') return null

  const ctx = opts.ctx ?? (await loadViewerContext({ id: actor.id, role: actor.role }))

  // The subject itself must be visible to the viewer (record scope + privacy), the
  // same check `getConnections` makes (CON-8): an item outside the viewer's scope
  // answers null (→ 404). A subject seen only redacted keeps its link list (the
  // counterparts are redacted on their own) but every note — written on the private
  // item — is withheld.
  const subjectInScope = (await objectiveIdsInScope(db, ctx, [subject.objectiveId])).has(subject.objectiveId)
  if (!subjectInScope) return null
  const objectiveVerdict = canViewObjectiveInMemory(ctx, {
    ownerId: subject.objectiveOwnerId,
    isPrivate: subject.objectiveIsPrivate,
  })
  const subjectVerdict =
    subject.type === 'OBJECTIVE'
      ? objectiveVerdict
      : canViewKeyResultInMemory(ctx, { ownerId: subject.ownerId, isPrivate: subject.isPrivate }, objectiveVerdict)
  if (!subjectVerdict.canView) return null
  const subjectRedacted = subjectVerdict.isRedacted

  const [outgoing, incoming] = await Promise.all([
    db.okrLink.findMany({ where: { fromType: type, fromId: id }, select: LINK_SELECT, orderBy: { createdAt: 'asc' } }),
    db.okrLink.findMany({ where: { toType: type, toId: id }, select: LINK_SELECT, orderBy: { createdAt: 'asc' } }),
  ])

  const refs: OkrRef[] = [
    ...outgoing.map((l) => linkRef(l, l.toType, l.toId)),
    ...incoming.map((l) => linkRef(l, l.fromType, l.fromId)),
  ]
  const items = await resolveOkrItems(db, ctx, refs)
  const byLink = new Map(items.map((item) => [item.linkId, item]))

  const canCreate = (await canEditOkrNode(actor, subject)) && !subject.isLocked
  const editMemo = new Map<string, Promise<boolean>>()
  const canEditFrom = (fromType: string, fromId: string): Promise<boolean> => {
    const key = `${fromType}:${fromId}`
    let p = editMemo.get(key)
    if (!p) {
      p = loadOkrNode(db, fromType as OkrLinkEntityType, fromId).then((node) =>
        node ? canEditOkrNode(actor, node).then((ok) => ok && !node.isLocked) : SEES_ALL_ROLES.includes(actor.role),
      )
      editMemo.set(key, p)
    }
    return p
  }

  const views: OkrLinkView[] = []
  for (const [direction, rows] of [
    ['OUTGOING', outgoing],
    ['INCOMING', incoming],
  ] as const) {
    for (const l of rows) {
      const counterpart = byLink.get(l.id)
      if (!counterpart) continue // other end deleted
      views.push({
        id: l.id,
        kind: l.kind as OkrLinkKind,
        subKind: (l.subKind as OkrLinkSubKind | null) ?? null,
        isPrimary: l.isPrimary,
        note: subjectRedacted || counterpart.redacted ? null : l.note,
        createdAt: l.createdAt.toISOString(),
        direction,
        counterpart,
        canDelete: direction === 'OUTGOING' ? canCreate : await canEditFrom(l.fromType, l.fromId),
      })
    }
  }
  return { links: views, permissions: { canCreate } }
}

/** Reference to the other end of a link, carrying the link fields for the UI. */
export function linkRef(
  link: { id: string; kind: string; subKind: string | null; isPrimary: boolean },
  type: string,
  id: string,
): OkrRef {
  const kind: OkrLinkKind = link.kind === 'SUCCEEDS' ? 'SUCCEEDS' : 'CONTRIBUTES_TO'
  return {
    type: type === 'KEY_RESULT' ? 'KEY_RESULT' : 'OBJECTIVE',
    id,
    via: kind,
    linkId: link.id,
    linkKind: kind,
    subKind: (link.subKind as OkrLinkSubKind | null) ?? null,
    isPrimary: link.isPrimary,
  }
}
