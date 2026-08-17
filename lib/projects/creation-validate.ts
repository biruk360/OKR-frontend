import { prisma } from '@/lib/prisma'
import type {
  ProjectCreationProjectJson,
  ProjectCreationScheduleJson,
  ProjectCreationValidationJson,
} from '@/lib/projects/creation-normalize'
import { createEmptyProjectCreationValidationJson } from '@/lib/projects/creation-normalize'
import type {
  ParsedScheduleRow,
  ScheduleImportParseIssue,
  ScheduleImportRecord,
} from '@/lib/projects/schedule-import'
import { wouldCreateDependencyCycle } from '@/lib/projects/scheduling'

type ValidationIssue = ProjectCreationValidationJson['issues'][number]

interface AssigneeLookupDatabase {
  user: {
    findMany(args: {
      where: { isActive: true; email: { in: string[]; mode: 'insensitive' } }
      select: { email: true }
    }): Promise<Array<{ email: string }>>
  }
}

export interface ProjectCreationImportValidationInput {
  rows: ParsedScheduleRow[]
  records: ScheduleImportRecord[]
  parseIssues: ScheduleImportParseIssue[]
  sourceRowOffset: number
  activeAssigneeEmails?: ReadonlySet<string>
}

export interface ProjectCreationCommitReadinessInput {
  projectJson: ProjectCreationProjectJson
  scheduleJson: ProjectCreationScheduleJson
  validationJson?: ProjectCreationValidationJson
  sourceMethod: 'MANUAL' | 'FILE_IMPORT' | 'AI_GUIDED' | 'AI_TOR'
  authorized: boolean
  activeAssigneeIds?: ReadonlySet<string>
  projectCodeIsDuplicate?: boolean
}

export async function resolveActiveProjectCreationAssigneeEmails(
  emails: readonly string[],
  database: AssigneeLookupDatabase = prisma as unknown as AssigneeLookupDatabase,
): Promise<ReadonlySet<string>> {
  const unique = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))]
  if (unique.length === 0) return new Set()
  const users = await database.user.findMany({
    where: { isActive: true, email: { in: unique, mode: 'insensitive' } },
    select: { email: true },
  })
  return new Set(users.map((user) => user.email.toLowerCase()))
}

