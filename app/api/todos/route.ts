import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext, canViewObjective, type UserRole } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'

/**
 * GET /api/todos — list todos visible to the current user.
 *
 * Scopes:
 *   - ?mine=assigned  → assigned to me (default for /dashboard/todos)
 *   - ?mine=created   → created by me
 *   - ?mine=all       → assigned OR created by me (broadest personal view)
 *
 * Optional filters:
 *   - ?status=PENDING|IN_PROGRESS|COMPLETED|CANCELLED
 *   - ?keyResultId=<id>   → todos under a specific KR
 *   - ?objectiveId=<id>   → todos under a specific objective (via KR or directly)
 *   - ?q=<text>           → case-insensitive title substring
 */
export async function GET(request: NextRequest) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const mine = (searchParams.get('mine') || 'all').toLowerCase()
  const status = searchParams.get('status')
  const keyResultId = searchParams.get('keyResultId')
  const objectiveId = searchParams.get('objectiveId')
  const q = searchParams.get('q')?.trim()

  const where: any = {}

  if (mine === 'assigned') {
    where.assigneeId = session.user.id
  } else if (mine === 'created') {
    where.creatorId = session.user.id
  } else {
    where.OR = [{ assigneeId: session.user.id }, { creatorId: session.user.id }]
  }

  if (status) where.status = status
  if (keyResultId) where.keyResultId = keyResultId
  if (objectiveId) {
    // A todo is "on" an objective if it either links directly OR its KR belongs to it.
    where.AND = [
      {
        OR: [
          { objectiveId },
          { keyResult: { objectiveId } },
        ],
      },
    ]
  }
  if (q) {
    where.AND = [...(where.AND || []), { title: { contains: q, mode: 'insensitive' as const } }]
  }

  const todos = await prisma.todo.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      creator: { select: { id: true, name: true, avatar: true } },
      keyResult: {
        select: {
          id: true,
          title: true,
          objective: { select: { id: true, title: true, level: true } },
        },
      },
      objective: { select: { id: true, title: true, level: true } },
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { updatedAt: 'desc' }],
    take: 500,
  })

  return NextResponse.json({ success: true, todos })
}

/**
 * POST /api/todos — create a todo.
 *
 * Shape:
 *   { title, description?, dueDate?, assigneeId?, keyResultId?, objectiveId? }
 *
 * Rules:
 *   - `title` required; everything else optional.
 *   - `assigneeId` defaults to the caller.
 *   - At most one "link target" is validated at a time, but both columns can be set
 *     (e.g. an Initiative on KR X that also contributes to objective Y).
 *   - When linked to a KR, the caller must have edit rights on that KR (via
 *     canEditKeyResultWithObjectiveContext). When linked to an objective only,
 *     the caller must at least be able to view it.
 *   - Standalone todos (no link) are always allowed — personal to-dos.
 *
 * Side effects:
 *   - If linked to a KR, the creation is recorded on the KR activity log.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const title = (body.title || '').trim()
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const description = typeof body.description === 'string' ? body.description.trim() || null : null
  const dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: 'Invalid dueDate' }, { status: 400 })
  }

  const assigneeId: string = body.assigneeId || session.user.id
  const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } })
  if (!assignee) return NextResponse.json({ error: 'Invalid assignee' }, { status: 400 })

  // Optional KR link + permission check
  let keyResultId: string | null = null
  if (body.keyResultId) {
    const kr = await prisma.keyResult.findUnique({
      where: { id: body.keyResultId },
      include: {
        objective: { select: { level: true, ownerId: true, departmentId: true } },
      },
    })
    if (!kr) return NextResponse.json({ error: 'Invalid keyResultId' }, { status: 400 })
    const allowed = await canEditKeyResultWithObjectiveContext(
      session.user.role as UserRole,
      session.user.id,
      { ownerId: kr.ownerId, objectiveId: kr.objectiveId },
      kr.objective
    )
    if (!allowed) {
      return NextResponse.json(
        { error: 'Insufficient permissions to add a todo to this key result' },
        { status: 403 }
      )
    }
    keyResultId = kr.id
  }

  // Optional Objective link + permission check (only needed when there's no KR — linking
  // to a KR already asserts its parent objective is accessible via the edit check).
  let objectiveId: string | null = null
  if (body.objectiveId) {
    const obj = await prisma.objective.findUnique({
      where: { id: body.objectiveId },
      select: { id: true, level: true, ownerId: true, departmentId: true, isPrivate: true },
    })
    if (!obj) return NextResponse.json({ error: 'Invalid objectiveId' }, { status: 400 })
    if (!keyResultId) {
      const { canView } = await canViewObjective(session.user.role as UserRole, session.user.id, obj)
      if (!canView) {
        return NextResponse.json({ error: 'Insufficient permissions to view this objective' }, { status: 403 })
      }
    }
    objectiveId = obj.id
  }

  const todo = await prisma.todo.create({
    data: {
      title,
      description,
      dueDate,
      status: 'PENDING',
      assigneeId,
      creatorId: session.user.id,
      keyResultId,
      objectiveId,
    },
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      creator: { select: { id: true, name: true, avatar: true } },
      keyResult: {
        select: {
          id: true,
          title: true,
          objective: { select: { id: true, title: true, level: true } },
        },
      },
      objective: { select: { id: true, title: true, level: true } },
    },
  })

  if (keyResultId) {
    await recordActivity({
      entityType: 'KEY_RESULT',
      keyResultId,
      objectiveId: todo.keyResult?.objective.id ?? null,
      action: 'INITIATIVE_ADDED',
      actorId: session.user.id,
      metadata: { initiativeId: todo.id, title: todo.title, assigneeId },
    })
  }

  return NextResponse.json({ success: true, todo }, { status: 201 })
}
