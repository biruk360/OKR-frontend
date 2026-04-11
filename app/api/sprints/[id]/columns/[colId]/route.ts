import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'

type ColParams = { id: string; colId: string } | Promise<{ id: string; colId: string }>

export async function PATCH(request: NextRequest, { params }: { params: ColParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sprintId, colId } = await resolveParams(params)
  if (!sprintId || !colId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json()
  const data: any = {}
  if (typeof body.name === 'string') data.name = body.name.trim()
  if (typeof body.color === 'string' || body.color === null) data.color = body.color
  if (typeof body.position === 'number') data.position = body.position

  try {
    const column = await prisma.sprintColumn.update({
      where: { id: colId },
      data,
    })
    return NextResponse.json({ success: true, column })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'A column with that name already exists in this sprint' }, { status: 409 })
    }
    throw err
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: ColParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sprintId, colId } = await resolveParams(params)
  if (!sprintId || !colId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  // Block deleting the last column — every sprint needs at least one place to put cards.
  const remaining = await prisma.sprintColumn.count({ where: { sprintId } })
  if (remaining <= 1) {
    return NextResponse.json({ error: 'A sprint must have at least one column' }, { status: 400 })
  }

  await prisma.sprintColumn.delete({ where: { id: colId } })
  return NextResponse.json({ success: true })
}
