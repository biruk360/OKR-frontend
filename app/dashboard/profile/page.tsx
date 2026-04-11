import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'

/** Rich profile UI (stats, KR list, minimap) lives on the org user profile route. */
export default async function DashboardProfileRedirectPage() {
  const session = await getServerSessionSafe()
  if (!session?.user?.id) redirect('/auth/signin')
  redirect(`/dashboard/org/users/${session.user.id}`)
}
