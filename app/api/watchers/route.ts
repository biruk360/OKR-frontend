import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiSuccess } from '@/lib/api/apiResponse'
import { withAuth } from '@/lib/api/withAuth'

const ENTITY_TYPES = ['OBJECTIVE', 'KEY_RESULT', 'TODO'] as const

/** GET /api/watchers?entityType=OBJECTIVE&entityId=... — list watchers, or if `mine=1`, current user's watches. */
export const GET = withAuth(async (req, { session }) => {
  const url = new URL(req.url)
  const mine = url.searchParams.get('mine') === '1'
  if (mine) {
    const rows = await prisma.watcher.findMany({ where: { userId: session.user.id } })
    return apiSuccess(rows)
  }
  const entityType = url.searchParams.get('entityType')
  const entityId = url.searchParams.get('entityId')
  if (!entityType || !entityId || !ENTITY_TYPES.includes(entityType as any)) return apiBadRequest('entityType and entityId required')
  const rows = await prisma.watcher.findMany({ where: { entityType, entityId } })
  return apiSuccess(rows)
})

/** POST { entityType, entityId } — opt-in to watch. */
export const POST = withAuth(async (req, { session }) => {
  const body = await req.json().catch(() => null)
  const entityType = String(body?.entityType ?? '')
  const entityId = String(body?.entityId ?? '')
  if (!ENTITY_TYPES.includes(entityType as any) || !entityId) return apiBadRequest('invalid entityType or entityId')
  const row = await prisma.watcher.upsert({
    where: { userId_entityType_entityId: { userId: session.user.id, entityType, entityId } },
    create: { userId: session.user.id, entityType, entityId },
    update: {},
  })
  return apiSuccess(row)
})

/** DELETE ?entityType=...&entityId=... — unwatch. */
export const DELETE = withAuth(async (req, { session }) => {
  const url = new URL(req.url)
  const entityType = url.searchParams.get('entityType') ?? ''
  const entityId = url.searchParams.get('entityId') ?? ''
  if (!ENTITY_TYPES.includes(entityType as any) || !entityId) return apiBadRequest('invalid entityType or entityId')
  await prisma.watcher.deleteMany({ where: { userId: session.user.id, entityType, entityId } })
  return apiSuccess({ removed: true })
})
