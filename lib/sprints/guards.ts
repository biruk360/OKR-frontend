/**
 * Shared API guards for the sprint module (BR-06).
 */

import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api'

/**
 * Returns a 409 SPRINT_CLOSED response when the sprint is COMPLETED or
 * CANCELLED, or null when the sprint is open (or missing — the caller's own
 * not-found handling applies).
 */
export async function sprintClosedGuard(sprintId: string) {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    select: { state: true },
  })
  if (sprint && (sprint.state === 'COMPLETED' || sprint.state === 'CANCELLED')) {
    return apiError('This sprint is closed and read-only', { status: 409, code: 'SPRINT_CLOSED' })
  }
  return null
}
