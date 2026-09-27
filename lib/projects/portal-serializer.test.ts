import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PORTAL_FORBIDDEN_KEYS,
  ownerLabelForClient,
  portalActivityAttachmentWhere,
  portalActivityCommentWhere,
  portalProjectWhere,
  portalRaidItemWhere,
  serializeActivityForClient,
  serializeCommentForClient,
  serializeProjectForClient,
  serializeRaidItemForClient,
  scrubPortalPayload,
  loadPortalForbiddenNames,
  portalRedactionTerms,
  redactForbiddenNames,
  serializeReportForClient,
  serializePlannedVsActualForClient,
} from '../../features/projects/services/portal-serializer'
import {
  plannedVsActualSlipState,
  plannedVsActualVarianceDays,
  summarizePlannedVsActual,
} from './portal-planned-vs-actual'

const employeeNames = ['Meklit Tadesse', 'Biruk Hailu']

test('portal query helpers enforce hard project and visibility scoping', () => {
  assert.deepEqual(portalProjectWhere(['p1', 'p2']), {
    id: { in: ['p1', 'p2'] },
    portalEnabled: true,
    archivedAt: null,
  })
  assert.deepEqual(portalActivityCommentWhere('a1'), { activityId: 'a1', visibility: 'CLIENT_VISIBLE' })
  assert.deepEqual(portalActivityAttachmentWhere('a1'), { activityId: 'a1', visibility: 'CLIENT_VISIBLE' })
  assert.deepEqual(portalRaidItemWhere('p1'), { projectId: 'p1', clientVisible: true })
})

test('serializeActivityForClient: owner is anonymized and internal fields are absent', () => {
  const payload = serializeActivityForClient({
    id: 'a1',
    title: 'API integration owned by Meklit Tadesse',
    ownerParty: '360GROUND',
    baselineStart: new Date('2026-07-01T00:00:00Z'),
    baselineEnd: new Date('2026-07-05T00:00:00Z'),
    currentStart: new Date('2026-07-02T00:00:00Z'),
    currentEnd: new Date('2026-07-07T00:00:00Z'),
    status: 'STARTED',
    percentComplete: 45,
    isMilestone: false,
    slipDays: 2,
    slipReason: 'TECHNICAL_BLOCKER',
    slipOwner: '360GROUND',
    waitingSince: null,
  }, { forbiddenEmployeeNames: employeeNames })

  assert.equal(payload.owner, '360Ground')
  assert.equal(payload.title, 'API integration owned by 360Ground')
  assertNoForbiddenPortalData(payload, employeeNames)
})

test('serializeActivityForClient: CLIENT ownerParty appears as Your Team', () => {
  assert.equal(ownerLabelForClient('CLIENT'), 'Your Team')
  assert.equal(ownerLabelForClient('SHARED'), '360Ground')
  assert.equal(ownerLabelForClient('360GROUND'), '360Ground')
})

test('serializeProjectForClient: nested schedule excludes user/cost/Jira fields and redacts user names', () => {
  const project = serializeProjectForClient({
    id: 'p1',
    code: 'PRJ-001',
    name: 'Meda Platform',
    description: 'Delivery managed by Biruk Hailu',
    clientName: 'Meda',
    status: 'ACTIVE',
    ragStatus: 'AMBER',
    confidence: 68,
    percentComplete: 55,
    percentPlanned: 70,
    spi: 0.9,
    plannedStart: new Date('2026-07-01T00:00:00Z'),
    plannedEnd: new Date('2026-09-01T00:00:00Z'),
    baselineCommittedAt: new Date('2026-07-02T00:00:00Z'),
    baselineVersion: 1,
    phases: [{
      id: 'ph1',
      name: 'Build',
      position: 0,
      percentComplete: 50,
      status: 'STARTED',
      baselineStart: null,
      baselineEnd: null,
      currentStart: null,
      currentEnd: null,
      milestones: [{
        id: 'm1',
        name: 'Client approval',
        position: 0,
        percentComplete: 0,
        status: 'APPROVAL_REQUESTED',
        baselineDate: null,
        currentDate: null,
        isKeyMilestone: true,
        activities: [{
          id: 'a1',
          title: 'Meklit Tadesse to prepare approval pack',
          ownerParty: 'CLIENT',
          baselineStart: null,
          baselineEnd: null,
          currentStart: null,
          currentEnd: null,
          status: 'APPROVAL_REQUESTED',
          percentComplete: 90,
          isMilestone: false,
          slipDays: 0,
          slipReason: null,
          slipOwner: null,
          waitingSince: new Date('2026-07-10T00:00:00Z'),
        }],
      }],
    }],
  }, { forbiddenEmployeeNames: employeeNames })

  assert.equal(project.description, 'Delivery managed by 360Ground')
  assert.equal(project.phases[0].milestones[0].activities[0].owner, 'Your Team')
  assertNoForbiddenPortalData(project, employeeNames)
})

