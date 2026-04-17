'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Plus, X, MoreHorizontal, Link2, ArrowLeft, Trash2, Check, MessageSquare, CheckSquare, Target, CheckCircle2 } from 'lucide-react'
import SprintCardModal, { type ObjectiveOption, type KrOption } from './SprintCardModal'

interface Owner {
  id: string
  name: string
  avatar: string | null
}

interface KrLink {
  id: string
  title: string
  objective: { id: string; title: string }
}

export interface SprintBoardActivity {
  id: string
  title: string
  description: string | null
  ownerId: string
  owner: Owner
  keyResultId: string | null
  keyResult: KrLink | null
  objectiveId: string | null
  objective: { id: string; title: string } | null
  convertedInitiativeId: string | null
  dueDate: string | null
  position: number
  columnId: string
  commentCount: number
  tasksTotal: number
  tasksCompleted: number
}

export interface SprintBoardColumn {
  id: string
  name: string
  color: string | null
  position: number
  activities: SprintBoardActivity[]
}

export interface SprintBoardData {
  id: string
  name: string
  description: string | null
  ownerName: string
  columns: SprintBoardColumn[]
}

interface Props {
  initial: SprintBoardData
  users: Owner[]
  keyResults: KrLink[]
  objectives: ObjectiveOption[]
  currentUserId: string
}

