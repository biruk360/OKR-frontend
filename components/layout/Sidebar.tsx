'use client'

import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  navigationGroups,
  getActiveNavContext,
  isNavPathActive,
  type NavGroup,
} from '@/lib/dashboard-navigation'
import { Target, X, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

const SIDEBAR_COLLAPSED_KEY = 'okr-sidebar-collapsed'

export function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
}

function useNavOpenState() {
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setOpenGroups((prev) => {
      if (Object.keys(prev).length === 0) {
        const initialOpen: Record<string, boolean> = {}
        navigationGroups.forEach((group) => {
          const hasActiveItem = group.items.some((item) => isNavPathActive(pathname, item.href))
          initialOpen[group.name] = group.defaultOpen || hasActiveItem
        })
        return initialOpen
      }

      const updated: Record<string, boolean> = { ...prev }
      navigationGroups.forEach((group) => {
        const hasActiveItem = group.items.some((item) => isNavPathActive(pathname, item.href))
        if (hasActiveItem) {
          updated[group.name] = true
        }
      })
      return updated
    })
  }, [pathname])

  const toggleGroup = (groupName: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }))
  }

  return { openGroups, toggleGroup }
}

function isGroupActive(pathname: string, group: NavGroup) {
  return group.items.some((item) => isNavPathActive(pathname, item.href))
}

type NavRendererProps = {
  pathname: string
  openGroups: Record<string, boolean>
  toggleGroup: (name: string) => void
  onNavigate?: () => void
}

function renderExpandedGroupNav({
  pathname,
  openGroups,
  toggleGroup,
  onNavigate,
}: NavRendererProps) {
  return navigationGroups.map((group) => {
    const isGroupOpen = openGroups[group.name] ?? false
    const groupHasActive = isGroupActive(pathname, group)

    return (
      <div key={group.name}>
        {group.items.length > 1 ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                toggleGroup(group.name)
              }}
              className={cn(
                'group flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-2 text-body font-medium transition-colors duration-[180ms] ease-apple',
                groupHasActive
                  ? 'bg-primary-500/12 text-primary-700'
                  : 'text-ink-primary hover:bg-surface-hover'
              )}
            >
              <div className="flex min-w-0 items-center">
                <group.icon
                  className={cn(
                    'mr-2 h-[1.125rem] w-[1.125rem] flex-shrink-0 stroke-[1.75]',
                    groupHasActive ? 'text-primary-500' : 'text-ink-secondary group-hover:text-ink-primary'
                  )}
                />
                <span className="truncate">{group.name}</span>
              </div>
              {isGroupOpen ? (
                <ChevronDown className="h-4 w-4 flex-shrink-0 text-ink-secondary" />
              ) : (
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-secondary" />
              )}
            </button>
            {isGroupOpen && (
              <div className="relative z-20 ml-2 mt-1 space-y-0.5 border-l border-ink-secondary/15 pl-2">
                {group.items.map((item) => {
                  const active = isNavPathActive(pathname, item.href)
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'group relative z-20 flex items-center rounded-lg px-2 py-1.5 text-body-sm font-medium transition-colors duration-[180ms] ease-apple',
                        active
                          ? 'bg-primary-500/15 text-primary-700'
                          : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
                      )}
                      onClick={onNavigate}
                    >
                      <item.icon
                        className={cn(
                          'mr-2 h-4 w-4 flex-shrink-0 stroke-[1.75]',
                          active ? 'text-primary-500' : 'text-ink-secondary group-hover:text-ink-primary'
                        )}
                      />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <Link
            href={group.items[0].href}
            className={cn(
              'group flex items-center rounded-lg px-2 py-2 text-body font-medium transition-colors duration-[180ms] ease-apple',
              isNavPathActive(pathname, group.items[0].href)
                ? 'bg-primary-500/15 text-primary-700'
                : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
            )}
            onClick={onNavigate}
          >
            <group.icon
              className={cn(
                'mr-2 h-[1.125rem] w-[1.125rem] flex-shrink-0 stroke-[1.75]',
                isNavPathActive(pathname, group.items[0].href)
                  ? 'text-primary-500'
                  : 'text-ink-secondary group-hover:text-ink-primary'
              )}
            />
            <span className="truncate">{group.name}</span>
          </Link>
        )}
      </div>
    )
  })
}

