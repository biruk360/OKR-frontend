import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PACKAGE_AREAS,
  canApprovePackageResolved,
  canEditPackageArea,
  canEditPackageAreaResolved,
  canEnterKpiReadingResolved,
  canManagePackageLifecycleResolved,
  canResolvePackageDisputesResolved,
  canReviewPackageItemsResolved,
  canViewPackageArea,
  canViewPackageAreaResolved,
  collectManagedSubtree,
  collectManagerChain,
  filterSubjectsByArea,
  getDecisionAccess,
  getDependencyAccess,
  isManagerChainOf,
  isManagerChainOfResolved,
  listManagedUserIds,
  listManagerChainIds,
  loadPackageViewer,
  makePackageViewer,
  resolveDecisionAccess,
  resolveDependencyAccess,
  resolvePackageAccessFacts,
  resolvePackageAreaAccess,
  type ManagerEdge,
  type MembershipRow,
  type DepartmentRow,
  type PackageAccessFacts,
  type PackageAccessLoaders,
  type PackageArea,
} from './access'
import { packageActivityHref } from './links'
import { profileTabHref } from '@/types/package'

/**
 * §8 access matrix — one test per row of the spec table, plus the record-level
 * dependency / decision rules, the manager-chain helpers and the DB loaders
 * (against an in-memory fake, no Prisma).
 */

const NONE: PackageAccessFacts = {
  isSelf: false,
  seesAll: false,
  isHr: false,
  canReadSensitiveKpis: false,
  isManagerChain: false,
  isDirectManager: false,
  inLeadSubtree: false,
  sharesDepartment: false,
}

function facts(overrides: Partial<PackageAccessFacts>): PackageAccessFacts {
  return { ...NONE, ...overrides }
}

function viewable(f: PackageAccessFacts): PackageArea[] {
  return PACKAGE_AREAS.filter((a) => canViewPackageAreaResolved(f, a))
}

function editable(f: PackageAccessFacts): PackageArea[] {
  return PACKAGE_AREAS.filter((a) => canEditPackageAreaResolved(f, a))
}

// ── Matrix rows ──────────────────────────────────────────────────────────────

test('row "Self": reads everything; edits own OKRs, duties, development; enters readings; reviews; never approves', () => {
  const self = facts({ isSelf: true })
  assert.deepEqual(viewable(self), [...PACKAGE_AREAS])
  assert.deepEqual(editable(self), ['okr', 'duties', 'development'])
  assert.equal(canEnterKpiReadingResolved(self), true)
  assert.equal(canEnterKpiReadingResolved(self, { isSensitive: true }), true)
  assert.equal(canReviewPackageItemsResolved(self), true)
  assert.equal(canApprovePackageResolved(self), false, 'not own package / role approval')
  assert.equal(canManagePackageLifecycleResolved(self), false)
  assert.equal(canEditPackageAreaResolved(self, 'role'), false, 'not own role definition')
  assert.equal(canEditPackageAreaResolved(self, 'kpis'), false, 'KPI definitions are set by the manager')
})

test('row "Self" wins over HR: an HR holder cannot edit their own role definition or package', () => {
  const selfHr = facts({ isSelf: true, isHr: true })
  assert.equal(canEditPackageAreaResolved(selfHr, 'role'), false)
  assert.equal(canEditPackageAreaResolved(selfHr, 'package'), false)
  assert.equal(canEditPackageAreaResolved(selfHr, 'weights'), false)
  assert.equal(canManagePackageLifecycleResolved(selfHr), false)
})

test('row "Direct manager / manager chain": reads all, edits everything, approves package and role', () => {
  for (const f of [facts({ isManagerChain: true, isDirectManager: true }), facts({ isManagerChain: true })]) {
    assert.deepEqual(viewable(f), [...PACKAGE_AREAS])
    assert.deepEqual(editable(f), [...PACKAGE_AREAS])
    assert.equal(canApprovePackageResolved(f), true)
    assert.equal(canManagePackageLifecycleResolved(f), true)
    assert.equal(canResolvePackageDisputesResolved(f), true)
    assert.equal(canEnterKpiReadingResolved(f, { isSensitive: true }), true)
    assert.equal(canReviewPackageItemsResolved(f), false, 'the employee reviews, not the manager')
  }
})

