import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import InitiativeReportClient from '@/components/initiative-report/InitiativeReportClient'

export default async function InitiativeReportPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  return <InitiativeReportClient />
}
