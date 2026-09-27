import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Table test: the in-memory visibility verdicts in lib/okr/visibility-scope.ts
 * are pinned by a hand-written expected-results table; the per-object rules in
 * lib/permissions.ts (`canViewObjective`, `canViewKeyResult`, which delegate to
 * them) are checked for wiring parity on every fixture; and the Prisma `where`
 * builders must select exactly the rows the in-memory verdicts allow.
 *
 * lib/permissions.ts queries Prisma per call, so a fake client is installed on
 * `globalThis.prisma` (lib/prisma.ts reuses it) BEFORE the modules are imported.
 */

type Rel = { managerId: string; directReportId: string; endedAt: Date | null }
type Mem = { userId: string; departmentId: string; endedAt: Date | null }
type Obj = {
  id: string
  level: 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL'
  ownerId: string
  departmentId: string | null
  isPrivate: boolean
  status: string
}
type Kr = { id: string; ownerId: string; objectiveId: string; isPrivate: boolean }

const USERS = {
  admin: { id: 'admin', role: 'ADMIN' },
  exec: { id: 'exec', role: 'EXECUTIVE' },
  lead: { id: 'lead', role: 'DEPARTMENT_LEAD' },
  emp1: { id: 'emp1', role: 'EMPLOYEE' },
  emp2: { id: 'emp2', role: 'EMPLOYEE' },
  outsider: { id: 'outsider', role: 'EMPLOYEE' },
} as const

const RELS: Rel[] = [
  { managerId: 'lead', directReportId: 'emp1', endedAt: null },
  // Ended relationship — must NOT grant full access.
  { managerId: 'lead', directReportId: 'emp2', endedAt: new Date('2026-01-01') },
  { managerId: 'emp1', directReportId: 'outsider', endedAt: null },
]

const MEMS: Mem[] = [
  { userId: 'lead', departmentId: 'd1', endedAt: null },
  { userId: 'emp1', departmentId: 'd1', endedAt: null },
  { userId: 'emp2', departmentId: 'd2', endedAt: null },
  { userId: 'outsider', departmentId: 'd3', endedAt: null },
]

const OWNERS = ['admin', 'lead', 'emp1', 'emp2', 'outsider']
const OBJECTIVES: Obj[] = []
for (const level of ['COMPANY', 'DEPARTMENT', 'INDIVIDUAL'] as const) {
  for (const ownerId of OWNERS) {
    for (const departmentId of ['d1', 'd2', null]) {
      for (const isPrivate of [false, true]) {
        OBJECTIVES.push({
          id: `o-${level}-${ownerId}-${departmentId ?? 'none'}-${isPrivate ? 'p' : 'o'}`,
          level,
          ownerId,
          departmentId,
          isPrivate,
          status: 'ACTIVE',
        })
      }
    }
  }
}
OBJECTIVES.push({ id: 'o-deleted', level: 'COMPANY', ownerId: 'emp1', departmentId: null, isPrivate: false, status: 'DELETED' })

const KRS: Kr[] = []
for (const o of OBJECTIVES) {
  for (const ownerId of ['lead', 'emp1', 'outsider']) {
    for (const isPrivate of [false, true]) {
      KRS.push({ id: `k-${o.id}-${ownerId}-${isPrivate ? 'p' : 'o'}`, ownerId, objectiveId: o.id, isPrivate })
    }
  }
}

const fakePrisma = {
  managerRelationship: {
    async findFirst({ where }: any) {
      return RELS.find((r) => r.managerId === where.managerId && r.directReportId === where.directReportId
        && (where.endedAt === null ? r.endedAt === null : true)) ?? null
    },
    async findMany({ where }: any) {
      return RELS.filter((r) => r.managerId === where.managerId && (where.endedAt === null ? r.endedAt === null : true))
    },
  },
  departmentMembership: {
    async findFirst({ where }: any) {
      return MEMS.find((m) => m.userId === where.userId && m.departmentId === where.departmentId) ?? null
    },
    async findMany({ where }: any) {
      return MEMS.filter((m) => m.userId === where.userId && (where.endedAt === null ? m.endedAt === null : true))
    },
  },
  objective: {
    async findUnique({ where }: any) {
      return OBJECTIVES.find((o) => o.id === where.id) ?? null
    },
  },
}
;(globalThis as any).prisma = fakePrisma

