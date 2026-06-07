import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRole } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api/apiResponse'
import { permissionCache } from '@/lib/permission-cache'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeaturePermissionInput {
  featureKey: string
  visible: boolean
  enabled: boolean
}

// ---------------------------------------------------------------------------
// GET /api/permissions/roles/[id]/features
// Returns all FeaturePermission rows for the role.
// ---------------------------------------------------------------------------

export const GET = withRole<RouteIdParams>(['ADMIN'], async (_req: NextRequest, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid role id')

  const role = await prisma.role.findUnique({
    where: { id },
    select: { id: true, name: true, key: true },
  })
  if (!role) return apiNotFound('Role not found')

  const features = await prisma.featurePermission.findMany({
    where: { roleId: id },
    orderBy: { featureKey: 'asc' },
  })

  return apiSuccess({ role, features })
})

// ---------------------------------------------------------------------------
// PUT /api/permissions/roles/[id]/features
// Bulk upsert FeaturePermission rows.
// Body: { features: FeaturePermissionInput[] }
// ---------------------------------------------------------------------------

export const PUT = withRole<RouteIdParams>(['ADMIN'], async (req: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid role id')

  const role = await prisma.role.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!role) return apiNotFound('Role not found')

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.features)) {
    return apiBadRequest('Body must contain a "features" array')
  }

  const inputs: FeaturePermissionInput[] = body.features

  // Validate entries
  for (const item of inputs) {
    if (!item.featureKey || typeof item.featureKey !== 'string') {
      return apiBadRequest('Each feature entry must have a valid featureKey')
    }
    if (typeof item.visible !== 'boolean') {
      return apiBadRequest(`visible must be a boolean (featureKey "${item.featureKey}")`)
    }
    if (typeof item.enabled !== 'boolean') {
      return apiBadRequest(`enabled must be a boolean (featureKey "${item.featureKey}")`)
    }
  }

  // Bulk upsert in a transaction
  const updated = await prisma.$transaction(
    inputs.map((item) =>
      prisma.featurePermission.upsert({
        where: {
          roleId_featureKey: {
            roleId: id,
            featureKey: item.featureKey,
          },
        },
        create: {
          roleId: id,
          featureKey: item.featureKey,
          visible: item.visible,
          enabled: item.enabled,
          updatedById: session.user.id,
        },
        update: {
          visible: item.visible,
          enabled: item.enabled,
          updatedById: session.user.id,
        },
      })
    )
  )

  permissionCache.invalidateAll()

  return apiSuccess({ features: updated }, { message: 'Feature permissions updated successfully' })
})
