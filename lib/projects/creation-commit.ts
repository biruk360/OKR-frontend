import { Prisma, type PrismaClient, type ProjectCreationDraft } from '@prisma/client'
import { recordActivity } from '@/lib/activity-log'
import { prisma } from '@/lib/prisma'
import { authorizeProjectCreationCommit } from '@/lib/projects/project-creation-authorization'
import {
  combineNormalizedProjectCreationDraft,
  createEmptyProjectCreationScheduleJson,
  createEmptyProjectCreationValidationJson,
  type NormalizedProjectCreationDraft,
} from '@/lib/projects/creation-normalize'
import {
  hasBlockingProjectCreationIssues,
  validateProjectCreationCommitReadiness,
} from '@/lib/projects/creation-validate'
import {
  projectCreationAcknowledgedWarningCount,
  projectCreationClientCommitBlockers,
  projectCreationCommitCounts,
  type CommitProjectCreationDraftResult,
} from '@/lib/projects/creation-commit-shared'
import { recalcProjectRollup } from '@/lib/projects/rollup'
import { createProjectWithTemplate } from '@/lib/projects/service'

const COMMITTABLE_STATUSES = ['DRAFT', 'READY', 'FAILED'] as const

export interface CommitProjectCreationDraftInput {
  draftId: string
  actorUserId: string
  expectedVersion: number
  now?: Date
}

export class ProjectCreationCommitNotFoundError extends Error {
  readonly code = 'PROJECT_CREATION_COMMIT_NOT_FOUND'
  constructor() {
    super('Project creation draft not found')
    this.name = 'ProjectCreationCommitNotFoundError'
  }
}

export class ProjectCreationCommitVersionError extends Error {
  readonly code = 'PROJECT_CREATION_COMMIT_VERSION_CONFLICT'
  constructor(readonly expectedVersion: number, readonly currentVersion: number) {
    super('This draft changed in another browser tab. Reload it before creating the project.')
    this.name = 'ProjectCreationCommitVersionError'
  }
}

export class ProjectCreationCommitStateError extends Error {
  readonly code = 'PROJECT_CREATION_COMMIT_STATE_CONFLICT'
  constructor(readonly status: string) {
    super(`Drafts in ${status} status cannot be committed`)
    this.name = 'ProjectCreationCommitStateError'
  }
}

export class ProjectCreationCommitAuthorizationError extends Error {
  readonly code = 'PROJECT_CREATION_COMMIT_FORBIDDEN'
  constructor(readonly reasonCode: string) {
    super(commitAuthorizationMessage(reasonCode))
    this.name = 'ProjectCreationCommitAuthorizationError'
  }
}

export class ProjectCreationCommitValidationError extends Error {
  readonly code = 'PROJECT_CREATION_COMMIT_VALIDATION_FAILED'
  constructor(
    readonly validation: ReturnType<typeof validateProjectCreationCommitReadiness>,
    readonly blockers: string[],
  ) {
    super(blockers[0] ?? 'Resolve the blocking validation findings before creating the project.')
    this.name = 'ProjectCreationCommitValidationError'
  }
}

function commitAuthorizationMessage(reasonCode: string): string {
  if (reasonCode === 'DEPARTMENT_OUT_OF_SCOPE') return 'The selected department is outside your active scope.'
  if (reasonCode === 'DEPARTMENT_REQUIRED') return 'Select a department within your active scope.'
  if (reasonCode === 'PROJECT_MANAGER_INACTIVE') return 'Select an active project manager.'
  if (reasonCode === 'CREATOR_INACTIVE' || reasonCode === 'CREATION_FORBIDDEN') {
    return 'Project-creation access is no longer available. The draft has been preserved.'
  }
  return 'Only the active draft owner may create this project.'
}

function parseDraft(draft: ProjectCreationDraft): NormalizedProjectCreationDraft {
  const schedule = draft.scheduleJson ?? createEmptyProjectCreationScheduleJson()
  const validation = draft.validationJson ?? createEmptyProjectCreationValidationJson()
  return combineNormalizedProjectCreationDraft(draft.projectJson, schedule, validation)
}

function utcDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

async function existingResult(
  tx: Prisma.TransactionClient,
  draft: ProjectCreationDraft,
  normalized: NormalizedProjectCreationDraft,
): Promise<CommitProjectCreationDraftResult> {
  if (!draft.committedProjectId) throw new ProjectCreationCommitStateError(draft.status)
  const project = await tx.project.findUnique({
    where: { id: draft.committedProjectId },
    select: { id: true, code: true, status: true, baselineCommittedAt: true },
  })
  if (!project) throw new ProjectCreationCommitStateError(draft.status)
  return {
    id: project.id,
    code: project.code,
    existing: true,
    status: 'PLANNING',
    baselineCommittedAt: null,
    counts: projectCreationCommitCounts(normalized),
    acknowledgedWarnings: projectCreationAcknowledgedWarningCount(normalized),
  }
}

