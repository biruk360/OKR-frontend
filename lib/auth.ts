import { getServerSession, NextAuthOptions } from 'next-auth'
import * as React from 'react'
import type { Session } from 'next-auth'
import { decode, encode, getToken } from 'next-auth/jwt'
import type { NextRequest, NextResponse } from 'next/server'
import CredentialsProvider from 'next-auth/providers/credentials'
import type { User as DbUser } from '@prisma/client'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import { UserRole } from '@/types'
import {
  AUTH_RATE_LIMITS,
  clientIp,
  emailKey,
  hitRateLimit,
  peekRateLimit,
} from '@/lib/security/rate-limit'
import { authTimeFromClaims, isAuthTimeStale } from '@/lib/security/auth-tokens'

/**
 * JWT signing secret. In production you must set NEXTAUTH_SECRET (e.g. openssl rand -base64 32).
 * A dev-only fallback avoids opaque 500s when .env.local is missing locally.
 */
export const nextAuthSecret =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== 'production'
    ? 'local-dev-nextauth-secret-not-for-production'
    : undefined)

if (process.env.NODE_ENV === 'production' && !process.env.NEXTAUTH_SECRET) {
  console.error(
    '[auth] NEXTAUTH_SECRET is not set. Sessions may fail; set NEXTAUTH_SECRET in your environment.'
  )
}

/** 4 hours — matches the client-side idle timeout. Shared with /api/auth/login. */
export const SESSION_MAX_AGE = 4 * 60 * 60

/** A session whose JWT carries `authTime` (epoch ms the credentials were proven). */
type SessionWithAuthTime = Session & { authTime?: number }

let dummyHashPromise: Promise<string> | null = null
/** Constant-cost bcrypt target so unknown/passwordless accounts take as long as real ones. */
function dummyHash(): Promise<string> {
  dummyHashPromise ??= bcrypt.hash('timing-equaliser-not-a-real-password', 12)
  return dummyHashPromise
}

export type CredentialCheck =
  | { ok: true; user: DbUser }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'rate_limited'; retryAfterMs: number }

/**
 * The one credential check shared by NextAuth (cookie sessions) and
 * POST /api/auth/login (desktop bearer tokens).
 *
 * - Rate-limited per client IP (every attempt) and per account (failures only).
 * - A user with no password hash can NEVER sign in. Invited users (created with
 *   password=null, isActive=false) must first set one through the invite link
 *   (/auth/reset-password?token=…), which also activates them.
 * - Unknown email, no password, wrong password and inactive account all return
 *   the same `invalid` after the same bcrypt cost, so the response does not
 *   reveal which accounts exist.
 */
export async function verifyCredentials(
  rawEmail: string,
  password: string,
  ip: string,
): Promise<CredentialCheck> {
  const email = rawEmail.trim()
  if (!email || !password) return { ok: false, reason: 'invalid' }

  const ipLimit = hitRateLimit(`login:ip:${ip}`, AUTH_RATE_LIMITS.loginIp)
  if (!ipLimit.allowed) return { ok: false, reason: 'rate_limited', retryAfterMs: ipLimit.retryAfterMs }
  const accountKey = `login:email:${emailKey(email)}`
  const accountLimit = peekRateLimit(accountKey, AUTH_RATE_LIMITS.loginEmailFailures)
  if (!accountLimit.allowed) {
    return { ok: false, reason: 'rate_limited', retryAfterMs: accountLimit.retryAfterMs }
  }

  const lower = email.toLowerCase()
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (lower !== email ? await prisma.user.findUnique({ where: { email: lower } }) : null)

  let passwordOk = false
  if (user?.password) {
    passwordOk = await bcrypt.compare(password, user.password)
  } else {
    // No hash (unknown email, or invited user who never set one): burn the same
    // bcrypt cost, then fail. Never the old "any password works" demo branch.
    await bcrypt.compare(password, await dummyHash())
  }

  if (!user || !passwordOk || !user.isActive) {
    hitRateLimit(accountKey, AUTH_RATE_LIMITS.loginEmailFailures)
    return { ok: false, reason: 'invalid' }
  }
  return { ok: true, user }
}

