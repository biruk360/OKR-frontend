import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getWritableProject } from '@/lib/projects/access'
import { recordActivity } from '@/lib/activity-log'
import { apiBadRequest, apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'

const memberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['PM', 'DEVELOPER', 'QA', 'DESIGNER', 'BA', 'CLIENT_CONTACT']),
  allocationPct: z.number().min(0).max(100).default(100),
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const parsed = memberSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid project member', parsed.error.flatten())
  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } })
  if (!user) return apiBadRequest('User not found')

  const member = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: params.id, userId: parsed.data.userId } },
    create: { projectId: params.id, ...parsed.data },
    update: { role: parsed.data.role, allocationPct: parsed.data.allocationPct },
  })
  await recordActivity({ entityType: 'PROJECT', projectId: params.id, action: 'UPDATED', actorId: session.user.id, metadata: { change: 'PROJECT_MEMBER_UPDATED', ...parsed.data } })
  return apiSuccess(member)
})

export const DELETE = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid project member', parsed.error.flatten())
  await prisma.projectMember.deleteMany({ where: { projectId: params.id, userId: parsed.data.userId } })
  await recordActivity({ entityType: 'PROJECT', projectId: params.id, action: 'UPDATED', actorId: session.user.id, metadata: { change: 'PROJECT_MEMBER_REMOVED', ...parsed.data } })
  return apiSuccess({ removed: true })
})
