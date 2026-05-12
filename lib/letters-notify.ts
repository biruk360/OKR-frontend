/**
 * Letter Management notifications — direct Notification inserts.
 *
 * NOTE: The full notification pipeline (`lib/notifications/dispatcher.ts`) is
 * driven by a strict EventKey matrix defined in `docs/User_Permissions.md`.
 * Adding `LETTER_*` events properly requires extending: EventKey union,
 * EVENT_META, EventCategory, the dispatcher's `resolveRecipients` switch, the
 * redact rules, and the email-templates registry. That's a larger change owned
 * by the notifications subsystem.
 *
 * For now, transition routes call helpers here that write straight to the
 * `notifications` table (in-app only) so signatories / approvers / preparers
 * still get a bell-icon ping on every state change. Email integration is
 * deferred until the EventKey extension lands.
 *
 * TODO(notifications): replace these direct inserts with `emit('LETTER_*', ...)`
 * once EventKey is extended with letter events.
 */

import { prisma } from '@/lib/prisma'
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
  try {
    await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: args.eventKey,
        eventKey: args.eventKey,
        category: 'ADMIN', // until LETTER category is added to EventCategory enum
        title: args.title,
        message: args.message,
        metadata: JSON.stringify({
          letterId: args.letter.id,
          referenceNumber: args.letter.referenceNumber,
          actorId: args.actorId,
        }),
      })),
    })
  } catch (err) {
    console.error('[letters-notify] failed to create notifications', err)
  }
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
