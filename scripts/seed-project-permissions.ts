/**
 * Idempotent permission seed for the Project Management & Delivery Intelligence module.
 *
 * Registers the 15 new DocTypes (build spec §5.1), their sensitive fields, and the
 * default Role × DocType permission matrix for the four system roles. Safe to re-run:
 * every write is an upsert whose `update` is empty, so administrator changes made in
 * the Permission Manager are preserved — this only fills missing baseline rows.
 *
 * Run: `npm run db:seed:project-permissions`  (tsx scripts/seed-project-permissions.ts)
 *
 * Record-level "own projects" scoping (applyScoping=true below) is additionally enforced
 * in the route handlers; RecordScopeRule rows are seeded alongside the P1 routes.
 */

import { prisma } from '../lib/prisma'

// --- DocTypes (build spec §5.1) ---------------------------------------------

interface DocType {
  key: string
  displayName: string
  isSubmittable?: boolean
}

const DOCTYPES: DocType[] = [
  { key: 'project', displayName: 'Project' },
  { key: 'phase', displayName: 'Project Phase' },
  { key: 'milestone', displayName: 'Project Milestone' },
  { key: 'activity', displayName: 'Project Activity' },
  { key: 'delay_event', displayName: 'Delay Event' },
  { key: 'change_request', displayName: 'Change Request', isSubmittable: true },
  { key: 'raid_item', displayName: 'RAID Item' },
  { key: 'stage_gate', displayName: 'Stage Gate', isSubmittable: true },
  { key: 'client_obligation', displayName: 'Client Obligation' },
  { key: 'correction_of_error', displayName: 'Correction of Error' },
  { key: 'payment_milestone', displayName: 'Payment Milestone' },
  { key: 'jira_connection', displayName: 'Jira Connection' },
  { key: 'scrum_log', displayName: 'Scrum Log' },
  { key: 'project_report', displayName: 'Project Report', isSubmittable: true },
  { key: 'client_portal_user', displayName: 'Client Portal User' },
]

// --- Sensitive fields (build spec §5.1 — level in parentheses) ---------------

const SENSITIVE_FIELDS: [doctypeKey: string, fieldName: string, label: string, permLevel: number][] = [
  ['project', 'contractValue', 'Contract Value', 2],
  ['project', 'budgetAtCompletion', 'Budget At Completion', 2],
  ['project', 'cpi', 'Cost Performance Index', 2],
  ['activity', 'assigneeId', 'Assignee', 1],
  ['activity', 'estimatedCost', 'Estimated Cost', 2],
  ['activity', 'actualCost', 'Actual Cost', 2],
  ['change_request', 'costImpact', 'Cost Impact', 2],
  ['payment_milestone', 'amount', 'Amount', 2],
  ['jira_connection', 'encryptedToken', 'Encrypted Token', 2],
  ['client_portal_user', 'passwordHash', 'Password Hash', 2],
  // correction_of_error is all-L1 sensitive (§5.1); flag its narrative fields.
  ['correction_of_error', 'whys', '5-Whys Chain', 1],
  ['correction_of_error', 'systemicFix', 'Systemic Fix', 1],
]

// --- Permission flags --------------------------------------------------------

interface PermissionFlags {
  canRead: boolean
  canWrite: boolean
  canCreate: boolean
  canDelete: boolean
  canSubmit: boolean
  canExport: boolean
  canPrint: boolean
  canShare: boolean
  canImport: boolean
  canReport: boolean
  applyScoping: boolean
}

const NONE: PermissionFlags = {
  canRead: false, canWrite: false, canCreate: false, canDelete: false, canSubmit: false,
  canExport: false, canPrint: false, canShare: false, canImport: false, canReport: false, applyScoping: false,
}

function p(overrides: Partial<PermissionFlags>): PermissionFlags {
  return { ...NONE, ...overrides }
}

const ALL: PermissionFlags = p({
  canRead: true, canWrite: true, canCreate: true, canDelete: true, canSubmit: true,
  canExport: true, canPrint: true, canShare: true, canImport: true, canReport: true,
})

