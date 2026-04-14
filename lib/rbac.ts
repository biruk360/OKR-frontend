/**
 * Unified RBAC — single `can(action, resource, actor)` API covering the full
 * role matrix in docs/User_Permissions.md. Delegates to lib/permissions.ts for
 * the objective/KR/visibility rules that already exist; adds rules for users,
 * timeframes, todos, comments, watchers, exports, etc.
 *
 * Usage:
 *   import { can } from '@/lib/rbac'
 *   const ok = await can('objective.edit', { objective }, { userId, role })
 *   if (!ok) return apiForbidden()
 *
 * Rule: API routes / server actions MUST use `can()` instead of re-checking roles
 * inline. The existing finer-grained helpers in lib/permissions.ts remain as the
 * implementation; `can()` is the single entry point.
 */

import { prisma } from './prisma'
import {
  canAccessSettings,
  canCreateKeyResultForObjective,
  canCreateObjective,
  canDeleteKeyResult,
  canEditKeyResult,
  canEditKeyResultWithObjectiveContext,
  canEditObjective,
  canManageTimeframes,
  canManageUsers,
  canViewKeyResult,
  canViewObjective,
  type ObjectiveLevel,
  type UserRole,
} from './permissions'

export type Actor = { userId: string; role: UserRole }

export type ObjectiveResource = {
  id?: string
  level: ObjectiveLevel | string
  ownerId: string
  departmentId?: string | null
  isPrivate?: boolean
}

export type KeyResultResource = {
  id?: string
  ownerId: string
  objectiveId: string
  isPrivate?: boolean
}

export type TodoResource = {
  id?: string
  assigneeId: string
  creatorId: string
  keyResultId?: string | null
  objectiveId?: string | null
}

export type TimeframeResource = { id?: string; isActive?: boolean }
export type UserResource = { id: string }
export type DepartmentResource = { id?: string }

export type Action =
  // Auth / account
  | 'user.create' | 'user.edit' | 'user.deactivate' | 'user.resetPassword' | 'user.changeOwnPassword' | 'user.editOwnProfile'
  | 'user.assignRole' | 'user.assignManager'
  // Department / org
  | 'department.create' | 'department.edit' | 'department.delete' | 'department.assignManager'
  | 'orgChart.view'
  // Settings / timeframes / defaults / export
  | 'settings.access' | 'timeframe.manage' | 'notifications.configureOrgDefaults' | 'notifications.editOwnPreferences'
  | 'audit.export'
  // Objective
  | 'objective.create' | 'objective.edit' | 'objective.delete' | 'objective.archive' | 'objective.view' | 'objective.setVisibility' | 'objective.align' | 'objective.reparent' | 'objective.approveAlignment'
  // Key result
  | 'keyResult.create' | 'keyResult.edit' | 'keyResult.delete' | 'keyResult.archive' | 'keyResult.view' | 'keyResult.clone' | 'keyResult.checkIn'
  // Todo / initiative
  | 'todo.create' | 'todo.edit' | 'todo.delete' | 'todo.assign' | 'todo.complete' | 'todo.setDueDate'
  // Watchers / comments
  | 'watcher.add' | 'watcher.removeOwn' | 'comment.create' | 'comment.edit' | 'comment.delete'

export interface CanContext {
  actor: Actor
  objective?: ObjectiveResource
  keyResult?: KeyResultResource
  todo?: TodoResource
  targetUser?: UserResource
  department?: DepartmentResource
  timeframe?: TimeframeResource
  extra?: Record<string, unknown>
}

const isAdmin = (role: UserRole) => role === 'ADMIN' || role === 'EXECUTIVE'
const isManager = (role: UserRole) => role === 'DEPARTMENT_LEAD'

async function isDirectReport(managerId: string, reportId: string): Promise<boolean> {
  const rel = await prisma.managerRelationship.findFirst({
    where: { managerId, directReportId: reportId, endedAt: null },
    select: { id: true },
  })
  return !!rel
}

async function sharesDepartment(userA: string, userB: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    prisma.departmentMembership.findMany({ where: { userId: userA }, select: { departmentId: true } }),
    prisma.departmentMembership.findMany({ where: { userId: userB }, select: { departmentId: true } }),
  ])
  const aSet = new Set(a.map((x) => x.departmentId))
  return b.some((x) => aSet.has(x.departmentId))
}

/**
 * Primary permission check. Returns boolean (not a reason) — callers should pair
 * with `apiForbidden()` at API boundaries. Use `canDetailed()` when you need
 * the reason string (e.g. for admin UIs).
 */
