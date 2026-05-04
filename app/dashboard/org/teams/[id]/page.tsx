import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, HelpCircle, Users, Crown } from 'lucide-react'
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
        where: { endedAt: null },
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
          className="inline-flex items-center text-sm text-muted-foreground hover:text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to teams
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <aside className="lg:col-span-4 space-y-4">
            <div className="bg-card rounded-lg border border-border shadow-sm p-6 text-center">
              <div className="mx-auto h-20 w-20 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Building2 className="h-10 w-10 text-emerald-700" />
              </div>
              <h1 className="mt-4 text-xl font-bold text-foreground">{department.name}</h1>
              {department.description ? (
                <p className="text-sm text-muted-foreground mt-2">{department.description}</p>
              ) : null}
              <p className="text-xs text-muted-foreground mt-3">
                {department.memberships.length} member
                {department.memberships.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="bg-card rounded-lg border border-border shadow-sm p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Key results
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-foreground mt-1">
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
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Initiatives
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-foreground mt-1">
                    {metrics.initiativeTotal > 0
                      ? `${metrics.initiativeDone}/${metrics.initiativeTotal}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-center gap-0.5">
                    Confidence
                    <span title="Approximate score from key result confidence (NCS-style)">
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-foreground mt-1">
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

            <div className="bg-card rounded-lg border border-border shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground">Org network</h2>
                {manageHref && (
                  <Link href={manageHref} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                    Manage
                  </Link>
                )}
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {(() => {
                  const head = department.memberships.find((m) => m.role === 'HEAD')
                  if (!head) {
                    return (
                      <li className="flex items-center gap-2 rounded bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-700">
                        <Crown className="h-3.5 w-3.5 shrink-0" />
                        No department head assigned
                      </li>
                    )
                  }
                  return (
                    <li className="flex items-center gap-2 rounded bg-amber-50 px-2 py-1.5">
                      <Crown className="h-4 w-4 shrink-0 text-amber-700" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Head</span>
                      <Link
                        href={`/dashboard/org/users/${head.user.id}`}
                        className="font-semibold text-foreground hover:text-blue-600"
                      >
                        {head.user.name}
                      </Link>
                    </li>
                  )
                })()}
                <li className="flex items-start gap-2">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>
                    <span className="text-muted-foreground">Members</span>{' '}
                    {department.memberships.length === 0 ? (
                      <span className="text-muted-foreground">None</span>
                    ) : (
                      <span className="text-foreground">
                        {department.memberships
                          .filter((m) => m.role !== 'HEAD')
                          .map((m) => (
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

            <div className="bg-card rounded-lg border border-border shadow-sm p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Latest standup</h2>
              {latestStandup ? (
                <div className="text-sm text-muted-foreground">
                  <p className="text-xs text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">There are no standups to display</p>
              )}
            </div>

            <div className="bg-card rounded-lg border border-border shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Team members
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ({department.memberships.length})
                  </span>
                </h2>
              </div>
              {department.memberships.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members assigned yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {[...department.memberships]
                    .sort((a, b) => {
                      // HEAD first, then alphabetical by name
                      if (a.role === 'HEAD' && b.role !== 'HEAD') return -1
                      if (b.role === 'HEAD' && a.role !== 'HEAD') return 1
                      return (a.user.name ?? '').localeCompare(b.user.name ?? '')
                    })
                    .map((m) => (
                      <li key={m.id}>
                        <Link
                          href={`/dashboard/org/users/${m.user.id}`}
                          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors"
                        >
                          {m.user.avatar ? (
                            <img
                              src={m.user.avatar}
                              alt=""
                              className="h-7 w-7 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="h-7 w-7 rounded-full bg-blue-500 flex items-center justify-center text-[11px] font-semibold text-white shrink-0">
                              {(m.user.name ?? '?').slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-medium text-foreground">
                                {m.user.name}
                              </p>
                              {m.role === 'HEAD' && (
                                <Crown className="h-3 w-3 shrink-0 text-amber-600" />
                              )}
                            </div>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {m.user.role
                                ? m.user.role.replace(/_/g, ' ').toLowerCase()
                                : m.user.email}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </aside>

          <div className="lg:col-span-8 space-y-6">
            <section className="bg-card rounded-lg border border-border shadow-sm">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-base font-semibold text-foreground">Active key results</h2>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">
                  Pending check-ins
                  {pendingCount > 0 ? ` · ${pendingCount} need attention` : ''}
                </p>
              </div>
              {krsWithStatus.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No visible key results for this team.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {krsWithStatus.map(({ kr, displayStatus }) => {
                    const statusText = statusLabel(displayStatus)
                    const valueHint = formatKrValueLabel(kr.currentValue, kr.unit)
                    return (
                      <li key={kr.id} className="px-4 py-3 flex items-start gap-3">
                        <div
                          className={cn(
                            'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm border border-border/80',
                            confidenceDot(displayStatus)
                          )}
                          title={statusText}
                        />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/dashboard/key-results/${kr.id}`}
                            className="text-sm font-medium text-foreground hover:text-blue-600 line-clamp-2"
                          >
                            {kr.title}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{kr.objective.title}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2 text-right">
                          <div>
                            <p className="text-xs text-muted-foreground max-w-[140px] truncate" title={valueHint}>
                              {valueHint}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{statusText}</p>
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

            <section className="bg-card rounded-lg border border-border shadow-sm">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-base font-semibold text-foreground">Active initiatives</h2>
              </div>
              {visibleTodos.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No initiatives for this team</p>
              ) : (
                <ul className="divide-y divide-border">
                  {visibleTodos.map((t) => (
                    <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.assignee?.name ?? 'Unassigned'} · {t.keyResult?.objective.title ?? 'Personal to-do'}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 capitalize">
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
