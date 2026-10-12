/**
 * Recurring duties — Overview "Package summary" figures (PRF-2, build-plan
 * profile composition contract): duties due / done this week, 30-day
 * adherence and active count for one person and timeframe.
 *
 * Server only; imported by direct path from app/ (P1 profile shell).
 */
import { prisma } from '@/lib/prisma'
import { canViewPackageArea, loadPackageViewer } from '@/lib/package/access'
import { adherenceWindow, combineAdherence, weekCounts, type AdherenceWindow } from './adherence'
import { loadDutyTodoRows } from './duties.server'
import type { DutiesProfileSummary } from '../types'

/** Null when the viewer may not see the person's duties (§8). */
export async function getDutiesProfileSummary(
  viewerId: string,
  userId: string,
  timeframeId: string,
  now = new Date(),
): Promise<DutiesProfileSummary | null> {
  const viewer = await loadPackageViewer(viewerId)
  if (!(await canViewPackageArea(viewer, userId, 'duties'))) return null

  const duties = await prisma.recurringDuty.findMany({
    where: { ownerId: userId, timeframeId },
    select: { id: true, status: true },
  })
  if (duties.length === 0) return { dueThisWeek: 0, doneThisWeek: 0, adherence30d: null, activeCount: 0 }

  const rowsByDuty = await loadDutyTodoRows(
    duties.map((d) => d.id),
    now,
  )
  let dueThisWeek = 0
  let doneThisWeek = 0
  const windows: AdherenceWindow[] = []
  for (const duty of duties) {
    const rows = rowsByDuty.get(duty.id) ?? []
    const week = weekCounts(rows, now)
    dueThisWeek += week.due
    doneThisWeek += week.done
    windows.push(adherenceWindow(rows, now, 30))
  }
  return {
    dueThisWeek,
    doneThisWeek,
    adherence30d: combineAdherence(windows).rate,
    activeCount: duties.filter((d) => d.status === 'ACTIVE').length,
  }
}
