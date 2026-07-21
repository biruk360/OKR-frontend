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
} from '../../features/projects/services/portal-serializer'

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
  }))
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

  assertNoForbiddenPortalData(serializeRaidItemForClient(base), employeeNames)
  assert.throws(() => serializeRaidItemForClient({ ...base, clientVisible: false }))
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
