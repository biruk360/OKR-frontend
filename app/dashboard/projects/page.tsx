import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { canCreateProject } from '@/lib/permissions'
import { ProjectsListClient } from '@/features/projects'
import { getAiProviderAdminSettings } from '@/lib/ai/admin-settings'

export const metadata = { title: 'Projects' }

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: { creationDraft?: string | string[] }
}) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  const canCreate = canCreateProject({
    role: session.user.role,
    isProjectManager: session.user.isProjectManager,
  })
  const aiSettings = canCreate
    ? await getAiProviderAdminSettings().catch(() => null)
    : null
  const initialDraftId = typeof searchParams?.creationDraft === 'string'
    ? searchParams.creationDraft
    : null

  return (
    <ProjectsListClient
      canCreateProject={canCreate}
      aiFeatureEnabled={aiSettings?.featureEnabled === true}
      aiAvailable={aiSettings?.available === true}
      currentUserId={session.user.id}
      initialDraftId={canCreate ? initialDraftId : null}
    />
  )
}
