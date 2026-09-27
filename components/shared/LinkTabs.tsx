import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LinkTabItem {
  key: string
  label: string
  href: string
  icon?: LucideIcon
}

/**
 * URL-synced tab strip: every tab is a plain `<Link>` to its own URL, so the
 * active tab survives reloads, can be bookmarked and works without client JS.
 * Server-component safe. Used by the OKR Explorer (views + level presets) and
 * Insights (tabs + Progress sub-views).
 *
 *  - `variant="tabs"`: underlined page-level tabs.
 *  - `variant="segmented"`: compact pill group for presets.
 */
export function LinkTabs({
  items,
  activeKey,
  ariaLabel,
  variant = 'tabs',
  className,
}: {
  items: LinkTabItem[]
  activeKey: string
  ariaLabel: string
  variant?: 'tabs' | 'segmented'
  className?: string
}) {
  if (variant === 'segmented') {
    return (
      <nav
        aria-label={ariaLabel}
        className={cn('inline-flex max-w-full items-center overflow-x-auto rounded-[var(--ap-radius-sm)] border p-0.5', className)}
        style={{ background: 'var(--ap-bg-sunken)', borderColor: 'var(--ap-border)' }}
      >
        {items.map((item) => {
          const active = item.key === activeKey
          const Icon = item.icon
          return (
            <Link
              key={item.key}
              href={item.href}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium transition',
                active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {Icon && <Icon className="size-3.5" aria-hidden="true" />}
              {item.label}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <nav aria-label={ariaLabel} className={cn('-mb-px flex max-w-full items-center gap-1 overflow-x-auto', className)}>
      {items.map((item) => {
        const active = item.key === activeKey
        const Icon = item.icon
        return (
          <Link
            key={item.key}
            href={item.href}
            scroll={false}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-body-sm font-medium transition-colors',
              active
                ? 'border-[color:var(--ap-accent)] text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className="size-4" aria-hidden="true" />}
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
