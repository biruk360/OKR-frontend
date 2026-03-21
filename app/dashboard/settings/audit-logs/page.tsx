import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { canAccessSettings } from '@/lib/permissions'
import AuditLogsView from '@/components/settings/AuditLogsView'

export default async function AuditLogsSettingsPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/auth/signin')
  }

  if (!canAccessSettings(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  // Get audit logs (for now, we'll use system settings changes and user actions)
  // In a full implementation, you'd have a dedicated AuditLog model
  const recentActions = await prisma.systemSettings.findMany({
    take: 50,
    orderBy: { updatedAt: 'desc' }
  })

  return (
    <div className="space-y-6">
      <AuditLogsView initialLogs={recentActions} />
    </div>
  )
}

