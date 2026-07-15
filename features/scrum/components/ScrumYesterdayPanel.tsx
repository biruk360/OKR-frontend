'use client'

import { Flame, X, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { ScrumItem } from '../services/items'
import { ScrumItemList } from './ScrumItemList'

interface Props {
  yesterdayItems: ScrumItem[]
  todayItems: ScrumItem[]
  openBlocker: { text: string; category: string | null; daysOpen: number } | null
  onChangeYesterday: (items: ScrumItem[]) => void
  onChangeToday: (items: ScrumItem[]) => void
}

export function ScrumYesterdayPanel({
  yesterdayItems,
  todayItems,
  openBlocker,
  onChangeYesterday,
  onChangeToday,
}: Props) {
  const [open, setOpen] = useState(true)

  function handleYesterdayChange(items: ScrumItem[]) {
    const carried = items.filter((item) => item.status === 'CARRIED')
    const remaining = items.filter((item) => item.status !== 'CARRIED')
    if (carried.length) {
      const newToday = carried.map((item) => ({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: item.text,
        todoId: item.todoId,
        objectiveId: item.objectiveId,
        keyResultId: item.keyResultId,
        status: 'PENDING' as const,
      }))
      onChangeToday([...todayItems, ...newToday])
    }
    onChangeYesterday(remaining)
  }

  return (
    <div className="rounded-card border border-border bg-surface-hover p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-body-sm font-medium"
        onClick={() => setOpen(!open)}
      >
        Yesterday&apos;s plan <span>{open ? <X className="size-4" /> : <Plus className="size-4" />}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {yesterdayItems.length === 0 ? (
            <p className="text-body-sm text-ink-secondary">No prior plan.</p>
          ) : (
            <ScrumItemList
              items={yesterdayItems}
              onChange={handleYesterdayChange}
              mode="yesterday"
              label="Mark each item: Done, Carry, or Not done"
              placeholder="Yesterday's item"
            />
          )}
          {openBlocker && (
            <div className="rounded-md border border-danger-500/30 bg-danger-50 px-3 py-2 text-body-sm text-danger-700">
              <Flame className="mr-2 inline size-4" />
              {openBlocker.daysOpen}d open · {label(openBlocker.category ?? 'OTHER')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
