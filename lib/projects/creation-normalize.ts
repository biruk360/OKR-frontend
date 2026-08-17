import { z } from 'zod'
import {
  CURRENCIES,
  DEPENDENCY_TYPES,
  OWNER_PARTIES,
  PRIORITIES,
  RISK_LEVELS,
} from '@/features/projects/types'

/**
 * The one provider-neutral project-creation draft contract.
 *
 * Parsers and AI providers produce `NormalizedProjectCreationDraft`. Persistence
 * splits it across ProjectCreationDraft.projectJson/scheduleJson/validationJson;
 * `combineNormalizedProjectCreationDraft` restores the canonical shape.
 */
export const PROJECT_CREATION_SCHEMA_VERSION = 1 as const

const idSchema = z.string().trim().min(1).max(100)
const nullableIdSchema = idSchema.nullable()
const textSchema = (max: number) => z.string().trim().min(1).max(max)
const nullableTextSchema = (max: number) => textSchema(max).nullable()

function isRealIsoDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const projectCreationIsoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .refine(isRealIsoDate, 'Date must be a real calendar date')

export type ProjectCreationJsonValue =
  | string
  | number
  | boolean
  | null
  | ProjectCreationJsonValue[]
  | { [key: string]: ProjectCreationJsonValue }

export const projectCreationJsonValueSchema: z.ZodType<ProjectCreationJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(projectCreationJsonValueSchema),
    z.record(z.string(), projectCreationJsonValueSchema),
  ]),
)

export const projectCreationWorkingCalendarSchema = z.object({
  mode: z.enum(['ORGANIZATION', 'WEEKDAYS', 'CUSTOM']),
  timezone: nullableTextSchema(100),
  workingDays: z.array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, 'Working days must be unique'),
  nonWorkingDates: z.array(projectCreationIsoDateSchema).max(366),
  allowNonWorkingDates: z.boolean(),
}).strict()

export const normalizedProjectSchema = z.object({
  name: z.string().trim().min(3).max(200).nullable(),
  code: nullableTextSchema(50),
  clientName: nullableTextSchema(200),
  clientId: nullableIdSchema,
  description: nullableTextSchema(2_000),
  projectManagerId: nullableIdSchema,
  departmentId: nullableIdSchema,
  contractValue: z.number().finite().nonnegative().nullable(),
  currency: z.enum(CURRENCIES),
  plannedStart: projectCreationIsoDateSchema.nullable(),
  plannedEnd: projectCreationIsoDateSchema.nullable(),
  projectType: nullableTextSchema(100),
  projectTypeOther: nullableTextSchema(200),
  objective: nullableTextSchema(1_000),
  businessOutcome: nullableTextSchema(1_000),
  scopeIncluded: z.array(textSchema(1_000)).max(100),
  scopeExcluded: z.array(textSchema(1_000)).max(100),
  workingCalendar: projectCreationWorkingCalendarSchema,
}).strict()

const positionedWeightedSchema = {
  id: idSchema,
  name: textSchema(300),
  position: z.number().int().nonnegative().max(1_000_000),
  weight: z.number().finite().min(0).max(100),
}

export const normalizedPhaseSchema = z.object({
  ...positionedWeightedSchema,
  plannedStart: projectCreationIsoDateSchema.nullable(),
  plannedEnd: projectCreationIsoDateSchema.nullable(),
}).strict()

export const normalizedMilestoneSchema = z.object({
  ...positionedWeightedSchema,
  phaseId: idSchema,
  isKeyMilestone: z.boolean(),
  dueDate: projectCreationIsoDateSchema.nullable(),
}).strict()

export const normalizedActivitySchema = z.object({
  id: idSchema,
  sourceRowId: nullableTextSchema(100),
  milestoneId: idSchema,
  parentActivityId: nullableIdSchema,
  position: z.number().int().nonnegative().max(1_000_000),
  title: textSchema(300),
  description: nullableTextSchema(2_000),
  ownerParty: z.enum(OWNER_PARTIES),
  assigneeId: nullableIdSchema,
  assigneeEmail: z.string().trim().email().max(320).nullable(),
  suggestedRole: nullableTextSchema(100),
  startDate: projectCreationIsoDateSchema.nullable(),
  endDate: projectCreationIsoDateSchema.nullable(),
  weight: z.number().finite().min(0).max(100),
  estimatedHours: z.number().finite().nonnegative().nullable(),
  priority: z.enum(PRIORITIES).nullable(),
  risk: z.enum(RISK_LEVELS).nullable(),
  isBlocked: z.boolean(),
  blockerDetails: nullableTextSchema(1_000),
  isApproval: z.boolean(),
}).strict()

export const normalizedDependencySchema = z.object({
  id: idSchema,
  predecessorActivityId: idSchema,
  successorActivityId: idSchema,
  type: z.enum(DEPENDENCY_TYPES),
  lagDays: z.number().int().min(-365).max(365),
}).strict()

