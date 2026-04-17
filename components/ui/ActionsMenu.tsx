'use client'

import { type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export interface ActionsMenuItem {
  key: string
  label: string
  icon?: LucideIcon
  onSelect: () => void | Promise<void>
  disabled?: boolean
  destructive?: boolean
  divider?: boolean
  hidden?: boolean
}

export interface ActionsMenuProps {
  items: ActionsMenuItem[]
  trigger?: ReactNode
  className?: string
  align?: 'left' | 'right'
  label?: string
}

export function ActionsMenu({
  items,
  trigger,
  className,
  align = 'right',
  label = 'Open actions menu',
}: ActionsMenuProps) {
  const visibleItems = items.filter((i) => !i.hidden)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ? (
          <button type="button" className={className} aria-label={label}>
            {trigger}
          </button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-8', className)}
            aria-label={label}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align === 'right' ? 'end' : 'start'}>
        {visibleItems.map((item) => {
          if (item.divider) {
            return <DropdownMenuSeparator key={item.key} />
          }
          const Icon = item.icon
          return (
            <DropdownMenuItem
              key={item.key}
              disabled={item.disabled}
              className={cn(item.destructive && 'text-destructive focus:text-destructive')}
              onSelect={async () => {
                if (!item.disabled) await item.onSelect()
              }}
            >
              {Icon && <Icon className="size-4 shrink-0" />}
              <span>{item.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ActionsMenu
