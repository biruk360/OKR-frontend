/**
 * Story 2.7 — background-safe import processing and retry
 * (docs/PROJECT_CREATION_IMPORT_AI_REQUIREMENTS.md §8.6, §15, §16).
 *
 * The upload route only validates, scans, and privately stores the file, then moves the
 * draft to PROCESSING and schedules `runProjectCreationUploadProcessing` with
 * `runAfterResponse`. The job reads the retained file, parses/validates (spreadsheet) or
 * extracts (DOCX), and completes the draft as READY / DRAFT / FAILED. The UI polls
 * `GET …/upload` for the status view. Retries reprocess the retained file (no re-upload)
 * and are idempotent: a retry while a fresh job is running returns that job; a stale
 * job (process restarted mid-run) may be restarted.
 */
import { createHash } from 'node:crypto'
import { Prisma, type ProjectCreationDraft } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import {
  ProjectCreationDraftNotFoundError,
  ProjectCreationDraftStateError,
  ProjectCreationDraftVersionConflictError,
  isProjectCreationDraftJsonWithinLimit,
} from './creation-draft'
import {
  ProjectCreationImportError,
  inspectProjectCreationSpreadsheet,
  toPublicProjectCreationSpreadsheetInspection,
  validateProjectCreationSpreadsheet,
  type ProjectCreationImportSummary,
  type ProjectCreationSpreadsheetInspection,
} from './creation-import'
import {
  createEmptyProjectCreationValidationJson,
  projectCreationScheduleJsonSchema,
  projectCreationValidationJsonSchema,
  type ProjectCreationScheduleJson,
  type ProjectCreationValidationJson,
} from './creation-normalize'
import {
  ProjectCreationUploadSecurityError,
  readProjectCreationProcessingStateFile,
  readSecureProjectCreationUpload,
  writeProjectCreationProcessingStateFile,
} from './creation-upload-security'
import {
  ProjectCreationDocxExtractionError,
  extractProjectCreationDocx,
  summarizeProjectCreationDocxExtraction,
} from './docx-extract'
import { buildProjectCreationDocxSchedule } from './creation-docx-schedule'
import { resolveActiveProjectCreationAssigneeEmails } from './creation-validate'

export const PROJECT_CREATION_PROCESSING_STALE_MS_DEFAULT = 10 * 60_000

export type ProjectCreationProcessingStage =
  | 'NO_SOURCE'
  | 'PROCESSING'
  | 'SHEET_SELECTION'
  | 'MAPPING'
  | 'VALIDATION_ERRORS'
  | 'READY_FOR_REVIEW'
  | 'DOCX_EXTRACTED'
  | 'FAILED'

export type ProjectCreationProcessingFailureCategory =
  | 'FILE'
  | 'PARSING'
  | 'STORAGE'
  | 'AUTHORIZATION'
  | 'INTERRUPTED'
  | 'UNKNOWN'

export interface ProjectCreationProcessingFailure {
  category: ProjectCreationProcessingFailureCategory
  message: string
  retryable: boolean
}

export interface ProjectCreationDocumentExtractionSummary {
  blocks: number
  headings: number
  paragraphs: number
  tables: number
  pages: number
  warnings: number
}

/** Private job state kept beside the retained upload (never includes raw file content). */
export interface ProjectCreationProcessingState {
  jobVersion: number
  sourceRef: string
  sheetName: string | null
  stage: ProjectCreationProcessingStage
  startedAt: string
  finishedAt: string | null
  inspection: ProjectCreationSpreadsheetInspection | null
  documentExtraction: ProjectCreationDocumentExtractionSummary | null
  summary: ProjectCreationImportSummary | null
  commitBlocked: boolean
  failure: ProjectCreationProcessingFailure | null
}

type DraftStatusAfterProcessing = 'DRAFT' | 'READY' | 'FAILED'

interface ProcessingDelegate {
  findUnique(args: Prisma.ProjectCreationDraftFindUniqueArgs): Promise<ProjectCreationDraft | null>
  updateMany(args: Prisma.ProjectCreationDraftUpdateManyArgs): Promise<Prisma.BatchPayload>
}

interface ProcessingTransaction {
  projectCreationDraft: ProcessingDelegate
  activityLog: { create(args: unknown): Promise<unknown> }
}

