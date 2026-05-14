import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api/apiResponse'
import { LETTER_PERMISSIONS } from '@/lib/letter-permissions'

/**
 * GET /api/settings/letter-permissions/users/[userId]
 * Returns all overrides for a specific user.
 */
export const GET = withRole('ADMIN', async (_req, { params }) => {
  const { userId } = params as { userId: string }

  const overrides = await prisma.letterUserPermission.findMany({
    where: { userId },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, avatar: true } },
    },
  })

  return apiSuccess(overrides)
})

/**
 * DELETE /api/settings/letter-permissions/users/[userId]
 * Query param: ?permission=letter.approve  → removes that single override
 * No query param                           → removes all overrides for that user
 */
export const DELETE = withRole('ADMIN', async (req, { params }) => {
  const { userId } = params as { userId: string }
  const permission = new URL(req.url).searchParams.get('permission')

  if (permission) {
    if (!LETTER_PERMISSIONS.includes(permission as any)) {
      return apiBadRequest(`Unknown permission: ${permission}`)
    }

    const existing = await prisma.letterUserPermission.findUnique({
      where: { userId_permission: { userId, permission } },
    })
    if (!existing) return apiNotFound('Override not found')

    await prisma.letterUserPermission.delete({
      where: { userId_permission: { userId, permission } },
    })
    return apiSuccess(null, { message: 'Override removed' })
  }

  // Remove all overrides for this user
  const { count } = await prisma.letterUserPermission.deleteMany({ where: { userId } })
  return apiSuccess(null, { message: `Removed ${count} overrides for user` })
})
