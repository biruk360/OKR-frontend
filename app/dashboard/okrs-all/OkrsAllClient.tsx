'use client'

/**
 * OKR Explorer — consolidated view over Plans / Company OKRs / Department OKRs /
 * Objectives. Apple Pro list interior.
 * Two view modes: Compact rows (default) and Rich cards.
 * Filter strip: Timeframe + Department + Level + Status + Search.
 * Preserves: KPI cards, tabs (All/Watched/My/At risk), hide finished,
 * role-aware Create menu, initiatives roll-up, favorites.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  Search,
  X,
  Plus,
  Star,
  Calendar,
  Building2,
  Target,
  CheckSquare,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import SideDrawer from '@/components/ui/SideDrawer'
import { StatCard, StatGrid } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import StatusPill, { LevelBadge, normalizeStatus, PaceChip } from '@/components/shared/StatusPill'
import { useInitiativeDetailStore } from '@/lib/stores/initiative-detail-store'
import { useOkrFavoritesStore } from '@/lib/stores/okr-favorites-store'
import {
  CreateCompanyObjectiveButton,
  CreateDepartmentObjectiveButton,
  CreateIndividualObjectiveButton,
} from '@/features/objectives'

interface CurrentUser {
  id: string
  role: 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE'
}

type Tab = 'all' | 'watched' | 'mine' | 'atRisk'
type ViewMode = 'compact' | 'rich'
type SortKey = 'title' | 'progress' | 'owner' | 'period' | 'status'
type SortDir = 'asc' | 'desc'

/* ----------------------------- Types --------------------------------- */

interface RefUser { id: string; name: string | null; email: string; avatar?: string | null }
interface RefTeam { id: string; name: string }
interface RefLabel { id: string; name: string; color: string }
interface RefTimeframe { id: string; name: string; startDate: string; endDate: string; type?: string | null }

interface Row {
  path: string[]
  rowId: string
  kind: 'OBJ' | 'KR' | 'INIT'
  parentRowId: string | null
  data: Record<string, any>
}

interface Refs { timeframes: RefTimeframe[]; owners: RefUser[]; teams: RefTeam[]; labels: RefLabel[] }

interface ApiResponse { success: boolean; data: { rows: Row[]; refs: Refs } }

interface Filters {
  period: string[]
  team: string[]
  type: string[]
  status: string[]
  q: string
}

const EMPTY_FILTERS: Filters = { period: [], team: [], type: [], status: [], q: '' }

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

function filtersToQuery(f: Filters): string {
  const sp = new URLSearchParams()
  for (const v of f.period) sp.append('period', v)
  for (const v of f.team) sp.append('team', v)
  for (const v of f.type) sp.append('type', v)
  for (const v of f.status) sp.append('status', v)
  if (f.q) sp.set('q', f.q)
  return sp.toString()
}

