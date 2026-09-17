'use client'

import { type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

export type StatCardTone =
  | 'blue'
  | 'green'
  | 'yellow'
  | 'red'
  | 'purple'
  | 'gray'
  | 'indigo'

/**
 * Tone fills. Every value must carry WHITE text at 4.5:1 — the tile renders a
 * white icon or a white initial on top.
 *
 * Two are deliberately NOT the obvious token:
 *  - `yellow` uses --ap-warn-fg (dark amber), because white on --ap-warn is
 *    2.55:1 and cannot be fixed by lightness — the required L is outside sRGB
 *    at that hue and chroma.
 *  - `gray` uses --ap-fg-secondary. It previously read `bg-muted0`, a typo that
 *    generated no CSS rule at all, so the tile rendered transparent.
 */
const toneVars: Record<StatCardTone, string> = {
  blue: 'var(--ap-accent)',
  green: 'var(--ap-ok)',
  yellow: 'var(--ap-warn-fg)',
  red: 'var(--ap-danger)',
  purple: 'var(--ap-ahead)',
  gray: 'var(--ap-fg-secondary)',
  indigo: 'var(--ap-accent-on-soft)',
}

export interface StatCardProps {
  label: string
  value: ReactNode
  icon?: LucideIcon
  iconText?: string
  tone?: StatCardTone
  trend?: {
    value: string | number
    direction: 'up' | 'down' | 'neutral'
  }
  helperText?: string
  onClick?: () => void
  className?: string
}

export function StatCard({
  label,
  value,
  icon: Icon,
  iconText,
  tone = 'blue',
  trend,
  helperText,
  onClick,
  className,
}: StatCardProps) {
  const trendColor =
    trend?.direction === 'up'
      ? 'text-emerald-600'
      : trend?.direction === 'down'
      ? 'text-destructive'
      : 'text-muted-foreground'

  return (
    <Card
      className={cn(
        onClick && 'cursor-pointer transition-shadow hover:shadow-md',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="pt-5">
        <div className="flex items-center">
          <div className="shrink-0">
            <div
              className="size-8 rounded-[var(--ap-radius-xs)] flex items-center justify-center"
              style={{ background: toneVars[tone] }}
            >
              {Icon ? (
                <Icon className="size-5 text-white" />
              ) : (
                <span className="text-white text-sm font-medium">
                  {iconText ?? label.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-muted-foreground truncate">{label}</dt>
              <dd className="text-lg font-medium">{value}</dd>
            </dl>
          </div>
        </div>
        {(trend || helperText) && (
          <div className="mt-3 flex items-center justify-between text-xs">
            {trend && (
              <span className={cn('font-medium', trendColor)}>
                {trend.direction === 'up' && '▲ '}
                {trend.direction === 'down' && '▼ '}
                {trend.value}
              </span>
            )}
            {helperText && <span className="text-muted-foreground">{helperText}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default StatCard
