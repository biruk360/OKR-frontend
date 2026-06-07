import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api/apiResponse'
import { permissionCache } from '@/lib/permission-cache'
import type { AuthContext } from '@/lib/api/withAuth'

/**
 * GET  /api/permissions/roles/[id]/field-permissions/[doctypeKey]
 *   Returns all RoleDocTypeFieldPermission rows for (roleId, doctypeKey).
 *   Response: { fieldPerms: Array<{ fieldName, canRead, canWrite }> }
 *
 * PUT  /api/permissions/roles/[id]/field-permissions/[doctypeKey]
 *   Bulk-upserts per-field R/W flags.
 *   Body: { fieldPerms: Array<{ fieldName, canRead, canWrite }> }
 *   After save, invalidates the full permission cache.
 *   Response: { fieldPerms: Array<{ fieldName, canRead, canWrite }> }
 *
 * Both endpoints are restricted to ADMIN role.
 */

// New model is accessed via `db` alias (typed as any) until `prisma generate` is run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

type RouteParams = { id: string; doctypeKey: string }

interface FieldPermInput {
  fieldName: string
  canRead: boolean
  canWrite: boolean
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export const GET = withRole<RouteParams>(
  ['ADMIN'],
  async (_req: NextRequest, { params }: AuthContext<RouteParams>) => {
    const { id: roleId, doctypeKey } = await Promise.resolve(params)

    // Verify the role exists.
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true },
    })
    if (!role) return apiNotFound(`Role '${roleId}' not found`)

    const rows: Array<{ fieldName: string; canRead: boolean; canWrite: boolean }> =
      await db.roleDocTypeFieldPermission.findMany({
        where: { roleId, doctypeKey },
        select: { fieldName: true, canRead: true, canWrite: true },
        orderBy: { fieldName: 'asc' },
      })

    return apiSuccess({ fieldPerms: rows })
  }
)

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

export const PUT = withRole<RouteParams>(
  ['ADMIN'],
  async (req: NextRequest, { params }: AuthContext<RouteParams>) => {
    const { id: roleId, doctypeKey } = await Promise.resolve(params)

    // Verify the role exists.
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true },
    })
    if (!role) return apiNotFound(`Role '${roleId}' not found`)

    // Parse body.
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return apiBadRequest('Request body must be valid JSON')
    }

    if (
      typeof body !== 'object' ||
      body === null ||
      !Array.isArray((body as Record<string, unknown>).fieldPerms)
    ) {
      return apiBadRequest('Body must be { fieldPerms: [...] }')
    }

    const rawPerms: unknown[] = (body as { fieldPerms: unknown[] }).fieldPerms

    // Validate each entry before touching the DB.
    const validatedPerms: FieldPermInput[] = []
    const seen = new Set<string>()

    for (let i = 0; i < rawPerms.length; i++) {
      const fp = rawPerms[i] as Record<string, unknown>

      if (typeof fp.fieldName !== 'string' || fp.fieldName.trim() === '') {
        return apiBadRequest(`fieldPerms[${i}].fieldName must be a non-empty string`)
      }
      const fieldName = fp.fieldName.trim()

      if (seen.has(fieldName)) {
        return apiBadRequest(`Duplicate fieldName '${fieldName}' at index ${i}`)
      }
      seen.add(fieldName)

      validatedPerms.push({
        fieldName,
        canRead: Boolean(fp.canRead),
        canWrite: Boolean(fp.canWrite),
      })
    }

    // Bulk upsert inside a transaction using the @@unique([roleId, doctypeKey, fieldName]) key.
    const upserted: Array<{ fieldName: string; canRead: boolean; canWrite: boolean }> =
      await prisma.$transaction(
        validatedPerms.map((fp) =>
          db.roleDocTypeFieldPermission.upsert({
            where: {
              roleId_doctypeKey_fieldName: {
                roleId,
                doctypeKey,
                fieldName: fp.fieldName,
              },
            },
            create: {
              roleId,
              doctypeKey,
              fieldName: fp.fieldName,
              canRead: fp.canRead,
              canWrite: fp.canWrite,
            },
            update: {
              canRead: fp.canRead,
              canWrite: fp.canWrite,
            },
            select: { fieldName: true, canRead: true, canWrite: true },
          })
        )
      )

    // Invalidate all cached permission checks so the new flags take effect immediately.
    permissionCache.invalidateAll()

    return apiSuccess(
      { fieldPerms: upserted },
      { message: `${upserted.length} field permission(s) saved for role '${roleId}' on doctype '${doctypeKey}'` }
    )
  }
)
