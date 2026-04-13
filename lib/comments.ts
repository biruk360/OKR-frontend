import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'

/**
 * Parse @mentions out of comment content. We accept both forms:
 *   1. `@email-local-part` — matched against User.email local part (before `@`).
 *   2. `@FirstLast` or `@First-Last` — matched against User.name with spaces compressed.
 * Returns the ids of distinct users that were mentioned.
 */
export async function resolveMentions(content: string): Promise<string[]> {
  const tokens = Array.from(new Set(content.match(/@([\w.\-]+)/g) ?? [])).map((t) =>
    t.slice(1).toLowerCase(),
  )
  if (tokens.length === 0) return []

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true },
  })
  const hits = new Set<string>()
  for (const u of users) {
    const localPart = u.email.split('@')[0].toLowerCase()
    const nameSlug = (u.name ?? '').toLowerCase().replace(/\s+/g, '-')
    const nameCondensed = (u.name ?? '').toLowerCase().replace(/\s+/g, '')
    if (tokens.some((t) => t === localPart || t === nameSlug || t === nameCondensed)) {
      hits.add(u.id)
    }
  }
  return Array.from(hits)
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

  const targets = await prisma.user.findMany({
    where: { id: { in: unique }, isActive: true },
    select: { id: true, name: true, email: true },
  })

  const href =
    args.entityType === 'OBJECTIVE'
      ? `/dashboard/objectives/${args.entityId}`
      : `/dashboard/key-results/${args.entityId}`

  const preview = args.content.length > 140 ? args.content.slice(0, 140) + '…' : args.content

  await prisma.notification.createMany({
    data: targets.map((t) => ({
      type: 'COMMENT',
      title: `${args.authorName} commented on ${args.entityTitle}`,
      message: preview,
      userId: t.id,
      metadata: JSON.stringify({
        commentId: args.commentId,
        entityType: args.entityType,
        entityId: args.entityId,
        href,
      }),
    })),
    skipDuplicates: true,
  })

  await Promise.all(
    targets.map(async (t) => {
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
