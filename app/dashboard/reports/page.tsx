import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import ReportDashboardClient from '@/components/reports/ReportDashboardClient'
import { loadDashboardPayload } from '@/lib/dashboards/payload'

export default async function ReportsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  // Server-render the same scope the user can see live via /api/dashboards/{ceo,me}.
  // Admins and executives get the full company scope; everyone else gets the
  // employee-filtered scope.
  const scope =
    session.user.role === 'ADMIN' || session.user.role === 'EXECUTIVE' ? 'ceo' : 'me'
  const payload = await loadDashboardPayload(scope, session.user.id)

  return (
    <ReportDashboardClient
      currentUserId={session.user.id}
      currentUserName={session.user.name ?? 'You'}
      currentUserRole={session.user.role}
      keyResults={payload.keyResults}
      objectives={payload.objectives}
      todos={payload.todos}
      filterOptions={payload.filterOptions}
    />
  )
}
