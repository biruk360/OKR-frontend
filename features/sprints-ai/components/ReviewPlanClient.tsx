'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Sparkles, CheckCircle2, X, Loader2, RefreshCw, Trash2, AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

interface PlanResponse {
  success: boolean
  data: {
    planId: string
    status: string
    provider: string
    modelId: string
    rationale: string
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
      keyResult: { id: string; title: string; unit: string } | null
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
  KEEP: 'bg-blue-100 text-blue-900',
  SPLIT: 'bg-amber-100 text-amber-900',
  RESCHEDULE: 'bg-slate-100 text-slate-900',
  DESCOPE: 'bg-rose-100 text-rose-900',
  ESCALATE: 'bg-purple-100 text-purple-900',
}

const PRIORITY_BADGE: Record<string, string> = {
  URGENT: 'bg-rose-100 text-rose-900',
  HIGH: 'bg-amber-100 text-amber-900',
  MEDIUM: 'bg-sky-100 text-sky-900',
  LOW: 'bg-slate-100 text-slate-900',
}

interface Props {
  planId: string
}

export function ReviewPlanClient({ planId }: Props) {
  const router = useRouter()
  const qc = useQueryClient()

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
      toast.success('Sprint started!')
      qc.invalidateQueries({ queryKey: ['sprints'] })
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
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading plan…
      </div>
    )
  }
  if (isError || !data?.success) {
    return (
      <div className="p-8 text-rose-600 flex items-center gap-2">
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Review AI Sprint Plan"
        description={`Generated by ${plan.provider}/${plan.modelId} · ${plan.proposedTodos.length} new tasks · ${plan.carryover.length} carryovers`}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => discard.mutate()}
              disabled={discard.isPending}
              className="inline-flex items-center gap-1 rounded-[10px] border h-8 px-3 text-[12px] font-medium text-rose-600"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Discard
            </button>
            <button
              onClick={() => accept.mutate()}
              disabled={accept.isPending || selectedTodoIds.size === 0}
              className="inline-flex items-center gap-1 rounded-[10px] h-8 px-3 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              {accept.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Accept ({selectedTodoIds.size})
            </button>
          </div>
        }
      />

      {/* Sprint window */}
      <div className="mb-6 rounded-[12px] border p-4 text-[13px]" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="text-muted-foreground text-[11px] uppercase">Sprint window</div>
            <div>{fmt(plan.sprint.startDate)} → {fmt(plan.sprint.endDate)}</div>
          </div>
          {plan.carryoverSummary && (
            <div className="ml-auto flex items-center gap-2 text-[11px]">
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
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Rationale
        </h2>
        <div className="rounded-[12px] border p-4 text-[13px] leading-relaxed whitespace-pre-wrap"
             style={{ borderColor: 'var(--ap-border)', background: 'rgba(124 58 237 / 0.03)' }}>
          {plan.rationale}
        </div>
      </section>

      {/* Carryover */}
      {plan.carryover.length > 0 && (
        <section className="mb-6">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Carried over from previous sprint
          </h2>
          <div className="space-y-2">
            {plan.carryover.map((c) => (
              <div key={c.id} className="rounded-[10px] border p-3 flex items-center justify-between gap-3 text-[13px]"
                   style={{ borderColor: 'var(--ap-border)' }}>
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Carried {c.carryoverCount}× · due {fmt(c.dueDate)}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${DISPOSITION_BADGE[c.disposition] ?? 'bg-muted'}`}>
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
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Proposed new tasks ({plan.proposedTodos.length})
          </h2>
          <button onClick={toggleAll} className="text-[11px] underline text-muted-foreground">
            {selectedTodoIds.size === plan.proposedTodos.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="space-y-2">
          {plan.proposedTodos.map((t) => {
            const checked = selectedTodoIds.has(t.id)
            return (
              <label
                key={t.id}
                className="block rounded-[10px] border p-3 cursor-pointer transition"
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
                      <span className="font-medium text-[13px]">{t.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[t.priority] ?? 'bg-muted'}`}>
                        {t.priority}
                      </span>
                      {t.ambitionLevel === 'STRETCH' && (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-900">
                          STRETCH
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <div className="mt-1 text-[12px] text-muted-foreground">{t.description}</div>
                    )}
                    <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-3">
                      {t.keyResult && (
                        <span>
                          KR: {t.keyResult.title.slice(0, 40)}
                          {t.keyResult.title.length > 40 ? '…' : ''}
                          {' '}({t.progressValue ?? 0} {t.keyResult.unit})
                        </span>
                      )}
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
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Not happy? Regenerate with feedback
        </h2>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="e.g. Fewer marketing tasks, focus on product KRs, or less ambitious."
          className="w-full rounded-[10px] border p-2 text-[13px] min-h-[60px]"
          style={{ borderColor: 'var(--ap-border)' }}
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending || feedback.trim().length === 0}
            className="inline-flex items-center gap-1 rounded-[10px] border h-8 px-3 text-[12px] font-medium disabled:opacity-50"
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
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
      {children}
    </span>
  )
}

function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
