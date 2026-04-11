import { prisma } from '@/lib/prisma'

function todayBucket(date: Date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Record a view of an objective by a user. Idempotent per (objective, user, day):
 * the first view of the day creates the row, subsequent views increment viewCount.
 * Failures are swallowed — view tracking is best-effort.
 */
export async function trackObjectiveView(objectiveId: string, userId: string): Promise<void> {
  try {
    const viewDate = todayBucket()
    const now = new Date()
    await prisma.objectiveView.upsert({
      where: { objectiveId_userId_viewDate: { objectiveId, userId, viewDate } },
      create: { objectiveId, userId, viewDate, viewCount: 1, firstViewAt: now, lastViewAt: now },
      update: { viewCount: { increment: 1 }, lastViewAt: now },
    })
  } catch (err) {
    console.error('[view-tracking] objective view failed', { objectiveId, userId, err })
  }
}

export async function trackKeyResultView(keyResultId: string, userId: string): Promise<void> {
  try {
    const viewDate = todayBucket()
    const now = new Date()
    await prisma.keyResultView.upsert({
      where: { keyResultId_userId_viewDate: { keyResultId, userId, viewDate } },
      create: { keyResultId, userId, viewDate, viewCount: 1, firstViewAt: now, lastViewAt: now },
      update: { viewCount: { increment: 1 }, lastViewAt: now },
    })
  } catch (err) {
    console.error('[view-tracking] key result view failed', { keyResultId, userId, err })
  }
}
