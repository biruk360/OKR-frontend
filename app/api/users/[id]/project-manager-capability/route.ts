import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiNotFound, apiSuccess, apiValidationError, withRole } from '@/lib/api'
import { setProjectManagerCapability } from '@/lib/projects/project-manager-capability'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

const capabilitySchema = z.object({
  enabled: z.boolean(),
})

export const PATCH = withRole<RouteIdParams>('ADMIN', async (request: NextRequest, { session, params }) => {
  const { id: targetUserId } = await resolveParams(params)
  const parsed = capabilitySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return apiValidationError('enabled must be a boolean', parsed.error.flatten())
  }

  const result = await setProjectManagerCapability({
    actorId: session.user.id,
    targetUserId,
    enabled: parsed.data.enabled,
  })
  if (!result) return apiNotFound('User not found')

  return apiSuccess(result.user, {
    message: result.changed
      ? `Project Manager capability ${parsed.data.enabled ? 'granted' : 'revoked'}`
      : 'Project Manager capability unchanged',
  })
})
