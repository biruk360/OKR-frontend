/**
 * Employee Operating Package — access matrix (spec §8, decision D9).
 *
 * The single place package routes, profile loaders and summaries ask "may this
 * viewer see / change this person's <area>?". Modelled on
 * features/scrum/services/access.ts (relationship facts → pure verdicts) and
 * lib/okr/visibility-scope.ts (facts loaded ONCE per request, verdicts evaluated
 * in memory). The scope engine (lib/apply-scope.ts) has no direct-report
 * operator, so the relationships are resolved here.
 *
 * Relationships of the viewer to the subject person (any number may hold):
 *   - self                 viewer === subject
 *   - org-wide             viewer role ADMIN or EXECUTIVE
 *   - HR                   feature `package.hr` (lib/permission-resolver)
 *   - manager chain        viewer is the subject's manager, or their manager's
 *                          manager … (ManagerRelationship, endedAt = null)
 *   - department lead      subject belongs to a department the viewer leads
 *                          (membership role HEAD, or a DEPARTMENT_LEAD member),
 *                          including that department's descendant departments
 *   - peer                 viewer and subject share an active department
 *
 * View matrix (rows: relationship, columns: area):
 *
 *   | relationship   | okr | role/duties/kpis/deps/decisions | development/package | kpis_sensitive | weights |
 *   |----------------|-----|---------------------------------|---------------------|----------------|---------|
 *   | self           |  ✓  |               ✓                 |          ✓          |       ✓        |    ✓    |
 *   | ADMIN/EXEC     |  ✓  |               ✓                 |          ✓          |       ✓        |    ✓    |
 *   | HR             |  ✓  |               ✓                 |          ✓          |       ✓        |    ✓    |
 *   | manager chain  |  ✓  |               ✓                 |          ✓          |       ✓        |    ✓    |
 *   | dept lead      |  ✓  |               ✓                 |          ✓          |   feature¹     |    —    |
 *   | peer           |  ✓  |               ✓                 |          —          |   feature¹     |    —    |
 *   | anyone else    |  ✓² |               —³                |          —          |   feature¹     |    —    |
 *
 *   ¹ `package.kpi.sensitive.read` (Finance / Executive / Admin) — KPI-7.
 *   ² OKRs are readable by every signed-in user, exactly like canViewObjective
 *     (lib/permissions.ts): private items are still redacted per item through
 *     lib/okr/visibility-scope.ts. Hiding the tab would not hide the data (the
 *     Explorer shows the same rows with `?owner=`).
 *   ³ Record-level: anyone sees dependencies / decisions they are a party to,
 *     plus the company Dependency Map (titles + status) — see
 *     resolveDependencyAccess / resolveDecisionAccess.
 *
 * Edit matrix:
 *   - self: own OKRs (existing OKR rules still apply), duties, development
 *     items, KPI readings (canEnterKpiReading), item reviews
 *     (canReviewPackageItems). NOT their own role definition, KPI definitions,
 *     package lifecycle/weights or approvals — even when they also hold HR.
 *   - ADMIN/EXEC: everything (approval of their own package/role excepted).
 *   - manager chain: everything for the report; approves package + role.
 *   - HR: role definitions, development, package lifecycle + weights.
 *   - department lead: members' OKRs, duties, KPIs (non-sensitive),
 *     development, dependencies, decisions.
 *   - peers / anyone else: nothing (record-level: providers may mark their own
 *     dependencies DONE; deciders record decisions — DEC-4).
 */
import type { Session } from 'next-auth'
import { PACKAGE_AREAS, PACKAGE_FEATURE_KEYS, type PackageArea } from '@/types/package'

export type { PackageArea } from '@/types/package'
export { PACKAGE_AREAS } from '@/types/package'

/** Roles that see and change every package in full. */
export const PACKAGE_ORG_WIDE_ROLES: readonly string[] = ['ADMIN', 'EXECUTIVE']

/** Safety bound for manager-chain / department-tree walks (pathological data). */
const MAX_CHAIN_DEPTH = 12
const MAX_DEPARTMENT_DEPTH = 6

