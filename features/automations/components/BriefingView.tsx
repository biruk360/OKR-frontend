'use client'

import Link from 'next/link'
import { useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle2, Download, FileText, Loader2, Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import type { BriefingBlock, FindingBlock } from '@/types/automations'
import { useApproveBriefing, useBriefing } from '../hooks/useAutomations'
import { automationsApi } from '../services/api'
import { PromoteFindingModal } from './PromoteFindingModal'

/**
 * The rendered Briefing.
 *
 * `html` is produced server-side by lib/automations/render.ts, which escapes all
 * model-supplied text and emits only markup it constructs itself — so the string
 * injected here contains no model-controlled HTML.
 */
export function BriefingView({ id }: { id: string }) {
  const { data: briefing, isLoading, error } = useBriefing(id)
  const approve = useApproveBriefing(id)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [promoting, setPromoting] = useState<FindingBlock | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-96 w-full rounded-card" />
      </div>
    )
  }

  if (error || !briefing) {
    return (
      <div className="rounded-card border border-danger-500/30 bg-danger-500/5 p-4 text-body-sm text-danger-500">
        {(error as Error)?.message ?? 'Briefing not found'}
      </div>
    )
  }

  const pendingReview = briefing.status === 'PENDING_REVIEW'
  const promoted = new Set(briefing.promoted ?? [])
  // Only NEW and CHANGED are worth acting on — re-offering unchanged items every
  // run is exactly the noise the diff exists to remove.
  const actionable = ((briefing.blocks ?? []) as BriefingBlock[]).filter(
    (b): b is FindingBlock => b.type === 'finding' && (b.status === 'NEW' || b.status === 'CHANGED')
  )

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={briefing.title}
        description={briefing.summary}
        breadcrumb={
          <Link
            href={`/dashboard/automations/${briefing.automationId}`}
            className="text-body-sm text-ink-secondary hover:text-primary-600"
          >
            ← {briefing.automationName}
          </Link>
        }
        actions={
          <>
            <a href={automationsApi.exportUrl(briefing.id, 'pdf')} download>
              <Button variant="outline">
                <Download className="mr-1.5 h-4 w-4" />
                PDF
              </Button>
            </a>
            <a href={automationsApi.exportUrl(briefing.id, 'docx')} download>
              <Button variant="outline">
                <FileText className="mr-1.5 h-4 w-4" />
                Word
              </Button>
            </a>
            {briefing.canApprove && pendingReview && (
              <Button
                onClick={() => approve.mutate(undefined, { onError: (err) => setApproveError((err as Error).message) })}
                disabled={approve.isPending}
              >
                {approve.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                Approve and send
              </Button>
            )}
          </>
        }
      />

      {briefing.status === 'DRAFT' && (
        <div className="mb-4 rounded-card border border-surface-muted bg-surface-sidebar p-3 text-body-sm text-ink-secondary">
          This automation is in dry run — this briefing was not sent to anyone.
        </div>
      )}

      {pendingReview && (
        <div className="mb-4 rounded-card border border-warning-500/40 bg-warning-500/10 p-3 text-body-sm text-ink-primary">
          Waiting for your approval. Recipients have not received it yet.
        </div>
      )}

      {briefing.status === 'PUBLISHED' && briefing.publishedAt && (
        <div className="mb-4 flex items-center gap-1.5 text-body-sm text-ink-secondary">
          <CheckCircle2 className="h-3.5 w-3.5 text-success-500" />
          Published {format(new Date(briefing.publishedAt), 'd MMM yyyy HH:mm')}
        </div>
      )}

      {approveError && (
        <div className="mb-4 rounded-card border border-danger-500/30 bg-danger-500/5 p-3 text-body-sm text-danger-500">
          {approveError}
        </div>
      )}

      <article
        className="rounded-card border border-surface-muted bg-surface-card p-6"
        dangerouslySetInnerHTML={{ __html: briefing.html }}
      />

      {actionable.length > 0 && (
        <section className="mt-6 rounded-card border border-surface-muted bg-surface-card p-5">
          <h2 className="text-body font-semibold text-ink-primary">Take action</h2>
          <p className="mt-1 text-body-sm text-ink-secondary">
            Turn anything here into a to-do or a risk. Nothing is created automatically.
          </p>

          <ul className="mt-4 space-y-2">
            {actionable.map((finding) => {
              const done = promoted.has(finding.dedupeKey)
              return (
                <li
                  key={finding.dedupeKey}
                  className="flex items-center justify-between gap-3 rounded-card border border-surface-muted px-3 py-2"
                >
                  <span className="min-w-0 truncate text-body-sm text-ink-primary">{finding.title}</span>
                  {done ? (
                    <span className="flex shrink-0 items-center gap-1 text-body-sm text-success-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Created
                    </span>
                  ) : (
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => setPromoting(finding)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Create
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <PromoteFindingModal briefingId={briefing.id} finding={promoting} onClose={() => setPromoting(null)} />
    </div>
  )
}
