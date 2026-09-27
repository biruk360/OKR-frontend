import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Every notification event renders an email (subject + text + html) without
 * throwing, every <a href> in the html is absolute, and — for events marked
 * `redactable` — the dispatcher's redaction pipeline (lib/notifications/redact.ts:
 * displayTitle + redactData, exactly as lib/notifications/dispatcher.ts applies
 * them) keeps a private entity's title and numbers out of subject, text and html.
 *
 * Route existence of template links is covered by
 * lib/email/templates/template-routes.test.ts; this file does not repeat it.
 */

const BASE = 'https://okr.example.test'
process.env.NEXTAUTH_URL = BASE

const SECRET_TITLE = 'ZZSECRETTITLEZZ'
const SECRET_DESC = 'ZZSECRETDESCZZ'
const SECRET_NUMS = ['424242', '737373', '919191']

async function load() {
  const { renderTemplate } = await import('./templates')
  const { EVENT_META } = await import('@/lib/notifications/events')
  const redact = await import('@/lib/notifications/redact')
  return { renderTemplate, EVENT_META, redact }
}

/** A payload carrying every field any template reads. */
function richData(): Record<string, unknown> {
  return {
    recipientName: 'Abebe',
    actorName: 'Sara',
    entityTitle: 'Grow revenue',
    deepLink: '/dashboard/objectives/o1',
    activationUrl: `${BASE}/auth/reset-password?token=t`,
    verifyUrl: `${BASE}/auth/signin`,
    resetUrl: `${BASE}/auth/reset-password?token=t`,
    description: 'Some description',
    startValue: 0, currentValue: 40, targetValue: 100, unit: '%',
    progress: 40, confidence: 'AT_RISK', objectiveLevel: 'INDIVIDUAL',
    dueDate: '2026-10-01', startDate: '2026-09-01', endDate: '2026-12-31',
    timeframeName: 'Q4 2026', sprintName: 'Sprint 12', nextSprintName: 'Sprint 13',
    cycleName: 'H2 2026', employeeName: 'Kebede', snippet: 'Looks good', commentPreview: 'Nice work',
    decision: 'APPROVED', count: 3, avgProgress: 55, summary: 'Summary line',
    newUserName: 'New Person', newUserEmail: 'new@example.test', newUserRole: 'EMPLOYEE', newUserDepartment: 'Ops',
    newRole: 'DEPARTMENT_LEAD', newDepartment: 'Ops', newAssigneeName: 'Hana', newVisibility: 'PRIVATE',
    jobName: 'Import', jobStatus: 'DONE', processed: 10, succeeded: 9, failed: 1,
    childTitle: 'Child objective', yesterdayPlan: 'Plan', winCount: 2, submittedCount: 4, resolvedBlockerCount: 1,
    missingCount: 1, focusText: 'Focus', completed: 5, blockerCount: 1, actionTypes: 'COACHING', actionCount: 1,
    waitingApprovalCount: 1, submissionRate: 80, reminder: 'Call client', priority: 'HIGH',
    overdueCount: 1, offTrack: 1, atRisk: 2, activeObjectives: 7, evaluationCount: 3, cadence: 'WEEKLY',
    blockerSummary: 'Waiting on vendor', blockedCount: 1, dayLabel: 'Thursday', projectCount: 1,
    projects: [{
      code: 'PRJ-1', name: 'Rollout', ragStatus: 'AMBER', deepLink: '/dashboard/projects/p1',
      overdue: 1, blocked: 1, waitingApproval: 0, upcoming: 2, highRisks: 0, overduePayments: 0, overdueCoes: 0, failedGates: 0,
    }],
  }
}

function hrefs(html: string): string[] {
  return Array.from(html.matchAll(/href="([^"]*)"/g)).map((m) => m[1])
}

test('every event key renders a subject, text and html email', async () => {
  const { renderTemplate, EVENT_META } = await load()
  const keys = Object.keys(EVENT_META) as Array<keyof typeof EVENT_META>
  assert.ok(keys.length >= 90, `expected the full event catalogue, got ${keys.length}`)
  const problems: string[] = []
  for (const key of keys) {
    for (const [label, data] of [['rich', richData()], ['empty', {}]] as const) {
      try {
        const r = renderTemplate(key, data)
        if (!r.subject.trim()) problems.push(`${key}/${label}: empty subject`)
        if (!r.text.trim()) problems.push(`${key}/${label}: empty text`)
        if (!r.html || !r.html.startsWith('<!doctype html>')) problems.push(`${key}/${label}: html not wrapped`)
        for (const [part, s] of [['subject', r.subject], ['text', r.text]] as const) {
          if (/\bundefined\b|\[object Object\]|\bNaN\b/.test(s)) problems.push(`${key}/${label}: ${part} leaks a JS artefact: ${s.slice(0, 120)}`)
        }
      } catch (e) {
        problems.push(`${key}/${label}: threw ${(e as Error).message}`)
      }
    }
  }
  assert.deepEqual(problems, [])
})

