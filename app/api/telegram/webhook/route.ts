/**
 * Telegram webhook endpoint.
 *
 * Auth: this route is called by Telegram, not by an authenticated user.
 * Telegram is configured (via setWebhook) to send a fixed
 * `X-Telegram-Bot-Api-Secret-Token` header. We reject any request that does
 * not match TELEGRAM_WEBHOOK_SECRET.
 *
 * Behavior:
 *  - Persists the chat (upsert) and the message (every inbound update,
 *    per Stage 1 scrape mode = ALL).
 *  - If text starts with /ask, calls Claude and replies in the same chat.
 *  - Always returns 200 quickly so Telegram does not retry; errors are
 *    logged but not surfaced to the caller.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  parseCommand,
  sendMessage,
  stripCommand,
  type TelegramMessage,
  type TelegramUpdate,
} from '@/lib/telegram/client'
import { answerAskCommand } from '@/lib/ai/telegram-chat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) {
    console.error('[telegram] TELEGRAM_WEBHOOK_SECRET not set; refusing webhook')
    return NextResponse.json({ ok: true }) // pretend success so Telegram stops retrying
  }
  const got = req.headers.get('x-telegram-bot-api-secret-token')
  if (got !== expected) {
    console.warn('[telegram] webhook secret mismatch')
    return NextResponse.json({ ok: true })
  }

  let update: TelegramUpdate
  try {
    update = (await req.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  const msg = update.message ?? update.channel_post ?? update.edited_message ?? update.edited_channel_post
  if (!msg) return NextResponse.json({ ok: true })

  // Fire-and-handle in try/catch so a single bad message can't 500 the webhook.
  try {
    await handleMessage(msg, update)
  } catch (err) {
    console.error('[telegram] handler error', err)
  }

  return NextResponse.json({ ok: true })
}

async function handleMessage(msg: TelegramMessage, update: TelegramUpdate) {
  const chatId = BigInt(msg.chat.id)
  const text = msg.text ?? msg.caption ?? ''
  const cmd = parseCommand(text)

  // Upsert chat record.
  await prisma.telegramChat.upsert({
    where: { chatId },
    create: {
      chatId,
      type: msg.chat.type,
      title: msg.chat.title ?? null,
      username: msg.chat.username ?? null,
    },
    update: {
      type: msg.chat.type,
      title: msg.chat.title ?? null,
      username: msg.chat.username ?? null,
    },
  })

  // Persist the message (skip duplicates from Telegram retries).
  await prisma.telegramMessage
    .create({
      data: {
        chatId,
        messageId: BigInt(msg.message_id),
        fromUserId: msg.from?.id ? BigInt(msg.from.id) : null,
        fromUsername: msg.from?.username ?? null,
        fromName: msg.from
          ? [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ')
          : null,
        text: text || null,
        replyToId: msg.reply_to_message?.message_id
          ? BigInt(msg.reply_to_message.message_id)
          : null,
        isCommand: cmd !== null,
        command: cmd,
        rawJson: JSON.stringify(update),
        sentAt: new Date(msg.date * 1000),
      },
    })
    .catch((err: unknown) => {
      // Unique-constraint violation = already logged. Anything else, surface.
      const code = (err as { code?: string }).code
      if (code !== 'P2002') throw err
    })

  // Command dispatch.
  if (cmd === '/ask') {
    const question = stripCommand(text)
    if (!question) {
      await sendMessage({
        chatId: msg.chat.id,
        text: 'Usage: /ask <your question>',
        replyToMessageId: msg.message_id,
      })
      return
    }

    const askerName = msg.from
      ? [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || msg.from.username
      : undefined

    const { text: answer } = await answerAskCommand(question, { askerName })
    await sendMessage({
      chatId: msg.chat.id,
      text: answer,
      replyToMessageId: msg.message_id,
    })
  } else if (cmd === '/start' || cmd === '/help') {
    await sendMessage({
      chatId: msg.chat.id,
      text:
        'Hi — I am the 360ground OKR assistant.\n' +
        'Commands:\n' +
        '/ask <question> — ask me anything\n' +
        '/help — show this message\n\n' +
        'I log messages in this chat for company-internal use.',
      replyToMessageId: msg.message_id,
    })
  }
}
