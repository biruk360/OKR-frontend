'use client'

import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: 'sm' | 'md' | 'lg'
}

const widthClass: Record<NonNullable<Props['width']>, string> = {
  sm: 'w-full max-w-sm',
  md: 'w-full max-w-md',
  lg: 'w-full max-w-lg',
}

/**
 * Right-side slide-over panel. Closes on Escape + backdrop click. Reusable
 * for the AG Grid hierarchy drawer and any future detail-in-drawer needs.
 */
export default function SideDrawer({ open, onClose, title, children, width = 'md' }: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 pointer-events-none transition-opacity',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0',
      )}
      aria-hidden={!open}
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside
        className={cn(
          'absolute right-0 top-0 h-full bg-white shadow-2xl border-l border-gray-200 flex flex-col transition-transform',
          widthClass[width],
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  )
}
