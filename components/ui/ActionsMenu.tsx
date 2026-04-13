'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ActionsMenuItem {
  /** Stable key for React list render. */
  key: string
  /** Visible label. */
  label: string
  /** Optional left-edge icon. */
  icon?: LucideIcon
  /** Handler fired when the user clicks. Menu closes automatically on return. */
  onSelect: () => void | Promise<void>
  /** Grey out + no-op when true. */
  disabled?: boolean
  /** Red-tinted "destructive" styling. */
  destructive?: boolean
  /** Render as a divider before this item (use with empty handler). */
  divider?: boolean
  /** Hide this row entirely (useful for conditionally-available actions). */
  hidden?: boolean
}

export interface ActionsMenuProps {
  items: ActionsMenuItem[]
  /** Custom trigger button; if omitted we render the three-dot icon button. */
  trigger?: ReactNode
  /** Extra classes on the trigger wrapper. */
  className?: string
  /** Align the popover left or right (default: right-aligned to the trigger). */
  align?: 'left' | 'right'
  /** Accessible label for the default trigger button. */
  label?: string
}

/**
 * Minimal headless dropdown. No library, no portal — absolute-positioned next to
 * the trigger. Closes on outside-click and Escape. Good enough for KR / Objective
 * actions menus; swap for Radix if we grow fancier needs.
 */
export function ActionsMenu({
  items,
  trigger,
  className,
  align = 'right',
  label = 'Open actions menu',
}: ActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const visibleItems = items.filter((i) => !i.hidden)

  return (
    <div ref={wrapperRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={cn(
          trigger
            ? ''
            : 'inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700',
        )}
      >
        {trigger ?? <MoreHorizontal className="h-4 w-4" />}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-30 mt-1 min-w-[200px] rounded-md border border-gray-200 bg-white shadow-lg py-1',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {visibleItems.map((item) => {
            if (item.divider) {
              return <div key={item.key} className="my-1 h-px bg-gray-100" role="separator" />
            }
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={async () => {
                  if (item.disabled) return
                  setOpen(false)
                  await item.onSelect()
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                  item.destructive
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-50',
                  item.disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
                )}
              >
                {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ActionsMenu
