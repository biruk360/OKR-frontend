import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { absenceSchema } from '@/features/scrum/services/schemas'
import { dateFromDateKey, scrumWorkingDaysInRange } from '@/features/scrum/services/working-days'
import { getScrumSettings } from '@/features/scrum/services/settings'

export const GET = withAuth(async (request: NextRequest) => {
  const q = new URL(request.url).searchParams
  const where: any = {}
  if (q.get('userId')) where.userId = q.get('userId')
  if (q.get('from') || q.get('to')) where.date = {
    ...(q.get('from') ? { gte: dateFromDateKey(q.get('from')!) } : {}),
    ...(q.get('to') ? { lte: dateFromDateKey(q.get('to')!) } : {}),
  }
  return apiSuccess(await prisma.scrumAbsence.findMany({ where, orderBy: { date: 'desc' }, take: 200 }))
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const json = await request.json().catch(() => null)
  const parsed = absenceSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid absence', parsed.error.flatten())
  const settings = await getScrumSettings()
  const from = dateFromDateKey(parsed.data.from)
  const to = dateFromDateKey(parsed.data.to ?? parsed.data.from)
  const dates = scrumWorkingDaysInRange(from, to, settings)
  const rows = await Promise.all(dates.map((date) => prisma.scrumAbsence.upsert({
    where: { userId_date: { userId: parsed.data.userId, date } },
    create: { userId: parsed.data.userId, date, type: parsed.data.type, reason: parsed.data.reason ?? null, recordedById: session.user.id },
    update: { type: parsed.data.type, reason: parsed.data.reason ?? null, recordedById: session.user.id },
  })))
  await recordActivity({ entityType: 'SCRUM_ABSENCE', action: 'CREATED', actorId: session.user.id, metadata: { userId: parsed.data.userId, count: rows.length } })
  return apiSuccess(rows, { status: 201, message: 'Absence saved' })
})
