'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Calendar, Clock, Key, Mail, Shield, ShieldCheck,
  Trash2, User as UserIcon, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import UserRolesPanel from '@/components/settings/permissions/UserRolesPanel'

export interface ManagedUser {
  id: string
  name: string
  email: string
  avatar?: string | null
  role: string
  designation?: string | null
  nameAmharic?: string | null
  designationAmharic?: string | null
  isActive: boolean
  isProjectManager: boolean
  createdAt: string
  lastLoginAt?: string | null
  departmentMemberships?: {
    id: string
    role: string
    isPrimary: boolean
    department: { id: string; name: string }
  }[]
}

interface UserDetailProps {
  user: ManagedUser
  currentUserId: string
  currentUserRole: string
}

type DetailTab = 'profile' | 'access'

type ProfileFields = {
  name: string
  email: string
  role: string
  designation: string
  nameAmharic: string
  designationAmharic: string
  isActive: boolean
}

const ROLE_OPTIONS = [
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'DEPARTMENT_LEAD', label: 'Department Lead' },
  { value: 'EXECUTIVE', label: 'Executive' },
  { value: 'ADMIN', label: 'Administrator' },
]

/** Apple-HIG status tokens — no hardcoded hex (see CLAUDE.md §2). */
function roleBadgeClass(role: string) {
  switch (role) {
    case 'ADMIN':
      return 'bg-danger-50 text-danger-700'
    case 'EXECUTIVE':
      return 'bg-primary-100 text-primary-800'
    case 'DEPARTMENT_LEAD':
      return 'bg-primary-50 text-primary-700'
    default:
      return 'bg-success-50 text-success-700'
  }
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const selectClass =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors duration-[180ms] ease-apple focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

export default function UserDetail({ user: initialUser, currentUserId, currentUserRole }: UserDetailProps) {
  const router = useRouter()
  const [user, setUser] = useState(initialUser)
  const [tab, setTab] = useState<DetailTab>('profile')
  const [isResetOpen, setIsResetOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [isTogglingPm, setIsTogglingPm] = useState(false)

  const isSelf = user.id === currentUserId
  const isAdmin = currentUserRole === 'ADMIN'

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFields>({
    defaultValues: {
      name: user.name,
      email: user.email,
      role: user.role,
      designation: user.designation ?? '',
      nameAmharic: user.nameAmharic ?? '',
      designationAmharic: user.designationAmharic ?? '',
      isActive: user.isActive,
    },
  })

  const onSubmit = async (data: ProfileFields) => {
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()

      if (!response.ok) {
        const message = result.error || 'Failed to update user'
        setError('email', { message })
        toast.error(message)
        return
      }

      setUser((current) => ({ ...current, ...result.data }))
      reset({
        name: result.data.name,
        email: result.data.email,
        role: result.data.role,
        designation: result.data.designation ?? '',
        nameAmharic: result.data.nameAmharic ?? '',
        designationAmharic: result.data.designationAmharic ?? '',
        isActive: result.data.isActive,
      })
      toast.success('User updated successfully')
      router.refresh()
    } catch {
      const message = 'An error occurred. Please try again.'
      setError('email', { message })
      toast.error(message)
    }
  }

  const handleProjectManagerCapability = async () => {
    const enabled = !user.isProjectManager
    setIsTogglingPm(true)
    try {
      const response = await fetch(`/api/users/${user.id}/project-manager-capability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error(result.error || 'Failed to update Project Manager capability')
        return
      }
      setUser((current) => ({ ...current, isProjectManager: result.data.isProjectManager }))
      toast.success(`Project Manager capability ${enabled ? 'granted' : 'revoked'}`)
      router.refresh()
    } catch {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsTogglingPm(false)
    }
  }

  const handlePasswordReset = async () => {
    setIsBusy(true)
    try {
      const response = await fetch(`/api/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (response.ok) {
        toast.success(`Password reset email has been sent to ${user.email}`)
        setIsResetOpen(false)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to send password reset email')
      }
    } catch {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsBusy(false)
    }
  }

  const handleDelete = async () => {
    setIsBusy(true)
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      if (response.ok) {
        toast.success('User deleted successfully')
        router.push('/dashboard/settings/users')
        router.refresh()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete user')
        setIsBusy(false)
      }
    } catch {
      toast.error('An error occurred. Please try again.')
      setIsBusy(false)
    }
  }

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'profile', label: 'Profile & details' },
    { id: 'access', label: 'Access & roles' },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/dashboard/settings/users"
        className="inline-flex items-center gap-1 text-body-sm text-muted-foreground transition-colors duration-[180ms] ease-apple hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to users
      </Link>

      {/* Identity header — stacks on mobile, row from sm up */}
      <header className="rounded-card border border-border bg-card p-4 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar}
                alt=""
                className="size-14 shrink-0 rounded-full object-cover sm:size-16"
              />
            ) : (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xl font-semibold text-primary-700 sm:size-16">
                {(user.name || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-page-title text-foreground">{user.name}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-body-sm text-muted-foreground">
                <Mail className="size-3.5 shrink-0" />
                <span className="truncate">{user.email}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={cn('inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-medium', roleBadgeClass(user.role))}>
                  <Shield className="size-3" />
                  {user.role.replace(/_/g, ' ')}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium',
                    user.isActive ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700',
                  )}
                >
                  {user.isActive ? 'Active' : 'Pending'}
                </span>
                {user.isProjectManager && (
                  <span className="inline-flex items-center gap-1 rounded-pill bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                    <ShieldCheck className="size-3" />
                    Project Manager
                  </span>
                )}
                {user.designation && (
                  <span className="text-xs text-muted-foreground">{user.designation}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/org/users/${user.id}`}>
                <ExternalLink className="size-4" />
                View profile
              </Link>
            </Button>
            {user.isActive && (
              <Button variant="outline" size="sm" onClick={() => setIsResetOpen(true)}>
                <Key className="size-4" />
                Reset password
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              disabled={isSelf}
              title={isSelf ? 'You cannot delete your own account' : undefined}
              onClick={() => setIsDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs — horizontally scrollable on narrow screens */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="User sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 py-2 text-body-sm font-medium transition-colors duration-[180ms] ease-apple sm:px-4',
                tab === t.id
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'profile' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {/* Edit form */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="rounded-card border border-border bg-card shadow-card lg:col-span-2"
          >
            <div className="border-b border-border px-4 py-3 sm:px-6 sm:py-4">
              <h2 className="text-section-title text-foreground">Account details</h2>
              <p className="mt-0.5 text-body-sm text-muted-foreground">
                Edit this user&apos;s identity, role, and account status.
              </p>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    {...register('name', { required: 'Name is required' })}
                    aria-invalid={Boolean(errors.name)}
                    placeholder="Enter full name"
                  />
                  {errors.name && <p className="text-xs text-danger-600">{errors.name.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address *</Label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email', {
                      required: 'Email address is required',
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: 'A valid email address is required',
                      },
                    })}
                    aria-invalid={Boolean(errors.email)}
                    placeholder="Enter email address"
                  />
                  {errors.email && <p className="text-xs text-danger-600">{errors.email.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="role">Role</Label>
                  <select id="role" {...register('role')} className={selectClass}>
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="designation">Designation</Label>
                  <Input
                    id="designation"
                    {...register('designation')}
                    placeholder="e.g. CEO, Sales Engineer, Project Manager"
                  />
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-overline uppercase text-muted-foreground">Amharic letterhead fields</p>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="nameAmharic">Name (አማርኛ)</Label>
                    <Input
                      id="nameAmharic"
                      {...register('nameAmharic')}
                      placeholder="ሙሉ ስም በአማርኛ"
                      dir="auto"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="designationAmharic">Designation (አማርኛ)</Label>
                    <Input
                      id="designationAmharic"
                      {...register('designationAmharic')}
                      placeholder="ለምሳሌ፦ ዋና ሥራ አስኪያጅ"
                      dir="auto"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    {...register('isActive')}
                    className="mt-0.5 size-4 rounded border-border text-primary-500 focus:ring-ring"
                  />
                  <span>
                    <span className="block text-body-sm font-medium text-foreground">Active account</span>
                    <span className="block text-xs text-muted-foreground">
                      Inactive users cannot log in to the system
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => reset()}
                disabled={!isDirty || isSubmitting}
              >
                Discard changes
              </Button>
              <Button type="submit" disabled={!isDirty || isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>

          {/* Summary rail */}
          <aside className="space-y-4">
            <section className="rounded-card border border-border bg-card p-4 shadow-card sm:p-6">
              <h2 className="text-section-title text-foreground">Account activity</h2>
              <dl className="mt-3 space-y-3 text-body-sm">
                <div className="flex items-start justify-between gap-3">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="size-3.5" />
                    Created
                  </dt>
                  <dd className="text-right text-foreground">{formatDate(user.createdAt)}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="size-3.5" />
                    Last login
                  </dt>
                  <dd className="text-right text-foreground">
                    {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-card border border-border bg-card p-4 shadow-card sm:p-6">
              <h2 className="text-section-title text-foreground">Teams</h2>
              {user.departmentMemberships && user.departmentMemberships.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {user.departmentMemberships.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-body-sm">
                      <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <Link
                        href={`/dashboard/org/teams/${m.department.id}`}
                        className="truncate text-foreground transition-colors duration-[180ms] ease-apple hover:text-primary-600"
                      >
                        {m.department.name}
                      </Link>
                      {m.role === 'HEAD' && (
                        <span className="rounded-pill bg-warning-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning-700">
                          Head
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-body-sm text-muted-foreground">Not in any teams</p>
              )}
            </section>
          </aside>
        </div>
      )}

      {tab === 'access' && (
        <div className="space-y-4">
          <section className="rounded-card border border-border bg-card p-4 shadow-card sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-section-title text-foreground">Project Manager capability</h2>
                <p className="mt-0.5 text-body-sm text-muted-foreground">
                  Allows this user to create and own projects, regardless of their role.
                </p>
              </div>
              {isAdmin ? (
                <Button
                  type="button"
                  role="switch"
                  aria-checked={user.isProjectManager}
                  variant={user.isProjectManager ? 'default' : 'outline'}
                  size="sm"
                  disabled={isTogglingPm}
                  onClick={() => void handleProjectManagerCapability()}
                  className="sm:shrink-0"
                >
                  <ShieldCheck className="size-4" />
                  {isTogglingPm ? 'Saving…' : user.isProjectManager ? 'Granted' : 'Not granted'}
                </Button>
              ) : (
                <span className="text-body-sm text-muted-foreground sm:shrink-0">
                  {user.isProjectManager ? 'Granted' : 'Not granted'}
                </span>
              )}
            </div>
          </section>

          <section className="rounded-card border border-border bg-card p-4 shadow-card sm:p-6">
            <UserRolesPanel userId={user.id} userName={user.name} currentUserId={currentUserId} />
          </section>
        </div>
      )}

      <ConfirmDialog
        open={isResetOpen}
        onClose={() => setIsResetOpen(false)}
        onConfirm={handlePasswordReset}
        variant="warning"
        icon={Key}
        title="Send password reset"
        message={`Send a password reset email to ${user.name}?`}
        description={`This sends a reset link to ${user.email} and invalidates any active sessions for this user.`}
        confirmLabel="Send password reset"
        loadingLabel="Sending…"
        isLoading={isBusy}
      />

      <ConfirmDialog
        open={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        variant="danger"
        icon={UserIcon}
        title="Delete user"
        message={`Are you sure you want to delete ${user.name}?`}
        description="This action cannot be undone. All data associated with this user will be permanently deleted."
        confirmLabel="Delete user"
        loadingLabel="Deleting…"
        isLoading={isBusy}
      />
    </div>
  )
}
