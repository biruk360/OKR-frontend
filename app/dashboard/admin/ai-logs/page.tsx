import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { canManageOrg } from '@/lib/permissions'
import type { UserRole } from '@/types'
import { AiLogsClient } from '@/features/admin-ai-logs'

export const dynamic = 'force-dynamic'

export default async function AiLogsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  if (!canManageOrg(session.user.role as UserRole)) redirect('/dashboard')

  return <AiLogsClient />
}