export function isPackageOrgWideRole(role?: string | null): boolean {
  return !!role && PACKAGE_ORG_WIDE_ROLES.includes(role)
}

// ---------------------------------------------------------------------------
// Viewer facts
// ---------------------------------------------------------------------------

export interface PackageViewer {
  userId: string
  role: string
  /** ADMIN / EXECUTIVE. */
  seesAll: boolean
  /** Holds `package.hr`. */
  isHr: boolean
  /** Holds `package.kpi.sensitive.read`. */
  canReadSensitiveKpis: boolean
  /** Users the viewer directly manages (active ManagerRelationship). */
  directReportIds: ReadonlySet<string>
  /** Everyone below the viewer in the manager tree (transitive, excludes self). */
  managedUserIds: ReadonlySet<string>
  /** Departments the viewer is an active member of. */
  departmentIds: ReadonlySet<string>
  /** Departments the viewer leads, plus every descendant department. */
  leadDepartmentIds: ReadonlySet<string>
  /** Per-request cache: subject userId → their active department ids. */
  subjectDepartments: Map<string, ReadonlySet<string>>
}

export interface ManagerEdge {
  managerId: string
  directReportId: string
}

export interface MembershipRow {
  userId: string
  departmentId: string
  /** HEAD | MEMBER | SECONDARY_MEMBER */
  role?: string | null
  /** The user's primary department (one active row per user). */
  isPrimary?: boolean | null
}

export interface DepartmentRow {
  id: string
  parentId: string | null
}

/** Data access used by the loaders — injectable for tests. */
export interface PackageAccessLoaders {
  userRole(userId: string): Promise<string | null>
  feature(userId: string, featureKey: string): Promise<boolean>
  /** Active edges whose managerId is in `managerIds`. */
  reportsOf(managerIds: string[]): Promise<ManagerEdge[]>
  /** Active edges whose directReportId is in `userIds`. */
  managersOf(userIds: string[]): Promise<ManagerEdge[]>
  /** Active memberships of the given users. */
  memberships(userIds: string[]): Promise<MembershipRow[]>
  /** Departments whose parentId is in `parentIds`. */
  childDepartments(parentIds: string[]): Promise<DepartmentRow[]>
}

