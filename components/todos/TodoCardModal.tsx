'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Check, Plus, Trash2, Paperclip, Tag, Users, Calendar,
  ChevronDown, AlignLeft, MessageSquare, Activity, MoreHorizontal,
  CheckSquare, Image as ImageIcon, File as FileIcon, AlertCircle,
  Link2, Target, Search, ExternalLink,
} from 'lucide-react'
import { format, isPast, isToday, isTomorrow, isYesterday, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { userColor, userInitials } from '@/lib/user-color'
import { TODO_STATUS_META, BOARD_STATUSES, todoStatusMeta } from '@/lib/todo-status'
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
  startDate: string | null
  dueDate: string | null
  startTime: string | null
  endTime: string | null
  assigneeId: string | null
  assignee: { id: string; name: string; avatar: string | null } | null
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

// Status options shown in the card status dropdown: 5 board lanes + Cancelled
// (kept selectable so a card can be marked off without leaving the system).
const STATUS_OPTIONS = [...BOARD_STATUSES, 'CANCELLED'] as const
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#8E8E93', MEDIUM: '#FF9500', HIGH: '#FF3B30', URGENT: '#AF52DE',
}
// Trello-style label palette — kept short so the popover stays scannable.
const LABEL_COLORS = [
  '#61BD4F', '#F2D600', '#FF9F1A', '#EB5A46', '#C377E0',
  '#0079BF', '#00C2E0', '#51E898', '#FF78CB', '#344563',
]
const COVER_COLORS = [
  '#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE',
  '#FF2D55', '#5AC8FA', '#4CD964', '#FFCC00', '#FF6B35',
  null, // no cover
]

// ─── Helper components ────────────────────────────────────────────────────────

function Avatar({ id, name, avatar, size = 22 }: { id?: string | null; name: string; avatar?: string | null; size?: number }) {
  const initials = userInitials(name)
  const bg = userColor(id, name)
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

function DueDateBadge({ dueDate, endTime }: { dueDate: string | null; endTime?: string | null }) {
  if (!dueDate) return null
  const d = new Date(dueDate)
  const overdue = isPast(d) && !isToday(d)
  const today = isToday(d)
  const tomorrow = isTomorrow(d)
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-600',
      overdue && 'bg-[var(--ap-danger-bg)] text-[var(--ap-danger-fg)]',
      today && 'bg-[var(--ap-warn-bg)] text-[var(--ap-warn-fg)]',
      tomorrow && 'bg-[var(--ap-ok-bg)] text-[var(--ap-ok-fg)]',
      !overdue && !today && !tomorrow && 'bg-[var(--ap-bg-sunken)] text-[var(--ap-fg-muted)]',
    )}>
      <Calendar className="h-3 w-3" />
      {overdue ? 'Overdue · ' : today ? 'Today · ' : tomorrow ? 'Tomorrow · ' : ''}
      {format(d, 'MMM d')}
      {endTime ? `, ${to12h(endTime)}` : ''}
    </span>
  )
}

function StatusPill({ status, onChange }: { status: string; onChange: (v: string) => void }) {
  const meta = todoStatusMeta(status)
  return (
    <label
      className="relative inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-600 cursor-pointer transition-shadow hover:shadow-sm"
      style={{ background: meta.bg, color: meta.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
      <ChevronDown className="h-3 w-3 opacity-70" />
      <select
        value={status}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{TODO_STATUS_META[s].label}</option>)}
      </select>
    </label>
  )
}

function PriorityPill({ priority, onChange }: { priority: string; onChange: (v: string) => void }) {
  const fg = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.MEDIUM
  return (
    <label
      className="relative inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[11px] font-600 cursor-pointer transition-shadow hover:shadow-sm"
      style={{ borderColor: fg, color: fg, background: 'transparent' }}
    >
      <span className="size-1.5 rounded-full" style={{ background: fg }} />
      {priority}
      <ChevronDown className="h-3 w-3 opacity-70" />
      <select
        value={priority}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </label>
  )
}

interface LinkedOkrCardProps {
  todo: TodoCardData
  isOpen: boolean
  onToggle: () => void
  onUnlink: () => void
  query: string
  onQueryChange: (v: string) => void
  results: {
    objectives: { id: string; title: string; level: string; progress: number }[]
    keyResults: { id: string; title: string; progress: number; objective: { id: string; title: string } }[]
  }
  loading: boolean
  onPickKr: (id: string) => void
  onPickObjective: (id: string) => void
}

