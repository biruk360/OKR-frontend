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
 *
 * Design refresh (docs/design_refresh_IMPLEMENTATION_STRATEGY.md §4) added:
 *   - `width`  — the designs need 168/176/186/190/232/244/252/268/272/276/290/420.
 *                Default stays 300 so existing call sites are unaffected.
 *   - `variant` — 'menu' (tight rows) vs 'panel' (titled surface).
 *   - the shadow ramp: popover elevation is keyed to width, so call sites never
 *     pick a shadow by hand.
 */

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

const PopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>(function PopoverTrigger(
  {
    ...props
  },
  ref,
) {
  return <PopoverPrimitive.Trigger ref={ref} data-slot="popover-trigger" {...props} />
})

const PopoverAnchor = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Anchor>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Anchor>
>(function PopoverAnchor(
  {
    ...props
  },
  ref,
) {
  return <PopoverPrimitive.Anchor ref={ref} data-slot="popover-anchor" {...props} />
})

const PopoverClose = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Close>
>(function PopoverClose(
  {
    ...props
  },
  ref,
) {
  return <PopoverPrimitive.Close ref={ref} data-slot="popover-close" {...props} />
})

/** Elevation steps. Tokens live in app/globals.css (light + dark). */
export type PopoverShadow = "sm" | "md" | "lg" | "xl" | "panel" | "none"

const shadowVar: Record<PopoverShadow, string | undefined> = {
  sm: "var(--ap-shadow-pop-sm)",
  md: "var(--ap-shadow-pop-md)",
  lg: "var(--ap-shadow-pop-lg)",
  xl: "var(--ap-shadow-pop-xl)",
  panel: "var(--ap-shadow-pop-panel)",
  none: undefined,
}

/**
 * Popover elevation is a ramp keyed to width — wider popover, deeper shadow.
 * The designs' own measurements are not perfectly monotonic (168 sits one step
 * above 176), so this collapses them to a monotonic ladder; the difference
 * between adjacent steps is ~0.02 shadow alpha. Pass `shadow` to override.
 */
function shadowForWidth(width: number): PopoverShadow {
  if (width < 186) return "sm"     // 168, 176
  if (width < 232) return "md"     // 186, 190
  if (width < 252) return "lg"     // 232, 244
  if (width < 272) return "xl"     // 252, 268
  return "panel"                   // 272, 276, 290, 420
}

/**
 * 'menu'  — a list of rows; 5px padding, 9px radius.
 * 'panel' — a titled surface with form controls; 12px padding, 11px radius.
 *           This is the default because it matches the pre-refresh shape
 *           (`p-3`), so no existing call site loses its padding.
 */
export type PopoverVariant = "menu" | "panel"

const variantBody: Record<PopoverVariant, string> = {
  menu: "p-[5px]",
  panel: "p-3",
}

const variantRadius: Record<PopoverVariant, string> = {
  menu: "rounded-[9px]",
  panel: "rounded-[11px]",
}

interface PopoverContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>, "title"> {
  /** Accessible name for the popover dialog. Required — icon-only triggers
   *  otherwise leave the surface unnamed for screen readers. */
  label: string
  /** Optional visible heading, rendered in the centered header row.
   *  Named `heading` rather than `title` so it cannot collide with the HTML
   *  `title` attribute Radix forwards to the underlying element. */
  heading?: React.ReactNode
  /** Render the heading row with a close button on the right. */
  showClose?: boolean
  /** Fixed pixel width. Omit to keep the legacy 300px default. Supplying it
   *  also selects the shadow step unless `shadow` is passed explicitly. */
  width?: number
  /** Density + radius. See PopoverVariant. */
  variant?: PopoverVariant
  /** Override the width-derived elevation. */
  shadow?: PopoverShadow
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  label,
  heading,
  showClose = true,
  width,
  variant = "panel",
  shadow,
  style,
  children,
  ...props
}, ref) {
  // Only emit an inline width when one was asked for: existing call sites size
  // themselves with a `w-[260px]` className, and an inline style would beat it.
  const resolvedShadow: PopoverShadow =
    shadow ?? (width !== undefined ? shadowForWidth(width) : "none")
  const boxShadow = shadowVar[resolvedShadow] ?? "var(--ap-shadow-lg)"

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        data-slot="popover-content"
        data-variant={variant}
        role="dialog"
        aria-label={label}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        style={{ boxShadow, ...(width !== undefined ? { width } : null), ...style }}
        className={cn(
          "z-50 overflow-hidden bg-popover p-0 text-popover-foreground",
          width === undefined && "w-[300px]",
          variantRadius[variant],
          "ring-1 ring-foreground/10",
          // tw-animate utilities are Tailwind v4-only; reuse the 180ms
          // ap-person-tip-* fade + scale keyframes from app/globals.css.
          "origin-[var(--radix-popover-content-transform-origin)]",
          "data-[state=open]:animate-[ap-person-tip-in_180ms_cubic-bezier(0.4,0,0.2,1)]",
          "data-[state=closed]:animate-[ap-person-tip-out_120ms_cubic-bezier(0.4,0,0.2,1)_forwards]",
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
                className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-[var(--ap-radius-xs)] text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
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
        <div className={variantBody[variant]}>{children}</div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
})

export { Popover, PopoverTrigger, PopoverAnchor, PopoverClose, PopoverContent, shadowForWidth }
export type { PopoverContentProps }