test('serializeCommentForClient: only CLIENT_VISIBLE comments serialize and authors are anonymous', () => {
  const payload = serializeCommentForClient({
    id: 'c1',
    activityId: 'a1',
    authorId: 'u1',
    content: '<p>Meklit Tadesse added a note</p>',
    parentId: null,
    visibility: 'CLIENT_VISIBLE',
    mentions: ['u1'],
    isClientAuthor: false,
    createdAt: new Date('2026-07-14T00:00:00Z'),
    replies: [{
      id: 'c2',
      activityId: 'a1',
      authorId: 'client1',
      content: '<p>Client reply</p>',
      parentId: 'c1',
      visibility: 'CLIENT_VISIBLE',
      mentions: [],
      isClientAuthor: true,
      createdAt: new Date('2026-07-14T01:00:00Z'),
    }],
  }, { forbiddenEmployeeNames: employeeNames })

  assert.equal(payload.author.name, '360Ground')
  assert.equal(payload.replies[0].author.name, 'Client')
  assertNoForbiddenPortalData(payload, employeeNames)
  assert.throws(() => serializeCommentForClient({
    id: 'c3',
    activityId: 'a1',
    content: 'internal',
    parentId: null,
    visibility: 'INTERNAL',
    isClientAuthor: false,
    createdAt: new Date(),
  }, { forbiddenEmployeeNames: employeeNames }))
})

test('serializeRaidItemForClient: rejects non-client-visible RAID rows', () => {
  const base = {
    id: 'r1',
    type: 'RISK',
    refCode: 'R-001',
    title: 'Client-visible risk',
    description: null,
    category: null,
    probability: 3,
    impact: 4,
    score: 12,
    mitigation: 'Weekly review',
    contingency: null,
    severity: null,
    resolution: null,
    dependsOnParty: null,
    neededByDate: null,
    validated: null,
    validatedAt: null,
    impactIfFalse: null,
    status: 'OPEN',
    clientVisible: true,
    reviewDate: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    closedAt: null,
  }

  assertNoForbiddenPortalData(serializeRaidItemForClient(base, { forbiddenEmployeeNames: employeeNames }), employeeNames)
  assert.throws(() => serializeRaidItemForClient({ ...base, clientVisible: false }, { forbiddenEmployeeNames: employeeNames }))
})

test('scrubPortalPayload: strips forbidden user/cost/Jira keys recursively', () => {
  const scrubbed = scrubPortalPayload({
    assigneeId: 'u1',
    ownerId: 'u2',
    avatar: '/avatar.png',
    estimatedHours: 20,
    jiraIssueKeys: ['MEDA-1'],
    nested: [{ authorId: 'u3', text: 'Biruk Hailu and Meklit Tadesse' }],
  }, { forbiddenEmployeeNames: employeeNames })

  assert.deepEqual(scrubbed, {
    nested: [{ text: '360Ground and 360Ground' }],
  })
  assertNoForbiddenPortalData(scrubbed, employeeNames)
})

