'use client'

import { useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  SidebarDesktopColumn,
  SidebarMobileDrawer,
  readSidebarCollapsed,
  writeSidebarCollapsed,
  sidebarWidth,
  SIDEBAR_WIDTH_VAR,
  SIDEBAR_WIDTH_BOOT_SCRIPT,
} from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import CmdkActionListener from '@/components/cmdk/CmdkActionListener'
import CheckInPickerModal from '@/components/cmdk/CheckInPickerModal'
import GlobalCheckInModal from '@/components/cmdk/GlobalCheckInModal'
import { useIdleTimeout } from '@/hooks'

interface DashboardShellProps {
  user: {
    name?: string | null
    email?: string | null
    avatar?: string | null
    role?: string
  }
  children: ReactNode
}

export default function DashboardShell({ user, children }: DashboardShellProps) {
  useIdleTimeout()
  const pathname = usePathname()
  const isStrategyMap =
    pathname === '/dashboard/alignment-map' ||
    pathname === '/dashboard/filters' ||
    pathname === '/dashboard/admin/org'
  const isFullWidth =
    pathname === '/dashboard/okr-hierarchy' ||
    pathname === '/dashboard/timeline' ||
    pathname === '/dashboard/plans' ||
    pathname === '/dashboard/work' ||
    pathname?.startsWith('/dashboard/okr-hierarchy/') ||
    pathname?.startsWith('/dashboard/timeline/') ||
    pathname?.startsWith('/dashboard/sprints/')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarReady, setSidebarReady] = useState(false)

  useEffect(() => {
    setSidebarCollapsed(readSidebarCollapsed())
    setSidebarReady(true)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      writeSidebarCollapsed(next)
      return next
    })
  }, [])

  // Before the effect has run we deliberately publish *no* value: the boot
  // script below has already set the stored width on <html>, and overriding it
  // here with the default-expanded state is exactly what caused the layout jump
  // for collapsed users. Once hydrated, this local value takes over so toggling
  // stays reactive.
  const shellStyle = sidebarReady
    ? ({ [SIDEBAR_WIDTH_VAR]: sidebarWidth(sidebarCollapsed) } as CSSProperties)
    : undefined

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SIDEBAR_WIDTH_BOOT_SCRIPT }} />
      <CmdkActionListener />
      <CheckInPickerModal />
      <GlobalCheckInModal />
      <SidebarMobileDrawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div
        style={shellStyle}
        className={cn(
          'grid min-h-[100dvh] w-full max-w-[100vw] overflow-x-hidden bg-background',
          'grid-cols-1 grid-rows-[auto_minmax(0,1fr)]',
          // Sidebar track and the aside itself both read --ap-sidebar-w, so the
          // 40px dead strip the old 220-inside-260 mismatch produced is gone.
          // Written out literally on purpose — Tailwind scans source text, so an
          // interpolated `${SIDEBAR_WIDTH_VAR}` here would emit no CSS at all.
          'lg:grid-cols-[var(--ap-sidebar-w,228px)_minmax(0,1fr)]',
          'lg:grid-rows-[54px_minmax(0,1fr)]'
        )}
      >
        <SidebarDesktopColumn
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          className="lg:col-start-1 lg:row-start-1 lg:row-span-2"
        />

        <div className="col-start-1 row-start-1 min-w-0 lg:col-start-2">
          <Header user={user} onMobileNavOpen={() => setMobileNavOpen(true)} />
        </div>

        <main
          className={cn(
            'col-start-1 row-start-2 min-h-0 min-w-0 lg:col-start-2 lg:row-start-2',
            isStrategyMap ? 'flex flex-col overflow-hidden' : 'overflow-y-auto py-4'
          )}
        >
          {/* Gutters intentionally match the Header's own px-3/sm:px-4/lg:px-[18px] so
              page content lines up with the header instead of sitting in from it. */}
          {isStrategyMap ? (
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          ) : isFullWidth ? (
            <div className="w-full px-3 sm:px-4 lg:px-[18px]">{children}</div>
          ) : (
            <div className="mx-auto w-full max-w-content px-3 sm:px-4 lg:px-[18px]">{children}</div>
          )}
        </main>
      </div>
    </>
  )
}