test('row "Same department (peer)": reads OKR / role / duties / KPIs / deps / decisions; nothing sensitive; no edits', () => {
  const peer = facts({ sharesDepartment: true })
  assert.deepEqual(viewable(peer), ['okr', 'role', 'duties', 'kpis', 'dependencies', 'decisions'])
  assert.deepEqual(editable(peer), [])
  assert.equal(canViewPackageAreaResolved(peer, 'kpis_sensitive'), false, 'KPI-7: sensitive KPI hidden from a peer')
  assert.equal(canViewPackageAreaResolved(peer, 'development'), false)
  assert.equal(canViewPackageAreaResolved(peer, 'weights'), false)
  assert.equal(canEnterKpiReadingResolved(peer), false)
  assert.equal(canApprovePackageResolved(peer), false)
})

test('row "Department lead (subtree)": reads incl. development; sensitive KPIs need the feature; edits members\' items', () => {
  const lead = facts({ inLeadSubtree: true, sharesDepartment: true })
  assert.deepEqual(viewable(lead), ['okr', 'role', 'duties', 'kpis', 'development', 'dependencies', 'decisions', 'package'])
  assert.equal(canViewPackageAreaResolved(lead, 'kpis_sensitive'), false)
  assert.equal(canViewPackageAreaResolved({ ...lead, canReadSensitiveKpis: true }, 'kpis_sensitive'), true)
  assert.deepEqual(editable(lead), ['okr', 'duties', 'kpis', 'development', 'dependencies', 'decisions'])
  assert.equal(canEnterKpiReadingResolved(lead), true)
  assert.equal(canEnterKpiReadingResolved(lead, { isSensitive: true }), false)
  assert.equal(canApprovePackageResolved(lead), false, 'approval belongs to the manager chain')
})

test('row "HR (package.hr)": reads all; edits role definitions, development, package lifecycle + weights', () => {
  const hr = facts({ isHr: true })
  assert.deepEqual(viewable(hr), [...PACKAGE_AREAS])
  assert.deepEqual(editable(hr), ['role', 'development', 'package', 'weights'])
  assert.equal(canManagePackageLifecycleResolved(hr), true)
  assert.equal(canApprovePackageResolved(hr), false)
  assert.equal(canResolvePackageDisputesResolved(hr), true)
})

test('row "Executive / Admin": all areas, all edits; still cannot approve their own package', () => {
  const exec = facts({ seesAll: true, isHr: true, canReadSensitiveKpis: true })
  assert.deepEqual(viewable(exec), [...PACKAGE_AREAS])
  assert.deepEqual(editable(exec), [...PACKAGE_AREAS])
  assert.equal(canApprovePackageResolved(exec), true)
  assert.equal(canApprovePackageResolved({ ...exec, isSelf: true }), false)
})

test('row "Any employee": OKRs only (redaction applies); no package areas; Finance sees sensitive KPIs', () => {
  assert.deepEqual(viewable(NONE), ['okr'])
  assert.deepEqual(editable(NONE), [])
  const finance = facts({ canReadSensitiveKpis: true })
  assert.deepEqual(viewable(finance), ['okr', 'kpis_sensitive'])
})

test('resolvePackageAreaAccess bundles every verdict', () => {
  const access = resolvePackageAreaAccess(facts({ sharesDepartment: true }))
  assert.equal(access.view.kpis, true)
  assert.equal(access.view.kpis_sensitive, false)
  assert.equal(access.edit.duties, false)
  assert.equal(access.canEnterKpiReadings, false)
  assert.equal(access.canReviewItems, false)
})

// ── Facts from a viewer ──────────────────────────────────────────────────────

