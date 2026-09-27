import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Role matrix for lib/rbac.ts `can()` and the lib/permissions.ts helpers it
 * delegates to (ADMIN / EXECUTIVE / DEPARTMENT_LEAD / EMPLOYEE × key actions).
 *
 * `can()` first asks the DB-backed doctype resolver (lib/permission-resolver.ts)
 * and only short-circuits on a grant; a deny or a throw falls through to the
 * hard-coded rules. A fake Prisma client is installed on `globalThis.prisma`
 * (lib/prisma.ts reuses it) BEFORE the modules are imported. `doctypeMode`
 * switches the permission tables between "unseeded" (no rows → legacy rules
 * decide), "seeded" (rows from scripts/seed-permissions.ts), and "throws".
 */

type Role = 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE'

const USERS: Record<string, Role> = {
  admin: 'ADMIN',
  exec: 'EXECUTIVE',
  lead: 'DEPARTMENT_LEAD',
  emp1: 'EMPLOYEE',
  emp2: 'EMPLOYEE',
}

// lead manages emp1 (live); lead's relationship with emp2 has ended.
const RELS = [
  { id: 'r1', managerId: 'lead', directReportId: 'emp1', endedAt: null as Date | null },
  { id: 'r2', managerId: 'lead', directReportId: 'emp2', endedAt: new Date('2026-01-01') as Date | null },
]
// lead and emp1 share department d1; emp2 is in d2.
const MEMS = [
  { id: 'm1', userId: 'lead', departmentId: 'd1', role: 'HEAD', endedAt: null as Date | null },
  { id: 'm2', userId: 'emp1', departmentId: 'd1', role: 'MEMBER', endedAt: null as Date | null },
  { id: 'm3', userId: 'emp2', departmentId: 'd2', role: 'MEMBER', endedAt: null as Date | null },
]
const OBJECTIVES: Record<string, { level: string; ownerId: string; departmentId: string | null; isPrivate: boolean }> = {
  'o-emp2-private': { level: 'INDIVIDUAL', ownerId: 'emp2', departmentId: 'd2', isPrivate: true },
  'o-emp1': { level: 'INDIVIDUAL', ownerId: 'emp1', departmentId: 'd1', isPrivate: false },
}

// Subset of scripts/seed-permissions.ts (objective / key_result rows).
const SEED: Record<string, Partial<Record<Role, string[]>>> = {
  objective: {
    EXECUTIVE: ['canRead', 'canWrite', 'canCreate', 'canDelete'],
    DEPARTMENT_LEAD: ['canRead', 'canWrite', 'canCreate', 'canDelete'],
    EMPLOYEE: ['canRead', 'canWrite', 'canCreate'],
  },
  key_result: {
    EXECUTIVE: ['canRead', 'canWrite', 'canCreate', 'canDelete'],
    DEPARTMENT_LEAD: ['canRead', 'canWrite', 'canCreate', 'canDelete'],
    EMPLOYEE: ['canRead', 'canWrite', 'canCreate'],
  },
}

let doctypeMode: 'unseeded' | 'seeded' | 'throws' = 'unseeded'
let featureMode: 'deny' | 'grant' | 'throws' = 'deny'

const liveOnly = (where: any, row: { endedAt: Date | null }) =>
  where.endedAt === null ? row.endedAt === null : true

