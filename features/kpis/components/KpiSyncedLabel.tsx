'use client'

import { RefreshCw } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { KpiView } from '../types'

/**
 * "Synced from Odoo CRM · last update 3 hours ago" — shown on KPIs whose
 * readings come from an integration (`Kpi.externalSource`). Renders nothing
 * for manually entered KPIs.
 */
export function KpiSyncedLabel({ kpi, className }: { kpi: Pick<KpiView, 'externalSource' | 'syncedAt'>; className?: string }) {
  if (!kpi.externalSource) return null
  const when = kpi.syncedAt ? new Date(kpi.syncedAt) : null
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-caption text-muted-foreground', className)}
      title={when ? `Last synced ${when.toLocaleString()}. Readings are written by the daily Odoo sync; manual entry is disabled.` : 'Readings are written by the daily Odoo sync; manual entry is disabled.'}
    >
      <RefreshCw className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      Synced from Odoo CRM · {when ? `last update ${formatRelativeTime(when)}` : 'not synced yet'}
    </span>
  )
}
