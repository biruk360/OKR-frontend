/**
 * Claude-backed answerer for the Telegram /ask command.
 * Stage 1: stateless single-turn Q&A. Stage 3 will add tool use (Odoo, OKR DB).
 */
import Anthropic from '@anthropic-ai/sdk'

const MODEL = process.env.AI_ANTHROPIC_TELEGRAM_MODEL || 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are an assistant embedded in a 360ground company Telegram group, responding to /ask queries.

Style:
- Be concise. Telegram messages are read on phones; aim for under 6 sentences unless the question demands more.
- Plain text only. Do not use Markdown formatting (no **bold**, no \`code\` fences) — Telegram parse_mode is off.
- If you don't know something, say so plainly. Do not invent facts about the company, OKRs, bids, or people.
- If the question is ambiguous, ask one clarifying question instead of guessing.

You currently have NO live access to OKR or Odoo data. If asked about specific bids, deadlines, OKRs, or internal records, say that connection is not yet wired up and the user should check the source system directly.`

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (client) return client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  client = new Anthropic({ apiKey })
  return client
}

export interface AskResult {
  text: string
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number }
}

export async function answerAskCommand(question: string, opts?: { askerName?: string }): Promise<AskResult> {
  const c = getClient()
  const userMsg = opts?.askerName
    ? `[Asked by ${opts.askerName}] ${question}`
    : question

  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMsg }],
  })

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()

  return {
    text: text || '(no response)',
    usage: {
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      cachedTokens:
        (resp.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
    },
  }
}
