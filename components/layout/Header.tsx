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
            {!hidePageTitle && (
              <h1 className="truncate text-lg font-semibold">{pageTitle}</h1>
            )}
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
                <Button
                  variant="ghost"
                  size="default"
                  className="h-9 gap-2 rounded-full px-2 pr-2.5"
                >
                  {user.avatar ? (
                    <img className="size-6 rounded-full object-cover" src={user.avatar} alt={user.name || 'User'} />
                  ) : (
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <span className="text-[11px] font-semibold text-primary-600">
                        {user.name ? getInitials(user.name) : 'U'}
                      </span>
                    </div>
                  )}
                  <span className="hidden max-w-[120px] truncate text-[13px] font-medium sm:block">
                    {user.name ?? user.email ?? 'Account'}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
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
