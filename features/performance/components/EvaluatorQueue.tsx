'use client'

import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { Skeleton, SkeletonAvatar } from '@/components/ui/Skeleton'
import { useEvaluations } from '../hooks/queries'
import { humanizeEnum, PerformanceStatusBadge } from './PerformanceStatusBadge'
import { SectionCard } from './SectionCard'

export function EvaluatorQueue() {
  const query = useEvaluations()
  const assigned = (query.data ?? []).filter((evaluation) => evaluation.assignment)
  return (
    <SectionCard title="Assigned evaluations">
      {query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2">
              <SkeletonAvatar size={22} />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : assigned.length === 0 ? (
        <EmptyState bare icon={ClipboardCheck} title="No assigned evaluations" description="Evaluations assigned to you will appear here." />
      ) : (
        <div className="divide-y divide-border">
          {assigned.map((evaluation) => (
            <Link key={evaluation.id} href={`/dashboard/performance/evaluations/${evaluation.id}/score`} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0 hover:bg-muted/50">
              <div>
                <p className="text-sm font-semibold">{evaluation.employee.name}</p>
                <p className="text-xs text-muted-foreground">{evaluation.cycle.name} · {evaluation.template.name} · {humanizeEnum(evaluation.assignment?.role ?? '')}</p>
              </div>
              <PerformanceStatusBadge status={evaluation.assignment?.status ?? evaluation.status} />
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
