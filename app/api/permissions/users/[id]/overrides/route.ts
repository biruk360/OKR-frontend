import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiNotFound, apiBadRequest, apiForbidden } from '@/lib/api/apiResponse'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { permissionCache } from '@/lib/permission-cache'
import { invalidateFieldPermLevelCache } from '@/lib/field-filter'

const VALID_OVERRIDE_TYPES = ['grant', 'deny'] as const
type OverrideType = (typeof VALID_OVERRIDE_TYPES)[number]

function isValidOverrideType(value: unknown): value is OverrideType {
  return VALID_OVERRIDE_TYPES.includes(value as OverrideType)
}

/**
 * GET /api/permissions/users/[id]/overrides
 *
 * Returns all UserPermissionOverride records for the given user.
 * Restricted to ADMIN.
 */
export const GET = withRole<RouteIdParams>(['ADMIN'], async (_req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid user id')

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) return apiNotFound('User not found')

  const overrides = await prisma.userPermissionOverride.findMany({
    where: { userId: id },
    orderBy: { grantedAt: 'desc' },
  })

  return apiSuccess(overrides)
})

/**
 * POST /api/permissions/users/[id]/overrides
 *
 * Creates a new UserPermissionOverride for the given user.
 *
 * Body: {
 *   doctypeKey?: string
 *   featureKey?: string
 *   action?: string
 *   overrideType: 'grant' | 'deny'
 *   reason: string          (min 10 chars)
 *   expiresAt?: string      (ISO-8601, must be future)
 * }
 * Restricted to ADMIN.
 */
export const POST = withRole<RouteIdParams>(['ADMIN'], async (req: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid user id')

  // Self-modification protection
  if (session.user.id === id) {
    return apiForbidden('Cannot modify own permissions')
  }

  const body = await req.json().catch(() => null)
  if (!body) return apiBadRequest('Invalid request body')

  const {
    doctypeKey,
    featureKey,
    action,
    overrideType,
    reason,
    expiresAt,
  } = body as {
    doctypeKey?: string
    featureKey?: string
    action?: string
    overrideType?: string
    reason?: string
    expiresAt?: string
  }

  // Validate overrideType
  if (!overrideType || !isValidOverrideType(overrideType)) {
    return apiBadRequest(`overrideType must be one of: ${VALID_OVERRIDE_TYPES.join(', ')}`)
  }

  // Validate reason (required, min 10 chars; always required for 'deny')
  if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
    return apiBadRequest('reason is required and must be at least 10 characters')
  }

  // Validate expiresAt is future if provided
  let expiresAtDate: Date | null = null
  if (expiresAt !== undefined && expiresAt !== null) {
    expiresAtDate = new Date(expiresAt)
    if (isNaN(expiresAtDate.getTime())) {
      return apiBadRequest('expiresAt must be a valid ISO-8601 date string')
    }
    if (expiresAtDate <= new Date()) {
      return apiBadRequest('expiresAt must be a future date')
    }
  }

  // Verify the target user exists
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) return apiNotFound('User not found')

  const override = await prisma.userPermissionOverride.create({
    data: {
      userId: id,
      doctypeKey: doctypeKey?.trim() ?? null,
      featureKey: featureKey?.trim() ?? null,
      action: action?.trim() ?? null,
      overrideType,
      reason: reason.trim(),
      grantedById: session.user.id,
      expiresAt: expiresAtDate,
    },
  })

  permissionCache.invalidateUser(id)
  invalidateFieldPermLevelCache(id)

  return apiSuccess(override, { status: 201, message: 'Permission override created successfully' })
})