export interface ProcessingDatabase {
  projectCreationDraft: ProcessingDelegate
  $transaction<T>(operation: (tx: ProcessingTransaction) => Promise<T>): Promise<T>
}

const defaultDatabase = () => prisma as unknown as ProcessingDatabase

export function resolveProjectCreationProcessingStaleMs(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const parsed = Number(env.PROJECT_CREATION_PROCESSING_STALE_MS)
  return Number.isInteger(parsed) && parsed >= 30_000 && parsed <= 86_400_000
    ? parsed
    : PROJECT_CREATION_PROCESSING_STALE_MS_DEFAULT
}

export function isProjectCreationProcessingStale(
  draft: Pick<ProjectCreationDraft, 'status' | 'updatedAt'>,
  now: Date = new Date(),
  staleMs: number = resolveProjectCreationProcessingStaleMs(),
): boolean {
  return draft.status === 'PROCESSING' && now.getTime() - new Date(draft.updatedAt).getTime() > staleMs
}

export function projectCreationUploadKind(sourceRef: string): 'DOCX' | 'SPREADSHEET' {
  return sourceRef.toLowerCase().endsWith('.docx') ? 'DOCX' : 'SPREADSHEET'
}

export interface BeginProjectCreationProcessingInput {
  id: string
  actorUserId: string
  expectedVersion: number
  /** Present for a new upload; absent for a retry of the retained file. */
  sourceMetadata?: {
    fileName: string
    mimeType: string
    size: number
    hash: string
    sourceRef: string
    scanStatus: 'CLEAN'
  }
  now?: Date
  staleMs?: number
}

export interface BeginProjectCreationProcessingResult {
  draft: ProjectCreationDraft
  /** False when an identical, still-running job already owns the draft (idempotent retry). */
  started: boolean
}

/**
 * Moves the draft to PROCESSING (clearing method data) under the optimistic version.
 * A retry while a fresh job is running is a no-op that returns the running draft.
 */
export async function beginProjectCreationProcessing(
  input: BeginProjectCreationProcessingInput,
  database: ProcessingDatabase = defaultDatabase(),
): Promise<BeginProjectCreationProcessingResult> {
  const now = input.now ?? new Date()
  const staleMs = input.staleMs ?? resolveProjectCreationProcessingStaleMs()
  return database.$transaction(async (tx) => {
    const current = await tx.projectCreationDraft.findUnique({ where: { id: input.id } })
    if (!current || current.ownerUserId !== input.actorUserId) throw new ProjectCreationDraftNotFoundError()
    if (current.sourceMethod !== 'FILE_IMPORT') {
      throw new ProjectCreationDraftStateError(current.status, 'This draft is not using file import.')
    }
    if (current.status === 'PROCESSING' && !isProjectCreationProcessingStale(current, now, staleMs)) {
      if (!input.sourceMetadata) return { draft: current, started: false }
      throw new ProjectCreationDraftStateError(current.status, 'The previous file is still being processed. Wait for it to finish, then upload again.')
    }
    if (!['DRAFT', 'READY', 'FAILED', 'PROCESSING'].includes(current.status)) {
      throw new ProjectCreationDraftStateError(current.status, `Drafts in ${current.status} status cannot be processed`)
    }
    if (!input.sourceMetadata && (!current.sourceRef || !current.sourceHash)) {
      throw new ProjectCreationDraftStateError(current.status, 'This draft has no retained file to process. Upload it again.')
    }
    const metadata = input.sourceMetadata
    const result = await tx.projectCreationDraft.updateMany({
      where: { id: input.id, ownerUserId: input.actorUserId, version: input.expectedVersion, status: current.status },
      data: {
        status: 'PROCESSING',
        scheduleJson: Prisma.DbNull,
        validationJson: Prisma.DbNull,
        ...(metadata ? {
          sourceFileName: metadata.fileName,
          sourceMimeType: metadata.mimeType,
          sourceSize: metadata.size,
          sourceHash: metadata.hash,
          sourceRef: metadata.sourceRef,
        } : {}),
        version: { increment: 1 },
      },
    })
    if (result.count !== 1) {
      const latest = await tx.projectCreationDraft.findUnique({ where: { id: input.id } })
      if (!latest) throw new ProjectCreationDraftNotFoundError()
      if (!metadata && latest.status === 'PROCESSING' && !isProjectCreationProcessingStale(latest, now, staleMs)) {
        return { draft: latest, started: false }
      }
      throw new ProjectCreationDraftVersionConflictError(input.expectedVersion, latest.version)
    }
    const updated = await tx.projectCreationDraft.findUnique({ where: { id: input.id } })
    if (!updated) throw new ProjectCreationDraftNotFoundError()
    await recordActivity({
      entityType: 'PROJECT_CREATION_DRAFT',
      action: 'UPDATED',
      actorId: input.actorUserId,
      changes: { version: { from: current.version, to: updated.version }, status: { from: current.status, to: 'PROCESSING' } },
      metadata: {
        draftId: updated.id,
        changedFields: ['status', 'scheduleJson', 'validationJson', ...(metadata ? ['sourceMetadata'] : [])],
        status: 'PROCESSING',
        kind: metadata ? 'FILE_IMPORT_PROCESSING_STARTED' : 'FILE_IMPORT_PROCESSING_RETRIED',
        ...(metadata ? {
          fileName: metadata.fileName,
          sourceMimeType: metadata.mimeType,
          sourceSize: metadata.size,
          sourceHash: metadata.hash,
          scanStatus: metadata.scanStatus,
        } : {}),
      },
    }, { client: tx, required: true })
    return { draft: updated, started: true }
  })
}

