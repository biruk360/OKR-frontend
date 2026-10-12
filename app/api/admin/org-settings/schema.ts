import { z } from 'zod'

/**
 * PATCH /api/admin/org-settings body.
 *
 * Every field is optional; only the fields sent are written. Unknown keys are
 * dropped. `devMinItems` / `devMinHours` are the development plan yearly rule
 * (DEV-3): at least N certifications or courses done and at least H training
 * hours logged per person per timeframe.
 */
export const DEV_MIN_ITEMS_MAX = 20
export const DEV_MIN_HOURS_MAX = 1000

export const orgSettingsPatchSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(200).optional(),
  companyCeoUserId: z.string().min(1).nullable().optional(),
  allowMatrixReporting: z.boolean().optional(),
  allowMultipleDeptHeads: z.boolean().optional(),
  devMinItems: z
    .number()
    .int('Items must be a whole number')
    .min(0, 'Items cannot be negative')
    .max(DEV_MIN_ITEMS_MAX, `At most ${DEV_MIN_ITEMS_MAX} items`)
    .optional(),
  devMinHours: z
    .number()
    .min(0, 'Hours cannot be negative')
    .max(DEV_MIN_HOURS_MAX, `At most ${DEV_MIN_HOURS_MAX} hours`)
    // Quarter-hour precision is plenty for a training-hours target.
    .refine((v) => Number.isInteger(v * 4), 'Use steps of 0.25 hours')
    .optional(),
})

export type OrgSettingsPatch = z.infer<typeof orgSettingsPatchSchema>

/** Fields whose before/after values are written to the activity log. */
export const ORG_SETTINGS_AUDITED_FIELDS = [
  'companyName',
  'companyCeoUserId',
  'allowMatrixReporting',
  'allowMultipleDeptHeads',
  'devMinItems',
  'devMinHours',
] as const satisfies readonly (keyof OrgSettingsPatch)[]

/** Pure: `{ field: { from, to } }` for every sent field that changed. */
export function diffOrgSettings(
  before: Partial<Record<keyof OrgSettingsPatch, unknown>>,
  patch: OrgSettingsPatch,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const field of ORG_SETTINGS_AUDITED_FIELDS) {
    if (patch[field] === undefined) continue
    const from = before[field] ?? null
    const to = patch[field] ?? null
    if (from !== to) changes[field] = { from, to }
  }
  return changes
}
