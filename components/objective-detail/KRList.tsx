'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Link2, Plus, ChevronRight, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fromDbStatus, type ComputedStatus } from '@/lib/okr/status'
import { cn } from '@/lib/utils'

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
}

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

export default function KRList({ keyResults, objectiveId }: Props) {
  const [density, setDensity] = useState<'rich' | 'compact'>('rich')

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

  const active = keyResults.filter(k => k.status === 'ACTIVE')
  const avgProgress = active.length
    ? Math.round(active.reduce((s, k) => s + k.progress, 0) / active.length) : 0
  const onTrackCount = active.filter(k => k.confidence === 'ON_TRACK').length
  const avgConfidence = active.length
    ? Math.round((onTrackCount / active.length) * 100) : 0

  return (
    <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex items-baseline gap-2">
          <h3 className="text-[13px] font-semibold">Key Results</h3>
          <span className="text-[12px] text-muted-foreground tabular-nums">{keyResults.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Rich/Compact segmented control */}
          <div
            className="inline-flex items-center rounded-[10px] p-0.5 text-[11px] font-medium"
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
          <Button variant="outline" size="sm" className="h-7 px-2 rounded-[10px] text-[11px]">
            <Filter className="size-3 mr-1" /> Filter
          </Button>
          <Link href={`/dashboard/objectives/${objectiveId}`}>
            <Button size="sm" className="h-7 px-2 rounded-[10px] text-[11px]">
              <Plus className="size-3 mr-1" /> Add KR
            </Button>
          </Link>
        </div>
      </header>

      {/* Column header */}
      {sorted.length > 0 && (
        <div
          className="grid items-center gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b"
          style={{
            borderColor: 'var(--ap-border)',
            background: 'var(--ap-bg-sunken)',
            gridTemplateColumns: '32px minmax(0,1fr) 110px 200px 16px',
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
        <div className="p-10 text-center">
          <Link2 className="mx-auto size-8 mb-2 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">
            No key results yet. Add your first one to start tracking progress.
          </p>
        </div>
      ) : (
        <div>
          {sorted.map((kr, idx) => {
            const status = fromDbStatus(kr.confidence)
            const initials = initialsOf(kr.owner.name)
            const pct = Math.round(kr.progress)
            const barColor = statusBarColor(status)
            const krBadgeBg = status === 'on-track' || status === 'completed' ? 'rgba(52,199,89,0.12)'
              : status === 'at-risk' ? 'rgba(255,149,0,0.12)' : 'rgba(255,59,48,0.12)'

            return (
              <Link
                key={kr.id}
                href={`/dashboard/key-results/${kr.id}`}
                className={cn(
                  'group ap-hover-lift grid items-center gap-3 border-b transition-colors hover:bg-[var(--ap-bg-hover)]',
                  density === 'rich' ? 'px-4 py-3.5' : 'px-4 py-2.5',
                )}
                style={{
                  borderColor: 'var(--ap-border-soft)',
                  gridTemplateColumns: '32px minmax(0,1fr) 110px 200px 16px',
                }}
              >
                {/* Status + index */}
                <div className="flex items-center gap-1.5">
                  <StatusDot status={status} />
                  <span className="text-[10px] tabular-nums text-muted-foreground font-mono">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                </div>

                {/* Title block */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 text-[10px]">
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
                    'text-[13px] font-medium leading-snug group-hover:text-[var(--ap-accent)] transition-colors',
                    density === 'rich' ? 'line-clamp-2' : 'line-clamp-1',
                  )}>
                    {kr.title}
                  </p>
                </div>

                {/* Owner */}
                <div className="flex items-center gap-2 min-w-0">
                  {kr.owner.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={kr.owner.avatar} alt={kr.owner.name}
                      className="size-5 rounded-full object-cover" title={kr.owner.name} />
                  ) : (
                    <span
                      title={kr.owner.name}
                      className="flex size-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                      style={{ background: 'var(--ap-accent)' }}
                    >{initials}</span>
                  )}
                  <span className="text-[12px] text-muted-foreground truncate">{kr.owner.name}</span>
                </div>

                {/* Progress */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ap-kr-bar-bg)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                  </div>
                  <span className="text-[12px] font-semibold tabular-nums w-10 text-right">{pct}%</span>
                </div>

                <ChevronRight className="size-3.5 text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      )}

      {/* Footer aggregates */}
      {sorted.length > 0 && (
        <footer
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t text-[11px]"
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
    </section>
  )
}
