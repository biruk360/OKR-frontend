'use client'

import { type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'

/**
 * Sizes are **additive only** — never remap an existing one. This file has 50
 * importers and every one of them was sized against the five original values.
 *
 * The gap the refresh found was not that the ceiling was too low (`2xl` is
 * `sm:max-w-6xl` = 1152px, already wider than the design's 940px card modal) —
 * it was that there was no *fixed-px* size at all. `940` fills that.
 * See docs/design_refresh_IMPLEMENTATION_STRATEGY.md §4 / §5.
 */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '940'

export type ModalScrollBehavior = 'outside' | 'internal'

const sizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  '2xl': 'sm:max-w-6xl',
  // Fixed px — the design's card-modal shell.
  '940': 'sm:max-w-[940px]',
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  icon?: LucideIcon
  iconClassName?: string
  size?: ModalSize
  children: ReactNode
  footer?: ReactNode
  closeOnBackdrop?: boolean
  closeOnEsc?: boolean
  /** Hide the visible header. The accessible name is still rendered sr-only. */
  hideHeader?: boolean
  scrollBehavior?: ModalScrollBehavior
  stickyHeader?: boolean
  className?: string
  /** Show the built-in top-right close button. Turn off when the content
   *  provides its own, or two close buttons stack on each other. */
  showCloseButton?: boolean
  /** Skip Radix's focus-the-first-focusable behaviour on open. Use when the
   *  first control is a text editor that would otherwise swallow the caret,
   *  or when opening should not scroll a long body to its first input. */
  preventInitialFocus?: boolean
  /** Paint a 6px strip across the top of the shell. Pass a CSS colour — use an
   *  `--ap-*` token, never a hex.
   *
   *  Deliberately **not** bound to the card's status: the design hardcodes one
   *  value and that value matches no entry in the status colour map, so any
   *  status mapping here would be an invention. Omit the prop for no strip. */
  accentColor?: string
}

export function Modal({
  open,
  onClose,
  title,
  icon: Icon,
  iconClassName = 'text-muted-foreground',
  size = 'sm',
  children,
  footer,
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideHeader = false,
  scrollBehavior = 'outside',
  stickyHeader = false,
  className,
  showCloseButton = true,
  preventInitialFocus = false,
  accentColor,
}: ModalProps) {
  const internal = scrollBehavior === 'internal'

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose() }}
      modal
    >
      <DialogContent
        className={cn(
          sizeClasses[size],
          // `!flex` is deliberate: DialogContent hardcodes `grid`, and since Tailwind
          // emits `.grid` after `.flex` at equal specificity, a plain `flex` here loses.
          // Without the override the column layout never applies, the body never
          // shrinks, and a tall modal overflows the viewport instead of scrolling.
          internal && 'max-h-[90vh] !flex flex-col',
          // The strip is absolutely positioned, so the shell has to clip it to its
          // own radius and push its own top padding down by the strip's height.
          accentColor && 'overflow-hidden pt-[calc(1rem+6px)]',
          className,
        )}
        showCloseButton={showCloseButton}
        onPointerDownOutside={(e) => { if (!closeOnBackdrop) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (!closeOnEsc) e.preventDefault() }}
        onOpenAutoFocus={(e) => { if (preventInitialFocus) e.preventDefault() }}
      >
        {accentColor && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[6px]"
            style={{ background: accentColor }}
          />
        )}

        {/* Radix requires a DialogTitle and a description for every dialog; without
            them the dialog is announced unnamed and Radix logs an error. When the
            visible header is hidden, render both sr-only rather than omitting them. */}
        {hideHeader && (
          <>
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
          </>
        )}

        {!hideHeader && (
          <DialogHeader
            className={cn(
              internal && stickyHeader && 'sticky top-0 z-10 bg-popover/95 backdrop-blur',
              internal && 'flex-shrink-0',
            )}
          >
            <DialogTitle className="flex items-center gap-2">
              {Icon && <Icon className={cn('size-5 shrink-0', iconClassName)} />}
              <span className="truncate">{title}</span>
            </DialogTitle>
            {/* Hidden description for a11y — DialogContent requires it */}
            <DialogDescription className="sr-only">{title}</DialogDescription>
          </DialogHeader>
        )}

        {/* `min-h-0` is required: a flex item defaults to min-height:auto, which
            refuses to shrink below its content and defeats overflow-y-auto. */}
        <div className={cn(internal && 'min-h-0 flex-1 overflow-y-auto')}>
          {children}
        </div>

        {footer && (
          <DialogFooter
            className={cn(
              'flex items-center justify-end gap-3',
              internal && 'flex-shrink-0',
            )}
          >
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default Modal
