import { prisma } from '@/lib/prisma'
import type { Session } from 'next-auth'
import NestedObjectivesList from './NestedObjectivesList'

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

  const heroTitle = level === 'COMPANY' ? 'Company OKRs' : 'Department OKRs'

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div
        className="rounded-[14px] border bg-card overflow-hidden"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="text-[24px] font-semibold leading-tight"
              style={{ letterSpacing: '-0.02em' }}
            >
              {heroTitle}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground" style={{ maxWidth: 720 }}>
              {description}
            </p>
          </div>
          {createButton && <div className="shrink-0">{createButton}</div>}
        </div>
        {/* Stats strip */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 border-t"
          style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
        >
          <StatCell label={objectiveLabel} value={String(objectives.length)} />
          <StatCell label="Key Results" value={String(totalKRs)} divider />
          <StatCell label="Avg Progress" value={`${avgProgress}%`} divider accent="blue" />
          <StatCell label="Completed" value={String(completed)} divider accent="green" />
        </div>
      </div>

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

function StatCell({
  label,
  value,
  divider,
  accent,
}: {
  label: string
  value: string
  divider?: boolean
  accent?: 'blue' | 'green'
}) {
  const color =
    accent === 'blue' ? 'var(--ap-accent)' : accent === 'green' ? 'var(--ap-green)' : 'var(--ap-fg)'
  return (
    <div
      className="flex flex-col justify-center gap-1 px-4 py-4"
      style={{
        borderLeft: divider ? '1px solid var(--ap-border)' : undefined,
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className="text-[22px] font-semibold tabular-nums leading-none"
        style={{ letterSpacing: '-0.02em', color }}
      >
        {value}
      </p>
    </div>
  )
}