test('resolvePackageAccessFacts: chain, direct report, lead subtree and shared department', () => {
  const viewer = makePackageViewer(
    { id: 'lead', role: 'DEPARTMENT_LEAD' },
    {
      directReportIds: ['emp'],
      managedUserIds: ['emp', 'grand'],
      departmentIds: ['sales'],
      leadDepartmentIds: ['sales', 'presales'],
      subjectDepartments: { emp: ['sales'], grand: ['presales'], peer: ['sales'], other: ['ops'] },
    },
  )
  const emp = resolvePackageAccessFacts(viewer, 'emp')
  assert.equal(emp.isDirectManager, true)
  assert.equal(emp.isManagerChain, true)
  const grand = resolvePackageAccessFacts(viewer, 'grand')
  assert.equal(grand.isDirectManager, false)
  assert.equal(grand.isManagerChain, true)
  assert.equal(grand.inLeadSubtree, true, 'descendant department counts')
  assert.equal(grand.sharesDepartment, false)
  const other = resolvePackageAccessFacts(viewer, 'other')
  assert.deepEqual(viewable(other), ['okr'])
  const self = resolvePackageAccessFacts(viewer, 'lead')
  assert.equal(self.isSelf, true)
  assert.equal(self.isManagerChain, false)
})

test('makePackageViewer: ADMIN/EXECUTIVE imply HR + sensitive read; self is never in the managed set', () => {
  const exec = makePackageViewer({ id: 'x', role: 'EXECUTIVE' }, { managedUserIds: ['x', 'y'] })
  assert.equal(exec.seesAll, true)
  assert.equal(exec.isHr, true)
  assert.equal(exec.canReadSensitiveKpis, true)
  assert.equal(exec.managedUserIds.has('x'), false)
  const emp = makePackageViewer({ id: 'e', role: 'EMPLOYEE' })
  assert.equal(emp.seesAll, false)
  assert.equal(emp.isHr, false)
})

// ── Record level: dependencies and decisions ────────────────────────────────

test('dependencies: summary for everyone; detail for parties and related viewers; providers may mark DONE', () => {
  const base = { seesAll: false, isHr: false, providerIds: ['prov'], neederIds: ['need'], createdById: 'creator', partyAccess: {} }
  const stranger = resolveDependencyAccess({ ...base, viewerId: 'stranger' })
  assert.deepEqual(
    { summary: stranger.canViewSummary, detail: stranger.canViewDetail, edit: stranger.canEdit, status: stranger.canChangeStatus },
    { summary: true, detail: false, edit: false, status: false },
  )
  const provider = resolveDependencyAccess({ ...base, viewerId: 'prov' })
  assert.equal(provider.canViewDetail, true)
  assert.equal(provider.canEdit, false)
  assert.equal(provider.canChangeStatus, true, 'mark own provided dependency DONE')
  const needer = resolveDependencyAccess({ ...base, viewerId: 'need' })
  assert.equal(needer.canViewDetail, true)
  assert.equal(needer.canChangeStatus, false)
  const needersManager = resolveDependencyAccess({ ...base, viewerId: 'mgr', partyAccess: { need: { view: true, edit: true } } })
  assert.equal(needersManager.canViewDetail, true)
  assert.equal(needersManager.canEdit, true)
  const peer = resolveDependencyAccess({ ...base, viewerId: 'peer', partyAccess: { prov: { view: true, edit: false } } })
  assert.equal(peer.canViewDetail, true)
  assert.equal(peer.canEdit, false)
  assert.equal(resolveDependencyAccess({ ...base, viewerId: 'creator' }).canEdit, true)
  assert.equal(resolveDependencyAccess({ ...base, viewerId: 'boss', seesAll: true }).canEdit, true)
  assert.equal(resolveDependencyAccess({ ...base, viewerId: 'hr', isHr: true }).canViewDetail, true)
})

test('decisions: only the decider, EXECUTIVE or ADMIN decide (DEC-4); viewers may comment', () => {
  const base = { seesAll: false, isHr: false, deciderId: 'ceo', requestedById: 'req', linkedUserIds: ['linked'], partyAccess: {} }
  const decider = resolveDecisionAccess({ ...base, viewerId: 'ceo' })
  assert.equal(decider.canDecide, true)
  assert.equal(decider.canView, true)
  const requester = resolveDecisionAccess({ ...base, viewerId: 'req' })
  assert.equal(requester.canDecide, false)
  assert.equal(requester.canEdit, true)
  const linked = resolveDecisionAccess({ ...base, viewerId: 'linked' })
  assert.equal(linked.canView, true)
  assert.equal(linked.canComment, true)
  assert.equal(linked.canDecide, false)
  const stranger = resolveDecisionAccess({ ...base, viewerId: 'stranger' })
  assert.equal(stranger.canView, false)
  assert.equal(stranger.canComment, false)
  const manager = resolveDecisionAccess({ ...base, viewerId: 'mgr', partyAccess: { linked: { view: true } } })
  assert.equal(manager.canView, true)
  assert.equal(manager.canDecide, false)
  assert.equal(resolveDecisionAccess({ ...base, viewerId: 'exec', seesAll: true }).canDecide, true)
})

