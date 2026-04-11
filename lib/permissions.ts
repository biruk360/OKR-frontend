/**
 * Permission utilities based on docs/User_Permissions.md matrix
 * 
 * Roles:
 * - ADMIN: CEO/Super Admin - Full control
 * - EXECUTIVE: Same as ADMIN for most operations
 * - DEPARTMENT_LEAD: Manager/Lead - Department and individual level
 * - EMPLOYEE: Individual Contributor - Own objectives only
 */

import { prisma } from './prisma'

export type UserRole = 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE'
export type ObjectiveLevel = 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL'

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
  // ADMIN and EXECUTIVE can always see full details
  if (userRole === 'ADMIN' || userRole === 'EXECUTIVE') {
    return { canView: true, isRedacted: false }
  }
  
  // User can always see their own objectives in full
  if (objective.ownerId === userId) {
    return { canView: true, isRedacted: false }
  }
  
  // Check if user is a manager of the objective owner
  const isManager = await prisma.managerRelationship.findFirst({
    where: {
      managerId: userId,
      directReportId: objective.ownerId,
      endedAt: null
    }
  })
  
  if (isManager) {
    // Managers can see their direct reports' objectives in full
    return { canView: true, isRedacted: false }
  }
  
  // For company objectives - everyone can view (with redaction if private)
  if (objective.level === 'COMPANY') {
    return { canView: true, isRedacted: objective.isPrivate }
  }
  
  // For department objectives - check if user is in the same department
  if (objective.level === 'DEPARTMENT' && objective.departmentId) {
    const userInDepartment = await prisma.departmentMembership.findFirst({
      where: {
        userId,
        departmentId: objective.departmentId
      }
    })
    
    if (userInDepartment) {
      // Same department - can view (with redaction if private)
      return { canView: true, isRedacted: objective.isPrivate }
    }
  }
  
  // For other departments or individual objectives - check visibility
  if (!objective.isPrivate) {
    // Public - can view
    return { canView: true, isRedacted: false }
  } else {
    // Private - can view but redacted
    return { canView: true, isRedacted: true }
  }
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
  
  // Check objective visibility first
  const objectiveVisibility = await canViewObjective(userRole, userId, {
    level: objective.level,
    ownerId: objective.ownerId,
    departmentId: objective.departmentId,
    isPrivate: objective.isPrivate
  })
  
  if (!objectiveVisibility.canView) {
    return { canView: false, isRedacted: false }
  }
  
  // ADMIN and EXECUTIVE can always see full details
  if (userRole === 'ADMIN' || userRole === 'EXECUTIVE') {
    return { canView: true, isRedacted: false }
  }
  
  // User can always see their own key results in full
  if (keyResult.ownerId === userId) {
    return { canView: true, isRedacted: false }
  }
  
  // Check if user is a manager of the key result owner
  const isManager = await prisma.managerRelationship.findFirst({
    where: {
      managerId: userId,
      directReportId: keyResult.ownerId,
      endedAt: null
    }
  })
  
  if (isManager) {
    // Managers can see their direct reports' key results in full
    return { canView: true, isRedacted: false }
  }
  
  // If objective is redacted, key result should also be redacted
  if (objectiveVisibility.isRedacted) {
    return { canView: true, isRedacted: true }
  }
  
  // Check key result visibility
  if (!keyResult.isPrivate) {
    // Public - can view
    return { canView: true, isRedacted: false }
  } else {
    // Private - can view but redacted
    return { canView: true, isRedacted: true }
  }
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

