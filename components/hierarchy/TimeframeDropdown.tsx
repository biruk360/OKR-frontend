'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'

interface TimeframeOption {
  id: string
  name: string
  type: string
  startDate: string
  endDate: string
  objectiveCount: number
}

interface Props {
  timeframes: TimeframeOption[]
  selectedId: string
}

/**
 * Timeframe selector for the strategy map. Writes `?timeframeId=` to the URL
 * so the server page can pick it up on the next render and re-fetch.
 * Uses useTransition so the UI stays responsive while Next re-renders.
 */
export default function TimeframeDropdown({ timeframes, selectedId }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const selected = timeframes.find((t) => t.id === selectedId)

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextId = e.target.value
    const next = new URLSearchParams(params?.toString() || '')
    next.set('timeframeId', nextId)
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`)
    })
  }

  return (
    <label className="relative inline-flex items-center gap-1.5">
      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="sr-only">Timeframe</span>
      <div className="relative">
        <select
          value={selectedId}
          onChange={onChange}
          disabled={isPending}
          aria-label="Select timeframe"
          className="appearance-none rounded-md border border-border bg-card py-1 pl-2 pr-7 text-xs font-medium text-foreground hover:border-border focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
        >
          {timeframes.map((t) => {
            const start = new Date(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
            const end = new Date(t.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
            return (
              <option key={t.id} value={t.id}>
                {t.name} · {start}–{end} · {t.objectiveCount} obj
              </option>
            )
          })}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
      </div>
      {selected && (
        <span className="font-normal text-muted-foreground">
          · {new Date(selected.startDate).toLocaleDateString()} – {new Date(selected.endDate).toLocaleDateString()}
        </span>
      )}
    </label>
  )
}
