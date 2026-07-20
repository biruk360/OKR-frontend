import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { ProjectWorkspaceClient } from '@/features/projects'

export const metadata = { title: 'Project workspace' }

export default async function ProjectWorkspacePage({ params }: { params: { id: string } }) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  return <ProjectWorkspaceClient projectId={params.id} user={{ id: session.user.id, role: session.user.role }} />
}
