import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { canManageOrg } from '@/lib/permissions'
import { AdminOrgWorkspace } from '@/features/admin-org'

export const dynamic = 'force-dynamic'

export default async function AdminOrgPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  if (!canManageOrg(session.user.role as any)) redirect('/dashboard')

  return <AdminOrgWorkspace />
}
