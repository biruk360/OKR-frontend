/**
 * Authorisation tests for the Automations module.
 *
 * access.ts is the authorisation surface for 17 API routes, so the branching is
 * pinned here directly. Everything under test is either pure or takes its data
 * access as an injected argument — no database, no network, no credentials.
 *
 * `canDocType` is deliberately NOT re-tested: it is DB-backed and fails closed,
 * which is the correct posture. What is tested is exactly which principals reach
 * it (CHECK_DOCTYPE) and which are refused before it (DENY).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  SELF_SERVICE_TOOL_IDS,
  automationManageVerdict,
  automationReadVerdict,
  briefingReadVerdict,
  filterVisibleRecipientIds,
  filterVisibleRecipients,
  isAdminRole,
  isSelfServiceTool,
  toolGrantDenialMessage,
  toolGrantVerdict,
  toolGrantsRequiringApproval,
  visibleRecipientIds,
  type Principal,
  type RecipientVisibilityFacts,
  type RecipientVisibilityLoader,
} from './access'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER: Principal = { userId: 'u-owner', role: 'DEPARTMENT_LEAD' }
const ADMIN: Principal = { userId: 'u-admin', role: 'ADMIN' }
const EXEC: Principal = { userId: 'u-exec', role: 'EXECUTIVE' }
const RECIPIENT: Principal = { userId: 'u-recipient', role: 'EMPLOYEE' }
const STRANGER: Principal = { userId: 'u-stranger', role: 'EMPLOYEE' }

const DELETED_AT = new Date('2026-09-15T10:00:00.000Z')

function automation(overrides: Partial<{ ownerId: string; deletedAt: Date | null }> = {}) {
  return { ownerId: OWNER.userId, deletedAt: null, ...overrides }
}

function briefing(
  overrides: Partial<{ ownerId: string; deletedAt: Date | null; status: string; recipientIds: string[] }> = {}
) {
  return {
    ownerId: OWNER.userId,
    deletedAt: null as Date | null,
    status: 'PUBLISHED',
    recipientIds: [RECIPIENT.userId],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// isAdminRole
// ---------------------------------------------------------------------------

test('isAdminRole covers ADMIN and EXECUTIVE only', () => {
  assert.equal(isAdminRole('ADMIN'), true)
  assert.equal(isAdminRole('EXECUTIVE'), true)
  assert.equal(isAdminRole('DEPARTMENT_LEAD'), false)
  assert.equal(isAdminRole('EMPLOYEE'), false)
})

// ---------------------------------------------------------------------------
// canManageAutomation — the write/run/delete gate
// ---------------------------------------------------------------------------

test('owner of a live automation reaches the doctype check for manage', () => {
  assert.equal(automationManageVerdict(OWNER, automation()), 'CHECK_DOCTYPE')
})

test('a soft-deleted automation can be managed by nobody, not even its owner or an ADMIN', () => {
  const dead = automation({ deletedAt: DELETED_AT })
  assert.equal(automationManageVerdict(OWNER, dead), 'DENY')
  assert.equal(automationManageVerdict(ADMIN, dead), 'DENY')
  assert.equal(automationManageVerdict(EXEC, dead), 'DENY')
})

test('ADMIN may manage an automation they do not own', () => {
  assert.equal(automationManageVerdict(ADMIN, automation()), 'CHECK_DOCTYPE')
})

/**
 * REGRESSION (audit: "isAdminRole treats EXECUTIVE as a full admin"). Before the
 * fix this returned CHECK_DOCTYPE and the seeded EXECUTIVE doctype row let an
 * EXECUTIVE rewrite an ADMIN-owned automation's grants, caps and recipients and
 * then run it AS that ADMIN via resolveActor(automation.ownerId).
 */
test('EXECUTIVE may NOT manage someone else’s automation — running it borrows the owner’s access', () => {
  assert.equal(automationManageVerdict(EXEC, automation({ ownerId: ADMIN.userId })), 'DENY')
})

test('EXECUTIVE may still manage their OWN automation', () => {
  assert.equal(automationManageVerdict(EXEC, automation({ ownerId: EXEC.userId })), 'CHECK_DOCTYPE')
})

