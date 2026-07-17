import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { TemplateBuilderClient } from '@/features/projects'

export const metadata = { title: 'New Project Template' }

export default async function NewProjectTemplatePage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  return <TemplateBuilderClient userRole={session.user.role} />
}
