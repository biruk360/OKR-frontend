import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'

export const metadata = { title: 'Project' }

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  redirect(`/projects/${params.id}`)
}