test('a stranger may never manage an automation', () => {
  assert.equal(automationManageVerdict(STRANGER, automation()), 'DENY')
  assert.equal(automationManageVerdict(RECIPIENT, automation()), 'DENY')
})

// ---------------------------------------------------------------------------
// canReadAutomation — plan and transcripts
// ---------------------------------------------------------------------------

test('owner reads their own automation outright; EXECUTIVE reads via the doctype matrix', () => {
  assert.equal(automationReadVerdict(OWNER, automation()), 'ALLOW')
  assert.equal(automationReadVerdict(ADMIN, automation()), 'CHECK_DOCTYPE')
  assert.equal(automationReadVerdict(EXEC, automation()), 'CHECK_DOCTYPE')
})

test('recipients and strangers cannot read the automation itself (plan, grants, transcripts)', () => {
  assert.equal(automationReadVerdict(RECIPIENT, automation()), 'DENY')
  assert.equal(automationReadVerdict(STRANGER, automation()), 'DENY')
})

test('a soft-deleted automation is unreadable by everyone', () => {
  const dead = automation({ deletedAt: DELETED_AT })
  for (const p of [OWNER, ADMIN, EXEC, RECIPIENT, STRANGER]) {
    assert.equal(automationReadVerdict(p, dead), 'DENY', `expected DENY for ${p.role}`)
  }
})

// ---------------------------------------------------------------------------
// canReadBriefing — the full matrix
// ---------------------------------------------------------------------------

test('owner reads their briefing in any status', () => {
  for (const status of ['PUBLISHED', 'DRAFT', 'PENDING_REVIEW']) {
    assert.equal(briefingReadVerdict(OWNER, briefing({ status })), 'ALLOW', status)
  }
})

test('admins reach the doctype check for a briefing in any status', () => {
  for (const status of ['PUBLISHED', 'DRAFT', 'PENDING_REVIEW']) {
    assert.equal(briefingReadVerdict(ADMIN, briefing({ status })), 'CHECK_DOCTYPE', status)
    assert.equal(briefingReadVerdict(EXEC, briefing({ status })), 'CHECK_DOCTYPE', status)
  }
})

test('a listed recipient reaches the doctype check for a PUBLISHED briefing', () => {
  assert.equal(briefingReadVerdict(RECIPIENT, briefing()), 'CHECK_DOCTYPE')
})

/**
 * This is the whole of REVIEW mode: an unapproved briefing has not been
 * distributed, so a recipient must not be able to fetch it by id.
 */
test('a recipient is refused a DRAFT or PENDING_REVIEW briefing — REVIEW mode depends on it', () => {
  assert.equal(briefingReadVerdict(RECIPIENT, briefing({ status: 'DRAFT' })), 'DENY')
  assert.equal(briefingReadVerdict(RECIPIENT, briefing({ status: 'PENDING_REVIEW' })), 'DENY')
})

test('an unknown future status is refused for recipients, not allowed by default', () => {
  assert.equal(briefingReadVerdict(RECIPIENT, briefing({ status: 'APPROVED' })), 'DENY')
})

test('a non-recipient employee is refused even a PUBLISHED briefing', () => {
  assert.equal(briefingReadVerdict(STRANGER, briefing()), 'DENY')
})

test('an empty recipient list refuses everyone but the owner and admins', () => {
  assert.equal(briefingReadVerdict(RECIPIENT, briefing({ recipientIds: [] })), 'DENY')
  assert.equal(briefingReadVerdict(OWNER, briefing({ recipientIds: [] })), 'ALLOW')
})

/**
 * REGRESSION (audit: "canReadBriefing selects automation.deletedAt and never
 * reads it"). Before the fix, deleting an automation left every one of its
 * briefings readable, exportable to PDF/DOCX and promotable by every recipient,
 * even though the briefings LIST route already filtered them out.
 */
test('deleting the automation withdraws its briefings from every reader', () => {
  const dead = briefing({ deletedAt: DELETED_AT })
  for (const p of [OWNER, ADMIN, EXEC, RECIPIENT, STRANGER]) {
    assert.equal(briefingReadVerdict(p, dead), 'DENY', `expected DENY for ${p.role}`)
  }
})

