import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export async function POST(request: NextRequest, { params }: { params: RouteIdParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sprintId } = await resolveParams(params)
  if (!sprintId) return NextResponse.json({ error: 'Invalid sprint id' }, { status: 400 })

  const body = await request.json()
  const title = (body.title || '').trim()
  if (!title) return NextResponse.json({ error: 'Activity title is required' }, { status: 400 })

  const columnId: string | undefined = body.columnId
  if (!columnId) {
    return NextResponse.json({ error: 'Column is required' }, { status: 400 })
  }
  // Validate column belongs to this sprint
  const column = await prisma.sprintColumn.findUnique({ where: { id: columnId }, select: { sprintId: true } })
  if (!column || column.sprintId !== sprintId) {
    return NextResponse.json({ error: 'Invalid column for this sprint' }, { status: 400 })
  }

  const ownerId: string = body.ownerId || session.user.id
  // Validate owner exists
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } })
  if (!owner) return NextResponse.json({ error: 'Invalid owner' }, { status: 400 })

  // Optional KR link
  let keyResultId: string | null = null
  if (body.keyResultId) {
    const kr = await prisma.keyResult.findUnique({ where: { id: body.keyResultId }, select: { id: true } })
    if (!kr) return NextResponse.json({ error: 'Invalid key result link' }, { status: 400 })
    keyResultId = kr.id
  }

  // Optional Objective link
  let objectiveId: string | null = null
  if (body.objectiveId) {
    const obj = await prisma.objective.findUnique({ where: { id: body.objectiveId }, select: { id: true } })
    if (!obj) return NextResponse.json({ error: 'Invalid objective link' }, { status: 400 })
    objectiveId = obj.id
  }

  const last = await prisma.sprintActivity.findFirst({
    where: { sprintId, columnId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  const position = (last?.position ?? -1) + 1

  const activity = await prisma.sprintActivity.create({
    data: {
      sprintId,
      columnId,
      title,
      description: body.description?.trim() || null,
      ownerId,
      keyResultId,
      objectiveId,
      position,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      keyResult: { select: { id: true, title: true, objective: { select: { id: true, title: true } } } },
      objective: { select: { id: true, title: true } },
    },
  })

  return NextResponse.json({ success: true, activity }, { status: 201 })
}
