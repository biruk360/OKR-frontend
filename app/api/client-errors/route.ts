import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessSettings, type UserRole } from '@/lib/permissions'

const MAX_MESSAGE = 4000
const MAX_STACK = 50000
const MAX_EXTRA_JSON = 8000

type IncomingBody = {
  source?: string
  message?: string
  stack?: string
  url?: string
  route?: string
  userAgent?: string
  digest?: string
  extra?: Record<string, unknown>
}

function clampStr(s: string | undefined, max: number): string | undefined {
  if (s == null) return undefined
  const t = s.trim()
  if (!t) return undefined
  return t.length > max ? t.slice(0, max) + '…[truncated]' : t
}

function safeExtraJson(extra: Record<string, unknown> | undefined): string | undefined {
  if (!extra || typeof extra !== 'object') return undefined
  try {
    const raw = JSON.stringify(extra)
    return raw.length > MAX_EXTRA_JSON ? raw.slice(0, MAX_EXTRA_JSON) + '…' : raw
  } catch {
    return undefined
  }
}

export async function POST(request: NextRequest) {
  let body: IncomingBody
  try {
    body = (await request.json()) as IncomingBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const source = clampStr(body.source, 120) ?? 'unknown'
  const message = clampStr(body.message, MAX_MESSAGE) ?? '(no message)'
  const stack = clampStr(body.stack, MAX_STACK)
  const url = clampStr(body.url, 2000)
  const route = clampStr(body.route, 500)
  const userAgent = clampStr(body.userAgent, 500)
  const digest = clampStr(body.digest, 200)
  const extra = safeExtraJson(body.extra)

  const session = await getServerSessionSafe()
  const userId = session?.user?.id ?? null

  const logLine = {
    type: 'client_error',
    source,
    message,
    userId,
    route,
    url,
    digest,
  }
  console.error('[client-error]', JSON.stringify(logLine))

  try {
    await prisma.clientErrorLog.create({
      data: {
        source,
        message,
        stack: stack ?? null,
        url: url ?? null,
        route: route ?? null,
        userAgent: userAgent ?? null,
        userId,
        digest: digest ?? null,
        extra: extra ?? null,
      },
    })
  } catch (e) {
    console.error('[client-error] persist failed', e)
    return NextResponse.json({ ok: false, error: 'Log failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  const session = await getServerSessionSafe()
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!canAccessSettings(session.user.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await prisma.clientErrorLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  })

  return NextResponse.json({ items: rows })
}
