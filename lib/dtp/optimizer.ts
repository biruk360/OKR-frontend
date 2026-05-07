/**
 * Route-grouping / dwell-aware optimizer — Phase-1 STUB.
 *
 * The real engine (FR-06) needs DBSCAN-style spatial clustering, time-window
 * intersection across employees' flexibility cones, a Distance Matrix call per
 * candidate edge, and a constrained VRP solver. None of that is in scope for
 * the web backbone — instead this stub returns an empty suggestion set and the
 * caller behaves as if "no carpool opportunities found." The schema (see
 * RouteGroup model) is in place so accepted/rejected decisions are auditable
 * once the real optimizer ships.
 *
 * TODO(optimizer): implement clustering + VRP. Wire to a worker queue.
 */

export interface OptimizerSuggestion {
  id: string
  runDate: Date
  tripStopIds: string[]
  centerLat?: number
  centerLng?: number
  radiusM?: number
  estSavingsKm?: number
  estSavingsMin?: number
  estSavingsEtb?: number
}

export async function suggestRouteGroups(_runDate: Date, _departmentId: string | null): Promise<OptimizerSuggestion[]> {
  // Phase-1 stub — no suggestions.
  return []
}
