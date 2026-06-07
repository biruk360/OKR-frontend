import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function isoWeekKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (expected) {
    const auth = request.headers.get('authorization') || ''
    const key = auth.replace(/^Bearer\s+/i, '') || new URL(request.url).searchParams.get('key') || ''
    if (key !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const weekKey = isoWeekKey(new Date())
  const employees = await prisma.improvementFocus.groupBy({
    by: ['employeeId'],
    where: { status: 'ACTIVE', employee: { isActive: true } },
    _count: { id: true },
  })
  let delivered = 0
  for (const employee of employees) {
    const exists = await prisma.performanceNudgeDelivery.findUnique({
      where: { employeeId_weekKey: { employeeId: employee.employeeId, weekKey } },
    })
    if (exists) continue
    const focuses = await prisma.improvementFocus.findMany({
      where: { employeeId: employee.employeeId, status: 'ACTIVE' },
      include: { criterion: { select: { title: true } } },
    })
    const message = focuses.map((focus) => `${focus.criterion.title}: ${focus.targetText}`).join(' · ')
    await prisma.$transaction([
      prisma.notification.create({
        data: {
          type: 'PERF_WEEKLY_FOCUS',
          eventKey: 'PERF_WEEKLY_FOCUS',
          category: 'PERFORMANCE',
          title: 'Your weekly growth focus',
          message,
          userId: employee.employeeId,
          metadata: JSON.stringify({ weekKey, focusIds: focuses.map((focus) => focus.id), scoreFree: true }),
          emailMode: 'DIGEST_WEEKLY',
        },
      }),
      prisma.performanceNudgeDelivery.create({
        data: { employeeId: employee.employeeId, weekKey, focusCount: focuses.length },
      }),
    ])
    delivered++
  }
  return NextResponse.json({ success: true, weekKey, delivered })
}

export const GET = POST

