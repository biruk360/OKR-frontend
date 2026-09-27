import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { ScrumSettingsPage, canReadScrumSettings, canWriteScrumSettings } from '@/features/scrum'

export const metadata = { title: 'Scrum Settings' }

export default async function Page() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  // scrum_settings: ADMIN/EXECUTIVE write, doctype grants (e.g. DEPARTMENT_LEAD read), others redirected.
  if (!await canReadScrumSettings(session)) redirect('/dashboard/scrum')
  const canWrite = await canWriteScrumSettings(session)
  return <ScrumSettingsPage readOnly={!canWrite} />
}
