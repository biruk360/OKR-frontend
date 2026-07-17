import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiSuccess, apiValidationError, apiBadRequest, withAuth, withRole } from '@/lib/api'
import {
  cloneTemplateStructure,
  countTemplateNodes,
  createTemplateClone,
  emptyTemplateStructure,
  normalizeTemplateStructure,
  templateStructureSchema,
  type TemplateStructure,
} from '@/lib/projects/templates'

/**
 * GET /api/projects/templates — list available project templates (system + custom).
 * Returns lightweight metadata for the create-project wizard's template step (A1/A2).
 */
export const GET = withAuth(async (_request: NextRequest) => {
  const templates = await prisma.projectTemplate.findMany({
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, description: true, isSystem: true, version: true, structureJson: true },
  })

  // Return a phase-count summary rather than the full tree for the picker.
  const data = templates.map((t) => {
    const structure = normalizeTemplateStructure(t.structureJson)
    const counts = countTemplateNodes(structure)
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      isSystem: t.isSystem,
      version: t.version,
      ...counts,
    }
  })

  return apiSuccess(data)
})

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  structureJson: templateStructureSchema.optional(),
})

/**
 * POST /api/projects/templates — create a new custom template.
 */
export const POST = withRole(['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'], async (request: NextRequest, { session }) => {
  const json = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid template payload', parsed.error.flatten())

  const structure = normalizeTemplateStructure(parsed.data.structureJson ?? emptyTemplateStructure())
  const counts = countTemplateNodes(structure)
  if (counts.phases === 0) return apiBadRequest('A template must contain at least one phase')

  const created = await prisma.projectTemplate.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isSystem: false,
      version: 1,
      structureJson: structure as any,
      createdById: session.user.id,
    },
    select: { id: true, name: true, description: true, isSystem: true, version: true, structureJson: true },
  })

  await recordActivity({
    entityType: 'PROJECT_TEMPLATE',
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { templateId: created.id, source: 'builder' },
  })

  return apiSuccess({
    ...created,
    structureJson: normalizeTemplateStructure(created.structureJson),
  })
})
