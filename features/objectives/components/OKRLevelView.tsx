import { prisma } from '@/lib/prisma'
import type { Session } from 'next-auth'
import NestedObjectivesList from './NestedObjectivesList'
import { StatCard, StatGrid } from '@/components/ui'

export type OKRLevel = 'COMPANY' | 'DEPARTMENT'

interface OKRLevelViewProps {
  session: Session
  level: OKRLevel
  description: string
  /** Button to create a new objective at this level (rendered to the right of the description). */
  createButton?: React.ReactNode
  /** Stats card label for the objective count (e.g. "Company Objectives"). */
  objectiveLabel: string
}

/**
 * Shared view for Company and Department OKR pages — same layout, stats, and list.
 * Only the filtering and labels differ per level.
 */
export default async function OKRLevelView({
  session,
  level,
  description,
  createButton,
  objectiveLabel,
}: OKRLevelViewProps) {
  const where: any = { level, status: 'ACTIVE' }

  // Department-level pages for DEPARTMENT_LEAD users are scoped to their departments
  if (level === 'DEPARTMENT' && session.user.role === 'DEPARTMENT_LEAD') {
    const userDepartments = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      select: { departmentId: true },
    })
    where.departmentId = { in: userDepartments.map((d) => d.departmentId) }
  }

  const objectives = await prisma.objective.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      timeframe: true,
      department: { select: { id: true, name: true } },
      parentObjective: { select: { id: true, title: true, level: true } },
      childObjectives: {
        where: { status: 'ACTIVE' },
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
          department: { select: { id: true, name: true } },
          _count: { select: { keyResults: true, childObjectives: true } },
        },
        orderBy: { level: 'asc' },
      },
      keyResults: {
        include: { owner: { select: { id: true, name: true, avatar: true } } },
      },
      _count: { select: { keyResults: true, childObjectives: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const timeframes = await prisma.timeframe.findMany({
    where: { isActive: true },
    orderBy: { startDate: 'desc' },
  })

  // Departments visible in filter bar
  const departments =
    level === 'COMPANY' ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'EXECUTIVE'
      ? await prisma.department.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        })
      : await prisma.department.findMany({
          where: {
            isActive: true,
            memberships: { some: { userId: session.user.id } },
          },
          orderBy: { name: 'asc' },
        })

  const totalKRs = objectives.reduce((sum, obj) => sum + obj.keyResults.length, 0)
  const avgProgress =
    objectives.length > 0
      ? Math.round(objectives.reduce((sum, obj) => sum + obj.progress, 0) / objectives.length)
      : 0
  const completed = objectives.filter((obj) => obj.progress === 100).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{description}</p>
        {createButton}
      </div>

      <StatGrid columns={4}>
        <StatCard label={objectiveLabel} value={objectives.length} iconText="O" tone="blue" />
        <StatCard label="Key Results" value={totalKRs} iconText="KR" tone="green" />
        <StatCard label="Avg Progress" value={`${avgProgress}%`} iconText="%" tone="yellow" />
        <StatCard label="Completed" value={completed} iconText="✓" tone="purple" />
      </StatGrid>

      <NestedObjectivesList
        objectives={objectives}
        timeframes={timeframes}
        departments={departments}
        userRole={session.user.role}
        showCompanyOnly={level === 'COMPANY'}
        showDepartmentOnly={level === 'DEPARTMENT'}
      />
    </div>
  )
}
