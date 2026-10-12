/**
 * Recurring duties — zod schemas shared by the API routes and the form.
 * Client-safe (no Prisma).
 */
import { z } from 'zod'
import { DUTY_CADENCES } from '@/types/package'
import { parseDutyDate } from './schedule'

export const DUTY_TITLE_MAX = 300
export const DUTY_TEXT_MAX = 500
export const DUTY_SHORT_TEXT_MAX = 120
export const DUTY_MAX_COLLABORATORS = 50
export const DUTY_MAX_DURATION_MIN = 24 * 60

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null))

/** Absent → undefined (leave as is); null / '' → null (clear). */
const optionalId = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v === undefined ? undefined : v ? v : null))

/** "YYYY-MM-DD" or a full ISO string; '' / null clear the date. */
const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .refine((v) => v == null || v === '' || parseDutyDate(v) !== null, 'Invalid date')
  .transform((v) => (v == null || v === '' ? (v === undefined ? undefined : null) : (parseDutyDate(v) as Date)))

const durationField = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined
    if (v === null || v === '') return null
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isInteger(n) || n < 0 || n > DUTY_MAX_DURATION_MIN) {
      ctx.addIssue({ code: 'custom', message: `Duration must be a whole number of minutes (0–${DUTY_MAX_DURATION_MIN})` })
      return z.NEVER
    }
    return n === 0 ? null : n
  })

const collaboratorIds = z
  .array(z.string().trim().min(1))
  .max(DUTY_MAX_COLLABORATORS, `At most ${DUTY_MAX_COLLABORATORS} collaborators`)
  .transform((ids) => Array.from(new Set(ids)))

/** Fields every write may carry (create requires title, cadence, timeframeId). */
const dutyFieldShape = {
  title: z.string().trim().min(1, 'Title is required').max(DUTY_TITLE_MAX),
  cadence: z.enum(DUTY_CADENCES, { message: 'Choose a cadence' }),
  eventLabel: optionalText(DUTY_SHORT_TEXT_MAX),
  timingText: optionalText(DUTY_SHORT_TEXT_MAX),
  durationMin: durationField,
  outputText: optionalText(DUTY_TEXT_MAX),
  keyResultId: optionalId,
  objectiveId: optionalId,
  autoTask: z.boolean(),
  startsOn: optionalDate,
  endsOn: optionalDate,
  collaboratorIds,
  externalRef: optionalText(64),
}

function datesInOrder(v: { startsOn?: Date | null; endsOn?: Date | null }): boolean {
  return !(v.startsOn && v.endsOn && v.endsOn < v.startsOn)
}

export const createDutySchema = z
  .object({
    ...dutyFieldShape,
    ownerId: optionalId,
    timeframeId: z.string().trim().min(1, 'timeframeId is required'),
    autoTask: dutyFieldShape.autoTask.default(true),
    collaboratorIds: dutyFieldShape.collaboratorIds.default([]),
  })
  .refine(datesInOrder, { message: 'End date must be on or after the start date', path: ['endsOn'] })
export type CreateDutyInput = z.output<typeof createDutySchema>

export const DUTY_ACTIONS = ['pause', 'resume', 'retire'] as const
export type DutyAction = (typeof DUTY_ACTIONS)[number]

export const updateDutySchema = z
  .object({
    title: dutyFieldShape.title.optional(),
    cadence: dutyFieldShape.cadence.optional(),
    eventLabel: dutyFieldShape.eventLabel,
    timingText: dutyFieldShape.timingText,
    durationMin: dutyFieldShape.durationMin,
    outputText: dutyFieldShape.outputText,
    keyResultId: dutyFieldShape.keyResultId,
    objectiveId: dutyFieldShape.objectiveId,
    autoTask: dutyFieldShape.autoTask.optional(),
    startsOn: dutyFieldShape.startsOn,
    endsOn: dutyFieldShape.endsOn,
    collaboratorIds: dutyFieldShape.collaboratorIds.optional(),
    externalRef: dutyFieldShape.externalRef,
    ownerId: z.string().trim().min(1).optional(),
    action: z.enum(DUTY_ACTIONS).optional(),
  })
  .refine(datesInOrder, { message: 'End date must be on or after the start date', path: ['endsOn'] })
export type UpdateDutyInput = z.output<typeof updateDutySchema>

export const logDutyOccurrenceSchema = z.object({
  /** Defaults to today. */
  dueDate: optionalDate,
  /** Log something that already happened: the card is created COMPLETED. */
  completed: z.boolean().optional().default(false),
  note: optionalText(2000),
})
export type LogDutyOccurrenceInput = z.output<typeof logDutyOccurrenceSchema>

export const listDutiesQuerySchema = z.object({
  userId: z.string().trim().min(1).optional(),
  timeframeId: z.string().trim().min(1).optional(),
  includeRetired: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === undefined || v === 'true' || v === '1'),
})

/** First zod issue as a sentence for the error envelope. */
export function firstDutyIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid request'
  const path = issue.path.join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}

// ---------------------------------------------------------------------------
// Form (DutyFormModal) — string-typed inputs, converted to the API body.
// ---------------------------------------------------------------------------

export const dutyFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(DUTY_TITLE_MAX),
    cadence: z.enum(DUTY_CADENCES, { message: 'Choose a cadence' }),
    eventLabel: z.string().max(DUTY_SHORT_TEXT_MAX),
    timingText: z.string().max(DUTY_SHORT_TEXT_MAX),
    durationMin: z
      .string()
      .refine((v) => v.trim() === '' || (/^\d+$/.test(v.trim()) && Number(v) <= DUTY_MAX_DURATION_MIN), {
        message: `Whole minutes, up to ${DUTY_MAX_DURATION_MIN}`,
      }),
    outputText: z.string().max(DUTY_TEXT_MAX),
    autoTask: z.boolean(),
    startsOn: z.string(),
    endsOn: z.string(),
    collaboratorIds: z.array(z.string()).max(DUTY_MAX_COLLABORATORS),
  })
  .refine((v) => !(v.startsOn && v.endsOn && v.endsOn < v.startsOn), {
    message: 'End date must be on or after the start date',
    path: ['endsOn'],
  })
  .refine((v) => v.cadence !== 'EVENT' || v.eventLabel.trim().length > 0, {
    message: 'Say what triggers it, e.g. "per bid"',
    path: ['eventLabel'],
  })
export type DutyFormValues = z.infer<typeof dutyFormSchema>
