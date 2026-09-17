"use client"

import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * `orientation` controls which scrollbars are rendered. Previously the Root
 * hardcoded a single vertical `<ScrollBar>`, so horizontal scrollers (the board
 * lane scroller, the to-do table) had no visible thumb at all.
 * See docs/design_refresh_IMPLEMENTATION_STRATEGY.md §4.
 */
export type ScrollAreaOrientation = "vertical" | "horizontal" | "both"

function ScrollArea({
  className,
  children,
  orientation = "vertical",
  scrollBarClassName,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  orientation?: ScrollAreaOrientation
  /** Forwarded to every rendered ScrollBar. */
  scrollBarClassName?: string
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      data-orientation={orientation}
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== "horizontal" && (
        <ScrollBar orientation="vertical" className={scrollBarClassName} />
      )}
      {orientation !== "vertical" && (
        <ScrollBar orientation="horizontal" className={scrollBarClassName} />
      )}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
