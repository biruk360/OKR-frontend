import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api/apiResponse'

export const POST = withRole<RouteIdParams>(['ADMIN'], async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid role id')

  const body = await request.json().catch(() => ({}))

  const [source, sourceScopeRules] = await Promise.all([
    prisma.role.findUnique({
      where: { id },
      include: {
        doctypePermissions: true,
        featurePermissions: true,
      },
    }),
    prisma.recordScopeRule.findMany({
      where: { targetType: 'role', targetId: id },
    }),
  ])

  if (!source) return apiNotFound('Role not found')

  const cloneName: string = body?.name?.trim() || `${source.name} (Copy)`
  const cloneKey = cloneName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')

  const [nameConflict, keyConflict] = await Promise.all([
    prisma.role.findUnique({ where: { name: cloneName }, select: { id: true } }),
    prisma.role.findUnique({ where: { key: cloneKey }, select: { id: true } }),
  ])

  if (nameConflict) return apiBadRequest(`A role named "${cloneName}" already exists`)
  if (keyConflict) return apiBadRequest(`A role with key "${cloneKey}" already exists`)

  const newRole = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: {
        name: cloneName,
        key: cloneKey,
        description: source.description,
        color: source.color,
        hierarchyLevel: source.hierarchyLevel,
        isSystem: false,
        createdById: session.user.id,
      },
    })

    if (source.doctypePermissions.length > 0) {
      await tx.roleDocTypePermission.createMany({
        data: source.doctypePermissions.map((p) => ({
          roleId: created.id,
          doctypeKey: p.doctypeKey,
          permLevel: p.permLevel,
          canRead: p.canRead,
          canWrite: p.canWrite,
          canCreate: p.canCreate,
          canDelete: p.canDelete,
          canSubmit: p.canSubmit,
          canExport: p.canExport,
          canPrint: p.canPrint,
          canShare: p.canShare,
          canImport: p.canImport,
          canReport: p.canReport,
          applyScoping: p.applyScoping,
          updatedById: session.user.id,
        })),
      })
    }

    if (source.featurePermissions.length > 0) {
      await tx.featurePermission.createMany({
        data: source.featurePermissions.map((fp) => ({
          roleId: created.id,
          featureKey: fp.featureKey,
          visible: fp.visible,
          enabled: fp.enabled,
          updatedById: session.user.id,
        })),
      })
    }

    if (sourceScopeRules.length > 0) {
      await tx.recordScopeRule.createMany({
        data: sourceScopeRules.map((r) => ({
          targetType: 'role',
          targetId: created.id,
          doctypeKey: r.doctypeKey,
          fieldName: r.fieldName,
          operator: r.operator,
          valueType: r.valueType,
          staticValue: r.staticValue,
          isActive: r.isActive,
          createdById: session.user.id,
        })),
      })
    }

    return created
  })

  const populated = await prisma.role.findUnique({
    where: { id: newRole.id },
    include: {
      doctypePermissions: { include: { doctype: true } },
      featurePermissions: true,
      _count: { select: { userRoles: true } },
    },
  })

  return apiSuccess({ newRole: populated }, { status: 201, message: 'Role cloned successfully' })
})
