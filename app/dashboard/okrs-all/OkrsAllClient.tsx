'use client'

/**
 * OKR Explorer — consolidated view over Plans / Company OKRs / Department OKRs /
 * Objectives. Forked from /dashboard/okr-hierarchy with additions:
 *   • KPI cards (reactive to the filtered set)
 *   • Tabs (All / Watched [phase 2] / My OKRs / At risk)
 *   • "Hide finished" toggle
 *   • Role-aware Create menu (replaces 3 per-level create buttons)
 *   • "Initiatives" column (n closed / N total under the row)
 *
 * Everything else — per-column filter popovers, resizable columns, tree/depth
 * layout, sticky Name column, side drawer, hover preview, global initiative
 * modal wiring — is inherited unchanged.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  Search,
  Filter as FilterIcon,
  Layers,
  X,
  Building2,
  Target,
  Key,
  CheckSquare,
  Plus,
  AlertTriangle,
  Star,
} from 'lucide-react'
import SideDrawer from '@/components/ui/SideDrawer'
import { StatCard, StatGrid } from '@/components/ui'
import { useInitiativeDetailStore } from '@/lib/stores/initiative-detail-store'
import { useOkrFavoritesStore } from '@/lib/stores/okr-favorites-store'
import {
  CreateCompanyObjectiveButton,
  CreateDepartmentObjectiveButton,
  CreateIndividualObjectiveButton,
} from '@/features/objectives'

/** Current user shape passed from the server page. */
interface CurrentUser {
  id: string
  role: 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE'
}

type Tab = 'all' | 'watched' | 'mine' | 'atRisk'

/* ----------------------------- Types --------------------------------- */

interface RefUser {
  id: string
  name: string | null
  email: string
  avatar?: string | null
}
interface RefTeam {
  id: string
  name: string
}
interface RefLabel {
  id: string
  name: string
  color: string
}
interface RefTimeframe {
  id: string
  name: string
  startDate: string
  endDate: string
  type?: string | null
}

interface Row {
  path: string[]
  rowId: string
  kind: 'OBJ' | 'KR' | 'INIT'
  parentRowId: string | null
  data: Record<string, any>
}

interface Refs {
  timeframes: RefTimeframe[]
  owners: RefUser[]
  teams: RefTeam[]
  labels: RefLabel[]
}

interface ApiResponse {
  success: boolean
  data: { rows: Row[]; refs: Refs }
}

/* -------------------- Filter state + URL helpers --------------------- */

interface Filters {
  period: string[]
  owner: string[]
  team: string[]
  label: string[]
  type: string[]
  status: string[]
  collaborator: string[]
  progressMin: string
  progressMax: string
  q: string
}

const EMPTY_FILTERS: Filters = {
  period: [],
  owner: [],
  team: [],
  label: [],
  type: [],
  status: [],
  collaborator: [],
  progressMin: '',
  progressMax: '',
  q: '',
}

function filtersToQuery(f: Filters): string {
  const sp = new URLSearchParams()
  for (const k of ['period', 'owner', 'team', 'label', 'type', 'status', 'collaborator'] as const) {
    for (const v of f[k]) sp.append(k, v)
  }
  if (f.progressMin) sp.set('progressMin', f.progressMin)
  if (f.progressMax) sp.set('progressMax', f.progressMax)
  if (f.q) sp.set('q', f.q)
  return sp.toString()
}

const TYPE_OPTIONS = [
  { id: 'COMPANY', label: 'Company' },
  { id: 'DEPARTMENT', label: 'Department' },
  { id: 'INDIVIDUAL', label: 'Individual' },
]
const STATUS_OPTIONS = [
  { id: 'ON_TRACK', label: 'On track' },
  { id: 'AT_RISK', label: 'At risk' },
  { id: 'OFF_TRACK', label: 'Off track' },
  { id: 'CLOSED', label: 'Closed' },
]

/* ----------------------- Visual helpers ------------------------------ */

const STATUS_PILL: Record<string, string> = {
  ON_TRACK: 'bg-emerald-100 text-emerald-800',
  AT_RISK: 'bg-amber-100 text-amber-800',
  OFF_TRACK: 'bg-red-100 text-red-800',
  CLOSED: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-sky-100 text-sky-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-100 text-slate-400',
}

const LEVEL_BADGE: Record<string, { letter: string; bg: string; fg: string }> = {
  COMPANY: { letter: 'C', bg: 'bg-indigo-600', fg: 'text-white' },
  DEPARTMENT: { letter: 'D', bg: 'bg-sky-600', fg: 'text-white' },
  INDIVIDUAL: { letter: 'I', bg: 'bg-slate-600', fg: 'text-white' },
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

function daysSince(d: string | Date | null | undefined): number | null {
  if (!d) return null
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return null
  return Math.floor((Date.now() - date.getTime()) / (24 * 3600 * 1000))
}

function computeGrade(progress: number | null | undefined): string {
  if (typeof progress !== 'number') return '—'
  const g = Math.max(0, Math.min(1, progress / 100))
  return g.toFixed(1)
}

/** Tab preset filters applied client-side on top of the toolbar filters. */
function matchesTab(row: Row, tab: Tab, currentUser: CurrentUser): boolean {
  if (tab === 'all') return true
  // `watched` is handled in the `filteredRows` memo where we have access to the
  // favorites set — return true here as a pass-through and let the caller prune.
  if (tab === 'watched') return true
  if (tab === 'mine') {
    const ownerId = row.data.owner?.id
    const collaborators: Array<{ id: string }> = row.data.collaborators ?? []
    if (ownerId === currentUser.id) return true
    if (collaborators.some((c) => c.id === currentUser.id)) return true
    if (row.kind === 'INIT' && row.data.assigneeId === currentUser.id) return true
    return false
  }
  if (tab === 'atRisk') {
    const s = row.data.goalStatus ?? row.data.confidence
    if (s === 'AT_RISK' || s === 'OFF_TRACK') return true
    // Also include rows with missed check-ins (>14 days) at OBJ/KR level.
    if (row.kind !== 'INIT' && row.data.lastUpdate) {
      const days = daysSince(row.data.lastUpdate)
      if (days !== null && days > 14) return true
    }
    return false
  }
  return true
}

function matchesHideFinished(row: Row, hideFinished: boolean): boolean {
  if (!hideFinished) return true
  if (row.kind === 'INIT') return row.data.status !== 'COMPLETED' && row.data.status !== 'CANCELLED'
  if (typeof row.data.progress === 'number' && row.data.progress >= 100) return false
  if (row.data.goalStatus === 'CLOSED') return false
  return true
}

/* ------------------- Generic multi-select popover -------------------- */

function useClickAway(onAway: () => void) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onAway])
  return ref
}

