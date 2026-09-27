/**
 * Permission utilities based on docs/User_Permissions.md matrix
 * 
 * Roles:
 * - ADMIN: CEO/Super Admin - Full control
 * - EXECUTIVE: Same as ADMIN for most operations
 * - DEPARTMENT_LEAD: Manager/Lead - Department and individual level
 * - EMPLOYEE: Individual Contributor - Own objectives only
 */

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import {
  SEES_ALL_ROLES,
  canViewKeyResultInMemory,
  canViewObjectiveInMemory,
  makeViewerContext,
} from './okr/visibility-scope'

// Pure delete/clone rules (Prisma-free so client components can share them).
export { canDeleteObjective, canCloneObjective, canCloneKeyResult } from './okr/action-permissions'

export type UserRole = 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE'
export type ObjectiveLevel = 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL'

export interface ProjectCreationPrincipal {
  role: UserRole
  isProjectManager?: boolean | null
}

/**
 * Single authorization rule for creating projects.
 *
 * The explicit Project Manager capability is wired to persisted user/session data
 * in P0 Story 0.2. Keeping the optional flag in this contract now ensures the UI
 * and API do not need a second authorization rule when that capability lands.
 */
export function canCreateProject(user: ProjectCreationPrincipal): boolean {
  return user.role === 'ADMIN'
    || user.role === 'EXECUTIVE'
    || user.role === 'DEPARTMENT_LEAD'
    || user.isProjectManager === true
}

/**
 * Check if user can create objectives at a specific level
 */
export function canCreateObjective(userRole: UserRole, level: ObjectiveLevel): boolean {
  if (userRole === 'ADMIN' || userRole === 'EXECUTIVE') {
    return true // Can create at all levels
  }
  
  if (level === 'COMPANY') {
    return false // Only ADMIN/EXECUTIVE can create company objectives
  }
  
  if (level === 'DEPARTMENT') {
    return userRole === 'DEPARTMENT_LEAD' // Only department leads can create department objectives
  }
  
  if (level === 'INDIVIDUAL') {
    return true // All users can create individual objectives
  }
  
  return false
}

/**
 * Check if user can edit/delete an objective
 */
export async function canEditObjective(
  userRole: UserRole,
  userId: string,
  objective: {
    level: string
    ownerId: string
    departmentId?: string | null
  }
): Promise<boolean> {
  // ADMIN and EXECUTIVE can edit any objective
  if (userRole === 'ADMIN' || userRole === 'EXECUTIVE') {
    return true
  }
  
  // User can always edit their own objectives
  if (objective.ownerId === userId) {
    return true
  }
  
  // DEPARTMENT_LEAD can edit their department's objectives
  if (userRole === 'DEPARTMENT_LEAD' && objective.level === 'DEPARTMENT' && objective.departmentId) {
    const userDepartments = await prisma.departmentMembership.findMany({
      where: { userId },
      select: { departmentId: true }
    })
    const departmentIds = userDepartments.map(d => d.departmentId)
    return departmentIds.includes(objective.departmentId)
  }
  
  // DEPARTMENT_LEAD can create objectives for their direct reports
  if (userRole === 'DEPARTMENT_LEAD' && objective.level === 'INDIVIDUAL') {
    const isDirectReport = await prisma.managerRelationship.findFirst({
      where: {
        managerId: userId,
        directReportId: objective.ownerId,
        endedAt: null
      }
    })
    return !!isDirectReport
  }
  
  return false
}

// ---------------------------------------------------------------------------
// OKR visibility. The decision lives in lib/okr/visibility-scope.ts
// (`canViewObjectiveInMemory` / `canViewKeyResultInMemory`) so the per-object
// checks below and the batched list/aggregate surfaces cannot drift apart. These
// wrappers only load the one fact the rule needs per call — whether the viewer
// currently manages the row owner(s). lib/okr/visibility-scope.test.ts is the
// parity guard.
//
//   - every signed-in role may view every objective;
//   - a private objective is redacted unless the viewer is ADMIN/EXECUTIVE, its
//     owner, or the owner's current manager;
//   - a KR is viewable iff its objective is; it is shown in full to
//     ADMIN/EXECUTIVE, its owner and its owner's manager, otherwise redacted
//     when the objective is redacted or the KR is private.
// ---------------------------------------------------------------------------

