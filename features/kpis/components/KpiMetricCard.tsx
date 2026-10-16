'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, History, Lock, Pencil, PenLine, Archive, Target } from 'lucide-react'
import { ActionsMenu, Button, MiniBadge } from '@/components/ui'
import { Sparkline } from '@/components/ui/dashboard'
import { ConnectionChips, type ConnectionChipKind } from '@/components/shared/connections'
import { formatKpiNumber } from '@/lib/kpi/stats'
import { KPI_DIRECTION_LABELS, KPI_FREQUENCY_LABELS } from '@/types/package'
import { cn } from '@/lib/utils'
import type { KpiView } from '../types'
import { KpiRagBadge, kpiRagColor } from './KpiRagBadge'
import { KpiSyncedLabel } from './KpiSyncedLabel'

interface KpiMetricCardProps {
  kpi: KpiView
  onEnterReading: (kpi: KpiView) => void
  onEdit: (kpi: KpiView) => void
  onRetire: (kpi: KpiView) => void
  onShowHistory: (kpi: KpiView) => void
  /** Per-card slot, e.g. the package review Agree / Dispute controls (PKG-2). */
  extra?: ReactNode
}

/** The card already links its KR, so the chips skip the duplicate "aligns to". */
const KR_SHOWN_HIDE: readonly ConnectionChipKind[] = ['alignsTo']

function latestValueText(kpi: KpiView): string {
  const latest = kpi.latest
  if (!latest) return '—'
  if (latest.value !== null) return formatKpiNumber(latest.value, kpi.unit)
  return latest.valueText ?? '—'
}

/**
 * KPI-4 card: latest value, target, RAG, 12-reading sparkline, quarter-to-date average,
 * plus the CON-1 connection chips (linked KR, dependencies, decisions).
 */
export function KpiMetricCard({ kpi, onEnterReading, onEdit, onRetire, onShowHistory, extra }: KpiMetricCardProps) {
  const latest = kpi.latest
  const overdue = kpi.overduePeriods.length
  const retired = kpi.status === 'RETIRED'
  const currentEntered = Boolean(kpi.currentReading)
  // Readings come from an integration (Odoo CRM): no manual entry, managers may override the RAG.
  const synced = Boolean(kpi.externalSource)
  const canOverrideSynced = synced && kpi.permissions.canOverrideRag && currentEntered

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-[var(--ap-radius-md)] border bg-card p-4',
        retired && 'opacity-70',
      )}
      style={{ borderColor: 'var(--ap-border)' }}
      aria-label={`KPI ${kpi.name}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {kpi.externalRef && (
              <MiniBadge mono tone="neutral">
                {kpi.externalRef}
              </MiniBadge>
            )}
            {kpi.isSensitive && (
              <MiniBadge tone="accent" title="Sensitive KPI — visible to the owner, their managers and Finance/Executive/Admin">
                <Lock className="mr-1 size-3" aria-hidden />
                Sensitive
              </MiniBadge>
            )}
            {retired && <MiniBadge tone="neutral">Retired</MiniBadge>}
          </div>
          <h3 className="mt-1 text-body font-semibold leading-snug text-foreground">{kpi.name}</h3>
          <p className="text-caption text-muted-foreground">
            {KPI_FREQUENCY_LABELS[kpi.frequency]} · {KPI_DIRECTION_LABELS[kpi.direction]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {extra}
          <ActionsMenu
            label={`Actions for ${kpi.name}`}
            items={[
              { key: 'history', label: 'Reading history', icon: History, onSelect: () => onShowHistory(kpi) },
              {
                key: 'reading',
                label: synced ? 'Override RAG' : 'Enter reading',
                icon: PenLine,
                onSelect: () => onEnterReading(kpi),
                hidden: synced ? !canOverrideSynced : !kpi.permissions.canEnterReading,
              },
              { key: 'edit', label: 'Edit KPI', icon: Pencil, onSelect: () => onEdit(kpi), hidden: !kpi.permissions.canEdit },
              {
                key: 'retire',
                label: 'Retire KPI',
                icon: Archive,
                onSelect: () => onRetire(kpi),
                hidden: !kpi.permissions.canRetire,
                destructive: true,
                divider: true,
              },
            ]}
          />
        </div>
      </header>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            {latest ? `Latest · ${latest.period.label}` : 'Latest'}
          </div>
          <div className="mt-0.5 truncate text-[24px] font-semibold tabular-nums tracking-tight text-foreground" title={latestValueText(kpi)}>
            {latestValueText(kpi)}
          </div>
        </div>
        {latest ? (
          <KpiRagBadge rag={latest.rag} scored={latest.scored} overridden={latest.ragOverridden} />
        ) : (
          <MiniBadge tone="neutral">No readings yet</MiniBadge>
        )}
      </div>

      {kpi.sparkline.length >= 2 && (
        <Sparkline data={kpi.sparkline} color={kpiRagColor(latest?.rag)} height={32} />
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-caption">
        <dt className="text-muted-foreground">Target</dt>
        <dd className="truncate text-right font-medium text-foreground" title={kpi.targetText}>
          {kpi.targetText}
        </dd>
        <dt className="text-muted-foreground">Quarter to date</dt>
        <dd className="text-right font-medium tabular-nums text-foreground">
          {kpi.qtd ? (
            <span title={`${kpi.qtd.quarterLabel} · ${kpi.qtd.count} reading${kpi.qtd.count === 1 ? '' : 's'}`}>
              {formatKpiNumber(kpi.qtd.average, kpi.unit)}
            </span>
          ) : (
            '—'
          )}
        </dd>
        {kpi.baselineText && (
          <>
            <dt className="text-muted-foreground">Baseline</dt>
            <dd className="truncate text-right text-foreground" title={kpi.baselineText}>
              {kpi.baselineText}
            </dd>
          </>
        )}
        {kpi.scoredFrom && (
          <>
            <dt className="text-muted-foreground">Scored from</dt>
            <dd className="text-right text-foreground">{kpi.scoredFrom}</dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap items-center gap-1.5">
        {kpi.keyResult && (
          <Link
            href={`/dashboard/key-results/${encodeURIComponent(kpi.keyResult.id)}`}
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium hover:underline"
            style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent-on-soft)' }}
            title={kpi.keyResult.title}
          >
            <Target className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{kpi.keyResult.title}</span>
          </Link>
        )}
        <ConnectionChips
          entityType="KPI"
          entityId={kpi.id}
          compact
          hide={kpi.keyResult ? KR_SHOWN_HIDE : undefined}
          max={6}
        />
      </div>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: 'var(--ap-border)' }}>
        {synced ? (
          <KpiSyncedLabel kpi={kpi} />
        ) : overdue > 0 ? (
          <span
            className="inline-flex items-center gap-1 text-caption font-medium"
            style={{ color: 'var(--ap-danger-fg)' }}
            title={kpi.overduePeriods.map((p) => p.label).join(', ')}
          >
            <AlertTriangle className="size-3.5" aria-hidden />
            Reading overdue{overdue > 1 ? ` (${overdue})` : ''}
          </span>
        ) : (
          <span className="text-caption text-muted-foreground">
            {kpi.currentPeriod.label}: {currentEntered ? 'entered' : 'no reading yet'}
          </span>
        )}
        {kpi.permissions.canEnterReading && (
          <Button size="sm" variant={currentEntered && overdue === 0 ? 'outline' : 'default'} onClick={() => onEnterReading(kpi)}>
            <PenLine aria-hidden />
            {currentEntered ? 'Update reading' : 'Enter reading'}
          </Button>
        )}
      </footer>
    </article>
  )
}
