'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Sparkles, CheckCircle2, X, Loader2, RefreshCw, Trash2, AlertCircle, ArrowLeft, User } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'

interface PlanResponse {
  success: boolean
  data: {
    planId: string
    status: string
    provider: string
    modelId: string
    rationale: string
    subject: { id: string; name: string | null; email: string } | null
    sprint: { id: string; name: string; state: string; startDate: string; endDate: string }
    proposedTodos: Array<{
      id: string
      title: string
      description: string | null
      priority: string
      ambitionLevel: string | null
      progressValue: number | null
      dueDate: string | null
      taskType: string | null
      keyResult: {
        id: string
        title: string
        unit: string
        startValue: number
        targetValue: number
        currentValue: number
        objective: { id: string; title: string } | null
      } | null
      objectiveId: string | null
    }>
    carryover: Array<{
      id: string
      title: string
      disposition: string
      carryoverCount: number
      progressValue: number | null
      dueDate: string | null
    }>
    carryoverSummary: { total: number; kept: number; split: number; rescheduled: number; descoped: number; escalated: number } | null
  }
}

const DISPOSITION_BADGE: Record<string, string> = {
  KEEP: 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]',
  SPLIT: 'bg-[var(--ap-warn-bg)] text-[var(--ap-warn-fg)]',
  RESCHEDULE: 'bg-[var(--ap-bg-sunken)] text-[var(--ap-fg)]',
  DESCOPE: 'bg-[var(--ap-danger-bg)] text-[var(--ap-danger-fg)]',
  ESCALATE: 'bg-[var(--ap-ahead-bg)] text-[var(--ap-ahead-fg)]',
}

const PRIORITY_BADGE: Record<string, string> = {
  URGENT: 'bg-[var(--ap-danger-bg)] text-[var(--ap-danger-fg)]',
  HIGH: 'bg-[var(--ap-warn-bg)] text-[var(--ap-warn-fg)]',
  MEDIUM: 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]',
  LOW: 'bg-[var(--ap-bg-sunken)] text-[var(--ap-fg)]',
}

interface Props {
  planId: string
}

