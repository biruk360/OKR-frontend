import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Target,
  User,
  Calendar,
  Building2,
  Archive,
  Users,
  TrendingUp,
  UserPlus,
} from 'lucide-react'
import {
  EditObjectiveButton,
  DeleteObjectiveButton,
  CloneObjectiveButton,
  AlignsToParentBadge,
  ObjectiveActionsMenu,
} from '@/features/objectives'
import OkrBreadcrumb from '@/components/shared/OkrBreadcrumb'
import type { BreadcrumbNode } from '@/components/shared/OkrBreadcrumb'
import OkrComments from '@/components/shared/OkrComments'
import WorkItemsKanban from '@/components/shared/WorkItemsKanban'
import { KeyResultsList } from '@/features/key-results'
import { PageTitleSetter } from '@/components/layout/DashboardTitleContext'
import { ActivityLogPanel } from '@/components/shared/ActivityLogPanel'
import { formatRelativeTime, getProgressBarClass } from '@/lib/utils'
import ObjectiveProgressTimeline from './ObjectiveProgressTimeline'

interface ObjectiveDetailPageProps {
  params: { id: string } | Promise<{ id: string }>
}

function confidenceLabel(goalStatus: string | null | undefined): {
  label: string
  classes: string
} | null {
  if (!goalStatus) return null
  switch (goalStatus) {
    case 'ON_TRACK':
      return { label: 'ON TRACK', classes: 'bg-green-100 text-green-800' }
    case 'AT_RISK':
      return { label: 'AT RISK', classes: 'bg-yellow-100 text-yellow-800' }
    case 'OFF_TRACK':
      return { label: 'OFF TRACK', classes: 'bg-red-100 text-red-800' }
    case 'CLOSED':
      return { label: 'CLOSED', classes: 'bg-muted text-muted-foreground' }
    default:
      return null
  }
}

function levelLabel(level: string): string {
  switch (level) {
    case 'COMPANY':
      return 'Company Objective'
    case 'DEPARTMENT':
      return 'Department Objective'
    case 'INDIVIDUAL':
      return 'Individual Objective'
    default:
      return level
  }
}

function Avatar({
  name,
  avatar,
  size = 'sm',
}: {
  name: string
  avatar?: string | null
  size?: 'xs' | 'sm' | 'md'
}) {
  const sizeClass = size === 'xs' ? 'h-6 w-6 text-[10px]' : size === 'md' ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs'
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt={name} className={`${sizeClass} rounded-full border border-border object-cover`} />
  }
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className={`${sizeClass} rounded-full bg-blue-500 text-white flex items-center justify-center font-medium border border-border`}>
      {initials || '?'}
    </div>
  )
}

