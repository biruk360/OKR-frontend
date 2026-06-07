import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiNotFound } from '@/lib/api/apiResponse'
import { permissionCache } from '@/lib/permission-cache'
import { invalidateAllFieldPermLevelCache } from '@/lib/field-filter'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

type DefaultPerms = {
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

function getDefaultPerms(roleKey: string): DefaultPerms {
  switch (roleKey) {
    case 'ADMIN':
      return {
        canRead: true,
        canWrite: true,
        canCreate: true,
        canDelete: true,
        canSubmit: true,
        canExport: true,
        canPrint: true,
        canShare: true,
        canImport: true,
        canReport: true,
        applyScoping: false,
      }
    case 'EXECUTIVE':
      return {
        canRead: true,
        canWrite: true,
        canCreate: true,
        canDelete: true,
        canSubmit: false,
        canExport: true,
        canPrint: true,
        canShare: false,
        canImport: false,
        canReport: true,
        applyScoping: false,
      }
    case 'DEPARTMENT_LEAD':
      return {
        canRead: true,
        canWrite: true,
        canCreate: true,
        canDelete: false,
        canSubmit: false,
        canExport: true,
        canPrint: true,
        canShare: false,
        canImport: false,
        canReport: false,
        applyScoping: true,
      }
    case 'EMPLOYEE':
      return {
        canRead: true,
        canWrite: false,
        canCreate: true,
        canDelete: false,
        canSubmit: false,
        canExport: false,
        canPrint: false,
        canShare: false,
        canImport: false,
        canReport: false,
        applyScoping: true,
      }
    default:
      return {
        canRead: false,
        canWrite: false,
        canCreate: false,
        canDelete: false,
        canSubmit: false,
        canExport: false,
        canPrint: false,
        canShare: false,
        canImport: false,
        canReport: false,
        applyScoping: false,
      }
  }
}

export const POST = withRole<RouteIdParams>(['ADMIN'], async (_req: NextRequest, { session, params }) => {
  const { id: roleId } = await resolveParams(params)

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { id: true, name: true, key: true },
  })
  if (!role) return apiNotFound('Role not found')

  const doctypes = await prisma.docTypeRegistry.findMany({
    select: { key: true },
  })

  const defaults = getDefaultPerms(role.key)

  const upserts = doctypes.map((dt) =>
    prisma.roleDocTypePermission.upsert({
      where: {
        roleId_doctypeKey_permLevel: {
          roleId: role.id,
          doctypeKey: dt.key,
          permLevel: 0,
        },
      },
      create: {
        roleId: role.id,
        doctypeKey: dt.key,
        permLevel: 0,
        ...defaults,
        updatedById: session.user.id,
      },
      update: {
        ...defaults,
        updatedById: session.user.id,
      },
      include: {
        doctype: { select: { key: true, displayName: true, module: true } },
      },
    })
  )

  const updated = await prisma.$transaction(upserts)

  permissionCache.invalidateAll()
  invalidateAllFieldPermLevelCache()

  await recordActivity({
    entityType: 'OBJECTIVE',
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: { roleId: role.id, roleKey: role.key, action: 'reset', entityType: 'role_doctype_permission' },
  })

  return apiSuccess({ reset: updated.length, role: role.name })
})
