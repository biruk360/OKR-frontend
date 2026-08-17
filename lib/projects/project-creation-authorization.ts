import { prisma } from '@/lib/prisma'
import { canCreateProject, type UserRole } from '@/lib/permissions'

interface AuthorizationUser {
  id: string
  role: string
  isActive: boolean
  isProjectManager: boolean
}

interface ProjectCreationAuthorizationDatabase {
  user: {
    findUnique(args: unknown): Promise<AuthorizationUser | null>
  }
  departmentMembership: {
    findFirst(args: unknown): Promise<{ id: string } | null>
  }
}

export type ProjectCreationCommitDenialCode =
  | 'NOT_DRAFT_OWNER'
  | 'CREATOR_INACTIVE'
  | 'CREATION_FORBIDDEN'
  | 'DEPARTMENT_REQUIRED'
  | 'DEPARTMENT_OUT_OF_SCOPE'
  | 'PROJECT_MANAGER_INACTIVE'

export type ProjectCreationCommitAuthorization =
  | {
      allowed: true
      creator: { id: string; role: UserRole; isProjectManager: boolean }
      projectManagerId: string
    }
  | {
      allowed: false
      code: ProjectCreationCommitDenialCode
    }

export interface AuthorizeProjectCreationCommitInput {
  actorUserId: string
  draftOwnerUserId: string
  departmentId: string | null
  /** Defaults to the creator when the draft does not nominate another user. */
  projectManagerId?: string | null
}

/**
 * Server-authoritative, read-only authorization for the future draft commit.
 *
 * This intentionally resolves the creator and department membership from the
 * database on every call. The future commit endpoint must pass its transaction
 * client and run this before any writes in that transaction, so authorization
 * cannot go stale between the check and commit. A denial never mutates or
 * discards the draft.
 */
export async function authorizeProjectCreationCommit(
  input: AuthorizeProjectCreationCommitInput,
  database: ProjectCreationAuthorizationDatabase = prisma,
): Promise<ProjectCreationCommitAuthorization> {
  const creator = await database.user.findUnique({
    where: { id: input.actorUserId },
    select: { id: true, role: true, isActive: true, isProjectManager: true },
  })

  if (!creator?.isActive) return { allowed: false, code: 'CREATOR_INACTIVE' }
  if (creator.id !== input.draftOwnerUserId) {
    return { allowed: false, code: 'NOT_DRAFT_OWNER' }
  }

  const principal = {
    id: creator.id,
    role: creator.role as UserRole,
    isProjectManager: creator.isProjectManager,
  }
  if (!canCreateProject(principal)) {
    return { allowed: false, code: 'CREATION_FORBIDDEN' }
  }

  if (principal.role !== 'ADMIN' && principal.role !== 'EXECUTIVE') {
    if (!input.departmentId) {
      return { allowed: false, code: 'DEPARTMENT_REQUIRED' }
    }
    const membership = await database.departmentMembership.findFirst({
      where: {
        userId: creator.id,
        departmentId: input.departmentId,
        endedAt: null,
      },
      select: { id: true },
    })
    if (!membership) {
      return { allowed: false, code: 'DEPARTMENT_OUT_OF_SCOPE' }
    }
  }

  const projectManagerId = input.projectManagerId || creator.id
  if (projectManagerId !== creator.id) {
    const nominatedProjectManager = await database.user.findUnique({
      where: { id: projectManagerId },
      select: { id: true, role: true, isActive: true, isProjectManager: true },
    })
    if (!nominatedProjectManager?.isActive) {
      return { allowed: false, code: 'PROJECT_MANAGER_INACTIVE' }
    }
  }

  return { allowed: true, creator: principal, projectManagerId }
}
