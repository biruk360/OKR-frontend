'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  X,
  Link2,
  Target,
  User as UserIcon,
  Calendar,
  Trash2,
  Plus,
  CheckCircle2,
  MessageSquare,
  ArrowRight,
  Check,
  Pencil,
} from 'lucide-react'
import type { SprintBoardActivity } from './SprintBoardClient'

export interface Owner {
  id: string
  name: string
  avatar: string | null
}

export interface KrOption {
  id: string
  title: string
  objective: { id: string; title: string }
}

export interface ObjectiveOption {
  id: string
  title: string
  level: string
}

export interface Comment {
  id: string
  content: string
  author: Owner | null
  createdAt: string
  updatedAt: string
}

export interface SubTask {
  id: string
  title: string
  status: 'PENDING' | 'COMPLETED' | string
  assignee: Owner | null
  assigneeId: string | null
  position: number
  completedAt: string | null
}

interface Props {
  sprintId: string
  activity: SprintBoardActivity
  users: Owner[]
  keyResults: KrOption[]
  objectives: ObjectiveOption[]
  currentUserId: string
  onClose: () => void
  onUpdateActivity: (patch: Partial<SprintBoardActivity>) => void
  onDeleteActivity: () => void
  onTasksChanged: (total: number, completed: number) => void
  onCommentsChanged: (total: number) => void
  onConverted: (initiativeId: string) => void
}

