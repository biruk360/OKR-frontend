import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { paymentMilestoneWhere, serializePaymentMilestone } from '@/lib/projects/payment-milestones'

const createSchema = z.object({
  name: z.string().trim().min(3).max(200),
  contractClause: z.string().trim().max(1000).nullable().optional(),
  triggerActivityId: z.string().nullable().optional(),
  amount: z.number().min(0),
  currency: z.string().trim().min(3).max(3).optional(),
  plannedInvoiceDate: z.string().datetime().nullable().optional(),
})

export const GET = withAuth<{ id: string }>(async (req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const sp = new URL(req.url).searchParams
  const report = sp.get('report') === 'true'
  const overdue = sp.get('overdue') === 'true'
  const now = new Date()
  const milestones = await prisma.paymentMilestone.findMany({
    where: paymentMilestoneWhere(params.id, { report, overdue, now }),
    orderBy: [{ invoiceStatus: 'asc' }, { plannedInvoiceDate: 'asc' }, { name: 'asc' }],
  })
  const rows = milestones.map((m) => serializePaymentMilestone(m, now))
  return apiSuccess({
    rows,
    readyToInvoiceCount: rows.filter((m) => m.readyToInvoice).length,
    overdueCount: rows.filter((m) => m.isOverdue).length,
    outstandingAmount: rows
      .filter((m) => m.invoiceStatus === 'INVOICED' || m.invoiceStatus === 'OVERDUE')
      .reduce((sum, m) => sum + Number(m.amount ?? 0), 0),
  })
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid payment milestone payload', parsed.error.flatten())
  const input = parsed.data

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!project) return apiNotFound('Project not found')

  if (input.triggerActivityId) {
    const activity = await prisma.activity.findFirst({
      where: { id: input.triggerActivityId, milestone: { phase: { projectId: params.id } } },
      select: { id: true },
    })
    if (!activity) return apiBadRequest('Trigger activity must belong to this project')
  }

  const created = await prisma.paymentMilestone.create({
    data: {
      projectId: params.id,
      name: input.name,
      contractClause: input.contractClause ?? null,
      triggerActivityId: input.triggerActivityId ?? null,
      amount: input.amount,
      currency: input.currency ?? 'ETB',
      plannedInvoiceDate: input.plannedInvoiceDate ? new Date(input.plannedInvoiceDate) : null,
    },
  })

  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { paymentMilestoneId: created.id, name: created.name, amount: created.amount, currency: created.currency },
  })

  return apiSuccess(serializePaymentMilestone(created), { status: 201 })
})
