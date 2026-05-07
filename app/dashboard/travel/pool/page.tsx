/**
 * /dashboard/travel/pool — Pool Coordinator console.
 */

import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { PoolConsole } from '@/features/daily-trip-plan'

export default async function PoolPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  return (
    <div className="space-y-4">
      <PageHeader title="Pool Coordinator" description="Assign drivers and vehicles to approved plans." />
      <PoolConsole />
    </div>
  )
}