export default function SprintCardModal({
  sprintId,
  activity,
  users,
  keyResults,
  objectives,
  currentUserId: _currentUserId,
  onClose,
  onUpdateActivity,
  onDeleteActivity,
  onTasksChanged,
  onCommentsChanged,
  onConverted,
}: Props) {
  const [titleDraft, setTitleDraft] = useState(activity.title)
  const [descriptionDraft, setDescriptionDraft] = useState(activity.description || '')
  const [editingDescription, setEditingDescription] = useState(false)

  const [comments, setComments] = useState<Comment[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const [tasks, setTasks] = useState<SubTask[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [picker, setPicker] = useState<'owner' | 'kr' | 'objective' | null>(null)
  const [loading, setLoading] = useState(true)
  const [taskAssigneeOpen, setTaskAssigneeOpen] = useState<string | null>(null)

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Initial fetch of comments + tasks
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [cRes, tRes] = await Promise.all([
          fetch(`/api/sprints/${sprintId}/activities/${activity.id}/comments`),
          fetch(`/api/sprints/${sprintId}/activities/${activity.id}/tasks`),
        ])
        const [cData, tData] = await Promise.all([cRes.json(), tRes.json()])
        if (cancelled) return
        if (cData.success) setComments(cData.data)
        if (tData.success) setTasks(tData.data)
      } catch {
        toast.error('Failed to load card data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [activity.id, sprintId])

  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length
  const totalTasks = tasks.length

  // ---------- Title / description ----------

  async function saveTitle() {
    if (!titleDraft.trim() || titleDraft === activity.title) {
      setTitleDraft(activity.title)
      return
    }
    onUpdateActivity({ title: titleDraft.trim() })
  }
  async function saveDescription() {
    setEditingDescription(false)
    if (descriptionDraft === (activity.description || '')) return
    onUpdateActivity({ description: descriptionDraft })
  }

  // ---------- Comments ----------

  async function postComment() {
    if (!commentDraft.trim() || postingComment) return
    setPostingComment(true)
    try {
      const res = await fetch(`/api/sprints/${sprintId}/activities/${activity.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentDraft.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      setComments((prev) => [...prev, data.data])
      setCommentDraft('')
      onCommentsChanged(comments.length + 1)
    } catch (err: any) {
      toast.error(err.message || 'Failed to post comment')
    } finally {
      setPostingComment(false)
    }
  }

  async function deleteComment(commentId: string) {
    const snapshot = comments
    setComments((prev) => prev.filter((c) => c.id !== commentId))
    onCommentsChanged(comments.length - 1)
    try {
      const res = await fetch(`/api/sprints/${sprintId}/activities/${activity.id}/comments/${commentId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
    } catch (err: any) {
      setComments(snapshot)
      onCommentsChanged(snapshot.length)
      toast.error(err.message || 'Failed to delete')
    }
  }

  // ---------- Sub-tasks ----------

  async function addTask() {
    const title = newTaskTitle.trim()
    if (!title || addingTask) return
    setAddingTask(true)
    try {
      const res = await fetch(`/api/sprints/${sprintId}/activities/${activity.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      setTasks((prev) => [...prev, data.data])
      setNewTaskTitle('')
      onTasksChanged(totalTasks + 1, completedTasks)
    } catch (err: any) {
      toast.error(err.message || 'Failed to add task')
    } finally {
      setAddingTask(false)
    }
  }

  async function toggleTask(task: SubTask) {
    const nextStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    const snapshot = tasks
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)))
    const nextCompleted = nextStatus === 'COMPLETED' ? completedTasks + 1 : completedTasks - 1
    onTasksChanged(totalTasks, nextCompleted)
    try {
      const res = await fetch(`/api/sprints/${sprintId}/activities/${activity.id}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...data.data } : t)))
    } catch (err: any) {
      setTasks(snapshot)
      onTasksChanged(totalTasks, completedTasks)
      toast.error(err.message || 'Failed to update')
    }
  }

  async function deleteTask(taskId: string) {
    const snapshot = tasks
    const wasCompleted = tasks.find((t) => t.id === taskId)?.status === 'COMPLETED'
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    onTasksChanged(totalTasks - 1, wasCompleted ? completedTasks - 1 : completedTasks)
    try {
      const res = await fetch(`/api/sprints/${sprintId}/activities/${activity.id}/tasks/${taskId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
    } catch (err: any) {
      setTasks(snapshot)
      onTasksChanged(totalTasks, completedTasks)
      toast.error(err.message || 'Failed to delete')
    }
  }

  async function assignTask(taskId: string, assigneeId: string | null) {
    const snapshot = tasks
    const assignee = assigneeId ? users.find((u) => u.id === assigneeId) || null : null
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, assigneeId, assignee } : t)))
    try {
      const res = await fetch(`/api/sprints/${sprintId}/activities/${activity.id}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...data.data } : t)))
    } catch (err: any) {
      setTasks(snapshot)
      toast.error(err.message || 'Failed to assign')
    } finally {
      setTaskAssigneeOpen(null)
    }
  }

  // ---------- Convert to initiative ----------

  async function convertToInitiative() {
    if (!activity.keyResultId) {
      toast.error('Link this card to a Key Result first — initiatives live under a KR.')
      setPicker('kr')
      return
    }
    try {
      const res = await fetch(`/api/sprints/${sprintId}/activities/${activity.id}/convert-to-initiative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      toast.success('Converted to initiative')
      onConverted(data.data.id)
    } catch (err: any) {
      toast.error(err.message || 'Failed to convert')
    }
  }

  // ---------- Render ----------

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[5vh] notion-surface"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[768px] rounded-lg bg-card shadow-[0_20px_60px_rgba(15,15,15,0.2)] border border-[color:var(--notion-border)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-[color:var(--notion-divider)] px-6 py-4">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
              }}
              className="w-full bg-transparent text-[20px] font-semibold text-[color:var(--notion-text)] focus:outline-none"
            />
            <p className="notion-text-tertiary mt-1">
              In column · <span className="text-[color:var(--notion-text-secondary)]">{/* column label passed via parent if needed */}</span>
            </p>
          </div>
          <button onClick={onClose} className="notion-icon-button" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-[1fr_240px] gap-6 px-6 py-5">
          {/* Main column */}
          <div className="min-w-0 space-y-6">
            {/* Metadata pills */}
            <div className="flex flex-wrap items-center gap-2 notion-text-secondary">
              <button
                type="button"
                onClick={() => setPicker(picker === 'owner' ? null : 'owner')}
                className="notion-pill"
                data-tone="gray"
                title={`Owner · ${activity.owner.name}`}
              >
                <UserIcon className="h-3 w-3" /> {activity.owner.name}
              </button>
              {activity.keyResult && (
                <Link
                  href={`/dashboard/key-results/${activity.keyResult.id}`}
                  className="notion-pill"
                  data-tone="blue"
                  title={activity.keyResult.objective.title}
                >
                  <Link2 className="h-3 w-3" />
                  <span className="max-w-[200px] truncate">{activity.keyResult.title}</span>
                </Link>
              )}
              {activity.objective && (
                <Link
                  href={`/dashboard/objectives/${activity.objective.id}`}
                  className="notion-pill"
                  data-tone="blue"
                >
                  <Target className="h-3 w-3" /> {activity.objective.title}
                </Link>
              )}
              {activity.dueDate && (
                <span className="notion-pill" data-tone="gray">
                  <Calendar className="h-3 w-3" />
                  {new Date(activity.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              {activity.convertedInitiativeId && (
                <span className="notion-pill" data-tone="green">
                  <CheckCircle2 className="h-3 w-3" /> Converted to initiative
                </span>
              )}
            </div>

            {/* Description */}
            <section>
              <h3 className="notion-eyebrow mb-2">Description</h3>
              {editingDescription ? (
                <div>
                  <textarea
                    autoFocus
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    className="notion-input min-h-[120px] resize-y"
                    placeholder="Add a more detailed description…"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={saveDescription} className="notion-button notion-button-primary">Save</button>
                    <button
                      onClick={() => { setDescriptionDraft(activity.description || ''); setEditingDescription(false) }}
                      className="notion-button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDescription(true)}
                  className="w-full rounded-md px-2 py-2 text-left text-[13px] text-[color:var(--notion-text-secondary)] hover:bg-[color:var(--notion-hover)]"
                >
                  {activity.description || 'Add a more detailed description…'}
                </button>
              )}
            </section>

            {/* Sub-tasks */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="notion-eyebrow flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Tasks
                </h3>
                {totalTasks > 0 && (
                  <span className="notion-text-tertiary">
                    {completedTasks}/{totalTasks}
                  </span>
                )}
              </div>
              {totalTasks > 0 && (
                <div className="mb-3 notion-progress">
                  <div
                    className="notion-progress-fill"
                    style={{ width: `${totalTasks === 0 ? 0 : (completedTasks / totalTasks) * 100}%` }}
                  />
                </div>
              )}
              <ul className="space-y-0.5">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className="group relative flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-[color:var(--notion-hover)]"
                  >
                    <input
                      type="checkbox"
                      checked={task.status === 'COMPLETED'}
                      onChange={() => toggleTask(task)}
                      className="notion-checkbox"
                    />
                    <span
                      className={`flex-1 text-[13px] ${
                        task.status === 'COMPLETED'
                          ? 'text-[color:var(--notion-text-tertiary)] line-through'
                          : 'text-[color:var(--notion-text)]'
                      }`}
                    >
                      {task.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTaskAssigneeOpen(taskAssigneeOpen === task.id ? null : task.id)}
                      className="notion-avatar cursor-pointer"
                      title={task.assignee ? `Assigned to ${task.assignee.name}` : 'Unassigned'}
                    >
                      {task.assignee ? (
                        task.assignee.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={task.assignee.avatar} alt="" />
                        ) : (
                          task.assignee.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
                        )
                      ) : (
                        <UserIcon className="h-3 w-3 text-[color:var(--notion-text-tertiary)]" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTask(task.id)}
                      className="notion-icon-button opacity-0 group-hover:opacity-100"
                      title="Delete task"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>

                    {taskAssigneeOpen === task.id && (
                      <div className="absolute right-8 top-6 z-20 w-48 rounded-md border border-[color:var(--notion-border)] bg-card p-1 shadow-[0_8px_32px_rgba(15,15,15,0.08)] max-h-60 overflow-auto">
                        <button
                          type="button"
                          onClick={() => assignTask(task.id, null)}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] hover:bg-[color:var(--notion-hover)]"
                        >
                          <X className="h-3 w-3" /> Unassigned
                        </button>
                        {users.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => assignTask(task.id, u.id)}
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] hover:bg-[color:var(--notion-hover)]"
                          >
                            <span className="notion-avatar">
                              {u.avatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={u.avatar} alt="" />
                              ) : (
                                u.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
                              )}
                            </span>
                            <span className="truncate">{u.name}</span>
                            {u.id === task.assigneeId && <Check className="ml-auto h-3 w-3" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-2 flex items-center gap-1.5 rounded-sm px-2 py-1 hover:bg-[color:var(--notion-hover)]">
                <Plus className="h-3.5 w-3.5 text-[color:var(--notion-text-tertiary)]" />
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask() } }}
                  placeholder="Add a task…"
                  className="flex-1 bg-transparent text-[13px] placeholder:text-[color:var(--notion-text-tertiary)] focus:outline-none"
                />
                {newTaskTitle.trim() && (
                  <button onClick={addTask} className="notion-button notion-button-primary h-6 px-2 text-[12px]">
                    Add
                  </button>
                )}
              </div>
            </section>

            {/* Comments */}
            <section>
              <h3 className="notion-eyebrow mb-2 flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> Comments
              </h3>
              <div className="space-y-3">
                {comments.length === 0 && !loading && (
                  <p className="notion-text-tertiary">No comments yet.</p>
                )}
                {comments.map((c) => (
                  <div key={c.id} className="group flex gap-2">
                    <span className="notion-avatar mt-0.5">
                      {c.author?.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.author.avatar} alt="" />
                      ) : (
                        (c.author?.name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-medium text-[color:var(--notion-text)]">
                          {c.author?.name || 'Unknown'}
                        </span>
                        <span className="notion-text-tertiary">{relativeTime(c.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => deleteComment(c.id)}
                          className="notion-icon-button ml-auto opacity-0 group-hover:opacity-100"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-[color:var(--notion-text)]">{c.content}</p>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <span className="notion-avatar mt-1">
                    <UserIcon className="h-3 w-3 text-[color:var(--notion-text-tertiary)]" />
                  </span>
                  <div className="flex-1">
                    <textarea
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault()
                          postComment()
                        }
                      }}
                      placeholder="Write a comment…"
                      className="notion-input min-h-[60px] resize-y"
                    />
                    {commentDraft.trim() && (
                      <div className="mt-1">
                        <button
                          onClick={postComment}
                          disabled={postingComment}
                          className="notion-button notion-button-primary"
                        >
                          {postingComment ? 'Posting…' : 'Post'}
                        </button>
                        <span className="notion-text-tertiary ml-2">⌘+Enter</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Side column */}
          <aside className="flex flex-col gap-1.5">
            <h4 className="notion-eyebrow mb-1">Add to card</h4>

            <button
              type="button"
              onClick={() => setPicker(picker === 'owner' ? null : 'owner')}
              className="notion-button notion-button-bordered w-full justify-start"
            >
              <UserIcon className="h-3.5 w-3.5" /> Owner
            </button>

            <button
              type="button"
              onClick={() => setPicker(picker === 'kr' ? null : 'kr')}
              className="notion-button notion-button-bordered w-full justify-start"
            >
              <Link2 className="h-3.5 w-3.5" /> Link Key Result
            </button>

            <button
              type="button"
              onClick={() => setPicker(picker === 'objective' ? null : 'objective')}
              className="notion-button notion-button-bordered w-full justify-start"
            >
              <Target className="h-3.5 w-3.5" /> Link Objective
            </button>

            <h4 className="notion-eyebrow mb-1 mt-4">Actions</h4>

            <button
              type="button"
              onClick={convertToInitiative}
              disabled={!!activity.convertedInitiativeId}
              className="notion-button notion-button-bordered w-full justify-start"
              title={activity.convertedInitiativeId ? 'Already converted' : 'Create an Initiative from this card'}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              {activity.convertedInitiativeId ? 'Converted' : 'Convert to Initiative'}
            </button>

            {activity.convertedInitiativeId && activity.keyResult && (
              <Link
                href={`/dashboard/key-results/${activity.keyResult.id}`}
                className="notion-button notion-button-bordered w-full justify-start"
              >
                <Link2 className="h-3.5 w-3.5" /> Open in KR
              </Link>
            )}

            <button
              type="button"
              onClick={() => {
                if (confirm('Delete this card and all its comments & tasks?')) {
                  onDeleteActivity()
                  onClose()
                }
              }}
              className="notion-button notion-button-danger w-full justify-start"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete card
            </button>

            {/* Picker popovers */}
            {picker === 'owner' && (
              <Picker
                items={users.map((u) => ({ id: u.id, label: u.name, sublabel: null, avatar: u.avatar }))}
                selectedId={activity.ownerId}
                onPick={(id) => {
                  const u = users.find((x) => x.id === id)
                  if (u) onUpdateActivity({ ownerId: id, owner: u })
                  setPicker(null)
                }}
              />
            )}
            {picker === 'kr' && (
              <Picker
                items={[
                  { id: '__null__', label: 'No link', sublabel: null, avatar: null },
                  ...keyResults.map((k) => ({ id: k.id, label: k.title, sublabel: k.objective.title, avatar: null })),
                ]}
                selectedId={activity.keyResultId}
                onPick={(id) => {
                  if (id === '__null__') {
                    onUpdateActivity({ keyResultId: null, keyResult: null })
                  } else {
                    const k = keyResults.find((x) => x.id === id)
                    if (k) onUpdateActivity({ keyResultId: id, keyResult: k })
                  }
                  setPicker(null)
                }}
              />
            )}
            {picker === 'objective' && (
              <Picker
                items={[
                  { id: '__null__', label: 'No link', sublabel: null, avatar: null },
                  ...objectives.map((o) => ({ id: o.id, label: o.title, sublabel: o.level, avatar: null })),
                ]}
                selectedId={activity.objectiveId}
                onPick={(id) => {
                  if (id === '__null__') {
                    onUpdateActivity({ objectiveId: null, objective: null })
                  } else {
                    const o = objectives.find((x) => x.id === id)
                    if (o) onUpdateActivity({ objectiveId: id, objective: { id: o.id, title: o.title } })
                  }
                  setPicker(null)
                }}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

function Picker({
  items,
  selectedId,
  onPick,
}: {
  items: { id: string; label: string; sublabel: string | null; avatar: string | null }[]
  selectedId: string | null
  onPick: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const filtered = items.filter((i) => !q.trim() || i.label.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="rounded-md border border-[color:var(--notion-border)] bg-card p-1 shadow-[0_8px_32px_rgba(15,15,15,0.08)]">
      <input
        autoFocus
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search…"
        className="notion-input mb-1 h-7 text-[12px]"
      />
      <div className="max-h-52 overflow-auto">
        {filtered.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => onPick(i.id)}
            className="flex w-full items-start gap-2 rounded-sm px-2 py-1 text-left text-[12px] hover:bg-[color:var(--notion-hover)]"
          >
            {i.avatar !== null && (
              <span className="notion-avatar mt-0.5">
                {i.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.avatar} alt="" />
                ) : (
                  i.label.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
                )}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[color:var(--notion-text)]">{i.label}</span>
              {i.sublabel && <span className="block truncate text-[10px] text-[color:var(--notion-text-tertiary)]">{i.sublabel}</span>}
            </span>
            {i.id === selectedId && <Check className="h-3 w-3 flex-shrink-0 text-[color:var(--notion-text-secondary)]" />}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="px-2 py-2 text-[11px] text-[color:var(--notion-text-tertiary)]">No matches</div>
        )}
      </div>
    </div>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const sec = Math.round(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}
