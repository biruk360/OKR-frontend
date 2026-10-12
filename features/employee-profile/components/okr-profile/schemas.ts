/**
 * Employee OKR profile — zod schemas shared by the API routes and the
 * "Add milestone / task" form. Client-safe (no Prisma).
 */
import { z } from 'zod'

export const INITIATIVE_TITLE_MAX = 300

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** `?timeframeId=` on GET /api/users/[id]/okr-profile (omitted → the default timeframe). */
export const okrProfileQuerySchema = z.object({
  timeframeId: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'Invalid timeframe id')
    .optional(),
})

/** Kinds the profile can add (FND-4). Duties and delivery tasks have their own flows. */
export const PROFILE_INITIATIVE_KINDS = ['MILESTONE', 'TASK'] as const
export type ProfileInitiativeKind = (typeof PROFILE_INITIATIVE_KINDS)[number]

/** "YYYY-MM-DD" → UTC midnight Date (or null when invalid). */
export function parseDateOnly(value: string): Date | null {
  if (!DATE_RE.test(value)) return null
  const d = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d
}

/** Body of POST /api/users/[id]/okr-profile/initiatives. */
export const createProfileInitiativeSchema = z.object({
  keyResultId: z.string().trim().min(1, 'Choose a key result').max(64),
  kind: z.enum(PROFILE_INITIATIVE_KINDS),
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(INITIATIVE_TITLE_MAX, `Must be ${INITIATIVE_TITLE_MAX} characters or fewer`),
  dueDate: z
    .string()
    .trim()
    .nullish()
    .refine((v) => !v || parseDateOnly(v) !== null, 'Use a valid date')
    .transform((v) => (v ? v : null)),
  /** Defaults to the profile person when absent; null leaves the card unassigned. */
  assigneeId: z.string().trim().max(64).nullish(),
})
export type CreateProfileInitiativeInput = z.infer<typeof createProfileInitiativeSchema>

/** Form values (the modal posts them as the body above). */
export const profileInitiativeFormSchema = z.object({
  kind: z.enum(PROFILE_INITIATIVE_KINDS),
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(INITIATIVE_TITLE_MAX, `Must be ${INITIATIVE_TITLE_MAX} characters or fewer`),
  dueDate: z.string().refine((v) => !v || parseDateOnly(v) !== null, 'Use a valid date'),
  assigneeId: z.string(),
})
export type ProfileInitiativeFormValues = z.infer<typeof profileInitiativeFormSchema>
