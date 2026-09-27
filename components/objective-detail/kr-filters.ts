/**
 * Pure filtering for the objective page's Key Results list (KRList).
 */

import { fromDbStatus } from '@/lib/okr/status'

export type KrStatusFilter = 'on-track' | 'at-risk' | 'off-track' | 'inactive'

export interface KrFilterState {
  status?: KrStatusFilter
  ownerId?: string
}

export interface FilterableKr {
  status: string
  confidence: string
  owner: { id: string }
}

export const KR_STATUS_FILTER_OPTIONS: Array<{ value: KrStatusFilter; label: string }> = [
  { value: 'on-track', label: 'On track' },
  { value: 'at-risk', label: 'At risk' },
  { value: 'off-track', label: 'Off track' },
  { value: 'inactive', label: 'Closed / archived' },
]

/** Status bucket of a KR: non-ACTIVE rows are "inactive", the rest follow confidence. */
export function krStatusBucket(kr: Pick<FilterableKr, 'status' | 'confidence'>): KrStatusFilter {
  if (kr.status !== 'ACTIVE') return 'inactive'
  const s = fromDbStatus(kr.confidence)
  if (s === 'at-risk') return 'at-risk'
  if (s === 'off-track' || s === 'no-owner') return 'off-track'
  return 'on-track'
}

export function filterKeyResults<T extends FilterableKr>(krs: T[], filters: KrFilterState): T[] {
  return krs.filter((kr) => {
    if (filters.status && krStatusBucket(kr) !== filters.status) return false
    if (filters.ownerId && kr.owner.id !== filters.ownerId) return false
    return true
  })
}

export function activeFilterCount(filters: KrFilterState): number {
  return (filters.status ? 1 : 0) + (filters.ownerId ? 1 : 0)
}
