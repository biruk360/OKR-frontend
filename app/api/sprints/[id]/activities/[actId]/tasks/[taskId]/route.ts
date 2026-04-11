import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'

type TaskParams =
  | { id: string; actId: string; taskId: string }
  | Promise<{ id: string; actId: string; taskId: string }>

export async function PATCH(request: NextRequest, { params }: { params: TaskParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actId, taskId } = await resolveParams(params)
  if (!actId || !taskId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const existing = await prisma.sprintActivityTask.findUnique({
    where: { id: taskId },
    select: { activityId: true, status: true },
  })
  if (!existing || existing.activityId !== actId) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const body = await request.json()
  const data: any = {}
  if (typeof body.title === 'string') data.title = body.title.trim()
  if (body.assigneeId === null) data.assigneeId = null
  else if (typeof body.assigneeId === 'string') {
    const user = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { id: true } })
    if (!user) return NextResponse.json({ error: 'Invalid assignee' }, { status: 400 })
    data.assigneeId = user.id
  }
  if (typeof body.status === 'string') {
    if (body.status !== 'PENDING' && body.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    data.status = body.status
    data.completedAt = body.status === 'COMPLETED' ? new Date() : null
  }
  if (typeof body.position === 'number') data.position = body.position

  const task = await prisma.sprintActivityTask.update({
    where: { id: taskId },
    data,
    include: { assignee: { select: { id: true, name: true, avatar: true } } },
  })
  return NextResponse.json({ success: true, task })
}

export async function DELETE(_request: NextRequest, { params }: { params: TaskParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actId, taskId } = await resolveParams(params)
  if (!actId || !taskId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const existing = await prisma.sprintActivityTask.findUnique({
    where: { id: taskId },
    select: { activityId: true },
  })
  if (!existing || existing.activityId !== actId) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  await prisma.sprintActivityTask.delete({ where: { id: taskId } })
  return NextResponse.json({ success: true })
}
