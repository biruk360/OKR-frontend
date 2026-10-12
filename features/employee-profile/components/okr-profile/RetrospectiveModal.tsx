'use client'

/**
 * PRF-10 "retrospective link": the closed objective's retrospective, read from
 * `GET /api/objectives/[id]/retrospective` (403 for redacted viewers). Stored
 * rich text renders through the shared DOMPurify allowlist (RichTextContent).
 */
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, BookOpen, ExternalLink } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import RichTextContent from '@/components/shared/RichTextContent'
import { formatGrade, humanizeEnum } from '@/components/shared/connections'
import { OUTCOME_LABELS, outcomeTone } from './okr-profile-utils'
import type { OkrProfilePastObjective } from './types'

interface Retrospective {
  whatWasAchieved: string
  whatWentWell: string | null
  whatBlockedUs: string | null
  whatWeLearned: string
  primaryBlocker: string | null
  wouldSetAgain: boolean | null
  wasAmbitious: boolean | null
  recommendedAction: string
  gradeRationale: string | null
}

async function fetchRetrospective(objectiveId: string): Promise<Retrospective | null> {
  const res = await fetch(`/api/objectives/${encodeURIComponent(objectiveId)}/retrospective`)
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: { retrospective: Retrospective | null }; error?: string }
    | null
  if (!res.ok || !json?.success) throw new Error(json?.error ?? 'Could not load the retrospective.')
  return json.data?.retrospective ?? null
}

function Field({ label, html }: { label: string; html: string | null | undefined }) {
  if (!html) return null
  return (
    <section className="space-y-1">
      <h4 className="text-caption font-semibold uppercase tracking-[0.6px] text-[var(--ap-fg-subtle)]">{label}</h4>
      <RichTextContent html={html} className="text-body-sm text-[var(--ap-fg)]" />
    </section>
  )
}

function yesNo(value: boolean | null): string | null {
  return value === null ? null : value ? 'Yes' : 'No'
}

export interface RetrospectiveModalProps {
  objective: OkrProfilePastObjective | null
  onClose: () => void
}

export function RetrospectiveModal({ objective, onClose }: RetrospectiveModalProps) {
  const id = objective?.id ?? null
  const query = useQuery({
    queryKey: ['objective-retrospective', id],
    queryFn: () => fetchRetrospective(id as string),
    enabled: !!id,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const retro = query.data

  return (
    <Modal
      open={!!objective}
      onClose={onClose}
      title={objective?.title ? `Retrospective — ${objective.title}` : 'Retrospective'}
      icon={BookOpen}
      size="lg"
      footer={
        objective ? (
          <Button variant="outline" asChild>
            <Link href={`/dashboard/objectives/${encodeURIComponent(objective.id)}`}>
              <ExternalLink aria-hidden />
              Open objective
            </Link>
          </Button>
        ) : undefined
      }
    >
      {objective && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <MiniBadge>{objective.timeframe.name}</MiniBadge>
          {objective.outcome && <MiniBadge tone={outcomeTone(objective.outcome)}>{OUTCOME_LABELS[objective.outcome] ?? objective.outcome}</MiniBadge>}
          {objective.finalGrade !== null && (
            <span className="font-mono text-caption tabular-nums text-[var(--ap-fg-muted)]">Grade {formatGrade(objective.finalGrade)}</span>
          )}
        </div>
      )}
      {query.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading retrospective">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : query.isError ? (
        <EmptyState icon={AlertTriangle} title="Could not load the retrospective" description={(query.error as Error).message} bare />
      ) : !retro ? (
        <EmptyState icon={BookOpen} title="No retrospective" description="This objective was closed without a written retrospective." bare />
      ) : (
        <div className="space-y-4">
          <Field label="What was achieved" html={retro.whatWasAchieved} />
          <Field label="What went well" html={retro.whatWentWell} />
          <Field label="What blocked us" html={retro.whatBlockedUs} />
          <Field label="What we learned" html={retro.whatWeLearned} />
          <Field label="Grade rationale" html={retro.gradeRationale} />
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-body-sm sm:grid-cols-2">
            {[
              ['Primary blocker', retro.primaryBlocker ? humanizeEnum(retro.primaryBlocker) : null],
              ['Recommended action', retro.recommendedAction ? humanizeEnum(retro.recommendedAction) : null],
              ['Would set again', yesNo(retro.wouldSetAgain)],
              ['Was ambitious', yesNo(retro.wasAmbitious)],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="text-[var(--ap-fg-muted)]">{label}</dt>
                  <dd className="font-medium text-[var(--ap-fg)]">{value}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </Modal>
  )
}
