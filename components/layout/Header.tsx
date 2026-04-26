'use client'

import { signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { User, LogOut, Settings, Bell, Menu, Search } from 'lucide-react'
import { useCmdkStore } from '@/lib/stores/cmdk-store'
import { getDashboardPageTitle } from '@/lib/dashboard-page-titles'
import { useDashboardTitleContext } from '@/components/layout/DashboardTitleContext'
import NavProgressCircles from '@/components/layout/NavProgressCircles'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import ThemeSwitcher from '@/components/layout/ThemeSwitcher'

interface HeaderProps {
  user: {
    name?: string | null
    email?: string | null
    avatar?: string | null
    role?: string
  }
  onMobileNavOpen?: () => void
}

export default function Header({ user, onMobileNavOpen }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { overrideTitle } = useDashboardTitleContext()
  const pageTitle = overrideTitle ?? getDashboardPageTitle(pathname)

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <header className="ap-glass sticky top-0 z-20 border-b" style={{ borderBottomColor: 'var(--ap-border)' }}>
      <div className="flex h-12 items-center gap-2 px-3 sm:px-4 lg:px-5">
        {onMobileNavOpen && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={onMobileNavOpen}
            aria-label="Open navigation menu"
          >
            <Menu className="size-5" />
          </Button>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{pageTitle}</h1>
        </div>

        <button
          type="button"
          onClick={() => useCmdkStore.getState().setOpen(true)}
          aria-label="Open command palette"
          className="hidden h-8 w-[280px] items-center gap-2 rounded-[10px] px-3 text-[13px] transition-colors md:flex"
          style={{
            background: 'rgba(120,120,128,0.10)',
            color: 'var(--ap-fg-subtle)',
          }}
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 text-left">Search…</span>
          <kbd
            className="flex h-5 items-center gap-0.5 rounded-[6px] px-1.5 font-mono text-[11px]"
            style={{
              background: 'rgba(120,120,128,0.16)',
              color: 'var(--ap-fg-subtle)',
            }}
          >
            ⌘K
          </kbd>
        </button>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeSwitcher />
          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="size-4" />
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                  3
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <div className="px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notifications</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="flex-col items-start gap-0.5 py-2.5">
                <p className="text-sm">New comment on your objective</p>
                <p className="text-xs text-muted-foreground">2 minutes ago</p>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex-col items-start gap-0.5 py-2.5">
                <p className="text-sm">Key result progress updated</p>
                <p className="text-xs text-muted-foreground">1 hour ago</p>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex-col items-start gap-0.5 py-2.5">
                <p className="text-sm">New objective assigned to you</p>
                <p className="text-xs text-muted-foreground">3 hours ago</p>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="justify-center text-sm font-medium text-primary-500"
                onSelect={() => router.push('/dashboard/notifications')}
              >
                View all notifications
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <NavProgressCircles />

          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                {user.avatar ? (
                  <img className="size-7 rounded-full object-cover" src={user.avatar} alt={user.name || 'User'} />
                ) : (
                  <div className="flex size-7 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-xs font-semibold text-primary-600">
                      {user.name ? getInitials(user.name) : 'U'}
                    </span>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-3 py-2">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                <p className="mt-1 text-xs capitalize text-primary-600">{user.role?.toLowerCase()}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push('/dashboard/settings/profile')}>
                <User className="size-4" />
                <span>Your Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/dashboard/settings')}>
                <Settings className="size-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => signOut({ callbackUrl: '/auth/signin' })}>
                <LogOut className="size-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
