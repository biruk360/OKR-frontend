import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Critical Invariant #4 — route level (remediation F5, 2026-09-25).
 *
 * Every /api/portal/* route handler is invoked for real (the exported GET/POST
 * functions, through withPortalAuth/withPortalProject) against an in-memory
 * Prisma stand-in whose seed is *poisoned*: employee names, e-mails, user ids
 * and internal-only rows are planted in every text field the routes read —
 * titles, descriptions, slip details, RAID text, report summaries/content,
 * comment HTML with TipTap mention nodes, file names. The test then asserts
 * that no seeded User.name (full or any first/last-name token), e-mail or user
 * id appears anywhere in any response body or download header, and that
 * INTERNAL / non-client-visible rows never surface.
 *
 * Harness limits (documented, deliberate):
 * - The Prisma stand-in evaluates scalar equality, `in`/`notIn`/`has`/
 *   `startsWith`, `AND`/`OR` and null; relation filters (e.g.
 *   `milestone: { phase: … }`) are treated as matching, so SQL-level project
 *   pinning is covered by the source guards in portal-route-guards.test.ts and
 *   lib/attachments/project-upload.test.ts, not here. The visibility filters
 *   (`visibility`, `clientVisible`, report `status`/`type`) ARE evaluated.
 * - `select`/`include` return the whole seeded row (a superset), which is the
 *   stricter case: every internal field is offered to the serializers.
 * - The session comes from `setPortalSessionResolverForTesting` (NextAuth's
 *   cookie read needs a live Next request); the DB re-validation in
 *   `getPortalSessionSafe` still runs against the fake account row.
 * - The CLIENT_BIMONTHLY `?download=1` PDF branch needs Puppeteer and is not
 *   invoked; it renders from the same scrubbed DTO asserted here.
 * - The portal comment POST runs with no project manager on the activity, so
 *   the notification fan-out (emit) is not exercised.
 */

const EMPLOYEES = [
  { id: 'u-meklit', name: 'Meklit Tadesse', email: 'meklit.t@360ground.com', isActive: true },
  { id: 'u-biruk', name: 'Biruk Hailu', email: 'biruk@360ground.com', isActive: true },
  // Inactive: must still be redacted (old comments keep the name).
  { id: 'u-selam', name: 'Selam Girma', email: 'selam.g@360ground.com', isActive: false },
]
const FORBIDDEN = [
  ...EMPLOYEES.flatMap((u) => [u.name, ...u.name.split(' '), u.email, u.email.split('@')[0], u.id]),
  // Internal-only content that must never reach the portal.
  'INTERNAL ONLY', 'secret-internal', 'Hidden risk', 'Draft report', '5000000', 'costImpact', 'estimatedCost', 'assigneeId', 'authorId', 'uploadedById',
]

const d = (iso: string) => new Date(iso)
const uploadRoot = mkdtempSync(join(tmpdir(), 'portal-invariant-'))
process.env.PROJECT_UPLOAD_DIR = uploadRoot

const activity = {
  id: 'a1',
  milestoneId: 'm1',
  title: 'API integration owned by Meklit Tadesse',
  description: 'Biruk Hailu pairs with Selam',
  ownerParty: 'CLIENT',
  assigneeId: 'u-meklit',
  baselineStart: d('2026-07-01T00:00:00Z'),
  baselineEnd: d('2026-07-05T00:00:00Z'),
  currentStart: d('2026-07-02T00:00:00Z'),
  currentEnd: d('2026-07-08T00:00:00Z'),
  status: 'APPROVAL_REQUESTED',
  percentComplete: 40,
  isMilestone: false,
  slipDays: 3,
  slipReason: 'Meklit was reassigned',
  slipOwner: '360GROUND',
  waitingSince: d('2026-07-03T00:00:00Z'),
  estimatedCost: 5000000,
  position: 0,
  milestone: { phase: { project: { projectManagerId: null } } },
}

