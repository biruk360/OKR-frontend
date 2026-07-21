import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type ActivitySeed = {
  key: string
  title: string
  status: string
  percentComplete: number
  baselineStart: string
  baselineEnd: string
  currentStart: string
  currentEnd: string
  assigneeIndex?: number
  ownerParty?: string
  priority?: string
  risk?: string
  estimatedHours?: number
  actualHours?: number
  isBlocked?: boolean
  blockedSince?: string
  waitingSince?: string
  slipDays?: number
  slipReason?: string
  slipOwner?: string
  clientVisible?: boolean
  comment?: string
  delay?: {
    eventType: string
    daysLost: number
    owner: string
    reason: string
    reasonDetail: string
    startedAt: string
    endedAt?: string
    recoveryPlan?: string
    recoveryDate?: string
  }
}

type MilestoneSeed = {
  name: string
  status: string
  percentComplete: number
  isKeyMilestone?: boolean
  baselineDate: string
  currentDate: string
  activities: ActivitySeed[]
}

type PhaseSeed = {
  name: string
  weight: number
  status: string
  start: string
  end: string
  milestones: MilestoneSeed[]
}

const d = (value: string) => new Date(value)

const phases: PhaseSeed[] = [
  {
    name: 'Discovery & Alignment',
    weight: 20,
    status: 'STARTED',
    start: '2026-07-20T00:00:00.000Z',
    end: '2026-08-07T00:00:00.000Z',
    milestones: [
      {
        name: 'Kickoff Complete',
        status: 'APPROVED',
        percentComplete: 100,
        isKeyMilestone: true,
        baselineDate: '2026-07-22T00:00:00.000Z',
        currentDate: '2026-07-22T00:00:00.000Z',
        activities: [
          {
            key: 'kickoff',
            title: 'Run kickoff workshop',
            status: 'APPROVED',
            percentComplete: 100,
            baselineStart: '2026-07-20T00:00:00.000Z',
            baselineEnd: '2026-07-22T00:00:00.000Z',
            currentStart: '2026-07-20T00:00:00.000Z',
            currentEnd: '2026-07-22T00:00:00.000Z',
            priority: 'HIGH',
            risk: 'LOW',
            estimatedHours: 18,
            actualHours: 17,
            clientVisible: true,
            comment: '<p>Kickoff complete. Scope boundaries captured.</p>',
          },
          {
            key: 'interviews',
            title: 'Interview department stakeholders',
            status: 'FINISHED',
            percentComplete: 100,
            baselineStart: '2026-07-22T00:00:00.000Z',
            baselineEnd: '2026-07-28T00:00:00.000Z',
            currentStart: '2026-07-23T00:00:00.000Z',
            currentEnd: '2026-07-29T00:00:00.000Z',
            ownerParty: 'SHARED',
            priority: 'MEDIUM',
            risk: 'LOW',
            estimatedHours: 36,
            actualHours: 41,
            slipDays: 1,
            slipReason: 'CLIENT_UNAVAILABILITY',
            slipOwner: 'CLIENT',
            delay: {
              eventType: 'BASELINE_SLIP',
              daysLost: 1,
              owner: 'CLIENT',
              reason: 'CLIENT_UNAVAILABILITY',
              reasonDetail: 'Two interview slots moved by client team.',
              startedAt: '2026-07-23T00:00:00.000Z',
              endedAt: '2026-07-29T00:00:00.000Z',
              recoveryPlan: 'Compress requirement playback review.',
              recoveryDate: '2026-08-01T00:00:00.000Z',
            },
          },
        ],
      },
      {
        name: 'Requirements Baselined',
        status: 'APPROVAL_REQUESTED',
        percentComplete: 70,
        isKeyMilestone: true,
        baselineDate: '2026-07-31T00:00:00.000Z',
        currentDate: '2026-08-05T00:00:00.000Z',
        activities: [
          {
            key: 'requirements',
            title: 'Document requirements baseline',
            status: 'FINISHED',
            percentComplete: 100,
            baselineStart: '2026-07-29T00:00:00.000Z',
            baselineEnd: '2026-07-31T00:00:00.000Z',
            currentStart: '2026-07-30T00:00:00.000Z',
            currentEnd: '2026-08-01T00:00:00.000Z',
            priority: 'HIGH',
            risk: 'MEDIUM',
            estimatedHours: 28,
            actualHours: 30,
          },
          {
            key: 'req-signoff',
            title: 'Client sign-off on requirements',
            status: 'APPROVAL_REQUESTED',
            percentComplete: 35,
            baselineStart: '2026-08-01T00:00:00.000Z',
            baselineEnd: '2026-08-04T00:00:00.000Z',
            currentStart: '2026-08-01T00:00:00.000Z',
            currentEnd: '2026-08-07T00:00:00.000Z',
            ownerParty: 'CLIENT',
            priority: 'CRITICAL',
            risk: 'HIGH',
            waitingSince: '2026-08-03T00:00:00.000Z',
            estimatedHours: 8,
            slipDays: 3,
            slipReason: 'CLIENT_APPROVAL_DELAY',
            slipOwner: 'CLIENT',
            clientVisible: true,
            delay: {
              eventType: 'APPROVAL_WAIT',
              daysLost: 3,
              owner: 'CLIENT',
              reason: 'CLIENT_APPROVAL_DELAY',
              reasonDetail: 'Awaiting steering committee approval.',
              startedAt: '2026-08-03T00:00:00.000Z',
              recoveryPlan: 'Escalate to sponsor and hold daily follow-up.',
              recoveryDate: '2026-08-08T00:00:00.000Z',
            },
          },
        ],
      },
    ],
  },
  {
    name: 'Solution Design',
    weight: 25,
    status: 'STARTED',
    start: '2026-08-10T00:00:00.000Z',
    end: '2026-09-04T00:00:00.000Z',
    milestones: [
      {
        name: 'Architecture Approved',
        status: 'STARTED',
        percentComplete: 55,
        isKeyMilestone: true,
        baselineDate: '2026-08-21T00:00:00.000Z',
        currentDate: '2026-08-25T00:00:00.000Z',
        activities: [
          {
            key: 'architecture',
            title: 'Define target architecture',
            status: 'STARTED',
            percentComplete: 65,
            baselineStart: '2026-08-10T00:00:00.000Z',
            baselineEnd: '2026-08-17T00:00:00.000Z',
            currentStart: '2026-08-10T00:00:00.000Z',
            currentEnd: '2026-08-19T00:00:00.000Z',
            priority: 'HIGH',
            risk: 'MEDIUM',
            estimatedHours: 44,
            actualHours: 24,
            slipDays: 2,
            slipReason: 'TECHNICAL_BLOCKER',
            slipOwner: '360GROUND',
            delay: {
              eventType: 'BLOCKED',
              daysLost: 2,
              owner: '360GROUND',
              reason: 'TECHNICAL_BLOCKER',
              reasonDetail: 'Legacy API authentication pattern required extra validation.',
              startedAt: '2026-08-14T00:00:00.000Z',
              endedAt: '2026-08-16T00:00:00.000Z',
            },
          },
          {
            key: 'data-model',
            title: 'Design data model and integration contracts',
            status: 'STARTED',
            percentComplete: 45,
            baselineStart: '2026-08-18T00:00:00.000Z',
            baselineEnd: '2026-08-22T00:00:00.000Z',
            currentStart: '2026-08-20T00:00:00.000Z',
            currentEnd: '2026-08-26T00:00:00.000Z',
            priority: 'HIGH',
            risk: 'HIGH',
            estimatedHours: 40,
            isBlocked: true,
            blockedSince: '2026-08-23T00:00:00.000Z',
          },
        ],
      },
      {
        name: 'Prototype Reviewed',
        status: 'NOT_STARTED',
        percentComplete: 20,
        baselineDate: '2026-09-04T00:00:00.000Z',
        currentDate: '2026-09-05T00:00:00.000Z',
        activities: [
          {
            key: 'ux-prototype',
            title: 'Build clickable UX prototype',
            status: 'NOT_STARTED',
            percentComplete: 10,
            baselineStart: '2026-08-24T00:00:00.000Z',
            baselineEnd: '2026-09-02T00:00:00.000Z',
            currentStart: '2026-08-27T00:00:00.000Z',
            currentEnd: '2026-09-04T00:00:00.000Z',
            priority: 'MEDIUM',
            risk: 'MEDIUM',
            estimatedHours: 52,
          },
          {
            key: 'design-review',
            title: 'Run design review and capture changes',
            status: 'NOT_STARTED',
            percentComplete: 0,
            baselineStart: '2026-09-03T00:00:00.000Z',
            baselineEnd: '2026-09-04T00:00:00.000Z',
            currentStart: '2026-09-04T00:00:00.000Z',
            currentEnd: '2026-09-05T00:00:00.000Z',
            ownerParty: 'SHARED',
            priority: 'MEDIUM',
            risk: 'LOW',
            estimatedHours: 14,
          },
        ],
      },
    ],
  },
  {
    name: 'Build & Integrate',
    weight: 40,
    status: 'NOT_STARTED',
    start: '2026-09-07T00:00:00.000Z',
    end: '2026-10-16T00:00:00.000Z',
    milestones: [
      {
        name: 'Core Build Complete',
        status: 'NOT_STARTED',
        percentComplete: 0,
        isKeyMilestone: true,
        baselineDate: '2026-10-02T00:00:00.000Z',
        currentDate: '2026-10-06T00:00:00.000Z',
        activities: [
          {
            key: 'api-build',
            title: 'Implement project delivery APIs',
            status: 'NOT_STARTED',
            percentComplete: 0,
            baselineStart: '2026-09-07T00:00:00.000Z',
            baselineEnd: '2026-09-18T00:00:00.000Z',
            currentStart: '2026-09-08T00:00:00.000Z',
            currentEnd: '2026-09-21T00:00:00.000Z',
            priority: 'CRITICAL',
            risk: 'HIGH',
            estimatedHours: 96,
          },
          {
            key: 'ui-build',
            title: 'Implement delivery workspace UI',
            status: 'NOT_STARTED',
            percentComplete: 0,
            baselineStart: '2026-09-14T00:00:00.000Z',
            baselineEnd: '2026-09-25T00:00:00.000Z',
            currentStart: '2026-09-17T00:00:00.000Z',
            currentEnd: '2026-09-29T00:00:00.000Z',
            priority: 'HIGH',
            risk: 'MEDIUM',
            estimatedHours: 88,
          },
          {
            key: 'integration',
            title: 'Integrate notifications and reporting',
            status: 'NOT_STARTED',
            percentComplete: 0,
            baselineStart: '2026-09-28T00:00:00.000Z',
            baselineEnd: '2026-10-02T00:00:00.000Z',
            currentStart: '2026-09-30T00:00:00.000Z',
            currentEnd: '2026-10-06T00:00:00.000Z',
            priority: 'HIGH',
            risk: 'MEDIUM',
            estimatedHours: 48,
          },
        ],
      },
      {
        name: 'UAT Ready',
        status: 'NOT_STARTED',
        percentComplete: 0,
        isKeyMilestone: true,
        baselineDate: '2026-10-16T00:00:00.000Z',
        currentDate: '2026-10-20T00:00:00.000Z',
        activities: [
          {
            key: 'qa-cycle',
            title: 'Execute QA regression cycle',
            status: 'NOT_STARTED',
            percentComplete: 0,
            baselineStart: '2026-10-05T00:00:00.000Z',
            baselineEnd: '2026-10-12T00:00:00.000Z',
            currentStart: '2026-10-07T00:00:00.000Z',
            currentEnd: '2026-10-14T00:00:00.000Z',
            priority: 'HIGH',
            risk: 'LOW',
            estimatedHours: 64,
          },
          {
            key: 'uat',
            title: 'Coordinate client UAT',
            status: 'NOT_STARTED',
            percentComplete: 0,
            baselineStart: '2026-10-13T00:00:00.000Z',
            baselineEnd: '2026-10-16T00:00:00.000Z',
            currentStart: '2026-10-15T00:00:00.000Z',
            currentEnd: '2026-10-20T00:00:00.000Z',
            ownerParty: 'CLIENT',
            priority: 'CRITICAL',
            risk: 'HIGH',
            estimatedHours: 32,
            clientVisible: true,
          },
        ],
      },
    ],
  },
  {
    name: 'Launch & Handover',
    weight: 15,
    status: 'NOT_STARTED',
    start: '2026-10-19T00:00:00.000Z',
    end: '2026-11-13T00:00:00.000Z',
    milestones: [
      {
        name: 'Go-live',
        status: 'NOT_STARTED',
        percentComplete: 0,
        isKeyMilestone: true,
        baselineDate: '2026-11-06T00:00:00.000Z',
        currentDate: '2026-11-10T00:00:00.000Z',
        activities: [
          {
            key: 'migration',
            title: 'Prepare migration runbook',
            status: 'NOT_STARTED',
            percentComplete: 0,
            baselineStart: '2026-10-19T00:00:00.000Z',
            baselineEnd: '2026-10-23T00:00:00.000Z',
            currentStart: '2026-10-21T00:00:00.000Z',
            currentEnd: '2026-10-27T00:00:00.000Z',
            priority: 'HIGH',
            risk: 'MEDIUM',
            estimatedHours: 36,
          },
          {
            key: 'training',
            title: 'Train operations team',
            status: 'NOT_STARTED',
            percentComplete: 0,
            baselineStart: '2026-10-26T00:00:00.000Z',
            baselineEnd: '2026-10-30T00:00:00.000Z',
            currentStart: '2026-10-28T00:00:00.000Z',
            currentEnd: '2026-11-03T00:00:00.000Z',
            ownerParty: 'SHARED',
            priority: 'MEDIUM',
            risk: 'LOW',
            estimatedHours: 30,
          },
          {
            key: 'golive',
            title: 'Execute go-live and hypercare',
            status: 'NOT_STARTED',
            percentComplete: 0,
            baselineStart: '2026-11-02T00:00:00.000Z',
            baselineEnd: '2026-11-06T00:00:00.000Z',
            currentStart: '2026-11-04T00:00:00.000Z',
            currentEnd: '2026-11-10T00:00:00.000Z',
            priority: 'CRITICAL',
            risk: 'HIGH',
            estimatedHours: 60,
          },
        ],
      },
      {
        name: 'Closure',
        status: 'NOT_STARTED',
        percentComplete: 0,
        baselineDate: '2026-11-13T00:00:00.000Z',
        currentDate: '2026-11-13T00:00:00.000Z',
        activities: [
          {
            key: 'handover',
            title: 'Complete handover pack',
            status: 'NOT_STARTED',
            percentComplete: 0,
            baselineStart: '2026-11-09T00:00:00.000Z',
            baselineEnd: '2026-11-13T00:00:00.000Z',
            currentStart: '2026-11-10T00:00:00.000Z',
            currentEnd: '2026-11-13T00:00:00.000Z',
            priority: 'MEDIUM',
            risk: 'LOW',
            estimatedHours: 28,
          },
        ],
      },
    ],
  },
]

