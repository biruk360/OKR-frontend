import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'

type ActParams = { id: string; actId: string } | Promise<{ id: string; actId: string }>

/**
 * Convert a sprint activity into an Initiative (Todo row) linked to a Key Result.
 *
 * Requirements:
 *   - Activity must have a keyResultId (initiatives live under a KR)
 *     — if the client only has an objectiveId link, it must pass `keyResultId` in the body
 *       or pick one via the UI before calling this.
 *
 * Behavior:
 *   - Creates the Todo with title/description/assignee copied from the activity
 *   - Stamps convertedInitiativeId on the sprint activity so the UI can show "converted"
 *   - Activity itself is NOT deleted — user can still see it on the board and jump to the initiative
 */
export async function POST(request: NextRequest, { params }: { params: ActParams }) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json().catch(() => ({}))

  const activity = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    include: {
      owner: { select: { id: true, name: true } },
      keyResult: { select: { id: true, objectiveId: true } },
    },
  })
  if (!activity || activity.sprintId !== sprintId) {
    return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
  }
  if (activity.convertedInitiativeId) {
    return NextResponse.json(
      { error: 'This activity has already been converted to an initiative', initiativeId: activity.convertedInitiativeId },
      { status: 409 }
    )
  }

  // Resolve the target KR — either already linked on the activity, or provided in the body.
  const explicitKrId: string | undefined = body.keyResultId
  const keyResultId = explicitKrId || activity.keyResultId
  if (!keyResultId) {
    return NextResponse.json(
      { error: 'Initiatives must live under a Key Result. Link the activity to a KR first or pass keyResultId in the request body.' },
      { status: 400 }
    )
  }
  const kr = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    select: { id: true, objectiveId: true, status: true },
  })
  if (!kr) return NextResponse.json({ error: 'Key result not found' }, { status: 404 })
  if (kr.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Target key result must be active' }, { status: 400 })
  }

  const initiative = await prisma.$transaction(async (tx) => {
    const created = await tx.todo.create({
      data: {
        title: activity.title,
        description: activity.description || '',
        assigneeId: activity.ownerId,
        creatorId: session.user.id,
        keyResultId,
        status: 'PENDING',
        dueDate: activity.dueDate,
      },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        creator: { select: { id: true, name: true, avatar: true } },
      },
    })
    await tx.sprintActivity.update({
      where: { id: actId },
      data: { convertedInitiativeId: created.id, keyResultId },
    })
    return created
  })

  // Mirror the creation onto the KR's activity log for parity with the normal initiative add flow.
  await recordActivity({
    entityType: 'KEY_RESULT',
    keyResultId,
    objectiveId: kr.objectiveId,
    action: 'INITIATIVE_ADDED',
    actorId: session.user.id,
    metadata: {
      initiativeId: initiative.id,
      title: initiative.title,
      convertedFromSprintActivityId: actId,
    },
  })

  return NextResponse.json({ success: true, initiative }, { status: 201 })
}
