import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { createOkrLink, listLinksFor } from '@/lib/okr-links/service'
import { okrLinkErrorResponse } from '@/lib/okr-links/http'
import { OKR_LINK_NOTE_MAX } from '@/lib/okr-links/validation'
import { OKR_LINK_ENTITY_TYPES, OKR_LINK_KINDS, OKR_LINK_SUB_KINDS, isOkrLinkEntityType } from '@/types/package'

/**
 * GET  /api/okr-links?type=OBJECTIVE|KEY_RESULT&id= — links that start or end at the item,
 *      each counterpart redacted per CON-8, plus `permissions.canCreate`.
 * POST /api/okr-links — create a SUCCEEDS / CONTRIBUTES_TO link (LNK-1…4). Requires edit
 *      rights on the FROM item (ADMIN / EXECUTIVE always). Logic: lib/okr-links/service.ts.
 */

export const GET = withAuth(async (req: NextRequest, { session }) => {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const id = searchParams.get('id')
  if (session.user.userType === 'CLIENT_PORTAL') return apiForbidden()
  if (!isOkrLinkEntityType(type) || !id) {
    return apiBadRequest('type (OBJECTIVE | KEY_RESULT) and id are required')
  }
  const result = await listLinksFor({ id: session.user.id, role: session.user.role }, type, id)
  if (!result) return apiNotFound('Item not found')
  return apiSuccess(result)
})

const createSchema = z.object({
  fromType: z.enum(OKR_LINK_ENTITY_TYPES),
  fromId: z.string().min(1),
  toType: z.enum(OKR_LINK_ENTITY_TYPES),
  toId: z.string().min(1),
  kind: z.enum(OKR_LINK_KINDS),
  subKind: z.enum(OKR_LINK_SUB_KINDS).nullish(),
  isPrimary: z.boolean().optional(),
  note: z.string().max(OKR_LINK_NOTE_MAX).nullish(),
  setParent: z.boolean().optional(),
})

export const POST = withAuth(async (req: NextRequest, { session }) => {
  if (session.user.userType === 'CLIENT_PORTAL') return apiForbidden()
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid link', parsed.error.flatten())
  try {
    const link = await createOkrLink({ id: session.user.id, role: session.user.role }, parsed.data)
    return apiSuccess(link, { status: 201 })
  } catch (error) {
    const response = okrLinkErrorResponse(error)
    if (response) return response
    throw error
  }
})
