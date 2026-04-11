import { getServerSessionSafe } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canAccessSettings } from '@/lib/permissions'
import BrandingManagement from '@/components/settings/BrandingManagement'

export default async function BrandingSettingsPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  if (!canAccessSettings(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  return (
    <div className="space-y-6">
      <BrandingManagement />
    </div>
  )
}

