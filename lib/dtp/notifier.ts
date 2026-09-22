/**
 * DTP-specific notifier. Domain code calls `notifyDtpEvent()` after every
 * status transition (submit, approve, return, etc.). It writes Notification
 * rows under category="TRAVEL" and an eventKey of "TRAVEL_*" plus dispatches
 * an immediate email via the shared sendMail helper.
 *
 * We intentionally do NOT route through lib/notifications/dispatcher because
 * (a) the central registry is keyed to OKR/KR/TODO entities and would force a
 * lot of switch-case wiring for DTP-only fanout, and (b) DTP recipient sets
 * depend on DtpDepartmentApproval / Driver / PoolCoordinator settings the
 * central dispatcher is unaware of. Same primitives — tighter scope.
 *
 * Errors are swallowed: a notification failure must not break the user's
 * primary action.
 */

import { prisma } from '@/lib/prisma'
import { writeDirectNotifications } from '@/lib/notifications/direct'
import { sendMail } from '@/lib/email'

export type DtpEventKey =
  | 'TRAVEL_PLAN_SUBMITTED'
  | 'TRAVEL_PLAN_ENDORSED'
  | 'TRAVEL_PLAN_APPROVED'
  | 'TRAVEL_PLAN_ADJUSTED'
  | 'TRAVEL_PLAN_RETURNED'
  | 'TRAVEL_PLAN_REJECTED'
  | 'TRAVEL_PLAN_WITHDRAWN'
  | 'TRAVEL_PLAN_CANCELLED'
  | 'TRAVEL_PLAN_DRIVER_ASSIGNED'
  | 'TRAVEL_PLAN_TRIP_COMPLETED'
  | 'TRAVEL_RUN_SHEET_READY'
  | 'TRAVEL_CASH_ADVANCE_REQUESTED'
  | 'TRAVEL_TRAFFIC_FLAGGED'
  | 'TRAVEL_STOP_MISSED'
  | 'TRAVEL_PICKUP_READY_EARLY'
  | 'TRAVEL_SLA_BREACH'

interface NotifyInput {
  eventKey: DtpEventKey
  recipientIds: string[]
  subject: string
  message: string
  emailHtml?: string
  emailText?: string
  metadata?: Record<string, unknown>
  /** Optional deep link path appended to NEXTAUTH_URL for the email CTA. */
  deepLinkPath?: string
}

export async function notifyDtpEvent(input: NotifyInput): Promise<void> {
  const recipients = Array.from(new Set(input.recipientIds.filter(Boolean)))
  if (recipients.length === 0) return
  try {
    // 1. In-app rows, gated on the user's TRAVEL preference.
    //
    // This wrote `category: 'TRAVEL'` from the start, but TRAVEL was not in
    // EventCategory/ALL_CATEGORIES, so the switch never appeared in the
    // preferences UI and travel notifications could not be turned off by
    // anyone. TRAVEL is a real category now and the gate below honours it.
    const delivery = await writeDirectNotifications({
      category: 'TRAVEL',
      type: input.eventKey,
      eventKey: input.eventKey,
      recipientIds: recipients,
      title: input.subject,
      message: input.message,
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.deepLinkPath ? { deepLink: input.deepLinkPath } : {}),
      },
      emailMode: 'IMMEDIATE',
    })
    const users = delivery.emailable

    // 2. Emails (best-effort, parallel)
    const baseUrl = process.env.NEXTAUTH_URL ?? ''
    const cta = input.deepLinkPath ? `${baseUrl}${input.deepLinkPath}` : null
    const text = input.emailText ?? `${input.message}${cta ? `\n\nOpen: ${cta}` : ''}`
    const html = input.emailHtml ?? renderSimpleHtml(input.subject, input.message, cta)
    await Promise.all(
      users.map(async (u) => {
        const res = await sendMail({
          to: u.email,
          toName: u.name,
          subject: input.subject,
          text,
          html,
          template: input.eventKey,
          metadata: { ...(input.metadata ?? {}), userId: u.id },
        })
        await prisma.notification.updateMany({
          where: { userId: u.id, eventKey: input.eventKey, emailSent: false },
          data: {
            emailSent: res.status === 'SENT' || res.status === 'LOGGED_ONLY',
            emailAt: new Date(),
            outboundEmailId: res.id,
          },
        })
      }),
    )
  } catch (err) {
    console.error('[dtp.notifier] failed', input.eventKey, err)
  }
}

function renderSimpleHtml(subject: string, message: string, cta: string | null): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${cta}" style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif">Open in app</a></p>`
    : ''
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;background:#f6f8fb;padding:24px">
    <table cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px">
      <tr><td><h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(subject)}</h2>
      <p style="margin:0;line-height:1.5;font-size:14px">${escapeHtml(message)}</p>
      ${button}</td></tr>
    </table></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
}