export function ReviewPlanClient({ planId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const qc = useQueryClient()
  const returnTo = searchParams.get('returnTo')

  const { data, isLoading, isError, refetch } = useQuery<PlanResponse>({
    queryKey: ['ai-plan', planId],
    queryFn: async () => {
      const res = await fetch(`/api/sprints/ai/${planId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load plan')
      return res.json()
    },
  })

  const [selectedTodoIds, setSelectedTodoIds] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState('')

  // Initialise the selection on first successful load (all by default).
  useMemo(() => {
    if (data?.data?.proposedTodos && selectedTodoIds.size === 0) {
      setSelectedTodoIds(new Set(data.data.proposedTodos.map((t) => t.id)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.data?.proposedTodos.length])

  const accept = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sprints/ai/${planId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todoIds: Array.from(selectedTodoIds) }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || `Accept failed (${res.status})`)
      return json.data as { sprintId: string }
    },
    onSuccess: ({ sprintId }) => {
      toast.success('Tasks added to the sprint board.')
      qc.invalidateQueries({ queryKey: ['sprints'] })
      qc.invalidateQueries({ queryKey: ['sprint-board', sprintId] })
      router.push(`/dashboard/sprints/${sprintId}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const discard = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sprints/ai/${planId}/discard`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || `Discard failed (${res.status})`)
    },
    onSuccess: () => {
      toast.success('Plan discarded')
      router.push('/dashboard/sprints')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const regenerate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sprints/ai/${planId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || `Regenerate failed (${res.status})`)
      return json.data as { planId: string }
    },
    onSuccess: ({ planId: newPlanId }) => {
      toast.success('Plan regenerated')
      router.push(`/dashboard/sprints/ai/${newPlanId}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6" aria-busy="true">
        <span className="sr-only">Loading plan…</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (isError || !data?.success) {
    return (
      <div className="p-8 text-[var(--ap-danger-fg)] flex items-center gap-2">
        <AlertCircle className="h-4 w-4" /> Failed to load plan.
        <button onClick={() => refetch()} className="ml-2 underline">Retry</button>
      </div>
    )
  }

  const plan = data.data
  const toggleAll = () => {
    if (selectedTodoIds.size === plan.proposedTodos.length) {
      setSelectedTodoIds(new Set())
    } else {
      setSelectedTodoIds(new Set(plan.proposedTodos.map((t) => t.id)))
    }
  }

  const backHref = returnTo ?? `/dashboard/sprints/${plan.sprint.id}`
  const backLabel = returnTo
    ? `Back to ${plan.sprint.name}`
    : 'Back to sprint board'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <Link
        href={backHref}
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
      </Link>

      <PageHeader
        title="Review AI Sprint Plan"
        description={`${plan.proposedTodos.length} new tasks · ${plan.carryover.length} carryovers · ${plan.provider}/${plan.modelId}`}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => discard.mutate()}
              disabled={discard.isPending}
              className="inline-flex items-center gap-1 rounded-[var(--ap-radius-sm)] border h-8 px-3 text-xs font-medium text-[var(--ap-danger-fg)]"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Discard
            </button>
            <button
              onClick={() => accept.mutate()}
              disabled={accept.isPending || selectedTodoIds.size === 0}
              className="inline-flex items-center gap-1 rounded-[var(--ap-radius-sm)] h-8 px-3 text-xs font-semibold disabled:opacity-50"
              style={{ background: 'var(--ap-ok)', color: 'var(--ap-accent-fg)' }}
            >
              {accept.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Accept ({selectedTodoIds.size})
            </button>
          </div>
        }
      />

      {/* Subject + sprint context */}
      <div
        className="mb-4 rounded-[12px] border p-4 text-body-sm"
        style={{ borderColor: 'var(--ap-border)', background: 'rgba(124 58 237 / 0.04)' }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: 'rgba(124 58 237 / 0.12)' }}
            >
              <User className="h-4 w-4 text-[var(--ap-ahead)]" />
            </div>
            <div>
              <div className="text-muted-foreground text-caption uppercase tracking-wide">Generated for</div>
              <div className="font-semibold text-sm">
                {plan.subject?.name ?? plan.subject?.email ?? 'Unknown user'}
              </div>
              {plan.subject?.email && plan.subject.name && (
                <div className="text-caption text-muted-foreground">{plan.subject.email}</div>
              )}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-muted-foreground text-caption uppercase tracking-wide">Sprint</div>
            <Link
              href={`/dashboard/sprints/${plan.sprint.id}`}
              className="font-medium hover:underline"
            >
              {plan.sprint.name}
            </Link>
          </div>
        </div>
      </div>

      {/* Sprint window */}
      <div className="mb-6 rounded-[12px] border p-4 text-body-sm" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="text-muted-foreground text-caption uppercase">Sprint window</div>
            <div>{fmt(plan.sprint.startDate)} → {fmt(plan.sprint.endDate)}</div>
          </div>
          {plan.carryoverSummary && (
            <div className="ml-auto flex items-center gap-2 text-caption">
              <span>{plan.carryoverSummary.total} carryover</span>
              {plan.carryoverSummary.kept > 0 && <Badge>K {plan.carryoverSummary.kept}</Badge>}
              {plan.carryoverSummary.split > 0 && <Badge>S {plan.carryoverSummary.split}</Badge>}
              {plan.carryoverSummary.rescheduled > 0 && <Badge>R {plan.carryoverSummary.rescheduled}</Badge>}
              {plan.carryoverSummary.descoped > 0 && <Badge>D {plan.carryoverSummary.descoped}</Badge>}
              {plan.carryoverSummary.escalated > 0 && <Badge>E {plan.carryoverSummary.escalated}</Badge>}
            </div>
          )}
        </div>
      </div>

      {/* Rationale */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Rationale
        </h2>
        <div className="rounded-[12px] border p-4 text-body-sm leading-relaxed whitespace-pre-wrap"
             style={{ borderColor: 'var(--ap-border)', background: 'rgba(124 58 237 / 0.03)' }}>
          {plan.rationale}
        </div>
      </section>

      {/* Carryover */}
      {plan.carryover.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Carried over from previous sprint
          </h2>
          <div className="space-y-2">
            {plan.carryover.map((c) => (
              <div key={c.id} className="rounded-[var(--ap-radius-sm)] border p-3 flex items-center justify-between gap-3 text-body-sm"
                   style={{ borderColor: 'var(--ap-border)' }}>
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.title}</div>
                  <div className="text-caption text-muted-foreground">
                    Carried {c.carryoverCount}× · due {fmt(c.dueDate)}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-micro font-medium ${DISPOSITION_BADGE[c.disposition] ?? 'bg-muted'}`}>
                  {c.disposition}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* New tasks */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Proposed new tasks ({plan.proposedTodos.length})
          </h2>
          <button onClick={toggleAll} className="text-caption underline text-muted-foreground">
            {selectedTodoIds.size === plan.proposedTodos.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="space-y-2">
          {plan.proposedTodos.map((t) => {
            const checked = selectedTodoIds.has(t.id)
            return (
              <label
                key={t.id}
                className="block rounded-[var(--ap-radius-sm)] border p-3 cursor-pointer transition"
                style={{
                  borderColor: checked ? 'rgb(16 185 129)' : 'var(--ap-border)',
                  background: checked ? 'rgba(16 185 129 / 0.04)' : 'transparent',
                }}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = new Set(selectedTodoIds)
                      if (next.has(t.id)) next.delete(t.id)
                      else next.add(t.id)
                      setSelectedTodoIds(next)
                    }}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-body-sm">{t.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-micro font-medium ${PRIORITY_BADGE[t.priority] ?? 'bg-muted'}`}>
                        {t.priority}
                      </span>
                      {t.ambitionLevel === 'STRETCH' && (
                        <span className="rounded-full bg-[var(--ap-ahead-bg)] px-2 py-0.5 text-micro font-medium text-[var(--ap-ahead-fg)]">
                          STRETCH
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
                    )}
                    {t.keyResult && (
                      <div className="mt-2 rounded-[8px] border-l-2 border-[var(--ap-accent)] bg-[var(--ap-accent-soft)] px-2 py-1.5 text-caption">
                        <div className="text-[var(--ap-accent-on-soft)]">
                          <span className="font-semibold">→ contributes</span>{' '}
                          {t.progressValue != null && (
                            <span className="font-mono">
                              +{t.progressValue}{t.keyResult.unit ? ` ${t.keyResult.unit}` : ''}{' '}
                            </span>
                          )}
                          to KR <span className="font-medium">{t.keyResult.title}</span>
                        </div>
                        <div className="mt-0.5 text-micro text-muted-foreground">
                          {t.keyResult.objective && (
                            <>Objective: {t.keyResult.objective.title} · </>
                          )}
                          KR progress: {t.keyResult.currentValue}/{t.keyResult.targetValue}
                          {t.keyResult.unit ? ` ${t.keyResult.unit}` : ''}
                        </div>
                      </div>
                    )}
                    <div className="mt-1 text-caption text-muted-foreground flex flex-wrap gap-3">
                      {t.dueDate && <span>Due {fmt(t.dueDate)}</span>}
                      {t.taskType && t.taskType !== 'GENERAL' && <span>{t.taskType}</span>}
                    </div>
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </section>

      {/* Regenerate */}
      <section className="rounded-[12px] border p-4" style={{ borderColor: 'var(--ap-border)' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Not happy? Regenerate with feedback
        </h2>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="e.g. Fewer marketing tasks, focus on product KRs, or less ambitious."
          className="w-full rounded-[var(--ap-radius-sm)] border p-2 text-body-sm min-h-[60px]"
          style={{ borderColor: 'var(--ap-border)' }}
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending || feedback.trim().length === 0}
            className="inline-flex items-center gap-1 rounded-[var(--ap-radius-sm)] border h-8 px-3 text-xs font-medium disabled:opacity-50"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            {regenerate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Regenerate
          </button>
        </div>
      </section>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-micro font-medium uppercase tracking-wide">
      {children}
    </span>
  )
}

function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
