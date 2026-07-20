import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { apiLocked } from '@/lib/api'

/**
 * Phase 2 gate (see docs/okr_period_close_IMPLEMENTATION_INSTRUCTIONS.md).
 *
 * The period-close lock must be enforced server-side on EVERY mutating OKR
 * endpoint. This suite is the regression barrier: if someone adds a new mutating
 * route to the OKR graph (or removes a guard), the static wiring scan below fails.
 */

const ROOT = path.resolve(__dirname, '..', '..')

// Every mutating OKR route + the guard it must call. Adding a new mutating route
// under objectives/[id] or keyresults/[id] MUST add it here with its guard.
const GUARDED_ROUTES: Array<{ file: string; guard: string }> = [
  { file: 'app/api/objectives/[id]/route.ts', guard: 'objectiveLockResponse' },
  { file: 'app/api/objectives/[id]/archive/route.ts', guard: 'objectiveLockResponse' },
  { file: 'app/api/objectives/[id]/unarchive/route.ts', guard: 'objectiveLockResponse' },
  { file: 'app/api/objectives/[id]/complete/route.ts', guard: 'objectiveLockResponse' },
  { file: 'app/api/objectives/[id]/weights/route.ts', guard: 'objectiveLockResponse' },
  { file: 'app/api/objectives/[id]/labels/route.ts', guard: 'objectiveLockResponse' },
  { file: 'app/api/objectives/[id]/request-checkin/route.ts', guard: 'objectiveLockResponse' },
  { file: 'app/api/keyresults/[id]/route.ts', guard: 'keyResultLockResponse' },
  { file: 'app/api/keyresults/[id]/check-ins/route.ts', guard: 'keyResultLockResponse' },
  { file: 'app/api/keyresults/[id]/archive/route.ts', guard: 'keyResultLockResponse' },
  { file: 'app/api/keyresults/[id]/unarchive/route.ts', guard: 'keyResultLockResponse' },
  { file: 'app/api/keyresults/[id]/complete/route.ts', guard: 'keyResultLockResponse' },
  { file: 'app/api/keyresults/[id]/request-checkin/route.ts', guard: 'keyResultLockResponse' },
  { file: 'app/api/keyresults/[id]/todos/route.ts', guard: 'keyResultLockResponse' },
]

// Routes intentionally exempt on a closed OKR (read/append-only or non-mutating
// to the frozen record). Asserted to NOT depend on the guard so the exemption is
// a conscious, documented choice.
const EXEMPT_ROUTES = [
  'app/api/objectives/[id]/comments/route.ts',
  'app/api/keyresults/[id]/comments/route.ts',
  'app/api/objectives/[id]/clone/route.ts',
  'app/api/keyresults/[id]/clone/route.ts',
  'app/api/objectives/[id]/views/route.ts',
  'app/api/keyresults/[id]/views/route.ts',
]

test('apiLocked returns HTTP 423 with OKR_LOCKED code', async () => {
  const res = apiLocked('locked', { reopenUrl: '/x' })
  assert.equal(res.status, 423)
  const body = await res.json()
  assert.equal(body.success, false)
  assert.equal(body.code, 'OKR_LOCKED')
})

test('every mutating OKR route imports and calls its lock guard', () => {
  for (const { file, guard } of GUARDED_ROUTES) {
    const src = readFileSync(path.join(ROOT, file), 'utf8')
    assert.match(
      src,
      /from '@\/lib\/okr\/lock-guard'/,
      `${file} must import from '@/lib/okr/lock-guard'`,
    )
    // At least one actual call site, not just the import.
    const callCount = (src.match(new RegExp(`${guard}\\s*\\(`, 'g')) || []).length
    assert.ok(callCount >= 1, `${file} must call ${guard}(...) — found ${callCount} call sites`)
  }
})

test('exempt OKR routes do not depend on the lock guard', () => {
  for (const file of EXEMPT_ROUTES) {
    const src = readFileSync(path.join(ROOT, file), 'utf8')
    assert.doesNotMatch(
      src,
      /lock-guard/,
      `${file} is documented as exempt (comments/clone/views) — it must NOT import the lock guard`,
    )
  }
})
