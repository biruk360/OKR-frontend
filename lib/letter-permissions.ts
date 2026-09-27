/**
 * Canonical letter permission keys and their human-readable labels.
 * Shared between:
 *   - API routes (validation)
 *   - lib/permissions.ts (DB-driven resolver)
 *   - LetterPermissionsManagement UI component
 *   - prisma/seed-letter-permissions.ts
 */
import { prisma } from './prisma'
import { resolveDocTypePermission, resolveFeaturePermission, type DocTypeAction } from './permission-resolver'

export const LETTER_PERMISSIONS = [
  'letter.read',
  'letter.create',
  'letter.write',
  'letter.submit',
  'letter.approve',
  'letter.dispatch',
  'letter.delete',
  'letter.archive',
  'letter.manage_types',
  'letter.export',
  'letter.view_all',
] as const

export type LetterPermission = (typeof LETTER_PERMISSIONS)[number]

export const LETTER_PERMISSION_LABELS: Record<LetterPermission, { label: string; description: string }> = {
  'letter.read':         { label: 'Read',         description: 'View letter details and list' },
  'letter.create':       { label: 'Create',       description: 'Draft new letters' },
  'letter.write':        { label: 'Edit',         description: 'Edit letter content and metadata' },
  'letter.submit':       { label: 'Submit',       description: 'Submit a draft for approval' },
  'letter.approve':      { label: 'Approve',      description: 'Approve or reject submitted letters' },
  'letter.dispatch':     { label: 'Dispatch',     description: 'Mark letters as sent / dispatch' },
  'letter.delete':       { label: 'Delete',       description: 'Permanently delete letters' },
  'letter.archive':      { label: 'Archive',      description: 'Archive letters' },
  'letter.manage_types': { label: 'Manage Types', description: 'Create, edit, delete letter type definitions' },
  'letter.export':       { label: 'Export',       description: 'Export letters as PDF or CSV' },
  'letter.view_all':     { label: 'Letter Admin', description: 'Letter administrator: edit, delete, force-archive and unarchive any letter regardless of status or author' },
}

export const SYSTEM_ROLES = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE'] as const
export type SystemRole = (typeof SYSTEM_ROLES)[number]

export const ROLE_LABELS: Record<SystemRole, string> = {
  ADMIN:           'Administrator',
  EXECUTIVE:       'Executive',
  DEPARTMENT_LEAD: 'Department Lead',
  EMPLOYEE:        'Employee',
}

/** Fallback matrix used when DB rows are missing (mirrors original hardcoded rules). */
export const DEFAULT_LETTER_MATRIX: Record<SystemRole, Record<LetterPermission, boolean>> = {
  ADMIN: {
    'letter.read':         true,
    'letter.create':       true,
    'letter.write':        true,
    'letter.submit':       true,
    'letter.approve':      true,
    'letter.dispatch':     true,
    'letter.delete':       true,
    'letter.archive':      true,
    'letter.manage_types': true,
    'letter.export':       true,
    'letter.view_all':     true,
  },
  EXECUTIVE: {
    'letter.read':         true,
    'letter.create':       true,
    'letter.write':        true,
    'letter.submit':       true,
    'letter.approve':      true,
    'letter.dispatch':     true,
    'letter.delete':       false,
    'letter.archive':      true,
    'letter.manage_types': false,
    'letter.export':       true,
    'letter.view_all':     true,
  },
  DEPARTMENT_LEAD: {
    'letter.read':         true,
    'letter.create':       true,
    'letter.write':        true,
    'letter.submit':       true,
    'letter.approve':      false,
    'letter.dispatch':     true,
    'letter.delete':       false,
    'letter.archive':      false,
    'letter.manage_types': false,
    'letter.export':       true,
    'letter.view_all':     false,
  },
  EMPLOYEE: {
    'letter.read':         true,
    'letter.create':       true,
    'letter.write':        true,
    'letter.submit':       true,
    'letter.approve':      false,
    'letter.dispatch':     false,
    'letter.delete':       false,
    'letter.archive':      false,
    'letter.manage_types': false,
    'letter.export':       false,
    'letter.view_all':     false,
  },
}

/**
 * Where each letter permission resolves in the unified permission tables.
 *
 * `letter.view_all` is the letter-ADMIN check (routes use it to edit/delete/
 * force-archive any letter). It used to resolve to `module.letters` — the
 * sidebar-visibility key that every role, EMPLOYEE included, is granted — so
 * any employee could edit any letter. It now resolves to the dedicated
 * ADMIN-only `button.letter.admin` feature key (seeded in
 * scripts/seed-permissions.ts; ADMIN also passes via the resolver's shortcut).
 */
export type LetterPermissionTarget =
  | { kind: 'doctype'; doctypeKey: string; action: DocTypeAction }
  | { kind: 'feature'; featureKey: string }

export const LETTER_ADMIN_FEATURE_KEY = 'button.letter.admin'

export const LETTER_PERMISSION_TARGETS: Readonly<Record<LetterPermission, LetterPermissionTarget>> = Object.freeze({
  'letter.read':         { kind: 'doctype', doctypeKey: 'letter', action: 'read' },
  'letter.create':       { kind: 'doctype', doctypeKey: 'letter', action: 'create' },
  'letter.write':        { kind: 'doctype', doctypeKey: 'letter', action: 'write' },
  'letter.submit':       { kind: 'doctype', doctypeKey: 'letter', action: 'submit' },
  'letter.approve':      { kind: 'feature', featureKey: 'button.letter.approve' },
  'letter.dispatch':     { kind: 'feature', featureKey: 'button.letter.send' },
  'letter.delete':       { kind: 'doctype', doctypeKey: 'letter', action: 'delete' },
  'letter.archive':      { kind: 'feature', featureKey: 'button.letter.archive' },
  'letter.manage_types': { kind: 'doctype', doctypeKey: 'letter_type_def', action: 'create' },
  'letter.export':       { kind: 'doctype', doctypeKey: 'letter', action: 'export' },
  'letter.view_all':     { kind: 'feature', featureKey: LETTER_ADMIN_FEATURE_KEY },
})

async function legacyLetterCheck(userId: string, permission: LetterPermission): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  const role = (user?.role as SystemRole | undefined) ?? 'EMPLOYEE'
  return DEFAULT_LETTER_MATRIX[role]?.[permission] ?? false
}

export async function checkLetterPermissionV2(
  userId: string,
  permission: LetterPermission
): Promise<boolean> {
  // If the new permission tables have no UserRole rows for this user, fall back to
  // the legacy role matrix. This keeps letters functional until the seed script runs.
  try {
    const db = prisma as any
    const activeRoleCount: number = await db.userRole.count({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    })
    if (activeRoleCount === 0) return legacyLetterCheck(userId, permission)
  } catch {
    // Permission tables not yet migrated — use legacy matrix entirely
    return legacyLetterCheck(userId, permission)
  }

  const target = LETTER_PERMISSION_TARGETS[permission]
  if (!target) return false
  try {
    return target.kind === 'doctype'
      ? await resolveDocTypePermission(userId, target.doctypeKey, target.action)
      : await resolveFeaturePermission(userId, target.featureKey)
  } catch {
    return legacyLetterCheck(userId, permission)
  }
}

/** Letter administrator: may edit/delete/force-archive any letter in any status. */
export function canAdministerLetters(userId: string): Promise<boolean> {
  return checkLetterPermissionV2(userId, 'letter.view_all')
}
