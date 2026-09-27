import { z } from 'zod'
import {
  DEPENDENCY_TYPES,
  OWNER_PARTIES,
  PRIORITIES,
  RISK_LEVELS,
} from '@/features/projects/types'
import { AI_GUIDED_WEEKDAYS, type AiGuidedDetailLevel } from './ai-guided-brief'

/**
 * Story 3.3 / 3.4 / 3.7 — provider output contracts.
 *
 * Every OpenAI response is forced into one of these strict JSON schemas and then
 * re-validated with the matching Zod schema on the server. Nothing the model
 * returns reaches the draft without passing both, plus the deterministic rules in
 * `ai-guided-schedule.ts`. Caps below are the output-size guard (§12.12, §16).
 */

export const AI_GUIDED_PROMPT_VERSIONS = {
  CLARIFY: 'project-ai-guided-clarify-v1',
  GENERATE: 'project-ai-guided-generate-v1',
  REVISE: 'project-ai-guided-revise-v1',
} as const

export const AI_GUIDED_MAX_OUTPUT_TOKENS = {
  CLARIFY: 1_500,
  GENERATE: 16_000,
  REVISE: 6_000,
} as const

export const AI_GUIDED_CAPS = {
  questionsPerRound: 5,
  phases: 8,
  milestones: 30,
  activities: 120,
  dependencies: 150,
  assumptions: 10,
  exclusions: 10,
  openQuestions: 5,
  scheduleRisks: 5,
  descriptionChars: 800,
  narrativeChars: 300,
  revisionOperations: 60,
  instructionChars: 500,
} as const

/** Activity caps by requested schedule detail (§9.1 "desired schedule detail"). */
export const AI_GUIDED_DETAIL_ACTIVITY_CAP: Record<AiGuidedDetailLevel, number> = {
  SUMMARY: 25,
  STANDARD: 60,
  DETAILED: 120,
}

const ISO_DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$'
const refSchema = z.string().trim().min(1).max(20)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const shortText = (max: number) => z.string().trim().min(1).max(max)

// ---------------------------------------------------------------------------
// Clarification (Story 3.3)
// ---------------------------------------------------------------------------

export const AI_GUIDED_QUESTION_TOPICS = ['SCOPE', 'DATES', 'DELIVERABLES', 'OWNERSHIP', 'DEPENDENCIES', 'OTHER'] as const

export const aiGuidedClarifyOutputSchema = z.object({
  questions: z.array(z.object({
    text: shortText(AI_GUIDED_CAPS.narrativeChars),
    impact: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    topic: z.enum(AI_GUIDED_QUESTION_TOPICS),
    defaultAssumption: shortText(AI_GUIDED_CAPS.narrativeChars),
  }).strict()).max(AI_GUIDED_CAPS.questionsPerRound),
}).strict()

export type AiGuidedClarifyOutput = z.infer<typeof aiGuidedClarifyOutputSchema>

export const AI_GUIDED_CLARIFY_JSON_SCHEMA = {
  name: 'project_brief_clarification',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        maxItems: AI_GUIDED_CAPS.questionsPerRound,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'impact', 'topic', 'defaultAssumption'],
          properties: {
            text: { type: 'string', maxLength: AI_GUIDED_CAPS.narrativeChars },
            impact: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
            topic: { type: 'string', enum: [...AI_GUIDED_QUESTION_TOPICS] },
            defaultAssumption: { type: 'string', maxLength: AI_GUIDED_CAPS.narrativeChars },
          },
        },
      },
    },
  },
} as const

// ---------------------------------------------------------------------------
// Generation (Story 3.4)
// ---------------------------------------------------------------------------

export const AI_GUIDED_ASSUMPTION_CATEGORIES = ['SCOPE', 'DATE', 'DELIVERABLE', 'OWNERSHIP', 'DEPENDENCY', 'EFFORT', 'OTHER'] as const
const basisSchema = z.enum(['SOURCE_FACT', 'INFERRED'])

