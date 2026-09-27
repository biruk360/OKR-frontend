import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import { nextAuthSecret, SESSION_MAX_AGE, verifyCredentials } from '@/lib/auth'
import { clientIp } from '@/lib/security/rate-limit'
import type { UserRole } from '@/types'

/**
 * POST /api/auth/login — credential login for the desktop companion app.
 *
 * Uses the same `verifyCredentials()` as the NextAuth CredentialsProvider
 * (rate limits, no passwordless login, uniform failure), then issues a
 * NextAuth-compatible JWT (4h, same secret + claims as the cookie session,
 * including `authTime` so a later password change revokes it).
 * The desktop app sends it as `Authorization: Bearer <token>`; `withAuth`
 * decodes it via `getBearerSession`.
 *
 * Response shape is intentionally NOT the standard apiSuccess envelope —
 * the desktop login screen reads `token` / `accessToken` / `user` at the
 * top level. Errors keep `{ error }` (plus `success: false`) for the same reason.
 */

interface LoginBody {
  email?: unknown
  password?: unknown
}

export async function POST(request: NextRequest) {
  if (!nextAuthSecret) {
    return NextResponse.json(
      { success: false, error: 'Server auth is not configured' },
      { status: 500 }
    )
  }

  let body: LoginBody
  try {
    body = (await request.json()) as LoginBody
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: 'Email and password are required' },
      { status: 400 }
    )
  }

  const check = await verifyCredentials(email, password, clientIp(request.headers))
  if (!check.ok) {
    if (check.reason === 'rate_limited') {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please wait a few minutes and try again.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(check.retryAfterMs / 1000))) } }
      )
    }
    return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 })
  }
  const user = check.user

  const claims = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    isProjectManager: user.isProjectManager,
    avatar: user.avatar,
    authTime: Date.now(),
  }

  const token = await encode({
    token: claims,
    secret: nextAuthSecret,
    maxAge: SESSION_MAX_AGE,
  })

  return NextResponse.json({
    token,
    accessToken: token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isProjectManager: user.isProjectManager,
      avatar: user.avatar,
      designation: user.designation,
      isActive: user.isActive,
    },
  })
}
