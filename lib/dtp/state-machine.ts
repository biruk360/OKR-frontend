/**
 * DTP state machine. Pure data — no DB calls.
 * `next()` returns true if the transition is allowed; the caller is responsible
 * for performing the DB update + writing a DtpEvent audit row.
 */

import type { DtpStatus } from '@/types/dtp'

type Transitions = Partial<Record<DtpStatus, ReadonlySet<DtpStatus>>>

const TRANSITIONS: Transitions = {
  DRAFT: new Set(['SUBMITTED', 'WITHDRAWN'] as const),
  SUBMITTED: new Set(['MANAGER_ENDORSED', 'UNDER_REVIEW', 'RETURNED', 'ADJUSTED', 'APPROVED', 'WITHDRAWN', 'EXPIRED'] as const),
  MANAGER_ENDORSED: new Set(['UNDER_REVIEW', 'RETURNED', 'ADJUSTED', 'APPROVED', 'WITHDRAWN', 'EXPIRED'] as const),
  UNDER_REVIEW: new Set(['RETURNED', 'ADJUSTED', 'APPROVED', 'EXPIRED'] as const),
  RETURNED: new Set(['DRAFT', 'SUBMITTED', 'WITHDRAWN'] as const),
  ADJUSTED: new Set(['APPROVED', 'RETURNED'] as const), // employee acks → APPROVED
  APPROVED: new Set(['DRIVER_ASSIGNED', 'IN_PROGRESS', 'CANCELLED'] as const),
  DRIVER_ASSIGNED: new Set(['IN_PROGRESS', 'CANCELLED'] as const),
  IN_PROGRESS: new Set(['COMPLETED', 'CANCELLED'] as const),
  COMPLETED: new Set(['RECONCILED'] as const),
  RECONCILED: new Set([] as const),
  WITHDRAWN: new Set([] as const),
  CANCELLED: new Set([] as const),
  EXPIRED: new Set([] as const),
}

export function canTransition(from: DtpStatus, to: DtpStatus): boolean {
  return TRANSITIONS[from]?.has(to) ?? false
}

export function isTerminal(s: DtpStatus): boolean {
  return s === 'WITHDRAWN' || s === 'CANCELLED' || s === 'EXPIRED' || s === 'RECONCILED'
}

/** Statuses where the requester may still freely edit their own stops. */
export function isRequesterEditable(s: DtpStatus): boolean {
  return s === 'DRAFT' || s === 'RETURNED'
}

/** Statuses where the Coordinator may inline-edit before approving. */
export function isCoordinatorEditable(s: DtpStatus): boolean {
  return s === 'SUBMITTED' || s === 'MANAGER_ENDORSED' || s === 'UNDER_REVIEW'
}
