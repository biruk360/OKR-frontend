import { redirect } from 'next/navigation'
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
    redirect('/auth/signin')
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
