/**
 * Briefing distribution.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §4.1, FR-10, FR-11.
 *
 * Distribution is the irreversible side effect, so it is what the DRY_RUN →
 * REVIEW → AUTO graduation gates:
 *
 *   DRY_RUN — the Briefing exists, owner-only, nothing leaves the system
 *   REVIEW  — the Briefing exists, owner is nudged, recipients get it on approval
 *   AUTO    — recipients get it immediately, unless onEmpty suppresses the send
 *
 * The Briefing is a document, not a templated notification, so email goes
 * through sendMail directly rather than lib/notifications/dispatcher — that
 * dispatcher resolves its own recipients from the event key, which cannot
 * express "whoever this automation lists".
 */

import { prisma } from '@/lib/prisma'
import { isBlockedRecipient, sendMail } from '@/lib/email'
import { absoluteUrl } from '@/lib/notifications/deep-link'
import type { AutomationRecipient, DeliveryChannel } from '@/types/automations'

export interface DeliverableBriefing {
  id: string
  automationId: string
  automationName: string
  title: string
  summary: string
  htmlEmail: string
  textPlain: string
  newCount: number
  changedCount: number
}

export interface DeliveryOutcome {
  emailed: number
  inApp: number
  suppressed: number
  failed: number
}

export function briefingUrl(briefingId: string): string {
  return absoluteUrl(`/dashboard/automations/briefings/${briefingId}`)
}

/**
 * Persist one row per (recipient, channel) up front, so a crash mid-delivery
 * leaves an accurate record of who did and did not receive the Briefing.
 */
export async function seedRecipientRows(
  briefingId: string,
  recipients: AutomationRecipient[]
): Promise<void> {
  const rows = recipients.flatMap((r) =>
    r.channels.map((channel) => ({ briefingId, userId: r.userId, channel, status: 'PENDING' }))
  )
  if (rows.length === 0) return
  await prisma.automationBriefingRecipient.createMany({ data: rows, skipDuplicates: true })
}

/**
 * Send a published Briefing to its recipients. Idempotent per (briefing, user,
 * channel): rows already marked SENT are skipped, so a retried run never
 * double-emails.
 */
export async function deliverBriefing(
  briefing: DeliverableBriefing,
  recipients: AutomationRecipient[]
): Promise<DeliveryOutcome> {
  const outcome: DeliveryOutcome = { emailed: 0, inApp: 0, suppressed: 0, failed: 0 }
  if (recipients.length === 0) return outcome

  const userIds = Array.from(new Set(recipients.map((r) => r.userId)))
  const [users, existing] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true, email: true, name: true },
    }),
    prisma.automationBriefingRecipient.findMany({
      where: { briefingId: briefing.id },
      select: { userId: true, channel: true, status: true },
    }),
  ])

  const userById = new Map(users.map((u) => [u.id, u]))
  const alreadySent = new Set(
    existing.filter((r) => r.status === 'SENT').map((r) => `${r.userId}:${r.channel}`)
  )

  for (const recipient of recipients) {
    const user = userById.get(recipient.userId)

    for (const channel of recipient.channels) {
      if (alreadySent.has(`${recipient.userId}:${channel}`)) continue

      // A deactivated or missing user is suppressed, not failed — nothing is broken.
      if (!user) {
        await markRecipient(briefing.id, recipient.userId, channel, 'SUPPRESSED', 'User is inactive or missing')
        outcome.suppressed++
        continue
      }

      if (channel === 'EMAIL') {
        // The block-list is authoritative for seeded placeholder accounts; a
        // suppressed send is expected behaviour, not a delivery failure.
        if (isBlockedRecipient(user.email)) {
          await markRecipient(briefing.id, user.id, channel, 'SUPPRESSED', 'Recipient is on the outbound block-list')
          outcome.suppressed++
          continue
        }
        try {
          const result = await sendMail({
            to: user.email,
            toName: user.name,
            subject: briefing.title,
            text: briefing.textPlain,
            html: briefing.htmlEmail,
            template: 'automation_briefing',
            metadata: {
              automationId: briefing.automationId,
              briefingId: briefing.id,
              newCount: briefing.newCount,
              changedCount: briefing.changedCount,
            },
          })
          if (result.status === 'FAILED') {
            await markRecipient(briefing.id, user.id, channel, 'FAILED', 'Mail driver reported a failure')
            outcome.failed++
          } else {
            await markRecipient(briefing.id, user.id, channel, 'SENT')
            outcome.emailed++
          }
        } catch (error) {
          await markRecipient(briefing.id, user.id, channel, 'FAILED', asMessage(error))
          outcome.failed++
        }
        continue
      }

      if (channel === 'IN_APP') {
        try {
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'REMINDER',
              eventKey: 'AUTOMATION_BRIEFING_PUBLISHED',
              category: 'ADMIN',
              title: briefing.title,
              message: briefing.summary.slice(0, 500),
              metadata: JSON.stringify({
                automationId: briefing.automationId,
                briefingId: briefing.id,
                url: `/dashboard/automations/briefings/${briefing.id}`,
              }),
            },
          })
          await markRecipient(briefing.id, user.id, channel, 'SENT')
          outcome.inApp++
        } catch (error) {
          await markRecipient(briefing.id, user.id, channel, 'FAILED', asMessage(error))
          outcome.failed++
        }
        continue
      }

      // TELEGRAM lands in Phase 1 alongside the rest of the notify surface.
      await markRecipient(briefing.id, user.id, channel, 'SUPPRESSED', 'Channel not enabled in this phase')
      outcome.suppressed++
    }
  }

  return outcome
}

