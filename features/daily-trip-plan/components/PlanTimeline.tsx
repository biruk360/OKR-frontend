import { Check, Clock, Truck, Flag, ArrowDown, X } from 'lucide-react'
import type { DtpPlanWithStops, DtpEventRow } from '../types'

interface Props {
  plan: DtpPlanWithStops
  events?: DtpEventRow[]
}

const STAGES: { status: string; label: string }[] = [
  { status: 'SUBMITTED', label: 'Submitted' },
  { status: 'MANAGER_ENDORSED', label: 'Manager endorsed' },
  { status: 'UNDER_REVIEW', label: 'Coordinator review' },
  { status: 'APPROVED', label: 'Approved' },
  { status: 'DRIVER_ASSIGNED', label: 'Driver assigned' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'COMPLETED', label: 'Completed' },
]

export function PlanTimeline({ plan }: Props) {
  // Collapse the bypassed stages: if endorsement is OFF the plan jumps from
  // SUBMITTED → APPROVED. Render every stage but mark unreached ones as muted.
  const reachedIdx = STAGES.findIndex((s) => s.status === plan.status)
  return (
    <ol className="space-y-2">
      {STAGES.map((s, i) => {
        const reached = reachedIdx >= 0 && i <= reachedIdx
        const isCurrent = i === reachedIdx
        return (
          <li key={s.status} className="flex items-center gap-3">
            <span
              className={
                'flex h-6 w-6 items-center justify-center rounded-full border ' +
                (reached ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground')
              }
            >
              {reached ? <Check className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
            </span>
            <span className={'text-sm ' + (isCurrent ? 'font-medium' : reached ? '' : 'text-muted-foreground')}>{s.label}</span>
          </li>
        )
      })}
      {plan.status === 'WITHDRAWN' && (
        <li className="flex items-center gap-3 text-sm text-muted-foreground"><X className="h-4 w-4" /> Withdrawn</li>
      )}
      {plan.status === 'CANCELLED' && (
        <li className="flex items-center gap-3 text-sm text-red-700"><Flag className="h-4 w-4" /> Cancelled</li>
      )}
      {plan.status === 'RETURNED' && (
        <li className="flex items-center gap-3 text-sm text-orange-700"><ArrowDown className="h-4 w-4" /> Returned for edit</li>
      )}
      {plan.status === 'ADJUSTED' && (
        <li className="flex items-center gap-3 text-sm text-purple-700"><Truck className="h-4 w-4" /> Coordinator adjusted — awaiting your acknowledgement</li>
      )}
    </ol>
  )
}
