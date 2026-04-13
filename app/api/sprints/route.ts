import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, withAuth } from '@/lib/api'

/**
 * GET — list sprints visible to the user. Today everyone sees all ACTIVE sprints;
 * tighten this when team-scoped sprints land.
 */
export const GET = withAuth(async (request: NextRequest) => {
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

  return apiSuccess(sprints)
})

const DEFAULT_COLUMNS = [
  { name: 'Backlog', position: 0, color: null },
  { name: 'In progress', position: 1, color: '#0b6e99' },
  { name: 'Review', position: 2, color: '#cb912f' },
  { name: 'Done', position: 3, color: '#0f7b6c' },
]

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const body = await request.json()
  const { name, description, startDate, endDate } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return apiBadRequest('Sprint name is required')
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

  return apiSuccess(sprint, { status: 201 })
})
