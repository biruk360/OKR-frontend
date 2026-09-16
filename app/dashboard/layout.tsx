import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getServerSessionSafe } from '@/lib/auth'
import { DashboardTitleProvider } from '@/components/layout/DashboardTitleContext'
import DashboardShell from '@/components/layout/DashboardShell'
import GlobalInitiativeDetail from '@/components/shared/GlobalInitiativeDetail'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSessionSafe()

  if (!session) {
    // Send the user back where they were going. A shared card link
    // (/dashboard/sprints/<id>?card=<todoId>) otherwise died at sign-in and
    // dropped the recipient on the default page with no card open.
    const target = headers().get('x-pathname')
    redirect(
      target && target.startsWith('/dashboard')
        ? `/auth/signin?callbackUrl=${encodeURIComponent(target)}`
        : '/auth/signin',
    )
  }

  return (
    <DashboardTitleProvider>
      <DashboardShell user={session.user}>{children}</DashboardShell>
      {/* Mounted once — opens whenever any initiative card calls
          useInitiativeDetailStore.getState().open(id). */}
      <GlobalInitiativeDetail />
    </DashboardTitleProvider>
  )
}
