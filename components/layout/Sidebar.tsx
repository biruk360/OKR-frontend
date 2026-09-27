'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  getActiveNavContext,
  getVisibleNavigationGroups,
  isNavPathActive,
  type NavGroup,
} from '@/lib/dashboard-navigation'
import { useEffectivePermissions } from '@/hooks/useEffectivePermissions'
import { Target, X, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet'

const SIDEBAR_COLLAPSED_KEY = 'okr-sidebar-collapsed'

/**
 * Single source of truth for the sidebar rail width.
 *
 * The aside and the `DashboardShell` grid column used to carry two different
 * numbers (220px aside inside a 260px column, 52px inside 4rem), which left a
 * 40px strip of bare background down every desktop page. Both now read the same
 * custom property, so they cannot drift apart again.
 */
export const SIDEBAR_WIDTH_VAR = '--ap-sidebar-w'
export const SIDEBAR_WIDTH_EXPANDED = '228px'
export const SIDEBAR_WIDTH_COLLAPSED = '52px'

export function sidebarWidth(collapsed: boolean): string {
  return collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED
}

/**
 * Runs before first paint so the grid column starts at the width the user
 * actually stored. Without it the server always emits the expanded column and
 * collapsed users get a 176px layout jump on every navigation.
 */
export const SIDEBAR_WIDTH_BOOT_SCRIPT =
  `try{document.documentElement.style.setProperty('${SIDEBAR_WIDTH_VAR}',` +
  `localStorage.getItem('${SIDEBAR_COLLAPSED_KEY}')==='1'?'${SIDEBAR_WIDTH_COLLAPSED}':'${SIDEBAR_WIDTH_EXPANDED}')}catch(e){}`

export function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
}

/* ------------------------------------------------------------------ *
 * Row / eyebrow recipes (§6.1) — 32px rows, 13px/500, 7px radius.
 * ------------------------------------------------------------------ */

const NAV_ROW =
  'group flex h-8 w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-[13px] font-medium transition-colors'

const NAV_ROW_IDLE = 'text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-hover)]'

const NAV_ROW_ACTIVE = 'bg-[var(--ap-accent-soft)] font-semibold text-[var(--ap-accent-on-soft)]'

const NAV_EYEBROW =
  'flex w-full items-center justify-between gap-2 px-2.5 pb-1.5 pt-4 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-[var(--ap-fg-subtle)] transition-colors hover:text-[var(--ap-fg-secondary)]'

/** 5px dot marker — replaces the per-item Lucide icon inside grouped nav. */
function NavDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className="size-[5px] shrink-0 rounded-full"
      style={{ background: active ? 'var(--ap-accent)' : 'var(--ap-none)' }}
    />
  )
}

function useNavOpenState(navigationGroups: NavGroup[]) {
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const groupSignature = navigationGroups.map((group) => `${group.name}:${group.items.map((item) => item.href).join(',')}`).join('|')

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
  }, [pathname, groupSignature, navigationGroups])

  const toggleGroup = (groupName: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }))
  }

  return { openGroups, toggleGroup }
}

function isGroupActive(pathname: string, group: NavGroup) {
  return group.items.some((item) => isNavPathActive(pathname, item.href))
}

type NavRendererProps = {
  navigationGroups: NavGroup[]
  pathname: string
  openGroups: Record<string, boolean>
  toggleGroup: (name: string) => void
  onNavigate?: () => void
}

/**
 * Expanded nav, shared by the desktop column and the mobile drawer.
 *
 * Three shapes, all present in the design:
 *  - single-item group  → icon row (the design's "Dashboard" / "Filters" block)
 *  - open multi-group   → mono eyebrow + dot rows ("MY WORK", "OKRS")
 *  - closed multi-group → one row with a trailing chevron (the design's tail nav)
 */
