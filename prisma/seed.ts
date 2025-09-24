import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // Create timeframes
  const currentYear = new Date().getFullYear()
  const q1Start = new Date(currentYear, 0, 1)
  const q1End = new Date(currentYear, 2, 31)
  const q2Start = new Date(currentYear, 3, 1)
  const q2End = new Date(currentYear, 5, 30)

  const q1Timeframe = await prisma.timeframe.upsert({
    where: { name: `Q1 ${currentYear}` },
    update: {},
    create: {
      name: `Q1 ${currentYear}`,
      startDate: q1Start,
      endDate: q1End,
    },
  })

  const q2Timeframe = await prisma.timeframe.upsert({
    where: { name: `Q2 ${currentYear}` },
    update: {},
    create: {
      name: `Q2 ${currentYear}`,
      startDate: q2Start,
      endDate: q2End,
    },
  })

  console.log('✅ Timeframes created')

  // Create departments
  const engineering = await prisma.department.upsert({
    where: { name: 'Engineering' },
    update: {},
    create: {
      name: 'Engineering',
      description: 'Software development and technical operations',
    },
  })

  const marketing = await prisma.department.upsert({
    where: { name: 'Marketing' },
    update: {},
    create: {
      name: 'Marketing',
      description: 'Brand awareness and customer acquisition',
    },
  })

  const sales = await prisma.department.upsert({
    where: { name: 'Sales' },
    update: {},
    create: {
      name: 'Sales',
      description: 'Revenue generation and customer relationships',
    },
  })

  console.log('✅ Departments created')

  // Create users
  const hashedPassword = await bcrypt.hash('admin123', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      name: 'System Administrator',
      email: 'admin@company.com',
      password: hashedPassword,
      role: 'ADMIN',
    },
  })

  const ceo = await prisma.user.upsert({
    where: { email: 'ceo@company.com' },
    update: {},
    create: {
      name: 'John Smith',
      email: 'ceo@company.com',
      password: hashedPassword,
      role: 'EXECUTIVE',
    },
  })

  const engineeringLead = await prisma.user.upsert({
    where: { email: 'engineering.lead@company.com' },
    update: {},
    create: {
      name: 'Sarah Johnson',
      email: 'engineering.lead@company.com',
      password: hashedPassword,
      role: 'DEPARTMENT_LEAD',
    },
  })

  const marketingLead = await prisma.user.upsert({
    where: { email: 'marketing.lead@company.com' },
    update: {},
    create: {
      name: 'Mike Chen',
      email: 'marketing.lead@company.com',
      password: hashedPassword,
      role: 'DEPARTMENT_LEAD',
    },
  })

  const salesLead = await prisma.user.upsert({
    where: { email: 'sales.lead@company.com' },
    update: {},
    create: {
      name: 'Emily Davis',
      email: 'sales.lead@company.com',
      password: hashedPassword,
      role: 'DEPARTMENT_LEAD',
    },
  })

  const engineer1 = await prisma.user.upsert({
    where: { email: 'engineer1@company.com' },
    update: {},
    create: {
      name: 'Alex Rodriguez',
      email: 'engineer1@company.com',
      password: hashedPassword,
      role: 'EMPLOYEE',
    },
  })

  const engineer2 = await prisma.user.upsert({
    where: { email: 'engineer2@company.com' },
    update: {},
    create: {
      name: 'Lisa Wang',
      email: 'engineer2@company.com',
      password: hashedPassword,
      role: 'EMPLOYEE',
    },
  })

  const marketer1 = await prisma.user.upsert({
    where: { email: 'marketer1@company.com' },
    update: {},
    create: {
      name: 'David Brown',
      email: 'marketer1@company.com',
      password: hashedPassword,
      role: 'EMPLOYEE',
    },
  })

  const salesRep1 = await prisma.user.upsert({
    where: { email: 'salesrep1@company.com' },
    update: {},
    create: {
      name: 'Jessica Taylor',
      email: 'salesrep1@company.com',
      password: hashedPassword,
      role: 'EMPLOYEE',
    },
  })

  console.log('✅ Users created')

  // Create department memberships
  await prisma.departmentMembership.upsert({
    where: { userId_departmentId: { userId: engineeringLead.id, departmentId: engineering.id } },
    update: {},
    create: {
      userId: engineeringLead.id,
      departmentId: engineering.id,
      role: 'Lead',
    },
  })

  await prisma.departmentMembership.upsert({
    where: { userId_departmentId: { userId: engineer1.id, departmentId: engineering.id } },
    update: {},
    create: {
      userId: engineer1.id,
      departmentId: engineering.id,
      role: 'Member',
    },
  })

  await prisma.departmentMembership.upsert({
    where: { userId_departmentId: { userId: engineer2.id, departmentId: engineering.id } },
    update: {},
    create: {
      userId: engineer2.id,
      departmentId: engineering.id,
      role: 'Member',
    },
  })

  await prisma.departmentMembership.upsert({
    where: { userId_departmentId: { userId: marketingLead.id, departmentId: marketing.id } },
    update: {},
    create: {
      userId: marketingLead.id,
      departmentId: marketing.id,
      role: 'Lead',
    },
  })

  await prisma.departmentMembership.upsert({
    where: { userId_departmentId: { userId: marketer1.id, departmentId: marketing.id } },
    update: {},
    create: {
      userId: marketer1.id,
      departmentId: marketing.id,
      role: 'Member',
    },
  })

  await prisma.departmentMembership.upsert({
    where: { userId_departmentId: { userId: salesLead.id, departmentId: sales.id } },
    update: {},
    create: {
      userId: salesLead.id,
      departmentId: sales.id,
      role: 'Lead',
    },
  })

  await prisma.departmentMembership.upsert({
    where: { userId_departmentId: { userId: salesRep1.id, departmentId: sales.id } },
    update: {},
    create: {
      userId: salesRep1.id,
      departmentId: sales.id,
      role: 'Member',
    },
  })

  console.log('✅ Department memberships created')

  // Create manager relationships
  await prisma.managerRelationship.upsert({
    where: { managerId_directReportId: { managerId: ceo.id, directReportId: engineeringLead.id } },
    update: {},
    create: {
      managerId: ceo.id,
      directReportId: engineeringLead.id,
    },
  })

  await prisma.managerRelationship.upsert({
    where: { managerId_directReportId: { managerId: ceo.id, directReportId: marketingLead.id } },
    update: {},
    create: {
      managerId: ceo.id,
      directReportId: marketingLead.id,
    },
  })

  await prisma.managerRelationship.upsert({
    where: { managerId_directReportId: { managerId: ceo.id, directReportId: salesLead.id } },
    update: {},
    create: {
      managerId: ceo.id,
      directReportId: salesLead.id,
    },
  })

  await prisma.managerRelationship.upsert({
    where: { managerId_directReportId: { managerId: engineeringLead.id, directReportId: engineer1.id } },
    update: {},
    create: {
      managerId: engineeringLead.id,
      directReportId: engineer1.id,
    },
  })

  await prisma.managerRelationship.upsert({
    where: { managerId_directReportId: { managerId: engineeringLead.id, directReportId: engineer2.id } },
    update: {},
    create: {
      managerId: engineeringLead.id,
      directReportId: engineer2.id,
    },
  })

  console.log('✅ Manager relationships created')

  // Create company-level objectives
  const companyObjective1 = await prisma.objective.create({
    data: {
      title: 'Achieve 50% Revenue Growth',
      description: 'Increase company revenue by 50% compared to last year through strategic initiatives and market expansion.',
      level: 'COMPANY',
      ownerId: ceo.id,
      timeframeId: q1Timeframe.id,
      progress: 35,
    },
  })

  const companyObjective2 = await prisma.objective.create({
    data: {
      title: 'Improve Customer Satisfaction to 95%',
      description: 'Enhance customer experience and support to achieve 95% satisfaction rating.',
      level: 'COMPANY',
      ownerId: ceo.id,
      timeframeId: q1Timeframe.id,
      progress: 60,
    },
  })

  console.log('✅ Company objectives created')

  // Create department objectives
  const engineeringObjective = await prisma.objective.create({
    data: {
      title: 'Launch New Product Features',
      description: 'Develop and deploy 3 major product features to support revenue growth.',
      level: 'DEPARTMENT',
      ownerId: engineeringLead.id,
      timeframeId: q1Timeframe.id,
      departmentId: engineering.id,
      parentObjectiveId: companyObjective1.id,
      progress: 40,
    },
  })

  const marketingObjective = await prisma.objective.create({
    data: {
      title: 'Increase Brand Awareness by 30%',
      description: 'Execute marketing campaigns to increase brand recognition and market presence.',
      level: 'DEPARTMENT',
      ownerId: marketingLead.id,
      timeframeId: q1Timeframe.id,
      departmentId: marketing.id,
      parentObjectiveId: companyObjective1.id,
      progress: 55,
    },
  })

  const salesObjective = await prisma.objective.create({
    data: {
      title: 'Close $2M in New Deals',
      description: 'Generate $2 million in new sales revenue through strategic partnerships and direct sales.',
      level: 'DEPARTMENT',
      ownerId: salesLead.id,
      timeframeId: q1Timeframe.id,
      departmentId: sales.id,
      parentObjectiveId: companyObjective1.id,
      progress: 25,
    },
  })

  console.log('✅ Department objectives created')

  // Create individual objectives
  const engineer1Objective = await prisma.objective.create({
    data: {
      title: 'Implement Authentication System',
      description: 'Build a secure, scalable authentication system for the new product features.',
      level: 'INDIVIDUAL',
      ownerId: engineer1.id,
      timeframeId: q1Timeframe.id,
      parentObjectiveId: engineeringObjective.id,
      progress: 70,
    },
  })

  const engineer2Objective = await prisma.objective.create({
    data: {
      title: 'Optimize Database Performance',
      description: 'Improve database query performance by 40% to support increased user load.',
      level: 'INDIVIDUAL',
      ownerId: engineer2.id,
      timeframeId: q1Timeframe.id,
      parentObjectiveId: engineeringObjective.id,
      progress: 45,
    },
  })

  console.log('✅ Individual objectives created')

  // Create key results
  await prisma.keyResult.createMany({
    data: [
      {
        title: 'Complete user authentication module',
        description: 'Implement secure login, registration, and password reset functionality',
        startValue: 0,
        targetValue: 100,
        currentValue: 70,
        unit: '%',
        confidence: 'ON_TRACK',
        progress: 70,
        ownerId: engineer1.id,
        objectiveId: engineer1Objective.id,
      },
      {
        title: 'Implement role-based access control',
        description: 'Create permission system for different user roles',
        startValue: 0,
        targetValue: 100,
        currentValue: 30,
        unit: '%',
        confidence: 'AT_RISK',
        progress: 30,
        ownerId: engineer1.id,
        objectiveId: engineer1Objective.id,
      },
      {
        title: 'Reduce average query time',
        description: 'Optimize database queries to reduce average response time',
        startValue: 500,
        targetValue: 300,
        currentValue: 400,
        unit: 'ms',
        confidence: 'ON_TRACK',
        progress: 33,
        ownerId: engineer2.id,
        objectiveId: engineer2Objective.id,
      },
      {
        title: 'Implement database indexing',
        description: 'Add strategic indexes to improve query performance',
        startValue: 0,
        targetValue: 100,
        currentValue: 60,
        unit: '%',
        confidence: 'ON_TRACK',
        progress: 60,
        ownerId: engineer2.id,
        objectiveId: engineer2Objective.id,
      },
    ],
  })

  console.log('✅ Key results created')

  // Create some todos
  const keyResults = await prisma.keyResult.findMany({
    where: { objectiveId: engineer1Objective.id },
  })

  if (keyResults.length > 0) {
    await prisma.todo.createMany({
      data: [
        {
          title: 'Set up authentication routes',
          description: 'Create API endpoints for login, register, and password reset',
          status: 'COMPLETED',
          assigneeId: engineer1.id,
          creatorId: engineer1.id,
          keyResultId: keyResults[0].id,
          completedAt: new Date(),
        },
        {
          title: 'Implement JWT token system',
          description: 'Create secure token generation and validation',
          status: 'IN_PROGRESS',
          assigneeId: engineer1.id,
          creatorId: engineer1.id,
          keyResultId: keyResults[0].id,
        },
        {
          title: 'Add password hashing',
          description: 'Implement bcrypt for secure password storage',
          status: 'PENDING',
          assigneeId: engineer1.id,
          creatorId: engineer1.id,
          keyResultId: keyResults[0].id,
        },
      ],
    })
  }

  console.log('✅ Todos created')

  console.log('🎉 Database seeding completed successfully!')
  console.log('')
  console.log('Default login credentials:')
  console.log('Admin: admin@company.com / admin123')
  console.log('CEO: ceo@company.com / admin123')
  console.log('Engineering Lead: engineering.lead@company.com / admin123')
  console.log('Marketing Lead: marketing.lead@company.com / admin123')
  console.log('Sales Lead: sales.lead@company.com / admin123')
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
