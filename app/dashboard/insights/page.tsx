import { redirect } from 'next/navigation'
import { BarChart3, CalendarCheck, CheckSquare, FileText, TrendingUp } from 'lucide-react'
import { getServerSessionSafe } from '@/lib/auth'
import { loadDashboardPayload } from '@/lib/dashboards/payload'
import { loadAnalyticsOverview, loadProgressDashboard, loadProgressTracking } from '@/lib/okr/insights-data'
import {
  INSIGHTS_TABS,
  INSIGHTS_TAB_LABELS,
  PROGRESS_VIEWS,
  PROGRESS_VIEW_LABELS,
  insightsHref,
  parseInsightsTab,
  parseProgressView,
  type InsightsTab,
} from '@/lib/okr/explorer-params'
import { PageHeader } from '@/components/ui/PageHeader'
import { LinkTabs } from '@/components/shared/LinkTabs'
import AppleAnalytics from '@/components/dashboard/AppleAnalytics'
import ReportDashboardClient from '@/components/reports/ReportDashboardClient'
import InitiativeReportClient from '@/components/initiative-report/InitiativeReportClient'
import ProgressDashboardPanel from '@/components/insights/ProgressDashboardPanel'
import ProgressTrackingPanel from '@/components/insights/ProgressTrackingPanel'
import PeriodClosePicker from '@/components/insights/PeriodClosePicker'
import PrintButton from '@/components/insights/PrintButton'

/**
 * Insights — one page for OKR reporting. Replaces the retired Analytics,
 * Progress Tracking, Progress Dashboard, Reports and Initiative Report pages
 * (redirects: lib/retired-routes.js).
 *
 *   ?tab= overview (default) | progress | reports | initiatives | period-close
 *   Progress: &view= dashboard (default) | tracking
 *
 * Only the active tab's data is loaded. Every loader keeps the scoping of the
 * page it came from (OKR visibility scope, role defaults, redaction).
 */
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

const TAB_ICONS: Record<InsightsTab, typeof BarChart3> = {
  overview: BarChart3,
  progress: TrendingUp,
  reports: FileText,
  initiatives: CheckSquare,
  'period-close': CalendarCheck,
}

const TAB_DESCRIPTIONS: Record<InsightsTab, string> = {
  overview: 'Progress, confidence and contributors for a timeframe, department or level.',
  progress: 'Where active OKRs stand now and how their status moved over the last ten weeks.',
  reports: 'Company or personal dashboard with filterable key result, objective and initiative tables.',
  initiatives: 'Initiatives across key results — status, owners and due dates.',
  'period-close': 'Close out a timeframe: review results, carry-overs and open OKRs.',
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>
}) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  const viewer = { id: session.user.id, role: session.user.role }
  const sp = (await Promise.resolve(searchParams)) ?? {}
  const tab = parseInsightsTab(sp.tab)
  const progressView = parseProgressView(sp.view)

  const tabs = INSIGHTS_TABS.map((t) => ({
    key: t,
    label: INSIGHTS_TAB_LABELS[t],
    icon: TAB_ICONS[t],
    href: insightsHref({ tab: t }),
  }))

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--ap-radius-md)] border bg-card px-5 pt-5" style={{ borderColor: 'var(--ap-border)' }}>
        <PageHeader
          className="mb-3"
          breadcrumb={<p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Insights</p>}
          title="Insights"
          description={TAB_DESCRIPTIONS[tab]}
          actions={tab === 'progress' ? <PrintButton /> : undefined}
        />
        <LinkTabs ariaLabel="Insights sections" items={tabs} activeKey={tab} />
      </div>

      {tab === 'overview' && <OverviewTab viewer={viewer} sp={sp} />}
      {tab === 'progress' && (
        <div className="space-y-3">
          <LinkTabs
            variant="segmented"
            ariaLabel="Progress views"
            activeKey={progressView}
            items={PROGRESS_VIEWS.map((v) => ({
              key: v,
              label: PROGRESS_VIEW_LABELS[v],
              href: insightsHref({ tab: 'progress', view: v }),
            }))}
          />
          {progressView === 'tracking' ? (
            <ProgressTrackingPanel data={await loadProgressTracking(viewer)} />
          ) : (
            <ProgressDashboardPanel data={await loadProgressDashboard(viewer)} />
          )}
        </div>
      )}
      {tab === 'reports' && (
        <ReportsTab viewer={viewer} userName={session.user.name ?? 'You'} />
      )}
      {tab === 'initiatives' && <InitiativeReportClient />}
      {tab === 'period-close' && <PeriodClosePicker />}
    </div>
  )
}

async function OverviewTab({ viewer, sp }: { viewer: { id: string; role: string }; sp: SearchParams }) {
  const data = await loadAnalyticsOverview(viewer, {
    timeframe: first(sp.timeframe),
    department: first(sp.department),
    level: first(sp.level),
  })
  return <AppleAnalytics {...data} />
}

async function ReportsTab({ viewer, userName }: { viewer: { id: string; role: string }; userName: string }) {
  // Same scope the user sees live via /api/dashboards/{ceo,me}: ADMIN and
  // EXECUTIVE get the company scope, everyone else the employee-filtered one.
  const scope = viewer.role === 'ADMIN' || viewer.role === 'EXECUTIVE' ? 'ceo' : 'me'
  const payload = await loadDashboardPayload(scope, viewer.id)
  return (
    <ReportDashboardClient
      currentUserId={viewer.id}
      currentUserName={userName}
      currentUserRole={viewer.role}
      keyResults={payload.keyResults}
      objectives={payload.objectives}
      todos={payload.todos}
      filterOptions={payload.filterOptions}
      personal={payload.personal}
    />
  )
}