function LinkedOkrCard(p: LinkedOkrCardProps) {
  const linked = p.todo.keyResult || p.todo.objective
  return (
    <div className="rounded-[14px] border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ap-accent-soft)] text-[var(--ap-accent)]">
          <Target className="h-[18px] w-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-700 uppercase tracking-[0.06em] text-[var(--ap-fg-subtle)]">Linked OKR</p>
          {linked ? (
            <div className="mt-0.5 min-w-0">
              <p className="truncate text-[13px] font-600 text-[var(--ap-fg)]">
                {p.todo.keyResult?.title ?? p.todo.objective?.title}
              </p>
              {p.todo.keyResult && (
                <p className="truncate text-[11px] text-[var(--ap-fg-muted)]">
                  in {p.todo.keyResult.objective?.title}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-0.5 text-[12px] text-[var(--ap-fg-subtle)]">Not linked — pick an objective or key result so progress rolls up.</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {linked && (
            <a
              href={p.todo.keyResult ? `/dashboard/key-results/${p.todo.keyResult.id}` : `/dashboard/objectives/${p.todo.objective?.id}`}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-2.5 text-[11px] font-600 text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          )}
          <button
            onClick={p.onToggle}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-2.5 text-[11px] font-600 text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
          >
            <Link2 className="h-3 w-3" /> {linked ? 'Change' : 'Link'}
          </button>
        </div>
      </div>
      {p.isOpen && (
        <div className="border-t border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-3 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ap-fg-faint)]" />
            <input
              autoFocus
              value={p.query}
              onChange={(e) => p.onQueryChange(e.target.value)}
              placeholder="Search objectives & key results…"
              className="w-full rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] pl-9 pr-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[var(--ap-accent)] focus:border-transparent"
            />
          </div>
          {linked && (
            <button
              onClick={p.onUnlink}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-600 text-[var(--ap-danger)] hover:bg-[var(--ap-danger-bg)] transition-colors"
            >
              <X className="h-3 w-3" /> Remove current link
            </button>
          )}
          <div className="max-h-[260px] overflow-y-auto space-y-3">
            {p.loading && <p className="px-2 py-1 text-[12px] text-[var(--ap-fg-subtle)]">Searching…</p>}
            {!p.loading && p.query.trim() && p.results.objectives.length === 0 && p.results.keyResults.length === 0 && (
              <p className="px-2 py-2 text-[12px] text-[var(--ap-fg-subtle)]">No matches. Try a shorter keyword.</p>
            )}
            {p.results.keyResults.length > 0 && (
              <div>
                <p className="px-2 pb-1 text-[10px] font-700 uppercase tracking-[0.06em] text-[var(--ap-fg-subtle)]">Key results</p>
                <div className="space-y-1">
                  {p.results.keyResults.map((kr) => (
                    <button
                      key={kr.id}
                      onClick={() => p.onPickKr(kr.id)}
                      className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-[var(--ap-bg-hover)] transition-colors"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--ap-accent-soft)] text-[var(--ap-accent)] text-[11px] font-700">KR</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-600 text-[var(--ap-fg)]">{kr.title}</p>
                        <p className="truncate text-[11px] text-[var(--ap-fg-subtle)]">{kr.objective.title} · {Math.round(kr.progress ?? 0)}%</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {p.results.objectives.length > 0 && (
              <div>
                <p className="px-2 pb-1 text-[10px] font-700 uppercase tracking-[0.06em] text-[var(--ap-fg-subtle)]">Objectives</p>
                <div className="space-y-1">
                  {p.results.objectives.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => p.onPickObjective(o.id)}
                      className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-[var(--ap-bg-hover)] transition-colors"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgba(175,82,222,0.12)] text-[#AF52DE] text-[11px] font-700">O</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-600 text-[var(--ap-fg)]">{o.title}</p>
                        <p className="truncate text-[11px] text-[var(--ap-fg-subtle)]">{o.level} · {Math.round(o.progress ?? 0)}%</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
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
                <Avatar id={log.actor?.id} name={log.actor?.name ?? 'System'} avatar={log.actor?.avatar} size={24} />
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

// ─── Trello-style date picker ─────────────────────────────────────────────────

interface DatesPanelProps {
  startDate: string | null
  dueDate: string | null
  startTime: string | null
  endTime: string | null
  onSave: (v: { startDate: string | null; dueDate: string | null; startTime: string | null; endTime: string | null }) => void
  onRemove: () => void
  onClose: () => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function ymd(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function parseYmd(s: string | null): Date | null {
  if (!s) return null
  // Accept both "YYYY-MM-DD" and full ISO datetime strings (Prisma returns the
  // latter). Build the Date from local components so it always lands on the
  // calendar day the user actually picked, regardless of timezone.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function inRange(day: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false
  const t = day.getTime(), s = start.getTime(), e = end.getTime()
  return t >= Math.min(s, e) && t <= Math.max(s, e)
}
function fmtMd(s: string | null): string {
  const d = parseYmd(s)
  return d ? `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}` : ''
}
function to12h(t: string | null): string {
  if (!t) return ''
  const [hh, mm] = t.split(':')
  let h = parseInt(hh, 10)
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${mm} ${ap}`
}

function DatesPanel({ startDate, dueDate, startTime, endTime, onSave, onRemove, onClose }: DatesPanelProps) {
  const today = new Date()
  const initialFocus = parseYmd(dueDate) ?? parseYmd(startDate) ?? today
  const [viewYear, setViewYear] = useState(initialFocus.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialFocus.getMonth())
  const [startEnabled, setStartEnabled] = useState(!!startDate)
  const [dueEnabled, setDueEnabled] = useState(!!dueDate)
  // Normalize Prisma ISO datetimes ("2026-05-06T00:00:00.000Z") to local YYYY-MM-DD
  // so the controlled inputs and calendar grid agree on which day is selected.
  const initStartD = parseYmd(startDate)
  const initDueD = parseYmd(dueDate)
  const [startStr, setStartStr] = useState<string | null>(initStartD ? ymd(initStartD) : null)
  const [dueStr, setDueStr] = useState<string | null>(initDueD ? ymd(initDueD) : null)
  const [startTimeVal, setStartTimeVal] = useState<string>(startTime ?? '')
  const [endTimeVal, setEndTimeVal] = useState<string>(endTime ?? '')
  // Which date input the calendar populates on click. Defaults to "due" for
  // typical add-a-deadline flow; user can switch by clicking the Start row.
  const [activeTarget, setActiveTarget] = useState<'start' | 'due'>(dueDate || !startDate ? 'due' : 'start')

  const startD = parseYmd(startStr)
  const dueD = parseYmd(dueStr)

  // Build grid: 6 weeks × 7 days, starting Sunday before the 1st of viewMonth.
  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const gridStart = new Date(firstOfMonth)
  gridStart.setDate(1 - firstOfMonth.getDay())
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    cells.push(d)
  }

  const stepMonth = (delta: number) => {
    let m = viewMonth + delta, y = viewYear
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setViewMonth(m); setViewYear(y)
  }
  const stepYear = (delta: number) => setViewYear((y) => y + delta)

  const pickDay = (d: Date) => {
    const s = ymd(d)
    if (activeTarget === 'start') {
      setStartEnabled(true)
      setStartStr(s)
      // If start is pushed past due, drag due along so the range stays valid.
      if (dueEnabled && dueD && d.getTime() > dueD.getTime()) setDueStr(s)
    } else {
      setDueEnabled(true)
      setDueStr(s)
      // If due is pulled before start, drag start along.
      if (startEnabled && startD && d.getTime() < startD.getTime()) setStartStr(s)
    }
  }

  const save = () => {
    onSave({
      startDate: startEnabled ? startStr : null,
      dueDate: dueEnabled ? dueStr : null,
      startTime: startEnabled ? (startTimeVal || null) : null,
      endTime: dueEnabled ? (endTimeVal || null) : null,
    })
  }

  return (
    <div className="absolute right-0 top-full z-[91] mt-1.5 w-[340px] max-w-[calc(100vw-2rem)] rounded-[12px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-3 shadow-[var(--ap-shadow-lg)]">
      <div className="flex items-center justify-between mb-2">
        <button onClick={onClose} className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
        <p className="text-[12px] font-700 text-[var(--ap-fg)]">Dates</p>
        <button onClick={onClose} className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="flex gap-0.5">
          <button onClick={() => stepYear(-1)} className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Previous year">«</button>
          <button onClick={() => stepMonth(-1)} className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Previous month">‹</button>
        </div>
        <p className="text-[13px] font-600 text-[var(--ap-fg)]">{MONTHS[viewMonth]} {viewYear}</p>
        <div className="flex gap-0.5">
          <button onClick={() => stepMonth(1)} className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Next month">›</button>
          <button onClick={() => stepYear(1)} className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Next year">»</button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] font-700 text-[var(--ap-fg-muted)] py-1">{w}</div>
        ))}
        {cells.map((d, i) => {
          const isOther = d.getMonth() !== viewMonth
          const isToday = sameDay(d, today)
          const isStart = sameDay(d, startD) && startEnabled
          const isDue = sameDay(d, dueD) && dueEnabled
          const isBetween = startEnabled && dueEnabled && inRange(d, startD, dueD) && !isStart && !isDue
          return (
            <button
              key={i}
              onClick={() => pickDay(d)}
              className={cn(
                'h-8 w-full rounded-md text-[12px] font-500 transition-colors',
                isOther ? 'text-[var(--ap-fg-subtle)]' : 'text-[var(--ap-fg)]',
                !isStart && !isDue && !isBetween && 'hover:bg-[var(--ap-bg-hover)]',
                isBetween && 'bg-[var(--ap-accent-soft)]',
                (isStart || isDue) && 'bg-[var(--ap-accent)] text-white',
                isToday && !isStart && !isDue && 'underline decoration-[var(--ap-accent)] underline-offset-2',
              )}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>

      {/* Start date row — click anywhere on the row to make it the active
          target so calendar clicks fill this date. */}
      <div
        className={cn(
          'mt-3 rounded-[10px] border p-2 transition-colors cursor-pointer',
          activeTarget === 'start'
            ? 'border-[var(--ap-accent)] bg-[var(--ap-accent-soft)]'
            : 'border-[var(--ap-border)] hover:bg-[var(--ap-bg-hover)]',
        )}
        onClick={() => setActiveTarget('start')}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <input
            type="checkbox"
            checked={startEnabled}
            onChange={(e) => setStartEnabled(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="size-4 cursor-pointer accent-[var(--ap-accent)]"
          />
          <p className="text-[12px] font-700 text-[var(--ap-fg)]">Start date</p>
          {activeTarget === 'start' && (
            <span className="ml-auto text-[10px] font-600 text-[var(--ap-accent)]">Active</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="M/D/YYYY"
            value={fmtMd(startStr)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = e.target.value.trim()
              if (!v) { setStartStr(null); return }
              const d = new Date(v)
              if (!Number.isNaN(d.getTime())) setStartStr(ymd(d))
            }}
            disabled={!startEnabled}
            className="ap-input h-8 flex-1 min-w-0 text-[12px] py-0 disabled:opacity-50"
          />
          <input
            type="time"
            value={startTimeVal}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setStartTimeVal(e.target.value)}
            disabled={!startEnabled}
            className="ap-input h-8 w-[110px] shrink-0 text-[12px] py-0 disabled:opacity-50"
            aria-label="Start time"
          />
        </div>
      </div>

      {/* Due date row */}
      <div
        className={cn(
          'mt-2 rounded-[10px] border p-2 transition-colors cursor-pointer',
          activeTarget === 'due'
            ? 'border-[var(--ap-accent)] bg-[var(--ap-accent-soft)]'
            : 'border-[var(--ap-border)] hover:bg-[var(--ap-bg-hover)]',
        )}
        onClick={() => setActiveTarget('due')}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <input
            type="checkbox"
            checked={dueEnabled}
            onChange={(e) => setDueEnabled(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="size-4 cursor-pointer accent-[var(--ap-accent)]"
          />
          <p className="text-[12px] font-700 text-[var(--ap-fg)]">Due date</p>
          {activeTarget === 'due' && (
            <span className="ml-auto text-[10px] font-600 text-[var(--ap-accent)]">Active</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="M/D/YYYY"
            value={fmtMd(dueStr)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = e.target.value.trim()
              if (!v) { setDueStr(null); return }
              const d = new Date(v)
              if (!Number.isNaN(d.getTime())) setDueStr(ymd(d))
            }}
            disabled={!dueEnabled}
            className="ap-input h-8 flex-1 min-w-0 text-[12px] py-0 disabled:opacity-50"
          />
          <input
            type="time"
            value={endTimeVal}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setEndTimeVal(e.target.value)}
            disabled={!dueEnabled}
            className="ap-input h-8 w-[110px] shrink-0 text-[12px] py-0 disabled:opacity-50"
            aria-label="Due time"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <button
          onClick={save}
          className="w-full rounded-[8px] bg-[var(--ap-accent)] px-3 py-2 text-[13px] font-600 text-white hover:opacity-90 transition-opacity"
        >
          Save
        </button>
        <button
          onClick={() => { onRemove(); onClose() }}
          className="w-full rounded-[8px] border border-[var(--ap-border)] bg-transparent px-3 py-2 text-[13px] font-600 text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

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
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const commentFileInputRef = useRef<HTMLInputElement>(null)
  const [labelDefs, setLabelDefs] = useState<LabelDef[]>([])
  const [activePanel, setActivePanel] = useState<'description' | 'checklist' | 'members' | 'labels' | 'cover' | 'link' | 'dates' | null>(null)
  const [linkQuery, setLinkQuery] = useState('')
  const [linkResults, setLinkResults] = useState<{
    objectives: { id: string; title: string; level: string; progress: number }[]
    keyResults: { id: string; title: string; progress: number; objective: { id: string; title: string } }[]
  }>({ objectives: [], keyResults: [] })
  const [linkLoading, setLinkLoading] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#61BD4F')
  const [labelSearch, setLabelSearch] = useState('')
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
  // Optimistic — UI updates instantly; the PATCH (and its server-side
  // notification fan-out) runs in the background. On failure we roll back
  // and surface a toast. Without this the popover felt sluggish because
  // the response time included emit() writing per-recipient rows.
  const toggleMember = (userId: string) => {
    if (!todo) return
    const u = users.find((x: { id: string }) => x.id === userId)
    const currentIds = todo.members.map((m) => m.user.id)
    const willAdd = !currentIds.includes(userId)
    const newIds = willAdd ? [...currentIds, userId] : currentIds.filter((id) => id !== userId)
    const prevMembers = todo.members
    const optimisticMembers = willAdd && u
      ? [...prevMembers, { user: { id: u.id, name: u.name ?? u.email ?? '', avatar: (u as { avatar?: string | null }).avatar ?? null } }]
      : prevMembers.filter((m) => m.user.id !== userId)
    setTodo((t) => t ? { ...t, members: optimisticMembers } : t)
    void (async () => {
      try {
        const res = await fetch(`/api/todos/${todo.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberIds: newIds }),
        })
        const json = await res.json()
        if (json.success) { setTodo(json.data); onUpdated?.() }
        else { setTodo((t) => t ? { ...t, members: prevMembers } : t); toast.error(json.error ?? 'Update failed') }
      } catch {
        setTodo((t) => t ? { ...t, members: prevMembers } : t)
        toast.error('Update failed')
      }
    })()
  }

  // ── Labels ──
  const toggleLabel = (labelDefId: string) => {
    if (!todo) return
    const def = labelDefs.find((d) => d.id === labelDefId)
    const currentIds = todo.labels.map((l) => l.labelDef.id)
    const willAdd = !currentIds.includes(labelDefId)
    const newIds = willAdd ? [...currentIds, labelDefId] : currentIds.filter((id) => id !== labelDefId)
    const prevLabels = todo.labels
    const optimisticLabels = willAdd && def
      ? [...prevLabels, { labelDef: { id: def.id, name: def.name, color: def.color } }]
      : prevLabels.filter((l) => l.labelDef.id !== labelDefId)
    setTodo((t) => t ? { ...t, labels: optimisticLabels } : t)
    void (async () => {
      try {
        const res = await fetch(`/api/todos/${todo.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labelIds: newIds }),
        })
        const json = await res.json()
        if (json.success) { setTodo(json.data); onUpdated?.() }
        else { setTodo((t) => t ? { ...t, labels: prevLabels } : t); toast.error(json.error ?? 'Update failed') }
      } catch {
        setTodo((t) => t ? { ...t, labels: prevLabels } : t)
        toast.error('Update failed')
      }
    })()
  }
  const createLabel = async () => {
    const name = newLabelName.trim()
    if (!name) return
    const res = await fetch('/api/todo-labels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, color: newLabelColor }),
    })
    const json = await res.json()
    if (!json.success) { toast.error(json.error ?? 'Failed to create label'); return }
    setLabelDefs((d) => [...d, json.data])
    setNewLabelName('')
    if (todo) await toggleLabel(json.data.id)
  }
  const deleteLabel = async (id: string) => {
    if (!confirm('Delete this label from the entire workspace?')) return
    const res = await fetch(`/api/todo-labels/${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.success) { toast.error(json.error ?? 'Failed to delete label'); return }
    setLabelDefs((d) => d.filter((l) => l.id !== id))
    setTodo((t) => t ? { ...t, labels: t.labels.filter((l) => l.labelDef.id !== id) } : t)
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

  // ── OKR link search (debounced) ──
  useEffect(() => {
    if (activePanel !== 'link') return
    const q = linkQuery.trim()
    if (!q) {
      setLinkResults({ objectives: [], keyResults: [] })
      return
    }
    const t = setTimeout(async () => {
      setLinkLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const json = await res.json()
        if (json.success) {
          setLinkResults({
            objectives: json.data.objectives ?? [],
            keyResults: json.data.keyResults ?? [],
          })
        }
      } finally {
        setLinkLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [linkQuery, activePanel])

  const linkToKeyResult = async (krId: string) => {
    await patch({ keyResultId: krId, objectiveId: null })
    setActivePanel(null); setLinkQuery('')
    toast.success('Linked to key result')
  }
  const linkToObjective = async (objId: string) => {
    await patch({ objectiveId: objId, keyResultId: null })
    setActivePanel(null); setLinkQuery('')
    toast.success('Linked to objective')
  }
  const unlink = async () => {
    await patch({ keyResultId: null, objectiveId: null })
    toast.success('Unlinked')
  }

  if (!todoId) return null

  const isDrawer = mode === 'drawer'
  return createPortal(
    <div
      className={isDrawer
        ? 'fixed inset-0 z-[80] flex justify-end'
        : 'fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 sm:p-8'}
      style={isDrawer
        ? { background: 'rgba(0,0,0,0.2)' }
        : { background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className={isDrawer
          ? 'ap-modal-enter pointer-events-auto relative h-full w-full overflow-y-auto bg-[var(--ap-bg-raised)] shadow-[var(--ap-shadow-lg)] sm:rounded-l-[20px] sm:max-w-[760px]'
          : 'ap-modal-enter relative my-4 w-full max-w-[860px] rounded-[20px] bg-[var(--ap-bg-raised)] shadow-[var(--ap-shadow-lg)] overflow-hidden'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Cover strip (taller, gradient feel) ── */}
        {todo?.coverColor && (
          <div className="h-14 w-full" style={{ background: `linear-gradient(135deg, ${todo.coverColor}, ${todo.coverColor}cc)` }} />
        )}

        {/* ── Close ── */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ap-bg-raised)] shadow-sm text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)] hover:shadow transition-all"
        >
          <X className="h-4 w-4" />
        </button>

        {loading && !todo ? (
          <div className="flex h-48 items-center justify-center text-[13px] text-[var(--ap-fg-subtle)]">Loading…</div>
        ) : todo ? (
          <div className="flex flex-col md:flex-row">
            {/* ══ LEFT column ══ */}
            <div className="flex-1 min-w-0 p-6 space-y-6">

              {/* ── Breadcrumb (linked OKR) ── */}
              {(todo.keyResult || todo.objective) && (
                <div className="flex items-center gap-1.5 text-[12px] text-[var(--ap-fg-muted)] min-w-0">
                  <Target className="h-3.5 w-3.5 shrink-0 text-[var(--ap-accent)]" />
                  <a
                    href={`/dashboard/objectives/${todo.keyResult?.objective?.id ?? todo.objective?.id}`}
                    className="truncate hover:text-[var(--ap-accent)] transition-colors"
                  >
                    {todo.keyResult?.objective?.title ?? todo.objective?.title}
                  </a>
                  {todo.keyResult && (
                    <>
                      <span className="text-[var(--ap-fg-faint)]">›</span>
                      <a
                        href={`/dashboard/key-results/${todo.keyResult.id}`}
                        className="truncate hover:text-[var(--ap-accent)] transition-colors"
                      >
                        {todo.keyResult.title}
                      </a>
                    </>
                  )}
                </div>
              )}

              {/* ── Hero: title ── */}
              <div>
                {editingTitle ? (
                  <textarea
                    ref={titleRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTitle() } if (e.key === 'Escape') setEditingTitle(false) }}
                    rows={2}
                    className="w-full resize-none bg-transparent text-[26px] font-600 leading-[1.2] tracking-[-0.01em] text-[var(--ap-fg)] outline-none focus:ring-2 focus:ring-[var(--ap-accent)] focus:rounded-lg focus:px-2 focus:-mx-2 transition-all"
                    autoFocus
                  />
                ) : (
                  <h2
                    className="cursor-text text-[26px] font-600 leading-[1.2] tracking-[-0.01em] text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] -mx-2 px-2 py-1 rounded-lg transition-colors"
                    onClick={() => setEditingTitle(true)}
                  >
                    {todo.title}
                  </h2>
                )}
              </div>

              {/* ── Status / Priority / Due / Labels: pill row ── */}
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={todo.status} onChange={(v) => patch({ status: v })} />
                <PriorityPill priority={todo.priority} onChange={(v) => patch({ priority: v })} />
                <DueDateBadge dueDate={todo.dueDate} endTime={todo.endTime} />
                {todo.labels.map((l) => (
                  <span
                    key={l.labelDef.id}
                    className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-600 text-white shadow-sm"
                    style={{ background: l.labelDef.color }}
                  >
                    {l.labelDef.name}
                  </span>
                ))}
              </div>

              {/* ── Members (Trello-style — no "primary assignee", just a set) ── */}
              <div className="relative flex items-center gap-3">
                <span className="text-[11px] font-600 uppercase tracking-[0.05em] text-[var(--ap-fg-subtle)]">Members</span>
                <div className="flex -space-x-1.5">
                  {todo.members.map((m) => (
                    <Avatar key={m.user.id} id={m.user.id} name={m.user.name} avatar={m.user.avatar} size={26} />
                  ))}
                  <button
                    onClick={() => setActivePanel(activePanel === 'members' ? null : 'members')}
                    className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-dashed border-[var(--ap-border-strong)] text-[var(--ap-fg-muted)] hover:border-[var(--ap-accent)] hover:text-[var(--ap-accent)] transition-colors"
                    title="Add member"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                {activePanel === 'members' && (
                  <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setActivePanel(null)} />
                    <div className="absolute left-[78px] top-full z-[91] mt-2 w-[260px] max-h-[360px] overflow-y-auto rounded-[12px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-2 space-y-1 shadow-[var(--ap-shadow-lg)]">
                      <p className="px-2 pb-1 text-[10px] font-700 uppercase tracking-[0.06em] text-[var(--ap-fg-subtle)]">Card members</p>
                      {users.map((u) => {
                        const isMember = todo.members.some((m) => m.user.id === u.id)
                        return (
                          <button
                            key={u.id}
                            onClick={() => toggleMember(u.id)}
                            className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors', isMember ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent)]' : 'hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg)]')}
                          >
                            <Avatar id={u.id} name={u.name ?? u.email} size={18} />
                            <span className="flex-1 truncate">{u.name ?? u.email}</span>
                            {isMember && <Check className="h-3 w-3 shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* ── Linked OKR card (always visible — surfaces the link or invites it) ── */}
              <LinkedOkrCard
                todo={todo}
                isOpen={activePanel === 'link'}
                onToggle={() => setActivePanel(activePanel === 'link' ? null : 'link')}
                onUnlink={unlink}
                query={linkQuery}
                onQueryChange={setLinkQuery}
                results={linkResults}
                loading={linkLoading}
                onPickKr={linkToKeyResult}
                onPickObjective={linkToObjective}
              />

              {/* ── Description ── */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlignLeft className="h-4 w-4 text-[var(--ap-fg-muted)]" />
                  <h3 className="text-[15px] font-600 text-[var(--ap-fg)]">Description</h3>
                </div>
                {activePanel === 'description' || todo.description ? (
                  <div>
                    <MentionEditor
                      value={descDraft}
                      onChange={setDescDraft}
                      placeholder="Add a more detailed description…"
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
                    className="w-full rounded-[10px] bg-[var(--ap-bg-sunken)] px-3 py-2.5 text-left text-[13px] text-[var(--ap-fg-subtle)] hover:bg-[var(--ap-bg-hover)] transition-colors"
                  >
                    Add a more detailed description…
                  </button>
                )}
              </div>

              {/* ── Checklists ── */}
              {todo.checklists.map((cl) => (
                <div key={cl.id} className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckSquare className="h-4 w-4 shrink-0 text-[var(--ap-fg-muted)]" />
                      <h3 className="truncate text-[15px] font-600 text-[var(--ap-fg)]">{cl.title}</h3>
                    </div>
                    <button
                      onClick={() => deleteChecklist(cl.id)}
                      className="inline-flex h-7 items-center gap-1 rounded-[8px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-2.5 text-[11px] font-600 text-[var(--ap-fg-muted)] hover:border-[var(--ap-danger)] hover:bg-[var(--ap-danger-bg)] hover:text-[var(--ap-danger)] transition-all"
                    >
                      Delete
                    </button>
                  </div>
                  <ChecklistProgress items={cl.items} />
                  <div className="space-y-0.5">
                    {cl.items.map((item) => (
                      <div
                        key={item.id}
                        className="group flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 hover:bg-[var(--ap-bg-hover)] transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => toggleChecklistItem(cl.id, item.id, !item.completed)}
                          className={cn(
                            'h-[18px] w-[18px] shrink-0 rounded-[5px] border-2 flex items-center justify-center transition-colors',
                            item.completed
                              ? 'border-[var(--ap-ok)] bg-[var(--ap-ok)]'
                              : 'border-[var(--ap-border-strong)] bg-transparent hover:border-[var(--ap-fg-muted)]',
                          )}
                        >
                          {item.completed && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </button>
                        <span className={cn(
                          'flex-1 text-[13px] leading-snug min-w-0',
                          item.completed && 'line-through text-[var(--ap-fg-subtle)]',
                        )}>
                          {item.title}
                        </span>
                        {item.dueDate && (
                          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-[var(--ap-bg-sunken)] px-2 py-[2px] text-[10px] font-600 text-[var(--ap-fg-muted)]">
                            <Calendar className="h-2.5 w-2.5" />
                            {format(new Date(item.dueDate), 'MMM d')}
                          </span>
                        )}
                        {item.assignee && (
                          <Avatar id={item.assignee.id} name={item.assignee.name} avatar={item.assignee.avatar} size={20} />
                        )}
                        <div className="hidden gap-0.5 group-hover:flex">
                          <button
                            type="button"
                            title="Set due date"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-raised)] hover:text-[var(--ap-fg)] transition-colors"
                          >
                            <Calendar className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="Assign"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-raised)] hover:text-[var(--ap-fg)] transition-colors"
                          >
                            <Users className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="More"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-raised)] hover:text-[var(--ap-fg)] transition-colors"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pl-7">
                    <input
                      value={newItemTitles[cl.id] ?? ''}
                      onChange={(e) => setNewItemTitles((p) => ({ ...p, [cl.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') addChecklistItem(cl.id) }}
                      placeholder="Add an item"
                      className="flex-1 rounded-[8px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 h-8 text-[13px] outline-none focus:ring-2 focus:ring-[var(--ap-accent)] focus:border-transparent transition-all"
                    />
                    <button
                      onClick={() => addChecklistItem(cl.id)}
                      disabled={!newItemTitles[cl.id]?.trim()}
                      className="ap-btn ap-btn-primary ap-btn-sm disabled:opacity-50"
                    >
                      Add
                    </button>
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

              {/* ── Comments + activity (Trello-style: stacked, no tabs) ── */}
              <div>
                <div className="mb-3 flex items-center gap-1.5 text-[var(--ap-fg)]">
                  <MessageSquare className="h-3.5 w-3.5 text-[var(--ap-fg-muted)]" />
                  <span className="text-[12px] font-700 uppercase tracking-[0.05em] text-[var(--ap-fg-subtle)]">
                    Comments ({comments.length})
                  </span>
                </div>

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
                          <Avatar id={c.author.id} name={c.author.name} avatar={c.author.avatar} size={26} />
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

                {/* Activity log inline below comments */}
                {activityLogs.length > 0 && (
                  <div className="mt-6 border-t border-[var(--ap-border)] pt-4">
                    <div className="mb-3 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-[var(--ap-fg-muted)]" />
                      <span className="text-[12px] font-700 uppercase tracking-[0.05em] text-[var(--ap-fg-subtle)]">
                        Activity ({activityLogs.length})
                      </span>
                    </div>
                    <ActivityFeed logs={activityLogs} users={users} labelDefs={labelDefs} />
                  </div>
                )}
              </div>
            </div>

            {/* ══ RIGHT sidebar ══ */}
            <div className="w-full md:w-[200px] shrink-0 border-t md:border-t-0 md:border-l border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] p-4 space-y-3">
              <p className="text-[10px] font-700 uppercase tracking-[0.06em] text-[var(--ap-fg-subtle)]">Add to card</p>

              {/* Link OKR — surfaced at the top */}
              <button
                onClick={() => setActivePanel(activePanel === 'link' ? null : 'link')}
                className="flex w-full items-center gap-2.5 rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 py-2 text-left text-[12px] font-500 text-[var(--ap-fg)] hover:border-[var(--ap-accent)] hover:text-[var(--ap-accent)] hover:shadow-sm transition-all"
              >
                <Target className="h-3.5 w-3.5" /> Link OKR
              </button>

              {/* Labels — popover */}
              <div className="relative">
                <button
                  onClick={() => setActivePanel(activePanel === 'labels' ? null : 'labels')}
                  className="flex w-full items-center gap-2.5 rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 py-2 text-left text-[12px] font-500 text-[var(--ap-fg)] hover:border-[var(--ap-accent)] hover:shadow-sm transition-all"
                >
                  <Tag className="h-3.5 w-3.5" /> Labels
                </button>
                {activePanel === 'labels' && (
                  <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setActivePanel(null)} />
                    <div className="absolute right-0 top-full z-[91] mt-1.5 w-[280px] max-w-[calc(100vw-2rem)] max-h-[420px] overflow-y-auto rounded-[12px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-3 shadow-[var(--ap-shadow-lg)]">
                      <p className="pb-2 text-[10px] font-700 uppercase tracking-[0.06em] text-[var(--ap-fg-subtle)]">Labels</p>
                      <input
                        value={labelSearch}
                        onChange={(e) => setLabelSearch(e.target.value)}
                        placeholder="Search labels…"
                        className="ap-input h-7 w-full text-[12px] py-0 mb-2"
                      />
                      <div className="space-y-1">
                        {labelDefs
                          .filter((ld) => !labelSearch.trim() || ld.name.toLowerCase().includes(labelSearch.toLowerCase()))
                          .map((ld) => {
                            const active = todo.labels.some((l) => l.labelDef.id === ld.id)
                            return (
                              <div key={ld.id} className="group flex items-center gap-1.5">
                                <button
                                  onClick={() => toggleLabel(ld.id)}
                                  className="flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--ap-bg-hover)] transition-colors"
                                >
                                  <span className="h-6 flex-1 min-w-0 rounded-[4px] px-2 py-0.5 text-[11px] font-600 text-white truncate text-left" style={{ background: ld.color }}>
                                    {ld.name}
                                  </span>
                                  {active && <Check className="h-3.5 w-3.5 text-[var(--ap-accent)] shrink-0" />}
                                </button>
                                <button
                                  onClick={() => deleteLabel(ld.id)}
                                  title="Delete label"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--ap-fg-subtle)] hover:text-[var(--ap-danger)] p-1"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )
                          })}
                        {labelDefs.length === 0 && <p className="text-[11px] text-[var(--ap-fg-subtle)] px-2 py-1">No labels yet — create one below.</p>}
                      </div>

                      <div className="mt-3 pt-3 border-t border-[var(--ap-border)]">
                        <p className="pb-1.5 text-[10px] font-700 uppercase tracking-[0.06em] text-[var(--ap-fg-subtle)]">Create label</p>
                        <input
                          value={newLabelName}
                          onChange={(e) => setNewLabelName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') createLabel() }}
                          placeholder="Label name…"
                          className="ap-input h-7 w-full text-[12px] py-0"
                        />
                        <div className="mt-2 grid grid-cols-5 gap-1.5">
                          {LABEL_COLORS.map((c) => (
                            <button
                              key={c}
                              onClick={() => setNewLabelColor(c)}
                              className={cn('h-6 rounded-[4px] border-2 transition-transform hover:scale-105', newLabelColor === c ? 'border-[var(--ap-fg)]' : 'border-transparent')}
                              style={{ background: c }}
                              title={c}
                            />
                          ))}
                        </div>
                        <button
                          onClick={createLabel}
                          disabled={!newLabelName.trim()}
                          className="mt-2 w-full rounded-[8px] bg-[var(--ap-accent)] px-3 py-1.5 text-[12px] font-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                        >
                          Create
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Checklist — popover */}
              <div className="relative">
                <button
                  onClick={() => setActivePanel(activePanel === 'checklist' ? null : 'checklist')}
                  className="flex w-full items-center gap-2.5 rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 py-2 text-left text-[12px] font-500 text-[var(--ap-fg)] hover:border-[var(--ap-accent)] hover:shadow-sm transition-all"
                >
                  <CheckSquare className="h-3.5 w-3.5" /> Checklist
                </button>
                {activePanel === 'checklist' && (
                  <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setActivePanel(null)} />
                    <div className="absolute right-0 top-full z-[91] mt-1.5 w-[240px] rounded-[12px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-2 shadow-[var(--ap-shadow-lg)]">
                      <p className="px-2 pb-1 text-[10px] font-700 uppercase tracking-[0.06em] text-[var(--ap-fg-subtle)]">New checklist</p>
                      <div className="flex gap-1.5">
                        <input
                          autoFocus
                          value={newChecklistTitle}
                          onChange={(e) => setNewChecklistTitle(e.target.value)}
                          placeholder="Title…"
                          className="ap-input flex-1 h-7 text-[12px] py-0"
                          onKeyDown={(e) => { if (e.key === 'Enter') addChecklist() }}
                        />
                        <button onClick={addChecklist} className="ap-btn ap-btn-primary ap-btn-sm">Add</button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Dates — Trello-style popover with start + due date and optional times */}
              <div className="relative">
                <button
                  onClick={() => setActivePanel(activePanel === 'dates' ? null : 'dates')}
                  className="flex w-full items-center gap-2.5 rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 py-2 text-left text-[12px] font-500 text-[var(--ap-fg)] hover:border-[var(--ap-accent)] hover:shadow-sm transition-all"
                >
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 min-w-0 truncate">
                    {todo.dueDate || todo.startDate ? (
                      <>
                        {todo.startDate ? format(new Date(todo.startDate), 'MMM d') : '—'}
                        {todo.startTime ? `, ${to12h(todo.startTime)}` : ''}
                        <span className="text-[var(--ap-fg-subtle)]"> → </span>
                        {todo.dueDate ? format(new Date(todo.dueDate), 'MMM d, yyyy') : '—'}
                        {todo.endTime ? `, ${to12h(todo.endTime)}` : ''}
                      </>
                    ) : (
                      'Dates'
                    )}
                  </span>
                </button>
                {activePanel === 'dates' && (
                  <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setActivePanel(null)} />
                    <DatesPanel
                      startDate={todo.startDate}
                      dueDate={todo.dueDate}
                      startTime={todo.startTime}
                      endTime={todo.endTime}
                      onSave={(v) => { patch(v); setActivePanel(null) }}
                      onRemove={() => patch({ startDate: null, dueDate: null, startTime: null, endTime: null })}
                      onClose={() => setActivePanel(null)}
                    />
                  </>
                )}
              </div>

              {/* Attach */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-2.5 rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 py-2 text-left text-[12px] font-500 text-[var(--ap-fg)] hover:border-[var(--ap-accent)] hover:shadow-sm transition-all"
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

              {/* Cover — popover */}
              <div className="relative">
                <button
                  onClick={() => setActivePanel(activePanel === 'cover' ? null : 'cover')}
                  className="flex w-full items-center gap-2.5 rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 py-2 text-left text-[12px] font-500 text-[var(--ap-fg)] hover:border-[var(--ap-accent)] hover:shadow-sm transition-all"
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Cover
                </button>
                {activePanel === 'cover' && (
                  <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setActivePanel(null)} />
                    <div className="absolute right-0 top-full z-[91] mt-1.5 w-[220px] rounded-[12px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-2 shadow-[var(--ap-shadow-lg)]">
                      <p className="px-1 pb-2 text-[10px] font-700 uppercase tracking-[0.06em] text-[var(--ap-fg-subtle)]">Cover color</p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {COVER_COLORS.map((color, i) => (
                          <button
                            key={i}
                            onClick={() => { patch({ coverColor: color }); setActivePanel(null) }}
                            className={cn('h-7 w-full rounded-md border-2 transition-transform hover:scale-110', todo.coverColor === color ? 'border-[var(--ap-fg)]' : 'border-transparent')}
                            style={{ background: color ?? 'transparent', border: color ? undefined : '2px dashed var(--ap-border)' }}
                            title={color ?? 'Remove cover'}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="!mt-5 border-t border-[var(--ap-border)] pt-3 space-y-2">
                <p className="text-[10px] font-700 uppercase tracking-[0.06em] text-[var(--ap-fg-subtle)]">Actions</p>
                <button
                  onClick={() => { patch({ status: 'COMPLETED' }) }}
                  className="flex w-full items-center gap-2.5 rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 py-2 text-left text-[12px] font-600 text-[var(--ap-ok)] hover:border-[var(--ap-ok)] hover:bg-[var(--ap-ok-bg)] transition-all"
                >
                  <Check className="h-3.5 w-3.5" /> Mark done
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('Delete this card?')) return
                    await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' })
                    onUpdated?.(); onClose()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 py-2 text-left text-[12px] font-600 text-[var(--ap-danger)] hover:border-[var(--ap-danger)] hover:bg-[var(--ap-danger-bg)] transition-all"
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
