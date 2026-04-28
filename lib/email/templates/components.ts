/**
 * Reusable email building blocks. Every per-event template composes these so
 * the visual language stays unified with the in-app design tokens.
 *
 * Tokens (mirror tailwind.config.js):
 *   surface app    #F2F2F7      surface card  #FFFFFF      surface muted #E5E5EA
 *   ink primary    #1D1D1F      ink secondary #8E8E93      ink tertiary  #D1D1D6
 *   primary 500    #007AFF      primary 700   #0051D5
 *   success 500    #34C759      warning 500   #FF9500      danger 500    #FF3B30
 */

import { absoluteUrl } from '@/lib/notifications/deep-link'

export const TOKENS = {
  appBg: '#F2F2F7',
  card: '#FFFFFF',
  border: '#E5E5EA',
  ink: '#1D1D1F',
  inkSecondary: '#8E8E93',
  inkTertiary: '#D1D1D6',
  primary: '#007AFF',
  primaryDark: '#0051D5',
  primarySoft: 'rgba(0,122,255,0.10)',
  success: '#34C759',
  successSoft: 'rgba(52,199,89,0.12)',
  warning: '#FF9500',
  warningSoft: 'rgba(255,149,0,0.14)',
  danger: '#FF3B30',
  dangerSoft: 'rgba(255,59,48,0.12)',
} as const

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

/** Primary call-to-action button. Always pair with a secondary link below for fallback. */
export function button(label: string, href: string, variant: 'primary' | 'success' | 'warning' | 'danger' = 'primary'): string {
  const bg = variant === 'success' ? TOKENS.success
    : variant === 'warning' ? TOKENS.warning
    : variant === 'danger' ? TOKENS.danger
    : TOKENS.primary
  const url = escapeHtml(absoluteUrl(href))
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px;">
      <tr><td bgcolor="${bg}" style="border-radius:10px;">
        <a href="${url}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;background:${bg};letter-spacing:-0.01em;">
          ${escapeHtml(label)} →
        </a>
      </td></tr>
    </table>`
}

/** Compact text link — used for "Open in app" / "Manage notifications" / "Snooze". */
export function secondaryLink(label: string, href: string): string {
  return `<a href="${escapeHtml(absoluteUrl(href))}" style="color:${TOKENS.primary};text-decoration:none;font-weight:500;font-size:13px;">${escapeHtml(label)}</a>`
}

/** Row of secondary action links separated by middots. */
export function actionRow(items: Array<{ label: string; href: string }>): string {
  if (!items.length) return ''
  const parts = items.map((i) => secondaryLink(i.label, i.href))
  return `<div style="margin-top:10px;font-size:13px;color:${TOKENS.inkSecondary};line-height:1.6;">${parts.join(`<span style="color:${TOKENS.inkTertiary};margin:0 8px;">·</span>`)}</div>`
}

/** Single key-value row (e.g. Owner · Due date · Department). */
export function metaRow(items: Array<{ label: string; value: string }>): string {
  if (!items.length) return ''
  const cells = items.map((i) => `
    <td valign="top" style="padding:10px 14px;border-right:1px solid ${TOKENS.border};">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.05em;color:${TOKENS.inkSecondary};text-transform:uppercase;">${escapeHtml(i.label)}</div>
      <div style="margin-top:4px;font-size:14px;color:${TOKENS.ink};font-weight:500;">${escapeHtml(i.value)}</div>
    </td>`).join('')
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 4px;border:1px solid ${TOKENS.border};border-radius:10px;background:#FAFAFC;border-collapse:separate;">
      <tr>${cells}<td style="padding:0;width:0;"></td></tr>
    </table>`
}

