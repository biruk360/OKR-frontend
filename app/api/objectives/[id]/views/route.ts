import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canViewObjective } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { trackObjectiveView } from '@/lib/view-tracking'

/** POST is fire-and-forget — the client beacons this when an objective detail page mounts. */
export async function POST(_request: NextRequest, { params }: { params: RouteIdParams }) {
  try {
    const session = await getServerSessionSafe()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await resolveParams(params)
    if (!id) return NextResponse.json({ error: 'Invalid objective id' }, { status: 400 })

    const objective = await prisma.objective.findUnique({
      where: { id },
      select: { id: true, level: true, ownerId: true, departmentId: true, isPrivate: true },
    })
    if (!objective) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const visibility = await canViewObjective(session.user.role as any, session.user.id, objective)
    if (!visibility.canView) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    await trackObjectiveView(id, session.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error tracking objective view:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
