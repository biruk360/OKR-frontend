'use client'

import { Clock, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOpenCheckInPicker, type CheckInDueHint } from '@/components/cmdk/check-in-due-hints'

export interface CheckInBannerData {
  /** Owned active KRs whose next check-in (last check-in + checkInCadence) has passed. */
  overdueCount: number
  /** Owned active KRs whose next check-in falls within the next 7 days. */
  dueThisWeekCount: number
  lastCheckInDaysAgo: number | null
  lastCheckInKrTitle: string | null
  /** The KRs behind the two counts, overdue first — used to prioritise the check-in picker. */
  dueKrs?: CheckInDueHint[]
}

interface Props {
  data: CheckInBannerData
}

export default function CheckInBanner({ data }: Props) {
  const hasUrgent = data.overdueCount > 0 || data.dueThisWeekCount > 0
  const openCheckInPicker = useOpenCheckInPicker()

  if (!hasUrgent) return null

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-warning-200 bg-warning-50 px-5 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-100">
          <Clock className="size-4 text-warning-700" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-warning-900">
            {data.overdueCount > 0 && <>{data.overdueCount} check-in{data.overdueCount !== 1 ? 's' : ''} overdue</>}
            {data.overdueCount > 0 && data.dueThisWeekCount > 0 && ' · '}
            {data.dueThisWeekCount > 0 && <>{data.dueThisWeekCount} due this week</>}
          </p>
          {data.lastCheckInDaysAgo !== null && data.lastCheckInKrTitle && (
            <p className="text-xs text-warning-700 truncate">
              Last check-in: {data.lastCheckInDaysAgo} day{data.lastCheckInDaysAgo !== 1 ? 's' : ''} ago on &ldquo;{data.lastCheckInKrTitle}&rdquo;
            </p>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => openCheckInPicker(data.dueKrs ?? [])}
        className="shrink-0 border-warning-300 bg-surface-card text-warning-900 hover:bg-warning-100"
      >
        Start check-ins
        <ArrowUpRight className="size-3.5 ml-1" />
      </Button>
    </div>
  )
}
