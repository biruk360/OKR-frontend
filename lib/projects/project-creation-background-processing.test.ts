import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { Prisma, type ProjectCreationDraft } from '@prisma/client'
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow } from 'docx'
import {
  beginProjectCreationProcessing,
  buildProjectCreationImportStatusView,
  classifyProjectCreationProcessingError,
  isProjectCreationProcessingStale,
  runProjectCreationUploadProcessing,
  type ProjectCreationProcessingState,
} from './creation-processing'
import { createEmptyProjectCreationProjectJson } from './creation-normalize'
import { createScheduleImportTemplate } from './schedule-import-template'
import { ProjectCreationUploadSecurityError } from './creation-upload-security'
import { ProjectCreationDraftStateError, ProjectCreationDraftVersionConflictError } from './creation-draft'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')
const T0 = new Date('2026-09-25T10:00:00.000Z')
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function draftRow(overrides: Partial<ProjectCreationDraft> = {}): ProjectCreationDraft {
  return {
    id: 'draft-1', ownerUserId: 'owner-1', sourceMethod: 'FILE_IMPORT', status: 'DRAFT', version: 1,
    projectJson: createEmptyProjectCreationProjectJson('owner-1'), scheduleJson: null, validationJson: null,
    sourceFileName: null, sourceMimeType: null, sourceSize: null, sourceHash: null, sourceRef: null,
    aiProvider: null, aiModelId: null, aiPromptVersion: null, committedProjectId: null,
    createdAt: T0, updatedAt: T0, committedAt: null, expiresAt: null, ...overrides,
  }
}

/** In-memory ProjectCreationDraft store honouring id/owner/version/status guards. */
function fakeDatabase(initial: ProjectCreationDraft, clock: { now: Date }) {
  let row = structuredClone(initial)
  const audits: any[] = []
  const delegate = {
    async findUnique() { return structuredClone(row) },
    async updateMany(args: any) {
      const where = args.where
      if (where.id !== row.id || where.ownerUserId !== row.ownerUserId || where.version !== row.version
        || (where.status !== undefined && where.status !== row.status)) return { count: 0 }
      const data = args.data
      const json = (value: unknown) => (value === Prisma.DbNull ? null : value)
      row = {
        ...row,
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.scheduleJson !== undefined ? { scheduleJson: json(data.scheduleJson) as any } : {}),
        ...(data.validationJson !== undefined ? { validationJson: json(data.validationJson) as any } : {}),
        ...(data.sourceFileName !== undefined ? { sourceFileName: data.sourceFileName } : {}),
        ...(data.sourceMimeType !== undefined ? { sourceMimeType: data.sourceMimeType } : {}),
        ...(data.sourceSize !== undefined ? { sourceSize: data.sourceSize } : {}),
        ...(data.sourceHash !== undefined ? { sourceHash: data.sourceHash } : {}),
        ...(data.sourceRef !== undefined ? { sourceRef: data.sourceRef } : {}),
        version: row.version + data.version.increment,
        updatedAt: clock.now,
      }
      return { count: 1 }
    },
  }
  const tx: any = { projectCreationDraft: delegate, activityLog: { async create(args: unknown) { audits.push(args) } } }
  return {
    database: { ...tx, async $transaction<T>(operation: (value: any) => Promise<T>) { return operation(tx) } } as any,
    get row() { return row },
    set row(value: ProjectCreationDraft) { row = value },
    audits,
  }
}

function harness(bytes: Uint8Array, extension: 'xlsx' | 'docx', initial: Partial<ProjectCreationDraft> = {}) {
  const clock = { now: T0 }
  const fake = fakeDatabase(draftRow(initial), clock)
  const states: ProjectCreationProcessingState[] = []
  const sourceRef = `v1/draft-1/0f0e0d0c-aaaa-bbbb-cccc-000000000001.${extension}`
  let readFailures = 0
  const deps = {
    database: fake.database,
    readUpload: async () => {
      if (readFailures > 0) {
        readFailures -= 1
        throw new ProjectCreationUploadSecurityError('The retained source file is unavailable. Upload it again.', 'STORAGE_UNAVAILABLE')
      }
      return bytes
    },
    writeState: async (_ref: string, state: ProjectCreationProcessingState) => { states.push(structuredClone(state)) },
    resolveActiveAssigneeEmails: async (emails: readonly string[]) => new Set(emails.map((email) => email.toLowerCase())),
    now: () => clock.now,
  }
  const metadata = {
    fileName: `plan.${extension}`,
    mimeType: extension === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: bytes.byteLength,
    hash: sha(bytes),
    sourceRef,
    scanStatus: 'CLEAN' as const,
  }
  return {
    fake, clock, states, deps, metadata, sourceRef,
    failNextReads(count: number) { readFailures = count },
    job(jobVersion: number, sheetName: string | null = null) {
      return runProjectCreationUploadProcessing({
        draftId: 'draft-1', actorUserId: 'owner-1', jobVersion, sourceRef, sourceHash: sha(bytes), sheetName, maxRows: 2_000,
      }, deps)
    },
  }
}

