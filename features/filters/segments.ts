import type { FiltersTab, Segment } from './types'

export const SEGMENTS_BY_TAB: Record<FiltersTab, { group: string; items: Segment[] }[]> = {
  objectives: [
    {
      group: 'ALL OBJECTIVES',
      items: [
        { id: 'obj-active', label: 'Active', group: 'ALL OBJECTIVES' },
        { id: 'obj-draft', label: 'Draft', group: 'ALL OBJECTIVES' },
        { id: 'obj-low-confidence', label: 'Low confidence', group: 'ALL OBJECTIVES' },
        { id: 'obj-moderate-confidence', label: 'Moderate confidence', group: 'ALL OBJECTIVES' },
        { id: 'obj-high-confidence', label: 'High confidence', group: 'ALL OBJECTIVES' },
      ],
    },
  ],
  'key-results': [
    {
      group: 'ALL KEY RESULTS',
      items: [
        { id: 'kr-active', label: 'Active', group: 'ALL KEY RESULTS' },
        { id: 'kr-draft', label: 'Draft', group: 'ALL KEY RESULTS' },
        { id: 'kr-all-off-track', label: 'All off track', group: 'ALL KEY RESULTS' },
        { id: 'kr-all-at-risk', label: 'All at risk', group: 'ALL KEY RESULTS' },
      ],
    },
    {
      group: 'YOUR KEY RESULTS',
      items: [
        { id: 'kr-owned', label: 'Owned', group: 'YOUR KEY RESULTS' },
        { id: 'kr-contributing', label: 'Contributing', group: 'YOUR KEY RESULTS' },
        { id: 'kr-owned-off-track', label: 'Owned off track', group: 'YOUR KEY RESULTS' },
        { id: 'kr-owned-at-risk', label: 'Owned at risk', group: 'YOUR KEY RESULTS' },
      ],
    },
    {
      group: 'INSIGHTS',
      items: [
        { id: 'kr-not-measurable', label: 'Not measurable', group: 'INSIGHTS' },
        { id: 'kr-default-targets', label: 'With default targets', group: 'INSIGHTS' },
        { id: 'kr-pending-checkins', label: 'Pending check-ins', group: 'INSIGHTS' },
        { id: 'kr-without-owner', label: 'Without owner', group: 'INSIGHTS' },
        { id: 'kr-not-aligned', label: 'Not aligned', group: 'INSIGHTS' },
        { id: 'kr-reporting-to-you', label: 'Reporting to you', group: 'INSIGHTS' },
        { id: 'kr-tagged-kpi', label: 'Tagged as KPI', group: 'INSIGHTS' },
        { id: 'kr-committed', label: 'Committed', group: 'INSIGHTS' },
        { id: 'kr-aspirational', label: 'Aspirational', group: 'INSIGHTS' },
      ],
    },
  ],
  initiatives: [
    {
      group: 'ALL INITIATIVES',
      items: [
        { id: 'init-active', label: 'Active', group: 'ALL INITIATIVES' },
        { id: 'init-draft', label: 'Draft', group: 'ALL INITIATIVES' },
      ],
    },
    {
      group: 'YOUR INITIATIVES',
      items: [
        { id: 'init-owned', label: 'Owned', group: 'YOUR INITIATIVES' },
        { id: 'init-contributing', label: 'Contributing', group: 'YOUR INITIATIVES' },
      ],
    },
    {
      group: 'INSIGHTS',
      items: [
        { id: 'init-overdue', label: 'Overdue', group: 'INSIGHTS' },
        { id: 'init-without-owner', label: 'Without owner', group: 'INSIGHTS' },
        { id: 'init-reporting-to-you', label: 'Reporting to you', group: 'INSIGHTS' },
      ],
    },
  ],
}

export const DEFAULT_SEGMENT_BY_TAB: Record<FiltersTab, string> = {
  objectives: 'obj-active',
  'key-results': 'kr-active',
  initiatives: 'init-active',
}
