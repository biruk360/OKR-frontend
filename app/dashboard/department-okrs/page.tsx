import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { OKRLevelView, CreateDepartmentObjectiveButton } from '@/features/objectives'

export default async function DepartmentOKRsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const canCreate =
    session.user.role === 'ADMIN' ||
    session.user.role === 'EXECUTIVE' ||
    session.user.role === 'DEPARTMENT_LEAD'

  return (
    <OKRLevelView
      session={session}
      level="DEPARTMENT"
      description="View and manage department-level objectives and key results."
      objectiveLabel="Department Objectives"
      createButton={canCreate ? <CreateDepartmentObjectiveButton /> : undefined}
    />
  )
}
