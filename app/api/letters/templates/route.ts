import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAdministerLetters, checkLetterPermissionV2 } from '@/lib/letter-permissions'
import { recordActivity } from '@/lib/activity-log'
import { listLetterTemplates, parseLetterTemplateCreate } from '@/lib/letter-templates'
import { apiBadRequest, apiForbidden, apiSuccess, withAuth } from '@/lib/api'

/**
 * GET — letter body templates. Anyone who can create or read letters sees the
 * active ones (the create modal's template picker); letter admins may add
 * `?includeArchived=true` for the management screen. `?letterType=CL` narrows.
 * Seeds the built-in constants on first read when the table is empty.
 */
export const GET = withAuth(async (request: NextRequest, { session }) => {
  const userId = session.user.id
  const [isAdmin, canCreate, canRead] = await Promise.all([
    canAdministerLetters(userId),
    checkLetterPermissionV2(userId, 'letter.create'),
    checkLetterPermissionV2(userId, 'letter.read'),
  ])
  if (!isAdmin && !canCreate && !canRead) return apiForbidden('You are not permitted to view letter templates')

  const { searchParams } = new URL(request.url)
  const includeArchived = isAdmin && searchParams.get('includeArchived') === 'true'
  const templates = await listLetterTemplates({
    letterType: searchParams.get('letterType'),
    includeArchived,
  })
  return apiSuccess(templates)
})

/** POST — create a template (letter admin only). Body is stored sanitized. */
export const POST = withAuth(async (request: NextRequest, { session }) => {
  if (!(await canAdministerLetters(session.user.id))) {
    return apiForbidden('Only letter administrators can manage templates')
  }
  const parsed = parseLetterTemplateCreate(await request.json().catch(() => ({})))
  if (!parsed.ok) return apiBadRequest(parsed.error)

  const created = await prisma.letterTemplate.create({
    data: {
      ...parsed.data,
      isActive: true,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  })
  await recordActivity({
    entityType: 'LETTER_TEMPLATE',
    action: 'CREATED',
    actorId: session.user.id,
    metadata: {
      kind: 'LETTER_TEMPLATE',
      templateId: created.id,
      name: created.name,
      letterType: created.letterType,
      language: created.language,
    },
  })
  return apiSuccess(created, { status: 201 })
})
