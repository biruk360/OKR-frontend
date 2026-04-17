'use client'

import Link from 'next/link'
import { Clock, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface CheckInBannerData {
  overdueCount: number
  dueThisWeekCount: number
  lastCheckInDaysAgo: number | null
  lastCheckInKrTitle: string | null
}

interface Props {
  data: CheckInBannerData
}

export default function CheckInBanner({ data }: Props) {
  const hasUrgent = data.overdueCount > 0 || data.dueThisWeekCount > 0

  if (!hasUrgent) return null

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <Clock className="size-4 text-amber-700" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            {data.overdueCount > 0 && <>{data.overdueCount} check-in{data.overdueCount !== 1 ? 's' : ''} overdue</>}
            {data.overdueCount > 0 && data.dueThisWeekCount > 0 && ' · '}
            {data.dueThisWeekCount > 0 && <>{data.dueThisWeekCount} due this week</>}
          </p>
          {data.lastCheckInDaysAgo !== null && data.lastCheckInKrTitle && (
            <p className="text-xs text-amber-700 truncate">
              Last check-in: {data.lastCheckInDaysAgo} day{data.lastCheckInDaysAgo !== 1 ? 's' : ''} ago on &ldquo;{data.lastCheckInKrTitle}&rdquo;
            </p>
          )}
        </div>
      </div>
      <Link href="/dashboard/goals?tab=my-okrs">
        <Button variant="outline" className="shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100">
          Start check-ins
          <ArrowUpRight className="size-3.5 ml-1" />
        </Button>
      </Link>
    </div>
  )
}
