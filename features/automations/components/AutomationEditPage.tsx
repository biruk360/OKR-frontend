'use client'

import { Skeleton } from '@/components/ui/Skeleton'
import { useAutomation } from '../hooks/useAutomations'
import { AutomationForm } from './AutomationForm'

/**
 * Loads the automation before rendering the form, because the form derives its
 * entire initial state from the saved plan in one pass — a form that mounted
 * empty and then back-filled would flash the wrong values and fight the user's
 * first keystroke.
 */
export function AutomationEditPage({ id }: { id: string }) {
  const { data: automation, isLoading, error } = useAutomation(id)

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 w-full rounded-card" />
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    )
  }

  if (error || !automation) {
    return (
      <div className="rounded-card border border-danger-500/30 bg-danger-500/5 p-4 text-body-sm text-danger-500">
        {(error as Error)?.message ?? 'Automation not found'}
      </div>
    )
  }

  return <AutomationForm automation={automation} />
}
