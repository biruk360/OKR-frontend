'use client'

import { Pencil } from 'lucide-react'
import { Button, EmptyState } from '@/components/ui'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { ConnectionsPanel } from '@/components/shared/connections'
import { formatKpiNumber } from '@/lib/kpi/stats'
import { KPI_READING_SOURCE_LABELS } from '@/types/package'
import { useKpiReadings } from '../hooks/queries'
import type { KpiView } from '../types'
import { KpiRagBadge } from './KpiRagBadge'

interface KpiHistoryTableProps {
  kpi: KpiView
  /** Open the reading modal on a past period (only when the viewer may enter readings). */
  onEditReading?: (kpi: KpiView, periodStartKey: string) => void
}

/**
 * KPI detail view: PRF-14 reading history plus the KPI's connections
 * (CON-2 — linked KRs, dependencies, decisions).
 */
export function KpiHistoryTable({ kpi, onEditReading }: KpiHistoryTableProps) {
  return (
    <>
      <KpiReadingsTable kpi={kpi} onEditReading={onEditReading} />
      <div className="border-t p-4" style={{ borderColor: 'var(--ap-border)' }}>
        <ConnectionsPanel entityType="KPI" entityId={kpi.id} variant="section" emptyText="Nothing is linked to this KPI yet." />
      </div>
    </>
  )
}

/** PRF-14 reading history: every reading of one KPI, newest first. */
function KpiReadingsTable({ kpi, onEditReading }: KpiHistoryTableProps) {
  const { data, isLoading, isError, error } = useKpiReadings(kpi.id)
  const rows = data?.data ?? []
  const editable = new Set((data?.enterablePeriods ?? []).map((p) => p.startKey))

  if (isLoading) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }
  if (isError) {
    return <EmptyState bare title="Could not load readings" description={(error as Error)?.message} />
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        bare
        title="No readings yet"
        description={`Readings are taken ${kpi.frequency.toLowerCase()} — one per period.`}
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-body-sm">
        <thead>
          <tr className="border-b text-caption uppercase tracking-wide text-muted-foreground" style={{ borderColor: 'var(--ap-border)' }}>
            <th scope="col" className="px-4 py-2 font-semibold">Period</th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">Value</th>
            <th scope="col" className="px-4 py-2 font-semibold">RAG</th>
            <th scope="col" className="px-4 py-2 font-semibold">Source</th>
            <th scope="col" className="px-4 py-2 font-semibold">Entered by</th>
            <th scope="col" className="px-4 py-2 font-semibold">Note</th>
            <th scope="col" className="px-2 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0" style={{ borderColor: 'var(--ap-border)' }}>
              <td className="whitespace-nowrap px-4 py-2 text-foreground">{r.period.label}</td>
              <td className="px-4 py-2 text-right tabular-nums text-foreground">
                {r.value !== null ? formatKpiNumber(r.value, kpi.unit) : null}
                {r.valueText && (
                  <span className={r.value !== null ? 'block text-caption text-muted-foreground' : undefined}>{r.valueText}</span>
                )}
                {r.value === null && !r.valueText && '—'}
              </td>
              <td className="px-4 py-2">
                <KpiRagBadge rag={r.rag} scored={r.scored} overridden={r.ragOverridden} />
              </td>
              <td className="px-4 py-2 text-muted-foreground">{KPI_READING_SOURCE_LABELS[r.source]}</td>
              <td className="px-4 py-2 text-muted-foreground">
                {r.enteredBy?.name ?? '—'}
                <span className="block text-caption">{new Date(r.updatedAt).toLocaleDateString()}</span>
              </td>
              <td className="max-w-[220px] px-4 py-2 text-muted-foreground">
                <span className="line-clamp-2" title={r.note ?? undefined}>{r.note ?? '—'}</span>
              </td>
              <td className="px-2 py-2 text-right">
                {onEditReading && kpi.permissions.canEnterReading && editable.has(r.period.startKey) && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit reading for ${r.period.label}`}
                    onClick={() => onEditReading(kpi, r.period.startKey)}
                  >
                    <Pencil />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
