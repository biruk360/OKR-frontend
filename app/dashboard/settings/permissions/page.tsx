import { getServerSessionSafe } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PermissionManager from '@/components/settings/PermissionManager'
import { PageHeader } from '@/components/ui/PageHeader'
import { resolveFeaturePermission } from '@/lib/permission-resolver'

export const metadata = { title: 'Permission Manager — Settings' }

/**
 * Same gate as every /api/permissions/* route:
 * withRoleOrFeature(['ADMIN'], 'page.settings.permissions'). A failed feature
 * lookup is treated as a denial (fail closed), matching withRoleOrFeature.
 */
async function canOpenPermissionManager(userId: string, role: string): Promise<boolean> {
  if (role === 'ADMIN') return true
  try {
    return await resolveFeaturePermission(userId, 'page.settings.permissions')
  } catch {
    return false
  }
}

export default async function PermissionsPage() {
  const session = await getServerSessionSafe()

  if (!session) redirect('/auth/signin')

  if (!(await canOpenPermissionManager(session.user.id, session.user.role))) {
    redirect('/dashboard/settings')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="Permission Manager"
        description="Configure role-based access, document type rules, field visibility, record scoping, and feature flags."
      />
      <PermissionManager />
    </div>
  )
}
