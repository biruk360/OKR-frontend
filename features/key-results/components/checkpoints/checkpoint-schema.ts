/**
 * KR checkpoint validation (KRX-3). Pure zod — shared by the API routes
 * (`app/api/keyresults/[id]/checkpoints/**`) and the CheckpointEditor form.
 */
import { z } from 'zod'
import { CHECKPOINT_STATUSES } from '@/types/package'

export const CHECKPOINT_LABEL_MAX = 40
export const CHECKPOINT_TARGET_TEXT_MAX = 500
/** A KR is reviewed a few times a year; this only stops runaway input. */
export const MAX_CHECKPOINTS_PER_KR = 24

const label = z
  .string()
  .trim()
  .min(1, 'Label is required')
  .max(CHECKPOINT_LABEL_MAX, `Label must be ${CHECKPOINT_LABEL_MAX} characters or fewer`)

const targetText = z
  .string()
  .trim()
  .min(1, 'Target is required')
  .max(CHECKPOINT_TARGET_TEXT_MAX, `Target must be ${CHECKPOINT_TARGET_TEXT_MAX} characters or fewer`)

/** ISO timestamp or yyyy-mm-dd → Date. A bare date is read as UTC midnight. */
const dueDate = z
  .string()
  .trim()
  .min(1, 'Due date is required')
  .transform((v, ctx) => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Due date must be a valid date' })
      return z.NEVER
    }
    return d
  })

const optionalNumber = z
  .union([z.number(), z.null()])
  .optional()
  .refine((v) => v === undefined || v === null || Number.isFinite(v), 'Must be a finite number')

const status = z.enum(CHECKPOINT_STATUSES)

/** POST body. */
export const createCheckpointSchema = z.object({
  label,
  dueDate,
  targetText,
  targetValue: optionalNumber,
  actualValue: optionalNumber,
  status: status.optional(),
})

/** PATCH body — any subset, at least one key. */
export const updateCheckpointSchema = z
  .object({
    label: label.optional(),
    dueDate: dueDate.optional(),
    targetText: targetText.optional(),
    targetValue: optionalNumber,
    actualValue: optionalNumber,
    status: status.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update')

export type CreateCheckpointData = z.output<typeof createCheckpointSchema>
export type UpdateCheckpointData = z.output<typeof updateCheckpointSchema>

/** First zod issue as a readable message (`Invalid dueDate: …`). */
export function checkpointIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid checkpoint'
  const field = issue.path[0]
  return field ? `${String(field)}: ${issue.message}` : issue.message
}

// ── Form (strings in, parsed on submit) ──────────────────────────────────────

const numericText = z
  .string()
  .trim()
  .refine((v) => v === '' || Number.isFinite(Number(v)), 'Enter a number or leave blank')

/** CheckpointEditor form values — every input is a string. */
export const checkpointFormSchema = z.object({
  label,
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a due date'),
  targetText,
  targetValue: numericText,
  actualValue: numericText,
  status,
})

export type CheckpointFormValues = z.input<typeof checkpointFormSchema>

/** '' → null, otherwise a number. Call only on validated form strings. */
export function parseOptionalNumber(v: string | null | undefined): number | null {
  if (v == null) return null
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
