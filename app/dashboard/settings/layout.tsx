import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canAccessSettings } from '@/lib/permissions'
import { redirect } from 'next/navigation'

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Check if user can access settings (ADMIN and EXECUTIVE only)
  if (!canAccessSettings(session.user.role as any)) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account settings and preferences.
        </p>
      </div>

      <div>
        {children}
      </div>
    </div>
  )
}