/** Minimal evaluator for the Prisma where subset the builders emit. */
function matches(row: any, where: any, related: (row: any, rel: string) => any): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (key === 'AND') {
      if (!(cond as any[]).every((w) => matches(row, w, related))) return false
    } else if (key === 'OR') {
      if (!(cond as any[]).some((w) => matches(row, w, related))) return false
    } else if (key === 'objective') {
      if (!matches(related(row, 'objective'), cond, related)) return false
    } else if (cond !== null && typeof cond === 'object') {
      const c = cond as any
      if ('not' in c && row[key] === c.not) return false
      if ('in' in c && !c.in.includes(row[key])) return false
      if ('equals' in c && row[key] !== c.equals) return false
    } else if (row[key] !== cond) {
      return false
    }
  }
  return true
}
const relatedOf = (row: any, rel: string) =>
  rel === 'objective' ? OBJECTIVES.find((o) => o.id === row.objectiveId) : undefined

async function load() {
  const perms = await import('@/lib/permissions')
  const scope = await import('./visibility-scope')
  const loaders = (scopeFragment: Record<string, unknown> | null = null) => ({
    directReportIds: async (userId: string) =>
      RELS.filter((r) => r.managerId === userId && r.endedAt === null).map((r) => r.directReportId),
    departmentIds: async (userId: string) =>
      MEMS.filter((m) => m.userId === userId && m.endedAt === null).map((m) => m.departmentId),
    objectiveScope: async () => scopeFragment,
  })
  return { perms, scope, loaders }
}

// ---------------------------------------------------------------------------
// Explicit expected-results table.
//
// lib/permissions.ts `canViewObjective` / `canViewKeyResult` now delegate to the
// in-memory verdicts, so the parity tests below compare the functions with
// themselves and can no longer catch a rule regression. These rows are the
// rule, written out by hand: each one names who is looking, at what, and the
// verdict the product requires. Change a row only when the rule changes.
//
// Fixture facts used below: lead currently manages emp1; lead's relationship
// with emp2 has ENDED; emp1 manages outsider; lead and emp1 share department d1.
// ---------------------------------------------------------------------------

const FULL = { canView: true, isRedacted: false } as const
const REDACTED = { canView: true, isRedacted: true } as const

type ObjCase = {
  name: string
  viewer: keyof typeof USERS
  objective: { ownerId: string; isPrivate: boolean; departmentId?: string | null; level?: string }
  expected: { canView: boolean; isRedacted: boolean }
}

const OBJECTIVE_TABLE: ObjCase[] = [
  { name: 'ADMIN sees another user\'s private objective in full', viewer: 'admin', objective: { ownerId: 'emp2', isPrivate: true }, expected: FULL },
  { name: 'EXECUTIVE sees another user\'s private objective in full', viewer: 'exec', objective: { ownerId: 'emp2', isPrivate: true }, expected: FULL },
  { name: 'owner sees their own private objective in full', viewer: 'emp2', objective: { ownerId: 'emp2', isPrivate: true }, expected: FULL },
  { name: 'current manager sees a direct report\'s private objective in full', viewer: 'lead', objective: { ownerId: 'emp1', isPrivate: true }, expected: FULL },
  { name: 'employee-manager sees their report\'s private objective in full', viewer: 'emp1', objective: { ownerId: 'outsider', isPrivate: true }, expected: FULL },
  { name: 'ENDED manager sees a former report\'s private objective redacted', viewer: 'lead', objective: { ownerId: 'emp2', isPrivate: true }, expected: REDACTED },
  { name: 'a report does not inherit access to their manager\'s private objective', viewer: 'outsider', objective: { ownerId: 'emp1', isPrivate: true }, expected: REDACTED },
  { name: 'other employee sees a private objective redacted', viewer: 'outsider', objective: { ownerId: 'emp2', isPrivate: true }, expected: REDACTED },
  { name: 'shared department does not unlock a private objective', viewer: 'emp1', objective: { ownerId: 'lead', isPrivate: true, departmentId: 'd1', level: 'DEPARTMENT' }, expected: REDACTED },
  { name: 'DEPARTMENT_LEAD without a live relationship sees a private objective redacted', viewer: 'lead', objective: { ownerId: 'outsider', isPrivate: true, departmentId: 'd1' }, expected: REDACTED },
  { name: 'other employee sees a public objective in full', viewer: 'outsider', objective: { ownerId: 'emp2', isPrivate: false }, expected: FULL },
  { name: 'ended manager sees a public objective in full', viewer: 'lead', objective: { ownerId: 'emp2', isPrivate: false }, expected: FULL },
  { name: 'company-level public objective is visible to every employee', viewer: 'emp2', objective: { ownerId: 'admin', isPrivate: false, level: 'COMPANY' }, expected: FULL },
]

