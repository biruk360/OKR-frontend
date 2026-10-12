/**
 * Idempotent permission seed for the Employee Operating Package module (`package`).
 *
 * Registers the §8 doctypes, the sensitive fields, and a default role matrix
 * (docs/employee_operating_package_REQUIREMENTS.md §8). Safe to re-run:
 * permission rows and field definitions preserve administrator edits
 * (`update: {}`); only doctype display metadata is refreshed.
 *
 * The doctype matrix is the coarse RBAC layer the permission UI manages. Whose
 * package a person may see or change (self / manager chain / department lead /
 * HR / org-wide) is decided by lib/package/access.ts — hence `applyScoping`
 * on the non-org-wide rows. Feature keys (module.package, page.*, button.*,
 * package.hr, package.kpi.sensitive.read) are seeded by scripts/seed-permissions.ts.
 *
 * Run: `npm run db:seed:package-permissions` (after scripts/seed-permissions.ts).
 */

import { prisma } from '../lib/prisma'

interface DocType {
  key: string
  displayName: string
  isSubmittable?: boolean
}

const MODULE = 'package'

const DOCTYPES: DocType[] = [
  { key: 'okr_link', displayName: 'OKR Link' },
  { key: 'kr_checkpoint', displayName: 'KR Checkpoint' },
  { key: 'recurring_duty', displayName: 'Recurring Duty' },
  { key: 'role_definition', displayName: 'Role Definition', isSubmittable: true },
  { key: 'kpi', displayName: 'KPI' },
  { key: 'kpi_reading', displayName: 'KPI Reading' },
  { key: 'development_item', displayName: 'Development Item' },
  { key: 'work_dependency', displayName: 'Work Dependency' },
  { key: 'decision', displayName: 'Decision', isSubmittable: true },
  { key: 'operating_package', displayName: 'Operating Package', isSubmittable: true },
  { key: 'package_item_review', displayName: 'Package Item Review' },
]

/** §8 sensitive fields (DocTypeFieldRegistry.isSensitive). permLevel 2 = HR / Finance / Executive tier. */
const SENSITIVE_FIELDS: [doctypeKey: string, fieldName: string, label: string, permLevel: number][] = [
  ['kpi', 'targetValue', 'Target Value (sensitive KPIs)', 2],
  ['kpi_reading', 'value', 'Reading Value (sensitive KPIs)', 2],
  ['operating_package', 'weightsJson', 'Performance Weights', 2],
]

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

/** Org-wide read/write without import (imports are an ADMIN action). */
const EXEC_FULL: PermissionFlags = p({
  canRead: true, canWrite: true, canCreate: true, canDelete: true, canSubmit: true,
  canExport: true, canPrint: true, canReport: true,
})

/** Department lead / manager: their people's records (lib/package/access.ts decides whose). */
const LEAD_MANAGE = p({ canRead: true, canWrite: true, canCreate: true, canDelete: true, canReport: true, canExport: true, applyScoping: true })
const LEAD_MANAGE_SUBMIT = p({ ...LEAD_MANAGE, canSubmit: true })

/** An employee's own records. */
const SELF_MANAGE = p({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true })
const SELF_WRITE = p({ canRead: true, canWrite: true, canCreate: true, applyScoping: true })
const SCOPED_READ = p({ canRead: true, applyScoping: true })

type RoleKey = 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE'
type MatrixRow = { doctypeKey: string } & Record<RoleKey, PermissionFlags>

