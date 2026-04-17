'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  SidebarDesktopColumn,
  SidebarMobileDrawer,
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

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
  const pathname = usePathname()
  const isStrategyMap = pathname === '/dashboard/alignment-map'
  const isFullWidth =
    pathname === '/dashboard/okr-hierarchy' ||
    pathname === '/dashboard/timeline' ||
    pathname?.startsWith('/dashboard/okr-hierarchy/') ||
    pathname?.startsWith('/dashboard/timeline/')
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

  return (
    <>
      <SidebarMobileDrawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div
        className={cn(
          'grid min-h-[100dvh] w-full max-w-[100vw] overflow-x-hidden bg-background',
          'grid-cols-1 grid-rows-[auto_minmax(0,1fr)]',
          !sidebarReady
            ? 'lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[3.5rem_minmax(0,1fr)]'
            : sidebarCollapsed
              ? 'lg:grid-cols-[4rem_minmax(0,1fr)] lg:grid-rows-[3.5rem_minmax(0,1fr)]'
              : 'lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[3.5rem_minmax(0,1fr)]'
        )}
      >
        <SidebarDesktopColumn
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          className="lg:col-start-1 lg:row-start-1 lg:row-span-2"
        />

        <div className="col-start-1 row-start-1 min-w-0 border-b border-border bg-card lg:col-start-2">
          <Header user={user} onMobileNavOpen={() => setMobileNavOpen(true)} />
        </div>

        <main
          className={cn(
            'col-start-1 row-start-2 min-h-0 min-w-0 lg:col-start-2 lg:row-start-2',
            isStrategyMap ? 'flex flex-col overflow-hidden' : 'overflow-y-auto py-6'
          )}
        >
          {isStrategyMap ? (
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          ) : isFullWidth ? (
            <div className="w-full px-4 sm:px-6 lg:px-8">{children}</div>
          ) : (
            <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">{children}</div>
          )}
        </main>
      </div>
    </>
  )
}
