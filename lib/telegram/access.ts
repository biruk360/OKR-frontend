/**
 * Access control for the Telegram bot: webhook-secret check, the `/ask` chat
 * allowlist, and in-memory rate limiting. Server-side only.
 *
 * Why this exists: the webhook compared its secret with `!==` (timing leak),
 * and `/ask` answered in any chat the bot was added to — anyone who could add
 * the bot to a group could spend the company's LLM budget without limit.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

// ── Webhook secret ──────────────────────────────────────────────────────────

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/**
 * Constant-time comparison of the `X-Telegram-Bot-Api-Secret-Token` header
 * against TELEGRAM_WEBHOOK_SECRET. Both sides are hashed first so neither the
 * content nor the length leaks through timing. A missing value never matches.
 */
export function webhookSecretMatches(presented: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected || !presented) return false
  return timingSafeEqual(digest(presented), digest(expected))
}

// ── Chat allowlist ──────────────────────────────────────────────────────────

/**
 * Parse TELEGRAM_ALLOWED_CHAT_IDS: a comma/whitespace separated list of chat
 * ids (group ids are negative, e.g. `-1001234567890`). Anything that is not an
 * integer is ignored. Ids are kept as strings so values beyond 2^53 survive.
 */
export function parseAllowedChatIds(raw: string | null | undefined): Set<string> {
  const out = new Set<string>()
  if (!raw) return out
  for (const part of raw.split(/[\s,]+/)) {
    const id = part.trim()
    if (/^-?\d+$/.test(id)) out.add(BigInt(id).toString())
  }
  return out
}

export interface AskGateChat {
  chatId: bigint | number | string
  /** TelegramChat.isActive — an admin can switch a chat off entirely. */
  isActive?: boolean | null
  /** TelegramChat.askEnabled — an admin can switch /ask off per chat. */
  askEnabled?: boolean | null
}

/**
 * Whether `/ask` may run in this chat. Fail closed: with no allowlist
 * configured, `/ask` is disabled everywhere. The per-chat DB flags can only
 * narrow the allowlist, never widen it (`askEnabled` defaults to true for every
 * chat the bot is added to, so it cannot be the allowlist on its own).
 */
export function isAskAllowed(chat: AskGateChat, allowed: Set<string>): boolean {
  if (allowed.size === 0) return false
  if (chat.isActive === false || chat.askEnabled === false) return false
  return allowed.has(BigInt(chat.chatId).toString())
}

export function allowedChatIdsFromEnv(): Set<string> {
  return parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS)
}

// ── Rate limiting ───────────────────────────────────────────────────────────

export interface RateLimitDecision {
  allowed: boolean
  /** Milliseconds until the oldest hit in the window expires (0 when allowed). */
  retryAfterMs: number
  /** True only for the first denial in a window — use it to reply once, not per message. */
  firstDenial: boolean
}

/**
 * Sliding-window limiter held in process memory. The app runs as a single pm2
 * process on one VPS, so this is authoritative there; with several processes
 * each would enforce its own window (a looser but still bounded limit).
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, { times: number[]; denied: boolean }>()
  const maxKeys = opts.maxKeys ?? 10_000

  function prune(now: number) {
    for (const [key, entry] of Array.from(hits.entries())) {
      entry.times = entry.times.filter((t) => now - t < opts.windowMs)
      if (entry.times.length === 0) hits.delete(key)
    }
  }

  return {
    check(key: string, now: number = Date.now()): RateLimitDecision {
      if (hits.size > maxKeys) prune(now)
      const entry = hits.get(key) ?? { times: [], denied: false }
      entry.times = entry.times.filter((t) => now - t < opts.windowMs)
      if (entry.times.length === 0) entry.denied = false
      if (entry.times.length >= opts.limit) {
        const firstDenial = !entry.denied
        entry.denied = true
        hits.set(key, entry)
        return { allowed: false, retryAfterMs: opts.windowMs - (now - entry.times[0]), firstDenial }
      }
      entry.times.push(now)
      hits.set(key, entry)
      return { allowed: true, retryAfterMs: 0, firstDenial: false }
    },
    reset() {
      hits.clear()
    },
  }
}

const TEN_MINUTES = 10 * 60_000

/** /ask per chat: 20 questions per 10 minutes across all members. */
export const askChatLimiter = createRateLimiter({ limit: 20, windowMs: TEN_MINUTES })
/** /ask per Telegram user: 5 questions per 10 minutes, across chats. */
export const askUserLimiter = createRateLimiter({ limit: 5, windowMs: TEN_MINUTES })
/** "Not enabled here" notices: at most one per chat per hour, so a stranger's group gets no amplification. */
export const deniedNoticeLimiter = createRateLimiter({ limit: 1, windowMs: 60 * 60_000 })

/**
 * Check both /ask limits. The user limit is consulted first, so a member who
 * is over their own limit is rejected without consuming the chat's budget.
 */
export function checkAskRateLimit(chatId: string, userId: string | null, now: number = Date.now()):
  | { allowed: true }
  | { allowed: false; scope: 'user' | 'chat'; retryAfterMs: number; firstDenial: boolean } {
  if (userId) {
    const user = askUserLimiter.check(`u:${userId}`, now)
    if (!user.allowed) return { allowed: false, scope: 'user', retryAfterMs: user.retryAfterMs, firstDenial: user.firstDenial }
  }
  const chat = askChatLimiter.check(`c:${chatId}`, now)
  if (!chat.allowed) return { allowed: false, scope: 'chat', retryAfterMs: chat.retryAfterMs, firstDenial: chat.firstDenial }
  return { allowed: true }
}
