import { Prisma, type ProjectCreationDraft } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import {
  combineNormalizedProjectCreationDraft,
  createEmptyProjectCreationScheduleJson,
  createEmptyProjectCreationValidationJson,
  projectCreationProjectJsonSchema,
  projectCreationScheduleJsonSchema,
  projectCreationValidationJsonSchema,
  type ProjectCreationProjectJson,
  type ProjectCreationScheduleJson,
  type ProjectCreationValidationJson,
} from '@/lib/projects/creation-normalize'
import { validateProjectCreationCleanupTransitions } from '@/lib/projects/creation-changes'

export const PROJECT_CREATION_SOURCE_METHODS = [
  'MANUAL',
  'FILE_IMPORT',
  'AI_GUIDED',
  'AI_TOR',
] as const

export type ProjectCreationSourceMethod = (typeof PROJECT_CREATION_SOURCE_METHODS)[number]

export const PROJECT_CREATION_DRAFT_STATUSES = [
  'DRAFT',
  'PROCESSING',
  'READY',
  'COMMITTING',
  'COMMITTED',
  'FAILED',
  'EXPIRED',
] as const

export type ProjectCreationDraftStatus = (typeof PROJECT_CREATION_DRAFT_STATUSES)[number]

export const PROJECT_CREATION_DRAFT_RETENTION_DAYS_DEFAULT = 30
export const PROJECT_CREATION_DRAFT_JSON_MAX_BYTES = 1_000_000
export const PROJECT_CREATION_DRAFT_CONFLICT_ACTIONS = ['RELOAD', 'COMPARE', 'SAVE_COPY'] as const

const EDITABLE_DRAFT_STATUSES = new Set<ProjectCreationDraftStatus>(['DRAFT', 'READY', 'FAILED'])
const NON_DISCARDABLE_DRAFT_STATUSES = new Set<ProjectCreationDraftStatus>([
  'PROCESSING',
  'COMMITTING',
  'COMMITTED',
])

interface DraftDelegate {
  create(args: Prisma.ProjectCreationDraftCreateArgs): Promise<ProjectCreationDraft>
  findUnique(args: Prisma.ProjectCreationDraftFindUniqueArgs): Promise<ProjectCreationDraft | null>
  updateMany(args: Prisma.ProjectCreationDraftUpdateManyArgs): Promise<Prisma.BatchPayload>
  deleteMany(args: Prisma.ProjectCreationDraftDeleteManyArgs): Promise<Prisma.BatchPayload>
}

interface DraftTransaction {
  projectCreationDraft: DraftDelegate
  activityLog: {
    create(args: unknown): Promise<unknown>
  }
}

interface DraftDatabase {
  projectCreationDraft: DraftDelegate
  $transaction<T>(operation: (tx: DraftTransaction) => Promise<T>): Promise<T>
}

export class ProjectCreationDraftNotFoundError extends Error {
  readonly code = 'PROJECT_CREATION_DRAFT_NOT_FOUND'

  constructor() {
    super('Project creation draft not found')
    this.name = 'ProjectCreationDraftNotFoundError'
  }
}

export class ProjectCreationDraftVersionConflictError extends Error {
  readonly code = 'PROJECT_CREATION_DRAFT_VERSION_CONFLICT'
  readonly actions = PROJECT_CREATION_DRAFT_CONFLICT_ACTIONS

  constructor(
    readonly expectedVersion: number,
    readonly currentVersion: number,
  ) {
    super('This draft changed in another browser tab')
    this.name = 'ProjectCreationDraftVersionConflictError'
  }
}

export class ProjectCreationDraftStateError extends Error {
  readonly code = 'PROJECT_CREATION_DRAFT_STATE_CONFLICT'

  constructor(readonly status: string, message: string) {
    super(message)
    this.name = 'ProjectCreationDraftStateError'
  }
}

export interface CreateProjectCreationDraftInput {
  ownerUserId: string
  sourceMethod: ProjectCreationSourceMethod
  projectJson: ProjectCreationProjectJson
  now?: Date
  retentionDays?: number
}

export interface UpdateProjectCreationDraftInput {
  id: string
  actorUserId: string
  expectedVersion: number
  sourceMethod?: ProjectCreationSourceMethod
  discardMethodData?: true
  projectJson?: ProjectCreationProjectJson
  scheduleJson?: ProjectCreationScheduleJson
  validationJson?: ProjectCreationValidationJson
  clearMethodData?: true
  /** Server-only authorization for a provider/parser to introduce new proposals. */
  allowNewAiProposals?: true
  sourceMetadata?: {
    fileName: string
    mimeType: string
    size: number
    hash: string
    sourceRef: string
    scanStatus: 'CLEAN'
    outcome: 'SHEET_SELECTION_REQUIRED' | 'MAPPING_REQUIRED' | 'VALIDATION_FAILED' | 'PARSED' | 'DOCX_EXTRACTED'
    mappingMode: 'NONE' | 'EXACT' | 'MANUAL'
  }
}