const project = {
  id: 'p1',
  code: 'PRJ-001',
  name: 'Meda Platform',
  description: 'Kick-off chaired by Meklit Tadesse (meklit.t@360ground.com)',
  clientName: 'Meda',
  status: 'ACTIVE',
  ragStatus: 'AMBER',
  confidence: 70,
  percentComplete: 40,
  percentPlanned: 55,
  spi: 0.9,
  plannedStart: d('2026-07-01T00:00:00Z'),
  plannedEnd: d('2026-09-30T00:00:00Z'),
  baselineCommittedAt: d('2026-07-01T00:00:00Z'),
  baselineVersion: 1,
  portalEnabled: true,
  archivedAt: null,
  projectManagerId: 'u-meklit',
  contractValue: 5000000,
  phases: [{
    id: 'ph1',
    name: 'Discovery with Biruk',
    position: 0,
    percentComplete: 40,
    status: 'ACTIVE',
    baselineStart: d('2026-07-01T00:00:00Z'),
    baselineEnd: d('2026-07-31T00:00:00Z'),
    currentStart: d('2026-07-01T00:00:00Z'),
    currentEnd: d('2026-08-05T00:00:00Z'),
    milestones: [{
      id: 'm1',
      name: 'Sign-off by Selam Girma',
      position: 0,
      percentComplete: 40,
      status: 'ACTIVE',
      baselineDate: d('2026-07-31T00:00:00Z'),
      currentDate: d('2026-08-05T00:00:00Z'),
      isKeyMilestone: true,
      activities: [activity],
    }],
  }],
}

const clientHash = '$2a$04$abcdefghijklmnopqrstuuJ5oKcGf2i0wq2Gm0L0H9Y0tXmZC4w1a'

