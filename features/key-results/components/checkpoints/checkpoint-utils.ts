/**
 * KR checkpoint helpers (KRX-3). Pure — no React, no Prisma — so the API, the
 * strip, the profile KR row (P2) and the package cron can share them.
 *
 * Checkpoint due dates are calendar days stored as UTC midnight. They are compared
 * and shown as `yyyy-mm-dd` day keys so a viewer west of UTC never sees "Q2 due
 * 30 Jun" turn into 29 Jun.
 */
import type { CheckpointStatus } from '@/types/package'

export interface CheckpointLike {
  id: string
  label: string
  dueDate: string | Date
  status: string
  targetValue?: number | null
  actualValue?: number | null
}

/** Visual state of one checkpoint pill. */
export type CheckpointState = 'met' | 'missed' | 'overdue' | 'next' | 'upcoming'

const DAY_MS = 86_400_000

/** `yyyy-mm-dd` of a stored checkpoint date (UTC calendar day). */
export function checkpointDayKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

/** `yyyy-mm-dd` of "today" in the viewer's local time zone. */
export function localDayKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayKeyToUtcMs(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`)
}

/** Whole days from today to the checkpoint's due day (negative = overdue). */
export function daysUntilCheckpoint(dueDate: string | Date, now: Date = new Date()): number {
  const due = checkpointDayKey(dueDate)
  if (!due) return 0
  return Math.round((dayKeyToUtcMs(due) - dayKeyToUtcMs(localDayKey(now))) / DAY_MS)
}

/** Sorted copy: due date ascending, then label. */
export function sortCheckpoints<T extends CheckpointLike>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    const ka = checkpointDayKey(a.dueDate)
    const kb = checkpointDayKey(b.dueDate)
    if (ka !== kb) return ka < kb ? -1 : 1
    return a.label.localeCompare(b.label, undefined, { numeric: true })
  })
}

/**
 * The checkpoint to highlight: the earliest PENDING one by due date, overdue
 * ones included (an unreviewed Q2 is still the thing to deal with next).
 */
export function findNextCheckpoint<T extends CheckpointLike>(list: readonly T[]): T | null {
  return sortCheckpoints(list).find((c) => c.status === 'PENDING') ?? null
}

/** Pill state for one checkpoint, given the id of the next one. */
export function checkpointState(
  checkpoint: CheckpointLike,
  nextCheckpointId: string | null,
  now: Date = new Date(),
): CheckpointState {
  if (checkpoint.status === 'MET') return 'met'
  if (checkpoint.status === 'MISSED') return 'missed'
  if (daysUntilCheckpoint(checkpoint.dueDate, now) < 0) return 'overdue'
  return checkpoint.id === nextCheckpointId ? 'next' : 'upcoming'
}

/** MiniBadge tone per pill state. */
export const CHECKPOINT_STATE_TONE: Record<CheckpointState, 'ok' | 'danger' | 'warn' | 'accent' | 'neutral'> = {
  met: 'ok',
  missed: 'danger',
  overdue: 'warn',
  next: 'accent',
  upcoming: 'neutral',
}

export const CHECKPOINT_STATE_LABELS: Record<CheckpointState, string> = {
  met: 'Met',
  missed: 'Missed',
  overdue: 'Review overdue',
  next: 'Next',
  upcoming: 'Pending',
}

/**
 * Suggested review outcome from the numbers, or null when either is missing.
 * INCREASE: actual ≥ target is MET. DECREASE (KRX-1): actual ≤ target is MET.
 */
export function suggestCheckpointStatus(input: {
  targetValue: number | null | undefined
  actualValue: number | null | undefined
  direction?: string | null
}): Exclude<CheckpointStatus, 'PENDING'> | null {
  const { targetValue, actualValue } = input
  if (targetValue == null || actualValue == null) return null
  if (!Number.isFinite(targetValue) || !Number.isFinite(actualValue)) return null
  const decrease = String(input.direction ?? '').toUpperCase() === 'DECREASE'
  const met = decrease ? actualValue <= targetValue : actualValue >= targetValue
  return met ? 'MET' : 'MISSED'
}

/** Short date for a pill: "30 Jun" (or "30 Jun 2027" outside the current year). */
export function formatCheckpointDate(dueDate: string | Date, now: Date = new Date()): string {
  const key = checkpointDayKey(dueDate)
  if (!key) return ''
  const d = new Date(`${key}T00:00:00.000Z`)
  const sameYear = d.getUTCFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  })
}

/** "12", "12 %" or "1,200 ETB" — compact numeric value with an optional unit. */
export function formatCheckpointValue(value: number | null | undefined, unit?: string | null): string {
  if (value == null || !Number.isFinite(value)) return ''
  const n = value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const u = unit?.trim()
  if (!u) return n
  return u === '%' ? `${n}%` : `${n} ${u}`
}

/** "in 5 days", "today", "3 days overdue". */
export function describeDueIn(dueDate: string | Date, now: Date = new Date()): string {
  const days = daysUntilCheckpoint(dueDate, now)
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  if (days > 1) return `due in ${days} days`
  if (days === -1) return '1 day overdue'
  return `${-days} days overdue`
}

/**
 * Default label for a new checkpoint: the quarter after the latest "Qn" label
 * (Q2, Q3 → "Q4"), "Q1" when there are none, '' once Q4 is taken or labels are
 * custom.
 */
export function suggestNextCheckpointLabel(existing: readonly { label: string }[]): string {
  const quarters = existing
    .map((c) => /^Q([1-4])$/i.exec(c.label.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => Number(m[1]))
  if (existing.length === 0) return 'Q1'
  if (quarters.length === 0) return ''
  const next = Math.max(...quarters) + 1
  return next <= 4 ? `Q${next}` : ''
}
