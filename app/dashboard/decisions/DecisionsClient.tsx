'use client'

/**
 * Decisions page (DEC-1 + log).
 *
 *   - "Awaiting my decision" for the viewer when they are a decider (grouped by
 *     batch, sorted by needed-by, overdue flagged — the feature's own list).
 *   - For Executives / Admins with the decide feature who are not the default
 *     decider: the default decider's (CEO's) queue, read-only context.
 *   - The decision log with filters (status tab, timeframe, decider,
 *     requester, batch, text) and a "Request decision" action.
 *   - `?decision=<id>` / `?focus=<id>` opens one decision.
 *
 * Every action follows the decision's own `access` flags from the API (DEC-4).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Hourglass, Plus, Scale, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { Input } from '@/components/ui/input'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import {
  AwaitingMyDecisionList,
  DecisionFormModal,
  DecisionRow,
  compareByNeededBy,
  useDecisionActionDialogs,
  useDecisions,
  type DecisionDTO,
} from '@/features/decisions'
import { useDebounce } from '@/hooks/useDebounce'
import { useTimeframes } from '@/hooks/useTimeframes'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { cn } from '@/lib/utils'
import { DecisionFocusModal } from './DecisionFocusModal'
import {
  DECISION_LOG_VIEWS,
  DECISION_LOG_VIEW_LABELS,
  NO_BATCH,
  batchOptions,
  countByView,
  decisionsPageQuery,
  matchesBatch,
  matchesLogView,
  orderDecisionLog,
  parseDecisionsPageState,
  type DecisionsPageState,
} from './decisions-params'

const cardClass = 'rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] shadow-card'

export interface DecisionsClientProps {
  currentUserId: string
}

export default function DecisionsClient({ currentUserId }: DecisionsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const state = useMemo(() => parseDecisionsPageState(searchParams), [searchParams])

  const navigate = useCallback(
    (patch: Partial<DecisionsPageState>) =>
      router.replace(`${pathname}${decisionsPageQuery({ ...state, ...patch })}`, { scroll: false }),
    [pathname, router, state],
  )

  const [search, setSearch] = useState(state.q ?? '')
  const debounced = useDebounce(search, 300)
  useEffect(() => {
    if ((state.q ?? '') !== debounced.trim()) setSearch(state.q ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.q])
  useEffect(() => {
    const q = debounced.trim() || null
    if (q !== state.q) navigate({ q })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  // Server-side filters; the status tab and batch are applied below so the tabs can count.
  const query = useDecisions({
    status: 'all',
    timeframeId: state.timeframeId,
    deciderId: state.deciderId ?? undefined,
    requestedById: state.requestedById ?? undefined,
    q: state.q ?? undefined,
    limit: 500,
  })
  const data = query.data
  const { run, dialogs } = useDecisionActionDialogs({ defaultDeciderId: data?.defaultDeciderId })
  const [requestOpen, setRequestOpen] = useState(false)

  const { users } = useUsersForSelection()
  const { timeframes } = useTimeframes()
  const userOptions = useMemo(
    () => users.map((u) => ({ value: u.id, label: u.name ?? u.email })).sort((a, b) => a.label.localeCompare(b.label)),
    [users],
  )
  const personOptions = useMemo(() => [{ value: 'me', label: 'Me' }, ...userOptions], [userOptions])
  const timeframeOptions = useMemo(
    () => [{ value: 'all', label: 'All timeframes' }, ...timeframes.map((t) => ({ value: t.id, label: t.name }))],
    [timeframes],
  )

  const items = useMemo(() => data?.items ?? [], [data])
  const inBatch = useMemo(() => items.filter((d) => matchesBatch(d, state.batch)), [items, state.batch])
  const counts = useMemo(() => countByView(inBatch), [inBatch])
  const shown = useMemo(
    () => orderDecisionLog(inBatch.filter((d) => matchesLogView(d, state.view)), compareByNeededBy),
    [inBatch, state.view],
  )
  const batches = useMemo(() => batchOptions(items), [items])
  const batchSelectOptions = useMemo(
    () => [
      ...batches.batches.map((b) => ({ value: b, label: `Batch ${b}` })),
      ...(batches.hasUnbatched ? [{ value: NO_BATCH, label: 'No batch' }] : []),
    ],
    [batches],
  )
  const overdueOpen = inBatch.filter((d) => d.overdue).length

  const defaultDeciderId = data?.defaultDeciderId ?? null
  const defaultDecider = useMemo(() => users.find((u) => u.id === defaultDeciderId) ?? null, [users, defaultDeciderId])
  const showDefaultQueue = !!data?.permissions.canDecideFeature && !!defaultDeciderId && defaultDeciderId !== currentUserId

  const filterCount = [state.timeframeId, state.deciderId, state.requestedById, state.batch, state.q].filter(Boolean).length
  const clearFilters = () => {
    setSearch('')
    navigate({ timeframeId: null, deciderId: null, requestedById: null, batch: null, q: null })
  }
  const statusParam = (error: unknown) => (error as { status?: number } | null)?.status

  return (
    <div className="space-y-4">
      <AwaitingMyDecisionList deciderId="me" hideWhenEmpty />
      {showDefaultQueue && (
        <AwaitingMyDecisionList
          deciderId={defaultDeciderId}
          title={defaultDecider?.name ? `Awaiting ${defaultDecider.name}’s decision` : 'Awaiting the CEO’s decision'}
          hideWhenEmpty
        />
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Open" value={counts.open} icon={Hourglass} tone="blue" onClick={() => navigate({ view: 'open' })} />
        <StatCard label="Overdue" value={overdueOpen} icon={AlertTriangle} tone="red" helperText="Open and past needed-by" />
        <StatCard label="Decided" value={counts.decided} icon={CheckCircle2} tone="green" onClick={() => navigate({ view: 'decided' })} />
        <StatCard label="Deferred" value={counts.deferred} icon={Scale} tone="yellow" onClick={() => navigate({ view: 'deferred' })} />
      </div>

      <section className={cn(cardClass, 'min-w-0')} aria-label="Decision log">
        <SectionHeading
          title="Decision log"
          right={
            data?.permissions.canCreate ? (
              <Button size="sm" variant="outline" onClick={() => setRequestOpen(true)}>
                <Plus aria-hidden />
                Request decision
              </Button>
            ) : undefined
          }
        />

        <div className="space-y-3 border-b border-[var(--ap-border)] px-4 pb-3 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--ap-fg-subtle)]"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title or ref (D46)…"
                aria-label="Search decisions"
                className="pl-8"
              />
            </div>
            <FilterSelect
              label="Timeframe"
              value={state.timeframeId ?? 'all'}
              onValueChange={(v) => navigate({ timeframeId: v && v !== 'all' ? v : null })}
              options={timeframeOptions}
              clearable={!!state.timeframeId}
              menuWidth={240}
            />
            <FilterSelect
              label="Decider"
              value={state.deciderId ?? undefined}
              onValueChange={(v) => navigate({ deciderId: v || null })}
              options={personOptions}
              placeholder="Anyone"
              menuWidth={240}
            />
            <FilterSelect
              label="Requested by"
              value={state.requestedById ?? undefined}
              onValueChange={(v) => navigate({ requestedById: v || null })}
              options={personOptions}
              placeholder="Anyone"
              menuWidth={240}
            />
            {batchSelectOptions.length > 0 && (
              <FilterSelect
                label="Batch"
                value={state.batch ?? undefined}
                onValueChange={(v) => navigate({ batch: v || null })}
                options={batchSelectOptions}
                placeholder="All"
              />
            )}
            {filterCount > 0 && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <X className="mr-1 size-3.5" aria-hidden />
                Clear
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Filter decisions by status">
            {DECISION_LOG_VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={state.view === view}
                onClick={() => navigate({ view })}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-caption font-medium ap-focus-ring transition-colors',
                  state.view === view
                    ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]'
                    : 'text-[var(--ap-fg-subtle)] hover:bg-surface-hover',
                )}
              >
                {DECISION_LOG_VIEW_LABELS[view]} <span className="tabular-nums">{counts[view]}</span>
              </button>
            ))}
            {overdueOpen > 0 && (
              <MiniBadge tone="danger" className="ml-auto shrink-0">
                {overdueOpen} overdue
              </MiniBadge>
            )}
          </div>
        </div>

        {query.isLoading ? (
          <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading decisions">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState
            bare
            className="py-12"
            icon={Scale}
            title={statusParam(query.error) === 403 ? 'Decisions are not available' : 'Could not load decisions'}
            description={
              statusParam(query.error) === 403
                ? 'Your role does not include the operating package module.'
                : 'Something went wrong. Try again in a moment.'
            }
            action={statusParam(query.error) === 403 ? undefined : { label: 'Retry', onClick: () => void query.refetch() }}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            bare
            className="py-12"
            icon={Scale}
            title={items.length === 0 && filterCount === 0 ? 'No decisions yet' : 'No decisions match'}
            description={
              items.length === 0 && filterCount === 0
                ? 'Requests for a decision from the CEO (or another decider) appear here with their batch, needed-by date and outcome.'
                : `Nothing in “${DECISION_LOG_VIEW_LABELS[state.view]}” with these filters.`
            }
            action={
              filterCount > 0
                ? { label: 'Clear filters', onClick: clearFilters }
                : data?.permissions.canCreate
                  ? { label: 'Request a decision', onClick: () => setRequestOpen(true) }
                  : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--ap-border)]">
            {shown.map((decision: DecisionDTO) => (
              <DecisionRow
                key={decision.id}
                decision={decision}
                onAction={run}
                className={cn(decision.id === state.focusId && 'bg-[var(--ap-accent-soft)]')}
              />
            ))}
          </ul>
        )}
      </section>

      <DecisionFocusModal decisionId={state.focusId} onClose={() => navigate({ focusId: null })} onAction={run} />
      <DecisionFormModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        defaults={{ timeframeId: state.timeframeId ?? undefined }}
        defaultDeciderId={defaultDeciderId}
      />
      {dialogs}
    </div>
  )
}