test('decisions: the decider does not widen visibility to their peers or leads', () => {
  const base = { seesAll: false, isHr: false, deciderId: 'ceo', requestedById: 'req', linkedUserIds: [], viewerId: 'ceoPeer' }
  assert.equal(resolveDecisionAccess({ ...base, partyAccess: { ceo: { view: true } } }).canView, false)
  assert.equal(resolveDecisionAccess({ ...base, partyAccess: { req: { view: true } } }).canView, true)
})

// ── Manager tree helpers ─────────────────────────────────────────────────────

const EDGES: ManagerEdge[] = [
  { managerId: 'ceo', directReportId: 'vp' },
  { managerId: 'vp', directReportId: 'lead' },
  { managerId: 'lead', directReportId: 'emp' },
  { managerId: 'lead', directReportId: 'emp2' },
  // cycle (bad data) must not loop
  { managerId: 'emp2', directReportId: 'vp' },
]

test('collectManagerChain / isManagerChainOfResolved walk up the tree, nearest first, cycle-safe', () => {
  assert.deepEqual(collectManagerChain(EDGES, 'emp'), ['lead', 'vp', 'ceo', 'emp2'])
  assert.equal(isManagerChainOfResolved(EDGES, 'ceo', 'emp'), true)
  assert.equal(isManagerChainOfResolved(EDGES, 'lead', 'emp'), true)
  assert.equal(isManagerChainOfResolved(EDGES, 'emp', 'lead'), false)
  assert.equal(isManagerChainOfResolved(EDGES, 'emp', 'emp'), false)
})

test('collectManagedSubtree: transitive by default, direct only on request, excludes the manager', () => {
  assert.deepEqual(collectManagedSubtree(EDGES, 'vp').sort(), ['emp', 'emp2', 'lead'])
  assert.deepEqual(collectManagedSubtree(EDGES, 'lead', { directOnly: true }).sort(), ['emp', 'emp2'])
  assert.deepEqual(collectManagedSubtree(EDGES, 'emp'), [])
})

// ── Loaders (in-memory fake) ────────────────────────────────────────────────

function fakeLoaders(opts: {
  roles?: Record<string, string>
  features?: Record<string, string[]>
  edges?: ManagerEdge[]
  memberships?: MembershipRow[]
  departments?: DepartmentRow[]
}): PackageAccessLoaders & { calls: Record<string, number> } {
  const calls: Record<string, number> = {}
  const hit = (k: string) => { calls[k] = (calls[k] ?? 0) + 1 }
  const edges = opts.edges ?? []
  return {
    calls,
    async userRole(id) { hit('userRole'); return opts.roles?.[id] ?? null },
    async feature(id, key) { hit('feature'); return (opts.features?.[id] ?? []).includes(key) },
    async reportsOf(ids) { hit('reportsOf'); return edges.filter((e) => ids.includes(e.managerId)) },
    async managersOf(ids) { hit('managersOf'); return edges.filter((e) => ids.includes(e.directReportId)) },
    async memberships(ids) { hit('memberships'); return (opts.memberships ?? []).filter((m) => ids.includes(m.userId)) },
    async childDepartments(ids) {
      hit('childDepartments')
      return (opts.departments ?? []).filter((d) => d.parentId !== null && ids.includes(d.parentId))
    },
  }
}

const ORG = {
  roles: { lead: 'DEPARTMENT_LEAD', emp: 'EMPLOYEE', peer: 'EMPLOYEE', hr: 'EMPLOYEE', other: 'EMPLOYEE', ceo: 'EXECUTIVE', fin: 'EMPLOYEE' },
  features: { hr: ['package.hr'], fin: ['package.kpi.sensitive.read'] },
  edges: [
    { managerId: 'ceo', directReportId: 'lead' },
    { managerId: 'lead', directReportId: 'emp' },
  ],
  memberships: [
    { userId: 'lead', departmentId: 'sales', role: 'HEAD' },
    { userId: 'emp', departmentId: 'sales', role: 'MEMBER' },
    { userId: 'peer', departmentId: 'sales', role: 'MEMBER' },
    { userId: 'junior', departmentId: 'presales', role: 'MEMBER' },
    { userId: 'other', departmentId: 'ops', role: 'MEMBER' },
  ],
  departments: [
    { id: 'sales', parentId: null },
    { id: 'presales', parentId: 'sales' },
    { id: 'ops', parentId: null },
  ],
}

