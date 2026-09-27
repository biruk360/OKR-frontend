import { getServerSessionSafe } from '@/lib/auth'
import { loadUserProfile } from '@/features/admin-org/services/org-pages.server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, HelpCircle, UserCircle, Activity, ListChecks, Target } from 'lucide-react'
import { PageTitleSetter } from '@/components/layout/DashboardTitleContext'
import ProfileOrgMinimap from '@/components/profile/ProfileOrgMinimap'
import UserProgressTimeline from '@/components/profile/UserProgressTimeline'
import {
  getKrDisplayStatus,
  statusLabel,
  type KrDisplayStatus,
} from '@/lib/reportDashboard'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { resolveParams } from '@/lib/resolve-route-params'

interface PageProps {
  params: { id: string } | Promise<{ id: string }>
}

function confidenceDot(status: KrDisplayStatus) {
  switch (status) {
    case 'on_track':
      return 'bg-success-500'
    case 'at_risk':
      return 'bg-warning-500'
    case 'off_track':
      return 'bg-danger-500'
    default:
      return 'bg-ink-secondary'
  }
}

export default async function UserProfilePage({ params }: PageProps) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  const data = await loadUserProfile(session.user, id)
  if (!data) notFound()
  const {
    profileUser,
    manager,
    directReports,
    metrics,
    visibleTodos,
    latestStandup,
    recentCheckIns,
    manageOrgHref,
    addReportsHref,
    krsByObjective,
    pendingCount,
    timelineSnapshots,
    tfStart,
    tfEnd,
  } = data

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
                <div className="mx-auto h-20 w-20 rounded-full bg-primary-500 flex items-center justify-center text-primary-foreground text-2xl font-semibold">
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
                  <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">
                    Key results
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-foreground mt-1">
                    {metrics.avgKrProgress}%
                  </p>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-primary-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary-500"
                      style={{ width: `${Math.min(metrics.avgKrProgress, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">
                    Initiatives
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-foreground mt-1">
                    {metrics.initiativeTotal > 0
                      ? `${metrics.initiativeDone}/${metrics.initiativeTotal}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-center gap-0.5">
                    Confidence
                    <span title="Approximate score from key result confidence (NCS-style)">
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-foreground mt-1">
                    {metrics.ncsScore} NCS
                  </p>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-warning-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-warning-500"
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
                    className="text-xs font-medium text-primary-600 hover:text-primary-800"
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
                      <Link href={`/dashboard/org/users/${manager.id}`} className="font-medium text-foreground hover:text-primary-600">
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
                              className="font-medium hover:text-primary-600"
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
                            className="font-medium hover:text-primary-600 mr-1"
                          >
                            {m.department.name}
                            {m.role === 'HEAD' && (
                              <span className="ml-1 rounded bg-warning-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-warning-700">
                                Head
                              </span>
                            )}
                            {m.isPrimary && (
                              <span className="ml-1 text-micro text-muted-foreground">★</span>
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
                    className="font-medium text-primary-600 hover:underline mt-1 block"
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
                <p className="text-micro font-semibold uppercase tracking-wider text-muted-foreground mt-1">
                  Grouped by objective
                  {pendingCount > 0 ? ` · ${pendingCount} need attention` : ''}
                </p>
              </div>
              {krsByObjective.size === 0 ? (
                <EmptyState bare className="py-6 px-4" icon={<Target className="size-5 text-muted-foreground" />} title="No visible key results for this person" />
              ) : (
                <ul className="divide-y divide-border">
                  {Array.from(krsByObjective.values()).map((group) => (
                    <li key={group.objectiveId} className="px-4 py-3">
                      <Link
                        href={`/dashboard/objectives/${group.objectiveId}`}
                        className="text-sm font-semibold text-foreground hover:text-primary-600"
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
                                className="text-foreground hover:text-primary-600 flex-1 min-w-0 truncate"
                              >
                                {kr.title}
                              </Link>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {Math.round(kr.progress)}%
                              </span>
                              <span className="text-caption text-muted-foreground w-20 text-right truncate">
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
                <EmptyState bare className="py-6 px-4" icon={<ListChecks className="size-5 text-muted-foreground" />} title="No initiatives owned" />
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
                <p className="text-micro font-semibold uppercase tracking-wider text-muted-foreground mt-1">
                  {recentCheckIns.length === 0 ? 'No activity yet' : `Last ${recentCheckIns.length} entries`}
                </p>
              </div>
              {recentCheckIns.length === 0 ? (
                <EmptyState bare className="py-6 px-4" icon={<Activity className="size-5 text-muted-foreground" />} title="No check-ins or updates from this person yet" />
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
                          className="text-sm font-medium text-foreground hover:text-primary-600 line-clamp-1"
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
                            <span className="ml-2 text-caption uppercase tracking-wide text-muted-foreground">
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
