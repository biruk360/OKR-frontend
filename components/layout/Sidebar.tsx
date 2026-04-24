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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'

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
        if (hasActiveItem) updated[group.name] = true
      })
      return updated
    })
  }, [pathname])

  const toggleGroup = (groupName: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }))
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

function renderExpandedGroupNav({ pathname, openGroups, toggleGroup, onNavigate }: NavRendererProps) {
  return navigationGroups.map((group) => {
    const isGroupOpen = openGroups[group.name] ?? false
    const groupHasActive = isGroupActive(pathname, group)

    return (
      <div key={group.name}>
        {group.items.length > 1 ? (
          <>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleGroup(group.name) }}
              className={cn(
                'group flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                groupHasActive ? 'bg-primary/10 text-primary-600' : 'text-foreground hover:bg-muted'
              )}
            >
              <div className="flex min-w-0 items-center">
                <group.icon className={cn('mr-2 size-4 shrink-0', groupHasActive ? 'text-primary-500' : 'text-muted-foreground group-hover:text-foreground')} />
                <span className="truncate">{group.name}</span>
              </div>
              {isGroupOpen ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
            </button>
            {isGroupOpen && (
              <div className="relative ml-2 mt-0.5 space-y-0.5 border-l border-border pl-2">
                {group.items.map((item) => {
                  const active = isNavPathActive(pathname, item.href)
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'group relative flex items-center rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                        active ? 'bg-primary/10 text-primary-600' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                      onClick={onNavigate}
                    >
                      <item.icon className={cn('mr-2 size-3.5 shrink-0', active ? 'text-primary-500' : 'text-muted-foreground group-hover:text-foreground')} />
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
              'group flex items-center rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
              isNavPathActive(pathname, group.items[0].href) ? 'bg-primary/10 text-primary-600' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
            onClick={onNavigate}
          >
            <group.icon className={cn('mr-2 size-4 shrink-0', isNavPathActive(pathname, group.items[0].href) ? 'text-primary-500' : 'text-muted-foreground group-hover:text-foreground')} />
            <span className="truncate">{group.name}</span>
          </Link>
        )}
      </div>
    )
  })
}

type FlyoutState = { groupName: string; top: number; left: number }

function CollapsedNavFlyout({ flyout, pathname, onClose, onNavigate }: { flyout: FlyoutState; pathname: string; onClose: () => void; onNavigate?: () => void }) {
  const group = navigationGroups.find((g) => g.name === flyout.groupName)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose() }
    const t = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => { window.clearTimeout(t); document.removeEventListener('mousedown', onDown) }
  }, [onClose, flyout.groupName])

  if (!group || typeof document === 'undefined') return null
  const maxTop = typeof window !== 'undefined' ? Math.max(8, window.innerHeight - 340) : 8
  const top = Math.min(flyout.top, maxTop)

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90] bg-transparent" aria-hidden onClick={onClose} />
      <div ref={panelRef} role="menu" aria-label={`${group.name} submenu`} className="fixed z-[95] w-[min(17.5rem,calc(100vw-5rem))] rounded-lg border border-border bg-popover py-2 shadow-lg" style={{ top, left: flyout.left }}>
        <div className="border-b border-border px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Section</p>
          <p className="truncate text-sm font-semibold">{group.name}</p>
        </div>
        <nav className="max-h-[min(18rem,70vh)] overflow-y-auto px-2 py-2">
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isNavPathActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link href={item.href} role="menuitem" className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors', active ? 'bg-primary/10 text-primary-600' : 'text-foreground hover:bg-muted')} onClick={() => { onNavigate?.(); onClose() }}>
                    <item.icon className={cn('size-3.5 shrink-0', active ? 'text-primary-500' : 'text-muted-foreground')} />
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

function CollapsedSidebarNav({ pathname, flyout, setFlyout }: { pathname: string; flyout: FlyoutState | null; setFlyout: Dispatch<SetStateAction<FlyoutState | null>> }) {
  const openFlyout = useCallback((groupName: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    setFlyout((prev) => prev?.groupName === groupName ? null : { groupName, top: rect.top, left: rect.right + 8 })
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
            <Link key={group.name} href={item.href} title={item.name} className={cn('flex items-center justify-center rounded-md p-2 transition-colors', active ? 'bg-primary/10 text-primary-500' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <item.icon className="size-5 shrink-0" />
              <span className="sr-only">{item.name}</span>
            </Link>
          )
        }

        const flyoutOpen = flyout?.groupName === group.name
        return (
          <button key={group.name} type="button" title={group.name} aria-expanded={flyoutOpen} aria-haspopup="menu" onClick={(e) => openFlyout(group.name, e.currentTarget)} className={cn('flex w-full items-center justify-center rounded-md p-2 transition-colors', groupHasActive || flyoutOpen ? 'bg-primary/10 text-primary-500' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <group.icon className="size-5 shrink-0" />
            <span className="sr-only">{group.name} submenu</span>
          </button>
        )
      })}
    </nav>
  )
}

export function SidebarMobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { openGroups, toggleGroup } = useNavOpenState()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] lg:hidden">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="fixed inset-y-0 left-0 flex w-[min(18rem,100vw)] max-w-full flex-col bg-card shadow-xl">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Target className="size-6 shrink-0 text-primary-500" />
            <span className="truncate text-base font-semibold">OKR System</span>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close menu">
            <X className="size-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <nav className="space-y-1 px-3 py-4">
            {renderExpandedGroupNav({ pathname, openGroups, toggleGroup, onNavigate: onClose })}
          </nav>
        </ScrollArea>
      </div>
    </div>
  )
}

