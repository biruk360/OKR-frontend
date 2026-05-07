/**
 * /dashboard/travel/plans/:id — plan detail / editor page. Renders both the
 * employee editor and the Coordinator action bar; the feature components do
 * the right thing based on viewer role (the API enforces authorization
 * server-side; the UI just hides actions the viewer can't take).
 */

import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/ui/PageHeader'
import { PlanEditor } from '@/features/daily-trip-plan'
import { canActAsCoordinator } from '@/lib/dtp/permissions'
import { CoordinatorActionsBar } from './CoordinatorActionsBar'

interface Props { params: { id: string } }

export default async function PlanDetailPage({ params }: Props) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const plan = await prisma.dailyTripPlan.findUnique({ where: { id: params.id } })
  if (!plan) redirect('/dashboard/travel')

  const isRequester = plan.requesterId === session.user.id
  const isCoord = await canActAsCoordinator(session, plan.departmentId)

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Trip plan · ${plan.tripDate.toISOString().slice(0, 10)}`}
        description={isCoord && !isRequester ? 'Coordinator review' : 'Your trip plan'}
        actions={isCoord && !isRequester ? <CoordinatorActionsBar planId={params.id} /> : undefined}
      />
      <PlanEditor planId={params.id} isRequester={isRequester} />
    </div>
  )
}
