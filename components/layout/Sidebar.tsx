'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Target,
  Users,
  BarChart3,
  MessageSquare,
  Settings,
  Bell,
  Menu,
  X,
  Building2,
  User,
  TrendingUp,
  FileText,
  Archive,
  CheckSquare,
  Network,
  ChevronDown,
  ChevronRight,
  Key,
  Calendar,
} from 'lucide-react'

interface NavItem {
  name: string
  href: string
  icon: any
}

interface NavGroup {
  name: string
  icon: any
  items: NavItem[]
  defaultOpen?: boolean
}

const navigationGroups: NavGroup[] = [
  {
    name: 'Dashboard',
    icon: LayoutDashboard,
    items: [
      { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    ],
    defaultOpen: true,
  },
  {
    name: 'My Work',
    icon: User,
    items: [
      { name: 'Goals', href: '/dashboard/goals', icon: Target },
      { name: 'My OKRs', href: '/dashboard/my-okrs', icon: User },
      { name: 'My Tasks', href: '/dashboard/my-tasks', icon: CheckSquare },
    ],
    defaultOpen: true,
  },
  {
    name: 'OKRs',
    icon: Target,
    items: [
      { name: 'Company OKRs', href: '/dashboard/company-okrs', icon: Building2 },
      { name: 'Department OKRs', href: '/dashboard/department-okrs', icon: Users },
      { name: 'Hierarchy', href: '/dashboard/alignment-map', icon: Network },
      { name: 'Objectives', href: '/dashboard/objectives', icon: Target },
    ],
    defaultOpen: true,
  },
  {
    name: 'Tracking & Analytics',
    icon: TrendingUp,
    items: [
      { name: 'Progress Tracking', href: '/dashboard/progress', icon: TrendingUp },
      { name: 'Reports', href: '/dashboard/reports', icon: FileText },
      { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    ],
    defaultOpen: false,
  },
  {
    name: 'Communication',
    icon: MessageSquare,
    items: [
      { name: 'Activity Feed', href: '/dashboard/activity', icon: MessageSquare },
      { name: 'Comments', href: '/dashboard/comments', icon: MessageSquare },
      { name: 'Notifications', href: '/dashboard/notifications', icon: Bell },
    ],
    defaultOpen: false,
  },
  {
    name: 'People & Organization',
    icon: Users,
    items: [
      { name: 'Teams Directory', href: '/dashboard/org/teams', icon: Building2 },
      { name: 'Users Directory', href: '/dashboard/org/users', icon: Users },
    ],
    defaultOpen: false,
  },
  {
    name: 'Management',
    icon: Archive,
    items: [
      { name: 'Archived Objectives', href: '/dashboard/archived-objectives', icon: Archive },
    ],
    defaultOpen: false,
  },
  {
    name: 'Settings',
    icon: Settings,
    items: [
      { name: 'Profile', href: '/dashboard/settings/profile', icon: User },
      { name: 'Account', href: '/dashboard/settings/account', icon: Key },
      { name: 'Notifications', href: '/dashboard/settings/notifications', icon: Bell },
      { name: 'Users', href: '/dashboard/settings/users', icon: Users },
      { name: 'Teams', href: '/dashboard/settings/teams', icon: Users },
      { name: 'Timeframes', href: '/dashboard/settings/timeframes', icon: Calendar },
      { name: 'OKR Rules', href: '/dashboard/settings/okr-rules', icon: Target },
      { name: 'Branding', href: '/dashboard/settings/branding', icon: Building2 },
      { name: 'Integrations', href: '/dashboard/settings/integrations', icon: Settings },
      { name: 'Audit Logs', href: '/dashboard/settings/audit-logs', icon: FileText },
    ],
    defaultOpen: false,
  },
]

export default function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const pathname = usePathname()

  // Initialize and update open groups based on defaultOpen and current pathname
  useEffect(() => {
    setOpenGroups(prev => {
      // If state is empty, initialize it
      if (Object.keys(prev).length === 0) {
        const initialOpen: Record<string, boolean> = {}
        navigationGroups.forEach((group) => {
          const hasActiveItem = group.items.some(item => {
            if (item.href === '/dashboard') {
              return pathname === '/dashboard'
            }
            return pathname.startsWith(item.href)
          })
          initialOpen[group.name] = group.defaultOpen || hasActiveItem
        })
        return initialOpen
      }
      
      // Otherwise, only auto-open groups that contain the active path (preserve user toggles)
      const updated: Record<string, boolean> = { ...prev }
      navigationGroups.forEach((group) => {
        const hasActiveItem = group.items.some(item => {
          if (item.href === '/dashboard') {
            return pathname === '/dashboard'
          }
          return pathname.startsWith(item.href)
        })
        // Only auto-open if it contains active item and wasn't manually closed
        if (hasActiveItem && prev[group.name] === false) {
          updated[group.name] = true
        }
      })
      return updated
    })
  }, [pathname])

  const toggleGroup = (groupName: string) => {
    setOpenGroups(prev => {
      const newState = {
        ...prev,
        [groupName]: !prev[groupName]
      }
      return newState
    })
  }

  const isItemActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname.startsWith(href)
  }

  const isGroupActive = (group: NavGroup) => {
    return group.items.some(item => isItemActive(item.href))
  }

  return (
    <>
      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div 
            className="fixed inset-0 bg-gray-600 bg-opacity-75" 
            onClick={() => setSidebarOpen(false)}
          />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center">
              <Target className="h-8 w-8 text-primary-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">OKR System</span>
            </div>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
            {navigationGroups.map((group) => {
              const isGroupOpen = openGroups[group.name] || false
              const groupHasActive = isGroupActive(group)
              
              return (
                <div key={group.name}>
                  {group.items.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          toggleGroup(group.name)
                        }}
                        className={cn(
                          'w-full group flex items-center justify-between px-2 py-2 text-sm font-medium rounded-md cursor-pointer',
                          groupHasActive
                            ? 'bg-primary-50 text-primary-900'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                        )}
                      >
                        <div className="flex items-center">
                          <group.icon
                            className={cn(
                              'mr-3 h-5 w-5 flex-shrink-0',
                              groupHasActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
                            )}
                          />
                          <span>{group.name}</span>
                        </div>
                        {isGroupOpen ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                      {isGroupOpen && (
                        <div className="ml-4 mt-1 space-y-1">
                          {group.items.map((item) => {
                            const isActive = isItemActive(item.href)
                            return (
                              <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                  'group flex items-center px-2 py-2 text-sm font-medium rounded-md',
                                  isActive
                                    ? 'bg-primary-100 text-primary-900'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                )}
                                onClick={() => setSidebarOpen(false)}
                              >
                                <item.icon
                                  className={cn(
                                    'mr-3 h-4 w-4 flex-shrink-0',
                                    isActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
                                  )}
                                />
                                {item.name}
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={group.items[0].href}
                      className={cn(
                        'group flex items-center px-2 py-2 text-sm font-medium rounded-md',
                        isItemActive(group.items[0].href)
                          ? 'bg-primary-100 text-primary-900'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <group.icon
                        className={cn(
                          'mr-3 h-5 w-5 flex-shrink-0',
                          isItemActive(group.items[0].href) ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
                        )}
                      />
                      {group.name}
                    </Link>
                  )}
                </div>
              )
            })}
          </nav>
        </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col lg:z-20">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200 relative z-20">
          <div className="flex h-16 items-center px-4">
            <Target className="h-8 w-8 text-primary-600" />
            <span className="ml-2 text-xl font-bold text-gray-900">OKR System</span>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
            {navigationGroups.map((group) => {
              const isGroupOpen = openGroups[group.name] || false
              const groupHasActive = isGroupActive(group)
              
              return (
                <div key={group.name}>
                  {group.items.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          toggleGroup(group.name)
                        }}
                        className={cn(
                          'w-full group flex items-center justify-between px-2 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors',
                          groupHasActive
                            ? 'bg-primary-50 text-primary-900'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                        )}
                      >
                        <div className="flex items-center">
                          <group.icon
                            className={cn(
                              'mr-3 h-5 w-5 flex-shrink-0',
                              groupHasActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
                            )}
                          />
                          <span>{group.name}</span>
                        </div>
                        {isGroupOpen ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                      {isGroupOpen && (
                        <div className="ml-4 mt-1 space-y-1 relative z-20">
                          {group.items.map((item) => {
                            const isActive = isItemActive(item.href)
                            return (
                              <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                  'group flex items-center px-2 py-2 text-sm font-medium rounded-md relative z-20 transition-colors',
                                  isActive
                                    ? 'bg-primary-100 text-primary-900'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                )}
                              >
                                <item.icon
                                  className={cn(
                                    'mr-3 h-4 w-4 flex-shrink-0',
                                    isActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
                                  )}
                                />
                                {item.name}
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={group.items[0].href}
                      className={cn(
                        'group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors',
                        isItemActive(group.items[0].href)
                          ? 'bg-primary-100 text-primary-900'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      )}
                    >
                      <group.icon
                        className={cn(
                          'mr-3 h-5 w-5 flex-shrink-0',
                          isItemActive(group.items[0].href) ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
                        )}
                      />
                      {group.name}
                    </Link>
                  )}
                </div>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Mobile menu button */}
      <div className="lg:hidden">
        <button
          type="button"
          className="fixed top-4 left-4 z-50 inline-flex items-center justify-center rounded-md bg-white p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>
    </>
  )
}
