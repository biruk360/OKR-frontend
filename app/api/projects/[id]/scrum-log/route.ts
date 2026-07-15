import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { getProjectScrumLogData } from '@/features/projects/services/scrum-attendance'

const scrumLogSchema = z.object({
  scrumDate: z.string().date(),
  timeHeld: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: z.number().int().min(1).max(240),
  facilitatorId: z.string().min(1),
  attendeeIds: z.array(z.string().min(1)).max(100),
  absenteeIds: z.array(z.string().min(1)).max(100),
  lateIds: z.array(z.string().min(1)).max(100),
  blockersRaised: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export const GET = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  return apiSuccess(await getProjectScrumLogData(prisma, params.id))
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = scrumLogSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid scrum log payload', parsed.error.flatten())

  const scrumDate = new Date(`${parsed.data.scrumDate}T00:00:00.000Z`)
  const attendeeIds = unique(parsed.data.attendeeIds)
  const lateIds = unique(parsed.data.lateIds)
  const absenteeIds = unique(parsed.data.absenteeIds.filter((id) => !attendeeIds.includes(id) && !lateIds.includes(id)))
  const data = {
    timeHeld: parsed.data.timeHeld,
    durationMin: parsed.data.durationMin,
    facilitatorId: parsed.data.facilitatorId,
    attendeeIds,
    absenteeIds,
    lateIds,
    blockersRaised: parsed.data.blockersRaised?.trim() || null,
    notes: parsed.data.notes?.trim() || null,
  }

  const existing = await prisma.scrumLog.findUnique({
    where: { projectId_scrumDate: { projectId: params.id, scrumDate } },
    select: { id: true },
  })

  await prisma.scrumLog.upsert({
    where: { projectId_scrumDate: { projectId: params.id, scrumDate } },
    create: {
      projectId: params.id,
      scrumDate,
      ...data,
    },
    update: data,
  })

  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: existing ? 'UPDATED' : 'CREATED',
    actorId: session.user.id,
    metadata: {
      module: 'SCRUM_LOG',
      scrumDate: parsed.data.scrumDate,
      attendees: attendeeIds.length,
      late: lateIds.length,
      absentees: absenteeIds.length,
    },
  })

  return apiSuccess(await getProjectScrumLogData(prisma, params.id), {
    message: existing ? 'Scrum log updated.' : 'Scrum logged.',
  })
})

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