export default function SprintBoardClient({ initial, users, keyResults, objectives, currentUserId }: Props) {
  const [board, setBoard] = useState<SprintBoardData>(initial)
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [editingColumn, setEditingColumn] = useState<string | null>(null)
  const [editingColumnName, setEditingColumnName] = useState('')
  const [addingCardCol, setAddingCardCol] = useState<string | null>(null)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const draggedRef = useRef<{ activityId: string; fromColumnId: string } | null>(null)

  // Helper: update activity anywhere in the board
  function patchActivity(actId: string, patch: Partial<SprintBoardActivity>) {
    setBoard((b) => ({
      ...b,
      columns: b.columns.map((c) => ({
        ...c,
        activities: c.activities.map((a) => (a.id === actId ? { ...a, ...patch } : a)),
      })),
    }))
  }

  function findActivity(actId: string): { activity: SprintBoardActivity; columnId: string } | null {
    for (const col of board.columns) {
      const activity = col.activities.find((a) => a.id === actId)
      if (activity) return { activity, columnId: col.id }
    }
    return null
  }

  // ---------- Mutations (optimistic) ----------

  async function addColumn() {
    const name = newColumnName.trim()
    if (!name) return
    try {
      const res = await fetch(`/api/sprints/${board.id}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      setBoard((b) => ({ ...b, columns: [...b.columns, { ...data.data, activities: [] }] }))
      setNewColumnName('')
      setAddingColumn(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to add column')
    }
  }

  async function renameColumn(colId: string) {
    const name = editingColumnName.trim()
    if (!name) return
    const previous = board.columns.find((c) => c.id === colId)?.name || ''
    setBoard((b) => ({
      ...b,
      columns: b.columns.map((c) => (c.id === colId ? { ...c, name } : c)),
    }))
    setEditingColumn(null)
    try {
      const res = await fetch(`/api/sprints/${board.id}/columns/${colId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
    } catch (err: any) {
      // rollback
      setBoard((b) => ({
        ...b,
        columns: b.columns.map((c) => (c.id === colId ? { ...c, name: previous } : c)),
      }))
      toast.error(err.message || 'Failed to rename column')
    }
  }

  async function deleteColumn(colId: string) {
    if (!confirm('Delete this column and all its cards?')) return
    const snapshot = board.columns
    setBoard((b) => ({ ...b, columns: b.columns.filter((c) => c.id !== colId) }))
    try {
      const res = await fetch(`/api/sprints/${board.id}/columns/${colId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
    } catch (err: any) {
      setBoard((b) => ({ ...b, columns: snapshot }))
      toast.error(err.message || 'Failed to delete column')
    }
  }

  async function addCard(colId: string) {
    const title = newCardTitle.trim()
    if (!title) return
    try {
      const res = await fetch(`/api/sprints/${board.id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, columnId: colId, ownerId: currentUserId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      const withDefaults: SprintBoardActivity = {
        ...data.data,
        columnId: colId,
        commentCount: 0,
        tasksTotal: 0,
        tasksCompleted: 0,
        convertedInitiativeId: null,
        objectiveId: data.data.objectiveId || null,
        objective: data.data.objective || null,
      }
      setBoard((b) => ({
        ...b,
        columns: b.columns.map((c) =>
          c.id === colId ? { ...c, activities: [...c.activities, withDefaults] } : c
        ),
      }))
      setNewCardTitle('')
      setAddingCardCol(null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to add card')
    }
  }

  async function deleteCard(colId: string, actId: string) {
    const snapshot = board.columns
    setBoard((b) => ({
      ...b,
      columns: b.columns.map((c) =>
        c.id === colId ? { ...c, activities: c.activities.filter((a) => a.id !== actId) } : c
      ),
    }))
    try {
      const res = await fetch(`/api/sprints/${board.id}/activities/${actId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
    } catch (err: any) {
      setBoard((b) => ({ ...b, columns: snapshot }))
      toast.error(err.message || 'Failed to delete')
    }
  }

  async function updateCard(actId: string, patch: Partial<SprintBoardActivity>) {
    const snapshot = board.columns
    setBoard((b) => ({
      ...b,
      columns: b.columns.map((c) => ({
        ...c,
        activities: c.activities.map((a) => (a.id === actId ? { ...a, ...patch } : a)),
      })),
    }))
    try {
      const res = await fetch(`/api/sprints/${board.id}/activities/${actId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      // Refresh card with returned (joined) shape
      setBoard((b) => ({
        ...b,
        columns: b.columns.map((c) => ({
          ...c,
          activities: c.activities.map((a) => (a.id === actId ? { ...a, ...data.data, columnId: a.columnId } : a)),
        })),
      }))
    } catch (err: any) {
      setBoard((b) => ({ ...b, columns: snapshot }))
      toast.error(err.message || 'Failed to update')
    }
  }

  // ---------- Drag and drop ----------

  const onDragStart = useCallback((activityId: string, fromColumnId: string) => {
    draggedRef.current = { activityId, fromColumnId }
  }, [])

  const onDragEnd = useCallback(() => {
    draggedRef.current = null
  }, [])

  const onDropOnColumn = useCallback(
    async (targetColumnId: string) => {
      const dragged = draggedRef.current
      if (!dragged) return
      draggedRef.current = null
      if (dragged.fromColumnId === targetColumnId) return

      const snapshot = board.columns
      // Find the source card outside of the .map() closure so TS narrowing holds.
      const fromCol = board.columns.find((c) => c.id === dragged.fromColumnId)
      const movedActivity = fromCol?.activities.find((a) => a.id === dragged.activityId)
      if (!movedActivity) return

      const next = board.columns.map((c) => {
        if (c.id === dragged.fromColumnId) {
          return { ...c, activities: c.activities.filter((a) => a.id !== dragged.activityId) }
        }
        return c
      })
      const targetIndex = next.findIndex((c) => c.id === targetColumnId)
      if (targetIndex === -1) return
      const targetCol = next[targetIndex]
      const newPosition = targetCol.activities.length
      const updatedActivity: SprintBoardActivity = { ...movedActivity, columnId: targetColumnId, position: newPosition }
      next[targetIndex] = {
        ...targetCol,
        activities: [...targetCol.activities, updatedActivity],
      }
      setBoard((b) => ({ ...b, columns: next }))

      try {
        const res = await fetch(`/api/sprints/${board.id}/activities/${dragged.activityId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columnId: targetColumnId, position: newPosition }),
        })
        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      } catch (err: any) {
        setBoard((b) => ({ ...b, columns: snapshot }))
        toast.error(err.message || 'Failed to move card')
      }
    },
    [board.columns, board.id]
  )

  // ---------- Render ----------

  return (
    <div className=" min-h-screen">
      <div className="px-6 py-4 border-b border-[color:var(--border-t border-border)]">
        <Link href="/dashboard/sprints" className="inline-flex items-center gap-1 text-[12px] text-[color:var(--text-xs text-muted-foreground)] hover:text-[color:var(--text-sm)]">
          <ArrowLeft className="h-3 w-3" /> All sprints
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{board.name}</h1>
            {board.description && <p className="text-sm text-muted-foreground mt-1">{board.description}</p>}
            <p className="text-xs text-muted-foreground mt-1">Owner · {board.ownerName}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 overflow-x-auto">
        <div className="flex items-start gap-3 min-w-max">
          {board.columns.map((col) => (
            <div
              key={col.id}
              className="w-[280px] flex-shrink-0 rounded-md bg-[color:#fafafa] border border-[color:var(--border-t border-border)]"
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDrop={(e) => { e.preventDefault(); onDropOnColumn(col.id) }}
            >
              {/* Column header */}
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[color:var(--border-t border-border)]">
                {col.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />}
                {editingColumn === col.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editingColumnName}
                    onChange={(e) => setEditingColumnName(e.target.value)}
                    onBlur={() => renameColumn(col.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renameColumn(col.id)
                      if (e.key === 'Escape') setEditingColumn(null)
                    }}
                    className="input h-6 text-[13px] font-semibold"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditingColumn(col.id); setEditingColumnName(col.name) }}
                    className="text-[13px] font-semibold text-[color:var(--text-sm)] hover:underline"
                    title="Click to rename"
                  >
                    {col.name}
                  </button>
                )}
                <span className="ml-1 inline-flex h-4 min-w-[18px] items-center justify-center rounded-sm bg-[color:#f9fafb] px-1 text-[10px] font-semibold text-[color:var(--text-sm text-muted-foreground)]">
                  {col.activities.length}
                </span>
                <button
                  type="button"
                  onClick={() => deleteColumn(col.id)}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer ml-auto"
                  aria-label="Delete column"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              {/* Cards */}
              <div className="space-y-1.5 p-2 min-h-[40px]">
                {col.activities.map((act) => (
                  <BoardCard
                    key={act.id}
                    activity={act}
                    onDragStart={() => onDragStart(act.id, col.id)}
                    onDragEnd={onDragEnd}
                    onOpen={() => setOpenCardId(act.id)}
                  />
                ))}

                {/* Add card */}
                {addingCardCol === col.id ? (
                  <div className="rounded-md border border-[color:#e5e7eb] bg-card p-2">
                    <textarea
                      autoFocus
                      value={newCardTitle}
                      onChange={(e) => setNewCardTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCard(col.id) }
                        if (e.key === 'Escape') { setAddingCardCol(null); setNewCardTitle('') }
                      }}
                      placeholder="Enter activity title…"
                      rows={2}
                      className="w-full resize-none bg-transparent text-[13px] text-[color:var(--text-sm)] placeholder:text-[color:var(--text-xs text-muted-foreground)] focus:outline-none"
                    />
                    <div className="mt-1 flex items-center gap-1">
                      <button onClick={() => addCard(col.id)} className="btn-outline btn-primary">Add card</button>
                      <button
                        onClick={() => { setAddingCardCol(null); setNewCardTitle('') }}
                        className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingCardCol(col.id)}
                    className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-[12px] text-[color:var(--text-xs text-muted-foreground)] hover:bg-[color:#f9fafb] hover:text-[color:var(--text-sm)]"
                  >
                    <Plus className="h-3 w-3" /> Add card
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Add column */}
          <div className="w-[280px] flex-shrink-0">
            {addingColumn ? (
              <div className="rounded-md border border-[color:var(--border-t border-border)] bg-[color:#fafafa] p-2">
                <input
                  autoFocus
                  type="text"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addColumn()
                    if (e.key === 'Escape') { setAddingColumn(false); setNewColumnName('') }
                  }}
                  className="input"
                  placeholder="Column name"
                />
                <div className="mt-1 flex items-center gap-1">
                  <button onClick={addColumn} className="btn-outline btn-primary">Add column</button>
                  <button onClick={() => { setAddingColumn(false); setNewColumnName('') }} className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingColumn(true)}
                className="flex w-full items-center gap-1 rounded-md border border-dashed border-[color:#e5e7eb] bg-transparent px-3 py-2 text-[13px] text-[color:var(--text-xs text-muted-foreground)] hover:bg-[color:#f9fafb] hover:text-[color:var(--text-sm)]"
              >
                <Plus className="h-3.5 w-3.5" /> Add column
              </button>
            )}
          </div>
        </div>
      </div>

      {openCardId && (() => {
        const found = findActivity(openCardId)
        if (!found) return null
        return (
          <SprintCardModal
            sprintId={board.id}
            activity={found.activity}
            users={users}
            keyResults={keyResults as KrOption[]}
            objectives={objectives}
            currentUserId={currentUserId}
            onClose={() => setOpenCardId(null)}
            onUpdateActivity={(patch) => updateCard(openCardId, patch)}
            onDeleteActivity={() => deleteCard(found.columnId, openCardId)}
            onTasksChanged={(total, completed) =>
              patchActivity(openCardId, { tasksTotal: total, tasksCompleted: completed })
            }
            onCommentsChanged={(total) => patchActivity(openCardId, { commentCount: total })}
            onConverted={(initiativeId) =>
              patchActivity(openCardId, { convertedInitiativeId: initiativeId })
            }
          />
        )
      })()}
    </div>
  )
}

function BoardCard({
  activity,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  activity: SprintBoardActivity
  onDragStart: () => void
  onDragEnd: () => void
  onOpen: () => void
}) {
  const hasTasks = activity.tasksTotal > 0
  const allTasksDone = hasTasks && activity.tasksCompleted === activity.tasksTotal

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', activity.id); onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className="group rounded-md border border-[color:#e5e7eb] bg-card p-2 shadow-[0_1px_0_rgba(15,15,15,0.04)] cursor-pointer hover:border-[color:#d1d5db] transition"
    >
      <div className="text-[13px] text-[color:var(--text-sm)] whitespace-pre-wrap break-words">
        {activity.title}
      </div>

      {(activity.keyResult || activity.objective) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {activity.keyResult && (
            <span className="inline-flex items-center h-5 px-1.5 text-xs font-medium rounded bg-muted text-muted-foreground" data-tone="blue" title={activity.keyResult.objective.title}>
              <Link2 className="h-3 w-3" />
              <span className="truncate max-w-[160px]">{activity.keyResult.title}</span>
            </span>
          )}
          {activity.objective && !activity.keyResult && (
            <span className="inline-flex items-center h-5 px-1.5 text-xs font-medium rounded bg-muted text-muted-foreground" data-tone="blue">
              <Target className="h-3 w-3" />
              <span className="truncate max-w-[160px]">{activity.objective.title}</span>
            </span>
          )}
        </div>
      )}

      {/* Badges row */}
      <div className="mt-2 flex items-center gap-2">
        <span className="inline-flex items-center justify-center size-5 rounded-full bg-muted text-xs font-semibold" title={`Owner · ${activity.owner.name}`}>
          {activity.owner.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={activity.owner.avatar} alt="" />
          ) : (
            activity.owner.name?.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
          )}
        </span>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-[color:var(--text-xs text-muted-foreground)]">
          {activity.convertedInitiativeId && (
            <span title="Converted to Initiative" className="text-[color:#059669]">
              <CheckCircle2 className="h-3 w-3" />
            </span>
          )}
          {activity.commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title={`${activity.commentCount} comment(s)`}>
              <MessageSquare className="h-3 w-3" />
              {activity.commentCount}
            </span>
          )}
          {hasTasks && (
            <span
              className={`inline-flex items-center gap-0.5 ${allTasksDone ? 'text-[color:#059669]' : ''}`}
              title={`${activity.tasksCompleted}/${activity.tasksTotal} tasks`}
            >
              <CheckSquare className="h-3 w-3" />
              {activity.tasksCompleted}/{activity.tasksTotal}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