const seed: Record<string, any[]> = {
  user: EMPLOYEES.map((u) => ({ ...u, avatar: `https://cdn/${u.id}.png`, role: 'EMPLOYEE' })),
  clientPortalUser: [{
    id: 'cpu1', email: 'contact@meda.et', name: 'Hanna Client', clientName: 'Meda', passwordHash: clientHash,
    projectIds: ['p1', 'p2'], isActive: true, lastLoginAt: null, createdById: 'u-meklit', createdAt: d('2026-07-01T00:00:00Z'),
  }],
  project: [
    project,
    { ...project, id: 'p2', name: 'Hidden project', portalEnabled: false, phases: [] },
  ],
  delayEvent: [{
    id: 'de1', projectId: 'p1', activityId: 'a1', eventType: 'SLIP', reason: 'TECHNICAL_BLOCKER',
    reasonDetail: 'Biruk Hailu was on leave', owner: '360GROUND', daysLost: 3, startedAt: d('2026-07-05T00:00:00Z'),
    endedAt: null, phaseAtTime: 'Discovery', isAutoDetected: false, recoveryPlan: 'Meklit to catch up', recoveryDate: null,
    recordedById: 'u-meklit', createdAt: d('2026-07-05T00:00:00Z'),
  }],
  raidItem: [
    {
      id: 'r1', projectId: 'p1', type: 'RISK', refCode: 'R-1', title: 'Vendor delay flagged by Selam Girma',
      description: 'Escalate to meklit.t@360ground.com', category: null, probability: 3, impact: 4, score: 12,
      mitigation: 'Biruk to follow up', contingency: null, severity: null, resolution: null, dependsOnParty: 'CLIENT',
      neededByDate: null, validated: null, validatedAt: null, impactIfFalse: null, status: 'OPEN', clientVisible: true,
      reviewDate: null, createdAt: d('2026-07-02T00:00:00Z'), closedAt: null, ownerId: 'u-biruk', costImpact: 5000000,
    },
    {
      id: 'r2', projectId: 'p1', type: 'RISK', refCode: 'R-2', title: 'Hidden risk INTERNAL ONLY', description: null,
      category: null, probability: null, impact: null, score: null, mitigation: null, contingency: null, severity: null,
      resolution: null, dependsOnParty: null, neededByDate: null, validated: null, validatedAt: null, impactIfFalse: null,
      status: 'OPEN', clientVisible: false, reviewDate: null, createdAt: d('2026-07-02T00:00:00Z'), closedAt: null,
    },
  ],
  projectReport: [
    {
      id: 'rep1', projectId: 'p1', type: 'CLIENT_BIMONTHLY', status: 'APPROVED',
      periodStart: d('2026-07-01T00:00:00Z'), periodEnd: d('2026-07-15T00:00:00Z'),
      aiSummary: '- Meklit Tadesse completed the design\n- Biruk Hailu started QA',
      contentJson: {
        header: { project: 'Meda Platform', pmName: 'Meklit Tadesse', client: 'Meda' },
        delayed: [{ activity: 'API by Selam', reason: 'Selam Girma sick', delayOwner: '360GROUND' }],
        changeRequests: [{ cr: 'CR-1 raised by Biruk', impactDays: 2, costImpact: 5000000, status: 'APPROVED' }],
      },
      generatedAt: d('2026-07-16T00:00:00Z'), approvedAt: d('2026-07-17T00:00:00Z'), sentAt: null, approvedById: 'u-meklit',
    },
    {
      id: 'rep2', projectId: 'p1', type: 'STEERING', status: 'SENT',
      periodStart: d('2026-07-01T00:00:00Z'), periodEnd: d('2026-07-31T00:00:00Z'),
      aiSummary: 'Steering pack prepared by Selam Girma', contentJson: { preparedBy: 'Biruk Hailu' },
      generatedAt: d('2026-08-01T00:00:00Z'), approvedAt: null, sentAt: d('2026-08-02T00:00:00Z'),
    },
    {
      id: 'rep3', projectId: 'p1', type: 'CLIENT_BIMONTHLY', status: 'DRAFT',
      periodStart: d('2026-08-01T00:00:00Z'), periodEnd: d('2026-08-15T00:00:00Z'),
      aiSummary: 'Draft report INTERNAL ONLY', contentJson: {}, generatedAt: d('2026-08-16T00:00:00Z'), approvedAt: null, sentAt: null,
    },
  ],
  activity: [activity],
  activityComment: [
    {
      id: 'c1', activityId: 'a1', authorId: 'u-biruk', parentId: null, visibility: 'CLIENT_VISIBLE', isClientAuthor: false,
      mentions: ['u-meklit'], createdAt: d('2026-07-04T00:00:00Z'),
      content: '<p><span data-type="mention" data-id="u-meklit" data-label="Meklit Tadesse">@Meklit Tadesse</span> and Selam please review</p>',
    },
    {
      id: 'c2', activityId: 'a1', authorId: 'cpu1', parentId: 'c1', visibility: 'CLIENT_VISIBLE', isClientAuthor: true,
      mentions: [], createdAt: d('2026-07-05T00:00:00Z'), content: 'Thanks, we will check with Biruk tomorrow',
    },
    {
      id: 'c3', activityId: 'a1', authorId: 'u-selam', parentId: null, visibility: 'INTERNAL', isClientAuthor: false,
      mentions: [], createdAt: d('2026-07-05T00:00:00Z'), content: 'INTERNAL ONLY: client is slow',
    },
  ],
  activityAttachment: [
    {
      id: 'att1', activityId: 'a1', fileName: 'Meklit-Tadesse-design.pdf', fileSize: 20, mimeType: 'application/pdf',
      storagePath: '/api/projects/p1/activities/a1/attachments/att1', uploadedById: 'u-meklit', visibility: 'CLIENT_VISIBLE',
      createdAt: d('2026-07-04T00:00:00Z'), activity: { title: activity.title },
    },
    {
      id: 'att2', activityId: 'a1', fileName: 'secret-internal.pdf', fileSize: 20, mimeType: 'application/pdf',
      storagePath: '/api/projects/p1/activities/a1/attachments/att2', uploadedById: 'u-selam', visibility: 'INTERNAL',
      createdAt: d('2026-07-04T00:00:00Z'), activity: { title: activity.title },
    },
  ],
  changeRequest: [
    {
      id: 'cr1', projectId: 'p1', crCode: 'CR-001', title: 'Extra dashboard requested by Meklit Tadesse',
      description: 'Biruk Hailu to size it with selam.g@360ground.com', type: 'SCOPE_ADD', requestedBy: 'Selam Girma',
      requestedByParty: 'CLIENT', requestDate: d('2026-07-06T00:00:00Z'), scheduleImpactDays: 4, costImpact: 5000000,
      affectedActivityIds: ['a1'], status: 'APPROVED', ccbDecisionDate: d('2026-07-08T00:00:00Z'), approvedById: 'u-meklit',
      clientSignOff: true, clientSignOffAt: d('2026-07-09T00:00:00Z'), rejectionReason: null, visibility: 'CLIENT_VISIBLE',
      createdAt: d('2026-07-06T00:00:00Z'),
    },
    {
      id: 'cr2', projectId: 'p1', crCode: 'CR-002', title: 'INTERNAL ONLY descope', description: 'secret-internal',
      type: 'DESCOPE', requestedBy: 'Biruk Hailu', requestedByParty: '360GROUND', requestDate: d('2026-07-07T00:00:00Z'),
      scheduleImpactDays: 0, costImpact: 0, affectedActivityIds: [], status: 'SUBMITTED', ccbDecisionDate: null,
      approvedById: null, clientSignOff: false, clientSignOffAt: null, rejectionReason: null, visibility: 'INTERNAL',
      createdAt: d('2026-07-07T00:00:00Z'),
    },
  ],
  activityLog: [],
}

