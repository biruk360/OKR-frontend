/**
 * Batched OKR visibility — the list/aggregate counterpart of the per-object rules
 * `canViewObjective` / `canViewKeyResult` in lib/permissions.ts.
 *
 * Why: the per-object rules cost 1–2 queries per row (manager lookup, department
 * lookup) and were called in loops (objectives list, alignment picker — up to 160
 * sequential queries — and the org user/team pages). This module loads the facts
 * the rules depend on ONCE per request (`loadViewerContext`) and then evaluates
 * the same verdicts in memory, or as a Prisma `where`.
 *
 * Semantics (mirrors lib/permissions.ts exactly — keep the two in step; the table
 * test in visibility-scope.test.ts compares them on fixtures):
 *
 *   Objective (`canViewObjective`)
 *     - every signed-in role may VIEW every objective (canView is always true);
 *     - an objective is shown REDACTED (title/description hidden, progress/owner
 *       kept — `redactObjective`) when it is private and the viewer is not
 *       ADMIN/EXECUTIVE, not its owner and not the owner's current manager
 *       (ManagerRelationship with endedAt = null). Department membership and
 *       level do not change the outcome: every branch of canViewObjective
 *       returns `isRedacted = isPrivate` once the three exemptions are passed.
 *       Objective contributors are NOT an exemption in canViewObjective.
 *   Key result (`canViewKeyResult`)
 *     - viewable iff its objective is viewable;
 *     - full for ADMIN/EXECUTIVE, the KR owner and the KR owner's manager —
 *       even under a redacted objective;
 *     - otherwise redacted when the objective is redacted or the KR is private.
 *
 * On top of the per-object verdict, list surfaces also exclude DELETED objectives
 * and apply the admin-configured `objective` record-scope rules
 * (`buildScopeFilter`, lib/apply-scope.ts), which is what the objectives list
 * route already did. The in-memory verdicts do not evaluate record scope — rows
 * are expected to come from a query that used `buildObjectiveVisibilityWhere`.
 */
import type { Prisma } from '@prisma/client'
import { redactKeyResult, redactObjective } from '@/lib/permissions'

/** Roles that always see every objective and key result in full. */
export const SEES_ALL_ROLES: readonly string[] = ['ADMIN', 'EXECUTIVE']

export interface Viewer {
  id: string
  role: string
}

/** Everything the visibility verdict needs, loaded once per request. */
export interface ViewerContext {
  userId: string
  role: string
  /** ADMIN / EXECUTIVE — full access, no redaction. */
  seesAll: boolean
  /** Users the viewer currently manages (ManagerRelationship.endedAt = null). Empty for seesAll roles. */
  directReportIds: ReadonlySet<string>
  /** Departments the viewer currently belongs to (membership.endedAt = null). */
  departmentIds: ReadonlySet<string>
  /** The viewer's `objective` record-scope fragment, or null when no rule applies. */
  objectiveScope: Prisma.ObjectiveWhereInput | null
}

export interface ViewerContextLoaders {
  directReportIds: (userId: string) => Promise<string[]>
  departmentIds: (userId: string) => Promise<string[]>
  objectiveScope: (userId: string) => Promise<Record<string, unknown> | null>
}

const defaultLoaders: ViewerContextLoaders = {
  async directReportIds(userId) {
    const { prisma } = await import('@/lib/prisma')
    const rows = await prisma.managerRelationship.findMany({
      where: { managerId: userId, endedAt: null },
      select: { directReportId: true },
    })
    return rows.map((r) => r.directReportId)
  },
  async departmentIds(userId) {
    const { prisma } = await import('@/lib/prisma')
    const rows = await prisma.departmentMembership.findMany({
      where: { userId, endedAt: null },
      select: { departmentId: true },
    })
    return rows.map((r) => r.departmentId)
  },
  async objectiveScope(userId) {
    const { buildScopeFilter } = await import('@/lib/apply-scope')
    return buildScopeFilter(userId, 'objective')
  },
}

/** Build a context from already-known facts (pure; used by tests and callers that have the facts). */
export function makeViewerContext(
  viewer: Viewer,
  facts: {
    directReportIds?: Iterable<string>
    departmentIds?: Iterable<string>
    objectiveScope?: Record<string, unknown> | null
  } = {},
): ViewerContext {
  const seesAll = SEES_ALL_ROLES.includes(viewer.role)
  return {
    userId: viewer.id,
    role: viewer.role,
    seesAll,
    directReportIds: new Set(seesAll ? [] : facts.directReportIds ?? []),
    departmentIds: new Set(facts.departmentIds ?? []),
    objectiveScope: (facts.objectiveScope ?? null) as Prisma.ObjectiveWhereInput | null,
  }
}

/**
 * Loads the viewer's direct reports, departments and objective record scope in
 * parallel — three queries per request instead of 1–2 per row.
 */
export async function loadViewerContext(
  viewer: Viewer,
  loaders: ViewerContextLoaders = defaultLoaders,
): Promise<ViewerContext> {
  const seesAll = SEES_ALL_ROLES.includes(viewer.role)
  const [directReportIds, departmentIds, objectiveScope] = await Promise.all([
    seesAll ? Promise.resolve([] as string[]) : loaders.directReportIds(viewer.id),
    loaders.departmentIds(viewer.id),
    loaders.objectiveScope(viewer.id),
  ])
  return makeViewerContext(viewer, { directReportIds, departmentIds, objectiveScope })
}

// ---------------------------------------------------------------------------
// Pure verdicts
// ---------------------------------------------------------------------------

export interface ObjectiveVisibilityFields {
  ownerId: string
  isPrivate?: boolean | null
  level?: string
  departmentId?: string | null
}

