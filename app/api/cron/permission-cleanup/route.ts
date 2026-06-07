import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { permissionCache } from '@/lib/permission-cache'
import { recordActivity } from '@/lib/activity-log'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const xCronSecret = req.headers.get('x-cron-secret')
  const validBearer = authHeader === 'Bearer ' + secret
  const validHeader = xCronSecret === secret

  if (!validBearer && !validHeader) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  return Response.json({
    ok: true,
    revokedUserRoles: revokedRoles.length,
    revokedOverrides: revokedOverrides.length,
    timestamp: now.toISOString(),
  })
}
