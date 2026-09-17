"use client"

/**
 * Progress — the one progress bar. Built on Radix so the value is exposed to
 * assistive tech (role=progressbar + aria-value*), which none of the seven
 * hand-rolled `ProgressBar` copies in the app do.
 *
 * Design spec (docs/design_refresh_IMPLEMENTATION_STRATEGY.md §4):
 *   height 6px; radius 99px; track --ap-kr-bar-bg; fill --ap-ok
 *
 * `fill` exists because several call sites tint the bar by OKR status
 * (--ap-warn / --ap-danger / --ap-ahead). Pass a token, never a hex.
 */

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

interface ProgressProps
  extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  /** Bar height in px. 6 is the design default. */
  height?: number
  /** CSS colour for the filled portion. Defaults to `var(--ap-ok)`. */
  fill?: string
  /** CSS colour for the track. Defaults to `var(--ap-kr-bar-bg)`. */
  track?: string
}

function Progress({
  className,
  value,
  height = 6,
  fill = "var(--ap-ok)",
  track = "var(--ap-kr-bar-bg)",
  style,
  ...props
}: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value ?? 0))

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "relative w-full overflow-hidden rounded-[99px]",
        className
      )}
      style={{ height, background: track, ...style }}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="size-full flex-1 rounded-[99px] transition-all duration-300 ease-out"
        style={{ background: fill, transform: `translateX(-${100 - pct}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
export type { ProgressProps }
