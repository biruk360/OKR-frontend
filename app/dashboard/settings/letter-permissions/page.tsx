import { getServerSessionSafe } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canAdminLetter } from '@/lib/permissions'
import LetterPermissionsManagement from '@/components/settings/LetterPermissionsManagement'

export const metadata = { title: 'Letter Permissions — Settings' }

export default async function LetterPermissionsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  if (!canAdminLetter(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  return (
    <div className="space-y-6">
      <LetterPermissionsManagement />
    </div>
  )
}
