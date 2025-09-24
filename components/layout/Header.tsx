'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { User, LogOut, Settings, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HeaderProps {
  user: {
    name?: string | null
    email?: string | null
    avatar?: string | null
    role?: string
  }
}

export default function Header({ user }: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/auth/signin' })
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center">
          <h1 className="text-lg font-semibold text-gray-900">
            OKR Management System
          </h1>
        </div>

        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              className="relative rounded-full bg-white p-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            >
              <Bell className="h-6 w-6" />
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-danger-500 text-xs text-white flex items-center justify-center">
                3
              </span>
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 z-10 mt-2 w-80 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                <div className="px-4 py-2 border-b border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900">Notifications</h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <div className="px-4 py-3 hover:bg-gray-50">
                    <p className="text-sm text-gray-900">New comment on your objective</p>
                    <p className="text-xs text-gray-500">2 minutes ago</p>
                  </div>
                  <div className="px-4 py-3 hover:bg-gray-50">
                    <p className="text-sm text-gray-900">Key result progress updated</p>
                    <p className="text-xs text-gray-500">1 hour ago</p>
                  </div>
                  <div className="px-4 py-3 hover:bg-gray-50">
                    <p className="text-sm text-gray-900">New objective assigned to you</p>
                    <p className="text-xs text-gray-500">3 hours ago</p>
                  </div>
                </div>
                <div className="px-4 py-2 border-t border-gray-200">
                  <button className="text-sm text-primary-600 hover:text-primary-500">
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Profile dropdown */}
          <div className="relative">
            <button
              type="button"
              className="flex items-center rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
            >
              <span className="sr-only">Open user menu</span>
              {user.avatar ? (
                <img
                  className="h-8 w-8 rounded-full"
                  src={user.avatar}
                  alt={user.name || 'User'}
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-700">
                    {user.name ? getInitials(user.name) : 'U'}
                  </span>
                </div>
              )}
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                <div className="px-4 py-2 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                  <p className="text-xs text-primary-600 capitalize">{user.role?.toLowerCase()}</p>
                </div>
                <button
                  className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setIsProfileOpen(false)
                    router.push('/dashboard/profile')
                  }}
                >
                  <User className="mr-3 h-4 w-4" />
                  Your Profile
                </button>
                <button
                  className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setIsProfileOpen(false)
                    router.push('/dashboard/settings')
                  }}
                >
                  <Settings className="mr-3 h-4 w-4" />
                  Settings
                </button>
                <button
                  className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-3 h-4 w-4" />
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
