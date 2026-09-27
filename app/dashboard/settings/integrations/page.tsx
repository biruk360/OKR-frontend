import { getServerSessionSafe } from '@/lib/auth'
import { redirect } from 'next/navigation'
import IntegrationsManagement from '@/components/settings/IntegrationsManagement'

export default async function IntegrationsSettingsPage() {
  const session = await getServerSessionSafe()

  if (!session) {
    redirect('/auth/signin')
  }

  // ADMIN-only, matching the integrations API (Wave 1). EXECUTIVE used to get
  // in here and then hit 403s on every request the page made.
  if (session.user.role !== 'ADMIN') {
    redirect('/dashboard/settings/profile')
  }

  return (
    <div className="space-y-6">
      <IntegrationsManagement showAiProviderSettings />
    </div>
  )
}
