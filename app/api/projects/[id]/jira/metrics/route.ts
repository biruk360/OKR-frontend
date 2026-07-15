import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { getReadableProject } from '@/lib/projects/access'
import { getJiraDeveloperMetrics } from '@/features/projects/services/jira/metrics'

export const GET = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const url = new URL(req.url)
  const now = new Date()
  const from = parseDateParam(url.searchParams.get('from')) ?? daysAgoUtc(now, 13)
  const to = parseDateParam(url.searchParams.get('to')) ?? now
  const holidays = new Set(
    (url.searchParams.get('holidays') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )

  return apiSuccess(await getJiraDeveloperMetrics(prisma, {
    projectId: params.id,
    from,
    to,
    holidays,
  }))
})

function parseDateParam(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysAgoUtc(now: Date, days: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days))
}
