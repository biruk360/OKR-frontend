import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiSuccess, apiNotFound, apiBadRequest, apiForbidden, apiValidationError, withAuth, withRole } from '@/lib/api'
import {
  normalizeTemplateStructure,
  templateStructureSchema,
} from '@/lib/projects/templates'
import { PROJECT_TYPES } from '@/features/projects/types'

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  projectType: z.enum(PROJECT_TYPES).optional(),
  structureJson: templateStructureSchema.optional(),
})

/** GET /api/projects/templates/[id] — full template for the builder. */
export const GET = withAuth<{ id: string }>(async (_request: NextRequest, { params }) => {
  const template = await prisma.projectTemplate.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, description: true, projectType: true, isSystem: true, version: true, structureJson: true },
  })
  if (!template) return apiNotFound('Template not found')
  return apiSuccess({
    ...template,
    structureJson: normalizeTemplateStructure(template.structureJson),
  })
})

/** PATCH /api/projects/templates/[id] — update a custom template. */
export const PATCH = withRole<{ id: string }>(['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'], async (request: NextRequest, { session, params }) => {
  const template = await prisma.projectTemplate.findUnique({ where: { id: params.id }, select: { id: true, isSystem: true, name: true } })
  if (!template) return apiNotFound('Template not found')
  if (template.isSystem) return apiForbidden('System templates cannot be edited')

  const json = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid template payload', parsed.error.flatten())

  const data: { name?: string; description?: string | null; projectType?: string; version?: { increment: number }; structureJson?: any } = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name
  if (parsed.data.description !== undefined) data.description = parsed.data.description
  if (parsed.data.projectType !== undefined) data.projectType = parsed.data.projectType
  if (parsed.data.structureJson !== undefined) {
    data.structureJson = normalizeTemplateStructure(parsed.data.structureJson)
    data.version = { increment: 1 }
  }

  const updated = await prisma.projectTemplate.update({
    where: { id: params.id },
    data,
    select: { id: true, name: true, description: true, projectType: true, isSystem: true, version: true, structureJson: true },
  })

  await recordActivity({
    entityType: 'PROJECT_TEMPLATE',
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: { templateId: updated.id, source: 'builder' },
  })

  return apiSuccess({
    ...updated,
    structureJson: normalizeTemplateStructure(updated.structureJson),
  })
})

/** DELETE /api/projects/templates/[id] — delete a custom template. */
export const DELETE = withRole<{ id: string }>(['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'], async (_request: NextRequest, { session, params }) => {
  const template = await prisma.projectTemplate.findUnique({ where: { id: params.id }, select: { id: true, isSystem: true, name: true } })
  if (!template) return apiNotFound('Template not found')
  if (template.isSystem) return apiForbidden('System templates cannot be deleted')

  await prisma.projectTemplate.delete({ where: { id: params.id } })

  await recordActivity({
    entityType: 'PROJECT_TEMPLATE',
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { templateId: params.id, name: template.name },
  })

  return apiSuccess({ id: params.id })
})
