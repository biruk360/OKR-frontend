/**
 * URL contract for the consolidated OKR pages (pure — no Prisma, no React).
 *
 *  - OKR Explorer  /dashboard/okrs-all?view=<list|tree|timeline|map|analyze>&level=<all|company|department|mine|team>
 *  - Insights      /dashboard/insights?tab=<overview|progress|reports|initiatives|period-close>
 *                  (Progress tab: &view=<dashboard|tracking>)
 *
 * Level presets narrow the rows `/api/okr-hierarchy` returns (List and Tree
 * views); the server still applies the viewer's OKR visibility scope
 * (lib/okr/visibility-scope.ts) underneath, so a preset can only hide rows,
 * never reveal them.
 */

export const EXPLORER_BASE_PATH = '/dashboard/okrs-all'
export const INSIGHTS_BASE_PATH = '/dashboard/insights'

// ─── OKR Explorer ───────────────────────────────────────────────────────────

export const EXPLORER_VIEWS = ['list', 'tree', 'timeline', 'map', 'analyze'] as const
export type ExplorerView = (typeof EXPLORER_VIEWS)[number]

export const EXPLORER_VIEW_LABELS: Record<ExplorerView, string> = {
  list: 'List',
  tree: 'Tree',
  timeline: 'Timeline',
  map: 'Map',
  analyze: 'Analyze',
}

export const EXPLORER_LEVELS = ['all', 'company', 'department', 'mine', 'team'] as const
export type ExplorerLevel = (typeof EXPLORER_LEVELS)[number]

export const EXPLORER_LEVEL_LABELS: Record<ExplorerLevel, string> = {
  all: 'All',
  company: 'Company',
  department: 'Department',
  mine: 'Mine',
  team: 'My team',
}

/** Views whose rows come from /api/okr-hierarchy and therefore honour level presets. */
export const LEVEL_AWARE_VIEWS: ReadonlySet<ExplorerView> = new Set<ExplorerView>(['list', 'tree'])

type Param = string | string[] | null | undefined

function first(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

export function parseExplorerView(value: Param): ExplorerView {
  const v = first(value)
  return (EXPLORER_VIEWS as readonly string[]).includes(v ?? '') ? (v as ExplorerView) : 'list'
}

export function parseExplorerLevel(value: Param): ExplorerLevel {
  const v = first(value)
  return (EXPLORER_LEVELS as readonly string[]).includes(v ?? '') ? (v as ExplorerLevel) : 'all'
}

/** Canonical Explorer URL; defaults (view=list, level=all) are left out. */
export function explorerHref(opts: { view?: ExplorerView; level?: ExplorerLevel } = {}): string {
  const sp = new URLSearchParams()
  if (opts.view && opts.view !== 'list') sp.set('view', opts.view)
  if (opts.level && opts.level !== 'all') sp.set('level', opts.level)
  const qs = sp.toString()
  return qs ? `${EXPLORER_BASE_PATH}?${qs}` : EXPLORER_BASE_PATH
}

/**
 * Server-side filters a level preset fixes on `/api/okr-hierarchy`. Keys set
 * here override the user's own pick for the same key (the matching filter pill
 * is hidden while the preset is on).
 */
export interface ExplorerScope {
  type?: string[]
  team?: string[]
  collaborator?: string[]
}

/** Department id that matches nothing — "My team" for a viewer with no department. */
export const NO_TEAM_SENTINEL = '__no_team__'

export function scopeForLevel(
  level: ExplorerLevel,
  viewer: { id: string; departmentIds: readonly string[] },
): ExplorerScope {
  switch (level) {
    case 'company':
      return { type: ['COMPANY'] }
    case 'department':
      return { type: ['DEPARTMENT'] }
    case 'mine':
      // Owner, contributor or KR owner — the API's `collaborator` rule.
      return { collaborator: [viewer.id] }
    case 'team':
      return { team: viewer.departmentIds.length > 0 ? [...viewer.departmentIds] : [NO_TEAM_SENTINEL] }
    default:
      return {}
  }
}

/** Filter keys a scope locks (their pills are hidden in the UI). */
export function lockedScopeKeys(scope: ExplorerScope | undefined): Set<keyof ExplorerScope> {
  const out = new Set<keyof ExplorerScope>()
  if (!scope) return out
  for (const key of ['type', 'team', 'collaborator'] as const) {
    if (scope[key] && scope[key]!.length > 0) out.add(key)
  }
  return out
}

/** Writes `scope` onto an `/api/okr-hierarchy` query, replacing the user's values for the same keys. */
export function applyExplorerScope(sp: URLSearchParams, scope: ExplorerScope | undefined): URLSearchParams {
  if (!scope) return sp
  for (const key of Array.from(lockedScopeKeys(scope))) {
    sp.delete(key)
    for (const v of scope[key]!) sp.append(key, v)
  }
  return sp
}

// ─── Insights ───────────────────────────────────────────────────────────────

export const INSIGHTS_TABS = ['overview', 'progress', 'reports', 'initiatives', 'period-close'] as const
export type InsightsTab = (typeof INSIGHTS_TABS)[number]

export const INSIGHTS_TAB_LABELS: Record<InsightsTab, string> = {
  overview: 'Overview',
  progress: 'Progress',
  reports: 'Reports',
  initiatives: 'Initiatives',
  'period-close': 'Period close',
}

export const PROGRESS_VIEWS = ['dashboard', 'tracking'] as const
export type ProgressView = (typeof PROGRESS_VIEWS)[number]

export const PROGRESS_VIEW_LABELS: Record<ProgressView, string> = {
  dashboard: 'Status dashboard',
  tracking: 'Tracking list',
}

export function parseInsightsTab(value: Param): InsightsTab {
  const v = first(value)
  return (INSIGHTS_TABS as readonly string[]).includes(v ?? '') ? (v as InsightsTab) : 'overview'
}

export function parseProgressView(value: Param): ProgressView {
  const v = first(value)
  return (PROGRESS_VIEWS as readonly string[]).includes(v ?? '') ? (v as ProgressView) : 'dashboard'
}

/** Canonical Insights URL; the default tab (overview) and Progress view (dashboard) are left out. */
export function insightsHref(opts: { tab?: InsightsTab; view?: ProgressView } = {}): string {
  const sp = new URLSearchParams()
  if (opts.tab && opts.tab !== 'overview') sp.set('tab', opts.tab)
  if (opts.tab === 'progress' && opts.view && opts.view !== 'dashboard') sp.set('view', opts.view)
  const qs = sp.toString()
  return qs ? `${INSIGHTS_BASE_PATH}?${qs}` : INSIGHTS_BASE_PATH
}