function CurrentNavCallout({ pathname, className }: { pathname: string; className?: string }) {
  const active = getActiveNavContext(pathname)
  if (!active) return null

  return (
    <div
      className={cn(
        'rounded-card-lg border border-primary-500/15 bg-primary-500/8 px-3 py-2.5',
        className
      )}
    >
      <p className="text-overline text-ink-secondary">Now viewing</p>
      <p className="mt-1 truncate text-body font-semibold text-ink-primary">{active.item.name}</p>
      <p className="truncate text-body-sm text-ink-secondary">{active.group.name}</p>
    </div>
  )
}

type FlyoutState = { groupName: string; top: number; left: number }

function CollapsedNavFlyout({
  flyout,
  pathname,
  onClose,
  onNavigate,
}: {
  flyout: FlyoutState
  pathname: string
  onClose: () => void
  onNavigate?: () => void
}) {
  const group = navigationGroups.find((g) => g.name === flyout.groupName)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = panelRef.current
      if (el && !el.contains(e.target as Node)) onClose()
    }
    const t = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose, flyout.groupName])

  if (!group || typeof document === 'undefined') return null

  const maxTop = typeof window !== 'undefined' ? Math.max(8, window.innerHeight - 340) : 8
  const top = Math.min(flyout.top, maxTop)

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90] bg-transparent" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        role="menu"
        aria-label={`${group.name} submenu`}
        className="fixed z-[95] w-[min(17.5rem,calc(100vw-5rem))] rounded-card-lg border border-black/[0.06] bg-surface-card py-2 shadow-popover"
        style={{ top, left: flyout.left }}
      >
        <div className="border-b border-ink-secondary/10 px-3 py-2">
          <p className="text-overline text-ink-secondary">Section</p>
          <p className="truncate text-body font-semibold text-ink-primary">{group.name}</p>
        </div>
        <nav className="max-h-[min(18rem,70vh)] overflow-y-auto px-2 py-2">
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isNavPathActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    role="menuitem"
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2 py-2 text-body-sm font-medium transition-colors duration-[180ms] ease-apple',
                      active
                        ? 'bg-primary-500/15 text-primary-700'
                        : 'text-ink-primary hover:bg-surface-hover'
                    )}
                    onClick={() => {
                      onNavigate?.()
                      onClose()
                    }}
                  >
                    <item.icon
                      className={cn(
                        'h-4 w-4 shrink-0 stroke-[1.75]',
                        active ? 'text-primary-500' : 'text-ink-secondary'
                      )}
                    />
                    <span className="truncate">{item.name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </>,
    document.body
  )
}

function CollapsedSidebarNav({
  pathname,
  flyout,
  setFlyout,
}: {
  pathname: string
  flyout: FlyoutState | null
  setFlyout: Dispatch<SetStateAction<FlyoutState | null>>
}) {
  const openFlyout = useCallback((groupName: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    setFlyout((prev) =>
      prev?.groupName === groupName
        ? null
        : { groupName, top: rect.top, left: rect.right + 8 }
    )
  }, [setFlyout])

  return (
    <nav className="flex min-h-0 flex-1 flex-col space-y-1 overflow-y-auto overscroll-contain px-1.5 py-3">
      {navigationGroups.map((group) => {
        const groupHasActive = isGroupActive(pathname, group)
        const single = group.items.length === 1
        const item = group.items[0]

        if (single) {
          const active = isNavPathActive(pathname, item.href)
          return (
            <Link
              key={group.name}
              href={item.href}
              title={item.name}
              className={cn(
                'flex items-center justify-center rounded-lg p-2.5 transition-colors duration-[180ms] ease-apple',
                active
                  ? 'bg-primary-500/15 text-primary-600'
                  : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
              )}
            >
              <item.icon className="h-5 w-5 shrink-0 stroke-[1.75]" />
              <span className="sr-only">{item.name}</span>
            </Link>
          )
        }

        const flyoutOpen = flyout?.groupName === group.name
        return (
          <button
            key={group.name}
            type="button"
            title={group.name}
            aria-expanded={flyoutOpen}
            aria-haspopup="menu"
            onClick={(e) => openFlyout(group.name, e.currentTarget)}
            className={cn(
              'flex w-full items-center justify-center rounded-lg p-2.5 transition-colors duration-[180ms] ease-apple',
              groupHasActive || flyoutOpen
                ? 'bg-primary-500/15 text-primary-600'
                : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
            )}
          >
            <group.icon className="h-5 w-5 shrink-0 stroke-[1.75]" />
            <span className="sr-only">{group.name} submenu</span>
          </button>
        )
      })}
    </nav>
  )
}

