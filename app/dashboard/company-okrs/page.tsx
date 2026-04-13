import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { OKRLevelView, CreateCompanyObjectiveButton } from '@/features/objectives'

export default async function CompanyOKRsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const canCreate = session.user.role === 'ADMIN' || session.user.role === 'EXECUTIVE'

  return (
    <OKRLevelView
      session={session}
      level="COMPANY"
      description="View and manage company-wide objectives and key results."
      objectiveLabel="Company Objectives"
      createButton={canCreate ? <CreateCompanyObjectiveButton /> : undefined}
    />
  )
}
