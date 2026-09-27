import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import {
  buildKeyResultVisibilityWhere,
  loadViewerContext,
} from '@/lib/okr/visibility-scope'
import { ancestorPaths, loadInitiativeRows } from '../_shared'

export const dynamic = 'force-dynamic'

const MAX_KRS = 50

/**
 * GET /api/okr-hierarchy/initiatives?keyResultId=<id>[&keyResultId=<id>…]
 *
 * On-demand INIT rows for the OKR hierarchy tree (the main feed only returns
 * per-KR counts). Same row shape and visibility rule as the main feed: only KRs
 * the viewer sees unredacted, and only cards the viewer may see there
 * (`initiativeVisibilityWhere`).
 */
export const GET = withAuth(async (req, { session }) => {
  if (session.user.userType === 'CLIENT_PORTAL') return apiForbidden('Forbidden')

  const url = new URL((req as NextRequest).url)
  const ids = Array.from(new Set(
    url.searchParams.getAll('keyResultId').flatMap((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  ))
  if (ids.length === 0) return apiBadRequest('keyResultId is required')
  if (ids.length > MAX_KRS) return apiBadRequest(`At most ${MAX_KRS} key results per request`)

  const viewer = { id: session.user.id, role: session.user.role, userType: session.user.userType }
  const ctx = await loadViewerContext(viewer)

  const krs = await prisma.keyResult.findMany({
    where: {
      AND: [
        { id: { in: ids } },
        { status: { not: 'DELETED' } },
        buildKeyResultVisibilityWhere(ctx, { includeRedacted: false }),
      ],
    },
    select: {
      id: true,
      objective: {
        select: {
          id: true,
          parentObjectiveId: true,
          timeframe: { select: { id: true, name: true } },
        },
      },
    },
  })

  const paths = await ancestorPaths(krs.map((k) => k.objective))
  const krPath = new Map<string, { path: string[]; period: { id: string; name: string } | null }>()
  for (const kr of krs) {
    krPath.set(kr.id, {
      path: [...(paths.get(kr.objective.id) ?? [kr.objective.id]), kr.id],
      period: kr.objective.timeframe ?? null,
    })
  }

  return apiSuccess({ rows: await loadInitiativeRows(viewer, ctx, krPath) })
})
