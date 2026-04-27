import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { SprintsListClient } from '@/features/sprints'

export default async function SprintsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  return <SprintsListClient currentUserId={session.user.id} />
}
