'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Target, ListTodo, GripVertical } from 'lucide-react'
import toast from 'react-hot-toast'

type ColumnKey = 'TODO' | 'IN_PROGRESS' | 'DONE'

interface KanbanInitiative {
  id: string
  title: string
  /** Underlying Todo.status — drives both the column and the PATCH payload. */
  status: string
  keyResultId?: string | null
}

interface KanbanKeyResult {
  id: string
  title: string
  progress: number
  confidence: string
  status: string
}

export interface WorkItemsKanbanProps {
  keyResults?: KanbanKeyResult[]
  initiatives?: KanbanInitiative[]
  title?: string
}

interface WorkItem {
  id: string
  raw: string // underlying entity id (no prefix)
  title: string
  kind: 'KR' | 'INITIATIVE'
  column: ColumnKey
  href: string
  meta?: string
}

const COLUMN_TO_TODO_STATUS: Record<ColumnKey, 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'> = {
  TODO: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'COMPLETED',
}

function todoStatusToColumn(status: string): ColumnKey {
  if (status === 'COMPLETED') return 'DONE'
  if (status === 'IN_PROGRESS') return 'IN_PROGRESS'
  return 'TODO'
}

function krToColumn(kr: KanbanKeyResult): ColumnKey {
  if (kr.progress >= 100 || kr.status === 'ARCHIVED') return 'DONE'
  if (kr.progress > 0) return 'IN_PROGRESS'
  return 'TODO'
}

/**
 * Three-column board (To Do · In Progress · Done) folding KR and initiative
 * work into a single view. Initiatives are draggable between columns —
 * dropping into a new column PATCHes Todo.status. KR cards are read-only;
 * their column is computed from progress/status.
 */
