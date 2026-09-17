'use client'

/**
 * SectionHeading — the header row extracted out of
 * `components/ui/dashboard/DashboardCard.tsx`, which is the canonical version
 * of a pattern hand-rolled seven times across the app (two of them byte
 * identical: AppleDashboard.tsx:68 and AppleAnalytics.tsx:22).
 *
 * See docs/design_refresh_IMPLEMENTATION_STRATEGY.md §4 — this is an
 * extraction, not a net-new component. `DashboardCard` consumes it, so the
 * treatment has exactly one definition.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Eyebrow, type EyebrowSize } from './Eyebrow'

export interface SectionHeadingProps {
  /** The eyebrow text. Rendered uppercase. */
  title: string
  /** Optional right-aligned slot — badge, count, action. */
  right?: ReactNode
  /** Eyebrow type scale. Defaults to the 11px in-repo majority. */
  size?: EyebrowSize
  /** Opt-in mono eyebrow. Off by default — see Eyebrow. */
  mono?: boolean
  /** Draw the hairline under the row. On by default (DashboardCard's shape). */
  bordered?: boolean
  /** Heading level for the eyebrow element. */
  as?: 'h2' | 'h3' | 'h4' | 'p'
  className?: string
}

export function SectionHeading({
  title,
  right,
  size = 'default',
  mono = false,
  bordered = true,
  as = 'h2',
  className,
}: SectionHeadingProps) {
  return (
    <div
      data-slot="section-heading"
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-3',
        bordered && 'border-b',
        className,
      )}
      style={bordered ? { borderColor: 'var(--ap-border)' } : undefined}
    >
      <Eyebrow as={as} size={size} mono={mono}>
        {title}
      </Eyebrow>
      {right}
    </div>
  )
}

export default SectionHeading
