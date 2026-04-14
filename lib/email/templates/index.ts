/**
 * Per-event email templates. Keep templates compact — each returns
 * { subject, text, html }. Templates receive a flat data blob that the
 * dispatcher has already redacted per recipient.
 *
 * Adding an event: add a new `case` in `renderTemplate`. The `entityTitle`
 * arrives already-redacted ("[Private Objective]" etc.) for recipients who
 * should not see the true title.
 */

import type { EventKey } from '@/lib/notifications/events'
import { absoluteUrl } from '@/lib/notifications/deep-link'

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

function signOff(name?: string): string {
  return `\n\n—\nThe OKR Management System${name ? ` (for ${name})` : ''}\n`
}

function wrapHtml(body: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;background:#f9fafb;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;color:#111827;font-size:14px;line-height:1.5;">
    ${body}
    <p style="margin-top:24px;color:#9ca3af;font-size:11px;">Sent by the OKR Management System. Manage email preferences in <a href="${appUrl('/dashboard/settings/notifications')}">Settings → Notifications</a>.</p>
  </div></body></html>`
}

export function renderTemplate(eventKey: EventKey, data: Data): RenderedEmail {
  const name = String(data.recipientName ?? '')
  const entityTitle = String(data.entityTitle ?? '(item)')
  const actorName = String(data.actorName ?? 'someone')
  // Always render the deep link as an absolute URL so it is clickable from a mail client.
  const deepLink = absoluteUrl(String(data.deepLink ?? '/dashboard'))

  switch (eventKey) {
    case 'ACCOUNT_INVITE':
      return simple(
        'Welcome to the OKR system — set up your account',
        `Hi ${name},\n\nYou've been invited. Activate here: ${data.activationUrl ?? appUrl('/auth/activate')}`,
        name
      )
    case 'ACCOUNT_VERIFY_EMAIL':
      return simple('Verify your email', `Hi ${name},\n\nConfirm your email: ${data.verifyUrl ?? appUrl('/auth/verify')}`, name)
    case 'ACCOUNT_PASSWORD_RESET_REQUESTED':
      return simple('Password reset requested', `Hi ${name},\n\nReset your password: ${data.resetUrl ?? appUrl('/auth/reset-password')}\nIf you didn't request this, contact your admin.`, name)
    case 'ACCOUNT_PASSWORD_CHANGED':
      return simple('Your password was changed', `Hi ${name},\n\nYour account password was changed. If this wasn't you, contact your admin immediately.\nReview your account: ${deepLink}`, name)
    case 'ACCOUNT_ROLE_CHANGED':
      return simple('Your role was updated', `Hi ${name},\n\nYour role is now ${data.newRole ?? 'updated'}. Department: ${data.newDepartment ?? '—'}.\nView profile: ${deepLink}`, name)
    case 'ACCOUNT_DEACTIVATED':
      return simple('Your account was deactivated', `Hi ${name},\n\nYour account has been deactivated.\nDetails: ${deepLink}`, name)

    case 'OBJECTIVE_ASSIGNED':
      return simple(`Objective assigned: ${entityTitle}`, `Hi ${name},\n\n${actorName} assigned you an objective: ${entityTitle}.\nOpen: ${deepLink}`, name)
    case 'OBJECTIVE_CREATED_IN_TEAM':
      return simple(`New team objective: ${entityTitle}`, `Hi ${name},\n\n${actorName} created a new objective in your team: ${entityTitle}.\nOpen: ${deepLink}`, name)
    case 'OBJECTIVE_ALIGNED_CHILD_ADDED':
      return simple(`An objective was aligned to yours`, `Hi ${name},\n\n${actorName} aligned "${data.childTitle ?? 'an objective'}" to your objective "${entityTitle}".\nOpen: ${deepLink}`, name)
    case 'OBJECTIVE_EDITED':
      return simple(`Objective updated: ${entityTitle}`, `Hi ${name},\n\n${actorName} edited "${entityTitle}".\nOpen: ${deepLink}`, name)
    case 'OBJECTIVE_ARCHIVED':
      return simple(`Objective archived: ${entityTitle}`, `Hi ${name},\n\n"${entityTitle}" was archived by ${actorName}.\nOpen: ${deepLink}`, name)
    case 'OBJECTIVE_VISIBILITY_CHANGED':
      return simple(`Visibility changed: ${entityTitle}`, `Hi ${name},\n\nVisibility on "${entityTitle}" is now ${data.newVisibility ?? 'updated'}.\nOpen: ${deepLink}`, name)

    case 'KR_ASSIGNED':
      return simple(`Key result assigned: ${entityTitle}`, `Hi ${name},\n\n${actorName} assigned you a key result: ${entityTitle}.\nOpen: ${deepLink}`, name)
    case 'KR_ADDED_TO_OBJECTIVE':
      return simple(`New key result on your objective`, `Hi ${name},\n\n${actorName} added a key result: ${entityTitle}.\nOpen: ${deepLink}`, name)
    case 'KR_PROGRESS_UPDATED':
      return simple(`Progress update: ${entityTitle}`, `Hi ${name},\n\n${actorName} updated progress on "${entityTitle}". Current progress: ${data.progress ?? '—'}%.\nOpen: ${deepLink}`, name)
    case 'KR_AT_RISK':
      return simple(`⚠️ At risk: ${entityTitle}`, `Hi ${name},\n\n"${entityTitle}" is now flagged AT_RISK / OFF_TRACK.\nOpen: ${deepLink}`, name)
    case 'KR_COMPLETED':
      return simple(`✅ Completed: ${entityTitle}`, `Hi ${name},\n\n"${entityTitle}" reached 100%.\nOpen: ${deepLink}`, name)
    case 'KR_ARCHIVED':
      return simple(`Archived: ${entityTitle}`, `Hi ${name},\n\n"${entityTitle}" was archived.\nOpen: ${deepLink}`, name)

    case 'CHECKIN_WEEKLY_DUE':
      return simple(`Weekly check-in due`, `Hi ${name},\n\nTime for your weekly check-in. ${data.count ?? 0} item(s) waiting.\nOpen: ${appUrl('/dashboard/my')}`, name)
    case 'CHECKIN_MISSED_7D':
      return simple(`Missed check-in (7 days)`, `Hi ${name},\n\n"${entityTitle}" hasn't been updated in 7+ days.\nOpen: ${deepLink}`, name)
    case 'CHECKIN_MISSED_14D':
      return simple(`Escalation: 14-day missed check-in`, `Hi ${name},\n\n"${entityTitle}" hasn't been updated in 14+ days. Please take action.\nOpen: ${deepLink}`, name)

    case 'TODO_ASSIGNED':
      return simple(`To-do assigned: ${entityTitle}`, `Hi ${name},\n\n${actorName} assigned you a to-do: ${entityTitle}.\nDue: ${data.dueDate ?? '—'}\nOpen: ${deepLink}`, name)
    case 'TODO_REASSIGNED_AWAY':
      return simple(`To-do reassigned`, `Hi ${name},\n\n"${entityTitle}" was reassigned to ${data.newAssigneeName ?? 'someone else'}.`, name)
    case 'TODO_DUE_TOMORROW':
      return simple(`Due tomorrow: ${entityTitle}`, `Hi ${name},\n\n"${entityTitle}" is due tomorrow (${data.dueDate ?? ''}).\nOpen: ${deepLink}`, name)
    case 'TODO_OVERDUE':
      return simple(`Overdue: ${entityTitle}`, `Hi ${name},\n\n"${entityTitle}" is overdue (was due ${data.dueDate ?? ''}).\nOpen: ${deepLink}`, name)
    case 'TODO_COMPLETED':
      return simple(`Completed: ${entityTitle}`, `Hi ${name},\n\n${actorName} completed "${entityTitle}".`, name)

    case 'TIMEFRAME_OPENED':
      return simple(`New timeframe: ${data.timeframeName ?? ''}`, `Hi ${name},\n\nA new OKR timeframe is open: ${data.timeframeName ?? ''} (${data.startDate ?? ''} → ${data.endDate ?? ''}).\nOpen: ${appUrl('/dashboard')}`, name)
    case 'TIMEFRAME_ENDING_7D':
      return simple(`Timeframe ending in 7 days`, `Hi ${name},\n\n${data.timeframeName ?? 'The current timeframe'} ends in 7 days. Please finalize your OKRs.\nOpen: ${appUrl('/dashboard/my')}`, name)
    case 'TIMEFRAME_CLOSING_1D':
      return simple(`Timeframe closing tomorrow`, `Hi ${name},\n\n${data.timeframeName ?? 'The current timeframe'} closes tomorrow.\nOpen: ${appUrl('/dashboard/my')}`, name)
    case 'TIMEFRAME_CLOSED':
      return simple(`Timeframe closed: ${data.timeframeName ?? ''}`, `Hi ${name},\n\n${data.timeframeName ?? 'The timeframe'} is now closed. Final scores are locked.\nOpen: ${appUrl('/dashboard')}`, name)

    case 'ALIGNMENT_REQUESTED':
      return simple(`Alignment request`, `Hi ${name},\n\n${actorName} requested alignment for "${entityTitle}".\nReview: ${deepLink}`, name)
    case 'ALIGNMENT_DECISION':
      return simple(`Alignment ${data.decision ?? 'decision'}`, `Hi ${name},\n\nYour alignment for "${entityTitle}" was ${data.decision ?? 'updated'} by ${actorName}.`, name)
    case 'PARENT_OBJECTIVE_ARCHIVED_ORPHAN':
      return simple(`Parent objective archived`, `Hi ${name},\n\nThe parent of "${entityTitle}" was archived — your objective is now orphaned and needs re-alignment.\nOpen: ${deepLink}`, name)

    case 'USER_MENTIONED':
      return simple(`You were mentioned`, `Hi ${name},\n\n${actorName} mentioned you on "${entityTitle}".\n${data.snippet ?? ''}\nOpen: ${deepLink}`, name)
    case 'COMMENT_ON_OWNED_ENTITY':
      return simple(`New comment on "${entityTitle}"`, `Hi ${name},\n\n${actorName} commented on "${entityTitle}".\n${data.snippet ?? ''}\nOpen: ${deepLink}`, name)

    case 'ADMIN_USER_CREATED':
      return simple(`New user: ${data.newUserName ?? ''}`, `A new user was created: ${data.newUserName ?? ''} (${data.newUserEmail ?? ''}), role ${data.newUserRole ?? ''}.\nOpen user: ${deepLink}`, name)
    case 'ADMIN_BULK_JOB_DONE':
      return simple(`Bulk job complete: ${data.jobName ?? ''}`, `Your bulk job ${data.jobName ?? ''} finished with status ${data.jobStatus ?? 'OK'}.\nOpen settings: ${deepLink}`, name)
    case 'ADMIN_SECURITY_ALERT':
      return simple(`⚠️ Security alert`, `Security event: ${data.summary ?? 'see admin panel'}.\nReview audit log: ${deepLink}`, name)
    case 'ADMIN_WEEKLY_HEALTH_DIGEST':
      return simple(`Weekly org OKR health`, `Active objectives: ${data.activeObjectives ?? 0}. At-risk: ${data.atRisk ?? 0}. Off-track: ${data.offTrack ?? 0}.\nOpen reports: ${deepLink}`, name)
    case 'ADMIN_MONTHLY_EXEC_SUMMARY':
      return simple(`Monthly executive summary`, `Avg progress: ${data.avgProgress ?? 0}%. Objectives completed: ${data.completed ?? 0}.\nOpen reports: ${deepLink}`, name)

    default:
      return simple(`Notification`, `Event: ${eventKey}.`, name)
  }
}

function simple(subject: string, text: string, name?: string): RenderedEmail {
  const body = text + signOff(name)
  // Auto-linkify any http(s) URL inside the text body so the HTML version is clickable.
  const escaped = escapeHtml(text)
  const linkified = escaped.replace(/(https?:\/\/[^\s<]+)(?=[\s<.,;)!?]|$)/g, (url) =>
    `<a href="${url}" style="color:#2563eb;text-decoration:underline;">${url}</a>`
  )
  const html = wrapHtml(
    `<h2 style="margin:0 0 8px;">${escapeHtml(subject)}</h2>` +
    `<p style="white-space:pre-line;color:#374151;">${linkified}</p>`
  )
  return { subject, text: body, html }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
