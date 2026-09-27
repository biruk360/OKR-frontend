import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canManageTemplates, hasPerformancePermission } from '@/lib/performance'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'

async function canManageMappings(actor: { userId: string; role: string }, action: 'read' | 'write' | 'delete'): Promise<boolean> {
  return await canManageTemplates(actor, 'button.performance.template.map-role')
    && await hasPerformancePermission(actor, 'template_role_mapping', action)
}

export const GET = withAuth(async (_request, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageMappings(actor, 'read')) return apiForbidden('You do not have permission to view template mappings')
  const mappings = await prisma.templateRoleMapping.findMany({
    include: {
      family: { select: { id: true, name: true, roleLabel: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ designationKey: 'asc' }, { priority: 'desc' }],
  })
  return apiSuccess(mappings)
})

export const PUT = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageMappings(actor, 'write')) return apiForbidden('You do not have permission to manage template mappings')
  const body = await request.json().catch(() => ({}))
  const designationKey = typeof body.designationKey === 'string' ? body.designationKey.trim().toLowerCase().replace(/\s+/g, ' ') : ''
  const familyId = typeof body.familyId === 'string' ? body.familyId : ''
  const departmentId = typeof body.departmentId === 'string' && body.departmentId ? body.departmentId : null
  if (!designationKey || !familyId) return apiBadRequest('designationKey and familyId are required')
  const family = await prisma.scorecardTemplateFamily.findUnique({ where: { id: familyId }, select: { id: true } })
  if (!family) return apiNotFound('Template family not found')
  const existing = await prisma.templateRoleMapping.findFirst({ where: { designationKey, familyId, departmentId } })
  const mapping = existing
    ? await prisma.templateRoleMapping.update({
        where: { id: existing.id },
        data: { priority: Number(body.priority ?? 0), isActive: body.isActive !== false },
      })
    : await prisma.templateRoleMapping.create({
        data: { designationKey, familyId, departmentId, priority: Number(body.priority ?? 0), isActive: body.isActive !== false },
      })
  const changes: ChangeMap = {}
  if (!existing) {
    changes.designationKey = { from: null, to: designationKey }
    changes.familyId = { from: null, to: familyId }
    changes.departmentId = { from: null, to: departmentId }
  }
  if (existing?.priority !== mapping.priority) changes.priority = { from: existing?.priority ?? null, to: mapping.priority }
  if (existing?.isActive !== mapping.isActive) changes.isActive = { from: existing?.isActive ?? null, to: mapping.isActive }
  if (Object.keys(changes).length > 0) {
    await recordActivity({
      entityType: 'PERFORMANCE_SETTINGS',
      action: existing ? 'UPDATED' : 'CREATED',
      actorId: session.user.id,
      changes,
      metadata: { entity: 'TEMPLATE_ROLE_MAPPING', mappingId: mapping.id, designationKey, familyId, departmentId },
    })
  }
  return apiSuccess(mapping)
})

export const DELETE = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageMappings(actor, 'delete')) return apiForbidden('You do not have permission to delete template mappings')
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return apiBadRequest('Mapping id is required')
  const removed = await prisma.templateRoleMapping.findUnique({ where: { id } })
  if (!removed) return apiNotFound('Template mapping not found')
  await prisma.templateRoleMapping.delete({ where: { id } })
  await recordActivity({
    entityType: 'PERFORMANCE_SETTINGS',
    action: 'DELETED',
    actorId: session.user.id,
    changes: { familyId: { from: removed.familyId, to: null } },
    metadata: {
      entity: 'TEMPLATE_ROLE_MAPPING',
      mappingId: id,
      designationKey: removed.designationKey,
      departmentId: removed.departmentId,
    },
  })
  return apiSuccess({ id })
})