/** Of `ownerIds`, the ones the user currently manages (endedAt = null). */
async function managedOwnerIds(
  userRole: UserRole,
  userId: string,
  ownerIds: Array<string | null | undefined>,
): Promise<string[]> {
  if (SEES_ALL_ROLES.includes(userRole)) return []
  const candidates = Array.from(new Set(ownerIds.filter((id): id is string => !!id && id !== userId)))
  if (candidates.length === 0) return []
  const rows = await prisma.managerRelationship.findMany({
    where: { managerId: userId, directReportId: { in: candidates }, endedAt: null },
    select: { directReportId: true },
  })
  return rows.map((r) => r.directReportId)
}

/**
 * Check if user can view an objective (considering visibility settings)
 */
export async function canViewObjective(
  userRole: UserRole,
  userId: string,
  objective: {
    level: string
    ownerId: string
    departmentId?: string | null
    isPrivate: boolean
  }
): Promise<{ canView: boolean; isRedacted: boolean }> {
  // Only a private row can be redacted, so only then is the manager fact needed.
  const directReportIds = objective.isPrivate
    ? await managedOwnerIds(userRole, userId, [objective.ownerId])
    : []
  const ctx = makeViewerContext({ id: userId, role: userRole }, { directReportIds })
  return canViewObjectiveInMemory(ctx, objective)
}

/**
 * Check if user can view a key result (considering visibility settings)
 */
export async function canViewKeyResult(
  userRole: UserRole,
  userId: string,
  keyResult: {
    ownerId: string
    objectiveId: string
    isPrivate: boolean
  }
): Promise<{ canView: boolean; isRedacted: boolean }> {
  // Get the parent objective to check its visibility
  const objective = await prisma.objective.findUnique({
    where: { id: keyResult.objectiveId },
    select: {
      level: true,
      ownerId: true,
      departmentId: true,
      isPrivate: true
    }
  })

  if (!objective) {
    return { canView: false, isRedacted: false }
  }

  const directReportIds = objective.isPrivate || keyResult.isPrivate
    ? await managedOwnerIds(userRole, userId, [objective.ownerId, keyResult.ownerId])
    : []
  const ctx = makeViewerContext({ id: userId, role: userRole }, { directReportIds })
  return canViewKeyResultInMemory(ctx, keyResult, canViewObjectiveInMemory(ctx, objective))
}

/**
 * Check if user can edit/delete a key result
 */
export async function canEditKeyResult(
  userRole: UserRole,
  userId: string,
  keyResult: {
    ownerId: string
    objectiveId: string
  }
): Promise<boolean> {
  // ADMIN and EXECUTIVE can edit any key result
  if (userRole === 'ADMIN' || userRole === 'EXECUTIVE') {
    return true
  }
  
  // User can always edit their own key results
  if (keyResult.ownerId === userId) {
    return true
  }
  
  // DEPARTMENT_LEAD can create key results for their direct reports
  if (userRole === 'DEPARTMENT_LEAD') {
    const isDirectReport = await prisma.managerRelationship.findFirst({
      where: {
        managerId: userId,
        directReportId: keyResult.ownerId,
        endedAt: null
      }
    })
    return !!isDirectReport
  }
  
  return false
}

/**
 * Whether the user may add a key result to this objective (matches POST /api/keyresults).
 */
export async function canCreateKeyResultForObjective(
  userRole: UserRole,
  userId: string,
  objective: {
    id: string
    level: string
    ownerId: string
    departmentId?: string | null
  }
): Promise<boolean> {
  const canEditObj = await canEditObjective(userRole, userId, {
    level: objective.level,
    ownerId: objective.ownerId,
    departmentId: objective.departmentId
  })
  const canAddViaKeyResultRule = await canEditKeyResult(userRole, userId, {
    ownerId: objective.ownerId,
    objectiveId: objective.id
  })
  return canEditObj || canAddViaKeyResultRule
}

/**
 * Whether the user may edit an existing key result (parent objective context).
 * Aligns create/update flows with objective-level edit rights.
 */
