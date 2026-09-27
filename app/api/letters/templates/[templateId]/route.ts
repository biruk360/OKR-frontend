import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAdministerLetters } from '@/lib/letter-permissions'
import { recordActivity } from '@/lib/activity-log'
import { parseLetterTemplateUpdate } from '@/lib/letter-templates'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'

type Params = { templateId: string }

/**
 * PATCH — edit a template's name / type / language / body, or archive and
 * restore it via `isActive`. Letter admin only. Templates are never
 * hard-deleted: letters created from one keep their own copy of the body, and
 * the audit trail stays meaningful.
 */
export const PATCH = withAuth<Params>(async (request: NextRequest, { session, params }) => {
  if (!(await canAdministerLetters(session.user.id))) {
    return apiForbidden('Only letter administrators can manage templates')
  }
  const { templateId } = await resolveParams(params)
  if (!templateId) return apiBadRequest('Invalid template id')

  const existing = await prisma.letterTemplate.findUnique({ where: { id: templateId } })
  if (!existing) return apiNotFound('Template not found')

  const parsed = parseLetterTemplateUpdate(await request.json().catch(() => ({})))
  if (!parsed.ok) return apiBadRequest(parsed.error)

  const updated = await prisma.letterTemplate.update({
    where: { id: templateId },
    data: { ...parsed.data, updatedById: session.user.id },
  })

  const changedFields = Object.keys(parsed.data).filter(
    (k) => (existing as Record<string, unknown>)[k] !== (updated as Record<string, unknown>)[k],
  )
  const action =
    'isActive' in parsed.data && existing.isActive !== updated.isActive
      ? (updated.isActive ? 'UNARCHIVED' : 'ARCHIVED')
      : 'UPDATED'
  await recordActivity({
    entityType: 'LETTER_TEMPLATE',
    action,
    actorId: session.user.id,
    metadata: {
      kind: 'LETTER_TEMPLATE',
      templateId,
      name: updated.name,
      letterType: updated.letterType,
      fields: changedFields,
    },
  })
  return apiSuccess(updated)
})

/** DELETE — archive (soft). Same as PATCH { isActive: false }. */
export const DELETE = withAuth<Params>(async (_request: NextRequest, { session, params }) => {
  if (!(await canAdministerLetters(session.user.id))) {
    return apiForbidden('Only letter administrators can manage templates')
  }
  const { templateId } = await resolveParams(params)
  if (!templateId) return apiBadRequest('Invalid template id')

  const existing = await prisma.letterTemplate.findUnique({ where: { id: templateId } })
  if (!existing) return apiNotFound('Template not found')
  if (!existing.isActive) return apiSuccess(existing)

  const updated = await prisma.letterTemplate.update({
    where: { id: templateId },
    data: { isActive: false, updatedById: session.user.id },
  })
  await recordActivity({
    entityType: 'LETTER_TEMPLATE',
    action: 'ARCHIVED',
    actorId: session.user.id,
    metadata: { kind: 'LETTER_TEMPLATE', templateId, name: updated.name, letterType: updated.letterType },
  })
  return apiSuccess(updated)
})
