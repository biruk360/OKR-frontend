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
          internal && 'max-h-[90vh] flex flex-col',
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

        <div className={cn(internal && 'flex-1 overflow-y-auto')}>
          {children}
        </div>

        {footer && (
          <DialogFooter className="flex items-center justify-end gap-3">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default Modal
