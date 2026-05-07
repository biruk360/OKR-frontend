/**
 * /dashboard/travel/runsheet/:driverId/:date — driver-facing Daily Run Sheet.
 * When the viewer is the assigned driver, the leg-confirmation buttons render
 * (otherwise read-only — useful for supervisors and the Pool Coordinator).
 */

import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RunSheetView } from '@/features/daily-trip-plan'

interface Props { params: { driverId: string; date: string } }

export default async function RunSheetPage({ params }: Props) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  const driver = await prisma.driver.findUnique({ where: { id: params.driverId }, select: { userId: true } })
  const driverMode = driver?.userId === session.user.id
  return <RunSheetView driverId={params.driverId} date={params.date} driverMode={driverMode} />
}