const dependencies = [
  ['kickoff', 'interviews', 'FS', 0],
  ['interviews', 'requirements', 'FS', 0],
  ['requirements', 'req-signoff', 'FS', 0],
  ['req-signoff', 'architecture', 'FS', 1],
  ['architecture', 'data-model', 'SS', 2],
  ['data-model', 'ux-prototype', 'FS', 0],
  ['ux-prototype', 'design-review', 'FF', 0],
  ['design-review', 'api-build', 'FS', 1],
  ['api-build', 'ui-build', 'SS', 5],
  ['api-build', 'integration', 'FS', 0],
  ['ui-build', 'qa-cycle', 'FS', 0],
  ['integration', 'qa-cycle', 'FF', 0],
  ['qa-cycle', 'uat', 'FS', 0],
  ['uat', 'migration', 'FS', 1],
  ['migration', 'training', 'SS', 2],
  ['training', 'golive', 'FS', 0],
  ['golive', 'handover', 'FS', 0],
] as const

async function main() {
  const allUsers = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  })
  if (allUsers.length === 0) throw new Error('Need at least one active user to own the sample project.')

  const users = allUsers.slice(0, 8)
  const pm = allUsers.find((user) => user.role === 'ADMIN') ?? allUsers[0]
  const assignee = (index: number) => users.length ? users[index % users.length].id : null
  const existing = await prisma.project.findUnique({
    where: { code: 'PRJ-DEMO-GANTT' },
    select: { id: true },
  })

  if (existing) {
    await prisma.project.delete({ where: { id: existing.id } })
  }

  const project = await prisma.project.create({
    data: {
      code: 'PRJ-DEMO-GANTT',
      name: 'Demo Gantt Delivery Project',
      description:
        'Sample delivery project populated for Gantt QA: phases, milestones, tasks, dependencies, baselines, comments, mixed statuses, owner attribution, and slip data.',
      clientName: 'Acme Client Group',
      projectManagerId: pm.id,
      createdById: pm.id,
      plannedStart: d('2026-07-20T00:00:00.000Z'),
      plannedEnd: d('2026-11-13T00:00:00.000Z'),
      baselineCommittedAt: d('2026-07-20T09:00:00.000Z'),
      baselineVersion: 1,
      status: 'ACTIVE',
      ragStatus: 'AMBER',
      confidence: 68,
      percentComplete: 42,
      percentPlanned: 37,
      spi: 0.92,
      cpi: 1.03,
      budgetAtCompletion: 4_200_000,
      contractValue: 5_600_000,
      currency: 'ETB',
      portalEnabled: true,
      clientEmails: ['client.pm@example.com', 'sponsor@example.com'],
      members: {
        create: users.slice(0, 6).map((user, index) => ({
          userId: user.id,
          role: index === 0 ? 'PM' : index === 1 ? 'BA' : index === 2 ? 'DESIGNER' : index === 3 ? 'DEVELOPER' : index === 4 ? 'QA' : 'CLIENT_CONTACT',
          allocationPct: index === 0 ? 75 : 50,
        })),
      },
    },
  })

  const activityByKey = new Map<string, string>()

  for (const [phaseIndex, phaseSeed] of phases.entries()) {
    const phasePercent =
      phaseSeed.milestones.reduce((sum, milestone) => sum + milestone.percentComplete, 0) / phaseSeed.milestones.length
    const phase = await prisma.phase.create({
      data: {
        projectId: project.id,
        position: phaseIndex + 1,
        name: phaseSeed.name,
        weight: phaseSeed.weight,
        status: phaseSeed.status,
        plannedStart: d(phaseSeed.start),
        plannedEnd: d(phaseSeed.end),
        baselineStart: d(phaseSeed.start),
        baselineEnd: d(phaseSeed.end),
        currentStart: d(phaseSeed.start),
        currentEnd: d(phaseSeed.end),
        percentComplete: phasePercent,
      },
    })

    for (const [milestoneIndex, milestoneSeed] of phaseSeed.milestones.entries()) {
      const milestone = await prisma.milestone.create({
        data: {
          phaseId: phase.id,
          position: milestoneIndex + 1,
          name: milestoneSeed.name,
          weight: 1,
          status: milestoneSeed.status,
          percentComplete: milestoneSeed.percentComplete,
          isKeyMilestone: !!milestoneSeed.isKeyMilestone,
          baselineDate: d(milestoneSeed.baselineDate),
          currentDate: d(milestoneSeed.currentDate),
        },
      })

      for (const [activityIndex, activitySeed] of milestoneSeed.activities.entries()) {
        const activity = await prisma.activity.create({
          data: {
            milestoneId: milestone.id,
            position: activityIndex + 1,
            title: activitySeed.title,
            assigneeId: activitySeed.ownerParty === 'CLIENT' ? null : assignee(activitySeed.assigneeIndex ?? activityIndex),
            ownerParty: activitySeed.ownerParty ?? '360GROUND',
            baselineStart: d(activitySeed.baselineStart),
            baselineEnd: d(activitySeed.baselineEnd),
            currentStart: d(activitySeed.currentStart),
            currentEnd: d(activitySeed.currentEnd),
            status: activitySeed.status,
            percentComplete: activitySeed.percentComplete,
            estimatedHours: activitySeed.estimatedHours ?? 24,
            actualHours: activitySeed.actualHours ?? null,
            priority: activitySeed.priority ?? 'MEDIUM',
            risk: activitySeed.risk ?? 'LOW',
            isBlocked: !!activitySeed.isBlocked,
            blockedSince: activitySeed.blockedSince ? d(activitySeed.blockedSince) : null,
            waitingSince: activitySeed.waitingSince ? d(activitySeed.waitingSince) : null,
            slipDays: activitySeed.slipDays ?? 0,
            slipReason: activitySeed.slipReason ?? null,
            slipOwner: activitySeed.slipOwner ?? null,
            comments: {
              create: [
                {
                  authorId: pm.id,
                  content: activitySeed.comment ?? `<p>Sample note for ${activitySeed.title}.</p>`,
                  visibility: activitySeed.clientVisible ? 'CLIENT_VISIBLE' : 'INTERNAL',
                  mentions: [],
                },
              ],
            },
          },
        })

        activityByKey.set(activitySeed.key, activity.id)

        if (activitySeed.delay) {
          await prisma.delayEvent.create({
            data: {
              projectId: project.id,
              activityId: activity.id,
              eventType: activitySeed.delay.eventType,
              daysLost: activitySeed.delay.daysLost,
              owner: activitySeed.delay.owner,
              reason: activitySeed.delay.reason,
              reasonDetail: activitySeed.delay.reasonDetail,
              phaseAtTime: phaseSeed.name,
              startedAt: d(activitySeed.delay.startedAt),
              endedAt: activitySeed.delay.endedAt ? d(activitySeed.delay.endedAt) : null,
              recordedById: pm.id,
              recoveryPlan: activitySeed.delay.recoveryPlan ?? null,
              recoveryOwner: pm.id,
              recoveryDate: activitySeed.delay.recoveryDate ? d(activitySeed.delay.recoveryDate) : null,
            },
          })
        }
      }
    }
  }

  for (const [from, to, type, lagDays] of dependencies) {
    const predecessorId = activityByKey.get(from)
    const successorId = activityByKey.get(to)
    if (!predecessorId || !successorId) continue
    await prisma.activityDependency.create({
      data: { predecessorId, successorId, type, lagDays },
    })
  }

  const created = await prisma.project.findUniqueOrThrow({
    where: { id: project.id },
    select: {
      id: true,
      code: true,
      name: true,
      phases: {
        select: {
          id: true,
          milestones: { select: { id: true, activities: { select: { id: true } } } },
        },
      },
    },
  })

  const milestoneCount = created.phases.reduce((sum, phase) => sum + phase.milestones.length, 0)
  const activityCount = created.phases.reduce(
    (sum, phase) => sum + phase.milestones.reduce((inner, milestone) => inner + milestone.activities.length, 0),
    0
  )

  console.log(
    JSON.stringify(
      {
        projectId: created.id,
        code: created.code,
        name: created.name,
        phaseCount: created.phases.length,
        milestoneCount,
        activityCount,
        dependencyCount: dependencies.length,
        url: `http://localhost:3000/dashboard/projects/${created.id}`,
      },
      null,
      2
    )
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
