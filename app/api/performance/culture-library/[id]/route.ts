import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { hasPerformancePermission, isPerformanceAdmin } from '@/lib/performance'

async function canManage(actor: { userId: string; role: string }) {
  const [admin, permission] = await Promise.all([isPerformanceAdmin(actor), hasPerformancePermission(actor, 'criterion_library_entry', 'write')])
  return admin || permission
}

export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManage(actor)) return apiForbidden('You do not have permission to manage the culture library')

  const { id } = await resolveParams(params)
  const existing = await prisma.criterionLibraryEntry.findUnique({ where: { id } })
  if (!existing) return apiNotFound('Library entry not found')

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : existing.name
  const definitionJson = body.definitionJson !== undefined ? body.definitionJson : existing.definitionJson
  const isActive = typeof body.isActive === 'boolean' ? body.isActive : existing.isActive

  if (!name) return apiBadRequest('Name is required')

  const updated = await prisma.criterionLibraryEntry.update({
    where: { id },
    data: {
      name,
      definitionJson: definitionJson as Prisma.InputJsonValue | undefined,
      isActive,
    },
  })
  return apiSuccess(updated)
})

export const PATCH = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManage(actor)) return apiForbidden('You do not have permission to manage the culture library')

  const { id } = await resolveParams(params)
  const existing = await prisma.criterionLibraryEntry.findUnique({ where: { id } })
  if (!existing) return apiNotFound('Library entry not found')

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const isActive = typeof body.isActive === 'boolean' ? body.isActive : existing.isActive

  const updated = await prisma.criterionLibraryEntry.update({
    where: { id },
    data: { isActive },
  })
  return apiSuccess(updated)
})
