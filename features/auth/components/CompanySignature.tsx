'use client'

import { cn } from '@/lib/utils'

/**
 * The house signature on the sign-in screen: 360Ground™ and Eldix IT
 * Technology PLC, set as a typographic lockup rather than a line of fine print.
 *
 * The two names are weighted differently on purpose — the first carries the
 * display weight and keeps its trademark, the second is set in letterspaced
 * caps at a smaller size, so the pair reads as one signature instead of two
 * competing logos. A hairline rule opens it; it runs from the text outward on
 * the left-aligned variant and fades to both sides on the centred one.
 */
export default function CompanySignature({
  align = 'start',
  className,
}: {
  align?: 'start' | 'center'
  className?: string
}) {
  const centered = align === 'center'

  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        centered ? 'items-center' : 'items-start',
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-px',
          centered
            ? 'w-40 bg-gradient-to-r from-transparent via-white/30 to-transparent'
            : 'w-28 bg-gradient-to-r from-white/35 to-transparent'
        )}
      />
      <p
        className={cn(
          'flex flex-wrap items-baseline gap-x-2.5 gap-y-1',
          centered ? 'justify-center text-center' : 'justify-start'
        )}
      >
        <span className="text-[15px] font-semibold tracking-[-0.015em] text-white/95 [text-shadow:0_1px_10px_oklch(0.1_0.02_258/0.5)]">
          360Ground
          <sup className="ml-[1px] align-super text-[9px] font-medium tracking-normal text-white/60">
            ™
          </sup>
        </span>
        <span aria-hidden className="text-[12px] font-light text-white/40">
          &amp;
        </span>
        <span className="text-[10px] uppercase tracking-[0.13em] text-white/70 [text-shadow:0_1px_8px_oklch(0.1_0.02_258/0.45)] sm:text-[10.5px] sm:tracking-[0.17em]">
          Eldix IT Technology PLC
        </span>
      </p>
    </div>
  )
}
