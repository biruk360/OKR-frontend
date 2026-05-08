/**
 * Provider-agnostic answerer for the Telegram /ask command.
 * Stage 1: stateless single-turn Q&A. Stage 3 will add tool use (Odoo, OKR DB).
 *
 * Provider is chosen by TELEGRAM_AI_PROVIDER env var ("openai" | "anthropic").
 * Defaults to "openai" with gpt-5.5.
 */
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

type Provider = 'openai' | 'anthropic'

function selectedProvider(): Provider {
  const raw = (process.env.TELEGRAM_AI_PROVIDER || 'openai').toLowerCase()
  if (raw === 'anthropic') return 'anthropic'
  return 'openai'
}

const ANTHROPIC_MODEL = process.env.AI_ANTHROPIC_TELEGRAM_MODEL || 'claude-sonnet-4-6'
const OPENAI_MODEL = process.env.AI_OPENAI_TELEGRAM_MODEL || 'gpt-5.5'

const SYSTEM_PROMPT = `You are an assistant embedded in a 360ground company Telegram group, responding to /ask queries.

Style:
- Be concise. Telegram messages are read on phones; aim for under 6 sentences unless the question demands more.
- Plain text only. Do not use Markdown formatting (no **bold**, no \`code\` fences) — Telegram parse_mode is off.
- If you don't know something, say so plainly. Do not invent facts about the company, OKRs, bids, or people.
- If the question is ambiguous, ask one clarifying question instead of guessing.

You currently have NO live access to OKR or Odoo data. If asked about specific bids, deadlines, OKRs, or internal records, say that connection is not yet wired up and the user should check the source system directly.`

export interface AskResult {
  text: string
  provider: Provider
  model: string
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number }
}

let anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (anthropic) return anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  anthropic = new Anthropic({ apiKey })
  return anthropic
}

let openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (openai) return openai
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
  openai = new OpenAI({ apiKey })
  return openai
}

export async function answerAskCommand(question: string, opts?: { askerName?: string }): Promise<AskResult> {
  const provider = selectedProvider()
  const userMsg = opts?.askerName ? `[Asked by ${opts.askerName}] ${question}` : question

  if (provider === 'anthropic') {
    return runAnthropic(userMsg)
  }
  return runOpenAI(userMsg)
}

async function runAnthropic(userMsg: string): Promise<AskResult> {
  const c = getAnthropic()
  const resp = await c.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 512,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMsg }],
  })
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
  return {
    text: text || '(no response)',
    provider: 'anthropic',
    model: ANTHROPIC_MODEL,
    usage: {
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      cachedTokens:
        (resp.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
    },
  }
}

async function runOpenAI(userMsg: string): Promise<AskResult> {
  const c = getOpenAI()
  const resp = await c.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: 512,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
  })
  const text = resp.choices[0]?.message?.content?.trim() ?? ''
  return {
    text: text || '(no response)',
    provider: 'openai',
    model: OPENAI_MODEL,
    usage: {
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
      cachedTokens: resp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  }
}
