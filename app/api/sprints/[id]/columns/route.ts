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
  const name = (body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Column name is required' }, { status: 400 })

  // Position = current max + 1
  const lastColumn = await prisma.sprintColumn.findFirst({
    where: { sprintId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  const position = (lastColumn?.position ?? -1) + 1

  try {
    const column = await prisma.sprintColumn.create({
      data: { sprintId, name, position, color: body.color || null },
    })
    return NextResponse.json({ success: true, column }, { status: 201 })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'A column with that name already exists in this sprint' }, { status: 409 })
    }
    throw err
  }
}
