/**
 * Which letter events may be emailed.
 *
 * Approval requests ("Letter awaiting approval", LETTER_SUBMITTED) are in-app
 * only: they are recorded in the activity log by the submit route and shown in
 * the notification bell, but never emailed (owner decision 2026-10-28). The
 * other letter events keep their email, subject to each user's preferences.
 */
export const LETTER_IN_APP_ONLY_EVENTS: ReadonlySet<string> = new Set(['LETTER_SUBMITTED'])

export function letterEventEmails(eventKey: string): boolean {
  return !LETTER_IN_APP_ONLY_EVENTS.has(eventKey)
}
