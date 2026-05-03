/**
 * Bundled-digest email — one email per user per cadence drain. Groups queued
 * notifications by category and renders each as a rich entity card showing
 * the recipient everything they need to decide whether to click through:
 * progress bar, confidence, days-left, owner, etc.
 *
 * The renderer pre-fetches the underlying Objective / KeyResult / Todo for
 * every item in a single round-trip per type, so building a 50-item digest
 * is bounded to ~3 queries regardless of size.
 */

import { wrapHtml } from './index'
import { absoluteUrl } from '@/lib/notifications/deep-link'
import { TOKENS, escapeHtml } from './components'
import {
  objectiveCard, keyResultCard, todoCard, genericCard,
  type ObjectiveCardData, type KeyResultCardData, type TodoCardData,
} from './cards'
import { prisma } from '@/lib/prisma'

export interface DigestItem {
  eventKey: string
  category: string
  subject: string
  deepLink?: string | null
  /** Optional — when present, renderer enriches with live entity data. */
  entityType?: string | null
  entityId?: string | null
}

export interface DigestEmail {
  subject: string
  text: string
  html: string
}

const CATEGORY_LABEL: Record<string, string> = {
  ACCOUNT: 'Account',
  OBJECTIVE: 'Objectives',
  KEY_RESULT: 'Key results',
  CHECK_IN: 'Check-ins',
  TODO: 'To-dos',
  TIMEFRAME: 'Timeframes',
  ALIGNMENT: 'Alignment',
  COMMENT: 'Comments & mentions',
  ADMIN: 'Admin',
}
const CADENCE_LABEL: Record<string, string> = {
  DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly',
}

// Map event keys to a short context line shown above the card title.
const CONTEXT_BY_EVENT: Record<string, string> = {
  CHECKIN_MISSED_7D: 'Check-in is overdue (7 days)',
  CHECKIN_MISSED_14D: 'Escalated: 14-day missed check-in',
  CHECKIN_RECORDED: 'New check-in recorded',
  KR_AT_RISK: 'Confidence dropped to At Risk',
  KR_OFF_TRACK: 'Confidence dropped to Off Track',
  KR_PROGRESS_UPDATED: 'Progress updated',
  TODO_ASSIGNED: 'Assigned to you',
  TODO_DUE_TOMORROW: 'Due tomorrow',
  TODO_OVERDUE: 'Overdue',
  TODO_COMPLETED: 'Marked complete',
  COMMENT_ON_OBJECTIVE: 'New comment',
  COMMENT_ON_KEY_RESULT: 'New comment',
  OBJECTIVE_ASSIGNED: 'Assigned to you',
  OBJECTIVE_STATUS_CHANGED: 'Status changed',
  KR_ASSIGNED: 'Assigned to you',
  KR_ADDED_TO_OBJECTIVE: 'Added to your objective',
  TIMEFRAME_ENDING_7D: 'Closes in 7 days',
  TIMEFRAME_CLOSING_1D: 'Closes tomorrow',
  TIMEFRAME_CLOSED: 'Timeframe closed',
}

export async function renderDigest(args: {
  recipientName: string
  cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  items: DigestItem[]
}): Promise<DigestEmail> {
  const { recipientName, cadence, items } = args
  const cadenceLabel = CADENCE_LABEL[cadence] ?? cadence.toLowerCase()
  const subject = `Your ${cadenceLabel} OKR digest — ${items.length} update${items.length === 1 ? '' : 's'}`

  // Bulk-fetch entity data so we can render rich cards.
  const entities = await fetchEntities(items)

  const grouped = new Map<string, DigestItem[]>()
  for (const i of items) {
    const k = i.category || 'OTHER'
    if (!grouped.has(k)) grouped.set(k, [])
    grouped.get(k)!.push(i)
  }

  // ── Plain text ──
  const text = [
    `Hi ${recipientName},`,
    '',
    `Here is your ${cadenceLabel} OKR digest. ${items.length} update${items.length === 1 ? '' : 's'} bundled below:`,
    '',
    ...Array.from(grouped.entries()).flatMap(([cat, list]) => [
      `${CATEGORY_LABEL[cat] ?? cat} (${list.length})`,
      ...list.map((i, idx) => i.deepLink
        ? `  ${idx + 1}. ${i.subject}\n     Open: ${absoluteUrl(i.deepLink)}`
        : `  ${idx + 1}. ${i.subject}`),
      '',
    ]),
    '—',
    'The OKR Management System',
  ].join('\n')

  // ── HTML — one card per item, grouped by category ──
  const sections = Array.from(grouped.entries()).map(([cat, list]) => {
    const cards = list.map((i) => renderItemCard(i, entities)).join('')
    return `
      <div style="margin-top:22px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${TOKENS.inkSecondary};margin:0 0 10px;">
          ${escapeHtml(CATEGORY_LABEL[cat] ?? cat)} · ${list.length}
        </div>
        <div style="border:1px solid ${TOKENS.border};border-radius:12px;overflow:hidden;background:${TOKENS.card};">
          ${cards}
        </div>
      </div>`
  }).join('')

  const body = `
    <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:${TOKENS.primary};text-transform:uppercase;margin-bottom:6px;">
      ${cadenceLabel} digest · ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
    </div>
    <h1 style="margin:0 0 6px;font-size:24px;line-height:1.2;font-weight:600;letter-spacing:-0.01em;color:${TOKENS.ink};">
      Your ${cadenceLabel} OKR digest
    </h1>
    <p style="margin:0;color:${TOKENS.inkSecondary};font-size:14px;line-height:1.5;">
      Hi ${escapeHtml(recipientName)} — ${items.length} update${items.length === 1 ? '' : 's'} since the last digest.
      Each item links straight to the relevant view.
    </p>
    ${sections}
    <div style="margin-top:24px;padding-top:14px;border-top:1px solid ${TOKENS.border};font-size:12px;color:${TOKENS.inkSecondary};">
      You're receiving this because daily digests are enabled on your account.
      Adjust cadence in <a href="${absoluteUrl('/dashboard/settings/notifications')}" style="color:${TOKENS.primary};text-decoration:none;font-weight:500;">notification settings</a>.
    </div>
  `

  return { subject, text, html: wrapHtml(body) }
}

