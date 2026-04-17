import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NestedObjectivesList } from '@/features/objectives'

export default async function ArchivedObjectivesPage() {
  const session = await getServerSessionSafe()

  if (!session) {
    redirect('/auth/signin')
  }

  let where: Record<string, unknown> = { status: 'ARCHIVED' }

  if (session.user.role === 'EMPLOYEE') {
    where = { ...where, ownerId: session.user.id }
  } else if (session.user.role === 'DEPARTMENT_LEAD') {
    const userDepartments = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      select: { departmentId: true },
    })
    const departmentIds = userDepartments.map((d) => d.departmentId)

    where = {
      ...where,
      OR: [{ ownerId: session.user.id }, { departmentId: { in: departmentIds } }],
    }
  }

  const objectives = await prisma.objective.findMany({
    where,
    include: {
      owner: {
        select: { id: true, name: true, avatar: true },
      },
      timeframe: true,
      department: {
        select: { id: true, name: true },
      },
      parentObjective: {
        select: { id: true, title: true, level: true },
      },
      childObjectives: {
        where: { status: 'ACTIVE' },
        include: {
          owner: {
            select: { id: true, name: true, avatar: true },
          },
          department: {
            select: { id: true, name: true },
          },
          _count: {
            select: { keyResults: true, childObjectives: true },
          },
        },
        orderBy: { level: 'asc' },
      },
      keyResults: {
        include: {
          owner: {
            select: { id: true, name: true, avatar: true },
          },
        },
      },
      _count: {
        select: { keyResults: true, childObjectives: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const timeframes = await prisma.timeframe.findMany({
    where: { isActive: true },
    orderBy: { startDate: 'desc' },
  })

  const departments =
    session.user.role === 'ADMIN' || session.user.role === 'EXECUTIVE'
      ? await prisma.department.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        })
      : []

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          Objectives that have been archived. Restore them from each objective&apos;s detail page when
          permitted.
        </p>
      </div>

      <NestedObjectivesList
        objectives={objectives}
        timeframes={timeframes}
        departments={departments}
        userRole={session.user.role}
      />
    </div>
  )
}
