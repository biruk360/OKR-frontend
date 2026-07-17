import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { hasPerformancePermission, isPerformanceAdmin } from '@/lib/performance'

const CODE_PATTERN = /^[A-Z][A-Z0-9_-]*$/

async function canManage(actor: { userId: string; role: string }) {
  const [admin, permission] = await Promise.all([isPerformanceAdmin(actor), hasPerformancePermission(actor, 'criterion_library_entry', 'write')])
  return admin || permission
}

export const GET = withAuth(async (_request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  const [admin, permission] = await Promise.all([isPerformanceAdmin(actor), hasPerformancePermission(actor, 'criterion_library_entry', 'read')])
  if (!admin && !permission) return apiForbidden('You do not have permission to view the culture library')

  const entries = await prisma.criterionLibraryEntry.findMany({
    where: { isActive: true },
    orderBy: [{ code: 'asc' }, { version: 'asc' }],
  })
  return apiSuccess(entries)
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManage(actor)) return apiForbidden('You do not have permission to manage the culture library')

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const version = Number(body.version)
  const type = typeof body.type === 'string' ? body.type : 'RUBRIC'
  const definitionJson = body.definitionJson ?? null
  const isActive = typeof body.isActive === 'boolean' ? body.isActive : true

  if (!code || !CODE_PATTERN.test(code)) return apiBadRequest('Code is required and must be uppercase alphanumeric')
  if (!name) return apiBadRequest('Name is required')
  if (!Number.isFinite(version) || version < 1) return apiBadRequest('Version must be a positive integer')
  if (type !== 'RUBRIC' && type !== 'METRIC') return apiBadRequest('Type must be RUBRIC or METRIC')

  const existing = await prisma.criterionLibraryEntry.findUnique({
    where: { code_version: { code, version } },
  })
  if (existing) return apiBadRequest(`Library entry ${code} v${version} already exists`)

  const entry = await prisma.criterionLibraryEntry.create({
    data: {
      code,
      name,
      version,
      type,
      definitionJson: (definitionJson ?? null) as Prisma.InputJsonValue,
      isActive,
    },
  })
  return apiSuccess(entry)
})
