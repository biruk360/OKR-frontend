'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { Calendar } from 'lucide-react'
import { FilterSelect } from '@/components/ui/FilterSelect'

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

  function onChange(nextId: string | undefined) {
    if (!nextId || nextId === selectedId) return
    const next = new URLSearchParams(params?.toString() || '')
    next.set('timeframeId', nextId)
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`)
    })
  }

  const options = timeframes.map((t) => {
    const start = new Date(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    const end = new Date(t.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    return { value: t.id, label: `${t.name} · ${start}–${end}`, hint: `${t.objectiveCount} obj` }
  })

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      <FilterSelect
        label="Timeframe"
        value={selectedId}
        onValueChange={onChange}
        options={options}
        clearable={false}
        disabled={isPending}
        menuWidth={300}
      />
      {selected && (
        <span className="text-xs font-normal text-muted-foreground">
          · {new Date(selected.startDate).toLocaleDateString()} – {new Date(selected.endDate).toLocaleDateString()}
        </span>
      )}
    </div>
  )
}