export function SidebarDesktopColumn({ collapsed, onToggleCollapsed, className }: { collapsed: boolean; onToggleCollapsed: () => void; className?: string }) {
  const pathname = usePathname()
  const { openGroups, toggleGroup } = useNavOpenState()
  const [flyout, setFlyout] = useState<FlyoutState | null>(null)

  useEffect(() => { setFlyout(null) }, [pathname, collapsed])

  const activeCtx = getActiveNavContext(pathname)

  return (
    <aside className={cn('ap-glass hidden min-h-0 shrink-0 flex-col border-r lg:flex', collapsed ? 'w-[52px]' : 'w-[220px]', className)} style={{ borderRightColor: 'var(--ap-border)' }}>
      <div className={cn('flex shrink-0 items-center gap-2 border-b border-border px-2', collapsed ? 'min-h-[3.5rem] flex-col justify-center py-2' : 'h-14 justify-between pr-2')}>
        <div className={cn('flex min-w-0 items-center', collapsed ? 'flex-col gap-1' : 'flex-1 gap-2 pl-2')}>
          <Target className={cn('shrink-0 text-primary-500', collapsed ? 'size-5' : 'size-6')} aria-hidden />
          {!collapsed && <span className="truncate text-base font-semibold tracking-tight">OKR System</span>}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onToggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight className="size-4" aria-hidden /> : <ChevronsLeft className="size-4" aria-hidden />}
        </Button>
      </div>

      {collapsed ? (
        <>
          <CollapsedSidebarNav pathname={pathname} flyout={flyout} setFlyout={setFlyout} />
          {flyout && <CollapsedNavFlyout flyout={flyout} pathname={pathname} onClose={() => setFlyout(null)} />}
        </>
      ) : (
        <ScrollArea className="flex-1">
          <nav className="space-y-0.5 px-2 pb-4 pt-3">
            {renderExpandedGroupNav({ pathname, openGroups, toggleGroup })}
          </nav>
        </ScrollArea>
      )}

      {collapsed && activeCtx && (
        <div className="shrink-0 border-t border-border px-1.5 py-2">
          <p className="truncate text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" title={activeCtx.item.name}>{activeCtx.item.name}</p>
        </div>
      )}
    </aside>
  )
}
