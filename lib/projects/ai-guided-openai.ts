import OpenAI from 'openai'
import { ZodError } from 'zod'
import type { AiUsage } from '@/lib/ai/providers/types'
import { ProviderCallError } from '@/lib/ai/providers/types'

/**
 * Story 3.4 — schema-forced OpenAI call with a single repair round.
 *
 * The response is forced into a strict `json_schema`, then JSON-parsed and run
 * through the caller's server-side validator (Zod + semantic checks). A failure
 * triggers exactly one repair request that returns the validation errors to the
 * model; a second failure throws `AiGuidedOutputInvalidError` so the caller can
 * preserve the draft and offer manual continuation (§12.11, §15).
 */

export const AI_GUIDED_MAX_ATTEMPTS = 2

export interface AiGuidedJsonSchema {
  name: string
  strict: boolean
  schema: Record<string, unknown>
}

export class AiGuidedOutputInvalidError extends Error {
  constructor(readonly usage: AiUsage, readonly attempts: number, readonly validationSummary: string) {
    super('OpenAI output failed schema validation after repair')
    this.name = 'AiGuidedOutputInvalidError'
  }
}

/** Minimal OpenAI surface used here, so tests can inject a fake client. */
export type AiGuidedOpenAiClient = Pick<OpenAI, 'chat'> & Partial<Pick<OpenAI, 'responses'>>

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function isReasoningModel(modelId: string): boolean {
  return modelId.endsWith('-pro')
    || modelId.startsWith('o1')
    || modelId.startsWith('o3')
    || modelId.startsWith('o4')
}

function addUsage(total: AiUsage, next: AiUsage): AiUsage {
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    cachedTokens: (total.cachedTokens ?? 0) + (next.cachedTokens ?? 0),
  }
}

async function callOnce(input: {
  client: AiGuidedOpenAiClient
  modelId: string
  messages: ChatMessage[]
  jsonSchema: AiGuidedJsonSchema
  maxOutputTokens: number
  signal?: AbortSignal
}): Promise<{ content: string | undefined; usage: AiUsage }> {
  if (isReasoningModel(input.modelId)) {
    const responses = input.client.responses as unknown as {
      create(request: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>
    }
    const response = await responses.create({
      model: input.modelId,
      input: input.messages.map((message) => ({
        role: message.role,
        content: [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: message.content }],
      })),
      text: { format: { type: 'json_schema', ...input.jsonSchema } },
      reasoning: { effort: 'medium' },
      max_output_tokens: input.maxOutputTokens,
    }, { signal: input.signal })
    const result = response as {
      output_text?: string
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>
      usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } }
    }
    const content = result.output_text || result.output?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === 'output_text')
      .map((item) => item.text ?? '')
      .join('')
    return {
      content: content || undefined,
      usage: {
        inputTokens: result.usage?.input_tokens ?? 0,
        outputTokens: result.usage?.output_tokens ?? 0,
        cachedTokens: result.usage?.input_tokens_details?.cached_tokens ?? 0,
      },
    }
  }
  const response = await input.client.chat.completions.create({
    model: input.modelId,
    messages: input.messages,
    response_format: { type: 'json_schema', json_schema: input.jsonSchema },
    max_completion_tokens: input.maxOutputTokens,
  }, { signal: input.signal })
  return {
    content: response.choices[0]?.message?.content ?? undefined,
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      cachedTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  }
}

function validationMessage(error: unknown): string {
  if (error instanceof SyntaxError) return 'The response was not valid JSON.'
  if (error instanceof ZodError) {
    return error.issues.slice(0, 20)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
  }
  if (error instanceof Error) return error.message
  return 'The response failed validation.'
}

export async function requestAiGuidedStructuredOutput<T>(input: {
  client: AiGuidedOpenAiClient
  modelId: string
  system: string
  user: string
  jsonSchema: AiGuidedJsonSchema
  maxOutputTokens: number
  /** Throws (Zod or Error) when the parsed value is not acceptable. */
  validate: (value: unknown) => T
  signal?: AbortSignal
}): Promise<{ value: T; usage: AiUsage; attempts: number }> {
  const messages: ChatMessage[] = [
    { role: 'system', content: input.system },
    { role: 'user', content: input.user },
  ]
  let usage: AiUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }
  let lastProblem = 'No response was returned.'

  for (let attempt = 1; attempt <= AI_GUIDED_MAX_ATTEMPTS; attempt += 1) {
    let result: Awaited<ReturnType<typeof callOnce>>
    try {
      result = await callOnce({
        client: input.client,
        modelId: input.modelId,
        messages,
        jsonSchema: input.jsonSchema,
        maxOutputTokens: input.maxOutputTokens,
        signal: input.signal,
      })
    } catch (error) {
      throw new ProviderCallError('openai', input.modelId, error)
    }
    usage = addUsage(usage, result.usage)
    const content = result.content ?? ''
    try {
      if (!content) throw new Error('The response was empty.')
      return { value: input.validate(JSON.parse(content)), usage, attempts: attempt }
    } catch (error) {
      lastProblem = validationMessage(error).slice(0, 1_500)
      if (attempt >= AI_GUIDED_MAX_ATTEMPTS) break
      messages.push(
        { role: 'assistant', content: content.slice(0, 20_000) || '{}' },
        {
          role: 'user',
          content: `The previous JSON failed server validation: ${lastProblem} Return a corrected JSON object that satisfies the schema and every rule. Do not add commentary.`,
        },
      )
    }
  }
  throw new AiGuidedOutputInvalidError(usage, AI_GUIDED_MAX_ATTEMPTS, lastProblem)
}
