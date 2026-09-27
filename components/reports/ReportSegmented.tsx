'use client'

import { cn } from '@/lib/utils'

/** Compact segmented control used by the reports dashboard header and tab strip. */
export function ReportSegmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  /** Accessible name for the group. */
  label: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center rounded-[var(--ap-radius-sm)] p-0.5 border"
      style={{ background: 'var(--ap-bg-sunken)', borderColor: 'var(--ap-border)' }}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center h-6 px-2.5 rounded-[8px] text-caption font-medium transition',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
