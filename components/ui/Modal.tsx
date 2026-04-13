'use client'

import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

/**
 * How tall content is handled:
 *   - `outside` (default): the whole overlay scrolls; the card grows with content.
 *     Good for most short/medium forms.
 *   - `internal`: the card is capped at 95vh and its body scrolls; the header/footer
 *     can be sticky (pass `stickyHeader`). Good for tall forms with a chart/preview
 *     alongside (e.g. CreateCheckInModal).
 */
export type ModalScrollBehavior = 'outside' | 'internal'

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
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
  /** Controls how tall content is scrolled (default `outside`). */
  scrollBehavior?: ModalScrollBehavior
  /** When `scrollBehavior="internal"`, keep the header pinned while the body scrolls. */
  stickyHeader?: boolean
  className?: string
}

export function Modal({
  open,
  onClose,
  title,
  icon: Icon,
  iconClassName = 'text-gray-600',
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
  useEffect(() => {
    if (!open || !closeOnEsc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeOnEsc, onClose])

  if (!open) return null

  const internal = scrollBehavior === 'internal'

  return (
    <div
      className={cn(
        'fixed inset-0 z-50',
        scrollBehavior === 'outside' && 'overflow-y-auto'
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex min-h-screen items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75"
          onClick={closeOnBackdrop ? onClose : undefined}
        />

        <div
          className={cn(
            'relative bg-white rounded-lg shadow-xl w-full',
            sizeClasses[size],
            internal && 'max-h-[95vh] flex flex-col',
            className
          )}
        >
          {!hideHeader && (
            <div
              className={cn(
                'flex items-center justify-between p-6 border-b border-gray-200',
                internal && stickyHeader && 'sticky top-0 z-10 bg-white/95 backdrop-blur rounded-t-lg',
                internal && 'flex-shrink-0'
              )}
            >
              <div className="flex items-center min-w-0">
                {Icon && <Icon className={cn('h-6 w-6 mr-2 flex-shrink-0', iconClassName)} />}
                <h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-4"
                aria-label="Close"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          )}

          <div className={cn('p-6', internal && 'flex-1 overflow-y-auto')}>{children}</div>

          {footer && (
            <div
              className={cn(
                'flex items-center justify-end space-x-3 px-6 pb-6',
                internal && 'flex-shrink-0 pt-4 border-t border-gray-200'
              )}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Modal
