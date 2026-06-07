import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiPaginated, withRole, withRoleOrFeature } from '@/lib/api'

/**
 * GET /api/admin/ai-logs — list AiGenerationLog rows with filters + pagination.
 *
 * Query: page=1, limit=25, feature?, status?, modelId?, userId?, from? (ISO), to? (ISO).
 * Response: standard `{ success, data, pagination }` envelope. Each row joins the
 * generating user's email + role for the table view.
 */
export const GET = withRoleOrFeature(['ADMIN', 'EXECUTIVE'], 'page.admin.ai-logs', async (req: NextRequest) => {
  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') || 1))
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 25)))
  const feature = url.searchParams.get('feature') ?? undefined
  const status = url.searchParams.get('status') ?? undefined
  const modelId = url.searchParams.get('modelId') ?? undefined
  const userId = url.searchParams.get('userId') ?? undefined
  const provider = url.searchParams.get('provider') ?? undefined
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  const where: Prisma.AiGenerationLogWhereInput = {
    ...(feature && { feature }),
    ...(status && { status }),
    ...(modelId && { modelId }),
    ...(userId && { userId }),
    ...(provider && { provider }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    }),
  }

  const [rows, total] = await Promise.all([
    prisma.aiGenerationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.aiGenerationLog.count({ where }),
  ])

  const userIds = Array.from(new Set(rows.map((r) => r.userId)))
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true, role: true },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  const data = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    user: userMap.get(r.userId) ?? { id: r.userId, email: 'unknown', name: 'unknown', role: 'EMPLOYEE' },
    feature: r.feature,
    provider: r.provider,
    modelId: r.modelId,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cachedTokens: r.cachedTokens,
    cacheHitPct: r.inputTokens > 0 ? Math.round((r.cachedTokens / r.inputTokens) * 1000) / 10 : 0,
    costUsd: r.costUsd,
    latencyMs: r.latencyMs,
    status: r.status,
    errorMessage: r.errorMessage,
    planId: r.planId,
  }))

  return apiPaginated(data, { page, limit, total })
})