type KrCase = {
  name: string
  viewer: keyof typeof USERS
  objective: { ownerId: string; isPrivate: boolean }
  keyResult: { ownerId: string; isPrivate: boolean }
  expected: { canView: boolean; isRedacted: boolean }
}

const KEY_RESULT_TABLE: KrCase[] = [
  { name: 'ADMIN sees a private KR under a private objective in full', viewer: 'admin', objective: { ownerId: 'emp2', isPrivate: true }, keyResult: { ownerId: 'emp2', isPrivate: true }, expected: FULL },
  { name: 'EXECUTIVE sees a private KR in full', viewer: 'exec', objective: { ownerId: 'emp2', isPrivate: false }, keyResult: { ownerId: 'emp1', isPrivate: true }, expected: FULL },
  { name: 'KR-owner exemption: own KR stays full under a redacted objective', viewer: 'outsider', objective: { ownerId: 'emp2', isPrivate: true }, keyResult: { ownerId: 'outsider', isPrivate: false }, expected: FULL },
  { name: 'KR-owner exemption: own private KR stays full', viewer: 'outsider', objective: { ownerId: 'emp2', isPrivate: true }, keyResult: { ownerId: 'outsider', isPrivate: true }, expected: FULL },
  { name: 'KR owner\'s current manager sees it in full under a redacted objective', viewer: 'lead', objective: { ownerId: 'emp2', isPrivate: true }, keyResult: { ownerId: 'emp1', isPrivate: true }, expected: FULL },
  { name: 'public KR under a redacted objective is redacted', viewer: 'outsider', objective: { ownerId: 'emp2', isPrivate: true }, keyResult: { ownerId: 'emp1', isPrivate: false }, expected: REDACTED },
  { name: 'KR private flag redacts it under a public objective', viewer: 'outsider', objective: { ownerId: 'emp2', isPrivate: false }, keyResult: { ownerId: 'emp1', isPrivate: true }, expected: REDACTED },
  { name: 'objective owner does not see someone else\'s private KR in full', viewer: 'emp2', objective: { ownerId: 'emp2', isPrivate: false }, keyResult: { ownerId: 'emp1', isPrivate: true }, expected: REDACTED },
  { name: 'ENDED manager of the KR owner sees a private KR redacted', viewer: 'lead', objective: { ownerId: 'admin', isPrivate: false }, keyResult: { ownerId: 'emp2', isPrivate: true }, expected: REDACTED },
  { name: 'public KR under a public objective is full for anyone', viewer: 'outsider', objective: { ownerId: 'emp2', isPrivate: false }, keyResult: { ownerId: 'emp1', isPrivate: false }, expected: FULL },
]

test('expected-results table: canViewObjectiveInMemory', async () => {
  const { scope, loaders } = await load()
  for (const row of OBJECTIVE_TABLE) {
    const ctx = await scope.loadViewerContext(USERS[row.viewer], loaders())
    const objective = { level: 'INDIVIDUAL', departmentId: null, ...row.objective }
    assert.deepEqual(scope.canViewObjectiveInMemory(ctx, objective), row.expected, row.name)
  }
})

test('expected-results table: canViewKeyResultInMemory', async () => {
  const { scope, loaders } = await load()
  for (const row of KEY_RESULT_TABLE) {
    const ctx = await scope.loadViewerContext(USERS[row.viewer], loaders())
    const objectiveVerdict = scope.canViewObjectiveInMemory(ctx, row.objective)
    assert.deepEqual(scope.canViewKeyResultInMemory(ctx, row.keyResult, objectiveVerdict), row.expected, row.name)
  }
})