type RoleKey = 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE'
type MatrixRow = { doctypeKey: string } & Record<RoleKey, PermissionFlags>

// Default matrix — build spec §5.1. "own projects" → applyScoping:true.
const MATRIX: MatrixRow[] = [
  {
    doctypeKey: 'project',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true, canWrite: true, canExport: true, canPrint: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, applyScoping: true }),
  },
  {
    doctypeKey: 'phase',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, applyScoping: true }),
  },
  {
    doctypeKey: 'milestone',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, applyScoping: true }),
  },
  {
    doctypeKey: 'activity',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, canWrite: true, applyScoping: true }),
  },
  {
    doctypeKey: 'delay_event',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true, canExport: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, applyScoping: true }),
  },
  {
    doctypeKey: 'change_request',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true, canWrite: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, canSubmit: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, applyScoping: true }),
  },
  {
    doctypeKey: 'raid_item',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, applyScoping: true }),
  },
  {
    doctypeKey: 'stage_gate',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true, canWrite: true, canSubmit: true }), // executive can waive
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, applyScoping: true }),
  },
  {
    doctypeKey: 'client_obligation',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, applyScoping: true }),
  },
  {
    doctypeKey: 'correction_of_error',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true, canWrite: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    EMPLOYEE: NONE,
  },
  {
    doctypeKey: 'payment_milestone',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true, canWrite: true }),
    DEPARTMENT_LEAD: p({ canRead: true, applyScoping: true }),
    EMPLOYEE: NONE,
  },
  {
    doctypeKey: 'jira_connection',
    ADMIN: ALL,
    EXECUTIVE: NONE,
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    EMPLOYEE: NONE,
  },
  {
    doctypeKey: 'scrum_log',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, applyScoping: true }),
  },
  {
    doctypeKey: 'project_report',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true, canExport: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, canSubmit: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, applyScoping: true }),
  },
  {
    doctypeKey: 'client_portal_user',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    EMPLOYEE: NONE,
  },
]

const ROLE_KEYS: RoleKey[] = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE']

async function main(): Promise<void> {
  console.log('[project-permissions] Seeding Project Management DocTypes + matrix...')

  // 1) DocTypes
  for (const dt of DOCTYPES) {
    await prisma.docTypeRegistry.upsert({
      where: { key: dt.key },
      create: { key: dt.key, displayName: dt.displayName, module: 'projects', isSubmittable: dt.isSubmittable ?? false },
      update: { displayName: dt.displayName, module: 'projects', isSubmittable: dt.isSubmittable ?? false },
    })
  }
  console.log(`  Upserted ${DOCTYPES.length} doctypes`)

  // 2) Sensitive fields
  for (const [doctypeKey, fieldName, displayLabel, permLevel] of SENSITIVE_FIELDS) {
    await prisma.docTypeFieldRegistry.upsert({
      where: { doctypeKey_fieldName: { doctypeKey, fieldName } },
      create: { doctypeKey, fieldName, displayLabel, permLevel, isSensitive: true },
      update: {},
    })
  }
  console.log(`  Upserted ${SENSITIVE_FIELDS.length} sensitive field definitions`)

  // 3) Role matrix
  const roles = await prisma.role.findMany({ where: { key: { in: ROLE_KEYS } }, select: { id: true, key: true } })
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]))

  let count = 0
  for (const row of MATRIX) {
    for (const roleKey of ROLE_KEYS) {
      const roleId = roleIdByKey.get(roleKey)
      if (!roleId) {
        console.warn(`  ! Role ${roleKey} not found — run scripts/seed-permissions.ts first`)
        continue
      }
      await prisma.roleDocTypePermission.upsert({
        where: { roleId_doctypeKey_permLevel: { roleId, doctypeKey: row.doctypeKey, permLevel: 0 } },
        create: { roleId, doctypeKey: row.doctypeKey, permLevel: 0, ...row[roleKey] },
        update: {}, // preserve admin edits
      })
      count++
    }
  }
  console.log(`  Upserted ${count} role permission rows`)
  console.log('[project-permissions] Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
