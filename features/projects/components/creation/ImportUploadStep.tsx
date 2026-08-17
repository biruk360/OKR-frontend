'use client'

import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AlertTriangle, FileSpreadsheet, RefreshCw, Save, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useAnalyzeProjectCreationImport,
  useInspectProjectCreationImport,
  useProposeProjectCreationImportMapping,
  type ProjectCreationDraftNode,
  type ProjectCreationImportResponse,
} from '../../hooks/useProjects'
import type { ProjectCreationImportMappingSelection } from '@/lib/projects/creation-import'
import { ColumnMappingStep } from './ColumnMappingStep'
import { ImportTemplateDownloads } from './ImportTemplateDownloads'
import { ValidationReportPanel } from './ValidationReportPanel'
import { DraftReviewWorkspace } from './DraftReviewWorkspace'
import type { CommitProjectCreationDraftResult } from '@/lib/projects/creation-commit-shared'

interface ImportUploadStepProps {
  draft: ProjectCreationDraftNode
  onDraftUpdated: (draft: ProjectCreationDraftNode) => void
  onProgressChange: (step: 1 | 2 | 3) => void
  onSaveExit: () => void
  onCommitted: (project: CommitProjectCreationDraftResult) => Promise<void> | void
}

interface UploadFormValues {
  file: FileList
  sheetName: string
}