test('loadPackageViewer: loads chain, departments, lead subtree and features once', async () => {
  const loaders = fakeLoaders(ORG)
  const lead = await loadPackageViewer('lead', loaders)
  assert.equal(lead.role, 'DEPARTMENT_LEAD')
  assert.deepEqual([...lead.directReportIds], ['emp'])
  assert.deepEqual([...lead.managedUserIds], ['emp'])
  assert.deepEqual([...lead.leadDepartmentIds].sort(), ['presales', 'sales'])
  assert.equal(lead.isHr, false)

  const ceo = await loadPackageViewer({ id: 'ceo', role: 'EXECUTIVE' }, loaders)
  assert.equal(ceo.seesAll, true)
  assert.deepEqual([...ceo.managedUserIds].sort(), ['emp', 'lead'], 'transitive subtree')

  const hr = await loadPackageViewer({ user: { id: 'hr', role: 'EMPLOYEE', isProjectManager: false } } as never, loaders)
  assert.equal(hr.isHr, true)
  assert.equal(hr.canReadSensitiveKpis, false)
})

test('async verdicts: peer vs manager chain on sensitive KPIs; lead reaches a child department', async () => {
  const loaders = fakeLoaders(ORG)
  const peer = await loadPackageViewer('peer', loaders)
  assert.equal(await canViewPackageArea(peer, 'emp', 'kpis', loaders), true)
  assert.equal(await canViewPackageArea(peer, 'emp', 'kpis_sensitive', loaders), false)
  assert.equal(await canViewPackageArea(peer, 'other', 'role', loaders), false)
  assert.equal(await canViewPackageArea(peer, 'other', 'okr', loaders), true)

  const ceo = await loadPackageViewer('ceo', loaders)
  assert.equal(await canViewPackageArea(ceo, 'emp', 'kpis_sensitive', loaders), true)

  const lead = await loadPackageViewer('lead', loaders)
  assert.equal(await canViewPackageArea(lead, 'emp', 'kpis_sensitive', loaders), true, 'manager chain')
  assert.equal(await canEditPackageArea(lead, 'junior', 'duties', loaders), true, 'lead of the parent department')
  assert.equal(await canViewPackageArea(lead, 'junior', 'kpis_sensitive', loaders), false)
  assert.equal(await canEditPackageArea(lead, 'other', 'duties', loaders), false)

  const fin = await loadPackageViewer('fin', loaders)
  assert.equal(await canViewPackageArea(fin, 'emp', 'kpis_sensitive', loaders), true)
  assert.equal(await canViewPackageArea(fin, 'emp', 'kpis', loaders), false)
})

test('filterSubjectsByArea primes subject departments in one query', async () => {
  const loaders = fakeLoaders(ORG)
  const peer = await loadPackageViewer('peer', loaders)
  const before = loaders.calls.memberships ?? 0
  const visible = await filterSubjectsByArea(peer, ['emp', 'other', 'junior', 'peer'], 'duties', 'view', loaders)
  assert.deepEqual([...visible].sort(), ['emp', 'peer'])
  assert.equal((loaders.calls.memberships ?? 0) - before, 1)
})

test('getDependencyAccess / getDecisionAccess resolve party relations through the viewer', async () => {
  const loaders = fakeLoaders(ORG)
  const lead = await loadPackageViewer('lead', loaders)
  const dep = await getDependencyAccess(lead, { providerIds: ['other'], neederIds: ['emp'] }, loaders)
  assert.equal(dep.canViewDetail, true)
  assert.equal(dep.canEdit, true, "manager of a needer edits the dependency")
  const otherViewer = await loadPackageViewer('other', loaders)
  const asProvider = await getDependencyAccess(otherViewer, { providerIds: ['other'], neederIds: ['emp'] }, loaders)
  assert.equal(asProvider.canChangeStatus, true)
  assert.equal(asProvider.canEdit, false)

  const dec = await getDecisionAccess(otherViewer, { deciderId: 'ceo', requestedById: 'emp', linkedUserIds: [] }, loaders)
  assert.equal(dec.canView, false)
  const decLead = await getDecisionAccess(lead, { deciderId: 'ceo', requestedById: 'emp', linkedUserIds: [] }, loaders)
  assert.equal(decLead.canView, true)
  assert.equal(decLead.canDecide, false)
})

