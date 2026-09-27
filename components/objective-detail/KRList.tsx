'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Link2, Plus, ChevronRight, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, FilterSelect } from '@/components/ui'
import { fromDbStatus, type ComputedStatus } from '@/lib/okr/status'
import { cn } from '@/lib/utils'
import { PersonTooltip } from '@/components/shared/UserAvatar'
import { AddKeyResultModal } from '@/features/key-results'
import {
  KR_STATUS_FILTER_OPTIONS,
  activeFilterCount,
  filterKeyResults,
  type KrFilterState,
  type KrStatusFilter,
} from './kr-filters'

interface KR {
  id: string
  title: string
  progress: number
  confidence: string
  status: string
  currentValue: number
  targetValue: number
  unit: string
  owner: { id: string; name: string; avatar?: string | null }
}

interface Props {
  keyResults: KR[]
  objectiveId: string
  /** Server-computed canCreateKeyResultForObjective (lib/permissions). Hides "Add KR" when false. */
  canCreate?: boolean
  /** Owner picker options for the create-KR modal. */
  users?: Array<{ id: string; name: string | null; email: string }>
  /** Pre-selected owner in the create-KR modal. */
  currentUserId?: string
}

/** Desktop column template; on phones (< sm) rows stack instead. */
const ROW_GRID = 'grid-cols-[32px_minmax(0,1fr)] sm:grid-cols-[32px_minmax(0,1fr)_110px_200px_16px]'

function StatusDot({ status }: { status: ComputedStatus }) {
  const color =
    status === 'on-track' || status === 'completed' ? 'var(--ap-green)'
    : status === 'at-risk' ? 'var(--ap-orange)'
    : 'var(--ap-red)'
  const pulse = status === 'at-risk' || status === 'off-track' || status === 'no-owner'
  return (
    <span
      className={cn('size-2 rounded-full shrink-0', pulse && 'animate-pulse')}
      style={{ background: color }}
    />
  )
}

function statusBarColor(s: ComputedStatus): string {
  if (s === 'on-track' || s === 'completed') return 'var(--ap-green)'
  if (s === 'at-risk') return 'var(--ap-orange)'
  return 'var(--ap-red)'
}

