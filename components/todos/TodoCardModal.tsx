'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X, Check, Plus, Trash2, Paperclip, Tag, Users, Calendar,
  ChevronDown, AlignLeft, MessageSquare, Activity, MoreHorizontal,
  CheckSquare, Image as ImageIcon, File as FileIcon, AlertCircle,
  Link2, Target, Search, ExternalLink, Eye, EyeOff, Pencil, Clock, Archive,
} from 'lucide-react'
import { format, isPast, isToday, isTomorrow, isYesterday, formatDistanceToNow, differenceInCalendarDays, startOfToday } from 'date-fns'
import { cn } from '@/lib/utils'
import { userColor, userInitials } from '@/lib/user-color'
import { TODO_STATUS_META, BOARD_STATUSES, todoStatusMeta } from '@/lib/todo-status'
import { MentionEditor } from './MentionEditor'
import RichTextContent from '@/components/shared/RichTextContent'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ActionsMenu } from '@/components/ui/ActionsMenu'
import { Modal } from '@/components/ui/Modal'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AppleDatePicker, toIso } from '@/components/ui/date-picker'
import { CARD_PALETTE, swatchStyle, readableInk } from '@/lib/card-visuals'
import { DUE_REMINDERS } from '@/lib/todos/due-reminders'
import { useUserPrefsStore } from '@/lib/stores/user-prefs-store'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'
import { announce } from '@/components/shared/LiveAnnouncer'
import { dueTone, DUE_TONE_STYLE } from '@/lib/todos/due-tone'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TodoCardData {
  id: string
  /** Short, stable reference rendered as "#482". */
  cardNumber?: number | null
  /** Non-null when soft-archived. */
  archivedAt?: string | null
  title: string
  description: string | null
  status: string
  /** Prisma scalar, spread by GET /api/todos/[id]. Drives the "added … by …" line. */
  createdAt?: string | null
  priority: string
  sprintId: string | null
  sprint?: { id: string; name: string; state: string; startDate?: string | null; endDate?: string | null } | null
  dueReminder?: string | null
  columnId: string | null
  coverColor: string | null
  /** 'BAND' | 'FULL' — null behaves as BAND. */
  coverSize: string | null
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
/**
 * Retargeted onto the status tokens (§2 / §2.11). The design asks for four
 * bespoke hues, two of which have no token — per Decision 0 the existing
 * four-step semantics win, so Low maps to `--ap-none` and High to `--ap-danger`
 * rather than inventing cyan and orange-red.
 */
const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'var(--ap-none)',
  MEDIUM: 'var(--ap-warn)',
  HIGH: 'var(--ap-danger)',
  URGENT: 'var(--ap-ahead)',
}
// Trello-style label palette — kept short so the popover stays scannable.
// Labels and covers draw from the same ten swatches (lib/card-visuals.ts), so a
// label colour and a cover colour can never disagree. They used to be two
// separate arrays of raw hex here.
const LABEL_COLORS = CARD_PALETTE.map((sw) => sw.hex)
const COVER_COLORS = CARD_PALETTE.map((sw) => sw.hex)

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
  // Colour comes from the shared tone so this badge agrees with the board card,
  // the to-do row and the reminder system. It previously painted "due tomorrow"
  // GREEN, which reads as complete; green is now reserved for `done`.
  const tone = dueTone({ dueDate, endTime })

  // The design leads with the date and trails the relative note — "May 22 ·
  // overdue by 3 days" — which reads better than a bare "Overdue" prefix,
  // because the date is the fact and the lateness is the commentary.
  const days = differenceInCalendarDays(startOfToday(), d)
  const note = tone === 'overdue'
    ? (days === 1 ? 'overdue by 1 day' : `overdue by ${days} days`)
    : isToday(d) ? 'due today'
    : isTomorrow(d) ? 'due tomorrow'
    : null

  return (
    <span
      className="inline-flex h-7 items-center gap-1.5 rounded-[var(--ap-radius-xs)] px-2.5 text-[12.5px] font-semibold"
      style={DUE_TONE_STYLE[tone]}
    >
      <Calendar className="h-3.5 w-3.5" />
      {format(d, 'MMM d')}
      {endTime ? `, ${to12h(endTime)}` : ''}
      {note && <span className="font-medium opacity-85"> · {note}</span>}
    </span>
  )
}

/**
 * Neutral chrome, coloured dot — the design's metadata-line control. The native
 * <select> stays as the overlay: it is keyboard- and screen-reader-complete for
 * free, and it cannot collide with `activePanel`'s single popover slot.
 */
function StatusPill({ status, onChange }: { status: string; onChange: (v: string) => void }) {
  const meta = todoStatusMeta(status)
  return (
    <label
      className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--ap-radius-xs)] border border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] px-2 text-[12.5px] font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)]"
    >
      <span className="size-[7px] rounded-full" style={{ background: meta.dot }} />
      {meta.label}
      <ChevronDown className="h-3 w-3 opacity-50" />
      <select
        value={status}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Card status"
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{TODO_STATUS_META[s].label}</option>)}
      </select>
    </label>
  )
}

