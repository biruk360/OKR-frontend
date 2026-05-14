import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest } from '@/lib/api/apiResponse'
import { LETTER_PERMISSIONS } from '@/lib/letter-permissions'

/**
 * GET /api/settings/letter-permissions/roles
 * Returns the full role × permission matrix.
 * Shape: { [role]: { [permission]: boolean } }
 */
export const GET = withRole('ADMIN', async () => {
  const rows = await prisma.letterRolePermission.findMany()

  const matrix: Record<string, Record<string, boolean>> = {}
  for (const row of rows) {
    if (!matrix[row.role]) matrix[row.role] = {}
    matrix[row.role][row.permission] = row.granted
  }

  return apiSuccess({ matrix, permissions: LETTER_PERMISSIONS })
})

/**
 * PUT /api/settings/letter-permissions/roles
 * Body: { role: string, permission: string, granted: boolean }
 * Upserts one cell in the matrix.
 */
export const PUT = withRole('ADMIN', async (req, { session }) => {
  const body = await req.json()
  const { role, permission, granted } = body

  if (!role || !permission || typeof granted !== 'boolean') {
    return apiBadRequest('role, permission, and granted (boolean) are required')
  }

  if (!LETTER_PERMISSIONS.includes(permission)) {
    return apiBadRequest(`Unknown permission: ${permission}`)
  }

  const validRoles = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE']
  if (!validRoles.includes(role)) {
    return apiBadRequest(`Unknown role: ${role}`)
  }

  const updated = await prisma.letterRolePermission.upsert({
    where: { role_permission: { role, permission } },
    update: { granted, updatedById: session.user.id },
    create: { role, permission, granted, updatedById: session.user.id },
  })

  return apiSuccess(updated, { message: 'Permission updated' })
})
