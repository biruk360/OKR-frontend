import { getServerSessionSafe } from '@/lib/auth'
import UserDetail from '@/components/settings/UserDetail'
import { redirect, notFound } from 'next/navigation'
import { canManageUsers } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { loadUserDetailSettings } from '@/lib/settings/settings-pages.server'

interface PageProps {
  params: RouteIdParams
}

export default async function UserDetailSettingsPage({ params }: PageProps) {
  const session = await getServerSessionSafe()

  if (!session) {
    redirect('/auth/signin')
  }

  // Only admins and executives can access this page
  if (!canManageUsers(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  const { id } = await resolveParams(params)
  if (!id) notFound()

  const user = await loadUserDetailSettings(id)

  if (!user) notFound()

  return (
    <UserDetail
      user={user}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    />
  )
}
