/**
 * Canonical letter permission keys and their human-readable labels.
 * Shared between:
 *   - API routes (validation)
 *   - lib/permissions.ts (DB-driven resolver)
 *   - LetterPermissionsManagement UI component
 *   - prisma/seed-letter-permissions.ts
 */
import { resolveDocTypePermission, resolveFeaturePermission } from './permission-resolver'

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
  'letter.view_all':     { label: 'View All',     description: 'View all letters org-wide, not just own department' },
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

export async function checkLetterPermissionV2(
  userId: string,
  permission: LetterPermission
): Promise<boolean> {
  try {
    switch (permission) {
      case 'letter.read':         return resolveDocTypePermission(userId, 'letter', 'read')
      case 'letter.create':       return resolveDocTypePermission(userId, 'letter', 'create')
      case 'letter.write':        return resolveDocTypePermission(userId, 'letter', 'write')
      case 'letter.submit':       return resolveDocTypePermission(userId, 'letter', 'submit')
      case 'letter.approve':      return resolveFeaturePermission(userId, 'button.letter.approve')
      case 'letter.dispatch':     return resolveFeaturePermission(userId, 'button.letter.send')
      case 'letter.delete':       return resolveDocTypePermission(userId, 'letter', 'delete')
      case 'letter.archive':      return resolveFeaturePermission(userId, 'button.letter.archive')
      case 'letter.manage_types': return resolveDocTypePermission(userId, 'letter_type_def', 'create')
      case 'letter.export':       return resolveDocTypePermission(userId, 'letter', 'export')
      case 'letter.view_all':     return resolveFeaturePermission(userId, 'module.letters')
    }
  } catch {
    return false
  }
}