export async function can(action: Action, ctx: CanContext): Promise<boolean> {
  const { actor } = ctx
  const { userId, role } = actor

  // ---- User / account ----
  if (action === 'user.create' || action === 'user.edit' || action === 'user.deactivate'
      || action === 'user.resetPassword' || action === 'user.assignRole' || action === 'user.assignManager') {
    return canManageUsers(role)
  }
  if (action === 'user.changeOwnPassword' || action === 'user.editOwnProfile') {
    return !!ctx.targetUser && ctx.targetUser.id === userId
  }

  // ---- Department ----
  if (action === 'department.create' || action === 'department.edit'
      || action === 'department.delete' || action === 'department.assignManager') {
    return canManageUsers(role)
  }
  if (action === 'orgChart.view') return true // all authenticated users

  // ---- Settings / timeframes / admin ----
  if (action === 'settings.access') return canAccessSettings(role)
  if (action === 'timeframe.manage') return canManageTimeframes(role)
  if (action === 'notifications.configureOrgDefaults') return canAccessSettings(role)
  if (action === 'notifications.editOwnPreferences') return true
  if (action === 'audit.export') return isAdmin(role)

  // ---- Objective ----
  if (action === 'objective.create') {
    const level = (ctx.objective?.level as ObjectiveLevel) || 'INDIVIDUAL'
    return canCreateObjective(role, level)
  }
  if (action === 'objective.edit' || action === 'objective.delete' || action === 'objective.archive'
      || action === 'objective.setVisibility' || action === 'objective.reparent') {
    if (!ctx.objective) return false
    return canEditObjective(role, userId, {
      level: String(ctx.objective.level),
      ownerId: ctx.objective.ownerId,
      departmentId: ctx.objective.departmentId ?? null,
    })
  }
  if (action === 'objective.align') {
    // Aligning your own objective to a parent is allowed for any user on their own objective.
    if (!ctx.objective) return false
    if (ctx.objective.ownerId === userId) return true
    return canEditObjective(role, userId, {
      level: String(ctx.objective.level),
      ownerId: ctx.objective.ownerId,
      departmentId: ctx.objective.departmentId ?? null,
    })
  }
  if (action === 'objective.approveAlignment') {
    // Manager approves alignment for a direct report.
    if (!ctx.objective) return false
    if (isAdmin(role)) return true
    if (!isManager(role)) return false
    return isDirectReport(userId, ctx.objective.ownerId)
  }
  if (action === 'objective.view') {
    if (!ctx.objective) return false
    const res = await canViewObjective(role, userId, {
      level: String(ctx.objective.level),
      ownerId: ctx.objective.ownerId,
      departmentId: ctx.objective.departmentId ?? null,
      isPrivate: ctx.objective.isPrivate ?? false,
    })
    return res.canView
  }

  // ---- Key result ----
  if (action === 'keyResult.create') {
    if (!ctx.objective || !ctx.objective.id) return false
    return canCreateKeyResultForObjective(role, userId, {
      id: ctx.objective.id,
      level: String(ctx.objective.level),
      ownerId: ctx.objective.ownerId,
      departmentId: ctx.objective.departmentId ?? null,
    })
  }
  if (action === 'keyResult.edit' || action === 'keyResult.clone' || action === 'keyResult.archive'
      || action === 'keyResult.checkIn') {
    if (!ctx.keyResult) return false
    if (ctx.objective) {
      return canEditKeyResultWithObjectiveContext(role, userId, ctx.keyResult, {
        level: String(ctx.objective.level),
        ownerId: ctx.objective.ownerId,
        departmentId: ctx.objective.departmentId ?? null,
      })
    }
    return canEditKeyResult(role, userId, ctx.keyResult)
  }
  if (action === 'keyResult.delete') {
    if (!ctx.keyResult || !ctx.objective) return false
    return canDeleteKeyResult(role, userId, ctx.objective.ownerId)
  }
  if (action === 'keyResult.view') {
    if (!ctx.keyResult) return false
    const res = await canViewKeyResult(role, userId, {
      ownerId: ctx.keyResult.ownerId,
      objectiveId: ctx.keyResult.objectiveId,
      isPrivate: ctx.keyResult.isPrivate ?? false,
    })
    return res.canView
  }

  // ---- Todo / initiative ----
  if (action === 'todo.create') return true // any authenticated user
  if (action === 'todo.edit' || action === 'todo.delete' || action === 'todo.setDueDate'
      || action === 'todo.complete') {
    if (!ctx.todo) return false
    if (isAdmin(role)) return true
    if (ctx.todo.assigneeId === userId || ctx.todo.creatorId === userId) return true
    if (isManager(role) && (await isDirectReport(userId, ctx.todo.assigneeId))) return true
    return false
  }
  if (action === 'todo.assign') {
    if (!ctx.todo || !ctx.targetUser) return false
    if (isAdmin(role)) return true
    if (isManager(role)) {
      // Manager can assign to direct reports OR team members who share a department.
      if (await isDirectReport(userId, ctx.targetUser.id)) return true
      if (await sharesDepartment(userId, ctx.targetUser.id)) return true
    }
    // Members can only self-assign.
    return ctx.targetUser.id === userId
  }

  // ---- Watchers / comments ----
  if (action === 'watcher.add' || action === 'watcher.removeOwn') return true
  if (action === 'comment.create') return true
  if (action === 'comment.edit' || action === 'comment.delete') {
    // Authors edit own; admins edit any. Caller passes authorId in extra.authorId.
    const authorId = ctx.extra?.authorId as string | undefined
    if (isAdmin(role)) return true
    return !!authorId && authorId === userId
  }

  return false
}

/**
 * Same as `can()` but returns `{ allowed, reason }`. Useful for admin UIs that
 * want to explain why an action is disabled.
 */
export async function canDetailed(action: Action, ctx: CanContext): Promise<{ allowed: boolean; reason?: string }> {
  const allowed = await can(action, ctx)
  if (allowed) return { allowed: true }
  return { allowed: false, reason: `Role ${ctx.actor.role} cannot ${action}` }
}

/**
 * Throws an ApiForbidden-shaped error when the action is denied. Intended for
 * server actions / API routes to keep call sites compact.
 */
export class ForbiddenError extends Error {
  code = 'FORBIDDEN'
  constructor(action: Action) {
    super(`Forbidden: ${action}`)
  }
}

export async function assertCan(action: Action, ctx: CanContext): Promise<void> {
  if (!(await can(action, ctx))) throw new ForbiddenError(action)
}
