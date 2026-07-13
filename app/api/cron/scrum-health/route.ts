import { NextRequest, NextResponse } from 'next/server'
import { runScrumHealth } from '@/features/scrum/services/scrum-jobs'

function authorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) return true
  const auth = request.headers.get('authorization') || ''
  const key = auth.replace(/^Bearer\s+/i, '') || new URL(request.url).searchParams.get('key') || ''
  return key === expected
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ success: true, ...(await runScrumHealth()) })
}

export const GET = POST
