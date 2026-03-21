import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import GoalsPageClient from '@/components/goals/GoalsPageClient'

export default async function GoalsPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/auth/signin')
  }

  return <GoalsPageClient user={session.user} />
}

