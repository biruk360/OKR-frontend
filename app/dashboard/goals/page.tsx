import { getServerSessionSafe } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { GoalsPageClient } from '@/features/goals'

export default async function GoalsPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  return <GoalsPageClient user={session.user} />
}