const fakePrisma = {
  managerRelationship: {
    async findFirst({ where }: any) {
      return RELS.find((r) => r.managerId === where.managerId && r.directReportId === where.directReportId && liveOnly(where, r)) ?? null
    },
    async findMany({ where }: any) {
      const ids: string[] | undefined = where.directReportId?.in
      return RELS.filter((r) => r.managerId === where.managerId && liveOnly(where, r) && (!ids || ids.includes(r.directReportId)))
    },
  },
  departmentMembership: {
    async findMany({ where }: any) {
      return MEMS.filter((m) => m.userId === where.userId)
    },
    async findFirst({ where }: any) {
      return MEMS.find((m) => m.userId === where.userId && m.departmentId === where.departmentId
        && (where.role ? m.role === where.role : true) && liveOnly(where, m)) ?? null
    },
  },
  objective: {
    async findUnique({ where }: any) {
      return OBJECTIVES[where.id] ?? null
    },
  },
  // ── permission tables (lib/permission-resolver.ts) ──
  userRole: {
    async findMany() {
      if (doctypeMode === 'throws') throw new Error('permission tables unavailable')
      return []
    },
  },
  userRoleProfile: { async findMany() { return [] } },
  user: {
    async findUnique({ where }: any) {
      const role = USERS[where.id]
      return role ? { role } : null
    },
  },
  userPermissionOverride: {
    async findFirst({ where }: any) {
      if (featureMode === 'throws' && where.featureKey !== undefined) throw new Error('feature table unavailable')
      return null
    },
  },
  roleDocTypePermission: {
    async findFirst({ where }: any) {
      if (doctypeMode !== 'seeded') return null
      const flag = Object.keys(where).find((k) => k.startsWith('can'))!
      const roleKeys = (where.roleId.in as string[]).map((id) => id.replace(/^legacy-/, '') as Role)
      const granted = roleKeys.some((r) => SEED[where.doctypeKey]?.[r]?.includes(flag))
      return granted ? { id: 'rdp' } : null
    },
  },
  featurePermission: {
    async findFirst() {
      return featureMode === 'grant' ? { id: 'fp' } : null
    },
  },
}
;(globalThis as any).prisma = fakePrisma

async function load() {
  const rbac = await import('./rbac')
  const perms = await import('./permissions')
  const { permissionCache } = await import('./permission-cache')
  return { rbac, perms, permissionCache }
}

const actor = (id: string) => ({ userId: id, role: USERS[id] })
const ROLES_IN_ORDER = ['admin', 'exec', 'lead', 'emp1'] as const

async function withMode<T>(mode: typeof doctypeMode, fn: () => Promise<T>): Promise<T> {
  const { permissionCache } = await load()
  doctypeMode = mode
  permissionCache.invalidateAll()
  try {
    return await fn()
  } finally {
    doctypeMode = 'unseeded'
    permissionCache.invalidateAll()
  }
}

// ---------------------------------------------------------------------------
// Pure role helpers (lib/permissions.ts)
// ---------------------------------------------------------------------------

test('permissions: settings / user / timeframe / org management are ADMIN + EXECUTIVE only', async () => {
  const { perms } = await load()
  const expected: Record<Role, boolean> = { ADMIN: true, EXECUTIVE: true, DEPARTMENT_LEAD: false, EMPLOYEE: false }
  for (const role of Object.keys(expected) as Role[]) {
    assert.equal(perms.canAccessSettings(role), expected[role], `settings ${role}`)
    assert.equal(perms.canManageUsers(role), expected[role], `users ${role}`)
    assert.equal(perms.canManageTimeframes(role), expected[role], `timeframes ${role}`)
    assert.equal(perms.canManageOrg(role), expected[role], `org ${role}`)
  }
  assert.equal(perms.canSetCeo('ADMIN'), true)
  for (const role of ['EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE'] as Role[]) assert.equal(perms.canSetCeo(role), false, role)
})

test('permissions: canCreateObjective level × role matrix', async () => {
  const { perms } = await load()
  const table: Array<[Role, 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL', boolean]> = [
    ['ADMIN', 'COMPANY', true], ['ADMIN', 'DEPARTMENT', true], ['ADMIN', 'INDIVIDUAL', true],
    ['EXECUTIVE', 'COMPANY', true], ['EXECUTIVE', 'DEPARTMENT', true], ['EXECUTIVE', 'INDIVIDUAL', true],
    ['DEPARTMENT_LEAD', 'COMPANY', false], ['DEPARTMENT_LEAD', 'DEPARTMENT', true], ['DEPARTMENT_LEAD', 'INDIVIDUAL', true],
    ['EMPLOYEE', 'COMPANY', false], ['EMPLOYEE', 'DEPARTMENT', false], ['EMPLOYEE', 'INDIVIDUAL', true],
  ]
  for (const [role, level, want] of table) assert.equal(perms.canCreateObjective(role, level), want, `${role} ${level}`)
})

