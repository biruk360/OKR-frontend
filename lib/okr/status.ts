/**
 * Status derivation and badge styling — all pure, no side effects.
 */

export type ComputedStatus = 'on-track' | 'at-risk' | 'off-track' | 'no-owner' | 'completed'

export function statusBadgeClass(status: ComputedStatus): string {
  switch (status) {
    case 'on-track':
      return 'bg-emerald-100 text-emerald-800'
    case 'at-risk':
      return 'bg-amber-100 text-amber-800'
    case 'off-track':
      return 'bg-red-100 text-red-800'
    case 'no-owner':
      return 'bg-red-100 text-red-800'
    case 'completed':
      return 'bg-muted text-muted-foreground'
  }
}

export function statusLabel(status: ComputedStatus): string {
  switch (status) {
    case 'on-track': return 'On Track'
    case 'at-risk': return 'At Risk'
    case 'off-track': return 'Off Track'
    case 'no-owner': return 'Unassigned'
    case 'completed': return 'Completed'
  }
}

export function statusDotColor(status: ComputedStatus): string {
  switch (status) {
    case 'on-track': return 'bg-emerald-500'
    case 'at-risk': return 'bg-amber-500'
    case 'off-track': return 'bg-red-500'
    case 'no-owner': return 'bg-red-500'
    case 'completed': return 'bg-muted-foreground'
  }
}

/** Map raw DB goalStatus / confidence strings to our computed type. */
export function fromDbStatus(dbStatus: string | null | undefined): ComputedStatus {
  switch (dbStatus) {
    case 'ON_TRACK': return 'on-track'
    case 'AT_RISK': return 'at-risk'
    case 'OFF_TRACK': return 'off-track'
    case 'CLOSED': return 'completed'
    default: return 'on-track'
  }
}
