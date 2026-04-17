import { getServerSessionSafe } from '@/lib/auth'
import { canAccessSettings } from '@/lib/permissions'
import { redirect } from 'next/navigation'

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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Manage your account settings and preferences.
      </p>
      <div>{children}</div>
    </div>
  )
}

