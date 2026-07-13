import { NextRequest, NextResponse } from 'next/server'
import { recomputeAllActiveProjects } from '@/lib/projects/health'

/**
 * Nightly project-health recompute (build spec §5.3, daily 02:00).
 * Recomputes confidence, RAG, SPI/CPI/EAC, and %planned for all active projects,
 * emitting RAG-change / went-RED notifications. Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (expected) {
    const auth = request.headers.get('authorization') || ''
    const url = new URL(request.url)
    const key = auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || ''
    if (key !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const result = await recomputeAllActiveProjects()
  return NextResponse.json({ success: true, ...result })
}

export const GET = POST