export interface KeyResultVisibilityFields {
  ownerId: string
  isPrivate?: boolean | null
}

export interface VisibilityVerdict {
  canView: boolean
  isRedacted: boolean
}

/** Viewer is exempt from redaction for rows owned by `ownerId`. */
function hasFullAccessToOwner(ctx: ViewerContext, ownerId: string): boolean {
  return ctx.seesAll || ownerId === ctx.userId || ctx.directReportIds.has(ownerId)
}

/** In-memory `canViewObjective` for an already-loaded row. */
export function canViewObjectiveInMemory(
  ctx: ViewerContext,
  objective: ObjectiveVisibilityFields,
): VisibilityVerdict {
  if (hasFullAccessToOwner(ctx, objective.ownerId)) return { canView: true, isRedacted: false }
  return { canView: true, isRedacted: Boolean(objective.isPrivate) }
}

/** In-memory `canViewKeyResult`, given the parent objective's verdict. */
export function canViewKeyResultInMemory(
  ctx: ViewerContext,
  keyResult: KeyResultVisibilityFields,
  objectiveVerdict: VisibilityVerdict,
): VisibilityVerdict {
  if (!objectiveVerdict.canView) return { canView: false, isRedacted: false }
  if (hasFullAccessToOwner(ctx, keyResult.ownerId)) return { canView: true, isRedacted: false }
  if (objectiveVerdict.isRedacted) return { canView: true, isRedacted: true }
  return { canView: true, isRedacted: Boolean(keyResult.isPrivate) }
}

// ---------------------------------------------------------------------------
// Prisma where builders
// ---------------------------------------------------------------------------

/** Rows the viewer may see without redaction (owner / managed owner / public). */
function unredactedOwnerOr(ctx: ViewerContext): Array<{ ownerId: string | { in: string[] } }> {
  const or: Array<{ ownerId: string | { in: string[] } }> = [{ ownerId: ctx.userId }]
  if (ctx.directReportIds.size > 0) or.push({ ownerId: { in: Array.from(ctx.directReportIds) } })
  return or
}

export interface ObjectiveVisibilityWhereOptions {
  /**
   * `true` (default): every objective the viewer may see, including ones they see
   * redacted — callers must redact them (`redactObjectiveForViewer`).
   * `false`: only objectives the viewer sees in full. Use for free-text search on
   * titles and for feeds whose payload (activity diffs, comments) cannot be redacted.
   */
  includeRedacted?: boolean
}

/**
 * Prisma `where` equivalent to `canViewObjective(...).canView` for a list, plus
 * `status != DELETED` and the viewer's objective record scope. AND it with the
 * surface's own filters (`{ AND: [visibilityWhere, surfaceWhere] }`).
 */
export function buildObjectiveVisibilityWhere(
  ctx: ViewerContext,
  opts: ObjectiveVisibilityWhereOptions = {},
): Prisma.ObjectiveWhereInput {
  const and: Prisma.ObjectiveWhereInput[] = [{ status: { not: 'DELETED' } }]
  if (opts.includeRedacted === false && !ctx.seesAll) {
    and.push({ OR: [{ isPrivate: false }, ...unredactedOwnerOr(ctx)] })
  }
  if (ctx.objectiveScope) and.push(ctx.objectiveScope)
  return and.length === 1 ? and[0] : { AND: and }
}

/**
 * Prisma `where` for key results: the parent objective passes
 * `buildObjectiveVisibilityWhere`, and with `includeRedacted: false` the KR itself
 * is one the viewer sees in full (mirrors `canViewKeyResult`).
 */
export function buildKeyResultVisibilityWhere(
  ctx: ViewerContext,
  opts: ObjectiveVisibilityWhereOptions = {},
): Prisma.KeyResultWhereInput {
  const objectiveWhere = buildObjectiveVisibilityWhere(ctx, { includeRedacted: true })
  const and: Prisma.KeyResultWhereInput[] = [{ objective: objectiveWhere }]
  if (opts.includeRedacted === false && !ctx.seesAll) {
    and.push({
      OR: [
        ...unredactedOwnerOr(ctx),
        {
          isPrivate: false,
          objective: buildObjectiveVisibilityWhere(ctx, { includeRedacted: false }),
        },
      ],
    })
  }
  return and.length === 1 ? and[0] : { AND: and }
}

// ---------------------------------------------------------------------------
// Redaction helpers for already-loaded rows
// ---------------------------------------------------------------------------

/** Returns the row, or its `redactObjective` form when the viewer sees it redacted. */
export function redactObjectiveForViewer<T extends ObjectiveVisibilityFields>(
  ctx: ViewerContext,
  objective: T,
): T & { isRedacted?: boolean } {
  const verdict = canViewObjectiveInMemory(ctx, objective)
  return verdict.isRedacted ? { ...redactObjective(objective), isRedacted: true } : objective
}

/** Returns the KR, or its `redactKeyResult` form, given the parent objective's fields. */
export function redactKeyResultForViewer<T extends KeyResultVisibilityFields>(
  ctx: ViewerContext,
  keyResult: T,
  objective: ObjectiveVisibilityFields,
): T & { isRedacted?: boolean } {
  const verdict = canViewKeyResultInMemory(ctx, keyResult, canViewObjectiveInMemory(ctx, objective))
  return verdict.isRedacted ? { ...redactKeyResult(keyResult), isRedacted: true } : keyResult
}

/** Placeholder titles, identical to `redactObjective` / `redactKeyResult`. */
export const REDACTED_OBJECTIVE_TITLE = '[Private Objective]'
export const REDACTED_KEY_RESULT_TITLE = '[Private Key Result]'