test('expected-results table: a KR under an objective the viewer cannot view is not viewable', async () => {
  const { scope } = await load()
  const ctx = scope.makeViewerContext(USERS.admin)
  assert.deepEqual(
    scope.canViewKeyResultInMemory(ctx, { ownerId: 'admin', isPrivate: false }, { canView: false, isRedacted: false }),
    { canView: false, isRedacted: false },
  )
})

test('expected-results table: DELETED objectives and their KRs are excluded for every viewer, owner and ADMIN included', async () => {
  const { scope, loaders } = await load()
  const deleted = OBJECTIVES.find((o) => o.id === 'o-deleted')!
  assert.equal(deleted.ownerId, 'emp1')
  const deletedKr = KRS.find((k) => k.objectiveId === 'o-deleted' && k.ownerId === 'emp1' && !k.isPrivate)!
  for (const viewer of ['admin', 'exec', 'emp1', 'lead', 'outsider'] as const) {
    const ctx = await scope.loadViewerContext(USERS[viewer], loaders())
    for (const includeRedacted of [true, false]) {
      assert.equal(matches(deleted, scope.buildObjectiveVisibilityWhere(ctx, { includeRedacted }), relatedOf), false, `${viewer} objective includeRedacted=${includeRedacted}`)
      assert.equal(matches(deletedKr, scope.buildKeyResultVisibilityWhere(ctx, { includeRedacted }), relatedOf), false, `${viewer} KR includeRedacted=${includeRedacted}`)
    }
  }
  // The same objective, un-deleted, is selected — the exclusion is the status.
  const ctx = await scope.loadViewerContext(USERS.emp1, loaders())
  assert.equal(matches({ ...deleted, status: 'ACTIVE' }, scope.buildObjectiveVisibilityWhere(ctx), relatedOf), true)
})

// ---------------------------------------------------------------------------
// Parity with lib/permissions.ts. Since the delegation these are wiring checks
// (the exported per-object functions still route to the in-memory rules and
// load the same facts); the table above is what pins the rule itself.
// ---------------------------------------------------------------------------

test('canViewObjectiveInMemory agrees with canViewObjective on every fixture', async () => {
  const { perms, scope, loaders } = await load()
  let compared = 0
  for (const viewer of Object.values(USERS)) {
    const ctx = await scope.loadViewerContext(viewer, loaders())
    for (const o of OBJECTIVES) {
      const expected = await perms.canViewObjective(viewer.role as any, viewer.id, o)
      const actual = scope.canViewObjectiveInMemory(ctx, o)
      assert.deepEqual(actual, expected, `${viewer.id} × ${o.id}`)
      compared++
    }
  }
  assert.ok(compared > 500)
})

test('canViewKeyResultInMemory agrees with canViewKeyResult on every fixture', async () => {
  const { perms, scope, loaders } = await load()
  for (const viewer of Object.values(USERS)) {
    const ctx = await scope.loadViewerContext(viewer, loaders())
    for (const kr of KRS) {
      const o = OBJECTIVES.find((x) => x.id === kr.objectiveId)!
      const expected = await perms.canViewKeyResult(viewer.role as any, viewer.id, kr)
      const actual = scope.canViewKeyResultInMemory(ctx, kr, scope.canViewObjectiveInMemory(ctx, o))
      assert.deepEqual(actual, expected, `${viewer.id} × ${kr.id}`)
    }
  }
})

test('objective where: includeRedacted=false selects exactly the unredacted, non-deleted rows', async () => {
  const { scope, loaders } = await load()
  for (const viewer of Object.values(USERS)) {
    const ctx = await scope.loadViewerContext(viewer, loaders())
    const full = scope.buildObjectiveVisibilityWhere(ctx, { includeRedacted: false })
    const all = scope.buildObjectiveVisibilityWhere(ctx)
    for (const o of OBJECTIVES) {
      const verdict = scope.canViewObjectiveInMemory(ctx, o)
      const notDeleted = o.status !== 'DELETED'
      assert.equal(matches(o, all, relatedOf), notDeleted && verdict.canView, `all: ${viewer.id} × ${o.id}`)
      assert.equal(matches(o, full, relatedOf), notDeleted && !verdict.isRedacted, `full: ${viewer.id} × ${o.id}`)
    }
  }
})

