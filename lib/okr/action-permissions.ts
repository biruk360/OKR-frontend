/**
 * Pure (Prisma-free) OKR action rules — delete / clone.
 *
 * These are re-exported by `lib/permissions.ts`, the single source of truth for
 * permissions; server code imports them from there. They live in their own
 * module only because `lib/permissions.ts` instantiates the Prisma client at
 * import time and so cannot be imported by client components. Client code that
 * needs the same verdict (features/objectives/services/objective-permission-flags.ts)
 * imports this module directly.
 *
 * Each rule mirrors the API route that enforces it:
 *   canDeleteObjective  DELETE /api/objectives/[id]          ADMIN, EXECUTIVE or the owner
 *   canCloneObjective   POST   /api/objectives/[id]/clone    ADMIN, EXECUTIVE, DEPARTMENT_LEAD
 *   canCloneKeyResult   POST   /api/keyresults/[id]/clone    role gate ADMIN/EXECUTIVE/DEPARTMENT_LEAD,
 *                                                             then ADMIN or the parent objective's owner
 */

const PRIVILEGED_ROLES: readonly string[] = ['ADMIN', 'EXECUTIVE']
const CLONE_ROLES: readonly string[] = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD']

/** Permanently delete an objective. */
export function canDeleteObjective(
  userRole: string | null | undefined,
  userId: string | null | undefined,
  objective: { ownerId?: string | null },
): boolean {
  if (PRIVILEGED_ROLES.includes(userRole ?? '')) return true
  return !!userId && !!objective.ownerId && objective.ownerId === userId
}

/** Clone an objective (with its key results). */
export function canCloneObjective(userRole: string | null | undefined): boolean {
  return CLONE_ROLES.includes(userRole ?? '')
}

/** Clone a key result, given the owner of its parent objective. */
export function canCloneKeyResult(
  userRole: string | null | undefined,
  userId: string | null | undefined,
  objectiveOwnerId: string | null | undefined,
): boolean {
  if (!CLONE_ROLES.includes(userRole ?? '')) return false
  if (userRole === 'ADMIN') return true
  return !!userId && !!objectiveOwnerId && userId === objectiveOwnerId
}
