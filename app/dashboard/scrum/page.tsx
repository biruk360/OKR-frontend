import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { ScrumHome } from '@/features/scrum'

export const metadata = { title: 'Daily Scrum' }

export default async function ScrumPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  return <ScrumHome />
}