export default function WorkItemsKanban({
  keyResults = [],
  initiatives = [],
  title = 'Work items',
}: WorkItemsKanbanProps) {
  const router = useRouter()
  const [localInitiatives, setLocalInitiatives] = useState<KanbanInitiative[]>(initiatives)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverColumn, setHoverColumn] = useState<ColumnKey | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const items: WorkItem[] = useMemo(() => {
    const out: WorkItem[] = []
    for (const kr of keyResults) {
      if (kr.status === 'DELETED') continue
      out.push({
        id: `kr:${kr.id}`,
        raw: kr.id,
        title: kr.title,
        kind: 'KR',
        column: krToColumn(kr),
        href: `/dashboard/key-results/${kr.id}`,
        meta: `${Math.round(kr.progress)}% · ${kr.confidence.replace(/_/g, ' ').toLowerCase()}`,
      })
    }
    for (const t of localInitiatives) {
      if (t.status === 'CANCELLED') continue
      out.push({
        id: `i:${t.id}`,
        raw: t.id,
        title: t.title,
        kind: 'INITIATIVE',
        column: todoStatusToColumn(t.status),
        href: t.keyResultId ? `/dashboard/key-results/${t.keyResultId}` : '/dashboard/todos',
        meta: t.status.replace(/_/g, ' ').toLowerCase(),
      })
    }
    return out
  }, [keyResults, localInitiatives])

  const columns: Array<{ key: ColumnKey; label: string; tint: string; ring: string }> = [
    { key: 'TODO', label: 'To do', tint: 'bg-slate-50 border-slate-200', ring: 'ring-slate-400' },
    { key: 'IN_PROGRESS', label: 'In progress', tint: 'bg-amber-50 border-amber-200', ring: 'ring-amber-400' },
    { key: 'DONE', label: 'Done', tint: 'bg-emerald-50 border-emerald-200', ring: 'ring-emerald-400' },
  ]

  async function moveInitiative(initiativeId: string, toColumn: ColumnKey) {
    const item = localInitiatives.find((i) => i.id === initiativeId)
    if (!item) return
    if (todoStatusToColumn(item.status) === toColumn) return
    const newStatus = COLUMN_TO_TODO_STATUS[toColumn]

    // Optimistic update.
    const prev = localInitiatives
    setLocalInitiatives((cur) => cur.map((i) => (i.id === initiativeId ? { ...i, status: newStatus } : i)))
    setSavingId(initiativeId)
    try {
      const res = await fetch(`/api/todos/${initiativeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          ...(newStatus === 'COMPLETED' ? { completedAt: new Date().toISOString() } : { completedAt: null }),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setLocalInitiatives(prev)
        toast.error(json.error || 'Could not update status')
      } else {
        toast.success(`Moved to ${toColumn === 'DONE' ? 'Done' : toColumn === 'IN_PROGRESS' ? 'In progress' : 'To do'}`)
        // Refresh the server component so KR progress / parent objective refreshes too.
        router.refresh()
      }
    } catch {
      setLocalInitiatives(prev)
      toast.error('Network error — change reverted')
    } finally {
      setSavingId(null)
    }
  }

  function onDragStart(e: React.DragEvent, item: WorkItem) {
    if (item.kind !== 'INITIATIVE') {
      e.preventDefault()
      return
    }
    setDraggingId(item.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', item.id)
  }
  function onDragEnd() {
    setDraggingId(null)
    setHoverColumn(null)
  }
  function onDragOver(e: React.DragEvent, col: ColumnKey) {
    if (!draggingId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (hoverColumn !== col) setHoverColumn(col)
  }
  function onDrop(e: React.DragEvent, col: ColumnKey) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || draggingId
    if (!id || !id.startsWith('i:')) return
    const initiativeId = id.slice(2)
    setHoverColumn(null)
    setDraggingId(null)
    moveInitiative(initiativeId, col)
  }

  return (
    <section className="bg-white shadow rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{title}</h3>
        <span className="text-xs text-gray-500">Drag initiatives to change status</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {columns.map((col) => {
          const colItems = items.filter((i) => i.column === col.key)
          const isHover = hoverColumn === col.key && draggingId !== null
          return (
            <div
              key={col.key}
              onDragOver={(e) => onDragOver(e, col.key)}
              onDragLeave={() => hoverColumn === col.key && setHoverColumn(null)}
              onDrop={(e) => onDrop(e, col.key)}
              className={`rounded-md border ${col.tint} p-2 min-h-[160px] transition-shadow ${
                isHover ? `ring-2 ${col.ring} ring-offset-1` : ''
              }`}
            >
              <div className="flex items-baseline justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-700">{col.label}</h4>
                <span className="text-xs text-gray-500 tabular-nums">{colItems.length}</span>
              </div>
              {colItems.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 text-center">
                  {isHover ? 'Drop here' : 'No items'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {colItems.map((it) => {
                    const Icon = it.kind === 'KR' ? Target : ListTodo
                    const chipColour =
                      it.kind === 'KR'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    const isSaving = savingId === it.raw
                    const isDragging = draggingId === it.id
                    return (
                      <li
                        key={it.id}
                        draggable={it.kind === 'INITIATIVE'}
                        onDragStart={(e) => onDragStart(e, it)}
                        onDragEnd={onDragEnd}
                        className={`group rounded-md bg-white border border-gray-200 p-2 text-sm transition-all ${
                          it.kind === 'INITIATIVE' ? 'cursor-grab active:cursor-grabbing hover:border-gray-300 hover:shadow-sm' : ''
                        } ${isDragging ? 'opacity-40' : ''} ${isSaving ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {it.kind === 'INITIATIVE' && (
                            <GripVertical className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-400 shrink-0" />
                          )}
                          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${chipColour}`}>
                            <Icon className="h-3 w-3" />
                            {it.kind === 'KR' ? 'KR' : 'Init'}
                          </span>
                          {it.meta && (
                            <span className="text-[10px] text-gray-500 uppercase tracking-wide truncate">{it.meta}</span>
                          )}
                        </div>
                        <Link
                          href={it.href}
                          className="block text-sm text-gray-800 hover:text-blue-600 line-clamp-2"
                          onClick={(e) => { if (isDragging) e.preventDefault() }}
                        >
                          {it.title}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
