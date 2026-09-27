import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import {
  buildObjectiveVisibilityWhere,
  loadViewerContext,
  redactObjectiveForViewer,
} from '@/lib/okr/visibility-scope'
import { getDescendantObjectiveIds } from '@/lib/objectiveProgress'
import { apiSuccess, apiBadRequest, withAuth } from '@/lib/api'

const LEVELS = new Set(['COMPANY', 'DEPARTMENT', 'INDIVIDUAL'])

/**
 * Searchable parent-goal picker: same timeframe, ACTIVE objectives, optional level filter,
 * excludes self + descendants to keep the graph acyclic.
 */
export const GET = withAuth(async (request: NextRequest, { session }) => {
  const { searchParams } = new URL(request.url)
  const timeframeId = searchParams.get('timeframeId')
  const q = (searchParams.get('q') || '').trim()
  const excludeObjectiveId = searchParams.get('excludeObjectiveId')
  const levelFilter = searchParams.get('level')
  const activeTimeframeOnly = searchParams.get('activeTimeframeOnly') !== 'false'

  if (!timeframeId) return apiBadRequest('timeframeId is required')

  const tf = await prisma.timeframe.findUnique({ where: { id: timeframeId } })
  if (!tf) return apiBadRequest('Invalid timeframe')

  if (activeTimeframeOnly && !tf.isActive) {
    return apiSuccess([], { message: 'Timeframe is inactive; alignment picker is empty.' })
  }

  const excludeIds = new Set<string>()
  if (excludeObjectiveId) {
    excludeIds.add(excludeObjectiveId)
    const desc = await getDescendantObjectiveIds(prisma, excludeObjectiveId)
    desc.forEach((id) => excludeIds.add(id))
  }

  const ctx = await loadViewerContext({ id: session.user.id, role: session.user.role })

  const filters: Prisma.ObjectiveWhereInput[] = [
    buildObjectiveVisibilityWhere(ctx),
    { timeframeId, status: 'ACTIVE' },
  ]
  if (excludeIds.size > 0) filters.push({ id: { notIn: Array.from(excludeIds) } })
  if (levelFilter && LEVELS.has(levelFilter)) filters.push({ level: levelFilter })
  if (q) {
    // Search in the database, and only over titles the viewer may read — a
    // redacted objective must not be discoverable by its hidden title.
    filters.push(buildObjectiveVisibilityWhere(ctx, { includeRedacted: false }))
    filters.push({ title: { contains: q, mode: 'insensitive' } })
  }

  const objectives = await prisma.objective.findMany({
    where: { AND: filters },
    take: 80,
    orderBy: [{ level: 'asc' }, { title: 'asc' }],
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      department: { select: { id: true, name: true } },
      timeframe: { select: { id: true, name: true, type: true, isActive: true } },
    },
  })

  // One context load for the whole list (was 1–2 queries per row).
  const processed = objectives.map((obj) => {
    const shown = redactObjectiveForViewer(ctx, obj)
    return {
      id: obj.id,
      title: shown.title,
      description: shown.description,
      level: obj.level,
      goalStatus: obj.goalStatus,
      progress: obj.progress,
      owner: obj.owner,
      department: obj.department,
      timeframe: obj.timeframe,
    }
  })

  return apiSuccess(processed)
})