// ---------------------------------------------------------------------------
// Tool grants — Tier-2 tools are not self-service (spec §7, §13)
// ---------------------------------------------------------------------------

test('okr.query is the only self-service tool today', () => {
  assert.deepEqual([...SELF_SERVICE_TOOL_IDS], ['okr.query'])
  assert.equal(isSelfServiceTool('okr.query'), true)
  assert.equal(isSelfServiceTool('odoo.search'), false)
  assert.equal(isSelfServiceTool('web.fetch'), false)
})

test('an empty or absent grant list needs no approval', () => {
  assert.deepEqual(toolGrantsRequiringApproval([]), [])
  assert.deepEqual(toolGrantsRequiringApproval(undefined), [])
  assert.deepEqual(toolGrantsRequiringApproval(null), [])
})

/**
 * REGRESSION (audit CRITICAL: "Tool grants are self-service"). The exploit body
 * was `{"toolGrants":[{"tool":"odoo.search"}]}` — no params, which resolves to
 * the widest possible Odoo grant through the shared ODOO service account.
 */
test('a non-admin author may NOT self-grant odoo.search', () => {
  const verdict = toolGrantVerdict([{ tool: 'odoo.search' }], false)
  assert.equal(verdict.allowed, false)
  assert.deepEqual(verdict.allowed === false ? verdict.denied : [], ['odoo.search'])
})

test('a non-admin author may self-grant okr.query, which is re-scoped to the owner at run time', () => {
  assert.deepEqual(toolGrantVerdict([{ tool: 'okr.query' }], false), { allowed: true })
})

test('one Tier-2 tool hidden in a list of Tier-0 ones still fails the whole request', () => {
  const verdict = toolGrantVerdict(
    [{ tool: 'okr.query' }, { tool: 'okr.query' }, { tool: 'web.fetch' }],
    false
  )
  assert.equal(verdict.allowed, false)
  assert.deepEqual(verdict.allowed === false ? verdict.denied : [], ['web.fetch'])
})

test('duplicate denied tools are named once', () => {
  const verdict = toolGrantVerdict(
    [{ tool: 'odoo.search' }, { tool: 'odoo.search' }, { tool: 'mail.search' }],
    false
  )
  assert.equal(verdict.allowed, false)
  assert.deepEqual(verdict.allowed === false ? verdict.denied : [], ['odoo.search', 'mail.search'])
})

test('an approver may grant anything', () => {
  assert.deepEqual(
    toolGrantVerdict([{ tool: 'odoo.search' }, { tool: 'site.login' }], true),
    { allowed: true }
  )
})

test('the refusal names the offending tool so the author knows what to ask an admin for', () => {
  const message = toolGrantDenialMessage(['odoo.search'])
  assert.ok(message.includes('odoo.search'), message)
  assert.ok(message.includes('okr.query'), message)
})

// ---------------------------------------------------------------------------
// Recipient visibility (spec §3.3)
// ---------------------------------------------------------------------------

function facts(overrides: Partial<RecipientVisibilityFacts> = {}): RecipientVisibilityFacts {
  return {
    activeIds: [],
    departmentPeerIds: [],
    directReportIds: [],
    managerIds: [],
    ...overrides,
  }
}

/** A loader that answers from a fixed org graph, so no database is involved. */
function loaderFor(f: RecipientVisibilityFacts): RecipientVisibilityLoader {
  return async (_principal, userIds) => ({
    activeIds: f.activeIds.filter((id) => userIds.includes(id)),
    departmentPeerIds: f.departmentPeerIds.filter((id) => userIds.includes(id)),
    directReportIds: f.directReportIds.filter((id) => userIds.includes(id)),
    managerIds: f.managerIds.filter((id) => userIds.includes(id)),
  })
}

test('deactivated and non-existent ids are dropped for everyone, including admins', () => {
  const kept = visibleRecipientIds(ADMIN, ['u-gone', 'u-live'], facts({ activeIds: ['u-live'] }))
  assert.deepEqual(kept, ['u-live'])
})

/**
 * REGRESSION (audit HIGH/LOW: "filterVisibleRecipientIds ignores its principal").
 * The old body was `prisma.user.findMany({ id: { in: ids }, isActive: true })`,
 * so ANY active user id survived — an EMPLOYEE author could mail the CEO.
 */
