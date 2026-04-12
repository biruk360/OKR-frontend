import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, HelpCircle, Users } from 'lucide-react'
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

export default async function TeamProfilePage({ params }: PageProps) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  const department = await prisma.department.findFirst({
    where: { id, isActive: true },
    include: {
      memberships: {
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
        },
      },
    },
  })

  if (!department) notFound()

  const memberIds = department.memberships.map((m) => m.userId)

  const objectivesRaw = await prisma.objective.findMany({
    where: { departmentId: department.id, status: 'ACTIVE' },
    include: {
      keyResults: {
        where: { status: 'ACTIVE' },
        include: {
          todos: { select: { status: true } },
          owner: { select: { id: true, name: true, avatar: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const visibleKeyResults: {
    id: string
    title: string
    unit: string
    currentValue: number
    startValue: number
    targetValue: number
    progress: number
    confidence: string
    objective: { id: string; title: string }
    owner: { id: string; name: string; avatar: string | null }
    todos: { status: string }[]
  }[] = []

  for (const obj of objectivesRaw) {
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
    if (!canView) continue
    for (const kr of obj.keyResults) {
      visibleKeyResults.push({
        ...kr,
        objective: { id: obj.id, title: obj.title },
      })
    }
  }

  const metrics = computeProfilePlanMetrics(visibleKeyResults)

  const teamTodosRaw =
    memberIds.length === 0
      ? []
      : await prisma.todo.findMany({
          where: {
            assigneeId: { in: memberIds },
            status: { not: 'CANCELLED' },
          },
          include: {
            assignee: { select: { id: true, name: true } },
            keyResult: {
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
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 80,
        })

  const visibleTodos: typeof teamTodosRaw = []
  for (const t of teamTodosRaw) {
    // Team view only surfaces KR-linked todos scoped to the team's department.
    if (!t.keyResult) continue
    const obj = t.keyResult.objective
    if (obj.departmentId !== department.id) continue
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

  const latestStandup =
    memberIds.length > 0
      ? await prisma.keyResultCheckIn.findFirst({
          where: {
            createdById: { in: memberIds },
            keyResult: {
              objective: { departmentId: department.id },
            },
          },
          orderBy: { createdAt: 'desc' },
          include: {
            keyResult: { select: { id: true, title: true } },
            createdBy: { select: { id: true, name: true } },
          },
        })
      : null

  const canManage = canManageUsers(session.user.role as UserRole)
  const manageHref = canManage ? '/dashboard/settings/teams' : undefined

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

  const minimapMembers = department.memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    avatar: m.user.avatar,
  }))

  return (
    <>
      <PageTitleSetter title={department.name} />
      <div className="space-y-6">
        <Link
          href="/dashboard/org/teams"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to teams
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <aside className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-center">
              <div className="mx-auto h-20 w-20 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Building2 className="h-10 w-10 text-emerald-700" />
              </div>
              <h1 className="mt-4 text-xl font-bold text-gray-900">{department.name}</h1>
              {department.description ? (
                <p className="text-sm text-gray-500 mt-2">{department.description}</p>
              ) : null}
              <p className="text-xs text-gray-400 mt-3">
                {department.memberships.length} member
                {department.memberships.length === 1 ? '' : 's'}
              </p>
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
                {manageHref && (
                  <Link href={manageHref} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                    Manage
                  </Link>
                )}
              </div>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <Users className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="text-gray-500">Members</span>{' '}
                    {department.memberships.length === 0 ? (
                      <span className="text-gray-500">None</span>
                    ) : (
                      <span className="text-gray-900">
                        {department.memberships.map((m) => (
                          <Link
                            key={m.id}
                            href={`/dashboard/org/users/${m.user.id}`}
                            className="font-medium hover:text-blue-600 mr-1"
                          >
                            {m.user.name}
                          </Link>
                        ))}
                      </span>
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
                    · {latestStandup.createdBy.name}
                  </p>
                  <Link
                    href={`/dashboard/key-results/${latestStandup.keyResultId}`}
                    className="font-medium text-blue-600 hover:underline mt-1 block"
                  >
                    {latestStandup.keyResult.title}
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-gray-500">There are no standups to display</p>
              )}
            </div>
          </aside>

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
                <p className="p-6 text-sm text-gray-500">No visible key results for this team.</p>
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
                          <Link href={`/dashboard/org/users/${kr.owner.id}`} className="shrink-0">
                            {kr.owner.avatar ? (
                              <img
                                src={kr.owner.avatar}
                                alt=""
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-medium text-white">
                                {kr.owner.name.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                          </Link>
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
                <p className="p-6 text-sm text-gray-500">No initiatives for this team</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {visibleTodos.map((t) => (
                    <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{t.title}</p>
                        <p className="text-xs text-gray-500">
                          {t.assignee.name} · {t.keyResult?.objective.title ?? 'Personal to-do'}
                        </p>
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
              mode="team"
              teamName={department.name}
              metrics={metrics}
              members={minimapMembers}
            />
          </div>
        </div>
      </div>
    </>
  )
}
