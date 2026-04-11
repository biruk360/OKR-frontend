import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canViewKeyResult } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { trackKeyResultView } from '@/lib/view-tracking'

export async function POST(_request: NextRequest, { params }: { params: RouteIdParams }) {
  try {
    const session = await getServerSessionSafe()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await resolveParams(params)
    if (!id) return NextResponse.json({ error: 'Invalid key result id' }, { status: 400 })

    const keyResult = await prisma.keyResult.findUnique({
      where: { id },
      select: { id: true, ownerId: true, objectiveId: true, isPrivate: true },
    })
    if (!keyResult) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const visibility = await canViewKeyResult(session.user.role as any, session.user.id, keyResult)
    if (!visibility.canView) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    await trackKeyResultView(id, session.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error tracking key result view:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
