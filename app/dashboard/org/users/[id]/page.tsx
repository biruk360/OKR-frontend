import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, HelpCircle, UserCircle } from 'lucide-react'
import { getServerSessionSafe } from '@/lib/auth'
import { resolveParams } from '@/lib/resolve-route-params'
import { PageTitleSetter } from '@/components/layout/DashboardTitleContext'
import { LinkTabs } from '@/components/shared/LinkTabs'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ProfileTab } from '@/types/package'
import { loadUserProfile } from '@/features/admin-org/services/org-pages.server'
import {
  parseProfileTimeframeParam,
  profileShellHref,
  profileTabLinks,
  resolveActiveProfileTab,
  ProfileTimeframeSwitcher,
} from '@/features/employee-profile'
import { loadProfileShellAccess, resolveProfileTimeframe } from '@/features/employee-profile/services/profile-shell.server'
import { getOkrProfileSummary } from '@/features/employee-profile/components/okr-profile/okr-profile.server'
import { getPackageProfileSummary } from '@/features/operating-package/services/profile-summary.server'
import { getKpisProfileSummary } from '@/features/kpis/services/profile-summary.server'
import { getDutiesProfileSummary } from '@/features/duties/services/profile-summary.server'
import { getDevelopmentProfileSummary } from '@/features/development-plan/services/profile-summary.server'
import { getDependenciesProfileSummary } from '@/features/dependencies/services/profile-summary.server'
import { getDecisionsProfileSummary } from '@/features/decisions/services/profile-summary.server'
import { getRoleDefinitionProfileSummary } from '@/features/role-definition/services/profile-summary.server'
import { ProfileOverview } from './_components/ProfileOverview'
import { PackageSummaryCard, type ProfileSummaries } from './_components/PackageSummaryCard'
import {
  ProfileDecisionsPanel,
  ProfileDevelopmentPanel,
  ProfileKpisPanel,
  ProfileLinksPanel,
  ProfileOkrsPanel,
  ProfilePackageHeader,
  ProfileRoleSidebarCard,
  ProfileRolePanel,
} from './_components/ProfileTabPanels'

type SearchParams = Record<string, string | string[] | undefined>

interface PageProps {
  params: { id: string } | Promise<{ id: string }>
  searchParams?: SearchParams | Promise<SearchParams>
}

/**
 * Employee profile (PRF-1…5): sidebar (identity, role definition, metrics, org
 * network, latest standup) + URL-synced tabs (`?tab=`) for the selected
 * timeframe (`?tf=`, default = active timeframe).
 *
 *  - Tabs the viewer may not see (§8, lib/package/access.ts) are hidden.
 *  - PRF-5: only the active tab loads. Package tabs are client components that
 *    fetch their own data; the Overview's server summaries run on Overview only.
 */
export const dynamic = 'force-dynamic'

/** A summary loader failing must not take the whole profile down. */
async function safeSummary<T>(enabled: boolean, label: string, load: () => Promise<T | null>): Promise<T | null> {
  if (!enabled) return null
  try {
    return await load()
  } catch (error) {
    console.error(`[profile] ${label} summary failed`, error)
    return null
  }
}