test('permissions: canCreateProject — leadership roles or the explicit PM capability', async () => {
  const { perms } = await load()
  assert.equal(perms.canCreateProject({ role: 'ADMIN' }), true)
  assert.equal(perms.canCreateProject({ role: 'EXECUTIVE' }), true)
  assert.equal(perms.canCreateProject({ role: 'DEPARTMENT_LEAD' }), true)
  assert.equal(perms.canCreateProject({ role: 'EMPLOYEE' }), false)
  assert.equal(perms.canCreateProject({ role: 'EMPLOYEE', isProjectManager: true }), true)
  assert.equal(perms.canCreateProject({ role: 'EMPLOYEE', isProjectManager: null }), false)
})

test('permissions: canDeleteKeyResult — ADMIN or the parent objective owner (not EXECUTIVE)', async () => {
  const { perms } = await load()
  assert.equal(perms.canDeleteKeyResult('ADMIN', 'admin', 'emp1'), true)
  assert.equal(perms.canDeleteKeyResult('EMPLOYEE', 'emp1', 'emp1'), true)
  assert.equal(perms.canDeleteKeyResult('EXECUTIVE', 'exec', 'emp1'), false)
  assert.equal(perms.canDeleteKeyResult('DEPARTMENT_LEAD', 'lead', 'emp1'), false)
})

test('permissions: canEditObjective — owner, admin roles, dept lead on own dept / live direct reports', async () => {
  const { perms } = await load()
  const cases: Array<[string, { level: string; ownerId: string; departmentId: string | null }, boolean]> = [
    ['emp1', { level: 'INDIVIDUAL', ownerId: 'emp1', departmentId: null }, true],
    ['emp1', { level: 'INDIVIDUAL', ownerId: 'emp2', departmentId: null }, false],
    ['admin', { level: 'COMPANY', ownerId: 'exec', departmentId: null }, true],
    ['exec', { level: 'INDIVIDUAL', ownerId: 'emp2', departmentId: null }, true],
    ['lead', { level: 'INDIVIDUAL', ownerId: 'emp1', departmentId: null }, true], // live direct report
    ['lead', { level: 'INDIVIDUAL', ownerId: 'emp2', departmentId: null }, false], // ended relationship
    ['lead', { level: 'DEPARTMENT', ownerId: 'admin', departmentId: 'd1' }, true], // own department
    ['lead', { level: 'DEPARTMENT', ownerId: 'admin', departmentId: 'd2' }, false],
    ['lead', { level: 'COMPANY', ownerId: 'admin', departmentId: 'd1' }, false],
    ['emp1', { level: 'DEPARTMENT', ownerId: 'lead', departmentId: 'd1' }, false], // membership alone is not enough
  ]
  for (const [uid, obj, want] of cases) {
    assert.equal(await perms.canEditObjective(USERS[uid], uid, obj), want, `${uid} → ${JSON.stringify(obj)}`)
  }
})

test('permissions: canEditKeyResult — owner, admin roles, dept lead over live direct reports only', async () => {
  const { perms } = await load()
  const kr = (ownerId: string) => ({ ownerId, objectiveId: 'o-emp1' })
  assert.equal(await perms.canEditKeyResult('EMPLOYEE', 'emp1', kr('emp1')), true)
  assert.equal(await perms.canEditKeyResult('EMPLOYEE', 'emp2', kr('emp1')), false)
  assert.equal(await perms.canEditKeyResult('EXECUTIVE', 'exec', kr('emp1')), true)
  assert.equal(await perms.canEditKeyResult('DEPARTMENT_LEAD', 'lead', kr('emp1')), true)
  assert.equal(await perms.canEditKeyResult('DEPARTMENT_LEAD', 'lead', kr('emp2')), false)
})

test('permissions: redactObjective / redactKeyResult hide text and values but keep progress', async () => {
  const { perms } = await load()
  const o = perms.redactObjective({ id: 'o', title: 'Secret', description: 'd', progress: 42, level: 'INDIVIDUAL' })
  assert.equal(o.title, '[Private Objective]')
  assert.equal(o.description, null)
  assert.equal(o.progress, 42)
  const k = perms.redactKeyResult({ id: 'k', title: 'Secret', description: 'd', startValue: 5, targetValue: 900, currentValue: 300, unit: 'ETB', progress: 33, confidence: 'AT_RISK' })
  assert.deepEqual(
    [k.title, k.description, k.startValue, k.targetValue, k.currentValue, k.unit, k.progress, k.confidence],
    ['[Private Key Result]', null, 0, 0, 0, '', 33, 'AT_RISK'],
  )
})

