/**
 * Shared types and constants for the card modal (`TodoCardModal`) and its
 * sub-components. Split out of TodoCardModal.tsx so the parts can share them
 * without importing the (large) modal itself.
 */

import { BOARD_STATUSES } from '@/lib/todo-status'

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
  recurrenceRule?: string | null
  recurrenceEndsAt?: string | null
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

export interface ChecklistData {
  id: string
  title: string
  items: ChecklistItemData[]
}
export interface ChecklistItemData {
  id: string
  title: string
  completed: boolean
  assignee?: { id: string; name: string; avatar: string | null } | null
  dueDate?: string | null
}
export interface AttachmentData {
  id: string
  filename: string
  url: string
  mimeType: string
  size: number
  uploadedBy: { id: string; name: string }
  createdAt: string
}
export interface CommentData {
  id: string
  content: string
  parentId: string | null
  author: { id: string; name: string; avatar: string | null }
  createdAt: string
  replies: CommentData[]
  attachments?: AttachmentData[]
  /** Client-only: shown optimistically, not yet confirmed by the server (CPF-1). */
  pending?: boolean
  /** Client-only: names of files still uploading for a pending comment. */
  uploadingFiles?: string[]
}

export interface ActivityLogData {
  id: string
  action: string
  actor: { id: string; name: string; avatar: string | null } | null
  changes: Record<string, { from: unknown; to: unknown }> | null
  metadata: Record<string, unknown> | null
  createdAt: string
}
export interface LabelDef { id: string; name: string; color: string }

// Status options shown in the card status dropdown: 5 board lanes + Cancelled
// (kept selectable so a card can be marked off without leaving the system).
export const STATUS_OPTIONS = [...BOARD_STATUSES, 'CANCELLED'] as const
export const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
/**
 * Retargeted onto the status tokens (§2 / §2.11). The design asks for four
 * bespoke hues, two of which have no token — per Decision 0 the existing
 * four-step semantics win, so Low maps to `--ap-none` and High to `--ap-danger`
 * rather than inventing cyan and orange-red.
 */
export const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'var(--ap-none)',
  MEDIUM: 'var(--ap-warn)',
  HIGH: 'var(--ap-danger)',
  URGENT: 'var(--ap-ahead)',
}

/** A board lane as returned by GET /api/sprints/[id]/columns. */
export interface CardLane { id: string; name: string; statusKey: string | null }

/** The single popover slot the card modal opens at a time. */
export type CardPanel = 'description' | 'checklist' | 'members' | 'labels' | 'cover' | 'link' | 'dates' | null

/** OKR search results shown by the Link OKR picker. */
export interface OkrLinkResults {
  objectives: { id: string; title: string; level: string; progress: number }[]
  keyResults: { id: string; title: string; progress: number; objective: { id: string; title: string } }[]
}

/** PATCH /api/todos/[id] helper owned by the modal. */
export type CardPatch = (body: Record<string, unknown>) => Promise<void>
