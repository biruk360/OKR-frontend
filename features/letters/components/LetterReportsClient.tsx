'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, Clock, Download, FileText, Send } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Button,
  EmptyState,
  FilterSelect,
  Input,
  Label,
  PageHeader,
  StatCard,
  StatGrid,
} from '@/components/ui'
import { SkeletonChart } from '@/components/ui/Skeleton'
import { chartAxisTick, chartColors, chartTooltipStyle } from '@/lib/chart-colors'
import { toCsv, downloadCsv } from '@/components/reports/report-csv'
import type { LetterTypeRecord } from '@/types'
import type { LetterReport } from '../types'
import { getLetterReport, listLetterTypes } from '../services/lettersApi'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  SENT: 'Sent',
  ARCHIVED: 'Archived',
}

function fmtHours(h: number | null): string {
  if (h === null) return '—'
  if (h < 48) return `${h.toFixed(1)} h`
  return `${(h / 24).toFixed(1)} d`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

/**
 * FR-16 Letters reporting. Every number is computed server-side over exactly
 * the letters the viewer can read in the list (same scope rule). Filters apply
 * to the letter date.
 */
export default function LetterReportsClient() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [typeId, setTypeId] = useState<string | undefined>(undefined)
  const [types, setTypes] = useState<LetterTypeRecord[]>([])
  const [report, setReport] = useState<LetterReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listLetterTypes().then(setTypes).catch(() => setTypes([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getLetterReport({ from: from || undefined, to: to || undefined, letterTypeId: typeId })
      .then((r) => { if (!cancelled) setReport(r) })
      .catch((e) => { if (!cancelled) { setReport(null); setError(e instanceof Error ? e.message : 'Could not load report') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [from, to, typeId])

  const statusData = useMemo(
    () => (report?.byStatus ?? []).map((s) => ({ name: STATUS_LABEL[s.status] ?? s.status, count: s.count })),
    [report],
  )
  const monthData = useMemo(
    () => (report?.byMonth ?? []).map((m) => ({ name: monthLabel(m.month), month: m.month, count: m.total, sent: m.sent })),
    [report],
  )
  const typeData = useMemo(
    () => (report?.byType ?? []).map((t) => ({ name: t.name, count: t.count })),
    [report],
  )

  function exportCsv() {
    if (!report) return
    const sections: string[] = []
    const range = `${report.filters.from ?? 'start'} to ${report.filters.to ?? 'today'}`
    sections.push(toCsv(['Letters report', range], [['Total letters', report.total]]))
    sections.push(toCsv(['Status', 'Letters'], report.byStatus.map((s) => [STATUS_LABEL[s.status] ?? s.status, s.count])))
    sections.push(toCsv(['Letter type', 'Code', 'Letters'], report.byType.map((t) => [t.name, t.code, t.count])))
    sections.push(toCsv(['Month', 'Letters', 'Sent or archived'], report.byMonth.map((m) => [m.month, m.total, m.sent])))
    sections.push(toCsv(['Customer', 'Letters'], report.byCustomer.map((c) => [c.customer, c.count])))
    sections.push(toCsv(
      ['Preparer', 'Total', 'Draft', 'Submitted', 'Approved', 'Sent', 'Archived'],
      report.preparers.map((p) => [p.name, p.total, p.draft, p.submitted, p.approved, p.sent, p.archived]),
    ))
    sections.push(toCsv(
      ['Signatory', 'Assigned', 'Approved or later', 'Sent', 'Avg submit→approve (hours)'],
      report.signatories.map((s) => [s.name, s.total, s.approvedOrLater, s.sent, s.avgSubmitToApproveHours]),
    ))
    const t = report.turnaround
    sections.push(toCsv(['Turnaround', 'Letters measured', 'Average (hours)', 'Median (hours)'], [
      ['Submitted → approved', t.submitToApprove.count, t.submitToApprove.avgHours, t.submitToApprove.medianHours],
      ['Approved → sent', t.approveToSend.count, t.approveToSend.avgHours, t.approveToSend.medianHours],
      ['Submitted → sent', t.submitToSend.count, t.submitToSend.avgHours, t.submitToSend.medianHours],
    ]))
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`letters-report-${stamp}.csv`, sections.join('\r\n\r\n'))
  }

  const sentCount = report ? (report.byStatus.find((s) => s.status === 'SENT')?.count ?? 0) + (report.byStatus.find((s) => s.status === 'ARCHIVED')?.count ?? 0) : 0
  const pending = report?.byStatus.find((s) => s.status === 'SUBMITTED')?.count ?? 0

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Letter reports"
        description="Volumes, workflow turnaround and who prepares and signs — for the letters you can see."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/letters">
              <Button variant="outline" className="h-10">
                <ArrowLeft className="mr-1.5 size-3.5" /> Letters
              </Button>
            </Link>
            <Button className="h-10" onClick={exportCsv} disabled={!report || report.total === 0}>
              <Download className="mr-1.5 size-4" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* Filters — one row above the charts */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="lr-from" className="text-xs">From</Label>
          <Input id="lr-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lr-to" className="text-xs">To</Label>
          <Input id="lr-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <FilterSelect
          label="Type"
          value={typeId}
          onValueChange={setTypeId}
          placeholder="All types"
          options={types.map((t) => ({ value: t.id, label: t.name, hint: t.code }))}
        />
        {(from || to || typeId) && (
          <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); setTypeId(undefined) }}>
            Clear filters
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-card border border-danger-200 bg-danger-50 px-3 py-2 text-body-sm text-danger-700" role="alert">
          {error}
        </div>
      )}

      {report?.truncated && (
        <div className="rounded-card border border-warning-200 bg-warning-50 px-3 py-2 text-body-sm text-warning-700">
          Only the most recent letters in this range were included. Narrow the date range for complete figures.
        </div>
      )}

      {loading && !report ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      ) : !report || report.total === 0 ? (
        !error && (
          <EmptyState icon={BarChart3} title="No letters in this range" description="Try a wider date range or another letter type." />
        )
      ) : (
        <>
          <StatGrid>
            <StatCard label="Letters" value={report.total} icon={FileText} tone="blue" />
            <StatCard label="Awaiting approval" value={pending} icon={Clock} tone="yellow" />
            <StatCard label="Sent or archived" value={sentCount} icon={Send} tone="green" />
            <StatCard
              label="Median submit → approve"
              value={fmtHours(report.turnaround.submitToApprove.medianHours)}
              helperText={`${report.turnaround.submitToApprove.count} letters measured`}
              icon={Clock}
              tone="gray"
            />
          </StatGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Letters by month" subtitle="By letter date">
              <SingleBarChart data={monthData} />
            </ChartCard>
            <ChartCard title="Letters by status">
              <SingleBarChart data={statusData} horizontal />
            </ChartCard>
            <ChartCard title="Letters by type">
              <SingleBarChart data={typeData} horizontal />
            </ChartCard>
            <ChartCard title="Workflow turnaround" subtitle="From the activity log; resubmissions measured from the approved submission">
              <DataTable
                header={['Stage', 'Letters', 'Average', 'Median']}
                rows={[
                  ['Submitted → approved', report.turnaround.submitToApprove],
                  ['Approved → sent', report.turnaround.approveToSend],
                  ['Submitted → sent', report.turnaround.submitToSend],
                ].map(([label, s]) => {
                  const st = s as LetterReport['turnaround']['submitToApprove']
                  return [label as string, st.count, fmtHours(st.avgHours), fmtHours(st.medianHours)]
                })}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="By preparer">
              <DataTable
                header={['Preparer', 'Total', 'Draft', 'Submitted', 'Approved', 'Sent', 'Archived']}
                rows={report.preparers.map((p) => [p.name, p.total, p.draft, p.submitted, p.approved, p.sent, p.archived])}
              />
            </ChartCard>
            <ChartCard title="By signatory">
              <DataTable
                header={['Signatory', 'Assigned', 'Approved+', 'Sent', 'Avg submit → approve']}
                rows={report.signatories.map((s) => [s.name, s.total, s.approvedOrLater, s.sent, fmtHours(s.avgSubmitToApproveHours)])}
                empty="No signatories assigned in this range."
              />
            </ChartCard>
            <ChartCard title="Top customers">
              <DataTable
                header={['Customer', 'Letters']}
                rows={report.byCustomer.map((c) => [c.customer, c.count])}
              />
            </ChartCard>
            <ChartCard title="Monthly detail">
              <DataTable
                header={['Month', 'Letters', 'Sent or archived']}
                rows={report.byMonth.map((m) => [monthLabel(m.month), m.total, m.sent])}
              />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border bg-card p-4 shadow-card" style={{ borderColor: 'var(--ap-border)' }}>
      <header className="mb-3">
        <h3 className="text-body-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-caption text-muted-foreground">{subtitle}</p>}
      </header>
      {children}
    </section>
  )
}