/** Full-screen mobile navigation (fixed overlay). */
export function SidebarMobileDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const pathname = usePathname()
  const { openGroups, toggleGroup } = useNavOpenState()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] lg:hidden">
      <div className="fixed inset-0 bg-ink-primary/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="fixed inset-y-0 left-0 flex w-[min(20rem,100vw)] max-w-full flex-col bg-surface-card shadow-popover">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-black/[0.06] px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Target className="h-7 w-7 shrink-0 text-primary-500" />
            <span className="truncate text-section-title text-ink-primary">OKR System</span>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-ink-secondary transition-colors duration-[180ms] hover:bg-surface-hover hover:text-ink-primary"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {getActiveNavContext(pathname) ? (
          <div className="border-b border-ink-secondary/10 px-4 py-3">
            <CurrentNavCallout pathname={pathname} className="border-0 bg-surface-app" />
          </div>
        ) : null}
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4">
          {renderExpandedGroupNav({
            pathname,
            openGroups,
            toggleGroup,
            onNavigate: onClose,
          })}
        </nav>
      </div>
    </div>
  )
}

/** Single desktop sidebar: expanded (labels + accordions) or collapsed (icons + flyout submenus). */
export function SidebarDesktopColumn({
  collapsed,
  onToggleCollapsed,
  className,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
  className?: string
}) {
  const pathname = usePathname()
  const { openGroups, toggleGroup } = useNavOpenState()
  const [flyout, setFlyout] = useState<FlyoutState | null>(null)

  useEffect(() => {
    setFlyout(null)
  }, [pathname, collapsed])

  const activeCtx = getActiveNavContext(pathname)

  return (
    <aside
      className={cn(
        'hidden min-h-0 shrink-0 flex-col border-r border-black/[0.06] bg-surface-sidebar lg:flex',
        collapsed ? 'w-16' : 'w-[280px]',
        className
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center gap-2 border-b border-black/[0.06] px-2',
          collapsed ? 'min-h-[3.5rem] flex-col justify-center py-2' : 'h-14 justify-between pr-2'
        )}
      >
        <div className={cn('flex min-w-0 items-center', collapsed ? 'flex-col gap-1' : 'flex-1 gap-2 pl-2')}>
          <Target className={cn('shrink-0 text-primary-500', collapsed ? 'h-6 w-6' : 'h-7 w-7')} aria-hidden />
          {!collapsed ? (
            <span className="truncate text-section-title tracking-tight text-ink-primary">OKR System</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            'rounded-lg p-2 text-ink-secondary transition-colors duration-[180ms] hover:bg-surface-hover hover:text-ink-primary',
            collapsed && 'shrink-0'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronsRight className="h-5 w-5 stroke-[1.75]" aria-hidden />
          ) : (
            <ChevronsLeft className="h-5 w-5 stroke-[1.75]" aria-hidden />
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="shrink-0 px-3 pt-3">
          <CurrentNavCallout pathname={pathname} />
        </div>
      )}

      {collapsed ? (
        <>
          <CollapsedSidebarNav pathname={pathname} flyout={flyout} setFlyout={setFlyout} />
          {flyout ? (
            <CollapsedNavFlyout
              flyout={flyout}
              pathname={pathname}
              onClose={() => setFlyout(null)}
            />
          ) : null}
        </>
      ) : (
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-4 pt-3">
          {renderExpandedGroupNav({ pathname, openGroups, toggleGroup })}
        </nav>
      )}

      {collapsed && activeCtx ? (
        <div className="shrink-0 border-t border-black/[0.06] px-1.5 py-2">
          <p
            className="truncate text-center text-[10px] font-semibold uppercase tracking-wide text-ink-secondary"
            title={activeCtx.item.name}
          >
            {activeCtx.item.name}
          </p>
        </div>
      ) : null}
    </aside>
  )
}
