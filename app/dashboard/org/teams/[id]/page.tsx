import { getServerSessionSafe } from '@/lib/auth'
import { loadTeamProfile } from '@/features/admin-org/services/org-pages.server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, HelpCircle, Users, Crown, ListChecks, Target } from 'lucide-react'
import { PageTitleSetter } from '@/components/layout/DashboardTitleContext'
import ProfileOrgMinimap from '@/components/profile/ProfileOrgMinimap'
import { formatKrValueLabel } from '@/lib/profileMetrics'
import { statusLabel, type KrDisplayStatus } from '@/lib/reportDashboard'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { resolveParams } from '@/lib/resolve-route-params'
import { PersonTooltip } from '@/components/shared/UserAvatar'

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

export default async function TeamProfilePage({ params }: PageProps) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  const data = await loadTeamProfile(session.user, id)
  if (!data) notFound()
  const {
    department,
    metrics,
    visibleTodos,
    latestStandup,
    manageHref,
    krsWithStatus,
    pendingCount,
    minimapMembers,
  } = data

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
              <div className="mx-auto h-20 w-20 rounded-2xl bg-success-100 flex items-center justify-center">
                <Building2 className="h-10 w-10 text-success-700" />
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
                {manageHref && (
                  <Link href={manageHref} className="text-xs font-medium text-primary-600 hover:text-primary-800">
                    Manage
                  </Link>
                )}
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {(() => {
                  const head = department.memberships.find((m) => m.role === 'HEAD')
                  if (!head) {
                    return (
                      <li className="flex items-center gap-2 rounded bg-warning-50 px-2 py-1.5 text-xs font-medium text-warning-700">
                        <Crown className="h-3.5 w-3.5 shrink-0" />
                        No department head assigned
                      </li>
                    )
                  }
                  return (
                    <li className="flex items-center gap-2 rounded bg-warning-50 px-2 py-1.5">
                      <Crown className="h-4 w-4 shrink-0 text-warning-700" />
                      <span className="text-micro font-bold uppercase tracking-widest text-warning-700">Head</span>
                      <Link
                        href={`/dashboard/org/users/${head.user.id}`}
                        className="font-semibold text-foreground hover:text-primary-600"
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
                              className="font-medium hover:text-primary-600 mr-1"
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
                    className="font-medium text-primary-600 hover:underline mt-1 block"
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
                <EmptyState bare className="py-6 px-4" icon={<Users className="size-5 text-muted-foreground" />} title="No members assigned yet" />
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
                            <div className="h-7 w-7 rounded-full bg-primary-500 flex items-center justify-center text-caption font-semibold text-primary-foreground shrink-0">
                              {(m.user.name ?? '?').slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-medium text-foreground">
                                {m.user.name}
                              </p>
                              {m.role === 'HEAD' && (
                                <Crown className="h-3 w-3 shrink-0 text-warning-600" />
                              )}
                            </div>
                            <p className="truncate text-caption text-muted-foreground">
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
                <p className="text-micro font-semibold uppercase tracking-wider text-muted-foreground mt-1">
                  Pending check-ins
                  {pendingCount > 0 ? ` · ${pendingCount} need attention` : ''}
                </p>
              </div>
              {krsWithStatus.length === 0 ? (
                <EmptyState bare className="py-6 px-4" icon={<Target className="size-5 text-muted-foreground" />} title="No visible key results for this team" />
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
                            className="text-sm font-medium text-foreground hover:text-primary-600 line-clamp-2"
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
                            <p className="text-caption text-muted-foreground">{statusText}</p>
                          </div>
                          <PersonTooltip person={kr.owner} detail="Key result owner">
                          <Link
                            href={`/dashboard/org/users/${kr.owner.id}`}
                            className="shrink-0"
                            aria-label={`Owner: ${kr.owner.name}`}
                          >
                            {kr.owner.avatar ? (
                              <img
                                src={kr.owner.avatar}
                                alt=""
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-primary-500 flex items-center justify-center text-xs font-medium text-primary-foreground">
                                {kr.owner.name.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                          </Link>
                          </PersonTooltip>
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
                <EmptyState bare className="py-6 px-4" icon={<ListChecks className="size-5 text-muted-foreground" />} title="No initiatives for this team" />
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
