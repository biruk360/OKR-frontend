/**
 * Comprehensive test data seeder.
 * Creates realistic OKR data spanning 4 months across multiple users and departments.
 * Run: npx tsx prisma/seed-test-data.ts
 */
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const PASSWORD = bcrypt.hashSync('password123', 10)

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function main() {
  console.log('Seeding test data...')

  // ─── Departments ───
  const departments = await Promise.all([
    prisma.department.create({ data: { id: cuid(), name: 'Engineering', description: 'Product & platform engineering' } }),
    prisma.department.create({ data: { id: cuid(), name: 'Marketing', description: 'Growth, content, and brand' } }),
    prisma.department.create({ data: { id: cuid(), name: 'Sales', description: 'Revenue and partnerships' } }),
  ])
  const [engDept, mktDept, salesDept] = departments
  console.log(`  Created ${departments.length} departments`)

  // ─── Users ───
  const usersData = [
    { name: 'Sarah Chen', email: 'sarah@company.com', role: 'ADMIN', dept: engDept },
    { name: 'Marcus Johnson', email: 'marcus@company.com', role: 'EXECUTIVE', dept: null },
    { name: 'Aisha Patel', email: 'aisha@company.com', role: 'DEPARTMENT_LEAD', dept: engDept },
    { name: 'David Kim', email: 'david@company.com', role: 'DEPARTMENT_LEAD', dept: mktDept },
    { name: 'Elena Rodriguez', email: 'elena@company.com', role: 'DEPARTMENT_LEAD', dept: salesDept },
    { name: 'James Wright', email: 'james@company.com', role: 'EMPLOYEE', dept: engDept },
    { name: 'Priya Sharma', email: 'priya@company.com', role: 'EMPLOYEE', dept: engDept },
    { name: 'Omar Hassan', email: 'omar@company.com', role: 'EMPLOYEE', dept: mktDept },
    { name: 'Sofia Martinez', email: 'sofia@company.com', role: 'EMPLOYEE', dept: salesDept },
    { name: 'Liam O\'Brien', email: 'liam@company.com', role: 'EMPLOYEE', dept: salesDept },
  ]

  const users = await Promise.all(
    usersData.map((u) =>
      prisma.user.create({
        data: { id: cuid(), name: u.name, email: u.email, password: PASSWORD, role: u.role, isActive: true },
      })
    )
  )
  console.log(`  Created ${users.length} users`)

  // Department memberships
  for (const u of usersData) {
    if (u.dept) {
      const user = users.find((x) => x.email === u.email)!
      await prisma.departmentMembership.create({
        data: { id: cuid(), userId: user.id, departmentId: u.dept.id, role: u.role === 'DEPARTMENT_LEAD' ? 'Lead' : 'Member' },
      })
    }
  }

  // Manager relationships
  const sarah = users.find((u) => u.email === 'sarah@company.com')!
  const aisha = users.find((u) => u.email === 'aisha@company.com')!
  const david = users.find((u) => u.email === 'david@company.com')!
  const elena = users.find((u) => u.email === 'elena@company.com')!
  const james = users.find((u) => u.email === 'james@company.com')!
  const priya = users.find((u) => u.email === 'priya@company.com')!
  const omar = users.find((u) => u.email === 'omar@company.com')!
  const sofia = users.find((u) => u.email === 'sofia@company.com')!
  const liam = users.find((u) => u.email === 'liam@company.com')!
  const marcus = users.find((u) => u.email === 'marcus@company.com')!

  await Promise.all([
    prisma.managerRelationship.create({ data: { id: cuid(), managerId: aisha.id, directReportId: james.id } }),
    prisma.managerRelationship.create({ data: { id: cuid(), managerId: aisha.id, directReportId: priya.id } }),
    prisma.managerRelationship.create({ data: { id: cuid(), managerId: david.id, directReportId: omar.id } }),
    prisma.managerRelationship.create({ data: { id: cuid(), managerId: elena.id, directReportId: sofia.id } }),
    prisma.managerRelationship.create({ data: { id: cuid(), managerId: elena.id, directReportId: liam.id } }),
  ])

  // ─── Timeframes ───
  const timeframes = await Promise.all([
    prisma.timeframe.create({ data: { id: cuid(), name: 'Q1 2026', type: 'QUARTERLY', startDate: new Date('2026-01-01'), endDate: new Date('2026-03-31'), isActive: true } }),
    prisma.timeframe.create({ data: { id: cuid(), name: 'Q2 2026', type: 'QUARTERLY', startDate: new Date('2026-04-01'), endDate: new Date('2026-06-30'), isActive: true } }),
    prisma.timeframe.create({ data: { id: cuid(), name: 'H1 2026', type: 'SIX_MONTH', startDate: new Date('2026-01-01'), endDate: new Date('2026-06-30'), isActive: true } }),
  ])
  const [q1, q2, h1] = timeframes
  console.log(`  Created ${timeframes.length} timeframes`)

  // ─── Objectives ───
  // Company-level
  const companyObj1 = await prisma.objective.create({
    data: {
      id: cuid(), title: 'Achieve $5M ARR by end of H1', description: 'Drive revenue growth through product-led expansion and enterprise sales.',
      level: 'COMPANY', ownerId: marcus.id, timeframeId: h1.id, goalStatus: 'ON_TRACK', progress: 42, checkInCadence: 'BIWEEKLY',
    },
  })
  const companyObj2 = await prisma.objective.create({
    data: {
      id: cuid(), title: 'Launch V2 platform with 99.9% uptime', description: 'Ship the next-gen platform with enterprise-grade reliability.',
      level: 'COMPANY', ownerId: marcus.id, timeframeId: q2.id, goalStatus: 'AT_RISK', progress: 28, checkInCadence: 'WEEKLY',
    },
  })
  const companyObj3 = await prisma.objective.create({
    data: {
      id: cuid(), title: 'Build a high-performing team of 50+', description: 'Hire, onboard, and retain top talent.',
      level: 'COMPANY', ownerId: sarah.id, timeframeId: h1.id, goalStatus: 'ON_TRACK', progress: 65, checkInCadence: 'MONTHLY',
    },
  })

  // Department-level
  const deptObjs = await Promise.all([
    prisma.objective.create({ data: { id: cuid(), title: 'Ship 3 major features per quarter', level: 'DEPARTMENT', ownerId: aisha.id, timeframeId: q2.id, departmentId: engDept.id, parentObjectiveId: companyObj2.id, goalStatus: 'AT_RISK', progress: 35, checkInCadence: 'WEEKLY' } }),
    prisma.objective.create({ data: { id: cuid(), title: 'Generate 500 MQLs per month', level: 'DEPARTMENT', ownerId: david.id, timeframeId: q2.id, departmentId: mktDept.id, parentObjectiveId: companyObj1.id, goalStatus: 'ON_TRACK', progress: 58, checkInCadence: 'WEEKLY' } }),
    prisma.objective.create({ data: { id: cuid(), title: 'Close $2M in new ARR', level: 'DEPARTMENT', ownerId: elena.id, timeframeId: q2.id, departmentId: salesDept.id, parentObjectiveId: companyObj1.id, goalStatus: 'ON_TRACK', progress: 45, checkInCadence: 'BIWEEKLY' } }),
    prisma.objective.create({ data: { id: cuid(), title: 'Reduce infrastructure costs by 20%', level: 'DEPARTMENT', ownerId: aisha.id, timeframeId: q1.id, departmentId: engDept.id, goalStatus: 'ON_TRACK', progress: 78, checkInCadence: 'MONTHLY' } }),
    prisma.objective.create({ data: { id: cuid(), title: 'Increase brand awareness by 40%', level: 'DEPARTMENT', ownerId: david.id, timeframeId: q1.id, departmentId: mktDept.id, goalStatus: 'ON_TRACK', progress: 90, checkInCadence: 'MONTHLY' } }),
  ])

  // Individual objectives
  const indivObjs = await Promise.all([
    prisma.objective.create({ data: { id: cuid(), title: 'Implement real-time notification system', level: 'INDIVIDUAL', ownerId: james.id, timeframeId: q2.id, parentObjectiveId: deptObjs[0].id, goalStatus: 'AT_RISK', progress: 20, checkInCadence: 'WEEKLY' } }),
    prisma.objective.create({ data: { id: cuid(), title: 'Build API rate limiting and caching layer', level: 'INDIVIDUAL', ownerId: priya.id, timeframeId: q2.id, parentObjectiveId: deptObjs[0].id, goalStatus: 'ON_TRACK', progress: 55, checkInCadence: 'WEEKLY' } }),
    prisma.objective.create({ data: { id: cuid(), title: 'Run Q2 product launch campaign', level: 'INDIVIDUAL', ownerId: omar.id, timeframeId: q2.id, parentObjectiveId: deptObjs[1].id, goalStatus: 'ON_TRACK', progress: 62, checkInCadence: 'WEEKLY' } }),
    prisma.objective.create({ data: { id: cuid(), title: 'Close 5 enterprise deals', level: 'INDIVIDUAL', ownerId: sofia.id, timeframeId: q2.id, parentObjectiveId: deptObjs[2].id, goalStatus: 'OFF_TRACK', progress: 15, checkInCadence: 'WEEKLY' } }),
    prisma.objective.create({ data: { id: cuid(), title: 'Build partner channel pipeline', level: 'INDIVIDUAL', ownerId: liam.id, timeframeId: q2.id, parentObjectiveId: deptObjs[2].id, goalStatus: 'ON_TRACK', progress: 40, checkInCadence: 'BIWEEKLY' } }),
  ])
  const allObjectives = [companyObj1, companyObj2, companyObj3, ...deptObjs, ...indivObjs]
  console.log(`  Created ${allObjectives.length} objectives`)

  // ─── Key Results ───
  const krData: Array<{ title: string; owner: typeof james; objectiveIdx: number; target: number; current: number; unit: string; confidence: string }> = [
    // Company obj 1 KRs
    { title: 'Reach $5M ARR', owner: marcus, objectiveIdx: 0, target: 5000000, current: 2100000, unit: '$', confidence: 'ON_TRACK' },
    { title: 'Achieve 95% customer retention rate', owner: marcus, objectiveIdx: 0, target: 95, current: 92, unit: '%', confidence: 'ON_TRACK' },
    // Company obj 2 KRs
    { title: 'Ship V2 beta by April 30', owner: aisha, objectiveIdx: 1, target: 100, current: 28, unit: '%', confidence: 'AT_RISK' },
    { title: 'Achieve 99.9% uptime SLA', owner: aisha, objectiveIdx: 1, target: 99.9, current: 99.7, unit: '%', confidence: 'AT_RISK' },
    // Company obj 3 KRs
    { title: 'Hire 15 engineers', owner: sarah, objectiveIdx: 2, target: 15, current: 10, unit: 'hires', confidence: 'ON_TRACK' },
    { title: 'Employee NPS > 70', owner: sarah, objectiveIdx: 2, target: 70, current: 68, unit: 'NPS', confidence: 'ON_TRACK' },
    // Dept obj KRs
    { title: 'Ship notifications feature', owner: james, objectiveIdx: 3, target: 100, current: 35, unit: '%', confidence: 'AT_RISK' },
    { title: 'Ship analytics dashboard', owner: priya, objectiveIdx: 3, target: 100, current: 55, unit: '%', confidence: 'ON_TRACK' },
    { title: 'Ship integrations module', owner: james, objectiveIdx: 3, target: 100, current: 20, unit: '%', confidence: 'OFF_TRACK' },
    { title: 'Generate 1500 MQLs', owner: omar, objectiveIdx: 4, target: 1500, current: 870, unit: 'MQLs', confidence: 'ON_TRACK' },
    { title: 'Increase blog traffic to 50K/month', owner: omar, objectiveIdx: 4, target: 50000, current: 38000, unit: 'visits', confidence: 'ON_TRACK' },
    { title: 'Sign 10 new enterprise contracts', owner: sofia, objectiveIdx: 5, target: 10, current: 4, unit: 'deals', confidence: 'ON_TRACK' },
    { title: 'Increase average deal size to $200K', owner: liam, objectiveIdx: 5, target: 200000, current: 165000, unit: '$', confidence: 'AT_RISK' },
    { title: 'Reduce cloud spend by $50K/month', owner: priya, objectiveIdx: 6, target: 50000, current: 39000, unit: '$', confidence: 'ON_TRACK' },
    { title: 'Migrate 100% of services to K8s', owner: james, objectiveIdx: 6, target: 100, current: 78, unit: '%', confidence: 'ON_TRACK' },
    // Individual KRs
    { title: 'WebSocket infra with <100ms latency', owner: james, objectiveIdx: 8, target: 100, current: 20, unit: '%', confidence: 'AT_RISK' },
    { title: 'API p99 latency under 200ms', owner: priya, objectiveIdx: 9, target: 200, current: 180, unit: 'ms', confidence: 'ON_TRACK' },
    { title: 'Launch 3 webinars with 500+ attendees each', owner: omar, objectiveIdx: 10, target: 3, current: 2, unit: 'webinars', confidence: 'ON_TRACK' },
    { title: 'Close 5 enterprise POCs', owner: sofia, objectiveIdx: 11, target: 5, current: 1, unit: 'POCs', confidence: 'OFF_TRACK' },
    { title: 'Build partner pipeline of $1M', owner: liam, objectiveIdx: 12, target: 1000000, current: 400000, unit: '$', confidence: 'ON_TRACK' },
  ]

  const keyResults = []
  for (const kr of krData) {
    const obj = allObjectives[kr.objectiveIdx]
    const progress = kr.unit === '%' ? kr.current : Math.min((kr.current / kr.target) * 100, 100)
    const created = await prisma.keyResult.create({
      data: {
        id: cuid(), title: kr.title, ownerId: kr.owner.id, objectiveId: obj.id,
        startValue: 0, targetValue: kr.target, currentValue: kr.current, unit: kr.unit,
        confidence: kr.confidence, progress: Math.round(progress), checkInCadence: 'WEEKLY',
      },
    })
    keyResults.push(created)
  }
  console.log(`  Created ${keyResults.length} key results`)

  // ─── Check-ins (spread over 4 months) ───
  let checkInCount = 0
  for (const kr of keyResults) {
    const numCheckIns = 3 + Math.floor(Math.random() * 8)
    for (let i = 0; i < numCheckIns; i++) {
      const date = randomDate(new Date('2026-01-15'), new Date('2026-04-12'))
      const progress = Math.round(kr.currentValue * (i + 1) / numCheckIns * 10) / 10
      await prisma.keyResultCheckIn.create({
        data: {
          id: cuid(), keyResultId: kr.id, createdById: kr.ownerId,
          asOfDate: date, value: Math.min(progress, kr.currentValue),
          confidence: pick(['ON_TRACK', 'AT_RISK', 'ON_TRACK', 'ON_TRACK']),
          analysis: pick([null, 'Good progress this week', 'Need to accelerate', 'Blocked on dependencies', 'On track, continuing execution']),
        },
      })
      checkInCount++
    }
  }
  console.log(`  Created ${checkInCount} check-ins`)

  // ─── Initiatives (Todos) ───
  const todoTitles = [
    'Write technical design doc', 'Set up CI/CD pipeline', 'Create user stories', 'Draft email campaign',
    'Schedule customer interviews', 'Build prototype', 'Review competitor analysis', 'Update sales deck',
    'Fix critical bug in auth flow', 'Optimize database queries', 'Write blog post', 'Prepare demo script',
    'Set up monitoring alerts', 'Create landing page', 'Run A/B test', 'Conduct code review',
    'Update API documentation', 'Design onboarding flow', 'Build analytics dashboard', 'Create training materials',
    'Set up staging environment', 'Write integration tests', 'Review security audit', 'Prepare quarterly report',
    'Update project roadmap', 'Schedule team retro', 'Create social media content', 'Build email templates',
    'Implement search feature', 'Optimize image pipeline', 'Draft partnership proposal', 'Set up user feedback loop',
  ]
  const statuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'PENDING']

  let todoCount = 0
  for (const kr of keyResults) {
    const numTodos = 2 + Math.floor(Math.random() * 4)
    for (let i = 0; i < numTodos; i++) {
      const status = pick(statuses)
      const assignee = pick(users)
      const dueDate = randomDate(new Date('2026-02-01'), new Date('2026-05-30'))
      await prisma.todo.create({
        data: {
          id: cuid(), title: pick(todoTitles), description: pick([null, 'Detailed description of the task', 'High priority item']),
          status, assigneeId: assignee.id, creatorId: kr.ownerId, keyResultId: kr.id,
          dueDate, completedAt: status === 'COMPLETED' ? randomDate(dueDate, new Date('2026-04-12')) : null,
        },
      })
      todoCount++
    }
  }

  // Standalone todos (not linked to KR)
  for (let i = 0; i < 8; i++) {
    const owner = pick(users)
    await prisma.todo.create({
      data: {
        id: cuid(), title: `Personal: ${pick(todoTitles)}`, status: pick(statuses),
        assigneeId: owner.id, creatorId: owner.id,
        dueDate: randomDate(new Date('2026-03-01'), new Date('2026-05-15')),
      },
    })
    todoCount++
  }
  console.log(`  Created ${todoCount} initiatives/todos`)

  // ─── Initiative Updates (daily, spread over recent weeks) ───
  const allTodos = await prisma.todo.findMany({ select: { id: true, assigneeId: true } })
  let updateCount = 0
  for (const todo of allTodos.slice(0, 40)) {
    const numUpdates = 2 + Math.floor(Math.random() * 5)
    for (let d = 0; d < numUpdates; d++) {
      const date = new Date('2026-04-01')
      date.setDate(date.getDate() + d + Math.floor(Math.random() * 10))
      const dateStr = date.toISOString().slice(0, 10)
      if (!todo.assigneeId) continue // initiativeUpdate.authorId is required
      try {
        await prisma.initiativeUpdate.create({
          data: {
            id: cuid(), initiativeId: todo.id, authorId: todo.assigneeId, updateDate: dateStr,
            content: pick(['Made progress on this task', 'Completed the first phase', 'Blocked — waiting on design review', 'Researching options', 'Had a productive session, 60% done', 'Wrapping up final testing']),
            blockers: pick([null, null, null, 'Waiting on API access', 'Need design approval']),
          },
        })
        updateCount++
      } catch { /* duplicate date, skip */ }
    }
  }
  console.log(`  Created ${updateCount} initiative updates`)

  // ─── Sprints ───
  const sprint = await prisma.sprint.create({
    data: {
      id: cuid(), name: 'Marketing Sprint W15', description: 'Q2 launch prep sprint', ownerId: david.id,
      startDate: new Date('2026-04-07'), endDate: new Date('2026-04-18'),
      columns: {
        create: [
          { id: cuid(), name: 'Backlog', position: 0 },
          { id: cuid(), name: 'In Progress', position: 1, color: '#0b6e99' },
          { id: cuid(), name: 'Review', position: 2, color: '#cb912f' },
          { id: cuid(), name: 'Done', position: 3, color: '#0f7b6c' },
        ],
      },
    },
    include: { columns: true },
  })

  console.log(`  Created 1 sprint`)

  // ─── Comments ───
  let commentCount = 0
  for (const obj of allObjectives.slice(0, 6)) {
    const numComments = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < numComments; i++) {
      await prisma.comment.create({
        data: {
          id: cuid(), content: pick(['Looking good, let\'s keep the momentum', 'We need to discuss the timeline', 'Can we get an update on this?', 'Great progress this week!']),
          authorId: pick(users).id, objectiveId: obj.id,
        },
      })
      commentCount++
    }
  }
  console.log(`  Created ${commentCount} comments`)

  // ─── Confidence Snapshots ───
  const periods = ['2026-01-01', '2026-01-15', '2026-02-01', '2026-02-15', '2026-03-01', '2026-03-15', '2026-04-01']
  let snapCount = 0
  for (const kr of keyResults.slice(0, 10)) {
    for (const period of periods) {
      const score = 30 + Math.floor(Math.random() * 60)
      await prisma.confidenceSnapshot.create({
        data: {
          id: cuid(), entityType: 'KEY_RESULT', entityId: kr.id, periodStart: period,
          confidence: score >= 65 ? 'ON_TRACK' : score >= 35 ? 'AT_RISK' : 'OFF_TRACK',
          score, factors: JSON.stringify({ progressPct: score, timeElapsedPct: 50, velocity: 1.2 }),
        },
      })
      snapCount++
    }
  }
  console.log(`  Created ${snapCount} confidence snapshots`)

  // ─── Notifications ───
  for (const user of users.slice(0, 5)) {
    for (let i = 0; i < 3; i++) {
      await prisma.notification.create({
        data: {
          id: cuid(), type: pick(['OBJECTIVE_UPDATED', 'KEY_RESULT_UPDATED', 'COMMENT_ADDED']),
          title: pick(['Objective updated', 'New check-in recorded', 'Comment on your objective']),
          message: pick(['Progress has been updated', 'A new check-in was recorded for your KR', 'Someone commented on your objective']),
          userId: user.id, isRead: pick([true, false, false]),
        },
      })
    }
  }

  console.log('\nDone! Test data seeded successfully.')
  console.log(`  Total: ${users.length} users, ${allObjectives.length} objectives, ${keyResults.length} KRs, ${todoCount} todos`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
