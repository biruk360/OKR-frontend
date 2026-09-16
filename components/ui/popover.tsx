"use client"

/**
 * Popover — shared primitive built on Radix, replacing the hand-rolled
 * absolutely-positioned divs used across the app (date picker, card panels,
 * OKR link, background picker).
 *
 * Why this exists: before this, every popover in the codebase re-implemented
 * outside-click, Escape, portalling and z-index by hand, and none of them
 * trapped focus or restored it on close. Radix gives us all of that plus
 * collision-aware positioning for free.
 *
 * Spec: docs/trello_parity_sprint_board_REQUIREMENTS.md §8.1 (gap: "No Popover
 * primitive"). Apple Pro tokens only — see docs/apple_pro_token.md.
 */

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverClose({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Close>) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />
}

interface PopoverContentProps
  extends Omit<React.ComponentProps<typeof PopoverPrimitive.Content>, "title"> {
  /** Accessible name for the popover dialog. Required — icon-only triggers
   *  otherwise leave the surface unnamed for screen readers. */
  label: string
  /** Optional visible heading, rendered in the centered header row.
   *  Named `heading` rather than `title` so it cannot collide with the HTML
   *  `title` attribute Radix forwards to the underlying element. */
  heading?: React.ReactNode
  /** Render the heading row with a close button on the right. */
  showClose?: boolean
}

function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  label,
  heading,
  showClose = true,
  children,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        role="dialog"
        aria-label={label}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-50 w-[300px] overflow-hidden rounded-[14px] bg-popover p-0 text-popover-foreground",
          "shadow-[var(--ap-shadow-lg)] ring-1 ring-foreground/10",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
          "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      >
        {heading && (
          <div
            className="relative flex items-center justify-center border-b px-3 py-2"
            style={{ borderColor: "var(--ap-border)" }}
          >
            <span className="text-[13px] font-semibold">{heading}</span>
            {showClose && (
              <PopoverPrimitive.Close
                aria-label="Close"
                className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-md text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              </PopoverPrimitive.Close>
            )}
          </div>
        )}
        <div className="p-3">{children}</div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverClose, PopoverContent }
export type { PopoverContentProps }
