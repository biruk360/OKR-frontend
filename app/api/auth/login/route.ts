import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { nextAuthSecret } from '@/lib/auth'
import type { UserRole } from '@/types'

/**
 * POST /api/auth/login — credential login for the desktop companion app.
 *
 * Mirrors the NextAuth CredentialsProvider authorize() logic, then issues a
 * NextAuth-compatible JWT (4h, same secret + claims as the cookie session).
 * The desktop app sends it as `Authorization: Bearer <token>`; `withAuth`
 * decodes it via `getBearerSession`.
 *
 * Response shape is intentionally NOT the standard apiSuccess envelope —
 * the desktop login screen reads `token` / `accessToken` / `user` at the
 * top level.
 */

const SESSION_MAX_AGE = 4 * 60 * 60 // 4 hours — matches authOptions.session.maxAge

interface LoginBody {
  email?: unknown
  password?: unknown
}

export async function POST(request: NextRequest) {
  if (!nextAuthSecret) {
    return NextResponse.json(
      { error: 'Server auth is not configured' },
      { status: 500 }
    )
  }

  let body: LoginBody
  try {
    body = (await request.json()) as LoginBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) {
    return NextResponse.json(
      { error: 'Email and password are required' },
      { status: 400 }
    )
  }

  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.findUnique({ where: { email: email.toLowerCase() } }))

  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  if (user.password) {
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
  }
  // Users without a password set: same behavior as CredentialsProvider
  // (allowed — see lib/auth.ts authorize()).

  const claims = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    avatar: user.avatar,
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
      avatar: user.avatar,
      designation: user.designation,
      isActive: user.isActive,
    },
  })
}