export const authOptions: NextAuthOptions = {
  secret: nextAuthSecret,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const check = await verifyCredentials(
          credentials.email,
          credentials.password,
          clientIp(req?.headers as Record<string, string | string[] | undefined> | undefined),
        )
        // Surfaces as `signIn(...).error === 'RATE_LIMITED'` in SignInForm.
        if (!check.ok && check.reason === 'rate_limited') throw new Error('RATE_LIMITED')
        if (!check.ok) return null
        const user = check.user

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as UserRole,
          isProjectManager: user.isProjectManager,
          avatar: user.avatar
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.isProjectManager = user.isProjectManager
        token.avatar = user.avatar
        // When the credentials were proven. NextAuth re-stamps `iat` every time
        // it rolls the cookie, so `iat` cannot be used to detect a session that
        // predates a password change — this claim is carried forward instead.
        token.authTime = Date.now()
      } else if (typeof token.authTime !== 'number') {
        // Session minted before authTime existed: pin it to its current iat.
        token.authTime = authTimeFromClaims(token) ?? Date.now()
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!
        session.user.role = token.role as UserRole
        session.user.isProjectManager = token.isProjectManager === true
        session.user.avatar = token.avatar as string
        ;(session as SessionWithAuthTime).authTime = authTimeFromClaims(token) ?? undefined
      }
      return session
    }
  },
  pages: {
    signIn: '/auth/signin',
  }
}

/**
 * next-auth's getServerSession() throws on some bad session responses (see next-auth RSC path).
 * That surfaces as HTTP 500 for the whole route. This wrapper returns null instead.
 */
async function getServerSessionSafeUncached(): Promise<Session | null> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user.id) return session

    // Capabilities can be granted or revoked while a JWT session is active.
    // Resolve the current database values on every authenticated server request
    // so reload is sufficient and stale tokens cannot retain revoked access.
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, isActive: true, isProjectManager: true, passwordChangedAt: true },
    })
    if (!currentUser?.isActive) return null
    // Password changed / admin reset since this session signed in → revoked.
    if (isAuthTimeStale((session as SessionWithAuthTime).authTime, currentUser.passwordChangedAt)) {
      return null
    }
    session.user.role = currentUser.role as UserRole
    session.user.isProjectManager = currentUser.isProjectManager
    return session
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[auth] getServerSession failed:', msg)
    return null
  }
}

/**
 * React `cache()` when available (Next's bundled React canary): memoised per
 * request inside a server-component render, so a layout + page pair costs one
 * session decode + one user lookup instead of two. Outside a render (route
 * handlers, cron, tsx scripts/tests) React has no cache dispatcher and calls the
 * function directly; plain React 18 (no `cache` export) gets the identity wrapper.
 * Never shared across requests.
 */
type RequestCache = <T extends (...args: never[]) => unknown>(fn: T) => T
const requestCache: RequestCache =
  (React as unknown as { cache?: RequestCache }).cache ?? ((fn) => fn)

export const getServerSessionSafe: () => Promise<Session | null> = requestCache(getServerSessionSafeUncached)

/**
 * Resolve a session from an `Authorization: Bearer <jwt>` header.
 * Used by the desktop companion app, which cannot rely on cookies.
 * The token is a NextAuth-compatible JWT issued by POST /api/auth/login.
 */
export async function getBearerSession(req: NextRequest): Promise<Session | null> {
  const header = req.headers.get('authorization')
  if (!header || !header.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  if (!token || !nextAuthSecret) return null
  try {
    const decoded = await decode({ token, secret: nextAuthSecret })
    if (!decoded?.sub) return null
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { role: true, isActive: true, isProjectManager: true, passwordChangedAt: true },
    })
    if (!currentUser?.isActive) return null
    if (isAuthTimeStale(authTimeFromClaims(decoded), currentUser.passwordChangedAt)) return null
    return {
      user: {
        id: decoded.sub,
        email: (decoded.email as string) ?? '',
        name: (decoded.name as string) ?? '',
        role: currentUser.role as UserRole,
        isProjectManager: currentUser.isProjectManager,
        avatar: (decoded.avatar as string | null) ?? null,
      },
      expires: new Date(((decoded.exp as number) ?? 0) * 1000).toISOString(),
    } as Session
  } catch {
    return null
  }
}

/**
 * After the signed-in user changes their own password, every older session is
 * revoked by `passwordChangedAt`. This re-mints the *current* cookie session
 * with `authTime` = the change time so the device that made the change stays
 * signed in. No-op for bearer (desktop) requests — those re-login.
 */
export async function reissueSessionCookie(
  req: NextRequest,
  res: NextResponse,
  authTime: number,
): Promise<void> {
  if (!nextAuthSecret) return
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return
  // Same cookie-name rule next-auth uses (getToken / default cookies).
  const secure = process.env.NEXTAUTH_URL?.startsWith('https://') ?? !!process.env.VERCEL
  const cookieName = secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token'
  const token = await getToken({ req, secret: nextAuthSecret, secureCookie: secure })
  if (!token?.sub) return
  const encoded = await encode({
    token: { ...token, authTime },
    secret: nextAuthSecret,
    maxAge: SESSION_MAX_AGE,
  })
  res.cookies.set(cookieName, encoded, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: SESSION_MAX_AGE,
  })
}
