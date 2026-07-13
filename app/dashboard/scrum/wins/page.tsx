import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { ScrumWinsPage } from '@/features/scrum/components/ScrumWinsPage'

export const metadata = { title: 'Scrum Wins' }

export default async function Page() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  return <ScrumWinsPage />
}