function PriorityPill({ priority, onChange }: { priority: string; onChange: (v: string) => void }) {
  const dot = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.MEDIUM
  return (
    <label
      className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--ap-radius-xs)] border border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] px-2.5 text-[12.5px] font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)]"
    >
      <span className="size-[9px] rounded-full" style={{ background: dot }} />
      {priority}
      <ChevronDown className="h-3 w-3 opacity-50" />
      <select
        value={priority}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Card priority"
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
    <div className={cn(
      'overflow-hidden rounded-[var(--ap-radius-card)] bg-[var(--ap-bg-sunken)]',
      linked ? 'border border-[var(--ap-border)]' : 'border border-dashed border-[var(--ap-border-strong)]',
    )}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--ap-radius-sm)] bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]">
          <Target className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <Eyebrow size="md" mono className="text-[var(--ap-fg-subtle)]">Linked OKR</Eyebrow>
          {linked ? (
            <div className="mt-0.5 min-w-0">
              <p className="truncate text-[13px] font-semibold text-[var(--ap-fg)]">
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
              className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-2.5 text-[11px] font-semibold text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          )}
          <button
            onClick={p.onToggle}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-2.5 text-[11px] font-semibold text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
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
              className="w-full rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] pl-9 pr-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[var(--ap-accent)] focus:border-transparent"
            />
          </div>
          {linked && (
            <button
              onClick={p.onUnlink}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[var(--ap-danger)] hover:bg-[var(--ap-danger-bg)] transition-colors"
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
                <Eyebrow size="md" mono className="px-2 pb-1 text-[var(--ap-fg-subtle)]">Key results</Eyebrow>
                <div className="space-y-1">
                  {p.results.keyResults.map((kr) => (
                    <button
                      key={kr.id}
                      onClick={() => p.onPickKr(kr.id)}
                      className="flex w-full items-center gap-3 rounded-[var(--ap-radius-sm)] px-2 py-2 text-left hover:bg-[var(--ap-bg-hover)] transition-colors"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ap-radius-xs)] bg-[var(--ap-accent-soft)] text-[var(--ap-accent)] text-[11px] font-bold">KR</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-[var(--ap-fg)]">{kr.title}</p>
                        <p className="truncate text-[11px] text-[var(--ap-fg-subtle)]">{kr.objective.title} · {Math.round(kr.progress ?? 0)}%</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {p.results.objectives.length > 0 && (
              <div>
                <Eyebrow size="md" mono className="px-2 pb-1 text-[var(--ap-fg-subtle)]">Objectives</Eyebrow>
                <div className="space-y-1">
                  {p.results.objectives.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => p.onPickObjective(o.id)}
                      className="flex w-full items-center gap-3 rounded-[var(--ap-radius-sm)] px-2 py-2 text-left hover:bg-[var(--ap-bg-hover)] transition-colors"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ap-radius-xs)] bg-[var(--ap-ahead-bg)] text-[var(--ap-ahead-fg)] text-[11px] font-bold">O</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-[var(--ap-fg)]">{o.title}</p>
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
    <div className="flex items-center gap-2.5">
      <span className="w-10 shrink-0 text-right font-mono text-[11px] text-[var(--ap-fg-subtle)]">{done}/{items.length}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--ap-kr-bar-bg)]">
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
      <div className="rounded-[var(--ap-radius-md)] border border-dashed border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-4 py-8 text-center">
        <p className="text-[13px] font-semibold text-[var(--ap-fg)]">No activity yet</p>
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
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.6px] text-[var(--ap-fg-subtle)]">{g.label}</p>
          <ol className="space-y-2">
            {g.entries.map((log) => (
              <li key={log.id} className="flex items-start gap-2.5">
                <Avatar id={log.actor?.id} name={log.actor?.name ?? 'System'} avatar={log.actor?.avatar} size={24} />
                <div className="flex-1 min-w-0 text-[12px] text-[var(--ap-fg)]">
                  <span className="font-semibold">{log.actor?.name ?? 'System'}</span>{' '}
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
  dueReminder: string | null
  /** Sprint window, used only for the non-blocking out-of-range warning (DTE-7). */
  sprintWindow?: { name: string; startDate: string | null; endDate: string | null } | null
  onSave: (v: {
    startDate: string | null; dueDate: string | null
    startTime: string | null; endTime: string | null
    dueReminder: string | null
  }) => void
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
  // A date-only "YYYY-MM-DD" is taken literally — it has no timezone to honour.
  // NOTE the anchor: this regex used to be unanchored, so it also matched the
  // first ten characters of a full ISO datetime and read the **UTC** calendar
  // day. Everything else in the card (the due badge, due-tone) parses the same
  // value as a Date and reads the **local** day, so east of UTC a card due at
  // local midnight showed one day in the badge and the day before in this
  // panel — and saving would have written that wrong day back.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  const d = new Date(s)
  // Normalise a full datetime to its LOCAL calendar day, matching the badge.
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate())
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
  // "Sep 14" — the design's summary format. A slashed M/D/YYYY in a row that is
  // read, not typed into, is just noise.
  return d ? `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}` : ''
}
function to12h(t: string | null): string {
  if (!t) return ''
  const [hh, mm] = t.split(':')
  let h = parseInt(hh, 10)
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${mm} ${ap}`
}

/**
 * Times offered by the date rows. A bare `<input type="time">` shows "--:-- --"
 * until it is touched, gives no hint of the expected format, and on most
 * browsers needs three separate keystroke groups to fill. A half-hour list is
 * what people actually pick, and "All day" is a real answer rather than an
 * empty field.
 */
const TIME_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All day' },
  ...Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2)
    const m = i % 2 ? '30' : '00'
    const value = `${String(h).padStart(2, '0')}:${m}`
    const h12 = h % 12 === 0 ? 12 : h % 12
    return { value, label: `${h12}:${m} ${h < 12 ? 'AM' : 'PM'}` }
  }),
]

/**
 * One date row: a checkbox to turn the date on, a label, and a readable summary
 * of what is currently set. Clicking the row makes it the target for the next
 * day picked on the calendar — so the calendar is the input and there is
 * nothing to type.
 */
function DateRow({
  label, enabled, onEnabledChange, active, onActivate,
  dateStr, time, onTimeChange, onClear,
}: {
  label: string
  enabled: boolean
  onEnabledChange: (v: boolean) => void
  active: boolean
  onActivate: () => void
  dateStr: string | null
  time: string
  onTimeChange: (v: string) => void
  onClear: () => void
}) {
  const summary = dateStr
    ? `${fmtMd(dateStr)}${time ? ` · ${to12h(time)}` : ''}`
    : '— —'
  return (
    <div
      className={cn(
        'rounded-[var(--ap-radius-sm)] border px-2.5 py-2 transition-colors',
        active
          ? 'border-[1.5px] border-[var(--ap-focus)] bg-[var(--ap-accent-soft)]'
          : 'border-[var(--ap-border)] hover:bg-[var(--ap-bg-hover)]',
        enabled ? 'cursor-pointer' : 'cursor-pointer opacity-70',
      )}
      onClick={onActivate}
    >
      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => { onEnabledChange(e.target.checked); if (e.target.checked) onActivate() }}
          onClick={(e) => e.stopPropagation()}
          className="size-4 shrink-0 cursor-pointer accent-[var(--ap-accent)]"
          aria-label={`Set ${label.toLowerCase()}`}
        />
        <span className={cn('text-[13px]', active ? 'font-semibold text-[var(--ap-fg)]' : 'text-[var(--ap-fg-muted)]')}>
          {label}
        </span>
        <span className="ml-auto font-mono text-[11px] text-[var(--ap-fg-subtle)]">{summary}</span>
      </div>

      {/* Time only becomes relevant once there is a date to attach it to. */}
      {enabled && dateStr && (
        <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--ap-fg-subtle)]" aria-hidden />
          <select
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className="ap-input h-7 flex-1 py-0 text-[12px]"
            aria-label={`${label} time`}
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t.value || 'all-day'} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-[var(--ap-radius-xs)] px-2 py-1 text-[11px] font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-danger-bg)] hover:text-[var(--ap-danger-fg)]"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

function DatesPanel({ startDate, dueDate, startTime, endTime, dueReminder, sprintWindow, onSave, onRemove, onClose }: DatesPanelProps) {
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
  const [reminderVal, setReminderVal] = useState<string>(dueReminder ?? '')
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

  // DTE-6 — due must be on or after start. Blocked with a message rather than
  // silently corrected, so the user sees which of the two dates to fix.
  const rangeInvalid =
    startEnabled && dueEnabled && !!startD && !!dueD && dueD.getTime() < startD.getTime()

  // DTE-7 — dates outside the sprint window are allowed, but worth flagging.
  const outsideSprint = (() => {
    if (!sprintWindow?.startDate || !sprintWindow?.endDate) return false
    const ws = parseYmd(sprintWindow.startDate)
    const we = parseYmd(sprintWindow.endDate)
    if (!ws || !we) return false
    const picks = [startEnabled ? startD : null, dueEnabled ? dueD : null].filter(Boolean) as Date[]
    return picks.some((d) => d.getTime() < ws.getTime() || d.getTime() > we.getTime())
  })()

  const save = () => {
    if (rangeInvalid) return
    onSave({
      startDate: startEnabled ? startStr : null,
      dueDate: dueEnabled ? dueStr : null,
      startTime: startEnabled ? (startTimeVal || null) : null,
      endTime: dueEnabled ? (endTimeVal || null) : null,
      // A reminder without a due date has nothing to count back from.
      dueReminder: dueEnabled ? (reminderVal || null) : null,
    })
  }

  return (
    <div>

      <div className="flex items-center justify-between px-1">
        <div className="flex gap-0.5">
          <button onClick={() => stepYear(-1)} className="size-6 inline-flex items-center justify-center rounded-[var(--ap-radius-xs)] hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Previous year">«</button>
          <button onClick={() => stepMonth(-1)} className="size-6 inline-flex items-center justify-center rounded-[var(--ap-radius-xs)] hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Previous month">‹</button>
        </div>
        <p className="text-[13px] font-semibold text-[var(--ap-fg)]">{MONTHS[viewMonth]} {viewYear}</p>
        <div className="flex gap-0.5">
          <button onClick={() => stepMonth(1)} className="size-6 inline-flex items-center justify-center rounded-[var(--ap-radius-xs)] hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Next month">›</button>
          <button onClick={() => stepYear(1)} className="size-6 inline-flex items-center justify-center rounded-[var(--ap-radius-xs)] hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Next year">»</button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] font-bold text-[var(--ap-fg-muted)] py-1">{w}</div>
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
                'h-8 w-full rounded-[var(--ap-radius-xs)] text-[12px] font-medium transition-colors',
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

      {/* Date rows.
          These used to be a free-text "M/D/YYYY" field parsed with `new Date()`
          plus a bare <input type="time">, which renders as "--:-- --" until
          touched and gives no hint of the expected format. The calendar above is
          the input now: the row shows a readable summary and clicking it makes
          it the target for the next day you pick. Time moved to an explicit
          picker that only appears once the date is on. */}
      <div className="mt-3 space-y-1.5">
        <DateRow
          label="Start date"
          enabled={startEnabled}
          onEnabledChange={setStartEnabled}
          active={activeTarget === 'start'}
          onActivate={() => setActiveTarget('start')}
          dateStr={startStr}
          time={startTimeVal}
          onTimeChange={setStartTimeVal}
          onClear={() => { setStartStr(null); setStartTimeVal('') }}
        />
        <DateRow
          label="Due date"
          enabled={dueEnabled}
          onEnabledChange={setDueEnabled}
          active={activeTarget === 'due'}
          onActivate={() => setActiveTarget('due')}
          dateStr={dueStr}
          time={endTimeVal}
          onTimeChange={setEndTimeVal}
          onClear={() => { setDueStr(null); setEndTimeVal('') }}
        />
      </div>

      {/* Recurring (DTE-5) — specified but deferred: it needs a recurrence engine
          and a generator cron that no module has yet. Rendered disabled so the
          capability is visible and honestly labelled, matching how
          GenerateSprintModal handles its unbuilt MANUAL scope. */}
      <div className="mt-3">
        <label htmlFor="recurring" className="mb-1 block text-[11px] font-bold text-[var(--ap-fg)]">Recurring</label>
        <select
          id="recurring"
          disabled
          value="never"
          className="ap-input h-8 w-full text-[12px] py-0 disabled:opacity-50"
          title="Recurring tasks are not available yet"
        >
          <option value="never">Never — coming soon</option>
        </select>
      </div>

      {/* Reminder (DTE-4) */}
      <div className="mt-3">
        <label htmlFor="due-reminder" className="mb-1 block text-[11px] font-bold text-[var(--ap-fg)]">
          Set due date reminder
        </label>
        <select
          id="due-reminder"
          value={reminderVal}
          disabled={!dueEnabled}
          onChange={(e) => setReminderVal(e.target.value)}
          className="ap-input h-8 w-full text-[12px] py-0 disabled:opacity-50"
        >
          <option value="">None</option>
          {DUE_REMINDERS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-[var(--ap-fg-subtle)]">
          Reminders go to all members and watchers of this card.
        </p>
      </div>

      {rangeInvalid && (
        <p className="mt-3 text-[11px] font-semibold" style={{ color: 'var(--ap-danger-fg)' }}>
          Due date must be on or after the start date.
        </p>
      )}
      {!rangeInvalid && outsideSprint && (
        <p
          className="mt-3 rounded-[var(--ap-radius-xs)] px-2 py-1.5 text-[11px]"
          style={{ background: 'var(--ap-warn-bg)', color: 'var(--ap-warn-fg)' }}
        >
          This is outside the sprint window ({fmtMd(sprintWindow?.startDate ?? null)} – {fmtMd(sprintWindow?.endDate ?? null)}).
        </p>
      )}

      <div className="mt-4 space-y-2">
        <button
          onClick={save}
          disabled={rangeInvalid}
          className="w-full rounded-[var(--ap-radius-sm)] bg-[var(--ap-accent)] px-3 py-2 text-[13px] font-semibold text-[var(--ap-accent-fg)] transition-colors hover:bg-[var(--ap-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => { onRemove(); onClose() }}
          className="w-full rounded-[var(--ap-radius-sm)] border border-[var(--ap-border-strong)] bg-transparent px-3 py-2 text-[13px] font-semibold text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
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
  /**
   * @deprecated Vestigial. Drawer mode had no call sites and was deleted in the
   * design refresh (§6.4) — the card is always a centred modal. The prop is
   * kept, narrowed to its only legal value, purely so the one call site that
   * still passes `mode="modal"` keeps type-checking. Drop it there and this
   * can go too.
   */
  mode?: 'modal'
}

export function TodoCardModal({ todoId, currentUserId, onClose, onUpdated }: Props) {
  const [todo, setTodo] = useState<TodoCardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState<CommentData[]>([])
  const [activityLogs, setActivityLogs] = useState<ActivityLogData[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const commentFileInputRef = useRef<HTMLInputElement>(null)
  const [labelDefs, setLabelDefs] = useState<LabelDef[]>([])
  const [activePanel, setActivePanel] = useState<'description' | 'checklist' | 'members' | 'labels' | 'cover' | 'link' | 'dates' | null>(null)
  /**
   * Which trigger opened the panel. Members, Labels and Dates each have two —
   * the attribute-grid control and the rail row — and a popover must open at
   * the control you actually pressed. Sharing one anchor meant pressing
   * "Labels" in the rail on the right opened the panel against the grid on the
   * far left, which reads as a misplaced popover. */
  const [panelAnchor, setPanelAnchor] = useState<'grid' | 'rail'>('grid')
  /** Open `panel` anchored at `anchor`, or close it if that pair is already open. */
  const togglePanel = useCallback((panel: typeof activePanel, anchor: 'grid' | 'rail') => (open: boolean) => {
    setPanelAnchor(anchor)
    setActivePanel(open ? panel : null)
  }, [])
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
  const [newLabelColor, setNewLabelColor] = useState(CARD_PALETTE[0].hex)
  const [labelSearch, setLabelSearch] = useState('')
  const [newItemTitles, setNewItemTitles] = useState<Record<string, string>>({})
  const [submittingComment, setSubmittingComment] = useState(false)
  const { users } = useUsersForSelection()
  const { data: session } = useSession()
  const sessionRole = session?.user?.role
  const colorBlind = useUserPrefsStore((st) => st.colorBlindMode)
  const setColorBlindMode = useUserPrefsStore((st) => st.setColorBlindMode)
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

  // Escape is Radix's job: the shared Modal dismisses only the topmost layer,
  // so a popover, dropdown or inline rename swallows its own Escape without
  // taking the card down with it. The hand-rolled window listener that used to
  // live here was guarded by `mode !== 'drawer'` and therefore never ran.

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

  // ── Comments + activity rail (CDM-5 / CDM-6) ──────────────────────────────
  const HIDE_DETAILS_KEY = 'card-hide-activity-details-v1'
  const [hideDetails, setHideDetails] = useState(false)
  const [editingComment, setEditingComment] = useState<{ id: string; content: string } | null>(null)

  // Per-viewer preference, so the rail opens the way they left it.
  useEffect(() => {
    try { setHideDetails(window.localStorage.getItem(HIDE_DETAILS_KEY) === '1') } catch { /* private mode */ }
  }, [])
  const toggleHideDetails = () => {
    setHideDetails((prev) => {
      const next = !prev
      try { window.localStorage.setItem(HIDE_DETAILS_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

  /** Author, ADMIN and EXECUTIVE may moderate — mirrors the server check so the
   *  UI never offers an action the API will refuse. */
  const canModerate = (authorId: string) =>
    authorId === currentUserId || sessionRole === 'ADMIN' || sessionRole === 'EXECUTIVE'

  const saveCommentEdit = async () => {
    if (!editingComment || !todo) return
    const content = editingComment.content.trim()
    if (!content) return
    const res = await fetch(`/api/todos/${todo.id}/comments/${editingComment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) { toast.error(json.error || 'Could not save the comment'); return }
    setComments((list) => list.map((c) => (c.id === editingComment.id ? { ...c, ...json.data } : c)))
    setEditingComment(null)
    announce('Comment updated')
  }

  const deleteComment = async (commentId: string) => {
    if (!todo) return
    const prev = comments
    setComments((list) => list.filter((c) => c.id !== commentId))   // optimistic
    const res = await fetch(`/api/todos/${todo.id}/comments/${commentId}`, { method: 'DELETE' })
    if (!res.ok) {
      setComments(prev)
      toast.error('Could not delete the comment')
      return
    }
    announce('Comment deleted')
  }

  // ── Share + delete ────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmLabel, setConfirmLabel] = useState<LabelDef | null>(null)

  /**
   * SHR-1 — copies an ordinary in-app deep link. No token is minted and no new
   * access path is created: the recipient must sign in and independently pass
   * the sprint's existing permission check.
   */
  const copyCardLink = async () => {
    if (!todo) return
    try {
      const res = await fetch(`/api/todos/${todo.id}/share`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not share this card')
      await navigator.clipboard.writeText(`${window.location.origin}${json.data.path}`)
      toast.success('Card link copied')
      announce('Card link copied to clipboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not copy the link')
    }
  }

  // ── Board lane (CDM-2) ────────────────────────────────────────────────────
  // The list chip is the only way to move a card between lists without dragging,
  // which is also the mobile path (HTML5 drag does not work on touch).
  const [lanes, setLanes] = useState<{ id: string; name: string; statusKey: string | null }[]>([])
  const [lanesLoaded, setLanesLoaded] = useState(false)

  useEffect(() => {
    const sprintId = todo?.sprintId
    if (!sprintId) { setLanes([]); setLanesLoaded(true); return }
    setLanesLoaded(false)
    let cancelled = false
    fetch(`/api/sprints/${sprintId}/columns`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled && json?.success) setLanes(json.data ?? []) })
      .catch(() => { /* non-fatal: the chip just stays hidden */ })
      .finally(() => { if (!cancelled) setLanesLoaded(true) })
    return () => { cancelled = true }
  }, [todo?.sprintId])

  const currentLane = lanes.find((l) => l.id === todo?.columnId) ?? null

  // CDM-11 — a closed sprint is read-only. The API already returns 409
  // SPRINT_CLOSED, but offering controls that always fail is worse than not
  // offering them, so the card renders as a record rather than an editor.
  const sprintClosed =
    todo?.sprint?.state === 'COMPLETED' || todo?.sprint?.state === 'CANCELLED'

  const sprintWindow = todo?.sprint
    ? {
        name: todo.sprint.name,
        startDate: todo.sprint.startDate ?? null,
        endDate: todo.sprint.endDate ?? null,
      }
    : null

  const moveToLane = async (columnId: string) => {
    const lane = lanes.find((l) => l.id === columnId)
    if (!lane) return
    // Server derives status from the lane, so we only send columnId.
    await patch({ columnId })
    announce(`Card moved to ${lane.name}`)
  }

  // ── Watch / subscribe ──
  // Backed by the generic polymorphic `Watcher` table via /api/watchers, which
  // has always supported entityType='TODO' but was never wired to any todo UI.
  // Without a way to opt in, the board's watcher badge could never light up.
  const [editingItem, setEditingItem] = useState<{ checklistId: string; itemId: string; title: string } | null>(null)
  // Per-checklist "Hide checked" (design §Review steps). View-only and local:
  // it filters what is rendered, never what is stored.
  const [hideChecked, setHideChecked] = useState<Record<string, boolean>>({})
  const [isWatching, setIsWatching] = useState(false)
  const [watchPending, setWatchPending] = useState(false)

  useEffect(() => {
    if (!todoId) { setIsWatching(false); return }
    let cancelled = false
    fetch(`/api/watchers?entityType=TODO&entityId=${todoId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.success) return
        const rows: { userId: string }[] = json.data ?? []
        setIsWatching(rows.some((w) => w.userId === currentUserId))
      })
      .catch(() => { /* non-fatal: the toggle just starts in the unwatched state */ })
    return () => { cancelled = true }
  }, [todoId, currentUserId])

  const toggleWatch = async () => {
    if (!todoId || watchPending) return
    const next = !isWatching
    setIsWatching(next)          // optimistic
    setWatchPending(true)
    try {
      const res = next
        ? await fetch('/api/watchers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityType: 'TODO', entityId: todoId }),
          })
        : await fetch(`/api/watchers?entityType=TODO&entityId=${todoId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      announce(next ? 'Watching this card' : 'Stopped watching this card')
      onUpdated?.()
    } catch {
      setIsWatching(!next)       // roll back
      toast.error(next ? 'Could not watch this card' : 'Could not unwatch this card')
    } finally {
      setWatchPending(false)
    }
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

  /**
   * Generic checklist-item PATCH. The route already accepts title, completed,
   * assigneeId and dueDate; only `completed` was ever sent from the UI, which
   * is why the per-item due-date and assign buttons sat inert.
   */
  const patchChecklistItem = async (
    checklistId: string,
    itemId: string,
    data: { title?: string; completed?: boolean; assigneeId?: string | null; dueDate?: string | null },
  ) => {
    const res = await fetch(`/api/todos/${todo!.id}/checklists/${checklistId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Could not update the item')
      return false
    }
    setTodo((t) => t ? {
      ...t,
      checklists: t.checklists.map((cl) => cl.id === checklistId
        ? { ...cl, items: cl.items.map((i) => i.id === itemId ? { ...i, ...json.data } : i) }
        : cl),
    } : t)
    return true
  }

  const toggleChecklistItem = (checklistId: string, itemId: string, completed: boolean) =>
    patchChecklistItem(checklistId, itemId, { completed })

  const deleteChecklistItem = async (checklistId: string, itemId: string) => {
    const prev = todo
    // Optimistic — the row disappears immediately, restored if the call fails.
    setTodo((t) => t ? {
      ...t,
      checklists: t.checklists.map((cl) => cl.id === checklistId
        ? { ...cl, items: cl.items.filter((i) => i.id !== itemId) }
        : cl),
    } : t)
    const res = await fetch(`/api/todos/${todo!.id}/checklists/${checklistId}/items/${itemId}`, { method: 'DELETE' })
    if (!res.ok) {
      setTodo(prev)
      toast.error('Could not delete the item')
      return
    }
    announce('Checklist item deleted')
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
  // Workspace-wide destructive action — routed through ConfirmDialog (the project
  // standard) rather than window.confirm, which states nothing about the blast
  // radius and cannot be styled or tested.
  const deleteLabel = async (id: string) => {
    const res = await fetch(`/api/todo-labels/${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.success) { toast.error(json.error ?? 'Failed to delete label'); return }
    setLabelDefs((d) => d.filter((l) => l.id !== id))
    setTodo((t) => t ? { ...t, labels: t.labels.filter((l) => l.labelDef.id !== id) } : t)
    announce('Label deleted')
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

  /**
   * Members, Labels and Dates each have two triggers but a single panel, anchored
   * in the attribute grid. Opening one from the rail therefore has to bring the
   * grid back into view, or the click looks like it did nothing on a long card.
   */
  if (!todoId) return null

  /**
   * Watch · more · close. The design parks these at the top of the right rail,
   * which is removed wholesale on a closed sprint — so the same cluster is also
   * rendered inline at the top of the left column in that one case, rather than
   * losing the only close button with the rail.
   */
  const cardActionCluster = todo ? (
    <>
      <button
        onClick={toggleWatch}
        disabled={watchPending}
        aria-label={isWatching ? 'Stop watching this card' : 'Watch this card'}
        aria-pressed={isWatching}
        title={isWatching ? 'Watching — click to stop' : 'Watch this card'}
        className={cn(
          'inline-flex h-[30px] items-center gap-1.5 rounded-[var(--ap-radius-sm)] px-2.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60',
          isWatching
            ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)] hover:bg-[var(--ap-accent-soft)]'
            : 'text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]',
        )}
      >
        {isWatching ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{isWatching ? 'Watching' : 'Watch'}</span>
      </button>
      <ActionsMenu
        label="More card actions"
        align="right"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[var(--ap-radius-sm)] text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
        trigger={<MoreHorizontal className="h-4 w-4" />}
        items={[
          {
            key: 'copy-link',
            label: 'Copy card link',
            icon: Link2,
            hidden: !todo.sprintId,
            onSelect: () => copyCardLink(),
          },
          {
            key: 'delete',
            label: 'Delete card',
            icon: Trash2,
            destructive: true,
            hidden: sprintClosed,
            onSelect: () => setConfirmDelete(true),
          },
        ]}
      />
      <button
        onClick={onClose}
        aria-label="Close"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[var(--ap-radius-sm)] text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
      >
        <X className="h-4 w-4" />
      </button>
    </>
  ) : null

  /**
   * Labels and Dates each have two triggers — the attribute-grid control and the
   * rail row — but exactly one panel, rendered at the grid anchor where there is
   * room for it. The `z-[90]` scrim / `z-[91]` panel pairing is load-bearing:
   * Radix parks dialog and popper layers at `z-50`, so anything lower would open
   * underneath the card it belongs to.
   */
  const labelsPanel = todo ? (
    <>
        <input
          value={labelSearch}
          onChange={(e) => setLabelSearch(e.target.value)}
          placeholder="Search labels…"
          className="ap-input mb-2 h-8 w-full py-0 text-[13px]"
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
                    className="flex flex-1 items-center gap-2 rounded-[var(--ap-radius-sm)] px-1.5 py-1 transition-colors hover:bg-[var(--ap-bg-hover)]"
                  >
                    <span
                      className="h-[26px] min-w-0 flex-1 truncate rounded-[var(--ap-radius-xs)] px-2.5 pt-[5px] text-left text-[12px] font-semibold"
                      style={{
                        ...swatchStyle(ld.color, { colorBlind, ink: 'rgba(255,255,255,0.5)' }),
                        color: readableInk(ld.color),
                      }}
                    >
                      {ld.name}
                    </span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--ap-accent)]" />}
                  </button>
                  <button
                    onClick={() => setConfirmLabel(ld)}
                    title="Delete label"
                    aria-label={`Delete label ${ld.name}`}
                    className="p-1 text-[var(--ap-fg-subtle)] opacity-0 transition-opacity hover:text-[var(--ap-danger)] group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          {labelDefs.length === 0 && (
            <p className="px-2 py-1 text-[12px] text-[var(--ap-fg-subtle)]">No labels yet — create one below.</p>
          )}
        </div>

        <div className="mt-3 border-t border-[var(--ap-border)] pt-3">
          <Eyebrow size="md" mono className="mb-1.5 text-[var(--ap-fg-subtle)]">Create label</Eyebrow>
          <input
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createLabel() }}
            placeholder="Label name…"
            className="ap-input h-8 w-full py-0 text-[13px]"
          />
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {CARD_PALETTE.map((sw) => (
              <button
                key={sw.key}
                onClick={() => setNewLabelColor(sw.hex)}
                aria-label={sw.label}
                aria-pressed={newLabelColor === sw.hex}
                className={cn('h-6 rounded-[var(--ap-radius-xs)] border-2 transition-transform hover:scale-105', newLabelColor === sw.hex ? 'border-[var(--ap-fg)]' : 'border-transparent')}
                style={swatchStyle(sw.hex, { colorBlind, pattern: sw.pattern, ink: 'rgba(255,255,255,0.5)' })}
                title={sw.label}
              />
            ))}
          </div>
          <button
            onClick={createLabel}
            disabled={!newLabelName.trim()}
            className="mt-2 h-8 w-full rounded-[var(--ap-radius-sm)] bg-[var(--ap-accent)] text-[13px] font-semibold text-[var(--ap-accent-fg)] transition-colors hover:bg-[var(--ap-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create
          </button>
        </div>
    </>
  ) : null

  const datesPanel = todo ? (
    <>
      <DatesPanel
        startDate={todo.startDate}
        dueDate={todo.dueDate}
        startTime={todo.startTime}
        endTime={todo.endTime}
        dueReminder={todo.dueReminder ?? null}
        sprintWindow={sprintWindow}
        onSave={(v) => { patch(v); setActivePanel(null) }}
        // DTE-8 — Remove clears both dates, both times and the reminder in one
        // request; a reminder with no due date would never fire.
        onRemove={() => patch({
          startDate: null, dueDate: null,
          startTime: null, endTime: null,
          dueReminder: null,
        })}
        onClose={() => setActivePanel(null)}
      />
    </>
  ) : null

  // CDM-1 — the card body used to sit in a hand-rolled portal with no focus
  // trap, no focus restore and no scroll lock. It renders inside the shared
  // Modal (Radix), which supplies all three.
  const body = (
      <div className="relative w-full">
        {/* ── Cover strip (taller, gradient feel) ── */}
        {todo?.coverColor && (
          <div
            className={todo.coverSize === 'FULL' ? 'h-28 w-full' : 'h-14 w-full'}
            style={swatchStyle(todo.coverColor, { colorBlind, ink: 'rgba(255,255,255,0.28)' })}
          />
        )}

        {loading && !todo ? (
          <div className="flex h-48 items-center justify-center text-[13px] text-[var(--ap-fg-subtle)]">Loading…</div>
        ) : todo ? (
          <>
          {sprintClosed && (
            <div
              className="mx-5 mt-5 flex items-center gap-2 rounded-[var(--ap-radius-sm)] px-3 py-2 text-[12px] md:mx-7"
              style={{
                background: 'var(--ap-bg-sunken)',
                border: '1px solid var(--ap-border)',
                color: 'var(--ap-fg-muted)',
              }}
              role="status"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>
                “{todo.sprint?.name}” is {todo.sprint?.state === 'COMPLETED' ? 'completed' : 'cancelled'} —
                this card is read-only.
              </span>
            </div>
          )}
          {/* Two columns, each scrolling on its own — the shell never scrolls as a
              whole, so the rail stays reachable however long the comment thread is.
              With the rail removed (closed sprint) the 232px track goes with it. */}
          <div className={cn(
            'grid grid-cols-1 items-stretch',
            !sprintClosed && 'md:grid-cols-[minmax(0,1fr)_232px]',
          )}>
            {/* ══ LEFT column ══ */}
            {/* Asymmetric right padding is deliberate: the column owns the
                scrollbar, so the gutter sits under it rather than beside it. */}
            <div className="min-w-0 space-y-6 px-5 pb-7 pt-5 md:max-h-[calc(100vh-140px)] md:overflow-y-auto md:pl-7 md:pr-2">

              {/* The rail carries watch/more/close, and the rail is gone on a
                  closed sprint — so render the same cluster here in that case. */}
              {sprintClosed && (
                <div className="flex items-center justify-end gap-0.5 md:pr-5">
                  {cardActionCluster}
                </div>
              )}

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

              {/* ── Hero: complete toggle · title · metadata line ── */}
              <div className="flex items-start gap-3">
                <button
                  onClick={() => {
                    const next = todo.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
                    patch({ status: next })
                    announce(next === 'COMPLETED' ? 'Card marked complete' : 'Card reopened')
                  }}
                  disabled={sprintClosed}
                  aria-label={todo.status === 'COMPLETED' ? 'Mark as not complete' : 'Mark complete'}
                  aria-pressed={todo.status === 'COMPLETED'}
                  title={todo.status === 'COMPLETED' ? 'Completed — click to reopen' : 'Mark complete'}
                  className={cn(
                    'mt-[3px] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    todo.status === 'COMPLETED'
                      ? 'border-[var(--ap-ok)] bg-[var(--ap-ok)] text-white'
                      : 'border-[1.5px] border-[var(--ap-border-strong)] bg-transparent text-[var(--ap-ok)] hover:border-[var(--ap-ok)] hover:bg-[var(--ap-ok-bg)]',
                  )}
                >
                  <Check
                    className={cn('h-[15px] w-[15px]', todo.status !== 'COMPLETED' && 'opacity-35')}
                    strokeWidth={3.2}
                  />
                </button>

                <div className="min-w-0 flex-1">
                  {editingTitle ? (
                    <textarea
                      ref={titleRef}
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onBlur={saveTitle}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTitle() } if (e.key === 'Escape') setEditingTitle(false) }}
                      rows={2}
                      className="w-full resize-none rounded-[var(--ap-radius-sm)] border-2 border-[var(--ap-focus)] bg-[var(--ap-bg-raised)] px-2 py-1 text-[23px] font-semibold leading-[1.25] tracking-[-0.015em] text-[var(--ap-fg)] outline-none"
                      autoFocus
                    />
                  ) : (
                    <h2
                      className="-mx-2 cursor-text rounded-[var(--ap-radius-sm)] px-2 py-1 text-[23px] font-semibold leading-[1.25] tracking-[-0.015em] text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]"
                      onClick={() => setEditingTitle(true)}
                    >
                      {todo.title}
                    </h2>
                  )}

                  {/* Metadata line. No card-ID chip: `Todo` has no such field and
                      A plain sequence, not a prefixed code: a prefix would be
                      frozen at creation, so a card that later moved sprints
                      would carry the wrong letters forever. */}
                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-[12.5px] text-[var(--ap-fg-subtle)]">
                    {todo.cardNumber != null && (
                      <span
                        className="rounded-[4px] bg-[var(--ap-bg-sunken)] px-1.5 py-[3px] font-mono text-[11px] tracking-[0.02em] text-[var(--ap-fg-subtle)]"
                        title="Card reference"
                      >
                        #{todo.cardNumber}
                      </span>
                    )}
                    {lanes.length > 0 && !sprintClosed && (
                      <>
                        <span>in list</span>
                        <ActionsMenu
                          label={`Move card. Currently in ${currentLane?.name ?? 'no list'}`}
                          align="left"
                          className="inline-flex h-7 items-center gap-1.5 rounded-[var(--ap-radius-xs)] border border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] px-2 text-[12.5px] font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
                          trigger={
                            <>
                              <span>{currentLane?.name ?? 'No list'}</span>
                              <ChevronDown className="h-3 w-3 opacity-50" />
                            </>
                          }
                          items={lanes.map((l) => ({
                            key: l.id,
                            label: l.name,
                            disabled: l.id === todo.columnId,
                            onSelect: () => moveToLane(l.id),
                          }))}
                        />
                      </>
                    )}
                    {/* One status control, not two. With lanes present the list chip
                        IS the status control — a lane carries its statusKey, so moving
                        lists sets status and setting status moves the card. Rendering
                        both showed "To Do" twice and let them disagree. Without lanes
                        (todos page, work board) the pill is the only way to set it. */}
                    {lanesLoaded && lanes.length === 0 && (
                      <StatusPill status={todo.status} onChange={(v) => patch({ status: v })} />
                    )}
                    {todo.createdAt && (
                      <>
                        <span className="opacity-50">·</span>
                        <span>added {format(new Date(todo.createdAt), 'MMM d')} by {todo.creator.name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Attribute grid ── */}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(192px,1fr))] gap-x-5 gap-y-4">
                {/* Members */}
                <div>
                  <Eyebrow size="md" mono className="mb-2 text-[var(--ap-fg-subtle)]">Members</Eyebrow>
                  <div className="relative flex items-center">
                    <div className="flex -space-x-1.5">
                      {todo.members.map((m) => (
                        <Avatar key={m.user.id} id={m.user.id} name={m.user.name} avatar={m.user.avatar} size={28} />
                      ))}
                    </div>
                    <Popover
                      open={activePanel === 'members' && panelAnchor === 'grid'}
                      onOpenChange={togglePanel('members', 'grid')}
                    >
                      <PopoverTrigger asChild>
                        <button
                          className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-[var(--ap-border-strong)] text-[var(--ap-fg-muted)] transition-colors hover:border-[var(--ap-accent)] hover:text-[var(--ap-accent)]"
                          title="Add member"
                          aria-label="Add member"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent label="Card members" heading="Card members" width={272} align="start">
                        <div className="max-h-[300px] space-y-px overflow-y-auto">
                          {users.map((u) => {
                            const isMember = todo.members.some((m) => m.user.id === u.id)
                            return (
                              <button
                                key={u.id}
                                onClick={() => toggleMember(u.id)}
                                className={cn('flex w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2 py-1.5 text-left text-[13px] transition-colors', isMember ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]' : 'text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)]')}
                              >
                                <Avatar id={u.id} name={u.name ?? u.email} size={26} />
                                <span className="flex-1 truncate">{u.name ?? u.email}</span>
                                {isMember && <Check className="h-3.5 w-3.5 shrink-0" />}
                              </button>
                            )
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Labels — spans two tracks, as in the design */}
                <div className="md:col-span-2">
                  <Eyebrow size="md" mono className="mb-2 text-[var(--ap-fg-subtle)]">Labels</Eyebrow>
                  <div className="relative flex flex-wrap items-center gap-1.5">
                    {todo.labels.map((l) => (
                      <span
                        key={l.labelDef.id}
                        className="inline-flex h-[26px] items-center rounded-[var(--ap-radius-xs)] px-2.5 text-[12px] font-semibold"
                        style={{
                          ...swatchStyle(l.labelDef.color, {
                            colorBlind,
                            pattern: (l.labelDef as { pattern?: string | null }).pattern,
                            ink: 'rgba(255,255,255,0.5)',
                          }),
                          // Yellow and lime are unreadable under white text.
                          color: readableInk(l.labelDef.color),
                        }}
                      >
                        {l.labelDef.name}
                      </span>
                    ))}
                    <Popover
                      open={activePanel === 'labels' && panelAnchor === 'grid'}
                      onOpenChange={togglePanel('labels', 'grid')}
                    >
                      <PopoverTrigger asChild>
                        <button
                          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[var(--ap-radius-xs)] border border-dashed border-[var(--ap-border-strong)] text-[var(--ap-fg-muted)] transition-colors hover:border-[var(--ap-accent)] hover:text-[var(--ap-accent)]"
                          title="Add labels"
                          aria-label="Add labels"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent label="Labels" heading="Labels" width={276} align="start">
                        <div className="max-h-[420px] overflow-y-auto">{labelsPanel}</div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Due date */}
                <div>
                  <Eyebrow size="md" mono className="mb-2 text-[var(--ap-fg-subtle)]">Due date</Eyebrow>
                  <div className="relative inline-block">
                    <Popover
                      open={activePanel === 'dates' && panelAnchor === 'grid'}
                      onOpenChange={togglePanel('dates', 'grid')}
                    >
                      <PopoverTrigger asChild>
                        <button
                          className={cn(
                        'inline-flex h-7 max-w-full items-center gap-1.5 rounded-[var(--ap-radius-xs)] text-[12.5px] font-semibold transition-colors',
                        // With a date set the badge brings its own chrome and padding.
                        todo.dueDate
                          ? 'hover:opacity-80'
                          : 'border border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] px-2.5 text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-hover)]',
                      )}
                          aria-label={todo.dueDate ? 'Change dates' : 'Add due date'}
                        >
                          {todo.dueDate
                            ? <DueDateBadge dueDate={todo.dueDate} endTime={todo.endTime} />
                            : <><Calendar className="h-3.5 w-3.5" /> Add due date</>}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent label="Dates" heading="Dates" width={340} align="start">
                        {datesPanel}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Priority — existing PriorityPill semantics, moved into the grid */}
                <div>
                  <Eyebrow size="md" mono className="mb-2 text-[var(--ap-fg-subtle)]">Priority</Eyebrow>
                  <PriorityPill priority={todo.priority} onChange={(v) => patch({ priority: v })} />
                </div>
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
                <div className="flex items-center gap-2.5">
                  <AlignLeft className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" />
                  <h3 className="text-[14px] font-semibold text-[var(--ap-fg-muted)]">Description</h3>
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
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={saveDescription} className="ap-btn ap-btn-primary ap-btn-sm">Save</button>
                        <button onClick={() => { setDescDraft(todo.description ?? ''); setActivePanel(null) }} className="ap-btn ap-btn-secondary ap-btn-sm">Cancel</button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="ml-auto text-[11px] text-[var(--ap-fg-muted)] underline-offset-2 hover:underline"
                            >
                              Formatting help
                            </button>
                          </PopoverTrigger>
                          <PopoverContent label="Formatting help" heading="Formatting" align="end" className="w-[260px]">
                            <ul className="space-y-1.5 text-[12px] text-[var(--ap-fg-muted)]">
                              <li><strong className="text-[var(--ap-fg)]">Bold / italic</strong> — toolbar, or ⌘B / ⌘I</li>
                              <li><strong className="text-[var(--ap-fg)]">Lists</strong> — toolbar, or start a line with <code>-</code> or <code>1.</code></li>
                              <li><strong className="text-[var(--ap-fg)]">Mention</strong> — type <code>@</code> then a name</li>
                              <li><strong className="text-[var(--ap-fg)]">Links</strong> — paste a URL over selected text</li>
                              <li><strong className="text-[var(--ap-fg)]">Save</strong> — ⌘↵ (Ctrl+↵ on Windows)</li>
                            </ul>
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setActivePanel('description')}
                    disabled={sprintClosed}
                    className="w-full rounded-[var(--ap-radius-md)] bg-[var(--ap-bg-sunken)] px-3.5 py-3 text-left text-[13.5px] leading-[1.65] text-[var(--ap-fg-subtle)] transition-colors hover:bg-[var(--ap-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sprintClosed ? 'No description' : 'Add a more detailed description…'}
                  </button>
                )}
              </div>

              {/* ── Checklists ── */}
              {todo.checklists.map((cl) => (
                <div key={cl.id} className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckSquare className="h-[15px] w-[15px] shrink-0 text-[var(--ap-fg-subtle)]" />
                      <h3 className="truncate text-[14px] font-semibold text-[var(--ap-fg)]">{cl.title}</h3>
                      <span className="shrink-0 font-mono text-[11px] text-[var(--ap-fg-subtle)]">
                        {cl.items.filter((i) => i.completed).length}/{cl.items.length}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                    {cl.items.some((i) => i.completed) && (
                      <button
                        onClick={() => setHideChecked((h) => ({ ...h, [cl.id]: !h[cl.id] }))}
                        aria-pressed={!!hideChecked[cl.id]}
                        className="inline-flex h-7 items-center rounded-[var(--ap-radius-sm)] bg-[var(--ap-bg-sunken)] px-2.5 text-[11px] font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
                      >
                        {hideChecked[cl.id] ? 'Show checked' : 'Hide checked'}
                      </button>
                    )}
                    <button
                      onClick={() => deleteChecklist(cl.id)}
                      className="inline-flex h-7 items-center gap-1 rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-2.5 text-[11px] font-semibold text-[var(--ap-fg-muted)] hover:border-[var(--ap-danger)] hover:bg-[var(--ap-danger-bg)] hover:text-[var(--ap-danger)] transition-all"
                    >
                      Delete
                    </button>
                    </div>
                  </div>
                  <ChecklistProgress items={cl.items} />
                  <div className="space-y-0.5">
                    {cl.items.filter((i) => !(hideChecked[cl.id] && i.completed)).map((item) => (
                      <div
                        key={item.id}
                        className="group flex items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2 py-1.5 hover:bg-[var(--ap-bg-hover)] transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => toggleChecklistItem(cl.id, item.id, !item.completed)}
                          className={cn(
                            'flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors',
                            item.completed
                              ? 'border-[var(--ap-ok)] bg-[var(--ap-ok)]'
                              : 'border-[var(--ap-border-strong)] bg-transparent hover:border-[var(--ap-fg-muted)]',
                          )}
                        >
                          {item.completed && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </button>
                        {editingItem?.itemId === item.id ? (
                          <input
                            autoFocus
                            value={editingItem.title}
                            onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                            onBlur={() => {
                              const next = editingItem.title.trim()
                              if (next && next !== item.title) patchChecklistItem(cl.id, item.id, { title: next })
                              setEditingItem(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
                              if (e.key === 'Escape') setEditingItem(null)
                            }}
                            aria-label="Checklist item title"
                            className="flex-1 min-w-0 rounded-[var(--ap-radius-xs)] border px-1.5 py-0.5 text-[13px] outline-none"
                            style={{ borderColor: 'var(--ap-accent)', background: 'var(--ap-bg-raised)' }}
                          />
                        ) : (
                          <span className={cn(
                            'flex-1 text-[13px] leading-snug min-w-0',
                            item.completed && 'line-through text-[var(--ap-fg-subtle)]',
                          )}>
                            {item.title}
                          </span>
                        )}
                        {item.dueDate && (
                          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-[var(--ap-bg-sunken)] px-2 py-[2px] text-[10px] font-semibold text-[var(--ap-fg-muted)]">
                            <Calendar className="h-2.5 w-2.5" />
                            {format(new Date(item.dueDate), 'MMM d')}
                          </span>
                        )}
                        {item.assignee && (
                          <Avatar id={item.assignee.id} name={item.assignee.name} avatar={item.assignee.avatar} size={20} />
                        )}
                        {/* Per-item actions. Focus-within keeps them reachable by
                            keyboard; group-hover alone would hide them from tab users.
                            They fade rather than mount: `hidden → flex` put three 24px
                            buttons into the flow on hover, so every row visibly jumped
                            as the pointer crossed it. Reserving the space costs ~80px
                            of title width and removes the reflow entirely. */}
                        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                aria-label={item.dueDate ? `Change due date for ${item.title}` : `Set due date for ${item.title}`}
                                className="flex h-6 w-6 items-center justify-center rounded-[var(--ap-radius-xs)] text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-raised)] hover:text-[var(--ap-fg)] transition-colors"
                              >
                                <Calendar className="h-3 w-3" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent label="Checklist item due date" heading="Due date" align="end" className="w-[260px]">
                              <AppleDatePicker
                                value={item.dueDate ? toIso(new Date(item.dueDate)) : null}
                                onChange={(iso) => patchChecklistItem(cl.id, item.id, { dueDate: iso })}
                                placeholder="Pick a date"
                              />
                              {item.dueDate && (
                                <button
                                  type="button"
                                  onClick={() => patchChecklistItem(cl.id, item.id, { dueDate: null })}
                                  className="mt-2 w-full rounded-[var(--ap-radius-sm)] px-2 py-1.5 text-[12px] font-semibold text-[var(--ap-danger-fg)] hover:bg-[var(--ap-danger-bg)] transition-colors"
                                >
                                  Remove due date
                                </button>
                              )}
                            </PopoverContent>
                          </Popover>

                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Assign ${item.title}`}
                                className="flex h-6 w-6 items-center justify-center rounded-[var(--ap-radius-xs)] text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-raised)] hover:text-[var(--ap-fg)] transition-colors"
                              >
                                <Users className="h-3 w-3" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent label="Assign checklist item" heading="Assign" align="end" className="w-[260px]">
                              <div className="max-h-[220px] space-y-0.5 overflow-y-auto">
                                {item.assignee && (
                                  <button
                                    type="button"
                                    onClick={() => patchChecklistItem(cl.id, item.id, { assigneeId: null })}
                                    className="flex w-full items-center gap-2 rounded-[var(--ap-radius-sm)] px-2 py-1.5 text-left text-[12px] text-[var(--ap-danger-fg)] hover:bg-[var(--ap-bg-hover)]"
                                  >
                                    Unassign
                                  </button>
                                )}
                                {users.map((u) => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => patchChecklistItem(cl.id, item.id, { assigneeId: u.id })}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-[var(--ap-radius-sm)] px-2 py-1.5 text-left text-[12px] hover:bg-[var(--ap-bg-hover)]',
                                      item.assignee?.id === u.id && 'bg-[var(--ap-bg-hover)] font-semibold',
                                    )}
                                  >
                                    <Avatar id={u.id} name={u.name ?? u.email} avatar={null} size={20} />
                                    <span className="truncate">{u.name ?? u.email}</span>
                                    {item.assignee?.id === u.id && (
                                      <Check className="ml-auto h-3 w-3 text-[var(--ap-accent)]" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>

                          <ActionsMenu
                            label={`More actions for ${item.title}`}
                            className="flex h-6 w-6 items-center justify-center rounded-[var(--ap-radius-xs)] text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-raised)] hover:text-[var(--ap-fg)] transition-colors"
                            trigger={<MoreHorizontal className="h-3 w-3" />}
                            items={[
                              {
                                key: 'rename',
                                label: 'Rename',
                                icon: Pencil,
                                onSelect: () => setEditingItem({ checklistId: cl.id, itemId: item.id, title: item.title }),
                              },
                              {
                                key: 'delete',
                                label: 'Delete item',
                                icon: Trash2,
                                destructive: true,
                                onSelect: () => deleteChecklistItem(cl.id, item.id),
                              },
                            ]}
                          />
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
                      className="flex-1 rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 h-8 text-[13px] outline-none focus:ring-2 focus:ring-[var(--ap-accent)] focus:border-transparent transition-all"
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
                    <span className="text-[12px] font-semibold text-[var(--ap-fg-muted)]">Attachments</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {todo.attachments.map((att) => {
                      const isImage = att.mimeType.startsWith('image/')
                      return (
                        <div key={att.id} className="group relative flex items-center gap-2 rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] p-2 overflow-hidden">
                          {isImage ? (
                            <img src={att.url} alt={att.filename} className="h-10 w-10 rounded-[var(--ap-radius-xs)] object-cover shrink-0" />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ap-radius-xs)] bg-[var(--ap-bg-hover)]">
                              <FileIcon className="h-5 w-5 text-[var(--ap-fg-subtle)]" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-medium text-[var(--ap-fg)]">{att.filename}</p>
                            <p className="text-[11px] text-[var(--ap-fg-subtle)]">{(att.size / 1024).toFixed(0)} KB</p>
                          </div>
                          <button
                            onClick={() => deleteAttachment(att.id)}
                            className="absolute right-1 top-1 hidden rounded-[var(--ap-radius-xs)] p-0.5 text-[var(--ap-fg-faint)] hover:text-[var(--ap-danger)] group-hover:flex transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Comments + activity ──
                   Deliberately still stacked. The design tabs them; §6.4 defers that
                   as an IA change with no functional gain, so this is a restyle of
                   the existing stack and nothing more. */}
              <div className="border-t border-[var(--ap-border)] pt-5">
                <div className="mb-3.5 flex items-center gap-2.5">
                  <MessageSquare className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" />
                  <h3 className="text-[14px] font-semibold text-[var(--ap-fg-muted)]">Comments and activity</h3>
                  <button
                    type="button"
                    onClick={toggleHideDetails}
                    aria-pressed={hideDetails}
                    className="ml-auto h-[26px] rounded-[var(--ap-radius-xs)] bg-[var(--ap-bg-sunken)] px-2.5 text-[12px] font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
                  >
                    {hideDetails ? 'Show details' : 'Hide details'}
                  </button>
                </div>

                <>
                    {/* Comment input — hidden on a closed sprint (CDM-11). */}
                    <div className={cn('space-y-2', sprintClosed && 'hidden')}>
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
                          className="inline-flex items-center gap-1 rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-2 py-1 text-[11px] text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
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
                        {/* The shortcut itself is unchanged — MentionEditor's
                            onSubmit already fires on ⌘↵ / Ctrl+↵. Only the hint is new. */}
                        <kbd className="rounded-[var(--ap-radius-xs)] bg-[var(--ap-bg-sunken)] px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-[var(--ap-fg-subtle)]">
                          ⌘↵
                        </kbd>
                      </div>
                    </div>
                    {/* Comment list */}
                    <div className="mt-4 space-y-4">
                      {comments.length === 0 && (
                        <p className="text-[12px] text-[var(--ap-fg-subtle)]">No comments yet.</p>
                      )}
                      {comments.map((c) => (
                        <div key={c.id} className="flex gap-2.5">
                          <Avatar id={c.author.id} name={c.author.name} avatar={c.author.avatar} size={30} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[13px] font-semibold text-[var(--ap-fg)]">{c.author.name}</span>
                              <span className="text-[11.5px] text-[var(--ap-fg-subtle)]">{format(new Date(c.createdAt), 'MMM d, h:mm a')}</span>
                              {canModerate(c.author.id) && editingComment?.id !== c.id && (
                                <span className="ml-auto flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingComment({ id: c.id, content: c.content })}
                                    className="text-[11px] text-[var(--ap-fg-muted)] underline-offset-2 hover:underline"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteComment(c.id)}
                                    className="text-[11px] text-[var(--ap-danger-fg)] underline-offset-2 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </span>
                              )}
                            </div>
                            {editingComment?.id === c.id ? (
                              <div className="mt-1.5">
                                <MentionEditor
                                  value={editingComment.content}
                                  onChange={(html) => setEditingComment({ id: c.id, content: html })}
                                  users={users}
                                  onSubmit={saveCommentEdit}
                                  minHeight={60}
                                  autoFocus
                                />
                                <div className="mt-1.5 flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={saveCommentEdit}
                                    className="ap-btn ap-btn-primary ap-btn-sm"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingComment(null)}
                                    className="ap-btn ap-btn-secondary ap-btn-sm"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              // SEC-6 — comment bodies are user-authored HTML from
                              // TipTap and reach every viewer of the card. They were
                              // injected raw; RichTextContent runs the DOMPurify
                              // allowlist (which keeps span+class, so mentions still
                              // style) and handles legacy plaintext comments.
                              <RichTextContent
                                html={c.content}
                                className="mt-1.5 rounded-[var(--ap-radius-md)] bg-[var(--ap-bg-sunken)] px-3.5 py-2.5 text-[13.5px] leading-[1.6] text-[var(--ap-fg-muted)] [&_.mention]:font-medium [&_.mention]:text-[var(--ap-accent)]"
                              />
                            )}
                            {c.attachments && c.attachments.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {c.attachments.map((att) => {
                                  const isImage = att.mimeType?.startsWith('image/')
                                  return isImage ? (
                                    <a key={att.id} href={att.url} target="_blank" rel="noreferrer" className="block">
                                      <img src={att.url} alt={att.filename} className="max-h-48 rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] object-cover" />
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
                {activityLogs.length > 0 && !hideDetails && (
                  <div className="mt-6 border-t border-[var(--ap-border)] pt-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-[var(--ap-fg-subtle)]" />
                      <Eyebrow size="md" mono className="text-[var(--ap-fg-subtle)]">
                        Activity ({activityLogs.length})
                      </Eyebrow>
                    </div>
                    <ActivityFeed logs={activityLogs} users={users} labelDefs={labelDefs} />
                  </div>
                )}
              </div>
            </div>

            {/* ══ RIGHT rail (232px) ══ — every control below the action row
                 mutates, so the whole rail is removed rather than disabled on a
                 closed sprint. Watch / more / close move inline in that case. */}
            <div className={cn(
              'w-full border-t border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-5 pb-7 pt-5 md:w-[232px] md:max-h-[calc(100vh-140px)] md:overflow-y-auto md:border-l md:border-t-0',
              sprintClosed && 'hidden',
            )}>
              <div className="mb-[18px] flex items-center justify-end gap-0.5">
                {cardActionCluster}
              </div>

              <Eyebrow size="md" mono className="mb-2 text-[var(--ap-fg-subtle)]">Add to card</Eyebrow>
              <div className="flex flex-col gap-0.5">
                {/* Members, Labels and Dates each render a SECOND popover here,
                    anchored to the rail row rather than to the attribute grid.
                    Same content, same `activePanel` slot — `panelAnchor` decides
                    which of the two opens, so a panel always appears at the
                    control you pressed. `side="left"` keeps it over the card
                    body instead of off the right edge of the modal. */}
                <Popover
                  open={activePanel === 'members' && panelAnchor === 'rail'}
                  onOpenChange={togglePanel('members', 'rail')}
                >
                  <PopoverTrigger asChild>
                    <button className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-[13px] font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
                      <Users className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Members
                    </button>
                  </PopoverTrigger>
                  <PopoverContent label="Card members" heading="Card members" width={272} align="start" side="left">
                    <div className="max-h-[300px] space-y-px overflow-y-auto">
                      {users.map((u) => {
                        const isMember = todo.members.some((m) => m.user.id === u.id)
                        return (
                          <button
                            key={u.id}
                            onClick={() => toggleMember(u.id)}
                            className={cn('flex w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2 py-1.5 text-left text-[13px] transition-colors', isMember ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]' : 'text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)]')}
                          >
                            <Avatar id={u.id} name={u.name ?? u.email} size={26} />
                            <span className="flex-1 truncate">{u.name ?? u.email}</span>
                            {isMember && <Check className="h-3.5 w-3.5 shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover
                  open={activePanel === 'labels' && panelAnchor === 'rail'}
                  onOpenChange={togglePanel('labels', 'rail')}
                >
                  <PopoverTrigger asChild>
                    <button className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-[13px] font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
                      <Tag className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Labels
                    </button>
                  </PopoverTrigger>
                  <PopoverContent label="Labels" heading="Labels" width={276} align="start" side="left">
                    <div className="max-h-[420px] overflow-y-auto">{labelsPanel}</div>
                  </PopoverContent>
                </Popover>

                {/* Checklist — popover stays inside the rail, so it is sized to fit
                    the 232px track: the rail scrolls, and a scroll container clips
                    horizontally whatever its children stick out by. */}
                <div className="relative">
                  <Popover
                    open={activePanel === 'checklist'}
                    onOpenChange={(o) => setActivePanel(o ? 'checklist' : null)}
                  >
                    <PopoverTrigger asChild>
                      <button className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-[13px] font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
                        <CheckSquare className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Checklist
                      </button>
                    </PopoverTrigger>
                    <PopoverContent label="New checklist" heading="New checklist" width={232} align="end" side="left">
                      <>
                        <input
                          autoFocus
                          value={newChecklistTitle}
                          onChange={(e) => setNewChecklistTitle(e.target.value)}
                          placeholder="Checklist title…"
                          className="ap-input h-8 w-full py-0 text-[13px]"
                          onKeyDown={(e) => { if (e.key === 'Enter') addChecklist() }}
                        />
                        <button
                          onClick={addChecklist}
                          className="mt-2 h-8 w-full rounded-[var(--ap-radius-sm)] bg-[var(--ap-accent)] text-[13px] font-semibold text-[var(--ap-accent-fg)] transition-colors hover:bg-[var(--ap-accent-hover)]"
                        >
                          Add checklist
                        </button>
                      </>
                    </PopoverContent>
                  </Popover>
                </div>

                <Popover
                  open={activePanel === 'dates' && panelAnchor === 'rail'}
                  onOpenChange={togglePanel('dates', 'rail')}
                >
                  <PopoverTrigger asChild>
                    <button className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-[13px] font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
                      <Calendar className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Dates
                    </button>
                  </PopoverTrigger>
                  <PopoverContent label="Dates" heading="Dates" width={340} align="start" side="left">
                    {datesPanel}
                  </PopoverContent>
                </Popover>

                <button onClick={() => fileInputRef.current?.click()} className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-[13px] font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
                  <Paperclip className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Attachment
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

                {/* Cover — popover also sized to the rail track. */}
                <div className="relative">
                  <Popover
                    open={activePanel === 'cover'}
                    onOpenChange={(o) => setActivePanel(o ? 'cover' : null)}
                  >
                    <PopoverTrigger asChild>
                      <button className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-[13px] font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
                        <ImageIcon className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Cover
                      </button>
                    </PopoverTrigger>
                    <PopoverContent label="Cover" heading="Cover" width={244} align="end" side="left">
                      <>
                        {/* Size (CVR-1) */}
                        <Eyebrow size="md" mono className="mb-1.5 text-[var(--ap-fg-subtle)]">Size</Eyebrow>
                        <div className="mb-3 grid grid-cols-2 gap-1.5">
                          {([
                            { key: 'BAND', label: 'Band' },
                            { key: 'FULL', label: 'Full bleed' },
                          ] as const).map((opt) => {
                            const active = (todo.coverSize ?? 'BAND') === opt.key
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                aria-pressed={active}
                                disabled={!todo.coverColor}
                                onClick={() => patch({ coverSize: opt.key })}
                                className={cn(
                                  'rounded-[var(--ap-radius-xs)] border px-2 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40',
                                  active
                                    ? 'border-[var(--ap-accent)] bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]'
                                    : 'border-[var(--ap-border-strong)] text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-hover)]',
                                )}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>

                        {/* Colours */}
                        <Eyebrow size="md" mono className="mb-1.5 text-[var(--ap-fg-subtle)]">Colors</Eyebrow>
                        <div className="grid grid-cols-5 gap-1.5">
                          {CARD_PALETTE.map((sw) => {
                            const active = todo.coverColor?.toLowerCase() === sw.hex.toLowerCase()
                            return (
                              <button
                                key={sw.key}
                                type="button"
                                aria-label={sw.label}
                                aria-pressed={active}
                                onClick={() => patch({ coverColor: sw.hex, coverSize: todo.coverSize ?? 'BAND' })}
                                className={cn(
                                  'h-7 w-full rounded-[var(--ap-radius-xs)] border-2 transition-transform hover:scale-110',
                                  active ? 'border-[var(--ap-fg)]' : 'border-transparent',
                                )}
                                style={swatchStyle(sw.hex, { colorBlind, pattern: sw.pattern, ink: 'rgba(255,255,255,0.5)' })}
                                title={sw.label}
                              />
                            )
                          })}
                        </div>

                        <button
                          type="button"
                          onClick={() => setColorBlindMode(!colorBlind)}
                          aria-pressed={colorBlind}
                          className="mt-3 w-full rounded-[var(--ap-radius-xs)] border border-[var(--ap-border-strong)] px-2 py-1.5 text-[11px] font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)]"
                        >
                          {colorBlind ? 'Disable' : 'Enable'} colorblind friendly mode
                        </button>

                        {todo.coverColor && (
                          <button
                            type="button"
                            onClick={() => { patch({ coverColor: null, coverSize: null }); setActivePanel(null) }}
                            className="mt-1.5 w-full rounded-[var(--ap-radius-xs)] px-2 py-1.5 text-[11px] font-semibold text-[var(--ap-danger-fg)] transition-colors hover:bg-[var(--ap-danger-bg)]"
                          >
                            Remove cover
                          </button>
                        )}
                      </>
                    </PopoverContent>
                  </Popover>
                </div>

                <button onClick={() => setActivePanel(activePanel === 'link' ? null : 'link')} className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-[13px] font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
                  <Target className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Link OKR
                </button>
              </div>

              <div className="my-4 h-px bg-[var(--ap-border)]" />

              <Eyebrow size="md" mono className="mb-2 text-[var(--ap-fg-subtle)]">Actions</Eyebrow>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => { patch({ status: 'COMPLETED' }) }} className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-[13px] font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
                  <Check className="h-[15px] w-[15px] text-[var(--ap-ok)]" /> Mark done
                </button>
                {todo.sprintId && (
                  <button onClick={copyCardLink} className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-[13px] font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
                    <Link2 className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Copy link
                  </button>
                )}
                <button
                  onClick={() => patch({ archived: !todo.archivedAt })}
                  className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-[13px] font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]"
                >
                  <Archive className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" />
                  {todo.archivedAt ? 'Restore from archive' : 'Archive'}
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-[13px] font-medium text-[var(--ap-danger-fg)] transition-colors hover:bg-[var(--ap-danger-bg)]"
                >
                  <Trash2 className="h-[15px] w-[15px]" /> Delete card
                </button>
              </div>
            </div>
          </div>
          </>
        ) : null}

        {/* Replaces window.confirm — the project standard for destructive
            actions, and the only version that states what is lost. */}
        <ConfirmDialog
          open={!!confirmLabel}
          onClose={() => setConfirmLabel(null)}
          title="Delete label"
          message={confirmLabel ? `Delete “${confirmLabel.name}”?` : 'Delete this label?'}
          description="Labels are shared across the workspace."
          variant="danger"
          confirmLabel="Delete label"
          bullets={[
            'The label is removed from every card that carries it',
            'Nothing else about those cards changes',
          ]}
          onConfirm={async () => {
            if (!confirmLabel) return
            await deleteLabel(confirmLabel.id)
            setConfirmLabel(null)
          }}
        />

        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Delete card"
          message={todo ? `Delete “${todo.title}”?` : 'Delete this card?'}
          description="This cannot be undone."
          variant="danger"
          confirmLabel="Delete card"
          isLoading={deleting}
          bullets={[
            'The card and its checklists, comments and attachments are removed',
            'Any linked key result keeps its current value',
          ]}
          onConfirm={async () => {
            if (!todo) return
            setDeleting(true)
            try {
              const res = await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' })
              if (!res.ok) throw new Error('Delete failed')
              toast.success('Card deleted')
              announce('Card deleted')
              setConfirmDelete(false)
              onUpdated?.()
              onClose()
            } catch {
              toast.error('Could not delete the card')
            } finally {
              setDeleting(false)
            }
          }}
        />
      </div>
  )

  return (
    <Modal
      open
      onClose={onClose}
      // Accessible name only — the visible title is the editable hero below.
      title={todo?.title ?? 'Card'}
      hideHeader
      // The card provides its own close button in the right rail.
      showCloseButton={false}
      // Otherwise focus lands in the title textarea and the caret starts editing
      // the moment the card opens.
      preventInitialFocus
      size="940"
      // §6.4's 6px strip. Bound to the card's own status so it reads as state
      // rather than decoration; every value is an `--ap-*` token via TODO_STATUS_META.
      accentColor={todoStatusMeta(todo?.status ?? 'PENDING').dot}
      // `!p-0 !pt-[6px]`: the shell is full-bleed, but the accent strip is
      // absolutely positioned at top-0, so the body still has to clear its 6px.
      // Top-aligned, not centred — the two columns cap at calc(100vh - 140px)
      // and scroll on their own, so the shell never needs to be vertically
      // centred and never grows past the viewport.
      className="!p-0 !pt-[6px] top-[28px] translate-y-0 max-h-[calc(100vh-88px)] max-w-[calc(100%-40px)] overflow-hidden overflow-y-auto rounded-[var(--ap-radius-lg)] border-0 bg-[var(--ap-bg-raised)] shadow-[var(--ap-shadow-lg)] ring-0"
    >
      {body}
    </Modal>
  )
}
