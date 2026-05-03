import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { ReviewPlanClient } from '@/features/sprints-ai'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ planId: string }>
}

export default async function ReviewPlanPage({ params }: PageProps) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  const { planId } = await params
  return <ReviewPlanClient planId={planId} />
}
