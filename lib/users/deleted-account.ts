/**
 * Account deletion = soft delete + anonymise (decision 2026-09-25).
 *
 * Only an ADMIN may delete a user. The row is kept so every objective,
 * check-in, comment and audit entry stays attached, but the person is no
 * longer identifiable or reachable:
 *   - name     → "<job title> (deleted account)" (User.designation, falling
 *                back to the role label when no job title is set)
 *   - email    → a unique, non-routable placeholder on the reserved `.invalid`
 *                TLD (RFC 2606), so it can neither sign in nor receive mail
 *   - password, activation/reset token, avatar, Amharic name → cleared
 *   - isActive → false; passwordChangedAt → now (revokes every live session)
 *
 * The schema has no `deletedAt` column, so "deleted" is derived from the
 * placeholder email domain (see isDeletedAccountEmail).
 */

export const DELETED_ACCOUNT_EMAIL_DOMAIN = 'deleted.invalid'
export const DELETED_ACCOUNT_SUFFIX = '(deleted account)'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  EXECUTIVE: 'Executive',
  DEPARTMENT_LEAD: 'Department Lead',
  EMPLOYEE: 'Employee',
}

export function deletedAccountEmail(userId: string): string {
  return `deleted+${userId}@${DELETED_ACCOUNT_EMAIL_DOMAIN}`
}

export function isDeletedAccountEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${DELETED_ACCOUNT_EMAIL_DOMAIN}`)
}

export function deletedAccountName(designation: string | null | undefined, role: string): string {
  const title = designation?.trim() || ROLE_LABELS[role] || 'User'
  return `${title} ${DELETED_ACCOUNT_SUFFIX}`
}

/** The Prisma `data` for the anonymising update. */
export function deletedAccountData(
  user: { id: string; designation: string | null; role: string },
  now: Date = new Date(),
) {
  return {
    name: deletedAccountName(user.designation, user.role),
    email: deletedAccountEmail(user.id),
    password: null,
    avatar: null,
    nameAmharic: null,
    activationToken: null,
    activationTokenExpires: null,
    isActive: false,
    isProjectManager: false,
    passwordChangedAt: now,
  }
}
