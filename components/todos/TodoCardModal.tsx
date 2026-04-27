'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Check, Plus, Trash2, Paperclip, Tag, Users, Calendar,
  ChevronDown, AlignLeft, MessageSquare, Activity, MoreHorizontal,
  CheckSquare, Image as ImageIcon, File as FileIcon, AlertCircle,
} from 'lucide-react'
import { format, isPast, isToday, isTomorrow, isYesterday, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { MentionEditor } from './MentionEditor'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import toast from 'react-hot-toast'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TodoCardData {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  coverColor: string | null
  dueDate: string | null
  assigneeId: string
  assignee: { id: string; name: string; avatar: string | null }
  creator: { id: string; name: string; avatar: string | null }
  members: { user: { id: string; name: string; avatar: string | null } }[]
  labels: { labelDef: { id: string; name: string; color: string } }[]
  checklists: ChecklistData[]
  attachments: AttachmentData[]
  keyResult?: { id: string; title: string; objective?: { id: string; title: string } } | null
  objective?: { id: string; title: string } | null
}

interface ChecklistData {
  id: string
  title: string
  items: ChecklistItemData[]
}
interface ChecklistItemData {
  id: string
  title: string
  completed: boolean
  assignee?: { id: string; name: string; avatar: string | null } | null
  dueDate?: string | null
}
interface AttachmentData {
  id: string
  filename: string
  url: string
  mimeType: string
  size: number
  uploadedBy: { id: string; name: string }
  createdAt: string
}
interface CommentData {
  id: string
  content: string
  parentId: string | null
  author: { id: string; name: string; avatar: string | null }
  createdAt: string
  replies: CommentData[]
  attachments?: AttachmentData[]
}

interface ActivityLogData {
  id: string
  action: string
  actor: { id: string; name: string; avatar: string | null } | null
  changes: Record<string, { from: unknown; to: unknown }> | null
  metadata: Record<string, unknown> | null
  createdAt: string
}
interface LabelDef { id: string; name: string; color: string }

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#8E8E93', MEDIUM: '#FF9500', HIGH: '#FF3B30', URGENT: '#AF52DE',
}
const COVER_COLORS = [
  '#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE',
  '#FF2D55', '#5AC8FA', '#4CD964', '#FFCC00', '#FF6B35',
  null, // no cover
]

// ─── Helper components ────────────────────────────────────────────────────────

function Avatar({ name, avatar, size = 22 }: { name: string; avatar?: string | null; size?: number }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#FF2D55']
  const bg = colors[name.charCodeAt(0) % colors.length]
  return avatar ? (
    <img src={avatar} alt={name} title={name} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: bg }}
    >
      {initials}
    </span>
  )
}

function DueDateBadge({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return null
  const d = new Date(dueDate)
  const overdue = isPast(d) && !isToday(d)
  const today = isToday(d)
  const tomorrow = isTomorrow(d)
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-500',
      overdue && 'bg-[var(--ap-danger-bg)] text-[var(--ap-danger-fg)]',
      today && 'bg-[var(--ap-warn-bg)] text-[var(--ap-warn-fg)]',
      tomorrow && 'bg-[var(--ap-ok-bg)] text-[var(--ap-ok-fg)]',
      !overdue && !today && !tomorrow && 'bg-[var(--ap-bg-sunken)] text-[var(--ap-fg-muted)]',
    )}>
      <Calendar className="h-3 w-3" />
      {overdue ? 'Overdue · ' : today ? 'Today · ' : tomorrow ? 'Tomorrow · ' : ''}
      {format(d, 'MMM d')}
    </span>
  )
}

function ChecklistProgress({ items }: { items: ChecklistItemData[] }) {
  if (items.length === 0) return null
  const done = items.filter((i) => i.completed).length
  const pct = Math.round((done / items.length) * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-right text-[11px] text-[var(--ap-fg-subtle)]">{pct}%</span>
      <div className="h-1.5 flex-1 rounded-full bg-[var(--ap-kr-bar-bg)]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: pct === 100 ? 'var(--ap-ok)' : 'var(--ap-accent)' }}
        />
      </div>
    </div>
  )
}

