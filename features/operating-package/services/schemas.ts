/**
 * Operating package (PKG) zod schemas — shared by the API routes and the forms.
 * Pure and client-safe.
 */
import { z } from 'zod'
import { PACKAGE_REVIEW_ENTITY_TYPES, REVIEW_VERDICTS } from '@/types/package'

export const PACKAGE_VERSION_MAX = 20
export const PACKAGE_SEAT_TITLE_MAX = 200
export const PACKAGE_SUMMARY_LINE_MAX = 500
export const PACKAGE_SUMMARY_LINES_MAX = 50
export const PACKAGE_SOURCE_FILE_MAX = 300
export const REVIEW_COMMENT_MAX = 2000
export const REVIEW_RESOLUTION_MAX = 2000
/** Weight keys are short identifiers (kpis, values, okr, development, …). */
export const WEIGHT_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/

const id = (label: string) => z.string().trim().min(1, `${label} is required`).max(64)

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .nullish()
    .transform((value) => (value === undefined ? undefined : value ? value : null))

const versionSchema = z
  .string()
  .trim()
  .min(1, 'Version is required')
  .max(PACKAGE_VERSION_MAX, `Version must be ${PACKAGE_VERSION_MAX} characters or fewer`)

/** PKG-4 performance mix: `{ kpis: 50, values: 20, okr: 15, development: 15 }`. */
export const packageWeightsSchema = z
  .record(z.string(), z.number().finite().min(0, 'Weights cannot be negative').max(100, 'A weight cannot exceed 100'))
  .superRefine((weights, ctx) => {
    const keys = Object.keys(weights)
    if (keys.length > 12) ctx.addIssue({ code: 'custom', message: 'At most 12 weight categories' })
    for (const key of keys) {
      if (!WEIGHT_KEY_PATTERN.test(key)) {
        ctx.addIssue({ code: 'custom', message: `"${key}" is not a valid weight key`, path: [key] })
      }
    }
    const total = Object.values(weights).reduce((sum, v) => sum + v, 0)
    if (keys.length > 0 && Math.abs(total - 100) > 0.01) {
      ctx.addIssue({ code: 'custom', message: `Weights must add up to 100 (currently ${Math.round(total * 100) / 100})` })
    }
  })

const summaryLinesSchema = z
  .array(z.string().trim().max(PACKAGE_SUMMARY_LINE_MAX, `Each line must be ${PACKAGE_SUMMARY_LINE_MAX} characters or fewer`))
  .max(PACKAGE_SUMMARY_LINES_MAX, `At most ${PACKAGE_SUMMARY_LINES_MAX} lines`)
  .transform((lines) => lines.filter((line) => line.length > 0))

export const listPackageQuerySchema = z.object({
  userId: id('userId'),
  timeframeId: id('timeframeId'),
})
export type ListPackageQuery = z.infer<typeof listPackageQuerySchema>

export const createPackageSchema = z.object({
  userId: id('userId'),
  timeframeId: id('timeframeId'),
  version: versionSchema.optional(),
  seatTitle: optionalText(PACKAGE_SEAT_TITLE_MAX, 'Seat title'),
  summaryLines: summaryLinesSchema.optional(),
  weights: packageWeightsSchema.nullish(),
  sourceFile: optionalText(PACKAGE_SOURCE_FILE_MAX, 'Source file'),
})
export type CreatePackageInput = z.infer<typeof createPackageSchema>

export const updatePackageSchema = z
  .object({
    version: versionSchema.optional(),
    seatTitle: optionalText(PACKAGE_SEAT_TITLE_MAX, 'Seat title'),
    summaryLines: summaryLinesSchema.optional(),
    weights: packageWeightsSchema.nullish(),
    sourceFile: optionalText(PACKAGE_SOURCE_FILE_MAX, 'Source file'),
    /** Manual lifecycle moves: archive, or reopen to DRAFT. Submit / approve have their own routes. */
    status: z.enum(['DRAFT', 'ARCHIVED']).optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), { message: 'Nothing to update' })
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>

export const upsertReviewSchema = z
  .object({
    entityType: z.enum(PACKAGE_REVIEW_ENTITY_TYPES),
    entityId: id('entityId'),
    verdict: z.enum(REVIEW_VERDICTS),
    comment: optionalText(REVIEW_COMMENT_MAX, 'Comment'),
  })
  .superRefine((body, ctx) => {
    if (body.verdict === 'DISPUTE' && !body.comment) {
      ctx.addIssue({ code: 'custom', message: 'A comment is required when you dispute an item', path: ['comment'] })
    }
  })
export type UpsertReviewInput = z.infer<typeof upsertReviewSchema>

export const resolveReviewSchema = z.object({
  resolution: z
    .string()
    .trim()
    .min(1, 'Describe how the dispute was resolved')
    .max(REVIEW_RESOLUTION_MAX, `Resolution must be ${REVIEW_RESOLUTION_MAX} characters or fewer`),
})
export type ResolveReviewInput = z.infer<typeof resolveReviewSchema>

/** Dispute popover form (PKG-2: a comment is mandatory). */
export const disputeFormSchema = z.object({
  comment: z
    .string()
    .trim()
    .min(1, 'A comment is required when you dispute an item')
    .max(REVIEW_COMMENT_MAX, `Comment must be ${REVIEW_COMMENT_MAX} characters or fewer`),
})
export type DisputeFormValues = z.infer<typeof disputeFormSchema>

/** Form shape for the header edit modal (weights as strings so inputs can be blank). */
export const packageEditFormSchema = z
  .object({
    version: versionSchema,
    seatTitle: z.string().trim().max(PACKAGE_SEAT_TITLE_MAX, `Seat title must be ${PACKAGE_SEAT_TITLE_MAX} characters or fewer`),
    summaryText: z.string().max(PACKAGE_SUMMARY_LINE_MAX * PACKAGE_SUMMARY_LINES_MAX),
    kpis: z.string(),
    values: z.string(),
    okr: z.string(),
    development: z.string(),
  })
  .superRefine((form, ctx) => {
    const raw = [form.kpis, form.values, form.okr, form.development]
    const filled = raw.filter((v) => v.trim() !== '')
    if (filled.length === 0) return
    let total = 0
    for (const key of ['kpis', 'values', 'okr', 'development'] as const) {
      const value = form[key].trim()
      if (value === '') continue
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        ctx.addIssue({ code: 'custom', message: 'Enter a number from 0 to 100', path: [key] })
        return
      }
      total += n
    }
    if (Math.abs(total - 100) > 0.01) {
      ctx.addIssue({ code: 'custom', message: `Weights must add up to 100 (currently ${Math.round(total * 100) / 100})`, path: ['kpis'] })
    }
  })
export type PackageEditFormValues = z.infer<typeof packageEditFormSchema>

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request'
}