async function markRecipient(
  briefingId: string,
  userId: string,
  channel: DeliveryChannel | string,
  status: string,
  error?: string
): Promise<void> {
  await prisma.automationBriefingRecipient.upsert({
    where: { briefingId_userId_channel: { briefingId, userId, channel } },
    create: {
      briefingId, userId, channel, status,
      deliveredAt: status === 'SENT' ? new Date() : null,
      error: error ?? null,
    },
    update: {
      status,
      deliveredAt: status === 'SENT' ? new Date() : null,
      error: error ?? null,
    },
  })
}

/** Nudge the owner that a Briefing is waiting for their approval (REVIEW mode). */
export async function notifyOwnerForReview(
  ownerId: string,
  briefing: { id: string; title: string; automationId: string; newCount: number; changedCount: number }
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: ownerId,
      type: 'REMINDER',
      eventKey: 'AUTOMATION_REVIEW_PENDING',
      category: 'ADMIN',
      title: `Review: ${briefing.title}`,
      message: `${briefing.newCount} new and ${briefing.changedCount} changed items are ready to send.`,
      metadata: JSON.stringify({
        automationId: briefing.automationId,
        briefingId: briefing.id,
        url: `/dashboard/automations/briefings/${briefing.id}`,
      }),
    },
  })
}

/** Tell the owner a run failed. Escalates to email on the third strike. */
export async function notifyOwnerOfFailure(
  ownerId: string,
  automation: { id: string; name: string; consecutiveFailures: number },
  errorMessage: string
): Promise<void> {
  const disabled = automation.consecutiveFailures >= 3
  await prisma.notification.create({
    data: {
      userId: ownerId,
      type: 'REMINDER',
      eventKey: disabled ? 'AUTOMATION_DISABLED_ON_FAILURE' : 'AUTOMATION_RUN_FAILED',
      category: 'ADMIN',
      title: disabled
        ? `Automation disabled: ${automation.name}`
        : `Automation run failed: ${automation.name}`,
      message: disabled
        ? `Three consecutive failures — the automation has been disabled. Last error: ${errorMessage}`.slice(0, 500)
        : errorMessage.slice(0, 500),
      metadata: JSON.stringify({
        automationId: automation.id,
        url: `/dashboard/automations/${automation.id}/runs`,
      }),
    },
  }).catch(() => undefined)

  if (!disabled) return

  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true, name: true } })
  if (!owner || isBlockedRecipient(owner.email)) return
  await sendMail({
    to: owner.email,
    toName: owner.name,
    subject: `Automation disabled: ${automation.name}`,
    text: [
      `Your automation "${automation.name}" has failed three times in a row and has been disabled.`,
      '',
      `Last error: ${errorMessage}`,
      '',
      `Review it here: ${absoluteUrl(`/dashboard/automations/${automation.id}/runs`)}`,
    ].join('\n'),
    template: 'automation_disabled',
    metadata: { automationId: automation.id },
  }).catch(() => undefined)
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
