import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'

type CommentParams =
  | { id: string; actId: string; commentId: string }
  | Promise<{ id: string; actId: string; commentId: string }>

export async function PATCH(request: NextRequest, { params }: { params: CommentParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { commentId } = await resolveParams(params)
  if (!commentId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json()
  const content = (body.content || '').trim()
  if (!content) return NextResponse.json({ error: 'Content is required' }, { status: 400 })

  const existing = await prisma.sprintActivityComment.findUnique({
    where: { id: commentId },
    select: { authorId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  if (existing.authorId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the author can edit this comment' }, { status: 403 })
  }

  const comment = await prisma.sprintActivityComment.update({
    where: { id: commentId },
    data: { content },
    include: { author: { select: { id: true, name: true, avatar: true } } },
  })
  return NextResponse.json({ success: true, comment })
}

export async function DELETE(_request: NextRequest, { params }: { params: CommentParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { commentId } = await resolveParams(params)
  if (!commentId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const existing = await prisma.sprintActivityComment.findUnique({
    where: { id: commentId },
    select: { authorId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  if (existing.authorId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the author can delete this comment' }, { status: 403 })
  }

  await prisma.sprintActivityComment.delete({ where: { id: commentId } })
  return NextResponse.json({ success: true })
}