export const aiGuidedPlanSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: shortText(AI_GUIDED_CAPS.descriptionChars),
  phases: z.array(z.object({
    ref: refSchema,
    name: shortText(150),
  }).strict()).min(1).max(AI_GUIDED_CAPS.phases),
  milestones: z.array(z.object({
    ref: refSchema,
    phaseRef: refSchema,
    name: shortText(200),
    deliverableRef: refSchema.nullable(),
    newDeliverableName: shortText(300).nullable(),
    approvalRequired: z.boolean(),
    basis: basisSchema,
  }).strict()).min(1).max(AI_GUIDED_CAPS.milestones),
  activities: z.array(z.object({
    ref: refSchema,
    milestoneRef: refSchema,
    parentRef: refSchema.nullable(),
    title: shortText(200),
    description: shortText(AI_GUIDED_CAPS.narrativeChars).nullable(),
    ownerParty: z.enum(OWNER_PARTIES),
    teamRef: refSchema.nullable(),
    suggestedRole: shortText(80).nullable(),
    startDate: isoDate,
    endDate: isoDate,
    estimatedHours: z.number().finite().min(0).max(10_000).nullable(),
    priority: z.enum(PRIORITIES).nullable(),
    risk: z.enum(RISK_LEVELS).nullable(),
    isApproval: z.boolean(),
    basis: basisSchema,
  }).strict()).min(1).max(AI_GUIDED_CAPS.activities),
  dependencies: z.array(z.object({
    predecessorRef: refSchema,
    successorRef: refSchema,
    type: z.enum(DEPENDENCY_TYPES),
    lagDays: z.number().int().min(-30).max(60),
  }).strict()).max(AI_GUIDED_CAPS.dependencies),
  assumptions: z.array(z.object({
    text: shortText(AI_GUIDED_CAPS.narrativeChars),
    category: z.enum(AI_GUIDED_ASSUMPTION_CATEGORIES),
  }).strict()).max(AI_GUIDED_CAPS.assumptions),
  exclusions: z.array(shortText(AI_GUIDED_CAPS.narrativeChars)).max(AI_GUIDED_CAPS.exclusions),
  openQuestions: z.array(shortText(AI_GUIDED_CAPS.narrativeChars)).max(AI_GUIDED_CAPS.openQuestions),
  scheduleRisks: z.array(shortText(AI_GUIDED_CAPS.narrativeChars)).max(AI_GUIDED_CAPS.scheduleRisks),
}).strict()

export type AiGuidedPlan = z.infer<typeof aiGuidedPlanSchema>

const nullableString = (maxLength: number) => ({ type: ['string', 'null'], maxLength })
const refJson = { type: 'string', maxLength: 20 }
const nullableRefJson = { type: ['string', 'null'], maxLength: 20 }
const dateJson = { type: 'string', pattern: ISO_DATE_PATTERN }
const nullableEnum = (values: readonly string[]) => ({ type: ['string', 'null'], enum: [...values, null] })

export const AI_GUIDED_PLAN_JSON_SCHEMA = {
  name: 'project_schedule_plan',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'description', 'phases', 'milestones', 'activities', 'dependencies', 'assumptions', 'exclusions', 'openQuestions', 'scheduleRisks'],
    properties: {
      title: { type: 'string', maxLength: 200 },
      description: { type: 'string', maxLength: AI_GUIDED_CAPS.descriptionChars },
      phases: {
        type: 'array',
        maxItems: AI_GUIDED_CAPS.phases,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'name'],
          properties: { ref: refJson, name: { type: 'string', maxLength: 150 } },
        },
      },
      milestones: {
        type: 'array',
        maxItems: AI_GUIDED_CAPS.milestones,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'phaseRef', 'name', 'deliverableRef', 'newDeliverableName', 'approvalRequired', 'basis'],
          properties: {
            ref: refJson,
            phaseRef: refJson,
            name: { type: 'string', maxLength: 200 },
            deliverableRef: nullableRefJson,
            newDeliverableName: nullableString(300),
            approvalRequired: { type: 'boolean' },
            basis: { type: 'string', enum: ['SOURCE_FACT', 'INFERRED'] },
          },
        },
      },
      activities: {
        type: 'array',
        maxItems: AI_GUIDED_CAPS.activities,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'milestoneRef', 'parentRef', 'title', 'description', 'ownerParty', 'teamRef', 'suggestedRole', 'startDate', 'endDate', 'estimatedHours', 'priority', 'risk', 'isApproval', 'basis'],
          properties: {
            ref: refJson,
            milestoneRef: refJson,
            parentRef: nullableRefJson,
            title: { type: 'string', maxLength: 200 },
            description: nullableString(AI_GUIDED_CAPS.narrativeChars),
            ownerParty: { type: 'string', enum: [...OWNER_PARTIES] },
            teamRef: nullableRefJson,
            suggestedRole: nullableString(80),
            startDate: dateJson,
            endDate: dateJson,
            estimatedHours: { type: ['number', 'null'] },
            priority: nullableEnum(PRIORITIES),
            risk: nullableEnum(RISK_LEVELS),
            isApproval: { type: 'boolean' },
            basis: { type: 'string', enum: ['SOURCE_FACT', 'INFERRED'] },
          },
        },
      },
      dependencies: {
        type: 'array',
        maxItems: AI_GUIDED_CAPS.dependencies,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['predecessorRef', 'successorRef', 'type', 'lagDays'],
          properties: {
            predecessorRef: refJson,
            successorRef: refJson,
            type: { type: 'string', enum: [...DEPENDENCY_TYPES] },
            lagDays: { type: 'integer' },
          },
        },
      },
      assumptions: {
        type: 'array',
        maxItems: AI_GUIDED_CAPS.assumptions,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'category'],
          properties: {
            text: { type: 'string', maxLength: AI_GUIDED_CAPS.narrativeChars },
            category: { type: 'string', enum: [...AI_GUIDED_ASSUMPTION_CATEGORIES] },
          },
        },
      },
      exclusions: { type: 'array', maxItems: AI_GUIDED_CAPS.exclusions, items: { type: 'string', maxLength: AI_GUIDED_CAPS.narrativeChars } },
      openQuestions: { type: 'array', maxItems: AI_GUIDED_CAPS.openQuestions, items: { type: 'string', maxLength: AI_GUIDED_CAPS.narrativeChars } },
      scheduleRisks: { type: 'array', maxItems: AI_GUIDED_CAPS.scheduleRisks, items: { type: 'string', maxLength: AI_GUIDED_CAPS.narrativeChars } },
    },
  },
} as const

