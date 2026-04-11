export type CheckInCadence = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY'

export const CHECK_IN_CADENCES: CheckInCadence[] = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY']

export const CHECK_IN_CADENCE_LABELS: Record<CheckInCadence, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Every 2 weeks',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Every 3 months',
}

export function normalizeCadence(value: unknown): CheckInCadence {
  if (typeof value === 'string' && (CHECK_IN_CADENCES as string[]).includes(value)) {
    return value as CheckInCadence
  }
  return 'WEEKLY'
}

/**
 * Compute the next check-in due date given a cadence and the date of the last check-in
 * (or the entity's createdAt if no check-in has happened yet).
 */
export function nextCheckInDue(cadence: CheckInCadence, lastCheckInAt: Date): Date {
  const next = new Date(lastCheckInAt)
  switch (cadence) {
    case 'WEEKLY':
      next.setDate(next.getDate() + 7)
      break
    case 'BIWEEKLY':
      next.setDate(next.getDate() + 14)
      break
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1)
      break
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3)
      break
  }
  return next
}

export function isCheckInOverdue(cadence: CheckInCadence, lastCheckInAt: Date, now: Date = new Date()): boolean {
  return nextCheckInDue(cadence, lastCheckInAt).getTime() < now.getTime()
}