export function ImportUploadStep({
  draft,
  onDraftUpdated,
  onProgressChange,
  onSaveExit,
  onCommitted,
}: ImportUploadStepProps) {
  const inputId = useId()
  const [result, setResult] = useState<ProjectCreationImportResponse | null>(null)
  const [changingFile, setChangingFile] = useState(false)
  const inspectImport = useInspectProjectCreationImport(draft.id)
  const analyzeImport = useAnalyzeProjectCreationImport(draft.id)
  const proposeMapping = useProposeProjectCreationImportMapping(draft.id)
  const {
    register,
    watch,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UploadFormValues>({ defaultValues: { sheetName: '' } })
  const fileRegistration = register('file', { required: 'Choose a CSV, XLS, XLSX, or DOCX project file.' })
  const selectedFile = watch('file')?.[0] ?? null
  const selectedIsDocx = selectedFile?.name.toLowerCase().endsWith('.docx') ?? false
  const busy = inspectImport.isPending || analyzeImport.isPending || proposeMapping.isPending
  const savedSchedule = result?.draft.scheduleJson ?? draft.scheduleJson
  const validation = result?.draft.validationJson ?? draft.validationJson
  const hasBlockingErrors = Boolean(validation?.issues.some((item) => item.severity === 'BLOCKING'))
  const ready = result?.stage === 'READY_FOR_REVIEW' || result?.stage === 'DOCX_EXTRACTED'
    || (!result && !changingFile && Boolean(draft.scheduleJson) && !hasBlockingErrors)
  const validationFailed = result?.stage === 'VALIDATION_ERRORS'
    || (!result && !changingFile && hasBlockingErrors)

  useEffect(() => onProgressChange(ready ? 2 : 1), [onProgressChange, ready])

  const inspect = handleSubmit(async (values) => {
    const file = values.file?.[0]
    if (!file) return
    try {
      const response = await inspectImport.mutateAsync({
        file,
        version: result?.draft.version ?? draft.version,
        sheetName: values.sheetName || undefined,
      })
      setResult(response)
      setChangingFile(response.stage !== 'READY_FOR_REVIEW')
      onDraftUpdated(response.draft)
    } catch {
      // The mutation exposes the safe server message in the inline error state.
    }
  })

  const approveMapping = async (mapping: ProjectCreationImportMappingSelection[]) => {
    if (!selectedFile || !result?.inspection?.selectedSheetName) return
    try {
      const response = await analyzeImport.mutateAsync({
        file: selectedFile,
        version: result.draft.version,
        sheetName: result.inspection.selectedSheetName,
        mapping,
      })
      setResult(response)
      setChangingFile(false)
      onDraftUpdated(response.draft)
    } catch {
      // The mutation exposes the safe server message in the inline error state.
    }
  }

  const requestAiMapping = async () => {
    if (!result?.inspection?.selectedSheetName) return
    try {
      const response = await proposeMapping.mutateAsync({
        version: result.draft.version,
        sheetName: result.inspection.selectedSheetName,
      })
      setResult(response)
    } catch {
      // The safe server message remains visible while manual mapping stays usable.
    }
  }

  const startOver = () => {
    setResult(null)
    setChangingFile(true)
    inspectImport.reset()
    analyzeImport.reset()
    proposeMapping.reset()
    reset({ sheetName: '' })
    onProgressChange(1)
  }

  const summary = result?.summary ?? (savedSchedule ? {
    phases: savedSchedule.phases.length,
    milestones: savedSchedule.milestones.length,
    activities: savedSchedule.activities.length,
    dependencies: savedSchedule.dependencies.length,
    deliverables: savedSchedule.deliverables.length,
  } : null)
  const error = analyzeImport.error ?? inspectImport.error

  return (
    <div className="space-y-5">
      <ImportTemplateDownloads />

      {result?.stage === 'MAPPING' && result.inspection ? (
        <ColumnMappingStep
          inspection={result.inspection}
          isSubmitting={analyzeImport.isPending}
          isAiPending={proposeMapping.isPending}
          aiError={proposeMapping.error?.message ?? null}
          onRequestAiMapping={requestAiMapping}
          onApprove={approveMapping}
          onBack={startOver}
        />
      ) : validationFailed && validation ? (
        <div className="space-y-4">
          <ValidationReportPanel validation={validation} sourceFileName={result?.draft.sourceFileName ?? draft.sourceFileName} />
          <div className="flex flex-col-reverse gap-3 rounded-card border border-border bg-surface-card p-4 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" onClick={onSaveExit}>
              <Save data-icon="inline-start" /> Save and exit
            </Button>
            <Button type="button" onClick={startOver}>
              <RefreshCw data-icon="inline-start" /> Correct and choose file again
            </Button>
          </div>
        </div>
      ) : ready && summary && savedSchedule ? (
        <div className="space-y-4">
          {result?.stage === 'DOCX_EXTRACTED' && result.documentExtraction ? (
            <div className="rounded-card border border-primary/20 bg-primary/5 px-4 py-3 text-body-sm text-ink-secondary">
              <p><span className="font-semibold text-ink-primary">DOCX source extracted for review.</span> {result.documentExtraction.headings} headings, {result.documentExtraction.paragraphs} paragraphs, and {result.documentExtraction.tables} tables retain their document order and source references.</p>
              <p className="mt-1">Document content is untrusted project data. Instructions inside it were not executed, no AI values were applied, and no project was created.</p>
            </div>
          ) : (
            <div className="rounded-card border border-success-500/30 bg-success-50 px-4 py-3 text-body-sm text-success-700">
              <span className="font-semibold">Ready for review.</span> Explicit spreadsheet values were preserved and no AI cleanup was used.
            </div>
          )}
          <DraftReviewWorkspace
            draft={result?.draft ?? draft}
            onDraftUpdated={(updated) => {
              setResult((current) => current ? { ...current, draft: updated } : current)
              onDraftUpdated(updated)
            }}
            onSaveExit={onSaveExit}
            onRestartSource={startOver}
            onCommitted={onCommitted}
          />
        </div>
      ) : (
        <section className="rounded-card border border-border bg-surface-card p-6 shadow-card" aria-labelledby="import-upload-title">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileSpreadsheet className="size-5" strokeWidth={1.75} />
            </span>
            <div>
              <h3 id="import-upload-title" className="text-section-title text-ink-primary">Upload your schedule</h3>
              <p className="mt-1 text-body text-ink-secondary">
                CSV, XLS, and XLSX schedules are read deterministically. DOCX headings, paragraphs, and tables are extracted in order with source references.
              </p>
            </div>
          </div>

          <form className="mt-5 space-y-4" onSubmit={inspect}>
            <input
              id={inputId}
              type="file"
              accept=".csv,.xls,.xlsx,.docx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              {...fileRegistration}
              onChange={(event) => {
                void fileRegistration.onChange(event)
                setResult(null)
                setChangingFile(true)
                inspectImport.reset()
                analyzeImport.reset()
                proposeMapping.reset()
              }}
            />
            <label htmlFor={inputId} className="flex cursor-pointer flex-col items-center justify-center rounded-card border border-dashed border-border px-5 py-10 text-center transition-colors duration-[180ms] ease-apple hover:bg-surface-hover focus-within:ring-2 focus-within:ring-primary/40">
              <Upload className="size-6 text-primary" strokeWidth={1.75} />
              <span className="mt-3 text-body font-semibold text-ink-primary">
                {selectedFile?.name ?? 'Choose CSV, XLS, XLSX, or DOCX'}
              </span>
              <span className="mt-1 text-body-sm text-ink-tertiary">Maximum 10 MB; spreadsheets support 2,000 activity rows and DOCX supports 200 pages by default</span>
            </label>
            {errors.file?.message && <p role="alert" className="text-body-sm text-danger-700">{errors.file.message}</p>}

            {result?.stage === 'SHEET_SELECTION' && result.inspection && (
              <label className="block text-body-sm font-medium text-ink-primary">
                Select the schedule sheet
                <select className="input mt-1" {...register('sheetName', { required: 'Choose a sheet.' })}>
                  <option value="">Choose a sheet</option>
                  {result.inspection.sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                {errors.sheetName?.message && <span className="mt-1 block text-danger-700">{errors.sheetName.message}</span>}
              </label>
            )}

            {busy && (
              <div role="status" className="rounded-card bg-surface-muted px-4 py-3 text-body-sm text-ink-secondary animate-pulse">
                {result?.stage === 'SHEET_SELECTION' ? 'Reading and validating the selected sheet…' : selectedIsDocx ? 'Uploading, scanning, and extracting the document as untrusted project data…' : 'Uploading, reading, and validating the spreadsheet…'}
              </div>
            )}
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-card border border-danger-500/30 bg-danger-50 px-4 py-3 text-body-sm text-danger-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{analyzeImport.error ? 'Mapping error' : 'File processing error'}: {error.message}</span>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" onClick={onSaveExit} disabled={busy}>
                <Save data-icon="inline-start" /> Save and exit
              </Button>
              <Button type="submit" disabled={busy || !selectedFile}>
                <Upload data-icon="inline-start" />
                {busy ? 'Reading…' : result?.stage === 'SHEET_SELECTION' ? 'Read selected sheet' : 'Read project file'}
              </Button>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
