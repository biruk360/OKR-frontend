/**
 * OKR Explorer — shared types, constants and pure helpers.
 * Split out of OkrsAllClient.tsx (no behaviour change).
 */

import { Building2, Target, User } from 'lucide-react'
import { normalizeStatus } from '@/components/shared/StatusPill'
import { applyExplorerScope, type ExplorerScope } from '@/lib/okr/explorer-params'

export interface CurrentUser {
  id: string
  role: 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE'
}

export type Tab = 'all' | 'watched' | 'mine' | 'atRisk'
export type ViewMode = 'compact' | 'rich'
export type SortKey = 'title' | 'progress' | 'owner' | 'period' | 'status'
export type SortDir = 'asc' | 'desc'
export type SortState = { key: SortKey; dir: SortDir } | null

/* ----------------------------- Types --------------------------------- */

export interface RefUser { id: string; name: string | null; email: string; avatar?: string | null }
export interface RefTeam { id: string; name: string }
export interface RefLabel { id: string; name: string; color: string }
export interface RefTimeframe { id: string; name: string; startDate: string; endDate: string; type?: string | null }

export interface Row {
  path: string[]
  rowId: string
  kind: 'OBJ' | 'KR' | 'INIT'
  parentRowId: string | null
  data: Record<string, any>
}

export interface Refs { timeframes: RefTimeframe[]; owners: RefUser[]; teams: RefTeam[]; labels: RefLabel[] }

/** `/api/okr-hierarchy` meta: which timeframes the rows are for (the active one when none was requested). */
export interface HierarchyMeta { periodIds: string[]; defaultedPeriod: boolean; initiativesIncluded: boolean }

export interface ApiResponse { success: boolean; data: { rows: Row[]; refs?: Refs; meta?: HierarchyMeta } }

/** Server-computed create rights per objective level (lib/permissions canCreateObjective). */
export type CreatePermissions = Record<'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL', boolean>

/** Timeframe filter option meaning "every timeframe" (`period=all` on the API). */
export const ALL_PERIODS = 'all'

export interface Filters {
  period: string[]
  team: string[]
  type: string[]
  status: string[]
  q: string
}

export const EMPTY_FILTERS: Filters = { period: [], team: [], type: [], status: [], q: '' }

export const TYPE_OPTIONS = [
  { id: 'COMPANY', label: 'Company' },
  { id: 'DEPARTMENT', label: 'Department' },
  { id: 'INDIVIDUAL', label: 'Individual' },
]
export const STATUS_OPTIONS = [
  { id: 'ON_TRACK', label: 'On track' },
  { id: 'AT_RISK', label: 'At risk' },
  { id: 'OFF_TRACK', label: 'Off track' },
  { id: 'CLOSED', label: 'Closed' },
]

export type CreateLevel = 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL'

export const CREATE_OPTIONS: { level: CreateLevel; label: string; icon: typeof Building2 }[] = [
  { level: 'COMPANY', label: 'Add Company Objective', icon: Building2 },
  { level: 'DEPARTMENT', label: 'Add Department Objective', icon: Target },
  { level: 'INDIVIDUAL', label: 'Add My Objective', icon: User },
]

export const PAGE_SIZE = 50

/** `scope` is the Explorer level preset; its keys replace the user's picks for the same keys. */
export function filtersToQuery(f: Filters, includeRefs: boolean, scope?: ExplorerScope): string {
  const sp = new URLSearchParams()
  // Reference tables (timeframes/owners/teams/labels) are only needed once.
  if (!includeRefs) sp.set('refs', '0')
  for (const v of f.period) sp.append('period', v)
  for (const v of f.team) sp.append('team', v)
  for (const v of f.type) sp.append('type', v)
  for (const v of f.status) sp.append('status', v)
  if (f.q) sp.set('q', f.q)
  return applyExplorerScope(sp, scope).toString()
}

export function daysSince(d: string | Date | null | undefined): number | null {
  if (!d) return null
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return null
  return Math.floor((Date.now() - date.getTime()) / (24 * 3600 * 1000))
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

export function statusOf(row: Row): string {
  return normalizeStatus(row.data.goalStatus ?? row.data.confidence ?? row.data.status)
}

/* --------------------------- Tab + filter helpers --------------------------- */

export function matchesTab(row: Row, tab: Tab, currentUser: CurrentUser): boolean {
  if (tab === 'all') return true
  if (tab === 'watched') return true
  if (tab === 'mine') {
    const ownerId = row.data.owner?.id
    const collaborators: Array<{ id: string }> = row.data.collaborators ?? []
    if (ownerId === currentUser.id) return true
    if (collaborators.some(c => c.id === currentUser.id)) return true
    if (row.kind === 'INIT' && row.data.assigneeId === currentUser.id) return true
    return false
  }
  if (tab === 'atRisk') {
    const s = row.data.goalStatus ?? row.data.confidence
    if (s === 'AT_RISK' || s === 'OFF_TRACK') return true
    if (row.kind !== 'INIT' && row.data.lastUpdate) {
      const days = daysSince(row.data.lastUpdate)
      if (days !== null && days > 14) return true
    }
    return false
  }
  return true
}

export function matchesHideFinished(row: Row, hideFinished: boolean): boolean {
  if (!hideFinished) return true
  if (row.kind === 'INIT') return row.data.status !== 'COMPLETED' && row.data.status !== 'CANCELLED'
  if (typeof row.data.progress === 'number' && row.data.progress >= 100) return false
  if (row.data.goalStatus === 'CLOSED') return false
  return true
}

export function matchesStatus(row: Row, statusFilter: string[]): boolean {
  if (statusFilter.length === 0) return true
  const v = row.data.goalStatus ?? row.data.confidence ?? row.data.status
  return v ? statusFilter.includes(v) : false
}

/** Enter/Space on the focused element itself (not a nested checkbox/button) runs `handler`. */
export function activateOnKey(handler: () => void) {
  return (e: { key: string; target: EventTarget; currentTarget: EventTarget; preventDefault: () => void }) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handler()
    }
  }
}
