'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { Plus, User, Shield, ShieldCheck, Calendar, ChevronRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface User {
  id: string
  name: string
  email: string
  role: string
  designation?: string | null
  nameAmharic?: string | null
  designationAmharic?: string | null
  isActive: boolean
  isProjectManager: boolean
  createdAt: string | Date
  lastLoginAt?: string | Date | null
}

interface UserManagementProps {
  initialUsers: User[]
  currentUserId: string
  currentUserRole: string
}

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

export default function UserManagement({ initialUsers }: UserManagementProps) {
  const [users, setUsers] = useState(initialUsers)
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false)
  const [query, setQuery] = useState('')

  const handleUserCreated = (newUser: User) => {
    setUsers((prev) => [newUser, ...prev])
    setIsAddUserModalOpen(false)
  }

  const term = query.trim().toLowerCase()
  const visibleUsers = term
    ? users.filter((u) =>
        [u.name, u.email, u.designation ?? '', u.role.replace(/_/g, ' ')]
          .some((field) => field.toLowerCase().includes(term)),
      )
    : users

  const detailHref = (id: string) => `/dashboard/settings/users/${id}`

  return (
    <div className="rounded-card border border-border bg-card shadow-card">
      {/* Header — stacks on mobile */}
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <h1 className="text-page-title text-foreground">User management</h1>
          <p className="mt-0.5 text-body-sm text-muted-foreground">
            Select a user to manage their details, status, roles, and access.
          </p>
        </div>
        <Button onClick={() => setIsAddUserModalOpen(true)} className="sm:shrink-0">
          <Plus className="size-4" />
          Add user
        </Button>
      </div>

      {users.length > 0 && (
        <div className="border-b border-border p-4 sm:px-6">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users…"
              aria-label="Search users"
              className="pl-8"
            />
          </div>
        </div>
      )}

      {/* Mobile: stacked cards. Each card is one tap target to the user page. */}
      <ul className="divide-y divide-border md:hidden">
        {visibleUsers.map((user) => (
          <li key={user.id}>
            <Link
              href={detailHref(user.id)}
              className="flex items-center gap-3 p-4 transition-colors duration-[180ms] ease-apple hover:bg-muted/60"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700">
                {(user.name || '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={cn('inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium', roleBadgeClass(user.role))}>
                    <Shield className="size-2.5" />
                    {user.role.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium',
                      user.isActive ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700',
                    )}
                  >
                    {user.isActive ? 'Active' : 'Pending'}
                  </span>
                  {user.isProjectManager && (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                      <ShieldCheck className="size-2.5" />
                      PM
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop: table. Horizontally scrollable so nothing is clipped. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-overline uppercase text-muted-foreground">
                User
              </th>
              <th scope="col" className="px-6 py-3 text-left text-overline uppercase text-muted-foreground">
                Role
              </th>
              <th scope="col" className="hidden px-6 py-3 text-left text-overline uppercase text-muted-foreground lg:table-cell">
                Project creation
              </th>
              <th scope="col" className="px-6 py-3 text-left text-overline uppercase text-muted-foreground">
                Status
              </th>
              <th scope="col" className="hidden px-6 py-3 text-left text-overline uppercase text-muted-foreground xl:table-cell">
                Created
              </th>
              <th scope="col" className="hidden px-6 py-3 text-left text-overline uppercase text-muted-foreground lg:table-cell">
                Last login
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Manage</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {visibleUsers.map((user) => (
              <tr key={user.id} className="transition-colors duration-[180ms] ease-apple hover:bg-muted/60">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700">
                      {(user.name || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={detailHref(user.id)}
                        className="text-body-sm font-medium text-foreground transition-colors duration-[180ms] ease-apple hover:text-primary-600"
                      >
                        {user.name}
                      </Link>
                      {user.designation && (
                        <div className="truncate text-xs font-medium text-primary-600">{user.designation}</div>
                      )}
                      <div className="truncate text-body-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className={cn('inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-medium', roleBadgeClass(user.role))}>
                    <Shield className="size-3" />
                    {user.role.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="hidden whitespace-nowrap px-6 py-4 lg:table-cell">
                  {user.isProjectManager ? (
                    <span className="inline-flex items-center gap-1.5 rounded-pill bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                      <ShieldCheck className="size-3.5" />
                      Project Manager
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not granted</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium',
                      user.isActive ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700',
                    )}
                  >
                    {user.isActive ? 'Active' : 'Pending'}
                  </span>
                </td>
                <td className="hidden whitespace-nowrap px-6 py-4 text-body-sm text-muted-foreground xl:table-cell">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-4" />
                    {formatDate(user.createdAt)}
                  </span>
                </td>
                <td className="hidden whitespace-nowrap px-6 py-4 text-body-sm text-muted-foreground lg:table-cell">
                  {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={detailHref(user.id)}>
                      Manage
                      <ChevronRight className="size-3.5" />
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <div className="px-4 py-12 text-center">
          <User className="mx-auto size-12 text-muted-foreground" />
          <h2 className="mt-2 text-body-sm font-medium text-foreground">No users</h2>
          <p className="mt-1 text-body-sm text-muted-foreground">Get started by creating a new user.</p>
          <div className="mt-6">
            <Button onClick={() => setIsAddUserModalOpen(true)}>
              <Plus className="size-4" />
              Add user
            </Button>
          </div>
        </div>
      )}

      {users.length > 0 && visibleUsers.length === 0 && (
        <div className="px-4 py-12 text-center">
          <Search className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-2 text-body-sm text-muted-foreground">
            No users match &ldquo;{query}&rdquo;.
          </p>
        </div>
      )}

      {isAddUserModalOpen && (
        <AddUserModal
          isOpen={isAddUserModalOpen}
          onClose={() => setIsAddUserModalOpen(false)}
          onUserCreated={handleUserCreated}
        />
      )}
    </div>
  )
}

// Add User Modal Component
interface AddUserModalProps {
  isOpen: boolean
  onClose: () => void
  onUserCreated: (user: User) => void
}

function AddUserModal({ isOpen, onClose, onUserCreated }: AddUserModalProps) {
  type AddUserFields = {
    firstName: string
    lastName: string
    email: string
    role: string
  }

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddUserFields>({
    defaultValues: { firstName: '', lastName: '', email: '', role: 'EMPLOYEE' },
  })

  const onSubmit = async (data: AddUserFields) => {
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${data.firstName} ${data.lastName}`,
          email: data.email,
          role: data.role,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        onUserCreated(result.data)
        reset()
      } else {
        const error = await response.json()
        setError('email', { message: error.error || 'Failed to create user' })
      }
    } catch {
      setError('email', { message: 'An error occurred. Please try again.' })
    }
  }

  const selectClass =
    'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors duration-[180ms] ease-apple focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Add new user"
      icon={User}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="add-user-form" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send invite'}
          </Button>
        </>
      }
    >
      <form id="add-user-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name *</Label>
            <Input
              id="firstName"
              {...register('firstName', { required: 'First name is required' })}
              aria-invalid={Boolean(errors.firstName)}
              placeholder="Enter first name"
            />
            {errors.firstName && <p className="text-xs text-danger-600">{errors.firstName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name *</Label>
            <Input
              id="lastName"
              {...register('lastName', { required: 'Last name is required' })}
              aria-invalid={Boolean(errors.lastName)}
              placeholder="Enter last name"
            />
            {errors.lastName && <p className="text-xs text-danger-600">{errors.lastName.message}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="add-email">Email address *</Label>
          <Input
            id="add-email"
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
          <Label htmlFor="add-role">Role</Label>
          <select id="add-role" {...register('role')} className={selectClass}>
            <option value="EMPLOYEE">Employee</option>
            <option value="DEPARTMENT_LEAD">Department Lead</option>
            <option value="EXECUTIVE">Executive</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </div>
      </form>
    </Modal>
  )
}
