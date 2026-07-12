'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Styled native `<select>` matching the shared `Input` control (components/ui/input.tsx).
 * The shared Radix Select is not compatible with react-hook-form `register()` or plain
 * native change events, so the performance feature reuses this single wrapper instead
 * of hand-rolled `<select className="h-9 ...">` copies.
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  function NativeSelect({ className, ...props }, ref) {
    return (
      <select
        ref={ref}
        data-slot="native-select"
        className={cn(
          'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
          className,
        )}
        {...props}
      />
    )
  },
)
