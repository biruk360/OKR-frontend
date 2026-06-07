'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, StatCard, StatGrid } from '@/components/ui'
import type { EvaluationDetail } from '../types'
import { useEvaluationResponse } from '../hooks/queries'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

export function PerformanceReport({ evaluation }: { evaluation: EvaluationDetail }) {
  const response = useEvaluationResponse(evaluation.id)
  const permissions = usePerformancePermissions()
  const canAcknowledge = permissions.can('button.performance.report.acknowledge', 'evaluation_acknowledgement', 'canSubmit')
    && permissions.canDo('evaluation_acknowledgement', 'canWrite')
  const canDispute = permissions.can('button.performance.report.dispute', 'evaluation_acknowledgement', 'canSubmit')
    && permissions.canDo('evaluation_acknowledgement', 'canWrite')
  const [comment, setComment] = useState('')
  const report = evaluation.report?.contentJson
  if (!report) return null

  return (
    <div className="space-y-4">
      <StatGrid columns={3}>
        <StatCard label="Normalized score" value={report.normalized == null ? '—' : report.normalized.toFixed(1)} tone="blue" />
        <StatCard label="Decision band" value={report.decisionBand ?? '—'} tone={report.gatekeeperPass ? 'green' : 'red'} />
        <StatCard label="Gatekeeper" value={report.gatekeeperPass ? 'Passed' : 'Not passed'} tone={report.gatekeeperPass ? 'green' : 'red'} />
      </StatGrid>
      {(report.tierBreakdown ?? []).map((tier) => (
        <Card key={tier.id}>
          <CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base">{tier.name}</CardTitle><span className="text-sm font-semibold">{tier.subtotal.toFixed(1)} / {tier.maxPoints}</span></div></CardHeader>
          <CardContent className="divide-y divide-border">
            {tier.criteria.map((criterion) => (
              <div key={criterion.id} className="py-3">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{criterion.title}</p><span className="text-sm font-semibold">{criterion.consolidated?.toFixed(1) ?? '—'} / {criterion.maxPoints}</span></div>
                {criterion.feedbackSummary && <p className="mt-1 text-xs text-muted-foreground">{criterion.feedbackSummary}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      {evaluation.status === 'DRAFT_SHARED' && (canAcknowledge || canDispute) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Respond to shared draft</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional acknowledgement comment; required for dispute" />
            <div className="flex flex-wrap gap-2">
              {canAcknowledge && <Button onClick={() => response.acknowledge.mutate(comment)} disabled={response.acknowledge.isPending}><CheckCircle2 className="mr-2 size-4" /> Acknowledge</Button>}
              {canDispute && <Button variant="outline" onClick={() => response.dispute.mutate(comment)} disabled={!comment.trim() || response.dispute.isPending}><AlertTriangle className="mr-2 size-4" /> Dispute</Button>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
