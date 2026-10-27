'use client'

/**
 * Employee OKR profile — the **OKRs** tab of /dashboard/org/users/[id]?tab=okrs
 * (PRF-7…11). Profile composition contract: `<OkrProfileTab userId timeframeId />`.
 *
 *   - Header strip (PRF-8): objectives, KRs, average progress, C vs A, next
 *     checkpoint, last check-in.
 *   - Filters (PRF-9): level, commitment, status, blocked only, checkpoint ≤ 30 d.
 *   - Tree (PRF-8): Objective → KR → initiatives (with their milestones) →
 *     milestones → tasks, "Recurring: n" duty rows, connection chips on every
 *     node (CON-1); KPI-only initiatives in a "Supporting KPIs" section below.
 *   - Past OKRs (PRF-10): closed objectives from earlier timeframes with outcome,
 *     grade, retrospective and successors.
 *   - Actions (PRF-11): check in (global check-in modal), quick view (drawer +
 *     ConnectionsPanel; cards open the global card modal), close flow
 *     (shared OkrCloseModal), add milestone / task. All verdicts come from the API.
 *
 * Data: GET /api/users/[id]/okr-profile?timeframeId= (empty → default timeframe).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronsDownUp, ChevronsUpDown, Filter, Network, Target, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import OkrCloseModal from '@/components/shared/OkrCloseModal'
import { explorerHref } from '@/lib/okr/explorer-params'
import { useCheckInPickerStore } from '@/lib/stores/check-in-picker-store'
import { useInitiativeDetailStore } from '@/lib/stores/initiative-detail-store'
import { AddInitiativeModal } from './AddInitiativeModal'
import { OkrProfileApiError, useOkrProfile, useRefreshOkrProfile } from './okr-profile-api'
import { OkrProfileFilterBar } from './OkrProfileFilterBar'
import { OkrProfileHeaderStrip } from './OkrProfileHeaderStrip'
import {
  ObjectiveNode,
  SupportingInitiativesSection,
  type OkrCloseTarget,
  type OkrProfileItemRef,
  type OkrQuickViewTarget,
  type OkrTreeActions,
} from './OkrProfileTree'
import { OkrQuickViewDrawer } from './OkrQuickViewDrawer'
import { PastOkrsSection } from './PastOkrsSection'
import { RetrospectiveModal } from './RetrospectiveModal'
import { activeFilterCount, applyOkrProfileFilters, filterSupportingInitiatives } from './okr-profile-utils'
import type { ProfileInitiativeKind } from './schemas'
import type { OkrProfileFilters, OkrProfileKeyResult, OkrProfilePastObjective } from './types'

export interface OkrProfileTabProps {
  userId: string
  /** Selected timeframe (PRF-3). Empty → the default (active) timeframe. */
  timeframeId: string
  /**
   * Per-node slot (objectives, KRs, KR milestones), e.g. the package review
   * Agree / Dispute controls (PKG-2). Features never import each other.
   */
  renderItemActions?: (item: OkrProfileItemRef) => ReactNode
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading OKRs">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-card" />
        ))}
      </div>
      <Skeleton className="h-8 w-full max-w-xl" />
      <Skeleton className="h-28 w-full rounded-card" />
      <Skeleton className="h-28 w-full rounded-card" />
    </div>
  )
}

function firstName(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0]
  return first || 'them'
}

