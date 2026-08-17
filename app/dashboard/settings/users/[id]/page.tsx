import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import UserDetail from '@/components/settings/UserDetail'
import { redirect, notFound } from 'next/navigation'
import { canManageUsers } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

interface PageProps {
  params: RouteIdParams
}

export default async function UserDetailSettingsPage({ params }: PageProps) {
  const session = await getServerSessionSafe()

  if (!session) {
    redirect('/auth/signin')
  }

  // Only admins and executives can access this page
  if (!canManageUsers(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  const { id } = await resolveParams(params)
  if (!id) notFound()

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      role: true,
      designation: true,
      nameAmharic: true,
      designationAmharic: true,
      isActive: true,
      isProjectManager: true,
      createdAt: true,
      lastLoginAt: true,
      departmentMemberships: {
        where: { endedAt: null },
        select: {
          id: true,
          role: true,
          isPrimary: true,
          department: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (!user) notFound()

  return (
    <UserDetail
      user={{
        ...user,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      }}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    />
  )
}