function initialsOf(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

export default function KRList({ keyResults, objectiveId, canCreate = false, users = [], currentUserId }: Props) {
  const router = useRouter()
  const [density, setDensity] = useState<'rich' | 'compact'>('rich')
  const [addOpen, setAddOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<KrFilterState>({})

  // Sort
  const sorted = [...keyResults].sort((a, b) => {
    const order = (kr: KR) => {
      if (kr.status !== 'ACTIVE') return 4
      if (kr.confidence === 'OFF_TRACK') return 0
      if (kr.confidence === 'AT_RISK') return 1
      return 2
    }
    return order(a) - order(b)
  })
  // KR numbers stay stable while filtering.
  const numberOf = new Map(sorted.map((kr, i) => [kr.id, i + 1]))
  const visible = filterKeyResults(sorted, filters)
  const filterCount = activeFilterCount(filters)

  const ownerOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const kr of keyResults) seen.set(kr.owner.id, kr.owner.name)
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [keyResults])

  const active = keyResults.filter(k => k.status === 'ACTIVE')
  const avgProgress = active.length
    ? Math.round(active.reduce((s, k) => s + k.progress, 0) / active.length) : 0
  const onTrackCount = active.filter(k => k.confidence === 'ON_TRACK').length
  const avgConfidence = active.length
    ? Math.round((onTrackCount / active.length) * 100) : 0

  return (
    <section className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex items-baseline gap-2">
          <h3 className="text-body-sm font-semibold">Key Results</h3>
          <span className="text-xs text-muted-foreground tabular-nums">{keyResults.length}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Rich/Compact segmented control */}
          <div
            className="inline-flex items-center rounded-[var(--ap-radius-sm)] p-0.5 text-caption font-medium"
            style={{ background: 'var(--ap-bg-sunken)' }}
          >
            <button
              type="button"
              onClick={() => setDensity('rich')}
              className={cn('px-2 py-1 rounded-[8px] transition-colors',
                density === 'rich' ? 'bg-card shadow-sm' : 'text-muted-foreground')}
            >Rich</button>
            <button
              type="button"
              onClick={() => setDensity('compact')}
              className={cn('px-2 py-1 rounded-[8px] transition-colors',
                density === 'compact' ? 'bg-card shadow-sm' : 'text-muted-foreground')}
            >Compact</button>
          </div>
          {keyResults.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((v) => !v)}
              className={cn(
                'h-7 px-2 rounded-[var(--ap-radius-sm)] text-caption',
                filterCount > 0 && 'border-[var(--ap-accent)] text-[var(--ap-accent)]',
              )}
            >
              <Filter className="size-3 mr-1" /> Filter{filterCount > 0 ? ` · ${filterCount}` : ''}
            </Button>
          )}
          {canCreate && (
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              className="h-7 px-2 rounded-[var(--ap-radius-sm)] text-caption"
            >
              <Plus className="size-3 mr-1" /> Add KR
            </Button>
          )}
        </div>
      </header>

      {filterOpen && keyResults.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 px-4 py-2 border-b"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <FilterSelect
            label="Status"
            placeholder="Any"
            value={filters.status}
            onValueChange={(v) => setFilters((f) => ({ ...f, status: (v as KrStatusFilter) || undefined }))}
            options={KR_STATUS_FILTER_OPTIONS}
          />
          <FilterSelect
            label="Owner"
            placeholder="Anyone"
            value={filters.ownerId}
            onValueChange={(v) => setFilters((f) => ({ ...f, ownerId: v || undefined }))}
            options={ownerOptions}
          />
          {filterCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters({})}
              className="text-caption font-medium text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto text-caption text-muted-foreground tabular-nums">
            {visible.length} of {keyResults.length}
          </span>
        </div>
      )}

      {/* Column header */}
      {visible.length > 0 && (
        <div
          className={cn(
            'hidden sm:grid items-center gap-3 px-4 py-2 text-micro font-semibold uppercase tracking-wide text-muted-foreground border-b',
            ROW_GRID,
          )}
          style={{
            borderColor: 'var(--ap-border)',
            background: 'var(--ap-bg-sunken)',
          }}
        >
          <span></span>
          <span>Key Result</span>
          <span>Owner</span>
          <span>Progress</span>
          <span></span>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          bare
          className="py-8"
          icon={Link2}
          title="No key results yet"
          description={canCreate ? 'Add your first one to start tracking progress.' : 'Key results added by the owner will appear here.'}
          action={canCreate ? { label: 'Add KR', onClick: () => setAddOpen(true) } : undefined}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          bare
          className="py-8"
          icon={Filter}
          title="No key results match these filters"
          action={{ label: 'Clear filters', onClick: () => setFilters({}) }}
        />
      ) : (
        <div>
          {visible.map((kr) => {
            const idx = (numberOf.get(kr.id) ?? 1) - 1
            const status = fromDbStatus(kr.confidence)
            const initials = initialsOf(kr.owner.name)
            const pct = Math.round(kr.progress)
            const barColor = statusBarColor(status)
            const krBadgeBg = status === 'on-track' || status === 'completed' ? 'var(--ap-ok-bg)'
              : status === 'at-risk' ? 'var(--ap-warn-bg)' : 'var(--ap-danger-bg)'

            return (
              <Link
                key={kr.id}
                href={`/dashboard/key-results/${kr.id}`}
                className={cn(
                  'group ap-hover-lift grid items-center gap-x-3 gap-y-2 border-b transition-colors hover:bg-[var(--ap-bg-hover)]',
                  ROW_GRID,
                  density === 'rich' ? 'px-4 py-3.5' : 'px-4 py-2.5',
                )}
                style={{ borderColor: 'var(--ap-border-soft)' }}
              >
                {/* Status + index */}
                <div className="flex items-center gap-1.5">
                  <StatusDot status={status} />
                  <span className="text-micro tabular-nums text-muted-foreground font-mono">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                </div>

                {/* Title block */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 text-micro">
                    <span
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 font-bold"
                      style={{ background: krBadgeBg, color: barColor }}
                    >KR{idx + 1}</span>
                    <span className="text-muted-foreground tabular-nums">{kr.id.slice(-6).toUpperCase()}</span>
                    {kr.targetValue > 0 && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground tabular-nums">
                          {kr.currentValue}/{kr.targetValue} {kr.unit}
                        </span>
                      </>
                    )}
                  </div>
                  <p className={cn(
                    'text-body-sm font-medium leading-snug group-hover:text-[var(--ap-accent)] transition-colors',
                    density === 'rich' ? 'line-clamp-2' : 'line-clamp-1',
                  )}>
                    {kr.title}
                  </p>
                </div>

                {/* Owner + progress: one line under the title on phones, own columns from sm */}
                <div className="col-start-2 flex min-w-0 items-center gap-3 sm:contents">
                {/* Owner */}
                <div className="flex items-center gap-2 min-w-0 max-w-[45%] sm:max-w-none">
                  {kr.owner.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={kr.owner.avatar} alt={kr.owner.name}
                      className="size-5 rounded-full object-cover" />
                  ) : (
                    <span
                      aria-hidden
                      className="flex size-5 items-center justify-center rounded-full text-[9px] font-semibold"
                      style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}
                    >{initials}</span>
                  )}
                  {/* Name is printed; hover card only when it is clipped (UNH-4). */}
                  <PersonTooltip person={kr.owner} detail="Owner" whenTruncated>
                    <span className="text-xs text-muted-foreground truncate">{kr.owner.name}</span>
                  </PersonTooltip>
                </div>

                {/* Progress */}
                <div className="flex flex-1 items-center gap-2 min-w-0">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ap-kr-bar-bg)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                  </div>
                  <span className="text-xs font-semibold tabular-nums w-10 text-right">{pct}%</span>
                </div>

                </div>

                <ChevronRight className="hidden sm:block size-3.5 text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      )}

      {/* Footer aggregates */}
      {sorted.length > 0 && (
        <footer
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t text-caption"
          style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
        >
          <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
            <span>Avg progress <span className="font-semibold tabular-nums" style={{ color: 'var(--ap-fg)' }}>{avgProgress}%</span></span>
            <span>Avg confidence <span className="font-semibold tabular-nums" style={{ color: 'var(--ap-fg)' }}>{avgConfidence}%</span></span>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <span>{active.length} active KR{active.length !== 1 ? 's' : ''}</span>
          </div>
        </footer>
      )}

      {canCreate && (
        <AddKeyResultModal
          isOpen={addOpen}
          onClose={() => setAddOpen(false)}
          objectiveId={objectiveId}
          users={users}
          defaultOwnerId={currentUserId}
          onSuccess={() => router.refresh()}
        />
      )}
    </section>
  )
}
