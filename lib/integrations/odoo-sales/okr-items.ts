/**
 * Odoo sales sync — OKR action items sent with each target. Pure and client-safe;
 * the loader is ./okr-items.server.ts.
 */
import { compareDateKeys } from '@/lib/kpi/periods'

export type OkrItemType = 'TASK' | 'CHECKPOINT' | 'KR_AT_RISK'
export type OkrItemStatus = 'OVERDUE' | 'DUE_SOON' | 'AT_RISK' | 'OFF_TRACK'

export interface OkrActionItem {
  type: OkrItemType
  title: string
  /** `YYYY-MM-DD` (org timezone) or null. */
  dueDate: string | null
  status: OkrItemStatus
  /** Absolute link into the OKR app. */
  url: string
}

export const MAX_OKR_ITEMS = 8
export const OKR_ITEM_TITLE_MAX = 120
/** Tasks due within this many days are included. */
export const TASK_HORIZON_DAYS = 14
/** Checkpoints due within this many days are included. */
export const CHECKPOINT_HORIZON_DAYS = 30

export function truncateTitle(title: string, max = OKR_ITEM_TITLE_MAX): string {
  const clean = title.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`
}

/** OVERDUE before today, otherwise DUE_SOON. */
export function dueStatus(dueKey: string, todayKey: string): 'OVERDUE' | 'DUE_SOON' {
  return compareDateKeys(dueKey, todayKey) < 0 ? 'OVERDUE' : 'DUE_SOON'
}

const TYPE_ORDER: Record<OkrItemType, number> = { TASK: 0, CHECKPOINT: 1, KR_AT_RISK: 2 }
const UNDATED_ORDER: Partial<Record<OkrItemStatus, number>> = { OFF_TRACK: 0, AT_RISK: 1 }

/** Overdue first, then by due date (undated last, OFF_TRACK before AT_RISK); at most `max`. */
export function rankOkrItems(items: readonly OkrActionItem[], max = MAX_OKR_ITEMS): OkrActionItem[] {
  return [...items]
    .sort((a, b) => {
      const ao = a.status === 'OVERDUE' ? 0 : 1
      const bo = b.status === 'OVERDUE' ? 0 : 1
      if (ao !== bo) return ao - bo
      if (a.dueDate && b.dueDate) {
        const byDate = compareDateKeys(a.dueDate, b.dueDate)
        if (byDate !== 0) return byDate
      } else if (a.dueDate || b.dueDate) {
        return a.dueDate ? -1 : 1
      } else {
        const byStatus = (UNDATED_ORDER[a.status] ?? 9) - (UNDATED_ORDER[b.status] ?? 9)
        if (byStatus !== 0) return byStatus
      }
      const byType = TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
      return byType !== 0 ? byType : a.title.localeCompare(b.title)
    })
    .slice(0, max)
}
