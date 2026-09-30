/**
 * Dashboard routes retired by the OKR page consolidation (2026-09-25).
 *
 * The OKR list pages became presets/views of the OKR Explorer
 * (/dashboard/okrs-all?level=…&view=…) and the analytics pages became tabs of
 * /dashboard/insights. next.config.js `redirects()` turns every entry into a
 * permanent redirect; Next.js carries the request's own query string over to
 * the destination (e.g. /dashboard/alignment-map?timeframeId=x →
 * /dashboard/okrs-all?view=map&timeframeId=x).
 *
 * Plain CommonJS so next.config.js can require it; lib/okr/route-consolidation.test.ts
 * checks every source has a redirect, every destination is a real page, and no
 * source file still links to a retired route. Detail routes
 * (/dashboard/objectives/[id], /dashboard/okrs-all/period-report/[id]) are
 * NOT retired.
 */

/** @type {ReadonlyArray<{ source: string; destination: string }>} */
const RETIRED_ROUTE_REDIRECTS = Object.freeze([
  // Legacy My OKRs link from the header; preserve bookmarked URLs.
  { source: '/dashboard/okrs', destination: '/dashboard/my-okrs' },
  // OKR list pages → OKR Explorer level presets
  { source: '/dashboard/objectives', destination: '/dashboard/okrs-all?level=all' },
  { source: '/dashboard/company-okrs', destination: '/dashboard/okrs-all?level=company' },
  { source: '/dashboard/department-okrs', destination: '/dashboard/okrs-all?level=department' },
  { source: '/dashboard/goals', destination: '/dashboard/okrs-all?level=mine' },
  // OKR views → OKR Explorer views
  { source: '/dashboard/plans', destination: '/dashboard/okrs-all?view=timeline' },
  { source: '/dashboard/timeline', destination: '/dashboard/okrs-all?view=timeline' },
  { source: '/dashboard/okr-hierarchy', destination: '/dashboard/okrs-all?view=tree' },
  { source: '/dashboard/alignment-map', destination: '/dashboard/okrs-all?view=map' },
  { source: '/dashboard/filters', destination: '/dashboard/okrs-all?view=analyze' },
  // Analytics pages → Insights tabs
  { source: '/dashboard/analytics', destination: '/dashboard/insights?tab=overview' },
  { source: '/dashboard/progress-report', destination: '/dashboard/insights?tab=progress' },
  { source: '/dashboard/progress', destination: '/dashboard/insights?tab=progress&view=tracking' },
  { source: '/dashboard/reports', destination: '/dashboard/insights?tab=reports' },
  { source: '/dashboard/initiative-report', destination: '/dashboard/insights?tab=initiatives' },
])

/** next.config.js `redirects()` entries (308, query string passed through). */
function retiredRouteRedirects() {
  return RETIRED_ROUTE_REDIRECTS.map((r) => ({ source: r.source, destination: r.destination, permanent: true }))
}

module.exports = { RETIRED_ROUTE_REDIRECTS, retiredRouteRedirects }
