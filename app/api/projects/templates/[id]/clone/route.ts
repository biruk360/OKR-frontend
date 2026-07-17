import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withRole, apiBadRequest, apiSuccess } from '@/lib/api'
import { createTemplateClone } from '@/lib/projects/templates'

const cloneSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
})

/** POST /api/projects/templates/[id]/clone — clone any template into an editable copy. */
export const POST = withRole<{ id: string }>(['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'], async (request: NextRequest, { session, params }) => {
  const json = await request.json().catch(() => ({}))
  const parsed = cloneSchema.safeParse(json)
  if (!parsed.success) return apiBadRequest('Invalid clone payload')

  const created = await createTemplateClone(params.id, { newName: parsed.data.name, createdById: session.user.id })
  return apiSuccess(created)
})
