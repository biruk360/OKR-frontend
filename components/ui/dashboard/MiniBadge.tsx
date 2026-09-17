import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Tiny rounded badge — counts and status, in a card header's right slot, a lane
 * header, a nav row or a table cell.
 *
 * This is also the app's count chip. Do **not** add a `CountChip`: this plus the
 * `.ap-kbd` class already cover that shape — see
 * docs/design_refresh_IMPLEMENTATION_STRATEGY.md §4 ("Do not build CountChip").
 *
 * `color` is kept (and still wins over `tone`) so the 10 existing call sites
 * that pass a raw token string keep rendering exactly as before.
 */

export type MiniBadgeTone =
  | 'neutral'
  | 'accent'
  | 'ok'
  | 'warn'
  | 'danger'
  | 'ahead'

const toneVars: Record<MiniBadgeTone, { fg: string; bg: string }> = {
  neutral: { fg: 'var(--ap-none-fg)', bg: 'var(--ap-bg-sunken)' },
  accent: { fg: 'var(--ap-accent-on-soft)', bg: 'var(--ap-accent-soft)' },
  ok: { fg: 'var(--ap-ok-fg)', bg: 'var(--ap-ok-bg)' },
  warn: { fg: 'var(--ap-warn-fg)', bg: 'var(--ap-warn-bg)' },
  danger: { fg: 'var(--ap-danger-fg)', bg: 'var(--ap-danger-bg)' },
  ahead: { fg: 'var(--ap-ahead-fg)', bg: 'var(--ap-ahead-bg)' },
}

interface Props {
  children: ReactNode
  /** Legacy escape hatch: an explicit foreground colour (a `--ap-*` token).
   *  When set it overrides the `tone` foreground and keeps the sunken fill. */
  color?: string
  /** Semantic tone. Defaults to `neutral`, which is the original look. */
  tone?: MiniBadgeTone
  /** Mono face + tabular figures — for counts that sit in a column. */
  mono?: boolean
  className?: string
  title?: string
}

export function MiniBadge({ color, tone = 'neutral', mono = false, className, children, ...rest }: Props) {
  const t = toneVars[tone]
  return (
    <span
      data-slot="mini-badge"
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
        mono && 'font-mono tabular-nums tracking-tight',
        className,
      )}
      style={{ background: color ? 'var(--ap-bg-sunken)' : t.bg, color: color ?? t.fg }}
      {...rest}
    >
      {children}
    </span>
  )
}
