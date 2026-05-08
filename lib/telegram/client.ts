/**
 * Telegram Bot API client. Server-side only.
 * Docs: https://core.telegram.org/bots/api
 */

const TG_API = 'https://api.telegram.org'

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set')
  return t
}

async function call<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TG_API}/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number }
  if (!json.ok) {
    throw new Error(`Telegram ${method} failed (${json.error_code}): ${json.description}`)
  }
  return json.result as T
}

export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  sender_chat?: TelegramChat
  chat: TelegramChat
  date: number
  text?: string
  caption?: string
  reply_to_message?: { message_id: number }
  entities?: Array<{ type: string; offset: number; length: number }>
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  channel_post?: TelegramMessage
  edited_channel_post?: TelegramMessage
}

export function sendMessage(params: {
  chatId: number | bigint
  text: string
  replyToMessageId?: number | bigint
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
}) {
  return call('sendMessage', {
    chat_id: typeof params.chatId === 'bigint' ? Number(params.chatId) : params.chatId,
    text: params.text,
    reply_to_message_id:
      params.replyToMessageId !== undefined
        ? Number(params.replyToMessageId)
        : undefined,
    parse_mode: params.parseMode,
    disable_web_page_preview: true,
  })
}

export function setWebhook(params: { url: string; secretToken: string }) {
  return call('setWebhook', {
    url: params.url,
    secret_token: params.secretToken,
    allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
    drop_pending_updates: false,
  })
}

export function deleteWebhook() {
  return call('deleteWebhook', { drop_pending_updates: false })
}

export function getMe() {
  return call<TelegramUser>('getMe')
}

export function getWebhookInfo() {
  return call<{ url: string; pending_update_count: number; last_error_message?: string }>(
    'getWebhookInfo',
  )
}

/** Extract command name from text (e.g. "/ask@bot what's up" → "/ask"). */
export function parseCommand(text: string | undefined): string | null {
  if (!text) return null
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  const firstWord = trimmed.split(/\s+/)[0]
  return firstWord.split('@')[0].toLowerCase()
}

/** Strip the leading command (and optional @botname) from text. */
export function stripCommand(text: string | undefined): string {
  if (!text) return ''
  return text.trim().replace(/^\/\S+\s*/, '')
}
