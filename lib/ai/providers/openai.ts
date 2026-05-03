/**
 * OpenAI provider for AI sprint planning.
 *
 * Routes between two endpoints based on model id:
 *   - chat.completions.create (default) — for gpt-4.1/gpt-5/gpt-5.5/etc. with
 *     structured outputs (response_format: json_schema, strict=true).
 *   - responses.create — for reasoning / "thinking" models (gpt-5.5-pro,
 *     o1*, o3*, o4*) which aren't available on chat.completions. Uses
 *     `text.format: { type: 'json_schema' }` and reasoning_effort='medium' as
 *     a balanced default.
 *
 * The result is Zod-validated through SprintPlanZ as defense in depth.
 *
 * Token usage:
 *   - inputTokens  ← usage.prompt_tokens (chat) | usage.input_tokens (responses)
 *   - outputTokens ← usage.completion_tokens   | usage.output_tokens
 *   - cachedTokens ← prompt_tokens_details.cached_tokens | input_tokens_details.cached_tokens
 */

import OpenAI from 'openai'
import { buildPrompt } from '../prompt'
import { SprintPlanZ, SPRINT_PLAN_JSON_SCHEMA } from '../sprint-plan-schema'
import type {
  AiProvider,
  GenerateSprintPlanInput,
  GenerateSprintPlanOptions,
  AiUsage,
  SprintPlanToolPayload,
} from './types'
import { ProviderCallError } from './types'

/** Reasoning models live on the Responses API. Detect by id pattern. */
function isReasoningModel(modelId: string): boolean {
  if (modelId.endsWith('-pro')) return true
  if (modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4')) return true
  return false
}

export class OpenAIProvider implements AiProvider {
  readonly id = 'openai' as const
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey })
  }

  async generateSprintPlan(
    input: GenerateSprintPlanInput,
    options: GenerateSprintPlanOptions
  ): Promise<{ plan: SprintPlanToolPayload; usage: AiUsage; raw: unknown }> {
    const { system, user } = buildPrompt(input)
    return isReasoningModel(options.modelId)
      ? this.callResponsesApi({ system, user, options })
      : this.callChatCompletions({ system, user, options })
  }

  private async callChatCompletions(args: {
    system: string
    user: string
    options: GenerateSprintPlanOptions
  }) {
    const { system, user, options } = args
    let resp: OpenAI.Chat.Completions.ChatCompletion
    try {
      resp = await this.client.chat.completions.create(
        {
          model: options.modelId,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_schema', json_schema: SPRINT_PLAN_JSON_SCHEMA },
          max_completion_tokens: options.maxOutputTokens,
        },
        { signal: options.signal }
      )
    } catch (err) {
      throw new ProviderCallError('openai', options.modelId, err)
    }

    const content = resp.choices[0]?.message?.content ?? undefined
    return finalize({
      content,
      modelId: options.modelId,
      raw: resp,
      usage: {
        inputTokens: resp.usage?.prompt_tokens ?? 0,
        outputTokens: resp.usage?.completion_tokens ?? 0,
        cachedTokens:
          (resp.usage as { prompt_tokens_details?: { cached_tokens?: number } } | undefined)
            ?.prompt_tokens_details?.cached_tokens ?? 0,
      },
    })
  }

  private async callResponsesApi(args: {
    system: string
    user: string
    options: GenerateSprintPlanOptions
  }) {
    const { system, user, options } = args
    // The Responses API ships in the openai SDK at `client.responses`.
    // Reasoning models accept a single text input combining system + user.
    let resp: unknown
    try {
      resp = await (
        this.client as unknown as {
          responses: {
            create: (req: Record<string, unknown>, opts?: { signal?: AbortSignal }) => Promise<unknown>
          }
        }
      ).responses.create(
        {
          model: options.modelId,
          input: [
            { role: 'system', content: [{ type: 'input_text', text: system }] },
            { role: 'user', content: [{ type: 'input_text', text: user }] },
          ],
          text: {
            format: {
              type: 'json_schema',
              ...SPRINT_PLAN_JSON_SCHEMA,
            },
          },
          reasoning: { effort: 'medium' },
          max_output_tokens: options.maxOutputTokens,
        },
        { signal: options.signal }
      )
    } catch (err) {
      throw new ProviderCallError('openai', options.modelId, err)
    }

    const r = resp as {
      output_text?: string
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>
      usage?: {
        input_tokens?: number
        output_tokens?: number
        input_tokens_details?: { cached_tokens?: number }
      }
    }

    // Prefer output_text helper; fallback to walking output[].content[].text.
    let content = r.output_text
    if (!content && Array.isArray(r.output)) {
      for (const item of r.output) {
        for (const c of item.content ?? []) {
          if (c.type === 'output_text' && typeof c.text === 'string') {
            content = (content ?? '') + c.text
          }
        }
      }
    }

    return finalize({
      content,
      modelId: options.modelId,
      raw: resp,
      usage: {
        inputTokens: r.usage?.input_tokens ?? 0,
        outputTokens: r.usage?.output_tokens ?? 0,
        cachedTokens: r.usage?.input_tokens_details?.cached_tokens ?? 0,
      },
    })
  }
}

function finalize(args: {
  content: string | undefined
  modelId: string
  raw: unknown
  usage: AiUsage
}): { plan: SprintPlanToolPayload; usage: AiUsage; raw: unknown } {
  const { content, modelId, raw, usage } = args
  if (!content) {
    throw new ProviderCallError('openai', modelId, null, 'OpenAI returned an empty response')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    throw new ProviderCallError(
      'openai',
      modelId,
      err,
      `OpenAI returned non-JSON content: ${content.slice(0, 200)}`
    )
  }
  const validated = SprintPlanZ.safeParse(parsed)
  if (!validated.success) {
    throw new ProviderCallError(
      'openai',
      modelId,
      validated.error,
      `OpenAI response failed schema validation: ${validated.error.message}`
    )
  }
  return { plan: validated.data, usage, raw }
}
