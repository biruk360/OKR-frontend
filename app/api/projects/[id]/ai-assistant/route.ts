import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
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
  // Invariant #10. The output itself lives in AiGenerationLog; the audit entry
  // records who asked for what. Output stays unapproved until a PM approves it
  // (invariant 6), so it is not copied here.
  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: {
      kind: 'AI_ASSISTANT_OUTPUT',
      intent: result.intent,
      bullets: result.bullets,
      chars: result.chars,
      requiresPmApproval: result.requiresPmApproval,
    },
  })
  return apiSuccess(result)
})