/**
 * Re-authorizes, validates, claims, creates, rolls up, audits, and completes a
 * private creation draft in one database transaction. No notification or
 * external-publication function is called from this service.
 */
export async function commitProjectCreationDraft(
  input: CommitProjectCreationDraftInput,
  database: PrismaClient = prisma,
): Promise<CommitProjectCreationDraftResult> {
  return database.$transaction(async (tx) => {
    const current = await tx.projectCreationDraft.findUnique({ where: { id: input.draftId } })
    if (!current || current.ownerUserId !== input.actorUserId) {
      throw new ProjectCreationCommitNotFoundError()
    }
    const normalized = parseDraft(current)
    if (current.committedProjectId) return existingResult(tx, current, normalized)
    if (current.version !== input.expectedVersion) {
      throw new ProjectCreationCommitVersionError(input.expectedVersion, current.version)
    }
    if (!COMMITTABLE_STATUSES.includes(current.status as (typeof COMMITTABLE_STATUSES)[number])) {
      throw new ProjectCreationCommitStateError(current.status)
    }

    const project = normalized.project
    const authorization = await authorizeProjectCreationCommit({
      actorUserId: input.actorUserId,
      draftOwnerUserId: current.ownerUserId,
      departmentId: project.departmentId,
      projectManagerId: project.projectManagerId,
    }, tx)
    if (!authorization.allowed) {
      throw new ProjectCreationCommitAuthorizationError(authorization.code)
    }

    const assigneeIds = [...new Set(normalized.activities
      .map((activity) => activity.assigneeId)
      .filter((id): id is string => Boolean(id)))]
    const activeAssignees = assigneeIds.length === 0 ? [] : await tx.user.findMany({
      where: { id: { in: assigneeIds }, isActive: true },
      select: { id: true },
    })
    const duplicateCode = project.code
      ? await tx.project.findUnique({ where: { code: project.code }, select: { id: true } })
      : null
    const validation = validateProjectCreationCommitReadiness({
      projectJson: current.projectJson as never,
      scheduleJson: (current.scheduleJson ?? createEmptyProjectCreationScheduleJson()) as never,
      validationJson: (current.validationJson ?? createEmptyProjectCreationValidationJson()) as never,
      sourceMethod: current.sourceMethod as 'MANUAL' | 'FILE_IMPORT' | 'AI_GUIDED' | 'AI_TOR',
      authorized: true,
      activeAssigneeIds: new Set(activeAssignees.map((user) => user.id)),
      projectCodeIsDuplicate: Boolean(duplicateCode),
    })
    const userControlBlockers = projectCreationClientCommitBlockers(
      normalized,
      current.sourceMethod as 'MANUAL' | 'FILE_IMPORT' | 'AI_GUIDED' | 'AI_TOR',
    )
    if (hasBlockingProjectCreationIssues(validation) || userControlBlockers.length > 0) {
      const deterministic = validation.issues
        .filter((issue) => issue.severity === 'BLOCKING')
        .map((issue) => issue.message)
      throw new ProjectCreationCommitValidationError(
        validation,
        [...new Set([...deterministic, ...userControlBlockers])],
      )
    }

    const claimed = await tx.projectCreationDraft.updateMany({
      where: {
        id: current.id,
        ownerUserId: input.actorUserId,
        version: input.expectedVersion,
        status: current.status,
        committedProjectId: null,
      },
      data: { status: 'COMMITTING' },
    })
    if (claimed.count !== 1) {
      const latest = await tx.projectCreationDraft.findUnique({ where: { id: current.id } })
      if (!latest) throw new ProjectCreationCommitNotFoundError()
      if (latest.committedProjectId) return existingResult(tx, latest, parseDraft(latest))
      throw new ProjectCreationCommitVersionError(input.expectedVersion, latest.version)
    }

    const created = await createProjectWithTemplate(tx, {
      name: project.name!,
      code: project.code ?? undefined,
      clientName: project.clientName!,
      clientId: project.clientId,
      description: project.description,
      projectManagerId: authorization.projectManagerId,
      departmentId: project.departmentId,
      contractValue: project.contractValue,
      currency: project.currency,
      plannedStart: utcDate(project.plannedStart)!,
      plannedEnd: utcDate(project.plannedEnd)!,
      templateId: null,
      createdById: authorization.creator.id,
    }, { withinTransaction: true })

    const phaseIds = new Map<string, string>()
    for (const phase of [...normalized.phases].sort((a, b) => a.position - b.position)) {
      const row = await tx.phase.create({
        data: {
          projectId: created.id,
          name: phase.name,
          position: phase.position,
          weight: phase.weight,
          status: 'NOT_STARTED',
          plannedStart: utcDate(phase.plannedStart),
          plannedEnd: utcDate(phase.plannedEnd),
          currentStart: utcDate(phase.plannedStart),
          currentEnd: utcDate(phase.plannedEnd),
        },
        select: { id: true },
      })
      phaseIds.set(phase.id, row.id)
    }

    const deliverableByMilestone = new Map(normalized.deliverables.map((item) => [item.milestoneId, item]))
    const milestoneIds = new Map<string, string>()
    for (const milestone of [...normalized.milestones].sort((a, b) => a.position - b.position)) {
      const deliverable = deliverableByMilestone.get(milestone.id)
      const row = await tx.milestone.create({
        data: {
          phaseId: phaseIds.get(milestone.phaseId)!,
          name: deliverable?.name ?? milestone.name,
          position: milestone.position,
          weight: milestone.weight,
          status: 'NOT_STARTED',
          isKeyMilestone: milestone.isKeyMilestone || Boolean(deliverable),
          currentDate: utcDate(deliverable?.dueDate ?? milestone.dueDate),
        },
        select: { id: true },
      })
      milestoneIds.set(milestone.id, row.id)
    }

    const activityIds = new Map<string, string>()
    for (const activity of [...normalized.activities].sort((a, b) => a.position - b.position)) {
      const notes = [
        activity.description,
        activity.blockerDetails ? `Blocker: ${activity.blockerDetails}` : null,
      ].filter(Boolean).join('\n\n') || null
      const row = await tx.activity.create({
        data: {
          milestoneId: milestoneIds.get(activity.milestoneId)!,
          position: activity.position,
          title: activity.title,
          description: notes,
          assigneeId: activity.assigneeId,
          ownerParty: activity.ownerParty,
          currentStart: utcDate(activity.startDate),
          currentEnd: utcDate(activity.endDate),
          status: 'NOT_STARTED',
          percentComplete: 0,
          weight: activity.weight,
          estimatedHours: activity.estimatedHours,
          priority: activity.priority,
          risk: activity.risk,
          isBlocked: activity.isBlocked,
          blockedSince: activity.isBlocked ? (input.now ?? new Date()) : null,
          isMilestone: activity.isApproval,
        },
        select: { id: true },
      })
      activityIds.set(activity.id, row.id)
    }
    for (const activity of normalized.activities.filter((item) => item.parentActivityId)) {
      await tx.activity.update({
        where: { id: activityIds.get(activity.id)! },
        data: { parentActivityId: activityIds.get(activity.parentActivityId!)! },
      })
    }
    for (const dependency of normalized.dependencies) {
      await tx.activityDependency.create({
        data: {
          predecessorId: activityIds.get(dependency.predecessorActivityId)!,
          successorId: activityIds.get(dependency.successorActivityId)!,
          type: dependency.type,
          lagDays: dependency.lagDays,
        },
      })
    }

    await recalcProjectRollup(tx, created.id)
    const counts = projectCreationCommitCounts(normalized)
    const acknowledgedWarnings = projectCreationAcknowledgedWarningCount(normalized)
    const sourceMetadata = {
      sourceMethod: current.sourceMethod,
      sourceFileName: current.sourceFileName,
      sourceMimeType: current.sourceMimeType,
      sourceSize: current.sourceSize,
      sourceHash: current.sourceHash,
      aiProvider: current.aiProvider,
      aiModelId: current.aiModelId,
      schemaVersion: normalized.schemaVersion,
    }
    await recordActivity({
      entityType: 'PROJECT',
      projectId: created.id,
      action: 'CREATED',
      actorId: input.actorUserId,
      metadata: { code: created.code, name: project.name, clientName: project.clientName, ...counts, acknowledgedWarnings, ...sourceMetadata },
    }, { client: tx, required: true })
    await recordActivity({
      entityType: 'PROJECT_CREATION_DRAFT',
      projectId: created.id,
      action: 'DRAFT_COMMITTED',
      actorId: input.actorUserId,
      changes: { status: { from: current.status, to: 'COMMITTED' } },
      metadata: { draftId: current.id, committedProjectId: created.id, ...counts, acknowledgedWarnings, ...sourceMetadata },
    }, { client: tx, required: true })

    const completed = await tx.projectCreationDraft.updateMany({
      where: { id: current.id, ownerUserId: input.actorUserId, status: 'COMMITTING', committedProjectId: null },
      data: {
        status: 'COMMITTED',
        committedProjectId: created.id,
        committedAt: input.now ?? new Date(),
        version: { increment: 1 },
      },
    })
    if (completed.count !== 1) throw new ProjectCreationCommitStateError('COMMITTING')

    return {
      id: created.id,
      code: created.code,
      existing: false,
      status: 'PLANNING',
      baselineCommittedAt: null,
      counts,
      acknowledgedWarnings,
    }
  })
}
