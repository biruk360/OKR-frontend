import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { prisma } from '@/lib/prisma'
import { canReadBriefing } from '@/lib/automations/access'
import type { BriefingBlock, FindingBlock } from '@/types/automations'
import type { UserRole } from '@/types'

interface RouteParams { id: string }

/**
 * Promote a Finding into a real record (FR-12).
 *
 * Deliberately a *manual* action, never automatic: it is the escape valve that
 * keeps the generic-document model from being a dead end, without reintroducing
 * the "AI created 300 tasks overnight" failure mode the DRY_RUN gate exists to
 * prevent. The created record carries a back-link to the Briefing.
 */
const bodySchema = z.object({
  dedupeKey: z.string().min(1),
  target: z.enum(['TODO', 'RISK']),
  title: z.string().trim().min(1).max(300).optional(),
  assigneeId: z.string().min(1).optional(),
  dueDate: z.string().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
}).strict()

function findingFrom(blocks: unknown, dedupeKey: string): FindingBlock | null {
  if (!Array.isArray(blocks)) return null
  const match = (blocks as BriefingBlock[]).find(
    (b): b is FindingBlock => b.type === 'finding' && b.dedupeKey === dedupeKey
  )
  return match ?? null
}

/** Flatten a finding's fields into a readable body, with provenance at the end. */
function describeFinding(finding: FindingBlock, briefingTitle: string, briefingId: string, appPath: string): string {
  const lines: string[] = []
  if (finding.fields) {
    for (const [key, value] of Object.entries(finding.fields)) lines.push(`${key}: ${value}`)
  }
  if (finding.url) lines.push(`Source: ${finding.url}`)
  lines.push('', `From the automation briefing "${briefingTitle}" (${appPath}/${briefingId}).`)
  return lines.join('\n')
}

export const POST = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  const briefing = await prisma.automationBriefing.findUnique({
    where: { id: params.id },
    select: {
      id: true, automationId: true, status: true, title: true,
      blocksJson: true, promotedJson: true,
      automation: { select: { name: true } },
    },
  })
  if (!briefing) return apiNotFound('Briefing not found')

  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canReadBriefing(principal, briefing))) return apiForbidden('Insufficient permissions')

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid promotion request', parsed.error.flatten())

  const finding = findingFrom(briefing.blocksJson, parsed.data.dedupeKey)
  if (!finding) return apiNotFound('That finding is not part of this briefing')

  const promoted = new Set((briefing.promotedJson ?? []) as string[])
  if (promoted.has(parsed.data.dedupeKey)) {
    return apiBadRequest('That finding has already been promoted')
  }

  const title = parsed.data.title ?? finding.title
  const description = describeFinding(finding, briefing.title, briefing.id, '/dashboard/automations/briefings')

  let createdId: string
  let createdType: string

  if (parsed.data.target === 'TODO') {
    const todo = await prisma.todo.create({
      data: {
        title: title.slice(0, 300),
        description,
        creatorId: session.user.id,
        assigneeId: parsed.data.assigneeId ?? session.user.id,
        status: 'PENDING',
        priority: 'MEDIUM',
        ...(parsed.data.dueDate && !Number.isNaN(Date.parse(parsed.data.dueDate))
          ? { dueDate: new Date(parsed.data.dueDate) }
          : {}),
      },
      select: { id: true },
    })
    createdId = todo.id
    createdType = 'TODO'
  } else {
    const risk = await prisma.risk.create({
      data: {
        title: title.slice(0, 300),
        description,
        severity: parsed.data.severity ?? 'MEDIUM',
        status: 'OPEN',
        reporterId: session.user.id,
      },
      select: { id: true },
    })
    createdId = risk.id
    createdType = 'RISK'
  }

  promoted.add(parsed.data.dedupeKey)
  await prisma.automationBriefing.update({
    where: { id: briefing.id },
    data: { promotedJson: Array.from(promoted) },
  })

  await recordActivity({
    entityType: 'AUTOMATION_BRIEFING',
    action: 'CREATED',
    actorId: session.user.id,
    ...(createdType === 'TODO' ? { todoId: createdId } : {}),
    metadata: {
      briefingId: briefing.id,
      automationId: briefing.automationId,
      dedupeKey: parsed.data.dedupeKey,
      promotedTo: createdType,
      createdId,
    },
  })

  return apiSuccess({ id: createdId, type: createdType, dedupeKey: parsed.data.dedupeKey }, { status: 201 })
})
