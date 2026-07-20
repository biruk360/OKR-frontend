import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { buildPeriodCloseReport } from '@/lib/okr/period-report'
import PeriodCloseReportClient from '@/components/period-close-report/PeriodCloseReportClient'

export default async function PeriodCloseReportPage({ params }: { params: { timeframeId: string } | Promise<{ timeframeId: string }> }) {
  const session = await getServerSessionSafe()
  if (!session?.user) redirect('/auth/signin')
  const { timeframeId } = await params
  const report = await buildPeriodCloseReport(timeframeId, { id: session.user.id, role: session.user.role })
  if (!report) notFound()
  return <PeriodCloseReportClient report={report} />
}
