'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AlertTriangle, Check, FileSpreadsheet, RefreshCw, Save, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import {
  useProposeProjectCreationImportMapping,
  type ProjectCreationDraftNode,
} from '../../hooks/useProjects'
import type { ProjectCreationImportMappingSelection, ProjectCreationSpreadsheetInspection } from '@/lib/projects/creation-import'
import type { ProjectCreationProcessingFailureCategory } from '@/lib/projects/creation-processing'
import { ColumnMappingStep } from './ColumnMappingStep'
import { ImportTemplateDownloads } from './ImportTemplateDownloads'
import { ValidationReportPanel } from './ValidationReportPanel'
import { DraftReviewWorkspace } from './DraftReviewWorkspace'
import type { CommitProjectCreationDraftResult } from '@/lib/projects/creation-commit-shared'
import {
  useApproveRetainedProjectCreationMapping,
  useProjectCreationImportStatus,
  useRetryProjectCreationImport,
  useStartProjectCreationImport,
} from './useImportProcessing'

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

const FAILURE_LABEL: Record<ProjectCreationProcessingFailureCategory, string> = {
  FILE: 'File problem',
  PARSING: 'The file could not be parsed',
  STORAGE: 'Temporary storage problem',
  AUTHORIZATION: 'Authorization problem',
  INTERRUPTED: 'Processing was interrupted',
  UNKNOWN: 'Processing failed',
}

/** §8.6 import states: Uploading > Reading > Mapping/extraction > Validating > Ready for review. */
function ProcessingProgress({ uploading, isDocx }: { uploading: boolean; isDocx: boolean }) {
  const steps = ['Uploading and scanning', 'Reading', isDocx ? 'Extracting schedule' : 'Mapping', 'Validating', 'Ready for review']
  const active = uploading ? 0 : 1
  return (
    <section role="status" aria-live="polite" className="rounded-card border border-border bg-surface-card p-6 shadow-card">
      <h3 className="text-section-title text-ink-primary">{uploading ? 'Uploading your file…' : 'Processing your file…'}</h3>
      <p className="mt-1 text-body-sm text-ink-secondary">
        Processing runs in the background. You can save and exit — it continues safely and the result will be here when you return.
      </p>
      <ol className="mt-4 flex flex-wrap gap-2" aria-label="Import progress">
        {steps.map((step, index) => {
          const done = index < active
          const running = uploading ? index === 0 : index >= 1 && index <= 3
          return (
            <li key={step} className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-medium',
              done ? 'bg-success-50 text-success-700' : running ? 'animate-pulse bg-primary/10 text-primary' : 'bg-surface-muted text-ink-tertiary',
            )}>
              {done && <Check className="size-3.5" strokeWidth={1.75} />} {step}
            </li>
          )
        })}
      </ol>
      <div className="mt-5 space-y-2" aria-hidden="true">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    </section>
  )
}

