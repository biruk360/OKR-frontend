import { NextRequest, NextResponse } from 'next/server'
import { recomputeAllActiveProjects } from '@/lib/projects/health'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Nightly project-health recompute (build spec §5.3, daily 02:00).
 * Recomputes confidence, RAG, SPI/CPI/EAC, and %planned for all active projects,
 * emitting RAG-change / went-RED notifications. Protected by CRON_SECRET.
 */
export const POST = withCronAuth(async (request: NextRequest) => {
  const result = await recomputeAllActiveProjects()
  return NextResponse.json({ success: true, ...result })
})

export const GET = POST
