import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canManageTemplates, hasPerformancePermission } from '@/lib/performance'

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
  return apiSuccess(mapping)
})

export const DELETE = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageMappings(actor, 'delete')) return apiForbidden('You do not have permission to delete template mappings')
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return apiBadRequest('Mapping id is required')
  await prisma.templateRoleMapping.delete({ where: { id } })
  return apiSuccess({ id })
})
