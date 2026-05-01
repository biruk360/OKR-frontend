'use client'

import { Fragment, useState } from 'react'
import { ChevronRight, ChevronDown, Target, Flag, CheckSquare, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInitiativeDetailStore } from '@/lib/stores/initiative-detail-store'
import { ObjectiveDetailModal } from './ObjectiveDetailModal'
import { KeyResultDetailModal } from './KeyResultDetailModal'
import type { FilteredResult, FiltersTab } from '../types'

// ─── Status helpers ───────────────────────────────────────────────────────────

const CONFIDENCE_TONE: Record<string, string> = {
  ON_TRACK:  'ontrack',
  AT_RISK:   'atrisk',
  OFF_TRACK: 'offtrack',
}
const CONFIDENCE_LABEL: Record<string, string> = {
  ON_TRACK:  'On Track',
  AT_RISK:   'At Risk',
  OFF_TRACK: 'Off Track',
}
const WORK_STATUS_TONE: Record<string, string> = {
  Done:         'ontrack',
  'In Progress':'accent',
  'In Review':  'accent',
  Ready:        'ontrack',
  Blocked:      'offtrack',
  Backlog:      'none',
  Planned:      'none',
  Abandoned:    'none',
}

function StatusPill({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="ap-status-pill" data-tone={tone}>
      {label}
    </span>
  )
}

function ProgressBar({ value, width = 80 }: { value: number; width?: number }) {
  const pct = Math.min(Math.max(value, 0), 100)
  const tone = pct >= 70 ? 'var(--ap-ok)' : pct >= 40 ? 'var(--ap-warn)' : 'var(--ap-danger)'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 shrink-0 overflow-hidden rounded-full" style={{ width, background: 'var(--ap-border-strong)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: tone }} />
      </div>
      <span className="w-9 text-right text-xs font-semibold tabular-nums" style={{ color: 'var(--ap-fg-muted)' }}>{pct}%</span>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ backgroundColor: 'rgba(0,122,255,0.12)', color: 'var(--ap-accent)' }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

// ─── Group headers ────────────────────────────────────────────────────────────

function PlanGroupHeader({ planName, count, open, onToggle }: { planName: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="sticky top-9 z-[5] flex w-full items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-black/[0.02]"
      style={{ background: 'var(--ap-bg)' }}
    >
      {open
        ? <ChevronDown className="size-3.5 shrink-0" style={{ color: 'var(--ap-fg-subtle)' }} />
        : <ChevronRight className="size-3.5 shrink-0" style={{ color: 'var(--ap-fg-subtle)' }} />
      }
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-fg-muted)' }}>
        {planName}
      </span>
      <span
        className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
        style={{ background: 'var(--ap-border-strong)', color: 'var(--ap-fg-subtle)' }}
      >
        {count}
      </span>
    </button>
  )
}