test('serializeCommentForClient: @mentions lose the user id, label and name (invariant 4)', () => {
  const payload = serializeCommentForClient({
    id: 'c1',
    activityId: 'a1',
    authorId: 'u_meklit',
    content: '<p>Please review, <span class="mention" data-type="mention" data-id="u_meklit_id" data-mention-id="u_meklit_id" data-label="Meklit Tadesse">@Meklit Tadesse</span> and @Biruk</p>',
    parentId: null,
    visibility: 'CLIENT_VISIBLE',
    mentions: ['u_meklit_id'],
    isClientAuthor: false,
    createdAt: new Date('2026-07-14T00:00:00Z'),
  }, { forbiddenEmployeeNames: employeeNames })

  assert.ok(!payload.content.includes('u_meklit_id'), 'mention user id leaked')
  assert.ok(!/data-(?:id|mention-id|label)/.test(payload.content), 'mention identity attributes leaked')
  assert.match(payload.content, /@360Ground/)
  assert.equal(payload.content.includes('Biruk'), false)
  assertNoForbiddenPortalData(payload, [...employeeNames, 'Meklit', 'Tadesse', 'Biruk'])
})

test('redactForbiddenNames: first-name and last-name tokens are redacted on their own, case-insensitively', () => {
  const names = ['Meklit Tadesse', 'Abel Kebede']
  assert.equal(redactForbiddenNames('Meklit will send it', names), '360Ground will send it')
  assert.equal(redactForbiddenNames('ask tadesse or KEBEDE', names), 'ask 360Ground or 360Ground')
  assert.equal(redactForbiddenNames('Meklit   Tadesse approved', names), '360Ground approved')
  // Word boundaries: a token inside a longer word is left alone.
  assert.equal(redactForbiddenNames('Abelian groups', names), 'Abelian groups')
  // Tokens shorter than 3 characters are not redacted on their own.
  assert.deepEqual(portalRedactionTerms(['Al Bo']), ['Al Bo'])
})

test('redactForbiddenNames: emails and email local parts are redacted', () => {
  const names = ['Meklit Tadesse', 'meklit.t@360ground.com']
  const out = redactForbiddenNames('Mail meklit.t@360ground.com or ping meklit.t', names)
  assert.equal(out.includes('meklit'), false)
  assert.equal(out.includes('@360ground.com'), false)
})

test('redaction never corrupts the neutral labels or enum constants', () => {
  // An employee whose name collides with a label or an enum value.
  const names = ['Amber Client', 'Team Your']
  const activity = serializeActivityForClient({
    id: 'a1',
    title: 'Amber to confirm the scope',
    ownerParty: 'CLIENT',
    baselineStart: null,
    baselineEnd: null,
    currentStart: null,
    currentEnd: null,
    status: 'STARTED',
    percentComplete: 10,
    isMilestone: false,
    slipDays: 0,
    slipReason: 'CLIENT_APPROVAL_DELAY',
    slipOwner: 'CLIENT',
    waitingSince: null,
  }, { forbiddenEmployeeNames: names })
  assert.equal(activity.owner, 'Your Team')
  assert.equal(activity.slipReason, 'CLIENT_APPROVAL_DELAY')
  assert.equal(activity.title, '360Ground to confirm the scope')

  const report = serializeReportForClient({
    id: 'r1',
    type: 'CLIENT_BIMONTHLY',
    periodStart: new Date('2026-07-01T00:00:00Z'),
    periodEnd: new Date('2026-08-31T00:00:00Z'),
    status: 'APPROVED',
    aiSummary: 'Amber is tracking the milestone.',
    contentJson: { header: { pmName: 'Amber Client' }, overallHealth: { rag: 'AMBER' } },
    generatedAt: new Date('2026-08-31T00:00:00Z'),
    approvedAt: null,
    sentAt: null,
  }, { forbiddenEmployeeNames: names })
  const content = report.contentJson as { header: { pmName: string }; overallHealth: { rag: string } }
  assert.equal(content.overallHealth.rag, 'AMBER')
  assert.equal(content.header.pmName, '360Ground')
  assert.equal(report.aiSummary, '360Ground is tracking the milestone.')

  const reply = serializeCommentForClient({
    id: 'c9',
    activityId: 'a1',
    content: 'ok',
    parentId: null,
    visibility: 'CLIENT_VISIBLE',
    isClientAuthor: true,
    createdAt: new Date('2026-07-14T00:00:00Z'),
  }, { forbiddenEmployeeNames: names })
  assert.equal(reply.author.name, 'Client')
})

