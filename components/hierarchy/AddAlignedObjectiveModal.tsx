'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Target, ArrowDownRight, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'

interface Objective {
  id: string
  title: string
  level: 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL' | string
  progress: number
  goalStatus?: string
  parentObjectiveId?: string | null
  timeframeId?: string
  owner?: { id: string; name: string | null; avatar?: string | null }
  department?: { id: string; name: string } | null
  ancestorIds?: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  parentObjectiveId: string
  parentTitle?: string
  parentLevel?: string
  timeframeId: string
  /** Callback invoked after successful alignment — typically refetches the map. */
  onAligned?: () => void
  /** Callback to open the existing CreateObjectiveModal pre-filled with parentObjectiveId. */
  onCreateNew?: () => void
}

const TONE: Record<string, string> = {
  ON_TRACK: 'bg-success-100 text-success-700 ring-success-200',
  AT_RISK:  'bg-warning-100 text-warning-700 ring-warning-200',
  OFF_TRACK:'bg-danger-100 text-danger-700 ring-danger-200',
}
const LABEL: Record<string, string> = {
  ON_TRACK: 'On Track', AT_RISK: 'At Risk', OFF_TRACK: 'Off Track',
}
const LEVEL_TONE: Record<string, string> = {
  COMPANY:    'bg-primary-50 text-primary-700 ring-primary-200',
  DEPARTMENT: 'bg-primary-100 text-primary-800 ring-primary-300',
  INDIVIDUAL: 'bg-surface-hover text-ink-primary ring-ink-tertiary',
}

