'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Plus,
  Calendar,
  Building2,
  Users as UsersIcon,
  Target,
  CheckSquare,
} from 'lucide-react'
import SideDrawer from '@/components/ui/SideDrawer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import StatusPill, { LevelBadge, normalizeStatus } from '@/components/shared/StatusPill'
import { useInitiativeDetailStore } from '@/lib/stores/initiative-detail-store'

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
  q: string
}

const EMPTY_FILTERS: Filters = { period: [], team: [], type: [], q: '' }

const TYPE_OPTIONS = [
  { id: 'COMPANY', label: 'Company' },
  { id: 'DEPARTMENT', label: 'Department' },
  { id: 'INDIVIDUAL', label: 'Individual' },
]

function filtersToQuery(f: Filters): string {
  const sp = new URLSearchParams()
  for (const v of f.period) sp.append('period', v)
  for (const v of f.team) sp.append('team', v)
  for (const v of f.type) sp.append('type', v)
  if (f.q) sp.set('q', f.q)
  return sp.toString()
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
  const v = row.data.goalStatus ?? row.data.confidence ?? row.data.status
  return normalizeStatus(v)
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
      <span
        className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold"
        style={{ width: size, height: size, background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
      >?</span>
    )
  }
  const initial = initialsOf(user.name ?? user.email)
  if (user.avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatar} alt={user.name ?? ''} title={user.name ?? user.email}
      className="rounded-full object-cover"
      style={{ width: size, height: size }} />
  }
  return (
    <span
      title={user.name ?? user.email}
      className="inline-flex items-center justify-center rounded-full text-white font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)), background: 'var(--ap-accent)' }}
    >{initial}</span>
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

/* ----------------------- Tree / flatten ----------------------- */

interface TreeNode extends Row { children: TreeNode[] }

function buildTree(rows: Row[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  rows.forEach(r => map.set(r.rowId, { ...r, children: [] }))
  const roots: TreeNode[] = []
  map.forEach(node => {
    if (node.parentRowId && map.has(node.parentRowId)) {
      map.get(node.parentRowId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

interface FlatNode extends TreeNode { depth: number; isLast: boolean; ancestorLast: boolean[] }

function flatten(nodes: TreeNode[], expanded: Set<string>, depth = 0, ancestorLast: boolean[] = [], out: FlatNode[] = []): FlatNode[] {
  nodes.forEach((n, idx) => {
    const isLast = idx === nodes.length - 1
    out.push({ ...n, depth, isLast, ancestorLast })
    if (expanded.has(n.rowId) && n.children.length > 0) {
      flatten(n.children, expanded, depth + 1, [...ancestorLast, isLast], out)
    }
  })
  return out
}

/* --------------------------- Segmented control --------------------------- */

function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void
}) {
  return (
    <div
      className="inline-flex items-center rounded-[10px] p-0.5 text-[11px] font-medium"
      style={{ background: 'var(--ap-bg-sunken)' }}
    >
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            'px-2.5 py-1 rounded-[8px] transition-colors',
            value === opt.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

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
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onChange(checked ? selected.filter(x => x !== o.id) : [...selected, o.id])}
                      className="h-3.5 w-3.5"
                    />
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

/* --------------------------- Highlight matches --------------------------- */

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const i = text.toLowerCase().indexOf(query.toLowerCase())
  if (i === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded px-0.5" style={{ background: 'rgba(255,204,0,0.35)', color: 'inherit' }}>
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  )
}

/* ------------------------------- Card --------------------------------- */

const INDENT_PX = 24

function NodeCard({
  node, expanded, hasKids, onToggle, onOpen, onAddChild, query, focused,
}: {
  node: FlatNode
  expanded: boolean
  hasKids: boolean
  onToggle: () => void
  onOpen: () => void
  onAddChild: () => void
  query: string
  focused: boolean
}) {
  const status = statusOf(node)
  const progress = typeof node.data.progress === 'number' ? node.data.progress : 0
  const krCount = node.data.keyResultCount ?? node.data.krCount ?? (node.kind === 'OBJ' ? (node.children?.filter((c: any) => c.kind === 'KR').length ?? 0) : 0)
  const collaborators: RefUser[] = node.data.collaborators ?? []
  const owner: RefUser | null = node.data.owner ?? null
  const title: string = node.data.title ?? ''
  const idCode = String(node.data.id ?? node.rowId).slice(-6).toUpperCase()
  const period = node.data.period?.name

  return (
    <div
      role="treeitem"
      aria-expanded={hasKids ? expanded : undefined}
      aria-selected={focused}
      tabIndex={focused ? 0 : -1}
      onClick={onOpen}
      onKeyDown={() => {}}
      className={cn(
        'group relative flex items-start gap-2 rounded-[14px] border bg-card px-3 py-3 transition-all cursor-pointer',
        'hover:shadow-md hover:-translate-y-px',
        focused && 'ring-2 ring-offset-1',
      )}
      style={{
        borderColor: focused ? 'var(--ap-accent)' : 'var(--ap-border)',
      }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (hasKids) onToggle() }}
        className={cn(
          'shrink-0 mt-0.5 inline-flex size-5 items-center justify-center rounded hover:bg-muted',
          !hasKids && 'invisible',
        )}
        aria-label={expanded ? 'Collapse' : 'Expand'}
      >
        {expanded
          ? <ChevronDown className="size-3.5 text-muted-foreground" />
          : <ChevronRight className="size-3.5 text-muted-foreground" />}
      </button>

      <KindIcon row={node} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {node.kind === 'OBJ' && <LevelBadge level={node.data.level} />}
          {node.kind === 'KR' && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: 'rgba(255,149,0,0.14)', color: 'var(--ap-orange)' }}>
              Key Result
            </span>
          )}
          {node.kind === 'INIT' && (
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
          </div>
        </div>

        <div
          className="block text-[14px] font-semibold leading-snug truncate"
          style={{ letterSpacing: '-0.01em' }}
          title={title}
        >
          <Highlight text={title} query={query} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-1.5 max-w-[160px]">
            <Avatar user={owner} size={20} />
            <span className="truncate text-[12px]" style={{ color: 'var(--ap-fg-muted)' }}>
              {owner?.name ?? owner?.email ?? 'Unassigned'}
            </span>
          </div>
          {node.data.team && (
            <>
              <span className="hidden sm:inline-block h-3 w-px" style={{ background: 'var(--ap-border)' }} />
              <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                <Building2 className="size-3" />
                <span className="truncate max-w-[120px]">{node.data.team.name}</span>
              </span>
            </>
          )}
          {node.kind === 'OBJ' && krCount > 0 && (
            <>
              <span className="hidden sm:inline-block h-3 w-px" style={{ background: 'var(--ap-border)' }} />
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
              >
                <UsersIcon className="size-2.5" />
                {krCount} KR{krCount !== 1 ? 's' : ''}
              </span>
            </>
          )}
          {collaborators.length > 0 && (
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
          )}
          <div className="ml-auto">
            <ProgressBar value={progress} status={status} />
          </div>
        </div>
      </div>

      {node.kind === 'OBJ' && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddChild() }}
          title="Add child objective"
          aria-label="Add child objective"
          className="shrink-0 ml-1 mt-0.5 inline-flex size-6 items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
        >
          <Plus className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/* --------------------------- Main component -------------------------- */

export default function OkrHierarchyTable() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [rows, setRows] = useState<Row[]>([])
  const [refs, setRefs] = useState<Refs>({ timeframes: [], owners: [], teams: [], labels: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Row | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const router = useRouter()

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
      setExpanded((prev) => {
        if (prev.size > 0) return prev
        // Default 3 levels expanded
        const next = new Set<string>()
        const childMap = new Map<string, string[]>()
        for (const r of body.data.rows) {
          if (r.parentRowId) {
            if (!childMap.has(r.parentRowId)) childMap.set(r.parentRowId, [])
            childMap.get(r.parentRowId)!.push(r.rowId)
          }
        }
        const expandTo = (rowId: string, depth: number) => {
          if (depth >= 3) return
          next.add(rowId)
          for (const cid of childMap.get(rowId) ?? []) expandTo(cid, depth + 1)
        }
        for (const r of body.data.rows) {
          if (!r.parentRowId) expandTo(r.rowId, 0)
        }
        return next
      })
    } catch (err: any) {
      setError(err.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(filters) }, [fetchData, filters])

  const tree = useMemo(() => buildTree(rows), [rows])
  const flat = useMemo(() => flatten(tree, expanded), [tree, expanded])

  // Search filter on flat list — keep ancestors of matches
  const visible = useMemo(() => {
    if (!filters.q) return flat
    const q = filters.q.toLowerCase()
    const matchedRowIds = new Set<string>()
    const byId = new Map(rows.map(r => [r.rowId, r]))
    for (const r of rows) {
      if ((r.data.title ?? '').toLowerCase().includes(q)) {
        let cursor: string | null | undefined = r.rowId
        while (cursor) {
          matchedRowIds.add(cursor)
          cursor = byId.get(cursor)?.parentRowId ?? null
        }
      }
    }
    return flat.filter(n => matchedRowIds.has(n.rowId))
  }, [flat, filters.q, rows])

  const toggle = (rowId: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId)
      return next
    })
  const expandAll = () => setExpanded(new Set(rows.map(r => r.rowId)))
  const collapseAll = () => setExpanded(new Set())
  const clearFilters = () => setFilters(EMPTY_FILTERS)

  const activeFilterCount = filters.period.length + filters.team.length + filters.type.length + (filters.q ? 1 : 0)

  // Open row
  const openRow = useCallback((row: Row) => {
    if (row.kind === 'INIT') {
      useInitiativeDetailStore.getState().open(row.data.id)
      return
    }
    if (row.data.href) {
      router.push(row.data.href)
      return
    }
    setSelected(row)
  }, [router])

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (visible.length === 0) return
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const idx = Math.max(0, visible.findIndex(n => n.rowId === focusedId))
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = visible[Math.min(visible.length - 1, idx + 1)]
        if (next) setFocusedId(next.rowId)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const next = visible[Math.max(0, idx - 1)]
        if (next) setFocusedId(next.rowId)
      } else if (e.key === ' ') {
        e.preventDefault()
        const cur = visible[idx]
        if (cur && cur.children.length > 0) toggle(cur.rowId)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const cur = visible[idx]
        if (cur) openRow(cur)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, focusedId, openRow])

  return (
    <div className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
      {/* Toolbar */}
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
        <MultiPill
          label="Level"
          options={TYPE_OPTIONS}
          selected={filters.type}
          onChange={(next) => setFilters({ ...filters, type: next })}
        />

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Expand all
          </button>
          <span className="h-3 w-px" style={{ background: 'var(--ap-border)' }} />
          <button
            type="button"
            onClick={collapseAll}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Collapse all
          </button>
          {activeFilterCount > 0 && (
            <>
              <span className="h-3 w-px" style={{ background: 'var(--ap-border)' }} />
              <button
                type="button"
                onClick={clearFilters}
                className="text-[12px] text-[var(--ap-accent)] hover:underline"
              >
                Clear {activeFilterCount}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="p-3" role="tree">
        {loading ? (
          <div className="p-8 text-[13px] text-muted-foreground text-center">Loading…</div>
        ) : error ? (
          <div className="p-8 text-[13px] text-[var(--ap-red)] text-center">{error}</div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center">
            <Target className="mx-auto size-8 mb-2 text-muted-foreground/60" />
            <p className="text-[13px] font-medium">No OKRs found</p>
            <p className="text-[12px] text-muted-foreground mt-1">Try adjusting your filters or search.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((node) => {
              const indent = node.depth * INDENT_PX
              const hasKids = node.children.length > 0
              const isExpanded = expanded.has(node.rowId)
              return (
                <div key={node.rowId} className="relative" style={{ paddingLeft: indent }}>
                  {/* L-shape connectors for non-root nodes */}
                  {node.depth > 0 && (
                    <svg
                      aria-hidden="true"
                      className="absolute left-0 top-0 pointer-events-none"
                      style={{ width: indent, height: '100%' }}
                    >
                      {/* Vertical lines for each ancestor that isn't last */}
                      {node.ancestorLast.map((isLast, i) =>
                        isLast ? null : (
                          <line
                            key={i}
                            x1={i * INDENT_PX + 12}
                            x2={i * INDENT_PX + 12}
                            y1={0}
                            y2="100%"
                            stroke="var(--ap-border-strong, var(--ap-border))"
                            strokeWidth={1}
                          />
                        )
                      )}
                      {/* L-shape for this node */}
                      <line
                        x1={(node.depth - 1) * INDENT_PX + 12}
                        x2={(node.depth - 1) * INDENT_PX + 12}
                        y1={0}
                        y2={node.isLast ? 28 : '100%'}
                        stroke="var(--ap-border-strong, var(--ap-border))"
                        strokeWidth={1}
                      />
                      <line
                        x1={(node.depth - 1) * INDENT_PX + 12}
                        x2={node.depth * INDENT_PX - 4}
                        y1={28}
                        y2={28}
                        stroke="var(--ap-border-strong, var(--ap-border))"
                        strokeWidth={1}
                      />
                    </svg>
                  )}
                  <NodeCard
                    node={node}
                    expanded={isExpanded}
                    hasKids={hasKids}
                    onToggle={() => toggle(node.rowId)}
                    onOpen={() => openRow(node)}
                    onAddChild={() => {
                      if (node.data.href) router.push(`${node.data.href}?addChild=1`)
                    }}
                    query={filters.q}
                    focused={focusedId === node.rowId}
                  />
                </div>
              )
            })}
          </div>
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
