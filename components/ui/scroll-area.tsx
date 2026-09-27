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

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    orientation?: ScrollAreaOrientation
    /** Forwarded to every rendered ScrollBar. */
    scrollBarClassName?: string
  }
>(function ScrollArea(
  {
    className,
    children,
    orientation = "vertical",
    scrollBarClassName,
    ...props
  },
  ref,
) {
  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      data-slot="scroll-area"
      data-orientation={orientation}
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none ap-focus-ring-inset"
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
})

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(function ScrollBar(
  {
    className,
    orientation = "vertical",
    ...props
  },
  ref,
) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:border-t data-[orientation=horizontal]:border-t-transparent data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5 data-[orientation=vertical]:border-l data-[orientation=vertical]:border-l-transparent",
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
})

export { ScrollArea, ScrollBar }
