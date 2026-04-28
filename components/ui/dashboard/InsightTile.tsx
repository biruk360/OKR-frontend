import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  icon: LucideIcon
  label: string
  value: string | number
  detail: string
  tint: string
  /** Optional trailing slot rendered below the detail line — e.g. a sparkline. */
  trailing?: ReactNode
}

/**
 * Hero KPI tile used at the top of dashboard pages. Big tinted value, small
 * eyebrow label, supporting detail line, and an optional trailing slot for a
 * trend chart or progress meter.
 */
export function InsightTile({ icon: Icon, label, value, detail, tint, trailing }: Props) {
  return (
    <div className="rounded-[14px] border bg-card p-4" style={{ borderColor: 'var(--ap-border)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p
            className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight tabular-nums"
            style={{ color: tint }}
          >
            {value}
          </p>
        </div>
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px]"
          style={{ background: 'var(--ap-bg-sunken)', color: tint }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">{detail}</p>
      {trailing && <div className="mt-2">{trailing}</div>}
    </div>
  )
}
