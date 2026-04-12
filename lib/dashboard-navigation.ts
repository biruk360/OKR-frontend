import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Target,
  Users,
  BarChart3,
  MessageSquare,
  Settings,
  Bell,
  Building2,
  User,
  TrendingUp,
  FileText,
  Archive,
  CheckSquare,
  Network,
  Calendar,
  Key,
  Layout,
} from 'lucide-react'

export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
}

export interface NavGroup {
  name: string
  icon: LucideIcon
  items: NavItem[]
  defaultOpen?: boolean
}

export const navigationGroups: NavGroup[] = [
  {
    name: 'Dashboard',
    icon: LayoutDashboard,
    items: [{ name: 'Overview', href: '/dashboard', icon: LayoutDashboard }],
    defaultOpen: true,
  },
  {
    name: 'My Work',
    icon: User,
    items: [
      { name: 'Goals', href: '/dashboard/goals', icon: Target },
      { name: 'My OKRs', href: '/dashboard/my-okrs', icon: User },
      { name: 'To-dos', href: '/dashboard/todos', icon: CheckSquare },
      { name: 'Sprints', href: '/dashboard/sprints', icon: Layout },
    ],
    defaultOpen: true,
  },
  {
    name: 'OKRs',
    icon: Target,
    items: [
      { name: 'Plans', href: '/dashboard/plans', icon: FileText },
      { name: 'Company OKRs', href: '/dashboard/company-okrs', icon: Building2 },
      { name: 'Department OKRs', href: '/dashboard/department-okrs', icon: Users },
      { name: 'Strategy map', href: '/dashboard/alignment-map', icon: Network },
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
      { name: 'Initiative Report', href: '/dashboard/initiative-report', icon: FileText },
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
    items: [{ name: 'Archived Objectives', href: '/dashboard/archived-objectives', icon: Archive }],
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

export function getFlatNavItems(): NavItem[] {
  return navigationGroups.flatMap((g) => g.items)
}

/** True if this nav href is the current route (dashboard home is exact match only). */
export function isNavPathActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  if (pathname === href) return true
  return pathname.startsWith(`${href}/`)
}

/**
 * Best matching nav item for the pathname (longest href wins so /settings/account beats /settings/users).
 */
export function getActiveNavContext(pathname: string): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem; hrefLen: number } | null = null
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (isNavPathActive(pathname, item.href)) {
        const hrefLen = item.href.length
        if (!best || hrefLen > best.hrefLen) {
          best = { group, item, hrefLen }
        }
      }
    }
  }
  return best ? { group: best.group, item: best.item } : null
}
