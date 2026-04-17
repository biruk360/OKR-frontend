'use client'

import Link from 'next/link'
import { AlertTriangle, TrendingDown, Clock, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export interface NeedsAttentionItem {
  id: string
  title: string
  type: 'objective' | 'key_result' | 'todo'
  reason: 'off_track' | 'at_risk' | 'overdue' | 'blocked'
  progress: number
  ownerName?: string
  href: string
}

interface Props {
  items: NeedsAttentionItem[]
}

const reasonConfig: Record<NeedsAttentionItem['reason'], { label: string; className: string; icon: typeof AlertTriangle }> = {
  off_track: { label: 'Off track', className: 'bg-red-100 text-red-700', icon: TrendingDown },
  at_risk: { label: 'At risk', className: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700', icon: Clock },
  blocked: { label: 'Blocked', className: 'bg-orange-100 text-orange-700', icon: AlertTriangle },
}

export default function NeedsAttention({ items }: Props) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Needs Attention</h3>
        <span className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </header>
      {items.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm text-muted-foreground">Everything is on track. Nice work!</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 8).map((item) => {
            const config = reasonConfig[item.reason]
            const Icon = config.icon
            return (
              <li key={`${item.type}-${item.id}`}>
                <Link
                  href={item.href}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors"
                >
                  <Icon className="size-4 shrink-0 mt-0.5 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${config.className}`}>
                        {config.label}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {Math.round(item.progress)}%
                      </span>
                      {item.ownerName && (
                        <span className="text-xs text-muted-foreground truncate">{item.ownerName}</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="size-3.5 shrink-0 mt-1 text-muted-foreground" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
