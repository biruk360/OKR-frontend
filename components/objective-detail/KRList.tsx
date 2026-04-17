'use client'

import Link from 'next/link'
import { Link2, Plus, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fromDbStatus, statusBadgeClass, statusLabel, statusDotColor } from '@/lib/okr/status'
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

export default function KRList({ keyResults, objectiveId }: Props) {
  // Sort: unassigned → off-track → at-risk → on-track → done
  const sorted = [...keyResults].sort((a, b) => {
    const order = (kr: KR) => {
      if (kr.status !== 'ACTIVE') return 4
      if (kr.confidence === 'OFF_TRACK') return 0
      if (kr.confidence === 'AT_RISK') return 1
      return 2
    }
    return order(a) - order(b)
  })

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Key Results ({keyResults.length})</h3>
        <Link href={`/dashboard/objectives/${objectiveId}`}>
          <Button variant="outline" size="xs">
            <Plus className="size-3" /> Add KR
          </Button>
        </Link>
      </header>

      {sorted.length === 0 ? (
        <div className="p-8 text-center">
          <Link2 className="mx-auto size-8 mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No key results yet. Add your first one to start tracking progress.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {sorted.map((kr) => {
            const status = fromDbStatus(kr.confidence)
            const initials = kr.owner.name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
            const pct = Math.round(kr.progress)

            return (
              <Link
                key={kr.id}
                href={`/dashboard/key-results/${kr.id}`}
                className="group flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
              >
                {/* Status dot */}
                <span className={cn('size-2 rounded-full shrink-0', statusDotColor(status))} />

                {/* Title + owner */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate group-hover:text-primary-600 transition-colors">
                    {kr.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {kr.owner.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={kr.owner.avatar} alt="" className="size-3.5 rounded-full object-cover" />
                      ) : (
                        <span className="flex size-3.5 items-center justify-center rounded-full bg-muted text-[8px] font-semibold">{initials}</span>
                      )}
                      {kr.owner.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {kr.currentValue}/{kr.targetValue} {kr.unit}
                    </span>
                  </div>
                </div>

                {/* Progress bar + percentage */}
                <div className="flex items-center gap-2 shrink-0 w-32">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: status === 'on-track' ? '#059669' : status === 'at-risk' ? '#d97706' : '#dc2626',
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium tabular-nums w-8 text-right">{pct}%</span>
                </div>

                {/* Status badge */}
                <Badge className={cn('shrink-0 text-[10px]', statusBadgeClass(status))}>
                  {statusLabel(status)}
                </Badge>

                <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
