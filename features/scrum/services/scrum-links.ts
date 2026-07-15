import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { SCRUM_LINK_CONTEXTS } from '@/types/scrum'

export const scrumLinkInputSchema = z.object({
  objectiveId: z.string().min(1).optional().nullable(),
  keyResultId: z.string().min(1).optional().nullable(),
  todoId: z.string().min(1).optional().nullable(),
  context: z.enum(SCRUM_LINK_CONTEXTS),
  progressNote: z.string().trim().max(120).optional().nullable(),
}).refine((value) => [value.objectiveId, value.keyResultId, value.todoId].filter(Boolean).length === 1, {
  message: 'Exactly one linked entity is required',
})

export type ScrumLinkInput = z.infer<typeof scrumLinkInputSchema>

export function deriveLinkType(input: Pick<ScrumLinkInput, 'objectiveId' | 'keyResultId' | 'todoId'>) {
  if (input.objectiveId) return 'OBJECTIVE'
  if (input.keyResultId) return 'KEY_RESULT'
  return 'TODO'
}

export async function replaceUpdateLinks(updateId: string, createdById: string, links: ScrumLinkInput[] = [], tx: any = prisma) {
  await tx.scrumUpdateLink.deleteMany({ where: { updateId } })
  if (links.length === 0) return []
  return Promise.all(links.map((link) => tx.scrumUpdateLink.create({
    data: {
      updateId,
      objectiveId: link.objectiveId ?? null,
      keyResultId: link.keyResultId ?? null,
      todoId: link.todoId ?? null,
      linkType: deriveLinkType(link),
      context: link.context,
      progressNote: link.progressNote ?? null,
      createdById,
    },
  })))
}

export async function getLinkableEntities(subjectUserId: string, ownerOnly = false) {
  const memberships = await prisma.departmentMembership.findMany({
    where: { userId: subjectUserId, endedAt: null },
    select: { departmentId: true },
  })
  const deptIds = memberships.map((row) => row.departmentId)

  const objectiveWhere: any = {
    status: 'ACTIVE',
    timeframe: { isActive: true },
  }
  if (ownerOnly) {
    objectiveWhere.ownerId = subjectUserId
  } else {
    objectiveWhere.OR = [
      { ownerId: subjectUserId },
      { contributors: { some: { userId: subjectUserId } } },
      deptIds.length ? { departmentId: { in: deptIds } } : { id: '___none___' },
    ]
  }

  const keyResultWhere: any = {
    status: 'ACTIVE',
    objective: { status: 'ACTIVE', timeframe: { isActive: true } },
  }
  if (ownerOnly) {
    keyResultWhere.ownerId = subjectUserId
  } else {
    keyResultWhere.OR = [
      { ownerId: subjectUserId },
      { objective: { contributors: { some: { userId: subjectUserId } } } },
    ]
  }

  const [objectives, keyResults, todos, suggested] = await Promise.all([
    prisma.objective.findMany({
      where: objectiveWhere,
      select: { id: true, title: true, progress: true, confidence: true },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    }),
    prisma.keyResult.findMany({
      where: keyResultWhere,
      select: { id: true, title: true, progress: true, confidence: true, objective: { select: { title: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    }),
    prisma.todo.findMany({
      where: {
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        OR: [
          { assigneeId: subjectUserId },
          { members: { some: { userId: subjectUserId } } },
        ],
      },
      select: { id: true, title: true, status: true, keyResult: { select: { title: true } }, objective: { select: { title: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    }),
    getSuggestedLinks(subjectUserId),
  ])

  return { objectives, keyResults, todos, suggested }
}

export async function validateLinkOwnership(
  subjectUserId: string,
  links: Array<{ objectiveId?: string | null; keyResultId?: string | null }>,
) {
  const objectiveIds = new Set<string>()
  const keyResultIds = new Set<string>()
  for (const link of links) {
    if (link.objectiveId) objectiveIds.add(link.objectiveId)
    if (link.keyResultId) keyResultIds.add(link.keyResultId)
  }
  if (objectiveIds.size) {
    const objectives = await prisma.objective.findMany({
      where: { id: { in: [...objectiveIds] } },
      select: { id: true, ownerId: true },
    })
    for (const obj of objectives) {
      if (obj.ownerId !== subjectUserId) return { valid: false, reason: `Objective is not owned by the user` }
    }
  }
  if (keyResultIds.size) {
    const keyResults = await prisma.keyResult.findMany({
      where: { id: { in: [...keyResultIds] } },
      select: { id: true, ownerId: true },
    })
    for (const kr of keyResults) {
      if (kr.ownerId !== subjectUserId) return { valid: false, reason: `Key result is not owned by the user` }
    }
  }
  return { valid: true }
}

export async function getSuggestedLinks(subjectUserId: string) {
  const recent = await prisma.scrumUpdate.findMany({
    where: { userId: subjectUserId },
    orderBy: { scrumDate: 'desc' },
    take: 3,
    include: { links: true },
  })
  const counts = new Map<string, { type: string; id: string; count: number }>()
  for (const update of recent) {
    for (const link of update.links) {
      const id = link.objectiveId ?? link.keyResultId ?? link.todoId
      if (!id) continue
      const key = `${link.linkType}:${id}`
      const current = counts.get(key) ?? { type: link.linkType, id, count: 0 }
      current.count++
      counts.set(key, current)
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8)
}