test('redaction is idempotent (nested replies are scrubbed twice)', () => {
  const once = redactForbiddenNames('<span class="mention" data-id="u1">@Meklit</span> Meklit', employeeNames)
  assert.equal(redactForbiddenNames(once, employeeNames), once)
})

test('loadPortalForbiddenNames: loads inactive users too, with names and emails', async () => {
  let args: unknown = null
  const db = {
    user: {
      async findMany(a: { select: { name: true; email: true } }) {
        args = a
        return [
          { name: 'Meklit Tadesse', email: 'meklit@360ground.com' },
          { name: null, email: 'former.staff@360ground.com' },
          { name: '  ', email: null },
        ]
      },
    },
  }
  const names = await loadPortalForbiddenNames(db)
  assert.deepEqual(names, ['Meklit Tadesse', 'meklit@360ground.com', 'former.staff@360ground.com'])
  assert.equal(JSON.stringify(args).includes('isActive'), false, 'must not filter to active users only')
})

test('planned vs actual: signed calendar-day slip, null (not 0) when unbaselined', () => {
  const d = (iso: string) => new Date(iso)
  assert.equal(plannedVsActualVarianceDays(d('2026-07-05T00:00:00Z'), d('2026-07-08T00:00:00Z')), 3)
  assert.equal(plannedVsActualVarianceDays(d('2026-07-10T00:00:00Z'), d('2026-07-07T00:00:00Z')), -3)
  assert.equal(plannedVsActualVarianceDays(d('2026-07-05T00:00:00Z'), d('2026-07-05T00:00:00Z')), 0)
  // Rounded to the nearest day, like rollup.computeSlipDays (1 day 13 h -> 2).
  assert.equal(plannedVsActualVarianceDays(d('2026-07-05T00:00:00Z'), d('2026-07-06T13:00:00Z')), 2)
  assert.equal(plannedVsActualVarianceDays(null, d('2026-07-05T00:00:00Z')), null)
  assert.equal(plannedVsActualVarianceDays(d('2026-07-05T00:00:00Z'), null), null)
  assert.equal(plannedVsActualSlipState(null), 'NOT_BASELINED')
  assert.equal(plannedVsActualSlipState(0), 'ON_TIME')
  assert.equal(plannedVsActualSlipState(-2), 'AHEAD')
  assert.equal(plannedVsActualSlipState(4), 'SLIPPED')
  assert.deepEqual(
    summarizePlannedVsActual([{ varianceDays: 4 }, { varianceDays: 9 }, { varianceDays: 0 }, { varianceDays: -1 }, { varianceDays: null }]),
    { total: 5, notBaselined: 1, ahead: 1, onTime: 1, slipped: 2, maxSlipDays: 9 },
  )
})