test('key result where: includeRedacted=false selects exactly the unredacted KRs of non-deleted objectives', async () => {
  const { scope, loaders } = await load()
  for (const viewer of Object.values(USERS)) {
    const ctx = await scope.loadViewerContext(viewer, loaders())
    const full = scope.buildKeyResultVisibilityWhere(ctx, { includeRedacted: false })
    const all = scope.buildKeyResultVisibilityWhere(ctx)
    for (const kr of KRS) {
      const o = OBJECTIVES.find((x) => x.id === kr.objectiveId)!
      const verdict = scope.canViewKeyResultInMemory(ctx, kr, scope.canViewObjectiveInMemory(ctx, o))
      const notDeleted = o.status !== 'DELETED'
      assert.equal(matches(kr, all, relatedOf), notDeleted, `all: ${viewer.id} × ${kr.id}`)
      assert.equal(matches(kr, full, relatedOf), notDeleted && !verdict.isRedacted, `full: ${viewer.id} × ${kr.id}`)
    }
  }
})

test('record scope fragment is ANDed into the objective and key result where', async () => {
  const { scope, loaders } = await load()
  const ctx = await scope.loadViewerContext(USERS.emp1, loaders({ departmentId: 'd1' }))
  const where = scope.buildObjectiveVisibilityWhere(ctx)
  for (const o of OBJECTIVES) {
    assert.equal(matches(o, where, relatedOf), o.status !== 'DELETED' && o.departmentId === 'd1', o.id)
  }
  const krWhere = scope.buildKeyResultVisibilityWhere(ctx)
  const kr = KRS.find((k) => OBJECTIVES.find((o) => o.id === k.objectiveId)!.departmentId === 'd2')!
  assert.equal(matches(kr, krWhere, relatedOf), false)
})

test('context: admin skips the manager lookup; ended relationships and memberships do not count', async () => {
  const { scope, loaders } = await load()
  let managerLookups = 0
  const base = loaders()
  const counting = { ...base, directReportIds: async (id: string) => { managerLookups++; return base.directReportIds(id) } }
  const adminCtx = await scope.loadViewerContext(USERS.admin, counting)
  assert.equal(adminCtx.seesAll, true)
  assert.equal(managerLookups, 0)
  const leadCtx = await scope.loadViewerContext(USERS.lead, counting)
  assert.deepEqual(Array.from(leadCtx.directReportIds), ['emp1'])
  assert.deepEqual(Array.from(leadCtx.departmentIds), ['d1'])
})

test('redaction helpers hide titles of private rows and keep progress', async () => {
  const { scope } = await load()
  const ctx = scope.makeViewerContext(USERS.outsider)
  const priv = { id: 'x', ownerId: 'emp2', isPrivate: true, title: 'Secret', description: 'd', progress: 42 }
  const red = scope.redactObjectiveForViewer(ctx, priv)
  assert.equal(red.title, scope.REDACTED_OBJECTIVE_TITLE)
  assert.equal(red.description, null)
  assert.equal(red.progress, 42)
  assert.equal(red.isRedacted, true)
  const pub = { ...priv, isPrivate: false }
  assert.equal(scope.redactObjectiveForViewer(ctx, pub).title, 'Secret')

  const kr = { id: 'k', ownerId: 'emp2', isPrivate: false, title: 'KR', currentValue: 5, targetValue: 10, progress: 50 }
  const redKr = scope.redactKeyResultForViewer(ctx, kr, priv)
  assert.equal(redKr.title, scope.REDACTED_KEY_RESULT_TITLE)
  assert.equal(redKr.targetValue, 0)
  assert.equal(redKr.progress, 50)
  // KR owned by the viewer stays visible even under a redacted objective.
  const ownKr = { ...kr, ownerId: 'outsider' }
  assert.equal(scope.redactKeyResultForViewer(ctx, ownKr, priv).title, 'KR')
})