function daysSince(d: string | Date | null | undefined): number | null {
  if (!d) return null
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return null
  return Math.floor((Date.now() - date.getTime()) / (24 * 3600 * 1000))
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function initialsOf(name: string | null | undefined): string {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function statusOf(row: Row): string {
  return normalizeStatus(row.data.goalStatus ?? row.data.confidence ?? row.data.status)
}

function progressColor(status: string): string {
  if (status === 'on-track' || status === 'completed' || status === 'in-progress') return 'var(--ap-green)'
  if (status === 'at-risk') return 'var(--ap-orange)'
  if (status === 'off-track') return 'var(--ap-red)'
  return 'var(--ap-fg-muted)'
}

function ProgressBar({ value, status, width = 120 }: { value: number; status: string; width?: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-2" style={{ width }}>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ap-kr-bar-bg)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: progressColor(status) }} />
      </div>
      <span className="text-[12px] font-semibold tabular-nums w-9 text-right">{Math.round(pct)}%</span>
    </div>
  )
}

function Avatar({ user, size = 22 }: { user: RefUser | null | undefined; size?: number }) {
  if (!user) {
    return (
      <span className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold"
        style={{ width: size, height: size, background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}>?</span>
    )
  }
  const initial = initialsOf(user.name ?? user.email)
  if (user.avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatar} alt={user.name ?? ''} title={user.name ?? user.email}
      className="rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span title={user.name ?? user.email}
      className="inline-flex items-center justify-center rounded-full text-white font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)), background: 'var(--ap-accent)' }}>
      {initial}
    </span>
  )
}

function KindIcon({ row }: { row: Row }) {
  if (row.kind === 'OBJ') {
    return (
      <span className="inline-flex items-center justify-center rounded-[6px]"
        style={{ width: 22, height: 22, background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}>
        <Target className="size-3" />
      </span>
    )
  }
  if (row.kind === 'KR') {
    return (
      <span className="inline-flex items-center justify-center rounded-[6px] text-[9px] font-bold"
        style={{ width: 22, height: 22, background: 'rgba(255,149,0,0.14)', color: 'var(--ap-orange)' }}>
        KR
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center rounded-[6px]"
      style={{ width: 22, height: 22, background: 'rgba(52,199,89,0.14)', color: 'var(--ap-green)' }}>
      <CheckSquare className="size-3" />
    </span>
  )
}

/* --------------------------- Filter widgets --------------------------- */

function MultiPill<T extends { id: string; label?: string; name?: string }>({
  label, options, selected, onChange,
}: {
  label: string
  options: T[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const active = selected.length > 0
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-[10px] px-2.5 h-8 text-[12px] font-medium border transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
        style={{
          borderColor: active ? 'var(--ap-accent)' : 'var(--ap-border)',
          background: active ? 'var(--ap-accent-soft)' : 'var(--ap-bg)',
        }}
      >
        {label}
        {active && (
          <span className="inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums"
            style={{ background: 'var(--ap-accent)', color: 'white', minWidth: 16 }}>
            {selected.length}
          </span>
        )}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div
          className="absolute z-30 top-full left-0 mt-1 w-64 rounded-[14px] border bg-card shadow-lg overflow-hidden"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <div className="px-3 py-2 border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            style={{ borderColor: 'var(--ap-border)' }}>
            {label}
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {options.length === 0 && <li className="px-3 py-2 text-[12px] text-muted-foreground">No options</li>}
            {options.map(o => {
              const checked = selected.includes(o.id)
              return (
                <li key={o.id}>
                  <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[var(--ap-bg-sunken)]">
                    <input type="checkbox" checked={checked}
                      onChange={() => onChange(checked ? selected.filter(x => x !== o.id) : [...selected, o.id])}
                      className="h-3.5 w-3.5" />
                    <span className="text-[13px] truncate">{o.label ?? o.name}</span>
                  </label>
                </li>
              )
            })}
          </ul>
          {selected.length > 0 && (
            <div className="border-t px-3 py-2 text-right" style={{ borderColor: 'var(--ap-border)' }}>
              <button type="button" className="text-[11px] text-[var(--ap-accent)] hover:underline" onClick={() => onChange([])}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* --------------------------- Tab/Tab visuals --------------------------- */

function TabButton({
  label, active, count, onClick,
}: { label: string; active: boolean; count?: number | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 h-9 rounded-[10px] text-[13px] font-medium transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
      style={{ background: active ? 'var(--ap-bg-sunken)' : 'transparent' }}
    >
      {label}
      {count != null && count > 0 && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            background: active ? 'var(--ap-accent-soft)' : 'var(--ap-bg-sunken)',
            color: active ? 'var(--ap-accent)' : 'var(--ap-fg-muted)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/* --------------------------- Tab + filter helpers --------------------------- */

function matchesTab(row: Row, tab: Tab, currentUser: CurrentUser): boolean {
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

function matchesHideFinished(row: Row, hideFinished: boolean): boolean {
  if (!hideFinished) return true
  if (row.kind === 'INIT') return row.data.status !== 'COMPLETED' && row.data.status !== 'CANCELLED'
  if (typeof row.data.progress === 'number' && row.data.progress >= 100) return false
  if (row.data.goalStatus === 'CLOSED') return false
  return true
}

function matchesStatus(row: Row, statusFilter: string[]): boolean {
  if (statusFilter.length === 0) return true
  const v = row.data.goalStatus ?? row.data.confidence ?? row.data.status
  return v ? statusFilter.includes(v) : false
}

/* ------------------------------- Rows ------------------------------- */

function CompactRow({
  row, idx, density, onOpen, currentUser, favoriteIds, toggleFavorite,
  selected, onToggleSelect,
}: {
  row: Row
  idx: number
  density: 'compact' | 'rich'
  onOpen: () => void
  currentUser: CurrentUser
  favoriteIds: Set<string>
  toggleFavorite: (id: string) => void
  selected: boolean
  onToggleSelect: () => void
}) {
  const status = statusOf(row)
  const progress = typeof row.data.progress === 'number' ? row.data.progress : 0
  const owner: RefUser | null = row.data.owner ?? null
  const idCode = String(row.data.id ?? row.rowId).slice(-6).toUpperCase()
  const title: string = row.data.title ?? ''
  const period = row.data.period?.name
  const initTotal = (row.data.__initTotal ?? 0) as number
  const initClosed = (row.data.__initClosed ?? 0) as number

  return (
    <div
      onClick={onOpen}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 border-b transition-colors cursor-pointer hover:bg-[var(--ap-bg-hover,var(--ap-bg-sunken))]',
        selected && 'bg-[var(--ap-accent-soft)]',
      )}
      style={{ borderColor: 'var(--ap-border-soft, var(--ap-border))' }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        className="h-3.5 w-3.5 shrink-0"
      />
      <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">{String(idx + 1).padStart(2, '0')}</span>
      <KindIcon row={row} />
      {row.kind === 'OBJ' && <LevelBadge level={row.data.level} />}
      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">{idCode}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium truncate" title={title}>{title}</p>
        {period && (
          <p className="text-[11px] text-muted-foreground truncate">{period}</p>
        )}
      </div>
      <div className="hidden md:block shrink-0">
        <StatusPill status={status} size="xs" />
      </div>
      <div className="hidden lg:block shrink-0">
        {initTotal > 0 && (
          <span
            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            style={{
              background: initTotal === initClosed ? 'rgba(52,199,89,0.12)' : 'var(--ap-bg-sunken)',
              color: initTotal === initClosed ? 'var(--ap-green)' : 'var(--ap-fg-muted)',
            }}
          >
            {initClosed}/{initTotal}
          </span>
        )}
      </div>
      <div className="shrink-0">
        <ProgressBar value={progress} status={status} width={140} />
      </div>
      <div className="shrink-0">
        <Avatar user={owner} size={22} />
      </div>
      {row.kind === 'OBJ' && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleFavorite(row.data.id) }}
          className="shrink-0 text-muted-foreground hover:text-yellow-500"
          aria-label={favoriteIds.has(row.data.id) ? 'Unfavorite' : 'Favorite'}
        >
          <Star className={cn('h-3.5 w-3.5', favoriteIds.has(row.data.id) && 'fill-yellow-400 text-yellow-500')} />
        </button>
      )}
    </div>
  )
}

function RichCard({
  row, onOpen, favoriteIds, toggleFavorite, selected, onToggleSelect,
}: {
  row: Row
  onOpen: () => void
  favoriteIds: Set<string>
  toggleFavorite: (id: string) => void
  selected: boolean
  onToggleSelect: () => void
}) {
  const status = statusOf(row)
  const progress = typeof row.data.progress === 'number' ? row.data.progress : 0
  const owner: RefUser | null = row.data.owner ?? null
  const collaborators: RefUser[] = row.data.collaborators ?? []
  const idCode = String(row.data.id ?? row.rowId).slice(-6).toUpperCase()
  const title: string = row.data.title ?? ''
  const description: string | undefined = row.data.description
  const period = row.data.period?.name
  const krCount = row.data.keyResultCount ?? row.data.krCount ?? 0
  const due = row.data.endDate ?? row.data.dueDate

  return (
    <div
      onClick={onOpen}
      className={cn(
        'group rounded-[14px] border bg-card px-4 py-3 cursor-pointer transition-all hover:shadow-md hover:-translate-y-px',
        selected && 'ring-2',
      )}
      style={{
        borderColor: selected ? 'var(--ap-accent)' : 'var(--ap-border)',
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5"
        />
        <KindIcon row={row} />
        {row.kind === 'OBJ' && <LevelBadge level={row.data.level} />}
        {row.kind === 'KR' && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: 'rgba(255,149,0,0.14)', color: 'var(--ap-orange)' }}>
            Key Result
          </span>
        )}
        {row.kind === 'INIT' && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: 'rgba(52,199,89,0.14)', color: 'var(--ap-green)' }}>
            Initiative
          </span>
        )}
        <span className="text-[10px] tabular-nums text-muted-foreground">{idCode}</span>
        {period && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
            style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}>
            <Calendar className="size-2.5" />{period}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <StatusPill status={status} size="xs" />
          {row.kind === 'OBJ' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleFavorite(row.data.id) }}
              className="text-muted-foreground hover:text-yellow-500"
              aria-label={favoriteIds.has(row.data.id) ? 'Unfavorite' : 'Favorite'}
            >
              <Star className={cn('h-3.5 w-3.5', favoriteIds.has(row.data.id) && 'fill-yellow-400 text-yellow-500')} />
            </button>
          )}
        </div>
      </div>

      <p className="text-[15px] font-semibold leading-tight" style={{ letterSpacing: '-0.01em' }}>
        {title}
      </p>
      {description && (
        <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2" style={{ textWrap: 'pretty' } as any}>
          {description}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5 max-w-[180px]">
          <Avatar user={owner} size={20} />
          <span className="truncate text-[12px]" style={{ color: 'var(--ap-fg-muted)' }}>
            {owner?.name ?? owner?.email ?? 'Unassigned'}
          </span>
        </div>
        {collaborators.length > 0 && (
          <>
            <span className="hidden sm:inline-block h-3 w-px" style={{ background: 'var(--ap-border)' }} />
            <div className="flex items-center -space-x-1.5">
              {collaborators.slice(0, 4).map(u => (
                <span key={u.id} className="ring-2 ring-card rounded-full">
                  <Avatar user={u} size={18} />
                </span>
              ))}
              {collaborators.length > 4 && (
                <span className="ring-2 ring-card inline-flex items-center justify-center rounded-full text-[9px] font-semibold"
                  style={{ width: 18, height: 18, background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}>
                  +{collaborators.length - 4}
                </span>
              )}
            </div>
          </>
        )}
        {row.data.team && (
          <>
            <span className="hidden sm:inline-block h-3 w-px" style={{ background: 'var(--ap-border)' }} />
            <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
              <Building2 className="size-3" />
              <span className="truncate max-w-[120px]">{row.data.team.name}</span>
            </span>
          </>
        )}
        {row.kind === 'OBJ' && krCount > 0 && (
          <>
            <span className="hidden sm:inline-block h-3 w-px" style={{ background: 'var(--ap-border)' }} />
            <span className="text-[11px] tabular-nums text-muted-foreground">{krCount} KR{krCount !== 1 ? 's' : ''}</span>
          </>
        )}
        {due && (
          <>
            <span className="hidden sm:inline-block h-3 w-px" style={{ background: 'var(--ap-border)' }} />
            <span className="text-[11px] text-muted-foreground tabular-nums">Due {formatDate(due)}</span>
          </>
        )}
        <div className="ml-auto">
          <ProgressBar value={progress} status={status} width={160} />
        </div>
      </div>
    </div>
  )
}

/* --------------------------- Sortable header --------------------------- */

function SortHeader({
  label, sortKey, sort, onSort, className,
}: {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; dir: SortDir } | null
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sort?.key === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide hover:text-foreground',
        active ? 'text-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      {label}
      {active
        ? (sort?.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)
        : <ArrowUpDown className="size-3 opacity-50" />}
    </button>
  )
}

/* --------------------------- Main component --------------------------- */

export default function OkrsAllClient({ currentUser }: { currentUser: CurrentUser }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [rows, setRows] = useState<Row[]>([])
  const [refs, setRefs] = useState<Refs>({ timeframes: [], owners: [], teams: [], labels: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Row | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [hideFinished, setHideFinished] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [view, setView] = useState<ViewMode>('compact')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50
  const router = useRouter()

  const { ids: favoriteIds, load: loadFavorites, toggle: toggleFavorite } = useOkrFavoritesStore()
  useEffect(() => { loadFavorites() }, [loadFavorites])

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
    } catch (err: any) {
      setError(err.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(filters) }, [fetchData, filters])
  useEffect(() => { setPage(1) }, [filters, tab, hideFinished, view])

  // Initiative roll-up enrichment (preserved from original).
  const enrichedRows = useMemo<Row[]>(() => {
    if (rows.length === 0) return rows
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
      for (const cid of childIds.get(rowId) ?? []) {
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
    return rows.map(r => {
      if (r.kind === 'OBJ' || r.kind === 'KR') {
        const { total, closed } = countInits(r.rowId)
        return { ...r, data: { ...r.data, __initTotal: total, __initClosed: closed } }
      }
      if (r.kind === 'INIT') {
        return { ...r, data: { ...r.data, __initTotal: 1, __initClosed: r.data.status === 'COMPLETED' ? 1 : 0 } }
      }
      return r
    })
  }, [rows])

  const watchedDescendantOf = useMemo(() => {
    const set = new Set<string>()
    if (tab !== 'watched') return set
    const childIds = new Map<string, string[]>()
    for (const r of enrichedRows) {
      if (r.parentRowId) {
        if (!childIds.has(r.parentRowId)) childIds.set(r.parentRowId, [])
        childIds.get(r.parentRowId)!.push(r.rowId)
      }
    }
    const markDesc = (rowId: string): void => {
      for (const cid of childIds.get(rowId) ?? []) {
        set.add(cid)
        markDesc(cid)
      }
    }
    for (const r of enrichedRows) {
      if (r.kind === 'OBJ' && favoriteIds.has(r.data.id)) markDesc(r.rowId)
    }
    return set
  }, [enrichedRows, tab, favoriteIds])

  const filteredRows = useMemo<Row[]>(() => {
    return enrichedRows.filter(r => {
      let tabOk = matchesTab(r, tab, currentUser)
      if (tab === 'watched') {
        const isOwnFav = r.kind === 'OBJ' && favoriteIds.has(r.data.id)
        tabOk = isOwnFav || watchedDescendantOf.has(r.rowId)
      }
      return tabOk && matchesHideFinished(r, hideFinished) && matchesStatus(r, filters.status)
    })
  }, [enrichedRows, tab, hideFinished, currentUser, favoriteIds, watchedDescendantOf, filters.status])

  // Show only OBJ + KR rows in the list view (initiatives appear via roll-up
  // chip and the global initiative drawer).
  const listRows = useMemo<Row[]>(() => {
    return filteredRows.filter(r => r.kind === 'OBJ' || r.kind === 'KR')
  }, [filteredRows])

  const sortedRows = useMemo<Row[]>(() => {
    if (!sort) return listRows
    const arr = [...listRows]
    const dir = sort.dir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      let av: any, bv: any
      switch (sort.key) {
        case 'title': av = a.data.title ?? ''; bv = b.data.title ?? ''; break
        case 'progress': av = a.data.progress ?? 0; bv = b.data.progress ?? 0; break
        case 'owner': av = a.data.owner?.name ?? ''; bv = b.data.owner?.name ?? ''; break
        case 'period': av = a.data.period?.name ?? ''; bv = b.data.period?.name ?? ''; break
        case 'status': av = statusOf(a); bv = statusOf(b); break
      }
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
    return arr
  }, [listRows, sort])

  const pagedRows = useMemo(() => sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [sortedRows, page])
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))

  const kpis = useMemo(() => {
    let objs = 0, krs = 0, inits = 0, initsClosed = 0
    let progSum = 0, progCount = 0
    let atRisk = 0
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
    }
    const avgProgress = progCount > 0 ? Math.round(progSum / progCount) : 0
    return { objs, krs, inits, initsClosed, avgProgress, atRisk }
  }, [filteredRows])

  const clearFilters = () => setFilters(EMPTY_FILTERS)
  const activeFilterCount = filters.period.length + filters.team.length + filters.type.length + filters.status.length + (filters.q ? 1 : 0)

  const role = currentUser.role
  const canCreateCompany = role === 'ADMIN' || role === 'EXECUTIVE'
  const canCreateDepartment = canCreateCompany || role === 'DEPARTMENT_LEAD'

  const onSort = (key: SortKey) => {
    setSort(cur => {
      if (cur?.key === key) return { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
      return { key, dir: 'asc' }
    })
  }

  const openRow = useCallback((row: Row) => {
    if (row.kind === 'INIT') { useInitiativeDetailStore.getState().open(row.data.id); return }
    if (row.data.href) { router.push(row.data.href); return }
    setSelected(row)
  }, [router])

  const toggleBulk = (rowId: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId)
      return next
    })
  }
  const allOnPageSelected = pagedRows.length > 0 && pagedRows.every(r => bulkSelected.has(r.rowId))
  const toggleAllOnPage = () => {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (allOnPageSelected) {
        for (const r of pagedRows) next.delete(r.rowId)
      } else {
        for (const r of pagedRows) next.add(r.rowId)
      }
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <StatGrid columns={5}>
        <StatCard label="Objectives" value={kpis.objs} iconText="O" tone="blue" />
        <StatCard label="Key Results" value={kpis.krs} iconText="KR" tone="green" />
        <StatCard label="Initiatives" value={`${kpis.initsClosed}/${kpis.inits}`} iconText="✓" tone="purple" />
        <StatCard label="Avg Progress" value={`${kpis.avgProgress}%`} iconText="%" tone="yellow" />
        <StatCard label="At Risk" value={kpis.atRisk} iconText="!" tone={kpis.atRisk > 0 ? 'red' : 'blue'} />
      </StatGrid>

      {/* Tabs + Create */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <TabButton label="All" active={tab === 'all'} onClick={() => setTab('all')} />
          <TabButton label="Watched" active={tab === 'watched'} onClick={() => setTab('watched')} count={favoriteIds.size || null} />
          <TabButton label="My OKRs" active={tab === 'mine'} onClick={() => setTab('mine')} />
          <TabButton label="At risk" active={tab === 'atRisk'} onClick={() => setTab('atRisk')} count={kpis.atRisk || null} />
        </div>

        <div className="relative">
          <Button
            type="button"
            onClick={() => setCreateOpen(o => !o)}
            size="sm"
            className="h-9 rounded-[10px] text-[13px] gap-1"
          >
            <Plus className="h-4 w-4" /> Create
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {createOpen && (
            <>
              <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onClick={() => setCreateOpen(false)} />
              <div
                className="absolute right-0 top-full z-50 mt-1 w-56 rounded-[14px] border bg-card p-1 shadow-lg"
                style={{ borderColor: 'var(--ap-border)' }}
              >
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

      <div className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        {/* Filter strip */}
        <div
          className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5"
          style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
        >
          <div
            className="flex items-center gap-1.5 rounded-[10px] border px-2 h-8 w-72 bg-card"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Search OKR title…"
              className="w-full text-[13px] focus:outline-none bg-transparent"
            />
            {filters.q && (
              <button type="button" onClick={() => setFilters({ ...filters, q: '' })} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <MultiPill
            label="Timeframe"
            options={refs.timeframes.map(t => ({ id: t.id, label: t.name }))}
            selected={filters.period}
            onChange={(next) => setFilters({ ...filters, period: next })}
          />
          <MultiPill
            label="Department"
            options={refs.teams.map(t => ({ id: t.id, label: t.name }))}
            selected={filters.team}
            onChange={(next) => setFilters({ ...filters, team: next })}
          />
          <MultiPill label="Level" options={TYPE_OPTIONS} selected={filters.type}
            onChange={(next) => setFilters({ ...filters, type: next })} />
          <MultiPill label="Status" options={STATUS_OPTIONS} selected={filters.status}
            onChange={(next) => setFilters({ ...filters, status: next })} />

          <label className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground ml-1">
            <input
              type="checkbox"
              checked={hideFinished}
              onChange={(e) => setHideFinished(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Hide finished
          </label>

          <div className="ml-auto flex items-center gap-2">
            {/* View toggle */}
            <div
              className="inline-flex items-center rounded-[10px] p-0.5 text-[11px] font-medium"
              style={{ background: 'var(--ap-bg)' }}
            >
              <button
                type="button"
                onClick={() => setView('compact')}
                className={cn(
                  'px-2.5 py-1 rounded-[8px] transition-colors',
                  view === 'compact' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Compact rows
              </button>
              <button
                type="button"
                onClick={() => setView('rich')}
                className={cn(
                  'px-2.5 py-1 rounded-[8px] transition-colors',
                  view === 'rich' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Rich cards
              </button>
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[12px] text-[var(--ap-accent)] hover:underline"
              >
                Clear {activeFilterCount}
              </button>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {bulkSelected.size > 0 && (
          <div
            className="flex items-center gap-3 px-3 py-2 border-b text-[12px]"
            style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
          >
            <span className="font-semibold tabular-nums">{bulkSelected.size} selected</span>
            <button type="button" onClick={() => setBulkSelected(new Set())} className="hover:underline">Clear</button>
            <span className="ml-auto text-muted-foreground">Bulk actions are coming soon.</span>
          </div>
        )}

        {/* Sort header (compact only) */}
        {view === 'compact' && pagedRows.length > 0 && (
          <div
            className="grid items-center gap-3 px-3 py-2 border-b"
            style={{
              borderColor: 'var(--ap-border)',
              background: 'var(--ap-bg-sunken)',
              gridTemplateColumns: 'auto 28px 22px auto auto minmax(0,1fr) auto auto auto auto auto',
            }}
          >
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={toggleAllOnPage}
              className="h-3.5 w-3.5"
              aria-label="Select all"
            />
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <SortHeader label="Title" sortKey="title" sort={sort} onSort={onSort} />
            <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} className="hidden md:inline-flex" />
            <span className="hidden lg:block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Init</span>
            <SortHeader label="Progress" sortKey="progress" sort={sort} onSort={onSort} />
            <SortHeader label="Owner" sortKey="owner" sort={sort} onSort={onSort} />
            <span></span>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="p-10 text-[13px] text-muted-foreground text-center">Loading…</div>
        ) : error ? (
          <div className="p-10 text-[13px] text-[var(--ap-red)] text-center">{error}</div>
        ) : pagedRows.length === 0 ? (
          <div className="p-10 text-center">
            <Target className="mx-auto size-8 mb-2 text-muted-foreground/60" />
            <p className="text-[13px] font-medium">No OKRs match these filters</p>
            <p className="text-[12px] text-muted-foreground mt-1">Try adjusting your filters.</p>
          </div>
        ) : view === 'compact' ? (
          <div>
            {pagedRows.map((row, idx) => (
              <CompactRow
                key={row.rowId}
                row={row}
                idx={(page - 1) * PAGE_SIZE + idx}
                density="compact"
                onOpen={() => openRow(row)}
                currentUser={currentUser}
                favoriteIds={favoriteIds}
                toggleFavorite={toggleFavorite}
                selected={bulkSelected.has(row.rowId)}
                onToggleSelect={() => toggleBulk(row.rowId)}
              />
            ))}
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {pagedRows.map((row) => (
              <RichCard
                key={row.rowId}
                row={row}
                onOpen={() => openRow(row)}
                favoriteIds={favoriteIds}
                toggleFavorite={toggleFavorite}
                selected={bulkSelected.has(row.rowId)}
                onToggleSelect={() => toggleBulk(row.rowId)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {sortedRows.length > PAGE_SIZE && (
          <div
            className="flex items-center justify-between px-3 py-2.5 border-t text-[12px]"
            style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
          >
            <span className="text-muted-foreground tabular-nums">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedRows.length)} of {sortedRows.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 h-7 rounded-[8px] border disabled:opacity-40 hover:bg-card"
                style={{ borderColor: 'var(--ap-border)' }}
              >
                Prev
              </button>
              <span className="tabular-nums text-muted-foreground">{page} / {pageCount}</span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
                className="px-2 h-7 rounded-[8px] border disabled:opacity-40 hover:bg-card"
                style={{ borderColor: 'var(--ap-border)' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <SideDrawer open={!!selected} onClose={() => setSelected(null)} title={selected?.data.title ?? ''} width="lg">
        {selected && (
          <div className="space-y-4 text-[13px]">
            <div className="flex items-center gap-2">
              <KindIcon row={selected} />
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {selected.kind === 'OBJ' ? `${selected.data.level?.toLowerCase()} objective`
                  : selected.kind === 'KR' ? 'Key result' : 'Initiative'}
              </span>
              <div className="ml-auto"><StatusPill status={statusOf(selected)} /></div>
            </div>
            <Field label="Path">{selected.path.join(' › ')}</Field>
            {typeof selected.data.progress === 'number' && (
              <Field label="Progress">
                <ProgressBar value={selected.data.progress} status={statusOf(selected)} width={240} />
              </Field>
            )}
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
            {selected.data.href && (
              <Link href={selected.data.href} className="inline-block">
                <Button size="sm" className="h-8 rounded-[10px] text-[12px]">Open full page</Button>
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
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-[13px]">{children}</div>
    </div>
  )
}