test('serializePlannedVsActualForClient: rows, slip, party-label owners and no employee identity', () => {
  const d = (iso: string) => new Date(iso)
  // "Ahead Slipped" is a hostile employee name: its tokens match slipState
  // enum values case-insensitively and must not corrupt them.
  const names = [...employeeNames, 'Ahead Slipped', 'meklit.t@360ground.com']
  const activity = (over: Record<string, unknown>) => ({
    id: 'a1', title: 'Design by Meklit Tadesse', ownerParty: 'CLIENT', assigneeId: 'u-meklit', estimatedCost: 5000,
    baselineStart: d('2026-07-01T00:00:00Z'), baselineEnd: d('2026-07-05T00:00:00Z'),
    currentStart: d('2026-07-02T00:00:00Z'), currentEnd: d('2026-07-08T00:00:00Z'),
    status: 'STARTED', percentComplete: 40, isMilestone: false, slipDays: 3, slipReason: null, slipOwner: null, waitingSince: null,
    ...over,
  })
  const dto = serializePlannedVsActualForClient({
    baselineVersion: 2,
    baselineCommittedAt: d('2026-06-30T00:00:00Z'),
    phases: [{
      id: 'ph1', name: 'Discovery with Biruk', position: 0, percentComplete: 40, status: 'STARTED',
      baselineStart: null, baselineEnd: null, currentStart: null, currentEnd: null,
      milestones: [{
        id: 'm1', name: 'Sign-off (meklit.t@360ground.com)', position: 0, percentComplete: 40, status: 'STARTED',
        baselineDate: d('2026-07-31T00:00:00Z'), currentDate: d('2026-07-29T00:00:00Z'), isKeyMilestone: true,
        activities: [
          activity({}),
          activity({ id: 'a2', title: 'QA', ownerParty: '360GROUND', baselineStart: null, baselineEnd: null }),
          activity({ id: 'a3', title: 'Deploy', ownerParty: 'SHARED', currentEnd: d('2026-07-05T00:00:00Z') }),
        ],
      }],
    }],
  } as any, { forbiddenEmployeeNames: names })

  assert.equal(dto.baselineVersion, 2)
  assert.equal(dto.milestones.length, 1)
  assert.equal(dto.milestones[0].kind, 'MILESTONE')
  assert.equal(dto.milestones[0].varianceDays, -2)
  assert.equal(dto.milestones[0].slipState, 'AHEAD')
  assert.equal(dto.milestones[0].owner, null)
  assert.equal(dto.milestones[0].baselineStart, null)

  assert.deepEqual(dto.activities.map((r) => [r.id, r.owner, r.varianceDays, r.slipState]), [
    ['a1', 'Your Team', 3, 'SLIPPED'],
    ['a2', '360Ground', null, 'NOT_BASELINED'],
    ['a3', '360Ground', 0, 'ON_TIME'],
  ])
  assert.equal(dto.activities[1].baselineStart, null, 'a null baseline stays null')
  assert.equal(dto.activities[0].name, 'Design by 360Ground')
  assert.equal(dto.activities[0].phaseName, 'Discovery with 360Ground')
  assert.equal(dto.activities[0].milestoneName, 'Sign-off (360Ground)')
  assert.deepEqual(dto.activitySummary, { total: 3, notBaselined: 1, ahead: 0, onTime: 1, slipped: 1, maxSlipDays: 3 })
  assert.deepEqual(dto.milestoneSummary, { total: 1, notBaselined: 0, ahead: 1, onTime: 0, slipped: 0, maxSlipDays: 0 })
  assertNoForbiddenPortalData(dto, [...employeeNames, 'meklit.t@360ground.com', 'u-meklit'])
  assert.ok(!JSON.stringify(dto).includes('5000'), 'cost must not leak')
})

function assertNoForbiddenPortalData(payload: unknown, names: readonly string[]) {
  const json = JSON.stringify(payload)
  for (const name of names) {
    assert.equal(json.toLowerCase().includes(name.toLowerCase()), false, `Portal payload leaked user name ${name}`)
  }
  assertNoForbiddenKeys(payload)
}

function assertNoForbiddenKeys(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeys(item)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assert.equal(PORTAL_FORBIDDEN_KEYS.has(key), false, `Portal payload leaked forbidden key ${key}`)
    assertNoForbiddenKeys(child)
  }
}

