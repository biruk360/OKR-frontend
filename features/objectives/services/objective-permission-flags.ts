/**
 * Per-objective UI permission flags.
 *
 * The authoritative rules live in `lib/permissions.ts` (server-only — it talks
 * to Prisma) and are enforced by the API routes. Server pages compute these
 * flags with those helpers and pass them down (see
 * `app/dashboard/objectives/[id]/page.tsx`).
 *
 * Client-only surfaces that render many objectives from a list endpoint (the
 * nested objectives list, My OKRs) have no server flags yet. For them,
 * `conservativeObjectivePermissions()` derives a **strict subset** of the
 * server rules from facts the client does know (role + ownership): it never
 * shows an action the server would reject for permission reasons, it only
 * hides some that a department lead could perform (department / direct-report
 * objectives), which remain available on the objective detail page.
 */

import { canCloneObjective, canDeleteObjective } from '@/lib/okr/action-permissions'

export interface ObjectivePermissionFlags {
  /** Edit, move, close / complete, archive / restore, edit weights (canEditObjective). */
  canEdit: boolean
  /** Permanent delete (DELETE /api/objectives/[id]: ADMIN, EXECUTIVE or owner). */
  canDelete: boolean
  /** Reopen a closed objective (owner / manager / ADMIN / EXECUTIVE; server checks the window). */
  canReopen: boolean
  /** Clone (POST /api/objectives/[id]/clone: ADMIN, EXECUTIVE, DEPARTMENT_LEAD). */
  canClone: boolean
}

export const NO_OBJECTIVE_PERMISSIONS: ObjectivePermissionFlags = {
  canEdit: false,
  canDelete: false,
  canReopen: false,
  canClone: false,
}

export interface PermissionViewer {
  id?: string | null
  role?: string | null
}

const PRIVILEGED_ROLES = new Set(['ADMIN', 'EXECUTIVE'])

export function conservativeObjectivePermissions(
  viewer: PermissionViewer | null | undefined,
  objective: { ownerId?: string | null } | null | undefined,
): ObjectivePermissionFlags {
  if (!viewer?.id || !objective) return NO_OBJECTIVE_PERMISSIONS
  const privileged = PRIVILEGED_ROLES.has(viewer.role ?? '')
  const isOwner = !!objective.ownerId && objective.ownerId === viewer.id
  const ownerOrPrivileged = privileged || isOwner
  return {
    canEdit: ownerOrPrivileged,
    // Delete and clone are decided by role + ownership alone, so the shared
    // rule (re-exported by lib/permissions) is exact, not conservative.
    canDelete: canDeleteObjective(viewer.role, viewer.id, objective),
    canReopen: ownerOrPrivileged,
    canClone: canCloneObjective(viewer.role),
  }
}
