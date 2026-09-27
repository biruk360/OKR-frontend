import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiValidationError, withRole } from '@/lib/api'

/**
 * Integration credentials (email API key, Slack webhook, Slack bot token).
 *
 * ADMIN only — these are live server-side secrets. The route used to return
 * them in clear text to ADMIN and EXECUTIVE and let either overwrite them.
 *
 * GET never returns a secret: each value comes back masked (`••••••••` + last
 * four characters) plus a `configured` flag. POST treats an empty field, or a
 * value that is still the masked placeholder, as "leave unchanged", so a form
 * that round-trips what GET returned cannot overwrite a secret with its mask.
 */

const FIELDS = ['emailApiKey', 'slackWebhookUrl', 'slackApiKey'] as const
type Field = (typeof FIELDS)[number]

const KEY_FOR: Record<Field, string> = {
  emailApiKey: 'integration_emailApiKey',
  slackWebhookUrl: 'integration_slackWebhookUrl',
  slackApiKey: 'integration_slackApiKey',
}

/** Prefix of every masked value. A submitted value starting with it is ignored. */
const MASK_PREFIX = '••••••••'

function mask(value: string | null | undefined): string {
  if (!value) return ''
  // Short values reveal nothing beyond "set"; longer ones show the last four.
  return value.length > 12 ? `${MASK_PREFIX}${value.slice(-4)}` : MASK_PREFIX
}

/** Empty / missing / still-masked → undefined (unchanged). */
const secretInput = z.preprocess(
  (value) =>
    typeof value !== 'string' || value.trim() === '' || value.startsWith(MASK_PREFIX)
      ? undefined
      : value.trim(),
  z.string().max(2048).optional(),
)

const saveSchema = z.object({
  emailApiKey: secretInput,
  slackWebhookUrl: z.preprocess(
    (value) =>
      typeof value !== 'string' || value.trim() === '' || value.startsWith(MASK_PREFIX)
        ? undefined
        : value.trim(),
    z
      .string()
      .max(2048)
      .url('Slack webhook must be a URL')
      .refine((v) => v.startsWith('https://'), 'Slack webhook must use https://')
      .optional(),
  ),
  slackApiKey: secretInput,
})

export const GET = withRole('ADMIN', async () => {
  const rows = await prisma.systemSettings.findMany({
    where: { key: { in: FIELDS.map((f) => KEY_FOR[f]) } },
    select: { key: true, value: true },
  })
  const byKey = new Map(rows.map((r) => [r.key, r.value]))

  const data = {} as Record<Field, string> & { configured: Record<Field, boolean> }
  data.configured = {} as Record<Field, boolean>
  for (const field of FIELDS) {
    const value = byKey.get(KEY_FOR[field])
    data[field] = mask(value)
    data.configured[field] = !!value
  }
  return apiSuccess(data)
})

export const POST = withRole('ADMIN', async (request: NextRequest, { session }) => {
  const parsed = saveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return apiValidationError('Invalid integration settings', parsed.error.flatten())
  }

  const changed = FIELDS.filter((field) => parsed.data[field] !== undefined)
  await Promise.all(
    changed.map((field) => {
      const value = parsed.data[field] as string
      return prisma.systemSettings.upsert({
        where: { key: KEY_FOR[field] },
        update: { value },
        create: { key: KEY_FOR[field], value },
      })
    }),
  )

  if (changed.length > 0) {
    // Audit which credentials changed and by whom — never the values.
    console.info('[settings/integrations] credentials updated', {
      actorId: session.user.id,
      fields: changed,
    })
  }

  return apiSuccess({ updated: changed }, { message: 'Integration settings updated successfully' })
})
