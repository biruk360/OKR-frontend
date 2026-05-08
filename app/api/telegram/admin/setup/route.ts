/**
 * Admin endpoint to register / inspect / clear the Telegram webhook with
 * Telegram's API. Hits the bot token from env.
 *
 *   GET    → current webhook info + bot identity
 *   POST   → setWebhook to <TELEGRAM_PUBLIC_URL or NEXTAUTH_URL>/api/telegram/webhook
 *   DELETE → deleteWebhook
 */
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import {
  deleteWebhook,
  getMe,
  getWebhookInfo,
  setWebhook,
} from '@/lib/telegram/client'

export const runtime = 'nodejs'

function publicBase(): string {
  const url = process.env.TELEGRAM_PUBLIC_URL || process.env.NEXTAUTH_URL
  if (!url) throw new Error('TELEGRAM_PUBLIC_URL or NEXTAUTH_URL must be set')
  return url.replace(/\/+$/, '')
}

export const GET = withRole(['ADMIN', 'EXECUTIVE'], async () => {
  const [me, info] = await Promise.all([getMe(), getWebhookInfo()])
  return apiSuccess({
    bot: { id: me.id, username: me.username, name: me.first_name },
    webhook: info,
    expectedUrl: `${publicBase()}/api/telegram/webhook`,
  })
})

export const POST = withRole(['ADMIN', 'EXECUTIVE'], async () => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) throw new Error('TELEGRAM_WEBHOOK_SECRET is not set')
  const url = `${publicBase()}/api/telegram/webhook`

  await setWebhook({ url, secretToken: secret })
  const me = await getMe()

  await prisma.telegramBotConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', botUsername: me.username, webhookUrl: url, webhookSetAt: new Date() },
    update: { botUsername: me.username, webhookUrl: url, webhookSetAt: new Date() },
  })

  return apiSuccess({ url, bot: me.username })
})

export const DELETE = withRole(['ADMIN', 'EXECUTIVE'], async () => {
  await deleteWebhook()
  await prisma.telegramBotConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', webhookUrl: null, webhookSetAt: null },
    update: { webhookUrl: null, webhookSetAt: null },
  })
  return apiSuccess({ cleared: true })
})
