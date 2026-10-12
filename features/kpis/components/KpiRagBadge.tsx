'use client'

import { MiniBadge } from '@/components/ui'
import { kpiRagTone } from '@/lib/kpi/rag'
import { KPI_NOT_SCORED_LABEL, KPI_RAG_LABELS, type KpiRag } from '@/types/package'

interface KpiRagBadgeProps {
  rag: KpiRag | null
  /** False before `scoredFrom` (KPI-2). */
  scored?: boolean
  /** Manual / manager RAG. */
  overridden?: boolean
  className?: string
}

/** RAG chip: ok / warn / danger tokens; "Measured (not scored)" before scoredFrom. */
export function KpiRagBadge({ rag, scored = true, overridden = false, className }: KpiRagBadgeProps) {
  if (!scored) {
    return (
      <MiniBadge tone="neutral" className={className} title="Readings before the scored-from date are not scored">
        {KPI_NOT_SCORED_LABEL}
      </MiniBadge>
    )
  }
  if (!rag) {
    return (
      <MiniBadge tone="neutral" className={className}>
        No RAG
      </MiniBadge>
    )
  }
  return (
    <MiniBadge
      tone={kpiRagTone(rag)}
      className={className}
      title={overridden ? `${KPI_RAG_LABELS[rag]} (set manually)` : KPI_RAG_LABELS[rag]}
    >
      {KPI_RAG_LABELS[rag]}
      {overridden ? ' *' : ''}
    </MiniBadge>
  )
}

/** CSS colour token for a RAG (sparkline stroke). */
export function kpiRagColor(rag: KpiRag | null | undefined): string {
  if (rag === 'GREEN') return 'var(--ap-ok)'
  if (rag === 'AMBER') return 'var(--ap-warn)'
  if (rag === 'RED') return 'var(--ap-danger)'
  return 'var(--ap-accent)'
}
