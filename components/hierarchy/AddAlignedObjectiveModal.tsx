'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Target, ArrowDownRight, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui'
import { cn } from '@/lib/utils'

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
  ON_TRACK: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  AT_RISK:  'bg-amber-100 text-amber-700 ring-amber-200',
  OFF_TRACK:'bg-rose-100 text-rose-700 ring-rose-200',
}
const LABEL: Record<string, string> = {
  ON_TRACK: 'On Track', AT_RISK: 'At Risk', OFF_TRACK: 'Off Track',
}
const LEVEL_TONE: Record<string, string> = {
  COMPANY:    'bg-blue-50 text-blue-700 ring-blue-200',
  DEPARTMENT: 'bg-violet-50 text-violet-700 ring-violet-200',
  INDIVIDUAL: 'bg-slate-50 text-slate-700 ring-slate-200',
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
      iconClassName="text-blue-600"
      size="lg"
      scrollBehavior="internal"
      stickyHeader
    >
      <div className="flex flex-col gap-4">
        {/* Parent context */}
        <div className="rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 to-blue-50/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
            Parent objective {parentLevel ? `· ${parentLevel.toLowerCase()}` : ''}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">
            {parentTitle ?? '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            The selected objective will roll up under this one.
          </p>
        </div>

        {/* Create-new shortcut */}
        {onCreateNew && (
          <button
            type="button"
            onClick={() => { onCreateNew(); onClose() }}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/50"
          >
            <span className="flex size-9 items-center justify-center rounded-md bg-blue-600 text-white">
              <Plus className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">Create a new aligned objective</span>
              <span className="block text-xs text-slate-500">Opens the create form pre-linked to this parent.</span>
            </span>
          </button>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search existing objectives by title, owner, or department"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* List */}
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Available objectives
            </span>
            <span className="text-[11px] tabular-nums text-slate-500">
              {candidates.length}
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="size-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
              <Target className="size-6 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">
                {q ? 'No objectives match your search' : 'No unattached objectives in this timeframe'}
              </p>
              <p className="max-w-xs text-xs text-slate-500">
                Use the “Create a new aligned objective” option above to add one under this plan.
              </p>
            </div>
          ) : (
            <ul className="max-h-[340px] divide-y divide-slate-100 overflow-y-auto">
              {candidates.map((o) => {
                const selected = selectedId === o.id
                const tone = TONE[o.goalStatus ?? ''] ?? 'bg-slate-100 text-slate-600 ring-slate-200'
                const lvlTone = LEVEL_TONE[o.level] ?? 'bg-slate-50 text-slate-700 ring-slate-200'
                const pct = Math.round(o.progress ?? 0)
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(selected ? null : o.id)}
                      className={cn(
                        'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                        selected ? 'bg-blue-50' : 'hover:bg-slate-50'
                      )}
                    >
                      <span className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1',
                        selected ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-transparent ring-slate-300'
                      )}>
                        <Check className="size-3" />
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
                              'rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1',
                              tone
                            )}>
                              {LABEL[o.goalStatus] ?? o.goalStatus}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-slate-900">{o.title}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1 w-32 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-blue-600"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold tabular-nums text-slate-600">{pct}%</span>
                          {o.owner?.name && (
                            <span className="ml-auto truncate text-[11px] text-slate-500">{o.owner.name}</span>
                          )}
                          {o.department?.name && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
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
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedId || submitting}
            onClick={alignSelected}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity',
              !selectedId || submitting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
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