export default async function ObjectiveDetailPage({ params }: ObjectiveDetailPageProps) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  const objective = await prisma.objective.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, avatar: true, email: true } },
      timeframe: true,
      department: { select: { id: true, name: true } },
      parentObjective: {
        select: { id: true, title: true, level: true, goalStatus: true, progress: true },
      },
      contributors: {
        include: {
          user: { select: { id: true, name: true, avatar: true, email: true } },
        },
      },
      childObjectives: {
        where: { status: 'ACTIVE' },
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
          department: { select: { id: true, name: true } },
          _count: { select: { keyResults: true } },
        },
        orderBy: { updatedAt: 'desc' },
      },
      keyResults: {
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      },
      _count: { select: { keyResults: true, childObjectives: true } },
    },
  })

  if (!objective) notFound()

  // Walk up the objective hierarchy to build a breadcrumb chain.
  const ancestors: Array<{ id: string; title: string }> = []
  {
    let cursorId: string | null = objective.parentObjectiveId
    const seen = new Set<string>()
    while (cursorId && !seen.has(cursorId)) {
      seen.add(cursorId)
      const parent = await prisma.objective.findUnique({
        where: { id: cursorId },
        select: { id: true, title: true, parentObjectiveId: true },
      })
      if (!parent) break
      ancestors.unshift({ id: parent.id, title: parent.title })
      cursorId = parent.parentObjectiveId
    }
  }
  // Gather initiatives for the Work Items kanban (attached to either the
  // objective or one of its KRs).
  const krIdsForKanban = objective.keyResults.map((k) => k.id)
  const kanbanInitiatives = await prisma.todo.findMany({
    where: {
      status: { not: 'CANCELLED' },
      OR: [
        { objectiveId: id },
        krIdsForKanban.length > 0 ? { keyResultId: { in: krIdsForKanban } } : { id: '___none___' },
      ],
    },
    select: { id: true, title: true, status: true, keyResultId: true },
    orderBy: { updatedAt: 'desc' },
  })

  const breadcrumbNodes: BreadcrumbNode[] = [
    ...ancestors.map((a) => ({
      id: a.id,
      title: a.title,
      kind: 'OBJ' as const,
      href: `/dashboard/objectives/${a.id}`,
    })),
    {
      id: objective.id,
      title: objective.title,
      kind: 'OBJ' as const,
      progress: objective.progress,
      status: objective.goalStatus,
      ownerName: objective.owner.name ?? undefined,
    },
  ]

  const snapshots = await prisma.confidenceSnapshot.findMany({
    where: { entityType: 'OBJECTIVE', entityId: objective.id },
    orderBy: { periodStart: 'asc' },
    select: { periodStart: true, score: true },
  })

  // Explicit contributors (distinct from KR-owner-derived collaborators).
  const contributors: Array<{ id: string; name: string; avatar: string | null; email: string | null }> =
    ((objective as any).contributors ?? [])
      .map((c: any) => c.user)
      .filter((u: any) => u && u.id !== objective.ownerId)

  // Collaborators = contributors ∪ KR owners (deduped, minus primary owner).
  const collaboratorsMap = new Map<
    string,
    { id: string; name: string; avatar: string | null; source: 'contributor' | 'kr-owner' }
  >()
  for (const u of contributors) {
    collaboratorsMap.set(u.id, { id: u.id, name: u.name, avatar: u.avatar, source: 'contributor' })
  }
  for (const kr of objective.keyResults) {
    if (kr.owner.id === objective.ownerId) continue
    if (!collaboratorsMap.has(kr.owner.id)) {
      collaboratorsMap.set(kr.owner.id, { ...kr.owner, source: 'kr-owner' })
    }
  }
  const collaborators = Array.from(collaboratorsMap.values())

  const timeframes = await prisma.timeframe.findMany({ orderBy: { startDate: 'desc' } })
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  const status = confidenceLabel(objective.goalStatus)
  const activeKrCount = objective.keyResults.filter((kr) => kr.status === 'ACTIVE').length
  const progressRounded = Math.round(objective.progress)

  const TIMELINE_ELEMENT_ID = `obj-timeline-${objective.id}`
  const ACTIVITY_ELEMENT_ID = `obj-activity-${objective.id}`

  return (
    <>
      <PageTitleSetter title={objective.title} />
      <div className="space-y-4">
        {/* Breadcrumb + top actions */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/objectives"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Objectives
          </Link>
          <div className="flex items-center space-x-2">
            {objective.status !== 'ARCHIVED' && (
              <>
                <CloneObjectiveButton
                  objective={objective}
                  timeframes={timeframes}
                  className="px-3 py-2"
                />
                <EditObjectiveButton objective={objective} className="px-3 py-2" />
              </>
            )}
            <ObjectiveActionsMenu
              objective={objective}
              auditLogElementId={ACTIVITY_ELEMENT_ID}
              chartElementId={TIMELINE_ELEMENT_ID}
            />
            <DeleteObjectiveButton objective={objective} className="px-3 py-2" />
          </div>
        </div>

        <OkrBreadcrumb nodes={breadcrumbNodes} />

        {/* Two-column layout: main column (8/12) + sidebar (4/12) on lg+ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* -------- Main column -------- */}
          <div className="lg:col-span-8 space-y-4">
            {objective.status === 'ARCHIVED' && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center">
                <Archive className="h-5 w-5 text-orange-600 mr-2" />
                <span className="text-sm font-medium text-orange-800">
                  This objective has been archived
                </span>
              </div>
            )}

            {/* Combined Objective card: header + description + progress summary + timeline */}
            <section className="bg-card shadow rounded-lg p-6">
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      objective.level === 'COMPANY'
                        ? 'bg-blue-100 text-blue-800'
                        : objective.level === 'DEPARTMENT'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    <Target className="h-3.5 w-3.5 mr-1" />
                    {levelLabel(objective.level)}
                  </span>

                  <h1 className="mt-3 text-2xl font-semibold text-foreground leading-tight">
                    {objective.title}
                  </h1>

                  {objective.parentObjective && (
                    <div className="mt-2">
                      <AlignsToParentBadge
                        parent={{
                          id: objective.parentObjective.id,
                          title: objective.parentObjective.title,
                          progress: objective.parentObjective.progress,
                          goalStatus: objective.parentObjective.goalStatus,
                        }}
                      />
                    </div>
                  )}

                  {/* Slightly larger description per product feedback */}
                  {objective.description && (
                    <p className="mt-3 text-base text-muted-foreground leading-relaxed">
                      {objective.description}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0 text-right min-w-[180px]">
                  <div className="flex items-center justify-end gap-2 mb-1">
                    <span className="text-3xl font-bold text-foreground">{progressRounded}%</span>
                    {status && (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.classes}`}
                      >
                        {status.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">Overall Progress</div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getProgressBarClass(
                        objective.progress
                      )}`}
                      style={{ width: `${Math.min(progressRounded, 100)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-2">
                    Last updated {formatRelativeTime(objective.updatedAt)}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-3 text-[11px] text-muted-foreground">
                    <span>
                      <span className="font-semibold text-muted-foreground">{activeKrCount}</span> Active KRs
                    </span>
                    <span>
                      <span className="font-semibold text-muted-foreground">
                        {objective._count.keyResults}
                      </span>{' '}
                      Total
                    </span>
                  </div>
                </div>
              </div>

            </section>

            {/* Key Results — no outer wrapping card; list renders its own Active/Archived
                sections with the Add-KR button inline on the header row. */}
            <KeyResultsList
              keyResults={objective.keyResults}
              objectiveId={objective.id}
              objective={objective}
              users={users}
            />

            <WorkItemsKanban
              keyResults={objective.keyResults.map((kr) => ({
                id: kr.id,
                title: kr.title,
                progress: kr.progress,
                confidence: kr.confidence,
                status: kr.status,
              }))}
              initiatives={kanbanInitiatives}
              title="Work items"
            />

            <OkrComments endpoint="objectives" entityId={objective.id} users={users} />
          </div>

          {/* -------- Sidebar -------- */}
          <aside className="lg:col-span-4 space-y-4">
            <section className="bg-card shadow rounded-lg p-5" id={TIMELINE_ELEMENT_ID}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                    Progress Timeline
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Expected vs actual</p>
                </div>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
              <ObjectiveProgressTimeline
                snapshots={snapshots}
                currentProgress={objective.progress}
                timeframeStart={objective.timeframe.startDate}
                timeframeEnd={objective.timeframe.endDate}
              />
            </section>

            <section className="bg-card shadow rounded-lg p-5">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
                Objective Details
              </h3>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
                    <User className="h-3 w-3 mr-1" />
                    Owner
                  </div>
                  <div className="flex items-center space-x-2">
                    <Avatar name={objective.owner.name ?? '?'} avatar={objective.owner.avatar} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {objective.owner.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{objective.owner.email}</div>
                    </div>
                  </div>
                </div>

                {/* Contributors — explicit ObjectiveContributor rows, independent of KR owners */}
                <div>
                  <div className="flex items-center text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
                    <UserPlus className="h-3 w-3 mr-1" />
                    Contributors
                  </div>
                  {contributors.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {contributors.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center gap-1.5 rounded-full border border-border bg-muted pl-1 pr-2 py-0.5"
                          title={c.email || c.name}
                        >
                          <Avatar name={c.name ?? '?'} avatar={c.avatar} size="xs" />
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {c.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      None — add via Edit Objective
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
                    <Calendar className="h-3 w-3 mr-1" />
                    Timeframe
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {objective.timeframe.name}
                    </span>
                    {objective.timeframe.type && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">
                        {objective.timeframe.type === 'MONTHLY'
                          ? 'Monthly'
                          : objective.timeframe.type === 'QUARTERLY'
                          ? 'Quarterly'
                          : objective.timeframe.type === 'SIX_MONTH'
                          ? '6-Month'
                          : objective.timeframe.type === 'YEARLY'
                          ? 'Yearly'
                          : ''}
                      </span>
                    )}
                  </div>
                </div>

                {objective.parentObjective && (
                  <div>
                    <div className="flex items-center text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
                      <Target className="h-3 w-3 mr-1" />
                      Primary Alignment
                    </div>
                    <Link
                      href={`/dashboard/objectives/${objective.parentObjective.id}`}
                      className="block rounded-md border border-border hover:border-border hover:bg-muted transition-colors px-3 py-2"
                    >
                      <div className="text-sm font-medium text-foreground line-clamp-2">
                        {objective.parentObjective.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {objective.parentObjective.level === 'COMPANY'
                          ? 'Company Objective'
                          : objective.parentObjective.level === 'DEPARTMENT'
                          ? 'Department Objective'
                          : 'Individual Objective'}
                      </div>
                    </Link>
                  </div>
                )}

                {objective.department && (
                  <div>
                    <div className="flex items-center text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
                      <Building2 className="h-3 w-3 mr-1" />
                      Department
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {objective.department.name}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {collaborators.length > 0 && (
              <section className="bg-card shadow rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center">
                    <Users className="h-4 w-4 mr-1.5 text-muted-foreground" />
                    Collaborators
                  </h3>
                  <span className="text-xs text-muted-foreground">{collaborators.length} total</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {collaborators.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center"
                      title={`${c.name ?? '?'} (${c.source === 'contributor' ? 'Contributor' : 'KR owner'})`}
                    >
                      <Avatar name={c.name ?? '?'} avatar={c.avatar} size="sm" />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Union of Contributors and Key Result owners.
                </p>
              </section>
            )}

            {objective.childObjectives.length > 0 && (
              <section className="bg-card shadow rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                    Contributing OKRs
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {objective.childObjectives.length}
                  </span>
                </div>
                <ul className="space-y-3">
                  {objective.childObjectives.slice(0, 8).map((child) => {
                    const pct = Math.round(child.progress)
                    return (
                      <li key={child.id}>
                        <Link
                          href={`/dashboard/objectives/${child.id}`}
                          className="block group"
                        >
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-foreground group-hover:text-blue-600 truncate">
                              {child.title}
                            </span>
                            <span className="text-xs font-medium text-muted-foreground flex-shrink-0">
                              {pct}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1.5">
                            <div
                              className={`h-1.5 rounded-full ${getProgressBarClass(child.progress)}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
                {objective.childObjectives.length > 8 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Showing 8 of {objective.childObjectives.length}
                  </p>
                )}
              </section>
            )}

            <div id={ACTIVITY_ELEMENT_ID}>
              <ActivityLogPanel entityType="objective" entityId={objective.id} />
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