export interface DeleteProjectCreationDraftInput {
  id: string
  actorUserId: string
  expectedVersion: number
}

export interface GetProjectCreationDraftInput {
  id: string
  actorUserId: string
  actorRole: string
}

export type ProjectCreationDraftResponse = Omit<
  ProjectCreationDraft,
  'sourceRef' | 'projectJson' | 'scheduleJson' | 'validationJson'
> & {
  projectJson: ProjectCreationProjectJson
  scheduleJson: ProjectCreationScheduleJson | null
  validationJson: ProjectCreationValidationJson | null
}

export function resolveProjectCreationDraftRetentionDays(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const parsed = Number(env.PROJECT_CREATION_DRAFT_RETENTION_DAYS)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650
    ? parsed
    : PROJECT_CREATION_DRAFT_RETENTION_DAYS_DEFAULT
}

export function isProjectCreationDraftJsonWithinLimit(value: Record<string, unknown>): boolean {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= PROJECT_CREATION_DRAFT_JSON_MAX_BYTES
}

export function toProjectCreationDraftResponse(
  draft: ProjectCreationDraft,
): ProjectCreationDraftResponse {
  return {
    id: draft.id,
    ownerUserId: draft.ownerUserId,
    sourceMethod: draft.sourceMethod,
    status: draft.status,
    version: draft.version,
    projectJson: projectCreationProjectJsonSchema.parse(draft.projectJson),
    scheduleJson: draft.scheduleJson === null
      ? null
      : projectCreationScheduleJsonSchema.parse(draft.scheduleJson),
    validationJson: draft.validationJson === null
      ? null
      : projectCreationValidationJsonSchema.parse(draft.validationJson),
    sourceFileName: draft.sourceFileName,
    sourceMimeType: draft.sourceMimeType,
    sourceSize: draft.sourceSize,
    sourceHash: draft.sourceHash,
    aiProvider: draft.aiProvider,
    aiModelId: draft.aiModelId,
    aiPromptVersion: draft.aiPromptVersion,
    committedProjectId: draft.committedProjectId,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    committedAt: draft.committedAt,
    expiresAt: draft.expiresAt,
  }
}

export async function createProjectCreationDraft(
  input: CreateProjectCreationDraftInput,
  database: DraftDatabase = prisma as unknown as DraftDatabase,
): Promise<ProjectCreationDraft> {
  const projectJson = projectCreationProjectJsonSchema.parse(input.projectJson)
  if (!isProjectCreationDraftJsonWithinLimit(projectJson)) {
    throw new Error('Project creation draft JSON field exceeds 1 MB')
  }
  const now = input.now ?? new Date()
  const retentionDays = input.retentionDays ?? resolveProjectCreationDraftRetentionDays()
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error('Invalid project creation draft retention period')
  }
  const expiresAt = new Date(now.getTime() + retentionDays * 86_400_000)

  return database.$transaction(async (tx) => {
    const draft = await tx.projectCreationDraft.create({
      data: {
        ownerUserId: input.ownerUserId,
        sourceMethod: input.sourceMethod,
        status: 'DRAFT',
        version: 1,
        projectJson: projectJson as Prisma.InputJsonValue,
        expiresAt,
      },
    })
    await recordActivity({
      entityType: 'PROJECT_CREATION_DRAFT',
      action: 'CREATED',
      actorId: input.ownerUserId,
      metadata: {
        draftId: draft.id,
        sourceMethod: draft.sourceMethod,
        status: draft.status,
        version: draft.version,
      },
    }, { client: tx, required: true })
    return draft
  })
}

export async function getProjectCreationDraft(
  input: GetProjectCreationDraftInput,
  database: Pick<DraftDatabase, 'projectCreationDraft'> = prisma as unknown as DraftDatabase,
): Promise<ProjectCreationDraft> {
  const draft = await database.projectCreationDraft.findUnique({ where: { id: input.id } })
  if (!draft || (draft.ownerUserId !== input.actorUserId && input.actorRole !== 'ADMIN')) {
    throw new ProjectCreationDraftNotFoundError()
  }
  return draft
}