export async function canEditKeyResultWithObjectiveContext(
  userRole: UserRole,
  userId: string,
  keyResult: { ownerId: string; objectiveId: string },
  objective: {
    level: string
    ownerId: string
    departmentId?: string | null
  }
): Promise<boolean> {
  const hasKeyResultPermission = await canEditKeyResult(userRole, userId, keyResult)
  if (hasKeyResultPermission) return true
  if (userId === objective.ownerId) return true
  return canEditObjective(userRole, userId, {
    level: objective.level,
    ownerId: objective.ownerId,
    departmentId: objective.departmentId
  })
}

/**
 * Whether the user may permanently delete a key result (matches DELETE /api/keyresults/[id]).
 */
export function canDeleteKeyResult(
  userRole: UserRole,
  userId: string,
  objectiveOwnerId: string
): boolean {
  return userRole === 'ADMIN' || userId === objectiveOwnerId
}

/**
 * Check if user can access settings
 */
export function canAccessSettings(userRole: UserRole): boolean {
  return userRole === 'ADMIN' || userRole === 'EXECUTIVE'
}

/**
 * Check if user can manage users
 */
export function canManageUsers(userRole: UserRole): boolean {
  return userRole === 'ADMIN' || userRole === 'EXECUTIVE'
}

/**
 * Check if user can manage timeframes
 */
export function canManageTimeframes(userRole: UserRole): boolean {
  return userRole === 'ADMIN' || userRole === 'EXECUTIVE'
}

// ---------------------------------------------------------------------------
// Org-structure permissions (Phase 1, 2026-05).
// `canManageDepartment` allows the active HEAD to maintain their own dept.
// `canManageOrg` gates the company-wide admin/org page.
// `canSetCeo` is intentionally narrower than canManageOrg.
// ---------------------------------------------------------------------------

export async function canManageDepartment(
  userRole: UserRole,
  userId: string,
  departmentId: string,
): Promise<boolean> {
  if (userRole === 'ADMIN' || userRole === 'EXECUTIVE') return true
  const head = await prisma.departmentMembership.findFirst({
    where: { userId, departmentId, role: 'HEAD', endedAt: null },
    select: { id: true },
  })
  return !!head
}

export function canManageOrg(userRole: UserRole): boolean {
  return userRole === 'ADMIN' || userRole === 'EXECUTIVE'
}

export function canSetCeo(userRole: UserRole): boolean {
  return userRole === 'ADMIN'
}

// ---------------------------------------------------------------------------
// Sprint access — invite-only boards (2026-09-25, decision 1b).
//
//   view   ADMIN / EXECUTIVE: every sprint. Everyone else — DEPARTMENT_LEAD
//          included — only sprints they OWN or are a SprintParticipant of.
//          Department membership grants nothing. Client-portal sessions: never.
//   list   `sprintVisibilityWhere(user)` — the same rule as a Prisma where, so
//          every list (GET /api/sprints, /active, the switcher, destinations)
//          shows exactly the sprints `canViewSprint` would open.
//   edit   ADMIN / EXECUTIVE; the owner; a DEPARTMENT_LEAD of the sprint's
//          department who has been invited. Edit never exceeds view.
//
// Being put on a card (assignee or member) is an invitation: the write paths
// upsert a SprintParticipant via `inviteToSprint` (lib/sprints/participants.ts).
// ---------------------------------------------------------------------------

export interface SprintCtx {
  ownerId: string
  departmentId?: string | null
  participants?: { userId: string }[]
}

/** The subset of the session user the sprint rules depend on. */
export interface SprintViewer {
  id: string
  role: string
  userType?: string | null
}

/** Roles that see every sprint ("super admin, company owner and other high level user types"). */
export const SPRINT_VIEW_ALL_ROLES: readonly string[] = ['ADMIN', 'EXECUTIVE']

async function isInDepartment(userId: string, departmentId: string): Promise<boolean> {
  const m = await prisma.departmentMembership.findFirst({
    where: { userId, departmentId },
    select: { id: true },
  })
  return !!m
}

