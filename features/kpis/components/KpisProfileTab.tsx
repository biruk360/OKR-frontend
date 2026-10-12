'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CircleDot, Gauge, Plus, XCircle } from 'lucide-react'
import { Button, ConfirmDialog, EmptyState, MiniBadge, SectionHeading, StatCard, StatGrid } from '@/components/ui'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { countKpiHealth } from '@/lib/kpi/stats'
import { KPI_TYPES, KPI_TYPE_LABELS } from '@/types/package'
import { useKpis, useRetireKpi } from '../hooks/queries'
import type { KpiApiError } from '../services/api'
import type { KpiView } from '../types'
import { KpiFormModal } from './KpiFormModal'
import { KpiHistoryTable } from './KpiHistoryTable'
import { KpiMetricCard } from './KpiMetricCard'
import { KpiReadingModal } from './KpiReadingModal'

export interface KpisProfileTabProps {
  userId: string
  timeframeId: string
  /** Per-KPI slot, e.g. the package review Agree / Dispute controls (PKG-2). */
  renderItemActions?: (kpi: KpiView) => ReactNode
}

/** Workbook definition (§0) — shown in the empty state and under the heading. */
const KPI_BUCKET_DESCRIPTION =
  'A standard held every week; quarterly averages feed the performance review (50% weight).'

/**
 * PRF-14 KPIs tab: KPI cards (KPI-4) grouped Leading / Lagging, "Enter reading"
 * for the current period, and a reading history table. Actions appear only when
 * the API's `permissions` allow them.
 */
