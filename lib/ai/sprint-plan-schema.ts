/**
 * Zod schema for the normalized `sprint_plan` payload every AI provider must
 * return after structured-output / tool-use parsing. The shape is provider-
 * agnostic — Anthropic / OpenAI / Gemini implementations all coerce their
 * native response into this exact JSON before handing it back.
 *
 * See docs/AI_SPRINT_PLANNING.md §3.5 (carryover dispositions) and §3.2
 * (proposed-todo shape).
 */

import { z } from 'zod'

export const PriorityZ = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
export const AmbitionZ = z.enum(['COMMITTED', 'STRETCH'])
export const TaskTypeZ = z.enum([
  'CALL',
  'EMAIL',
  'DEMO',
  'MEETING',
  'PROPOSAL',
  'FOLLOW_UP',
  'ADMIN',
  'GENERAL',
])
export const DispositionZ = z.enum(['KEEP', 'SPLIT', 'RESCHEDULE', 'DESCOPE', 'ESCALATE'])

/** A single new todo the AI is proposing for the new sprint. */
export const ProposedTodoZ = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  /** Either keyResultId OR objectiveId must be set; both is allowed (KR wins). */
  keyResultId: z.string().nullable(),
  objectiveId: z.string().nullable(),
  priority: PriorityZ,
  /** Within the sprint window. ISO date string (YYYY-MM-DD). */
  dueDate: z.string(),
  /** Numeric contribution toward the parent KR. 0 for binary tasks. */
  progressValue: z.number().nonnegative(),
  taskType: TaskTypeZ,
  ambitionLevel: AmbitionZ,
  /** Free-text rationale tied specifically to this task — shown in the review UI. */
  reason: z.string().max(500).optional(),
})
export type ProposedTodo = z.infer<typeof ProposedTodoZ>

/** AI's decision for a single carryover candidate. */
export const CarryoverDispositionZ = z.object({
  todoId: z.string(),
  disposition: DispositionZ,
  /** Concise human-readable explanation. Required so the UI can surface it. */
  reason: z.string().min(1).max(500),
  /** When disposition === 'SPLIT', the AI proposes 2–4 child todos. */
  splitInto: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        description: z.string().max(2000).optional(),
        progressValue: z.number().nonnegative(),
        dueDate: z.string(),
      })
    )
    .max(4)
    .optional(),
  /** When disposition === 'ESCALATE', the AI may recommend a different assignee id. */
  suggestedAssigneeId: z.string().nullable().optional(),
})
export type CarryoverDisposition = z.infer<typeof CarryoverDispositionZ>

/** Brief summary of the prior sprint, written by the AI. */
export const PrevSprintReviewZ = z.object({
  completed: z.number().int().nonnegative(),
  planned: z.number().int().nonnegative(),
  blockers: z.array(z.string()).max(20).default([]),
  /** Per-KR delta the prior sprint actually moved. */
  krDeltas: z
    .array(
      z.object({
        keyResultId: z.string(),
        delta: z.number(),
      })
    )
    .default([]),
})
export type PrevSprintReview = z.infer<typeof PrevSprintReviewZ>

export const SprintPlanZ = z.object({
  /** Markdown rationale shown to the user before they accept. */
  rationale: z.string().min(20).max(8000),
  proposedTodos: z.array(ProposedTodoZ).min(0).max(40),
  carryoverDispositions: z.array(CarryoverDispositionZ).default([]),
  prevSprintReview: PrevSprintReviewZ.nullable(),
  /** Sprint debt flag — the AI sets this when carryovers consumed ≥80% capacity. */
  sprintDebt: z.boolean().default(false),
})
export type SprintPlan = z.infer<typeof SprintPlanZ>

/**
 * The same schema in the JSON Schema dialect that OpenAI's structured-outputs API
 * expects. Hand-built rather than generated from Zod so we can keep the OpenAI-
 * specific quirks (additionalProperties:false everywhere, all keys in `required`)
 * without polluting the Zod source of truth.
 */
export const SPRINT_PLAN_JSON_SCHEMA = {
  name: 'sprint_plan',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['rationale', 'proposedTodos', 'carryoverDispositions', 'prevSprintReview', 'sprintDebt'],
    properties: {
      rationale: { type: 'string' },
      sprintDebt: { type: 'boolean' },
      proposedTodos: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'title',
            'description',
            'keyResultId',
            'objectiveId',
            'priority',
            'dueDate',
            'progressValue',
            'taskType',
            'ambitionLevel',
            'reason',
          ],
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            keyResultId: { type: ['string', 'null'] },
            objectiveId: { type: ['string', 'null'] },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
            dueDate: { type: 'string' },
            progressValue: { type: 'number' },
            taskType: {
              type: 'string',
              enum: ['CALL', 'EMAIL', 'DEMO', 'MEETING', 'PROPOSAL', 'FOLLOW_UP', 'ADMIN', 'GENERAL'],
            },
            ambitionLevel: { type: 'string', enum: ['COMMITTED', 'STRETCH'] },
            reason: { type: 'string' },
          },
        },
      },
      carryoverDispositions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['todoId', 'disposition', 'reason', 'splitInto', 'suggestedAssigneeId'],
          properties: {
            todoId: { type: 'string' },
            disposition: {
              type: 'string',
              enum: ['KEEP', 'SPLIT', 'RESCHEDULE', 'DESCOPE', 'ESCALATE'],
            },
            reason: { type: 'string' },
            suggestedAssigneeId: { type: ['string', 'null'] },
            splitInto: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'description', 'progressValue', 'dueDate'],
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  progressValue: { type: 'number' },
                  dueDate: { type: 'string' },
                },
              },
            },
          },
        },
      },
      prevSprintReview: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            required: ['completed', 'planned', 'blockers', 'krDeltas'],
            properties: {
              completed: { type: 'integer' },
              planned: { type: 'integer' },
              blockers: { type: 'array', items: { type: 'string' } },
              krDeltas: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['keyResultId', 'delta'],
                  properties: {
                    keyResultId: { type: 'string' },
                    delta: { type: 'number' },
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
  strict: true,
} as const
