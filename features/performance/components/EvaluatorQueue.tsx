'use client'

import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui'
import { useEvaluations } from '../hooks/queries'
import { PerformanceStatusBadge } from './PerformanceStatusBadge'

export function EvaluatorQueue() {
  const query = useEvaluations()
  const assigned = (query.data ?? []).filter((evaluation) => evaluation.assignment)
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Assigned evaluations</CardTitle></CardHeader>
      <CardContent>
        {query.isLoading ? <p className="text-sm text-muted-foreground">Loading evaluation queue...</p> : assigned.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No assigned evaluations" description="Evaluations assigned to you will appear here." />
        ) : (
          <div className="divide-y divide-border">
            {assigned.map((evaluation) => (
              <Link key={evaluation.id} href={`/dashboard/performance/evaluations/${evaluation.id}/score`} className="flex items-center justify-between gap-4 py-4 hover:bg-muted/50">
                <div>
                  <p className="text-sm font-semibold">{evaluation.employee.name}</p>
                  <p className="text-xs text-muted-foreground">{evaluation.cycle.name} · {evaluation.template.name} · {evaluation.assignment?.role}</p>
                </div>
                <PerformanceStatusBadge status={evaluation.assignment?.status ?? evaluation.status} />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

