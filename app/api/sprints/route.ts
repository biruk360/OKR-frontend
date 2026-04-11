import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET — list sprints visible to the user (their own + shared "ACTIVE" ones).
 * For now everyone sees all ACTIVE sprints; tighten this once team-scoped sprints land.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'ACTIVE'

  const sprints = await prisma.sprint.findMany({
    where: { status },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      _count: { select: { activities: true, columns: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ success: true, sprints })
}

const DEFAULT_COLUMNS = [
  { name: 'Backlog', position: 0, color: null },
  { name: 'In progress', position: 1, color: '#0b6e99' },
  { name: 'Review', position: 2, color: '#cb912f' },
  { name: 'Done', position: 3, color: '#0f7b6c' },
]

export async function POST(request: NextRequest) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { name, description, startDate, endDate } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Sprint name is required' }, { status: 400 })
    }

    const sprint = await prisma.sprint.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        ownerId: session.user.id,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: 'ACTIVE',
        columns: { create: DEFAULT_COLUMNS },
      },
      include: { columns: true },
    })

    return NextResponse.json({ success: true, sprint }, { status: 201 })
  } catch (error) {
    console.error('Error creating sprint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