function ObjectiveGroupHeader({
  obj, count, open, onToggle, onOpenObjective,
}: {
  obj: { id: string; title: string; progress?: number; confidence?: string; timeframeName?: string }
  count: number; open: boolean; onToggle: () => void; onOpenObjective?: () => void
}) {
  const tone = CONFIDENCE_TONE[obj.confidence ?? ''] ?? 'none'
  return (
    <div
      className="sticky top-9 z-[5] mb-2 flex items-center gap-3 rounded-[var(--ap-radius-md)] px-3.5 py-2.5"
      style={{
        background: 'linear-gradient(180deg, rgba(0,122,255,0.06), rgba(0,122,255,0.02))',
        border: '1px solid rgba(0,122,255,0.18)',
        boxShadow: 'var(--ap-shadow-sm)',
      }}
    >
      <button type="button" onClick={onToggle} className="shrink-0 rounded-md p-0.5 hover:bg-black/5">
        {open
          ? <ChevronDown className="size-4" style={{ color: 'var(--ap-fg-muted)' }} />
          : <ChevronRight className="size-4" style={{ color: 'var(--ap-fg-muted)' }} />
        }
      </button>
      <Flag className="size-4 shrink-0" style={{ color: 'var(--ap-accent)' }} />
      <button
        type="button"
        onClick={onOpenObjective}
        className="min-w-0 flex-1 text-left"
        title={obj.title}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ap-accent)' }}>
          Objective {obj.timeframeName ? `· ${obj.timeframeName}` : ''}
        </p>
        <p className="truncate text-[14px] font-semibold leading-snug" style={{ color: 'var(--ap-fg)' }}>
          {obj.title}
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-3">
        {obj.progress !== undefined && <ProgressBar value={obj.progress} width={64} />}
        <StatusPill tone={tone} label={CONFIDENCE_LABEL[obj.confidence ?? ''] ?? 'Pending'} />
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{ background: 'rgba(0,122,255,0.12)', color: 'var(--ap-accent)' }}
        >
          {count} KR{count !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ item, tab, onOpen }: { item: FilteredResult; tab: FiltersTab; onOpen: () => void }) {
  const isDone = item.workStatus === 'Done'
  const confTone = CONFIDENCE_TONE[item.confidence ?? ''] ?? 'none'
  const confLabel = CONFIDENCE_LABEL[item.confidence ?? ''] ?? 'Pending'

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'ap-hover-lift group mb-2 flex w-full items-center gap-4 rounded-[var(--ap-radius-md)] px-4 py-3 text-left transition-all duration-[var(--ap-duration-base)]',
        isDone && 'opacity-60'
      )}
      style={{
        background: '#ffffff',
        border: '1px solid var(--ap-border)',
        boxShadow: 'var(--ap-shadow-sm)',
      }}
    >
      {/* Title block */}
      <div className="min-w-0 flex-1">
        <p
          className={cn('truncate text-[13px] font-semibold leading-snug', isDone && 'line-through')}
          style={{ color: 'var(--ap-fg)' }}
          title={item.title}
        >
          {item.title}
        </p>
        {/* Sub-line: KR value or initiative count */}
        {tab === 'key-results' && item.targetValue !== undefined && (
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>
            <span className="font-semibold" style={{ color: 'var(--ap-fg-muted)' }}>
              {item.currentValue ?? 0}
            </span>
            {' / '}
            {item.targetValue}
            {item.unit ?? '%'}
            {item.initiativeCount !== undefined && item.initiativeCount > 0 && (
              <>
                {' · '}
                <CheckSquare className="inline size-3" /> {item.initiativeCount} init
              </>
            )}
          </p>
        )}
        {tab === 'objectives' && (item.krCount ?? 0) > 0 && (
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>
            <Target className="inline size-3" /> {item.krCount} key result{item.krCount !== 1 ? 's' : ''}
            {item.level && ` · ${item.level.toLowerCase()}`}
          </p>
        )}
      </div>

      {/* Owner */}
      <div className="flex w-36 shrink-0 items-center gap-1.5 overflow-hidden">
        {item.ownerName ? (
          <>
            <Avatar name={item.ownerName} />
            <span className="truncate text-xs" style={{ color: 'var(--ap-fg-muted)' }}>
              {item.ownerName}
            </span>
          </>
        ) : (
          <>
            <User className="size-4" style={{ color: 'var(--ap-border-strong)' }} />
            <span className="text-xs italic" style={{ color: 'var(--ap-border-strong)' }}>Unassigned</span>
          </>
        )}
      </div>

      {/* Confidence (KR + Obj only) */}
      {tab !== 'initiatives' && (
        <div className="w-24 shrink-0">
          <StatusPill tone={confTone} label={confLabel} />
        </div>
      )}

      {/* Progress */}
      <div className="w-32 shrink-0">
        {tab === 'initiatives' ? (
          <StatusPill
            tone={WORK_STATUS_TONE[item.workStatus ?? ''] ?? 'none'}
            label={item.workStatus ?? '—'}
          />
        ) : (
          <ProgressBar value={item.progress ?? 0} width={72} />
        )}
      </div>
    </button>
  )
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

function groupByPlan(results: FilteredResult[]) {
  const map = new Map<string, { planName: string; items: FilteredResult[] }>()
  for (const r of results) {
    const key = r.planId || 'unknown'
    if (!map.has(key)) map.set(key, { planName: r.planName || 'No Plan', items: [] })
    map.get(key)!.items.push(r)
  }
  return map
}

interface ObjGroup {
  id: string; title: string; progress?: number; confidence?: string; timeframeName?: string
  items: FilteredResult[]
}

