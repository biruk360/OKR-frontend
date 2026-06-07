import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { canAccessSettings } from '@/lib/permissions'
import AuditLogsView from '@/components/settings/AuditLogsView'

export default async function AuditLogsSettingsPage() {
  const session = await getServerSessionSafe()

  if (!session) {
    redirect('/auth/signin')
  }

  if (!canAccessSettings(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  const logs = await prisma.activityLog.findMany({
    take: 200,
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { id: true, name: true, email: true } } },
  })

  return (
    <div className="space-y-6">
      <AuditLogsView initialLogs={logs} />
    </div>
  )
}