async function workPlanDocx(): Promise<Uint8Array> {
  const cell = (text: string) => new TableCell({ children: [new Paragraph(text)] })
  return Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph({ text: 'Phase 1: Setup', heading: HeadingLevel.HEADING_1 }),
    new Table({ rows: [
      new TableRow({ children: [cell('Task'), cell('Start Date'), cell('End Date')] }),
      new TableRow({ children: [cell('Provision servers'), cell('2026-10-01'), cell('2026-10-09')] }),
    ] }),
  ] }] }))
}

describe('Story 2.7 background-safe processing and retry', () => {
  it('stores + marks PROCESSING in the request, then the background job parses the spreadsheet to READY', async () => {
    const bytes = createScheduleImportTemplate('xlsx').bytes
    const h = harness(bytes, 'xlsx')
    const begun = await beginProjectCreationProcessing({
      id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 1, sourceMetadata: h.metadata, now: T0,
    }, h.fake.database)
    assert.equal(begun.started, true)
    assert.equal(h.fake.row.status, 'PROCESSING')
    assert.equal(h.fake.row.version, 2)
    assert.equal(h.fake.row.scheduleJson, null)
    assert.equal(h.fake.row.sourceRef, h.sourceRef)
    assert.equal(buildProjectCreationImportStatusView(h.fake.row, null, { now: T0 }).stage, 'PROCESSING')
    assert.equal(h.fake.audits[0].data.metadata.kind, 'FILE_IMPORT_PROCESSING_STARTED')

    const state = await h.job(2)
    assert.equal(state?.stage, 'READY_FOR_REVIEW')
    assert.equal(h.fake.row.status, 'READY')
    assert.equal(h.fake.row.version, 3)
    assert.equal(h.states[0].stage, 'PROCESSING', 'progress is persisted before work starts')
    const view = buildProjectCreationImportStatusView(h.fake.row, state, { now: T0 })
    assert.equal(view.stage, 'READY_FOR_REVIEW')
    assert.deepEqual(view.summary, { phases: 2, milestones: 2, activities: 4, dependencies: 4, deliverables: 1 })
    assert.equal(view.aiUsed, false)
    const completed = h.fake.audits.at(-1).data.metadata
    assert.equal(completed.kind, 'FILE_IMPORT_PROCESSED')
    assert.equal(completed.outcome, 'PARSED')
    assert.doesNotMatch(JSON.stringify(h.fake.audits), /Conduct project kickoff/, 'audits carry no source content')
  })

  it('extracts a DOCX schedule in the background and leaves it marked for review', async () => {
    const bytes = await workPlanDocx()
    const h = harness(bytes, 'docx')
    const { draft } = await beginProjectCreationProcessing({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 1, sourceMetadata: h.metadata, now: T0 }, h.fake.database)
    const state = await h.job(draft.version)
    assert.equal(state?.stage, 'DOCX_EXTRACTED')
    assert.equal(h.fake.row.status, 'READY')
    const view = buildProjectCreationImportStatusView(h.fake.row, state, { now: T0 })
    assert.equal(view.stage, 'DOCX_EXTRACTED')
    assert.equal(view.summary?.activities, 1)
    assert.equal(view.commitBlocked, true, 'DOCX drafts are never commit-ready without review')
    assert.equal(view.documentExtraction?.tables, 1)
  })

  it('persists a categorised failure and retries the retained file without re-upload', async () => {
    const bytes = createScheduleImportTemplate('xlsx').bytes
    const h = harness(bytes, 'xlsx')
    const first = await beginProjectCreationProcessing({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 1, sourceMetadata: h.metadata, now: T0 }, h.fake.database)
    h.failNextReads(1)
    const failed = await h.job(first.draft.version)
    assert.equal(failed?.stage, 'FAILED')
    assert.equal(h.fake.row.status, 'FAILED')
    const view = buildProjectCreationImportStatusView(h.fake.row, failed, { now: T0 })
    assert.deepEqual(view.failure, {
      category: 'STORAGE',
      message: 'The retained source file is unavailable. Upload it again.',
      retryable: true,
    })
    assert.equal(view.canRetry, true)
    // Without the private state file the saved blocking issue still explains the failure.
    assert.equal(buildProjectCreationImportStatusView(h.fake.row, null, { now: T0 }).failure?.category, 'STORAGE')

    const retry = await beginProjectCreationProcessing({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: h.fake.row.version, now: T0 }, h.fake.database)
    assert.equal(retry.started, true)
    assert.equal(h.fake.row.sourceRef, h.sourceRef, 'the same retained upload is reprocessed')
    assert.equal(h.fake.audits.at(-1).data.metadata.kind, 'FILE_IMPORT_PROCESSING_RETRIED')
    const recovered = await h.job(retry.draft.version)
    assert.equal(recovered?.stage, 'READY_FOR_REVIEW')
    assert.equal(h.fake.row.status, 'READY')
  })

  it('is idempotent: duplicate retries join the running job, superseded jobs never overwrite, stale jobs can restart', async () => {
    const bytes = createScheduleImportTemplate('xlsx').bytes
    const h = harness(bytes, 'xlsx')
    const first = await beginProjectCreationProcessing({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 1, sourceMetadata: h.metadata, now: T0 }, h.fake.database)

    const duplicate = await beginProjectCreationProcessing({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 1, now: T0 }, h.fake.database)
    assert.equal(duplicate.started, false)
    assert.equal(h.fake.row.version, first.draft.version, 'a duplicate retry changes nothing')
    await assert.rejects(
      beginProjectCreationProcessing({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 2, sourceMetadata: h.metadata, now: T0 }, h.fake.database),
      ProjectCreationDraftStateError,
      'a new upload waits for the running job',
    )

    // Process restarted mid-job: after the stale window the draft may be retried.
    h.clock.now = new Date(T0.getTime() + 11 * 60_000)
    assert.equal(isProjectCreationProcessingStale(h.fake.row, h.clock.now), true)
    assert.equal(buildProjectCreationImportStatusView(h.fake.row, null, { now: h.clock.now }).failure?.category, 'INTERRUPTED')
    const restarted = await beginProjectCreationProcessing({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: first.draft.version, now: h.clock.now }, h.fake.database)
    assert.equal(restarted.started, true)

    // The original (superseded) job finishing late must not overwrite the restarted job's draft.
    assert.equal(await h.job(first.draft.version), null)
    assert.equal(h.fake.row.status, 'PROCESSING')
    assert.equal((await h.job(restarted.draft.version))?.stage, 'READY_FOR_REVIEW')

    await assert.rejects(
      beginProjectCreationProcessing({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 1, now: h.clock.now }, h.fake.database),
      ProjectCreationDraftVersionConflictError,
    )
  })

  it('reports file, parsing, storage, and authorization failures distinctly without internal details', async () => {
    const tampered = harness(createScheduleImportTemplate('xlsx').bytes, 'xlsx')
    const begun = await beginProjectCreationProcessing({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 1, sourceMetadata: { ...tampered.metadata, hash: 'b'.repeat(64) }, now: T0 }, tampered.fake.database)
    await runProjectCreationUploadProcessing({
      draftId: 'draft-1', actorUserId: 'owner-1', jobVersion: begun.draft.version, sourceRef: tampered.sourceRef,
      sourceHash: 'b'.repeat(64), sheetName: null, maxRows: 2_000,
    }, tampered.deps)
    const view = buildProjectCreationImportStatusView(tampered.fake.row, null, { now: T0 })
    assert.equal(view.failure?.category, 'FILE')
    assert.equal(view.failure?.retryable, false)

    const unreadable = harness(new TextEncoder().encode('not a docx'), 'docx')
    const docxBegun = await beginProjectCreationProcessing({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 1, sourceMetadata: unreadable.metadata, now: T0 }, unreadable.fake.database)
    const parsing = await unreadable.job(docxBegun.draft.version)
    assert.equal(parsing?.failure?.category, 'PARSING')

    const unknown = classifyProjectCreationProcessingError(new Error('ECONNREFUSED /var/secret/path at stack'))
    assert.equal(unknown.category, 'UNKNOWN')
    assert.doesNotMatch(unknown.message, /ECONNREFUSED|\/var|stack/)
  })

  it('wires the upload route to store-then-schedule, a polling GET, a retry route, and a polling UI', () => {
    const upload = read('app/api/projects/creation-drafts/[id]/upload/route.ts')
    const retry = read('app/api/projects/creation-drafts/[id]/upload/retry/route.ts')
    const ui = read('features/projects/components/creation/ImportUploadStep.tsx')
    const hooks = read('features/projects/components/creation/useImportProcessing.ts')
    assert.ok(upload.indexOf('secureProjectCreationUpload({') < upload.indexOf('beginProjectCreationProcessing({'))
    assert.ok(upload.indexOf('beginProjectCreationProcessing({') < upload.indexOf('runAfterResponse('))
    assert.match(upload, /status: 202/)
    assert.match(upload, /export const GET = withAuth/)
    assert.doesNotMatch(upload, /inspectProjectCreationSpreadsheet|extractProjectCreationDocx|validateProjectCreationSpreadsheet/, 'no parsing on the request path')
    assert.match(retry, /export const POST = withAuth/)
    assert.match(retry, /if \(started/)
    assert.match(retry, /runAfterResponse\(/)
    assert.match(hooks, /refetchInterval: \(query\) => \(query\.state\.data\?\.stage === 'PROCESSING'/)
    assert.match(ui, /<ProcessingProgress/)
    assert.match(ui, /<Skeleton/)
    assert.match(ui, /Retry processing/)
    assert.match(ui, /FAILURE_LABEL\[view\.failure\.category\]/)
  })
})