export function AddAlignedObjectiveModal({
  open, onClose, parentObjectiveId, parentTitle, parentLevel,
  timeframeId, onAligned, onCreateNew,
}: Props) {
  const [items, setItems] = useState<Objective[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Fetch all active objectives in this timeframe; we filter ineligible ones below.
  useEffect(() => {
    if (!open || !timeframeId) return
    setLoading(true)
    setSelectedId(null)
    setQ('')
    fetch(`/api/objectives?timeframeId=${timeframeId}&limit=500`)
      .then((r) => r.json())
      .then((j) => setItems(Array.isArray(j?.data) ? j.data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [open, timeframeId])

  // Compute the parent's full ancestor chain so we can prevent cycles.
  const ineligible = useMemo(() => {
    const banned = new Set<string>([parentObjectiveId])
    // Walk descendants of parent — anything below parent can't become parent's parent.
    const childrenOf = new Map<string, string[]>()
    for (const o of items) {
      if (!o.parentObjectiveId) continue
      if (!childrenOf.has(o.parentObjectiveId)) childrenOf.set(o.parentObjectiveId, [])
      childrenOf.get(o.parentObjectiveId)!.push(o.id)
    }
    const stack = [parentObjectiveId]
    while (stack.length) {
      const id = stack.pop()!
      for (const c of childrenOf.get(id) ?? []) {
        if (!banned.has(c)) { banned.add(c); stack.push(c) }
      }
    }
    return banned
  }, [items, parentObjectiveId])

  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((o) => {
      if (ineligible.has(o.id)) return false
      if (o.parentObjectiveId === parentObjectiveId) return false // already a child
      if (o.parentObjectiveId) return false // already aligned to someone else — pick re-parent path?
      if (!needle) return true
      return (
        o.title.toLowerCase().includes(needle) ||
        (o.owner?.name ?? '').toLowerCase().includes(needle) ||
        (o.department?.name ?? '').toLowerCase().includes(needle)
      )
    })
  }, [items, q, ineligible, parentObjectiveId])

  async function alignSelected() {
    if (!selectedId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/objectives/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentObjectiveId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j?.success === false) {
        throw new Error(j?.error || `Request failed (${res.status})`)
      }
      toast.success('Objective aligned')
      onAligned?.()
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to align objective')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Align an objective"
      icon={ArrowDownRight}
      iconClassName="text-primary-600"
      size="lg"
      scrollBehavior="internal"
      stickyHeader
    >
      <div className="flex flex-col gap-4">
        {/* Parent context */}
        <div className="rounded-lg border border-primary-100 bg-gradient-to-br from-primary-50 to-primary-50/40 p-3">
          <p className="text-micro font-bold uppercase tracking-widest text-primary-700">
            Parent objective {parentLevel ? `· ${parentLevel.toLowerCase()}` : ''}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-ink-primary">
            {parentTitle ?? '—'}
          </p>
          <p className="mt-1 text-xs text-ink-secondary">
            The selected objective will roll up under this one.
          </p>
        </div>

        {/* Create-new shortcut */}
        {onCreateNew && (
          <button
            type="button"
            onClick={() => { onCreateNew(); onClose() }}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-ink-tertiary bg-surface-card px-4 py-3 text-left transition-colors hover:border-primary-400 hover:bg-primary-50/50"
          >
            <span className="flex size-9 items-center justify-center rounded-md bg-primary-600 text-primary-foreground">
              <Plus className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink-primary">Create a new aligned objective</span>
              <span className="block text-xs text-ink-secondary">Opens the create form pre-linked to this parent.</span>
            </span>
          </button>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-secondary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search existing objectives by title, owner, or department"
            aria-label="Search existing objectives"
            className="w-full rounded-lg border border-ink-tertiary bg-surface-card py-2.5 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none ap-focus-ring"
          />
        </div>

        {/* List */}
        <div className="rounded-lg border border-surface-muted bg-surface-card">
          <div className="flex items-center justify-between border-b border-surface-muted px-3 py-1.5">
            <span className="text-micro font-bold uppercase tracking-widest text-ink-secondary">
              Available objectives
            </span>
            <span className="text-caption tabular-nums text-ink-secondary">
              {candidates.length}
            </span>
          </div>
          {loading ? (
            <div className="space-y-3 px-3 py-3" aria-busy="true" aria-label="Loading objectives">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="size-5 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
              <Target className="size-6 text-ink-tertiary" />
              <p className="text-sm font-medium text-ink-primary">
                {q ? 'No objectives match your search' : 'No unattached objectives in this timeframe'}
              </p>
              <p className="max-w-xs text-xs text-ink-secondary">
                Use the “Create a new aligned objective” option above to add one under this plan.
              </p>
            </div>
          ) : (
            <ul className="max-h-[340px] divide-y divide-surface-muted overflow-y-auto">
              {candidates.map((o) => {
                const selected = selectedId === o.id
                const tone = TONE[o.goalStatus ?? ''] ?? 'bg-surface-muted text-ink-secondary ring-ink-tertiary'
                const lvlTone = LEVEL_TONE[o.level] ?? 'bg-surface-hover text-ink-primary ring-ink-tertiary'
                const pct = Math.round(o.progress ?? 0)
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(selected ? null : o.id)}
                      aria-pressed={selected}
                      className={cn(
                        'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                        selected ? 'bg-primary-50' : 'hover:bg-surface-hover'
                      )}
                    >
                      <span className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1',
                        selected ? 'bg-primary-600 text-primary-foreground ring-primary-600' : 'bg-surface-card text-transparent ring-ink-tertiary'
                      )}>
                        <Check className="size-3" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ring-1',
                            lvlTone
                          )}>
                            {o.level.toLowerCase()}
                          </span>
                          {o.goalStatus && (
                            <span className={cn(
                              'rounded-full px-1.5 py-0.5 text-micro font-semibold ring-1',
                              tone
                            )}>
                              {LABEL[o.goalStatus] ?? o.goalStatus}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-ink-primary">{o.title}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1 w-32 overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className="h-full rounded-full bg-primary-600"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-caption font-semibold tabular-nums text-ink-secondary">{pct}%</span>
                          {o.owner?.name && (
                            <span className="ml-auto truncate text-caption text-ink-secondary">{o.owner.name}</span>
                          )}
                          {o.department?.name && (
                            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-micro font-medium text-ink-secondary">
                              {o.department.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ink-tertiary px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedId || submitting}
            onClick={alignSelected}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity',
              !selectedId || submitting ? 'bg-primary-600 opacity-50 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-700'
            )}
          >
            {submitting ? 'Aligning…' : (
              <>
                <ArrowDownRight className="size-3.5" />
                Align selected objective
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