function formatActivity(
  log: ActivityLogData,
  users: { id: string; name: string | null }[],
  labelDefs: LabelDef[],
): string {
  const userName = (id: unknown) => users.find((u) => u.id === id)?.name ?? 'someone'
  const labelName = (id: unknown) => labelDefs.find((l) => l.id === id)?.name ?? 'a label'
  const m = log.metadata ?? {}
  const c = log.changes ?? {}
  switch (log.action) {
    case 'INITIATIVE_CREATED': return 'created this card'
    case 'INITIATIVE_STATUS_CHANGED': {
      const ch = c.status as { from?: unknown; to?: unknown } | undefined
      return `changed status from "${String(ch?.from ?? '')}" to "${String(ch?.to ?? '')}"`
    }
    case 'INITIATIVE_ASSIGNEE_CHANGED': {
      const ch = c.assigneeId as { from?: unknown; to?: unknown } | undefined
      return `changed assignee to ${userName(ch?.to)}`
    }
    case 'INITIATIVE_MEMBER_ADDED': return `added ${userName((m as { userId?: unknown }).userId)} as a member`
    case 'INITIATIVE_MEMBER_REMOVED': return `removed ${userName((m as { userId?: unknown }).userId)} as a member`
    case 'INITIATIVE_LABEL_ADDED': return `added label "${labelName((m as { labelDefId?: unknown }).labelDefId)}"`
    case 'INITIATIVE_LABEL_REMOVED': return `removed label "${labelName((m as { labelDefId?: unknown }).labelDefId)}"`
    case 'INITIATIVE_CHECKLIST_CREATED': return `added checklist "${String((m as { title?: unknown }).title ?? '')}"`
    case 'INITIATIVE_CHECKLIST_ITEM_TOGGLED': {
      const completed = (m as { completed?: boolean }).completed
      const title = String((m as { title?: unknown }).title ?? 'an item')
      return `${completed ? 'completed' : 'reopened'} "${title}"`
    }
    case 'INITIATIVE_ATTACHMENT_ADDED': return `attached ${String((m as { filename?: unknown }).filename ?? 'a file')}`
    case 'INITIATIVE_COMMENTED': return 'commented'
    case 'UPDATED': {
      const fields = Object.keys(c)
      if (fields.length === 0) return 'updated this card'
      return `updated ${fields.join(', ')}`
    }
    default: return log.action.replace(/_/g, ' ').toLowerCase()
  }
}

