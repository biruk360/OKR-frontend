'use client'

/**
 * OKR Explorer — consolidated view over Plans / Company OKRs / Department OKRs /
 * Objectives. Apple Pro list interior.
 * Two view modes: Compact rows (default) and Rich cards.
 * Filter strip: Timeframe + Department + Level + Status + Search.
 * Preserves: KPI cards, tabs (All/Watched/My/At risk), hide finished,
 * role-aware Create menu, initiatives roll-up, favorites.
 *
 * State, fetching and handlers live here; presentation is split across
 * OkrsAllTabsBar / OkrsAllFilterStrip / OkrsAllListChrome / OkrsAllRows /
 * OkrsAllDetailDrawer, with pure helpers in okrs-all-utils.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Target } from 'lucide-react'
import toast from 'react-hot-toast'
import { StatCard, StatGrid } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { useInitiativeDetailStore } from '@/lib/stores/initiative-detail-store'
import { useOkrFavoritesStore } from '@/lib/stores/okr-favorites-store'
import { CreateObjectiveModal } from '@/features/objectives'
import {
  ALL_PERIODS,
  CREATE_OPTIONS,
  EMPTY_FILTERS,
  PAGE_SIZE,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  filtersToQuery,
  matchesHideFinished,
  matchesStatus,
  matchesTab,
  statusOf,
  type ApiResponse,
  type CreateLevel,
  type CreatePermissions,
  type CurrentUser,
  type Filters,
  type HierarchyMeta,
  type Refs,
  type Row,
  type SortKey,
  type SortState,
  type Tab,
  type ViewMode,
} from './okrs-all-utils'
import { OkrsAllTabsBar } from './OkrsAllTabsBar'
import { OkrsAllFilterStrip } from './OkrsAllFilterStrip'
import { BulkActionBar, Pagination, SortHeaderRow } from './OkrsAllListChrome'
import { CompactRow, RichCard } from './OkrsAllRows'
import { OkrsAllDetailDrawer } from './OkrsAllDetailDrawer'
import { lockedScopeKeys, type ExplorerScope } from '@/lib/okr/explorer-params'

export type { CreatePermissions } from './okrs-all-utils'

/* --------------------------- Main component --------------------------- */

