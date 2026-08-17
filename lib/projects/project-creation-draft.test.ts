import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { Prisma, type ProjectCreationDraft } from '@prisma/client'
import {
  PROJECT_CREATION_DRAFT_CONFLICT_ACTIONS,
  ProjectCreationDraftNotFoundError,
  ProjectCreationDraftStateError,
  ProjectCreationDraftVersionConflictError,
  createProjectCreationDraft,
  deleteProjectCreationDraft,
  getProjectCreationDraft,
  isProjectCreationDraftJsonWithinLimit,
  resolveProjectCreationDraftRetentionDays,
  toProjectCreationDraftResponse,
  updateProjectCreationDraft,
} from './creation-draft'
import {
  createEmptyProjectCreationProjectJson,
  createEmptyProjectCreationScheduleJson,
  createEmptyProjectCreationValidationJson,
} from './creation-normalize'

const ROOT = process.cwd()
const BASE_TIME = new Date('2026-08-16T12:00:00.000Z')

function projectJson(name = 'Safe draft') {
  const value = createEmptyProjectCreationProjectJson('owner-1')
  value.project.name = name
  return value
}

function createDraftRecord(overrides: Partial<ProjectCreationDraft> = {}): ProjectCreationDraft {
  return {
    id: 'draft-1',
    ownerUserId: 'owner-1',
    sourceMethod: 'MANUAL',
    status: 'DRAFT',
    version: 1,
    projectJson: projectJson(),
    scheduleJson: null,
    validationJson: null,
    sourceFileName: null,
    sourceMimeType: null,
    sourceSize: null,
    sourceHash: null,
    sourceRef: null,
    aiProvider: null,
    aiModelId: null,
    aiPromptVersion: null,
    committedProjectId: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    committedAt: null,
    expiresAt: new Date('2026-09-15T12:00:00.000Z'),
    ...overrides,
  }
}

function createDraftDatabase(seed: ProjectCreationDraft[] = []) {
  let rows = new Map(seed.map((draft) => [draft.id, structuredClone(draft)]))
  const auditEntries: any[] = []
  let nextId = seed.length + 1
  let failAudit = false

  const delegate = {
    async create(args: any) {
      const draft = createDraftRecord({
        ...args.data,
        id: `draft-${nextId++}`,
        createdAt: args.data.createdAt ?? BASE_TIME,
        updatedAt: args.data.updatedAt ?? BASE_TIME,
        scheduleJson: args.data.scheduleJson ?? null,
        validationJson: args.data.validationJson ?? null,
        sourceFileName: args.data.sourceFileName ?? null,
        sourceMimeType: args.data.sourceMimeType ?? null,
        sourceSize: args.data.sourceSize ?? null,
        sourceHash: args.data.sourceHash ?? null,
        sourceRef: args.data.sourceRef ?? null,
        aiProvider: args.data.aiProvider ?? null,
        aiModelId: args.data.aiModelId ?? null,
        aiPromptVersion: args.data.aiPromptVersion ?? null,
        committedProjectId: args.data.committedProjectId ?? null,
        committedAt: args.data.committedAt ?? null,
      })
      rows.set(draft.id, draft)
      return structuredClone(draft)
    },
    async findUnique(args: any) {
      const draft = rows.get(args.where.id)
      return draft ? structuredClone(draft) : null
    },
    async updateMany(args: any) {
      const draft = rows.get(args.where.id)
      if (!draft
        || draft.ownerUserId !== args.where.ownerUserId
        || draft.version !== args.where.version) return { count: 0 }
      const data = args.data
      const next = {
        ...draft,
        ...(data.sourceMethod !== undefined ? { sourceMethod: data.sourceMethod } : {}),
        ...(data.projectJson !== undefined ? { projectJson: data.projectJson } : {}),
        ...(data.scheduleJson !== undefined
          ? { scheduleJson: data.scheduleJson === Prisma.DbNull ? null : data.scheduleJson }
          : {}),
        ...(data.validationJson !== undefined
          ? { validationJson: data.validationJson === Prisma.DbNull ? null : data.validationJson }
          : {}),
        ...(data.sourceFileName !== undefined ? { sourceFileName: data.sourceFileName } : {}),
        ...(data.sourceMimeType !== undefined ? { sourceMimeType: data.sourceMimeType } : {}),
        ...(data.sourceSize !== undefined ? { sourceSize: data.sourceSize } : {}),
        ...(data.sourceHash !== undefined ? { sourceHash: data.sourceHash } : {}),
        ...(data.sourceRef !== undefined ? { sourceRef: data.sourceRef } : {}),
        version: draft.version + data.version.increment,
        updatedAt: new Date(draft.updatedAt.getTime() + 1000),
      }
      rows.set(draft.id, next)
      return { count: 1 }
    },
    async deleteMany(args: any) {
      const draft = rows.get(args.where.id)
      if (!draft
        || draft.ownerUserId !== args.where.ownerUserId
        || draft.version !== args.where.version) return { count: 0 }
      rows.delete(draft.id)
      return { count: 1 }
    },
  }

  const tx: any = {
    projectCreationDraft: delegate,
    activityLog: {
      async create(args: any) {
        if (failAudit) throw new Error('audit unavailable')
        auditEntries.push(structuredClone(args))
        return args
      },
    },
  }

  const database: any = {
    ...tx,
    async $transaction<T>(operation: (transaction: any) => Promise<T>): Promise<T> {
      const snapshot = structuredClone(rows)
      const auditLength = auditEntries.length
      try {
        return await operation(tx)
      } catch (error) {
        rows = snapshot
        auditEntries.length = auditLength
        throw error
      }
    },
  }

  return {
    database,
    auditEntries,
    get rows() { return rows },
    setFailAudit(value: boolean) { failAudit = value },
  }
}

