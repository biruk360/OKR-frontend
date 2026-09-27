import { isScrumDraft } from './drafts'

/** Attendance stamp columns (spec invariant #3): written on the first submit only. */
export const ATTENDANCE_STAMP_FIELDS = ['submittedAt', 'isLate', 'status'] as const

/**
 * Columns an amendment of an already-submitted update may write. Editing an
 * 08:10 update at 10:00 must not move `submittedAt` or flip it to late: the
 * stamp is preserved and the edit is recorded as `amendedAt` + status AMENDED.
 * A first submit (no row, or a stored draft) writes the full stamp.
 */
export function attendanceSafeUpdateData<T extends Record<string, unknown>>(data: T, isAmend: boolean): T {
  if (!isAmend) return data
  const next: Record<string, unknown> = { ...data }
  for (const field of ATTENDANCE_STAMP_FIELDS) delete next[field]
  return { ...next, status: 'AMENDED', amendedAt: new Date() } as unknown as T
}

/**
 * Spec S2.1 / invariant #5: a proxy entry can never overwrite (or convert into a
 * proxy entry) a report the subject submitted themselves. A proxy may replace a
 * subject's unsubmitted draft or amend an existing proxy entry.
 */
export function decideProxyOverwrite(input: {
  isProxy: boolean
  existing: { status: string | null; isProxyEntry: boolean } | null
}): { ok: true } | { ok: false; message: string } {
  if (!input.isProxy || !input.existing) return { ok: true }
  if (isScrumDraft(input.existing.status)) return { ok: true }
  if (input.existing.isProxyEntry) return { ok: true }
  return { ok: false, message: 'This person already submitted their own update for this day — a proxy entry cannot replace it' }
}