function activityDateGroup(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

function ActivityFeed({
  logs,
  users,
  labelDefs,
}: {
  logs: ActivityLogData[]
  users: { id: string; name: string | null }[]
  labelDefs: LabelDef[]
}) {
  if (logs.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-4 py-8 text-center">
        <p className="text-[13px] font-600 text-[var(--ap-fg)]">No activity yet</p>
        <p className="mt-1 text-[12px] text-[var(--ap-fg-subtle)]">Changes to this card will appear here.</p>
      </div>
    )
  }
  // Group by date label, preserving order
  const groups: { label: string; entries: ActivityLogData[] }[] = []
  for (const log of logs) {
    const label = activityDateGroup(log.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.entries.push(log)
    else groups.push({ label, entries: [log] })
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-2 text-[10px] font-600 uppercase tracking-[0.6px] text-[var(--ap-fg-subtle)]">{g.label}</p>
          <ol className="space-y-2">
            {g.entries.map((log) => (
              <li key={log.id} className="flex items-start gap-2.5">
                <Avatar name={log.actor?.name ?? 'System'} avatar={log.actor?.avatar} size={24} />
                <div className="flex-1 min-w-0 text-[12px] text-[var(--ap-fg)]">
                  <span className="font-600">{log.actor?.name ?? 'System'}</span>{' '}
                  <span className="text-[var(--ap-fg-muted)]">{formatActivity(log, users, labelDefs)}</span>
                </div>
                <span className="shrink-0 text-[11px] text-[var(--ap-fg-faint)]">
                  {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  todoId: string | null
  currentUserId: string
  onClose: () => void
  onUpdated?: () => void
  mode?: 'drawer' | 'modal'
}

export function TodoCardModal({ todoId, currentUserId, onClose, onUpdated, mode = 'modal' }: Props) {
  const [todo, setTodo] = useState<TodoCardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState<CommentData[]>([])
  const [activityLogs, setActivityLogs] = useState<ActivityLogData[]>([])
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const commentFileInputRef = useRef<HTMLInputElement>(null)
  const [labelDefs, setLabelDefs] = useState<LabelDef[]>([])
  const [activePanel, setActivePanel] = useState<'description' | 'checklist' | 'members' | 'labels' | 'cover' | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [newItemTitles, setNewItemTitles] = useState<Record<string, string>>({})
  const [submittingComment, setSubmittingComment] = useState(false)
  const { users } = useUsersForSelection()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  // ── Fetch ──
  const fetchTodo = useCallback(async () => {
    if (!todoId) return
    setLoading(true)
    try {
      const [todoRes, commentsRes, labelsRes, activityRes] = await Promise.all([
        fetch(`/api/todos/${todoId}`),
        fetch(`/api/todos/${todoId}/comments`),
        fetch('/api/todo-labels'),
        fetch(`/api/todos/${todoId}/activity`),
      ])
      const [t, c, l, a] = await Promise.all([todoRes.json(), commentsRes.json(), labelsRes.json(), activityRes.json()])
      if (t.success) { setTodo(t.data); setTitleDraft(t.data.title); setDescDraft(t.data.description ?? '') }
      if (c.success) setComments(c.data)
      if (l.success) setLabelDefs(l.data)
      if (a.success) setActivityLogs(a.data)
    } finally {
      setLoading(false)
    }
  }, [todoId])

  useEffect(() => { fetchTodo() }, [fetchTodo])

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ── PATCH helper ──
  const patch = useCallback(async (body: Record<string, unknown>) => {
    if (!todo) return
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (json.success) { setTodo(json.data); onUpdated?.() }
    else toast.error(json.error ?? 'Update failed')
  }, [todo, onUpdated])

  // ── Title ──
  const saveTitle = async () => {
    if (!titleDraft.trim() || titleDraft === todo?.title) { setEditingTitle(false); return }
    await patch({ title: titleDraft.trim() })
    setEditingTitle(false)
  }

  // ── Description ──
  const saveDescription = async () => {
    await patch({ description: descDraft })
    setActivePanel(null)
  }

  // ── Comment ──
  const postComment = async () => {
    const hasText = !!commentDraft.replace(/<[^>]+>/g, '').trim()
    if (!hasText && pendingFiles.length === 0) return
    setSubmittingComment(true)
    try {
      // Upload pending files first; collect attachment ids
      const attachmentIds: string[] = []
      const newAttachments: AttachmentData[] = []
      for (const file of pendingFiles) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`/api/todos/${todo!.id}/attachments`, { method: 'POST', body: fd })
        const json = await res.json()
        if (json.success) { attachmentIds.push(json.data.id); newAttachments.push(json.data) }
        else toast.error(json.error ?? 'Upload failed')
      }
      if (newAttachments.length > 0) {
        setTodo((t) => t ? { ...t, attachments: [...t.attachments, ...newAttachments] } : t)
      }
      const res = await fetch(`/api/todos/${todo!.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentDraft || '<p></p>', attachmentIds }),
      })
      const json = await res.json()
      if (json.success) { setComments((c) => [...c, json.data]); setCommentDraft(''); setPendingFiles([]) }
      else toast.error(json.error ?? 'Failed to post comment')
    } finally { setSubmittingComment(false) }
  }

  // ── Checklist ──
  const addChecklist = async () => {
    if (!newChecklistTitle.trim() && !todo) return
    const res = await fetch(`/api/todos/${todo!.id}/checklists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newChecklistTitle || 'Checklist' }),
    })
    const json = await res.json()
    if (json.success) { setTodo((t) => t ? { ...t, checklists: [...t.checklists, json.data] } : t); setNewChecklistTitle(''); setActivePanel(null) }
  }

  const addChecklistItem = async (checklistId: string) => {
    const title = newItemTitles[checklistId]?.trim()
    if (!title) return
    const res = await fetch(`/api/todos/${todo!.id}/checklists/${checklistId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    const json = await res.json()
    if (json.success) {
      setTodo((t) => t ? { ...t, checklists: t.checklists.map((cl) => cl.id === checklistId ? { ...cl, items: [...cl.items, json.data] } : cl) } : t)
      setNewItemTitles((prev) => ({ ...prev, [checklistId]: '' }))
    }
  }

  const toggleChecklistItem = async (checklistId: string, itemId: string, completed: boolean) => {
    const res = await fetch(`/api/todos/${todo!.id}/checklists/${checklistId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    })
    const json = await res.json()
    if (json.success) {
      setTodo((t) => t ? {
        ...t,
        checklists: t.checklists.map((cl) => cl.id === checklistId
          ? { ...cl, items: cl.items.map((i) => i.id === itemId ? { ...i, ...json.data } : i) }
          : cl),
      } : t)
    }
  }

  const deleteChecklist = async (checklistId: string) => {
    await fetch(`/api/todos/${todo!.id}/checklists/${checklistId}`, { method: 'DELETE' })
    setTodo((t) => t ? { ...t, checklists: t.checklists.filter((cl) => cl.id !== checklistId) } : t)
  }

  // ── Members ──
  const toggleMember = async (userId: string) => {
    if (!todo) return
    const currentIds = todo.members.map((m) => m.user.id)
    const newIds = currentIds.includes(userId)
      ? currentIds.filter((id) => id !== userId)
      : [...currentIds, userId]
    await patch({ memberIds: newIds })
  }

  // ── Labels ──
  const toggleLabel = async (labelDefId: string) => {
    if (!todo) return
    const currentIds = todo.labels.map((l) => l.labelDef.id)
    const newIds = currentIds.includes(labelDefId)
      ? currentIds.filter((id) => id !== labelDefId)
      : [...currentIds, labelDefId]
    await patch({ labelIds: newIds })
  }

  // ── Attachment ──
  const uploadAttachment = async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/todos/${todo!.id}/attachments`, { method: 'POST', body: fd })
    const json = await res.json()
    if (json.success) setTodo((t) => t ? { ...t, attachments: [...t.attachments, json.data] } : t)
    else toast.error(json.error ?? 'Upload failed')
  }

  const deleteAttachment = async (attachmentId: string) => {
    await fetch(`/api/todos/${todo!.id}/attachments/${attachmentId}`, { method: 'DELETE' })
    setTodo((t) => t ? { ...t, attachments: t.attachments.filter((a) => a.id !== attachmentId) } : t)
  }

  if (!todoId) return null

  const isDrawer = mode === 'drawer'
  return createPortal(
    <div
      className={isDrawer
        ? 'fixed inset-0 z-[80] flex justify-end pointer-events-none'
        : 'fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 sm:p-8'}
      style={isDrawer
        ? { background: 'rgba(0,0,0,0.2)' }
        : { background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={isDrawer ? onClose : undefined}
    >
      <div
        className={isDrawer
          ? 'ap-modal-enter pointer-events-auto relative h-full w-full max-w-[480px] overflow-y-auto bg-[var(--ap-bg-raised)] shadow-[var(--ap-shadow-lg)] sm:rounded-l-[20px] md:max-w-[480px]'
          : 'ap-modal-enter relative my-4 w-full max-w-2xl rounded-[20px] bg-[var(--ap-bg-raised)] shadow-[var(--ap-shadow-lg)] overflow-hidden'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Cover strip ── */}
        {todo?.coverColor && (
          <div className="h-10 w-full" style={{ background: todo.coverColor }} />
        )}

        {/* ── Close ── */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ap-bg-sunken)] text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {loading && !todo ? (
          <div className="flex h-48 items-center justify-center text-[13px] text-[var(--ap-fg-subtle)]">Loading…</div>
        ) : todo ? (
          <div className="flex flex-col md:flex-row">
            {/* ══ LEFT column ══ */}
            <div className="flex-1 min-w-0 p-5 space-y-5">

              {/* Breadcrumb */}
              {(todo.keyResult || todo.objective) && (
                <p className="text-[11px] text-[var(--ap-fg-subtle)] truncate">
                  {todo.keyResult?.objective?.title ?? todo.objective?.title}
                  {todo.keyResult && <> › {todo.keyResult.title}</>}
                </p>
              )}

              {/* Title */}
              <div>
                {editingTitle ? (
                  <textarea
                    ref={titleRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTitle() } if (e.key === 'Escape') setEditingTitle(false) }}
                    rows={2}
                    className="w-full resize-none bg-transparent text-[22px] font-700 leading-tight text-[var(--ap-fg)] outline-none"
                    autoFocus
                  />
                ) : (
                  <h2
                    className="cursor-pointer text-[22px] font-700 leading-tight text-[var(--ap-fg)] hover:opacity-80 transition-opacity"
                    onClick={() => setEditingTitle(true)}
                  >
                    {todo.title}
                  </h2>
                )}
              </div>

              {/* Status + Priority chips */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={todo.status}
                  onChange={(e) => patch({ status: e.target.value })}
                  className="ap-input h-7 w-auto py-0 text-[12px] font-500 cursor-pointer"
                >
                  {STATUS_OPTIONS.map((s) => <option key={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <select
                  value={todo.priority}
                  onChange={(e) => patch({ priority: e.target.value })}
                  className="ap-input h-7 w-auto py-0 text-[12px] font-500 cursor-pointer"
                  style={{ color: PRIORITY_COLORS[todo.priority] }}
                >
                  {PRIORITY_OPTIONS.map((p) => <option key={p}>{p}</option>)}
                </select>
                <DueDateBadge dueDate={todo.dueDate} />
              </div>

              {/* Labels row */}
              {todo.labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {todo.labels.map((l) => (
                    <span
                      key={l.labelDef.id}
                      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-600 text-white"
                      style={{ background: l.labelDef.color }}
                    >
                      {l.labelDef.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Members row */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[var(--ap-fg-subtle)]">Members</span>
                <div className="flex -space-x-1">
                  <Avatar name={todo.assignee.name} avatar={todo.assignee.avatar} size={22} />
                  {todo.members.map((m) => <Avatar key={m.user.id} name={m.user.name} avatar={m.user.avatar} size={22} />)}
                </div>
              </div>

              {/* ── Description ── */}
              <div>
                <button
                  className="flex items-center gap-1.5 text-[12px] font-600 text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)] mb-2"
                  onClick={() => setActivePanel(activePanel === 'description' ? null : 'description')}
                >
                  <AlignLeft className="h-3.5 w-3.5" /> Description
                </button>
                {activePanel === 'description' || todo.description ? (
                  <div>
                    <MentionEditor
                      value={descDraft}
                      onChange={setDescDraft}
                      placeholder="Add a description…"
                      users={users}
                      minHeight={80}
                    />
                    {activePanel === 'description' && (
                      <div className="mt-2 flex gap-2">
                        <button onClick={saveDescription} className="ap-btn ap-btn-primary ap-btn-sm">Save</button>
                        <button onClick={() => { setDescDraft(todo.description ?? ''); setActivePanel(null) }} className="ap-btn ap-btn-secondary ap-btn-sm">Cancel</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setActivePanel('description')}
                    className="w-full rounded-[10px] bg-[var(--ap-bg-sunken)] px-3 py-2 text-left text-[13px] text-[var(--ap-fg-subtle)] hover:bg-[var(--ap-bg-hover)] transition-colors"
                  >
                    Add a description…
                  </button>
                )}
              </div>

              {/* ── Checklists ── */}
              {todo.checklists.map((cl) => (
                <div key={cl.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <CheckSquare className="h-3.5 w-3.5 text-[var(--ap-fg-muted)]" />
                      <span className="text-[12px] font-600 text-[var(--ap-fg-muted)]">{cl.title}</span>
                    </div>
                    <button onClick={() => deleteChecklist(cl.id)} className="rounded p-1 text-[var(--ap-fg-faint)] hover:text-[var(--ap-danger)] transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <ChecklistProgress items={cl.items} />
                  <div className="mt-2 space-y-1.5">
                    {cl.items.map((item) => (
                      <label key={item.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[var(--ap-bg-hover)] transition-colors group">
                        <button
                          type="button"
                          onClick={() => toggleChecklistItem(cl.id, item.id, !item.completed)}
                          className={cn(
                            'mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors',
                            item.completed
                              ? 'border-[var(--ap-ok)] bg-[var(--ap-ok)]'
                              : 'border-[var(--ap-border-strong)] bg-transparent',
                          )}
                        >
                          {item.completed && <Check className="h-2.5 w-2.5 text-white" />}
                        </button>
                        <span className={cn('flex-1 text-[13px] leading-snug', item.completed && 'line-through text-[var(--ap-fg-subtle)]')}>
                          {item.title}
                        </span>
                        {item.assignee && <Avatar name={item.assignee.name} avatar={item.assignee.avatar} size={16} />}
                      </label>
                    ))}
                    <div className="flex gap-2 mt-1 px-2">
                      <input
                        value={newItemTitles[cl.id] ?? ''}
                        onChange={(e) => setNewItemTitles((p) => ({ ...p, [cl.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') addChecklistItem(cl.id) }}
                        placeholder="Add an item…"
                        className="ap-input flex-1 h-7 text-[12px] py-0"
                      />
                      <button onClick={() => addChecklistItem(cl.id)} className="ap-btn ap-btn-secondary ap-btn-sm">Add</button>
                    </div>
                  </div>
                </div>
              ))}

              {/* ── Attachments ── */}
              {todo.attachments.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Paperclip className="h-3.5 w-3.5 text-[var(--ap-fg-muted)]" />
                    <span className="text-[12px] font-600 text-[var(--ap-fg-muted)]">Attachments</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {todo.attachments.map((att) => {
                      const isImage = att.mimeType.startsWith('image/')
                      return (
                        <div key={att.id} className="group relative flex items-center gap-2 rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] p-2 overflow-hidden">
                          {isImage ? (
                            <img src={att.url} alt={att.filename} className="h-10 w-10 rounded-md object-cover shrink-0" />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--ap-bg-hover)]">
                              <FileIcon className="h-5 w-5 text-[var(--ap-fg-subtle)]" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-500 text-[var(--ap-fg)]">{att.filename}</p>
                            <p className="text-[11px] text-[var(--ap-fg-subtle)]">{(att.size / 1024).toFixed(0)} KB</p>
                          </div>
                          <button
                            onClick={() => deleteAttachment(att.id)}
                            className="absolute right-1 top-1 hidden rounded p-0.5 text-[var(--ap-fg-faint)] hover:text-[var(--ap-danger)] group-hover:flex transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Comments / Activity tabs ── */}
              <div>
                <div className="mb-3 flex items-center gap-4 border-b border-[var(--ap-border)]">
                  <button
                    onClick={() => setActiveTab('comments')}
                    className={cn(
                      'flex items-center gap-1.5 -mb-px border-b-2 px-1 pb-2 text-[12px] font-600 transition-colors',
                      activeTab === 'comments'
                        ? 'border-[var(--ap-accent)] text-[var(--ap-fg)]'
                        : 'border-transparent text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)]',
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> Comments ({comments.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('activity')}
                    className={cn(
                      'flex items-center gap-1.5 -mb-px border-b-2 px-1 pb-2 text-[12px] font-600 transition-colors',
                      activeTab === 'activity'
                        ? 'border-[var(--ap-accent)] text-[var(--ap-fg)]'
                        : 'border-transparent text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)]',
                    )}
                  >
                    <Activity className="h-3.5 w-3.5" /> Activity ({activityLogs.length})
                  </button>
                </div>

                {activeTab === 'comments' ? (
                  <>
                    {/* Comment input */}
                    <div className="space-y-2">
                      <MentionEditor
                        value={commentDraft}
                        onChange={setCommentDraft}
                        placeholder="Write a comment… (@mention to notify someone)"
                        users={users}
                        onSubmit={postComment}
                        minHeight={60}
                      />
                      {/* Attach file row */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => commentFileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-2 py-1 text-[11px] text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
                        >
                          <Paperclip className="h-3 w-3" /> Attach file
                        </button>
                        <input
                          ref={commentFileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? [])
                            if (files.length > 0) setPendingFiles((prev) => [...prev, ...files])
                            e.target.value = ''
                          }}
                        />
                        {pendingFiles.length > 0 && (
                          <span className="text-[11px] text-[var(--ap-fg-faint)]">{pendingFiles.length} file{pendingFiles.length === 1 ? '' : 's'} pending</span>
                        )}
                      </div>
                      {/* Pending file chips */}
                      {pendingFiles.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {pendingFiles.map((f, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 rounded-full bg-[var(--ap-bg-sunken)] px-2 py-1 text-[11px] text-[var(--ap-fg)] border border-[var(--ap-border)]"
                            >
                              <FileIcon className="h-3 w-3 text-[var(--ap-fg-subtle)]" />
                              <span className="max-w-[140px] truncate">{f.name}</span>
                              <span className="text-[var(--ap-fg-faint)]">{(f.size / 1024).toFixed(0)}KB</span>
                              <button
                                type="button"
                                onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-[var(--ap-fg-faint)] hover:text-[var(--ap-danger)]"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={postComment}
                          disabled={submittingComment}
                          className="ap-btn ap-btn-primary ap-btn-sm"
                        >
                          {submittingComment ? 'Posting…' : 'Save'}
                        </button>
                        <span className="text-[11px] text-[var(--ap-fg-faint)]">Ctrl+Enter</span>
                      </div>
                    </div>
                    {/* Comment list */}
                    <div className="mt-4 space-y-4">
                      {comments.length === 0 && (
                        <p className="text-[12px] text-[var(--ap-fg-subtle)]">No comments yet.</p>
                      )}
                      {comments.map((c) => (
                        <div key={c.id} className="flex gap-2.5">
                          <Avatar name={c.author.name} avatar={c.author.avatar} size={26} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[12px] font-600 text-[var(--ap-fg)]">{c.author.name}</span>
                              <span className="text-[11px] text-[var(--ap-fg-faint)]">{format(new Date(c.createdAt), 'MMM d, h:mm a')}</span>
                            </div>
                            <div
                              className="prose prose-sm mt-1 max-w-none text-[13px] text-[var(--ap-fg)] [&_.mention]:text-[var(--ap-accent)] [&_.mention]:font-medium"
                              dangerouslySetInnerHTML={{ __html: c.content }}
                            />
                            {c.attachments && c.attachments.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {c.attachments.map((att) => {
                                  const isImage = att.mimeType?.startsWith('image/')
                                  return isImage ? (
                                    <a key={att.id} href={att.url} target="_blank" rel="noreferrer" className="block">
                                      <img src={att.url} alt={att.filename} className="max-h-48 rounded-[10px] border border-[var(--ap-border)] object-cover" />
                                    </a>
                                  ) : (
                                    <a
                                      key={att.id}
                                      href={att.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-2.5 py-1 text-[11px] text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
                                    >
                                      <FileIcon className="h-3 w-3 text-[var(--ap-fg-subtle)]" />
                                      <span className="max-w-[160px] truncate">{att.filename}</span>
                                    </a>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <ActivityFeed logs={activityLogs} users={users} labelDefs={labelDefs} />
                )}
              </div>
            </div>

            {/* ══ RIGHT sidebar ══ */}
            <div className="w-full md:w-44 shrink-0 border-t md:border-t-0 md:border-l border-[var(--ap-border)] p-4 space-y-1">
              <p className="text-[10px] font-600 uppercase tracking-[0.6px] text-[var(--ap-fg-subtle)] mb-2">Add to card</p>

              {/* Members */}
              <button
                onClick={() => setActivePanel(activePanel === 'members' ? null : 'members')}
                className="ap-btn ap-btn-ghost ap-btn-sm w-full justify-start gap-2"
              >
                <Users className="h-3.5 w-3.5" /> Members
              </button>
              {activePanel === 'members' && (
                <div className="rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-2 space-y-1 shadow-[var(--ap-shadow-md)]">
                  {users.map((u) => {
                    const isMember = u.id === todo.assigneeId || todo.members.some((m) => m.user.id === u.id)
                    return (
                      <button
                        key={u.id}
                        onClick={() => u.id !== todo.assigneeId && toggleMember(u.id)}
                        disabled={u.id === todo.assigneeId}
                        className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors', isMember ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent)]' : 'hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg)]')}
                      >
                        <Avatar name={u.name ?? u.email} size={18} />
                        <span className="flex-1 truncate">{u.name ?? u.email}</span>
                        {isMember && <Check className="h-3 w-3 shrink-0" />}
                      </button>
                    )
                  })}
                  {/* Assignee picker */}
                  <div className="border-t border-[var(--ap-border)] pt-1 mt-1">
                    <p className="text-[10px] text-[var(--ap-fg-subtle)] px-2 pb-1">Primary assignee</p>
                    <select
                      value={todo.assigneeId}
                      onChange={(e) => patch({ assigneeId: e.target.value })}
                      className="ap-input w-full h-7 text-[12px] py-0"
                    >
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Labels */}
              <button
                onClick={() => setActivePanel(activePanel === 'labels' ? null : 'labels')}
                className="ap-btn ap-btn-ghost ap-btn-sm w-full justify-start gap-2"
              >
                <Tag className="h-3.5 w-3.5" /> Labels
              </button>
              {activePanel === 'labels' && (
                <div className="rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-2 space-y-1 shadow-[var(--ap-shadow-md)]">
                  {labelDefs.length === 0 && <p className="text-[11px] text-[var(--ap-fg-subtle)] px-1">No labels yet</p>}
                  {labelDefs.map((ld) => {
                    const active = todo.labels.some((l) => l.labelDef.id === ld.id)
                    return (
                      <button
                        key={ld.id}
                        onClick={() => toggleLabel(ld.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--ap-bg-hover)] transition-colors"
                      >
                        <span className="h-5 w-10 rounded-sm" style={{ background: ld.color }} />
                        <span className="flex-1 text-left text-[12px] text-[var(--ap-fg)]">{ld.name}</span>
                        {active && <Check className="h-3 w-3 text-[var(--ap-accent)]" />}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Checklist */}
              <button
                onClick={() => setActivePanel(activePanel === 'checklist' ? null : 'checklist')}
                className="ap-btn ap-btn-ghost ap-btn-sm w-full justify-start gap-2"
              >
                <CheckSquare className="h-3.5 w-3.5" /> Checklist
              </button>
              {activePanel === 'checklist' && (
                <div className="flex gap-1.5">
                  <input
                    value={newChecklistTitle}
                    onChange={(e) => setNewChecklistTitle(e.target.value)}
                    placeholder="Title…"
                    className="ap-input flex-1 h-7 text-[12px] py-0"
                    onKeyDown={(e) => { if (e.key === 'Enter') addChecklist() }}
                  />
                  <button onClick={addChecklist} className="ap-btn ap-btn-primary ap-btn-sm">Add</button>
                </div>
              )}

              {/* Due Date */}
              <button className="ap-btn ap-btn-ghost ap-btn-sm w-full justify-start gap-2 relative overflow-hidden">
                <Calendar className="h-3.5 w-3.5" /> Due Date
                <input
                  type="date"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  value={todo.dueDate ? format(new Date(todo.dueDate), 'yyyy-MM-dd') : ''}
                  onChange={(e) => patch({ dueDate: e.target.value || null })}
                />
              </button>

              {/* Attach */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="ap-btn ap-btn-ghost ap-btn-sm w-full justify-start gap-2"
              >
                <Paperclip className="h-3.5 w-3.5" /> Attachment
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={(e) => {
                  Array.from(e.target.files ?? []).forEach(uploadAttachment)
                  e.target.value = ''
                }}
              />

              {/* Cover */}
              <button
                onClick={() => setActivePanel(activePanel === 'cover' ? null : 'cover')}
                className="ap-btn ap-btn-ghost ap-btn-sm w-full justify-start gap-2"
              >
                <ImageIcon className="h-3.5 w-3.5" /> Cover
              </button>
              {activePanel === 'cover' && (
                <div className="grid grid-cols-5 gap-1 p-1 rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)]">
                  {COVER_COLORS.map((color, i) => (
                    <button
                      key={i}
                      onClick={() => patch({ coverColor: color })}
                      className={cn('h-6 w-full rounded-md border-2 transition-transform hover:scale-110', todo.coverColor === color ? 'border-[var(--ap-fg)]' : 'border-transparent')}
                      style={{ background: color ?? 'transparent', border: color ? undefined : '2px dashed var(--ap-border)' }}
                      title={color ?? 'Remove cover'}
                    />
                  ))}
                </div>
              )}

              <div className="!mt-4 border-t border-[var(--ap-border)] pt-3 space-y-1">
                <p className="text-[10px] font-600 uppercase tracking-[0.6px] text-[var(--ap-fg-subtle)] mb-2">Actions</p>
                <button
                  onClick={() => { patch({ status: 'COMPLETED' }) }}
                  className="ap-btn ap-btn-ghost ap-btn-sm w-full justify-start gap-2 text-[var(--ap-ok)]"
                >
                  <Check className="h-3.5 w-3.5" /> Mark done
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('Delete this card?')) return
                    await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' })
                    onUpdated?.(); onClose()
                  }}
                  className="ap-btn ap-btn-ghost ap-btn-sm w-full justify-start gap-2 text-[var(--ap-danger)]"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete card
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