function matches(row: any, where: any): boolean {
  if (!where) return true
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') { if (!(cond as any[]).every((w) => matches(row, w))) return false; continue }
    if (key === 'OR') { if (!(cond as any[]).some((w) => matches(row, w))) return false; continue }
    const value = row[key]
    if (cond === null) { if (value !== null && value !== undefined) return false; continue }
    if (cond instanceof Date) { if (!(value instanceof Date) || value.getTime() !== cond.getTime()) return false; continue }
    if (typeof cond === 'object') {
      if (!(key in row)) continue // relation filter — not evaluated (see header)
      const c = cond as any
      if ('in' in c && !c.in.includes(value)) return false
      if ('notIn' in c && c.notIn.includes(value)) return false
      if ('has' in c && !(value ?? []).includes(c.has)) return false
      if ('startsWith' in c && !String(value).startsWith(c.startsWith)) return false
      continue
    }
    if (value !== cond) return false
  }
  return true
}

function model(name: string) {
  const rows = () => seed[name]
  return {
    findMany: async (args: any = {}) => rows().filter((r) => matches(r, args.where)).map((r) => ({ ...r })),
    findFirst: async (args: any = {}) => rows().find((r) => matches(r, args.where)) ?? null,
    findUnique: async (args: any = {}) => rows().find((r) => matches(r, args.where)) ?? null,
    create: async ({ data }: any) => {
      const row = { id: `${name}-${rows().length + 1}`, createdAt: new Date(), ...data }
      rows().push(row)
      return row
    },
    update: async ({ where, data }: any) => Object.assign(rows().find((r) => matches(r, where)), data),
    count: async (args: any = {}) => rows().filter((r) => matches(r, args.where)).length,
  }
}

const fakePrisma: any = new Proxy({}, {
  get(_t, prop: string) {
    if (prop === '$transaction') return async (fn: any) => fn(fakePrisma)
    if (!(prop in seed)) seed[prop] = []
    return model(prop)
  },
})
;(globalThis as any).prisma = fakePrisma

const responses: Array<{ route: string; status: number; body: string; headers: string }> = []

async function call(route: string, handler: any, url: string, params: Record<string, string>, init?: RequestInit) {
  const { NextRequest } = await import('next/server')
  const res: Response = await handler(new NextRequest(`http://localhost${url}`, init as any), { params })
  const buf = Buffer.from(await res.arrayBuffer())
  const isBinary = /pdf|octet-stream/.test(res.headers.get('content-type') ?? '')
  const body = isBinary ? '' : buf.toString('utf8')
  responses.push({ route, status: res.status, body, headers: JSON.stringify(Object.fromEntries(res.headers.entries())) })
  return { status: res.status, body, json: isBinary ? null : JSON.parse(body || 'null'), headers: res.headers, bytes: buf }
}

before(async () => {
  writeFileSync(join(uploadRoot, 'att1'), Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11, 32)]))
  const { setPortalSessionResolverForTesting } = await import('../portal-auth')
  const { portalCredentialFingerprint } = await import('./portal-accounts')
  setPortalSessionResolverForTesting(async () => ({
    user: {
      id: 'cpu1', name: 'Hanna Client', email: 'contact@meda.et', role: 'EMPLOYEE', userType: 'CLIENT_PORTAL',
      clientName: 'Meda', projectIds: ['p1', 'p2'], credentialVersion: portalCredentialFingerprint(clientHash),
    },
    expires: '2099-01-01T00:00:00.000Z',
  }) as any)
})

after(() => {
  rmSync(uploadRoot, { recursive: true, force: true })
})

