import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import AppleDashboard from '@/components/dashboard/AppleDashboard'
import { loadDashboardHome } from '@/lib/dashboards/home.server'

export default async function DashboardPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  // All sections (hero, check-ins, KPIs, my OKRs, team feed, initiatives, Daily
  // Scrum) are loaded — and scoped to the viewer — by lib/dashboards/home.server.ts.
  const props = await loadDashboardHome(session.user)

  return <AppleDashboard {...props} />
}