/**
 * Events that fall through to renderTemplate's generic `default:` — subject
 * "Notification", body "Event: <KEY>.". Empty: every key in EVENT_META has its
 * own template (the project-delivery and scrum-workflow keys are rendered by
 * renderProjectOrScrumEvent). A NEW event key must ship with its own template.
 */
const KNOWN_GENERIC: string[] = []

async function genericEvents(): Promise<string[]> {
  const { renderTemplate, EVENT_META } = await load()
  return (Object.keys(EVENT_META) as Array<keyof typeof EVENT_META>)
    .filter((k) => renderTemplate(k, richData()).text.startsWith(`Event: ${k}.`))
}

test('no new event key falls through to the generic default template', async () => {
  const extra = (await genericEvents()).filter((k) => !KNOWN_GENERIC.includes(k))
  assert.deepEqual(extra, [], 'give these events a case in lib/email/templates/index.ts renderTemplate()')
})

// Was BUG (lib/email/templates/index.ts default:) — 26 event keys (all project
// events, e.g. PROJECT_WENT_RED from lib/projects/health.ts, plus
// SCRUM_WIN_CELEBRATED / SCRUM_PROXY_* / SCRUM_UPDATE_AMENDED / SCRUM_NOT_LOGGED)
// had no template: recipients got subject "Notification" and a body reading
// "Event: PROJECT_WENT_RED." with no entity, actor or deep link.
test('BUG: every event key has a dedicated email template', async () => {
  assert.deepEqual(await genericEvents(), [])
})

test('project / scrum-workflow templates carry the entity, the facts and an absolute deep link', async () => {
  const { renderTemplate } = await load()
  const red = renderTemplate('PROJECT_WENT_RED', { recipientName: 'Abebe', entityTitle: 'Rollout', confidence: 38, deepLink: '/projects/p1' })
  assert.equal(red.subject, 'Project went RED: Rollout')
  assert.ok(red.text.includes('"Rollout" has turned RED'), red.text)
  assert.ok(red.text.includes('Delivery confidence: 38%'), red.text)
  assert.ok(red.text.includes(`${BASE}/projects/p1`), red.text)
  assert.ok(hrefs(red.html!).includes(`${BASE}/projects/p1`))
  const breach = renderTemplate('CLIENT_APPROVAL_SLA_BREACH', {
    recipientName: 'Abebe', entityTitle: 'Rollout', activityTitle: 'UAT sign-off', phase: 'Delivery',
    daysWaited: 7, daysOverSla: 2, slaBusinessDays: 5, threshold: 'SLA+2', deepLink: '/projects/p1',
  })
  assert.equal(breach.subject, 'Client approval SLA breached: UAT sign-off')
  for (const s of ['Days over SLA: 2', 'Business days waited: 7', 'Phase: Delivery']) assert.ok(breach.text.includes(s), s)
  // The dispatcher's '(untitled)' placeholder is never printed as a project name.
  const baseline = renderTemplate('PROJECT_BASELINE_COMMITTED', { recipientName: 'Abebe', entityTitle: '(untitled)', version: 1, activityCount: 42 })
  assert.equal(baseline.text.includes('(untitled)'), false, baseline.text)
  assert.ok(baseline.text.includes('Baselined activities: 42'))
  assert.ok(hrefs(baseline.html!).includes(`${BASE}/dashboard/projects`), 'falls back to the projects list')
  const win = renderTemplate('SCRUM_WIN_CELEBRATED', { recipientName: 'Abebe', actorName: 'Sara', deepLink: '/dashboard/scrum?update=u1' })
  assert.equal(win.subject, 'Sara celebrated your win')
  assert.ok(hrefs(win.html!).includes(`${BASE}/dashboard/scrum?update=u1`))
  const esc = renderTemplate('CLIENT_COMMENT_POSTED', { entityTitle: '<b>x</b>' })
  assert.equal(esc.html!.includes('<b>x</b>'), false)
})

