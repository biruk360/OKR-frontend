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
} from 'lucide-react'
import {
  EditObjectiveButton,
  ArchiveObjectiveButton,
  UnarchiveObjectiveButton,
  DeleteObjectiveButton,
  CloneObjectiveButton,
  AlignsToParentBadge,
} from '@/features/objectives'
import { KeyResultsList } from '@/features/key-results'
import { PageTitleSetter } from '@/components/layout/DashboardTitleContext'
import { ActivityLogPanel } from '@/components/shared/ActivityLogPanel'
import { formatRelativeTime, getConfidenceColor, getProgressBarClass } from '@/lib/utils'
import ObjectiveProgressTimeline from './ObjectiveProgressTimeline'

interface ObjectiveDetailPageProps {
  params: { id: string } | Promise<{ id: string }>
}

/** Map ON_TRACK/AT_RISK/OFF_TRACK to the small status pill shown next to progress. */
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
      return { label: 'CLOSED', classes: 'bg-gray-100 text-gray-700' }
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
    return <img src={avatar} alt={name} className={`${sizeClass} rounded-full border border-gray-200 object-cover`} />
  }
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className={`${sizeClass} rounded-full bg-blue-500 text-white flex items-center justify-center font-medium border border-gray-200`}>
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

  // Bi-weekly confidence snapshots power the Progress Timeline chart.
  const snapshots = await prisma.confidenceSnapshot.findMany({
    where: { entityType: 'OBJECTIVE', entityId: objective.id },
    orderBy: { periodStart: 'asc' },
    select: { periodStart: true, score: true },
  })

  // Collaborators = deduplicated set of everyone who owns a KR under this objective,
  // excluding the objective's own owner (who's shown separately).
  const collaboratorsMap = new Map<string, { id: string; name: string; avatar: string | null }>()
  for (const kr of objective.keyResults) {
    if (kr.owner.id === objective.ownerId) continue
    collaboratorsMap.set(kr.owner.id, kr.owner)
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

  return (
    <>
      <PageTitleSetter title={objective.title} />
      <div className="space-y-4">
        {/* Breadcrumb + actions */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/objectives"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Objectives
          </Link>
          <div className="flex items-center space-x-2">
            {objective.status === 'ARCHIVED' ? (
              <>
                <UnarchiveObjectiveButton objective={objective} className="px-3 py-2" />
                <DeleteObjectiveButton objective={objective} className="px-3 py-2" />
              </>
            ) : (
              <>
                <CloneObjectiveButton
                  objective={objective}
                  timeframes={timeframes}
                  className="px-3 py-2"
                />
                <EditObjectiveButton objective={objective} className="px-3 py-2" />
                <ArchiveObjectiveButton objective={objective} className="px-3 py-2" />
                <DeleteObjectiveButton objective={objective} className="px-3 py-2" />
              </>
            )}
          </div>
        </div>

        {/* Two-column layout: main column (8/12) + sidebar (4/12) on lg+ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* -------- Main column -------- */}
          <div className="lg:col-span-8 space-y-4">
            {/* Archived banner */}
            {objective.status === 'ARCHIVED' && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center">
                <Archive className="h-5 w-5 text-orange-600 mr-2" />
                <span className="text-sm font-medium text-orange-800">
                  This objective has been archived
                </span>
              </div>
            )}

            {/* Header card: level badge, title, description, progress summary */}
            <section className="bg-white shadow rounded-lg p-6">
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

                  <h1 className="mt-3 text-2xl font-semibold text-gray-900 leading-tight">
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

                  {objective.description && (
                    <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                      {objective.description}
                    </p>
                  )}
                </div>

                {/* Right: progress summary */}
                <div className="flex-shrink-0 text-right min-w-[180px]">
                  <div className="flex items-center justify-end gap-2 mb-1">
                    <span className="text-3xl font-bold text-gray-900">{progressRounded}%</span>
                    {status && (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.classes}`}
                      >
                        {status.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">Overall Progress</div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getProgressBarClass(
                        objective.progress
                      )}`}
                      style={{ width: `${Math.min(progressRounded, 100)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-gray-400 mt-2">
                    Last updated {formatRelativeTime(objective.updatedAt)}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-3 text-[11px] text-gray-500">
                    <span>
                      <span className="font-semibold text-gray-700">{activeKrCount}</span> Active KRs
                    </span>
                    <span>
                      <span className="font-semibold text-gray-700">
                        {objective._count.keyResults}
                      </span>{' '}
                      Total
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Progress timeline */}
            <section className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                    Progress Timeline
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Expected (linear) vs actual (bi-weekly confidence snapshots)
                  </p>
                </div>
                <TrendingUp className="h-4 w-4 text-gray-400" />
              </div>
              <ObjectiveProgressTimeline
                snapshots={snapshots}
                currentProgress={objective.progress}
                timeframeStart={objective.timeframe.startDate}
                timeframeEnd={objective.timeframe.endDate}
              />
            </section>

            {/* Key Results */}
            <section className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Key Results{' '}
                  <span className="text-gray-400 font-normal">
                    ({objective.keyResults.length})
                  </span>
                </h2>
              </div>
              <div className="px-6 py-4">
                <KeyResultsList
                  keyResults={objective.keyResults}
                  objectiveId={objective.id}
                  objective={objective}
                  users={users}
                />
              </div>
            </section>
          </div>

          {/* -------- Sidebar -------- */}
          <aside className="lg:col-span-4 space-y-4">
            {/* Objective Details */}
            <section className="bg-white shadow rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
                Objective Details
              </h3>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center text-[11px] text-gray-500 uppercase tracking-wide mb-1.5">
                    <User className="h-3 w-3 mr-1" />
                    Owner
                  </div>
                  <div className="flex items-center space-x-2">
                    <Avatar name={objective.owner.name ?? '?'} avatar={objective.owner.avatar} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {objective.owner.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{objective.owner.email}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center text-[11px] text-gray-500 uppercase tracking-wide mb-1.5">
                    <Calendar className="h-3 w-3 mr-1" />
                    Timeframe
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
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
                    <div className="flex items-center text-[11px] text-gray-500 uppercase tracking-wide mb-1.5">
                      <Target className="h-3 w-3 mr-1" />
                      Primary Alignment
                    </div>
                    <Link
                      href={`/dashboard/objectives/${objective.parentObjective.id}`}
                      className="block rounded-md border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors px-3 py-2"
                    >
                      <div className="text-sm font-medium text-gray-900 line-clamp-2">
                        {objective.parentObjective.title}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
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
                    <div className="flex items-center text-[11px] text-gray-500 uppercase tracking-wide mb-1.5">
                      <Building2 className="h-3 w-3 mr-1" />
                      Department
                    </div>
                    <div className="text-sm font-medium text-gray-900">
                      {objective.department.name}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Collaborators */}
            {collaborators.length > 0 && (
              <section className="bg-white shadow rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center">
                    <Users className="h-4 w-4 mr-1.5 text-gray-500" />
                    Collaborators
                  </h3>
                  <span className="text-xs text-gray-500">{collaborators.length} total</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {collaborators.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center"
                      title={c.name ?? undefined}
                    >
                      <Avatar name={c.name ?? '?'} avatar={c.avatar} size="sm" />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 mt-3">
                  Derived from Key Result owners on this objective.
                </p>
              </section>
            )}

            {/* Contributing OKRs */}
            {objective.childObjectives.length > 0 && (
              <section className="bg-white shadow rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                    Contributing OKRs
                  </h3>
                  <span className="text-xs text-gray-500">
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
                            <span className="text-gray-800 group-hover:text-blue-600 truncate">
                              {child.title}
                            </span>
                            <span className="text-xs font-medium text-gray-600 flex-shrink-0">
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
                  <p className="text-xs text-gray-500 mt-3">
                    Showing 8 of {objective.childObjectives.length}
                  </p>
                )}
              </section>
            )}

            {/* Recent Activity — existing shared component */}
            <ActivityLogPanel entityType="objective" entityId={objective.id} />
          </aside>
        </div>
      </div>
    </>
  )
}