test('invariant 4 (route level): every /api/portal/* handler answers without any employee identity', async () => {
  const list = await import('../../app/api/portal/projects/route')
  const detail = await import('../../app/api/portal/projects/[id]/route')
  const report = await import('../../app/api/portal/projects/[id]/reports/[reportId]/route')
  const comments = await import('../../app/api/portal/projects/[id]/activities/[activityId]/comments/route')
  const attachments = await import('../../app/api/portal/projects/[id]/attachments/route')
  const attachment = await import('../../app/api/portal/projects/[id]/activities/[activityId]/attachments/[attachmentId]/route')
  const invite = await import('../../app/api/portal/invite/route')
  const plannedVsActual = await import('../../app/api/portal/projects/[id]/planned-vs-actual/route')
  const changeRequests = await import('../../app/api/portal/projects/[id]/change-requests/route')

  const projects = await call('GET projects', list.GET, '/api/portal/projects', {})
  assert.equal(projects.status, 200)
  assert.deepEqual(projects.json.data.map((p: any) => p.id), ['p1'], 'portal-disabled projects are not listed')

  const one = await call('GET project', detail.GET, '/api/portal/projects/p1', { id: 'p1' })
  assert.equal(one.status, 200)
  assert.equal(one.json.data.project.phases[0].milestones[0].activities[0].owner, 'Your Team')
  assert.deepEqual(one.json.data.raidItems.map((r: any) => r.id), ['r1'])
  assert.deepEqual(one.json.data.reports.map((r: any) => r.id).sort(), ['rep1', 'rep2'])
  assert.equal(one.json.data.awaitingActions.length, 1)

  const pva = await call('GET planned vs actual', plannedVsActual.GET, '/api/portal/projects/p1/planned-vs-actual', { id: 'p1' })
  assert.equal(pva.status, 200)
  assert.deepEqual(pva.json.data.activities.map((r: any) => [r.id, r.owner, r.varianceDays, r.slipState]), [['a1', 'Your Team', 3, 'SLIPPED']])
  assert.deepEqual(pva.json.data.milestones.map((r: any) => [r.id, r.varianceDays, r.slipState]), [['m1', 5, 'SLIPPED']])
  const pvaOutOfScope = await call('GET planned vs actual (out of scope)', plannedVsActual.GET, '/api/portal/projects/p9/planned-vs-actual', { id: 'p9' })
  assert.equal(pvaOutOfScope.status, 403)
  const pvaDisabled = await call('GET planned vs actual (portal disabled)', plannedVsActual.GET, '/api/portal/projects/p2/planned-vs-actual', { id: 'p2' })
  assert.equal(pvaDisabled.status, 404)

  const crs = await call('GET change requests', changeRequests.GET, '/api/portal/projects/p1/change-requests', { id: 'p1' })
  assert.equal(crs.status, 200)
  assert.deepEqual(crs.json.data.map((r: any) => r.id), ['cr1'], 'INTERNAL change requests are filtered out')
  assert.equal(crs.json.data[0].requestedBy, 'Your Team')
  assert.equal(crs.json.data[0].decidedBy, '360Ground')
  const crsOutOfScope = await call('GET change requests (out of scope)', changeRequests.GET, '/api/portal/projects/p9/change-requests', { id: 'p9' })
  assert.equal(crsOutOfScope.status, 403)
  const crsDisabled = await call('GET change requests (portal disabled)', changeRequests.GET, '/api/portal/projects/p2/change-requests', { id: 'p2' })
  assert.equal(crsDisabled.status, 404)

  const rep = await call('GET report', report.GET, '/api/portal/projects/p1/reports/rep1', { id: 'p1', reportId: 'rep1' })
  assert.equal(rep.status, 200)
  const draft = await call('GET draft report', report.GET, '/api/portal/projects/p1/reports/rep3', { id: 'p1', reportId: 'rep3' })
  assert.equal(draft.status, 404)
  const steeringDownload = await call('GET report download (json)', report.GET, '/api/portal/projects/p1/reports/rep2?download=1', { id: 'p1', reportId: 'rep2' })
  assert.equal(steeringDownload.status, 200)
  assert.match(steeringDownload.headers.get('content-disposition') ?? '', /attachment; filename="steering-2026-07-31\.json"/)

  const thread = await call('GET comments', comments.GET, '/api/portal/projects/p1/activities/a1/comments', { id: 'p1', activityId: 'a1' })
  assert.equal(thread.status, 200)
  assert.equal(thread.json.data.length, 1, 'INTERNAL comments are filtered out')
  assert.equal(thread.json.data[0].author.name, '360Ground')
  assert.equal(thread.json.data[0].replies[0].author.name, 'Client')

  const posted = await call('POST comment', comments.POST, '/api/portal/projects/p1/activities/a1/comments', { id: 'p1', activityId: 'a1' }, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Approved on our side' }),
  })
  assert.equal(posted.status, 201)
  assert.ok(seed.activityLog.some((row) => row.metadata?.source === 'CLIENT_PORTAL'), 'client comment is audited (invariant 10)')

  const docs = await call('GET attachments', attachments.GET, '/api/portal/projects/p1/attachments', { id: 'p1' })
  assert.equal(docs.status, 200)
  assert.deepEqual(docs.json.data.map((a: any) => a.id), ['att1'], 'INTERNAL files are filtered out')
  assert.equal(docs.json.data[0].fileName, '360Ground-360Ground-design.pdf')

  const file = await call('GET attachment', attachment.GET, '/api/portal/projects/p1/activities/a1/attachments/att1', { id: 'p1', activityId: 'a1', attachmentId: 'att1' })
  assert.equal(file.status, 200)
  assert.equal(file.bytes.subarray(0, 5).toString('latin1'), '%PDF-')
  assert.match(file.headers.get('content-disposition') ?? '', /360Ground-360Ground-design\.pdf/)
  const hidden = await call('GET internal attachment', attachment.GET, '/api/portal/projects/p1/activities/a1/attachments/att2', { id: 'p1', activityId: 'a1', attachmentId: 'att2' })
  assert.equal(hidden.status, 404)

  const outOfScope = await call('GET out-of-scope project', detail.GET, '/api/portal/projects/p9', { id: 'p9' })
  assert.equal(outOfScope.status, 403)

  const badInvite = await call('GET invite (unknown token)', invite.GET, `/api/portal/invite?token=${'f'.repeat(64)}`, {})
  assert.equal(badInvite.status, 404)

  // The sweep: nothing identifying an employee, and nothing internal, in any body or header.
  assert.ok(responses.length >= 12, `expected every portal route to be exercised, saw ${responses.length}`)
  const leaks: string[] = []
  for (const r of responses) {
    const haystack = `${r.body}\n${r.headers}`.toLowerCase()
    for (const term of FORBIDDEN) {
      if (haystack.includes(term.toLowerCase())) leaks.push(`${r.route}: "${term}"`)
    }
  }
  assert.deepEqual(leaks, [], `portal responses leaked:\n  ${leaks.join('\n  ')}`)
})

