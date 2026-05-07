'use client'

import { CoordinatorActions, usePlan } from '@/features/daily-trip-plan'

export function CoordinatorActionsBar({ planId }: { planId: string }) {
  const q = usePlan(planId)
  if (!q.data) return null
  return <CoordinatorActions plan={q.data.plan} />
}
