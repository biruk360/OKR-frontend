import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { ProjectDetailClient } from '@/features/projects'
import { ScrumActivityPanel } from '@/features/scrum'

export const metadata = { title: 'Project' }

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  return (
    <div className="space-y-4">
      <ProjectDetailClient projectId={params.id} user={{ id: session.user.id, role: session.user.role }} />
      <div className="mx-auto max-w-content px-6 pb-6">
        <ScrumActivityPanel title="Project Daily Scrum activity" projectId={params.id} />
      </div>
    </div>
  )
}
