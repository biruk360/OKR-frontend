/**
 * Decisions (DEC) zod schemas, shared by the API routes and the forms. Pure and
 * client-safe.
 */
import { z } from 'zod'
import { DECISION_LINK_ENTITY_TYPES, DECISION_STATUSES } from '@/types/package'

export const DECISION_TITLE_MAX = 500
export const DECISION_TEXT_MAX = 10_000
export const DECISION_LONG_TEXT_MAX = 10_000
export const DECISION_BATCH_MAX = 80
export const DECISION_REF_MAX = 40
export const DECISION_REQUESTED_BY_TEXT_MAX = 200
export const DECISION_LINKS_MAX = 50
export const DECISION_LIST_LIMIT_MAX = 500

const trimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`)

/** Optional text: `undefined` = not sent, '' / null = clear. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .nullish()
    .transform((value) => (value === undefined ? undefined : value ? value : null))

const idOrNull = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((value) => (value === undefined ? undefined : value ? value : null))

/** ISO date or YYYY-MM-DD (stored as UTC midnight); '' / null → null. */
export const optionalDateInput = (label: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined
      if (value === null || value.trim() === '') return null
      const raw = value.trim()
      const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw)
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: 'custom', message: `${label} is not a valid date` })
        return z.NEVER
      }
      return date
    })

export const decisionLinkInputSchema = z.object({
  entityType: z.enum(DECISION_LINK_ENTITY_TYPES),
  entityId: z.string().trim().min(1, 'entityId is required'),
})
export type DecisionLinkInput = z.infer<typeof decisionLinkInputSchema>

const linksSchema = z
  .array(decisionLinkInputSchema)
  .max(DECISION_LINKS_MAX, `At most ${DECISION_LINKS_MAX} links`)
  .transform((links) => {
    const seen = new Set<string>()
    return links.filter((link) => {
      const key = `${link.entityType}:${link.entityId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })

export const createDecisionSchema = z.object({
  title: trimmed(DECISION_TITLE_MAX, 'Title'),
  /** Defaults to the active timeframe. */
  timeframeId: idOrNull,
  externalRef: optionalText(DECISION_REF_MAX, 'Reference'),
  /** Defaults to the viewer. Requesting on someone else's behalf needs edit access to their decisions. */
  requestedById: idOrNull,
  requestedByText: optionalText(DECISION_REQUESTED_BY_TEXT_MAX, 'Requested by'),
  /** Defaults to the company CEO (OrganizationSettings.companyCeoUserId). */
  deciderId: idOrNull,
  neededBy: optionalDateInput('Needed by'),
  batch: optionalText(DECISION_BATCH_MAX, 'Batch'),
  optionsText: optionalText(DECISION_LONG_TEXT_MAX, 'Options'),
  unblocksText: optionalText(DECISION_LONG_TEXT_MAX, 'Unblocks'),
  links: linksSchema.default([]),
})
export type CreateDecisionInput = z.infer<typeof createDecisionSchema>

/**
 * PATCH: every field optional. `links` (when present) replaces the whole set.
 * `status` moves between OPEN, DEFERRED and WITHDRAWN (DECIDED only through
 * POST …/decide). `decisionText` corrects a recorded decision (decider only).
 */
export const updateDecisionSchema = z
  .object({
    title: trimmed(DECISION_TITLE_MAX, 'Title').optional(),
    externalRef: optionalText(DECISION_REF_MAX, 'Reference'),
    requestedByText: optionalText(DECISION_REQUESTED_BY_TEXT_MAX, 'Requested by'),
    deciderId: z.string().trim().min(1, 'Decider is required').optional(),
    neededBy: optionalDateInput('Needed by'),
    batch: optionalText(DECISION_BATCH_MAX, 'Batch'),
    optionsText: optionalText(DECISION_LONG_TEXT_MAX, 'Options'),
    unblocksText: optionalText(DECISION_LONG_TEXT_MAX, 'Unblocks'),
    status: z.enum(DECISION_STATUSES).optional(),
    decisionText: z
      .string()
      .trim()
      .min(1, 'Decision text cannot be empty')
      .max(DECISION_TEXT_MAX, `Decision must be ${DECISION_TEXT_MAX} characters or fewer`)
      .optional(),
    links: linksSchema.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), { message: 'Nothing to update' })
export type UpdateDecisionInput = z.infer<typeof updateDecisionSchema>

/** DEC-2: recording a decision requires the decision text. */
export const decideDecisionSchema = z.object({
  decisionText: trimmed(DECISION_TEXT_MAX, 'Decision'),
  /** Defaults to now. Lets the importer / decider back-date a decision taken in a meeting. */
  decidedAt: optionalDateInput('Decided on'),
  /** Close linked WorkDependency rows of type DECISION (default true, DEC-2). */
  closeDependencies: z.boolean().optional().default(true),
})
export type DecideDecisionInput = z.infer<typeof decideDecisionSchema>

const queryText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? value : undefined))

const statusFilter = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value, ctx) => {
    if (!value || value === 'all') return undefined
    const statuses = value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    for (const status of statuses) {
      if (!(DECISION_STATUSES as readonly string[]).includes(status)) {
        ctx.addIssue({ code: 'custom', message: `Unknown status "${status}"` })
        return z.NEVER
      }
    }
    return statuses as Array<(typeof DECISION_STATUSES)[number]>
  })

const boolFlag = z
  .string()
  .optional()
  .nullable()
  .transform((value) => value === '1' || value === 'true')

/**
 * GET /api/decisions query.
 *   status            comma list or 'all' (default all)
 *   deciderId         'me' resolves to the viewer
 *   affectingUserId   DEC-3: linked to the person, to their items, or requested by them
 *   batch             exact batch label; '__none__' for decisions without a batch
 *   timeframeId       'all' (or omitted) for every timeframe
 *   openAnyTimeframe  with timeframeId: also include OPEN decisions from other timeframes
 *   q                 title / ref / batch contains
 */
export const listDecisionsQuerySchema = z.object({
  status: statusFilter,
  deciderId: queryText,
  affectingUserId: queryText,
  requestedById: queryText,
  batch: queryText,
  timeframeId: queryText.transform((value) => (value === 'all' ? undefined : value)),
  openAnyTimeframe: boolFlag,
  q: queryText,
  limit: z
    .string()
    .optional()
    .nullable()
    .transform((value, ctx) => {
      if (!value) return undefined
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1 || n > DECISION_LIST_LIMIT_MAX) {
        ctx.addIssue({ code: 'custom', message: `limit must be 1–${DECISION_LIST_LIMIT_MAX}` })
        return z.NEVER
      }
      return n
    }),
})
export type ListDecisionsQuery = z.infer<typeof listDecisionsQuerySchema>

/** Batch value that selects decisions without a batch. */
export const NO_BATCH_FILTER = '__none__'

/** First zod issue as a readable message. */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid input'
  const path = issue.path.filter((p) => typeof p === 'string' || typeof p === 'number').join('.')
  return path && issue.code !== 'custom' ? `${path}: ${issue.message}` : issue.message
}
