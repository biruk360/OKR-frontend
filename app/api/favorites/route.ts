import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiSuccess } from '@/lib/api/apiResponse'
import { withAuth } from '@/lib/api/withAuth'

const ENTITY_TYPES = ['OBJECTIVE', 'KEY_RESULT', 'TODO'] as const
type EntityType = typeof ENTITY_TYPES[number]
function isEntityType(v: unknown): v is EntityType {
  return typeof v === 'string' && (ENTITY_TYPES as readonly string[]).includes(v)
}

/** GET /api/favorites?entityType=OBJECTIVE — current user's favorited ids. */
export const GET = withAuth(async (req, { session }) => {
  const url = new URL(req.url)
  const entityType = url.searchParams.get('entityType') ?? 'OBJECTIVE'
  if (!isEntityType(entityType)) return apiBadRequest('invalid entityType')
  const rows = await prisma.favorite.findMany({
    where: { userId: session.user.id, entityType },
    select: { entityId: true },
  })
  return apiSuccess({ ids: rows.map((r) => r.entityId) })
})

/** POST { entityType, entityId } — add to favorites (idempotent via upsert). */
export const POST = withAuth(async (req, { session }) => {
  const body = await req.json().catch(() => null)
  const entityType = String(body?.entityType ?? '')
  const entityId = String(body?.entityId ?? '')
  if (!isEntityType(entityType) || !entityId) return apiBadRequest('entityType and entityId required')
  const row = await prisma.favorite.upsert({
    where: {
      userId_entityType_entityId: { userId: session.user.id, entityType, entityId },
    },
    create: { userId: session.user.id, entityType, entityId },
    update: {},
  })
  return apiSuccess(row)
})

/** DELETE ?entityType=OBJECTIVE&entityId=… — remove from favorites. */
export const DELETE = withAuth(async (req, { session }) => {
  const url = new URL(req.url)
  const entityType = url.searchParams.get('entityType') ?? ''
  const entityId = url.searchParams.get('entityId') ?? ''
  if (!isEntityType(entityType) || !entityId) return apiBadRequest('entityType and entityId required')
  await prisma.favorite.deleteMany({
    where: { userId: session.user.id, entityType, entityId },
  })
  return apiSuccess({ removed: true })
})
