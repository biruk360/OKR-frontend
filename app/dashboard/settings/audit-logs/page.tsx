import { getServerSessionSafe } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canAccessSettings } from '@/lib/permissions'
import { loadAuditLogsSettings } from '@/lib/settings/settings-pages.server'
import AuditLogsView from '@/components/settings/AuditLogsView'

export default async function AuditLogsSettingsPage() {
  const session = await getServerSessionSafe()

  if (!session) {
    redirect('/auth/signin')
  }

  if (!canAccessSettings(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  const logs = await loadAuditLogsSettings()

  return (
    <div className="space-y-6">
      <AuditLogsView initialLogs={logs} />
    </div>
  )
}