test('a non-admin author cannot address a user outside their department or reporting line', () => {
  const kept = visibleRecipientIds(
    OWNER,
    ['u-ceo'],
    facts({ activeIds: ['u-ceo'] }) // active, but no shared department and no manager link
  )
  assert.deepEqual(kept, [])
})

test('a non-admin author may address department peers, direct reports, their manager and themselves', () => {
  const kept = visibleRecipientIds(
    OWNER,
    [OWNER.userId, 'u-peer', 'u-report', 'u-manager', 'u-ceo'],
    facts({
      activeIds: [OWNER.userId, 'u-peer', 'u-report', 'u-manager', 'u-ceo'],
      departmentPeerIds: ['u-peer'],
      directReportIds: ['u-report'],
      managerIds: ['u-manager'],
    })
  )
  assert.deepEqual(kept, [OWNER.userId, 'u-peer', 'u-report', 'u-manager'])
})

test('ADMIN and EXECUTIVE address the whole org', () => {
  const requested = ['u-ceo', 'u-peer']
  const f = facts({ activeIds: requested })
  assert.deepEqual(visibleRecipientIds(ADMIN, requested, f), requested)
  assert.deepEqual(visibleRecipientIds(EXEC, requested, f), requested)
})

test('a repeated id is collapsed so nobody is mailed twice', () => {
  const kept = visibleRecipientIds(
    ADMIN,
    ['u-peer', 'u-peer'],
    facts({ activeIds: ['u-peer'] })
  )
  assert.deepEqual(kept, ['u-peer'])
})

test('filterVisibleRecipientIds short-circuits an empty list without touching the loader', async () => {
  let calls = 0
  const loader: RecipientVisibilityLoader = async () => {
    calls += 1
    return facts()
  }
  assert.deepEqual(await filterVisibleRecipientIds(OWNER, [], loader), [])
  assert.equal(calls, 0)
})

test('filterVisibleRecipients drops whole recipient rows, channels and all', async () => {
  const rows = [
    { userId: 'u-peer', channels: ['EMAIL'] },
    { userId: 'u-ceo', channels: ['EMAIL', 'IN_APP'] },
  ]
  const kept = await filterVisibleRecipients(
    OWNER,
    rows,
    loaderFor(facts({ activeIds: ['u-peer', 'u-ceo'], departmentPeerIds: ['u-peer'] }))
  )
  assert.deepEqual(kept, [rows[0]])
})

test('an admin author keeps every active recipient row', async () => {
  const rows = [
    { userId: 'u-peer', channels: ['EMAIL'] },
    { userId: 'u-ceo', channels: ['EMAIL'] },
  ]
  const kept = await filterVisibleRecipients(
    ADMIN,
    rows,
    loaderFor(facts({ activeIds: ['u-peer', 'u-ceo'] }))
  )
  assert.deepEqual(kept, rows)
})

// ---------------------------------------------------------------------------
// Route wiring
//
// The two gates above are only worth anything if every write path calls them.
// POST did; PATCH did not, which was the reported escalation (create with an
// empty recipient list, then edit one in). These assertions read the route
// sources so "a route forgot to call it" fails here rather than in production.
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..')

function routeSource(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')
}

test('POST /api/automations gates tool grants and filters recipients', () => {
  const source = routeSource('app/api/automations/route.ts')
  assert.ok(source.includes('toolGrantsRequiringApproval('), 'POST must gate toolGrants')
  assert.ok(source.includes('canApproveToolGrants('), 'POST must ask who may approve a grant')
  assert.ok(source.includes('filterVisibleRecipients('), 'POST must filter recipients')
})

test('PATCH /api/automations/[id] gates tool grants and filters recipients too', () => {
  const source = routeSource('app/api/automations/[id]/route.ts')
  assert.ok(source.includes('toolGrantsRequiringApproval('), 'PATCH must gate toolGrants')
  assert.ok(source.includes('canApproveToolGrants('), 'PATCH must ask who may approve a grant')
  assert.ok(source.includes('filterVisibleRecipients('), 'PATCH must filter recipients')
})
