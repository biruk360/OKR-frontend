import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { permissionCache } from '@/lib/permission-cache'
import { recordActivity } from '@/lib/activity-log'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Revokes expired UserRole assignments and permission overrides.
 *
 * Auth: withCronAuth (lib/cron-auth.ts) — `Authorization: Bearer $CRON_SECRET`
 * or `x-cron-secret`. This route used to compare against `'Bearer ' + secret`,
 * so with CRON_SECRET unset a literal `Bearer undefined` was accepted.
 */
export const POST = withCronAuth(async () => {
  const now = new Date()

  const expiredUserRoles = await prisma.userRole.findMany({
    where: {
      expiresAt: { not: null, lt: now },
    },
    select: { id: true, userId: true, roleId: true },
  })

  const revokedRoles: string[] = []
  for (const ur of expiredUserRoles) {
    await prisma.userRole.delete({ where: { id: ur.id } })
    revokedRoles.push(ur.id)
    try {
      await recordActivity({
        entityType: 'user_role' as any,
        action: 'revoked' as any,
        actorId: null,
        metadata: { userRoleId: ur.id, userId: ur.userId, roleId: ur.roleId },
      })
    } catch {
      // best-effort
    }
  }

  const expiredOverrides = await prisma.userPermissionOverride.findMany({
    where: {
      expiresAt: { not: null, lt: now },
    },
    select: { id: true, userId: true },
  })

  const revokedOverrides: string[] = []
  for (const o of expiredOverrides) {
    await prisma.userPermissionOverride.delete({ where: { id: o.id } })
    revokedOverrides.push(o.id)
    try {
      await recordActivity({
        entityType: 'user_permission_override' as any,
        action: 'revoked' as any,
        actorId: null,
        metadata: { overrideId: o.id, userId: o.userId },
      })
    } catch {
      // best-effort
    }
  }

  permissionCache.invalidateAll()

  return NextResponse.json({
    success: true,
    revokedUserRoles: revokedRoles.length,
    revokedOverrides: revokedOverrides.length,
    timestamp: now.toISOString(),
  })
})

export const GET = POST
