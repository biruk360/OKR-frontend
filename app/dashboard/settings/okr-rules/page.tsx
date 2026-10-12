import { getServerSessionSafe } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canAccessSettings } from '@/lib/permissions'
import OKRRulesManagement from '@/components/settings/OKRRulesManagement'
import { DevelopmentRuleSettings } from '@/components/settings/DevelopmentRuleSettings'

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
      {/* DEV-3: organization-wide development plan rule (OrganizationSettings.devMinItems / devMinHours). */}
      <DevelopmentRuleSettings />
    </div>
  )
}

