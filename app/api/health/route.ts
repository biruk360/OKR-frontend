import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** Quick diagnostics: GET /api/health — 200 if DB responds, 503 otherwise */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, database: 'up' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    console.error('[health] database check failed:', message)
    return NextResponse.json({ ok: false, database: 'down', message }, { status: 503 })
  }
}