test('invariant 4 (route level): a deactivated or re-credentialed portal account gets 401 at once', async () => {
  const list = await import('../../app/api/portal/projects/route')
  const account = seed.clientPortalUser[0]
  account.passwordHash = '$2a$04$zzzzzzzzzzzzzzzzzzzzzuJ5oKcGf2i0wq2Gm0L0H9Y0tXmZC4w1a'
  assert.equal((await call('GET projects (stale credential)', list.GET, '/api/portal/projects', {})).status, 401)
  account.passwordHash = clientHash
  account.isActive = false
  assert.equal((await call('GET projects (inactive)', list.GET, '/api/portal/projects', {})).status, 401)
  account.isActive = true
  account.projectIds = ['p2']
  const detail = await import('../../app/api/portal/projects/[id]/route')
  assert.equal((await call('GET revoked project', detail.GET, '/api/portal/projects/p1', { id: 'p1' })).status, 403, 'scope comes from the DB, not the JWT')
  account.projectIds = ['p1', 'p2']
})

test('invariant 5: every portal change-request read filters CLIENT_VISIBLE in SQL', async () => {
  const { readFileSync, readdirSync, statSync } = await import('node:fs')
  const root = join(__dirname, '..', '..')
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(name) ? [full] : []
  })
  let reads = 0
  const pageLoader = join(root, 'features/projects/services/portal-pages.server.ts')
  for (const file of [...walk(join(root, 'app/api/portal')), ...walk(join(root, 'app/portal')), pageLoader]) {
    const src = readFileSync(file, 'utf8')
    for (const match of src.matchAll(/changeRequest\.(findMany|findFirst|findUnique|count)\(\{\s*where:\s*([^,\n]+)/g)) {
      reads++
      assert.match(match[2], /^portalChangeRequestWhere\(/, `${file}: change requests read without portalChangeRequestWhere`)
    }
  }
  assert.ok(reads >= 2, `expected the portal route and page to read change requests, saw ${reads}`)
  assert.match(readFileSync(join(root, 'app/portal/projects/[id]/page.tsx'), 'utf8'), /await loadPortalProjectPage\(params, tab\)/, 'the portal project page must call its server loader')
})
