'use client'

/**
 * Company Dependency Map (DEP-6, CON-4): filters for status, type, provider,
 * needer, due window, linked company KR, timeframe, scope and text; a table
 * or the company graph; CSV export of the same filtered set; a quick view
 * for `?dependency=<id>` (and `?focus=<id>`) deep links.
 *
 * Data comes from GET /api/dependencies through the dependencies feature;
 * every filter lives in the URL (map-params.ts).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  GitPullRequestArrow,
  ListChecks,
  Network,
  Plus,
  Search,
  Table2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/EmptyState'
import { EntityPicker, type EntityPickerValue } from '@/components/ui/EntityPicker'
import { FilterMultiSelect } from '@/components/ui/FilterMultiSelect'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { Input } from '@/components/ui/input'
import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { CompanyDependencyGraph } from '@/components/shared/dependency-graph'
import {
  DEPENDENCY_DUE_WINDOWS,
  DEPENDENCY_DUE_WINDOW_LABELS,
  DependencyFormModal,
  dependencyExportHref,
  useDependencies,
  type DependencyDetailRow,
  type DependencyListFilters,
} from '@/features/dependencies'
import { useDebounce } from '@/hooks/useDebounce'
import { useTimeframes } from '@/hooks/useTimeframes'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { cn } from '@/lib/utils'
import {
  DEPENDENCY_STATUSES,
  DEPENDENCY_STATUS_LABELS,
  DEPENDENCY_TYPES,
  DEPENDENCY_TYPE_LABELS,
  type DependencyStatus,
  type DependencyType,
} from '@/types/package'
import { DependencyDetailDrawer } from './DependencyDetailDrawer'
import { DependencyMapTable } from './DependencyMapTable'
import {
  activeFilterCount,
  dependencyMapQuery,
  parseDependencyMapState,
  type DependencyMapState,
  type DependencyMapView,
} from './map-params'

const cardClass = 'rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] shadow-card'

type EditorState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; row: DependencyDetailRow }

export default function DependencyMapClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const state = useMemo(() => parseDependencyMapState(searchParams), [searchParams])
  const { filters, view, focusId } = state

  const navigate = useCallback(
    (next: DependencyMapState) => router.replace(`${pathname}${dependencyMapQuery(next)}`, { scroll: false }),
    [pathname, router],
  )
  const setFilters = useCallback(
    (patch: Partial<DependencyListFilters>, extra: Partial<DependencyMapState> = {}) =>
      navigate({ ...state, ...extra, filters: { ...state.filters, ...patch } }),
    [navigate, state],
  )

  // Text search: type freely, push to the URL after a pause.
  const [search, setSearch] = useState(filters.q ?? '')
  const debounced = useDebounce(search, 300)
  // Follow outside changes (clear filters, back button) without clobbering text typed since.
  useEffect(() => {
    if ((filters.q ?? '') !== debounced.trim()) setSearch(filters.q ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q])
  useEffect(() => {
    const q = debounced.trim() || undefined
    if (q !== filters.q) setFilters({ q })
    // Only react to the debounced text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const query = useDependencies(filters)
  const rows = useMemo(() => query.data?.dependencies ?? [], [query.data])
  const permissions = query.data?.permissions

  const { users } = useUsersForSelection()
  const { timeframes } = useTimeframes()
  const userOptions = useMemo(
    () =>
      users
        .map((u) => ({ value: u.id, label: u.name ?? u.email }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [users],
  )
  const timeframeOptions = useMemo(
    () => [{ value: 'all', label: 'All timeframes' }, ...timeframes.map((t) => ({ value: t.id, label: t.name }))],
    [timeframes],
  )

  const linkedValue = useMemo<EntityPickerValue | null>(
    () =>
      filters.linkedType === 'KEY_RESULT' && filters.linkedId
        ? {
            kind: 'keyResult',
            id: filters.linkedId,
            title: state.linkedLabel ?? 'Linked key result',
            objectiveId: '',
            objectiveTitle: '',
          }
        : null,
    [filters.linkedType, filters.linkedId, state.linkedLabel],
  )

  const stats = useMemo(() => {
    let open = 0
    let late = 0
    let dueSoon = 0
    for (const r of rows) {
      if (r.open) open += 1
      if (r.open && r.late) late += 1
      else if (r.open && r.dueSoon) dueSoon += 1
    }
    return { total: rows.length, open, late, dueSoon, closed: rows.length - open }
  }, [rows])

  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })
  const openDependency = useCallback((id: string) => navigate({ ...state, focusId: id }), [navigate, state])
  const closeDependency = useCallback(() => navigate({ ...state, focusId: null }), [navigate, state])
  const setView = (next: DependencyMapView) => navigate({ ...state, view: next })
  const filterCount = activeFilterCount(filters)
  const clearFilters = () => {
    setSearch('')
    navigate({ filters: {}, view, focusId: null, linkedLabel: null })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Dependencies" value={stats.total} icon={GitPullRequestArrow} tone="blue" />
        <StatCard
          label="Late"
          value={stats.late}
          icon={AlertTriangle}
          tone="red"
          helperText="Open and past needed-by"
          onClick={() => setFilters({ due: filters.due === 'late' ? undefined : 'late' })}
        />
        <StatCard
          label="Due within 7 days"
          value={stats.dueSoon}
          icon={Clock}
          tone="yellow"
          onClick={() => setFilters({ due: filters.due === 'due_soon' ? undefined : 'due_soon' })}
        />
        <StatCard label="Done or dropped" value={stats.closed} icon={CheckCircle2} tone="green" />
      </div>

      <section className={cn(cardClass, 'min-w-0')} aria-label="Dependency Map">
        <div className="space-y-3 border-b border-[var(--ap-border)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--ap-fg-subtle)]"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title or ref (DEP14, X03)…"
                aria-label="Search dependencies"
                className="pl-8"
              />
            </div>
            <div className="inline-flex rounded-lg border border-[var(--ap-border)] p-0.5" role="group" aria-label="View">
              {(
                [
                  { key: 'table', label: 'Table', icon: Table2 },
                  { key: 'graph', label: 'Graph', icon: Network },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setView(option.key)}
                  aria-pressed={view === option.key}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-caption ap-focus-ring',
                    view === option.key
                      ? 'bg-[var(--ap-bg-sunken)] font-semibold text-[var(--ap-fg)]'
                      : 'text-[var(--ap-fg-subtle)]',
                  )}
                >
                  <option.icon className="size-3.5" aria-hidden />
                  {option.label}
                </button>
              ))}
            </div>
            {permissions?.canExport !== false && (
              <Button size="sm" variant="outline" asChild>
                <a href={dependencyExportHref(filters)} download>
                  <Download className="mr-1 size-3.5" aria-hidden />
                  Export CSV
                </a>
              </Button>
            )}
            {permissions?.canCreate && (
              <Button size="sm" onClick={() => setEditor({ mode: 'create' })}>
                <Plus className="mr-1 size-3.5" aria-hidden />
                New dependency
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              label="Timeframe"
              value={filters.timeframeId ?? 'all'}
              onValueChange={(v) => setFilters({ timeframeId: v && v !== 'all' ? v : undefined })}
              options={timeframeOptions}
              clearable={!!filters.timeframeId}
              menuWidth={240}
            />
            <FilterMultiSelect
              label="Status"
              values={filters.status ?? []}
              onValuesChange={(v) => setFilters({ status: v.length ? (v as DependencyStatus[]) : undefined })}
              options={DEPENDENCY_STATUSES.map((s) => ({ value: s, label: DEPENDENCY_STATUS_LABELS[s] }))}
            />
            <FilterMultiSelect
              label="Type"
              values={filters.type ?? []}
              onValuesChange={(v) => setFilters({ type: v.length ? (v as DependencyType[]) : undefined })}
              options={DEPENDENCY_TYPES.map((t) => ({ value: t, label: DEPENDENCY_TYPE_LABELS[t] }))}
            />
            <FilterSelect
              label="Provider"
              value={filters.providerId}
              onValueChange={(v) => setFilters({ providerId: v || undefined })}
              options={userOptions}
              placeholder="Anyone"
              menuWidth={240}
            />
            <FilterSelect
              label="Needer"
              value={filters.neederId}
              onValueChange={(v) => setFilters({ neederId: v || undefined })}
              options={userOptions}
              placeholder="Anyone"
              menuWidth={240}
            />
            <FilterSelect
              label="Due"
              value={filters.due}
              onValueChange={(v) => setFilters({ due: (v as DependencyListFilters['due']) || undefined })}
              options={DEPENDENCY_DUE_WINDOWS.map((w) => ({ value: w, label: DEPENDENCY_DUE_WINDOW_LABELS[w] }))}
              placeholder="Any date"
              menuWidth={220}
            />
            <FilterSelect
              label="Scope"
              value={filters.scope}
              onValueChange={(v) => setFilters({ scope: v === 'company' || v === 'package' ? v : undefined })}
              options={[
                { value: 'company', label: 'Company map (DEP)' },
                { value: 'package', label: 'Package links (X)' },
              ]}
              placeholder="All"
              menuWidth={220}
            />
            <div className="min-w-[220px] max-w-full">
              <EntityPicker
                value={linkedValue}
                onChange={(v) =>
                  setFilters(
                    v ? { linkedType: 'KEY_RESULT', linkedId: v.id } : { linkedType: undefined, linkedId: undefined },
                    { linkedLabel: v?.title ?? null },
                  )
                }
                selectable="keyResult"
                query={{ level: 'COMPANY', ...(filters.timeframeId ? { timeframeId: filters.timeframeId } : {}) }}
                recentKey="dependency-map:linked-kr"
                placeholder="Linked company KR…"
                width={380}
              />
            </div>
            <label className="inline-flex items-center gap-1.5 text-caption text-[var(--ap-fg-subtle)]">
              <Checkbox checked={!!filters.mine} onCheckedChange={(v) => setFilters({ mine: v === true ? true : undefined })} />
              Only mine
            </label>
            {filterCount > 0 && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <X className="mr-1 size-3.5" aria-hidden />
                Clear {filterCount} filter{filterCount === 1 ? '' : 's'}
              </Button>
            )}
          </div>
        </div>

        {query.isLoading ? (
          <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading dependencies">
            {view === 'graph' ? (
              <Skeleton className="h-[480px] w-full" />
            ) : (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            )}
          </div>
        ) : query.isError ? (
          <EmptyState
            bare
            className="py-12"
            icon={GitPullRequestArrow}
            title={(query.error as { status?: number } | null)?.status === 403 ? 'Dependency Map is not available' : 'Could not load dependencies'}
            description={
              (query.error as { status?: number } | null)?.status === 403
                ? 'Your role does not include the operating package module.'
                : 'Something went wrong. Try again in a moment.'
            }
            action={
              (query.error as { status?: number } | null)?.status === 403
                ? undefined
                : { label: 'Retry', onClick: () => void query.refetch() }
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            bare
            className="py-12"
            icon={ListChecks}
            title={filterCount > 0 ? 'No dependencies match these filters' : 'No dependencies yet'}
            description={
              filterCount > 0
                ? 'Try a wider due window, another timeframe or clear the filters.'
                : 'Dependencies record what one person needs from another, by when, and what it unblocks.'
            }
            action={
              filterCount > 0
                ? { label: 'Clear filters', onClick: clearFilters }
                : permissions?.canCreate
                  ? { label: 'New dependency', onClick: () => setEditor({ mode: 'create' }) }
                  : undefined
            }
          />
        ) : view === 'graph' ? (
          <CompanyDependencyGraph
            dependencies={rows}
            focusedDependencyId={focusId}
            onOpenDependency={(dep) => openDependency(dep.id)}
          />
        ) : (
          <DependencyMapTable rows={rows} focusId={focusId} onOpen={openDependency} />
        )}

        {!query.isLoading && rows.length > 0 && (
          <p className="border-t border-[var(--ap-border)] px-4 py-2 text-caption text-[var(--ap-fg-subtle)]">
            {stats.total} dependenc{stats.total === 1 ? 'y' : 'ies'} · {stats.open} open. Rows you are not part of show the
            title and status only.
          </p>
        )}
      </section>

      <DependencyDetailDrawer
        dependencyId={focusId}
        onClose={closeDependency}
        onEdit={(row) => setEditor({ mode: 'edit', row })}
      />
      <DependencyFormModal
        open={editor.mode !== 'closed'}
        onClose={() => setEditor({ mode: 'closed' })}
        dependency={editor.mode === 'edit' ? editor.row : null}
        defaults={{ timeframeId: filters.timeframeId ?? null }}
      />
    </div>
  )
}
