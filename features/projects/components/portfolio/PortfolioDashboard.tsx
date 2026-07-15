'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePortfolioDashboard } from '../../hooks/usePortfolioDashboard'
import { PortfolioChartsLibrary } from '../charts/PortfolioChartsLibrary'
import { PortfolioFilters } from './PortfolioFilters'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { RagBadge } from '../ProjectBadges'
import type { PortfolioDashboardFilters } from '@/lib/projects/portfolio-dashboard'

export function PortfolioDashboard() {
  const [filters, setFilters] = useState<PortfolioDashboardFilters>({})
  const { data, isLoading, isError } = usePortfolioDashboard(filters)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-card" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-card border border-danger-200 bg-danger-50 p-6">
        <div className="flex items-center gap-2 text-danger-700">
          <AlertTriangle className="size-5" />
          <span>Could not load portfolio dashboard.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PortfolioFilters filters={filters} onChange={setFilters} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Active Projects" value={data.summary.projectCount} tone="blue" />
        <SummaryCard
          label="Portfolio SPI"
          value={data.summary.portfolioSpi != null ? data.summary.portfolioSpi.toFixed(2) : '—'}
          tone={data.summary.portfolioSpi == null || data.summary.portfolioSpi >= 0.95 ? 'green' : data.summary.portfolioSpi >= 0.85 ? 'orange' : 'red'}
        />
        <SummaryCard
          label="Client-Owned Delay"
          value={`${data.summary.clientOwnedPct}%`}
          tone={data.summary.clientOwnedPct > 50 ? 'red' : data.summary.clientOwnedPct > 25 ? 'orange' : 'green'}
        />
        <SummaryCard label="Total Delay Days" value={data.summary.totalDelayDays} tone="muted" />
      </div>

      <PortfolioChartsLibrary data={data} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-card border border-surface-border bg-surface-card p-4 shadow-card">
          <h3 className="mb-3 text-body font-semibold text-ink-primary">Projects</h3>
          {data.projects.length === 0 ? (
            <EmptyState title="No projects" description="No active projects match the current filters." bare className="py-6" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead>
                  <tr className="border-b border-surface-border text-ink-tertiary">
                    <th className="py-2 pr-4 font-medium">Code</th>
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Client</th>
                    <th className="py-2 pr-4 font-medium">PM</th>
                    <th className="py-2 pr-4 font-medium">%</th>
                    <th className="py-2 pr-4 font-medium">SPI</th>
                    <th className="py-2 font-medium">RAG</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((p) => (
                    <tr key={p.id} className="border-b border-surface-border/50">
                      <td className="py-2 pr-4">
                        <Link href={`/dashboard/projects/${p.id}`} className="text-primary-600 hover:underline">
                          {p.code}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{p.name}</td>
                      <td className="py-2 pr-4">{p.clientName}</td>
                      <td className="py-2 pr-4">{p.projectManagerName ?? '—'}</td>
                      <td className="py-2 pr-4">{p.percentComplete.toFixed(0)}%</td>
                      <td className="py-2 pr-4">{p.spi != null ? p.spi.toFixed(2) : '—'}</td>
                      <td className="py-2">
                        <RagBadge rag={p.ragStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <EscalationsPanel escalations={data.escalations} />
      </div>
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone: 'blue' | 'green' | 'orange' | 'red' | 'muted' }) {
  const toneClass = {
    blue: 'border-primary-200 bg-primary-50 text-primary-700',
    green: 'border-success-200 bg-success-50 text-success-700',
    orange: 'border-warning-200 bg-warning-50 text-warning-700',
    red: 'border-danger-200 bg-danger-50 text-danger-700',
    muted: 'border-surface-border bg-surface-hover text-ink-secondary',
  }[tone]

  return (
    <div className={cn('rounded-card border p-4', toneClass)}>
      <div className="text-body-xs font-medium opacity-80">{label}</div>
      <div className="mt-1 text-[28px] font-semibold">{value}</div>
    </div>
  )
}

function EscalationsPanel({ escalations }: { escalations: string[] }) {
  return (
    <div className="rounded-card border border-surface-border bg-surface-card p-4 shadow-card">
      <h3 className="mb-3 flex items-center gap-2 text-body font-semibold text-ink-primary">
        <AlertTriangle className="size-4 text-danger-500" />
        Escalations
      </h3>
      {escalations.length === 0 ? (
        <p className="text-body-sm text-ink-secondary">No escalations.</p>
      ) : (
        <ul className="space-y-2">
          {escalations.map((e, i) => (
            <li key={i} className="rounded-md bg-danger-50 px-3 py-2 text-body-sm text-danger-700">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

