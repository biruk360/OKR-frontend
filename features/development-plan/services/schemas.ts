/**
 * Development plan (DEV) zod schemas — shared by the API routes and the form.
 * Pure and client-safe.
 */
import { z } from 'zod'
import { DEVELOPMENT_KINDS, DEVELOPMENT_STATUSES } from '@/types/package'
import { DROP_REASON_MAX, EVIDENCE_NOTE_MAX, EVIDENCE_URL_MAX, MAX_HOURS_PER_ENTRY } from './rules'

export const DEV_TITLE_MAX = 300
export const DEV_TARGET_TEXT_MAX = 300
export const DEV_EXTERNAL_REF_MAX = 64
export const DEV_HOURS_NOTE_MAX = 500
export const DEV_MAX_TOTAL_HOURS = 10000

const trimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`)

/** Optional text: undefined = unchanged, '' / null = clear. */
const optionalText = (max: number, label: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined
      const v = (value ?? '').trim()
      if (v.length > max) {
        ctx.addIssue({ code: 'custom', message: `${label} must be ${max} characters or fewer` })
        return z.NEVER
      }
      return v ? v : null
    })

/** ISO datetime or YYYY-MM-DD (stored as 00:00 UTC); '' / null = clear. */
const optionalDate = (label: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined
      if (value === null || value.trim() === '') return null
      const v = value.trim()
      const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: 'custom', message: `${label} is not a valid date` })
        return z.NEVER
      }
      return date
    })

const idOrNull = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((value) => (value === undefined ? undefined : value ? value : null))

const hoursValue = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(DEV_MAX_TOTAL_HOURS, `${label} must be ${DEV_MAX_TOTAL_HOURS} or less`)

const evidenceUrl = optionalText(EVIDENCE_URL_MAX, 'Evidence link')

/** Statuses an item may be created in; DONE / DROPPED go through PATCH so their rules apply. */
export const DEV_CREATE_STATUSES = ['NOT_STARTED', 'IN_PROGRESS'] as const

export const createDevelopmentItemSchema = z.object({
  ownerId: z.string().trim().min(1, 'ownerId is required'),
  timeframeId: z.string().trim().min(1, 'timeframeId is required'),
  title: trimmed(DEV_TITLE_MAX, 'Title'),
  kind: z.enum(DEVELOPMENT_KINDS),
  targetText: trimmed(DEV_TARGET_TEXT_MAX, 'Target'),
  targetHours: hoursValue('Target hours').nullish().transform((v) => v ?? null),
  hoursLogged: hoursValue('Hours logged').optional().default(0),
  dueDate: optionalDate('Due date').transform((v) => v ?? null),
  keyResultId: idOrNull.transform((v) => v ?? null),
  status: z.enum(DEV_CREATE_STATUSES).optional().default('NOT_STARTED'),
  isMandatory: z.boolean().optional().default(false),
  evidenceNote: optionalText(EVIDENCE_NOTE_MAX, 'Evidence note').transform((v) => v ?? null),
  evidenceUrl: evidenceUrl.transform((v) => v ?? null),
  externalRef: optionalText(DEV_EXTERNAL_REF_MAX, 'Reference').transform((v) => v ?? null),
})
export type CreateDevelopmentItemInput = z.infer<typeof createDevelopmentItemSchema>

/** PATCH: every field optional. Status transitions follow `applyDevelopmentStatePatch`. */
export const updateDevelopmentItemSchema = z
  .object({
    title: trimmed(DEV_TITLE_MAX, 'Title').optional(),
    kind: z.enum(DEVELOPMENT_KINDS).optional(),
    targetText: trimmed(DEV_TARGET_TEXT_MAX, 'Target').optional(),
    targetHours: hoursValue('Target hours').nullish(),
    /** Correction of the running total (adding hours is POST …/hours). */
    hoursLogged: hoursValue('Hours logged').optional(),
    dueDate: optionalDate('Due date'),
    keyResultId: idOrNull,
    isMandatory: z.boolean().optional(),
    status: z.enum(DEVELOPMENT_STATUSES).optional(),
    evidenceNote: optionalText(EVIDENCE_NOTE_MAX, 'Evidence note'),
    evidenceUrl,
    dropReason: optionalText(DROP_REASON_MAX, 'Drop reason'),
    completedAt: optionalDate('Completion date'),
    externalRef: optionalText(DEV_EXTERNAL_REF_MAX, 'Reference'),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), { message: 'Nothing to update' })
export type UpdateDevelopmentItemInput = z.infer<typeof updateDevelopmentItemSchema>

export const addDevelopmentHoursSchema = z.object({
  hours: z
    .number({ error: 'Hours must be a number' })
    .gt(0, 'Hours must be more than 0')
    .max(MAX_HOURS_PER_ENTRY, `At most ${MAX_HOURS_PER_ENTRY} hours per entry`),
  note: optionalText(DEV_HOURS_NOTE_MAX, 'Note').transform((v) => v ?? null),
  /** Day the hours were spent (informational, logged in the activity row). */
  date: optionalDate('Date').transform((v) => v ?? null),
})
export type AddDevelopmentHoursInput = z.infer<typeof addDevelopmentHoursSchema>

export const listDevelopmentQuerySchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  timeframeId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
})

/** First zod issue as a readable message. */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid input'
  const path = issue.path.filter((p) => typeof p === 'string' || typeof p === 'number').join('.')
  return path && issue.code !== 'custom' ? `${path}: ${issue.message}` : issue.message
}
