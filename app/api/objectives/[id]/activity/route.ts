import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canViewObjective } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export async function GET(_request: NextRequest, { params }: { params: RouteIdParams }) {
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

    const [logs, views] = await Promise.all([
      prisma.activityLog.findMany({
        where: { objectiveId: id },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          actor: { select: { id: true, name: true, avatar: true } },
        },
      }),
      prisma.objectiveView.findMany({
        where: { objectiveId: id },
        orderBy: { lastViewAt: 'desc' },
        take: 50,
        include: {
          user: { select: { id: true, name: true, avatar: true } },
        },
      }),
    ])

    const parsed = logs.map((log) => ({
      ...log,
      changes: log.changes ? safeParse(log.changes) : null,
      metadata: log.metadata ? safeParse(log.metadata) : null,
    }))

    return NextResponse.json({ success: true, logs: parsed, views })
  } catch (error) {
    console.error('Error fetching objective activity:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return s }
}
