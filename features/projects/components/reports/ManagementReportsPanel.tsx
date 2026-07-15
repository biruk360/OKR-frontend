'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Download, FileText, Save, Send, Wand2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import {
  useGenerateManagementReports,
  useManagementReports,
  useUpdateManagementReport,
  type ManagementReportCadence,
  type ProjectReportNode,
} from '../../hooks/useProject'

const CADENCES: ManagementReportCadence[] = ['MONTHLY', 'QUARTERLY']

interface ReportMeta {
  report: ProjectReportNode | null
  title: string
  subtitle: string
}

export function ManagementReportsPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [cadence, setCadence] = useState<ManagementReportCadence>('MONTHLY')
  const { data, isLoading } = useManagementReports(projectId, cadence)
  const generate = useGenerateManagementReports(projectId, cadence)
  const update = useUpdateManagementReport(projectId)

  if (isLoading) return <Skeleton className="h-72 w-full rounded-card" />

  const cards: ReportMeta[] = [
    { report: data?.steeringReport ?? null, title: 'R6 Steering Pack', subtitle: 'Gates, obligations, risks, changes, payments' },
    { report: data?.coeReport ?? null, title: 'R7 COE Report', subtitle: '5-Whys, root causes, systemic fixes' },
    { report: data?.estimationReport ?? null, title: 'R9 Estimation Learning', subtitle: 'Estimate vs actual effort, bias, trend' },
    { report: data?.capacityReport ?? null, title: 'R10 Capacity / Bench', subtitle: 'Allocation, over-capacity, idle bench' },
  ]
  const hasReports = cards.some((card) => card.report)

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-body-sm font-medium text-ink-primary">Steering, COE, Estimation & Capacity</div>
          <div className="text-body-sm text-ink-tertiary">R6/R7/R9/R10 · ProjectReport templates · PDF export</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input h-9" value={cadence} onChange={(e) => setCadence(e.target.value as ManagementReportCadence)}>
            {CADENCES.map((value) => <option key={value} value={value}>{labelize(value)}</option>)}
          </select>
          {canEdit && (
            <button className="btn btn-primary btn-sm" disabled={generate.isPending} onClick={() => generate.mutate()}>
              <Wand2 className="mr-1 size-3.5" /> Generate pack
            </button>
          )}
        </div>
      </div>

      {!hasReports ? (
        <EmptyState icon={FileText} title="No management reports yet" description="Generate the R6/R7/R9/R10 pack for this project." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {cards.map((card) => (
            <ManagementReportCard
              key={card.title}
              projectId={projectId}
              canEdit={canEdit}
              isPending={update.isPending}
              onUpdate={(body) => card.report && update.mutate({ reportId: card.report.id, ...body })}
              {...card}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ManagementReportCard({ projectId, report, title, subtitle, canEdit, isPending, onUpdate }: ReportMeta & {
  projectId: string
  canEdit: boolean
  isPending: boolean
  onUpdate: (body: { action: 'UPDATE_SUMMARY'; aiSummary: string } | { action: 'SUBMIT_REVIEW' | 'APPROVE' | 'SEND' }) => void
}) {
  const [summary, setSummary] = useState(report?.aiSummary ?? '')
  useEffect(() => setSummary(report?.aiSummary ?? ''), [report?.id, report?.aiSummary])
  if (!report) {
    return (
      <div className="rounded-card border border-dashed border-black/[0.14] p-4">
        <div className="text-body-sm font-medium text-ink-primary">{title}</div>
        <div className="text-body-sm text-ink-tertiary">{subtitle}</div>
        <div className="mt-4 text-body-sm text-ink-tertiary">Not generated for this cadence.</div>
      </div>
    )
  }
  const content = report.contentJson as Record<string, any>
  const kpis = kpisFor(report.type, content)
  const summaryChanged = summary.trim() !== (report.aiSummary ?? '').trim()
  return (
    <div className="rounded-card border border-black/[0.08] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-body-sm font-medium text-ink-primary">{title}</div>
          <div className="text-body-sm text-ink-tertiary">{subtitle}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-tertiary">
            <span>{fmtDate(report.periodStart)} - {fmtDate(report.periodEnd)}</span>
            <span className={cn('rounded-pill px-2 py-0.5 font-medium', statusTone(report.status))}>{labelize(report.status)}</span>
            {report.aiSummaryEdited && <span>PM edited</span>}
          </div>
        </div>
        <a className="btn btn-outline btn-sm shrink-0" href={`/api/projects/${projectId}/management-reports/${report.id}/pdf`}>
          <Download className="mr-1 size-3.5" /> PDF
        </a>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {kpis.map((kpi) => <Kpi key={kpi.label} {...kpi} />)}
      </div>
      <textarea
        className="input mt-3 min-h-28 w-full text-body-sm"
        disabled={!canEdit || report.status === 'SENT'}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      {canEdit && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {report.status !== 'SENT' && (
            <button className="btn btn-outline btn-sm" disabled={!summaryChanged || isPending || !summary.trim()} onClick={() => onUpdate({ action: 'UPDATE_SUMMARY', aiSummary: summary })}>
              <Save className="mr-1 size-3.5" /> Save summary
            </button>
          )}
          {report.status === 'DRAFT' && (
            <button className="btn btn-outline btn-sm" disabled={isPending} onClick={() => onUpdate({ action: 'SUBMIT_REVIEW' })}>
              Submit review
            </button>
          )}
          {report.status === 'PM_REVIEW' && (
            <button className="btn btn-primary btn-sm" disabled={isPending} onClick={() => onUpdate({ action: 'APPROVE' })}>
              <CheckCircle2 className="mr-1 size-3.5" /> Approve
            </button>
          )}
          {report.status === 'APPROVED' && (
            <button className="btn btn-primary btn-sm" disabled={isPending} onClick={() => onUpdate({ action: 'SEND' })}>
              <Send className="mr-1 size-3.5" /> Mark sent
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function kpisFor(type: string, content: Record<string, any>): Array<{ label: string; value: string | number; tone?: 'red' | 'yellow' | 'green' | 'gray' }> {
  if (type === 'STEERING') {
    return [
      { label: 'RAG', value: content.health?.ragStatus ?? '-', tone: content.health?.ragStatus === 'RED' ? 'red' : content.health?.ragStatus === 'AMBER' ? 'yellow' : 'green' },
      { label: 'Confidence', value: content.health?.confidence ?? '-' },
      { label: 'Gates', value: content.stageGates?.length ?? 0 },
      { label: 'Client compliance', value: `${content.clientObligations?.complianceRate ?? '-'}%`, tone: content.clientObligations?.ceoWarning ? 'red' : 'green' },
      { label: 'CRs', value: content.changeRequests?.length ?? 0 },
      { label: 'Delay days', value: content.delays?.totalDaysLost ?? 0 },
    ]
  }
  if (type === 'COE') {
    return [
      { label: 'Open', value: content.totals?.open ?? 0 },
      { label: 'In progress', value: content.totals?.inProgress ?? 0 },
      { label: 'Overdue', value: content.totals?.overdue ?? 0, tone: content.totals?.overdue ? 'red' : 'green' },
      { label: 'Days lost', value: content.totals?.daysLost ?? 0 },
      { label: 'Cost impact', value: content.totals?.costImpact ?? 0 },
      { label: 'Lessons', value: content.totals?.lessonsLearned ?? 0 },
    ]
  }
  if (type === 'ESTIMATION') {
    return [
      { label: 'Estimated', value: content.totals?.estimatedItems ?? 0 },
      { label: 'Actuals', value: content.totals?.actualItems ?? 0 },
      { label: 'Avg accuracy', value: content.totals?.averageAccuracy ?? '-' },
      { label: 'Under', value: content.totals?.underEstimated ?? 0, tone: content.totals?.underEstimated ? 'yellow' : 'green' },
      { label: 'Over', value: content.totals?.overEstimated ?? 0 },
      { label: 'Balanced', value: content.totals?.balanced ?? 0 },
    ]
  }
  return [
    { label: 'People', value: content.totals?.people ?? 0 },
    { label: 'Over allocated', value: content.totals?.overAllocatedPeople ?? 0, tone: content.totals?.overAllocatedPeople ? 'red' : 'green' },
    { label: 'Idle', value: content.totals?.idlePeople ?? 0, tone: content.totals?.idlePeople ? 'gray' : 'green' },
    { label: 'Hours', value: content.totals?.totalHours ?? 0 },
    { label: 'Bench', value: content.totals?.benchCandidates ?? 0 },
    { label: 'Weeks', value: content.weeks?.length ?? 0 },
  ]
}

function Kpi({ label, value, tone = 'gray' }: { label: string; value: string | number; tone?: 'red' | 'yellow' | 'green' | 'gray' }) {
  return (
    <div className={cn('rounded-md border p-2', {
      'border-danger-500/20 bg-danger-50 text-danger-700': tone === 'red',
      'border-warning-500/20 bg-warning-50 text-warning-700': tone === 'yellow',
      'border-success-500/20 bg-success-50 text-success-700': tone === 'green',
      'border-black/[0.08] bg-white text-ink-primary': tone === 'gray',
    })}>
      <div className="text-[11px] uppercase text-current/70">{label}</div>
      <div className="text-section-title">{value}</div>
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

function labelize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function statusTone(status: string): string {
  if (status === 'DRAFT') return 'bg-surface-muted text-ink-secondary'
  if (status === 'PM_REVIEW') return 'bg-warning-50 text-warning-700'
  if (status === 'APPROVED') return 'bg-success-50 text-success-700'
  return 'bg-primary-50 text-primary-700'
}
