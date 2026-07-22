export type ScheduleSortMode = 'manual' | 'automatic'

interface ScheduleItem {
  position: number
  currentStart?: string | null
  currentEnd?: string | null
}

const MAX_DATE = 8_640_000_000_000_000

export function compareScheduleItems(mode: ScheduleSortMode, left: ScheduleItem, right: ScheduleItem): number {
  if (mode === 'manual') return left.position - right.position
  return scheduleTimestamp(left) - scheduleTimestamp(right) || left.position - right.position
}

export function isOverdueActivity(status: string, currentEnd: Date | string | null | undefined, now = new Date()): boolean {
  if (!currentEnd || status === 'FINISHED' || status === 'APPROVED') return false
  const due = currentEnd instanceof Date ? currentEnd : new Date(currentEnd)
  if (Number.isNaN(due.getTime())) return false
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return dueDay < today
}

function scheduleTimestamp(item: ScheduleItem): number {
  const raw = item.currentStart ?? item.currentEnd
  if (!raw) return MAX_DATE
  const timestamp = new Date(raw).getTime()
  return Number.isNaN(timestamp) ? MAX_DATE : timestamp
}
