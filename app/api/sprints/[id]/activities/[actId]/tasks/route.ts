import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'

type ActParams = { id: string; actId: string } | Promise<{ id: string; actId: string }>

export async function GET(_request: NextRequest, { params }: { params: ActParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const activity = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    select: { sprintId: true },
  })
  if (!activity || activity.sprintId !== sprintId) {
    return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
  }

  const tasks = await prisma.sprintActivityTask.findMany({
    where: { activityId: actId },
    include: { assignee: { select: { id: true, name: true, avatar: true } } },
    orderBy: { position: 'asc' },
  })
  return NextResponse.json({ success: true, tasks })
}

export async function POST(request: NextRequest, { params }: { params: ActParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json()
  const title = (body.title || '').trim()
  if (!title) return NextResponse.json({ error: 'Task title is required' }, { status: 400 })

  const activity = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    select: { sprintId: true },
  })
  if (!activity || activity.sprintId !== sprintId) {
    return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
  }

  let assigneeId: string | null = null
  if (body.assigneeId) {
    const user = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { id: true } })
    if (!user) return NextResponse.json({ error: 'Invalid assignee' }, { status: 400 })
    assigneeId = user.id
  }

  const last = await prisma.sprintActivityTask.findFirst({
    where: { activityId: actId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  const position = (last?.position ?? -1) + 1

  const task = await prisma.sprintActivityTask.create({
    data: { activityId: actId, title, assigneeId, position },
    include: { assignee: { select: { id: true, name: true, avatar: true } } },
  })
  return NextResponse.json({ success: true, task }, { status: 201 })
}
