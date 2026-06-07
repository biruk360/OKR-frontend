import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess } from '@/lib/api/apiResponse'

/**
 * GET /api/permissions/doctypes
 *
 * Returns all DocTypeRegistry entries grouped by module, with field count per entry.
 * Restricted to ADMIN role.
 *
 * Response shape:
 * {
 *   success: true,
 *   data: {
 *     modules: {
 *       okr: DocTypeWithFieldCount[],
 *       work: DocTypeWithFieldCount[],
 *       ...
 *     }
 *   }
 * }
 */

interface DocTypeWithFieldCount {
  key: string
  displayName: string
  module: string
  isSubmittable: boolean
  description: string | null
  _count: { fields: number }
}

type ModuleMap = Record<string, DocTypeWithFieldCount[]>

export const GET = withRole(['ADMIN'], async (_req: NextRequest) => {
  const doctypes = await prisma.docTypeRegistry.findMany({
    include: {
      _count: {
        select: { fields: true },
      },
    },
    orderBy: [{ module: 'asc' }, { displayName: 'asc' }],
  })

  const modules: ModuleMap = {}

  for (const dt of doctypes) {
    const mod = dt.module
    if (!modules[mod]) {
      modules[mod] = []
    }
    modules[mod].push({
      key: dt.key,
      displayName: dt.displayName,
      module: dt.module,
      isSubmittable: dt.isSubmittable,
      description: dt.description,
      _count: { fields: dt._count.fields },
    })
  }

  return apiSuccess({ modules })
})