function renderExpandedGroupNav({ navigationGroups, pathname, openGroups, toggleGroup, onNavigate }: NavRendererProps) {
  return navigationGroups.map((group) => {
    const isGroupOpen = openGroups[group.name] ?? false
    const groupHasActive = isGroupActive(pathname, group)

    if (group.items.length === 1) {
      const item = group.items[0]
      const active = isNavPathActive(pathname, item.href)
      return (
        <Link
          key={group.name}
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={cn(NAV_ROW, active ? NAV_ROW_ACTIVE : NAV_ROW_IDLE)}
        >
          <group.icon
            className={cn('size-[15px] shrink-0', active ? 'text-[var(--ap-accent)]' : 'text-[var(--ap-fg-subtle)]')}
            aria-hidden
          />
          <span className="truncate">{group.name}</span>
        </Link>
      )
    }

    if (!isGroupOpen) {
      return (
        <button
          key={group.name}
          type="button"
          aria-expanded={false}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleGroup(group.name) }}
          className={cn(NAV_ROW, 'cursor-pointer justify-between', groupHasActive ? NAV_ROW_ACTIVE : NAV_ROW_IDLE)}
        >
          <span className="truncate">{group.name}</span>
          <ChevronRight className="size-[13px] shrink-0 text-[var(--ap-fg-faint)]" aria-hidden />
        </button>
      )
    }

    return (
      <div key={group.name}>
        <button
          type="button"
          aria-expanded
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleGroup(group.name) }}
          className={cn(NAV_EYEBROW, 'cursor-pointer')}
        >
          <span className="truncate">{group.name}</span>
          <ChevronDown className="size-[12px] shrink-0 text-[var(--ap-fg-faint)]" aria-hidden />
        </button>
        <div className="flex flex-col gap-px">
          {group.items.map((item) => {
            const active = isNavPathActive(pathname, item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(NAV_ROW, active ? NAV_ROW_ACTIVE : NAV_ROW_IDLE)}
              >
                <NavDot active={active} />
                <span className="truncate">{item.name}</span>
              </Link>
            )
          })}
        </div>
      </div>
    )
  })
}

type FlyoutState = { groupName: string; top: number; left: number }

function CollapsedNavFlyout({ navigationGroups, flyout, pathname, onClose, onNavigate }: { navigationGroups: NavGroup[]; flyout: FlyoutState; pathname: string; onClose: () => void; onNavigate?: () => void }) {
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
      <div
        ref={panelRef}
        role="menu"
        aria-label={`${group.name} submenu`}
        className="fixed z-[95] w-[min(17.5rem,calc(100vw-5rem))] rounded-[var(--ap-radius-md)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] py-1.5 shadow-lg"
        style={{ top, left: flyout.left }}
      >
        <div className="border-b border-[var(--ap-border-soft)] px-3 py-2">
          <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-[var(--ap-fg-subtle)]">Section</p>
          <p className="truncate text-[13px] font-semibold">{group.name}</p>
        </div>
        <nav className="max-h-[min(18rem,70vh)] overflow-y-auto px-1.5 py-1.5">
          <ul className="flex flex-col gap-px">
            {group.items.map((item) => {
              const active = isNavPathActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    role="menuitem"
                    aria-current={active ? 'page' : undefined}
                    className={cn(NAV_ROW, active ? NAV_ROW_ACTIVE : NAV_ROW_IDLE)}
                    onClick={() => { onNavigate?.(); onClose() }}
                  >
                    <NavDot active={active} />
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

function CollapsedSidebarNav({ navigationGroups, pathname, flyout, setFlyout }: { navigationGroups: NavGroup[]; pathname: string; flyout: FlyoutState | null; setFlyout: Dispatch<SetStateAction<FlyoutState | null>> }) {
  const openFlyout = useCallback((groupName: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    setFlyout((prev) => prev?.groupName === groupName ? null : { groupName, top: rect.top, left: rect.right + 8 })
  }, [setFlyout])

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-1.5 py-3">
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
                'flex items-center justify-center rounded-[var(--ap-radius-sm)] p-2 transition-colors',
                active
                  ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]'
                  : 'text-[var(--ap-fg-subtle)] hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]'
              )}
            >
              <item.icon className="size-[18px] shrink-0" />
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
              'flex w-full items-center justify-center rounded-[var(--ap-radius-sm)] p-2 transition-colors',
              groupHasActive || flyoutOpen
                ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]'
                : 'text-[var(--ap-fg-subtle)] hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]'
            )}
          >
            <group.icon className="size-[18px] shrink-0" />
            <span className="sr-only">{group.name} submenu</span>
          </button>
        )
      })}
    </nav>
  )
}

/** Matches Tailwind `lg` — the breakpoint at which the desktop rail replaces the drawer. */
const DESKTOP_NAV_QUERY = '(min-width: 1024px)'

/**
 * Mobile navigation drawer, built on the shared `Sheet` (Radix Dialog): it is a
 * real modal dialog — `role="dialog"`, labelled by its title, Escape and
 * scrim-click close it, focus is trapped inside while open and returned to the
 * menu button on close, and the page behind is inert and scroll-locked.
 */