export function KpisProfileTab({ userId, timeframeId, renderItemActions }: KpisProfileTabProps) {
  const [includeRetired, setIncludeRetired] = useState(false)
  const query = useKpis({ userId, timeframeId: timeframeId || null, includeRetired })
  const retire = useRetireKpi()

  const [formState, setFormState] = useState<{ open: boolean; kpi: KpiView | null }>({ open: false, kpi: null })
  const [readingState, setReadingState] = useState<{ kpi: KpiView | null; periodKey: string | null }>({
    kpi: null,
    periodKey: null,
  })
  const [retiring, setRetiring] = useState<KpiView | null>(null)
  const [historyKpiId, setHistoryKpiId] = useState<string | null>(null)

  const kpis = useMemo(() => query.data?.data ?? [], [query.data])
  const permissions = query.data?.permissions
  const resolvedTimeframeId = query.data?.timeframe?.id ?? timeframeId

  useEffect(() => {
    if (kpis.length === 0) {
      setHistoryKpiId(null)
    } else if (!historyKpiId || !kpis.some((k) => k.id === historyKpiId)) {
      setHistoryKpiId(kpis[0].id)
    }
  }, [kpis, historyKpiId])

  const active = kpis.filter((k) => k.status === 'ACTIVE')
  const health = countKpiHealth(active.map((k) => k.latest?.rag ?? null))
  const overdue = active.reduce((sum, k) => sum + k.overduePeriods.length, 0)
  const historyKpi = kpis.find((k) => k.id === historyKpiId) ?? null

  // Keep the reading modal's KPI fresh after a save (list refetch).
  const readingKpi = readingState.kpi ? kpis.find((k) => k.id === readingState.kpi?.id) ?? readingState.kpi : null

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (query.isError) {
    const status = (query.error as KpiApiError | null)?.status
    return (
      <EmptyState
        icon={Gauge}
        title={status === 403 ? 'KPIs are not visible to you' : 'Could not load KPIs'}
        description={status === 403 ? 'Only the person, their managers and their department can see these KPIs.' : (query.error as Error)?.message}
        action={status === 403 ? undefined : { label: 'Try again', onClick: () => query.refetch() }}
      />
    )
  }

  const canCreate = Boolean(permissions?.canCreate) && Boolean(resolvedTimeframeId)
  const openCreate = () => setFormState({ open: true, kpi: null })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-section-title font-semibold text-foreground">KPIs</h2>
          <p className="text-body-sm text-muted-foreground">{KPI_BUCKET_DESCRIPTION}</p>
          {permissions?.timeframeEnded && (
            <p className="mt-1 text-caption text-muted-foreground">This timeframe has ended — definitions are read-only.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
            <input type="checkbox" checked={includeRetired} onChange={(e) => setIncludeRetired(e.target.checked)} />
            Show retired
          </label>
          {canCreate && (
            <Button size="sm" onClick={openCreate}>
              <Plus aria-hidden />
              Add KPI
            </Button>
          )}
        </div>
      </div>

      {kpis.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="No KPIs for this timeframe"
          description={KPI_BUCKET_DESCRIPTION}
          action={canCreate ? { label: 'Add KPI', onClick: openCreate } : undefined}
        />
      ) : (
        <>
          <StatGrid columns={4}>
            <StatCard label="On target" value={health.green} tone="green" icon={CheckCircle2} />
            <StatCard label="Near target" value={health.amber} tone="yellow" icon={CircleDot} />
            <StatCard label="Off target" value={health.red} tone="red" icon={XCircle} />
            <StatCard
              label="Readings overdue"
              value={overdue}
              tone={overdue > 0 ? 'red' : 'gray'}
              icon={AlertTriangle}
              helperText={health.notScored ? `${health.notScored} not scored yet` : undefined}
            />
          </StatGrid>

          {KPI_TYPES.map((type) => {
            const group = kpis.filter((k) => k.kpiType === type)
            if (group.length === 0) return null
            return (
              <section key={type} aria-labelledby={`kpi-group-${type}`} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 id={`kpi-group-${type}`} className="text-body font-semibold text-foreground">
                    {KPI_TYPE_LABELS[type]}
                  </h3>
                  <MiniBadge mono>{group.length}</MiniBadge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {group.map((kpi) => (
                    <KpiMetricCard
                      key={kpi.id}
                      kpi={kpi}
                      extra={renderItemActions?.(kpi)}
                      onEnterReading={(k) => setReadingState({ kpi: k, periodKey: null })}
                      onEdit={(k) => setFormState({ open: true, kpi: k })}
                      onRetire={setRetiring}
                      onShowHistory={(k) => {
                        setHistoryKpiId(k.id)
                        document.getElementById('kpi-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                    />
                  ))}
                </div>
              </section>
            )
          })}

          <section id="kpi-history" className="rounded-[var(--ap-radius-md)] border bg-card" style={{ borderColor: 'var(--ap-border)' }}>
            <SectionHeading
              title="Reading history"
              right={
                <select
                  aria-label="KPI"
                  className="input h-8 w-auto max-w-[260px] py-1 text-body-sm"
                  value={historyKpiId ?? ''}
                  onChange={(e) => setHistoryKpiId(e.target.value)}
                >
                  {kpis.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.externalRef ? `${k.externalRef} · ` : ''}
                      {k.name}
                    </option>
                  ))}
                </select>
              }
            />
            {historyKpi && (
              <KpiHistoryTable
                kpi={historyKpi}
                onEditReading={(k, periodKey) => setReadingState({ kpi: k, periodKey })}
              />
            )}
          </section>
        </>
      )}

      {resolvedTimeframeId && (
        <KpiFormModal
          open={formState.open}
          onClose={() => setFormState({ open: false, kpi: null })}
          ownerId={userId}
          timeframeId={formState.kpi?.timeframeId ?? resolvedTimeframeId}
          kpi={formState.kpi}
          canManageSensitive={Boolean(permissions?.canManageSensitive)}
          hasReadings={Boolean(formState.kpi?.latest)}
        />
      )}

      <KpiReadingModal
        open={Boolean(readingState.kpi)}
        kpi={readingKpi}
        initialPeriodKey={readingState.periodKey}
        onClose={() => setReadingState({ kpi: null, periodKey: null })}
      />

      <ConfirmDialog
        open={Boolean(retiring)}
        onClose={() => setRetiring(null)}
        onConfirm={async () => {
          if (!retiring) return
          await retire.mutateAsync(retiring.id)
          setRetiring(null)
        }}
        title="Retire KPI"
        message={retiring ? `Retire “${retiring.name}”?` : ''}
        description="It stops asking for readings. Its reading history is kept."
        variant="warning"
        confirmLabel="Retire"
        isLoading={retire.isPending}
      />
    </div>
  )
}
