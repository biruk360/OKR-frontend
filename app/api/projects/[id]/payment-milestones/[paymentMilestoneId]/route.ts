import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { daysOutstanding, effectiveInvoiceStatus, serializePaymentMilestone } from '@/lib/projects/payment-milestones'

const patchSchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  contractClause: z.string().trim().max(1000).nullable().optional(),
  triggerActivityId: z.string().nullable().optional(),
  amount: z.number().min(0).optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  plannedInvoiceDate: z.string().datetime().nullable().optional(),
  actualInvoiceDate: z.string().datetime().nullable().optional(),
  invoiceStatus: z.enum(['PENDING', 'READY_TO_INVOICE', 'INVOICED', 'PAID', 'OVERDUE']).optional(),
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).optional(),
})

export const PATCH = withAuth<{ id: string; paymentMilestoneId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid payment milestone payload', parsed.error.flatten())
  const input = parsed.data

  const existing = await prisma.paymentMilestone.findFirst({ where: { id: params.paymentMilestoneId, projectId: params.id } })
  if (!existing) return apiNotFound('Payment milestone not found')

  if (input.triggerActivityId) {
    const activity = await prisma.activity.findFirst({
      where: { id: input.triggerActivityId, milestone: { phase: { projectId: params.id } } },
      select: { id: true },
    })
    if (!activity) return apiBadRequest('Trigger activity must belong to this project')
  }

  const data: Record<string, unknown> = {}
  for (const key of ['name', 'contractClause', 'triggerActivityId', 'amount', 'currency', 'invoiceStatus', 'paymentStatus'] as const) {
    if (input[key] !== undefined) data[key] = input[key]
  }
  if (input.plannedInvoiceDate !== undefined) data.plannedInvoiceDate = input.plannedInvoiceDate ? new Date(input.plannedInvoiceDate) : null
  if (input.actualInvoiceDate !== undefined) data.actualInvoiceDate = input.actualInvoiceDate ? new Date(input.actualInvoiceDate) : null

  const nextActualInvoiceDate = data.actualInvoiceDate !== undefined ? data.actualInvoiceDate as Date | null : existing.actualInvoiceDate
  const nextPaymentStatus = (data.paymentStatus ?? existing.paymentStatus) as string
  const nextInvoiceStatus = effectiveInvoiceStatus({
    actualInvoiceDate: nextActualInvoiceDate,
    invoiceStatus: (data.invoiceStatus ?? existing.invoiceStatus) as string,
    paymentStatus: nextPaymentStatus,
  })
  data.invoiceStatus = nextInvoiceStatus
  data.daysOutstanding = nextInvoiceStatus === 'INVOICED' || nextInvoiceStatus === 'OVERDUE'
    ? daysOutstanding(nextActualInvoiceDate)
    : null
  if (nextInvoiceStatus === 'PAID') data.paymentStatus = 'PAID'

  const updated = await prisma.paymentMilestone.update({ where: { id: params.paymentMilestoneId }, data })

  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: input.invoiceStatus || input.paymentStatus ? 'STATUS_CHANGED' : 'UPDATED',
    actorId: session.user.id,
    changes: diffPaymentMilestone(existing, updated, Object.keys(data)),
    metadata: { paymentMilestoneId: updated.id, name: updated.name, invoiceStatus: updated.invoiceStatus, paymentStatus: updated.paymentStatus },
  })

  return apiSuccess(serializePaymentMilestone(updated))
})

export const DELETE = withAuth<{ id: string; paymentMilestoneId: string }>(async (_req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const existing = await prisma.paymentMilestone.findFirst({
    where: { id: params.paymentMilestoneId, projectId: params.id },
    select: { id: true, name: true, invoiceStatus: true },
  })
  if (!existing) return apiNotFound('Payment milestone not found')
  if (existing.invoiceStatus === 'INVOICED' || existing.invoiceStatus === 'PAID') {
    return apiBadRequest('Invoiced or paid payment milestones cannot be deleted')
  }

  await prisma.paymentMilestone.delete({ where: { id: params.paymentMilestoneId } })
  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { paymentMilestoneId: existing.id, name: existing.name, invoiceStatus: existing.invoiceStatus },
  })
  return apiSuccess({ id: params.paymentMilestoneId, deleted: true })
})

function diffPaymentMilestone(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): ChangeMap | null {
  const changes: ChangeMap = {}
  for (const field of Array.from(new Set(fields))) {
    const from = normalize(before[field])
    const to = normalize(after[field])
    if (from !== to) changes[field] = { from, to }
  }
  return Object.keys(changes).length ? changes : null
}

function normalize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value
}
