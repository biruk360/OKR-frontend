import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

function todayBucket(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** List daily updates for an initiative. */
export async function GET(_request: NextRequest, { params }: { params: RouteIdParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await resolveParams(params)
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const updates = await prisma.initiativeUpdate.findMany({
    where: { initiativeId: id },
    include: { author: { select: { id: true, name: true, avatar: true } } },
    orderBy: { updateDate: 'desc' },
    take: 90,
  })
  return NextResponse.json({ success: true, updates })
}

/** Create or update today's daily update (upsert per initiative+date). */
export async function POST(request: NextRequest, { params }: { params: RouteIdParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await resolveParams(params)
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json()
  const content = (body.content || '').trim()
  if (!content) return NextResponse.json({ error: 'Update content is required' }, { status: 400 })
  if (content.length > 5000) return NextResponse.json({ error: 'Update too long' }, { status: 400 })

  const initiative = await prisma.todo.findUnique({ where: { id }, select: { id: true } })
  if (!initiative) return NextResponse.json({ error: 'Initiative not found' }, { status: 404 })

  const updateDate = body.updateDate || todayBucket()

  const update = await prisma.initiativeUpdate.upsert({
    where: { initiativeId_updateDate: { initiativeId: id, updateDate } },
    create: {
      initiativeId: id,
      authorId: session.user.id,
      updateDate,
      content,
      status: body.status || null,
      blockers: body.blockers?.trim() || null,
    },
    update: {
      content,
      status: body.status || undefined,
      blockers: body.blockers?.trim() || undefined,
    },
    include: { author: { select: { id: true, name: true, avatar: true } } },
  })

  return NextResponse.json({ success: true, update }, { status: 201 })
}
