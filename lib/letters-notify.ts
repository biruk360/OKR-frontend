/**
 * Letter Management notifications.
 *
 * Letter events are not in the dispatcher's EventKey vocabulary, so — like
 * comments, DTP and travel — they go through the shared preference gate
 * `writeDirectNotifications` (category LETTER): it writes the in-app rows for
 * recipients who want them and returns who may be emailed. We then email
 * those recipients ourselves (same pattern as lib/dtp/notifier.ts), recording
 * the delivery on the notification row. sendMail's fake-recipient block-list
 * still applies.
 */

import { prisma } from '@/lib/prisma'
import { writeDirectNotifications } from '@/lib/notifications/direct'
import { absoluteUrl } from '@/lib/notifications/deep-link'
import { sendMail } from '@/lib/email'
import { escapeHtml } from '@/lib/letter-sanitize'
import type { Letter } from '@prisma/client'

interface NotifyArgs {
  recipientIds: Array<string | null | undefined>
  actorId: string
  letter: Pick<Letter, 'id' | 'referenceNumber' | 'subject'>
  title: string
  message: string
  eventKey: string
}

async function insert(args: NotifyArgs): Promise<void> {
  const recipients = Array.from(new Set(args.recipientIds.filter((id): id is string => Boolean(id))))
    .filter((id) => id !== args.actorId) // don't self-notify
  if (recipients.length === 0) return
  // `LETTER` now exists as a real category — these rows used to be filed under
  // `ADMIN` with a comment saying "until LETTER category is added", which meant
  // muting admin digests also muted letters. The shared gate applies the user's
  // preference; the direct write here applied none at all.
  const deepLink = `/dashboard/letters/${args.letter.id}`
  const startedAt = new Date()
  const delivery = await writeDirectNotifications({
    category: 'LETTER',
    type: args.eventKey,
    eventKey: args.eventKey,
    recipientIds: recipients,
    title: args.title,
    message: args.message,
    metadata: {
      letterId: args.letter.id,
      referenceNumber: args.letter.referenceNumber,
      actorId: args.actorId,
      deepLink,
    },
    emailMode: 'IMMEDIATE',
  })

  // Email is best-effort: a mail failure must never fail the transition.
  if (delivery.emailable.length === 0) return
  const link = absoluteUrl(deepLink)
  const text = `${args.message}\n\nOpen the letter: ${link}`
  const html = `<p>${escapeHtml(args.message)}</p><p><a href="${escapeHtml(link)}">Open the letter</a></p>`
  await Promise.all(
    delivery.emailable.map(async (u) => {
      try {
        const res = await sendMail({
          to: u.email,
          toName: u.name,
          subject: args.title,
          text,
          html,
          template: args.eventKey,
          metadata: { letterId: args.letter.id, userId: u.id },
        })
        await prisma.notification.updateMany({
          where: { userId: u.id, eventKey: args.eventKey, emailSent: false, createdAt: { gte: startedAt } },
          data: {
            emailSent: res.status === 'SENT' || res.status === 'LOGGED_ONLY',
            emailAt: new Date(),
            outboundEmailId: res.id,
          },
        })
      } catch (err) {
        console.error('[letters-notify] email send failed', { userId: u.id, eventKey: args.eventKey, err })
      }
    }),
  )
}

async function resolveApprovers(): Promise<string[]> {
  // FR-15: `letter:approve` maps to ADMIN + EXECUTIVE for now.
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['ADMIN', 'EXECUTIVE'] } },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

const refLabel = (l: { referenceNumber: string | null; subject: string }) =>
  l.referenceNumber || l.subject

export async function notifyLetterSubmitted(actorId: string, letter: Letter): Promise<void> {
  const approvers = await resolveApprovers()
  await insert({
    recipientIds: [...approvers, letter.signatoryId],
    actorId,
    letter,
    eventKey: 'LETTER_SUBMITTED',
    title: 'Letter awaiting approval',
    message: `${refLabel(letter)} — "${letter.subject}" was submitted for approval.`,
  })
}

export async function notifyLetterApproved(actorId: string, letter: Letter): Promise<void> {
  await insert({
    recipientIds: [letter.preparedById, letter.signatoryId],
    actorId,
    letter,
    eventKey: 'LETTER_APPROVED',
    title: 'Letter approved',
    message: `${refLabel(letter)} — "${letter.subject}" has been approved.`,
  })
}

export async function notifyLetterRejected(
  actorId: string,
  letter: Letter,
  reason: string
): Promise<void> {
  await insert({
    recipientIds: [letter.preparedById],
    actorId,
    letter,
    eventKey: 'LETTER_REJECTED',
    title: 'Letter returned to draft',
    message: `${refLabel(letter)} — "${letter.subject}" was returned to draft. Reason: ${reason}`,
  })
}

export async function notifyLetterSent(actorId: string, letter: Letter): Promise<void> {
  await insert({
    recipientIds: [letter.preparedById, letter.signatoryId],
    actorId,
    letter,
    eventKey: 'LETTER_SENT',
    title: 'Letter dispatched',
    message: `${refLabel(letter)} — "${letter.subject}" has been marked as sent (${letter.dispatchMethod ?? 'unspecified method'}).`,
  })
}
