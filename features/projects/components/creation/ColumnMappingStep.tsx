'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { ArrowLeft, CheckCircle2, Columns, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  ProjectCreationImportMappingSelection,
  ProjectCreationSpreadsheetInspection,
} from '@/lib/projects/creation-import'

interface ColumnMappingStepProps {
  inspection: ProjectCreationSpreadsheetInspection
  isSubmitting?: boolean
  isAiPending?: boolean
  aiError?: string | null
  onRequestAiMapping: () => Promise<void>
  onApprove: (mapping: ProjectCreationImportMappingSelection[]) => Promise<void>
  onBack: () => void
}

interface MappingFormValues {
  rows: Array<{
    target: ProjectCreationImportMappingSelection['target']
    sourceColumnKey: string
  }>
}

function defaultValues(inspection: ProjectCreationSpreadsheetInspection): MappingFormValues {
  return {
    rows: inspection.mapping.map((row) => ({
      target: row.target,
      sourceColumnKey: row.sourceColumnKey ?? '',
    })),
  }
}

export function ColumnMappingStep({
  inspection,
  isSubmitting = false,
  isAiPending = false,
  aiError = null,
  onRequestAiMapping,
  onApprove,
  onBack,
}: ColumnMappingStepProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<MappingFormValues>({ defaultValues: defaultValues(inspection) })
  const watchedRows = watch('rows')

  useEffect(() => reset(defaultValues(inspection)), [inspection, reset])

  const submit = handleSubmit(async (values) => {
    clearErrors('root.mapping')
    const requiredTargets = new Set(
      inspection.mapping.filter((row) => row.required).map((row) => row.target),
    )
    const missing = values.rows.find((row) => requiredTargets.has(row.target) && !row.sourceColumnKey)
    if (missing) {
      setError('root.mapping', { message: `${missing.target} must be mapped before continuing.` })
      return
    }
    const selected = values.rows.map((row) => row.sourceColumnKey).filter(Boolean)
    if (new Set(selected).size !== selected.length) {
      setError('root.mapping', { message: 'Each source column can map to only one project field.' })
      return
    }
    await onApprove(values.rows.map((row) => ({
      target: row.target,
      sourceColumnKey: row.sourceColumnKey || null,
    })))
  })

  return (
    <section className="rounded-card border border-border bg-surface-card p-6 shadow-card" aria-labelledby="column-mapping-title">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Columns className="size-5" strokeWidth={1.75} />
        </span>
        <div>
          <h3 id="column-mapping-title" className="text-section-title text-ink-primary">Review column mapping</h3>
          <p className="mt-1 text-body text-ink-secondary">
            Review and edit every mapping before it is applied. AI can suggest column matches, but it cannot clean values or approve the mapping for you.
          </p>
        </div>
      </div>

      <form className="mt-5 space-y-4" onSubmit={submit}>
        <div className="flex flex-col gap-3 rounded-card border border-primary/20 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-body-sm font-semibold text-ink-primary">Optional AI suggestions</p>
            <p className="text-body-sm text-ink-secondary">Sends column headers and up to three redacted sample values to the configured OpenAI provider. Suggestions remain editable and are never applied automatically.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void onRequestAiMapping()} disabled={isSubmitting || isAiPending}>
            <Sparkles data-icon="inline-start" /> {isAiPending ? 'Suggesting…' : 'Suggest with AI'}
          </Button>
        </div>
        {aiError && (
          <p role="alert" className="rounded-card border border-warning-500/30 bg-warning-50 px-4 py-3 text-body-sm text-warning-700">
            {aiError} Manual mapping is still available below.
          </p>
        )}
        <div className="max-h-[28rem] overflow-auto rounded-card border border-border">
          <div className="grid min-w-[42rem] grid-cols-[minmax(12rem,1fr)_minmax(15rem,1.2fr)_minmax(12rem,1fr)] gap-3 border-b border-border bg-surface-muted px-4 py-2 text-overline text-ink-secondary">
            <span>Project field</span>
            <span>Source column</span>
            <span>Sample values</span>
          </div>
          {inspection.mapping.map((mapping, index) => {
            const selectedSource = inspection.sourceColumns.find(
              (column) => column.key === watchedRows?.[index]?.sourceColumnKey,
            )
            const originalSource = inspection.sourceColumns.find(
              (column) => column.key === mapping.aiProposal?.originalSourceColumnKey,
            )
            const proposedSource = inspection.sourceColumns.find(
              (column) => column.key === mapping.aiProposal?.proposedSourceColumnKey,
            )
            return (
              <div key={mapping.target} className="grid min-w-[42rem] grid-cols-[minmax(12rem,1fr)_minmax(15rem,1.2fr)_minmax(12rem,1fr)] items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                <div>
                  <p className="text-body-sm font-semibold text-ink-primary">{mapping.target}</p>
                  <p className="text-body-sm text-ink-tertiary">
                    {mapping.required ? 'Required' : 'Optional'}
                    {mapping.match === 'AI' ? ' · AI suggestion—review it' : mapping.match === 'ALIAS' ? ' · Known alias proposed' : mapping.match === 'EXACT' ? ' · Exact match' : ''}
                  </p>
                </div>
                <div>
                  <select
                    className="input"
                    aria-label={`Source column for ${mapping.target}`}
                    {...register(`rows.${index}.sourceColumnKey`)}
                  >
                    <option value="">Not mapped</option>
                    {inspection.sourceColumns.map((column) => (
                      <option key={column.key} value={column.key}>{column.header}</option>
                    ))}
                  </select>
                  {mapping.aiProposal && (
                    <div className="mt-2 text-body-sm text-ink-secondary">
                      <p><span className="font-semibold text-ink-primary">AI proposal:</span> {originalSource?.header ?? 'Not mapped'} → {proposedSource?.header}</p>
                      <p>{Math.round(mapping.aiProposal.confidence * 100)}% confidence · {mapping.aiProposal.reason}</p>
                    </div>
                  )}
                </div>
                <p className="truncate text-body-sm text-ink-secondary" title={selectedSource?.sampleValues.join(' · ')}>
                  {selectedSource?.sampleValues.join(' · ') || 'No sample'}
                </p>
                <input type="hidden" {...register(`rows.${index}.target`)} />
              </div>
            )
          })}
        </div>

        {errors.root?.mapping?.message && (
          <p role="alert" className="rounded-card border border-danger-500/30 bg-danger-50 px-4 py-3 text-body-sm text-danger-700">
            {errors.root.mapping.message}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={onBack} disabled={isSubmitting || isAiPending}>
            <ArrowLeft data-icon="inline-start" /> Choose another file
          </Button>
          <Button type="submit" disabled={isSubmitting || isAiPending}>
            <CheckCircle2 data-icon="inline-start" /> {isSubmitting ? 'Applying mapping…' : 'Approve mapping'}
          </Button>
        </div>
      </form>
    </section>
  )
}
