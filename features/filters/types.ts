export type FiltersTab = 'objectives' | 'key-results' | 'initiatives'

export type SegmentId =
  // Objectives
  | 'obj-active' | 'obj-draft' | 'obj-low-confidence' | 'obj-moderate-confidence' | 'obj-high-confidence'
  // Key Results
  | 'kr-active' | 'kr-draft' | 'kr-all-off-track' | 'kr-all-at-risk'
  | 'kr-owned' | 'kr-contributing' | 'kr-owned-off-track' | 'kr-owned-at-risk'
  | 'kr-not-measurable' | 'kr-default-targets' | 'kr-pending-checkins'
  | 'kr-without-owner' | 'kr-not-aligned' | 'kr-reporting-to-you'
  | 'kr-tagged-kpi' | 'kr-committed' | 'kr-aspirational'
  // Initiatives
  | 'init-active' | 'init-draft'
  | 'init-owned' | 'init-contributing'
  | 'init-overdue' | 'init-without-owner' | 'init-reporting-to-you'

export interface Segment {
  id: SegmentId
  label: string
  group: string
}

export interface FilterState {
  planStatus?: string[]
  plans?: string[]
  owners?: string[]
  contributors?: string[]
  teams?: string[]
  path?: string[]
  tags?: string[]
  timeline?: string
  insights?: string[]
  confidence?: string[]
  weight?: string[]
  outcomeType?: string[]
  completed?: boolean
  progressAbove?: number
  progressBelow?: number
  label?: string[]
  workStatus?: string[]
  completion?: string
  closedDate?: string
}

export interface KpiData {
  // KR tab
  pending?: number
  onTrack?: number
  atRisk?: number
  offTrack?: number
  notMeasurable?: number
  // Objectives tab
  avgNcs?: number
  lowConfidence?: number
  moderateConfidence?: number
  highConfidence?: number
  // Initiatives tab
  avgCompletion?: number
  dueThisWeek?: number
  overdue?: number
  completedOnTime?: number
}

export interface ProgressBucket {
  range: string
  min: number
  max: number
  count: number
}

export interface FilteredResult {
  id: string
  title: string
  planId: string
  planName: string
  status?: string
  confidence?: string
  progress?: number
  ownerName?: string
  ownerAvatar?: string
  dueDate?: string
  workStatus?: string
  entityType: FiltersTab
}

export interface SavedSegment {
  id: string
  name: string
  tab: FiltersTab
  filters: FilterState
  segmentId?: SegmentId
  visibility: 'private' | 'team' | 'workspace'
}