// ---------------------------------------------------------------------------
// Constrained revision (Story 3.7)
// ---------------------------------------------------------------------------

export const AI_GUIDED_REVISION_OPS = [
  'UPDATE_PHASE',
  'ADD_PHASE',
  'DELETE_PHASE',
  'UPDATE_MILESTONE',
  'ADD_MILESTONE',
  'DELETE_MILESTONE',
  'UPDATE_ACTIVITY',
  'ADD_ACTIVITY',
  'DELETE_ACTIVITY',
  'ADD_DEPENDENCY',
  'DELETE_DEPENDENCY',
  'SET_CALENDAR',
] as const

export const aiGuidedRevisionOperationSchema = z.object({
  op: z.enum(AI_GUIDED_REVISION_OPS),
  targetRef: refSchema.nullable(),
  newRef: refSchema.nullable(),
  phaseRef: refSchema.nullable(),
  milestoneRef: refSchema.nullable(),
  parentRef: refSchema.nullable(),
  name: shortText(200).nullable(),
  description: shortText(AI_GUIDED_CAPS.narrativeChars).nullable(),
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  ownerParty: z.enum(OWNER_PARTIES).nullable(),
  suggestedRole: shortText(80).nullable(),
  isApproval: z.boolean().nullable(),
  priority: z.enum(PRIORITIES).nullable(),
  risk: z.enum(RISK_LEVELS).nullable(),
  estimatedHours: z.number().finite().min(0).max(10_000).nullable(),
  predecessorRef: refSchema.nullable(),
  successorRef: refSchema.nullable(),
  dependencyType: z.enum(DEPENDENCY_TYPES).nullable(),
  lagDays: z.number().int().min(-30).max(60).nullable(),
  workingDays: z.array(z.enum(AI_GUIDED_WEEKDAYS)).min(1).max(7).nullable(),
  allowNonWorkingDates: z.boolean().nullable(),
}).strict()

export const aiGuidedRevisionOutputSchema = z.object({
  summary: shortText(AI_GUIDED_CAPS.narrativeChars),
  operations: z.array(aiGuidedRevisionOperationSchema).max(AI_GUIDED_CAPS.revisionOperations),
}).strict()

export type AiGuidedRevisionOperation = z.infer<typeof aiGuidedRevisionOperationSchema>
export type AiGuidedRevisionOutput = z.infer<typeof aiGuidedRevisionOutputSchema>

export const AI_GUIDED_REVISION_JSON_SCHEMA = {
  name: 'project_schedule_revision',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'operations'],
    properties: {
      summary: { type: 'string', maxLength: AI_GUIDED_CAPS.narrativeChars },
      operations: {
        type: 'array',
        maxItems: AI_GUIDED_CAPS.revisionOperations,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['op', 'targetRef', 'newRef', 'phaseRef', 'milestoneRef', 'parentRef', 'name', 'description', 'startDate', 'endDate', 'ownerParty', 'suggestedRole', 'isApproval', 'priority', 'risk', 'estimatedHours', 'predecessorRef', 'successorRef', 'dependencyType', 'lagDays', 'workingDays', 'allowNonWorkingDates'],
          properties: {
            op: { type: 'string', enum: [...AI_GUIDED_REVISION_OPS] },
            targetRef: nullableRefJson,
            newRef: nullableRefJson,
            phaseRef: nullableRefJson,
            milestoneRef: nullableRefJson,
            parentRef: nullableRefJson,
            name: nullableString(200),
            description: nullableString(AI_GUIDED_CAPS.narrativeChars),
            startDate: { type: ['string', 'null'], pattern: ISO_DATE_PATTERN },
            endDate: { type: ['string', 'null'], pattern: ISO_DATE_PATTERN },
            ownerParty: nullableEnum(OWNER_PARTIES),
            suggestedRole: nullableString(80),
            isApproval: { type: ['boolean', 'null'] },
            priority: nullableEnum(PRIORITIES),
            risk: nullableEnum(RISK_LEVELS),
            estimatedHours: { type: ['number', 'null'] },
            predecessorRef: nullableRefJson,
            successorRef: nullableRefJson,
            dependencyType: nullableEnum(DEPENDENCY_TYPES),
            lagDays: { type: ['integer', 'null'] },
            workingDays: {
              type: ['array', 'null'],
              maxItems: 7,
              items: { type: 'string', enum: [...AI_GUIDED_WEEKDAYS] },
            },
            allowNonWorkingDates: { type: ['boolean', 'null'] },
          },
        },
      },
    },
  },
} as const