test('portal attachment filters keep CLIENT_VISIBLE in SQL for one or many activities', async () => {
  const { portalActivityAttachmentWhere: where, portalProjectActivityWhere, serializeProjectAttachmentForClient } = await import('../../features/projects/services/portal-serializer')
  assert.deepEqual(where(['a1', 'a2']), { activityId: { in: ['a1', 'a2'] }, visibility: 'CLIENT_VISIBLE' })
  assert.deepEqual(portalProjectActivityWhere('p1', ['p1']), {
    milestone: { phase: { project: { AND: [{ id: { in: ['p1'] }, portalEnabled: true, archivedAt: null }, { id: 'p1' }] } } },
  })
  const dto = serializeProjectAttachmentForClient({
    id: 'f1', activityId: 'a1', fileName: 'Meklit notes.pdf', fileSize: 10, mimeType: 'application/pdf',
    visibility: 'CLIENT_VISIBLE', createdAt: new Date('2026-07-01T00:00:00Z'), activity: { title: 'Review with Biruk Hailu' },
    uploadedById: 'u1',
  } as any, { forbiddenEmployeeNames: employeeNames })
  assert.equal(dto.fileName, '360Ground notes.pdf')
  assert.equal(dto.activityTitle, 'Review with 360Ground')
  assert.equal('uploadedById' in dto, false)
  assert.throws(() => serializeProjectAttachmentForClient({ ...dto, visibility: 'INTERNAL', createdAt: new Date(), activity: { title: 'x' } } as any, { forbiddenEmployeeNames: employeeNames }))
})

test('portal change requests: CLIENT_VISIBLE in SQL, party labels only, no requester/approver/cost', async () => {
  const { portalChangeRequestWhere, serializeChangeRequestForClient } = await import('../../features/projects/services/portal-serializer')
  assert.deepEqual(portalChangeRequestWhere('p1'), { projectId: 'p1', visibility: 'CLIENT_VISIBLE' })

  const source = {
    id: 'cr1', projectId: 'p1', crCode: 'CR-001', title: 'Extra report asked by Meklit Tadesse',
    description: 'Biruk Hailu to estimate', type: 'SCOPE_ADD', requestedBy: 'Meklit Tadesse', requestedByParty: 'CLIENT',
    requestDate: new Date('2026-07-01T00:00:00Z'), scheduleImpactDays: 4, costImpact: 5000000, affectedActivityIds: ['a1', 'a2'],
    status: 'APPROVED', ccbDecisionDate: new Date('2026-07-03T00:00:00Z'), approvedById: 'u-meklit', clientSignOff: true,
    clientSignOffAt: new Date('2026-07-04T00:00:00Z'), rejectionReason: null, visibility: 'CLIENT_VISIBLE',
    createdAt: new Date('2026-07-01T00:00:00Z'),
  }
  const dto = serializeChangeRequestForClient(source, { forbiddenEmployeeNames: employeeNames })
  assert.equal(dto.requestedBy, 'Your Team')
  assert.equal(dto.decidedBy, '360Ground')
  assert.equal(dto.title, 'Extra report asked by 360Ground')
  assert.equal(dto.description, '360Ground to estimate')
  assert.equal(dto.affectedActivityCount, 2)
  assert.equal(dto.status, 'APPROVED')
  assert.equal(dto.type, 'SCOPE_ADD')
  for (const key of ['approvedById', 'costImpact', 'affectedActivityIds', 'projectId', 'visibility']) {
    assert.equal(key in dto, false, `${key} must not reach the portal`)
  }
  const json = JSON.stringify(dto)
  for (const term of [...employeeNames, 'Meklit', 'Biruk', 'u-meklit', '5000000']) assert.equal(json.includes(term), false, term)

  assert.equal(serializeChangeRequestForClient({ ...source, requestedByParty: '360GROUND', status: 'SUBMITTED', ccbDecisionDate: null }, { forbiddenEmployeeNames: employeeNames }).requestedBy, '360Ground')
  assert.equal(serializeChangeRequestForClient({ ...source, status: 'UNDER_REVIEW', ccbDecisionDate: null }, { forbiddenEmployeeNames: employeeNames }).decidedBy, null)
  assert.throws(() => serializeChangeRequestForClient({ ...source, visibility: 'INTERNAL' }, { forbiddenEmployeeNames: employeeNames }), /CLIENT_VISIBLE/)
})
