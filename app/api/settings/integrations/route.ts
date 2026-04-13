import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessSettings } from '@/lib/permissions'
import { apiSuccess, apiForbidden, withAuth } from '@/lib/api'

export const GET = withAuth(async (_request, { session }) => {
  if (!canAccessSettings(session.user.role as any)) {
    return apiForbidden('Insufficient permissions')
  }

  const [emailApiKey, slackWebhookUrl, slackApiKey] = await Promise.all([
    prisma.systemSettings.findUnique({ where: { key: 'integration_emailApiKey' } }),
    prisma.systemSettings.findUnique({ where: { key: 'integration_slackWebhookUrl' } }),
    prisma.systemSettings.findUnique({ where: { key: 'integration_slackApiKey' } }),
  ])

  return apiSuccess({
    emailApiKey: emailApiKey?.value || '',
    slackWebhookUrl: slackWebhookUrl?.value || '',
    slackApiKey: slackApiKey?.value || '',
  })
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  if (!canAccessSettings(session.user.role as any)) {
    return apiForbidden('Insufficient permissions')
  }

  const body = await request.json()
  const { emailApiKey, slackWebhookUrl, slackApiKey } = body

  await Promise.all(
    [
      emailApiKey &&
        prisma.systemSettings.upsert({
          where: { key: 'integration_emailApiKey' },
          update: { value: emailApiKey },
          create: { key: 'integration_emailApiKey', value: emailApiKey },
        }),
      slackWebhookUrl &&
        prisma.systemSettings.upsert({
          where: { key: 'integration_slackWebhookUrl' },
          update: { value: slackWebhookUrl },
          create: { key: 'integration_slackWebhookUrl', value: slackWebhookUrl },
        }),
      slackApiKey &&
        prisma.systemSettings.upsert({
          where: { key: 'integration_slackApiKey' },
          update: { value: slackApiKey },
          create: { key: 'integration_slackApiKey', value: slackApiKey },
        }),
    ].filter(Boolean)
  )

  return apiSuccess(null, { message: 'Integration settings updated successfully' })
})
