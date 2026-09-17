'use client'

/**
 * Eyebrow — the small uppercase label that sits above a heading, a card body or
 * a nav group.
 *
 * Why this exists: the repo carries 249 hand-rolled eyebrows across 94 files,
 * spread over three sizes, five tracking values, four weights and four colour
 * tokens. That spread is the bug this primitive fixes. See
 * docs/design_refresh_IMPLEMENTATION_STRATEGY.md §4.
 *
 * ⚠ The default is deliberately NOT mono. Not one of the 249 existing eyebrows
 * uses a mono face, so a mono default would be 249 visual regressions. The
 * default matches the 54-occurrence majority:
 *   `text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`
 * `mono` is opt-in, for the redesigned surfaces only.
 */

import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type EyebrowSize = 'sm' | 'md' | 'default'
export type EyebrowAlign = 'left' | 'center' | 'right'

/**
 * `default` is the existing majority treatment and stays the default so the
 * 249 call sites can migrate without changing pixels. `sm` / `md` are the two
 * sizes the new designs ask for.
 */
const sizeClasses: Record<EyebrowSize, string> = {
  // 9.5px / .12em — sidebar group labels, table header eyebrows
  sm: 'text-[9.5px] tracking-[0.12em]',
  // 10px / .1em — popover panel + board eyebrows
  md: 'text-[10px] tracking-[0.1em]',
  // 11px / tracking-wide — the existing in-repo majority
  default: 'text-[11px] tracking-wide',
}

const alignClasses: Record<EyebrowAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

export interface EyebrowProps {
  children: ReactNode
  /** Type scale. Defaults to the 11px in-repo majority. */
  size?: EyebrowSize
  /** Popover panel eyebrows are centred; sidebar and board eyebrows are left. */
  align?: EyebrowAlign
  /** Opt-in mono face. Off by default — see the file header. */
  mono?: boolean
  /** Render as something other than a <p> (e.g. `h2`, `span`, `div`). */
  as?: ElementType
  className?: string
  title?: string
  id?: string
}

export function Eyebrow({
  children,
  size = 'default',
  align = 'left',
  mono = false,
  as: Tag = 'p',
  className,
  ...rest
}: EyebrowProps) {
  return (
    <Tag
      data-slot="eyebrow"
      className={cn(
        'font-semibold uppercase text-muted-foreground',
        sizeClasses[size],
        alignClasses[align],
        mono && 'font-mono',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export default Eyebrow
