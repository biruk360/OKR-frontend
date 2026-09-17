'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  User,
  LogOut,
  Settings,
  Bell,
  Menu,
  Search,
  Target,
  CheckSquare,
  Lock,
  ChevronDown,
} from 'lucide-react'
import { useCmdkStore } from '@/lib/stores/cmdk-store'
import { getDashboardPageTitle } from '@/lib/dashboard-page-titles'
import { useDashboardTitleContext } from '@/components/layout/DashboardTitleContext'
import NavProgressCircles from '@/components/layout/NavProgressCircles'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/Modal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

interface ChangePasswordForm {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export default function Header({ user, onMobileNavOpen }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { overrideTitle } = useDashboardTitleContext()
  const pageTitle = overrideTitle ?? getDashboardPageTitle(pathname)
  const hidePageTitle =
    /^\/dashboard\/(objectives|key-results)\/[^/]+\/?$/.test(pathname)

  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordForm>()

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const onChangePassword = async (data: ChangePasswordForm) => {
    if (data.newPassword !== data.confirmPassword) {
      setError('confirmPassword', { message: 'Passwords do not match' })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      })
      const json = await res.json()

      if (!res.ok) {
        setError('currentPassword', { message: json.error || 'Failed to change password' })
        return
      }

      toast.success('Password changed successfully')
      setChangePasswordOpen(false)
      reset()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClosePasswordModal = () => {
    setChangePasswordOpen(false)
    reset()
  }

  return (
    <>
      {/* One bottom border, one background. The grid cell in DashboardShell used
          to add `border-b bg-card` on top of this header's own `ap-glass border-b`
          — two hairlines, and the opaque bg-card underneath cancelled the glass
          backdrop-filter anyway. Resolved in favour of the design's solid bar:
          nothing scrolls beneath this header (main is a sibling grid row with its
          own overflow), so the blur only cost a stacking context. */}
      <header
        className="sticky top-0 z-20 border-b bg-[var(--ap-bg-raised)]"
        style={{ borderBottomColor: 'var(--ap-border)' }}
      >
        <div className="flex h-[54px] items-center gap-2 px-3 sm:gap-3.5 sm:px-4 lg:px-[18px]">
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

          {!hidePageTitle && (
            <h1 className="min-w-0 shrink truncate text-[18px] font-bold tracking-[-0.02em]">{pageTitle}</h1>
          )}

          {/* Spacer + centred search. The wrapper always takes the free space so
              the right-hand cluster stays flush right even when the field is
              hidden below md. */}
          <div className="flex min-w-0 flex-1 justify-center">
            <button
              type="button"
              onClick={() => useCmdkStore.getState().setOpen(true)}
              aria-label="Open command palette"
              /* --ap-border-strong, not the design's lighter border, is deliberate.
                 The field is --ap-bg-sunken on a --ap-bg-raised header: a 1.04:1
                 fill difference, so nothing but the stroke shows where the control
                 is. That makes the boundary "required to identify the component"
                 under WCAG 1.4.11, which needs 3:1 — the design's value sits at
                 ~1.2:1. Same call we already made on the palette: where the mock
                 fails AA, the mock loses. */
              className="hidden h-[34px] w-full max-w-[420px] items-center gap-2 rounded-[var(--ap-radius-md)] border border-[var(--ap-border-strong)] bg-[var(--ap-bg-sunken)] px-[11px] text-[13px] text-[var(--ap-fg-subtle)] transition-colors hover:bg-[var(--ap-bg-hover)] md:flex"
            >
              <Search className="size-[14px] shrink-0" />
              <span className="flex-1 truncate text-left">Search cards, OKRs, people…</span>
              <kbd className="shrink-0 rounded-[4px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-[5px] py-[2px] font-mono text-[10px] leading-none text-[var(--ap-fg-subtle)]">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <ThemeSwitcher />

            {/* Notifications.
                The preview list used to be three hardcoded strings behind a
                literal "3" badge. There is no /api/notifications list route to
                back it (only .../preferences and the cron writer), so the
                dropdown now says so honestly and routes to the real page, which
                does read Notification rows server-side. Restore the badge and a
                preview list here once that route exists. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Notifications">
                  <Bell className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <div className="px-3 py-2">
                  <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-[var(--ap-fg-subtle)]">
                    Notifications
                  </p>
                </div>
                <DropdownMenuSeparator />
                <p className="px-3 py-6 text-center text-[13px] text-[var(--ap-fg-subtle)]">
                  No preview available yet.
                </p>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="justify-center text-[13px] font-medium text-[var(--ap-accent)]"
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
                <Button
                  variant="ghost"
                  size="default"
                  className="h-8 gap-2 rounded-[8px] pl-1 pr-2"
                >
                  {user.avatar ? (
                    <img className="size-[26px] rounded-full object-cover" src={user.avatar} alt={user.name || 'User'} />
                  ) : (
                    <div className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--ap-accent-soft)]">
                      <span className="text-[9.5px] font-bold text-[var(--ap-accent-on-soft)]">
                        {user.name ? getInitials(user.name) : 'U'}
                      </span>
                    </div>
                  )}
                  <span className="hidden max-w-[120px] truncate text-[13px] font-semibold sm:block">
                    {user.name ?? user.email ?? 'Account'}
                  </span>
                  <ChevronDown className="size-3 shrink-0 text-[var(--ap-fg-subtle)]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {/* User identity */}
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    <p className="mt-0.5 text-xs capitalize text-primary-600">{user.role?.toLowerCase().replace('_', ' ')}</p>
                  </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                {/* Navigation items */}
                <DropdownMenuItem onSelect={() => router.push('/dashboard/settings/profile')}>
                  <User className="size-4" />
                  <span>My Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push('/dashboard/okrs?owner=me')}>
                  <Target className="size-4" />
                  <span>My OKRs</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push('/dashboard/todos')}>
                  <CheckSquare className="size-4" />
                  <span>My To-Dos</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Account actions */}
                <DropdownMenuItem
                  onSelect={() => setChangePasswordOpen(true)}
                >
                  <Lock className="size-4" />
                  <span>Change Password</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push('/dashboard/settings')}>
                  <Settings className="size-4" />
                  <span>Settings</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onSelect={() => signOut({ callbackUrl: '/auth/signin' })}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="size-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Change Password Modal */}
      <Modal
        open={changePasswordOpen}
        onClose={handleClosePasswordModal}
        title="Change Password"
        icon={Lock}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={handleClosePasswordModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit(onChangePassword)}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving…' : 'Change Password'}
            </Button>
          </>
        }
      >
        <form className="space-y-4 py-2" onSubmit={handleSubmit(onChangePassword)}>
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register('currentPassword', { required: 'Current password is required' })}
            />
            {errors.currentPassword && (
              <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register('newPassword', {
                required: 'New password is required',
                minLength: { value: 8, message: 'Must be at least 8 characters' },
              })}
            />
            {errors.newPassword && (
              <p className="text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword', { required: 'Please confirm your new password' })}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>
        </form>
      </Modal>
    </>
  )
}
