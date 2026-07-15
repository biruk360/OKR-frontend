import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export type PaymentInvoiceStatus = 'PENDING' | 'READY_TO_INVOICE' | 'INVOICED' | 'PAID' | 'OVERDUE'
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID'

const OUTSTANDING_OVERDUE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export interface PaymentMilestoneReadyResult {
  id: string
  name: string
  amount: number
  currency: string
}

export function shouldTriggerPaymentMilestone(fromStatus: string, toStatus: string): boolean {
  return fromStatus !== 'APPROVED' && toStatus === 'APPROVED'
}

export function daysOutstanding(actualInvoiceDate: Date | string | null | undefined, now = new Date()): number | null {
  if (!actualInvoiceDate) return null
  const start = startOfUtcDay(new Date(actualInvoiceDate))
  const end = startOfUtcDay(now)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS))
}

export function isPaymentMilestoneOverdue(input: {
  actualInvoiceDate: Date | string | null
  invoiceStatus: string
  paymentStatus: string
}, now = new Date()): boolean {
  if (input.paymentStatus === 'PAID' || input.invoiceStatus === 'PAID') return false
  if (input.invoiceStatus !== 'INVOICED' && input.invoiceStatus !== 'OVERDUE') return false
  const outstanding = daysOutstanding(input.actualInvoiceDate, now)
  return outstanding != null && outstanding > OUTSTANDING_OVERDUE_DAYS
}

export function effectiveInvoiceStatus(input: {
  actualInvoiceDate: Date | string | null
  invoiceStatus: string
  paymentStatus: string
}, now = new Date()): PaymentInvoiceStatus {
  if (input.paymentStatus === 'PAID') return 'PAID'
  if (isPaymentMilestoneOverdue(input, now)) return 'OVERDUE'
  return normalizeInvoiceStatus(input.invoiceStatus)
}

export function paymentMilestoneWhere(projectId: string, opts: { overdue?: boolean; report?: boolean; now?: Date } = {}): Prisma.PaymentMilestoneWhereInput {
  const where: Prisma.PaymentMilestoneWhereInput = { projectId }
  if (opts.overdue) {
    where.paymentStatus = { not: 'PAID' }
    where.invoiceStatus = { in: ['INVOICED', 'OVERDUE'] }
    where.actualInvoiceDate = { lt: new Date((opts.now ?? new Date()).getTime() - OUTSTANDING_OVERDUE_DAYS * DAY_MS) }
  } else if (opts.report) {
    where.invoiceStatus = { in: ['READY_TO_INVOICE', 'INVOICED', 'OVERDUE'] }
  }
  return where
}

export async function markPaymentMilestonesReady(
  tx: Prisma.TransactionClient,
  input: { projectId: string; activityId: string },
): Promise<PaymentMilestoneReadyResult[]> {
  const milestones = await tx.paymentMilestone.findMany({
    where: {
      projectId: input.projectId,
      triggerActivityId: input.activityId,
      invoiceStatus: 'PENDING',
    },
    select: { id: true, name: true, amount: true, currency: true },
  })
  if (milestones.length === 0) return []

  await tx.paymentMilestone.updateMany({
    where: { id: { in: milestones.map((m) => m.id) } },
    data: { invoiceStatus: 'READY_TO_INVOICE', daysOutstanding: null },
  })
  return milestones
}

export async function resolveFinanceRecipients(db: Db, projectManagerId?: string | null): Promise<string[]> {
  const users = await db.user.findMany({
    where: {
      isActive: true,
      OR: [
        { email: { contains: 'finance', mode: 'insensitive' } },
        { designation: { contains: 'finance', mode: 'insensitive' } },
        { designation: { contains: 'cfo', mode: 'insensitive' } },
        { role: 'EXECUTIVE' },
      ],
    },
    select: { id: true },
    take: 25,
  })
  return Array.from(new Set([...users.map((u) => u.id), ...(projectManagerId ? [projectManagerId] : [])]))
}

export function serializePaymentMilestone<T extends {
  plannedInvoiceDate: Date | null
  actualInvoiceDate: Date | null
  invoiceStatus: string
  paymentStatus: string
  [key: string]: unknown
}>(milestone: T, now = new Date()) {
  const outstanding = daysOutstanding(milestone.actualInvoiceDate, now)
  const invoiceStatus = effectiveInvoiceStatus(milestone, now)
  return {
    ...milestone,
    plannedInvoiceDate: milestone.plannedInvoiceDate?.toISOString() ?? null,
    actualInvoiceDate: milestone.actualInvoiceDate?.toISOString() ?? null,
    invoiceStatus,
    readyToInvoice: invoiceStatus === 'READY_TO_INVOICE',
    isOverdue: invoiceStatus === 'OVERDUE',
    daysOutstanding: invoiceStatus === 'READY_TO_INVOICE' ? null : outstanding,
  }
}

function normalizeInvoiceStatus(value: string): PaymentInvoiceStatus {
  if (value === 'READY_TO_INVOICE' || value === 'INVOICED' || value === 'PAID' || value === 'OVERDUE') return value
  return 'PENDING'
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}
