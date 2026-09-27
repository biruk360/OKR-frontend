/**
 * Status-key normalisation shared by `components/shared/StatusPill` (client)
 * and server components that pick a pill status (e.g. Insights → Progress →
 * Tracking). It lives outside the `'use client'` StatusPill module on purpose:
 * on the server every export of a client module is a client reference, so a
 * server component calling `normalizeStatus` imported from StatusPill crashed
 * with "normalizeStatus is not a function". Keep this module free of
 * `'use client'` and of React.
 */

export type StatusKey =
  | 'on-track'
  | 'at-risk'
  | 'off-track'
  | 'completed'
  | 'closed'
  | 'pending'
  | 'in-progress'
  | 'in-review'
  | 'stuck'
  | 'cancelled'
  | 'no-owner'
  | 'planning'
  | 'active'

export function normalizeStatus(raw: string | null | undefined): StatusKey {
  if (!raw) return 'pending'
  const v = String(raw).toUpperCase().replace(/-/g, '_')
  switch (v) {
    case 'ON_TRACK': return 'on-track'
    case 'AT_RISK': return 'at-risk'
    case 'OFF_TRACK': return 'off-track'
    case 'COMPLETED': return 'completed'
    case 'CLOSED': return 'closed'
    case 'PENDING': return 'pending'
    case 'IN_PROGRESS': return 'in-progress'
    case 'IN_REVIEW': return 'in-review'
    case 'STUCK': return 'stuck'
    case 'CANCELLED': return 'cancelled'
    case 'NO_OWNER': return 'no-owner'
    case 'PLANNING': return 'planning'
    case 'ACTIVE': return 'active'
    default: return 'pending'
  }
}
