'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'

interface PortfolioReport {
  id: string
  periodStart: string
  periodEnd: string
  status: string
  aiSummary: string | null
  generatedAt: string
  contentJson: {
    summary?: { projectCount?: number; portfolioSpi?: number | null; clientOwnedPct?: number; totalDelayDays?: number }
    escalations?: string[]
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed: ${res.status}`)
  return json.data as T
}

export function PortfolioReportPanel() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['projects', 'portfolio', 'report'],
    queryFn: () => fetchJson<PortfolioReport[]>('/api/projects/portfolio/report'),
    staleTime: 15_000,
  })
  const generate = useMutation({
    mutationFn: () => fetchJson<PortfolioReport>('/api/projects/portfolio/report', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', 'portfolio', 'report'] })
      toast.success('Portfolio report ready')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <Skeleton className="h-72 w-full rounded-card" />
  const reports = data ?? []

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-section-title text-ink-primary">Cross-Project Performance Report</div>
          <div className="text-body-sm text-ink-tertiary">Portfolio snapshot, trend comparison, and board-pack PDF</div>
        </div>
        <button className="btn btn-primary btn-sm" disabled={generate.isPending} onClick={() => generate.mutate()}>
          <RefreshCw className="mr-1 size-3.5" /> Generate Report
        </button>
      </div>

      {reports.length === 0 ? (
        <EmptyState icon={FileText} title="No portfolio reports yet" description="Generate the first cross-project performance report for the portfolio." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-black/[0.08] text-left text-ink-tertiary">
                <th className="px-2 py-1.5 font-medium">Period</th>
                <th className="px-2 py-1.5 font-medium">Headline</th>
                <th className="px-2 py-1.5 font-medium">Projects</th>
                <th className="px-2 py-1.5 font-medium">SPI</th>
                <th className="px-2 py-1.5 font-medium">Escalations</th>
                <th className="px-2 py-1.5 font-medium">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {reports.map((report) => (
                <tr key={report.id}>
                  <td className="whitespace-nowrap px-2 py-2 text-ink-secondary">{fmtDate(report.periodStart)} - {fmtDate(report.periodEnd)}</td>
                  <td className="max-w-xl px-2 py-2 text-ink-primary">{report.aiSummary}</td>
                  <td className="px-2 py-2 tabular-nums">{report.contentJson?.summary?.projectCount ?? 0}</td>
                  <td className="px-2 py-2 tabular-nums">{report.contentJson?.summary?.portfolioSpi == null ? '-' : report.contentJson.summary.portfolioSpi.toFixed(2)}</td>
                  <td className="px-2 py-2 tabular-nums">{report.contentJson?.escalations?.length ?? 0}</td>
                  <td className="px-2 py-2">
                    <a className="btn btn-outline btn-sm" href={`/api/projects/portfolio/report/${report.id}/pdf`}>
                      <Download className="mr-1 size-3.5" /> PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function fmtDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString()
  } catch {
    return '-'
  }
}
