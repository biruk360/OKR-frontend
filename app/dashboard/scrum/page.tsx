import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { ScrumHome, canReadScrumSettings } from '@/features/scrum'

export const metadata = { title: 'Daily Scrum' }

export default async function ScrumPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  const canReadSettings = await canReadScrumSettings(session)
  // ScrumHome reads ?date= / ?update= / ?view= deep links via useSearchParams.
  return (
    <Suspense fallback={null}>
      <ScrumHome currentUserId={session.user.id} canReadSettings={canReadSettings} />
    </Suspense>
  )
}