// ---------------------------------------------------------------------------
// can() with the permission tables unseeded → legacy rules decide
// ---------------------------------------------------------------------------

type Row = { action: string; ctx: (uid: string) => any; want: Record<(typeof ROLES_IN_ORDER)[number], boolean> }

const MATRIX: Row[] = [
  { action: 'user.create', ctx: () => ({}), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'user.deactivate', ctx: () => ({}), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'user.assignRole', ctx: () => ({}), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'user.resetPassword', ctx: () => ({}), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'department.create', ctx: () => ({}), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'settings.access', ctx: () => ({}), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'timeframe.manage', ctx: () => ({}), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'audit.export', ctx: () => ({}), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'notifications.configureOrgDefaults', ctx: () => ({}), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'notifications.editOwnPreferences', ctx: () => ({}), want: { admin: true, exec: true, lead: true, emp1: true } },
  { action: 'orgChart.view', ctx: () => ({}), want: { admin: true, exec: true, lead: true, emp1: true } },
  { action: 'user.changeOwnPassword', ctx: (uid) => ({ targetUser: { id: uid } }), want: { admin: true, exec: true, lead: true, emp1: true } },
  { action: 'user.changeOwnPassword', ctx: () => ({ targetUser: { id: 'emp2' } }), want: { admin: false, exec: false, lead: false, emp1: false } },
  { action: 'objective.create', ctx: () => ({ objective: { level: 'COMPANY', ownerId: 'x' } }), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'objective.create', ctx: () => ({ objective: { level: 'DEPARTMENT', ownerId: 'x' } }), want: { admin: true, exec: true, lead: true, emp1: false } },
  { action: 'objective.create', ctx: () => ({}), want: { admin: true, exec: true, lead: true, emp1: true } }, // defaults to INDIVIDUAL
  { action: 'objective.edit', ctx: (uid) => ({ objective: { level: 'INDIVIDUAL', ownerId: uid } }), want: { admin: true, exec: true, lead: true, emp1: true } },
  { action: 'objective.edit', ctx: () => ({ objective: { level: 'INDIVIDUAL', ownerId: 'emp2' } }), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'objective.edit', ctx: () => ({ objective: { level: 'COMPANY', ownerId: 'exec' } }), want: { admin: true, exec: true, lead: false, emp1: false } },
  // No resource: denied, except ADMIN — the resolver's ADMIN shortcut (legacy
  // User.role synthesised when the tables are unseeded) grants before any row check.
  { action: 'objective.edit', ctx: () => ({}), want: { admin: true, exec: false, lead: false, emp1: false } },
  { action: 'objective.delete', ctx: () => ({ objective: { level: 'INDIVIDUAL', ownerId: 'emp2' } }), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'objective.align', ctx: (uid) => ({ objective: { level: 'INDIVIDUAL', ownerId: uid } }), want: { admin: true, exec: true, lead: true, emp1: true } },
  { action: 'objective.approveAlignment', ctx: () => ({ objective: { level: 'INDIVIDUAL', ownerId: 'emp1' } }), want: { admin: true, exec: true, lead: true, emp1: false } },
  { action: 'objective.approveAlignment', ctx: () => ({ objective: { level: 'INDIVIDUAL', ownerId: 'emp2' } }), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'keyResult.create', ctx: () => ({ objective: { level: 'INDIVIDUAL', ownerId: 'emp1' } }), want: { admin: true, exec: false, lead: false, emp1: false } }, // no objective id (ADMIN shortcut)
  { action: 'keyResult.create', ctx: () => ({ objective: { id: 'o-emp1', level: 'INDIVIDUAL', ownerId: 'emp1' } }), want: { admin: true, exec: true, lead: true, emp1: true } },
  { action: 'keyResult.create', ctx: () => ({ objective: { id: 'o-emp2-private', level: 'INDIVIDUAL', ownerId: 'emp2' } }), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'keyResult.edit', ctx: () => ({ keyResult: { ownerId: 'emp2', objectiveId: 'o-emp2-private' } }), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'keyResult.edit', ctx: () => ({ keyResult: { ownerId: 'emp2', objectiveId: 'o-emp1' }, objective: { level: 'INDIVIDUAL', ownerId: 'emp1' } }), want: { admin: true, exec: true, lead: true, emp1: true } },
  { action: 'keyResult.checkIn', ctx: (uid) => ({ keyResult: { ownerId: uid, objectiveId: 'o-emp1' } }), want: { admin: true, exec: true, lead: true, emp1: true } },
  { action: 'keyResult.delete', ctx: () => ({ keyResult: { ownerId: 'emp1', objectiveId: 'o-emp1' }, objective: { level: 'INDIVIDUAL', ownerId: 'emp1' } }), want: { admin: true, exec: false, lead: false, emp1: true } },
  { action: 'keyResult.delete', ctx: () => ({ keyResult: { ownerId: 'emp1', objectiveId: 'o-emp1' } }), want: { admin: true, exec: false, lead: false, emp1: false } }, // needs objective ctx (ADMIN shortcut)
  { action: 'todo.create', ctx: () => ({}), want: { admin: true, exec: true, lead: true, emp1: true } },
  { action: 'todo.edit', ctx: () => ({ todo: { assigneeId: 'emp1', creatorId: 'emp2' } }), want: { admin: true, exec: true, lead: true, emp1: true } },
  { action: 'todo.delete', ctx: () => ({ todo: { assigneeId: 'emp2', creatorId: 'emp2' } }), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'todo.assign', ctx: () => ({ todo: { assigneeId: 'x', creatorId: 'x' }, targetUser: { id: 'emp1' } }), want: { admin: true, exec: true, lead: true, emp1: true } },
  { action: 'todo.assign', ctx: () => ({ todo: { assigneeId: 'x', creatorId: 'x' }, targetUser: { id: 'emp2' } }), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'comment.edit', ctx: (uid) => ({ extra: { authorId: uid } }), want: { admin: true, exec: true, lead: true, emp1: true } },
  { action: 'comment.delete', ctx: () => ({ extra: { authorId: 'emp2' } }), want: { admin: true, exec: true, lead: false, emp1: false } },
  { action: 'watcher.add', ctx: () => ({}), want: { admin: true, exec: true, lead: true, emp1: true } },
]