// ─── Entity bulk-fetch ───────────────────────────────────────────────────────

interface EntityCache {
  objectives: Map<string, any>
  keyResults: Map<string, any>
  todos: Map<string, any>
}

async function fetchEntities(items: DigestItem[]): Promise<EntityCache> {
  const objIds = new Set<string>()
  const krIds = new Set<string>()
  const todoIds = new Set<string>()
  for (const i of items) {
    if (!i.entityId) continue
    if (i.entityType === 'OBJECTIVE') objIds.add(i.entityId)
    else if (i.entityType === 'KEY_RESULT') krIds.add(i.entityId)
    else if (i.entityType === 'TODO') todoIds.add(i.entityId)
  }

  const [objectives, keyResults, todos] = await Promise.all([
    objIds.size === 0 ? [] : prisma.objective.findMany({
      where: { id: { in: Array.from(objIds) } },
      select: {
        id: true, title: true, level: true, progress: true, confidence: true,
        goalStatus: true, endDate: true,
        owner: { select: { name: true } },
        department: { select: { name: true } },
      },
    }),
    krIds.size === 0 ? [] : prisma.keyResult.findMany({
      where: { id: { in: Array.from(krIds) } },
      select: {
        id: true, title: true, progress: true, confidence: true,
        currentValue: true, targetValue: true, unit: true, objectiveId: true,
        owner: { select: { name: true } },
      },
    }),
    todoIds.size === 0 ? [] : prisma.todo.findMany({
      where: { id: { in: Array.from(todoIds) } },
      select: {
        id: true, title: true, status: true, dueDate: true,
        assignee: { select: { name: true } },
        keyResult: { select: { title: true } },
      },
    }),
  ])

  return {
    objectives: new Map(objectives.map((o: any) => [o.id, o])),
    keyResults: new Map(keyResults.map((k: any) => [k.id, k])),
    todos: new Map(todos.map((t: any) => [t.id, t])),
  }
}

function renderItemCard(item: DigestItem, entities: EntityCache): string {
  const context = CONTEXT_BY_EVENT[item.eventKey] ?? item.subject

  if (item.entityType === 'OBJECTIVE' && item.entityId) {
    const o = entities.objectives.get(item.entityId)
    if (o) {
      const data: ObjectiveCardData = {
        id: o.id, title: o.title, level: o.level,
        progress: o.progress, confidence: o.confidence ? mapObjectiveConf(o.goalStatus) : null,
        ownerName: o.owner?.name ?? null,
        departmentName: o.department?.name ?? null,
        endDate: o.endDate,
        href: item.deepLink,
        context,
      }
      // The objective table stores confidence as a 0-100 int; goalStatus is the enum tone.
      data.confidence = o.goalStatus
      return objectiveCard(data)
    }
  }

  if (item.entityType === 'KEY_RESULT' && item.entityId) {
    const k = entities.keyResults.get(item.entityId)
    if (k) {
      const data: KeyResultCardData = {
        id: k.id, title: k.title,
        objectiveId: k.objectiveId,
        progress: k.progress, confidence: k.confidence,
        currentValue: k.currentValue, targetValue: k.targetValue, unit: k.unit,
        ownerName: k.owner?.name ?? null,
        href: item.deepLink,
        context,
      }
      return keyResultCard(data)
    }
  }

  if (item.entityType === 'TODO' && item.entityId) {
    const t = entities.todos.get(item.entityId)
    if (t) {
      const data: TodoCardData = {
        id: t.id, title: t.title, status: t.status, dueDate: t.dueDate,
        assigneeName: t.assignee?.name ?? null,
        keyResultTitle: t.keyResult?.title ?? null,
        href: item.deepLink,
        context,
      }
      return todoCard(data)
    }
  }

  // Fallback: subject + link with the same visual frame.
  return genericCard({
    eyebrow: CATEGORY_LABEL[item.category] ?? item.category ?? 'Update',
    title: item.subject,
    href: item.deepLink,
    context,
  })
}

function mapObjectiveConf(goalStatus: string | null | undefined): string | null {
  if (!goalStatus) return null
  if (goalStatus === 'ON_TRACK' || goalStatus === 'AT_RISK' || goalStatus === 'OFF_TRACK') return goalStatus
  return null
}