export const normalizedDeliverableSchema = z.object({
  id: idSchema,
  milestoneId: idSchema,
  name: textSchema(300),
  producingActivityIds: z.array(idSchema).max(2_000),
  dueDate: projectCreationIsoDateSchema.nullable(),
  ownerParty: z.enum(OWNER_PARTIES),
  approvalActivityId: nullableIdSchema,
  approvalCriteria: nullableTextSchema(1_000),
}).strict()

export const normalizedAssumptionSchema = z.object({
  id: idSchema,
  text: textSchema(2_000),
  category: z.enum(['SCOPE', 'DATE', 'DELIVERABLE', 'OWNERSHIP', 'DEPENDENCY', 'EFFORT', 'OTHER']),
  affectedPaths: z.array(textSchema(500)).max(100),
  sourceIds: z.array(idSchema).max(100),
  status: z.enum(['PROPOSED', 'ACCEPTED', 'REJECTED']),
}).strict()

export const normalizedQuestionSchema = z.object({
  id: idSchema,
  round: z.number().int().min(1).max(100),
  text: textSchema(1_000),
  impact: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  affectedPaths: z.array(textSchema(500)).max(100),
  status: z.enum(['OPEN', 'ANSWERED', 'CONTINUED_WITH_ASSUMPTION']),
  answer: nullableTextSchema(2_000),
}).strict()

export const normalizedWarningSchema = z.object({
  id: idSchema,
  code: textSchema(100),
  message: textSchema(2_000),
  severity: z.enum(['WARNING', 'INFO']),
  affectedPaths: z.array(textSchema(500)).max(100),
  sourceIds: z.array(idSchema).max(100),
  acknowledged: z.boolean(),
}).strict()

export const normalizedSourceSchema = z.object({
  id: idSchema,
  type: z.enum([
    'USER_INPUT',
    'SPREADSHEET_CELL',
    'SPREADSHEET_ROW',
    'DOCX_HEADING',
    'DOCX_PARAGRAPH',
    'DOCX_TABLE',
    'TEMPLATE',
    'AI_ASSUMPTION',
  ]),
  reference: textSchema(500),
  excerpt: nullableTextSchema(1_000),
  targetPaths: z.array(textSchema(500)).min(1).max(100),
  basis: z.enum(['SOURCE_FACT', 'INFERRED_RECOMMENDATION', 'USER_DECISION', 'TEMPLATE_DEFAULT']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  lastEditor: z.enum(['USER', 'AI']),
}).strict()

export const normalizedChangeSchema = z.object({
  id: idSchema,
  path: textSchema(500),
  kind: z.enum([
    'CAPITALIZATION',
    'WHITESPACE',
    'DATE_NORMALIZATION',
    'DUPLICATE_ROW',
    'CLASSIFICATION',
    'FILL_REPEATED_VALUE',
    'DEPENDENCY_SUGGESTION',
    'MISSING_DATE',
    'SPLIT_ACTIVITY',
    'OTHER',
  ]).optional(),
  operation: z.enum(['REPLACE', 'DELETE']).optional(),
  originalValue: projectCreationJsonValueSchema,
  proposedValue: projectCreationJsonValueSchema,
  reason: textSchema(1_000),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  sourceIds: z.array(idSchema).max(100),
  status: z.enum(['PROPOSED', 'ACCEPTED', 'REJECTED']),
}).strict()

export const normalizedValidationIssueSchema = z.object({
  id: idSchema,
  severity: z.enum(['BLOCKING', 'WARNING', 'INFO']),
  code: textSchema(100),
  message: textSchema(2_000),
  sourceRow: z.number().int().min(1).max(1_000_000).nullable(),
  field: nullableTextSchema(500),
  originalValue: projectCreationJsonValueSchema.optional(),
  suggestedCorrection: nullableTextSchema(2_000),
  affectedPaths: z.array(textSchema(500)).max(100),
}).strict()

const scheduleFields = {
  phases: z.array(normalizedPhaseSchema).max(200),
  milestones: z.array(normalizedMilestoneSchema).max(1_000),
  activities: z.array(normalizedActivitySchema).max(2_000),
  dependencies: z.array(normalizedDependencySchema).max(10_000),
  deliverables: z.array(normalizedDeliverableSchema).max(2_000),
  sources: z.array(normalizedSourceSchema).max(10_000),
  changes: z.array(normalizedChangeSchema).max(10_000),
}

const validationFields = {
  assumptions: z.array(normalizedAssumptionSchema).max(2_000),
  questions: z.array(normalizedQuestionSchema).max(500),
  warnings: z.array(normalizedWarningSchema).max(2_000),
  issues: z.array(normalizedValidationIssueSchema).max(10_000),
}

function enforceQuestionRoundLimit(
  value: { questions: Array<{ round: number }> },
  context: z.RefinementCtx,
) {
  const perRound = new Map<number, number>()
  value.questions.forEach((question, index) => {
    const count = (perRound.get(question.round) ?? 0) + 1
    perRound.set(question.round, count)
    if (count > 5) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A clarification round may contain at most five questions',
        path: ['questions', index, 'round'],
      })
    }
  })
}

