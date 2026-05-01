'use client'

import { Fragment, useState } from 'react'
import { ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import SideDrawer from '@/components/ui/SideDrawer'
import { useInitiativeDetailStore } from '@/lib/stores/initiative-detail-store'
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

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 100)
  const tone = pct >= 70 ? 'var(--ap-ok)' : pct >= 40 ? 'var(--ap-warn)' : 'var(--ap-danger)'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full" style={{ background: 'var(--ap-border-strong)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: tone }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>{pct}%</span>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ background: 'var(--ap-accent)/15', color: 'var(--ap-accent)', backgroundColor: 'rgba(0,122,255,0.12)' }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

// ─── Detail drawer content ────────────────────────────────────────────────────

function DetailDrawerContent({ item }: { item: FilteredResult }) {
  const isObj = item.entityType === 'objectives'
  const isKr  = item.entityType === 'key-results'
  const tone  = isKr ? (CONFIDENCE_TONE[item.confidence ?? ''] ?? 'none') : 'none'
  const statusLabel = isKr
    ? (CONFIDENCE_LABEL[item.confidence ?? ''] ?? 'Pending')
    : (item.workStatus ?? '—')

  return (
    <div className="flex flex-col gap-5 p-1 text-sm">
      {/* Entity type badge + status */}
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
          style={{ background: 'var(--ap-accent)/10', color: 'var(--ap-accent)', backgroundColor: 'rgba(0,122,255,0.10)' }}
        >
          {isObj ? 'Objective' : isKr ? 'Key Result' : 'Initiative'}
        </span>
        <StatusPill tone={tone} label={statusLabel} />
      </div>

      {/* Title */}
      <h2 className="text-[17px] font-semibold leading-snug" style={{ color: 'var(--ap-fg)' }}>
        {item.title}
      </h2>

      {/* Meta fields */}
      <div
        className="divide-y rounded-[var(--ap-radius-md)]"
        style={{ border: '1px solid var(--ap-border)' }}
      >
        <MetaRow label="Plan">{item.planName}</MetaRow>
        {item.ownerName && <MetaRow label="Owner"><span className="flex items-center gap-1.5"><Avatar name={item.ownerName} />{item.ownerName}</span></MetaRow>}
        {isObj && item.progress !== undefined && (
          <MetaRow label="Progress"><ProgressBar value={item.progress} /></MetaRow>
        )}
        {isKr && item.confidence && (
          <MetaRow label="Confidence"><StatusPill tone={tone} label={CONFIDENCE_LABEL[item.confidence] ?? item.confidence} /></MetaRow>
        )}
        {isKr && item.progress !== undefined && (
          <MetaRow label="Progress"><ProgressBar value={item.progress} /></MetaRow>
        )}
      </div>

      {/* Open full page link */}
      <a
        href={
          isObj ? `/dashboard/objectives/${item.id}`
          : isKr ? `/dashboard/objectives?kr=${item.id}`
          : `/dashboard/my-tasks`
        }
        className="flex items-center gap-1.5 self-start text-xs font-medium"
        style={{ color: 'var(--ap-accent)' }}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink className="size-3.5" />
        Open full page
      </a>
    </div>
  )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="w-24 shrink-0 text-xs font-medium" style={{ color: 'var(--ap-fg-subtle)' }}>{label}</span>
      <span className="flex-1 text-sm" style={{ color: 'var(--ap-fg)' }}>{children}</span>
    </div>
  )
}

// ─── Group header ─────────────────────────────────────────────────────────────

