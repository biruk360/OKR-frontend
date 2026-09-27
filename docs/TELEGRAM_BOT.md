# Telegram Bot Integration

Status: **Stage 1 implemented** (foundation). Stages 2 and 3 are planned.

## What Stage 1 ships

A Telegram bot, hosted inside this Next.js app, that:

1. Receives every message in groups/channels it has been added to (passive scraping mode = `ALL`).
2. Persists chats and messages to Postgres via the new `TelegramChat` / `TelegramMessage` Prisma models.
3. Answers `/ask <question>` in-chat using the configured AI provider — **OpenAI by default** (`gpt-5.5`), or Anthropic (`claude-sonnet-4-6`) when `TELEGRAM_AI_PROVIDER=anthropic`. No live data access yet. `/ask` only runs in allowlisted chats and is rate limited (see *Access control*).
4. Lets an ADMIN/EXECUTIVE register the webhook with Telegram from `/api/telegram/admin/setup`.

What Stage 1 deliberately does **not** do (deferred):

- Odoo CRM integration (deadlines, bids, milestones).
- Scheduled morning digests.
- Tool use (the model writing back into Odoo / OKR DB).
- Admin UI page for managing bot config.

## Files added

| Path | Purpose |
|------|---------|
| `prisma/schema.prisma` | New models: `TelegramChat`, `TelegramMessage`, `TelegramBotConfig` |
| `lib/telegram/client.ts` | Thin Telegram Bot API wrapper (sendMessage, setWebhook, getMe, parseCommand) |
| `lib/ai/telegram-chat.ts` | Provider-agnostic answerer for `/ask` (OpenAI default, Anthropic optional). Stateless single-turn; the Anthropic path prompt-caches the system prompt. |
| `lib/telegram/access.ts` | Timing-safe webhook-secret check, `/ask` chat allowlist, in-memory rate limits. |
| `app/api/telegram/webhook/route.ts` | Public Telegram webhook. Auth via `X-Telegram-Bot-Api-Secret-Token`. |
| `app/api/telegram/admin/setup/route.ts` | Admin-only GET/POST/DELETE to inspect/register/clear the webhook. |
| `env.example` | New: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_PUBLIC_URL` (optional), `TELEGRAM_ALLOWED_CHAT_IDS` |

## One-time setup checklist

### 1. Create the bot with BotFather

1. In Telegram, open `@BotFather` → `/newbot` → pick name + username (must end in `bot`).
2. Save the token it returns as `TELEGRAM_BOT_TOKEN`.
3. `/setprivacy` → pick your bot → **Disable**. Without this, the bot only sees commands in groups, not regular messages — scraping mode `ALL` requires it.
4. `/setjoingroups` → **Enable**.

### 2. Set environment variables

In production (`.env` on the VPS):

```
TELEGRAM_BOT_TOKEN="1234567890:AAH..."
TELEGRAM_WEBHOOK_SECRET="<long random string, 32+ chars>"
# Chats where /ask may answer (comma-separated; group ids are negative).
# Unset/empty = /ask disabled everywhere (messages are still logged).
TELEGRAM_ALLOWED_CHAT_IDS="-1001234567890,-1009876543210"
# AI provider for /ask — OpenAI is the default:
OPENAI_API_KEY="sk-..."
# Only if TELEGRAM_AI_PROVIDER=anthropic:
# ANTHROPIC_API_KEY="sk-ant-..."
# Optional; falls back to NEXTAUTH_URL
TELEGRAM_PUBLIC_URL="https://okr.360ground.com"
```

`TELEGRAM_WEBHOOK_SECRET` is what Telegram sends back as `X-Telegram-Bot-Api-Secret-Token` on every webhook request. It is the **only** thing that authenticates Telegram → our app, so make it long and don't commit it.

### 3. Push the schema

```
npm run db:push
```

This creates `telegram_chats`, `telegram_messages`, `telegram_bot_config`.

### 4. Register the webhook

After deploying, an ADMIN or EXECUTIVE user can hit:

```
POST https://okr.360ground.com/api/telegram/admin/setup
```

(authenticated via the normal NextAuth session cookie). Response includes the registered URL and bot username.

To check status: `GET /api/telegram/admin/setup`. To clear: `DELETE`.

### 5. Test

1. Add the bot to a test group, promote to admin (required for channels; optional for groups but recommended).
2. In the group: `/help` → bot replies with usage.
3. `/ask what time is it in Addis Ababa right now?` → in a chat not yet allowlisted the bot replies with the chat ID to add to `TELEGRAM_ALLOWED_CHAT_IDS`; once added (and the app restarted) it answers via the configured provider.
4. Send a normal message → check `telegram_messages` table; row should appear.

## Architecture notes

- **Webhook auth** is *not* `withAuth` — Telegram has no NextAuth session. We verify the secret-token header instead, in constant time (`webhookSecretMatches` in `lib/telegram/access.ts`). The route always returns 200 to prevent Telegram from retrying on our errors; failures are logged server-side.

## Access control for `/ask`

Every inbound message is still logged, in every chat. Only `/ask` (the part that spends LLM budget) is gated:

1. **Allowlist — fail closed.** The chat id must be in `TELEGRAM_ALLOWED_CHAT_IDS`. With the variable unset or empty, `/ask` answers nowhere. `TelegramChat.isActive = false` or `askEnabled = false` switches a listed chat off; the DB flags can only narrow the list (`askEnabled` defaults to true for any chat the bot joins, so it cannot be the allowlist by itself). A refused chat gets at most one "not enabled — chat ID …" notice per hour.
2. **Rate limits** (in process memory; the app is a single pm2 process): 5 questions per Telegram user per 10 minutes, and 20 per chat per 10 minutes. The first over-limit question in a window gets a "try again in N min" reply; later ones are ignored silently. Limits reset on app restart.
- **BigInt chat/message IDs.** Telegram IDs exceed JS `Number.MAX_SAFE_INTEGER` for some channels. Stored as Prisma `BigInt`, converted to `Number` only when calling the Telegram API (which accepts JSON ints).
- **Idempotency.** `(chatId, messageId)` is a unique index — Telegram retries don't duplicate rows; we swallow `P2002`.
- **Model choice.** `TELEGRAM_AI_PROVIDER` env var picks `openai` (default, gpt-5.5) or `anthropic` (Sonnet 4.6). Override the model with `AI_OPENAI_TELEGRAM_MODEL` or `AI_ANTHROPIC_TELEGRAM_MODEL`. The Anthropic path uses prompt caching on the system prompt.

## What Stage 2 and Stage 3 will add

**Stage 2 — Odoo + scheduled digests**
- `lib/odoo/client.ts` (XML-RPC against Odoo 17)
- Read `crm.lead`, `calendar.event`, `project.milestone`
- New cron under `app/api/cron/telegram-digest` — daily morning post to channels with `digestEnabled = true`

**Stage 3 — Tool use + admin UI**
- Model tools: `search_okr`, `search_odoo_bids`, `create_followup`, `summarize_thread`
- `/admin/telegram` page — list chats, toggle scrape mode, configure digests, browse logs
- Activity logging via existing `ActivityLog` table

## Known limitations

- No outbound (Telegram API) rate-limiting yet. Telegram allows ~30 msg/sec across chats; inbound `/ask` is limited per user and per chat (above), but digest fan-out in Stage 2 will need its own throttle.
- Scraping is "log everything" — privacy notice should go in group descriptions before deploying widely.
- No conversation memory across `/ask` calls. Each question is answered standalone. Add this in Stage 3 if needed.
