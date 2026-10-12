/**
 * Development plan (DEV) — pure rules. Client-safe and unit-tested
 * (rules.test.ts). Shared by the server service and the profile UI so the
 * dialogs show the same verdicts the API enforces.
 *
 * Evidence (DEV-1): the repo has no generic entity comment thread (Comment is
 * objective/KR only; TodoComment / ActivityComment / ScrumComment are bound to
 * their models) and the frozen schema has no evidence URL column. Evidence is
 * therefore the `evidenceNote` text plus an optional link, stored as the
 * note's last line: `Evidence link: https://…`. `composeEvidenceNote` /
 * `splitEvidenceNote` are the only readers and writers of that format.
 */
import {
  DEVELOPMENT_EVIDENCE_KINDS,
  isDevelopmentKind,
  isDevelopmentStatus,
  type DevelopmentKind,
  type DevelopmentStatus,
} from '@/types/package'

/** DEV-5: minimum characters in a drop reason. */
export const DROP_REASON_MIN = 10
export const DROP_REASON_MAX = 1000
export const EVIDENCE_NOTE_MAX = 4000
export const EVIDENCE_URL_MAX = 2000
/** DEV-4 / NTF DEV_ITEM_DUE: reminder window before the due date. */
export const DEV_DUE_SOON_DAYS = 14
/** DEV-3 defaults when OrganizationSettings has no row. */
export const DEFAULT_DEV_MIN_ITEMS = 1
export const DEFAULT_DEV_MIN_HOURS = 40
/** One hours entry (POST …/hours). */
export const MAX_HOURS_PER_ENTRY = 1000

const EVIDENCE_LINK_PREFIX = 'Evidence link: '
const EVIDENCE_LINK_LINE = /^Evidence link: (https?:\/\/\S+)\s*$/

const DAY_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Evidence (DEV-1 / DEV-2)
// ---------------------------------------------------------------------------

export interface EvidenceParts {
  note: string | null
  url: string | null
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed ? trimmed : null
}