function sourceValue(
  records: ScheduleImportRecord[],
  sourceRow: number,
  sourceRowOffset: number,
  field: string,
): string | number | boolean | null {
  const value = records[sourceRow - sourceRowOffset]?.[field]
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

function issue(
  id: string,
  input: Omit<ValidationIssue, 'id'>,
): ValidationIssue {
  return { id, ...input }
}

function warningEntries(issues: ValidationIssue[]): ProjectCreationValidationJson['warnings'] {
  return issues.flatMap((item) => item.severity === 'BLOCKING' ? [] : [{
      id: `notice-${item.id}`,
      code: item.code,
      message: item.message,
      severity: item.severity,
      affectedPaths: item.affectedPaths,
      sourceIds: [],
      acknowledged: false,
    }])
}

export function validateProjectCreationImport(
  input: ProjectCreationImportValidationInput,
): ProjectCreationValidationJson {
  let sequence = 0
  const nextId = () => `validation-${++sequence}`
  const issues: ValidationIssue[] = input.parseIssues.map((item) => issue(nextId(), {
    severity: 'BLOCKING',
    code: item.code,
    message: item.message,
    sourceRow: item.sourceRow,
    field: item.field,
    ...(item.originalValue !== undefined ? { originalValue: item.originalValue } : {}),
    suggestedCorrection: item.suggestedCorrection,
    affectedPaths: item.sourceRow === null ? [] : [`sourceRows.${item.sourceRow}`],
  }))

  const parseIssueKeys = new Set(input.parseIssues.map((item) => `${item.sourceRow}:${item.field}`))
  const weightFields = ['Phase Weight', 'Milestone Weight', 'Activity Weight'] as const
  input.rows.forEach((row, index) => {
    const affectedPaths = [`activities.${index}`]
    for (const field of weightFields) {
      const raw = sourceValue(input.records, row.sourceRow, input.sourceRowOffset, field)
      const value = typeof raw === 'number' ? raw : Number(raw)
      if (raw !== null && raw !== '' && Number.isFinite(value) && value > 100
        && !parseIssueKeys.has(`${row.sourceRow}:${field}`)) {
        issues.push(issue(nextId(), {
          severity: 'BLOCKING',
          code: 'INVALID_WEIGHT',
          message: `${field} must be between 0 and 100.`,
          sourceRow: row.sourceRow,
          field,
          originalValue: raw,
          suggestedCorrection: `Enter ${field} as a number from 0 to 100.`,
          affectedPaths,
        }))
      }
    }

    if (row.assigneeEmail) {
      const original = sourceValue(input.records, row.sourceRow, input.sourceRowOffset, 'Assignee Email')
      if (!/^\S+@\S+\.\S+$/.test(row.assigneeEmail)) {
        issues.push(issue(nextId(), {
          severity: 'BLOCKING',
          code: 'INVALID_ASSIGNEE_EMAIL',
          message: 'Assignee Email must be a valid email address.',
          sourceRow: row.sourceRow,
          field: 'Assignee Email',
          originalValue: original,
          suggestedCorrection: 'Enter a valid active-user email address or leave the field blank.',
          affectedPaths,
        }))
      } else if (input.activeAssigneeEmails && !input.activeAssigneeEmails.has(row.assigneeEmail.toLowerCase())) {
        issues.push(issue(nextId(), {
          severity: 'BLOCKING',
          code: 'UNKNOWN_ASSIGNEE',
          message: 'Assignee Email does not match an active internal user.',
          sourceRow: row.sourceRow,
          field: 'Assignee Email',
          originalValue: original,
          suggestedCorrection: 'Use the exact email of an active internal user or leave the field blank.',
          affectedPaths,
        }))
      }
    }

    if ((row.startDate && !row.endDate) || (!row.startDate && row.endDate)) {
      const field = row.startDate ? 'End Date' : 'Start Date'
      issues.push(issue(nextId(), {
        severity: 'WARNING',
        code: 'INCOMPLETE_DATE_RANGE',
        message: `${field} is blank while the other activity date is present.`,
        sourceRow: row.sourceRow,
        field,
        originalValue: sourceValue(input.records, row.sourceRow, input.sourceRowOffset, field),
        suggestedCorrection: `Enter ${field} or acknowledge that this activity has an incomplete date range.`,
        affectedPaths,
      }))
    }
    if (row.isBlocked && !row.blockerDetails) {
      issues.push(issue(nextId(), {
        severity: 'WARNING',
        code: 'BLOCKER_DETAILS_MISSING',
        message: 'The activity is blocked but Blocker Details are blank.',
        sourceRow: row.sourceRow,
        field: 'Blocker Details',
        originalValue: sourceValue(input.records, row.sourceRow, input.sourceRowOffset, 'Blocker Details'),
        suggestedCorrection: 'Describe the blocker or clear the blocked flag.',
        affectedPaths,
      }))
    }
  })

  const knownRowIds = new Set(input.rows.map((row) => row.rowId))
  const acceptedDependencies: Array<{ predecessorId: string; successorId: string }> = []
  for (const [rowIndex, row] of input.rows.entries()) {
    for (const dependency of row.dependencies) {
      if (!knownRowIds.has(dependency.predecessorRowId) || dependency.predecessorRowId === row.rowId) continue
      const candidate = { predecessorId: dependency.predecessorRowId, successorId: row.rowId }
      if (wouldCreateDependencyCycle(acceptedDependencies, candidate)) {
        issues.push(issue(nextId(), {
          severity: 'BLOCKING',
          code: 'DEPENDENCY_CYCLE',
          message: `Dependency ${dependency.predecessorRowId} → ${row.rowId} creates a circular dependency.`,
          sourceRow: row.sourceRow,
          field: 'Predecessor Row IDs',
          originalValue: sourceValue(
            input.records,
            row.sourceRow,
            input.sourceRowOffset,
            'Predecessor Row IDs',
          ),
          suggestedCorrection: `Remove ${dependency.predecessorRowId} from this row's predecessors or break another link in the cycle.`,
          affectedPaths: [`activities.${rowIndex}.dependencies`],
        }))
        continue
      }
      acceptedDependencies.push(candidate)
    }
  }

  const validation = createEmptyProjectCreationValidationJson()
  validation.issues = issues
  validation.warnings = warningEntries(issues)
  return validation
}

export function hasBlockingProjectCreationIssues(
  validation: ProjectCreationValidationJson | null | undefined,
): boolean {
  return Boolean(validation?.issues.some((item) => item.severity === 'BLOCKING'))
}

export function validateProjectCreationCommitReadiness(
  input: ProjectCreationCommitReadinessInput,
): ProjectCreationValidationJson {
  const validation: ProjectCreationValidationJson = {
    ...(input.validationJson ?? createEmptyProjectCreationValidationJson()),
    issues: [...(input.validationJson?.issues ?? [])],
    warnings: [...(input.validationJson?.warnings ?? [])],
  }
  let sequence = validation.issues.length
  const add = (item: Omit<ValidationIssue, 'id' | 'sourceRow'> & { sourceRow?: number | null }) => {
    validation.issues.push(issue(`readiness-${++sequence}`, { sourceRow: item.sourceRow ?? null, ...item }))
  }
  const project = input.projectJson.project
  if (!project.name) add({ severity: 'BLOCKING', code: 'PROJECT_NAME_MISSING', message: 'Project name is required.', field: 'Project name', suggestedCorrection: 'Enter a project name from 3 to 200 characters.', affectedPaths: ['project.name'] })
  if (!project.clientName) add({ severity: 'BLOCKING', code: 'CLIENT_NAME_MISSING', message: 'Client name is required.', field: 'Client name', suggestedCorrection: 'Select or enter the client name.', affectedPaths: ['project.clientName'] })
  if (!project.projectManagerId) add({ severity: 'BLOCKING', code: 'PROJECT_MANAGER_MISSING', message: 'Project manager is required.', field: 'Project manager', suggestedCorrection: 'Select an active internal project manager.', affectedPaths: ['project.projectManagerId'] })
  if (!project.plannedStart) add({ severity: 'BLOCKING', code: 'PROJECT_START_MISSING', message: 'Planned start is required.', field: 'Planned start', suggestedCorrection: 'Enter a valid planned start date.', affectedPaths: ['project.plannedStart'] })
  if (!project.plannedEnd) add({ severity: 'BLOCKING', code: 'PROJECT_END_MISSING', message: 'Planned end is required.', field: 'Planned end', suggestedCorrection: 'Enter a planned end date after the start date.', affectedPaths: ['project.plannedEnd'] })
  if (project.plannedStart && project.plannedEnd && project.plannedEnd <= project.plannedStart) add({ severity: 'BLOCKING', code: 'INVALID_PROJECT_DATE_RANGE', message: 'Planned end must be after planned start.', field: 'Planned end', originalValue: project.plannedEnd, suggestedCorrection: 'Choose a planned end date after the planned start date.', affectedPaths: ['project.plannedStart', 'project.plannedEnd'] })
  if (input.projectCodeIsDuplicate) add({ severity: 'BLOCKING', code: 'DUPLICATE_PROJECT_CODE', message: 'Project code is already in use.', field: 'Project code', originalValue: project.code, suggestedCorrection: 'Choose a unique project code or leave it blank for automatic generation.', affectedPaths: ['project.code'] })
  if (!input.authorized) add({ severity: 'BLOCKING', code: 'CREATION_AUTHORIZATION_LOST', message: 'Project-creation authorization is no longer available.', field: null, suggestedCorrection: 'Ask an Administrator to restore access or discard the draft.', affectedPaths: [] })
  if (input.sourceMethod !== 'MANUAL' && input.scheduleJson.activities.length === 0) add({ severity: 'BLOCKING', code: 'NO_ACTIVITY_ROWS', message: 'An imported or generated schedule must contain at least one activity.', field: 'Activity', suggestedCorrection: 'Add or import at least one activity row.', affectedPaths: ['activities'] })

  const phaseIds = new Set<string>()
  input.scheduleJson.phases.forEach((phase, index) => {
    if (phaseIds.has(phase.id)) add({ severity: 'BLOCKING', code: 'DUPLICATE_PHASE_ID', message: 'Each phase must have a unique identifier.', field: 'Phase', originalValue: phase.id, suggestedCorrection: 'Duplicate the phase again or assign a unique identifier.', affectedPaths: [`phases.${index}`] })
    phaseIds.add(phase.id)
    if (phase.plannedStart && phase.plannedEnd && phase.plannedEnd < phase.plannedStart) add({ severity: 'BLOCKING', code: 'INVALID_PHASE_DATE_RANGE', message: 'Phase end cannot be before its start.', field: 'Phase end', originalValue: phase.plannedEnd, suggestedCorrection: 'Set the phase end on or after its start.', affectedPaths: [`phases.${index}.plannedStart`, `phases.${index}.plannedEnd`] })
  })
  const milestoneIds = new Set<string>()
  input.scheduleJson.milestones.forEach((milestone, index) => {
    if (milestoneIds.has(milestone.id)) add({ severity: 'BLOCKING', code: 'DUPLICATE_MILESTONE_ID', message: 'Each milestone must have a unique identifier.', field: 'Milestone', originalValue: milestone.id, suggestedCorrection: 'Duplicate the milestone again or assign a unique identifier.', affectedPaths: [`milestones.${index}`] })
    milestoneIds.add(milestone.id)
    if (!phaseIds.has(milestone.phaseId)) add({ severity: 'BLOCKING', code: 'INVALID_MILESTONE_PHASE', message: 'Milestone references a phase that does not exist.', field: 'Phase', originalValue: milestone.phaseId, suggestedCorrection: 'Select an existing phase.', affectedPaths: [`milestones.${index}.phaseId`] })
  })
  const activityIds = new Set(input.scheduleJson.activities.map((activity) => activity.id))
  const dependencies: Array<{ predecessorId: string; successorId: string }> = []
  const seenActivityIds = new Set<string>()
  input.scheduleJson.activities.forEach((activity, index) => {
    if (seenActivityIds.has(activity.id)) add({ severity: 'BLOCKING', code: 'DUPLICATE_ACTIVITY_ID', message: 'Each activity must have a unique identifier.', field: 'Activity', originalValue: activity.id, suggestedCorrection: 'Duplicate the activity again or assign a unique identifier.', affectedPaths: [`activities.${index}`] })
    seenActivityIds.add(activity.id)
    if (!milestoneIds.has(activity.milestoneId)) add({ severity: 'BLOCKING', code: 'INVALID_ACTIVITY_MILESTONE', message: 'Activity references a milestone that does not exist.', field: 'Milestone', originalValue: activity.milestoneId, suggestedCorrection: 'Select an existing milestone.', affectedPaths: [`activities.${index}.milestoneId`] })
    if (activity.parentActivityId && !activityIds.has(activity.parentActivityId)) add({ severity: 'BLOCKING', code: 'INVALID_PARENT', message: 'Parent activity does not exist in this draft.', field: 'Parent activity', originalValue: activity.parentActivityId, suggestedCorrection: 'Select an activity in this draft or clear the parent.', affectedPaths: [`activities.${index}.parentActivityId`] })
    if (activity.parentActivityId === activity.id) add({ severity: 'BLOCKING', code: 'INVALID_PARENT', message: 'An activity cannot be its own parent.', field: 'Parent activity', originalValue: activity.parentActivityId, suggestedCorrection: 'Select another activity or clear the parent.', affectedPaths: [`activities.${index}.parentActivityId`] })
    if (activity.startDate && activity.endDate && activity.endDate < activity.startDate) add({ severity: 'BLOCKING', code: 'INVALID_ACTIVITY_DATE_RANGE', message: 'Activity end cannot be before its start.', field: 'End Date', originalValue: activity.endDate, suggestedCorrection: 'Set the activity end on or after its start.', affectedPaths: [`activities.${index}.startDate`, `activities.${index}.endDate`] })
    if (project.plannedStart && activity.startDate && activity.startDate < project.plannedStart) add({ severity: 'BLOCKING', code: 'ACTIVITY_OUTSIDE_PROJECT', message: 'Activity starts before the project boundary.', field: 'Start Date', originalValue: activity.startDate, suggestedCorrection: 'Move the activity inside the project dates or explicitly approve the exception.', affectedPaths: [`activities.${index}.startDate`] })
    if (project.plannedEnd && activity.endDate && activity.endDate > project.plannedEnd) add({ severity: 'BLOCKING', code: 'ACTIVITY_OUTSIDE_PROJECT', message: 'Activity ends after the project boundary.', field: 'End Date', originalValue: activity.endDate, suggestedCorrection: 'Move the activity inside the project dates or explicitly approve the exception.', affectedPaths: [`activities.${index}.endDate`] })
    if (activity.assigneeId && input.activeAssigneeIds && !input.activeAssigneeIds.has(activity.assigneeId)) add({ severity: 'BLOCKING', code: 'UNKNOWN_ASSIGNEE', message: 'Selected assignee is not an active internal user.', field: 'Assignee', originalValue: activity.assigneeId, suggestedCorrection: 'Select an active internal user or clear the assignment.', affectedPaths: [`activities.${index}.assigneeId`] })
  })
  const deliverableMilestones = new Set<string>()
  input.scheduleJson.deliverables.forEach((deliverable, index) => {
    if (!milestoneIds.has(deliverable.milestoneId)) add({ severity: 'BLOCKING', code: 'INVALID_DELIVERABLE_MILESTONE', message: 'Deliverable references a milestone that does not exist.', field: 'Milestone', originalValue: deliverable.milestoneId, suggestedCorrection: 'Select an existing milestone.', affectedPaths: [`deliverables.${index}.milestoneId`] })
    if (deliverableMilestones.has(deliverable.milestoneId)) add({ severity: 'BLOCKING', code: 'DUPLICATE_DELIVERABLE_MILESTONE', message: 'A key milestone can represent only one deliverable.', field: 'Milestone', originalValue: deliverable.milestoneId, suggestedCorrection: 'Select a different milestone or merge the deliverable details.', affectedPaths: [`deliverables.${index}.milestoneId`] })
    deliverableMilestones.add(deliverable.milestoneId)
    for (const activityId of deliverable.producingActivityIds) {
      if (!activityIds.has(activityId)) add({ severity: 'BLOCKING', code: 'INVALID_DELIVERABLE_ACTIVITY', message: 'Deliverable references a producing activity that does not exist.', field: 'Producing activities', originalValue: activityId, suggestedCorrection: 'Select an existing activity.', affectedPaths: [`deliverables.${index}.producingActivityIds`] })
    }
    if (deliverable.approvalActivityId && !activityIds.has(deliverable.approvalActivityId)) add({ severity: 'BLOCKING', code: 'INVALID_DELIVERABLE_APPROVAL', message: 'Deliverable approval step references an activity that does not exist.', field: 'Approval activity', originalValue: deliverable.approvalActivityId, suggestedCorrection: 'Select an existing approval activity or clear the field.', affectedPaths: [`deliverables.${index}.approvalActivityId`] })
  })
  const dependencyKeys = new Set<string>()
  for (const [index, dependency] of input.scheduleJson.dependencies.entries()) {
    if (!activityIds.has(dependency.predecessorActivityId) || !activityIds.has(dependency.successorActivityId)) {
      add({ severity: 'BLOCKING', code: 'MISSING_DEPENDENCY_ACTIVITY', message: 'Dependency references an activity that does not exist.', field: 'Dependency', suggestedCorrection: 'Select existing predecessor and successor activities.', affectedPaths: [`dependencies.${index}`] })
      continue
    }
    const dependencyKey = `${dependency.predecessorActivityId}\u0000${dependency.successorActivityId}`
    if (dependencyKeys.has(dependencyKey)) {
      add({ severity: 'BLOCKING', code: 'DUPLICATE_DEPENDENCY', message: 'The same predecessor and successor are linked more than once.', field: 'Dependency', suggestedCorrection: 'Keep only one link for this activity pair.', affectedPaths: [`dependencies.${index}`] })
      continue
    }
    dependencyKeys.add(dependencyKey)
    const candidate = { predecessorId: dependency.predecessorActivityId, successorId: dependency.successorActivityId }
    if (wouldCreateDependencyCycle(dependencies, candidate)) add({ severity: 'BLOCKING', code: 'DEPENDENCY_CYCLE', message: 'Dependency creates a circular dependency.', field: 'Dependency', suggestedCorrection: 'Remove this link or break another link in the cycle.', affectedPaths: [`dependencies.${index}`] })
    else dependencies.push(candidate)
  }
  return validation
}