const MATRIX: MatrixRow[] = [
  // LNK — owners link their own OKR items; leads their members'.
  { doctypeKey: 'okr_link', ADMIN: ALL, EXECUTIVE: EXEC_FULL, DEPARTMENT_LEAD: LEAD_MANAGE, EMPLOYEE: SELF_MANAGE },
  // KRX-3 — KR owners and managers.
  { doctypeKey: 'kr_checkpoint', ADMIN: ALL, EXECUTIVE: EXEC_FULL, DEPARTMENT_LEAD: LEAD_MANAGE, EMPLOYEE: SELF_WRITE },
  // DUT — self edits own duties.
  { doctypeKey: 'recurring_duty', ADMIN: ALL, EXECUTIVE: EXEC_FULL, DEPARTMENT_LEAD: LEAD_MANAGE, EMPLOYEE: SELF_MANAGE },
  // ROL — not self-editable; approval (submit) by manager chain / exec.
  { doctypeKey: 'role_definition', ADMIN: ALL, EXECUTIVE: EXEC_FULL, DEPARTMENT_LEAD: LEAD_MANAGE_SUBMIT, EMPLOYEE: SCOPED_READ },
  // KPI — definitions by managers; employees read.
  { doctypeKey: 'kpi', ADMIN: ALL, EXECUTIVE: EXEC_FULL, DEPARTMENT_LEAD: LEAD_MANAGE, EMPLOYEE: SCOPED_READ },
  // KPI-1 — employees enter their own readings.
  { doctypeKey: 'kpi_reading', ADMIN: ALL, EXECUTIVE: EXEC_FULL, DEPARTMENT_LEAD: LEAD_MANAGE, EMPLOYEE: SELF_WRITE },
  // DEV — self edits own development items.
  { doctypeKey: 'development_item', ADMIN: ALL, EXECUTIVE: EXEC_FULL, DEPARTMENT_LEAD: LEAD_MANAGE, EMPLOYEE: SELF_WRITE },
  // DEP — anyone may raise one and providers mark theirs DONE; the map is company-wide.
  { doctypeKey: 'work_dependency', ADMIN: ALL, EXECUTIVE: EXEC_FULL, DEPARTMENT_LEAD: LEAD_MANAGE, EMPLOYEE: SELF_WRITE },
  // DEC — anyone may request; deciding (submit) is decider / exec only (DEC-4).
  {
    doctypeKey: 'decision',
    ADMIN: ALL,
    EXECUTIVE: EXEC_FULL,
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, canSubmit: true, canReport: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, canWrite: true, canCreate: true, canSubmit: true, applyScoping: true }),
  },
  // PKG — lifecycle by manager chain / HR / exec; employees read their own.
  { doctypeKey: 'operating_package', ADMIN: ALL, EXECUTIVE: EXEC_FULL, DEPARTMENT_LEAD: LEAD_MANAGE_SUBMIT, EMPLOYEE: SCOPED_READ },
  // PKG-2 — employees review (Agree / Dispute) their own items; managers resolve.
  { doctypeKey: 'package_item_review', ADMIN: ALL, EXECUTIVE: EXEC_FULL, DEPARTMENT_LEAD: LEAD_MANAGE, EMPLOYEE: SELF_WRITE },
]

const ROLE_KEYS: RoleKey[] = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE']

async function main(): Promise<void> {
  console.log('[package-permissions] Seeding Employee Operating Package DocTypes + matrix...')

  for (const dt of DOCTYPES) {
    await prisma.docTypeRegistry.upsert({
      where: { key: dt.key },
      create: { key: dt.key, displayName: dt.displayName, module: MODULE, isSubmittable: dt.isSubmittable ?? false },
      update: { displayName: dt.displayName, module: MODULE, isSubmittable: dt.isSubmittable ?? false },
    })
  }
  console.log(`  Upserted ${DOCTYPES.length} doctypes`)

  for (const [doctypeKey, fieldName, displayLabel, permLevel] of SENSITIVE_FIELDS) {
    await prisma.docTypeFieldRegistry.upsert({
      where: { doctypeKey_fieldName: { doctypeKey, fieldName } },
      create: { doctypeKey, fieldName, displayLabel, permLevel, isSensitive: true },
      update: {},
    })
  }
  console.log(`  Upserted ${SENSITIVE_FIELDS.length} sensitive field definitions`)

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
        update: {},
      })
      count++
    }
  }
  console.log(`  Upserted ${count} role permission rows`)
  console.log('[package-permissions] Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
