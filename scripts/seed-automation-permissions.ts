/**
 * Idempotent permission seed for the AI Automations module.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §3.
 *
 * Registers the automation doctypes, the sensitive fields, the default role
 * matrix, and the `canAuthorAutomations` feature capability.
 *
 * Safe to re-run: permission rows preserve administrator edits.
 *
 * Run: `npm run db:seed:automation-permissions`
 */

import { prisma } from '../lib/prisma'

interface DocType {
  key: string
  displayName: string
  isSubmittable?: boolean
}

const DOCTYPES: DocType[] = [
  // Submittable: "submitting" an automation is enabling it to run.
  { key: 'automation', displayName: 'Automation', isSubmittable: true },
  { key: 'automation_briefing', displayName: 'Automation Briefing' },
  { key: 'automation_settings', displayName: 'Automation Settings' },
]

/**
 * permLevel 2 fields are the ones that change what the automation can reach or
 * spend — they stay admin-only even for users who may edit the automation.
 */
const SENSITIVE_FIELDS: [doctypeKey: string, fieldName: string, label: string, permLevel: number][] = [
  ['automation', 'toolGrants', 'Tool Grants', 2],
  ['automation', 'maxCostUsdPerRun', 'Per-run Cost Cap', 2],
  ['automation', 'maxCostUsdMonth', 'Monthly Cost Cap', 2],
  ['automation', 'mode', 'Distribution Mode', 1],
  ['automation', 'recipientsJson', 'Recipients', 1],
  ['automation_settings', 'domainAllowlist', 'Domain Allowlist', 2],
  ['automation_settings', 'globalPaused', 'Global Pause', 2],
  ['automation_settings', 'orgDailyCostCapUsd', 'Org Daily Cost Cap', 2],
]

const FEATURE_KEYS: [featureKey: string, roles: RoleKey[]][] = [
  // Who may author automations at all (spec §3.2).
  ['canAuthorAutomations', ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD']],
  // Who may approve a Tier-2 tool grant.
  ['canApproveAutomationGrants', ['ADMIN']],
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

/** Author their own automations; scoping keeps them off everyone else's. */
const OWN_AUTOMATIONS = p({
  canRead: true, canWrite: true, canCreate: true, canDelete: true, canSubmit: true,
  canExport: true, canPrint: true, applyScoping: true,
})

/** A recipient reads Briefings; they never see the plan, transcript, or cost. */
const BRIEFING_READER = p({ canRead: true, canExport: true, canPrint: true, applyScoping: true })

const MATRIX: MatrixRow[] = [
  {
    doctypeKey: 'automation',
    ADMIN: ALL,
    EXECUTIVE: p({ ...OWN_AUTOMATIONS, canReport: true, applyScoping: false }),
    DEPARTMENT_LEAD: OWN_AUTOMATIONS,
    // Employees may read a Briefing they receive but may not author automations.
    EMPLOYEE: NONE,
  },
  {
    doctypeKey: 'automation_briefing',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true, canExport: true, canPrint: true, canReport: true }),
    DEPARTMENT_LEAD: p({ ...BRIEFING_READER, canDelete: true }),
    EMPLOYEE: BRIEFING_READER,
  },
  {
    doctypeKey: 'automation_settings',
    ADMIN: ALL,
    EXECUTIVE: p({ canRead: true }),
    DEPARTMENT_LEAD: NONE,
    EMPLOYEE: NONE,
  },
]

const ROLE_KEYS: RoleKey[] = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE']

async function main(): Promise<void> {
  console.log('[automation-permissions] Seeding Automations DocTypes + matrix...')

  for (const dt of DOCTYPES) {
    await prisma.docTypeRegistry.upsert({
      where: { key: dt.key },
      create: { key: dt.key, displayName: dt.displayName, module: 'automations', isSubmittable: dt.isSubmittable ?? false },
      update: { displayName: dt.displayName, module: 'automations', isSubmittable: dt.isSubmittable ?? false },
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

  let permissionCount = 0
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
      permissionCount++
    }
  }
  console.log(`  Upserted ${permissionCount} role permission rows`)

  let featureCount = 0
  for (const [featureKey, enabledRoles] of FEATURE_KEYS) {
    for (const roleKey of ROLE_KEYS) {
      const roleId = roleIdByKey.get(roleKey)
      if (!roleId) continue
      const enabled = enabledRoles.includes(roleKey)
      await prisma.featurePermission.upsert({
        where: { roleId_featureKey: { roleId, featureKey } },
        create: { roleId, featureKey, visible: enabled, enabled },
        update: {},
      })
      featureCount++
    }
  }
  console.log(`  Upserted ${featureCount} feature permission rows`)

  const settings = await prisma.automationSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  })
  console.log(`  Automation settings ready (globalPaused=${settings.globalPaused}, maxConcurrentRuns=${settings.maxConcurrentRuns})`)

  console.log('[automation-permissions] Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