/** KPI row — large number + label cards. Use for progress / counts / averages. */
export function kpiRow(items: Array<{ label: string; value: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }>): string {
  if (!items.length) return ''
  const cells = items.map((i) => {
    const tone = i.tone === 'success' ? TOKENS.success
      : i.tone === 'warning' ? TOKENS.warning
      : i.tone === 'danger' ? TOKENS.danger
      : TOKENS.ink
    return `
      <td valign="top" align="center" style="padding:14px 10px;border-right:1px solid ${TOKENS.border};">
        <div style="font-size:26px;font-weight:600;letter-spacing:-0.02em;color:${tone};line-height:1.1;">${escapeHtml(i.value)}</div>
        <div style="margin-top:6px;font-size:12px;color:${TOKENS.inkSecondary};">${escapeHtml(i.label)}</div>
      </td>`
  }).join('')
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 4px;border:1px solid ${TOKENS.border};border-radius:12px;background:#FAFAFC;border-collapse:separate;">
      <tr>${cells}<td style="padding:0;width:0;"></td></tr>
    </table>`
}

/** Inline progress bar with value label. */
export function progressBar(percent: number, tone: 'success' | 'warning' | 'danger' | 'primary' = 'primary'): string {
  const p = Math.max(0, Math.min(100, Math.round(percent)))
  const color = tone === 'success' ? TOKENS.success
    : tone === 'warning' ? TOKENS.warning
    : tone === 'danger' ? TOKENS.danger
    : TOKENS.primary
  return `
    <div style="margin:8px 0 4px;">
      <div style="height:8px;background:${TOKENS.border};border-radius:999px;overflow:hidden;">
        <div style="width:${p}%;height:8px;background:${color};border-radius:999px;"></div>
      </div>
      <div style="margin-top:6px;font-size:12px;color:${TOKENS.inkSecondary};">${p}% complete</div>
    </div>`
}

/** Coloured callout — use for at-risk warnings, security notes, escalations. */
export function alert(tone: 'info' | 'success' | 'warning' | 'danger', title: string, body?: string): string {
  const color = tone === 'success' ? TOKENS.success
    : tone === 'warning' ? TOKENS.warning
    : tone === 'danger' ? TOKENS.danger
    : TOKENS.primary
  const bg = tone === 'success' ? TOKENS.successSoft
    : tone === 'warning' ? TOKENS.warningSoft
    : tone === 'danger' ? TOKENS.dangerSoft
    : TOKENS.primarySoft
  return `
    <div style="margin:14px 0 4px;padding:12px 14px;background:${bg};border-left:3px solid ${color};border-radius:8px;">
      <div style="font-size:14px;font-weight:600;color:${TOKENS.ink};">${escapeHtml(title)}</div>
      ${body ? `<div style="margin-top:4px;font-size:13px;color:${TOKENS.ink};line-height:1.5;">${escapeHtml(body)}</div>` : ''}
    </div>`
}

/** Pill-style status badge. */
export function badge(text: string, tone: 'neutral' | 'success' | 'warning' | 'danger' | 'primary' = 'neutral'): string {
  const fg = tone === 'success' ? TOKENS.success
    : tone === 'warning' ? TOKENS.warning
    : tone === 'danger' ? TOKENS.danger
    : tone === 'primary' ? TOKENS.primary
    : TOKENS.inkSecondary
  const bg = tone === 'success' ? TOKENS.successSoft
    : tone === 'warning' ? TOKENS.warningSoft
    : tone === 'danger' ? TOKENS.dangerSoft
    : tone === 'primary' ? TOKENS.primarySoft
    : '#EEF0F3'
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${bg};color:${fg};font-size:11px;font-weight:600;letter-spacing:0.02em;">${escapeHtml(text)}</span>`
}

/** Title block with optional eyebrow + status badge. */
export function heading(args: { eyebrow?: string; title: string; badgeText?: string; badgeTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary' }): string {
  const eyebrow = args.eyebrow
    ? `<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:${TOKENS.inkSecondary};text-transform:uppercase;margin-bottom:8px;">${escapeHtml(args.eyebrow)}${args.badgeText ? ` &nbsp; ${badge(args.badgeText, args.badgeTone ?? 'neutral')}` : ''}</div>`
    : (args.badgeText ? `<div style="margin-bottom:8px;">${badge(args.badgeText, args.badgeTone ?? 'neutral')}</div>` : '')
  return `${eyebrow}
    <h1 style="margin:0 0 6px;font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-0.01em;color:${TOKENS.ink};">${escapeHtml(args.title)}</h1>`
}

/** Lead paragraph below the heading. */
export function lead(text: string): string {
  return `<p style="margin:0 0 4px;font-size:15px;line-height:1.55;color:${TOKENS.ink};">${escapeHtml(text)}</p>`
}

/** Subtle secondary paragraph. */
export function muted(text: string): string {
  return `<p style="margin:8px 0 0;font-size:13px;line-height:1.55;color:${TOKENS.inkSecondary};">${escapeHtml(text)}</p>`
}

export function divider(): string {
  return `<div style="height:1px;background:${TOKENS.border};margin:18px 0;"></div>`
}
