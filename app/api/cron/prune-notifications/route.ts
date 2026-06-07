import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Notification retention cron.
 * - Marks unread notifications older than 30 days as read (keeps them visible briefly).
 * - Deletes read notifications older than 90 days (keeps the table bounded).
 *
 * Safe to run nightly. Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (expected) {
    const auth = request.headers.get('authorization') || ''
    const key = auth.replace(/^Bearer\s+/i, '') || new URL(request.url).searchParams.get('key') || ''
    if (key !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  try {
    const [markedRead, deleted] = await Promise.all([
      prisma.notification.updateMany({
        where: { isRead: false, createdAt: { lt: thirtyDaysAgo } },
        data: { isRead: true },
      }),
      prisma.notification.deleteMany({
        where: { isRead: true, createdAt: { lt: ninetyDaysAgo } },
      }),
    ])

    return NextResponse.json({
      success: true,
      markedRead: markedRead.count,
      deleted: deleted.count,
    })
  } catch (err) {
    console.error('[cron/prune-notifications] failed', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

export const GET = POST
