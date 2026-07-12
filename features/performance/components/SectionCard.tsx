'use client'

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Apple Pro section card used across the performance module: rounded-[14px]
 * bordered card with an uppercase kicker header row — mirrors the section
 * idiom of app/dashboard/comments/page.tsx and components/dashboard/MyOKRsPage.tsx.
 */
export function SectionCard({
  title,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <section
      className={cn('rounded-[14px] border bg-card overflow-hidden', className)}
      style={{ borderColor: 'var(--ap-border)' }}
    >
      {(title || actions) && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          {title ? (
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
          ) : <span />}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('px-4 py-4', contentClassName)}>{children}</div>
    </section>
  )
}
