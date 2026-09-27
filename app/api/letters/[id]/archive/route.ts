import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { letterReadGuard } from '@/lib/letter-access'
import { recordActivity } from '@/lib/activity-log'
import { canAdministerLetters } from '@/lib/letter-permissions'
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  withAuth,
} from '@/lib/api'

// FR-12: Archive — SENT → ARCHIVED for any user; any → ARCHIVED for admin (force).
export const POST = withAuth<RouteIdParams>(async (req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  // Read scope first: an out-of-scope letter is 404, so ids can't be probed
  // through the transition endpoints.
  const denied = await letterReadGuard(session.user.id, id)
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as { force?: boolean }
  const letter = await prisma.letter.findUnique({ where: { id } })
  if (!letter) return apiNotFound('Letter not found')

  const canAdmin = await canAdministerLetters(session.user.id)
  const isForce = Boolean(body.force) && canAdmin
  if (letter.status !== 'SENT' && !isForce) {
    return apiBadRequest('Only SENT letters can be archived (or use force as an admin)')
  }

  const updated = await prisma.letter.update({
    where: { id },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  })
  await recordActivity({
    entityType: 'LETTER',
    letterId: id,
    action: 'ARCHIVED',
    actorId: session.user.id,
    metadata: { force: isForce, fromStatus: letter.status },
  })
  return apiSuccess(updated)
})

// Unarchive — admin only — reverts to the pre-archive status (best-effort = SENT).
export const DELETE = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  // Read scope first: an out-of-scope letter is 404, so ids can't be probed
  // through the transition endpoints.
  const denied = await letterReadGuard(session.user.id, id)
  if (denied) return denied

  if (!(await canAdministerLetters(session.user.id))) {
    return apiForbidden('Only a Letter Administrator can unarchive')
  }

  const letter = await prisma.letter.findUnique({ where: { id } })
  if (!letter) return apiNotFound('Letter not found')
  if (letter.status !== 'ARCHIVED') return apiBadRequest('Letter is not archived')

  const updated = await prisma.letter.update({
    where: { id },
    data: { status: 'SENT', archivedAt: null },
  })
  await recordActivity({
    entityType: 'LETTER',
    letterId: id,
    action: 'UNARCHIVED',
    actorId: session.user.id,
  })
  return apiSuccess(updated)
})
