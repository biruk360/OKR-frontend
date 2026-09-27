"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(function TooltipTrigger(
  {
    ...props
  },
  ref,
) {
  return <TooltipPrimitive.Trigger ref={ref} data-slot="tooltip-trigger" {...props} />
})

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent(
  {
    className,
    sideOffset = 0,
    children,
    ...props
  },
  ref,
) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        // Tailwind v3 build: no tw-animate utilities (they are v4 `@utility`
        // rules), so enter/exit reuse the ap-person-tip-* keyframes from
        // app/globals.css — 180ms Apple-ease fade + scale from the trigger.
        // Radix tooltip states are delayed-open | instant-open | closed.
        className={cn(
          "z-50 inline-flex w-fit max-w-xs origin-[var(--radix-tooltip-content-transform-origin)] items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-[[data-slot=kbd]]:pr-1.5 [&_[data-slot=kbd]]:relative [&_[data-slot=kbd]]:isolate [&_[data-slot=kbd]]:z-50 [&_[data-slot=kbd]]:rounded-sm data-[state=delayed-open]:animate-[ap-person-tip-in_180ms_cubic-bezier(0.4,0,0.2,1)] data-[state=instant-open]:animate-[ap-person-tip-in_180ms_cubic-bezier(0.4,0,0.2,1)] data-[state=closed]:animate-[ap-person-tip-out_120ms_cubic-bezier(0.4,0,0.2,1)_forwards]",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
})

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
