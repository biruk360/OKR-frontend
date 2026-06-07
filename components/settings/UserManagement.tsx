'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { Plus, Mail, User, Shield, Calendar, MoreVertical, Edit, Trash2, Key, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import UserRolesPanel from '@/components/settings/permissions/UserRolesPanel'

interface User {
  id: string
  name: string
  email: string
  role: string
  designation?: string | null
  nameAmharic?: string | null
  designationAmharic?: string | null
  isActive: boolean
  createdAt: string | Date
  lastLoginAt?: string | Date | null
}

interface UserManagementProps {
  initialUsers: User[]
  currentUserId: string
}

type UserDetailTab = 'info' | 'roles'

export default function UserManagement({ initialUsers, currentUserId }: UserManagementProps) {
  const [users, setUsers] = useState(initialUsers)
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false)
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false)
  const [isPasswordResetModalOpen, setIsPasswordResetModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isUserDetailOpen, setIsUserDetailOpen] = useState(false)
  const [userDetailTab, setUserDetailTab] = useState<UserDetailTab>('roles')
  const [detailUser, setDetailUser] = useState<User | null>(null)

  const refreshUsers = async () => {
    try {
      const response = await fetch('/api/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data.data)
      }
    } catch (error) {
      console.error('Error refreshing users:', error)
    }
  }

  const handleUserCreated = (newUser: User) => {
    setUsers(prev => [newUser, ...prev])
    setIsAddUserModalOpen(false)
  }

  const handlePasswordReset = (user: User) => {
    setSelectedUser(user)
    setIsPasswordResetModalOpen(true)
  }

  const handleEditUser = (user: User) => {
    setSelectedUser(user)
    setIsEditUserModalOpen(true)
  }

  const handleUserUpdated = (updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u))
    setIsEditUserModalOpen(false)
    setSelectedUser(null)
  }

  const handleDeleteUser = (user: User) => {
    setSelectedUser(user)
    setIsDeleteModalOpen(true)
  }

  const handleDeleteConfirmed = async () => {
    if (!selectedUser) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })

      if (response.ok) {
        setUsers(prev => prev.filter(u => u.id !== selectedUser.id))
        setIsDeleteModalOpen(false)
        setSelectedUser(null)
        toast.success('User deleted successfully')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete user')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordResetConfirmed = async () => {
    if (!selectedUser) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (response.ok) {
        toast.success(`Password reset email has been sent to ${selectedUser.email}`)
        setIsPasswordResetModalOpen(false)
        setSelectedUser(null)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to send password reset email')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenRoles = (user: User) => {
    setDetailUser(user)
    setUserDetailTab('roles')
    setIsUserDetailOpen(true)
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-red-100 text-red-800'
      case 'EXECUTIVE':
        return 'bg-purple-100 text-purple-800'
      case 'DEPARTMENT_LEAD':
        return 'bg-blue-100 text-blue-800'
      case 'EMPLOYEE':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-muted text-foreground'
    }
  }

  const getStatusColor = (isActive: boolean) => {
    return isActive 
      ? 'bg-green-100 text-green-800' 
      : 'bg-yellow-100 text-yellow-800'
  }

  const formatDate = (dateString: string | Date) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="bg-card shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg leading-6 font-medium text-foreground">
              User Management
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage user accounts and permissions
            </p>
          </div>
          <button
            onClick={() => setIsAddUserModalOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </button>
        </div>

        {/* Users Table */}
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Last Login
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-muted">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <Link
                          href={`/dashboard/org/users/${user.id}`}
                          className="text-sm font-medium text-foreground hover:text-blue-600 hover:underline"
                        >
                          {user.name}
                        </Link>
                        {user.designation && (
                          <div className="text-xs font-medium text-blue-600">
                            {user.designation}
                          </div>
                        )}
                        <div className="text-sm text-muted-foreground">
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                      <Shield className="h-3 w-3 mr-1" />
                      {user.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(user.isActive)}`}>
                      {user.isActive ? 'Active' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDate(user.createdAt)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      {user.isActive && (
                        <button
                          onClick={() => handlePasswordReset(user)}
                          className="text-orange-600 hover:text-orange-900"
                          title="Send Password Reset"
                        >
                          <Key className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenRoles(user)}
                        className="text-purple-600 hover:text-purple-900"
                        title="Manage Roles"
                      >
                        <Shield className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEditUser(user)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit User"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete User"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="text-center py-12">
            <User className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-2 text-sm font-medium text-foreground">No users</h3>
            <p className="mt-1 text-sm text-muted-foreground">Get started by creating a new user.</p>
            <div className="mt-6">
              <button
                onClick={() => setIsAddUserModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <AddUserModal
          isOpen={isAddUserModalOpen}
          onClose={() => setIsAddUserModalOpen(false)}
          onUserCreated={handleUserCreated}
        />
      )}

      {/* Edit User Modal */}
      {isEditUserModalOpen && selectedUser && (
        <EditUserModal
          isOpen={isEditUserModalOpen}
          onClose={() => {
            setIsEditUserModalOpen(false)
            setSelectedUser(null)
          }}
          onUserUpdated={handleUserUpdated}
          user={selectedUser}
        />
      )}

      {/* Delete User Confirmation Modal */}
      {isDeleteModalOpen && selectedUser && (
        <DeleteUserModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false)
            setSelectedUser(null)
          }}
          onConfirm={handleDeleteConfirmed}
          user={selectedUser}
          isLoading={isLoading}
        />
      )}

      {/* Password Reset Confirmation Modal */}
      {isPasswordResetModalOpen && selectedUser && (
        <PasswordResetModal
          isOpen={isPasswordResetModalOpen}
          onClose={() => {
            setIsPasswordResetModalOpen(false)
            setSelectedUser(null)
          }}
          onConfirm={handlePasswordResetConfirmed}
          user={selectedUser}
          isLoading={isLoading}
        />
      )}

      {/* User Detail Modal with Roles tab */}
      {isUserDetailOpen && detailUser && (
        <Modal
          open={isUserDetailOpen}
          onClose={() => {
            setIsUserDetailOpen(false)
            setDetailUser(null)
          }}
          title={detailUser.name}
          icon={User}
          size="xl"
          scrollBehavior="internal"
        >
          <div className="flex flex-col h-full">
            <div className="border-b border-border mb-4">
              <nav className="-mb-px flex gap-0">
                {([
                  { id: 'roles' as UserDetailTab, label: 'Roles' },
                  { id: 'info' as UserDetailTab, label: 'Info' },
                ] as { id: UserDetailTab; label: string }[]).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setUserDetailTab(tab.id)}
                    className={cn(
                      'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                      userDetailTab === tab.id
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="flex-1 overflow-y-auto pb-4">
              {userDetailTab === 'roles' && (
                <UserRolesPanel userId={detailUser.id} userName={detailUser.name} currentUserId={currentUserId} />
              )}
              {userDetailTab === 'info' && (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <span className="font-medium text-muted-foreground">Name</span>
                    <span className="text-foreground">{detailUser.name}</span>
                    <span className="font-medium text-muted-foreground">Email</span>
                    <span className="text-foreground">{detailUser.email}</span>
                    <span className="font-medium text-muted-foreground">Role</span>
                    <span className="text-foreground">{detailUser.role.replace(/_/g, ' ')}</span>
                    {detailUser.designation && (
                      <>
                        <span className="font-medium text-muted-foreground">Designation</span>
                        <span className="text-foreground">{detailUser.designation}</span>
                      </>
                    )}
                    <span className="font-medium text-muted-foreground">Status</span>
                    <span className={detailUser.isActive ? 'text-green-700' : 'text-yellow-700'}>
                      {detailUser.isActive ? 'Active' : 'Pending'}
                    </span>
                    <span className="font-medium text-muted-foreground">Created</span>
                    <span className="text-foreground">{formatDate(detailUser.createdAt)}</span>
                    <span className="font-medium text-muted-foreground">Last Login</span>
                    <span className="text-foreground">{detailUser.lastLoginAt ? formatDate(detailUser.lastLoginAt) : 'Never'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
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
    formState: { errors, isSubmitting }
  } = useForm<AddUserFields>({
    defaultValues: { firstName: '', lastName: '', email: '', role: 'EMPLOYEE' }
  })

  const onSubmit = async (data: AddUserFields) => {
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${data.firstName} ${data.lastName}`,
          email: data.email,
          role: data.role
        })
      })

      if (response.ok) {
        const result = await response.json()
        onUserCreated(result.data)
        reset()
      } else {
        const error = await response.json()
        setError('email', { message: error.error || 'Failed to create user' })
      }
    } catch (error) {
      setError('email', { message: 'An error occurred. Please try again.' })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-muted0 opacity-75" onClick={onClose}></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="bg-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                  <User className="h-6 w-6 text-blue-600" />
                </div>
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                  <h3 className="text-lg leading-6 font-medium text-foreground">
                    Add New User
                  </h3>
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="firstName" className="block text-sm font-medium text-muted-foreground">
                          First Name *
                        </label>
                        <input
                          type="text"
                          id="firstName"
                          {...register('firstName', { required: 'First name is required' })}
                          className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-ring focus:border-blue-500 sm:text-sm ${
                            errors.firstName ? 'border-red-300' : 'border-border'
                          }`}
                          placeholder="Enter first name"
                        />
                        {errors.firstName && (
                          <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="lastName" className="block text-sm font-medium text-muted-foreground">
                          Last Name *
                        </label>
                        <input
                          type="text"
                          id="lastName"
                          {...register('lastName', { required: 'Last name is required' })}
                          className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-ring focus:border-blue-500 sm:text-sm ${
                            errors.lastName ? 'border-red-300' : 'border-border'
                          }`}
                          placeholder="Enter last name"
                        />
                        {errors.lastName && (
                          <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-muted-foreground">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        id="email"
                        {...register('email', {
                          required: 'Email address is required',
                          pattern: {
                            value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                            message: 'A valid email address is required'
                          }
                        })}
                        className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-ring focus:border-blue-500 sm:text-sm ${
                          errors.email ? 'border-red-300' : 'border-border'
                        }`}
                        placeholder="Enter email address"
                      />
                      {errors.email && (
                        <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="role" className="block text-sm font-medium text-muted-foreground">
                        Role
                      </label>
                      <select
                        id="role"
                        {...register('role')}
                        className="mt-1 block w-full border border-border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-ring focus:border-blue-500 sm:text-sm"
                      >
                        <option value="EMPLOYEE">Employee</option>
                        <option value="DEPARTMENT_LEAD">Department Lead</option>
                        <option value="EXECUTIVE">Executive</option>
                        <option value="ADMIN">Administrator</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-muted px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Sending...' : 'Send Invite'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-border shadow-sm px-4 py-2 bg-card text-base font-medium text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// Edit User Modal Component
interface EditUserModalProps {
  isOpen: boolean
  onClose: () => void
  onUserUpdated: (user: User) => void
  user: User
}

function EditUserModal({ isOpen, onClose, onUserUpdated, user }: EditUserModalProps) {
  type EditUserFields = {
    name: string
    email: string
    role: string
    designation: string
    nameAmharic: string
    designationAmharic: string
    isActive: boolean
  }

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<EditUserFields>({
    defaultValues: {
      name: user.name,
      email: user.email,
      role: user.role,
      designation: user.designation || '',
      nameAmharic: user.nameAmharic || '',
      designationAmharic: user.designationAmharic || '',
      isActive: user.isActive
    }
  })

  const onSubmit = async (data: EditUserFields) => {
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (response.ok) {
        const result = await response.json()
        onUserUpdated(result.data)
        toast.success('User updated successfully')
      } else {
        const error = await response.json()
        const errorMessage = error.error || 'Failed to update user'
        setError('email', { message: errorMessage })
        toast.error(errorMessage)
      }
    } catch (error) {
      const errorMessage = 'An error occurred. Please try again.'
      setError('email', { message: errorMessage })
      toast.error(errorMessage)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-muted0 opacity-75" onClick={onClose}></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="bg-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                  <Edit className="h-6 w-6 text-blue-600" />
                </div>
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                  <h3 className="text-lg leading-6 font-medium text-foreground">
                    Edit User
                  </h3>
                  <div className="mt-4 space-y-4">
                    <div>
                      <label htmlFor="edit-name" className="block text-sm font-medium text-muted-foreground">
                        Name *
                      </label>
                      <input
                        type="text"
                        id="edit-name"
                        {...register('name', { required: 'Name is required' })}
                        className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-ring focus:border-blue-500 sm:text-sm ${
                          errors.name ? 'border-red-300' : 'border-border'
                        }`}
                        placeholder="Enter full name"
                      />
                      {errors.name && (
                        <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="edit-email" className="block text-sm font-medium text-muted-foreground">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        id="edit-email"
                        {...register('email', {
                          required: 'Email address is required',
                          pattern: {
                            value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                            message: 'A valid email address is required'
                          }
                        })}
                        className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-ring focus:border-blue-500 sm:text-sm ${
                          errors.email ? 'border-red-300' : 'border-border'
                        }`}
                        placeholder="Enter email address"
                      />
                      {errors.email && (
                        <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="edit-role" className="block text-sm font-medium text-muted-foreground">
                        Role
                      </label>
                      <select
                        id="edit-role"
                        {...register('role')}
                        className="mt-1 block w-full border border-border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-ring focus:border-blue-500 sm:text-sm"
                      >
                        <option value="EMPLOYEE">Employee</option>
                        <option value="DEPARTMENT_LEAD">Department Lead</option>
                        <option value="EXECUTIVE">Executive</option>
                        <option value="ADMIN">Administrator</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="edit-designation" className="block text-sm font-medium text-muted-foreground">
                        Designation
                      </label>
                      <input
                        type="text"
                        id="edit-designation"
                        {...register('designation')}
                        className="mt-1 block w-full border border-border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-ring focus:border-blue-500 sm:text-sm"
                        placeholder="e.g. CEO, Sales Engineer, Project Manager"
                      />
                    </div>

                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Amharic Letterhead Fields</p>
                      <div className="space-y-3">
                        <div>
                          <label htmlFor="edit-nameAmharic" className="block text-sm font-medium text-muted-foreground">
                            Name (አማርኛ)
                          </label>
                          <input
                            type="text"
                            id="edit-nameAmharic"
                            {...register('nameAmharic')}
                            className="mt-1 block w-full border border-border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-ring focus:border-blue-500 sm:text-sm"
                            placeholder="ሙሉ ስም በአማርኛ"
                            dir="auto"
                          />
                        </div>
                        <div>
                          <label htmlFor="edit-designationAmharic" className="block text-sm font-medium text-muted-foreground">
                            Designation (አማርኛ)
                          </label>
                          <input
                            type="text"
                            id="edit-designationAmharic"
                            {...register('designationAmharic')}
                            className="mt-1 block w-full border border-border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-ring focus:border-blue-500 sm:text-sm"
                            placeholder="ለምሳሌ፦ ዋና ሥራ አስኪያጅ"
                            dir="auto"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          {...register('isActive')}
                          className="h-4 w-4 text-blue-600 focus:ring-ring border-border rounded"
                        />
                        <span className="ml-2 text-sm text-muted-foreground">Active Account</span>
                      </label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Inactive users cannot log in to the system
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-muted px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Updating...' : 'Update User'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-border shadow-sm px-4 py-2 bg-card text-base font-medium text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// Delete User Confirmation Modal Component
interface DeleteUserModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  user: User
  isLoading: boolean
}

function DeleteUserModal({ isOpen, onClose, onConfirm, user, isLoading }: DeleteUserModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-muted0 opacity-75" onClick={onClose}></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 className="text-lg leading-6 font-medium text-foreground">
                  Delete User
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to delete <span className="font-medium text-foreground">{user.name}</span>?
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    This action cannot be undone. All data associated with this user will be permanently deleted.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-muted px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              {isLoading ? 'Deleting...' : 'Delete User'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-border shadow-sm px-4 py-2 bg-card text-base font-medium text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Password Reset Confirmation Modal Component
interface PasswordResetModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  user: User
  isLoading: boolean
}

function PasswordResetModal({ isOpen, onClose, onConfirm, user, isLoading }: PasswordResetModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-muted0 opacity-75" onClick={onClose}></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 sm:mx-0 sm:h-10 sm:w-10">
                <AlertTriangle className="h-6 w-6 text-orange-600" />
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 className="text-lg leading-6 font-medium text-foreground">
                  Send Password Reset
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to send a password reset email to{' '}
                    <span className="font-medium text-foreground">{user.name}</span>?
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    This will send a password reset link to <span className="font-medium">{user.email}</span> and invalidate any active sessions for this user.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-muted px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-orange-600 text-base font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              {isLoading ? 'Sending...' : 'Send Password Reset'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-border shadow-sm px-4 py-2 bg-card text-base font-medium text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
