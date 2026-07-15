import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { getWritableProject } from '@/lib/projects/access'
import { AI_ASSISTANT_INTENTS, generateAssistantOutput, type AiAssistantIntent } from '@/lib/projects/ai-assistant'

const requestSchema = z.object({
  intent: z.enum(AI_ASSISTANT_INTENTS as unknown as [AiAssistantIntent, ...AiAssistantIntent[]]),
  context: z.string().max(500).optional(),
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } })
    return exists ? apiForbidden() : apiNotFound('Project not found')
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return apiValidationError('Invalid AI assistant request', parsed.error.flatten())

  const result = await generateAssistantOutput(params.id, parsed.data, session.user.id)
  return apiSuccess(result)
})