test('can(): role matrix with unseeded permission tables (legacy rules)', async () => {
  const { rbac, permissionCache } = await load()
  permissionCache.invalidateAll()
  const failures: string[] = []
  for (const row of MATRIX) {
    for (const uid of ROLES_IN_ORDER) {
      const got = await rbac.can(row.action as any, { actor: actor(uid), ...row.ctx(uid) })
      if (got !== row.want[uid]) failures.push(`${row.action} ${uid} ${JSON.stringify(row.ctx(uid))}: got ${got}, want ${row.want[uid]}`)
    }
  }
  assert.deepEqual(failures, [])
})

test('can(): a throwing permission resolver falls back to the legacy rules (never grants on error)', async () => {
  const { rbac } = await load()
  await withMode('throws', async () => {
    assert.equal(await rbac.can('user.create', { actor: actor('emp1') }), false)
    assert.equal(await rbac.can('objective.create', { actor: actor('emp1'), objective: { level: 'COMPANY', ownerId: 'emp1' } }), false)
    assert.equal(await rbac.can('user.create', { actor: actor('exec') }), true)
  })
})

test('can(): a seeded doctype grant short-circuits to true', async () => {
  const { rbac } = await load()
  await withMode('seeded', async () => {
    // EMPLOYEE has objective.canCreate in the seed → INDIVIDUAL create stays allowed.
    assert.equal(await rbac.can('objective.create', { actor: actor('emp1'), objective: { level: 'INDIVIDUAL', ownerId: 'emp1' } }), true)
    // No user doctype rows for EMPLOYEE → legacy rule denies.
    assert.equal(await rbac.can('user.create', { actor: actor('emp1') }), false)
  })
})

