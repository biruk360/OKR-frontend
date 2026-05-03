import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, HelpCircle, UserCircle } from 'lucide-react'
import { canViewObjective, canManageUsers, type UserRole } from '@/lib/permissions'
import { PageTitleSetter } from '@/components/layout/DashboardTitleContext'
import ProfileOrgMinimap from '@/components/profile/ProfileOrgMinimap'
import UserProgressTimeline from '@/components/profile/UserProgressTimeline'
import { computeProfilePlanMetrics } from '@/lib/profileMetrics'
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
        where: { endedAt: null },
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
          timeframe: { select: { startDate: true, endDate: true } },
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
    // Standalone todos (no KR link) are only visible to the assignee/creator on
    // their own profile page — viewing someone else's profile filters them out.
    if (!t.keyResult) {
      if (session.user.id === t.assigneeId || session.user.id === t.creatorId) {
        visibleTodos.push(t)
      }
      continue
    }
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

  // Full check-in / KR update feed for the bottom section of the profile.
  const recentCheckIns = await prisma.keyResultCheckIn.findMany({
    where: { createdById: profileUser.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      keyResult: {
        select: {
          id: true,
          title: true,
          unit: true,
          targetValue: true,
          objective: { select: { id: true, title: true } },
        },
      },
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

  // Group KRs by their parent objective for the nested view.
  const krsByObjective = new Map<
    string,
    { objectiveTitle: string; objectiveId: string; krs: typeof visibleKeyResults }
  >()
  for (const kr of visibleKeyResults) {
    const key = kr.objectiveId
    const bucket = krsByObjective.get(key)
    if (bucket) bucket.krs.push(kr)
    else
      krsByObjective.set(key, {
        objectiveTitle: kr.objective.title,
        objectiveId: kr.objectiveId,
        krs: [kr],
      })
  }

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

  // Timeline: bucket user's KR check-ins by ISO week and average per-checkin progress.
  const krIds = visibleKeyResults.map((kr) => kr.id)
  const timelineCheckIns =
    krIds.length > 0
      ? await prisma.keyResultCheckIn.findMany({
          where: { keyResultId: { in: krIds } },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true, value: true, keyResultId: true },
        })
      : []
  const krMeta = new Map(
    visibleKeyResults.map((kr) => [kr.id, { start: kr.startValue, target: kr.targetValue }]),
  )
  function weekKey(d: Date) {
    const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const day = copy.getUTCDay() || 7
    copy.setUTCDate(copy.getUTCDate() - day + 1)
    return copy.toISOString().slice(0, 10)
  }
  const byWeek = new Map<string, { sum: number; n: number }>()
  for (const ci of timelineCheckIns) {
    const meta = krMeta.get(ci.keyResultId)
    if (!meta) continue
    const span = meta.target - meta.start
    if (span <= 0) continue
    const pct = Math.max(0, Math.min(100, ((ci.value - meta.start) / span) * 100))
    const key = weekKey(ci.createdAt)
    const bucket = byWeek.get(key) ?? { sum: 0, n: 0 }
    bucket.sum += pct
    bucket.n += 1
    byWeek.set(key, bucket)
  }
  const timelineSnapshots = Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodStart, v]) => ({ periodStart, score: v.sum / v.n }))

  // Pick widest timeframe among owned KRs' objectives; fall back to last 90 days.
  const tfBounds = visibleKeyResults
    .map((kr) => kr.objective.timeframe)
    .filter((t): t is { startDate: Date; endDate: Date } => Boolean(t?.startDate && t?.endDate))
  let tfStart: Date
  let tfEnd: Date
  if (tfBounds.length > 0) {
    tfStart = new Date(Math.min(...tfBounds.map((t) => t.startDate.getTime())))
    tfEnd = new Date(Math.max(...tfBounds.map((t) => t.endDate.getTime())))
  } else {
    tfEnd = new Date()
    tfStart = new Date(Date.now() - 90 * 24 * 3600 * 1000)
  }

  return (
    <>
      <PageTitleSetter title={profileUser.name ?? 'User'} />
      <div className="space-y-6">
        <Link
          href="/dashboard/org/users"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to directory
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Sidebar */}
          <aside className="lg:col-span-4 space-y-4">
            <div className="bg-card rounded-lg border border-border shadow-sm p-6 text-center">
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
              <h1 className="mt-4 text-xl font-bold text-foreground">{profileUser.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">{profileUser.email}</p>
              <p className="text-xs text-muted-foreground mt-3">0 following · 0 followers</p>
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
                <li className="flex items-start gap-2 text-muted-foreground">
                  <UserCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>
                    <span className="text-muted-foreground">Manager</span>{' '}
                    {manager ? (
                      <Link href={`/dashboard/org/users/${manager.id}`} className="font-medium text-foreground hover:text-blue-600">
                        {manager.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-2 text-muted-foreground">
                  <UserCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>
                    <span className="text-muted-foreground">Direct reports</span>{' '}
                    {directReports.length > 0 ? (
                      <span className="text-foreground">
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
                          <span className="text-muted-foreground">+{directReports.length - 4} more</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>
                    <span className="text-muted-foreground">Teams</span>{' '}
                    {profileUser.departmentMemberships.length > 0 ? (
                      <span className="text-foreground">
                        {profileUser.departmentMemberships.map((m) => (
                          <Link
                            key={m.id}
                            href={`/dashboard/org/teams/${m.department.id}`}
                            className="font-medium hover:text-blue-600 mr-1"
                          >
                            {m.department.name}
                            {m.role === 'HEAD' && (
                              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-700">
                                Head
                              </span>
                            )}
                            {m.isPrimary && (
                              <span className="ml-1 text-[10px] text-muted-foreground">★</span>
                            )}
                          </Link>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not in any teams</span>
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
                    · Check-in
                  </p>
                  <Link
                    href={`/dashboard/key-results/${latestStandup.keyResultId}`}
                    className="font-medium text-blue-600 hover:underline mt-1 block"
                  >
                    {latestStandup.keyResult.title}
                  </Link>
                  {latestStandup.analysis ? (
                    <p className="text-muted-foreground mt-2 line-clamp-3">{latestStandup.analysis}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">There are no standups to display</p>
              )}
            </div>
          </aside>

          {/* Main */}
          <div className="lg:col-span-8 space-y-6">
            <UserProgressTimeline
              snapshots={timelineSnapshots}
              currentProgress={metrics.avgKrProgress}
              timeframeStart={tfStart.toISOString()}
              timeframeEnd={tfEnd.toISOString()}
            />

            <section className="bg-card rounded-lg border border-border shadow-sm">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-base font-semibold text-foreground">Objectives & key results</h2>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">
                  Grouped by objective
                  {pendingCount > 0 ? ` · ${pendingCount} need attention` : ''}
                </p>
              </div>
              {krsByObjective.size === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No visible key results for this person.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {Array.from(krsByObjective.values()).map((group) => (
                    <li key={group.objectiveId} className="px-4 py-3">
                      <Link
                        href={`/dashboard/objectives/${group.objectiveId}`}
                        className="text-sm font-semibold text-foreground hover:text-blue-600"
                      >
                        {group.objectiveTitle}
                      </Link>
                      <ul className="mt-2 space-y-1 border-l border-border pl-4">
                        {group.krs.map((kr) => {
                          const ds = getKrDisplayStatus({
                            unit: kr.unit,
                            targetValue: kr.targetValue,
                            startValue: kr.startValue,
                            currentValue: kr.currentValue,
                            progress: kr.progress,
                            confidence: kr.confidence,
                          })
                          return (
                            <li
                              key={kr.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <span
                                className={cn('h-2 w-2 rounded-full shrink-0', confidenceDot(ds))}
                                title={statusLabel(ds)}
                              />
                              <Link
                                href={`/dashboard/key-results/${kr.id}`}
                                className="text-foreground hover:text-blue-600 flex-1 min-w-0 truncate"
                              >
                                {kr.title}
                              </Link>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {Math.round(kr.progress)}%
                              </span>
                              <span className="text-[11px] text-muted-foreground w-20 text-right truncate">
                                {statusLabel(ds)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-card rounded-lg border border-border shadow-sm">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-base font-semibold text-foreground">Active initiatives</h2>
              </div>
              {visibleTodos.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No initiatives owned</p>
              ) : (
                <ul className="divide-y divide-border">
                  {visibleTodos.map((t) => (
                    <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{t.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {t.keyResult?.objective.title ?? 'Personal to-do'}
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

            <section className="bg-card rounded-lg border border-border shadow-sm">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-base font-semibold text-foreground">Check-ins & updates</h2>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">
                  {recentCheckIns.length === 0 ? 'No activity yet' : `Last ${recentCheckIns.length} entries`}
                </p>
              </div>
              {recentCheckIns.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No check-ins or updates from this person yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {recentCheckIns.map((ci) => (
                    <li key={ci.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted text-muted-foreground text-xs font-semibold flex items-center justify-center shrink-0">
                        {(profileUser.name ?? '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {new Date(ci.createdAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                        <Link
                          href={`/dashboard/key-results/${ci.keyResultId}`}
                          className="text-sm font-medium text-foreground hover:text-blue-600 line-clamp-1"
                        >
                          {ci.keyResult.title}
                        </Link>
                        <p className="text-xs text-muted-foreground truncate">
                          {ci.keyResult.objective.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Updated to{' '}
                          <span className="font-medium text-foreground tabular-nums">
                            {ci.value} {ci.keyResult.unit}
                          </span>{' '}
                          {typeof ci.keyResult.targetValue === 'number' && ci.keyResult.targetValue > 0 ? (
                            <span className="text-muted-foreground">
                              / {ci.keyResult.targetValue} {ci.keyResult.unit}
                            </span>
                          ) : null}
                          {ci.confidence ? (
                            <span className="ml-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                              {ci.confidence}
                            </span>
                          ) : null}
                        </p>
                        {ci.analysis ? (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">
                            {ci.analysis}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  )
}