describe('Project creation draft persistence and concurrency', () => {
  it('creates a private version-1 draft with the default 30-day expiry and required audit', async () => {
    const fake = createDraftDatabase()
    const draft = await createProjectCreationDraft({
      ownerUserId: 'owner-1',
      sourceMethod: 'FILE_IMPORT',
      projectJson: projectJson('Confidential client plan'),
      now: BASE_TIME,
      retentionDays: 30,
    }, fake.database)

    assert.equal(draft.ownerUserId, 'owner-1')
    assert.equal(draft.sourceMethod, 'FILE_IMPORT')
    assert.equal(draft.status, 'DRAFT')
    assert.equal(draft.version, 1)
    assert.equal(draft.expiresAt?.toISOString(), '2026-09-15T12:00:00.000Z')
    assert.equal(fake.auditEntries.length, 1)
    assert.equal(fake.auditEntries[0].data.entityType, 'PROJECT_CREATION_DRAFT')
    assert.equal(fake.auditEntries[0].data.action, 'CREATED')
    assert.equal(fake.auditEntries[0].data.actorId, 'owner-1')
    assert.equal(JSON.stringify(fake.auditEntries).includes('Confidential client plan'), false)
  })

  it('keeps drafts owner-private while allowing Administrator inspection only', async () => {
    const fake = createDraftDatabase([createDraftRecord()])
    assert.equal((await getProjectCreationDraft({
      id: 'draft-1', actorUserId: 'owner-1', actorRole: 'EMPLOYEE',
    }, fake.database)).id, 'draft-1')
    assert.equal((await getProjectCreationDraft({
      id: 'draft-1', actorUserId: 'admin-1', actorRole: 'ADMIN',
    }, fake.database)).id, 'draft-1')
    await assert.rejects(
      getProjectCreationDraft({
        id: 'draft-1', actorUserId: 'other-1', actorRole: 'EXECUTIVE',
      }, fake.database),
      ProjectCreationDraftNotFoundError,
    )
  })

  it('atomically saves owner edits and increments the version exactly once', async () => {
    const fake = createDraftDatabase([createDraftRecord()])
    const updated = await updateProjectCreationDraft({
      id: 'draft-1',
      actorUserId: 'owner-1',
      expectedVersion: 1,
      projectJson: projectJson('Edited project'),
      scheduleJson: createEmptyProjectCreationScheduleJson(),
    }, fake.database)

    assert.equal(updated.version, 2)
    assert.deepEqual(updated.projectJson, projectJson('Edited project'))
    assert.deepEqual(updated.scheduleJson, createEmptyProjectCreationScheduleJson())
    assert.deepEqual(fake.auditEntries[0].data.changes.version, { from: 1, to: 2 })
    assert.deepEqual(fake.auditEntries[0].data.metadata.changedFields, ['projectJson', 'scheduleJson'])
  })

  it('atomically saves deterministic import metadata and audits only safe processing evidence', async () => {
    const fake = createDraftDatabase([createDraftRecord({ sourceMethod: 'FILE_IMPORT' })])
    const updated = await updateProjectCreationDraft({
      id: 'draft-1',
      actorUserId: 'owner-1',
      expectedVersion: 1,
      scheduleJson: createEmptyProjectCreationScheduleJson(),
      validationJson: createEmptyProjectCreationValidationJson(),
      sourceMetadata: {
        fileName: 'schedule.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 4096,
        hash: 'a'.repeat(64),
        sourceRef: 'v1/draft-1/123e4567-e89b-12d3-a456-426614174000.xlsx',
        scanStatus: 'CLEAN',
        outcome: 'PARSED',
        mappingMode: 'EXACT',
      },
    }, fake.database)

    assert.equal(updated.version, 2)
    assert.equal(updated.sourceFileName, 'schedule.xlsx')
    assert.equal(updated.sourceSize, 4096)
    assert.equal(updated.sourceHash, 'a'.repeat(64))
    assert.equal(updated.sourceRef, 'v1/draft-1/123e4567-e89b-12d3-a456-426614174000.xlsx')
    assert.equal(fake.auditEntries[0].data.metadata.kind, 'FILE_IMPORT_PROCESSED')
    assert.equal(fake.auditEntries[0].data.metadata.outcome, 'PARSED')
    assert.equal(fake.auditEntries[0].data.metadata.mappingMode, 'EXACT')
    assert.equal(fake.auditEntries[0].data.metadata.scanStatus, 'CLEAN')
    assert.equal(JSON.stringify(fake.auditEntries).includes('123e4567-e89b-12d3-a456-426614174000'), false)
    assert.equal(JSON.stringify(fake.auditEntries).includes('activity description'), false)
  })

  it('switches method only after explicit confirmation, preserving common data and clearing method data', async () => {
    const originalProject = projectJson('Preserved common details')
    const fake = createDraftDatabase([createDraftRecord({
      sourceMethod: 'FILE_IMPORT',
      projectJson: originalProject,
      scheduleJson: createEmptyProjectCreationScheduleJson(),
      validationJson: createEmptyProjectCreationValidationJson(),
    })])

    await assert.rejects(updateProjectCreationDraft({
      id: 'draft-1',
      actorUserId: 'owner-1',
      expectedVersion: 1,
      sourceMethod: 'MANUAL',
    }, fake.database), /explicit method-data discard confirmation/)
    assert.equal(fake.rows.get('draft-1')?.sourceMethod, 'FILE_IMPORT')

    const updated = await updateProjectCreationDraft({
      id: 'draft-1',
      actorUserId: 'owner-1',
      expectedVersion: 1,
      sourceMethod: 'MANUAL',
      discardMethodData: true,
    }, fake.database)

    assert.equal(updated.sourceMethod, 'MANUAL')
    assert.equal(updated.version, 2)
    assert.deepEqual(updated.projectJson, originalProject)
    assert.equal(updated.scheduleJson, null)
    assert.equal(updated.validationJson, null)
    assert.deepEqual(fake.auditEntries[0].data.metadata.changedFields, [
      'sourceMethod', 'scheduleJson', 'validationJson',
    ])
  })

  it('rejects a stale browser-tab version with reload, compare, and save-copy choices', async () => {
    const fake = createDraftDatabase([createDraftRecord({ version: 3 })])
    await assert.rejects(
      updateProjectCreationDraft({
        id: 'draft-1',
        actorUserId: 'owner-1',
        expectedVersion: 2,
        projectJson: projectJson('Stale edit'),
      }, fake.database),
      (error: unknown) => {
        assert.ok(error instanceof ProjectCreationDraftVersionConflictError)
        assert.equal(error.expectedVersion, 2)
        assert.equal(error.currentVersion, 3)
        assert.deepEqual(error.actions, PROJECT_CREATION_DRAFT_CONFLICT_ACTIONS)
        return true
      },
    )
    assert.equal(fake.rows.get('draft-1')?.version, 3)
    assert.deepEqual(fake.rows.get('draft-1')?.projectJson, projectJson())
    assert.equal(fake.auditEntries.length, 0)
  })

  it('denies non-owner edits and edits in processing or committed states', async () => {
    const fake = createDraftDatabase([createDraftRecord()])
    await assert.rejects(updateProjectCreationDraft({
      id: 'draft-1', actorUserId: 'other-1', expectedVersion: 1, projectJson: projectJson(),
    }, fake.database), ProjectCreationDraftNotFoundError)

    fake.rows.set('draft-1', createDraftRecord({ status: 'PROCESSING' }))
    await assert.rejects(updateProjectCreationDraft({
      id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 1, projectJson: projectJson(),
    }, fake.database), ProjectCreationDraftStateError)

    fake.rows.set('draft-1', createDraftRecord({ status: 'COMMITTED' }))
    await assert.rejects(updateProjectCreationDraft({
      id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 1, projectJson: projectJson(),
    }, fake.database), ProjectCreationDraftStateError)
  })

  it('discards only an owner current-version draft and audits without retained source details', async () => {
    const fake = createDraftDatabase([createDraftRecord({
      sourceFileName: 'schedule.xlsx',
      sourceRef: '/private/storage/generated-id',
    })])
    const result = await deleteProjectCreationDraft({
      id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 1,
    }, fake.database)

    assert.deepEqual(result, { id: 'draft-1', discarded: true })
    assert.equal(fake.rows.has('draft-1'), false)
    assert.equal(fake.auditEntries[0].data.action, 'DELETED')
    assert.equal(JSON.stringify(fake.auditEntries).includes('/private/storage'), false)
  })

  it('rolls back the draft mutation when its required audit cannot be written', async () => {
    const fake = createDraftDatabase([createDraftRecord()])
    fake.setFailAudit(true)

    await assert.rejects(updateProjectCreationDraft({
      id: 'draft-1',
      actorUserId: 'owner-1',
      expectedVersion: 1,
      projectJson: projectJson('Must roll back'),
    }, fake.database), /audit unavailable/)
    assert.equal(fake.rows.get('draft-1')?.version, 1)
    assert.deepEqual(fake.rows.get('draft-1')?.projectJson, projectJson())
  })

  it('never exposes the internal source storage reference in API response data', () => {
    const response = toProjectCreationDraftResponse(createDraftRecord({
      sourceRef: '/private/storage/generated-id',
      sourceHash: 'sha256-safe-to-display',
    }))
    assert.equal('sourceRef' in response, false)
    assert.equal(response.sourceHash, 'sha256-safe-to-display')
  })

  it('uses the exact strategy schema and thin authenticated, validated CRUD routes', () => {
    const schema = readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8')
    const collectionRoute = readFileSync(path.join(ROOT, 'app/api/projects/creation-drafts/route.ts'), 'utf8')
    const itemRoute = readFileSync(path.join(ROOT, 'app/api/projects/creation-drafts/[id]/route.ts'), 'utf8')

    assert.match(schema, /model ProjectCreationDraft \{[\s\S]*ownerUserId\s+String[\s\S]*sourceMethod\s+String/)
    assert.match(schema, /status\s+String\s+@default\("DRAFT"\)/)
    assert.match(schema, /version\s+Int\s+@default\(1\)/)
    assert.match(schema, /projectJson\s+Json[\s\S]*scheduleJson\s+Json\?[\s\S]*validationJson\s+Json\?/)
    assert.match(schema, /@@index\(\[ownerUserId, status\]\)/)
    assert.match(schema, /@@map\("project_creation_drafts"\)/)
    assert.match(collectionRoute, /export const POST = withAuth\(/)
    assert.match(collectionRoute, /canCreateProject\(/)
    assert.match(collectionRoute, /z\.enum\(PROJECT_CREATION_SOURCE_METHODS\)/)
    assert.match(itemRoute, /export const GET = withAuth<RouteParams>/)
    assert.match(itemRoute, /export const PATCH = withAuth<RouteParams>/)
    assert.match(itemRoute, /export const DELETE = withAuth<RouteParams>/)
    assert.match(itemRoute, /apiConflict\(error\.message/)
    assert.match(itemRoute, /expectedVersion: parsed\.data\.version/)
    assert.doesNotMatch(collectionRoute + itemRoute, /prisma\./)
  })

  it('keeps retention configurable with a bounded 30-day default', () => {
    assert.equal(resolveProjectCreationDraftRetentionDays({}), 30)
    assert.equal(resolveProjectCreationDraftRetentionDays({ PROJECT_CREATION_DRAFT_RETENTION_DAYS: '45' }), 45)
    assert.equal(resolveProjectCreationDraftRetentionDays({ PROJECT_CREATION_DRAFT_RETENTION_DAYS: '0' }), 30)
    assert.equal(resolveProjectCreationDraftRetentionDays({ PROJECT_CREATION_DRAFT_RETENTION_DAYS: 'not-a-number' }), 30)
    assert.equal(isProjectCreationDraftJsonWithinLimit({ value: 'small' }), true)
    assert.equal(isProjectCreationDraftJsonWithinLimit({ value: 'x'.repeat(1_000_001) }), false)
  })
})
