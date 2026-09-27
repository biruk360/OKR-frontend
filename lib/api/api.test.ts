import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * lib/api: the auth wrappers (withAuth / withRole / withFeature /
 * withRoleOrFeature), the response envelope helpers and handleApiError.
 *
 * Sessions are driven through the Bearer path (getBearerSession): a real
 * next-auth JWT is minted with `nextAuthSecret`, and a fake Prisma client on
 * `globalThis.prisma` answers the per-request user lookup (isActive,
 * passwordChangedAt, role). The cookie path has no request scope under
 * node:test, so getServerSessionSafe resolves to null — i.e. "no session".
 */

type DbUser = { role: string; isActive: boolean; isProjectManager: boolean; passwordChangedAt: Date | null }
const DB_USERS: Record<string, DbUser> = {}
let featureMode: 'grant' | 'deny' | 'throws' = 'deny'
let featureLookups = 0

;(globalThis as any).prisma = {
  user: {
    async findUnique({ where }: any) {
      return DB_USERS[where.id] ?? null
    },
  },
  // permission-resolver tables (withFeature / withRoleOrFeature)
  userRole: {
    async findMany() {
      featureLookups++
      if (featureMode === 'throws') throw new Error('permission tables unavailable')
      return []
    },
  },
  userRoleProfile: { async findMany() { return [] } },
  userPermissionOverride: { async findFirst() { return null } },
  featurePermission: {
    async findFirst() {
      return featureMode === 'grant' ? { id: 'fp' } : null
    },
  },
}

// Keep the handler-error logging out of the test output.
const originalConsoleError = console.error
console.error = () => {}
test.after(() => { console.error = originalConsoleError })

async function load() {
  const api = await import('./index')
  const { nextAuthSecret } = await import('@/lib/auth')
  const { encode } = await import('next-auth/jwt')
  const { NextRequest } = await import('next/server')
  const { permissionCache } = await import('@/lib/permission-cache')
  return { api, nextAuthSecret, encode, NextRequest, permissionCache }
}

let seq = 0
async function bearer(userId: string, claims: Record<string, unknown> = {}) {
  const { nextAuthSecret, encode } = await load()
  return encode({
    token: { sub: userId, email: `${userId}@example.test`, name: userId, role: 'EMPLOYEE', isProjectManager: false, authTime: Date.now(), ...claims },
    secret: nextAuthSecret!,
    maxAge: 3600,
  })
}

async function req(token?: string, path = '/api/thing') {
  const { NextRequest } = await load()
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return new NextRequest(`http://localhost${path}?n=${++seq}`, { method: 'GET', headers })
}

function user(id: string, role: string, extra: Partial<DbUser> = {}) {
  DB_USERS[id] = { role, isActive: true, isProjectManager: false, passwordChangedAt: null, ...extra }
  return id
}

async function body(res: Response) {
  return JSON.parse(await res.text())
}

// ── withAuth ────────────────────────────────────────────────────────────────

