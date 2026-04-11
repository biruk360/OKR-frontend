import { getServerSessionSafe } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canAccessSettings } from '@/lib/permissions'
import OKRRulesManagement from '@/components/settings/OKRRulesManagement'

export default async function OKRRulesSettingsPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  if (!canAccessSettings(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  return (
    <div className="space-y-6">
      <OKRRulesManagement />
    </div>
  )
}