export default function OkrsAllClient({
  currentUser,
  createPermissions,
  scope,
}: {
  currentUser: CurrentUser
  createPermissions: CreatePermissions
  /** Explorer level preset (lib/okr/explorer-params.ts). Remount (`key`) when it changes. */
  scope?: ExplorerScope
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [rows, setRows] = useState<Row[]>([])
  const [refs, setRefs] = useState<Refs>({ timeframes: [], owners: [], teams: [], labels: [] })
  const refsLoadedRef = useRef(false)
  // Timeframes the API actually filtered by. With no timeframe chosen it is the
  // active one (lib/okr/active-timeframe.ts); `period=all` → [].
  const [meta, setMeta] = useState<HierarchyMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Row | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [hideFinished, setHideFinished] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  // Lives outside the menu so closing the menu doesn't unmount the modal.
  const [createLevel, setCreateLevel] = useState<CreateLevel | null>(null)
  const [view, setView] = useState<ViewMode>('compact')
  const [sort, setSort] = useState<SortState>(null)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState<null | { done: number; total: number }>(null)
  const [page, setPage] = useState(1)
  const router = useRouter()

  const { ids: favoriteIds, load: loadFavorites, toggle: toggleFavorite } = useOkrFavoritesStore()
  useEffect(() => { loadFavorites() }, [loadFavorites])

  const fetchData = useCallback(async (f: Filters) => {
    setLoading(true)
    setError(null)
    try {
      const qs = filtersToQuery(f, !refsLoadedRef.current, scope)
      const res = await fetch(`/api/okr-hierarchy${qs ? `?${qs}` : ''}`)
      const body: ApiResponse = await res.json()
      if (!body.success) throw new Error('Failed to load OKR hierarchy')
      setRows(body.data.rows)
      setMeta(body.data.meta ?? null)
      if (body.data.refs) {
        setRefs(body.data.refs)
        refsLoadedRef.current = true
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => { fetchData(filters) }, [fetchData, filters])
  useEffect(() => { setPage(1) }, [filters, tab, hideFinished, view])

  // Initiative roll-up. The API no longer returns initiative rows by default —
  // each OBJ/KR row carries `initiativeCount` / `initiativeDoneCount` (an
  // objective's counts are the sum over its key results).
  const enrichedRows = useMemo<Row[]>(() => rows.map(r => {
    if (r.kind === 'INIT') {
      return { ...r, data: { ...r.data, __initTotal: 1, __initClosed: r.data.status === 'COMPLETED' ? 1 : 0 } }
    }
    return {
      ...r,
      data: {
        ...r.data,
        __initTotal: Number(r.data.initiativeCount ?? 0),
        __initClosed: Number(r.data.initiativeDoneCount ?? 0),
      },
    }
  }), [rows])

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

  /**
   * Bulk archive / restore.
   *
   * Fans out to the existing per-entity routes rather than going through a new
   * batch endpoint. Each of those routes already runs its own permission check,
   * its own lock guard and — for key results — the rollup inside the mutation's
   * transaction; a batch endpoint would have to reimplement all three, and get
   * every one of them right, to save a few round trips. A small concurrency
   * limit keeps the fan-out from opening 50 connections at once.
   *
   * Partial success is the normal outcome, not an error case: selection spans
   * rows the user may not be allowed to touch. Each row is reported.
   */
  const runBulk = useCallback(async (action: 'archive' | 'unarchive') => {
    const targets = enrichedRows.filter((r) => bulkSelected.has(r.rowId))
    if (targets.length === 0) return

    setBulkBusy({ done: 0, total: targets.length })
    let ok = 0
    const failures: string[] = []

    const endpointFor = (row: Row): { url: string; init: RequestInit } | null => {
      const id = row.data?.id
      if (!id) return null
      if (row.kind === 'OBJ') {
        return { url: `/api/objectives/${id}/${action}`, init: { method: 'POST' } }
      }
      if (row.kind === 'KR') {
        return { url: `/api/keyresults/${id}/${action}`, init: { method: 'POST' } }
      }
      // Initiatives are to-dos; soft archive is a PATCH flag, not a sub-route.
      return {
        url: `/api/todos/${id}`,
        init: {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: action === 'archive' }),
        },
      }
    }

    const queue = [...targets]
    const CONCURRENCY = 4
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (;;) {
          const row = queue.shift()
          if (!row) return
          const ep = endpointFor(row)
          if (!ep) {
            failures.push(`${row.data?.title ?? row.rowId}: no id`)
          } else {
            try {
              const res = await fetch(ep.url, ep.init)
              const body = await res.json().catch(() => null)
              if (res.ok && body?.success !== false) ok++
              else failures.push(`${row.data?.title ?? row.rowId}: ${body?.error ?? res.status}`)
            } catch {
              failures.push(`${row.data?.title ?? row.rowId}: network error`)
            }
          }
          setBulkBusy((b) => (b ? { ...b, done: b.done + 1 } : b))
        }
      }),
    )

    setBulkBusy(null)
    setBulkSelected(new Set())
    await fetchData(filters)

    const verb = action === 'archive' ? 'Archived' : 'Restored'
    if (failures.length === 0) {
      toast.success(`${verb} ${ok} item${ok === 1 ? '' : 's'}`)
    } else if (ok === 0) {
      toast.error(`Could not ${action} any of the ${failures.length} selected — ${failures[0]}`)
    } else {
      // Say what did not work, not just how many: the reason is almost always
      // a permission the user can act on.
      toast(`${verb} ${ok}, ${failures.length} failed — ${failures[0]}`, { icon: '⚠️' })
    }
  }, [enrichedRows, bulkSelected, fetchData, filters])

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
        // Initiatives hang off key results; counting them on KR rows avoids
        // double-counting the objective's roll-up.
        inits += Number(r.data.initiativeCount ?? 0)
        initsClosed += Number(r.data.initiativeDoneCount ?? 0)
      } else if (r.kind === 'INIT') {
        inits++
        if (r.data.status === 'COMPLETED') initsClosed++
      }
    }
    const avgProgress = progCount > 0 ? Math.round(progSum / progCount) : 0
    return { objs, krs, inits, initsClosed, avgProgress, atRisk }
  }, [filteredRows])

  const clearFilters = () => setFilters(EMPTY_FILTERS)
  // Pills the level preset fixes are hidden — the preset overrides them server-side.
  const locked = useMemo(() => lockedScopeKeys(scope), [scope])
  const activeFilterCount = filters.period.length + filters.team.length + filters.type.length + filters.status.length + (filters.q ? 1 : 0)

  // Timeframe pill: an explicit pick, else what the server defaulted to.
  const effectivePeriods = filters.period.length > 0
    ? filters.period
    : meta
      ? (meta.periodIds.length > 0 ? meta.periodIds : [ALL_PERIODS])
      : []
  const timeframeOptions = useMemo(
    () => [{ id: ALL_PERIODS, label: 'All timeframes' }, ...refs.timeframes.map(t => ({ id: t.id, label: t.name }))],
    [refs.timeframes],
  )
  const timeframeLabel = (() => {
    if (effectivePeriods.includes(ALL_PERIODS)) return 'All timeframes'
    if (effectivePeriods.length === 1) {
      const tf = refs.timeframes.find(t => t.id === effectivePeriods[0])
      if (tf) return tf.name
    }
    return 'Timeframe'
  })()
  const onTimeframeChange = (next: string[]) => {
    const addedAll = next.includes(ALL_PERIODS) && !effectivePeriods.includes(ALL_PERIODS)
    const specific = next.filter(id => id !== ALL_PERIODS)
    // Picking "All", or clearing every timeframe, means no timeframe filter.
    setFilters({ ...filters, period: addedAll || specific.length === 0 ? [ALL_PERIODS] : specific })
  }

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
      <OkrsAllTabsBar
        tab={tab}
        onTabChange={setTab}
        watchedCount={favoriteIds.size || null}
        atRiskCount={kpis.atRisk || null}
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
        createPermissions={createPermissions}
        onPickCreateLevel={setCreateLevel}
      />

      <CreateObjectiveModal
        isOpen={createLevel !== null}
        onClose={() => setCreateLevel(null)}
        defaultLevel={createLevel ?? undefined}
        defaultOwnerId={createLevel === 'INDIVIDUAL' ? currentUser.id : undefined}
        title={CREATE_OPTIONS.find((o) => o.level === createLevel)?.label}
        onObjectiveCreated={() => fetchData(filters)}
      />

      <div className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        {/* Filter strip */}
        <OkrsAllFilterStrip
          q={filters.q}
          onQueryChange={(q) => setFilters({ ...filters, q })}
          pills={[
            { label: timeframeLabel, options: timeframeOptions, selected: effectivePeriods, onChange: onTimeframeChange },
            ...(locked.has('team') ? [] : [{
              label: 'Department',
              options: refs.teams.map(t => ({ id: t.id, label: t.name })),
              selected: filters.team,
              onChange: (next: string[]) => setFilters({ ...filters, team: next }),
            }]),
            ...(locked.has('type') ? [] : [
              { label: 'Level', options: TYPE_OPTIONS, selected: filters.type, onChange: (next: string[]) => setFilters({ ...filters, type: next }) },
            ]),
            { label: 'Status', options: STATUS_OPTIONS, selected: filters.status, onChange: (next: string[]) => setFilters({ ...filters, status: next }) },
          ]}
          hideFinished={hideFinished}
          onHideFinishedChange={setHideFinished}
          view={view}
          onViewChange={setView}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearFilters}
        />

        {/* Bulk action bar */}
        {bulkSelected.size > 0 && (
          <BulkActionBar
            count={bulkSelected.size}
            busy={bulkBusy}
            onClear={() => setBulkSelected(new Set())}
            onArchive={() => runBulk('archive')}
            onRestore={() => runBulk('unarchive')}
          />
        )}

        {/* Sort header (compact only) */}
        {view === 'compact' && pagedRows.length > 0 && (
          <SortHeaderRow
            allOnPageSelected={allOnPageSelected}
            onToggleAllOnPage={toggleAllOnPage}
            sort={sort}
            onSort={onSort}
          />
        )}

        {/* Body */}
        {loading ? (
          <div className="p-3 space-y-2" aria-busy="true" aria-label="Loading OKRs">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : error ? (
          <div className="p-10 text-body-sm text-[var(--ap-red)] text-center">{error}</div>
        ) : pagedRows.length === 0 ? (
          <EmptyState bare icon={Target} title="No OKRs match these filters" description="Try adjusting your filters." />
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
          <Pagination
            page={page}
            pageCount={pageCount}
            pageSize={PAGE_SIZE}
            total={sortedRows.length}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => Math.min(pageCount, p + 1))}
          />
        )}
      </div>

      {/* Detail drawer */}
      <OkrsAllDetailDrawer selected={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
