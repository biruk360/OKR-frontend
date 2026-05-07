/**
 * Daily Trip Plan (DTP) — shared TypeScript types.
 * Schema-stored enums are kept as string literal unions so we can change values
 * without a Prisma migration. The Prisma schema columns are `String`.
 */

export type DtpStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'MANAGER_ENDORSED'
  | 'UNDER_REVIEW'
  | 'RETURNED'
  | 'ADJUSTED'
  | 'APPROVED'
  | 'DRIVER_ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'RECONCILED'
  | 'WITHDRAWN'
  | 'CANCELLED'
  | 'EXPIRED'

export type DtpPriority = 'NORMAL' | 'URGENT'

export type ModeOfMovement =
  | 'WALKING'
  | 'PUBLIC_TRANSPORT'
  | 'COMPANY_VEHICLE'
  | 'PERSONAL_VEHICLE'
  | 'RIDE_HAIL'
  | 'MIXED'

export type TripMode = 'ROUND_TRIP' | 'ONE_WAY'

export type Flexibility = 'FIXED' | 'FLEX_30' | 'FLEX_2H' | 'ANY_TIME'

export type PickupBackTo = 'OFFICE' | 'NEXT_STOP' | 'CUSTOM'

export type LegType = 'DROPOFF' | 'RETURN_PICKUP'

export type LegStatus = 'SCHEDULED' | 'EN_ROUTE' | 'COMPLETED' | 'SKIPPED'

export type ManagerEndorsementMode = 'OFF' | 'ADVISORY' | 'REQUIRED'

export type DtpAction =
  | 'SUBMIT'
  | 'ENDORSE'
  | 'RETURN'
  | 'ADJUST'
  | 'APPROVE'
  | 'REJECT'
  | 'ACK'
  | 'CANCEL'
  | 'WITHDRAW'
  | 'ASSIGN_DRIVER'
  | 'LEG_STATUS'
  | 'EDIT'
  | 'CLONE'
  | 'EXPIRE'

export interface TrafficEstimate {
  baselineMin: number
  withTrafficMin: number
  departureTime: string // ISO
  model: 'best_guess' | 'optimistic' | 'pessimistic'
  flagged?: boolean // true when withTrafficMin / baselineMin >= 1.25
}

/** Coordinator adjustment diff — keyed by field name. */
export type CoordinatorAdjustments = Record<string, { before: unknown; after: unknown }>
