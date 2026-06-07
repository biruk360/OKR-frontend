import { getServerSessionSafe } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PermissionManager from '@/components/settings/PermissionManager'

export const metadata = { title: 'Permission Manager — Settings' }

export default async function PermissionsPage() {
  const session = await getServerSessionSafe()

  if (!session) redirect('/auth/signin')

  if (session.user.role !== 'ADMIN') {
    redirect('/dashboard/settings')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Permission Manager</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure role-based access, document type rules, field visibility, record scoping, and feature flags.
        </p>
      </div>
      <PermissionManager />
    </div>
  )
}
