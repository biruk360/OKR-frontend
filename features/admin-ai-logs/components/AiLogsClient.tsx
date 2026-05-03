'use client'

import { useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatGrid } from '@/components/ui/StatGrid'
import { StatCard } from '@/components/ui/StatCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AiLogRow } from '../types'

interface ListResponse {
  success: boolean
  data: AiLogRow[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

const FEATURE_OPTIONS = [
  { value: 'ALL', label: 'All features' },
  { value: 'SPRINT_PLAN', label: 'Sprint plan' },
]

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'OK', label: 'OK' },
  { value: 'ERROR', label: 'Error' },
]

const PROVIDER_OPTIONS = [
  { value: 'ALL', label: 'All providers' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
]

const PROVIDER_BADGE_CLASS: Record<string, string> = {
  anthropic: 'bg-amber-100 text-amber-900',
  openai: 'bg-emerald-100 text-emerald-900',
  gemini: 'bg-sky-100 text-sky-900',
}

export function AiLogsClient() {
  const [page, setPage] = useState(1)
  const [feature, setFeature] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [provider, setProvider] = useState('ALL')
  const limit = 25

  const queryString = useMemo(() => {
    const sp = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (feature !== 'ALL') sp.set('feature', feature)
    if (status !== 'ALL') sp.set('status', status)
    if (provider !== 'ALL') sp.set('provider', provider)
    return sp.toString()
  }, [page, feature, status, provider])

  const { data, isLoading, isError, refetch } = useQuery<ListResponse>({
    queryKey: ['ai-logs', queryString],
    queryFn: async () => {
      const res = await fetch(`/api/admin/ai-logs?${queryString}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load AI logs')
      return res.json()
    },
    placeholderData: keepPreviousData,
  })

  const rows = data?.data ?? []
  const pagination = data?.pagination

  const aggregates = useMemo(() => {
    if (!rows.length) return null
    const total = rows.length
    const totalCost = rows.reduce((acc, r) => acc + (r.costUsd || 0), 0)
    const latencies = rows.map((r) => r.latencyMs).filter((v): v is number => typeof v === 'number')
    const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null
    const inputSum = rows.reduce((a, r) => a + r.inputTokens, 0)
    const cacheSum = rows.reduce((a, r) => a + r.cachedTokens, 0)
    const cacheHit = inputSum > 0 ? (cacheSum / inputSum) * 100 : 0
    const errorRate = (rows.filter((r) => r.status === 'ERROR').length / total) * 100
    return {
      totalGenerations: total,
      totalCostUsd: totalCost,
      avgLatencyMs: avgLatency,
      cacheHitPct: cacheHit,
      errorRate,
    }
  }, [rows])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="AI Generation Logs"
        description="Audit every AI call across the system — token usage, cost, cache-hit rate, latency, errors. See docs/AI_SPRINT_PLANNING.md §3.6."
      />

      {aggregates && (
        <div className="mb-6">
          <StatGrid columns={5}>
            <StatCard label="Generations (page)" value={String(aggregates.totalGenerations)} icon={Sparkles} />
            <StatCard label="Cost (page)" value={`$${aggregates.totalCostUsd.toFixed(4)}`} />
            <StatCard
              label="Avg latency"
              value={aggregates.avgLatencyMs ? `${Math.round(aggregates.avgLatencyMs)} ms` : '—'}
            />
            <StatCard label="Cache hit" value={`${aggregates.cacheHitPct.toFixed(1)}%`} />
            <StatCard
              label="Error rate"
              value={`${aggregates.errorRate.toFixed(1)}%`}
              icon={aggregates.errorRate > 0 ? AlertCircle : CheckCircle2}
            />
          </StatGrid>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Select
            value={feature}
            onValueChange={(v) => {
              setFeature(v)
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Feature" />
            </SelectTrigger>
            <SelectContent>
              {FEATURE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v)
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Select
            value={provider}
            onValueChange={(v) => {
              setProvider(v)
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Failed to load"
          description="Could not load AI generation logs. Try refreshing."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No AI generations yet"
          description="Once the AI Sprint Planning feature is enabled and used, every call will appear here with full token, cost, and latency telemetry."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Feature</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2 text-right">Input</th>
                <th className="px-3 py-2 text-right">Cached</th>
                <th className="px-3 py-2 text-right">Output</th>
                <th className="px-3 py-2 text-right">Cache %</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2 text-right">Latency</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.user.name}</div>
                    <div className="text-xs text-muted-foreground">{r.user.email}</div>
                  </td>
                  <td className="px-3 py-2">{r.feature}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        PROVIDER_BADGE_CLASS[r.provider] ?? 'bg-muted text-foreground'
                      }`}
                    >
                      {r.provider}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.modelId}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.inputTokens.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.cachedTokens.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.outputTokens.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.cacheHitPct.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums">${r.costUsd.toFixed(4)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.latencyMs != null ? `${r.latencyMs} ms` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {r.status === 'OK' ? (
                      <span className="inline-flex items-center gap-1 text-success-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> OK
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-danger-700"
                        title={r.errorMessage ?? 'Error'}
                      >
                        <AlertCircle className="h-3.5 w-3.5" /> Error
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} — {pagination.total} rows
          </span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