function FilterTrigger({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600 hover:text-gray-900 ' +
        (active ? 'text-blue-600' : '')
      }
    >
      <FilterIcon className={'h-3 w-3 ' + (active ? 'text-blue-600' : '')} />
      {label}
    </button>
  )
}

interface MultiSelectProps<T extends { id: string }> {
  title: string
  options: T[]
  selected: string[]
  onChange: (next: string[]) => void
  render: (o: T) => React.ReactNode
  searchable?: boolean
  onClose: () => void
}

function MultiSelectPopover<T extends { id: string }>({
  title,
  options,
  selected,
  onChange,
  render,
  searchable,
  onClose,
}: MultiSelectProps<T>) {
  const [q, setQ] = useState('')
  const ref = useClickAway(onClose)
  const filtered = searchable && q
    ? options.filter((o: any) => (o.name ?? '').toLowerCase().includes(q.toLowerCase()))
    : options
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id))
    else onChange([...selected, id])
  }
  return (
    <div
      ref={ref}
      className="absolute z-30 top-full left-0 mt-1 w-72 rounded-md border border-gray-200 bg-white shadow-lg"
    >
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">{title}</span>
        <button type="button" className="text-gray-400 hover:text-gray-700" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      {searchable && (
        <div className="px-3 pt-2">
          <div className="flex items-center gap-1 rounded border border-gray-200 px-2">
            <Search className="h-3.5 w-3.5 text-gray-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full py-1 text-sm focus:outline-none"
            />
          </div>
        </div>
      )}
      <ul className="max-h-72 overflow-y-auto py-1">
        {filtered.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">No matches</li>}
        {filtered.map((o) => (
          <li key={o.id}>
            <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selected.includes(o.id)}
                onChange={() => toggle(o.id)}
                className="h-3.5 w-3.5"
              />
              <span className="text-sm text-gray-800 truncate">{render(o)}</span>
            </label>
          </li>
        ))}
      </ul>
      {selected.length > 0 && (
        <div className="border-t border-gray-100 px-3 py-2 text-right">
          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-800"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

function RangePopover({
  min,
  max,
  onChange,
  onClose,
}: {
  min: string
  max: string
  onChange: (next: { min: string; max: string }) => void
  onClose: () => void
}) {
  const ref = useClickAway(onClose)
  const [local, setLocal] = useState({ min, max })
  return (
    <div
      ref={ref}
      className="absolute z-30 top-full left-0 mt-1 w-60 rounded-md border border-gray-200 bg-white shadow-lg p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">Progress %</span>
        <button type="button" className="text-gray-400 hover:text-gray-700" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          placeholder="Min"
          value={local.min}
          onChange={(e) => setLocal((p) => ({ ...p, min: e.target.value }))}
          className="w-20 border rounded px-2 py-1 text-sm"
        />
        <span className="text-gray-400">–</span>
        <input
          type="number"
          min={0}
          max={100}
          placeholder="Max"
          value={local.max}
          onChange={(e) => setLocal((p) => ({ ...p, max: e.target.value }))}
          className="w-20 border rounded px-2 py-1 text-sm"
        />
        <span className="text-xs text-gray-500">%</span>
      </div>
      <div className="flex justify-between mt-3">
        <button
          type="button"
          onClick={() => {
            onChange({ min: '', max: '' })
            onClose()
          }}
          className="text-xs text-gray-600 hover:text-gray-800"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(local)
            onClose()
          }}
          className="px-3 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

/* ------------------------- Column definitions ------------------------ */

interface Column {
  key: string
  label: string
  width: number
  filterable?: boolean
  render: (row: Row, refs: Refs) => React.ReactNode
  filterMenu?: (args: { refs: Refs; filters: Filters; setFilters: (f: Filters) => void; close: () => void }) => React.ReactNode
  isActive?: (filters: Filters) => boolean
}

const COLUMNS: Column[] = [
  {
    key: 'period',
    label: 'Period',
    width: 160,
    filterable: true,
    render: (row) => <span className="text-sm text-gray-700">{row.data.period?.name ?? '—'}</span>,
    filterMenu: ({ refs, filters, setFilters, close }) => (
      <MultiSelectPopover
        title="Period"
        searchable
        options={refs.timeframes}
        selected={filters.period}
        onChange={(next) => setFilters({ ...filters, period: next })}
        render={(t: any) => t.name}
        onClose={close}
      />
    ),
    isActive: (f) => f.period.length > 0,
  },
  {
    key: 'owner',
    label: 'Owner',
    width: 170,
    filterable: true,
    render: (row) =>
      row.data.owner ? (
        <div className="flex items-center gap-1.5">
          <UserAvatar user={row.data.owner} />
          <span className="text-sm text-gray-800 truncate">{row.data.owner.name ?? '—'}</span>
        </div>
      ) : (
        <span className="text-gray-400">—</span>
      ),
    filterMenu: ({ refs, filters, setFilters, close }) => (
      <MultiSelectPopover
        title="Owner"
        searchable
        options={refs.owners}
        selected={filters.owner}
        onChange={(next) => setFilters({ ...filters, owner: next })}
        render={(u: any) => u.name ?? u.email}
        onClose={close}
      />
    ),
    isActive: (f) => f.owner.length > 0,
  },
  {
    key: 'teams',
    label: 'Teams',
    width: 140,
    filterable: true,
    render: (row) =>
      row.data.team ? (
        <span className="inline-flex items-center gap-1 rounded bg-indigo-50 text-indigo-700 text-[11px] font-medium px-1.5 py-0.5">
          <span className="h-3 w-3 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center">
            {(row.data.team.name ?? '?').slice(0, 1)}
          </span>
          {row.data.team.name}
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
    filterMenu: ({ refs, filters, setFilters, close }) => (
      <MultiSelectPopover
        title="Teams"
        searchable
        options={refs.teams}
        selected={filters.team}
        onChange={(next) => setFilters({ ...filters, team: next })}
        render={(t: any) => t.name}
        onClose={close}
      />
    ),
    isActive: (f) => f.team.length > 0,
  },
  {
    key: 'labels',
    label: 'Labels',
    width: 140,
    filterable: true,
    render: (row) =>
      row.data.labels && row.data.labels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {row.data.labels.slice(0, 3).map((l: RefLabel) => (
            <span
              key={l.id}
              className="inline-flex items-center rounded-full text-[10px] font-medium px-1.5 py-0.5"
              style={{ backgroundColor: l.color + '22', color: l.color }}
            >
              {l.name}
            </span>
          ))}
          {row.data.labels.length > 3 && (
            <span className="text-[10px] text-gray-500">+{row.data.labels.length - 3}</span>
          )}
        </div>
      ) : (
        <span className="text-gray-400">—</span>
      ),
    filterMenu: ({ refs, filters, setFilters, close }) => (
      <MultiSelectPopover
        title="Labels"
        searchable
        options={refs.labels}
        selected={filters.label}
        onChange={(next) => setFilters({ ...filters, label: next })}
        render={(l: any) => l.name}
        onClose={close}
      />
    ),
    isActive: (f) => f.label.length > 0,
  },
  {
    key: 'okrType',
    label: 'OKR Type',
    width: 120,
    filterable: true,
    render: (row) => {
      if (row.kind === 'OBJ') {
        const b = LEVEL_BADGE[row.data.level] ?? LEVEL_BADGE.INDIVIDUAL
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700">
            <span className={`h-4 w-4 rounded-sm text-[10px] font-bold flex items-center justify-center ${b.bg} ${b.fg}`}>
              {b.letter}
            </span>
            {row.data.level?.charAt(0) + row.data.level?.slice(1).toLowerCase()}
          </span>
        )
      }
      if (row.kind === 'KR') return <span className="text-xs text-gray-600">Key Result</span>
      return <span className="text-xs text-gray-600">Initiative</span>
    },
    filterMenu: ({ filters, setFilters, close }) => (
      <MultiSelectPopover
        title="OKR Type"
        options={TYPE_OPTIONS}
        selected={filters.type}
        onChange={(next) => setFilters({ ...filters, type: next })}
        render={(o: any) => o.label}
        onClose={close}
      />
    ),
    isActive: (f) => f.type.length > 0,
  },
  {
    key: 'progress',
    label: 'Progress',
    width: 140,
    filterable: true,
    render: (row) => {
      const p = row.data.progress
      if (typeof p !== 'number') return <span className="text-gray-400">—</span>
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden min-w-[50px]">
            <div
              className={
                'h-full rounded-full ' +
                (p >= 70 ? 'bg-emerald-500' : p >= 30 ? 'bg-amber-500' : 'bg-red-500')
              }
              style={{ width: `${Math.min(100, p)}%` }}
            />
          </div>
          <span className="tabular-nums text-xs text-gray-700 w-10 text-right">{Math.round(p)}%</span>
        </div>
      )
    },
    filterMenu: ({ filters, setFilters, close }) => (
      <RangePopover
        min={filters.progressMin}
        max={filters.progressMax}
        onChange={({ min, max }) => setFilters({ ...filters, progressMin: min, progressMax: max })}
        onClose={close}
      />
    ),
    isActive: (f) => Boolean(f.progressMin) || Boolean(f.progressMax),
  },
  {
    key: 'collaborators',
    label: 'Collaborators',
    width: 140,
    filterable: true,
    render: (row) => {
      const list: RefUser[] = row.data.collaborators ?? []
      if (list.length === 0) return <span className="text-gray-400">—</span>
      return (
        <div className="flex items-center -space-x-1">
          {list.slice(0, 4).map((u) => (
            <UserAvatar key={u.id} user={u} ring />
          ))}
          {list.length > 4 && (
            <span className="relative h-5 w-5 rounded-full bg-gray-200 text-[9px] font-semibold flex items-center justify-center ring-2 ring-white">
              +{list.length - 4}
            </span>
          )}
        </div>
      )
    },
    filterMenu: ({ refs, filters, setFilters, close }) => (
      <MultiSelectPopover
        title="Collaborators"
        searchable
        options={refs.owners}
        selected={filters.collaborator}
        onChange={(next) => setFilters({ ...filters, collaborator: next })}
        render={(u: any) => u.name ?? u.email}
        onClose={close}
      />
    ),
    isActive: (f) => f.collaborator.length > 0,
  },
  {
    key: 'status',
    label: 'Status',
    width: 120,
    filterable: true,
    render: (row) => {
      const v = row.data.goalStatus ?? row.data.confidence ?? row.data.status
      if (!v) return <span className="text-gray-400">—</span>
      return (
        <span className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${STATUS_PILL[v] ?? 'bg-slate-100 text-slate-700'}`}>
          {String(v).replace(/_/g, ' ')}
        </span>
      )
    },
    filterMenu: ({ filters, setFilters, close }) => (
      <MultiSelectPopover
        title="Status"
        options={STATUS_OPTIONS}
        selected={filters.status}
        onChange={(next) => setFilters({ ...filters, status: next })}
        render={(o: any) => o.label}
        onClose={close}
      />
    ),
    isActive: (f) => f.status.length > 0,
  },
  {
    key: 'weight',
    label: 'Weight',
    width: 80,
    render: (row) =>
      typeof row.data.weight === 'number' ? (
        <span className="tabular-nums text-sm text-gray-700">{row.data.weight}</span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: 'latestUpdate',
    label: 'Latest Update',
    width: 240,
    render: (row) => (
      <span className="text-xs text-gray-600 line-clamp-1" title={row.data.latestUpdateText ?? ''}>
        {row.data.latestUpdateText ?? row.kind === 'INIT' ? '—' : 'Key result created.'}
      </span>
    ),
  },
  {
    key: 'daysSince',
    label: 'Days since last update',
    width: 130,
    render: (row) => {
      const n = daysSince(row.data.lastUpdate)
      return n == null ? <span className="text-gray-400">—</span> : <span className="tabular-nums text-sm text-gray-700">{n}</span>
    },
  },
  {
    key: 'dateOfLastUpdate',
    label: 'Date of last update',
    width: 130,
    render: (row) => <span className="text-sm text-gray-700">{formatDate(row.data.lastUpdate)}</span>,
  },
  {
    key: 'expectedStart',
    label: 'Expected start date',
    width: 130,
    render: (row) => <span className="text-sm text-gray-700">{formatDate(row.data.startDate)}</span>,
  },
  {
    key: 'expectedEnd',
    label: 'Expected end date',
    width: 130,
    render: (row) => <span className="text-sm text-gray-700">{formatDate(row.data.endDate ?? row.data.dueDate)}</span>,
  },
  {
    key: 'grade',
    label: 'Grade',
    width: 80,
    render: (row) => <span className="tabular-nums text-sm text-gray-700">{computeGrade(row.data.progress)}</span>,
  },
  {
    key: 'startValue',
    label: 'Start Value',
    width: 100,
    render: (row) =>
      row.kind === 'KR' ? (
        <span className="tabular-nums text-sm text-gray-700">
          {row.data.startValue} {row.data.unit}
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: 'currentValue',
    label: 'Current Value',
    width: 100,
    render: (row) =>
      row.kind === 'KR' ? (
        <span className="tabular-nums text-sm text-gray-700">
          {row.data.currentValue} {row.data.unit}
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: 'targetValue',
    label: 'Target Value',
    width: 100,
    render: (row) =>
      row.kind === 'KR' ? (
        <span className="tabular-nums text-sm text-gray-700">
          {row.data.targetValue} {row.data.unit}
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    // New column — initiatives (todos) rolled up per row.
    // For OBJ: count all INIT descendants. For KR: count INITs directly under it.
    // For INIT: show its own completion state as `1/1` or `0/1`.
    key: 'initiatives',
    label: 'Initiatives',
    width: 110,
    render: (row) => {
      const total = (row.data.__initTotal ?? 0) as number
      const closed = (row.data.__initClosed ?? 0) as number
      if (total === 0) return <span className="text-gray-400">—</span>
      const tone = total === closed ? 'text-emerald-700 bg-emerald-50' : closed > 0 ? 'text-amber-700 bg-amber-50' : 'text-slate-700 bg-slate-50'
      return (
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${tone}`}>
          {closed}/{total}
        </span>
      )
    },
  },
]