export interface CompleteProjectCreationProcessingInput {
  id: string
  actorUserId: string
  jobVersion: number
  status: DraftStatusAfterProcessing
  scheduleJson: ProjectCreationScheduleJson | null
  validationJson: ProjectCreationValidationJson | null
  outcome: string
  failureCategory?: ProjectCreationProcessingFailureCategory
}

/**
 * Writes the job result only if the draft is still PROCESSING at `jobVersion`, so a
 * superseded job (newer upload/retry) can never overwrite newer data. Returns null then.
 */
export async function completeProjectCreationProcessing(
  input: CompleteProjectCreationProcessingInput,
  database: ProcessingDatabase = defaultDatabase(),
): Promise<ProjectCreationDraft | null> {
  const scheduleJson = input.scheduleJson === null ? null : projectCreationScheduleJsonSchema.parse(input.scheduleJson)
  const validationJson = input.validationJson === null ? null : projectCreationValidationJsonSchema.parse(input.validationJson)
  for (const value of [scheduleJson, validationJson]) {
    if (value !== null && !isProjectCreationDraftJsonWithinLimit(value)) {
      throw new ProjectCreationImportError('The processed project file is too large for one draft. Split it and try again.', 'ROW_LIMIT_EXCEEDED')
    }
  }
  return database.$transaction(async (tx) => {
    const result = await tx.projectCreationDraft.updateMany({
      where: { id: input.id, ownerUserId: input.actorUserId, version: input.jobVersion, status: 'PROCESSING' },
      data: {
        status: input.status,
        scheduleJson: scheduleJson === null ? Prisma.DbNull : scheduleJson as Prisma.InputJsonValue,
        validationJson: validationJson === null ? Prisma.DbNull : validationJson as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    })
    if (result.count !== 1) return null
    const updated = await tx.projectCreationDraft.findUnique({ where: { id: input.id } })
    if (!updated) return null
    await recordActivity({
      entityType: 'PROJECT_CREATION_DRAFT',
      action: 'UPDATED',
      actorId: input.actorUserId,
      changes: { version: { from: input.jobVersion, to: updated.version }, status: { from: 'PROCESSING', to: input.status } },
      metadata: {
        draftId: updated.id,
        changedFields: ['status', 'scheduleJson', 'validationJson'],
        status: input.status,
        kind: input.status === 'FAILED' ? 'FILE_IMPORT_PROCESSING_FAILED' : 'FILE_IMPORT_PROCESSED',
        outcome: input.outcome,
        sourceHash: updated.sourceHash,
        ...(input.failureCategory ? { failureCategory: input.failureCategory } : {}),
      },
    }, { client: tx, required: true })
    return updated
  })
}

/** Maps any processing error to a safe, categorised failure (no stack, path, or provider text). */
export function classifyProjectCreationProcessingError(error: unknown): ProjectCreationProcessingFailure {
  if (error instanceof ProjectCreationImportError) {
    const parsing = ['PARSE_FAILED', 'ROW_LIMIT_EXCEEDED', 'INVALID_MAPPING', 'UNREADABLE_FILE'].includes(error.code)
    return {
      category: parsing ? 'PARSING' : 'FILE',
      message: error.message,
      retryable: error.code === 'INVALID_SHEET',
    }
  }
  if (error instanceof ProjectCreationDocxExtractionError) {
    return {
      category: error.code === 'DOCX_LIMIT_EXCEEDED' ? 'FILE' : 'PARSING',
      message: error.message,
      retryable: false,
    }
  }
  if (error instanceof ProjectCreationUploadSecurityError) {
    const storage = error.code === 'STORAGE_UNAVAILABLE' || error.code === 'MALWARE_SCAN_UNAVAILABLE'
    return { category: storage ? 'STORAGE' : 'FILE', message: error.message, retryable: storage }
  }
  if (error instanceof ProjectCreationDraftNotFoundError) {
    return { category: 'AUTHORIZATION', message: 'You no longer have access to this draft.', retryable: false }
  }
  return {
    category: 'UNKNOWN',
    message: 'Processing stopped unexpectedly. Retry, or choose the file again.',
    retryable: true,
  }
}

function failureValidationJson(failure: ProjectCreationProcessingFailure): ProjectCreationValidationJson {
  const validation = createEmptyProjectCreationValidationJson()
  validation.issues.push({
    id: 'processing-failure',
    severity: 'BLOCKING',
    code: `PROCESSING_${failure.category}_ERROR`,
    message: failure.message.slice(0, 2_000),
    sourceRow: null,
    field: null,
    suggestedCorrection: failure.retryable
      ? 'Retry processing. The retained file is reused; you do not need to upload it again.'
      : 'Correct the file and choose it again.',
    affectedPaths: [],
  })
  return validation
}

export interface ProcessingDependencies {
  database?: ProcessingDatabase
  readUpload?: (sourceRef: string) => Promise<Uint8Array>
  writeState?: (sourceRef: string, state: ProjectCreationProcessingState) => Promise<void>
  resolveActiveAssigneeEmails?: (emails: readonly string[]) => Promise<ReadonlySet<string>>
  now?: () => Date
}

export interface RunProjectCreationUploadProcessingInput {
  draftId: string
  actorUserId: string
  jobVersion: number
  sourceRef: string
  sourceHash: string
  sheetName: string | null
  maxRows: number
}

/** In-process guard so the same job is never run twice concurrently. */
const runningJobs = new Set<string>()

/**
 * The background job. Never throws: every failure is persisted on the draft as FAILED
 * with a categorised, user-safe message and a retry path.
 */
export async function runProjectCreationUploadProcessing(
  input: RunProjectCreationUploadProcessingInput,
  deps: ProcessingDependencies = {},
): Promise<ProjectCreationProcessingState | null> {
  const key = `${input.draftId}:${input.jobVersion}`
  if (runningJobs.has(key)) return null
  runningJobs.add(key)
  const database = deps.database ?? defaultDatabase()
  const readUpload = deps.readUpload ?? readSecureProjectCreationUpload
  const writeState = deps.writeState ?? writeProjectCreationProcessingStateFile
  const now = deps.now ?? (() => new Date())
  const baseState: ProjectCreationProcessingState = {
    jobVersion: input.jobVersion,
    sourceRef: input.sourceRef,
    sheetName: input.sheetName,
    stage: 'PROCESSING',
    startedAt: now().toISOString(),
    finishedAt: null,
    inspection: null,
    documentExtraction: null,
    summary: null,
    commitBlocked: true,
    failure: null,
  }
  const persistState = async (state: ProjectCreationProcessingState) => {
    await writeState(input.sourceRef, state).catch((error) => {
      console.error('[project-creation-processing] state write failed', error instanceof Error ? error.name : 'error')
    })
  }
  try {
    await persistState(baseState)
    let finalState: ProjectCreationProcessingState
    let completion: Omit<CompleteProjectCreationProcessingInput, 'id' | 'actorUserId' | 'jobVersion'>
    try {
      const bytes = await readUpload(input.sourceRef)
      if (createHash('sha256').update(bytes).digest('hex') !== input.sourceHash) {
        throw new ProjectCreationImportError('The retained source file failed its integrity check. Upload it again.', 'INVALID_FILE')
      }
      if (projectCreationUploadKind(input.sourceRef) === 'DOCX') {
        const extraction = await extractProjectCreationDocx(bytes)
        const emails = extraction.blocks.flatMap((block) => block.rows.flat())
          .filter((cell) => /^\S+@\S+\.\S+$/.test(cell.trim()))
        const activeAssigneeEmails = await (deps.resolveActiveAssigneeEmails ?? resolveActiveProjectCreationAssigneeEmails)(emails)
        const built = buildProjectCreationDocxSchedule(extraction, { activeAssigneeEmails })
        completion = {
          status: 'READY',
          scheduleJson: built.scheduleJson,
          validationJson: built.validationJson,
          outcome: 'DOCX_EXTRACTED',
        }
        finalState = {
          ...baseState,
          stage: 'DOCX_EXTRACTED',
          documentExtraction: summarizeProjectCreationDocxExtraction(extraction),
          summary: built.summary,
          commitBlocked: true,
        }
      } else {
        const inspection = inspectProjectCreationSpreadsheet(bytes, { sheetName: input.sheetName })
        const validated = !inspection.requiresSheetSelection && !inspection.requiresMapping
          ? await validateProjectCreationSpreadsheet(inspection, undefined, {
            maxRows: input.maxRows,
            resolveActiveAssigneeEmails: deps.resolveActiveAssigneeEmails,
          })
          : null
        const stage: ProjectCreationProcessingStage = inspection.requiresSheetSelection
          ? 'SHEET_SELECTION'
          : inspection.requiresMapping
          ? 'MAPPING'
          : validated?.hasBlockingErrors
          ? 'VALIDATION_ERRORS'
          : 'READY_FOR_REVIEW'
        completion = {
          status: stage === 'READY_FOR_REVIEW' ? 'READY' : 'DRAFT',
          scheduleJson: validated?.scheduleJson ?? null,
          validationJson: validated?.validationJson ?? null,
          outcome: stage === 'SHEET_SELECTION'
            ? 'SHEET_SELECTION_REQUIRED'
            : stage === 'MAPPING'
            ? 'MAPPING_REQUIRED'
            : stage === 'VALIDATION_ERRORS'
            ? 'VALIDATION_FAILED'
            : 'PARSED',
        }
        finalState = {
          ...baseState,
          sheetName: inspection.selectedSheetName,
          stage,
          inspection: toPublicProjectCreationSpreadsheetInspection(inspection),
          summary: validated?.summary ?? null,
          commitBlocked: validated?.hasBlockingErrors ?? true,
        }
      }
    } catch (error) {
      const failure = classifyProjectCreationProcessingError(error)
      completion = {
        status: 'FAILED',
        scheduleJson: null,
        validationJson: failureValidationJson(failure),
        outcome: 'PROCESSING_FAILED',
        failureCategory: failure.category,
      }
      finalState = { ...baseState, stage: 'FAILED', failure }
    }
    const completed = await completeProjectCreationProcessing({
      id: input.draftId,
      actorUserId: input.actorUserId,
      jobVersion: input.jobVersion,
      ...completion,
    }, database)
    if (!completed) return null // superseded by a newer upload or retry
    const done = { ...finalState, finishedAt: now().toISOString() }
    await persistState(done)
    return done
  } catch (error) {
    // Completion itself failed (database unavailable). Leave PROCESSING; it becomes
    // stale and the user can retry. Log without source content.
    console.error('[project-creation-processing] completion failed', error instanceof Error ? error.name : 'error')
    return null
  } finally {
    runningJobs.delete(key)
  }
}

export interface ProjectCreationImportStatusView {
  stage: ProjectCreationProcessingStage
  status: string
  stale: boolean
  inspection: ProjectCreationSpreadsheetInspection | null
  documentExtraction: ProjectCreationDocumentExtractionSummary | null
  summary: ProjectCreationImportSummary | null
  failure: ProjectCreationProcessingFailure | null
  commitBlocked: boolean
  aiUsed: false
  canRetry: boolean
}

function scheduleSummary(schedule: unknown): ProjectCreationImportSummary | null {
  const parsed = projectCreationScheduleJsonSchema.safeParse(schedule)
  if (!parsed.success) return null
  return {
    phases: parsed.data.phases.length,
    milestones: parsed.data.milestones.length,
    activities: parsed.data.activities.length,
    dependencies: parsed.data.dependencies.length,
    deliverables: parsed.data.deliverables.length,
  }
}

function parseState(value: unknown, sourceRef: string | null): ProjectCreationProcessingState | null {
  if (!value || typeof value !== 'object' || !sourceRef) return null
  const state = value as Partial<ProjectCreationProcessingState>
  if (state.sourceRef !== sourceRef || typeof state.stage !== 'string') return null
  return state as ProjectCreationProcessingState
}

/**
 * Status view for polling. Derived from the draft row (authoritative status) plus the
 * private job state (inspection/summary/failure details).
 */
export function buildProjectCreationImportStatusView(
  draft: Pick<ProjectCreationDraft, 'status' | 'updatedAt' | 'sourceRef' | 'scheduleJson' | 'validationJson'>,
  rawState: unknown,
  options: { now?: Date; staleMs?: number } = {},
): ProjectCreationImportStatusView {
  const state = parseState(rawState, draft.sourceRef)
  const base = {
    status: draft.status,
    stale: false,
    inspection: null,
    documentExtraction: null,
    summary: null,
    failure: null,
    commitBlocked: true,
    aiUsed: false as const,
    canRetry: Boolean(draft.sourceRef),
  }
  if (draft.status === 'PROCESSING') {
    const stale = isProjectCreationProcessingStale(draft, options.now, options.staleMs)
    return stale
      ? {
        ...base,
        stage: 'FAILED',
        stale: true,
        failure: {
          category: 'INTERRUPTED',
          message: 'Processing was interrupted before it finished. Retry to process the retained file again.',
          retryable: true,
        },
      }
      : { ...base, stage: 'PROCESSING', canRetry: false }
  }
  if (draft.status === 'FAILED') {
    const issue = projectCreationValidationJsonSchema.safeParse(draft.validationJson)
    const saved = issue.success ? issue.data.issues.find((item) => item.id === 'processing-failure') : undefined
    const failure = state?.stage === 'FAILED' && state.failure
      ? state.failure
      : saved
      ? {
        category: (saved.code.replace(/^PROCESSING_|_ERROR$/g, '') || 'UNKNOWN') as ProjectCreationProcessingFailureCategory,
        message: saved.message,
        retryable: /Retry processing/.test(saved.suggestedCorrection ?? ''),
      }
      : { category: 'UNKNOWN' as const, message: 'Processing failed. Retry, or choose the file again.', retryable: true }
    return { ...base, stage: 'FAILED', failure }
  }
  const summary = scheduleSummary(draft.scheduleJson)
  const validation = projectCreationValidationJsonSchema.safeParse(draft.validationJson)
  const hasBlocking = validation.success && validation.data.issues.some((item) => item.severity === 'BLOCKING')
  const docx = state?.stage === 'DOCX_EXTRACTED'
  if (summary) {
    // The draft row is authoritative once it holds a schedule (it may have been
    // re-analysed or edited since the job finished).
    return {
      ...base,
      stage: docx ? 'DOCX_EXTRACTED' : hasBlocking ? 'VALIDATION_ERRORS' : 'READY_FOR_REVIEW',
      inspection: state?.inspection ?? null,
      documentExtraction: docx ? state.documentExtraction : null,
      summary,
      commitBlocked: hasBlocking || docx,
    }
  }
  if (hasBlocking) return { ...base, stage: 'VALIDATION_ERRORS', summary: state?.summary ?? null }
  if (state && (state.stage === 'SHEET_SELECTION' || state.stage === 'MAPPING')) {
    return { ...base, stage: state.stage, inspection: state.inspection }
  }
  return { ...base, stage: 'NO_SOURCE', canRetry: Boolean(draft.sourceRef) }
}

export async function readProjectCreationProcessingState(sourceRef: string | null): Promise<unknown> {
  return sourceRef ? readProjectCreationProcessingStateFile(sourceRef) : null
}
