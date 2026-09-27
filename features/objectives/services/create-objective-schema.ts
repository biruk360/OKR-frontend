import { z } from 'zod'
import type { FieldErrors, Resolver } from 'react-hook-form'
import { CHECK_IN_CADENCES } from '@/lib/check-in-cadence'

/**
 * Single create-objective contract for every entry point (Objectives page,
 * company / department / "my objective" buttons, Goals page, My Team, and
 * "Add aligned objective"). Consumed by CreateObjectiveModal through a small
 * zod → react-hook-form bridge (the repo has no @hookform/resolvers).
 */

export const OBJECTIVE_LEVELS = ['COMPANY', 'DEPARTMENT', 'INDIVIDUAL'] as const
export const CREATE_GOAL_STATUSES = ['ON_TRACK', 'AT_RISK', 'OFF_TRACK'] as const

const optionalId = z.string().trim().optional().default('')
const optionalDate = z
  .string()
  .trim()
  .optional()
  .default('')
  .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), 'Enter a valid date')

export const createObjectiveSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Objective title is required.')
      .max(300, 'Title must be 300 characters or fewer.'),
    description: z.string().optional().default(''),
    level: z.enum(OBJECTIVE_LEVELS, { message: 'Level is required' }),
    ownerId: z.string().trim().min(1, 'An owner must be assigned.'),
    timeframeId: z.string().trim().min(1, 'A timeframe is required.'),
    departmentId: optionalId,
    parentObjectiveId: optionalId,
    isPrivate: z.boolean().optional().default(false),
    checkInCadence: z.enum(CHECK_IN_CADENCES as [string, ...string[]]).optional().default('WEEKLY'),
    goalStatus: z.enum(CREATE_GOAL_STATUSES).optional().default('ON_TRACK'),
    startDate: optionalDate,
    endDate: optionalDate,
    contributorIds: z.array(z.string()).optional().default([]),
    labelIds: z.array(z.string()).optional().default([]),
  })
  .superRefine((v, ctx) => {
    if (v.level === 'DEPARTMENT' && !v.departmentId) {
      ctx.addIssue({ code: 'custom', path: ['departmentId'], message: 'Department is required' })
    }
    if (v.startDate && v.endDate && new Date(v.endDate) < new Date(v.startDate)) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after the start date' })
    }
  })

export type CreateObjectiveValues = z.input<typeof createObjectiveSchema>
export type ParsedCreateObjective = z.output<typeof createObjectiveSchema>

/** Zod → react-hook-form bridge (same pattern as features/auth SignUpForm). */
export const createObjectiveResolver: Resolver<CreateObjectiveValues> = async (values) => {
  const result = createObjectiveSchema.safeParse(values)
  if (result.success) return { values: result.data as CreateObjectiveValues, errors: {} }
  const errors: FieldErrors<CreateObjectiveValues> = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof CreateObjectiveValues | undefined
    if (key && !errors[key]) (errors as Record<string, unknown>)[key] = { type: issue.code, message: issue.message }
  }
  return { values: {}, errors }
}

/** Body for POST /api/objectives. Labels are attached afterwards via /labels. */
export function buildCreateObjectivePayload(v: ParsedCreateObjective) {
  return {
    title: v.title,
    description: v.description?.trim() ? v.description.trim() : undefined,
    level: v.level,
    ownerId: v.ownerId,
    timeframeId: v.timeframeId,
    // Company objectives are never tied to a department.
    departmentId: v.level === 'COMPANY' ? null : v.departmentId || null,
    // Company objectives sit at the top of the tree.
    parentObjectiveId: v.level === 'COMPANY' ? null : v.parentObjectiveId || null,
    isPrivate: Boolean(v.isPrivate),
    checkInCadence: v.checkInCadence,
    goalStatus: v.goalStatus,
    startDate: v.startDate || null,
    endDate: v.endDate || null,
    contributorIds: Array.from(new Set(v.contributorIds.filter((id) => id && id !== v.ownerId))),
  }
}

/**
 * Default child level when creating an objective aligned under `parentLevel`:
 * company → department, anything else → individual.
 */
export function childLevelFor(parentLevel?: string | null): (typeof OBJECTIVE_LEVELS)[number] {
  return parentLevel === 'COMPANY' ? 'DEPARTMENT' : 'INDIVIDUAL'
}
