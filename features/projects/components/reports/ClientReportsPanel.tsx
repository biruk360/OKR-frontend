'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, FileText, Send, Wand2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { AI_SUMMARY_MAX_BULLETS, AI_SUMMARY_MAX_CHARS } from '../../types'
import { useGenerateClientReport, useProjectReports, useUpdateProjectReport, type ProjectReportNode } from '../../hooks/useProject'

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-surface-muted text-ink-secondary',
  PM_REVIEW: 'bg-warning-50 text-warning-700',
  APPROVED: 'bg-success-50 text-success-700',
  SENT: 'bg-primary-50 text-primary-700',
}

export function ClientReportsPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { data, isLoading } = useProjectReports(projectId, 'CLIENT_BIMONTHLY')
  const generate = useGenerateClientReport(projectId)
  const update = useUpdateProjectReport(projectId)
  const reports = data ?? []
  const latest = reports[0] ?? null

  if (isLoading) return <Skeleton className="h-72 w-full rounded-card" />

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-body-sm font-medium text-ink-primary">Bi-Monthly Client Report</div>
          <div className="text-body-sm text-ink-tertiary">AI draft · PM review · approved · sent</div>
        </div>
        {canEdit && (
          <button className="btn btn-primary btn-sm" disabled={generate.isPending} onClick={() => generate.mutate()}>
            <Wand2 className="mr-1 size-3.5" /> Generate draft
          </button>
        )}
      </div>

      {!latest ? (
        <EmptyState icon={FileText} title="No client reports yet" description="Generate the first R2 draft for this project." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <ReportEditor report={latest} canEdit={canEdit} onUpdate={(body) => update.mutate({ reportId: latest.id, ...body })} isPending={update.isPending} />
          <div className="rounded-card border border-black/[0.08] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className={cn('rounded-pill px-2.5 py-1 text-body-sm font-medium', STATUS_TONE[latest.status])}>{labelize(latest.status)}</span>
              {latest.aiSummaryEdited && <span className="text-body-sm text-ink-tertiary">PM edited</span>}
            </div>
            <div className="space-y-1 text-body-sm text-ink-secondary">
              <div>Period: {fmtDate(latest.periodStart)} - {fmtDate(latest.periodEnd)}</div>
              <div>Generated: {fmtDate(latest.generatedAt)}</div>
              <div>Sent: {latest.sentAt ? fmtDate(latest.sentAt) : 'Not sent'}</div>
              <div>Recipients: {latest.sentToEmails.length || 'Pending'}</div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <a className="btn btn-outline btn-sm justify-center" href={`/api/projects/${projectId}/reports/${latest.id}/pdf`}>
                <Download className="mr-1 size-3.5" /> PDF
              </a>
              {canEdit && latest.status === 'DRAFT' && (
                <button className="btn btn-outline btn-sm" disabled={update.isPending} onClick={() => update.mutate({ reportId: latest.id, action: 'SUBMIT_REVIEW' })}>
                  Submit review
                </button>
              )}
              {canEdit && latest.status === 'PM_REVIEW' && (
                <button className="btn btn-primary btn-sm" disabled={update.isPending} onClick={() => update.mutate({ reportId: latest.id, action: 'APPROVE' })}>
                  <CheckCircle2 className="mr-1 size-3.5" /> Approve summary
                </button>
              )}
              {canEdit && latest.status === 'APPROVED' && (
                <button className="btn btn-primary btn-sm" disabled={update.isPending} onClick={() => update.mutate({ reportId: latest.id, action: 'SEND' })}>
                  <Send className="mr-1 size-3.5" /> Send to client
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ReportEditor({
  report,
  canEdit,
  onUpdate,
  isPending,
}: {
  report: ProjectReportNode
  canEdit: boolean
  onUpdate: (body: { action: 'UPDATE_SUMMARY'; aiSummary: string }) => void
  isPending: boolean
}) {
  const [summary, setSummary] = useState(report.aiSummary ?? '')
  useEffect(() => setSummary(report.aiSummary ?? ''), [report.id, report.aiSummary])
  const validation = useMemo(() => validateSummary(summary), [summary])
  const canSave = canEdit && report.status !== 'SENT' && validation.valid && summary.trim() !== (report.aiSummary ?? '').trim()

  return (
    <div>
      <label className="block">
        <span className="text-body-sm font-medium text-ink-primary">AI Executive Summary</span>
        <textarea
          className="input mt-1 min-h-40 w-full"
          value={summary}
          disabled={!canEdit || report.status === 'SENT'}
          onChange={(e) => setSummary(e.target.value)}
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className={cn('text-body-sm', validation.valid ? 'text-ink-tertiary' : 'text-danger-600')}>
          {validation.bullets}/{AI_SUMMARY_MAX_BULLETS} bullets · {summary.length}/{AI_SUMMARY_MAX_CHARS} chars
          {!validation.valid && ` · ${validation.errors.join(', ')}`}
        </div>
        {canEdit && report.status !== 'SENT' && (
          <button className="btn btn-outline btn-sm" disabled={!canSave || isPending} onClick={() => onUpdate({ action: 'UPDATE_SUMMARY', aiSummary: summary })}>
            Save summary
          </button>
        )}
      </div>
    </div>
  )
}

function validateSummary(summary: string): { valid: boolean; bullets: number; errors: string[] } {
  const lines = summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const bulletLines = lines.filter((line) => /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
  const bullets = bulletLines.length || lines.length
  const errors: string[] = []
  if (!summary.trim()) errors.push('required')
  if (bullets > AI_SUMMARY_MAX_BULLETS) errors.push('too many bullets')
  if (summary.length > AI_SUMMARY_MAX_CHARS) errors.push('too long')
  return { valid: errors.length === 0, bullets, errors }
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
