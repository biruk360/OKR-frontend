/**
 * Idempotent permission seed for the Daily Scrum module.
 *
 * Registers scrum doctypes, sensitive fields, and default role permissions.
 * Safe to re-run: permission rows preserve administrator edits.
 *
 * Run: `npm run db:seed:scrum-permissions`
 */

import { prisma } from '../lib/prisma'

interface DocType {
  key: string
  displayName: string
  isSubmittable?: boolean
}

const DOCTYPES: DocType[] = [
  { key: 'scrum_update', displayName: 'Scrum Update', isSubmittable: true },
  { key: 'scrum_comment', displayName: 'Scrum Comment' },
  { key: 'scrum_absence', displayName: 'Scrum Absence' },
  { key: 'scrum_settings', displayName: 'Scrum Settings' },
  { key: 'scrum_update_link', displayName: 'Scrum Update Link' },
]

const SENSITIVE_FIELDS: [doctypeKey: string, fieldName: string, label: string, permLevel: number][] = [
  ['scrum_update', 'mood', 'Mood', 2],
  ['scrum_update', 'blockers', 'Blockers', 1],
  ['scrum_settings', 'timezone', 'Timezone', 2],
  ['scrum_settings', 'reminderTime', 'Reminder Time', 2],
  ['scrum_settings', 'cutoffTime', 'Cutoff Time', 2],
  ['scrum_settings', 'absentTime', 'Absent Time', 2],
  ['scrum_settings', 'managerDigestTime', 'Manager Digest Time', 2],
  ['scrum_settings', 'workingDays', 'Working Days', 2],
  ['scrum_settings', 'holidays', 'Holidays', 2],
  ['scrum_settings', 'moodEnabled', 'Mood Enabled', 2],
  ['scrum_settings', 'winsEnabled', 'Wins Enabled', 2],
  ['scrum_settings', 'proxyEntryEnabled', 'Proxy Entry Enabled', 2],
  ['scrum_settings', 'telegramEnabled', 'Telegram Enabled', 2],
  ['scrum_settings', 'requireTodoLink', 'Require Todo Link', 2],
  ['scrum_settings', 'recurringThresholdDays', 'Recurring Threshold Days', 2],
  ['scrum_settings', 'escalationThresholdDays', 'Escalation Threshold Days', 2],
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

type RoleKey = 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE'
type MatrixRow = { doctypeKey: string } & Record<RoleKey, PermissionFlags>

const SELF_SCOPED_READ_WRITE = p({
  canRead: true,
  canWrite: true,
  canCreate: true,
  canSubmit: true,
  applyScoping: true,
})

const MANAGER_SCOPED = p({
  canRead: true,
  canWrite: true,
  canCreate: true,
  canSubmit: true,
  canReport: true,
  applyScoping: true,
})

const MATRIX: MatrixRow[] = [
  {
    doctypeKey: 'scrum_update',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true, canReport: true, canExport: true }),
    DEPARTMENT_LEAD: MANAGER_SCOPED,
    EMPLOYEE: SELF_SCOPED_READ_WRITE,
  },
  {
    doctypeKey: 'scrum_comment',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true }),
    DEPARTMENT_LEAD: MANAGER_SCOPED,
    EMPLOYEE: p({ canRead: true, canCreate: true, applyScoping: true }),
  },
  {
    doctypeKey: 'scrum_absence',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true, canReport: true }),
    DEPARTMENT_LEAD: p({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    EMPLOYEE: p({ canRead: true, applyScoping: true }),
  },
  {
    doctypeKey: 'scrum_settings',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true, canWrite: true, canReport: true }),
    DEPARTMENT_LEAD: p({ canRead: true }),
    EMPLOYEE: NONE,
  },
  {
    doctypeKey: 'scrum_update_link',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true, canReport: true }),
    DEPARTMENT_LEAD: MANAGER_SCOPED,
    EMPLOYEE: SELF_SCOPED_READ_WRITE,
  },
]

const ROLE_KEYS: RoleKey[] = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE']

async function main(): Promise<void> {
  console.log('[scrum-permissions] Seeding Daily Scrum DocTypes + matrix...')

  for (const dt of DOCTYPES) {
    await prisma.docTypeRegistry.upsert({
      where: { key: dt.key },
      create: { key: dt.key, displayName: dt.displayName, module: 'scrum', isSubmittable: dt.isSubmittable ?? false },
      update: { displayName: dt.displayName, module: 'scrum', isSubmittable: dt.isSubmittable ?? false },
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
  console.log('[scrum-permissions] Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
