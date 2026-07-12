import { prisma } from '@/lib/prisma'

/**
 * Users who administer the performance module: legacy ADMIN users plus anyone
 * holding the ADMIN or PERFORMANCE_ADMIN RBAC role. Used as the HR recipient
 * set for performance notifications (disputes, recommended actions).
 */
export async function resolvePerformanceAdmins(): Promise<string[]> {
  const [legacy, rbac] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true, role: 'ADMIN' }, select: { id: true } }),
    prisma.userRole.findMany({
      where: {
        role: { key: { in: ['ADMIN', 'PERFORMANCE_ADMIN'] } },
        user: { isActive: true },
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      select: { userId: true },
    }),
  ])
  return Array.from(new Set([...legacy.map((user) => user.id), ...rbac.map((grant) => grant.userId)]))
}
