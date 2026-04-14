'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  User,
  Bell,
  Key,
  Users,
  Calendar,
} from 'lucide-react'

interface SettingsNavProps {
  userRole: string
}

const settingsNavItems = [
  {
    name: 'Profile',
    href: '/dashboard/settings/profile',
    icon: User,
    available: true,
  },
  {
    name: 'Notifications',
    href: '/dashboard/settings/notifications',
    icon: Bell,
    available: true,
  },
  {
    name: 'Account',
    href: '/dashboard/settings/account',
    icon: Key,
    available: true,
  },
  {
    name: 'Users',
    href: '/dashboard/settings/users',
    icon: Users,
    available: false, // Only for admins
  },
  {
    name: 'Timeframes',
    href: '/dashboard/settings/timeframes',
    icon: Calendar,
    available: false, // Only for admins
  },
  {
    name: 'Notification defaults',
    href: '/dashboard/settings/notification-defaults',
    icon: Bell,
    available: false, // Only for admins
  },
]

export default function SettingsNav({ userRole }: SettingsNavProps) {
  const pathname = usePathname()
  const isAdmin = userRole === 'ADMIN'

  const navItems = settingsNavItems.filter(item =>
    item.available
      || (item.name === 'Users' && isAdmin)
      || (item.name === 'Timeframes' && isAdmin)
      || (item.name === 'Notification defaults' && isAdmin)
  )

  return (
    <nav className="space-y-1 relative z-10">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = pathname === item.href || 
          (item.href === '/dashboard/settings/profile' && (pathname === '/dashboard/settings' || pathname === '/dashboard/settings/'))
        
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors relative z-10 cursor-pointer',
              isActive
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{item.name}</span>
          </Link>
        )
      })}
    </nav>
  )
}

