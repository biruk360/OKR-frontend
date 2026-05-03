import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

/**
 * GET /api/org/tree?withObjectives=1&timeframeId=…
 *
 * Returns the company → departments → members tree in a single payload.
 * When withObjectives=1, each department and person carries the OKRs they
 * own/contain for the requested timeframe (or current active timeframes).
 *
 * The strategy map calls this in Combined mode. Designed for one round-trip
 * with no N+1: 4 queries total regardless of org size.
 */
export const GET = withAuth(async (request: NextRequest) => {
  const url = new URL(request.url)
  const withObjectives = url.searchParams.get('withObjectives') === '1'
  const timeframeId = url.searchParams.get('timeframeId') || undefined

  const [settings, departments, users, objectives] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { id: 'singleton' },
      include: { ceo: { select: { id: true, name: true, email: true, avatar: true, role: true } } },
    }),
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        memberships: {
          where: { endedAt: null },
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true, role: true, isActive: true } },
          },
        },
        _count: { select: { objectives: true } },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, avatar: true, role: true },
    }),
    withObjectives
      ? prisma.objective.findMany({
          where: { status: 'ACTIVE', ...(timeframeId ? { timeframeId } : {}) },
          select: {
            id: true, title: true, level: true, progress: true, confidence: true,
            ownerId: true, departmentId: true, parentObjectiveId: true, timeframeId: true,
          },
        })
      : Promise.resolve([] as any[]),
  ])

  const objByDept = new Map<string, any[]>()
  const objByOwner = new Map<string, any[]>()
  const companyObjs: any[] = []
  for (const o of objectives) {
    if (o.level === 'COMPANY') companyObjs.push(o)
    else if (o.level === 'DEPARTMENT' && o.departmentId) {
      if (!objByDept.has(o.departmentId)) objByDept.set(o.departmentId, [])
      objByDept.get(o.departmentId)!.push(o)
    } else if (o.ownerId) {
      if (!objByOwner.has(o.ownerId)) objByOwner.set(o.ownerId, [])
      objByOwner.get(o.ownerId)!.push(o)
    }
  }

  const tree = {
    company: {
      name: settings?.companyName ?? 'Company',
      ceo: settings?.ceo ?? null,
      objectives: companyObjs,
    },
    departments: departments.map((d) => {
      const head = d.memberships.find((m) => m.role === 'HEAD')?.user ?? null
      return {
        id: d.id,
        name: d.name,
        description: d.description,
        head,
        members: d.memberships.map((m) => ({
          membershipId: m.id,
          role: m.role,
          isPrimary: m.isPrimary,
          user: m.user,
          objectives: withObjectives ? (objByOwner.get(m.user.id) ?? []) : undefined,
        })),
        objectiveCount: d._count.objectives,
        objectives: withObjectives ? (objByDept.get(d.id) ?? []) : undefined,
      }
    }),
    unassignedUsers: users.filter(
      (u) => !departments.some((d) => d.memberships.some((m) => m.user.id === u.id)),
    ),
  }

  return apiSuccess(tree)
})