function groupByObjective(results: FilteredResult[]): Map<string, ObjGroup> {
  const map = new Map<string, ObjGroup>()
  for (const r of results) {
    const key = r.objectiveId || 'unknown'
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        title: r.objectiveTitle || 'Unattached',
        progress: r.objectiveProgress,
        confidence: r.objectiveConfidence,
        timeframeName: r.timeframeName,
        items: [],
      })
    }
    map.get(key)!.items.push(r)
  }
  return map
}

const COL_HEADERS: Record<FiltersTab, [string, string, string, string]> = {
  objectives:    ['Objective',  'Owner', 'Confidence', 'Progress'],
  'key-results': ['Key Result', 'Owner', 'Confidence', 'Progress'],
  initiatives:   ['Initiative', 'Owner', '',           'Status'],
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface ResultsListProps {
  results: FilteredResult[]
  tab: FiltersTab
  onReset: () => void
}

export function ResultsList({ results, tab, onReset }: ResultsListProps) {
  const [selectedObjId, setSelectedObjId] = useState<string | null>(null)
  const [selectedKrId, setSelectedKrId] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  function openItem(item: FilteredResult) {
    if (item.entityType === 'initiatives') {
      useInitiativeDetailStore.getState().open(item.id)
    } else if (item.entityType === 'objectives') {
      setSelectedObjId(item.id)
    } else {
      setSelectedKrId(item.id)
    }
  }

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }))
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <div
          className="flex size-14 items-center justify-center rounded-2xl text-2xl"
          style={{ background: 'var(--ap-border)', color: 'var(--ap-fg-subtle)' }}
        >
          🔍
        </div>
        <div className="text-center">
          <p className="font-semibold" style={{ color: 'var(--ap-fg)' }}>No results</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--ap-fg-subtle)' }}>Try adjusting or resetting your filters.</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85"
          style={{ background: 'var(--ap-accent)' }}
        >
          Reset filters
        </button>
      </div>
    )
  }

  const [col1, col2, col3, col4] = COL_HEADERS[tab]

  return (
    <>
      <div className="flex-1 overflow-auto px-5 pt-3">
        {/* Column headers */}
        <div
          className="sticky top-0 z-10 mb-2 flex items-center gap-4 px-4 py-2 backdrop-blur"
          style={{ background: 'rgba(242,242,247,0.85)', borderRadius: 'var(--ap-radius-sm)' }}
        >
          <span className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>{col1}</span>
          <span className="w-36 shrink-0 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>{col2}</span>
          {col3 && <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>{col3}</span>}
          <span className="w-32 shrink-0 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>{col4}</span>
        </div>

        {tab === 'key-results' ? (
          /* Group by objective */
          Array.from(groupByObjective(results).values()).map((g) => {
            const isOpen = openGroups[g.id] ?? true
            return (
              <Fragment key={g.id}>
                <ObjectiveGroupHeader
                  obj={g}
                  count={g.items.length}
                  open={isOpen}
                  onToggle={() => toggleGroup(g.id)}
                  onOpenObjective={() => g.id !== 'unknown' && setSelectedObjId(g.id)}
                />
                {isOpen && (
                  <div className="pl-4 pb-1">
                    {g.items.map((item) => (
                      <ResultCard key={item.id} item={item} tab={tab} onOpen={() => openItem(item)} />
                    ))}
                  </div>
                )}
              </Fragment>
            )
          })
        ) : (
          /* Group by plan/timeframe */
          Array.from(groupByPlan(results).entries()).map(([planId, { planName, items }]) => {
            const isOpen = openGroups[planId] ?? true
            return (
              <Fragment key={planId}>
                <PlanGroupHeader
                  planName={planName}
                  count={items.length}
                  open={isOpen}
                  onToggle={() => toggleGroup(planId)}
                />
                {isOpen && items.map((item) => (
                  <ResultCard key={item.id} item={item} tab={tab} onOpen={() => openItem(item)} />
                ))}
              </Fragment>
            )
          })
        )}

        <div className="h-12" />
      </div>

      <ObjectiveDetailModal
        objectiveId={selectedObjId}
        onClose={() => setSelectedObjId(null)}
        onOpenKr={(krId) => { setSelectedObjId(null); setSelectedKrId(krId) }}
      />
      <KeyResultDetailModal
        krId={selectedKrId}
        onClose={() => setSelectedKrId(null)}
      />
    </>
  )
}
