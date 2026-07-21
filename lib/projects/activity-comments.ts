import type { Prisma, PrismaClient } from '@prisma/client'

export type ActivityCommentVisibility = 'INTERNAL' | 'CLIENT_VISIBLE'

type Db = PrismaClient | Prisma.TransactionClient

export interface ActivityCommentAuthor {
  id: string | null
  name: string
  email: string | null
  avatar: string | null
}

export interface ActivityCommentNode {
  id: string
  activityId: string
  authorId: string
  content: string
  parentId: string | null
  visibility: ActivityCommentVisibility
  mentions: string[]
  isClientAuthor: boolean
  createdAt: string
  author: ActivityCommentAuthor
  replies: ActivityCommentNode[]
}

export function activityCommentWhere(
  activityId: string,
  opts: { portal?: boolean } = {},
): Prisma.ActivityCommentWhereInput {
  return {
    activityId,
    ...(opts.portal ? { visibility: 'CLIENT_VISIBLE' } : {}),
  }
}

export function activityAttachmentWhere(
  activityId: string,
  opts: { portal?: boolean } = {},
): Prisma.ActivityAttachmentWhereInput {
  return {
    activityId,
    ...(opts.portal ? { visibility: 'CLIENT_VISIBLE' } : {}),
  }
}

export function extractMentionIds(content: string): string[] {
  const ids = new Set<string>()
  const patterns = [
    /\bdata-mention-id=["']([^"']+)["']/gi,
    /\bdata-id=["']([^"']+)["']/gi,
  ]
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) ids.add(match[1])
    }
  }
  return Array.from(ids)
}

export async function listActivityComments(
  db: Db,
  activityId: string,
  opts: { portal?: boolean } = {},
): Promise<ActivityCommentNode[]> {
  const comments = await db.activityComment.findMany({
    where: activityCommentWhere(activityId, opts),
    orderBy: { createdAt: 'asc' },
  })

  const internalAuthorIds = Array.from(new Set(comments.filter((c) => !c.isClientAuthor).map((c) => c.authorId)))
  const clientAuthorIds = Array.from(new Set(comments.filter((c) => c.isClientAuthor).map((c) => c.authorId)))

  const [users, clientUsers] = await Promise.all([
    internalAuthorIds.length
      ? db.user.findMany({
          where: { id: { in: internalAuthorIds } },
          select: { id: true, name: true, email: true, avatar: true },
        })
      : Promise.resolve([]),
    clientAuthorIds.length
      ? db.clientPortalUser.findMany({
          where: { id: { in: clientAuthorIds } },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
  ])

  const usersById = new Map(users.map((u) => [u.id, u]))
  const clientsById = new Map(clientUsers.map((u) => [u.id, u]))
  const byId = new Map<string, ActivityCommentNode>()

  for (const comment of comments) {
    const author = serializeAuthor(comment.authorId, comment.isClientAuthor, opts.portal, usersById, clientsById)
    byId.set(comment.id, {
      id: comment.id,
      activityId: comment.activityId,
      authorId: comment.authorId,
      content: comment.content,
      parentId: comment.parentId,
      visibility: comment.visibility as ActivityCommentVisibility,
      mentions: comment.mentions,
      isClientAuthor: comment.isClientAuthor,
      createdAt: comment.createdAt.toISOString(),
      author,
      replies: [],
    })
  }

  const roots: ActivityCommentNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null
    if (parent) parent.replies.push(node)
    else roots.push(node)
  }
  return roots
}

export async function listActivityAttachments(
  db: Db,
  activityId: string,
  opts: { portal?: boolean } = {},
) {
  return db.activityAttachment.findMany({
    where: activityAttachmentWhere(activityId, opts),
    orderBy: { createdAt: 'asc' },
  })
}

function serializeAuthor(
  authorId: string,
  isClientAuthor: boolean,
  portal: boolean | undefined,
  usersById: Map<string, { id: string; name: string | null; email: string; avatar: string | null }>,
  clientsById: Map<string, { id: string; name: string; email: string }>,
): ActivityCommentAuthor {
  if (portal) {
    return isClientAuthor
      ? { id: null, name: 'Client', email: null, avatar: null }
      : { id: null, name: '360Ground', email: null, avatar: null }
  }

  if (isClientAuthor) {
    const client = clientsById.get(authorId)
    return {
      id: authorId,
      name: client?.name ?? 'Client',
      email: client?.email ?? null,
      avatar: null,
    }
  }

  const user = usersById.get(authorId)
  return {
    id: authorId,
    name: user?.name ?? user?.email ?? 'Unknown user',
    email: user?.email ?? null,
    avatar: user?.avatar ?? null,
  }
}
