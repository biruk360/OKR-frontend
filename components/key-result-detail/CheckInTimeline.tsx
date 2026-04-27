'use client'

import { format } from 'date-fns'
import { Activity } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatAxisValue } from '@/lib/keyResultChart'

interface CheckIn {
  id: string
  asOfDate: string | Date
  value: number
  confidence: string | null
  confidenceScore?: number | null
  analysis?: string | null
  createdBy?: { name?: string | null; avatar?: string | null } | null
}

interface Props {
  checkIns: CheckIn[]
  unit: string
}

function confidenceNumber(c: CheckIn): number {
  if (typeof c.confidenceScore === 'number') return c.confidenceScore
  if (c.confidence === 'ON_TRACK') return 85
  if (c.confidence === 'AT_RISK') return 55
  if (c.confidence === 'OFF_TRACK') return 25
  return 50
}

function dotColor(c: CheckIn): string {
  const n = confidenceNumber(c)
  if (n >= 70) return 'var(--ap-green)'
  if (n >= 40) return 'var(--ap-orange)'
  return 'var(--ap-red)'
}

function pillStyle(c: string | null | undefined): { bg: string; fg: string; label: string } {
  if (c === 'ON_TRACK') return { bg: 'rgba(52,199,89,0.12)', fg: 'var(--ap-green)', label: 'On track' }
  if (c === 'AT_RISK') return { bg: 'rgba(255,149,0,0.12)', fg: 'var(--ap-orange)', label: 'At risk' }
  if (c === 'OFF_TRACK') return { bg: 'rgba(255,59,48,0.12)', fg: 'var(--ap-red)', label: 'Off track' }
  return { bg: 'var(--ap-bg-sunken)', fg: 'var(--ap-fg-muted)', label: '—' }
}

export default function CheckInTimeline({ checkIns, unit }: Props) {
  const ordered = [...checkIns].sort(
    (a, b) => new Date(b.asOfDate).getTime() - new Date(a.asOfDate).getTime(),
  )

  if (ordered.length === 0) {
    return (
      <EmptyState
        bare
        icon={Activity}
        title="No check-ins yet"
        description="Update progress to log a check-in"
      />
    )
  }

  return (
    <ol className="relative ml-2 pl-5" style={{ borderLeft: '2px solid var(--ap-border)' }}>
      {ordered.map((c, i) => {
        const prev = ordered[i + 1]
        const delta = prev ? c.value - prev.value : null
        const pill = pillStyle(c.confidence)
        return (
          <li key={c.id} className="relative pb-5 last:pb-0">
            <span
              className="absolute -left-[27px] top-1 inline-block size-3 rounded-full ring-4"
              style={{
                background: dotColor(c),
                ['--tw-ring-color' as any]: 'var(--ap-bg-raised)',
              } as any}
            />
            <div className="flex flex-wrap items-baseline gap-1.5 text-[11px] text-muted-foreground">
              <time className="tabular-nums">{format(new Date(c.asOfDate), 'MMM d, yyyy')}</time>
              <span>·</span>
              <span>{c.createdBy?.name ?? 'Unknown'}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              {prev ? (
                <span
                  className="text-[15px] font-semibold tabular-nums"
                  style={{ letterSpacing: '-0.01em' }}
                >
                  {unit && <span className="text-[11px] text-muted-foreground font-normal mr-0.5">{unit}</span>}
                  {formatAxisValue(prev.value)} → {formatAxisValue(c.value)}
                  {delta !== null && (
                    <span
                      className="ml-2 text-[11px] font-semibold tabular-nums rounded-full px-1.5 py-0.5"
                      style={{
                        background: delta >= 0 ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.12)',
                        color: delta >= 0 ? 'var(--ap-green)' : 'var(--ap-red)',
                      }}
                    >
                      {delta >= 0 ? '+' : ''}
                      {formatAxisValue(delta)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-[15px] font-semibold tabular-nums" style={{ letterSpacing: '-0.01em' }}>
                  {unit && <span className="text-[11px] text-muted-foreground font-normal mr-0.5">{unit}</span>}
                  {formatAxisValue(c.value)}
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: pill.bg, color: pill.fg }}
              >
                <span className="size-1.5 rounded-full" style={{ background: pill.fg }} />
                {pill.label}
              </span>
            </div>
            {c.analysis && (
              <p className="mt-1.5 text-[12px] text-muted-foreground italic whitespace-pre-wrap">{c.analysis}</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
