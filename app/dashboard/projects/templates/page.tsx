import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { TemplateListClient } from '@/features/projects'

export const metadata = { title: 'Project Templates' }

export default async function ProjectTemplatesPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  return <TemplateListClient user={{ id: session.user.id, role: session.user.role }} />
}
