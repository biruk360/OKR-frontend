/**
 * /dashboard/travel/sheet/:deptId/:date — Daily Movement Sheet view.
 * `:deptId` may be the literal "all" for an org-wide sheet.
 */

import { MovementSheetView } from '@/features/daily-trip-plan'

interface Props { params: { deptId: string; date: string } }

export default function MovementSheetPage({ params }: Props) {
  return <MovementSheetView deptId={params.deptId} date={params.date} />
}
