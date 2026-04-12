import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ReportDashboardClient, {
  type ReportKrRow,
  type ReportObjectiveRow,
  type ReportTodoRow,
} from '@/components/reports/ReportDashboardClient'

export default async function ReportsPage() {
  const session = await getServerSessionSafe()

  if (!session) {
    redirect('/auth/signin')
  }

  const baseWhere =
    session.user.role === 'EMPLOYEE'
      ? { ownerId: session.user.id, status: 'ACTIVE' as const }
      : { status: 'ACTIVE' as const }

  const objectives = await prisma.objective.findMany({
    where: baseWhere,
    include: {
      timeframe: { select: { name: true } },
      department: { select: { name: true } },
      owner: { select: { id: true, name: true, avatar: true } },
      keyResults: {
        where: { status: { in: ['ACTIVE', 'DRAFT'] } },
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
          _count: { select: { checkIns: true } },
        },
      },
    },
    orderBy: { title: 'asc' },
  })

  const krRows: ReportKrRow[] = []
  const objectiveRows: ReportObjectiveRow[] = []

  for (const o of objectives) {
    const planLabel = [o.department?.name, o.timeframe.name].filter(Boolean).join(' · ') || o.timeframe.name

    objectiveRows.push({
      id: o.id,
      title: o.title,
      progress: o.progress,
      goalStatus: o.goalStatus,
      level: o.level,
      planLabel,
      ownerName: o.owner.name,
      ownerAvatar: o.owner.avatar,
      keyResultCount: o.keyResults.length,
    })

    for (const kr of o.keyResults) {
      krRows.push({
        id: kr.id,
        title: kr.title,
        progress: kr.progress,
        confidence: kr.confidence,
        unit: kr.unit,
        startValue: kr.startValue,
        targetValue: kr.targetValue,
        currentValue: kr.currentValue,
        objectiveId: o.id,
        objectiveTitle: o.title,
        planLabel,
        ownerId: kr.ownerId,
        ownerName: kr.owner.name,
        ownerAvatar: kr.owner.avatar,
        checkInCount: kr._count.checkIns,
        status: kr.status,
      })
    }
  }

  const krIds = krRows.map((k) => k.id)
  const todos =
    krIds.length === 0
      ? []
      : await prisma.todo.findMany({
          where: { keyResultId: { in: krIds } },
          take: 500,
          orderBy: { updatedAt: 'desc' },
          include: {
            assignee: { select: { name: true } },
            keyResult: {
              select: {
                id: true,
                title: true,
                objective: { select: { title: true } },
              },
            },
          },
        })

  // Report page only surfaces KR-linked todos (the query filters keyResultId IN krIds),
  // so `t.keyResult` is guaranteed present here — fall through defensively if not.
  const todoRows: ReportTodoRow[] = todos
    .filter((t) => t.keyResultId && t.keyResult)
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      keyResultId: t.keyResultId as string,
      krTitle: t.keyResult!.title,
      objectiveTitle: t.keyResult!.objective.title,
      assigneeName: t.assignee.name,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    }))

  // Fetch filter options for the dynamic filter bar
  const [allUsers, allDepartments, allTimeframes] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.timeframe.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { startDate: 'desc' },
    }),
  ])

  return (
    <ReportDashboardClient
      currentUserId={session.user.id}
      keyResults={krRows}
      objectives={objectiveRows}
      todos={todoRows}
      filterOptions={{
        users: allUsers,
        departments: allDepartments,
        timeframes: allTimeframes,
      }}
    />
  )
}
