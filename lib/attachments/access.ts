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

import { prisma } from '@/lib/prisma'
import { canViewObjective, type UserRole } from '@/lib/permissions'

export const COMMENT_SCOPES = ['TODO', 'OKR', 'ACTIVITY', 'SCRUM'] as const
export type CommentScope = (typeof COMMENT_SCOPES)[number]

export function isCommentScope(v: unknown): v is CommentScope {
  return typeof v === 'string' && (COMMENT_SCOPES as readonly string[]).includes(v)
}

export interface Actor {
  id: string
  role: UserRole
}

/**
 * Can `actor` see the entity this comment hangs off?
 *
 * Returns false for a missing entity rather than throwing, so callers answer
 * "not found" and "not allowed" identically and an id cannot be probed.
 */
export async function canAccessAttachmentScope(
  scope: CommentScope,
  entityId: string,
  actor: Actor,
): Promise<boolean> {
  const privileged = actor.role === 'ADMIN' || actor.role === 'EXECUTIVE'

  switch (scope) {
    case 'TODO': {
      const todo = await prisma.todo.findUnique({
        where: { id: entityId },
        select: {
          assigneeId: true,
          creatorId: true,
          members: { select: { userId: true } },
          objectiveId: true,
          keyResult: { select: { objectiveId: true } },
          sprint: {
            select: {
              ownerId: true,
              participants: { select: { userId: true } },
            },
          },
        },
      })
      if (!todo) return false
      if (privileged) return true
      if (todo.assigneeId === actor.id || todo.creatorId === actor.id) return true
      if (todo.members.some((m) => m.userId === actor.id)) return true
      if (todo.sprint?.ownerId === actor.id) return true
      if (todo.sprint?.participants.some((p) => p.userId === actor.id)) return true
      // A card linked to an objective the user can see is readable by them —
      // otherwise a contributor could read the comment but not its screenshot.
      const objectiveId = todo.objectiveId ?? todo.keyResult?.objectiveId ?? null
      if (objectiveId) return canAccessObjective(objectiveId, actor)
      return false
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

    case 'ACTIVITY':
    case 'SCRUM': {
      // Deliberately closed for now.
      //
      // ACTIVITY reaches a project only via Milestone -> Phase, and project
      // reads go through lib/projects/access.ts with client-portal rules that
      // must not be re-implemented loosely here — invariant 4 of the project
      // module is that no internal detail leaks to the portal. SCRUM has no
      // team-membership model to check against at all.
      //
      // Returning false means attachments are simply not offered on those two
      // surfaces yet, which is the safe failure. Wiring them needs the project
      // module's own reader and a decision on scrum visibility (spec A4).
      return false
    }

    default:
      return false
  }
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
