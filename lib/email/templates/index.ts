/**
 * Per-event email templates. Every renderer composes the primitives from
 * `./components` so the visual language is consistent with the in-app UI
 * design tokens. Each template is engineered to encourage the recipient to
 * act: a clear primary CTA button, a secondary link, the contextual KPIs /
 * metadata they need to make a decision, and a footer with notification
 * controls.
 */

import type { EventKey } from '@/lib/notifications/events'
import { absoluteUrl } from '@/lib/notifications/deep-link'
import {
  TOKENS, escapeHtml, button, secondaryLink, actionRow, metaRow, kpiRow,
  progressBar, alert, badge, heading, lead, muted, divider,
} from './components'

export interface RenderedEmail {
  subject: string
  text: string
  html?: string
}

type Data = Record<string, unknown>

function appUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export function wrapHtml(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
</head>
<body style="margin:0;padding:24px 12px;background:${TOKENS.appBg};font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif;color:${TOKENS.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;">
    <tr><td style="padding:0 4px 14px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;color:${TOKENS.inkSecondary};text-transform:uppercase;">OKR Management</div>
    </td></tr>
    <tr><td style="background:${TOKENS.card};border-radius:14px;padding:28px;font-size:15px;line-height:1.55;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
      ${body}
    </td></tr>
    <tr><td style="padding:14px 4px 0;color:${TOKENS.inkSecondary};font-size:12px;line-height:1.5;">
      Sent by the OKR Management System ·
      <a href="${appUrl('/dashboard/notifications')}" style="color:${TOKENS.primary};text-decoration:none;">Inbox</a> ·
      <a href="${appUrl('/dashboard/settings/notifications')}" style="color:${TOKENS.primary};text-decoration:none;">Notification settings</a>
    </td></tr>
  </table>
</body></html>`
}

/** Home page with the check-in picker opened (see AppleDashboard `?checkin=1`). */
const CHECK_IN_PATH = '/dashboard?checkin=1'

const DEFAULT_FOOTER_LINKS = [
  { label: 'Open in app', href: '/dashboard' },
  { label: 'Manage notifications', href: '/dashboard/settings/notifications' },
]

interface EmailArgs {
  subject: string
  /** Plain-text body (no signoff — added automatically). */
  text: string
  /** Composed HTML body (no <html>/<body> wrapper — wrapHtml handles it). */
  html: string
  recipientName?: string
}

function compose(args: EmailArgs): RenderedEmail {
  const text = `${args.text}\n\n—\nThe OKR Management System${args.recipientName ? ` (for ${args.recipientName})` : ''}\n`
  return { subject: args.subject, text, html: wrapHtml(args.html) }
}

function fmtPct(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${Math.round(n)}%`
}

function fmtDate(v: unknown): string {
  if (!v) return '—'
  const s = String(v)
  // ISO date — return as-is if already YYYY-MM-DD; otherwise pretty-print.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toISOString().slice(0, 10)
}

/** True for a present, non-blank value (0 counts as present). */
function has(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== ''
}

/** A printable string, or `fallback` when missing / not meaningfully printable. */
function str(v: unknown, fallback = ''): string {
  if (!has(v)) return fallback
  const s = String(v)
  return s === '[object Object]' ? fallback : s
}

/** A finite number as a string, or `fallback`. */
function num(v: unknown, fallback = '—'): string {
  if (!has(v)) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : fallback
}

