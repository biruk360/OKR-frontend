/**
 * Rich entity cards for email templates.
 *
 * Each card mirrors the in-app design language: status pill (matching the
 * AP --ap-status-pill data-tone palette), inline progress bar, days-left
 * badge, and contextually relevant attributes for the entity type. Used by
 * the bundled digest renderer so each notification surfaces the data the
 * recipient needs to decide whether to click through.
 */

import { TOKENS, escapeHtml, badge, progressBar } from './components'
import { absoluteUrl } from '@/lib/notifications/deep-link'

// ─── Status mapping ──────────────────────────────────────────────────────────

type Tone = 'success' | 'warning' | 'danger' | 'primary' | 'neutral'

const CONFIDENCE_LABEL: Record<string, string> = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  OFF_TRACK: 'Off Track',
}
const CONFIDENCE_TONE: Record<string, Tone> = {
  ON_TRACK: 'success',
  AT_RISK: 'warning',
  OFF_TRACK: 'danger',
}

const TODO_STATUS_LABEL: Record<string, string> = {
  PENDING: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  STUCK: 'Stuck',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
}
const TODO_STATUS_TONE: Record<string, Tone> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'primary',
  IN_REVIEW: 'primary',
  STUCK: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
}

export function progressTone(pct: number): Tone {
  if (pct >= 70) return 'success'
  if (pct >= 40) return 'warning'
  return 'danger'
}

/**
 * Compute days-left badge for a due/end date. Returns null if no date.
 * Negative = overdue (danger), 0–3 days = warning, >3 = neutral.
 */