export function OkrProfileTab({ userId, timeframeId, renderItemActions }: OkrProfileTabProps) {
  const router = useRouter()
  const { data, isLoading, isError, error, refetch } = useOkrProfile(userId, timeframeId || null)
  const refresh = useRefreshOkrProfile()

  const [filters, setFilters] = useState<OkrProfileFilters>({})
  const [collapsedObjectives, setCollapsedObjectives] = useState<Set<string>>(() => new Set())
  const [expandedKrs, setExpandedKrs] = useState<Set<string>>(() => new Set())
  const [quickView, setQuickView] = useState<OkrQuickViewTarget | null>(null)
  const [closeTarget, setCloseTarget] = useState<OkrCloseTarget | null>(null)
  const [addTarget, setAddTarget] = useState<{ keyResult: OkrProfileKeyResult; kind: ProfileInitiativeKind } | null>(null)
  const [retroTarget, setRetroTarget] = useState<OkrProfilePastObjective | null>(null)

  // Refresh after the global check-in modal (DashboardShell) closes on one of our KRs.
  const pendingCheckIn = useRef<string | null>(null)
  useEffect(
    () =>
      useCheckInPickerStore.subscribe((state, prev) => {
        if (prev.selectedKrId && !state.selectedKrId && pendingCheckIn.current === prev.selectedKrId) {
          pendingCheckIn.current = null
          refresh()
        }
      }),
    [refresh],
  )

  // Refresh when a card opened from the tree was changed in the card modal.
  const openedCard = useRef(false)
  const cardChanged = useRef(false)
  useEffect(
    () =>
      useInitiativeDetailStore.subscribe((state, prev) => {
        if (!openedCard.current) return
        if (state.lastChangeAt !== prev.lastChangeAt) cardChanged.current = true
        if (prev.openId && !state.openId) {
          openedCard.current = false
          if (cardChanged.current) refresh()
          cardChanged.current = false
        }
      }),
    [refresh],
  )

  // "Now" for due-date maths: the payload's generation time, so every row agrees.
  const generatedAt = data?.generatedAt
  const now = useMemo(() => (generatedAt ? new Date(generatedAt) : new Date()), [generatedAt])
  const objectives = useMemo(() => data?.objectives ?? [], [data])
  const filtered = useMemo(() => applyOkrProfileFilters(objectives, filters, now), [objectives, filters, now])
  const filtering = activeFilterCount(filters) > 0
  const supporting = useMemo(
    () => filterSupportingInitiatives(data?.supportingInitiatives ?? [], filters),
    [data, filters],
  )
  const allKrIds = useMemo(() => objectives.flatMap((o) => o.keyResults.map((k) => k.id)), [objectives])
  const allExpanded = allKrIds.length > 0 && allKrIds.every((id) => expandedKrs.has(id))

  const toggleObjective = useCallback((id: string) => {
    setCollapsedObjectives((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const toggleKr = useCallback((id: string) => {
    setExpandedKrs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const actions: OkrTreeActions = useMemo(
    () => ({
      onQuickView: setQuickView,
      onCheckIn: (kr) => {
        pendingCheckIn.current = kr.id
        setQuickView(null)
        useCheckInPickerStore.getState().selectKr(kr.id)
      },
      onClose: (target) => {
        setQuickView(null)
        setCloseTarget(target)
      },
      onAddInitiative: (kr, kind) => setAddTarget({ keyResult: kr, kind }),
      onOpenTodo: (todoId) => {
        openedCard.current = true
        useInitiativeDetailStore.getState().open(todoId)
      },
      onNavigate: (href) => router.push(href),
      renderItemActions,
    }),
    [router, renderItemActions],
  )

  if (isLoading) return <LoadingState />

  if (isError || !data) {
    const status = error instanceof OkrProfileApiError ? error.status : 0
    if (status === 404) {
      return <EmptyState icon={UserX} title="Person or timeframe not found" description="This person may be inactive, or the timeframe no longer exists." />
    }
    if (status === 403) {
      return <EmptyState icon={AlertTriangle} title="OKRs are not available" description="You do not have access to this profile's OKRs." />
    }
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load OKRs"
        description={(error as Error | null)?.message ?? 'Something went wrong.'}
        action={{ label: 'Try again', onClick: () => void refetch() }}
      />
    )
  }

  const subjectName = data.viewer.isSelf ? 'you' : firstName(data.user.name)
  const timeframe = data.timeframe

  return (
    <div className="space-y-5" aria-label="OKR profile">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-section-title font-semibold text-[var(--ap-fg)]">
          OKRs{timeframe ? ` · ${timeframe.name}` : ''}
        </h2>
        {timeframe?.ended && (
          <MiniBadge tone="neutral" title="This timeframe has ended — work is read-only; owners and managers can close OKRs.">
            Ended
          </MiniBadge>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {allKrIds.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpandedKrs(allExpanded ? new Set() : new Set(allKrIds))}
              aria-label={allExpanded ? 'Collapse all key results' : 'Expand all key results'}
            >
              {allExpanded ? <ChevronsDownUp aria-hidden /> : <ChevronsUpDown aria-hidden />}
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link href={explorerHref({ view: 'tree', owner: userId })}>
              <Network aria-hidden />
              Open in Explorer
            </Link>
          </Button>
        </div>
      </div>

      <OkrProfileHeaderStrip header={data.header} subjectName={subjectName} />

      {objectives.length > 0 && (
        <OkrProfileFilterBar filters={filters} onChange={setFilters} shown={filtered.length} total={objectives.length} />
      )}

      {!timeframe ? (
        <EmptyState icon={Target} title="No timeframe yet" description="OKRs are planned per timeframe. Once an administrator creates one, this person's OKRs appear here." />
      ) : objectives.length === 0 ? (
        <EmptyState
          icon={Target}
          title={`No OKRs in ${timeframe.name}`}
          description="A key result is a measurable change that can fail — committed (100% expected) or aspirational (70% = success). Objectives this person owns or contributes a key result to appear here, with their milestones, tasks and recurring duties."
        />
      ) : filtered.length === 0 && filtering ? (
        <EmptyState
          icon={Filter}
          title="No OKRs match these filters"
          description="Try a different level, commitment or status, or clear the filters."
          action={{ label: 'Clear filters', onClick: () => setFilters({}) }}
        />
      ) : (
        <ul className="space-y-3" aria-label="Objectives">
          {filtered.map((o) => (
            <ObjectiveNode
              key={o.id}
              objective={o}
              subjectId={data.user.id}
              collapsed={collapsedObjectives.has(o.id)}
              onToggle={() => toggleObjective(o.id)}
              isKrExpanded={(id) => expandedKrs.has(id)}
              onToggleKr={toggleKr}
              actions={actions}
              now={now}
            />
          ))}
        </ul>
      )}

      {timeframe && <SupportingInitiativesSection initiatives={supporting} actions={actions} now={now} />}

      <PastOkrsSection past={data.past} truncated={data.pastTruncated} onRetrospective={setRetroTarget} />

      <OkrQuickViewDrawer
        target={quickView}
        onClose={() => setQuickView(null)}
        onCheckIn={actions.onCheckIn}
        onCloseFlow={actions.onClose}
      />
      {closeTarget && (
        <OkrCloseModal
          open={!!closeTarget}
          onClose={() => setCloseTarget(null)}
          entityType={closeTarget.entityType}
          entity={closeTarget.entity}
          onInitiated={refresh}
          onCommitted={() => {
            setCloseTarget(null)
            refresh()
          }}
        />
      )}
      <AddInitiativeModal subject={data.user} target={addTarget} onClose={() => setAddTarget(null)} />
      <RetrospectiveModal objective={retroTarget} onClose={() => setRetroTarget(null)} />
    </div>
  )
}

export default OkrProfileTab
