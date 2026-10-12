import type { NextRequest } from 'next/server'
import {
  apiBadRequest,
  apiError,
  apiForbidden,
  apiNotFound,
  apiSuccess,
  apiValidationError,
  handleApiError,
  withAuth,
} from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { isClientPortalUser } from '@/lib/todos/visibility'
import { keyResultLockResponse } from '@/lib/okr/lock-guard'
import { broadcastKeyResultEvent } from '@/lib/pusher'
import { OKR_REALTIME_EVENTS } from '@/lib/okr/realtime'
import { OkrProfileError } from '@/features/employee-profile/components/okr-profile/okr-profile.server'
import { createProfileInitiative } from '@/features/employee-profile/components/okr-profile/okr-profile-initiatives.server'
import { createProfileInitiativeSchema } from '@/features/employee-profile/components/okr-profile/schemas'

/**
 * POST /api/users/[id]/okr-profile/initiatives
 * Body: { keyResultId, kind: 'MILESTONE' | 'TASK', title, dueDate?: 'YYYY-MM-DD', assigneeId?: string | null }
 * Adds a milestone or task under a KR from the OKR profile (PRF-11). Same gate as
 * POST /api/keyresults/[id]/todos: 423 when the KR or its objective is locked,
 * 403 without KR edit rights. `assigneeId` defaults to the profile person.
 * → 201 { id, cardNumber, title, kind, keyResultId, objectiveId, assigneeId, dueDate }
 */
export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  if (isClientPortalUser(session.user)) return apiForbidden('Forbidden')
  const { id: profileUserId } = await resolveParams(params)
  if (!profileUserId) return apiNotFound('User not found')

  const body = await request.json().catch(() => undefined)
  if (body === undefined) return apiBadRequest('Invalid JSON body')
  const parsed = createProfileInitiativeSchema.safeParse(body)
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues)

  const locked = await keyResultLockResponse(parsed.data.keyResultId)
  if (locked) return locked

  try {
    const created = await createProfileInitiative(
      { id: session.user.id, role: session.user.role },
      profileUserId,
      parsed.data,
    )
    broadcastKeyResultEvent(created.keyResultId, created.objectiveId, OKR_REALTIME_EVENTS.UPDATED, session.user.id)
    return apiSuccess(created, {
      status: 201,
      message: created.kind === 'MILESTONE' ? 'Milestone added' : 'Task added',
    })
  } catch (error) {
    if (error instanceof OkrProfileError) return apiError(error.message, { status: error.status })
    return handleApiError(error)
  }
})
