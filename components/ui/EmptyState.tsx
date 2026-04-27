'use client'

import { type ReactNode } from 'react'
import { Inbox, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

export interface EmptyStateProps {
  /** Either a Lucide icon component (legacy) or any ReactNode (preferred). */
  icon?: LucideIcon | ReactNode
  title: string
  description?: string
  /** Either a ReactNode action (legacy) or a button-shaped descriptor. */
  action?: ReactNode | { label: string; onClick: () => void }
  className?: string
  /** When true, renders without a Card wrapper. */
  bare?: boolean
}

function isLucideIcon(value: unknown): value is LucideIcon {
  // LucideIcon is a component reference, not a rendered element. In dev it's a
  // function; production builds ship lucide as forwardRef objects ({$$typeof,
  // render, displayName}). Both are valid component types — distinguish from
  // ReactNodes (elements have $$typeof + type/props, not render).
  if (typeof value === 'function') return true
  if (typeof value === 'object' && value !== null && 'render' in value) return true
  return false
}

function isActionDescriptor(value: unknown): value is { label: string; onClick: () => void } {
  return (
    !!value &&
    typeof value === 'object' &&
    'label' in (value as Record<string, unknown>) &&
    'onClick' in (value as Record<string, unknown>)
  )
}

/**
 * Centered empty-state with optional soft illustration. Defaults to an Inbox icon
 * inside a soft circle when no `icon` is provided.
 *
 * Apple Pro polish: max-w-[360px], 15px title, 13px muted description, AP primary button.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  bare = false,
}: EmptyStateProps) {
  const renderedIcon = (() => {
    if (icon === undefined) {
      return (
        <div
          className="size-[88px] rounded-full flex items-center justify-center mb-4"
          style={{ background: 'var(--ap-bg-sunken, hsl(var(--muted)))' }}
        >
          <Inbox className="size-10" style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }} />
        </div>
      )
    }
    if (isLucideIcon(icon)) {
      const Icon = icon
      return (
        <div
          className="size-[88px] rounded-full flex items-center justify-center mb-4"
          style={{ background: 'var(--ap-bg-sunken, hsl(var(--muted)))' }}
        >
          <Icon className="size-10" style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }} />
        </div>
      )
    }
    return <div className="mb-4 flex justify-center">{icon}</div>
  })()

  const renderedAction = isActionDescriptor(action) ? (
    <button
      type="button"
      onClick={action.onClick}
      className="ap-btn ap-btn-primary ap-focus-ring"
    >
      {action.label}
    </button>
  ) : (
    action
  )

  const content = (
    <div className="mx-auto flex max-w-[360px] flex-col items-center text-center">
      {renderedIcon}
      <h3 className="text-[15px] font-semibold text-[var(--ap-fg,inherit)]">{title}</h3>
      {description && (
        <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
      )}
      {renderedAction && <div className="mt-5">{renderedAction}</div>}
    </div>
  )

  if (bare) {
    return <div className={cn('py-12 px-6', className)}>{content}</div>
  }

  return <Card className={cn('py-12 px-6', className)}>{content}</Card>
}

export default EmptyState
