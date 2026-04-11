const EXACT: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/goals': 'Goals',
  '/dashboard/my-okrs': 'My OKRs',
  '/dashboard/my-tasks': 'My initiatives',
  '/dashboard/sprints': 'Sprints',
  '/dashboard/company-okrs': 'Company OKRs',
  '/dashboard/department-okrs': 'Department OKRs',
  '/dashboard/alignment-map': 'Strategy map',
  '/dashboard/plans': 'Plans',
  '/dashboard/objectives': 'Objectives',
  '/dashboard/progress': 'Progress tracking',
  '/dashboard/reports': 'Reports',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/activity': 'Activity feed',
  '/dashboard/comments': 'Comments',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/org/teams': 'Teams directory',
  '/dashboard/org/users': 'Users directory',
  '/dashboard/archived-objectives': 'Archived objectives',
  '/dashboard/settings': 'Settings',
  '/dashboard/settings/profile': 'Profile',
  '/dashboard/settings/account': 'Account',
  '/dashboard/settings/notifications': 'Notification settings',
  '/dashboard/settings/users': 'Users',
  '/dashboard/settings/teams': 'Teams',
  '/dashboard/settings/timeframes': 'Timeframes',
  '/dashboard/settings/okr-rules': 'OKR rules',
  '/dashboard/settings/branding': 'Branding',
  '/dashboard/settings/integrations': 'Integrations',
  '/dashboard/settings/audit-logs': 'Audit logs',
}

/** Prefix fallback when no exact match (longest wins — sort by prefix length desc). */
const PREFIX_FALLBACK: { prefix: string; title: string }[] = [
  { prefix: '/dashboard/key-results/', title: 'Key result' },
  { prefix: '/dashboard/objectives/', title: 'Objective' },
  { prefix: '/dashboard/org/users/', title: 'User profile' },
  { prefix: '/dashboard/sprints/', title: 'Sprint' },
]

export function getDashboardPageTitle(pathname: string | null): string {
  if (!pathname || !pathname.startsWith('/dashboard')) {
    return 'Dashboard'
  }
  const normalized = pathname.replace(/\/$/, '') || '/dashboard'
  if (EXACT[normalized]) {
    return EXACT[normalized]
  }
  const sorted = [...PREFIX_FALLBACK].sort((a, b) => b.prefix.length - a.prefix.length)
  for (const { prefix, title } of sorted) {
    if (pathname.startsWith(prefix)) {
      return title
    }
  }
  return 'Dashboard'
}