/** True when `value` is an absolute http(s) URL. */
export function isHttpUrl(value: string | null | undefined): boolean {
  const v = clean(value)
  if (!v || /\s/.test(v)) return false
  try {
    const url = new URL(v)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Store note + link as one `evidenceNote` string (null when both are empty). */
export function composeEvidenceNote(parts: { note?: string | null; url?: string | null }): string | null {
  const note = clean(parts.note)
  const url = clean(parts.url)
  if (!note && !url) return null
  if (!url) return note
  const line = `${EVIDENCE_LINK_PREFIX}${url}`
  return note ? `${note}\n\n${line}` : line
}

/** Read a stored `evidenceNote` back into note + link. */
export function splitEvidenceNote(stored: string | null | undefined): EvidenceParts {
  const text = clean(stored)
  if (!text) return { note: null, url: null }
  const lines = text.split('\n')
  const last = lines[lines.length - 1]?.trim() ?? ''
  const match = EVIDENCE_LINK_LINE.exec(last)
  if (!match) return { note: text, url: null }
  return { note: clean(lines.slice(0, -1).join('\n')), url: match[1] }
}

export function hasEvidence(stored: string | null | undefined): boolean {
  const parts = splitEvidenceNote(stored)
  return !!(parts.note || parts.url)
}

/** DEV-2: CERTIFICATION and COURSE need evidence before DONE (and count toward the items rule). */
export function kindRequiresEvidence(kind: string): boolean {
  return (DEVELOPMENT_EVIDENCE_KINDS as readonly string[]).includes(kind)
}

// ---------------------------------------------------------------------------
// Dates (DEV-4)
// ---------------------------------------------------------------------------

/** Midnight UTC of `now` — due dates are stored as calendar dates at 00:00 UTC. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isOpenStatus(status: string): boolean {
  return status !== 'DONE' && status !== 'DROPPED'
}

/** DEV-4: open (not DONE / DROPPED) and the due date is before today. */
export function isDevelopmentOverdue(
  item: { status: string; dueDate: Date | string | null | undefined },
  now: Date = new Date(),
): boolean {
  const due = toDate(item.dueDate)
  if (!due || !isOpenStatus(item.status)) return false
  return due.getTime() < startOfUtcDay(now).getTime()
}

/** Open and due between today and today + DEV_DUE_SOON_DAYS (inclusive). */
export function isDevelopmentDueSoon(
  item: { status: string; dueDate: Date | string | null | undefined },
  now: Date = new Date(),
  days: number = DEV_DUE_SOON_DAYS,
): boolean {
  const due = toDate(item.dueDate)
  if (!due || !isOpenStatus(item.status)) return false
  const today = startOfUtcDay(now).getTime()
  return due.getTime() >= today && due.getTime() <= today + days * DAY_MS
}

// ---------------------------------------------------------------------------
// Yearly rule (DEV-3)
// ---------------------------------------------------------------------------

export interface DevelopmentRuleSettings {
  devMinItems?: number | null
  devMinHours?: number | null
}

export interface DevelopmentRuleItem {
  kind: string
  status: string
  hoursLogged: number | null
}

export interface DevelopmentRuleResult {
  itemsDone: number
  itemsRequired: number
  hoursLogged: number
  hoursRequired: number
  itemsMet: boolean
  hoursMet: boolean
  itemsPercent: number
  hoursPercent: number
}

function percent(value: number, required: number): number {
  if (required <= 0) return 100
  return Math.max(0, Math.min(100, Math.round((value / required) * 100)))
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * DEV-3: items = DONE certifications / courses; hours = hours logged on every
 * item that was not dropped. Rule values from OrganizationSettings
 * (`devMinItems`, `devMinHours`), defaulting to 1 and 40.
 */
export function computeDevelopmentRule(
  items: readonly DevelopmentRuleItem[],
  settings: DevelopmentRuleSettings | null | undefined = null,
): DevelopmentRuleResult {
  const itemsRequired = Math.max(0, Math.round(settings?.devMinItems ?? DEFAULT_DEV_MIN_ITEMS))
  const hoursRequired = Math.max(0, settings?.devMinHours ?? DEFAULT_DEV_MIN_HOURS)
  let itemsDone = 0
  let hours = 0
  for (const item of items) {
    if (item.status === 'DONE' && kindRequiresEvidence(item.kind)) itemsDone += 1
    if (item.status !== 'DROPPED') hours += Math.max(0, item.hoursLogged ?? 0)
  }
  const hoursLogged = roundHours(hours)
  return {
    itemsDone,
    itemsRequired,
    hoursLogged,
    hoursRequired,
    itemsMet: itemsDone >= itemsRequired,
    hoursMet: hoursLogged >= hoursRequired,
    itemsPercent: percent(itemsDone, itemsRequired),
    hoursPercent: percent(hoursLogged, hoursRequired),
  }
}

// ---------------------------------------------------------------------------
// Status changes (DEV-2, DEV-5)
// ---------------------------------------------------------------------------

export interface DevelopmentStateBefore {
  kind: string
  status: string
  evidenceNote: string | null
  dropReason: string | null
  completedAt: Date | null
}

/** Fields of a PATCH that affect the status invariants. `undefined` = unchanged. */
export interface DevelopmentStatePatch {
  kind?: string
  status?: string
  evidenceNote?: string | null
  evidenceUrl?: string | null
  dropReason?: string | null
  completedAt?: Date | null
}

export interface DevelopmentStateAfter {
  kind: DevelopmentKind
  status: DevelopmentStatus
  evidenceNote: string | null
  dropReason: string | null
  completedAt: Date | null
}

export type DevelopmentStateCode = 'EVIDENCE_REQUIRED' | 'DROP_REASON_REQUIRED' | 'INVALID_STATUS' | 'INVALID_KIND' | 'INVALID_EVIDENCE_URL'

export type DevelopmentStateResult =
  | { ok: true; next: DevelopmentStateAfter; statusChanged: boolean }
  | { ok: false; code: DevelopmentStateCode; message: string }

/**
 * Apply a patch to the status-related fields and check the invariants:
 *  - DEV-2: an item that ends up DONE with kind CERTIFICATION / COURSE must
 *    carry evidence (a note or a link) — checked whenever the result is DONE,
 *    so clearing the evidence or switching the kind of a DONE item is caught too.
 *  - DEV-5: entering DROPPED needs a reason of ≥ DROP_REASON_MIN characters;
 *    editing the reason of a dropped item keeps that floor.
 *  - completedAt is set on entering DONE (patch value or now) and cleared on
 *    leaving it; dropReason is cleared on leaving DROPPED.
 */
export function applyDevelopmentStatePatch(
  before: DevelopmentStateBefore,
  patch: DevelopmentStatePatch,
  now: Date = new Date(),
): DevelopmentStateResult {
  const kind = patch.kind ?? before.kind
  if (!isDevelopmentKind(kind)) return { ok: false, code: 'INVALID_KIND', message: 'Unknown development item kind' }
  const status = patch.status ?? before.status
  if (!isDevelopmentStatus(status)) return { ok: false, code: 'INVALID_STATUS', message: 'Unknown development item status' }

  // Evidence: merge the note / link parts that were sent with what is stored.
  let evidenceNote = before.evidenceNote
  if (patch.evidenceNote !== undefined || patch.evidenceUrl !== undefined) {
    const current = splitEvidenceNote(before.evidenceNote)
    const url = patch.evidenceUrl !== undefined ? clean(patch.evidenceUrl) : current.url
    if (url && !isHttpUrl(url)) {
      return { ok: false, code: 'INVALID_EVIDENCE_URL', message: 'Evidence link must be an http(s) URL' }
    }
    evidenceNote = composeEvidenceNote({
      note: patch.evidenceNote !== undefined ? patch.evidenceNote : current.note,
      url,
    })
  }

  const statusChanged = status !== before.status

  if (status === 'DONE' && kindRequiresEvidence(kind) && !hasEvidence(evidenceNote)) {
    return {
      ok: false,
      code: 'EVIDENCE_REQUIRED',
      message: 'Add an evidence note or link before marking a certification or course done',
    }
  }

  let dropReason = before.dropReason
  if (status === 'DROPPED') {
    if (patch.dropReason !== undefined) dropReason = clean(patch.dropReason)
    const enteringDrop = before.status !== 'DROPPED'
    if ((enteringDrop || patch.dropReason !== undefined) && (dropReason ?? '').length < DROP_REASON_MIN) {
      return {
        ok: false,
        code: 'DROP_REASON_REQUIRED',
        message: `Give a reason of at least ${DROP_REASON_MIN} characters to drop this item`,
      }
    }
  } else {
    dropReason = null
  }

  let completedAt = before.completedAt
  if (status === 'DONE') {
    if (patch.completedAt !== undefined && patch.completedAt !== null) completedAt = patch.completedAt
    else if (before.status !== 'DONE' || !completedAt) completedAt = now
  } else {
    completedAt = null
  }

  return {
    ok: true,
    statusChanged,
    next: { kind, status, evidenceNote, dropReason, completedAt },
  }
}

/** NOT_STARTED moves to IN_PROGRESS when hours are logged; other statuses stay. */
export function statusAfterLoggingHours(status: string): string {
  return status === 'NOT_STARTED' ? 'IN_PROGRESS' : status
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<string, number> = { IN_PROGRESS: 0, NOT_STARTED: 1, DONE: 2, DROPPED: 3 }

/**
 * Profile list order: overdue first, then open items by due date (undated
 * last), then DONE (newest first), then DROPPED; title breaks ties.
 */
export function sortDevelopmentItems<
  T extends { status: string; dueDate: string | Date | null; title: string; overdue?: boolean; completedAt?: string | Date | null },
>(items: readonly T[]): T[] {
  const time = (value: string | Date | null | undefined) => toDate(value)?.getTime() ?? Number.POSITIVE_INFINITY
  return [...items].sort((a, b) => {
    const aOpen = isOpenStatus(a.status)
    const bOpen = isOpenStatus(b.status)
    if (aOpen !== bOpen) return aOpen ? -1 : 1
    if (aOpen && bOpen) {
      if (!!a.overdue !== !!b.overdue) return a.overdue ? -1 : 1
      const due = time(a.dueDate) - time(b.dueDate)
      if (due !== 0 && Number.isFinite(due)) return due
      if (time(a.dueDate) !== time(b.dueDate)) return Number.isFinite(time(a.dueDate)) ? -1 : 1
      const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
      if (s !== 0) return s
      return a.title.localeCompare(b.title)
    }
    const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
    if (s !== 0) return s
    const done = time(b.completedAt) - time(a.completedAt)
    if (done !== 0 && Number.isFinite(done)) return done
    return a.title.localeCompare(b.title)
  })
}

export function formatHours(value: number | null | undefined): string {
  const v = Math.max(0, value ?? 0)
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '')
}
