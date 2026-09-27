/**
 * Who may attach a file to — and read a file from — a comment.
 *
 * This is the whole security model for attachments. Files are stored outside
 * `public/` and served only by a route that calls `canAccessAttachmentScope`
 * first, so "has the URL" grants nothing on its own.
 *
 * The existing to-do uploader checked only that the to-do *existed*, which let
 * any signed-in user attach to any to-do by id and let anyone read the result.
 * This replaces that with the same visibility rule used to read the parent.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md UPL-6, UPL-AC-3, UPL-AC-4.
 */

import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { canViewObjective, type UserRole } from '@/lib/permissions'
import { canReadTodo, canWriteTodo } from '@/lib/todos/access'
import { getReadableProject } from '@/lib/projects/access'
import { canViewScrumUser } from '@/features/scrum/services/access'
import { isScrumDraft } from '@/features/scrum/services/drafts'

export const COMMENT_SCOPES = ['TODO', 'OKR', 'ACTIVITY', 'SCRUM'] as const
export type CommentScope = (typeof COMMENT_SCOPES)[number]

export function isCommentScope(v: unknown): v is CommentScope {
  return typeof v === 'string' && (COMMENT_SCOPES as readonly string[]).includes(v)
}

export interface Actor {
  id: string
  role: UserRole
  /** `'CLIENT_PORTAL'` sessions never reach internal cards. */
  userType?: string | null
}

/**
 * `read` — viewing the entity's comments/attachments (download, list).
 * `write` — adding to it (staging an upload for a comment). Only the TODO
 * scope distinguishes the two; OKR, ACTIVITY and SCRUM each use the one rule
 * their comment POST enforces.
 */
export type AttachmentAccessMode = 'read' | 'write'

/**
 * Can `actor` see (or, with `mode: 'write'`, add to) the entity this comment
 * hangs off?
 *
 * TODO delegates to the card rules in lib/todos/access.ts — read = `canReadTodo`,
 * write = `canWriteTodo` — so a card's comments, attachments, labels, members
 * and activity follow exactly the rule the card itself does.
 *
 * Returns false for a missing entity rather than throwing, so callers answer
 * "not found" and "not allowed" identically and an id cannot be probed.
 */
export async function canAccessAttachmentScope(
  scope: CommentScope,
  entityId: string,
  actor: Actor,
  mode: AttachmentAccessMode = 'read',
): Promise<boolean> {
  if (actor.userType === 'CLIENT_PORTAL') return false

  switch (scope) {
    case 'TODO': {
      // Write implies read (canReadTodo grants every writer), so a writer is
      // never refused here; a reader-only is refused an upload.
      return mode === 'write' ? canWriteTodo(actor, entityId) : canReadTodo(actor, entityId)
    }

    case 'OKR': {
      // entityId is whichever the caller has — an objective id, or a key-result
      // id from the KR comment thread. Resolving here keeps every caller from
      // having to know which, and visibility is the parent objective's either way.
      if (await canAccessObjective(entityId, actor)) return true
      const kr = await prisma.keyResult.findUnique({
        where: { id: entityId },
        select: { objectiveId: true },
      })
      if (!kr) return false
      return canAccessObjective(kr.objectiveId, actor)
    }

    case 'ACTIVITY': {
      // entityId is a project Activity id. The project is reached via
      // Milestone -> Phase, and the decision is the project module's own reader
      // (lib/projects/access.ts) — not a loose re-implementation of it.
      //
      // read and write are the same rule on purpose: the activity comment POST
      // lets anyone who can read the project comment, so staging a file for
      // that comment follows the rule the comment itself does (as TODO does).
      //
      // Client portal: portal sessions were refused above, and the portal
      // comment reads (listActivityComments with `portal: true`) never join
      // CommentAttachment — so a comment's files stay internal-only even when
      // the comment is CLIENT_VISIBLE (project invariant 5). Surfacing them to
      // the portal would need its own visibility flag and a portal serve route.
      const activity = await prisma.activity.findUnique({
        where: { id: entityId },
        select: { milestone: { select: { phase: { select: { projectId: true } } } } },
      })
      const projectId = activity?.milestone?.phase?.projectId
      if (!projectId) return false
      return (await getReadableProject(actorSession(actor), projectId)) !== null
    }

    case 'SCRUM': {
      // entityId is a ScrumUpdate id. Same rule as the update's comment thread
      // (app/api/scrum/updates/[id]/comments): a submitted update, readable
      // under canViewScrumUser (self, ADMIN/EXECUTIVE, direct manager,
      // same-department colleague). Drafts have no thread, so no attachments.
      // Commenting needs only that read rule, so write mode is the same.
      const update = await prisma.scrumUpdate.findUnique({
        where: { id: entityId },
        select: { userId: true, status: true },
      })
      if (!update || isScrumDraft(update.status)) return false
      return canViewScrumUser(actorSession(actor), update.userId)
    }

    default:
      return false
  }
}

/**
 * The project and scrum readers take a next-auth Session but only read
 * `user.id`, `user.role` (and `user.userType`), so an Actor is enough.
 */
function actorSession(actor: Actor): Session {
  return {
    user: {
      id: actor.id,
      role: actor.role,
      isProjectManager: false,
      userType: actor.userType === 'CLIENT_PORTAL' ? 'CLIENT_PORTAL' : 'INTERNAL',
    },
    expires: '',
  } as Session
}

async function canAccessObjective(objectiveId: string, actor: Actor): Promise<boolean> {
  const objective = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: {
      id: true, ownerId: true, isPrivate: true, level: true, departmentId: true,
      contributors: { select: { userId: true } },
    },
  })
  if (!objective) return false
  // Returns { canView, isRedacted } — a redacted view still means the person
  // may open the objective, so it is access for our purposes.
  const verdict = await canViewObjective(actor.role, actor.id, objective as never)
  return verdict.canView
}
