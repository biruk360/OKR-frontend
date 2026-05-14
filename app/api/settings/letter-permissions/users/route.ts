import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest } from '@/lib/api/apiResponse'
import { LETTER_PERMISSIONS } from '@/lib/letter-permissions'

/**
 * GET /api/settings/letter-permissions/users
 * Returns all per-user letter permission overrides with user info.
 */
export const GET = withRole('ADMIN', async () => {
  const overrides = await prisma.letterUserPermission.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, role: true, avatar: true } },
    },
    orderBy: [{ user: { name: 'asc' } }, { permission: 'asc' }],
  })

  return apiSuccess(overrides)
})

/**
 * POST /api/settings/letter-permissions/users
 * Body: { userId: string, permission: string, granted: boolean }
 * Creates or updates a per-user override.
 */
export const POST = withRole('ADMIN', async (req, { session }) => {
  const body = await req.json()
  const { userId, permission, granted } = body

  if (!userId || !permission || typeof granted !== 'boolean') {
    return apiBadRequest('userId, permission, and granted (boolean) are required')
  }

  if (!LETTER_PERMISSIONS.includes(permission)) {
    return apiBadRequest(`Unknown permission: ${permission}`)
  }

  const override = await prisma.letterUserPermission.upsert({
    where: { userId_permission: { userId, permission } },
    update: { granted, updatedById: session.user.id },
    create: { userId, permission, granted, updatedById: session.user.id },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, avatar: true } },
    },
  })

  return apiSuccess(override, { message: 'User permission override saved' })
})
