import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { TemplateBuilderClient } from '@/features/projects'

interface Props {
  params: { id: string }
}

export const metadata = { title: 'Edit Project Template' }

export default async function EditProjectTemplatePage({ params }: Props) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  return <TemplateBuilderClient templateId={params.id} userRole={session.user.role} />
}
