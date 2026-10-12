/**
 * Role definition (ROL) zod schemas — shared by the API routes and the editor.
 * Pure and client-safe.
 */
import { z } from 'zod'
import { ROLE_ITEM_SECTIONS } from '@/types/package'

export const ROLE_SEAT_TITLE_MAX = 200
export const ROLE_PURPOSE_MAX = 4000
export const ROLE_REPORTS_TO_TEXT_MAX = 200
export const ROLE_ITEM_LABEL_MAX = 200
export const ROLE_ITEM_TEXT_MAX = 2000
export const ROLE_ITEMS_MAX = 200

const trimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`)

const optionalTrimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .nullish()
    .transform((value) => (value === undefined ? undefined : value ? value : null))

/** ISO date or YYYY-MM-DD; empty → null. */
const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined
    if (value === null || value.trim() === '') return null
    const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Effective date is not a valid date' })
      return z.NEVER
    }
    return date
  })

export const roleDefinitionItemInputSchema = z.object({
  /**
   * Existing item id (PATCH only). Items sent with their id are updated in
   * place, so package reviews (PKG-2, entityType ROLE_ITEM) stay attached;
   * items without one are created; omitted items are deleted.
   */
  id: z.string().trim().min(1).optional(),
  section: z.enum(ROLE_ITEM_SECTIONS),
  label: optionalTrimmed(ROLE_ITEM_LABEL_MAX, 'Label'),
  text: trimmed(ROLE_ITEM_TEXT_MAX, 'Item text'),
})
export type RoleDefinitionItemInput = z.infer<typeof roleDefinitionItemInputSchema>

const itemsSchema = z.array(roleDefinitionItemInputSchema).max(ROLE_ITEMS_MAX, `At most ${ROLE_ITEMS_MAX} items`)

const idOrNull = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((value) => (value === undefined ? undefined : value ? value : null))

export const createRoleDefinitionSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  timeframeId: idOrNull,
  seatTitle: trimmed(ROLE_SEAT_TITLE_MAX, 'Seat title'),
  reportsToId: idOrNull,
  reportsToText: optionalTrimmed(ROLE_REPORTS_TO_TEXT_MAX, 'Reports to'),
  purpose: trimmed(ROLE_PURPOSE_MAX, 'Purpose'),
  effectiveFrom: optionalDate,
  items: itemsSchema.default([]),
})
export type CreateRoleDefinitionInput = z.infer<typeof createRoleDefinitionSchema>

/** PATCH: every field optional; `items` (when present) replaces the whole list. */
export const updateRoleDefinitionSchema = z
  .object({
    seatTitle: trimmed(ROLE_SEAT_TITLE_MAX, 'Seat title').optional(),
    reportsToId: idOrNull,
    reportsToText: optionalTrimmed(ROLE_REPORTS_TO_TEXT_MAX, 'Reports to'),
    purpose: trimmed(ROLE_PURPOSE_MAX, 'Purpose').optional(),
    effectiveFrom: optionalDate,
    items: itemsSchema.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), { message: 'Nothing to update' })
export type UpdateRoleDefinitionInput = z.infer<typeof updateRoleDefinitionSchema>

export const approveRoleDefinitionSchema = z.object({
  /** ROL-2: also set User.designation to the seat title (offered, never forced). */
  updateDesignation: z.boolean().optional().default(false),
})
export type ApproveRoleDefinitionInput = z.infer<typeof approveRoleDefinitionSchema>

export const listRoleDefinitionsQuerySchema = z.object({
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