const prismaLoaders: PackageAccessLoaders = {
  async userRole(userId) {
    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    return user?.role ?? null
  },
  async feature(userId, featureKey) {
    // Fail CLOSED (unlike lib/rbac canFeature): these keys widen access to
    // other people's data, so a lookup we could not complete is not a grant.
    try {
      const { resolveFeaturePermission } = await import('@/lib/permission-resolver')
      return await resolveFeaturePermission(userId, featureKey)
    } catch (error) {
      console.error('[package/access] feature lookup failed; denying', {
        featureKey,
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  },
  async reportsOf(managerIds) {
    if (managerIds.length === 0) return []
    const { prisma } = await import('@/lib/prisma')
    return prisma.managerRelationship.findMany({
      where: { managerId: { in: managerIds }, endedAt: null },
      select: { managerId: true, directReportId: true },
    })
  },
  async managersOf(userIds) {
    if (userIds.length === 0) return []
    const { prisma } = await import('@/lib/prisma')
    return prisma.managerRelationship.findMany({
      where: { directReportId: { in: userIds }, endedAt: null },
      select: { managerId: true, directReportId: true },
    })
  },
  async memberships(userIds) {
    if (userIds.length === 0) return []
    const { prisma } = await import('@/lib/prisma')
    return prisma.departmentMembership.findMany({
      where: { userId: { in: userIds }, endedAt: null },
      select: { userId: true, departmentId: true, role: true, isPrimary: true },
    })
  },
  async childDepartments(parentIds) {
    if (parentIds.length === 0) return []
    const { prisma } = await import('@/lib/prisma')
    return prisma.department.findMany({
      where: { parentId: { in: parentIds } },
      select: { id: true, parentId: true },
    })
  },
}

export type PackageViewerInput = Session | string | { id: string; role?: string | null }

function viewerIdentity(input: PackageViewerInput): { id: string; role: string | null } {
  if (typeof input === 'string') return { id: input, role: null }
  if ('user' in input && input.user) return { id: input.user.id, role: input.user.role ?? null }
  const plain = input as { id: string; role?: string | null }
  return { id: plain.id, role: plain.role ?? null }
}

/**
 * Load every fact the §8 matrix needs about the viewer, once per request.
 * Accepts a next-auth Session, a userId (role looked up), or `{ id, role }`.
 */
export async function loadPackageViewer(
  input: PackageViewerInput,
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<PackageViewer> {
  const identity = viewerIdentity(input)
  const role = identity.role ?? (await loaders.userRole(identity.id)) ?? 'EMPLOYEE'
  const seesAll = isPackageOrgWideRole(role)

  const [isHr, canReadSensitiveKpis, managedTree, memberships] = await Promise.all([
    seesAll ? Promise.resolve(true) : loaders.feature(identity.id, PACKAGE_FEATURE_KEYS.hr),
    seesAll ? Promise.resolve(true) : loaders.feature(identity.id, PACKAGE_FEATURE_KEYS.kpiSensitiveRead),
    loadManagedTree(identity.id, loaders),
    loaders.memberships([identity.id]),
  ])

  const departmentIds = new Set(memberships.map((m) => m.departmentId))
  // §8: lead rights only for the department the person leads — HEAD rows, or (for a
  // DEPARTMENT_LEAD without a HEAD row) their primary, non-secondary membership.
  const ledRoots = memberships
    .filter(
      (m) =>
        m.role === 'HEAD' ||
        (role === 'DEPARTMENT_LEAD' && m.role !== 'SECONDARY_MEMBER' && m.isPrimary === true),
    )
    .map((m) => m.departmentId)
  const leadDepartmentIds = await loadDepartmentSubtree(ledRoots, loaders)

  return makePackageViewer(
    { id: identity.id, role },
    {
      isHr,
      canReadSensitiveKpis,
      directReportIds: managedTree.direct,
      managedUserIds: managedTree.all,
      departmentIds,
      leadDepartmentIds,
    },
  )
}

/** Build a viewer from already-known facts (pure; tests and callers that have the facts). */
export function makePackageViewer(
  viewer: { id: string; role: string },
  facts: {
    isHr?: boolean
    canReadSensitiveKpis?: boolean
    directReportIds?: Iterable<string>
    managedUserIds?: Iterable<string>
    departmentIds?: Iterable<string>
    leadDepartmentIds?: Iterable<string>
    subjectDepartments?: Record<string, Iterable<string>>
  } = {},
): PackageViewer {
  const seesAll = isPackageOrgWideRole(viewer.role)
  const direct = new Set(facts.directReportIds ?? [])
  const managed = new Set([...(facts.managedUserIds ?? []), ...direct])
  managed.delete(viewer.id)
  direct.delete(viewer.id)
  const subjectDepartments = new Map<string, ReadonlySet<string>>()
  for (const [userId, ids] of Object.entries(facts.subjectDepartments ?? {})) {
    subjectDepartments.set(userId, new Set(ids))
  }
  return {
    userId: viewer.id,
    role: viewer.role,
    seesAll,
    isHr: seesAll || !!facts.isHr,
    canReadSensitiveKpis: seesAll || !!facts.canReadSensitiveKpis,
    directReportIds: direct,
    managedUserIds: managed,
    departmentIds: new Set(facts.departmentIds ?? []),
    leadDepartmentIds: new Set(facts.leadDepartmentIds ?? []),
    subjectDepartments,
  }
}

async function loadManagedTree(
  managerId: string,
  loaders: PackageAccessLoaders,
): Promise<{ direct: Set<string>; all: Set<string> }> {
  const direct = new Set<string>()
  const all = new Set<string>()
  let frontier = [managerId]
  for (let depth = 0; depth < MAX_CHAIN_DEPTH && frontier.length > 0; depth++) {
    const edges = await loaders.reportsOf(frontier)
    const next: string[] = []
    for (const edge of edges) {
      if (edge.directReportId === managerId || all.has(edge.directReportId)) continue
      if (depth === 0) direct.add(edge.directReportId)
      all.add(edge.directReportId)
      next.push(edge.directReportId)
    }
    frontier = next
  }
  return { direct, all }
}

async function loadDepartmentSubtree(roots: string[], loaders: PackageAccessLoaders): Promise<Set<string>> {
  const seen = new Set<string>(roots)
  let frontier = [...seen]
  for (let depth = 0; depth < MAX_DEPARTMENT_DEPTH && frontier.length > 0; depth++) {
    const children = await loaders.childDepartments(frontier)
    frontier = []
    for (const child of children) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      frontier.push(child.id)
    }
  }
  return seen
}

/**
 * Load (and cache on the viewer) the active departments of the given subjects
 * in one query. Call before checking many subjects (lists, maps).
 */
export async function primePackageSubjects(
  viewer: PackageViewer,
  subjectUserIds: Iterable<string>,
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<void> {
  const missing = Array.from(new Set(subjectUserIds)).filter((id) => id && !viewer.subjectDepartments.has(id))
  if (missing.length === 0) return
  const rows = await loaders.memberships(missing)
  const byUser = new Map<string, Set<string>>()
  for (const id of missing) byUser.set(id, new Set())
  for (const row of rows) byUser.get(row.userId)?.add(row.departmentId)
  byUser.forEach((ids, userId) => viewer.subjectDepartments.set(userId, ids))
}

// ---------------------------------------------------------------------------
// Relationship facts (pure)
// ---------------------------------------------------------------------------

/** Everything a verdict needs about one viewer → subject pair. */
export interface PackageAccessFacts {
  isSelf: boolean
  seesAll: boolean
  isHr: boolean
  canReadSensitiveKpis: boolean
  /** Direct manager or anyone above them. */
  isManagerChain: boolean
  isDirectManager: boolean
  /** Subject is in a department (or descendant) the viewer leads. */
  inLeadSubtree: boolean
  /** Viewer and subject share an active department. */
  sharesDepartment: boolean
}

/** Derive the pair facts from a loaded viewer and the subject's departments. */
export function resolvePackageAccessFacts(
  viewer: PackageViewer,
  subjectUserId: string,
  subjectDepartmentIds: Iterable<string> = viewer.subjectDepartments.get(subjectUserId) ?? [],
): PackageAccessFacts {
  const isSelf = viewer.userId === subjectUserId
  let inLeadSubtree = false
  let sharesDepartment = false
  if (!isSelf) {
    for (const departmentId of subjectDepartmentIds) {
      if (viewer.leadDepartmentIds.has(departmentId)) inLeadSubtree = true
      if (viewer.departmentIds.has(departmentId)) sharesDepartment = true
    }
  }
  return {
    isSelf,
    seesAll: viewer.seesAll,
    isHr: viewer.isHr,
    canReadSensitiveKpis: viewer.canReadSensitiveKpis,
    isManagerChain: !isSelf && viewer.managedUserIds.has(subjectUserId),
    isDirectManager: !isSelf && viewer.directReportIds.has(subjectUserId),
    inLeadSubtree,
    sharesDepartment,
  }
}

// ---------------------------------------------------------------------------
// Verdicts (pure)
// ---------------------------------------------------------------------------

/** §8 view verdict for one area. */
export function canViewPackageAreaResolved(f: PackageAccessFacts, area: PackageArea): boolean {
  if (f.isSelf || f.seesAll) return true
  const related = f.isHr || f.isManagerChain
  switch (area) {
    case 'okr':
      // Footnote ² above — per-item redaction still applies.
      return true
    case 'role':
    case 'duties':
    case 'kpis':
    case 'dependencies':
    case 'decisions':
      return related || f.inLeadSubtree || f.sharesDepartment
    case 'development':
    case 'package':
      return related || f.inLeadSubtree
    case 'kpis_sensitive':
      return related || f.canReadSensitiveKpis
    case 'weights':
      return related
    default:
      return false
  }
}

/** §8 edit verdict for one area (create / update / delete the area's records). */
export function canEditPackageAreaResolved(f: PackageAccessFacts, area: PackageArea): boolean {
  if (f.seesAll) return true
  if (f.isSelf) {
    // Self rules win over HR / lead: nobody edits their own role definition,
    // KPI definitions, package lifecycle or weights.
    return area === 'okr' || area === 'duties' || area === 'development'
  }
  if (f.isManagerChain) return true
  switch (area) {
    case 'role':
    case 'package':
    case 'weights':
      return f.isHr
    case 'development':
      return f.isHr || f.inLeadSubtree
    case 'okr':
    case 'duties':
    case 'kpis':
    case 'dependencies':
    case 'decisions':
      return f.inLeadSubtree
    case 'kpis_sensitive':
    default:
      return false
  }
}

/** KPI-1/KPI-7: may the viewer enter or edit a reading on the subject's KPI? */
export function canEnterKpiReadingResolved(f: PackageAccessFacts, opts: { isSensitive?: boolean } = {}): boolean {
  if (f.isSelf || f.seesAll || f.isManagerChain) return true
  if (opts.isSensitive) return false
  return f.inLeadSubtree
}

/** PKG-1 / ROL-1: approve the subject's package or role definition. Never one's own. */
export function canApprovePackageResolved(f: PackageAccessFacts): boolean {
  if (f.isSelf) return false
  return f.seesAll || f.isManagerChain
}

/** PKG-1: create the header, send for review, archive. Manager chain, HR, ADMIN/EXEC — not self. */
export function canManagePackageLifecycleResolved(f: PackageAccessFacts): boolean {
  if (f.isSelf) return false
  return f.seesAll || f.isManagerChain || f.isHr
}

/** PKG-2: the employee marks items Agree / Dispute on their own package. */
export function canReviewPackageItemsResolved(f: PackageAccessFacts): boolean {
  return f.isSelf
}

/** PKG-2: resolve a dispute — whoever may approve the package, plus HR. */
export function canResolvePackageDisputesResolved(f: PackageAccessFacts): boolean {
  if (f.isSelf) return false
  return f.seesAll || f.isManagerChain || f.isHr
}

export interface PackageAreaAccess {
  facts: PackageAccessFacts
  view: Record<PackageArea, boolean>
  edit: Record<PackageArea, boolean>
  canEnterKpiReadings: boolean
  canEnterSensitiveKpiReadings: boolean
  canApprove: boolean
  canManageLifecycle: boolean
  canReviewItems: boolean
  canResolveDisputes: boolean
}

/** Every verdict for one pair — handy for `permissions` objects in list APIs and profile tabs. */
export function resolvePackageAreaAccess(f: PackageAccessFacts): PackageAreaAccess {
  const view = {} as Record<PackageArea, boolean>
  const edit = {} as Record<PackageArea, boolean>
  for (const area of PACKAGE_AREAS) {
    view[area] = canViewPackageAreaResolved(f, area)
    edit[area] = canEditPackageAreaResolved(f, area)
  }
  return {
    facts: f,
    view,
    edit,
    canEnterKpiReadings: canEnterKpiReadingResolved(f),
    canEnterSensitiveKpiReadings: canEnterKpiReadingResolved(f, { isSensitive: true }),
    canApprove: canApprovePackageResolved(f),
    canManageLifecycle: canManagePackageLifecycleResolved(f),
    canReviewItems: canReviewPackageItemsResolved(f),
    canResolveDisputes: canResolvePackageDisputesResolved(f),
  }
}

// ---------------------------------------------------------------------------
// Async wrappers (load the subject's departments on demand, cached on viewer)
// ---------------------------------------------------------------------------

async function factsFor(
  viewer: PackageViewer,
  subjectUserId: string,
  loaders: PackageAccessLoaders,
): Promise<PackageAccessFacts> {
  if (viewer.userId !== subjectUserId && !viewer.subjectDepartments.has(subjectUserId)) {
    await primePackageSubjects(viewer, [subjectUserId], loaders)
  }
  return resolvePackageAccessFacts(viewer, subjectUserId)
}

export async function getPackageAccessFacts(
  viewer: PackageViewer,
  subjectUserId: string,
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<PackageAccessFacts> {
  return factsFor(viewer, subjectUserId, loaders)
}

export async function canViewPackageArea(
  viewer: PackageViewer,
  subjectUserId: string,
  area: PackageArea,
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<boolean> {
  if (viewer.seesAll || viewer.userId === subjectUserId || area === 'okr') return true
  return canViewPackageAreaResolved(await factsFor(viewer, subjectUserId, loaders), area)
}

export async function canEditPackageArea(
  viewer: PackageViewer,
  subjectUserId: string,
  area: PackageArea,
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<boolean> {
  if (viewer.seesAll) return true
  return canEditPackageAreaResolved(await factsFor(viewer, subjectUserId, loaders), area)
}

export async function getPackageAreaAccess(
  viewer: PackageViewer,
  subjectUserId: string,
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<PackageAreaAccess> {
  return resolvePackageAreaAccess(await factsFor(viewer, subjectUserId, loaders))
}

export async function canEnterKpiReading(
  viewer: PackageViewer,
  subjectUserId: string,
  opts: { isSensitive?: boolean } = {},
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<boolean> {
  return canEnterKpiReadingResolved(await factsFor(viewer, subjectUserId, loaders), opts)
}

export async function canApprovePackage(
  viewer: PackageViewer,
  subjectUserId: string,
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<boolean> {
  return canApprovePackageResolved(await factsFor(viewer, subjectUserId, loaders))
}

/** ROL-1: same rule as package approval (manager chain / ADMIN / EXEC, never self). */
export const canApproveRoleDefinition = canApprovePackage

export async function canManagePackageLifecycle(
  viewer: PackageViewer,
  subjectUserId: string,
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<boolean> {
  return canManagePackageLifecycleResolved(await factsFor(viewer, subjectUserId, loaders))
}

export async function canReviewPackageItems(viewer: PackageViewer, subjectUserId: string): Promise<boolean> {
  return viewer.userId === subjectUserId
}

/**
 * Subset of `subjectUserIds` whose `area` the viewer may see — one membership
 * query for the whole list.
 */
export async function filterSubjectsByArea(
  viewer: PackageViewer,
  subjectUserIds: Iterable<string>,
  area: PackageArea,
  mode: 'view' | 'edit' = 'view',
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<Set<string>> {
  const ids = Array.from(new Set(subjectUserIds)).filter(Boolean)
  await primePackageSubjects(viewer, ids, loaders)
  const verdict = mode === 'view' ? canViewPackageAreaResolved : canEditPackageAreaResolved
  return new Set(ids.filter((id) => verdict(resolvePackageAccessFacts(viewer, id), area)))
}

// ---------------------------------------------------------------------------
// Record-level access: dependencies and decisions (§8 "Any employee" row)
// ---------------------------------------------------------------------------

export interface DependencyAccessInput {
  viewerId: string
  seesAll: boolean
  isHr: boolean
  providerIds: readonly string[]
  neederIds: readonly string[]
  createdById?: string | null
  /** Per party: may the viewer view / edit that person's 'dependencies' area? */
  partyAccess: Readonly<Record<string, { view: boolean; edit: boolean }>>
}

export interface DependencyAccess {
  /** Title + status — the company Dependency Map shows these to every signed-in user (DEP-6). */
  canViewSummary: boolean
  /** Full record: note, links, parties. */
  canViewDetail: boolean
  /** Edit fields, parties, links; create the delivery task. */
  canEdit: boolean
  /** Change status (incl. DONE). Providers may always mark their own dependency DONE. */
  canChangeStatus: boolean
  isProvider: boolean
  isNeeder: boolean
}

export function resolveDependencyAccess(input: DependencyAccessInput): DependencyAccess {
  const isProvider = input.providerIds.includes(input.viewerId)
  const isNeeder = input.neederIds.includes(input.viewerId)
  const parties = [...input.providerIds, ...input.neederIds]
  const anyParty = (key: 'view' | 'edit') => parties.some((id) => input.partyAccess[id]?.[key] === true)
  const isCreator = !!input.createdById && input.createdById === input.viewerId
  const canEdit = input.seesAll || isCreator || anyParty('edit')
  const canViewDetail = input.seesAll || input.isHr || isProvider || isNeeder || isCreator || anyParty('view')
  return {
    canViewSummary: true,
    canViewDetail,
    canEdit,
    canChangeStatus: canEdit || isProvider,
    isProvider,
    isNeeder,
  }
}

export async function getDependencyAccess(
  viewer: PackageViewer,
  dependency: { providerIds: readonly string[]; neederIds: readonly string[]; createdById?: string | null },
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<DependencyAccess> {
  const parties = Array.from(new Set([...dependency.providerIds, ...dependency.neederIds]))
  await primePackageSubjects(viewer, parties, loaders)
  const partyAccess: Record<string, { view: boolean; edit: boolean }> = {}
  for (const id of parties) {
    if (id === viewer.userId) continue // self is covered by isProvider / isNeeder
    const f = resolvePackageAccessFacts(viewer, id)
    partyAccess[id] = {
      view: canViewPackageAreaResolved(f, 'dependencies'),
      edit: canEditPackageAreaResolved(f, 'dependencies'),
    }
  }
  return resolveDependencyAccess({
    viewerId: viewer.userId,
    seesAll: viewer.seesAll,
    isHr: viewer.isHr,
    providerIds: dependency.providerIds,
    neederIds: dependency.neederIds,
    createdById: dependency.createdById,
    partyAccess,
  })
}

export interface DecisionAccessInput {
  viewerId: string
  seesAll: boolean
  isHr: boolean
  deciderId: string
  requestedById?: string | null
  /** Users linked to the decision (DecisionLink USER rows and owners of linked items). */
  linkedUserIds: readonly string[]
  /** Per related person: may the viewer view that person's 'decisions' area? */
  partyAccess: Readonly<Record<string, { view: boolean }>>
}

export interface DecisionAccess {
  canView: boolean
  /** Record / change the decision (DEC-2, DEC-4): decider, EXECUTIVE or ADMIN only. */
  canDecide: boolean
  /** Edit the request (title, needed-by, options, links): requester, decider, ADMIN/EXEC. */
  canEdit: boolean
  /** DEC-4: anyone who can view may comment. */
  canComment: boolean
  isDecider: boolean
  isRequester: boolean
  isLinked: boolean
}

export function resolveDecisionAccess(input: DecisionAccessInput): DecisionAccess {
  const isDecider = input.deciderId === input.viewerId
  const isRequester = !!input.requestedById && input.requestedById === input.viewerId
  const isLinked = input.linkedUserIds.includes(input.viewerId)
  // The decider sees the decision via isDecider; their relationships do not widen visibility.
  const related = [input.requestedById, ...input.linkedUserIds].filter((id): id is string => !!id)
  const viaPerson = related.some((id) => input.partyAccess[id]?.view === true)
  const canView = input.seesAll || input.isHr || isDecider || isRequester || isLinked || viaPerson
  const canDecide = isDecider || input.seesAll
  return {
    canView,
    canDecide,
    canEdit: canDecide || isRequester,
    canComment: canView,
    isDecider,
    isRequester,
    isLinked,
  }
}

export async function getDecisionAccess(
  viewer: PackageViewer,
  decision: { deciderId: string; requestedById?: string | null; linkedUserIds: readonly string[] },
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<DecisionAccess> {
  const related = Array.from(
    new Set([decision.requestedById, ...decision.linkedUserIds].filter((id): id is string => !!id)),
  )
  await primePackageSubjects(viewer, related, loaders)
  const partyAccess: Record<string, { view: boolean }> = {}
  for (const id of related) {
    if (id === viewer.userId) continue
    partyAccess[id] = { view: canViewPackageAreaResolved(resolvePackageAccessFacts(viewer, id), 'decisions') }
  }
  return resolveDecisionAccess({
    viewerId: viewer.userId,
    seesAll: viewer.seesAll,
    isHr: viewer.isHr,
    deciderId: decision.deciderId,
    requestedById: decision.requestedById,
    linkedUserIds: decision.linkedUserIds,
    partyAccess,
  })
}

// ---------------------------------------------------------------------------
// Manager tree helpers
// ---------------------------------------------------------------------------

/** Pure: is `managerId` the subject's manager, or above them, in `edges`? Cycle-safe. */
export function isManagerChainOfResolved(
  edges: readonly ManagerEdge[],
  managerId: string,
  subjectUserId: string,
): boolean {
  if (!managerId || managerId === subjectUserId) return false
  return collectManagerChain(edges, subjectUserId).includes(managerId)
}

/** Pure: every manager above `userId` (nearest first), cycle-safe, excludes `userId`. */
export function collectManagerChain(edges: readonly ManagerEdge[], userId: string): string[] {
  const managersByReport = new Map<string, string[]>()
  for (const e of edges) {
    const list = managersByReport.get(e.directReportId) ?? []
    list.push(e.managerId)
    managersByReport.set(e.directReportId, list)
  }
  const seen = new Set<string>([userId])
  const out: string[] = []
  let frontier = [userId]
  for (let depth = 0; depth < MAX_CHAIN_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const m of managersByReport.get(id) ?? []) {
        if (seen.has(m)) continue
        seen.add(m)
        out.push(m)
        next.push(m)
      }
    }
    frontier = next
  }
  return out
}

/** Pure: everyone below `managerId` in `edges` (transitive unless `directOnly`), excludes the manager. */
export function collectManagedSubtree(
  edges: readonly ManagerEdge[],
  managerId: string,
  opts: { directOnly?: boolean } = {},
): string[] {
  const reportsByManager = new Map<string, string[]>()
  for (const e of edges) {
    const list = reportsByManager.get(e.managerId) ?? []
    list.push(e.directReportId)
    reportsByManager.set(e.managerId, list)
  }
  const seen = new Set<string>([managerId])
  const out: string[] = []
  let frontier = [managerId]
  const maxDepth = opts.directOnly ? 1 : MAX_CHAIN_DEPTH
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const r of reportsByManager.get(id) ?? []) {
        if (seen.has(r)) continue
        seen.add(r)
        out.push(r)
        next.push(r)
      }
    }
    frontier = next
  }
  return out
}

/** Is `managerId` the subject's direct manager or anywhere above them (active relationships)? */
export async function isManagerChainOf(
  managerId: string,
  subjectUserId: string,
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<boolean> {
  if (!managerId || !subjectUserId || managerId === subjectUserId) return false
  return (await listManagerChainIds(subjectUserId, loaders)).includes(managerId)
}

/** Every manager above `userId` (nearest first). Used for "needers' managers" / "Manager" recipients. */
export async function listManagerChainIds(
  userId: string,
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<string[]> {
  const seen = new Set<string>([userId])
  const out: string[] = []
  let frontier = [userId]
  for (let depth = 0; depth < MAX_CHAIN_DEPTH && frontier.length > 0; depth++) {
    const edges = await loaders.managersOf(frontier)
    const next: string[] = []
    for (const edge of edges) {
      if (seen.has(edge.managerId)) continue
      seen.add(edge.managerId)
      out.push(edge.managerId)
      next.push(edge.managerId)
    }
    frontier = next
  }
  return out
}

/**
 * Ids of everyone the manager manages through active ManagerRelationship rows
 * (transitive by default; `directOnly` for direct reports). Excludes the
 * manager. This is the actual reporting tree — ADMIN/EXECUTIVE org-wide access
 * is a separate verdict, not an expansion of this list.
 */
export async function listManagedUserIds(
  manager: PackageViewer | string,
  opts: { directOnly?: boolean } = {},
  loaders: PackageAccessLoaders = prismaLoaders,
): Promise<string[]> {
  if (typeof manager !== 'string') {
    return Array.from(opts.directOnly ? manager.directReportIds : manager.managedUserIds)
  }
  const tree = await loadManagedTree(manager, loaders)
  return Array.from(opts.directOnly ? tree.direct : tree.all)
}
