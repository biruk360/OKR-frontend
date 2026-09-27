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
  Kanban,
  Sparkles,
  MapPin,
  Truck,
  ClipboardList,
  ShieldCheck,
  ClipboardCheck,
  Award,
  Library,
  Bot,
} from 'lucide-react'
import { canReadPortfolio } from '@/lib/projects/portfolio-access'

export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  featureKey?: string
  /**
   * Role rule for pages gated by the legacy `session.user.role` rather than an
   * RBAC feature key. Must be the same pure predicate the page and its API
   * routes use (e.g. `canReadPortfolio`), so nav and server never disagree.
   * Fails closed: hidden when the caller does not supply the viewer's role.
   */
  roleGate?: (role: string | null | undefined) => boolean
}

export interface NavGroup {
  name: string
  icon: LucideIcon
  items: NavItem[]
  defaultOpen?: boolean
  featureKey?: string
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
      { name: 'My OKRs', href: '/dashboard/my-okrs', icon: User },
      { name: 'To-dos', href: '/dashboard/todos', icon: CheckSquare },
      { name: 'Work Board', href: '/dashboard/work', icon: Kanban },
      { name: 'Daily Scrum', href: '/dashboard/scrum', icon: ClipboardCheck },
      { name: 'Sprints', href: '/dashboard/sprints', icon: Layout },
    ],
    defaultOpen: true,
  },
  {
    name: 'Delivery',
    icon: Kanban,
    items: [
      { name: 'Projects', href: '/dashboard/projects', icon: Kanban },
      { name: 'Portfolio', href: '/dashboard/projects/portfolio', icon: TrendingUp, roleGate: canReadPortfolio },
    ],
    defaultOpen: false,
  },
  {
    // One browse surface: level presets (All / Company / Department / Mine /
    // My team) and views (List / Tree / Timeline / Map / Analyze) live inside
    // the Explorer (?level= / ?view=). Retired pages redirect: lib/retired-routes.js.
    name: 'OKRs',
    icon: Target,
    items: [
      { name: 'OKR Explorer', href: '/dashboard/okrs-all', icon: Target },
      { name: 'Key Results', href: '/dashboard/key-results', icon: Key },
      { name: 'Insights', href: '/dashboard/insights', icon: BarChart3 },
    ],
    defaultOpen: true,
  },
  {
    name: 'OKR & Operations',
    icon: MapPin,
    items: [
      { name: 'Daily Trip Plan', href: '/dashboard/travel', icon: MapPin },
      { name: 'Coordinator Console', href: '/dashboard/travel/console', icon: ClipboardList },
      { name: 'Pool Coordinator', href: '/dashboard/travel/pool', icon: Truck },
      { name: 'Automations', href: '/dashboard/automations', icon: Bot, featureKey: 'canAuthorAutomations' },
      { name: 'Briefings', href: '/dashboard/automations/briefings', icon: FileText },
    ],
    defaultOpen: false,
  },
  {
    name: 'Performance',
    icon: Award,
    featureKey: 'module.performance',
    items: [
      { name: 'My Performance', href: '/dashboard/performance', icon: Award, featureKey: 'page.performance.my' },
      { name: 'Evaluation Queue', href: '/dashboard/performance/evaluations', icon: ClipboardCheck, featureKey: 'page.performance.evaluations' },
      { name: 'Review Cycles', href: '/dashboard/performance/cycles', icon: Calendar, featureKey: 'page.performance.cycles' },
      { name: 'Scorecard Templates', href: '/dashboard/performance/templates', icon: ClipboardList, featureKey: 'page.performance.templates' },
      { name: 'Culture Library', href: '/dashboard/performance/culture-library', icon: Library, featureKey: 'page.performance.culture-library' },
      { name: 'Development Actions', href: '/dashboard/performance/actions', icon: Award, featureKey: 'page.performance.actions' },
      { name: 'Performance Settings', href: '/dashboard/performance/settings', icon: Settings, featureKey: 'page.settings.performance' },
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
    name: 'Letters',
    icon: FileText,
    items: [
      { name: 'Letters', href: '/dashboard/letters', icon: FileText },
      { name: 'Letter Reports', href: '/dashboard/letters/reports', icon: FileText },
      // Same ADMIN-only key the templates page and API check (canAdministerLetters).
      { name: 'Letter Templates', href: '/dashboard/letters/templates', icon: FileText, featureKey: 'button.letter.admin' },
    ],
    defaultOpen: false,
  },
  {
    name: 'People & Organization',
    icon: Users,
    items: [
      { name: 'Teams Directory', href: '/dashboard/org/teams', icon: Building2 },
      { name: 'Users Directory', href: '/dashboard/org/users', icon: Users },
      { name: 'Org Admin', href: '/dashboard/admin/org', icon: Network },
      { name: 'AI Logs', href: '/dashboard/admin/ai-logs', icon: Sparkles },
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
      { name: 'Permissions', href: '/dashboard/settings/permissions', icon: ShieldCheck },
      { name: 'Timeframes', href: '/dashboard/settings/timeframes', icon: Calendar },
      { name: 'OKR Rules', href: '/dashboard/settings/okr-rules', icon: Target },
      { name: 'Branding', href: '/dashboard/settings/branding', icon: Building2 },
      { name: 'Integrations', href: '/dashboard/settings/integrations', icon: Settings },
      { name: 'Audit Logs', href: '/dashboard/settings/audit-logs', icon: FileText },
      { name: 'Travel & Mobility', href: '/dashboard/settings/travel', icon: MapPin },
      { name: 'Automations', href: '/dashboard/settings/automations', icon: Bot },
      { name: 'Letter Permissions', href: '/dashboard/settings/letter-permissions', icon: ShieldCheck },
    ],
    defaultOpen: false,
  },
]

export function getFlatNavItems(): NavItem[] {
  return navigationGroups.flatMap((g) => g.items)
}

export interface NavVisibilityContext {
  /** The viewer's `session.user.role`; required to show `roleGate` items. */
  role?: string | null
}

export function getVisibleNavigationGroups(
  canFeature: (featureKey: string) => boolean,
  ctx: NavVisibilityContext = {},
): NavGroup[] {
  const itemVisible = (item: NavItem) =>
    (!item.featureKey || canFeature(item.featureKey)) &&
    (!item.roleGate || item.roleGate(ctx.role))
  return navigationGroups
    .filter((group) => !group.featureKey || canFeature(group.featureKey))
    .map((group) => ({
      ...group,
      items: group.items.filter(itemVisible),
    }))
    .filter((group) => group.items.length > 0)
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
export function getActiveNavContext(pathname: string, groups: NavGroup[] = navigationGroups): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem; hrefLen: number } | null = null
  for (const group of groups) {
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