test('loadPackageViewer: DEPARTMENT_LEAD leads only HEAD rows or the primary membership, never secondary', async () => {
  const loaders = fakeLoaders({
    roles: { dl: 'DEPARTMENT_LEAD', dl2: 'DEPARTMENT_LEAD' },
    memberships: [
      { userId: 'dl', departmentId: 'sales', role: 'MEMBER', isPrimary: true },
      { userId: 'dl', departmentId: 'ops', role: 'SECONDARY_MEMBER', isPrimary: false },
      { userId: 'dl', departmentId: 'root', role: 'MEMBER', isPrimary: false },
      { userId: 'dl2', departmentId: 'ops', role: 'HEAD', isPrimary: false },
      { userId: 'dl2', departmentId: 'root', role: 'SECONDARY_MEMBER', isPrimary: true },
    ],
    departments: [
      { id: 'root', parentId: null },
      { id: 'sales', parentId: 'root' },
      { id: 'presales', parentId: 'sales' },
      { id: 'ops', parentId: 'root' },
    ],
  })
  const dl = await loadPackageViewer('dl', loaders)
  assert.deepEqual([...dl.leadDepartmentIds].sort(), ['presales', 'sales'])
  const dl2 = await loadPackageViewer('dl2', loaders)
  assert.deepEqual([...dl2.leadDepartmentIds].sort(), ['ops'])
})

test('isManagerChainOf / listManagerChainIds / listManagedUserIds use the loaders', async () => {
  const loaders = fakeLoaders(ORG)
  assert.equal(await isManagerChainOf('ceo', 'emp', loaders), true)
  assert.equal(await isManagerChainOf('emp', 'ceo', loaders), false)
  assert.deepEqual(await listManagerChainIds('emp', loaders), ['lead', 'ceo'])
  assert.deepEqual((await listManagedUserIds('ceo', {}, loaders)).sort(), ['emp', 'lead'])
  assert.deepEqual(await listManagedUserIds('ceo', { directOnly: true }, loaders), ['lead'])
  const lead = await loadPackageViewer('lead', loaders)
  assert.deepEqual(await listManagedUserIds(lead), ['emp'])
})

// ── Deep links (AUD-3) ───────────────────────────────────────────────────────

test('packageActivityHref opens the owner profile tab or the item page', () => {
  assert.equal(packageActivityHref('KPI', { entityId: 'k1', userId: 'u1' }), profileTabHref('u1', 'kpis'))
  assert.equal(packageActivityHref('KPI', { entityId: 'k1', userId: 'u1' }), '/dashboard/org/users/u1?tab=kpis')
  assert.equal(packageActivityHref('RECURRING_DUTY', { userId: 'u1' }), '/dashboard/org/users/u1?tab=role')
  assert.equal(packageActivityHref('DEVELOPMENT_ITEM', { userId: 'u1' }), '/dashboard/org/users/u1?tab=development')
  assert.equal(packageActivityHref('OPERATING_PACKAGE', { userId: 'u1' }), '/dashboard/org/users/u1')
  assert.equal(packageActivityHref('WORK_DEPENDENCY', { entityId: 'd1' }), '/dashboard/okrs-all/dependencies?dependency=d1')
  assert.equal(packageActivityHref('DECISION', { entityId: 'x' }), '/dashboard/decisions?decision=x')
  assert.equal(packageActivityHref('KR_CHECKPOINT', {}, { keyResultId: 'kr1' }), '/dashboard/key-results/kr1')
  assert.equal(packageActivityHref('OKR_LINK', { fromType: 'OBJECTIVE', fromId: 'o1' }), '/dashboard/objectives/o1')
  assert.equal(packageActivityHref('KPI', {}), null)
  assert.equal(packageActivityHref('OBJECTIVE', { userId: 'u1' }), null)
})