/** Owner or SprintParticipant — the "invited" relationship. */
export function isSprintMember(userId: string, sprint: Pick<SprintCtx, 'ownerId' | 'participants'>): boolean {
  return sprint.ownerId === userId || !!sprint.participants?.some((p) => p.userId === userId)
}

/** Pure view verdict. `canViewSprint` and `sprintVisibilityWhere` must agree with it. */
export function sprintViewVerdict(user: SprintViewer, sprint: SprintCtx): boolean {
  if (user.userType === 'CLIENT_PORTAL') return false
  if (SPRINT_VIEW_ALL_ROLES.includes(user.role)) return true
  return isSprintMember(user.id, sprint)
}

/**
 * The view rule as a Prisma `where` for sprint lists. Unit-tested to agree with
 * `sprintViewVerdict` (lib/sprints/access.test.ts).
 */
export function sprintVisibilityWhere(user: SprintViewer): Prisma.SprintWhereInput {
  if (user.userType === 'CLIENT_PORTAL') return { id: { in: [] } }
  if (SPRINT_VIEW_ALL_ROLES.includes(user.role)) return {}
  return { OR: [{ ownerId: user.id }, { participants: { some: { userId: user.id } } }] }
}

/**
 * Sprint v2: who can create a sprint in a given department scope.
 * - ADMIN/EXECUTIVE: any department.
 * - DEPARTMENT_LEAD/EMPLOYEE: only their own department (or no-department sprints).
 */
export async function canCreateSprint(
  userRole: UserRole,
  userId: string,
  departmentId?: string | null,
): Promise<boolean> {
  if (userRole === 'ADMIN' || userRole === 'EXECUTIVE') return true
  if (!departmentId) return true
  return isInDepartment(userId, departmentId)
}

/**
 * Edit rights on a sprint (settings, lanes, participants, lifecycle).
 * - ADMIN/EXECUTIVE: any.
 * - the owner.
 * - DEPARTMENT_LEAD: sprints scoped to their department **that they were invited to**
 *   (invite-only boards: a lead may not edit — or add themselves to — a board
 *   they cannot see).
 * - EMPLOYEE participants: no sprint-level edit (they may still edit every card
 *   in the sprint — see `canWriteTodo` — and move cards, `canMoveSprintCards`).
 */
export async function canEditSprint(
  userRole: UserRole,
  userId: string,
  sprint: SprintCtx,
): Promise<boolean> {
  if (userRole === 'ADMIN' || userRole === 'EXECUTIVE') return true
  if (sprint.ownerId === userId) return true
  if (userRole === 'DEPARTMENT_LEAD' && sprint.departmentId && isSprintMember(userId, sprint)) {
    return isInDepartment(userId, sprint.departmentId)
  }
  return false
}

/**
 * Delete rights. Employees may never delete; an invited lead may delete their
 * department's sprints. (DELETE /api/sprints/[id] additionally lets the owner.)
 */
export async function canDeleteSprint(
  userRole: UserRole,
  userId: string,
  sprint: SprintCtx,
): Promise<boolean> {
  if (userRole === 'ADMIN' || userRole === 'EXECUTIVE') return true
  if (userRole === 'EMPLOYEE') return false
  if (userRole === 'DEPARTMENT_LEAD' && sprint.departmentId && isSprintMember(userId, sprint)) {
    return isInDepartment(userId, sprint.departmentId)
  }
  return false
}

/**
 * Invite-only visibility: ADMIN/EXECUTIVE see every sprint; everyone else only
 * sprints they own or participate in. Pass `opts.userType` where the session is
 * at hand so a client-portal session is refused explicitly.
 */
export async function canViewSprint(
  userRole: UserRole,
  userId: string,
  sprint: SprintCtx,
  opts?: { userType?: string | null },
): Promise<boolean> {
  return sprintViewVerdict({ id: userId, role: userRole, userType: opts?.userType ?? null }, sprint)
}

/**
 * Board drag/drop reorder writes the status + position of the sprint's cards.
 * Sprint participants may edit every card in their sprint (decision 4), so they
 * may reorder too; otherwise the sprint edit rule applies.
 */
export async function canMoveSprintCards(
  userRole: UserRole,
  userId: string,
  sprint: SprintCtx,
): Promise<boolean> {
  if (isSprintMember(userId, sprint)) return true
  return canEditSprint(userRole, userId, sprint)
}