/** One series, one hue (accent) — identity is carried by the axis labels. */
function SingleBarChart({ data, horizontal = false }: { data: Array<{ name: string; count: number }>; horizontal?: boolean }) {
  const height = horizontal ? Math.max(160, data.length * 34 + 24) : 240
  return (
    <div style={{ height }} role="img" aria-label={data.map((d) => `${d.name}: ${d.count}`).join(', ')}>
      <ResponsiveContainer width="100%" height="100%">
        {horizontal ? (
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={chartColors.grid} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={chartAxisTick} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={110} tick={chartAxisTick} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: chartColors.track }} contentStyle={chartTooltipStyle} formatter={(v) => [v, 'Letters']} />
            <Bar dataKey="count" fill={chartColors.accent} radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={chartColors.grid} vertical={false} />
            <XAxis dataKey="name" tick={chartAxisTick} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={chartAxisTick} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: chartColors.track }} contentStyle={chartTooltipStyle} formatter={(v) => [v, 'Letters']} />
            <Bar dataKey="count" fill={chartColors.accent} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

function DataTable({
  header,
  rows,
  empty = 'No data.',
}: {
  header: string[]
  rows: Array<Array<string | number | null>>
  empty?: string
}) {
  if (rows.length === 0) return <p className="text-body-sm text-muted-foreground">{empty}</p>
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-body-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b text-left text-caption uppercase tracking-wide text-muted-foreground" style={{ borderColor: 'var(--ap-border)' }}>
            {header.map((h, i) => (
              <th key={h} className={i === 0 ? 'py-1.5 pr-3 font-medium' : 'px-2 py-1.5 text-right font-medium'}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b last:border-0" style={{ borderColor: 'var(--ap-border)' }}>
              {r.map((c, ci) => (
                <td key={ci} className={ci === 0 ? 'py-1.5 pr-3 text-foreground' : 'px-2 py-1.5 text-right tabular-nums text-foreground'}>
                  {c ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