function UserAvatar({ user, ring }: { user: RefUser | null | undefined; ring?: boolean }) {
  if (!user) return null
  const initial = (user.name ?? user.email ?? '?').slice(0, 1).toUpperCase()
  return user.avatar ? (
    <img
      src={user.avatar}
      alt={user.name ?? ''}
      className={'h-5 w-5 rounded-full object-cover ' + (ring ? 'ring-2 ring-white' : '')}
    />
  ) : (
    <span
      className={
        'h-5 w-5 rounded-full bg-blue-500 text-white text-[10px] font-semibold flex items-center justify-center ' +
        (ring ? 'ring-2 ring-white' : '')
      }
    >
      {initial}
    </span>
  )
}

/* ----------------------------- Tree model ---------------------------- */

interface TreeNode extends Row {
  children: TreeNode[]
}

function buildTree(rows: Row[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  rows.forEach((r) => map.set(r.rowId, { ...r, children: [] }))
  const roots: TreeNode[] = []
  map.forEach((node) => {
    if (node.parentRowId && map.has(node.parentRowId)) {
      map.get(node.parentRowId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function flatten(nodes: TreeNode[], expanded: Set<string>, depth = 0, out: Array<TreeNode & { depth: number }> = []) {
  for (const n of nodes) {
    out.push(Object.assign({}, n, { depth }))
    if (expanded.has(n.rowId) && n.children.length > 0) flatten(n.children, expanded, depth + 1, out)
  }
  return out
}

/* --------------------------- Main component -------------------------- */

const NAME_COL_DEFAULT = 420
const NAME_COL_MIN = 260
const COL_MIN = 72

export default function OkrsAllClient({ currentUser }: { currentUser: CurrentUser }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [rows, setRows] = useState<Row[]>([])
  const [refs, setRefs] = useState<Refs>({ timeframes: [], owners: [], teams: [], labels: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [selected, setSelected] = useState<Row | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [hideFinished, setHideFinished] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const router = useRouter()
  const { ids: favoriteIds, loaded: favLoaded, load: loadFavorites, toggle: toggleFavorite } =
    useOkrFavoritesStore()
  useEffect(() => { loadFavorites() }, [loadFavorites])

  // Per-column widths (resizable). Seeded from defaults; persisted to
  // localStorage so widths survive refreshes.
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = { __name: NAME_COL_DEFAULT }
    for (const c of COLUMNS) init[c.key] = c.width
    return init
  })
  useEffect(() => {
    try {
      const raw = localStorage.getItem('okrs-all-widths')
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>
        setWidths((prev) => ({ ...prev, ...parsed }))
      }
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem('okrs-all-widths', JSON.stringify(widths))
    } catch {}
  }, [widths])
  // Hover preview state (for the row title tooltip card).
  const [hoverRow, setHoverRow] = useState<{ row: Row; x: number; y: number } | null>(null)
  const hoverTimer = useRef<number | null>(null)
  const [portalMounted, setPortalMounted] = useState(false)
  useEffect(() => {
    setPortalMounted(true)
  }, [])

  const scheduleHoverPreview = (row: Row, e: React.MouseEvent<HTMLElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = rect.right + 12
    const y = rect.top
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHoverRow({ row, x, y }), 350)
  }
  const cancelHoverPreview = () => {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    setHoverRow(null)
  }

  const startResize = useCallback((key: string, startX: number) => {
    const startWidth = widths[key]
    const min = key === '__name' ? NAME_COL_MIN : COL_MIN
    const onMove = (e: MouseEvent) => {
      const next = Math.max(min, Math.round(startWidth + (e.clientX - startX)))
      setWidths((prev) => ({ ...prev, [key]: next }))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [widths])

  const fetchData = useCallback(async (f: Filters) => {
    setLoading(true)
    setError(null)
    try {
      const qs = filtersToQuery(f)
      const res = await fetch(`/api/okr-hierarchy${qs ? `?${qs}` : ''}`)
      const body: ApiResponse = await res.json()
      if (!body.success) throw new Error('Failed to load OKR hierarchy')
      setRows(body.data.rows)
      setRefs(body.data.refs)
      // Auto-expand root level so the tree isn't empty on first paint.
      setExpanded((prev) => {
        if (prev.size > 0) return prev
        const next = new Set<string>()
        for (const r of body.data.rows) {
          if (r.kind === 'OBJ' && !r.parentRowId) next.add(r.rowId)
        }
        return next
      })
    } catch (err: any) {
      setError(err.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(filters)
  }, [fetchData, filters])

  /**
   * Enrich every OBJ row with an initiative rollup count (`__initTotal` /
   * `__initClosed`) so the new column can render n/N without a second fetch.
   * Walks the flat rows once; for each OBJ, sums counts from all INIT
   * descendants (children of children), traversing via parentRowId.
   */
  const enrichedRows = useMemo<Row[]>(() => {
    if (rows.length === 0) return rows
    // parentRowId → list of child rowIds
    const childIds = new Map<string, string[]>()
    const byId = new Map<string, Row>()
    for (const r of rows) {
      byId.set(r.rowId, r)
      if (r.parentRowId) {
        if (!childIds.has(r.parentRowId)) childIds.set(r.parentRowId, [])
        childIds.get(r.parentRowId)!.push(r.rowId)
      }
    }
    function countInits(rowId: string): { total: number; closed: number } {
      const out = { total: 0, closed: 0 }
      const children = childIds.get(rowId) ?? []
      for (const cid of children) {
        const c = byId.get(cid)
        if (!c) continue
        if (c.kind === 'INIT') {
          out.total++
          if (c.data.status === 'COMPLETED') out.closed++
        } else {
          const sub = countInits(cid)
          out.total += sub.total
          out.closed += sub.closed
        }
      }
      return out
    }
    return rows.map((r) => {
      if (r.kind === 'OBJ' || r.kind === 'KR') {
        const { total, closed } = countInits(r.rowId)
        return { ...r, data: { ...r.data, __initTotal: total, __initClosed: closed } }
      }
      if (r.kind === 'INIT') {
        const isDone = r.data.status === 'COMPLETED' ? 1 : 0
        return { ...r, data: { ...r.data, __initTotal: 1, __initClosed: isDone } }
      }
      return r
    })
  }, [rows])

  /**
   * Apply client-side tab + hideFinished filters on top of the
   * server-filtered rows. We keep ancestors of any matching row so
   * the tree doesn't look orphaned after pruning.
   */
  const filteredRows = useMemo<Row[]>(() => {
    if (enrichedRows.length === 0) return enrichedRows
    const keep = new Set<string>()
    // When on the Watched tab, "match" means the row itself is a favorited
    // objective OR a descendant of one. Precompute the descendant set so the
    // tree displays favorited OBJ plus their children (KRs + INITs) too.
    const watchedDescendantOf = new Set<string>()
    if (tab === 'watched') {
      const childIds = new Map<string, string[]>()
      for (const r of enrichedRows) {
        if (r.parentRowId) {
          if (!childIds.has(r.parentRowId)) childIds.set(r.parentRowId, [])
          childIds.get(r.parentRowId)!.push(r.rowId)
        }
      }
      const markDesc = (rowId: string): void => {
        for (const cid of childIds.get(rowId) ?? []) {
          watchedDescendantOf.add(cid)
          markDesc(cid)
        }
      }
      for (const r of enrichedRows) {
        if (r.kind === 'OBJ' && favoriteIds.has(r.data.id)) markDesc(r.rowId)
      }
    }
    for (const r of enrichedRows) {
      let tabOk = matchesTab(r, tab, currentUser)
      if (tab === 'watched') {
        const isOwnFav = r.kind === 'OBJ' && favoriteIds.has(r.data.id)
        tabOk = isOwnFav || watchedDescendantOf.has(r.rowId)
      }
      if (tabOk && matchesHideFinished(r, hideFinished)) {
        let cursor: string | null | undefined = r.rowId
        while (cursor) {
          if (keep.has(cursor)) break
          keep.add(cursor)
          const parent = enrichedRows.find((x) => x.rowId === cursor)?.parentRowId
          cursor = parent ?? null
        }
      }
    }
    return enrichedRows.filter((r) => keep.has(r.rowId))
  }, [enrichedRows, tab, hideFinished, currentUser, favoriteIds])

  const tree = useMemo(() => buildTree(filteredRows), [filteredRows])
  const flat = useMemo(() => flatten(tree, expanded), [tree, expanded])

  /** KPI counts recomputed whenever the filtered set changes. */
  const kpis = useMemo(() => {
    let objs = 0, krs = 0, inits = 0, initsClosed = 0
    let progSum = 0, progCount = 0
    let atRisk = 0
    const now = Date.now()
    let overdue = 0
    for (const r of filteredRows) {
      if (r.kind === 'OBJ') {
        objs++
        if (typeof r.data.progress === 'number') { progSum += r.data.progress; progCount++ }
        const s = r.data.goalStatus
        if (s === 'AT_RISK' || s === 'OFF_TRACK') atRisk++
      } else if (r.kind === 'KR') {
        krs++
        if (typeof r.data.progress === 'number') { progSum += r.data.progress; progCount++ }
        const c = r.data.confidence
        if (c === 'AT_RISK' || c === 'OFF_TRACK') atRisk++
      } else if (r.kind === 'INIT') {
        inits++
        if (r.data.status === 'COMPLETED') initsClosed++
      }
      const last = r.data.lastUpdate ? new Date(r.data.lastUpdate).getTime() : null
      if (last && now - last > 14 * 86400_000 && (r.kind === 'OBJ' || r.kind === 'KR')) overdue++
    }
    const avgProgress = progCount > 0 ? Math.round(progSum / progCount) : 0
    return { objs, krs, inits, initsClosed, avgProgress, atRisk, overdue }
  }, [filteredRows])

  const toggle = (rowId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  const expandAll = () => setExpanded(new Set(rows.map((r) => r.rowId)))
  const collapseAll = () => setExpanded(new Set())

  const clearFilters = () => setFilters(EMPTY_FILTERS)
  const activeFilterCount =
    filters.period.length +
    filters.owner.length +
    filters.team.length +
    filters.label.length +
    filters.type.length +
    filters.status.length +
    filters.collaborator.length +
    (filters.progressMin ? 1 : 0) +
    (filters.progressMax ? 1 : 0) +
    (filters.q ? 1 : 0)

  const totalWidth = widths.__name + COLUMNS.reduce((s, c) => s + (widths[c.key] ?? c.width), 0)

  const role = currentUser.role
  const canCreateCompany = role === 'ADMIN' || role === 'EXECUTIVE'
  const canCreateDepartment = canCreateCompany || role === 'DEPARTMENT_LEAD'

  return (
    <div className="space-y-4">
      {/* KPI cards — reactive to current filters + tab */}
      <StatGrid columns={5}>
        <StatCard label="Objectives" value={kpis.objs} iconText="O" tone="blue" />
        <StatCard label="Key Results" value={kpis.krs} iconText="KR" tone="green" />
        <StatCard label="Initiatives" value={`${kpis.initsClosed}/${kpis.inits}`} iconText="✓" tone="purple" />
        <StatCard label="Avg Progress" value={`${kpis.avgProgress}%`} iconText="%" tone="yellow" />
        <StatCard
          label="At Risk"
          value={kpis.atRisk}
          iconText="!"
          tone={kpis.atRisk > 0 ? 'red' : 'blue'}
        />
      </StatGrid>

      {/* Tabs + Create menu */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 border-b border-gray-200">
          <TabButton active={tab === 'all'} onClick={() => setTab('all')} count={null} label="All" />
          <TabButton
            active={tab === 'watched'}
            onClick={() => setTab('watched')}
            count={favoriteIds.size || null}
            label="Watched ⭐"
          />
          <TabButton active={tab === 'mine'} onClick={() => setTab('mine')} count={null} label="My OKRs" />
          <TabButton
            active={tab === 'atRisk'}
            onClick={() => setTab('atRisk')}
            count={kpis.atRisk || null}
            label="At risk"
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setCreateOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Create
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {createOpen && (
            <>
              <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onClick={() => setCreateOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
                {canCreateCompany && (
                  <div onClick={() => setCreateOpen(false)} className="px-1 py-0.5">
                    <CreateCompanyObjectiveButton />
                  </div>
                )}
                {canCreateDepartment && (
                  <div onClick={() => setCreateOpen(false)} className="px-1 py-0.5">
                    <CreateDepartmentObjectiveButton />
                  </div>
                )}
                <div onClick={() => setCreateOpen(false)} className="px-1 py-0.5">
                  <CreateIndividualObjectiveButton />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
        <div className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 w-64">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Search OKR name or key…"
            className="w-full text-sm focus:outline-none"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={hideFinished}
            onChange={(e) => setHideFinished(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Hide finished
        </label>
        <button
          type="button"
          onClick={expandAll}
          className="text-xs text-gray-700 hover:text-gray-900 inline-flex items-center gap-1"
        >
          <Layers className="h-3.5 w-3.5" /> Expand all
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="text-xs text-gray-700 hover:text-gray-900 inline-flex items-center gap-1"
        >
          <Layers className="h-3.5 w-3.5 rotate-180" /> Collapse all
        </button>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-blue-600 hover:text-blue-800 ml-auto"
          >
            Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: totalWidth }}>
          {/* Header row */}
          <div className="flex items-center sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
            <div
              style={{ width: widths.__name }}
              className="relative sticky left-0 z-20 bg-gray-50 px-3 py-2 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-600 border-r border-gray-200"
            >
              OKR Name
              <ResizeHandle onStart={(x) => startResize('__name', x)} />
            </div>
            {COLUMNS.map((c) => (
              <div
                key={c.key}
                style={{ width: widths[c.key] ?? c.width }}
                className="relative px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 border-r border-gray-100 shrink-0"
              >
                {c.filterable ? (
                  <FilterTrigger
                    label={c.label}
                    active={c.isActive?.(filters) ?? false}
                    onClick={() => setOpenMenu(openMenu === c.key ? null : c.key)}
                  />
                ) : (
                  <span>{c.label}</span>
                )}
                {openMenu === c.key && c.filterMenu?.({ refs, filters, setFilters, close: () => setOpenMenu(null) })}
                <ResizeHandle onStart={(x) => startResize(c.key, x)} />
              </div>
            ))}
          </div>

          {/* Body */}
          {loading ? (
            <div className="p-8 text-sm text-gray-500 text-center">Loading…</div>
          ) : error ? (
            <div className="p-8 text-sm text-red-600 text-center">{error}</div>
          ) : flat.length === 0 ? (
            <div className="p-8 text-sm text-gray-500 text-center">No OKRs match these filters.</div>
          ) : (
            <div>
              {flat.map((row, idx) => {
                const isExpandable = row.children.length > 0
                const isExpanded = expanded.has(row.rowId)
                // Alternate row bg is solid so the sticky left-column stays opaque
                // on hover (prevents the text-overlap bug).
                const rowBase = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                const rowHover = 'hover:bg-blue-50'
                return (
                  <div
                    key={row.rowId}
                    className={`group flex items-stretch border-b border-gray-100 ${rowBase} ${rowHover}`}
                    onClick={() => {
                      if (row.kind === 'INIT') {
                        useInitiativeDetailStore.getState().open(row.data.id)
                      } else {
                        setSelected(row)
                      }
                    }}
                  >
                    <div
                      style={{ width: widths.__name, paddingLeft: 12 + row.depth * 16 }}
                      className={`sticky left-0 z-10 pr-3 py-2 shrink-0 flex items-center gap-1 border-r border-gray-200 ${rowBase} group-hover:bg-blue-50`}
                      onMouseEnter={(e) => scheduleHoverPreview(row, e)}
                      onMouseLeave={cancelHoverPreview}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isExpandable) toggle(row.rowId)
                        }}
                        className={isExpandable ? 'text-gray-500 hover:text-gray-900' : 'text-transparent'}
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpandable ? (
                          isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )
                        ) : (
                          <ChevronRight className="h-4 w-4 opacity-0" />
                        )}
                      </button>
                      {row.kind === 'OBJ' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(row.data.id)
                          }}
                          className="shrink-0 text-gray-300 hover:text-yellow-500"
                          aria-label={favoriteIds.has(row.data.id) ? 'Unfavorite' : 'Favorite'}
                          title={favoriteIds.has(row.data.id) ? 'Remove from Watched' : 'Add to Watched'}
                        >
                          <Star
                            className={`h-3.5 w-3.5 ${favoriteIds.has(row.data.id) ? 'fill-yellow-400 text-yellow-500' : ''}`}
                          />
                        </button>
                      )}
                      <KindBadge row={row} />
                      {row.data.href ? (
                        <Link
                          href={row.data.href}
                          className="text-sm text-gray-900 hover:text-blue-600 truncate"
                          title={row.data.title}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.data.title}
                        </Link>
                      ) : (
                        <span className="text-sm text-gray-900 truncate">{row.data.title}</span>
                      )}
                    </div>
                    {COLUMNS.map((c) => (
                      <div
                        key={c.key}
                        style={{ width: widths[c.key] ?? c.width }}
                        className="px-3 py-2 shrink-0 border-r border-gray-100 overflow-hidden"
                      >
                        {c.render(row, refs)}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Hover preview card (portaled so it escapes the sticky header's
          stacking context and isn't clipped by the overflow container). */}
      {portalMounted &&
        hoverRow &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: Math.min(hoverRow.y, window.innerHeight - 220),
              left: Math.min(hoverRow.x, window.innerWidth - 360),
              zIndex: 9999,
            }}
            className="w-80 rounded-lg border border-gray-200 bg-white shadow-xl p-3 pointer-events-none"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-snug">{hoverRow.row.data.title}</p>
              </div>
              {typeof hoverRow.row.data.progress === 'number' && (
                <span className="text-xs font-medium text-gray-700 tabular-nums shrink-0">
                  {Math.round(hoverRow.row.data.progress)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mb-2 text-[11px] uppercase tracking-wide text-gray-500">
              {(() => {
                const v =
                  hoverRow.row.data.goalStatus ??
                  hoverRow.row.data.confidence ??
                  hoverRow.row.data.status
                if (!v) return <span>—</span>
                return (
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${STATUS_PILL[v] ?? 'bg-slate-100 text-slate-700'}`}
                  >
                    {String(v).replace(/_/g, ' ')}
                  </span>
                )
              })()}
              <span className="ml-auto text-[11px] text-gray-500">
                {hoverRow.row.kind === 'OBJ'
                  ? hoverRow.row.data.level
                  : hoverRow.row.kind === 'KR'
                    ? 'Key result'
                    : 'Initiative'}
              </span>
            </div>
            {typeof hoverRow.row.data.progress === 'number' && (
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-2">
                <div
                  className={
                    'h-full rounded-full ' +
                    (hoverRow.row.data.progress >= 70
                      ? 'bg-emerald-500'
                      : hoverRow.row.data.progress >= 30
                        ? 'bg-amber-500'
                        : 'bg-red-500')
                  }
                  style={{ width: `${Math.min(100, hoverRow.row.data.progress)}%` }}
                />
              </div>
            )}
            {hoverRow.row.data.owner && (
              <p className="text-xs text-gray-600">
                Owner: <span className="text-gray-800">{hoverRow.row.data.owner.name ?? '—'}</span>
              </p>
            )}
            {hoverRow.row.data.period && (
              <p className="text-xs text-gray-500">Period: {hoverRow.row.data.period.name}</p>
            )}
            {hoverRow.row.kind === 'KR' && (
              <p className="text-xs text-gray-500 mt-1">
                {hoverRow.row.data.currentValue} / {hoverRow.row.data.targetValue} {hoverRow.row.data.unit}
              </p>
            )}
          </div>,
          document.body,
        )}

      </div>
      {/* Detail drawer */}
      <SideDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.data.title ?? ''}
        width="lg"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <KindBadgeLarge row={selected} />
            <Field label="Path">{selected.path.join(' › ')}</Field>
            {typeof selected.data.progress === 'number' && (
              <Field label="Progress">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, selected.data.progress)}%` }} />
                  </div>
                  <span className="tabular-nums text-gray-700">{Math.round(selected.data.progress)}%</span>
                </div>
              </Field>
            )}
            {selected.data.goalStatus && <Field label="Status">{String(selected.data.goalStatus).replace(/_/g, ' ')}</Field>}
            {selected.data.confidence && <Field label="Confidence">{String(selected.data.confidence).replace(/_/g, ' ')}</Field>}
            {selected.data.owner && <Field label="Owner">{selected.data.owner.name ?? selected.data.owner.email}</Field>}
            {selected.data.team && <Field label="Team">{selected.data.team.name}</Field>}
            {selected.data.period && <Field label="Period">{selected.data.period.name}</Field>}
            {selected.kind === 'KR' && (
              <>
                <Field label="Start value">{selected.data.startValue} {selected.data.unit}</Field>
                <Field label="Current value">{selected.data.currentValue} {selected.data.unit}</Field>
                <Field label="Target value">{selected.data.targetValue} {selected.data.unit}</Field>
              </>
            )}
            <Field label="Expected start">{formatDate(selected.data.startDate)}</Field>
            <Field label="Expected end">{formatDate(selected.data.endDate ?? selected.data.dueDate)}</Field>
            <Field label="Grade">{computeGrade(selected.data.progress)}</Field>
            {selected.data.href && (
              <Link
                href={selected.data.href}
                className="inline-block mt-2 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
              >
                Open full page
              </Link>
            )}
          </div>
        )}
      </SideDrawer>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <div className="font-medium text-gray-900 mt-0.5">{children}</div>
    </div>
  )
}

function KindBadge({ row }: { row: Row }) {
  if (row.kind === 'OBJ') {
    const b = LEVEL_BADGE[row.data.level] ?? LEVEL_BADGE.INDIVIDUAL
    return (
      <span className={`h-5 w-5 rounded-sm text-[10px] font-bold flex items-center justify-center shrink-0 ${b.bg} ${b.fg}`}>
        {b.letter}
      </span>
    )
  }
  if (row.kind === 'KR') {
    return (
      <span className="h-5 px-1.5 rounded bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
        KR
      </span>
    )
  }
  return (
    <span className="h-5 w-5 rounded bg-emerald-500 text-white flex items-center justify-center shrink-0">
      <CheckSquare className="h-3 w-3" />
    </span>
  )
}

function ResizeHandle({ onStart }: { onStart: (x: number) => void }) {
  return (
    <div
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onStart(e.clientX)
      }}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none group-hover:bg-blue-200/60 hover:bg-blue-400/80 transition-colors"
      title="Drag to resize"
    />
  )
}

function TabButton({
  label, active, count, disabled, title, onClick,
}: {
  label: string
  active: boolean
  count?: number | null
  disabled?: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-selected={active}
      className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
      } ${disabled ? 'opacity-40 cursor-not-allowed hover:text-gray-600 hover:border-transparent' : ''}`}
    >
      {label}
      {count != null && count > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

function KindBadgeLarge({ row }: { row: Row }) {
  return (
    <div className="inline-flex items-center gap-2">
      <KindBadge row={row} />
      <span className="text-xs uppercase tracking-wide text-gray-500">
        {row.kind === 'OBJ' ? `${row.data.level?.toLowerCase()} objective` : row.kind === 'KR' ? 'Key result' : 'Initiative'}
      </span>
    </div>
  )
}
