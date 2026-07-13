import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { ProjectsListClient } from '@/features/projects'

export const metadata = { title: 'Projects' }

export default async function ProjectsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  return <ProjectsListClient user={{ id: session.user.id, role: session.user.role }} />
}
