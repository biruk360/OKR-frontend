import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api/apiResponse'
import { permissionCache } from '@/lib/permission-cache'
import { invalidateAllFieldPermLevelCache } from '@/lib/field-filter'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocTypePermissionInput {
  doctypeKey: string
  permLevel: number
  canRead: boolean
  canWrite: boolean
  canCreate: boolean
  canDelete: boolean
  canSubmit: boolean
  canExport: boolean
  canPrint: boolean
  canShare: boolean
  canImport: boolean
  canReport: boolean
  applyScoping: boolean
}

// ---------------------------------------------------------------------------
// GET /api/permissions/roles/[id]/permissions
// Returns all RoleDocTypePermission rows for the role, grouped by module.
// ---------------------------------------------------------------------------

export const GET = withRole<RouteIdParams>(['ADMIN'], async (_req: NextRequest, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid role id')

  const role = await prisma.role.findUnique({
    where: { id },
    select: { id: true, name: true, key: true },
  })
  if (!role) return apiNotFound('Role not found')

  const permissions = await prisma.roleDocTypePermission.findMany({
    where: { roleId: id },
    include: {
      doctype: {
        select: { key: true, displayName: true, module: true },
      },
    },
    orderBy: [{ doctype: { module: 'asc' } }, { doctype: { displayName: 'asc' } }, { permLevel: 'asc' }],
  })

  // Group by module
  const byModule: Record<string, typeof permissions> = {}
  for (const perm of permissions) {
    const module = perm.doctype.module
    if (!byModule[module]) byModule[module] = []
    byModule[module].push(perm)
  }

  return apiSuccess({ role, byModule })
})

// ---------------------------------------------------------------------------
// PUT /api/permissions/roles/[id]/permissions
// Bulk upsert RoleDocTypePermission rows.
// Body: { permissions: DocTypePermissionInput[] }
// ---------------------------------------------------------------------------

export const PUT = withRole<RouteIdParams>(['ADMIN'], async (req: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid role id')

  const role = await prisma.role.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!role) return apiNotFound('Role not found')

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.permissions)) {
    return apiBadRequest('Body must contain a "permissions" array')
  }

  const inputs: DocTypePermissionInput[] = body.permissions

  // Validate entries
  for (const item of inputs) {
    if (!item.doctypeKey || typeof item.doctypeKey !== 'string') {
      return apiBadRequest('Each permission entry must have a valid doctypeKey')
    }
    if (typeof item.permLevel !== 'number') {
      return apiBadRequest(`permLevel must be a number (got ${typeof item.permLevel} for doctypeKey "${item.doctypeKey}")`)
    }
  }

  // Verify all referenced doctypes exist
  if (inputs.length > 0) {
    const uniqueKeys = Array.from(new Set(inputs.map((i) => i.doctypeKey)))
    const found = await prisma.docTypeRegistry.findMany({
      where: { key: { in: uniqueKeys } },
      select: { key: true },
    })
    const foundKeys = new Set(found.map((d: { key: string }) => d.key))
    const missing = uniqueKeys.filter((k) => !foundKeys.has(k))
    if (missing.length > 0) {
      return apiBadRequest(`Unknown doctypeKey(s): ${missing.join(', ')}`)
    }
  }

  // Bulk upsert in a transaction
  const updated = await prisma.$transaction(
    inputs.map((item) =>
      prisma.roleDocTypePermission.upsert({
        where: {
          roleId_doctypeKey_permLevel: {
            roleId: id,
            doctypeKey: item.doctypeKey,
            permLevel: item.permLevel,
          },
        },
        create: {
          roleId: id,
          doctypeKey: item.doctypeKey,
          permLevel: item.permLevel,
          canRead: item.canRead ?? false,
          canWrite: item.canWrite ?? false,
          canCreate: item.canCreate ?? false,
          canDelete: item.canDelete ?? false,
          canSubmit: item.canSubmit ?? false,
          canExport: item.canExport ?? false,
          canPrint: item.canPrint ?? false,
          canShare: item.canShare ?? false,
          canImport: item.canImport ?? false,
          canReport: item.canReport ?? false,
          applyScoping: item.applyScoping ?? false,
          updatedById: session.user.id,
        },
        update: {
          canRead: item.canRead ?? false,
          canWrite: item.canWrite ?? false,
          canCreate: item.canCreate ?? false,
          canDelete: item.canDelete ?? false,
          canSubmit: item.canSubmit ?? false,
          canExport: item.canExport ?? false,
          canPrint: item.canPrint ?? false,
          canShare: item.canShare ?? false,
          canImport: item.canImport ?? false,
          canReport: item.canReport ?? false,
          applyScoping: item.applyScoping ?? false,
          updatedById: session.user.id,
        },
        include: {
          doctype: { select: { key: true, displayName: true, module: true } },
        },
      })
    )
  )

  permissionCache.invalidateAll()
  invalidateAllFieldPermLevelCache()

  // Group updated results by module for consistency with GET
  const byModule: Record<string, typeof updated> = {}
  for (const perm of updated) {
    const module = perm.doctype.module
    if (!byModule[module]) byModule[module] = []
    byModule[module].push(perm)
  }

  return apiSuccess({ byModule }, { message: 'DocType permissions updated successfully' })
})
