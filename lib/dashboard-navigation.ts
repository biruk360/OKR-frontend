import type { LucideIcon } from 'lucide-react'
// Lucide at the Apple-Pro ~1.75 stroke is the app's SF-Symbols-style set
// (SF Symbols themselves can't ship on the web). One distinct, contextual
// glyph per destination — no two items in a group share an icon.
import {
  Activity,
  Archive,
  Award,
  BarChart3,
  Bell,
  BellRing,
  BrainCircuit,
  Briefcase,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  CarFront,
  ClipboardCheck,
  ClipboardList,
  Compass,
  Contact,
  Crosshair,
  FileBarChart,
  FileLock2,
  FolderKanban,
  Gauge,
  Kanban,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  ListChecks,
  LockKeyhole,
  Mail,
  Map,
  MessageCircle,
  MessagesSquare,
  MonitorDot,
  Navigation,
  Network,
  Newspaper,
  Palette,
  Plug,
  Rocket,
  Route,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
  Target,
  Timer,
  UserCircle,
  UserCog,
  Users,
  Workflow,
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
    icon: Briefcase,
    items: [
      { name: 'My OKRs', href: '/dashboard/my-okrs', icon: Crosshair },
      { name: 'To-dos', href: '/dashboard/todos', icon: ListChecks },
      { name: 'Work Board', href: '/dashboard/work', icon: Kanban },
      { name: 'Daily Scrum', href: '/dashboard/scrum', icon: CalendarCheck },
      { name: 'Sprints', href: '/dashboard/sprints', icon: Timer },
    ],
    defaultOpen: true,
  },
  {
    name: 'Delivery',
    icon: Rocket,
    items: [
      { name: 'Projects', href: '/dashboard/projects', icon: FolderKanban },
      { name: 'Portfolio', href: '/dashboard/projects/portfolio', icon: Briefcase, roleGate: canReadPortfolio },
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
      { name: 'OKR Explorer', href: '/dashboard/okrs-all', icon: Compass },
      { name: 'Key Results', href: '/dashboard/key-results', icon: KeyRound },
      { name: 'Insights', href: '/dashboard/insights', icon: BarChart3 },
    ],
    defaultOpen: true,
  },
  {
    name: 'OKR & Operations',
    icon: Route,
    items: [
      { name: 'Daily Trip Plan', href: '/dashboard/travel', icon: Map },
      { name: 'Coordinator Console', href: '/dashboard/travel/console', icon: MonitorDot },
      { name: 'Pool Coordinator', href: '/dashboard/travel/pool', icon: CarFront },
      { name: 'Automations', href: '/dashboard/automations', icon: Workflow, featureKey: 'canAuthorAutomations' },
      { name: 'Briefings', href: '/dashboard/automations/briefings', icon: Newspaper },
    ],
    defaultOpen: false,
  },
  {
    name: 'Performance',
    icon: Award,
    featureKey: 'module.performance',
    items: [
      { name: 'My Performance', href: '/dashboard/performance', icon: Gauge, featureKey: 'page.performance.my' },
      { name: 'Evaluation Queue', href: '/dashboard/performance/evaluations', icon: ClipboardCheck, featureKey: 'page.performance.evaluations' },
      { name: 'Review Cycles', href: '/dashboard/performance/cycles', icon: CalendarClock, featureKey: 'page.performance.cycles' },
      { name: 'Scorecard Templates', href: '/dashboard/performance/templates', icon: ClipboardList, featureKey: 'page.performance.templates' },
      { name: 'Culture Library', href: '/dashboard/performance/culture-library', icon: Library, featureKey: 'page.performance.culture-library' },
      { name: 'Development Actions', href: '/dashboard/performance/actions', icon: Sprout, featureKey: 'page.performance.actions' },
      { name: 'Performance Settings', href: '/dashboard/performance/settings', icon: SlidersHorizontal, featureKey: 'page.settings.performance' },
    ],
    defaultOpen: false,
  },
  {
    name: 'Communication',
    icon: MessagesSquare,
    items: [
      { name: 'Activity Feed', href: '/dashboard/activity', icon: Activity },
      { name: 'Comments', href: '/dashboard/comments', icon: MessageCircle },
      { name: 'Notifications', href: '/dashboard/notifications', icon: Bell },
    ],
    defaultOpen: false,
  },
  {
    name: 'Letters',
    icon: Mail,
    items: [
      { name: 'Letters', href: '/dashboard/letters', icon: Mail },
      { name: 'Letter Reports', href: '/dashboard/letters/reports', icon: FileBarChart },
      // Same ADMIN-only key the templates page and API check (canAdministerLetters).
      { name: 'Letter Templates', href: '/dashboard/letters/templates', icon: LayoutTemplate, featureKey: 'button.letter.admin' },
    ],
    defaultOpen: false,
  },
  {
    name: 'People & Organization',
    icon: Users,
    items: [
      { name: 'Teams Directory', href: '/dashboard/org/teams', icon: Users },
      { name: 'Users Directory', href: '/dashboard/org/users', icon: Contact },
      { name: 'Org Admin', href: '/dashboard/admin/org', icon: Network },
      { name: 'AI Logs', href: '/dashboard/admin/ai-logs', icon: BrainCircuit },
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
      { name: 'Profile', href: '/dashboard/settings/profile', icon: UserCircle },
      { name: 'Account', href: '/dashboard/settings/account', icon: LockKeyhole },
      { name: 'Notifications', href: '/dashboard/settings/notifications', icon: BellRing },
      { name: 'Users', href: '/dashboard/settings/users', icon: UserCog },
      { name: 'Teams', href: '/dashboard/settings/teams', icon: Users },
      { name: 'Permissions', href: '/dashboard/settings/permissions', icon: ShieldCheck },
      { name: 'Timeframes', href: '/dashboard/settings/timeframes', icon: CalendarRange },
      { name: 'OKR Rules', href: '/dashboard/settings/okr-rules', icon: Scale },
      { name: 'Branding', href: '/dashboard/settings/branding', icon: Palette },
      { name: 'Integrations', href: '/dashboard/settings/integrations', icon: Plug },
      { name: 'Audit Logs', href: '/dashboard/settings/audit-logs', icon: ScrollText },
      { name: 'Travel & Mobility', href: '/dashboard/settings/travel', icon: Navigation },
      { name: 'Automations', href: '/dashboard/settings/automations', icon: Workflow },
      { name: 'Letter Permissions', href: '/dashboard/settings/letter-permissions', icon: FileLock2 },
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
