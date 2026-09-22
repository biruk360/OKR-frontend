import { prisma } from '@/lib/prisma'
import { writeDirectNotifications } from '@/lib/notifications/direct'
import { sendMail } from '@/lib/email'

/** Hard cap so a pasted wall of mentions cannot fan out into thousands of emails (MEN-4). */
export const MAX_MENTIONS_PER_COMMENT = 25

/**
 * User ids carried explicitly in rich-text mention markup.
 *
 * TipTap's Mention extension renders the id as `data-id`. The to-do comment
 * route used to look for `data-mention-id` instead, which `MentionEditor`
 * hardcoded to an empty string — so the regex never matched and tagging someone
 * in a to-do comment notified nobody, ever. Both attributes are read here so
 * existing comments keep resolving whichever form they were stored in.
 *
 * Exported for direct unit testing; callers should use `resolveMentions`.
 */
export function extractMentionIdsFromMarkup(content: string): string[] {
  const ids: string[] = []
  for (const attr of ['data-id', 'data-mention-id']) {
    const re = new RegExp(`${attr}="([^"]+)"`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      const id = m[1].trim()
      // The empty-string case is exactly the bug above; skip rather than query for ''.
      if (id && !ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

/**
 * Parse @mentions out of comment content. Three forms, in order of reliability:
 *   1. Rich-text markup carrying the user id (`data-id` / `data-mention-id`) —
 *      what the mention picker produces, and unambiguous.
 *   2. `@email-local-part` — matched against User.email local part (before `@`).
 *   3. `@FirstLast` / `@First-Last` / `@First` — matched against User.name.
 *
 * Forms 2 and 3 are the fallback for surfaces with no mention picker and for
 * comments written before one existed.
 *
 * Returns the ids of distinct ACTIVE users that were mentioned, capped at
 * MAX_MENTIONS_PER_COMMENT.
 */
export async function resolveMentions(content: string): Promise<string[]> {
  const markupIds = extractMentionIdsFromMarkup(content)

  // Strip tags before token matching, or attribute values (hrefs, class names)
  // would be scanned for @tokens too.
  const text = content.replace(/<[^>]+>/g, ' ')
  const tokens = Array.from(new Set(text.match(/@([\w.\-]+)/g) ?? [])).map((t) =>
    t.slice(1).toLowerCase(),
  )

  if (markupIds.length === 0 && tokens.length === 0) return []

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true },
  })

  const hits = new Set<string>()
  // Markup ids are authoritative, but still filtered through the active-user
  // query above so a stale or spoofed id cannot address an inactive account.
  const activeIds = new Set(users.map((u) => u.id))
  for (const id of markupIds) if (activeIds.has(id)) hits.add(id)

  for (const u of users) {
    const localPart = u.email.split('@')[0].toLowerCase()
    const name = (u.name ?? '').toLowerCase()
    const nameSlug = name.replace(/\s+/g, '-')
    const nameCondensed = name.replace(/\s+/g, '')
    // First name alone: the picker renders "@Biruk Hailu", and a regex token
    // breaks at the space, so "@Biruk" is what a plain-text scan actually sees.
    const firstName = name.split(/\s+/)[0]
    if (tokens.some((t) => t === localPart || t === nameSlug || t === nameCondensed || (!!firstName && t === firstName))) {
      hits.add(u.id)
    }
  }
  return Array.from(hits).slice(0, MAX_MENTIONS_PER_COMMENT)
}

interface NotifyArgs {
  commentId: string
  content: string
  authorId: string
  authorName: string
  entityType: 'OBJECTIVE' | 'KEY_RESULT'
  entityId: string
  entityTitle: string
  /** Additional user ids that should receive the notification (owner, contributors). */
  recipientIds: string[]
}

/** Create in-app notifications + send email for each unique recipient. Swallows email errors. */
export async function fanOutCommentNotifications(args: NotifyArgs): Promise<void> {
  const unique = Array.from(new Set(args.recipientIds.filter((id) => id && id !== args.authorId)))
  if (unique.length === 0) return

  const href =
    args.entityType === 'OBJECTIVE'
      ? `/dashboard/objectives/${args.entityId}`
      : `/dashboard/key-results/${args.entityId}`

  const preview = args.content.length > 140 ? args.content.slice(0, 140) + '…' : args.content

  // Goes through the shared gate rather than writing rows directly: this used to
  // ignore the user's COMMENT preference completely, so someone who had turned
  // comment notifications off still received every one of them.
  const delivery = await writeDirectNotifications({
    category: 'COMMENT',
    type: 'COMMENT',
    recipientIds: unique,
    title: `${args.authorName} commented on ${args.entityTitle}`,
    message: preview,
    metadata: {
      commentId: args.commentId,
      entityType: args.entityType,
      entityId: args.entityId,
      // `deepLink` as well as `href` — the notification row serializer reads
      // both, but `deepLink` is the canonical key.
      deepLink: href,
      href,
    },
    skipDuplicates: true,
  })

  await Promise.all(
    delivery.emailable.map(async (t) => {
      try {
        await sendMail({
          to: t.email,
          toName: t.name,
          subject: `${args.authorName} commented on ${args.entityTitle}`,
          text: `${args.authorName} said:\n\n${args.content}\n\nOpen it: ${process.env.APP_URL ?? ''}${href}`,
          html: `<p><strong>${escapeHtml(args.authorName)}</strong> commented on <em>${escapeHtml(args.entityTitle)}</em>:</p><blockquote>${escapeHtml(args.content)}</blockquote><p><a href="${process.env.APP_URL ?? ''}${href}">Open the ${args.entityType === 'OBJECTIVE' ? 'objective' : 'key result'}</a>.</p>`,
          template: 'comment-notification',
          metadata: { commentId: args.commentId, entityType: args.entityType, entityId: args.entityId },
        })
      } catch (err) {
        console.error('[comments] email send failed', { userId: t.id, err })
      }
    }),
  )
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
