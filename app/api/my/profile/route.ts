import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiUnauthorized, withAuth } from '@/lib/api'

/**
 * GET /api/my/profile — the authenticated user's profile.
 * Used by the desktop companion app to validate a stored token
 * and hydrate the local user cache.
 */
export const GET = withAuth(async (_request: NextRequest, { session }) => {
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatar: true,
      designation: true,
      isActive: true,
    },
  })
  if (!user || !user.isActive) return apiUnauthorized()
  return apiSuccess(user)
})