export async function updateProjectCreationDraft(
  input: UpdateProjectCreationDraftInput,
  database: DraftDatabase = prisma as unknown as DraftDatabase,
): Promise<ProjectCreationDraft> {
  const projectJson = input.projectJson === undefined
    ? undefined
    : projectCreationProjectJsonSchema.parse(input.projectJson)
  const scheduleJson = input.scheduleJson === undefined
    ? undefined
    : projectCreationScheduleJsonSchema.parse(input.scheduleJson)
  const validationJson = input.validationJson === undefined
    ? undefined
    : projectCreationValidationJsonSchema.parse(input.validationJson)
  const sourceMetadata = input.sourceMetadata
  if (sourceMetadata) {
    if (!sourceMetadata.fileName.trim() || sourceMetadata.fileName.length > 255) {
      throw new Error('Invalid source file name')
    }
    if (!sourceMetadata.mimeType.trim() || sourceMetadata.mimeType.length > 200) {
      throw new Error('Invalid source MIME type')
    }
    if (!Number.isInteger(sourceMetadata.size) || sourceMetadata.size < 1) {
      throw new Error('Invalid source file size')
    }
    if (!/^[a-f0-9]{64}$/.test(sourceMetadata.hash)) {
      throw new Error('Invalid source file hash')
    }
    if (!/^v1\/[a-zA-Z0-9_-]+\/[a-f0-9-]+\.(csv|xls|xlsx|docx)$/.test(sourceMetadata.sourceRef)) {
      throw new Error('Invalid secure source reference')
    }
    if (sourceMetadata.scanStatus !== 'CLEAN') {
      throw new Error('Source file must pass malware scanning')
    }
  }
  for (const value of [projectJson, scheduleJson, validationJson]) {
    if (value !== undefined && !isProjectCreationDraftJsonWithinLimit(value)) {
      throw new Error('Project creation draft JSON field exceeds 1 MB')
    }
  }
  const hasUpdate = input.sourceMethod !== undefined
    || projectJson !== undefined
    || scheduleJson !== undefined
    || validationJson !== undefined
    || input.clearMethodData === true
    || sourceMetadata !== undefined
  if (!hasUpdate) throw new Error('At least one draft field is required')

  return database.$transaction(async (tx) => {
    const current = await tx.projectCreationDraft.findUnique({ where: { id: input.id } })
    if (!current || current.ownerUserId !== input.actorUserId) {
      throw new ProjectCreationDraftNotFoundError()
    }
    if (!EDITABLE_DRAFT_STATUSES.has(current.status as ProjectCreationDraftStatus)) {
      throw new ProjectCreationDraftStateError(
        current.status,
        `Drafts in ${current.status} status cannot be edited`,
      )
    }
    const currentProjectJson = projectCreationProjectJsonSchema.parse(current.projectJson)
    const currentScheduleJson = current.scheduleJson === null
      ? createEmptyProjectCreationScheduleJson()
      : projectCreationScheduleJsonSchema.parse(current.scheduleJson)
    const currentValidationJson = current.validationJson === null
      ? createEmptyProjectCreationValidationJson()
      : projectCreationValidationJsonSchema.parse(current.validationJson)
    const cleanupDecisions = sourceMetadata
      ? { acceptedIds: [], rejectedIds: [] }
      : validateProjectCreationCleanupTransitions(
        combineNormalizedProjectCreationDraft(currentProjectJson, currentScheduleJson, currentValidationJson),
        combineNormalizedProjectCreationDraft(
          projectJson ?? currentProjectJson,
          scheduleJson ?? currentScheduleJson,
          validationJson ?? currentValidationJson,
        ),
        { allowNewProposals: input.allowNewAiProposals === true },
      )
    const methodChanged = input.sourceMethod !== undefined
      && input.sourceMethod !== current.sourceMethod
    if (methodChanged && input.discardMethodData !== true) {
      throw new Error('Changing creation method requires explicit method-data discard confirmation')
    }
    const changedFields = [
      methodChanged ? 'sourceMethod' : null,
      projectJson !== undefined ? 'projectJson' : null,
      methodChanged || input.clearMethodData || scheduleJson !== undefined ? 'scheduleJson' : null,
      methodChanged || input.clearMethodData || validationJson !== undefined ? 'validationJson' : null,
      sourceMetadata !== undefined ? 'sourceMetadata' : null,
    ].filter((field): field is string => field !== null)

    const result = await tx.projectCreationDraft.updateMany({
      where: {
        id: input.id,
        ownerUserId: input.actorUserId,
        version: input.expectedVersion,
      },
      data: {
        ...(methodChanged ? { sourceMethod: input.sourceMethod } : {}),
        ...(projectJson !== undefined
          ? { projectJson: projectJson as Prisma.InputJsonValue }
          : {}),
        ...(methodChanged || input.clearMethodData
          ? { scheduleJson: Prisma.DbNull }
          : scheduleJson !== undefined
          ? { scheduleJson: scheduleJson as Prisma.InputJsonValue }
          : {}),
        ...(methodChanged || input.clearMethodData
          ? { validationJson: Prisma.DbNull }
          : validationJson !== undefined
          ? { validationJson: validationJson as Prisma.InputJsonValue }
          : {}),
        ...(methodChanged ? {
          sourceFileName: null,
          sourceMimeType: null,
          sourceSize: null,
          sourceHash: null,
          sourceRef: null,
        } : {}),
        ...(sourceMetadata ? {
          sourceFileName: sourceMetadata.fileName,
          sourceMimeType: sourceMetadata.mimeType,
          sourceSize: sourceMetadata.size,
          sourceHash: sourceMetadata.hash,
          sourceRef: sourceMetadata.sourceRef,
        } : {}),
        version: { increment: 1 },
      },
    })
    if (result.count !== 1) {
      const latest = await tx.projectCreationDraft.findUnique({ where: { id: input.id } })
      if (!latest) throw new ProjectCreationDraftNotFoundError()
      throw new ProjectCreationDraftVersionConflictError(input.expectedVersion, latest.version)
    }

    const updated = await tx.projectCreationDraft.findUnique({ where: { id: input.id } })
    if (!updated) throw new ProjectCreationDraftNotFoundError()
    await recordActivity({
      entityType: 'PROJECT_CREATION_DRAFT',
      action: 'UPDATED',
      actorId: input.actorUserId,
      changes: { version: { from: current.version, to: updated.version } },
      metadata: {
        draftId: updated.id,
        changedFields,
        status: updated.status,
        ...(sourceMetadata ? {
          kind: 'FILE_IMPORT_PROCESSED',
          fileName: sourceMetadata.fileName,
          sourceMimeType: sourceMetadata.mimeType,
          sourceSize: sourceMetadata.size,
          sourceHash: sourceMetadata.hash,
          scanStatus: sourceMetadata.scanStatus,
          outcome: sourceMetadata.outcome,
          mappingMode: sourceMetadata.mappingMode,
        } : {}),
      },
    }, { client: tx, required: true })
    if (cleanupDecisions.acceptedIds.length > 0) {
      await recordActivity({
        entityType: 'PROJECT_CREATION_DRAFT',
        action: 'AI_CLEANUP_ACCEPTED',
        actorId: input.actorUserId,
        metadata: {
          draftId: updated.id,
          count: cleanupDecisions.acceptedIds.length,
          changeIds: cleanupDecisions.acceptedIds,
          version: updated.version,
        },
      }, { client: tx, required: true })
    }
    if (cleanupDecisions.rejectedIds.length > 0) {
      await recordActivity({
        entityType: 'PROJECT_CREATION_DRAFT',
        action: 'AI_CLEANUP_REJECTED',
        actorId: input.actorUserId,
        metadata: {
          draftId: updated.id,
          count: cleanupDecisions.rejectedIds.length,
          changeIds: cleanupDecisions.rejectedIds,
          version: updated.version,
        },
      }, { client: tx, required: true })
    }
    return updated
  })
}

