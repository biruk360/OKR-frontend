import { redirect } from 'next/navigation'
import { GanttChartSquare, List, ListTree, Network, SlidersHorizontal } from 'lucide-react'
import { getServerSessionSafe } from '@/lib/auth'
import { canCreateObjective, type UserRole } from '@/lib/permissions'
import { loadViewerContext } from '@/lib/okr/visibility-scope'
import {
  EXPLORER_LEVELS,
  EXPLORER_LEVEL_LABELS,
  EXPLORER_VIEWS,
  EXPLORER_VIEW_LABELS,
  LEVEL_AWARE_VIEWS,
  explorerHref,
  parseExplorerLevel,
  parseExplorerView,
  scopeForLevel,
  type ExplorerScope,
  type ExplorerView,
} from '@/lib/okr/explorer-params'
import { PageHeader } from '@/components/ui/PageHeader'
import { LinkTabs } from '@/components/shared/LinkTabs'
import OkrHierarchyTable from '@/components/hierarchy/OkrHierarchyTable'
import { FiltersWorkspace } from '@/features/filters'
import OkrsAllClient from './OkrsAllClient'
import ExplorerMapView from './ExplorerMapView'
import ExplorerTimelineView from './ExplorerTimelineView'
import ExplorerCreateHandoff from './ExplorerCreateHandoff'

/**
 * OKR Explorer — the one place to browse objectives. Replaces the retired
 * Objectives / Company OKRs / Department OKRs / Goals / Plans / OKR Hierarchy /
 * Timeline / Strategy map / Filters pages (redirects: lib/retired-routes.js).
 *
 *   ?view=  list (default) | tree | timeline | map | analyze
 *   ?level= all (default) | company | department | mine | team   — List + Tree only
 *
 * Every view reads through the shared OKR visibility scope
 * (lib/okr/visibility-scope.ts); level presets only narrow it.
 */
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

const VIEW_ICONS: Record<ExplorerView, typeof List> = {
  list: List,
  tree: ListTree,
  timeline: GanttChartSquare,
  map: Network,
  analyze: SlidersHorizontal,
}

const VIEW_DESCRIPTIONS: Record<ExplorerView, string> = {
  list: 'All objectives, key results and initiatives you can see — with live KPIs, filters and a role-aware create menu.',
  tree: 'Objectives → key results → initiatives as a tree. Filter by timeframe, department or level.',
  timeline: 'Objectives and key results on a Gantt timeline, by timeframe.',
  map: 'Strategy map: how objectives align, by timeframe. Switch to Org or Combined for the people view.',
  analyze: 'Slice objectives, key results and initiatives by saved segments, status and confidence.',
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function OkrExplorerPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>
}) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  const role = session.user.role as UserRole
  const viewer = { id: session.user.id, role }
  const sp = (await Promise.resolve(searchParams)) ?? {}
  const view = parseExplorerView(sp.view)
  const level = parseExplorerLevel(sp.level)
  const levelAware = LEVEL_AWARE_VIEWS.has(view)

  // Create rights come from lib/permissions (single source of truth), not the client.
  const createPermissions = {
    COMPANY: canCreateObjective(role, 'COMPANY'),
    DEPARTMENT: canCreateObjective(role, 'DEPARTMENT'),
    INDIVIDUAL: canCreateObjective(role, 'INDIVIDUAL'),
  }

  let scope: ExplorerScope | undefined
  if (levelAware) {
    const departmentIds = level === 'team' ? Array.from((await loadViewerContext(viewer)).departmentIds) : []
    scope = scopeForLevel(level, { id: viewer.id, departmentIds })
  }

  const viewTabs = EXPLORER_VIEWS.map((v) => ({
    key: v,
    label: EXPLORER_VIEW_LABELS[v],
    icon: VIEW_ICONS[v],
    href: explorerHref({ view: v, level: LEVEL_AWARE_VIEWS.has(v) ? level : undefined }),
  }))
  const levelTabs = EXPLORER_LEVELS.map((l) => ({
    key: l,
    label: EXPLORER_LEVEL_LABELS[l],
    href: explorerHref({ view, level: l }),
  }))

  return (
    <div className="space-y-4">
      <div
        className="rounded-[var(--ap-radius-md)] border bg-card px-5 pt-5"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <PageHeader
          className="mb-3"
          breadcrumb={
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-wide"
              style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
            >
              Explorer
            </span>
          }
          title="OKR Explorer"
          description={VIEW_DESCRIPTIONS[view]}
          actions={
            levelAware ? (
              <LinkTabs variant="segmented" ariaLabel="Level" items={levelTabs} activeKey={level} />
            ) : undefined
          }
        />
        <LinkTabs ariaLabel="Explorer views" items={viewTabs} activeKey={view} />
      </div>

      {view === 'list' && (
        <OkrsAllClient
          key={level}
          currentUser={{ id: session.user.id, role }}
          createPermissions={createPermissions}
          scope={scope}
        />
      )}
      {view === 'tree' && <OkrHierarchyTable key={level} scope={scope} />}
      {view === 'timeline' && <ExplorerTimelineView />}
      {view === 'map' && <ExplorerMapView viewer={viewer} timeframeId={first(sp.timeframeId)} mode={first(sp.mode)} />}
      {view === 'analyze' && (
        <div
          className="flex h-[calc(100dvh-220px)] min-h-[560px] flex-col overflow-hidden rounded-[var(--ap-radius-md)] border"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <FiltersWorkspace />
        </div>
      )}

      <ExplorerCreateHandoff />
    </div>
  )
}
