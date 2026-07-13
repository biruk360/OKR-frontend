import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { ScrumSettingsPage } from '@/features/scrum/components/ScrumSettingsPage'

export const metadata = { title: 'Scrum Settings' }

export default async function Page() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  return <ScrumSettingsPage />
}