test('withAuth: no session → 401 envelope, handler never runs', async () => {
  const { api } = await load()
  let called = false
  const h = api.withAuth(async () => { called = true; return api.apiSuccess(1) })
  const res = await h(await req())
  assert.equal(res.status, 401)
  assert.deepEqual(await body(res), { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
  assert.equal(called, false)
})

test('withAuth: a valid bearer session reaches the handler with DB role and route params', async () => {
  const { api } = await load()
  const uid = user('u-ok', 'EXECUTIVE', { isProjectManager: true })
  // Token claims no role — the role always comes from the DB row.
  const token = await bearer(uid, { role: 'EMPLOYEE' })
  const h = api.withAuth<{ id: string }>(async (_req, { session, params }) =>
    api.apiSuccess({ id: session.user.id, role: session.user.role, pm: session.user.isProjectManager, param: params.id }))
  const res = await h(await req(token), { params: { id: 'abc' } })
  assert.equal(res.status, 200)
  assert.deepEqual(await body(res), { success: true, data: { id: uid, role: 'EXECUTIVE', pm: true, param: 'abc' } })
})

test('withAuth: missing params default to {}', async () => {
  const { api } = await load()
  const token = await bearer(user('u-params', 'EMPLOYEE'))
  const h = api.withAuth(async (_req, { params }) => api.apiSuccess(params))
  assert.deepEqual(await body(await h(await req(token))), { success: true, data: {} })
})

test('withAuth: inactive, deleted or garbage-token users are rejected with 401', async () => {
  const { api } = await load()
  const h = api.withAuth(async () => api.apiSuccess('should not run'))
  const inactive = await bearer(user('u-inactive', 'ADMIN', { isActive: false }))
  assert.equal((await h(await req(inactive))).status, 401)
  const ghost = await bearer('u-does-not-exist')
  assert.equal((await h(await req(ghost))).status, 401)
  assert.equal((await h(await req('not-a-jwt'))).status, 401)
})

test('withAuth: a token minted before passwordChangedAt is revoked; one minted after is accepted', async () => {
  const { api } = await load()
  const h = api.withAuth(async () => api.apiSuccess('ok'))
  const changedAt = new Date('2026-09-01T00:00:00Z')
  const uid = user('u-pw', 'EMPLOYEE', { passwordChangedAt: changedAt })
  const stale = await bearer(uid, { authTime: changedAt.getTime() - 1 })
  const fresh = await bearer(uid, { authTime: changedAt.getTime() + 1 })
  assert.equal((await h(await req(stale))).status, 401)
  assert.equal((await h(await req(fresh))).status, 200)
})

test('withAuth: thrown errors map through handleApiError (P2002 → 409, P2025 → 404, other → 500)', async () => {
  const { api } = await load()
  const token = await bearer(user('u-err', 'EMPLOYEE'))
  const throwing = (err: unknown) => api.withAuth(async () => { throw err })
  const conflict = await throwing(Object.assign(new Error('dup'), { code: 'P2002', meta: { target: ['email'] } }))(await req(token))
  assert.equal(conflict.status, 409)
  assert.equal((await body(conflict)).code, 'CONFLICT')
  const missing = await throwing(Object.assign(new Error('gone'), { code: 'P2025' }))(await req(token))
  assert.equal(missing.status, 404)
  const boom = await throwing(new Error('boom'))(await req(token))
  assert.equal(boom.status, 500)
  assert.equal((await body(boom)).code, 'INTERNAL_ERROR')
})

// ── withRole ────────────────────────────────────────────────────────────────

test('withRole: 403 for roles outside the list, 401 without a session, string or array form', async () => {
  const { api } = await load()
  const h = api.withRole(['ADMIN', 'EXECUTIVE'], async () => api.apiSuccess('ok'))
  const single = api.withRole('ADMIN', async () => api.apiSuccess('ok'))
  const emp = await bearer(user('r-emp', 'EMPLOYEE'))
  const lead = await bearer(user('r-lead', 'DEPARTMENT_LEAD'))
  const exec = await bearer(user('r-exec', 'EXECUTIVE'))
  const admin = await bearer(user('r-admin', 'ADMIN'))
  assert.equal((await h(await req())).status, 401)
  const denied = await h(await req(emp))
  assert.equal(denied.status, 403)
  assert.deepEqual(await body(denied), { success: false, error: 'Insufficient permissions', code: 'FORBIDDEN' })
  assert.equal((await h(await req(lead))).status, 403)
  assert.equal((await h(await req(exec))).status, 200)
  assert.equal((await h(await req(admin))).status, 200)
  assert.equal((await single(await req(exec))).status, 403)
  assert.equal((await single(await req(admin))).status, 200)
})

// ── withFeature / withRoleOrFeature ─────────────────────────────────────────

async function withFeatureMode<T>(mode: typeof featureMode, fn: () => Promise<T>) {
  const { permissionCache } = await load()
  featureMode = mode
  permissionCache.invalidateAll()
  try {
    return await fn()
  } finally {
    featureMode = 'deny'
    permissionCache.invalidateAll()
  }
}

test('withFeature: ADMIN bypasses the lookup; grant → handler; deny → 403 "Feature not available"', async () => {
  const { api } = await load()
  const h = api.withFeature('dtp', async () => api.apiSuccess('ok'))
  const admin = await bearer(user('f-admin', 'ADMIN'))
  const emp = await bearer(user('f-emp', 'EMPLOYEE'))
  await withFeatureMode('throws', async () => {
    const before = featureLookups
    assert.equal((await h(await req(admin))).status, 200)
    assert.equal(featureLookups, before, 'ADMIN must not hit the permission tables')
  })
  await withFeatureMode('grant', async () => {
    assert.equal((await h(await req(emp))).status, 200)
  })
  await withFeatureMode('deny', async () => {
    const res = await h(await req(emp))
    assert.equal(res.status, 403)
    assert.equal((await body(res)).error, 'Feature not available')
  })
})

test('withFeature: a lookup that throws is a denial (fail closed)', async () => {
  const { api } = await load()
  let ran = false
  const h = api.withFeature('dtp', async () => { ran = true; return api.apiSuccess('ok') })
  const emp = await bearer(user('f-emp2', 'EMPLOYEE'))
  await withFeatureMode('throws', async () => {
    const res = await h(await req(emp))
    assert.equal(res.status, 403)
    assert.deepEqual(await body(res), { success: false, error: 'Unable to verify permissions', code: 'FORBIDDEN' })
  })
  assert.equal(ran, false)
})

test('withRoleOrFeature: allowed role skips the lookup; otherwise feature grant decides; throw fails closed', async () => {
  const { api } = await load()
  const h = api.withRoleOrFeature(['EXECUTIVE'], 'reports', async () => api.apiSuccess('ok'))
  const exec = await bearer(user('rf-exec', 'EXECUTIVE'))
  const emp = await bearer(user('rf-emp', 'EMPLOYEE'))
  await withFeatureMode('throws', async () => {
    assert.equal((await h(await req(exec))).status, 200)
    const res = await h(await req(emp))
    assert.equal(res.status, 403)
    assert.equal((await body(res)).error, 'Unable to verify permissions')
  })
  await withFeatureMode('grant', async () => {
    assert.equal((await h(await req(emp))).status, 200)
  })
  await withFeatureMode('deny', async () => {
    const res = await h(await req(emp))
    assert.equal(res.status, 403)
    assert.equal((await body(res)).error, 'Insufficient permissions')
  })
})

// ── envelopes ───────────────────────────────────────────────────────────────

test('apiSuccess / apiPaginated envelopes', async () => {
  const { api } = await load()
  const ok = api.apiSuccess({ a: 1 })
  assert.equal(ok.status, 200)
  assert.deepEqual(await body(ok), { success: true, data: { a: 1 } })
  const created = api.apiSuccess([1], { status: 201, message: 'made' })
  assert.equal(created.status, 201)
  assert.deepEqual(await body(created), { success: true, data: [1], message: 'made' })

  const page = api.apiPaginated([1, 2], { page: 2, limit: 2, total: 5 })
  assert.deepEqual(await body(page), { success: true, data: [1, 2], pagination: { page: 2, limit: 2, total: 5, totalPages: 3 } })
  const zeroLimit = api.apiPaginated([], { page: 1, limit: 0, total: 4 })
  assert.equal((await body(zeroLimit)).pagination.totalPages, 4, 'limit 0 must not divide by zero')
  const explicit = api.apiPaginated([], { page: 1, limit: 10, total: 0, totalPages: 7 })
  assert.equal((await body(explicit)).pagination.totalPages, 7)
})

test('error envelopes: status + machine code per helper; details only when given', async () => {
  const { api } = await load()
  const cases: Array<[Response, number, string]> = [
    [api.apiUnauthorized(), 401, 'UNAUTHORIZED'],
    [api.apiForbidden(), 403, 'FORBIDDEN'],
    [api.apiNotFound(), 404, 'NOT_FOUND'],
    [api.apiBadRequest('bad'), 400, 'BAD_REQUEST'],
    [api.apiValidationError('invalid'), 422, 'VALIDATION_ERROR'],
    [api.apiConflict('dup'), 409, 'CONFLICT'],
    [api.apiLocked('closed'), 423, 'OKR_LOCKED'],
  ]
  for (const [res, status, code] of cases) {
    assert.equal(res.status, status, code)
    const b = await body(res)
    assert.equal(b.success, false)
    assert.equal(b.code, code)
    assert.equal(typeof b.error, 'string')
    assert.equal('details' in b, false, `${code} must omit undefined details`)
  }
  assert.deepEqual(await body(api.apiBadRequest('bad', { field: 'x' })), { success: false, error: 'bad', code: 'BAD_REQUEST', details: { field: 'x' } })
  const plain = api.apiError('oops')
  assert.equal(plain.status, 500)
  assert.deepEqual(await body(plain), { success: false, error: 'oops' })
})

test('handleApiError: Prisma codes, and details hidden in production', async () => {
  const { api } = await load()
  const env = process.env as Record<string, string | undefined>
  const prev = env.NODE_ENV
  try {
    env.NODE_ENV = 'test'
    const dup = await body(api.handleApiError(Object.assign(new Error('x'), { code: 'P2002', meta: { target: ['email'] } }), 'POST /x'))
    assert.deepEqual(dup, { success: false, error: 'A record with these unique fields already exists.', code: 'CONFLICT', details: { target: ['email'] } })
    const gone = api.handleApiError({ code: 'P2025' })
    assert.equal(gone.status, 404)
    assert.deepEqual(await body(gone), { success: false, error: 'The requested record was not found.', code: 'NOT_FOUND' })
    const other = await body(api.handleApiError('string failure'))
    assert.deepEqual(other, { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR', details: { message: 'string failure' } })

    env.NODE_ENV = 'production'
    const prodDup = await body(api.handleApiError({ code: 'P2002', meta: { target: ['secret_col'] } }))
    assert.equal('details' in prodDup, false)
    const prodOther = await body(api.handleApiError(new Error('db password is hunter2')))
    assert.deepEqual(prodOther, { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' })
  } finally {
    env.NODE_ENV = prev
  }
})