export const projectCreationProjectJsonSchema = z.object({
  schemaVersion: z.literal(PROJECT_CREATION_SCHEMA_VERSION),
  project: normalizedProjectSchema,
}).strict()

export const projectCreationScheduleJsonSchema = z.object({
  schemaVersion: z.literal(PROJECT_CREATION_SCHEMA_VERSION),
  ...scheduleFields,
}).strict()

export const projectCreationValidationJsonSchema = z.object({
  schemaVersion: z.literal(PROJECT_CREATION_SCHEMA_VERSION),
  ...validationFields,
}).strict().superRefine(enforceQuestionRoundLimit)

export const normalizedProjectCreationDraftSchema = z.object({
  schemaVersion: z.literal(PROJECT_CREATION_SCHEMA_VERSION),
  project: normalizedProjectSchema,
  ...scheduleFields,
  ...validationFields,
}).strict().superRefine(enforceQuestionRoundLimit)

export type ProjectCreationProjectJson = z.infer<typeof projectCreationProjectJsonSchema>
export type ProjectCreationScheduleJson = z.infer<typeof projectCreationScheduleJsonSchema>
export type ProjectCreationValidationJson = z.infer<typeof projectCreationValidationJsonSchema>
export type NormalizedProjectCreationDraft = z.infer<typeof normalizedProjectCreationDraftSchema>

export function createEmptyProjectCreationProjectJson(
  projectManagerId: string | null = null,
): ProjectCreationProjectJson {
  return {
    schemaVersion: PROJECT_CREATION_SCHEMA_VERSION,
    project: {
      name: null,
      code: null,
      clientName: null,
      clientId: null,
      description: null,
      projectManagerId,
      departmentId: null,
      contractValue: null,
      currency: 'ETB',
      plannedStart: null,
      plannedEnd: null,
      projectType: null,
      projectTypeOther: null,
      objective: null,
      businessOutcome: null,
      scopeIncluded: [],
      scopeExcluded: [],
      workingCalendar: {
        mode: 'ORGANIZATION',
        timezone: null,
        workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        nonWorkingDates: [],
        allowNonWorkingDates: false,
      },
    },
  }
}

export function createEmptyProjectCreationScheduleJson(): ProjectCreationScheduleJson {
  return {
    schemaVersion: PROJECT_CREATION_SCHEMA_VERSION,
    phases: [],
    milestones: [],
    activities: [],
    dependencies: [],
    deliverables: [],
    sources: [],
    changes: [],
  }
}

export function createEmptyProjectCreationValidationJson(): ProjectCreationValidationJson {
  return {
    schemaVersion: PROJECT_CREATION_SCHEMA_VERSION,
    assumptions: [],
    questions: [],
    warnings: [],
    issues: [],
  }
}

export function parseNormalizedProjectCreationDraft(
  value: unknown,
): NormalizedProjectCreationDraft {
  return normalizedProjectCreationDraftSchema.parse(value)
}

export function splitNormalizedProjectCreationDraft(
  value: unknown,
): {
  projectJson: ProjectCreationProjectJson
  scheduleJson: ProjectCreationScheduleJson
  validationJson: ProjectCreationValidationJson
} {
  const normalized = parseNormalizedProjectCreationDraft(value)
  const {
    schemaVersion,
    project,
    phases,
    milestones,
    activities,
    dependencies,
    deliverables,
    sources,
    changes,
    assumptions,
    questions,
    warnings,
    issues,
  } = normalized
  return {
    projectJson: { schemaVersion, project },
    scheduleJson: {
      schemaVersion,
      phases,
      milestones,
      activities,
      dependencies,
      deliverables,
      sources,
      changes,
    },
    validationJson: { schemaVersion, assumptions, questions, warnings, issues },
  }
}

export function combineNormalizedProjectCreationDraft(
  projectJson: unknown,
  scheduleJson: unknown,
  validationJson: unknown,
): NormalizedProjectCreationDraft {
  const project = projectCreationProjectJsonSchema.parse(projectJson)
  const schedule = projectCreationScheduleJsonSchema.parse(scheduleJson)
  const validation = projectCreationValidationJsonSchema.parse(validationJson)
  if (project.schemaVersion !== schedule.schemaVersion
    || project.schemaVersion !== validation.schemaVersion) {
    throw new Error('Project creation draft schema versions do not match')
  }
  return normalizedProjectCreationDraftSchema.parse({
    schemaVersion: project.schemaVersion,
    project: project.project,
    phases: schedule.phases,
    milestones: schedule.milestones,
    activities: schedule.activities,
    dependencies: schedule.dependencies,
    deliverables: schedule.deliverables,
    sources: schedule.sources,
    changes: schedule.changes,
    assumptions: validation.assumptions,
    questions: validation.questions,
    warnings: validation.warnings,
    issues: validation.issues,
  })
}