// BUG: lib/rbac.ts:167 — the doctype short-circuit ignores row-level rules. The
// seed (scripts/seed-permissions.ts:402-417) grants EMPLOYEE objective/key_result
// canWrite+canCreate and DEPARTMENT_LEAD canDelete, so once the tables are seeded
// `can('objective.edit')` lets any employee edit anyone's objective,
// `can('objective.create', COMPANY)` lets an employee create company objectives,
// and a lead may delete any KR. `can()` has no route callers today, so this is
// latent — but the file header says every route MUST use it.
test('BUG: can() with seeded tables still enforces ownership / level rules', async () => {
  const { rbac } = await load()
  await withMode('seeded', async () => {
    assert.equal(await rbac.can('objective.edit', { actor: actor('emp1'), objective: { level: 'INDIVIDUAL', ownerId: 'emp2' } }), false)
    assert.equal(await rbac.can('objective.create', { actor: actor('emp1'), objective: { level: 'COMPANY', ownerId: 'emp1' } }), false)
    assert.equal(await rbac.can('keyResult.delete', { actor: actor('lead'), keyResult: { ownerId: 'emp2', objectiveId: 'o-emp2-private' }, objective: { level: 'INDIVIDUAL', ownerId: 'emp2' } }), false)
  })
})

// BUG: lib/rbac.ts:196-203 — `objective.delete` / `objective.archive` reuse
// canEditObjective, so a DEPARTMENT_LEAD may delete a direct report's objective
// (or any DEPARTMENT objective in their department), while the real DELETE route
// uses canDeleteObjective (ADMIN / EXECUTIVE / owner only, lib/okr/action-permissions.ts).
test('BUG: can(objective.delete) agrees with canDeleteObjective', async () => {
  const { rbac, perms } = await load()
  const objective = { level: 'INDIVIDUAL', ownerId: 'emp1' }
  assert.equal(perms.canDeleteObjective('DEPARTMENT_LEAD', 'lead', objective), false)
  assert.equal(await rbac.can('objective.delete', { actor: actor('lead'), objective }), false)
})

test('can(): objective.view / keyResult.view delegate to the visibility rules', async () => {
  const { rbac } = await load()
  // Every signed-in role may view (private rows are redacted, not hidden).
  for (const uid of ROLES_IN_ORDER) {
    assert.equal(await rbac.can('objective.view', { actor: actor(uid), objective: { level: 'INDIVIDUAL', ownerId: 'emp2', isPrivate: true } }), true, uid)
  }
  assert.equal(await rbac.can('keyResult.view', { actor: actor('emp1'), keyResult: { ownerId: 'emp2', objectiveId: 'missing' } }), false)
  assert.equal(await rbac.can('keyResult.view', { actor: actor('emp1'), keyResult: { ownerId: 'emp2', objectiveId: 'o-emp2-private' } }), true)
})

test('canDetailed / assertCan: reason and ForbiddenError', async () => {
  const { rbac } = await load()
  assert.deepEqual(await rbac.canDetailed('settings.access', { actor: actor('admin') }), { allowed: true })
  assert.deepEqual(await rbac.canDetailed('settings.access', { actor: actor('emp1') }), { allowed: false, reason: 'Role EMPLOYEE cannot settings.access' })
  await assert.rejects(rbac.assertCan('user.create', { actor: actor('lead') }), (e: any) => e instanceof rbac.ForbiddenError && e.code === 'FORBIDDEN')
  await rbac.assertCan('user.create', { actor: actor('exec') })
})

test('canDocType: resolver result, fallback role on error, false without fallback', async () => {
  const { rbac } = await load()
  await withMode('seeded', async () => {
    assert.equal(await rbac.canDocType('emp1', 'objective', 'create'), true)
    assert.equal(await rbac.canDocType('emp1', 'objective', 'delete'), false)
  })
  await withMode('throws', async () => {
    assert.equal(await rbac.canDocType('emp1', 'objective', 'read'), false)
    // Fallback also reads the (throwing) role tables → still false, never a grant.
    assert.equal(await rbac.canDocType('emp1', 'objective', 'read', 'EMPLOYEE'), false)
  })
})

test('canFeature: grant / deny from the table; fails OPEN when the lookup throws', async () => {
  const { rbac, permissionCache } = await load()
  try {
    permissionCache.invalidateAll()
    featureMode = 'grant'
    assert.equal(await rbac.canFeature('emp1', 'dtp'), true)
    permissionCache.invalidateAll()
    featureMode = 'deny'
    assert.equal(await rbac.canFeature('emp1', 'dtp'), false)
    permissionCache.invalidateAll()
    featureMode = 'throws'
    // Documented behaviour (lib/rbac.ts:376): fail open. Contrast withFeature, which fails closed.
    assert.equal(await rbac.canFeature('emp1', 'dtp'), true)
  } finally {
    featureMode = 'deny'
    permissionCache.invalidateAll()
  }
})
