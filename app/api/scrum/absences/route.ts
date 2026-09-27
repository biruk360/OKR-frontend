import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { absenceSchema } from '@/features/scrum/services/schemas'
import { dateFromDateKey, scrumWorkingDaysInRange } from '@/features/scrum/services/working-days'
import { getScrumSettings } from '@/features/scrum/services/settings'
import {
  canManageScrumUser,
  canReadScrumUserRecords,
  isOrgWideScrumRole,
  listManagedScrumUserIds,
} from '@/features/scrum/services/access'

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const q = new URL(request.url).searchParams
  const where: any = {}
  const userId = q.get('userId')
  if (userId) {
    if (!await canReadScrumUserRecords(session, userId)) return apiForbidden('You cannot view absences for this user')
    where.userId = userId
  } else if (!isOrgWideScrumRole(session.user.role)) {
    // No subject given: scope to self + people the actor manages.
    where.userId = { in: [session.user.id, ...await listManagedScrumUserIds(session)] }
  }
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
  const subjectUserId = parsed.data.userId
  if (subjectUserId !== session.user.id && !await canManageScrumUser(session, subjectUserId)) {
    return apiForbidden('You cannot record absences for this user')
  }
  const settings = await getScrumSettings()
  const from = dateFromDateKey(parsed.data.from)
  const to = dateFromDateKey(parsed.data.to ?? parsed.data.from)
  if (to < from) return apiValidationError('Absence end date must be on or after the start date')
  const dates = scrumWorkingDaysInRange(from, to, settings)
  if (dates.length > 92) return apiValidationError('Absence range is too long (max 92 working days)')
  const rows = await Promise.all(dates.map((date) => prisma.scrumAbsence.upsert({
    where: { userId_date: { userId: subjectUserId, date } },
    create: { userId: subjectUserId, date, type: parsed.data.type, reason: parsed.data.reason ?? null, recordedById: session.user.id },
    update: { type: parsed.data.type, reason: parsed.data.reason ?? null, recordedById: session.user.id },
  })))
  await recordActivity({ entityType: 'SCRUM_ABSENCE', action: 'CREATED', actorId: session.user.id, metadata: { userId: subjectUserId, count: rows.length } })
  return apiSuccess(rows, { status: 201, message: 'Absence saved' })
})