export function daysLeftBadge(due: Date | string | null | undefined): string {
  if (!due) return ''
  const d = typeof due === 'string' ? new Date(due) : due
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((target.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return badge(`${Math.abs(diff)}d overdue`, 'danger')
  if (diff === 0) return badge('Due today', 'warning')
  if (diff === 1) return badge('Due tomorrow', 'warning')
  if (diff <= 7) return badge(`${diff}d left`, 'warning')
  return badge(`${diff}d left`, 'neutral')
}

function formatDate(due: Date | string | null | undefined): string {
  if (!due) return '—'
  const d = typeof due === 'string' ? new Date(due) : due
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Card primitives ─────────────────────────────────────────────────────────

interface CardArgs {
  eyebrow: string                    // e.g. "OBJECTIVE · COMPANY"
  title: string                      // entity title
  href?: string | null               // deep-link target
  context?: string                   // notification reason ("3d overdue", "checked in")
  pills?: string[]                   // pre-rendered HTML for status pills (badge() output)
  progressPct?: number | null
  progressTone?: Tone
  meta?: Array<{ label: string; value: string }>  // e.g. Owner, Due date
}

function card(args: CardArgs): string {
  const link = args.href ? absoluteUrl(args.href) : null
  const titleHtml = link
    ? `<a href="${escapeHtml(link)}" style="color:${TOKENS.ink};text-decoration:none;">${escapeHtml(args.title)}</a>`
    : escapeHtml(args.title)

  const pillsRow = args.pills && args.pills.length
    ? `<div style="margin:6px 0 0;line-height:1.6;">${args.pills.join(' ')}</div>`
    : ''

  const metaRow = args.meta && args.meta.length
    ? `<div style="margin-top:10px;color:${TOKENS.inkSecondary};font-size:12px;">
         ${args.meta.map((m) => `<span style="margin-right:14px;">
           <span style="color:${TOKENS.inkTertiary};text-transform:uppercase;font-weight:600;letter-spacing:0.04em;font-size:10px;">${escapeHtml(m.label)}</span>
           <span style="margin-left:4px;color:${TOKENS.ink};font-weight:500;">${escapeHtml(m.value)}</span>
         </span>`).join('')}
       </div>`
    : ''

  const progressHtml = typeof args.progressPct === 'number'
    ? compactProgressBar(args.progressPct, args.progressTone ?? progressTone(args.progressPct))
    : ''

  const ctaHtml = link
    ? `<a href="${escapeHtml(link)}" style="color:${TOKENS.primary};text-decoration:none;font-size:13px;font-weight:600;white-space:nowrap;">Open →</a>`
    : ''

  const contextLine = args.context
    ? `<div style="margin-top:6px;color:${TOKENS.inkSecondary};font-size:13px;line-height:1.45;">${escapeHtml(args.context)}</div>`
    : ''

  return `
    <div style="padding:14px 16px;border-bottom:1px solid ${TOKENS.border};">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;color:${TOKENS.inkSecondary};text-transform:uppercase;">
        ${escapeHtml(args.eyebrow)}
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;">
        <tr>
          <td valign="top" style="padding-right:12px;">
            <div style="font-size:15px;font-weight:600;line-height:1.35;color:${TOKENS.ink};">${titleHtml}</div>
            ${contextLine}
            ${pillsRow}
            ${progressHtml}
            ${metaRow}
          </td>
          ${ctaHtml ? `<td valign="top" align="right" style="white-space:nowrap;padding-top:2px;">${ctaHtml}</td>` : ''}
        </tr>
      </table>
    </div>`
}

/** Compact progress bar — narrower than the standard `progressBar()` for cards. */
function compactProgressBar(pct: number, tone: Tone): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  const color = tone === 'success' ? TOKENS.success
    : tone === 'warning' ? TOKENS.warning
    : tone === 'danger' ? TOKENS.danger
    : TOKENS.primary
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 2px;">
      <tr>
        <td style="width:100%;padding-right:8px;">
          <div style="height:6px;background:${TOKENS.border};border-radius:999px;overflow:hidden;">
            <div style="width:${p}%;height:6px;background:${color};border-radius:999px;"></div>
          </div>
        </td>
        <td style="white-space:nowrap;font-size:11px;font-weight:600;color:${TOKENS.inkSecondary};">${p}%</td>
      </tr>
    </table>`
}

// ─── Public card builders ────────────────────────────────────────────────────

export interface ObjectiveCardData {
  id: string
  title: string
  level?: string
  progress?: number | null
  confidence?: string | null
  ownerName?: string | null
  departmentName?: string | null
  endDate?: Date | string | null
  href?: string | null
  context?: string
  eyebrowOverride?: string
}

export function objectiveCard(d: ObjectiveCardData): string {
  const pct = typeof d.progress === 'number' ? d.progress : null
  const pills: string[] = []
  if (d.confidence && CONFIDENCE_LABEL[d.confidence]) {
    pills.push(badge(CONFIDENCE_LABEL[d.confidence], CONFIDENCE_TONE[d.confidence] ?? 'neutral'))
  }
  if (d.endDate) {
    const dl = daysLeftBadge(d.endDate)
    if (dl) pills.push(dl)
  }
  const meta: Array<{ label: string; value: string }> = []
  if (d.ownerName) meta.push({ label: 'Owner', value: d.ownerName })
  if (d.departmentName) meta.push({ label: 'Team', value: d.departmentName })
  if (d.endDate) meta.push({ label: 'Ends', value: formatDate(d.endDate) })

  return card({
    eyebrow: d.eyebrowOverride ?? `Objective${d.level ? ` · ${d.level.toLowerCase()}` : ''}`,
    title: d.title,
    href: d.href ?? `/dashboard/objectives/${d.id}`,
    context: d.context,
    pills,
    progressPct: pct,
    meta,
  })
}

export interface KeyResultCardData {
  id: string
  title: string
  objectiveId?: string
  progress?: number | null
  confidence?: string | null
  currentValue?: number | null
  targetValue?: number | null
  unit?: string | null
  ownerName?: string | null
  href?: string | null
  context?: string
  eyebrowOverride?: string
}

export function keyResultCard(d: KeyResultCardData): string {
  const pct = typeof d.progress === 'number' ? d.progress : null
  const pills: string[] = []
  if (d.confidence && CONFIDENCE_LABEL[d.confidence]) {
    pills.push(badge(CONFIDENCE_LABEL[d.confidence], CONFIDENCE_TONE[d.confidence] ?? 'neutral'))
  }
  const meta: Array<{ label: string; value: string }> = []
  if (typeof d.currentValue === 'number' && typeof d.targetValue === 'number') {
    meta.push({ label: 'Value', value: `${d.currentValue} / ${d.targetValue}${d.unit ?? ''}` })
  }
  if (d.ownerName) meta.push({ label: 'Owner', value: d.ownerName })

  return card({
    eyebrow: d.eyebrowOverride ?? 'Key Result',
    title: d.title,
    href: d.href ?? (d.objectiveId ? `/dashboard/objectives/${d.objectiveId}` : null),
    context: d.context,
    pills,
    progressPct: pct,
    meta,
  })
}

export interface TodoCardData {
  id: string
  title: string
  status?: string | null
  dueDate?: Date | string | null
  assigneeName?: string | null
  keyResultTitle?: string | null
  href?: string | null
  context?: string
  eyebrowOverride?: string
}

export function todoCard(d: TodoCardData): string {
  const pills: string[] = []
  if (d.status && TODO_STATUS_LABEL[d.status]) {
    pills.push(badge(TODO_STATUS_LABEL[d.status], TODO_STATUS_TONE[d.status] ?? 'neutral'))
  }
  const dl = daysLeftBadge(d.dueDate)
  if (dl) pills.push(dl)

  const meta: Array<{ label: string; value: string }> = []
  if (d.assigneeName) meta.push({ label: 'Assignee', value: d.assigneeName })
  if (d.keyResultTitle) meta.push({ label: 'Linked KR', value: d.keyResultTitle })
  if (d.dueDate) meta.push({ label: 'Due', value: formatDate(d.dueDate) })

  return card({
    eyebrow: d.eyebrowOverride ?? 'To-do',
    title: d.title,
    href: d.href ?? `/dashboard/todos/${d.id}`,
    context: d.context,
    pills,
    meta,
  })
}

/**
 * Generic fallback card for non-entity events (account, admin, etc.) that still
 * benefits from the same visual frame. Keeps mixed digests visually coherent.
 */
export interface GenericCardData {
  eyebrow: string
  title: string
  href?: string | null
  context?: string
  badgeText?: string
  badgeTone?: Tone
}

export function genericCard(d: GenericCardData): string {
  return card({
    eyebrow: d.eyebrow,
    title: d.title,
    href: d.href ?? null,
    context: d.context,
    pills: d.badgeText ? [badge(d.badgeText, d.badgeTone ?? 'neutral')] : [],
  })
}
