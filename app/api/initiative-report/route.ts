import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/initiative-report?from=YYYY-MM-DD&to=YYYY-MM-DD&departmentId=...
 *
 * Returns a team report grid:
 *   - Rows: each initiative (with KR + objective context)
 *   - Columns: each date in [from, to]
 *   - Cells: the InitiativeUpdate content for that (initiative, date), or null if missing
 *
 * Missing dates are flagged as "no update" — the UI renders them as red/empty.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') || defaultFrom()
  const to = searchParams.get('to') || today()
  const departmentId = searchParams.get('departmentId')

  // All active initiatives visible to the user (or scoped to a department)
  const where: any = {
    status: { in: ['PENDING', 'IN_PROGRESS'] },
  }
  if (departmentId) {
    where.OR = [
      { keyResult: { objective: { departmentId } } },
      { objective: { departmentId } },
    ]
  }
  if (session.user.role === 'EMPLOYEE') {
    where.OR = [
      { assigneeId: session.user.id },
      { creatorId: session.user.id },
    ]
  }

  const initiatives = await prisma.todo.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      keyResult: {
        select: {
          id: true,
          title: true,
          objective: { select: { id: true, title: true } },
        },
      },
      objective: { select: { id: true, title: true } },
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 200,
  })

  const initiativeIds = initiatives.map((i) => i.id)

  // Fetch all updates in the date range for these initiatives
  const updates = initiativeIds.length > 0
    ? await prisma.initiativeUpdate.findMany({
        where: {
          initiativeId: { in: initiativeIds },
          updateDate: { gte: from, lte: to },
        },
        include: { author: { select: { id: true, name: true } } },
        orderBy: { updateDate: 'asc' },
      })
    : []

  // Build a lookup: initiativeId -> { date -> update }
  const updateMap = new Map<string, Map<string, typeof updates[0]>>()
  for (const u of updates) {
    if (!updateMap.has(u.initiativeId)) updateMap.set(u.initiativeId, new Map())
    updateMap.get(u.initiativeId)!.set(u.updateDate, u)
  }

  // Generate date columns (weekdays only)
  const dates = generateWeekdayDates(from, to)

  const rows = initiatives.map((init) => {
    const dayMap = updateMap.get(init.id) || new Map()
    const days = dates.map((date) => {
      const update = dayMap.get(date)
      return {
        date,
        hasUpdate: !!update,
        content: update?.content ?? null,
        status: update?.status ?? null,
        blockers: update?.blockers ?? null,
        authorName: update?.author?.name ?? null,
      }
    })
    const totalDays = dates.length
    const updatedDays = days.filter((d) => d.hasUpdate).length
    return {
      id: init.id,
      title: init.title,
      status: init.status,
      assignee: init.assignee,
      krTitle: init.keyResult?.title ?? null,
      objectiveTitle: init.keyResult?.objective.title ?? init.objective?.title ?? null,
      compliancePct: totalDays > 0 ? Math.round((updatedDays / totalDays) * 100) : 0,
      days,
    }
  })

  return NextResponse.json({ success: true, dates, rows })
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function defaultFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 13) // Last 2 weeks
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function generateWeekdayDates(from: string, to: string): string[] {
  const result: string[] = []
  const current = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) {
      result.push(current.toISOString().slice(0, 10))
    }
    current.setDate(current.getDate() + 1)
  }
  return result
}
