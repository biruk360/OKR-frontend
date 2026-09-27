'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useOpenCheckInPicker } from '@/components/cmdk/check-in-due-hints'
import { useCheckInPickerStore } from '@/lib/stores/check-in-picker-store'
import { getProgressBarColor } from '@/lib/utils'
import type { CheckInQueue as CheckInQueueData } from '@/lib/okr/check-in-queue'

const VISIBLE = 6

/**
 * "Needs a check-in" queue on My OKRs: the viewer's key results whose next
 * check-in (lib/okr/check-in-queue.ts) is overdue or due within 7 days.
 * "Check in" opens the global check-in modal for that KR; "Start check-ins"
 * opens the picker with these KRs floated to the top. The list refreshes when
 * the check-in modal closes.
 */
export default function CheckInQueue({ data }: { data: CheckInQueueData }) {
  const router = useRouter()
  const openPicker = useOpenCheckInPicker()
  const selectKr = useCheckInPickerStore((s) => s.selectKr)
  const selectedKrId = useCheckInPickerStore((s) => s.selectedKrId)
  const hadSelection = useRef(false)

  useEffect(() => {
    if (selectedKrId) hadSelection.current = true
    else if (hadSelection.current) {
      hadSelection.current = false
      router.refresh()
    }
  }, [selectedKrId, router])

  // Nothing due → nothing to show (the page's own header follows directly).
  if (data.items.length === 0) return null

  const hints = data.items.map((i) => ({ id: i.id, state: i.state }))
  const shown = data.items.slice(0, VISIBLE)

  return (
    <section
      aria-labelledby="checkin-queue-heading"
      className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex min-w-0 items-center gap-2.5">
          <Clock className="size-4 shrink-0" style={{ color: 'var(--ap-orange)' }} aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="checkin-queue-heading" className="text-body-sm font-semibold text-foreground">Needs a check-in</h2>
            <p className="text-caption text-muted-foreground">
              {data.overdueCount > 0 && <>{data.overdueCount} overdue</>}
              {data.overdueCount > 0 && data.dueThisWeekCount > 0 && ' · '}
              {data.dueThisWeekCount > 0 && <>{data.dueThisWeekCount} due this week</>}
            </p>
          </div>
        </div>
        <Button type="button" size="sm" onClick={() => openPicker(hints)} className="h-8 gap-1">
          Start check-ins
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
        {shown.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold uppercase tracking-wide"
              style={{
                background: item.state === 'overdue'
                  ? 'color-mix(in oklch, var(--ap-red) 12%, transparent)'
                  : 'color-mix(in oklch, var(--ap-orange) 12%, transparent)',
                color: item.state === 'overdue' ? 'var(--ap-red)' : 'var(--ap-orange)',
              }}
            >
              {item.state === 'overdue' ? 'Overdue' : 'Due'}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/dashboard/key-results/${item.id}`} className="block truncate text-body-sm font-medium hover:underline">
                {item.title}
              </Link>
              <Link
                href={`/dashboard/objectives/${item.objectiveId}`}
                className="block truncate text-caption text-muted-foreground hover:underline"
              >
                {item.objectiveTitle}
              </Link>
            </div>
            <div className="hidden w-28 shrink-0 items-center gap-2 sm:flex">
              <Progress
                className="flex-1"
                value={Math.min(100, item.progress)}
                fill={getProgressBarColor(item.progress)}
                aria-label="Key result progress"
              />
              <span className="w-9 text-right text-xs font-mono tabular-nums text-muted-foreground">{Math.round(item.progress)}%</span>
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={() => selectKr(item.id)}>
              Check in
            </Button>
          </li>
        ))}
      </ul>
      {data.items.length > VISIBLE && (
        <button
          type="button"
          onClick={() => openPicker(hints)}
          className="w-full border-t px-4 py-2 text-left text-caption font-medium text-[var(--ap-accent)] hover:underline"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          +{data.items.length - VISIBLE} more in the check-in picker
        </button>
      )}
    </section>
  )
}
