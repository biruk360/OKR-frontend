import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canViewObjective } from '@/lib/permissions'
import { getDescendantObjectiveIds } from '@/lib/objectiveProgress'

const LEVELS = new Set(['COMPANY', 'DEPARTMENT', 'INDIVIDUAL'])

/**
 * Searchable parent-goal picker: same timeframe, ACTIVE objectives, optional level filter,
 * excludes self + descendants to keep the graph acyclic.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSessionSafe()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const timeframeId = searchParams.get('timeframeId')
    const q = (searchParams.get('q') || '').trim().toLowerCase()
    const excludeObjectiveId = searchParams.get('excludeObjectiveId')
    const levelFilter = searchParams.get('level')
    const activeTimeframeOnly = searchParams.get('activeTimeframeOnly') !== 'false'

    if (!timeframeId) {
      return NextResponse.json({ error: 'timeframeId is required' }, { status: 400 })
    }

    const tf = await prisma.timeframe.findUnique({ where: { id: timeframeId } })
    if (!tf) {
      return NextResponse.json({ error: 'Invalid timeframe' }, { status: 400 })
    }

    if (activeTimeframeOnly && !tf.isActive) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'Timeframe is inactive; alignment picker is empty.',
      })
    }

    let excludeIds = new Set<string>()
    if (excludeObjectiveId) {
      excludeIds.add(excludeObjectiveId)
      const desc = await getDescendantObjectiveIds(prisma, excludeObjectiveId)
      desc.forEach((id) => excludeIds.add(id))
    }

    const where: Record<string, unknown> = {
      timeframeId,
      status: 'ACTIVE',
      ...(excludeIds.size > 0 ? { id: { notIn: Array.from(excludeIds) } } : {}),
    }

    if (levelFilter && LEVELS.has(levelFilter)) {
      where.level = levelFilter
    }

    const objectives = await prisma.objective.findMany({
      where,
      take: q ? 200 : 80,
      orderBy: [{ level: 'asc' }, { title: 'asc' }],
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        department: { select: { id: true, name: true } },
        timeframe: { select: { id: true, name: true, type: true, isActive: true } },
      },
    })

    const filtered = q
      ? objectives.filter((o) => o.title.toLowerCase().includes(q))
      : objectives
    const capped = filtered.slice(0, 80)

    const processed = []
    for (const obj of capped) {
      const visibility = await canViewObjective(session.user.role as any, session.user.id, {
        level: obj.level,
        ownerId: obj.ownerId,
        departmentId: obj.departmentId,
        isPrivate: obj.isPrivate,
      })
      if (!visibility.canView) continue
      processed.push({
        id: obj.id,
        title: visibility.isRedacted ? '[Private Objective]' : obj.title,
        description: visibility.isRedacted ? null : obj.description,
        level: obj.level,
        goalStatus: obj.goalStatus,
        progress: obj.progress,
        owner: obj.owner,
        department: obj.department,
        timeframe: obj.timeframe,
      })
    }

    return NextResponse.json({ success: true, data: processed })
  } catch (error) {
    console.error('alignment-search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
