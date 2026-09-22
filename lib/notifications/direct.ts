import { prisma } from '@/lib/prisma'
import type { EventCategory, DefaultCadence } from './events'
import { getUserPrefsBulk } from './preferences'
import { broadcastUserNotification } from '@/lib/pusher'

/**
 * The preference gate for notification writers that cannot go through `emit()`.
 *
 * `emit()` is the right path for anything with a declared `EventKey`, and it
 * gates the in-app row on `pref.inApp` and the email on `pref.email` +
 * cadence. But six writers in this codebase have their own event vocabularies
 * (comments, letters, travel, automation briefings, two request-check-in
 * routes) and called `prisma.notification.create*` directly — which meant they
 * bypassed preferences entirely. A user who had switched a category off still
 * received every one of them, in-app and by email.
 *
 * Rather than force those vocabularies into `EventKey` — a large refactor with
 * no behavioural payoff — this applies the same gate they were missing, and
 * tells the caller which recipients may still be emailed so it can keep owning
 * its own delivery.
 */

export interface DirectNotificationInput {
  /** Must be a real category, or the user has no switch for it. */
  category: EventCategory
  /** Legacy `type` column. Kept distinct from eventKey to match existing rows. */
  type: string
  eventKey?: string
  recipientIds: string[]
  title: string
  message: string
  metadata?: Record<string, unknown> | null
  emailMode?: string | null
  /** Passed through to createMany; comment fan-out relies on it. */
  skipDuplicates?: boolean
}

export interface DirectNotificationResult {
  /** Recipients who got an in-app row. */
  notified: { id: string; email: string; name: string }[]
  /** Recipients whose prefs allow email, with the cadence each one chose. */
  emailable: { id: string; email: string; name: string; cadence: DefaultCadence }[]
  /** Active recipients who have the category switched off entirely. */
  suppressed: string[]
}

/**
 * Writes in-app rows for the recipients who want them and reports who may be
 * emailed. Never throws — a notification failing must not fail the mutation
 * that triggered it, which is the same contract `emit()` holds.
 */
export async function writeDirectNotifications(
  input: DirectNotificationInput,
): Promise<DirectNotificationResult> {
  const empty: DirectNotificationResult = { notified: [], emailable: [], suppressed: [] }
  const recipients = Array.from(new Set(input.recipientIds.filter(Boolean)))
  if (recipients.length === 0) return empty

  try {
    const users = await prisma.user.findMany({
      where: { id: { in: recipients }, isActive: true },
      select: { id: true, email: true, name: true },
    })
    if (users.length === 0) return empty

    const prefs = await getUserPrefsBulk(users.map((u) => u.id), input.category)

    const result: DirectNotificationResult = { notified: [], emailable: [], suppressed: [] }
    for (const u of users) {
      const pref = prefs.get(u.id)
      // A missing pref means the resolver could not answer; default to sending
      // rather than silently dropping a notification.
      const inApp = pref ? pref.inApp : true
      const email = pref ? pref.email : true
      if (inApp) result.notified.push(u)
      if (email) {
        result.emailable.push({ ...u, cadence: pref?.emailCadence ?? 'IMMEDIATE' })
      }
      if (!inApp && !email) result.suppressed.push(u.id)
    }

    if (result.notified.length > 0) {
      await prisma.notification.createMany({
        data: result.notified.map((u) => ({
          userId: u.id,
          type: input.type,
          ...(input.eventKey ? { eventKey: input.eventKey } : {}),
          category: input.category,
          // The dispatcher truncates to 280; matched here so a row written by a
          // direct writer is not visibly longer than one written by emit().
          title: input.title,
          message: input.message.slice(0, 280),
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          ...(input.emailMode ? { emailMode: input.emailMode } : {}),
        })),
        ...(input.skipDuplicates ? { skipDuplicates: true } : {}),
      })

      // createMany does not return the rows, and re-reading them just to
      // broadcast would double the queries. The bell only needs to know
      // something arrived; it refetches to get the authoritative list and
      // unread count.
      await Promise.all(result.notified.map((u) =>
        broadcastUserNotification(u.id, { type: input.type, title: input.title })
      ))
    }

    return result
  } catch (err) {
    console.error('[notifications/direct] failed', err)
    return empty
  }
}
