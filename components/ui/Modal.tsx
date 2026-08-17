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

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

export type ModalScrollBehavior = 'outside' | 'internal'

const sizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  '2xl': 'sm:max-w-6xl',
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
  hideHeader?: boolean
  scrollBehavior?: ModalScrollBehavior
  stickyHeader?: boolean
  className?: string
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
          className,
        )}
        onPointerDownOutside={(e) => { if (!closeOnBackdrop) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (!closeOnEsc) e.preventDefault() }}
      >
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