function plural(n: unknown, word: string): string {
  const v = Number(n)
  return `${num(n)} ${word}${v === 1 ? '' : 's'}`
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary'

function ragTone(rag: unknown): Tone {
  const r = String(rag ?? '').toUpperCase()
  return r === 'RED' ? 'danger' : r === 'AMBER' ? 'warning' : r === 'GREEN' ? 'success' : 'neutral'
}

interface NoticeArgs {
  name: string
  subject: string
  eyebrow: string
  title: string
  badgeText?: string
  badgeTone?: Tone
  lead: string
  alert?: { tone: 'info' | 'success' | 'warning' | 'danger'; title: string; body?: string }
  kpis?: Array<{ label: string; value: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }>
  /** Key/value facts; rows with an empty value are dropped. */
  details?: Array<{ label: string; value: string }>
  note?: string
  cta: string
  ctaVariant?: 'primary' | 'success' | 'warning' | 'danger'
  /** Relative app path or absolute URL of the page the CTA opens. */
  link: string
  secondary?: Array<{ label: string; href: string }>
}

/**
 * Single-entity notice: heading, lead, optional alert / KPIs / facts, one CTA
 * and secondary links — with a plain-text twin carrying the same facts and an
 * absolute link. Used by the project-delivery and scrum-workflow events.
 */
function notice(a: NoticeArgs): RenderedEmail {
  const url = absoluteUrl(a.link)
  const details = (a.details ?? []).filter((d) => d.value)
  const kpis = a.kpis ?? []
  const facts = [...kpis.map((k) => `${k.label}: ${k.value}`), ...details.map((d) => `${d.label}: ${d.value}`)]
  const text = [
    `Hi ${a.name},`,
    '',
    a.lead,
    ...(a.alert ? ['', a.alert.body ? `${a.alert.title} — ${a.alert.body}` : a.alert.title] : []),
    ...(facts.length ? ['', ...facts] : []),
    ...(a.note ? ['', a.note] : []),
    '',
    `${a.cta}: ${url}`,
  ].join('\n')
  return compose({
    subject: a.subject,
    recipientName: a.name,
    text,
    html: `
      ${heading({ eyebrow: a.eyebrow, title: a.title, badgeText: a.badgeText, badgeTone: a.badgeTone })}
      ${lead(a.lead)}
      ${a.alert ? alert(a.alert.tone, a.alert.title, a.alert.body) : ''}
      ${kpis.length ? kpiRow(kpis) : ''}
      ${details.length ? metaRow(details) : ''}
      ${button(a.cta, url, a.ctaVariant)}
      ${a.note ? muted(a.note) : ''}
      ${actionRow(a.secondary ?? [])}
    `,
  })
}

const PROJECT_LINKS = [
  { label: 'All projects', href: '/dashboard/projects' },
  { label: 'Notification settings', href: '/dashboard/settings/notifications' },
]

const SCRUM_LINKS = [
  { label: 'Daily scrum', href: '/dashboard/scrum' },
  { label: 'Notification settings', href: '/dashboard/settings/notifications' },
]

/**
 * Project-delivery and scrum-workflow emails (none of these events is
 * `redactable`: project and scrum-workflow content is shared with everyone the
 * dispatcher routes them to, so they print titles as given). Returns null for
 * keys it does not handle.
 */
function renderProjectOrScrumEvent(eventKey: EventKey, data: Data, name: string): RenderedEmail | null {
  const rawTitle = str(data.entityTitle)
  // The dispatcher substitutes '(untitled)' when an emitter passes no title.
  const known = rawTitle !== '' && rawTitle !== '(untitled)' && rawTitle !== '(item)'
  /** For subjects / facts. */
  const project = known ? rawTitle : 'a project'
  /** For sentences. */
  const projectQ = known ? `"${rawTitle}"` : 'your project'
  const projectFact = { label: 'Project', value: known ? rawTitle : '' }
  const actor = str(data.actorName, '')
  const projectLink = str(data.deepLink, '/dashboard/projects')
  const scrumLink = str(data.deepLink, '/dashboard/scrum')
  const activity = str(data.activityTitle)
  const phase = str(data.phase)
  const reason = str(data.reason)
  const base = { name, eyebrow: 'Project delivery', link: projectLink, secondary: PROJECT_LINKS }

  switch (eventKey) {
    case 'PROJECT_CREATED':
      return notice({
        ...base,
        subject: known ? `New project: ${rawTitle}` : 'A new project was created',
        title: 'A project was created',
        badgeText: 'New', badgeTone: 'primary',
        lead: `${actor ? `${actor} created` : 'A new project was created'}${known ? ` the project ${projectQ}` : actor ? ' a new project' : ''}. Review the plan, team and client obligations before the baseline is committed.`,
        details: [projectFact, { label: 'Code', value: str(data.projectCode ?? data.code) }],
        cta: 'Open project',
      })

    case 'PROJECT_BASELINE_COMMITTED':
      return notice({
        ...base,
        subject: `Baseline committed: ${project}`,
        title: 'Baseline committed',
        badgeText: `v${num(data.version, '1')}`, badgeTone: 'success',
        lead: `The schedule baseline for ${projectQ} is now locked. Any later date change needs a slip reason and owner.`,
        kpis: [{ label: 'Baselined activities', value: num(data.activityCount) }],
        details: [{ label: 'Baseline version', value: num(data.version, '1') }],
        cta: 'Open project',
      })

    case 'PROJECT_REBASELINED':
      return notice({
        ...base,
        subject: `Project re-baselined: ${project}`,
        title: 'Project re-baselined',
        badgeText: `v${num(data.version, '?')}`, badgeTone: 'warning',
        lead: `A new schedule baseline was committed for ${projectQ}. Earlier baselines remain available as snapshots.`,
        kpis: [{ label: 'Activities changed', value: num(data.changeCount) }],
        details: [{ label: 'Baseline version', value: has(data.version) ? num(data.version) : '' }, { label: 'Reason', value: reason }],
        cta: 'Review changes',
      })

    case 'PROJECT_RAG_CHANGED': {
      const from = str(data.from, 'previous').toUpperCase()
      const to = str(data.to, 'new').toUpperCase()
      return notice({
        ...base,
        subject: `${project} is now ${to}`,
        title: 'Project health changed',
        badgeText: to, badgeTone: ragTone(to),
        lead: `The health of ${projectQ} moved from ${from} to ${to} after the latest recompute.`,
        details: [{ label: 'From', value: from }, { label: 'To', value: to }],
        cta: 'Open project',
      })
    }

    case 'PROJECT_WENT_RED':
      return notice({
        ...base,
        subject: `Project went RED: ${project}`,
        title: 'Project went RED',
        badgeText: 'RED', badgeTone: 'danger',
        lead: `${known ? `"${rawTitle}"` : 'A project you follow'} has turned RED. Review the schedule, blockers and open risks and agree a recovery plan.`,
        alert: { tone: 'danger', title: 'Delivery at risk', body: 'Overdue work, blocked activities or high risks have pushed this project into the red.' },
        kpis: has(data.confidence) ? [{ label: 'Delivery confidence', value: fmtPct(data.confidence), tone: 'danger' }] : [],
        cta: 'Open project', ctaVariant: 'danger',
      })

    case 'CLIENT_APPROVAL_PENDING':
      return notice({
        ...base,
        subject: `Awaiting client approval: ${activity || project}`,
        title: 'Deliverable sent for client approval',
        badgeText: 'Approval clock started', badgeTone: 'primary',
        lead: `${activity ? `"${activity}"` : 'A deliverable'} on ${projectQ} is now waiting for client approval. Days the client takes are logged to the delay ledger automatically.`,
        details: [projectFact, { label: 'Activity', value: activity }, { label: 'Phase', value: phase }],
        cta: 'Open project',
      })

    case 'CLIENT_APPROVAL_SLA_BREACH':
      return notice({
        ...base,
        subject: `Client approval SLA breached: ${activity || project}`,
        title: 'Client approval is past its SLA',
        badgeText: str(data.threshold, 'SLA breach'), badgeTone: 'danger',
        lead: `The client has not yet approved ${activity ? `"${activity}"` : 'a deliverable'} on ${projectQ} within the agreed SLA. Follow up with the client contact.`,
        kpis: [
          { label: 'Business days waited', value: num(data.daysWaited) },
          { label: 'Days over SLA', value: num(data.daysOverSla), tone: 'danger' },
          { label: 'SLA (business days)', value: num(data.slaBusinessDays) },
        ],
        details: [{ label: 'Activity', value: activity }, { label: 'Phase', value: phase }],
        cta: 'Open project', ctaVariant: 'danger',
      })

    case 'ACTIVITY_BLOCKED':
      return notice({
        ...base,
        subject: `Activity blocked: ${activity || project}`,
        title: 'An activity is blocked',
        badgeText: 'Blocked', badgeTone: 'warning',
        lead: `${activity ? `"${activity}"` : 'An activity'} on ${projectQ} is blocked${actor ? ` (flagged by ${actor})` : ''}. Clear the blocker or re-plan dependent work.`,
        details: [projectFact, { label: 'Phase', value: phase }, { label: 'Blocker', value: str(data.blockerReason ?? data.reason) }],
        cta: 'Open activity', ctaVariant: 'warning',
      })

    case 'ACTIVITY_OVERDUE':
      return notice({
        ...base,
        subject: `Activity overdue: ${activity || project}`,
        title: 'An activity is overdue',
        badgeText: 'Overdue', badgeTone: 'danger',
        lead: `${activity ? `"${activity}"` : 'An activity'} on ${projectQ} has passed its planned end date without being completed.`,
        details: [projectFact, { label: 'Due', value: has(data.dueDate) ? fmtDate(data.dueDate) : '' }, { label: 'Days overdue', value: str(data.daysOverdue) }],
        cta: 'Update activity', ctaVariant: 'danger',
      })

    case 'BASELINE_SLIPPED':
      return notice({
        ...base,
        subject: `Baseline slipped: ${activity || project}`,
        title: 'Work slipped against the baseline',
        badgeText: has(data.slipDays) ? `+${num(data.slipDays)} days` : 'Slip', badgeTone: 'warning',
        lead: `${activity ? `"${activity}"` : 'An activity'} on ${projectQ} now finishes later than its committed baseline.`,
        details: [projectFact, { label: 'Reason', value: reason }, { label: 'Owner', value: str(data.slipOwner ?? data.owner) }],
        cta: 'Open project', ctaVariant: 'warning',
      })

    case 'STAGE_GATE_PENDING':
      return notice({
        ...base,
        subject: `Stage gate awaiting review: ${project}`,
        title: 'A stage gate needs your review',
        badgeText: 'Pending', badgeTone: 'warning',
        lead: `${has(data.gateName) ? `The "${str(data.gateName)}" gate` : 'A stage gate'} on ${projectQ} is ready for review. The next phase can't start until it is passed or waived.`,
        details: [projectFact, { label: 'Phase', value: phase }],
        cta: 'Review gate',
      })

    case 'STAGE_GATE_BYPASSED':
      return notice({
        ...base,
        subject: `Stage gate bypassed: ${project}`,
        title: 'A stage gate was bypassed',
        badgeText: 'Bypassed', badgeTone: 'danger',
        lead: `${has(data.gateName) ? `The "${str(data.gateName)}" gate` : 'A stage gate'} on ${projectQ} was bypassed${actor ? ` by ${actor}` : ''} without a pass decision.`,
        details: [projectFact, { label: 'Reason', value: reason }],
        cta: 'Review gate', ctaVariant: 'danger',
      })

    case 'CHANGE_REQUEST_SUBMITTED':
    case 'CHANGE_REQUEST_APPROVED': {
      const approved = eventKey === 'CHANGE_REQUEST_APPROVED'
      const cr = str(data.crCode, 'A change request')
      const impact = has(data.scheduleImpactDays) ? plural(data.scheduleImpactDays, 'day') : ''
      return notice({
        ...base,
        subject: `${approved ? 'Change request approved' : 'Change request submitted'}: ${str(data.crCode, project)}`,
        title: approved ? 'Change request approved' : 'Change request awaiting decision',
        badgeText: approved ? 'Approved' : 'Submitted', badgeTone: approved ? 'success' : 'primary',
        lead: approved
          ? `${cr} on ${projectQ} was approved${actor ? ` by ${actor}` : ''}. Its schedule impact has been applied and project health recomputed.`
          : `${cr} on ${projectQ} was submitted${actor ? ` by ${actor}` : ''} and needs a decision.`,
        details: [projectFact, { label: 'Change request', value: str(data.crCode) }, { label: 'Schedule impact', value: impact }],
        cta: approved ? 'Open project' : 'Review change request',
        ctaVariant: approved ? 'success' : 'primary',
      })
    }

    case 'RAID_HIGH_RISK_ADDED':
      return notice({
        ...base,
        subject: `High risk on ${project}${has(data.refCode) ? ` (${str(data.refCode)})` : ''}`,
        title: 'A high risk was logged',
        badgeText: has(data.score) ? `Score ${num(data.score)}` : 'High risk', badgeTone: 'danger',
        lead: `A risk scoring 15 or more was added to the RAID log of ${projectQ}. Agree a mitigation and an owner.`,
        details: [projectFact, { label: 'Reference', value: str(data.refCode) }, { label: 'Score', value: has(data.score) ? num(data.score) : '' }],
        cta: 'Open RAID log', ctaVariant: 'danger',
      })

    case 'CLIENT_REPORT_READY':
      return notice({
        ...base,
        subject: `Client report draft ready: ${project}`,
        title: 'Client report draft ready',
        badgeText: 'Needs review', badgeTone: 'primary',
        lead: `A client status report draft for ${projectQ} is ready. Review and approve it before it is shared — nothing is sent to the client automatically.`,
        cta: 'Review draft',
      })

    case 'CLIENT_COMMENT_POSTED':
      return notice({
        ...base,
        subject: `Client comment on ${rawTitle && rawTitle !== '(untitled)' ? rawTitle : 'a project activity'}`,
        title: 'The client posted a comment',
        badgeText: 'Client portal', badgeTone: 'primary',
        lead: `The client commented on ${rawTitle && rawTitle !== '(untitled)' ? `"${rawTitle}"` : 'a project activity'} in the client portal. Replies you mark client-visible are shown to them.`,
        cta: 'Open conversation',
      })

    case 'JIRA_SYNC_FAILED':
      return notice({
        ...base,
        subject: `Jira sync failed: ${project}`,
        title: 'Jira sync failed',
        badgeText: 'Integration', badgeTone: 'warning',
        lead: `The latest Jira sync for ${projectQ} failed. The project schedule is unaffected; Jira-linked progress may be stale until the connection is fixed.`,
        details: [{ label: 'Error', value: str(data.error ?? data.errorMessage) }],
        cta: 'Open project', ctaVariant: 'warning',
      })

    case 'PAYMENT_MILESTONE_READY': {
      const amount = has(data.amount) ? `${str(data.currency)} ${str(data.amount)}`.trim() : ''
      return notice({
        ...base,
        eyebrow: 'Project finance',
        subject: `Ready to invoice: ${str(data.paymentMilestoneName, project)}`,
        title: 'Payment milestone ready to invoice',
        badgeText: 'Ready', badgeTone: 'success',
        lead: `${has(data.paymentMilestoneName) ? `"${str(data.paymentMilestoneName)}"` : 'A payment milestone'} on ${projectQ} is ready to invoice${activity ? ` — "${activity}" is complete` : ''}.`,
        details: [projectFact, { label: 'Milestone', value: str(data.paymentMilestoneName) }, { label: 'Amount', value: amount }],
        cta: 'Open project', ctaVariant: 'success',
      })
    }

    case 'COE_REQUIRED':
      return notice({
        ...base,
        subject: `Correction of Errors required: ${project}`,
        title: 'Correction of Errors required',
        badgeText: 'COE', badgeTone: 'danger',
        lead: `A Correction of Errors (COE) write-up is required for ${projectQ}. Document what happened, the root cause and the actions that prevent a repeat.`,
        details: [{ label: 'Trigger', value: reason }, { label: 'Due', value: has(data.dueDate) ? fmtDate(data.dueDate) : '' }],
        cta: 'Open project', ctaVariant: 'danger',
      })

    case 'WBR_PACK_READY':
      return notice({
        ...base,
        eyebrow: 'Portfolio',
        subject: 'Weekly Business Review pack ready',
        title: 'Weekly Business Review pack ready',
        badgeText: 'Weekly', badgeTone: 'primary',
        lead: "This week's portfolio review pack is ready — health, slips, approvals and risks across active projects.",
        cta: 'Open portfolio',
        link: str(data.deepLink, '/dashboard/projects/portfolio'),
      })

    case 'SCRUM_NOT_LOGGED':
      return notice({
        name,
        eyebrow: 'Daily scrum',
        subject: 'Daily scrum not logged',
        title: 'No daily scrum was logged',
        badgeText: str(data.dayLabel, 'Missing'), badgeTone: 'warning',
        lead: `No daily scrum update was logged${has(data.dayLabel) ? ` for ${str(data.dayLabel)}` : ''}${known ? ` on ${projectQ}` : ''}. Log it so the team and project status stay current.`,
        cta: 'Log update', ctaVariant: 'warning',
        link: scrumLink,
        secondary: SCRUM_LINKS,
      })

    case 'SCRUM_PROXY_SUBMITTED':
      return notice({
        name,
        eyebrow: 'Daily scrum',
        subject: `${actor || 'A teammate'} submitted your daily scrum on your behalf`,
        title: 'Your update was submitted by proxy',
        badgeText: 'Needs confirmation', badgeTone: 'warning',
        lead: `${actor || 'A teammate'} submitted today's daily scrum update for you. Check it and confirm or amend it.`,
        details: [{ label: 'Reason given', value: str(data.proxyReason) }],
        cta: 'Review update', ctaVariant: 'warning',
        link: scrumLink,
        secondary: SCRUM_LINKS,
      })

    case 'SCRUM_PROXY_CONFIRMED':
      return notice({
        name,
        eyebrow: 'Daily scrum',
        subject: 'Your proxy scrum update was confirmed',
        title: 'Proxy update confirmed',
        badgeText: 'Confirmed', badgeTone: 'success',
        lead: `${actor || 'Your teammate'} reviewed the daily scrum update you submitted on their behalf and confirmed it.`,
        cta: 'Open update', ctaVariant: 'success',
        link: scrumLink,
        secondary: SCRUM_LINKS,
      })

    case 'SCRUM_UPDATE_AMENDED':
      return notice({
        name,
        eyebrow: 'Daily scrum',
        subject: 'A daily scrum update was amended',
        title: 'Update amended',
        badgeText: 'Amended', badgeTone: 'primary',
        lead: `${actor || 'The author'} amended a daily scrum update you follow. Open it to see the latest version.`,
        cta: 'Open update',
        link: scrumLink,
        secondary: SCRUM_LINKS,
      })

    case 'SCRUM_WIN_CELEBRATED':
      return notice({
        name,
        eyebrow: 'Daily scrum',
        subject: `${actor || 'A teammate'} celebrated your win`,
        title: 'Your win was celebrated',
        badgeText: 'Win', badgeTone: 'success',
        lead: `${actor || 'A teammate'} celebrated a win from your daily scrum update. Nice work!`,
        cta: 'See the update', ctaVariant: 'success',
        link: scrumLink,
        secondary: [{ label: 'Team wins', href: '/dashboard/scrum/wins' }, SCRUM_LINKS[1]],
      })

    default:
      return null
  }
}

export function renderTemplate(eventKey: EventKey, data: Data): RenderedEmail {
  const name = String(data.recipientName ?? 'there')
  const entityTitle = String(data.entityTitle ?? '(item)')
  const actorName = String(data.actorName ?? 'someone')
  const deepLink = String(data.deepLink ?? '/dashboard')

  switch (eventKey) {
    // ─── Account / security ───────────────────────────────────────────────
    case 'ACCOUNT_INVITE': {
      const url = String(data.activationUrl ?? appUrl('/auth/reset-password'))
      return compose({
        subject: 'Welcome to the OKR Management System — set up your account',
        recipientName: name,
        text: `Hi ${name},\n\nYou've been invited to the OKR Management System. Set up your password to activate your account.\n\nActivate here: ${url}\n\nThe link is valid for 7 days. If you weren't expecting this, you can safely ignore the message.`,
        html: `
          ${heading({ eyebrow: 'Welcome', title: 'Set up your OKR account' })}
          ${lead(`Hi ${name}, an account has been created for you. Set a password to activate it and start setting goals, tracking progress, and aligning across teams.`)}
          ${button('Activate my account', url)}
          ${muted('This secure link expires in 7 days. If you weren\'t expecting this, you can safely ignore it — no account changes have been made.')}
          ${divider()}
          ${actionRow([{ label: 'Open sign-in page', href: '/auth/signin' }, { label: 'Contact admin', href: '/dashboard' }])}
        `,
      })
    }

    case 'ACCOUNT_VERIFY_EMAIL': {
      const url = String(data.verifyUrl ?? appUrl('/auth/signin'))
      return compose({
        subject: 'Verify your email',
        recipientName: name,
        text: `Hi ${name},\n\nConfirm your email to finish setting up your OKR account: ${url}`,
        html: `
          ${heading({ eyebrow: 'Verification', title: 'Confirm your email address' })}
          ${lead(`Hi ${name}, click the button below to verify your email and finish account setup.`)}
          ${button('Verify email', url)}
          ${muted('If you didn\'t request this, you can ignore this message.')}
        `,
      })
    }

    case 'ACCOUNT_PASSWORD_RESET_REQUESTED': {
      const url = String(data.resetUrl ?? appUrl('/auth/reset-password'))
      return compose({
        subject: 'Reset your password',
        recipientName: name,
        text: `Hi ${name},\n\nA password reset was requested for your account.\n\nReset here (valid for 1 hour): ${url}\n\nIf you didn't request this, contact your administrator immediately.`,
        html: `
          ${heading({ eyebrow: 'Security', title: 'Reset your password', badgeText: 'Action required', badgeTone: 'warning' })}
          ${lead(`Hi ${name}, a password reset was requested for your account.`)}
          ${button('Reset password', url, 'primary')}
          ${alert('warning', 'Didn\'t request this?', 'Ignore the email and notify your administrator. Your account stays secure as long as you don\'t click the link.')}
          ${muted('For your protection, the link expires in 1 hour.')}
        `,
      })
    }

    case 'ACCOUNT_PASSWORD_CHANGED':
      return compose({
        subject: 'Your password was changed',
        recipientName: name,
        text: `Hi ${name},\n\nYour OKR account password was just changed.\n\nIf this wasn't you, contact your administrator immediately and review recent activity: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Security', title: 'Your password was changed', badgeText: 'Confirmation', badgeTone: 'success' })}
          ${lead(`Hi ${name}, your account password was changed just now.`)}
          ${alert('danger', 'Wasn\'t you?', 'Reset your password immediately and contact your administrator — your account may be compromised.')}
          ${button('Review account activity', deepLink)}
          ${actionRow([{ label: 'Reset password again', href: '/auth/reset-password' }, { label: 'Contact admin', href: '/dashboard' }])}
        `,
      })

    case 'ACCOUNT_ROLE_CHANGED':
      return compose({
        subject: 'Your role was updated',
        recipientName: name,
        text: `Hi ${name},\n\nYour role is now ${data.newRole ?? 'updated'} (department: ${data.newDepartment ?? '—'}).\n\nView your profile: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Account update', title: 'Your role was updated' })}
          ${lead(`Hi ${name}, your role and access level have changed.`)}
          ${metaRow([
            { label: 'New role', value: String(data.newRole ?? '—') },
            { label: 'Department', value: String(data.newDepartment ?? '—') },
          ])}
          ${button('View my profile', deepLink)}
          ${muted('Some pages and permissions may now look different. If something doesn\'t look right, contact your administrator.')}
        `,
      })

    case 'ACCOUNT_DEACTIVATED':
      return compose({
        subject: 'Your account was deactivated',
        recipientName: name,
        text: `Hi ${name},\n\nYour OKR account has been deactivated. You will no longer be able to sign in.\nQuestions? Contact your administrator.`,
        html: `
          ${heading({ eyebrow: 'Account', title: 'Your account was deactivated', badgeText: 'No access', badgeTone: 'danger' })}
          ${lead(`Hi ${name}, your account has been deactivated. You won't be able to sign in until it's reactivated.`)}
          ${alert('warning', 'Need access?', 'Contact your administrator to re-enable your account.')}
        `,
      })

    // ─── Objective ────────────────────────────────────────────────────────
    case 'OBJECTIVE_ASSIGNED':
      return compose({
        subject: `Objective assigned: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} assigned you a new objective: "${entityTitle}".\n\nOpen it: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'New objective', title: entityTitle, badgeText: 'Owner: you', badgeTone: 'primary' })}
          ${lead(`${actorName} assigned this objective to you. Review it, add key results, and confirm the timeframe so progress can be tracked from day one.`)}
          ${metaRow([
            { label: 'Assigned by', value: actorName },
            { label: 'Timeframe', value: String(data.timeframeName ?? '—') },
            { label: 'Level', value: String(data.objectiveLevel ?? '—') },
          ])}
          ${button('Open objective', deepLink)}
          ${actionRow([
            { label: 'Add key results', href: deepLink },
            { label: 'View alignment map', href: '/dashboard/okrs-all?view=map' },
          ])}
        `,
      })

    case 'OBJECTIVE_CREATED_IN_TEAM':
      return compose({
        subject: `New team objective: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} created a new objective in your team: "${entityTitle}".\n\nOpen it: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Team activity', title: entityTitle })}
          ${lead(`${actorName} added a new objective to your team. Take a look so you can align your own goals to it if needed.`)}
          ${button('Review objective', deepLink)}
          ${actionRow([{ label: 'Open team page', href: '/dashboard/org/teams' }, { label: 'Align my OKR', href: '/dashboard/okrs-all?view=map' }])}
        `,
      })

    case 'OBJECTIVE_EDITED':
      return compose({
        subject: `Objective updated: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} edited "${entityTitle}". Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Objective updated', title: entityTitle })}
          ${lead(`${actorName} just edited this objective. Review the change and confirm it still reflects what your team committed to.`)}
          ${button('See what changed', deepLink)}
          ${actionRow(DEFAULT_FOOTER_LINKS)}
        `,
      })

    case 'OBJECTIVE_ARCHIVED':
      return compose({
        subject: `Objective archived: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" was archived by ${actorName}.\n\nOpen: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Archived', title: entityTitle, badgeText: 'Archived', badgeTone: 'neutral' })}
          ${lead(`${actorName} archived this objective. It is no longer counted toward active OKR progress.`)}
          ${button('View archive', deepLink)}
          ${muted('Aligned children may now be orphaned. Check the alignment map and re-parent them if they are still active.')}
          ${actionRow([{ label: 'Open alignment map', href: '/dashboard/okrs-all?view=map' }])}
        `,
      })

    case 'OBJECTIVE_VISIBILITY_CHANGED':
      return compose({
        subject: `Visibility changed: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\nVisibility on "${entityTitle}" is now ${data.newVisibility ?? 'updated'}. Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Visibility update', title: entityTitle })}
          ${lead(`Visibility on this objective is now ${String(data.newVisibility ?? 'updated')}.`)}
          ${button('Open objective', deepLink)}
        `,
      })

    // ─── Key result ───────────────────────────────────────────────────────
    case 'KR_ASSIGNED':
      return compose({
        subject: `Key result assigned: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} assigned you a key result: "${entityTitle}".\n\nOpen: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'New key result', title: entityTitle, badgeText: 'Owner: you', badgeTone: 'primary' })}
          ${lead(`${actorName} assigned this key result to you. Confirm the target, set your first check-in, and you're off.`)}
          ${metaRow([
            { label: 'Start', value: String(data.startValue ?? '—') },
            { label: 'Target', value: String(data.targetValue ?? '—') },
            { label: 'Cadence', value: String(data.cadence ?? '—') },
          ])}
          ${button('Open key result', deepLink, 'primary')}
          ${actionRow([{ label: 'Log first check-in', href: deepLink }])}
        `,
      })

    case 'KR_ADDED_TO_OBJECTIVE':
      return compose({
        subject: `New key result on your objective`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} added a key result: "${entityTitle}". Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'KR added', title: entityTitle })}
          ${lead(`${actorName} added a new key result to one of your objectives. Make sure the metric and target are right.`)}
          ${button('Open key result', deepLink)}
        `,
      })

    case 'KR_PROGRESS_UPDATED': {
      const progress = Number(data.progress ?? 0)
      const tone = progress >= 70 ? 'success' : progress >= 40 ? 'warning' : 'danger'
      return compose({
        subject: `Progress update: ${entityTitle} — ${fmtPct(progress)}`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} updated progress on "${entityTitle}". Current progress: ${fmtPct(progress)}.\n\nOpen: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Progress update', title: entityTitle })}
          ${lead(`${actorName} logged a check-in. Progress is now ${fmtPct(progress)}.`)}
          ${progressBar(progress, tone)}
          ${metaRow([
            { label: 'Current', value: String(data.currentValue ?? '—') },
            { label: 'Target', value: String(data.targetValue ?? '—') },
            { label: 'Confidence', value: String(data.confidence ?? '—') },
          ])}
          ${button('Open key result', deepLink)}
          ${actionRow([{ label: 'See full history', href: deepLink }])}
        `,
      })
    }

    case 'KR_AT_RISK': {
      const progress = Number(data.progress ?? 0)
      return compose({
        subject: `⚠ At risk: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" is now flagged AT RISK / OFF TRACK.\nProgress: ${fmtPct(progress)}\n\nOpen and intervene: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Needs intervention', title: entityTitle, badgeText: 'At risk', badgeTone: 'warning' })}
          ${alert('warning', `${entityTitle} is at risk`, `Progress is at ${fmtPct(progress)} with confidence ${String(data.confidence ?? '—')}. Update it, escalate, or re-scope before it slips further.`)}
          ${progressBar(progress, 'warning')}
          ${button('Open and act', deepLink, 'warning')}
          ${actionRow([
            { label: 'Add a comment', href: deepLink },
            { label: 'Talk to manager', href: '/dashboard/org/users' },
          ])}
        `,
      })
    }

    case 'KR_COMPLETED': {
      return compose({
        subject: `✅ Completed: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" reached 100%. Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Win', title: entityTitle, badgeText: 'Completed', badgeTone: 'success' })}
          ${lead(`Nicely done — this key result hit 100%. Take a moment to capture what worked.`)}
          ${progressBar(100, 'success')}
          ${button('Open key result', deepLink, 'success')}
          ${actionRow([{ label: 'Add closing note', href: deepLink }, { label: 'Plan next quarter', href: '/dashboard' }])}
        `,
      })
    }

    case 'KR_ARCHIVED':
      return compose({
        subject: `Archived: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" was archived. Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Archived', title: entityTitle, badgeText: 'Archived', badgeTone: 'neutral' })}
          ${lead(`This key result was archived and no longer rolls up to its parent objective.`)}
          ${button('Open key result', deepLink)}
        `,
      })

    // ─── Check-ins ────────────────────────────────────────────────────────
    case 'CHECKIN_WEEKLY_DUE':
      return compose({
        subject: `Weekly check-in due — ${data.count ?? 0} item${Number(data.count) === 1 ? '' : 's'}`,
        recipientName: name,
        text: `Hi ${name},\n\nIt's time for your weekly check-in. ${data.count ?? 0} item(s) need an update.\n\nDo it now: ${appUrl(CHECK_IN_PATH)}`,
        html: `
          ${heading({ eyebrow: 'Weekly cadence', title: 'Time for your check-in' })}
          ${lead(`Your team relies on this rhythm. Take 2 minutes to update progress and confidence.`)}
          ${kpiRow([{ label: 'Items waiting', value: String(data.count ?? 0), tone: 'warning' }])}
          ${button('Do my check-in', CHECK_IN_PATH, 'primary')}
          ${actionRow([{ label: 'Snooze 1 day', href: '/dashboard/settings/notifications' }])}
        `,
      })

    case 'CHECKIN_MISSED_7D':
      return compose({
        subject: `Missed check-in (7 days): ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" hasn't been updated in 7+ days.\n\nUpdate it now: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Missed check-in', title: entityTitle, badgeText: '7 days', badgeTone: 'warning' })}
          ${alert('warning', 'No update in 7+ days', 'Even a quick "no change" check-in keeps stakeholders aligned and prevents auto-escalation at 14 days.')}
          ${button('Log a check-in now', deepLink, 'warning')}
          ${actionRow([{ label: 'Open my OKRs', href: '/dashboard/my-okrs' }, { label: 'Adjust cadence', href: '/dashboard/settings/notifications' }])}
        `,
      })

    case 'CHECKIN_MISSED_14D':
      return compose({
        subject: `Escalation: 14-day missed check-in — ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" hasn't been updated in 14+ days. This has been escalated to admins.\n\nOpen and update now: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Escalation', title: entityTitle, badgeText: '14 days · escalated', badgeTone: 'danger' })}
          ${alert('danger', 'This is an escalation', 'After 14 days without an update, admins and your manager have been notified. Act now to keep the OKR active.')}
          ${button('Update now', deepLink, 'danger')}
          ${actionRow([{ label: 'Reach out to manager', href: '/dashboard/org/users' }, { label: 'Re-scope or archive', href: deepLink }])}
        `,
      })

    // ─── To-dos / Sprints ─────────────────────────────────────────────────
    case 'TODO_ASSIGNED':
      return compose({
        subject: `To-do assigned: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} assigned you a to-do: "${entityTitle}".\nDue: ${fmtDate(data.dueDate)}\n\nOpen: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'New to-do', title: entityTitle, badgeText: 'Assigned to you', badgeTone: 'primary' })}
          ${lead(`${actorName} assigned this to you. Add it to your day so it doesn't fall off.`)}
          ${metaRow([
            { label: 'Due', value: fmtDate(data.dueDate) },
            { label: 'Priority', value: String(data.priority ?? 'Normal') },
          ])}
          ${button('Open to-do', deepLink)}
          ${actionRow([{ label: 'Open work board', href: '/dashboard/todos' }])}
        `,
      })

    case 'TODO_REASSIGNED_AWAY':
      return compose({
        subject: `To-do reassigned: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" was reassigned to ${data.newAssigneeName ?? 'someone else'}.`,
        html: `
          ${heading({ eyebrow: 'Reassigned', title: entityTitle })}
          ${lead(`This to-do has been reassigned to ${String(data.newAssigneeName ?? 'someone else')}. It's no longer on your plate.`)}
          ${button('Open my work board', '/dashboard/todos')}
        `,
      })

    // The reminder the user explicitly set on the card ("5 minutes before",
    // "1 day before"). Distinct from TODO_DUE_TOMORROW/TODAY, which are the
    // system's own daily sweep: this one fires exactly once, at a moment the
    // user chose, so it leads with the lead time rather than the calendar day.
    case 'TODO_DUE_REMINDER': {
      const lead_ = String(data.reminder ?? '').trim()
      const when = lead_ ? lead_.toLowerCase() : 'now'
      return compose({
        subject: `Reminder: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\nYou asked to be reminded ${when} about "${entityTitle}" (due ${fmtDate(data.dueDate)}). Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Reminder', title: entityTitle, badgeText: lead_ || 'Due now', badgeTone: 'warning' })}
          ${lead(`You asked to be reminded ${when} this card is due.`)}
          ${metaRow([
            { label: 'Due', value: fmtDate(data.dueDate) },
            ...(lead_ ? [{ label: 'Reminder', value: lead_ }] : []),
          ])}
          ${button('Open the card', deepLink, 'warning')}
          ${actionRow([{ label: 'Open work board', href: '/dashboard/todos' }])}
        `,
      })
    }

    case 'TODO_DUE_TOMORROW':
      return compose({
        subject: `Due tomorrow: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" is due tomorrow (${fmtDate(data.dueDate)}). Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Heads up', title: entityTitle, badgeText: 'Due tomorrow', badgeTone: 'warning' })}
          ${lead(`Tomorrow is the day. Get ahead of it now to avoid a last-minute scramble.`)}
          ${metaRow([{ label: 'Due', value: fmtDate(data.dueDate) }])}
          ${button('Mark in progress', deepLink, 'warning')}
          ${actionRow([{ label: 'Open work board', href: '/dashboard/todos' }])}
        `,
      })

    case 'TODO_DUE_TODAY':
      return compose({
        subject: `Due today: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" is due today (${fmtDate(data.dueDate)}). Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Today', title: entityTitle, badgeText: 'Due today', badgeTone: 'warning' })}
          ${lead(`This is on today's plate. Knock it out — or move the date if it has slipped.`)}
          ${button('Open and complete', deepLink, 'warning')}
          ${actionRow([{ label: 'Move due date', href: deepLink }, { label: 'Reassign', href: deepLink }])}
        `,
      })

    case 'TODO_OVERDUE':
      return compose({
        subject: `Overdue: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" is overdue (was due ${fmtDate(data.dueDate)}).\nOpen: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Overdue', title: entityTitle, badgeText: 'Past due', badgeTone: 'danger' })}
          ${alert('danger', 'This is overdue', `Originally due ${fmtDate(data.dueDate)}. Either finish it, reassign it, or move the date — but don't leave it stale.`)}
          ${button('Resolve now', deepLink, 'danger')}
          ${actionRow([{ label: 'Reassign', href: deepLink }, { label: 'Cancel', href: deepLink }])}
        `,
      })

    case 'TODO_COMPLETED':
      return compose({
        subject: `Completed: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} completed "${entityTitle}".`,
        html: `
          ${heading({ eyebrow: 'Done', title: entityTitle, badgeText: 'Completed', badgeTone: 'success' })}
          ${lead(`${actorName} marked this to-do complete.`)}
          ${button('Open to-do', deepLink, 'success')}
        `,
      })

    case 'SPRINT_TASK_ASSIGNED':
      return compose({
        subject: `Sprint task: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} assigned you "${entityTitle}" in sprint "${data.sprintName ?? ''}". Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: `Sprint · ${escapeHtml(String(data.sprintName ?? ''))}`, title: entityTitle, badgeText: 'New task', badgeTone: 'primary' })}
          ${lead(`${actorName} assigned this sprint task to you.`)}
          ${button('Open in sprint board', deepLink)}
        `,
      })

    case 'SPRINT_STARTING_TOMORROW':
      return compose({
        subject: `Sprint starts tomorrow: ${data.sprintName ?? ''}`,
        recipientName: name,
        text: `Hi ${name},\n\nThe sprint "${data.sprintName ?? ''}" starts tomorrow (${fmtDate(data.startDate)}). Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Sprint', title: `${String(data.sprintName ?? 'Sprint')} starts tomorrow`, badgeText: fmtDate(data.startDate), badgeTone: 'primary' })}
          ${lead(`Get ready — the sprint kicks off tomorrow. Confirm your assignments and the daily cadence.`)}
          ${button('Open sprint board', deepLink)}
        `,
      })

    case 'SPRINT_ENDING_SOON':
      return compose({
        subject: `Sprint ending soon: ${data.sprintName ?? ''}`,
        recipientName: name,
        text: `Hi ${name},\n\nThe sprint "${data.sprintName ?? ''}" ends in 2 days (${fmtDate(data.endDate)}). Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Sprint', title: `${String(data.sprintName ?? 'Sprint')} ends in 2 days`, badgeText: 'Wrap up', badgeTone: 'warning' })}
          ${lead(`Push remaining cards across the line — or carry them over deliberately.`)}
          ${metaRow([{ label: 'End date', value: fmtDate(data.endDate) }])}
          ${button('Open sprint', deepLink, 'warning')}
        `,
      })

    case 'SPRINT_ENDED_BY_USER':
      return compose({
        subject: `Sprint ended: ${data.sprintName ?? ''}`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} ended the sprint "${data.sprintName ?? ''}". Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Sprint closed', title: String(data.sprintName ?? 'Sprint') })}
          ${lead(`${actorName} ended the sprint. Review the burndown and decide what carries over.`)}
          ${button('See sprint summary', deepLink)}
        `,
      })

    case 'INITIATIVE_CARRIED_OVER':
      return compose({
        subject: `Carried over: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" was carried over to "${data.nextSprintName ?? 'the next sprint'}" by ${actorName}. Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Carried over', title: entityTitle })}
          ${lead(`${actorName} moved this initiative into ${String(data.nextSprintName ?? 'the next sprint')}.`)}
          ${button('Open in new sprint', deepLink)}
        `,
      })

    case 'SPRINT_REOPENED':
      return compose({
        subject: `Sprint reopened: ${data.sprintName ?? ''}`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} reopened the sprint "${data.sprintName ?? ''}". It is active again. Open: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Sprint reopened', title: String(data.sprintName ?? 'Sprint'), badgeText: 'Active again', badgeTone: 'primary' })}
          ${lead(`${actorName} reopened this sprint. The board is live again — tasks previously moved out stay where they are unless brought back.`)}
          ${button('Open sprint', deepLink)}
        `,
      })

    case 'INITIATIVE_CANCELLED_AT_CLOSE':
      return compose({
        subject: `Cancelled at sprint close: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" was cancelled when ${actorName} closed the sprint "${data.sprintName ?? ''}". Review: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Sprint closed', title: entityTitle, badgeText: 'Cancelled', badgeTone: 'warning' })}
          ${lead(`${actorName} cancelled this initiative while closing ${String(data.sprintName ?? 'the sprint')}. See the sprint report for the full outcome.`)}
          ${button('View sprint report', deepLink)}
        `,
      })

    // ─── Timeframe ────────────────────────────────────────────────────────
    case 'TIMEFRAME_OPENED':
      return compose({
        subject: `New timeframe open: ${data.timeframeName ?? ''}`,
        recipientName: name,
        text: `Hi ${name},\n\nA new OKR timeframe is open: ${data.timeframeName ?? ''} (${fmtDate(data.startDate)} → ${fmtDate(data.endDate)}).\n\nDraft your OKRs: ${appUrl('/dashboard')}`,
        html: `
          ${heading({ eyebrow: 'Timeframe', title: `${String(data.timeframeName ?? '')} is open`, badgeText: 'Plan now', badgeTone: 'primary' })}
          ${lead(`Set your OKRs early. The clearer the targets in week 1, the easier the weekly check-ins for the rest of the cycle.`)}
          ${metaRow([
            { label: 'Starts', value: fmtDate(data.startDate) },
            { label: 'Ends', value: fmtDate(data.endDate) },
          ])}
          ${button('Plan my OKRs', '/dashboard')}
          ${actionRow([{ label: 'See alignment map', href: '/dashboard/okrs-all?view=map' }])}
        `,
      })

    case 'TIMEFRAME_ENDING_7D':
      return compose({
        subject: `Timeframe ending in 7 days`,
        recipientName: name,
        text: `Hi ${name},\n\n${data.timeframeName ?? 'The current timeframe'} ends in 7 days. Finalize your OKR scores.\n\nOpen: ${appUrl('/dashboard/my-okrs')}`,
        html: `
          ${heading({ eyebrow: 'Wrap-up week', title: `${String(data.timeframeName ?? 'Current timeframe')} ends in 7 days`, badgeText: '7 days left', badgeTone: 'warning' })}
          ${lead(`Make sure every active KR has a final value, a confidence rating, and a closing note. Cleaner data = better retro.`)}
          ${button('Finalize my OKRs', '/dashboard/my-okrs', 'warning')}
        `,
      })

    case 'TIMEFRAME_CLOSING_1D':
      return compose({
        subject: `Timeframe closes tomorrow`,
        recipientName: name,
        text: `Hi ${name},\n\n${data.timeframeName ?? 'The current timeframe'} closes tomorrow. Last chance to update scores.\n\nOpen: ${appUrl('/dashboard/my-okrs')}`,
        html: `
          ${heading({ eyebrow: 'Last call', title: `${String(data.timeframeName ?? 'Timeframe')} closes tomorrow`, badgeText: '1 day left', badgeTone: 'danger' })}
          ${alert('danger', 'Final values lock tomorrow', 'After close, KR values are read-only for the timeframe. Get your last update in now.')}
          ${button('Update now', '/dashboard/my-okrs', 'danger')}
        `,
      })

    case 'TIMEFRAME_CLOSED':
      return compose({
        subject: `Timeframe closed: ${data.timeframeName ?? ''}`,
        recipientName: name,
        text: `Hi ${name},\n\n${data.timeframeName ?? 'The timeframe'} is now closed. Final scores are locked.\n\nOpen reports: ${appUrl('/dashboard')}`,
        html: `
          ${heading({ eyebrow: 'Closed', title: `${String(data.timeframeName ?? 'Timeframe')} is closed`, badgeText: 'Locked', badgeTone: 'neutral' })}
          ${lead(`Final scores are locked. Time to retrospect — what worked, what surprised you, and what to carry into the next cycle.`)}
          ${button('Open reports', '/dashboard')}
          ${actionRow([{ label: 'Plan next timeframe', href: '/dashboard' }])}
        `,
      })

    // ─── Alignment ────────────────────────────────────────────────────────
    case 'ALIGNMENT_REQUESTED':
      return compose({
        subject: `Alignment request from ${actorName}`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} requested alignment for "${entityTitle}".\n\nReview & decide: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Awaiting your decision', title: entityTitle, badgeText: 'Approval needed', badgeTone: 'primary' })}
          ${lead(`${actorName} is asking to align this objective under one of yours. Review the rationale and approve or send back with feedback.`)}
          ${button('Review request', deepLink)}
          ${actionRow([{ label: 'See alignment map', href: '/dashboard/okrs-all?view=map' }])}
        `,
      })

    case 'ALIGNMENT_DECISION':
      return compose({
        subject: `Alignment ${String(data.decision ?? 'decision')}: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\nYour alignment for "${entityTitle}" was ${data.decision ?? 'updated'} by ${actorName}.\nOpen: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Decision', title: entityTitle, badgeText: String(data.decision ?? 'updated'), badgeTone: String(data.decision).toUpperCase() === 'APPROVED' ? 'success' : 'warning' })}
          ${lead(`${actorName} ${String(data.decision ?? 'updated').toLowerCase()} your alignment request.`)}
          ${button('Open objective', deepLink)}
        `,
      })

    case 'OBJECTIVE_ALIGNED_CHILD_ADDED':
      return compose({
        subject: `Aligned to your objective: ${data.childTitle ?? ''}`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} aligned "${data.childTitle ?? 'an objective'}" under your objective "${entityTitle}".\nOpen: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Alignment', title: entityTitle })}
          ${lead(`${actorName} aligned "${escapeHtml(String(data.childTitle ?? 'an objective'))}" under this objective. Your team's strategy just got a step more cohesive.`)}
          ${button('See alignment tree', deepLink)}
        `,
      })

    case 'PARENT_OBJECTIVE_ARCHIVED_ORPHAN':
      return compose({
        subject: `Re-align needed: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\nThe parent of "${entityTitle}" was archived. Your objective is now orphaned and needs a new parent.\nOpen: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Action needed', title: entityTitle, badgeText: 'Orphaned', badgeTone: 'warning' })}
          ${alert('warning', 'Parent archived', 'Your objective no longer rolls up to anything. Pick a new parent so it stays connected to company strategy.')}
          ${button('Re-align now', deepLink, 'warning')}
        `,
      })

    // ─── Comments / mentions ──────────────────────────────────────────────
    case 'USER_MENTIONED':
      return compose({
        subject: `${actorName} mentioned you on "${entityTitle}"`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} mentioned you on "${entityTitle}".\n${data.snippet ? `\n"${data.snippet}"\n` : ''}\nReply: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'You were mentioned', title: entityTitle, badgeText: '@mention', badgeTone: 'primary' })}
          ${lead(`${actorName} pinged you in a comment.`)}
          ${data.snippet ? `<blockquote style="margin:14px 0;padding:12px 14px;background:#FAFAFC;border-left:3px solid ${TOKENS.primary};border-radius:8px;color:${TOKENS.ink};font-size:14px;line-height:1.55;">${escapeHtml(String(data.snippet))}</blockquote>` : ''}
          ${button('Reply in thread', deepLink)}
        `,
      })

    case 'COMMENT_ON_OWNED_ENTITY':
      return compose({
        subject: `New comment on "${entityTitle}"`,
        recipientName: name,
        text: `Hi ${name},\n\n${actorName} commented on "${entityTitle}".\n${data.snippet ? `\n"${data.snippet}"\n` : ''}\nOpen: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'New comment', title: entityTitle })}
          ${lead(`${actorName} commented on something you own.`)}
          ${data.snippet ? `<blockquote style="margin:14px 0;padding:12px 14px;background:#FAFAFC;border-left:3px solid ${TOKENS.primary};border-radius:8px;color:${TOKENS.ink};font-size:14px;line-height:1.55;">${escapeHtml(String(data.snippet))}</blockquote>` : ''}
          ${button('Read & reply', deepLink)}
        `,
      })

    // ─── Admin ────────────────────────────────────────────────────────────
    case 'ADMIN_USER_CREATED':
      return compose({
        subject: `New user: ${data.newUserName ?? ''}`,
        recipientName: name,
        text: `A new user was created: ${data.newUserName ?? ''} (${data.newUserEmail ?? ''}), role ${data.newUserRole ?? ''}.\nOpen user: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Admin', title: `New user: ${escapeHtml(String(data.newUserName ?? ''))}` })}
          ${metaRow([
            { label: 'Email', value: String(data.newUserEmail ?? '—') },
            { label: 'Role', value: String(data.newUserRole ?? '—') },
            { label: 'Department', value: String(data.newUserDepartment ?? '—') },
          ])}
          ${button('Open user profile', deepLink)}
          ${actionRow([{ label: 'Open user list', href: '/dashboard/settings/users' }])}
        `,
      })

    case 'ADMIN_BULK_JOB_DONE':
      return compose({
        subject: `Bulk job complete: ${data.jobName ?? ''}`,
        recipientName: name,
        text: `Your bulk job ${data.jobName ?? ''} finished with status ${data.jobStatus ?? 'OK'}.\nOpen: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Bulk job', title: String(data.jobName ?? 'Job complete'), badgeText: String(data.jobStatus ?? 'OK'), badgeTone: String(data.jobStatus).toUpperCase() === 'OK' ? 'success' : 'warning' })}
          ${kpiRow([
            { label: 'Processed', value: String(data.processed ?? '—'), tone: 'neutral' },
            { label: 'Succeeded', value: String(data.succeeded ?? '—'), tone: 'success' },
            { label: 'Failed', value: String(data.failed ?? '0'), tone: Number(data.failed) > 0 ? 'danger' : 'neutral' },
          ])}
          ${button('Open report', deepLink)}
        `,
      })

    case 'ADMIN_SECURITY_ALERT':
      return compose({
        subject: `⚠️ Security alert`,
        recipientName: name,
        text: `Security event: ${data.summary ?? 'see admin panel'}.\nReview audit log: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Security', title: 'Security alert', badgeText: 'Review immediately', badgeTone: 'danger' })}
          ${alert('danger', String(data.summary ?? 'Security event detected'), 'Review the audit log and take action if needed.')}
          ${button('Open audit log', deepLink, 'danger')}
        `,
      })

    case 'ADMIN_WEEKLY_HEALTH_DIGEST': {
      const active = Number(data.activeObjectives ?? 0)
      const atRisk = Number(data.atRisk ?? 0)
      const offTrack = Number(data.offTrack ?? 0)
      return compose({
        subject: `Weekly org OKR health`,
        recipientName: name,
        text: `Active objectives: ${active}. At-risk: ${atRisk}. Off-track: ${offTrack}.\nOpen reports: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Org health', title: 'Weekly OKR health digest' })}
          ${lead('Snapshot of where the company stands this week.')}
          ${kpiRow([
            { label: 'Active', value: String(active), tone: 'neutral' },
            { label: 'At risk', value: String(atRisk), tone: atRisk > 0 ? 'warning' : 'neutral' },
            { label: 'Off track', value: String(offTrack), tone: offTrack > 0 ? 'danger' : 'neutral' },
          ])}
          ${button('Open reports', deepLink)}
          ${actionRow([{ label: 'Drill down by team', href: '/dashboard/org/teams' }])}
        `,
      })
    }

    case 'ADMIN_MONTHLY_EXEC_SUMMARY':
      return compose({
        subject: `Monthly executive summary`,
        recipientName: name,
        text: `Avg progress: ${data.avgProgress ?? 0}%. Objectives completed: ${data.completed ?? 0}.\nOpen reports: ${absoluteUrl(deepLink)}`,
        html: `
          ${heading({ eyebrow: 'Executive', title: 'Monthly summary' })}
          ${kpiRow([
            { label: 'Avg progress', value: fmtPct(data.avgProgress), tone: Number(data.avgProgress) >= 70 ? 'success' : Number(data.avgProgress) >= 40 ? 'warning' : 'danger' },
            { label: 'Completed', value: String(data.completed ?? 0), tone: 'success' },
          ])}
          ${button('Open reports', deepLink)}
        `,
      })

    // ─── Performance & scorecard (payloads are score-free by contract) ─────
    case 'PERF_CYCLE_OPENED':
      return compose({
        subject: `Review cycle opened: ${String(data.cycleName ?? entityTitle)}`,
        recipientName: name,
        text: `Hi ${name},\n\nThe review cycle "${String(data.cycleName ?? entityTitle)}" is now open and you have ${String(data.evaluationCount ?? 'new')} evaluation(s) assigned to you.\n\nOpen your queue: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Performance', title: 'A review cycle has opened' })}
          ${lead(`Hi ${name}, "${String(data.cycleName ?? entityTitle)}" is open and evaluations have been assigned to you.`)}
          ${button('Open evaluation queue', deepLink)}
        `,
      })

    case 'PERF_PANEL_COMPLETE':
      return compose({
        subject: `All evaluators submitted for ${String(data.employeeName ?? entityTitle)}`,
        recipientName: name,
        text: `Hi ${name},\n\nEvery evaluator has submitted for ${String(data.employeeName ?? entityTitle)} (${String(data.cycleName ?? '')}). The evaluation is consolidated and ready for your review.\n\nReview: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Performance', title: 'Evaluator panel complete' })}
          ${lead(`Hi ${name}, every evaluator has submitted for ${String(data.employeeName ?? entityTitle)}. The consolidated result is ready for your review.`)}
          ${button('Review evaluation', deepLink)}
        `,
      })

    case 'PERF_DRAFT_SHARED':
      return compose({
        subject: 'Your performance draft report is ready',
        recipientName: name,
        text: `Hi ${name},\n\nYour draft performance report for ${String(data.cycleName ?? 'the current review cycle')} has been shared with you. Please review and acknowledge it, or raise a dispute.\n\nOpen your report: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Performance', title: 'Your draft report is ready' })}
          ${lead(`Hi ${name}, your draft performance report for ${String(data.cycleName ?? 'the current review cycle')} is ready. Review it and acknowledge, or raise a dispute with a comment.`)}
          ${button('Open my report', deepLink)}
        `,
      })

    case 'PERF_DISPUTE_RAISED':
      return compose({
        subject: `Evaluation disputed by ${String(data.employeeName ?? entityTitle)}`,
        recipientName: name,
        text: `Hi ${name},\n\n${String(data.employeeName ?? 'An employee')} has disputed their shared draft for ${String(data.cycleName ?? 'the current cycle')}. The evaluation has returned to calibration for review.\n\nOpen calibration: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Performance', title: 'Evaluation disputed', badgeText: 'Needs review', badgeTone: 'warning' })}
          ${lead(`Hi ${name}, ${String(data.employeeName ?? 'an employee')} disputed their draft report. The evaluation is back in calibration and needs your review.`)}
          ${button('Open calibration', deepLink)}
        `,
      })

    case 'PERF_ACTION_RECOMMENDED':
      return compose({
        subject: `Development actions recommended for ${String(data.employeeName ?? entityTitle)}`,
        recipientName: name,
        text: `Hi ${name},\n\nFinalizing ${String(data.employeeName ?? 'an employee')}'s evaluation generated ${String(data.actionCount ?? 'new')} recommended action(s) (${String(data.actionTypes ?? '')}). They await your approval.\n\nOpen the queue: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Performance', title: 'Recommended actions await approval' })}
          ${lead(`Hi ${name}, ${String(data.actionCount ?? 'new')} action(s) were recommended for ${String(data.employeeName ?? 'an employee')}: ${String(data.actionTypes ?? '')}.`)}
          ${button('Open approval queue', deepLink)}
        `,
      })

    case 'PERF_WEEKLY_FOCUS':
      return compose({
        subject: 'Your weekly growth focus',
        recipientName: name,
        text: `Hi ${name},\n\n${String(data.focusText ?? 'Keep working toward your growth focus this week.')}\n\nLog this week's step: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Growth', title: 'Your weekly focus' })}
          ${lead(`Hi ${name}, here is what to focus on this week:`)}
          ${lead(String(data.focusText ?? ''))}
          ${button('Log my weekly step', deepLink)}
          ${muted('This nudge is growth-focused only — scores stay sealed between review cycles.')}
        `,
      })

    case 'SCRUM_REMINDER':
      return compose({
        subject: 'Daily scrum is open',
        recipientName: name,
        text: `Hi ${name},\n\nSubmit today's scrum update before the cutoff.\n\nOpen daily scrum: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Daily scrum', title: 'Submit today\'s update' })}
          ${lead(`Hi ${name}, daily scrum is open. Add today\'s plan, carry-forward items, blockers, wins, and mood before the cutoff.`)}
          ${button('Open daily scrum', deepLink)}
        `,
      })

    case 'SCRUM_MISSED':
    case 'SCRUM_NUDGE':
      return compose({
        subject: 'Daily scrum cutoff reminder',
        recipientName: name,
        text: `Hi ${name},\n\nYour daily scrum update is still missing. Submit it now: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Daily scrum', title: 'Your update is still missing', badgeText: 'Due now', badgeTone: 'warning' })}
          ${lead(`Hi ${name}, your daily scrum update has not been submitted yet.`)}
          ${button('Submit update', deepLink)}
          ${muted(String(data.yesterdayPlan ? `Yesterday's plan: ${data.yesterdayPlan}` : 'This nudge is sent at most once per person per day.'))}
        `,
      })

    case 'SCRUM_MANAGER_DIGEST':
      return compose({
        subject: 'Daily scrum manager digest',
        recipientName: name,
        text: `Hi ${name},\n\nToday's daily scrum digest is ready. Submitted: ${String(data.submittedCount ?? '—')}; missing: ${String(data.missingCount ?? '—')}; blockers: ${String(data.blockerCount ?? '—')}.\n\nOpen: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Daily scrum', title: 'Manager digest' })}
          ${lead(`Hi ${name}, here is today\'s consolidated scrum status.`)}
          ${kpiRow([
            { label: 'Submitted', value: String(data.submittedCount ?? '—') },
            { label: 'Missing', value: String(data.missingCount ?? '—') },
            { label: 'Blockers', value: String(data.blockerCount ?? '—') },
          ])}
          ${button('Open team wall', deepLink)}
        `,
      })

    case 'SCRUM_WEEKLY_DIGEST':
      return compose({
        subject: 'Weekly scrum digest',
        recipientName: name,
        text: `Hi ${name},\n\nYour weekly scrum digest is ready. Wins: ${String(data.winCount ?? '—')}; blockers resolved: ${String(data.resolvedBlockerCount ?? '—')}.\n\nOpen: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Daily scrum', title: 'Weekly digest' })}
          ${lead(`Hi ${name}, here is the weekly summary of wins, blockers, and attention signals.`)}
          ${kpiRow([
            { label: 'Wins', value: String(data.winCount ?? '—') },
            { label: 'Resolved blockers', value: String(data.resolvedBlockerCount ?? '—') },
            { label: 'Submission rate', value: fmtPct(data.submissionRate) },
          ])}
          ${button('Open scrum dashboard', deepLink)}
        `,
      })

    case 'SCRUM_BLOCKER_RAISED':
    case 'SCRUM_BLOCKER_RECURRING':
    case 'SCRUM_BLOCKER_ESCALATED':
    case 'SCRUM_BLOCKER_RESOLVED':
      return compose({
        subject: `Scrum blocker update: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\nA scrum blocker changed state: ${eventKey}. Open: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Daily scrum', title: 'Blocker update', badgeText: eventKey.replace('SCRUM_BLOCKER_', '').toLowerCase(), badgeTone: eventKey === 'SCRUM_BLOCKER_RESOLVED' ? 'success' : 'warning' })}
          ${lead(String(data.blockerSummary ?? entityTitle))}
          ${button('Open update', deepLink)}
        `,
      })

    case 'SCRUM_TEAM_MOOD_ALERT':
      return compose({
        subject: 'Team mood alert',
        recipientName: name,
        text: `Hi ${name},\n\nA team-level scrum mood alert was triggered. Open: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Daily scrum', title: 'Team mood needs attention', badgeText: 'Team aggregate', badgeTone: 'warning' })}
          ${lead('A team-level trend crossed the configured alert threshold. Individual mood remains visible only to the employee and direct manager.')}
          ${button('Open scrum analytics', deepLink)}
        `,
      })

    case 'SCRUM_COMMENT':
    case 'SCRUM_COMMENT_ADDED':
      return compose({
        subject: 'New comment on a scrum update',
        recipientName: name,
        text: `Hi ${name},\n\nA comment was added to a daily scrum update. Open: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Daily scrum', title: 'New comment' })}
          ${lead(String(data.commentPreview ?? 'A teammate commented on a daily scrum update.'))}
          ${button('Open update', deepLink)}
        `,
      })

    case 'SCRUM_LOW_SUBMISSION_RATE':
      return compose({
        subject: 'Low daily scrum submission rate',
        recipientName: name,
        text: `Hi ${name},\n\nA submission-rate signal needs attention. Open: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Daily scrum', title: 'Submission pattern needs attention', badgeText: 'Weekly signal', badgeTone: 'warning' })}
          ${lead(String(data.summary ?? 'A team member has fallen below the configured submission-rate threshold.'))}
          ${button('Open scrum dashboard', deepLink)}
        `,
      })

    case 'SCRUM_OBJECTIVE_NEGLECTED':
      return compose({
        subject: `Objective missing from daily scrum: ${entityTitle}`,
        recipientName: name,
        text: `Hi ${name},\n\n"${entityTitle}" has not appeared in daily scrum updates for the configured working-day threshold. Open: ${deepLink}`,
        html: `
          ${heading({ eyebrow: 'Daily scrum', title: 'Objective needs attention', badgeText: 'No recent mentions', badgeTone: 'warning' })}
          ${lead(`"${entityTitle}" has not appeared in daily scrum updates for the configured threshold.`)}
          ${button('Open objective', deepLink)}
        `,
      })

    case 'PROJECT_DAILY_DIGEST': {
      const projectCount = Number(data.projectCount ?? 0)
      const overdueCount = Number(data.overdueCount ?? 0)
      const blockedCount = Number(data.blockedCount ?? 0)
      const waitingApprovalCount = Number(data.waitingApprovalCount ?? 0)
      const projects = (data.projects as Array<{
        code: string
        name: string
        ragStatus: string
        overdue: number
        blocked: number
        waitingApproval: number
        upcoming: number
        highRisks: number
        overduePayments: number
        overdueCoes: number
        failedGates: number
        deepLink: string
      }> | undefined) ?? []
      const dayLabel = String(data.dayLabel ?? 'today')
      const issueProjects = projects.filter(p =>
        p.overdue > 0 || p.blocked > 0 || p.waitingApproval > 0 || p.upcoming > 0 ||
        p.highRisks > 0 || p.overduePayments > 0 || p.overdueCoes > 0 || p.failedGates > 0
      )
      return compose({
        subject: `Daily project digest — ${overdueCount + blockedCount + waitingApprovalCount} attention item${overdueCount + blockedCount + waitingApprovalCount === 1 ? '' : 's'}`,
        recipientName: name,
        text: [
          `Hi ${name},`,
          '',
          `Daily project digest for ${dayLabel}.`,
          `Projects: ${projectCount} · Overdue: ${overdueCount} · Blocked: ${blockedCount} · Waiting approval: ${waitingApprovalCount}`,
          '',
          ...issueProjects.flatMap(p => [
            `${p.code} — ${p.name} (${p.ragStatus})`,
            `  Overdue ${p.overdue} · Blocked ${p.blocked} · Waiting approval ${p.waitingApproval} · Upcoming ${p.upcoming}`,
            `  Risks ${p.highRisks} · Overdue payments ${p.overduePayments} · COEs ${p.overdueCoes} · Failed gates ${p.failedGates}`,
            `  Open: ${absoluteUrl(p.deepLink)}`,
            '',
          ]),
          `Open all projects: ${absoluteUrl('/dashboard/projects')}`,
        ].join('\n'),
        html: `
          ${heading({ eyebrow: 'Project delivery', title: 'Daily project digest', badgeText: dayLabel, badgeTone: 'primary' })}
          ${lead(`Hi ${name}, here is the daily snapshot of the projects you manage.`)}\
          ${kpiRow([
            { label: 'Projects', value: String(projectCount), tone: 'neutral' },
            { label: 'Overdue', value: String(overdueCount), tone: overdueCount > 0 ? 'danger' : 'neutral' },
            { label: 'Blocked', value: String(blockedCount), tone: blockedCount > 0 ? 'warning' : 'neutral' },
            { label: 'Waiting approval', value: String(waitingApprovalCount), tone: waitingApprovalCount > 0 ? 'warning' : 'neutral' },
          ])}
          ${issueProjects.length === 0 ? muted('No issues need attention today.') : issueProjects.map(p => {
            const items: string[] = []
            if (p.overdue > 0) items.push(`${p.overdue} overdue`)
            if (p.blocked > 0) items.push(`${p.blocked} blocked`)
            if (p.waitingApproval > 0) items.push(`${p.waitingApproval} waiting approval`)
            if (p.upcoming > 0) items.push(`${p.upcoming} upcoming`)
            if (p.highRisks > 0) items.push(`${p.highRisks} high risk`)
            if (p.overduePayments > 0) items.push(`${p.overduePayments} overdue payment`)
            if (p.overdueCoes > 0) items.push(`${p.overdueCoes} overdue COE`)
            if (p.failedGates > 0) items.push(`${p.failedGates} failed gate`)
            const badgeTone = p.ragStatus === 'RED' ? 'danger' : p.ragStatus === 'AMBER' ? 'warning' : 'success'
            return `<div style="margin:10px 0;padding:12px;border:1px solid ${TOKENS.border};border-radius:10px;background:#FAFAFC;">
              <div style="font-size:14px;font-weight:600;color:${TOKENS.ink};">${escapeHtml(p.code)} · ${escapeHtml(p.name)}</div>
              <div style="margin-top:4px;font-size:12px;color:${TOKENS.inkSecondary};">${badge(p.ragStatus, badgeTone)} ${items.join(' · ') || 'No issues'}</div>
            </div>`
          }).join('')}
          ${button('Open projects', '/dashboard/projects')}
          ${actionRow([{ label: 'Notification settings', href: '/dashboard/settings/notifications' }])}
        `,
      })
    }

    default: {
      // Project-delivery + scrum-workflow events (see renderProjectOrScrumEvent).
      const specific = renderProjectOrScrumEvent(eventKey, data, name)
      if (specific) return specific
      // Last resort for an event key with no template — the render test keeps
      // this unreachable for every key in EVENT_META.
      return compose({
        subject: `Notification`,
        recipientName: name,
        text: `Event: ${eventKey}.`,
        html: `
          ${heading({ title: 'You have a new notification' })}
          ${lead(`Open the inbox for the full context.`)}
          ${button('Open inbox', '/dashboard/notifications')}
        `,
      })
    }
  }
}
