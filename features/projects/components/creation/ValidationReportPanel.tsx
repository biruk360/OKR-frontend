'use client'

import { AlertTriangle, Download, Info, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ProjectCreationValidationJson } from '@/lib/projects/creation-normalize'

interface ValidationReportPanelProps {
  validation: ProjectCreationValidationJson
  sourceFileName?: string | null
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function validationReportCsv(validation: ProjectCreationValidationJson): string {
  const headers = ['Severity', 'Source Row', 'Field', 'Original Value', 'Issue', 'Suggested Correction', 'Code']
  return [
    headers.map(cell).join(','),
    ...validation.issues.map((item) => [
      item.severity,
      item.sourceRow ?? '',
      item.field ?? '',
      item.originalValue ?? '',
      item.message,
      item.suggestedCorrection ?? '',
      item.code,
    ].map(cell).join(',')),
  ].join('\n')
}

function originalValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Blank'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function ValidationReportPanel({
  validation,
  sourceFileName,
}: ValidationReportPanelProps) {
  const blocking = validation.issues.filter((item) => item.severity === 'BLOCKING').length
  const warnings = validation.issues.filter((item) => item.severity === 'WARNING').length
  const information = validation.issues.filter((item) => item.severity === 'INFO').length
  if (validation.issues.length === 0) return null

  const download = () => {
    const blob = new Blob([validationReportCsv(validation)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${(sourceFileName || 'project-schedule').replace(/\.[^.]+$/, '')}-validation-report.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-card border border-border bg-surface-card p-5 shadow-card" aria-labelledby="validation-report-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            blocking ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-700',
          )}>
            {blocking ? <ShieldAlert className="size-5" strokeWidth={1.75} /> : <AlertTriangle className="size-5" strokeWidth={1.75} />}
          </span>
          <div>
            <h3 id="validation-report-title" className="text-section-title text-ink-primary">Validation report</h3>
            <p className="mt-1 text-body-sm text-ink-secondary">
              {blocking
                ? 'Project creation is blocked until every blocking error is corrected and the file is validated again.'
                : 'The schedule can continue to review. Warnings remain visible for acknowledgement.'}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={download}>
          <Download data-icon="inline-start" /> Download error report
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-card bg-danger-50 px-3 py-2">
          <dt className="text-overline text-danger-700">Blocking</dt>
          <dd className="mt-1 text-section-title tabular-nums text-danger-700">{blocking}</dd>
        </div>
        <div className="rounded-card bg-warning-50 px-3 py-2">
          <dt className="text-overline text-warning-700">Warnings</dt>
          <dd className="mt-1 text-section-title tabular-nums text-warning-700">{warnings}</dd>
        </div>
        <div className="rounded-card bg-surface-muted px-3 py-2">
          <dt className="text-overline text-ink-tertiary">Information</dt>
          <dd className="mt-1 text-section-title tabular-nums text-ink-primary">{information}</dd>
        </div>
      </dl>

      <div className="mt-4 max-h-[26rem] overflow-auto rounded-card border border-border">
        <div className="grid min-w-[58rem] grid-cols-[6rem_8rem_10rem_12rem_minmax(16rem,1fr)_minmax(16rem,1fr)] gap-3 border-b border-border bg-surface-muted px-4 py-2 text-overline text-ink-secondary">
          <span>Severity</span><span>Source row</span><span>Field</span><span>Original value</span><span>Issue</span><span>Suggested correction</span>
        </div>
        {validation.issues.map((item) => (
          <div key={item.id} className="grid min-w-[58rem] grid-cols-[6rem_8rem_10rem_12rem_minmax(16rem,1fr)_minmax(16rem,1fr)] gap-3 border-b border-border px-4 py-3 text-body-sm last:border-0">
            <span className={cn(
              item.severity === 'BLOCKING' && 'font-semibold text-danger-700',
              item.severity === 'WARNING' && 'font-semibold text-warning-700',
              item.severity === 'INFO' && 'text-ink-secondary',
            )}>
              {item.severity}
            </span>
            <span className="tabular-nums text-ink-secondary">{item.sourceRow ?? 'Draft'}</span>
            <span className="font-medium text-ink-primary">{item.field ?? 'General'}</span>
            <span className="break-words text-ink-secondary">{originalValue(item.originalValue)}</span>
            <span className="text-ink-primary">{item.message}</span>
            <span className="text-ink-secondary">{item.suggestedCorrection ?? 'Review this item.'}</span>
          </div>
        ))}
      </div>

      {blocking > 0 && (
        <p className="mt-4 flex items-start gap-2 text-body-sm text-danger-700">
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          Correct the source spreadsheet, then choose it again. The private draft and this report remain saved until replaced or discarded.
        </p>
      )}
    </section>
  )
}
