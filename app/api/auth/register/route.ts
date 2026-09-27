import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiValidationError, handleApiError } from '@/lib/api'
import { emit } from '@/lib/notifications'
import { runAfterResponse } from '@/lib/background'
import { AUTH_RATE_LIMITS, clientIp, hitRateLimit, rateLimitedResponse } from '@/lib/security/rate-limit'
// Direct service import (not the barrel): the barrel also exports client components.
import { registerSchema } from '@/features/auth/services/signup-schema'

/**
 * Product decision (2026-09-25): self-registered accounts REQUIRE ADMIN
 * ACTIVATION. They are created inactive (EMPLOYEE); an admin activates them
 * from Settings → Users, and admins are notified via ADMIN_USER_CREATED.
 * Sign-in refuses inactive accounts (lib/auth.ts verifyCredentials).
 */
const SIGNUP_REQUIRES_ACTIVATION = true

/**
 * Same body for new and already-registered emails, so sign-up cannot be used
 * to probe accounts. The sign-up form shows this as its "pending activation" state.
 */
const GENERIC_MESSAGE =
  'Account created. An administrator must activate it before you can sign in. If this email already has an account, sign in with its existing password.'

/**
 * POST /api/auth/register — public self sign-up.
 *
 * Security:
 * - `role` in the body is ignored; every self-registered account is EMPLOYEE,
 *   created inactive until an admin activates it.
 * - Rate-limited per client IP.
 * - Existing email → identical 201 response (no enumeration). The bcrypt hash
 *   runs before the lookup so both paths cost the same.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = hitRateLimit(`register:ip:${clientIp(request.headers)}`, AUTH_RATE_LIMITS.registerIp)
    if (!limit.allowed) return rateLimitedResponse(limit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiBadRequest('Invalid request body')

    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? 'Invalid sign-up details', parsed.error.issues)
    }
    const { name, email, password } = parsed.data

    const hashedPassword = await bcrypt.hash(password, 12)

    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    })

    if (!existing) {
      try {
        const user = await prisma.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role: 'EMPLOYEE',
            isActive: !SIGNUP_REQUIRES_ACTIVATION,
          },
          select: { id: true, name: true, email: true, role: true },
        })
        // Tell admins there is an account waiting for activation. Off the
        // request path so a new vs. existing email costs the same.
        runAfterResponse('register:notify-admins', () =>
          emit('ADMIN_USER_CREATED', {
            entityType: 'USER', entityId: user.id,
            data: {
              newUserName: user.name,
              newUserEmail: user.email,
              newUserRole: SIGNUP_REQUIRES_ACTIVATION
                ? `${user.role} (self sign-up — pending activation)`
                : `${user.role} (self sign-up)`,
            },
          }),
        )
      } catch (err) {
        // Lost a race with a concurrent sign-up for the same email: same generic answer.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
      }
    }

    return apiSuccess(
      { requiresActivation: SIGNUP_REQUIRES_ACTIVATION },
      { status: 201, message: GENERIC_MESSAGE },
    )
  } catch (error) {
    return handleApiError(error, 'POST /api/auth/register')
  }
}
