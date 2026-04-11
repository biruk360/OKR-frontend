import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, HelpCircle, User, UserCircle } from 'lucide-react'
import { canViewObjective, canManageUsers, type UserRole } from '@/lib/permissions'
import { PageTitleSetter } from '@/components/layout/DashboardTitleContext'
import ProfileOrgMinimap from '@/components/profile/ProfileOrgMinimap'
import {
  computeProfilePlanMetrics,
  formatKrValueLabel,
} from '@/lib/profileMetrics'
import {
  getKrDisplayStatus,
  statusLabel,
  type KrDisplayStatus,
} from '@/lib/reportDashboard'
import { cn } from '@/lib/utils'
import { resolveParams } from '@/lib/resolve-route-params'

interface PageProps {
  params: { id: string } | Promise<{ id: string }>
}

function confidenceDot(status: KrDisplayStatus) {
  switch (status) {
    case 'on_track':
      return 'bg-emerald-500'
    case 'at_risk':
      return 'bg-[#fd7e14]'
    case 'off_track':
      return 'bg-red-500'
    default:
      return 'bg-gray-400'
  }
}

export default async function UserProfilePage({ params }: PageProps) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  const profileUser = await prisma.user.findUnique({
    where: { id, isActive: true },
    include: {
      departmentMemberships: {
        include: { department: { select: { id: true, name: true } } },
      },
    },
  })

  if (!profileUser) notFound()

  const [managerRels, directReportRels] = await Promise.all([
    prisma.managerRelationship.findMany({
      where: { directReportId: profileUser.id, endedAt: null },
      include: {
        manager: { select: { id: true, name: true, email: true, avatar: true } },
      },
      take: 1,
    }),
    prisma.managerRelationship.findMany({
      where: { managerId: profileUser.id, endedAt: null },
      include: {
        directReport: { select: { id: true, name: true, email: true, avatar: true } },
      },
    }),
  ])

  const manager = managerRels[0]?.manager ?? null
  const directReports = directReportRels.map((r) => r.directReport)

  const ownedKeyResultsRaw = await prisma.keyResult.findMany({
    where: { ownerId: profileUser.id, status: 'ACTIVE' },
    include: {
      objective: {
        select: {
          id: true,
          title: true,
          level: true,
          ownerId: true,
          departmentId: true,
          isPrivate: true,
        },
      },
      todos: { select: { status: true } },
      _count: { select: { checkIns: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const visibleKeyResults: typeof ownedKeyResultsRaw = []
  for (const kr of ownedKeyResultsRaw) {
    const { canView } = await canViewObjective(
      session.user.role as UserRole,
      session.user.id,
      {
        level: kr.objective.level,
        ownerId: kr.objective.ownerId,
        departmentId: kr.objective.departmentId,
        isPrivate: kr.objective.isPrivate,
      }
    )
    if (canView) visibleKeyResults.push(kr)
  }

  const metrics = computeProfilePlanMetrics(visibleKeyResults)

  const assignedTodosRaw = await prisma.todo.findMany({
    where: {
      assigneeId: profileUser.id,
      status: { not: 'CANCELLED' },
    },
    include: {
      keyResult: {
        include: {
          objective: {
            select: {
              id: true,
              level: true,
              ownerId: true,
              departmentId: true,
              isPrivate: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  const visibleTodos: typeof assignedTodosRaw = []
  for (const t of assignedTodosRaw) {
    const obj = t.keyResult.objective
    const { canView } = await canViewObjective(
      session.user.role as UserRole,
      session.user.id,
      {
        level: obj.level,
        ownerId: obj.ownerId,
        departmentId: obj.departmentId,
        isPrivate: obj.isPrivate,
      }
    )
    if (canView) visibleTodos.push(t)
  }

  const latestStandup = await prisma.keyResultCheckIn.findFirst({
    where: { createdById: profileUser.id },
    orderBy: { createdAt: 'desc' },
    include: {
      keyResult: { select: { id: true, title: true } },
    },
  })

  const isOwnProfile = session.user.id === profileUser.id
  const canManage = canManageUsers(session.user.role as UserRole)
  const manageOrgHref =
    isOwnProfile || canManage
      ? isOwnProfile
        ? '/dashboard/settings/profile'
        : '/dashboard/settings/users'
      : undefined
  const addReportsHref = canManage ? '/dashboard/settings/users' : undefined

  const krsWithStatus = visibleKeyResults.map((kr) => {
    const displayStatus = getKrDisplayStatus({
      unit: kr.unit,
      targetValue: kr.targetValue,
      startValue: kr.startValue,
      currentValue: kr.currentValue,
      progress: kr.progress,
      confidence: kr.confidence,
    })
    return { kr, displayStatus }
  })

  krsWithStatus.sort((a, b) => {
    const order = (s: KrDisplayStatus) =>
      s === 'pending' || s === 'not_measurable' ? 0 : s === 'at_risk' ? 1 : 2
    return order(a.displayStatus) - order(b.displayStatus)
  })

  const pendingCount = krsWithStatus.filter(
    (x) => x.displayStatus === 'pending' || x.displayStatus === 'not_measurable'
  ).length

  return (
    <>
      <PageTitleSetter title={profileUser.name ?? 'User'} />
      <div className="space-y-6">
        <Link
          href="/dashboard/org/users"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to directory
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Sidebar */}
          <aside className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-center">
              {profileUser.avatar ? (
                <img
                  src={profileUser.avatar}
                  alt=""
                  className="mx-auto h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <div className="mx-auto h-20 w-20 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-semibold">
                  {(profileUser.name || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <h1 className="mt-4 text-xl font-bold text-gray-900">{profileUser.name}</h1>
              <p className="text-sm text-gray-500 mt-1">{profileUser.email}</p>
              <p className="text-xs text-gray-400 mt-3">0 following · 0 followers</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Key results
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-gray-900 mt-1">
                    {metrics.avgKrProgress}%
                  </p>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-sky-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${Math.min(metrics.avgKrProgress, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Initiatives
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-gray-900 mt-1">
                    {metrics.initiativeTotal > 0
                      ? `${metrics.initiativeDone}/${metrics.initiativeTotal}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 flex items-center justify-center gap-0.5">
                    Confidence
                    <span title="Approximate score from key result confidence (NCS-style)">
                      <HelpCircle className="h-3 w-3 text-gray-400" />
                    </span>
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-gray-900 mt-1">
                    {metrics.ncsScore} NCS
                  </p>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-amber-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${Math.min(metrics.ncsScore, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Org network</h2>
                {manageOrgHref && (
                  <Link
                    href={manageOrgHref}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    Manage
                  </Link>
                )}
              </div>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2 text-gray-700">
                  <UserCircle className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="text-gray-500">Manager</span>{' '}
                    {manager ? (
                      <Link href={`/dashboard/org/users/${manager.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                        {manager.name}
                      </Link>
                    ) : (
                      <span className="text-gray-500">Not set</span>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-2 text-gray-700">
                  <UserCircle className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="text-gray-500">Direct reports</span>{' '}
                    {directReports.length > 0 ? (
                      <span className="text-gray-900">
                        {directReports.slice(0, 4).map((u, i) => (
                          <span key={u.id}>
                            {i > 0 ? ', ' : null}
                            <Link
                              href={`/dashboard/org/users/${u.id}`}
                              className="font-medium hover:text-blue-600"
                            >
                              {u.name}
                            </Link>
                          </span>
                        ))}
                        {directReports.length > 4 ? (
                          <span className="text-gray-500">+{directReports.length - 4} more</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-gray-500">Not set</span>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-2 text-gray-700">
                  <Building2 className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="text-gray-500">Teams</span>{' '}
                    {profileUser.departmentMemberships.length > 0 ? (
                      <span className="text-gray-900">
                        {profileUser.departmentMemberships.map((m) => (
                          <Link
                            key={m.id}
                            href={`/dashboard/org/teams/${m.department.id}`}
                            className="font-medium hover:text-blue-600 mr-1"
                          >
                            {m.department.name}
                          </Link>
                        ))}
                      </span>
                    ) : (
                      <span className="text-gray-500">Not in any teams</span>
                    )}
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Latest standup</h2>
              {latestStandup ? (
                <div className="text-sm text-gray-700">
                  <p className="text-xs text-gray-500">
                    {new Date(latestStandup.createdAt).toLocaleDateString(undefined, {
                      dateStyle: 'medium',
                    })}{' '}
                    · Check-in
                  </p>
                  <Link
                    href={`/dashboard/key-results/${latestStandup.keyResultId}`}
                    className="font-medium text-blue-600 hover:underline mt-1 block"
                  >
                    {latestStandup.keyResult.title}
                  </Link>
                  {latestStandup.analysis ? (
                    <p className="text-gray-600 mt-2 line-clamp-3">{latestStandup.analysis}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-gray-500">There are no standups to display</p>
              )}
            </div>
          </aside>

          {/* Main */}
          <div className="lg:col-span-8 space-y-6">
            <section className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">Active key results</h2>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mt-1">
                  Pending check-ins
                  {pendingCount > 0 ? ` · ${pendingCount} need attention` : ''}
                </p>
              </div>
              {krsWithStatus.length === 0 ? (
                <p className="p-6 text-sm text-gray-500">No visible key results for this person.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {krsWithStatus.map(({ kr, displayStatus }) => {
                    const statusText = statusLabel(displayStatus)
                    const valueHint = formatKrValueLabel(kr.currentValue, kr.unit)
                    return (
                      <li key={kr.id} className="px-4 py-3 flex items-start gap-3">
                        <div
                          className={cn(
                            'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm border border-gray-200/80',
                            confidenceDot(displayStatus)
                          )}
                          title={statusText}
                        />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/dashboard/key-results/${kr.id}`}
                            className="text-sm font-medium text-gray-900 hover:text-blue-600 line-clamp-2"
                          >
                            {kr.title}
                          </Link>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{kr.objective.title}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2 text-right">
                          <div>
                            <p className="text-xs text-gray-600 max-w-[140px] truncate" title={valueHint}>
                              {valueHint}
                            </p>
                            <p className="text-[11px] text-gray-500">{statusText}</p>
                          </div>
                          {profileUser.avatar ? (
                            <img
                              src={profileUser.avatar}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
                              <User className="h-4 w-4 text-white" />
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">Active initiatives</h2>
              </div>
              {visibleTodos.length === 0 ? (
                <p className="p-6 text-sm text-gray-500">No initiatives owned</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {visibleTodos.map((t) => (
                    <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{t.title}</p>
                        <p className="text-xs text-gray-500 truncate">{t.keyResult.objective.title}</p>
                      </div>
                      <span className="text-xs text-gray-500 shrink-0 capitalize">
                        {t.status.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <ProfileOrgMinimap
              mode="person"
              name={profileUser.name}
              avatarUrl={profileUser.avatar}
              metrics={metrics}
              manager={manager ? { id: manager.id, name: manager.name, avatar: manager.avatar } : null}
              directReports={directReports.map((u) => ({
                id: u.id,
                name: u.name,
                avatar: u.avatar,
              }))}
              addReportsHref={addReportsHref}
            />
          </div>
        </div>
      </div>
    </>
  )
}