export function SidebarMobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const permissions = useEffectivePermissions()
  const role = useSession().data?.user?.role
  const navigationGroups = useMemo(
    () => getVisibleNavigationGroups(permissions.canFeature, { role }),
    [permissions.data, role],
  )
  const { openGroups, toggleGroup } = useNavOpenState(navigationGroups)

  // The drawer is lg:hidden, but an open Radix dialog would still trap focus
  // and lock scroll. If the viewport widens past lg while it is open, close it.
  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(DESKTOP_NAV_QUERY)
    if (mq.matches) {
      onClose()
      return
    }
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) onClose() }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [open, onClose])

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <SheetContent
        side="left"
        showCloseButton={false}
        aria-describedby={undefined}
        overlayClassName="z-[100] bg-black/40 lg:hidden"
        className="z-[100] gap-0 bg-[var(--ap-bg-raised)] text-[13px] leading-[1.45] text-[color:var(--ap-fg)] shadow-xl lg:hidden data-[side=left]:w-[min(18rem,100vw)] data-[side=left]:max-w-full data-[side=left]:border-r-0 data-[side=left]:sm:max-w-full"
      >
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 px-2.5">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-[var(--ap-radius-sm)] bg-[var(--ap-accent)] text-white"
          >
            <Target className="size-[14px]" />
          </span>
          <SheetTitle className="flex-1 truncate font-sans text-[14px] font-bold tracking-[-0.01em] text-inherit">
            OKR System
          </SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close menu">
              <X className="size-4" />
            </Button>
          </SheetClose>
        </div>
        <ScrollArea className="flex-1">
          <nav aria-label="Main" className="flex flex-col gap-px px-2.5 pb-6 pt-1">
            {renderExpandedGroupNav({ navigationGroups, pathname, openGroups, toggleGroup, onNavigate: onClose })}
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

export function SidebarDesktopColumn({ collapsed, onToggleCollapsed, className }: { collapsed: boolean; onToggleCollapsed: () => void; className?: string }) {
  const pathname = usePathname()
  const permissions = useEffectivePermissions()
  const role = useSession().data?.user?.role
  const navigationGroups = useMemo(
    () => getVisibleNavigationGroups(permissions.canFeature, { role }),
    [permissions.data, role],
  )
  const { openGroups, toggleGroup } = useNavOpenState(navigationGroups)
  const [flyout, setFlyout] = useState<FlyoutState | null>(null)

  useEffect(() => { setFlyout(null) }, [pathname, collapsed])

  const activeCtx = getActiveNavContext(pathname, navigationGroups)

  return (
    <aside
      data-collapsed={collapsed ? 'true' : 'false'}
      className={cn(
        'hidden min-h-0 shrink-0 flex-col border-r bg-[var(--ap-bg-raised)] lg:flex',
        className
      )}
      style={{
        // Same custom property the DashboardShell grid column reads, so the
        // aside and its track can never disagree — including before hydration,
        // where the value comes from SIDEBAR_WIDTH_BOOT_SCRIPT on <html>.
        width: `var(${SIDEBAR_WIDTH_VAR}, ${SIDEBAR_WIDTH_EXPANDED})`,
        borderRightColor: 'var(--ap-border)',
      }}
    >
      {collapsed ? (
        <div className="flex min-h-[3.5rem] shrink-0 flex-col items-center justify-center gap-1 px-2 py-2">
          <Target className="size-5 shrink-0 text-[var(--ap-accent)]" aria-hidden />
          <Button variant="ghost" size="icon-sm" onClick={onToggleCollapsed} aria-label="Expand sidebar">
            <ChevronsRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 px-2.5">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-[var(--ap-radius-sm)] bg-[var(--ap-accent)] text-white"
          >
            <Target className="size-[14px]" />
          </span>
          <span className="flex-1 truncate text-[14px] font-bold tracking-[-0.01em]">OKR System</span>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse"
            className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-[var(--ap-radius-xs)] text-[var(--ap-fg-subtle)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
          >
            <ChevronsLeft className="size-[14px]" aria-hidden />
          </button>
        </div>
      )}

      {collapsed ? (
        <>
          <CollapsedSidebarNav navigationGroups={navigationGroups} pathname={pathname} flyout={flyout} setFlyout={setFlyout} />
          {flyout && <CollapsedNavFlyout navigationGroups={navigationGroups} flyout={flyout} pathname={pathname} onClose={() => setFlyout(null)} />}
        </>
      ) : (
        <ScrollArea className="flex-1">
          <nav className="flex flex-col gap-px px-2.5 pb-6 pt-1">
            {renderExpandedGroupNav({ navigationGroups, pathname, openGroups, toggleGroup })}
          </nav>
        </ScrollArea>
      )}

      {collapsed && activeCtx && (
        <div className="shrink-0 border-t border-[var(--ap-border-soft)] px-1.5 py-2">
          <p
            className="truncate text-center font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-[var(--ap-fg-subtle)]"
            title={activeCtx.item.name}
          >
            {activeCtx.item.name}
          </p>
        </div>
      )}
    </aside>
  )
}
