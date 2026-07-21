'use client'

import { useEffect, useMemo, useState } from 'react'
import { addMonths, format, isSameDay, isSameMonth, startOfMonth } from 'date-fns'
import { Popover } from 'radix-ui'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { projectCalendarDays, parseProjectDate, toProjectDateValue } from '@/lib/projects/project-calendar'
import { cn } from '@/lib/utils'

interface ProjectDatePickerProps {
  value: string | null | undefined
  onChange: (value: string) => void
  ariaLabel: string
  disabled?: boolean
  placeholder?: string
  displayFormat?: string
  allowClear?: boolean
  showIcon?: boolean
  className?: string
  buttonClassName?: string
  align?: 'start' | 'center' | 'end'
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

export function ProjectDatePicker({
  value,
  onChange,
  ariaLabel,
  disabled = false,
  placeholder = 'Select date',
  displayFormat = 'dd MMM yyyy',
  allowClear = true,
  showIcon = true,
  className,
  buttonClassName,
  align = 'start',
}: ProjectDatePickerProps) {
  const selected = useMemo(() => parseProjectDate(value), [value])
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selected ?? new Date()))
  const days = useMemo(() => projectCalendarDays(visibleMonth), [visibleMonth])
  const today = useMemo(() => new Date(), [])

  useEffect(() => {
    if (selected) setVisibleMonth(startOfMonth(selected))
  }, [selected])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-black/[0.1] bg-white px-2.5 text-left text-[12px] text-ink-primary outline-none transition hover:border-black/20 focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-100 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-tertiary',
            className,
            buttonClassName,
          )}
        >
          {showIcon && <CalendarDays className="size-3.5 shrink-0 text-ink-tertiary" />}
          <span className={cn('min-w-0 flex-1 truncate tabular-nums', !selected && 'text-ink-tertiary')}>
            {selected ? format(selected, displayFormat) : placeholder}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={7}
          collisionPadding={10}
          className="z-[100] w-[286px] rounded-md border border-black/20 bg-white p-2 text-ink-primary shadow-[0_12px_30px_rgba(15,23,42,0.18)] outline-none"
        >
          <Popover.Arrow className="fill-white stroke-black/20" width={14} height={7} />
          <div className="grid h-9 grid-cols-[36px_1fr_36px] items-center">
            <button type="button" className="flex size-8 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover hover:text-ink-primary" onClick={() => setVisibleMonth((month) => addMonths(month, -1))} aria-label="Previous month">
              <ChevronLeft className="size-5" />
            </button>
            <div className="text-center text-[16px] font-semibold">{format(visibleMonth, 'MMMM yyyy')}</div>
            <button type="button" className="flex size-8 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover hover:text-ink-primary" onClick={() => setVisibleMonth((month) => addMonths(month, 1))} aria-label="Next month">
              <ChevronRight className="size-5" />
            </button>
          </div>

          <div className="mt-1 grid grid-cols-7 border-b border-black/[0.12] pb-1">
            {WEEKDAYS.map((weekday) => <div key={weekday} className="flex h-7 items-center justify-center text-[12px] font-medium text-ink-secondary">{weekday}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7">
            {days.map((day) => {
              const isSelected = !!selected && isSameDay(day, selected)
              const inMonth = isSameMonth(day, visibleMonth)
              const isToday = isSameDay(day, today)
              return (
                <button
                  key={toProjectDateValue(day)}
                  type="button"
                  onClick={() => { onChange(toProjectDateValue(day)); setOpen(false) }}
                  className={cn(
                    'mx-auto flex size-9 items-center justify-center rounded-md text-[13px] tabular-nums outline-none hover:bg-primary-50 focus-visible:ring-2 focus-visible:ring-primary-300',
                    !inMonth && 'text-ink-tertiary/60',
                    isToday && !isSelected && 'font-semibold text-primary-700 ring-1 ring-primary-300',
                    isSelected && 'bg-primary-600 font-semibold text-white hover:bg-primary-700',
                  )}
                  aria-label={format(day, 'EEEE, MMMM d, yyyy')}
                  aria-pressed={isSelected}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-black/[0.1] pt-2">
            <button type="button" className="rounded px-2 py-1 text-[12px] font-medium text-primary-700 hover:bg-primary-50" onClick={() => { const next = toProjectDateValue(today); onChange(next); setVisibleMonth(startOfMonth(today)); setOpen(false) }}>Today</button>
            {allowClear && selected && (
              <button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] text-ink-secondary hover:bg-surface-hover hover:text-danger-600" onClick={() => { onChange(''); setOpen(false) }}>
                <X className="size-3" /> Clear
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