test('every html link is absolute (NEXTAUTH_URL-prefixed or an explicit https URL)', async () => {
  const { renderTemplate, EVENT_META } = await load()
  const bad: string[] = []
  for (const key of Object.keys(EVENT_META) as Array<keyof typeof EVENT_META>) {
    const html = renderTemplate(key, richData()).html ?? ''
    const links = hrefs(html)
    if (links.length === 0) bad.push(`${key}: no links at all`)
    for (const h of links) if (!/^https?:\/\//.test(h)) bad.push(`${key}: ${h}`)
  }
  assert.deepEqual(bad, [])
})

test('user-supplied strings are HTML-escaped in the html body', async () => {
  const { renderTemplate } = await load()
  const r = renderTemplate('OBJECTIVE_ASSIGNED', { ...richData(), entityTitle: '<script>alert(1)</script>', actorName: '<img src=x>' })
  assert.equal(r.html!.includes('<script>alert(1)</script>'), false)
  assert.equal(r.html!.includes('<img src=x>'), false)
  assert.ok(r.html!.includes('&lt;script&gt;'))
})

// ── redaction ───────────────────────────────────────────────────────────────

const ENTITY_TYPE_BY_CATEGORY: Record<string, 'OBJECTIVE' | 'KEY_RESULT' | 'TODO' | 'SCRUM_UPDATE'> = {
  OBJECTIVE: 'OBJECTIVE', ALIGNMENT: 'OBJECTIVE', KEY_RESULT: 'KEY_RESULT', CHECK_IN: 'KEY_RESULT',
  COMMENT: 'OBJECTIVE', TODO: 'TODO', SCRUM: 'SCRUM_UPDATE',
}

function secretPayload(): Record<string, unknown> {
  return {
    ...richData(),
    description: SECRET_DESC,
    content: SECRET_DESC,
    analysis: SECRET_DESC,
    startValue: SECRET_NUMS[0],
    currentValue: SECRET_NUMS[1],
    targetValue: SECRET_NUMS[2],
    unit: 'ZZUNITZZ',
  }
}

/** Mirror of the per-recipient block in lib/notifications/dispatcher.ts. */
async function renderFor(eventKey: string, recipient: { id: string; role: 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE' }, data = secretPayload()) {
  const { renderTemplate, EVENT_META, redact } = await load()
  const meta = EVENT_META[eventKey as keyof typeof EVENT_META]
  const redactInput = {
    recipientId: recipient.id,
    entityOwnerId: 'owner',
    entityManagerIds: ['manager'],
    recipientRole: recipient.role,
    isPrivate: true,
    entityType: ENTITY_TYPE_BY_CATEGORY[meta.category] ?? 'OBJECTIVE',
    entityTitle: SECRET_TITLE,
  }
  const redacted = meta.redactable && redact.shouldRedact(redactInput)
  const title = redact.displayTitle(redactInput)
  const templateData = redact.redactData({ ...data, entityTitle: title }, redacted)
  const r = renderTemplate(meta.key, { recipientName: 'Abebe', ...templateData })
  return { redacted, all: `${r.subject}\n${r.text}\n${r.html}` }
}

test('shouldRedact: only private entities, and never for ADMIN/EXECUTIVE, the owner or their manager', async () => {
  const { redact } = await load()
  const base = { recipientId: 'r', entityOwnerId: 'owner', entityManagerIds: ['manager'], isPrivate: true }
  assert.equal(redact.shouldRedact({ ...base, recipientRole: 'EMPLOYEE' }), true)
  assert.equal(redact.shouldRedact({ ...base, recipientRole: 'DEPARTMENT_LEAD' }), true)
  assert.equal(redact.shouldRedact({ ...base, isPrivate: false, recipientRole: 'EMPLOYEE' }), false)
  assert.equal(redact.shouldRedact({ ...base, recipientRole: 'ADMIN' }), false)
  assert.equal(redact.shouldRedact({ ...base, recipientRole: 'EXECUTIVE' }), false)
  assert.equal(redact.shouldRedact({ ...base, recipientId: 'owner', recipientRole: 'EMPLOYEE' }), false)
  assert.equal(redact.shouldRedact({ ...base, recipientId: 'manager', recipientRole: 'EMPLOYEE' }), false)
  assert.equal(redact.displayTitle({ ...base, recipientRole: 'EMPLOYEE', entityType: 'KEY_RESULT', entityTitle: 'x' }), '[Private Key Result]')
  assert.equal(redact.displayTitle({ ...base, recipientRole: 'EMPLOYEE', entityType: 'PROJECT', entityTitle: 'x' }), '[Private item]')
  assert.equal(redact.displayTitle({ ...base, recipientRole: 'ADMIN', entityTitle: 'Real' }), 'Real')
})

test('redactData strips description / values / unit / analysis / content only when redacted', async () => {
  const { redact } = await load()
  const data = { description: 'd', currentValue: 1, startValue: 0, targetValue: 2, unit: 'u', analysis: 'a', content: 'c', progress: 50, keep: 'k' }
  assert.equal(redact.redactData(data, false), data)
  const out = redact.redactData(data, true)
  assert.deepEqual(
    { ...out },
    { description: undefined, currentValue: undefined, startValue: undefined, targetValue: undefined, unit: undefined, analysis: undefined, content: undefined, progress: 50, keep: 'k' },
  )
})

test('redactable events: a redacted recipient never sees the private title, description or numbers', async () => {
  const { EVENT_META } = await load()
  const leaks: string[] = []
  const redactable = Object.values(EVENT_META).filter((m) => m.redactable)
  assert.ok(redactable.length >= 20)
  for (const meta of redactable) {
    const { redacted, all } = await renderFor(meta.key, { id: 'stranger', role: 'EMPLOYEE' })
    assert.equal(redacted, true, meta.key)
    for (const secret of [SECRET_TITLE, SECRET_DESC, 'ZZUNITZZ', ...SECRET_NUMS]) {
      if (all.includes(secret)) leaks.push(`${meta.key}: ${secret}`)
    }
  }
  assert.deepEqual(leaks, [])
})

test('redactable events: the owner, their manager and ADMIN/EXECUTIVE are never shown a redaction marker', async () => {
  const { EVENT_META } = await load()
  const missing: string[] = []
  let sawTitle = 0
  for (const meta of Object.values(EVENT_META).filter((m) => m.redactable)) {
    for (const who of [
      { id: 'owner', role: 'EMPLOYEE' as const },
      { id: 'manager', role: 'DEPARTMENT_LEAD' as const },
      { id: 'boss', role: 'ADMIN' as const },
      { id: 'cxo', role: 'EXECUTIVE' as const },
    ]) {
      const { redacted, all } = await renderFor(meta.key, who)
      assert.equal(redacted, false, `${meta.key} ${who.id}`)
      if (all.includes(SECRET_TITLE)) sawTitle++
      if (all.includes('[Private')) missing.push(`${meta.key} ${who.id}: redaction marker shown to a full-access viewer`)
    }
  }
  assert.deepEqual(missing, [])
  assert.ok(sawTitle > 0, 'full-access viewers should see the real title in at least the OKR templates')
})

test('non-redactable events ignore isPrivate (account / reminder mail keeps its content)', async () => {
  const { EVENT_META } = await load()
  for (const meta of Object.values(EVENT_META).filter((m) => !m.redactable)) {
    const { redacted } = await renderFor(meta.key, { id: 'stranger', role: 'EMPLOYEE' })
    assert.equal(redacted, false, meta.key)
  }
})

// BUG: lib/notifications/redact.ts:39 — redactData strips description/values but
// not the free-text fields templates print for redactable events: `snippet`
// (USER_MENTIONED, COMMENT_ON_OWNED_ENTITY — lib/email/templates/index.ts:708-725),
// `commentPreview` (SCRUM_COMMENT*, index.ts:983), `blockerSummary` (SCRUM_BLOCKER_*)
// and `childTitle` (OBJECTIVE_ALIGNED_CHILD_ADDED). A redacted recipient gets the
// comment text / child objective title of a private entity in the email. (Also:
// app/api/objectives/[id]/comments/route.ts and app/api/keyresults/[id]/comments/route.ts
// emit these events without `isPrivate`, so redaction never triggers for them at all.)
test('BUG: redacted recipients do not receive comment snippets / child titles of private entities', async () => {
  const leaks: string[] = []
  const FREE_TEXT = 'ZZFREETEXTZZ'
  for (const key of ['USER_MENTIONED', 'COMMENT_ON_OWNED_ENTITY', 'SCRUM_COMMENT', 'SCRUM_COMMENT_ADDED', 'SCRUM_BLOCKER_RAISED', 'OBJECTIVE_ALIGNED_CHILD_ADDED']) {
    const data = { ...secretPayload(), snippet: FREE_TEXT, commentPreview: FREE_TEXT, blockerSummary: FREE_TEXT, childTitle: FREE_TEXT }
    const { redacted, all } = await renderFor(key, { id: 'stranger', role: 'EMPLOYEE' }, data)
    assert.equal(redacted, true)
    if (all.includes(FREE_TEXT)) leaks.push(key)
  }
  assert.deepEqual(leaks, [])
})
