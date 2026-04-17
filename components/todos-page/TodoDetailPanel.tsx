'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  X,
  Link2,
  Target,
  Calendar,
  User as UserIcon,
  Trash2,
  Plus,
  MessageSquare,
  CheckCircle2,
  Pencil,
  Check,
  PanelRight,
  Maximize2,
} from 'lucide-react'
import type { TodoRow, UserOption, KrOption, ObjectiveOption } from './TodosPageClient'

interface DailyUpdate {
  id: string
  content: string
  status: string | null
  blockers: string | null
  updateDate: string
  author: { id: string; name: string; avatar: string | null } | null
}

interface Props {
  todo: TodoRow
  mode: 'modal' | 'sidebar'
  users: UserOption[]
  keyResults: KrOption[]
  objectives: ObjectiveOption[]
  currentUserId: string
  onClose: () => void
  onUpdate: (patch: Partial<TodoRow>) => void
  onDelete: () => void
  onToggleMode: () => void
}

export default function TodoDetailPanel({
  todo,
  mode,
  users,
  keyResults,
  objectives,
  currentUserId,
  onClose,
  onUpdate,
  onDelete,
  onToggleMode,
}: Props) {
  const [descDraft, setDescDraft] = useState(todo.description || '')
  const [editingDesc, setEditingDesc] = useState(false)
  const [updates, setUpdates] = useState<DailyUpdate[]>([])
  const [updateDraft, setUpdateDraft] = useState('')
  const [loadingUpdates, setLoadingUpdates] = useState(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Fetch daily updates
  useEffect(() => {
    setLoadingUpdates(true)
    fetch(`/api/initiatives/${todo.id}/updates`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setUpdates(data.data) })
      .catch(() => {})
      .finally(() => setLoadingUpdates(false))
  }, [todo.id])

  const saveDesc = useCallback(async () => {
    setEditingDesc(false)
    if (descDraft === (todo.description || '')) return
    onUpdate({ description: descDraft })
    try {
      await fetch(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: descDraft }),
      })
    } catch { toast.error('Failed to save description') }
  }, [descDraft, todo.id, todo.description, onUpdate])

  async function postDailyUpdate() {
    if (!updateDraft.trim()) return
    try {
      const res = await fetch(`/api/initiatives/${todo.id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: updateDraft.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setUpdates((prev) => [data.data, ...prev])
      setUpdateDraft('')
      toast.success('Daily update saved')
    } catch (err: any) {
      toast.error(err.message || 'Failed')
    }
  }

  async function patchField(field: string, value: any) {
    onUpdate({ [field]: value } as any)
    try {
      await fetch(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
    } catch { toast.error('Failed to update') }
  }

  const isDone = todo.status === 'COMPLETED'

  const containerClass = mode === 'sidebar'
    ? 'fixed inset-y-0 right-0 z-50 w-[480px] max-w-full bg-card shadow-[-4px_0_24px_rgba(9,30,66,0.15)] flex flex-col '
    : 'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[5vh] '

  const innerClass = mode === 'sidebar'
    ? 'flex-1 overflow-y-auto'
    : 'w-full max-w-[640px] rounded-lg border border-border bg-card'

  const panel = (
    <div className={mode === 'modal' ? innerClass : undefined} onClick={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="checkbox"
            checked={isDone}
            onChange={() => patchField('status', isDone ? 'PENDING' : 'COMPLETED')}
            className="appearance-none w-3.5 h-3.5 rounded border border-border"
          />
          <h2 className={`text-base font-semibold truncate ${isDone ? 'line-through text-muted-foreground' : ''}`}>
            {todo.title}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleMode}
            className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title={mode === 'modal' ? 'Switch to sidebar' : 'Switch to modal'}
          >
            {mode === 'modal' ? <PanelRight className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button onClick={onClose} className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* Meta chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center h-5 px-1.5 text-xs font-medium rounded" title={`Assigned to ${todo.assignee.name}`}>
            <UserIcon className="h-3 w-3" /> {todo.assignee.name}
          </span>
          {todo.keyResult && (
            <Link href={`/dashboard/key-results/${todo.keyResult.id}`} className="inline-flex items-center h-5 px-1.5 text-xs font-medium rounded" data-tone="primary">
              <Link2 className="h-3 w-3" /> {todo.keyResult.title}
            </Link>
          )}
          {todo.objective && (
            <Link href={`/dashboard/objectives/${todo.objective.id}`} className="inline-flex items-center h-5 px-1.5 text-xs font-medium rounded" data-tone="primary">
              <Target className="h-3 w-3" /> {todo.objective.title}
            </Link>
          )}
          {todo.dueDate && (
            <span className="inline-flex items-center h-5 px-1.5 text-xs font-medium rounded">
              <Calendar className="h-3 w-3" />
              {new Date(todo.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <StatusLozenge status={todo.status} />
        </div>

        {/* Description */}
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Description</h4>
          {editingDesc ? (
            <div>
              <textarea
                autoFocus
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                className="input min-h-[80px]"
                placeholder="Add details..."
              />
              <div className="mt-1 flex gap-1">
                <button onClick={saveDesc} className="btn-outline btn-primary btn-sm">Save</button>
                <button onClick={() => { setDescDraft(todo.description || ''); setEditingDesc(false) }} className="btn-outline btn-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingDesc(true)}
              className="w-full rounded px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-muted"
            >
              {todo.description || 'Click to add a description...'}
            </button>
          )}
        </section>

        {/* Daily Update (mandatory) */}
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
            <Pencil className="h-3 w-3" /> Daily Update
          </h4>
          <div className="flex gap-2 mb-3">
            <textarea
              value={updateDraft}
              onChange={(e) => setUpdateDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); postDailyUpdate() }
              }}
              rows={2}
              className="input flex-1 min-h-[48px]"
              placeholder="What did you do on this today?"
            />
            {updateDraft.trim() && (
              <button onClick={postDailyUpdate} className="btn-outline btn-primary self-end">
                Post
              </button>
            )}
          </div>

          {loadingUpdates ? (
            <p className="text-xs text-muted-foreground">Loading updates...</p>
          ) : updates.length === 0 ? (
            <p className="text-xs text-muted-foreground">No daily updates yet.</p>
          ) : (
            <ul className="space-y-2 max-h-[200px] overflow-y-auto">
              {updates.map((u) => (
                <li key={u.id} className="flex gap-2 text-[13px]">
                  <div className="inline-flex items-center justify-center size-6 rounded-full bg-muted text-xs font-semibold mt-0.5">
                    {u.author?.name?.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-foreground">{u.author?.name ?? 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground">{u.updateDate}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-foreground">{u.content}</p>
                    {u.blockers && (
                      <p className="mt-0.5 text-[12px] text-destructive">Blocker: {u.blockers}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Actions */}
        <section className="border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={todo.status}
              onChange={(e) => patchField('status', e.target.value)}
              className="input input w-auto"
            >
              <option value="PENDING">To do</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Done</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <button
              onClick={() => {
                if (confirm('Delete this to-do?')) {
                  onDelete()
                  onClose()
                }
              }}
              className="btn-outline btn-outline text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </section>
      </div>
    </div>
  )

  if (mode === 'sidebar') {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
        <div className={containerClass}>{panel}</div>
      </>
    )
  }

  return (
    <div className={containerClass} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ boxShadow: '0 4px 8px -2px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.08)' }}>
        {panel}
      </div>
    </div>
  )
}

function StatusLozenge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    PENDING: { label: 'To do', tone: '' },
    IN_PROGRESS: { label: 'In progress', tone: 'primary' },
    COMPLETED: { label: 'Done', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'danger' },
  }
  const v = map[status] ?? { label: status, tone: '' }
  return (
    <span className="inline-flex items-center h-4 px-1 text-[11px] font-bold uppercase rounded" data-tone={v.tone || undefined}>
      {v.label}
    </span>
  )
}
