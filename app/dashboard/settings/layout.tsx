import { getServerSessionSafe } from '@/lib/auth'
import { canAccessSettings } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import SettingsNav from '@/components/settings/SettingsNav'

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSessionSafe()

  if (!session) {
    redirect('/auth/signin')
  }

  if (!canAccessSettings(session.user.role as any)) {
    redirect('/dashboard')
  }

  return (
    <div className="flex gap-8">
      <aside className="w-56 shrink-0">
        <SettingsNav userRole={session.user.role} />
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

