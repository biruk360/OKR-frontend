import Link from 'next/link'
import { Activity, ListChecks, Target } from 'lucide-react'
import ProfileOrgMinimap from '@/components/profile/ProfileOrgMinimap'
import UserProgressTimeline from '@/components/profile/UserProgressTimeline'
import { EmptyState } from '@/components/ui/EmptyState'
import { getKrDisplayStatus, statusLabel, type KrDisplayStatus } from '@/lib/reportDashboard'
import { cn } from '@/lib/utils'
import type { loadUserProfile } from '@/features/admin-org/services/org-pages.server'

/**
 * Overview tab body (PRF-2): the profile's original main column — progress
 * timeline, objectives & key results, active initiatives, org minimap and the
 * check-in feed. Server component; data comes from loadUserProfile.
 */
export type UserProfileData = NonNullable<Awaited<ReturnType<typeof loadUserProfile>>>

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

export function ProfileOverview({ data }: { data: UserProfileData }) {
  const {
    profileUser,
    manager,
    directReports,
    metrics,
    visibleTodos,
    recentCheckIns,
    addReportsHref,
    krsByObjective,
    pendingCount,
    timelineSnapshots,
    tfStart,
    tfEnd,
  } = data

  return (
    <>
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
    </>
  )
}
