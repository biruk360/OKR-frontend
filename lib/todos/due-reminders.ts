/**
 * Due-date reminder lead times (DTE-4).
 *
 * Pure: no DB, no I/O, no Date.now(). The cron passes `now` in, which is what
 * makes the windowing testable and keeps a re-run inside the same window
 * idempotent.
 *
 * Spec: docs/trello_parity_sprint_board_REQUIREMENTS.md DTE-4, DTE-AC-3.
 */

export type DueReminder = 'AT_TIME' | 'M5' | 'H1' | 'D1' | 'D2'

export const DUE_REMINDERS: { value: DueReminder; label: string; minutesBefore: number }[] = [
  { value: 'AT_TIME', label: 'At the due time', minutesBefore: 0 },
  { value: 'M5', label: '5 minutes before', minutesBefore: 5 },
  { value: 'H1', label: '1 hour before', minutesBefore: 60 },
  { value: 'D1', label: '1 day before', minutesBefore: 60 * 24 },
  { value: 'D2', label: '2 days before', minutesBefore: 60 * 24 * 2 },
]

export function isDueReminder(value: unknown): value is DueReminder {
  return typeof value === 'string' && DUE_REMINDERS.some((r) => r.value === value)
}

export function minutesBefore(reminder: DueReminder): number {
  return DUE_REMINDERS.find((r) => r.value === reminder)?.minutesBefore ?? 0
}

export function reminderLabel(reminder: string | null | undefined): string | null {
  if (!reminder) return null
  return DUE_REMINDERS.find((r) => r.value === reminder)?.label ?? null
}

/**
 * The instant a reminder should fire.
 *
 * `endTime` ("HH:mm") is the wall-clock due time when set; without it the card
 * is treated as due at the END of its due day, so a "1 day before" reminder on
 * an all-day task lands the previous evening rather than at midnight.
 */
export function reminderFireAt(
  dueDate: Date,
  endTime: string | null | undefined,
  reminder: DueReminder,
): Date {
  const due = new Date(dueDate)
  const m = endTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ? endTime.split(':') : null
  if (m) due.setHours(parseInt(m[0], 10), parseInt(m[1], 10), 0, 0)
  else due.setHours(23, 59, 0, 0)
  return new Date(due.getTime() - minutesBefore(reminder) * 60_000)
}

export interface ReminderCandidate {
  id: string
  dueDate: Date | null
  endTime: string | null
  dueReminder: string | null
  dueReminderSentAt: Date | null
  status: string
}

/**
 * Should this card's reminder be sent at `now`?
 *
 * True only when the fire time has passed, nothing has been sent for the
 * current due date, the card is still open, and the fire time is not older than
 * `graceMinutes` — so a cron that was down for a day does not suddenly deliver
 * a pile of stale reminders.
 */
export function shouldSendReminder(
  card: ReminderCandidate,
  now: Date,
  graceMinutes = 60 * 6,
): boolean {
  if (!card.dueDate || !card.dueReminder) return false
  if (!isDueReminder(card.dueReminder)) return false
  if (card.dueReminderSentAt) return false
  if (card.status === 'COMPLETED' || card.status === 'CANCELLED') return false

  const fireAt = reminderFireAt(card.dueDate, card.endTime, card.dueReminder).getTime()
  const t = now.getTime()
  if (t < fireAt) return false
  return t - fireAt <= graceMinutes * 60_000
}

/**
 * Whether a write to a card invalidates an already-sent reminder. Rescheduling a
 * card, or changing the lead time, must let the reminder fire again for the new
 * moment — otherwise a card moved a week out would never remind.
 */
export function shouldResetReminderSentAt(
  prev: { dueDate: Date | null; dueReminder: string | null },
  next: { dueDate?: Date | null; dueReminder?: string | null },
): boolean {
  if (next.dueDate !== undefined) {
    const a = prev.dueDate ? prev.dueDate.getTime() : null
    const b = next.dueDate ? next.dueDate.getTime() : null
    if (a !== b) return true
  }
  if (next.dueReminder !== undefined && next.dueReminder !== prev.dueReminder) return true
  return false
}
