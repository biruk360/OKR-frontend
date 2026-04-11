'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { User, LogOut, Settings, Bell, Menu } from 'lucide-react'
import { getDashboardPageTitle } from '@/lib/dashboard-page-titles'
import { useDashboardTitleContext } from '@/components/layout/DashboardTitleContext'

interface HeaderProps {
  user: {
    name?: string | null
    email?: string | null
    avatar?: string | null
    role?: string
  }
  /** Opens the mobile nav drawer (grid shell — no fixed overlap). */
  onMobileNavOpen?: () => void
}

export default function Header({ user, onMobileNavOpen }: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { overrideTitle } = useDashboardTitleContext()
  const pageTitle = overrideTitle ?? getDashboardPageTitle(pathname)

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/auth/signin' })
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <header className="bg-transparent">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-4 lg:px-6">
        {onMobileNavOpen ? (
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-ink-secondary transition-colors duration-[180ms] hover:bg-surface-hover hover:text-ink-primary lg:hidden"
            onClick={onMobileNavOpen}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5 stroke-[1.75]" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-page-title text-ink-primary">{pageTitle}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="relative">
            <button
              type="button"
              className="relative rounded-pill p-2 text-ink-secondary transition-colors duration-[180ms] hover:bg-surface-hover hover:text-ink-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            >
              <Bell className="h-5 w-5 stroke-[1.75]" />
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-pill bg-danger-500 text-[10px] font-medium text-white">
                3
              </span>
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 z-10 mt-2 w-72 origin-top-right rounded-card-lg bg-surface-card py-1 shadow-popover focus:outline-none">
                <div className="list-divider px-4 py-2">
                  <h3 className="text-overline text-ink-secondary">Notifications</h3>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <div className="px-4 py-2.5 transition-colors duration-[180ms] hover:bg-surface-hover">
                    <p className="text-body text-ink-primary">New comment on your objective</p>
                    <p className="mt-0.5 text-body-sm text-ink-secondary">2 minutes ago</p>
                  </div>
                  <div className="px-4 py-2.5 transition-colors duration-[180ms] hover:bg-surface-hover">
                    <p className="text-body text-ink-primary">Key result progress updated</p>
                    <p className="mt-0.5 text-body-sm text-ink-secondary">1 hour ago</p>
                  </div>
                  <div className="px-4 py-2.5 transition-colors duration-[180ms] hover:bg-surface-hover">
                    <p className="text-body text-ink-primary">New objective assigned to you</p>
                    <p className="mt-0.5 text-body-sm text-ink-secondary">3 hours ago</p>
                  </div>
                </div>
                <div className="list-divider px-4 py-2">
                  <button
                    type="button"
                    className="text-body-sm font-medium text-primary-500 hover:text-primary-700"
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              className="flex items-center rounded-pill text-body-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
            >
              <span className="sr-only">Open user menu</span>
              {user.avatar ? (
                <img
                  className="h-8 w-8 rounded-pill object-cover"
                  src={user.avatar}
                  alt={user.name || 'User'}
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-pill bg-primary-500/15">
                  <span className="text-body-sm font-semibold text-primary-600">
                    {user.name ? getInitials(user.name) : 'U'}
                  </span>
                </div>
              )}
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-card-lg bg-surface-card py-1 shadow-popover focus:outline-none">
                <div className="list-divider px-4 py-2">
                  <p className="truncate text-body font-medium text-ink-primary">{user.name}</p>
                  <p className="truncate text-body-sm text-ink-secondary">{user.email}</p>
                  <p className="mt-1 text-body-sm capitalize text-primary-600">{user.role?.toLowerCase()}</p>
                </div>
                <button
                  type="button"
                  className="flex w-full items-center px-4 py-2 text-left text-body text-ink-primary transition-colors duration-[180ms] hover:bg-surface-hover"
                  onClick={() => {
                    setIsProfileOpen(false)
                    router.push('/dashboard/settings/profile')
                  }}
                >
                  <User className="mr-2 h-4 w-4 stroke-[1.75]" />
                  Your Profile
                </button>
                <button
                  type="button"
                  className="flex w-full items-center px-4 py-2 text-left text-body text-ink-primary transition-colors duration-[180ms] hover:bg-surface-hover"
                  onClick={() => {
                    setIsProfileOpen(false)
                    router.push('/dashboard/settings')
                  }}
                >
                  <Settings className="mr-2 h-4 w-4 stroke-[1.75]" />
                  Settings
                </button>
                <button
                  type="button"
                  className="flex w-full items-center px-4 py-2 text-left text-body text-ink-primary transition-colors duration-[180ms] hover:bg-surface-hover"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-2 h-4 w-4 stroke-[1.75]" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
