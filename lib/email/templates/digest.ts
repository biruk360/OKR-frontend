/**
 * Bundled-digest email — one email per user per cadence drain. Groups queued
 * notifications by category, renders them with the system design tokens,
 * and shares the wrapper used by per-event templates.
 */

import { wrapHtml } from './index'
import { absoluteUrl } from '@/lib/notifications/deep-link'

export interface DigestItem {
  eventKey: string
  category: string
  subject: string
  deepLink?: string | null
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
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
}

export function renderDigest(args: {
  recipientName: string
  cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  items: DigestItem[]
}): DigestEmail {
  const { recipientName, cadence, items } = args
  const cadenceLabel = CADENCE_LABEL[cadence] ?? cadence.toLowerCase()
  const subject = `Your ${cadenceLabel} OKR digest — ${items.length} update${items.length === 1 ? '' : 's'}`

  const grouped = new Map<string, DigestItem[]>()
  for (const i of items) {
    const k = i.category || 'OTHER'
    if (!grouped.has(k)) grouped.set(k, [])
    grouped.get(k)!.push(i)
  }

  // Plain-text version
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

  // HTML version — Apple-style card per category
  const sections = Array.from(grouped.entries()).map(([cat, list]) => `
    <div style="margin-top:20px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#8E8E93;margin:0 0 8px;">
        ${escapeHtml(CATEGORY_LABEL[cat] ?? cat)} · ${list.length}
      </div>
      <div style="border:1px solid #E5E5EA;border-radius:10px;overflow:hidden;background:#FFFFFF;">
        ${list.map((i, idx) => row(i, idx === list.length - 1)).join('')}
      </div>
    </div>
  `).join('')

  const body = `
    <h1 style="margin:0 0 6px;font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-0.01em;color:#1D1D1F;">
      Your ${cadenceLabel} OKR digest
    </h1>
    <p style="margin:0 0 4px;color:#8E8E93;font-size:14px;">
      Hi ${escapeHtml(recipientName)} — ${items.length} update${items.length === 1 ? '' : 's'} since the last digest.
    </p>
    ${sections}
  `

  return { subject, text, html: wrapHtml(body) }
}

function row(item: DigestItem, last: boolean): string {
  const border = last ? '' : 'border-bottom:1px solid #E5E5EA;'
  const link = item.deepLink ? absoluteUrl(item.deepLink) : null
  const subject = escapeHtml(item.subject)
  const content = link
    ? `<a href="${link}" style="color:#1D1D1F;text-decoration:none;display:flex;justify-content:space-between;gap:12px;align-items:center;">
         <span style="flex:1;">${subject}</span>
         <span style="color:#007AFF;font-size:13px;white-space:nowrap;">Open →</span>
       </a>`
    : `<span style="color:#1D1D1F;">${subject}</span>`
  return `<div style="padding:14px 16px;${border}font-size:14px;line-height:1.45;">${content}</div>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