export default async function UserProfilePage({ params, searchParams }: PageProps) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()
  const sp: SearchParams = (await resolveParams(searchParams ?? {})) ?? {}

  const viewer = { id: session.user.id, role: session.user.role, userType: session.user.userType ?? null }
  const [shell, tfSelection] = await Promise.all([
    loadProfileShellAccess(viewer, id),
    resolveProfileTimeframe(parseProfileTimeframeParam(sp.tf)),
  ])
  const activeTab = resolveActiveProfileTab(sp.tab, shell.visibleTabs)
  const isOverview = activeTab === 'overview'

  // PRF-5: the Overview-only sections load on the Overview tab only.
  const data = await loadUserProfile(session.user, id, { overview: isOverview })
  if (!data) notFound()

  const timeframe = tfSelection.selected
  const timeframeId = timeframe?.id ?? ''
  const defaultTimeframeId = tfSelection.defaultId
  const view = shell.areas?.view
  const pkgOn = shell.packageModule && !!timeframeId
  const hrefFor = (tab: ProfileTab) => profileShellHref(id, tab, timeframeId || null, defaultTimeframeId)

  async function loadOverviewSummaries(): Promise<ProfileSummaries> {
    const viewerId = session!.user.id
    const tabs = shell.visibleTabs
    const [pkg, okr, kpis, duties, development, dependencies, decisions] = await Promise.all([
      safeSummary(pkgOn && !!view?.package, 'package', () => getPackageProfileSummary(viewerId, id, timeframeId)),
      safeSummary(tabs.includes('okrs') && !!timeframeId, 'okr', () => getOkrProfileSummary(viewerId, id, timeframeId)),
      safeSummary(pkgOn && tabs.includes('kpis'), 'kpis', () => getKpisProfileSummary(viewerId, id, timeframeId)),
      safeSummary(pkgOn && !!view?.duties, 'duties', () => getDutiesProfileSummary(viewerId, id, timeframeId)),
      safeSummary(pkgOn && tabs.includes('development'), 'development', () =>
        getDevelopmentProfileSummary(viewerId, id, timeframeId),
      ),
      safeSummary(pkgOn && tabs.includes('links'), 'dependencies', () =>
        getDependenciesProfileSummary(viewerId, id, timeframeId),
      ),
      safeSummary(pkgOn && tabs.includes('decisions'), 'decisions', () =>
        getDecisionsProfileSummary(viewerId, id, timeframeId),
      ),
    ])
    return { pkg, okr, kpis, duties, development, dependencies, decisions }
  }

  const [roleSummary, summaries] = await Promise.all([
    safeSummary(pkgOn && !!view?.role, 'role', () => getRoleDefinitionProfileSummary(session.user.id, id, timeframeId)),
    isOverview ? loadOverviewSummaries() : Promise.resolve(null),
  ])

  const {
    profileUser,
    manager,
    directReports,
    metrics,
    latestStandup,
    manageOrgHref,
  } = data

  const tabItems = profileTabLinks(id, shell.visibleTabs, timeframeId || null, defaultTimeframeId)
  const noTimeframe = (
    <EmptyState
      title="No timeframe yet"
      description="Create a timeframe in Settings to see this person's package for a period."
    />
  )

  return (
    <>
      <PageTitleSetter title={profileUser.name ?? 'User'} />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard/org/users"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to directory
          </Link>
          {/* PRF-3: one timeframe for every tab; closed timeframes are read-only. */}
          <ProfileTimeframeSwitcher
            userId={id}
            activeTab={activeTab}
            selected={timeframe ? { id: timeframe.id, name: timeframe.name, ended: timeframe.ended } : null}
            defaultTimeframeId={defaultTimeframeId}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Sidebar */}
          <aside className="lg:col-span-4 space-y-4 min-w-0">
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

            {/* PRF-4: role definition under the name (server summary → no client fetch). */}
            {roleSummary ? <ProfileRoleSidebarCard userId={id} timeframeId={timeframeId} summary={roleSummary} /> : null}

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

          {/* Main: URL-synced tabs (PRF-1). LinkTabs scrolls horizontally on mobile. */}
          <div className="lg:col-span-8 min-w-0 space-y-6">
            <div className="border-b" style={{ borderColor: 'var(--ap-border)' }}>
              <LinkTabs items={tabItems} activeKey={activeTab} ariaLabel="Profile sections" />
            </div>

            {activeTab === 'overview' ? (
              <>
                {summaries ? (
                  <PackageSummaryCard summaries={summaries} timeframeName={timeframe?.name ?? null} hrefFor={hrefFor} />
                ) : null}
                {pkgOn && view?.package ? (
                  <div id="package" className="scroll-mt-24">
                    <ProfilePackageHeader userId={id} timeframeId={timeframeId} />
                  </div>
                ) : null}
                <ProfileOverview data={data} />
              </>
            ) : activeTab === 'okrs' ? (
              <ProfileOkrsPanel userId={id} timeframeId={timeframeId} />
            ) : !timeframeId ? (
              noTimeframe
            ) : activeTab === 'role' ? (
              <ProfileRolePanel userId={id} timeframeId={timeframeId} showRole={!!view?.role} showDuties={!!view?.duties} />
            ) : activeTab === 'kpis' ? (
              <ProfileKpisPanel userId={id} timeframeId={timeframeId} />
            ) : activeTab === 'development' ? (
              <ProfileDevelopmentPanel userId={id} timeframeId={timeframeId} />
            ) : activeTab === 'links' ? (
              <ProfileLinksPanel userId={id} timeframeId={timeframeId} />
            ) : (
              <ProfileDecisionsPanel userId={id} timeframeId={timeframeId} />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
