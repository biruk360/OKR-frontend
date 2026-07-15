import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  daysOutstanding,
  effectiveInvoiceStatus,
  isPaymentMilestoneOverdue,
  paymentMilestoneWhere,
  shouldTriggerPaymentMilestone,
} from './payment-milestones'

test('shouldTriggerPaymentMilestone: only transitions into APPROVED trigger finance readiness', () => {
  assert.equal(shouldTriggerPaymentMilestone('APPROVAL_REQUESTED', 'APPROVED'), true)
  assert.equal(shouldTriggerPaymentMilestone('FINISHED', 'APPROVED'), true)
  assert.equal(shouldTriggerPaymentMilestone('APPROVED', 'APPROVED'), false)
  assert.equal(shouldTriggerPaymentMilestone('APPROVAL_REQUESTED', 'REJECTED'), false)
})

test('daysOutstanding: computes invoice age in UTC calendar days', () => {
  assert.equal(daysOutstanding('2026-06-01T08:00:00Z', new Date('2026-07-02T18:00:00Z')), 31)
  assert.equal(daysOutstanding(null, new Date('2026-07-02T18:00:00Z')), null)
})

test('isPaymentMilestoneOverdue: invoice over 30 days outstanding flags overdue until paid', () => {
  const now = new Date('2026-07-14T12:00:00Z')
  assert.equal(isPaymentMilestoneOverdue({ actualInvoiceDate: '2026-06-13T00:00:00Z', invoiceStatus: 'INVOICED', paymentStatus: 'UNPAID' }, now), true)
  assert.equal(isPaymentMilestoneOverdue({ actualInvoiceDate: '2026-06-15T00:00:00Z', invoiceStatus: 'INVOICED', paymentStatus: 'UNPAID' }, now), false)
  assert.equal(isPaymentMilestoneOverdue({ actualInvoiceDate: '2026-06-13T00:00:00Z', invoiceStatus: 'INVOICED', paymentStatus: 'PAID' }, now), false)
})

test('effectiveInvoiceStatus: paid wins, otherwise overdue is computed', () => {
  const now = new Date('2026-07-14T12:00:00Z')
  assert.equal(effectiveInvoiceStatus({ actualInvoiceDate: '2026-06-13T00:00:00Z', invoiceStatus: 'INVOICED', paymentStatus: 'UNPAID' }, now), 'OVERDUE')
  assert.equal(effectiveInvoiceStatus({ actualInvoiceDate: '2026-06-13T00:00:00Z', invoiceStatus: 'INVOICED', paymentStatus: 'PAID' }, now), 'PAID')
  assert.equal(effectiveInvoiceStatus({ actualInvoiceDate: null, invoiceStatus: 'READY_TO_INVOICE', paymentStatus: 'UNPAID' }, now), 'READY_TO_INVOICE')
})

test('paymentMilestoneWhere: overdue query filters outstanding invoices at query level', () => {
  const now = new Date('2026-07-14T00:00:00Z')
  assert.deepEqual(paymentMilestoneWhere('p1', { overdue: true, now }), {
    projectId: 'p1',
    paymentStatus: { not: 'PAID' },
    invoiceStatus: { in: ['INVOICED', 'OVERDUE'] },
    actualInvoiceDate: { lt: new Date('2026-06-14T00:00:00.000Z') },
  })
})
