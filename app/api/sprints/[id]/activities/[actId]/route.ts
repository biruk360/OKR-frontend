import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'

type ActParams = { id: string; actId: string } | Promise<{ id: string; actId: string }>

export async function PATCH(request: NextRequest, { params }: { params: ActParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json()

  const existing = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    select: { sprintId: true, columnId: true, position: true },
  })
  if (!existing || existing.sprintId !== sprintId) {
    return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
  }

  const data: any = {}
  if (typeof body.title === 'string') data.title = body.title.trim()
  if (typeof body.description === 'string' || body.description === null) data.description = body.description
  if (typeof body.ownerId === 'string') data.ownerId = body.ownerId
  if (body.keyResultId === null) data.keyResultId = null
  else if (typeof body.keyResultId === 'string') data.keyResultId = body.keyResultId
  if (body.objectiveId === null) data.objectiveId = null
  else if (typeof body.objectiveId === 'string') data.objectiveId = body.objectiveId
  if (body.dueDate === null) data.dueDate = null
  else if (typeof body.dueDate === 'string') data.dueDate = new Date(body.dueDate)

  // Move support: { columnId, position } — if columnId provided, validate column belongs to sprint.
  if (typeof body.columnId === 'string') {
    const col = await prisma.sprintColumn.findUnique({
      where: { id: body.columnId },
      select: { sprintId: true },
    })
    if (!col || col.sprintId !== sprintId) {
      return NextResponse.json({ error: 'Invalid column for this sprint' }, { status: 400 })
    }
    data.columnId = body.columnId
  }
  if (typeof body.position === 'number') {
    data.position = body.position
  }

  const activity = await prisma.sprintActivity.update({
    where: { id: actId },
    data,
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      keyResult: { select: { id: true, title: true, objective: { select: { id: true, title: true } } } },
      objective: { select: { id: true, title: true } },
    },
  })

  return NextResponse.json({ success: true, activity })
}

export async function DELETE(_request: NextRequest, { params }: { params: ActParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const existing = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    select: { sprintId: true, ownerId: true },
  })
  if (!existing || existing.sprintId !== sprintId) {
    return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
  }

  await prisma.sprintActivity.delete({ where: { id: actId } })
  return NextResponse.json({ success: true })
}
