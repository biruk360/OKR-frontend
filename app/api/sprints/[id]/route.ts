import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

/** Full sprint with columns + activities (board fetch). */
export async function GET(_request: NextRequest, { params }: { params: RouteIdParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await resolveParams(params)
  if (!id) return NextResponse.json({ error: 'Invalid sprint id' }, { status: 400 })

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      columns: {
        orderBy: { position: 'asc' },
        include: {
          activities: {
            orderBy: { position: 'asc' },
            include: {
              owner: { select: { id: true, name: true, avatar: true } },
              keyResult: {
                select: {
                  id: true,
                  title: true,
                  objective: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!sprint) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ success: true, sprint })
}

export async function PATCH(request: NextRequest, { params }: { params: RouteIdParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await resolveParams(params)
  if (!id) return NextResponse.json({ error: 'Invalid sprint id' }, { status: 400 })

  const body = await request.json()
  const data: any = {}
  if (typeof body.name === 'string') data.name = body.name.trim()
  if (typeof body.description === 'string' || body.description === null) data.description = body.description
  if (typeof body.status === 'string') data.status = body.status
  if (body.startDate) data.startDate = new Date(body.startDate)
  if (body.endDate) data.endDate = new Date(body.endDate)

  const sprint = await prisma.sprint.update({ where: { id }, data })
  return NextResponse.json({ success: true, sprint })
}

export async function DELETE(_request: NextRequest, { params }: { params: RouteIdParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await resolveParams(params)
  if (!id) return NextResponse.json({ error: 'Invalid sprint id' }, { status: 400 })

  const sprint = await prisma.sprint.findUnique({ where: { id }, select: { ownerId: true } })
  if (!sprint) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (sprint.ownerId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the owner can delete this sprint' }, { status: 403 })
  }

  await prisma.sprint.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