export function ImportUploadStep({
  draft,
  onDraftUpdated,
  onProgressChange,
  onSaveExit,
  onCommitted,
}: ImportUploadStepProps) {
  const inputId = useId()
  const [tracking, setTracking] = useState(() => draft.status === 'PROCESSING' || draft.status === 'FAILED' || Boolean(draft.sourceFileName))
  const [changingFile, setChangingFile] = useState(false)
  const [aiInspection, setAiInspection] = useState<ProjectCreationSpreadsheetInspection | null>(null)
  const statusQuery = useProjectCreationImportStatus(draft.id, tracking)
  const startImport = useStartProjectCreationImport(draft.id)
  const retryImport = useRetryProjectCreationImport(draft.id)
  const approveMappingMutation = useApproveRetainedProjectCreationMapping(draft.id)
  const proposeMapping = useProposeProjectCreationImportMapping(draft.id)
  const view = tracking ? statusQuery.data ?? null : null
  // The newest of the polled draft and the shell's draft (review saves update the shell).
  const currentDraft = view?.draft && view.draft.version > draft.version ? view.draft : draft
  const {
    register,
    watch,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UploadFormValues>({ defaultValues: { sheetName: '' } })
  const sheetSelection = !changingFile && view?.stage === 'SHEET_SELECTION'
  const fileRegistration = register('file', {
    validate: (files) => sheetSelection || Boolean(files?.length) || 'Choose a CSV, XLS, XLSX, or DOCX project file.',
  })
  const selectedFile = watch('file')?.[0] ?? null
  const retainedIsDocx = (currentDraft.sourceFileName ?? selectedFile?.name ?? '').toLowerCase().endsWith('.docx')
  const processing = startImport.isPending || (!changingFile && view?.stage === 'PROCESSING')
  const busy = processing || retryImport.isPending || approveMappingMutation.isPending || proposeMapping.isPending
  const stage = changingFile ? null : view?.stage ?? null
  const validation = currentDraft.validationJson
  const ready = stage === 'READY_FOR_REVIEW' || stage === 'DOCX_EXTRACTED'

  // Hand every completed/changed draft to the shell so versions stay current.
  const lastVersion = useRef(draft.version)
  useEffect(() => {
    if (view?.draft && view.draft.version > lastVersion.current && view.draft.version > draft.version) {
      lastVersion.current = view.draft.version
      onDraftUpdated(view.draft)
    }
  }, [draft.version, onDraftUpdated, view?.draft])

  useEffect(() => onProgressChange(ready ? 2 : 1), [onProgressChange, ready])

  const upload = handleSubmit(async (values) => {
    if (sheetSelection) {
      if (!values.sheetName) return
      try {
        await retryImport.mutateAsync({ version: currentDraft.version, sheetName: values.sheetName })
        setTracking(true)
      } catch {
        // The mutation exposes the safe server message in the inline error state.
      }
      return
    }
    const file = values.file?.[0]
    if (!file) return
    try {
      await startImport.mutateAsync({ file, version: currentDraft.version })
      setAiInspection(null)
      setChangingFile(false)
      setTracking(true)
    } catch {
      // The mutation exposes the safe server message in the inline error state.
    }
  })

  const retry = async () => {
    try {
      await retryImport.mutateAsync({ version: currentDraft.version })
      setTracking(true)
    } catch {
      // Shown inline below.
    }
  }

  const approveMapping = async (mapping: ProjectCreationImportMappingSelection[]) => {
    const inspection = aiInspection ?? view?.inspection
    if (!inspection?.selectedSheetName) return
    try {
      await approveMappingMutation.mutateAsync({
        version: currentDraft.version,
        sheetName: inspection.selectedSheetName,
        mapping,
      })
      setAiInspection(null)
      await statusQuery.refetch()
    } catch {
      // The mutation exposes the safe server message in the inline error state.
    }
  }

  const requestAiMapping = async () => {
    const inspection = view?.inspection
    if (!inspection?.selectedSheetName) return
    try {
      const response = await proposeMapping.mutateAsync({
        version: currentDraft.version,
        sheetName: inspection.selectedSheetName,
      })
      if (response.inspection) setAiInspection(response.inspection)
    } catch {
      // The safe server message remains visible while manual mapping stays usable.
    }
  }

  const startOver = () => {
    setChangingFile(true)
    setAiInspection(null)
    startImport.reset()
    retryImport.reset()
    approveMappingMutation.reset()
    proposeMapping.reset()
    reset({ sheetName: '' })
    onProgressChange(1)
  }

  const summary = view?.summary ?? null
  const error = approveMappingMutation.error ?? retryImport.error ?? startImport.error
  const mappingInspection = aiInspection ?? view?.inspection ?? null

  return (
    <div className="space-y-5">
      <ImportTemplateDownloads />

      {processing ? (
        <div className="space-y-3">
          <ProcessingProgress uploading={startImport.isPending} isDocx={retainedIsDocx} />
          <div className="flex justify-start">
            <Button type="button" variant="outline" onClick={onSaveExit}>
              <Save data-icon="inline-start" /> Save and exit
            </Button>
          </div>
        </div>
      ) : stage === 'FAILED' && view?.failure ? (
        <section role="alert" className="space-y-4 rounded-card border border-danger-500/30 bg-danger-50 p-5">
          <div className="flex items-start gap-3 text-danger-700">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} />
            <div>
              <h3 className="text-body font-semibold">{FAILURE_LABEL[view.failure.category]}</h3>
              <p className="mt-1 text-body-sm">{view.failure.message}</p>
              {view.failure.retryable && <p className="mt-1 text-body-sm">Retrying reuses the file already uploaded — you do not need to choose it again.</p>}
            </div>
          </div>
          {retryImport.error && <p className="text-body-sm text-danger-700">Retry error: {retryImport.error.message}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" onClick={onSaveExit}>
              <Save data-icon="inline-start" /> Save and exit
            </Button>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button type="button" variant="outline" onClick={startOver}>
                <Upload data-icon="inline-start" /> Choose another file
              </Button>
              {view.canRetry && (
                <Button type="button" onClick={retry} disabled={retryImport.isPending}>
                  <RefreshCw data-icon="inline-start" /> {retryImport.isPending ? 'Retrying…' : 'Retry processing'}
                </Button>
              )}
            </div>
          </div>
        </section>
      ) : stage === 'MAPPING' && mappingInspection ? (
        <div className="space-y-3">
          <ColumnMappingStep
            key={aiInspection ? 'ai' : 'deterministic'}
            inspection={mappingInspection}
            isSubmitting={approveMappingMutation.isPending}
            isAiPending={proposeMapping.isPending}
            aiError={proposeMapping.error?.message ?? null}
            onRequestAiMapping={requestAiMapping}
            onApprove={approveMapping}
            onBack={startOver}
          />
          {approveMappingMutation.error && (
            <p role="alert" className="rounded-card border border-danger-500/30 bg-danger-50 px-4 py-3 text-body-sm text-danger-700">Mapping error: {approveMappingMutation.error.message}</p>
          )}
        </div>
      ) : stage === 'VALIDATION_ERRORS' && validation ? (
        <div className="space-y-4">
          <ValidationReportPanel validation={validation} sourceFileName={currentDraft.sourceFileName} />
          <div className="flex flex-col-reverse gap-3 rounded-card border border-border bg-surface-card p-4 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" onClick={onSaveExit}>
              <Save data-icon="inline-start" /> Save and exit
            </Button>
            <Button type="button" onClick={startOver}>
              <RefreshCw data-icon="inline-start" /> Correct and choose file again
            </Button>
          </div>
        </div>
      ) : ready && currentDraft.scheduleJson ? (
        <div className="space-y-4">
          {stage === 'DOCX_EXTRACTED' ? (
            <div className="rounded-card border border-primary/20 bg-primary/5 px-4 py-3 text-body-sm text-ink-secondary">
              <p>
                <span className="font-semibold text-ink-primary">DOCX schedule extracted for review.</span>{' '}
                {summary ? `${summary.phases} phases, ${summary.milestones} milestones, ${summary.activities} activities, and ${summary.deliverables} deliverables were read from tables and lists` : 'Headings, paragraphs, and tables were read'}
                {view?.documentExtraction ? ` (${view.documentExtraction.headings} headings, ${view.documentExtraction.paragraphs} paragraphs, ${view.documentExtraction.tables} tables)` : ''}, each with its source reference and confidence.
              </p>
              <p className="mt-1">Every extracted row is marked for review: acknowledge the review warning and accept or reject each assumption before Create Project is enabled.</p>
              <p className="mt-1">Document content is untrusted project data. Instructions inside it were not executed, no AI values were applied, and no project was created.</p>
            </div>
          ) : (
            <div className="rounded-card border border-success-500/30 bg-success-50 px-4 py-3 text-body-sm text-success-700">
              <span className="font-semibold">Ready for review.</span> Explicit spreadsheet values were preserved and no AI cleanup was used.
            </div>
          )}
          <DraftReviewWorkspace
            draft={currentDraft}
            onDraftUpdated={onDraftUpdated}
            onSaveExit={onSaveExit}
            onRestartSource={startOver}
            onCommitted={onCommitted}
          />
        </div>
      ) : tracking && statusQuery.isPending && !changingFile ? (
        <div className="space-y-2 rounded-card border border-border bg-surface-card p-6" aria-busy="true">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-24 w-full" />
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
                CSV, XLS, and XLSX schedules are read deterministically. From DOCX work plans, headings, task tables, and bulleted lists are turned into phases, milestones, activities, and deliverables, each marked for your review.
              </p>
            </div>
          </div>

          <form className="mt-5 space-y-4" onSubmit={upload}>
            {!sheetSelection && (
              <>
                <input
                  id={inputId}
                  type="file"
                  accept=".csv,.xls,.xlsx,.docx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="sr-only"
                  {...fileRegistration}
                  onChange={(event) => {
                    void fileRegistration.onChange(event)
                    startImport.reset()
                    retryImport.reset()
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
              </>
            )}

            {sheetSelection && view?.inspection && (
              <label className="block text-body-sm font-medium text-ink-primary">
                Select the schedule sheet in {currentDraft.sourceFileName ?? 'the workbook'}
                <select className="input mt-1" {...register('sheetName', { required: 'Choose a sheet.' })}>
                  <option value="">Choose a sheet</option>
                  {view.inspection.sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                {errors.sheetName?.message && <span className="mt-1 block text-danger-700">{errors.sheetName.message}</span>}
              </label>
            )}

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-card border border-danger-500/30 bg-danger-50 px-4 py-3 text-body-sm text-danger-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>File processing error: {error.message}</span>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" onClick={onSaveExit} disabled={busy}>
                <Save data-icon="inline-start" /> Save and exit
              </Button>
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                {sheetSelection && (
                  <Button type="button" variant="outline" onClick={startOver} disabled={busy}>
                    Choose another file
                  </Button>
                )}
                <Button type="submit" disabled={busy || (!sheetSelection && !selectedFile)}>
                  <Upload data-icon="inline-start" />
                  {busy ? 'Working…' : sheetSelection ? 'Read selected sheet' : 'Read project file'}
                </Button>
              </div>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