/**
 * Redact an objective for display (hide sensitive details)
 */
export function redactObjective(objective: any) {
  return {
    ...objective,
    title: '[Private Objective]',
    description: null,
    // Keep progress percentage visible
    progress: objective.progress,
    // Keep owner and basic metadata
    owner: objective.owner,
    level: objective.level,
    status: objective.status,
    createdAt: objective.createdAt,
    updatedAt: objective.updatedAt
  }
}

/**
 * Redact a key result for display (hide sensitive details)
 */
export function redactKeyResult(keyResult: any) {
  return {
    ...keyResult,
    title: '[Private Key Result]',
    description: null,
    // Hide specific values but keep progress percentage
    startValue: 0,
    targetValue: 0,
    currentValue: 0,
    unit: '',
    progress: keyResult.progress, // Keep progress percentage visible
    confidence: keyResult.confidence,
    // Keep basic metadata
    status: keyResult.status,
    createdAt: keyResult.createdAt,
    updatedAt: keyResult.updatedAt
  }
}

// =====================================================================
// Letter Management permissions — DB-driven with hardcoded fallback
//
// The role matrix is stored in letter_role_permissions and editable at
// runtime via Settings > Letter Permissions. These helpers are the
// runtime resolver: they query the DB first, falling back to
// DEFAULT_LETTER_MATRIX when the DB has no rows yet (e.g. before the
// first seed run).
//
// Per-user overrides in letter_user_permissions take highest precedence.
//
// Synchronous shims (canCreateLetter, canApproveLetter, etc.) are kept
// for call sites that don't have an async context. They use the static
// fallback matrix only. Prefer checkLetterPermission() in async
// server contexts (API routes, server components).
// =====================================================================

import { DEFAULT_LETTER_MATRIX, type LetterPermission } from './letter-permissions'

/**
 * Async resolver — checks per-user override first, then DB role matrix,
 * then static fallback. Use in API routes and server components.
 */
export async function checkLetterPermission(
  userId: string,
  role: UserRole,
  permission: LetterPermission
): Promise<boolean> {
  // ADMIN always wins — avoids DB round-trip for the common case
  if (role === 'ADMIN') return true

  try {
    // 1. Per-user override takes highest precedence
    const userOverride = await prisma.letterUserPermission.findUnique({
      where: { userId_permission: { userId, permission } },
    })
    if (userOverride !== null) return userOverride.granted

    // 2. Role matrix row
    const roleRow = await prisma.letterRolePermission.findUnique({
      where: { role_permission: { role, permission } },
    })
    if (roleRow !== null) return roleRow.granted
  } catch {
    // DB unavailable — fall through to static fallback
  }

  // 3. Static fallback
  return DEFAULT_LETTER_MATRIX[role as keyof typeof DEFAULT_LETTER_MATRIX]?.[permission] ?? false
}

// ---------------------------------------------------------------------------
// Synchronous shims — use static fallback only, for non-async callers
// ---------------------------------------------------------------------------

export function canCreateLetter(role: UserRole): boolean {
  return DEFAULT_LETTER_MATRIX[role as keyof typeof DEFAULT_LETTER_MATRIX]?.['letter.create'] ?? false
}

export function canApproveLetter(role: UserRole): boolean {
  return DEFAULT_LETTER_MATRIX[role as keyof typeof DEFAULT_LETTER_MATRIX]?.['letter.approve'] ?? false
}

export function canDispatchLetter(role: UserRole): boolean {
  return DEFAULT_LETTER_MATRIX[role as keyof typeof DEFAULT_LETTER_MATRIX]?.['letter.dispatch'] ?? false
}

export function canAdminLetter(role: UserRole): boolean {
  return role === 'ADMIN'
}

/** Record-level edit gate — admins everywhere, otherwise only the preparer in DRAFT. */
export function canEditLetter(
  role: UserRole,
  userId: string,
  letter: { preparedById: string; status: string }
): boolean {
  if (canAdminLetter(role)) return true
  if (letter.preparedById !== userId) return false
  return letter.status === 'DRAFT'
}
