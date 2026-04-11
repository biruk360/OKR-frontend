import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'

type ActParams = { id: string; actId: string } | Promise<{ id: string; actId: string }>

/** List comments on a sprint activity (chronological). */
export async function GET(_request: NextRequest, { params }: { params: ActParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  // Verify activity belongs to sprint
  const activity = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    select: { sprintId: true },
  })
  if (!activity || activity.sprintId !== sprintId) {
    return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
  }

  const comments = await prisma.sprintActivityComment.findMany({
    where: { activityId: actId },
    include: { author: { select: { id: true, name: true, avatar: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ success: true, comments })
}

/** Create a comment. */
export async function POST(request: NextRequest, { params }: { params: ActParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json()
  const content = (body.content || '').trim()
  if (!content) return NextResponse.json({ error: 'Comment content is required' }, { status: 400 })
  if (content.length > 10000) {
    return NextResponse.json({ error: 'Comment is too long' }, { status: 400 })
  }

  const activity = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    select: { sprintId: true },
  })
  if (!activity || activity.sprintId !== sprintId) {
    return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
  }

  const comment = await prisma.sprintActivityComment.create({
    data: { activityId: actId, authorId: session.user.id, content },
    include: { author: { select: { id: true, name: true, avatar: true } } },
  })
  return NextResponse.json({ success: true, comment }, { status: 201 })
}
