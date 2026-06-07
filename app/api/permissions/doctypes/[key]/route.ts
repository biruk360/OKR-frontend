import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiNotFound } from '@/lib/api/apiResponse'
import type { AuthContext } from '@/lib/api/withAuth'

/**
 * GET /api/permissions/doctypes/[key]
 *
 * Returns a single DocTypeRegistry entry by its primary-key string, including:
 *   - fields: DocTypeFieldRegistry[]
 *   - permissions: RoleDocTypePermission[] (with role name + key)
 *
 * Returns 404 if the doctype key does not exist.
 * Restricted to ADMIN role.
 */

type Params = { key: string }

export const GET = withRole<Params>(['ADMIN'], async (_req: NextRequest, { params }: AuthContext<Params>) => {
  const { key } = params

  const doctype = await prisma.docTypeRegistry.findUnique({
    where: { key },
    include: {
      fields: {
        orderBy: [{ permLevel: 'asc' }, { fieldName: 'asc' }],
      },
      permissions: {
        include: {
          role: {
            select: {
              id: true,
              name: true,
              key: true,
            },
          },
        },
        orderBy: [{ permLevel: 'asc' }],
      },
    },
  })

  if (!doctype) {
    return apiNotFound(`DocType '${key}' not found`)
  }

  return apiSuccess(doctype)
})