function PlanGroupHeader({ planName, count, open, onToggle }: { planName: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="sticky top-9 z-[5] flex w-full items-center gap-2 border-b px-5 py-2 text-left transition-colors hover:bg-black/[0.02]"
      style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg)' }}
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

// ─── Result row ───────────────────────────────────────────────────────────────

function ResultRow({ item, tab, onOpen }: { item: FilteredResult; tab: FiltersTab; onOpen: () => void }) {
  const isDone = item.workStatus === 'Done'

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'ap-hover-lift group flex w-full items-center border-b px-5 py-3.5 text-left transition-all duration-[var(--ap-duration-base)]',
        isDone && 'opacity-55'
      )}
      style={{ borderColor: 'var(--ap-border)' }}
    >
      {/* Col 1 – Title + optional owner mini badge */}
      <div className="min-w-0 flex-1 pr-4">
        <p
          className={cn('truncate text-[13px] font-medium leading-snug', isDone && 'line-through')}
          style={{ color: 'var(--ap-fg)' }}
          title={item.title}
        >
          {item.title}
        </p>
      </div>

      {/* Col 2 – Owner */}
      <div className="flex w-40 shrink-0 items-center gap-1.5 overflow-hidden pr-4">
        {item.ownerName ? (
          <>
            <Avatar name={item.ownerName} />
            <span className="truncate text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
              {item.ownerName}
            </span>
          </>
        ) : (
          <span className="text-xs" style={{ color: 'var(--ap-border-strong)' }}>—</span>
        )}
      </div>

      {/* Col 3 – Status / Progress */}
      <div className="w-36 shrink-0">
        {tab === 'objectives' ? (
          <ProgressBar value={item.progress ?? 0} />
        ) : tab === 'key-results' ? (
          <StatusPill
            tone={CONFIDENCE_TONE[item.confidence ?? ''] ?? 'none'}
            label={CONFIDENCE_LABEL[item.confidence ?? ''] ?? 'Pending'}
          />
        ) : (
          <StatusPill
            tone={WORK_STATUS_TONE[item.workStatus ?? ''] ?? 'none'}
            label={item.workStatus ?? '—'}
          />
        )}
      </div>
    </button>
  )
}

// ─── Grouped list ─────────────────────────────────────────────────────────────

function groupByPlan(results: FilteredResult[]) {
  const map = new Map<string, { planName: string; items: FilteredResult[] }>()
  for (const r of results) {
    const key = r.planId || 'unknown'
    if (!map.has(key)) map.set(key, { planName: r.planName || 'No Plan', items: [] })
    map.get(key)!.items.push(r)
  }
  return map
}

const COL_HEADERS: Record<FiltersTab, [string, string, string]> = {
  objectives:    ['Objective',  'Owner', 'Progress'],
  'key-results': ['Key Result', 'Owner', 'Status'],
  initiatives:   ['Initiative', 'Owner', 'Status'],
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface ResultsListProps {
  results: FilteredResult[]
  tab: FiltersTab
  onReset: () => void
}

export function ResultsList({ results, tab, onReset }: ResultsListProps) {
  const [selected, setSelected] = useState<FilteredResult | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  function openItem(item: FilteredResult) {
    if (item.entityType === 'initiatives') {
      useInitiativeDetailStore.getState().open(item.id)
    } else {
      setSelected(item)
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

  const grouped = groupByPlan(results)
  const [col1, col2, col3] = COL_HEADERS[tab]

  return (
    <>
      <div className="flex-1 overflow-auto">
        {/* Column headers */}
        <div
          className="sticky top-0 z-10 flex items-center border-b px-5 py-2.5 backdrop-blur"
          style={{
            borderColor: 'var(--ap-border)',
            background: 'rgba(242,242,247,0.85)',
          }}
        >
          <span className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>{col1}</span>
          <span className="w-40 shrink-0 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>{col2}</span>
          <span className="w-36 shrink-0 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>{col3}</span>
        </div>

        {Array.from(grouped.entries()).map(([planId, { planName, items }]) => {
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
                <ResultRow key={item.id} item={item} tab={tab} onOpen={() => openItem(item)} />
              ))}
            </Fragment>
          )
        })}

        {/* Bottom padding */}
        <div className="h-12" />
      </div>

      {/* Detail side drawer for objectives & KRs */}
      <SideDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        width="md"
      >
        {selected && <DetailDrawerContent item={selected} />}
      </SideDrawer>
    </>
  )
}