export async function deleteProjectCreationDraft(
  input: DeleteProjectCreationDraftInput,
  database: DraftDatabase = prisma as unknown as DraftDatabase,
): Promise<{ id: string; discarded: true }> {
  return database.$transaction(async (tx) => {
    const current = await tx.projectCreationDraft.findUnique({ where: { id: input.id } })
    if (!current || current.ownerUserId !== input.actorUserId) {
      throw new ProjectCreationDraftNotFoundError()
    }
    if (NON_DISCARDABLE_DRAFT_STATUSES.has(current.status as ProjectCreationDraftStatus)) {
      throw new ProjectCreationDraftStateError(
        current.status,
        `Drafts in ${current.status} status cannot be discarded`,
      )
    }

    const result = await tx.projectCreationDraft.deleteMany({
      where: {
        id: input.id,
        ownerUserId: input.actorUserId,
        version: input.expectedVersion,
      },
    })
    if (result.count !== 1) {
      const latest = await tx.projectCreationDraft.findUnique({ where: { id: input.id } })
      if (!latest) throw new ProjectCreationDraftNotFoundError()
      throw new ProjectCreationDraftVersionConflictError(input.expectedVersion, latest.version)
    }

    await recordActivity({
      entityType: 'PROJECT_CREATION_DRAFT',
      action: 'DELETED',
      actorId: input.actorUserId,
      metadata: {
        draftId: current.id,
        sourceMethod: current.sourceMethod,
        status: current.status,
        version: current.version,
      },
    }, { client: tx, required: true })
    return { id: current.id, discarded: true }
  })
}
