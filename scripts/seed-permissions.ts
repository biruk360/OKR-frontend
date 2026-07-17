/**
 * Idempotent permission system seed script.
 *
 * Usage:
 *   npx ts-node scripts/seed-permissions.ts
 *   # or
 *   tsx scripts/seed-permissions.ts
 *
 * Steps (each safely re-runnable):
 *   1. Upsert system roles, including the module-scoped PERFORMANCE_ADMIN
 *   2. Sync existing users into UserRole table using User.role string field
 *   3. Seed DocTypeRegistry (58 doctypes)
 *   4. Seed default RoleDocTypePermissions per role/doctype matrix
 *   5. Seed FeaturePermissions (visible + enabled per role)
 *   6. Seed sensitive DocType fields
 *   7. Seed default RecordScopeRules (FR-4.1)
 */

import { prisma } from '../lib/prisma'

// ---------------------------------------------------------------------------
// 1. System roles
// ---------------------------------------------------------------------------

interface SystemRole {
  name: string
  key: string
  isSystem: boolean
  hierarchyLevel: number
  color: string
  description: string
}

const SYSTEM_ROLES: SystemRole[] = [
  {
    name: 'Administrator',
    key: 'ADMIN',
    isSystem: true,
    hierarchyLevel: 1,
    color: '#DC2626',
    description: 'Full system access',
  },
  {
    name: 'Executive',
    key: 'EXECUTIVE',
    isSystem: true,
    hierarchyLevel: 2,
    color: '#7C3AED',
    description: 'Executive access',
  },
  {
    name: 'Department Lead',
    key: 'DEPARTMENT_LEAD',
    isSystem: true,
    hierarchyLevel: 3,
    color: '#2563EB',
    description: 'Department management',
  },
  {
    name: 'Employee',
    key: 'EMPLOYEE',
    isSystem: true,
    hierarchyLevel: 4,
    color: '#059669',
    description: 'Standard employee access',
  },
  {
    name: 'Performance Administrator',
    key: 'PERFORMANCE_ADMIN',
    isSystem: true,
    hierarchyLevel: 3,
    color: '#C2410C',
    description: 'Administers scorecards, review cycles, calibration, and performance actions without global system access',
  },
]

async function upsertRoles(): Promise<Record<string, string>> {
  console.log('[1] Upserting system roles...')
  const roleIdMap: Record<string, string> = {}

  for (const role of SYSTEM_ROLES) {
    const upserted = await prisma.role.upsert({
      where: { key: role.key },
      create: role,
      update: {
        name: role.name,
        color: role.color,
        description: role.description,
        hierarchyLevel: role.hierarchyLevel,
        isSystem: role.isSystem,
      },
    })
    roleIdMap[role.key] = upserted.id
    console.log(`  - ${role.key}: ${upserted.id}`)
  }

  return roleIdMap
}

async function upsertPerformanceRoleProfile(roleIdMap: Record<string, string>): Promise<void> {
  const roleId = roleIdMap.PERFORMANCE_ADMIN
  if (!roleId) return
  const profile = await prisma.roleProfile.upsert({
    where: { name: 'Performance Administration' },
    create: {
      name: 'Performance Administration',
      description: 'Grants module-scoped Performance Administrator capabilities',
    },
    update: {
      description: 'Grants module-scoped Performance Administrator capabilities',
    },
  })
  await prisma.roleProfileMembership.upsert({
    where: { profileId_roleId: { profileId: profile.id, roleId } },
    create: { profileId: profile.id, roleId },
    update: {},
  })
}

// ---------------------------------------------------------------------------
// 2. Sync existing users → UserRole
// ---------------------------------------------------------------------------

async function syncUserRoles(roleIdMap: Record<string, string>): Promise<void> {
  console.log('[2] Syncing existing users into UserRole table...')
  const users = await prisma.user.findMany({ select: { id: true, role: true } })

  let synced = 0
  let skipped = 0

  for (const user of users) {
    const roleId = roleIdMap[user.role]
    if (!roleId) {
      console.warn(`  ! User ${user.id} has unknown role "${user.role}" — skipping`)
      skipped++
      continue
    }

    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: user.id, roleId },
      },
      create: { userId: user.id, roleId },
      update: {},
    })
    synced++
  }

  console.log(`  Synced ${synced} user(s), skipped ${skipped}`)
}

// ---------------------------------------------------------------------------
// 3. DocTypeRegistry
// ---------------------------------------------------------------------------

interface DocType {
  key: string
  displayName: string
  module: string
  isSubmittable?: boolean
  description?: string
}

const DOCTYPES: DocType[] = [
  // OKR module
  { key: 'objective', displayName: 'Objective', module: 'okr', isSubmittable: false },
  { key: 'key_result', displayName: 'Key Result', module: 'okr' },
  { key: 'key_result_check_in', displayName: 'KR Check-in', module: 'okr' },
  { key: 'confidence_snapshot', displayName: 'Confidence Snapshot', module: 'okr' },
  { key: 'timeframe', displayName: 'Timeframe', module: 'okr' },
  { key: 'label', displayName: 'OKR Label', module: 'okr' },
  { key: 'objective_contributor', displayName: 'Objective Contributor', module: 'okr' },

  // Work module
  { key: 'todo', displayName: 'Initiative / Todo', module: 'work' },
  { key: 'todo_comment', displayName: 'Todo Comment', module: 'work' },
  { key: 'todo_checklist', displayName: 'Todo Checklist', module: 'work' },
  { key: 'todo_checklist_item', displayName: 'Checklist Item', module: 'work' },
  { key: 'todo_attachment', displayName: 'Todo Attachment', module: 'work' },
  { key: 'initiative_update', displayName: 'Initiative Update', module: 'work' },
  { key: 'sprint', displayName: 'Sprint', module: 'work' },
  { key: 'sprint_column', displayName: 'Sprint Column', module: 'work' },
  { key: 'sprint_participant', displayName: 'Sprint Participant', module: 'work' },

  // AI module
  { key: 'ai_sprint_plan', displayName: 'AI Sprint Plan', module: 'ai' },
  { key: 'ai_generation_log', displayName: 'AI Generation Log', module: 'ai' },

  // Org module
  { key: 'user', displayName: 'User', module: 'org' },
  { key: 'department', displayName: 'Department', module: 'org' },
  { key: 'department_membership', displayName: 'Department Membership', module: 'org' },
  { key: 'manager_relationship', displayName: 'Manager Relationship', module: 'org' },
  { key: 'organization_settings', displayName: 'Org Settings', module: 'org' },
  { key: 'user_preference', displayName: 'User Preference', module: 'org' },
  { key: 'favorite', displayName: 'Favorite', module: 'org' },
  { key: 'risk', displayName: 'Risk', module: 'org' },

  // Letters module
  { key: 'letter', displayName: 'Letter', module: 'letters', isSubmittable: true },
  { key: 'letter_enclosure', displayName: 'Letter Enclosure', module: 'letters' },
  { key: 'letter_sequence', displayName: 'Letter Sequence', module: 'letters' },
  { key: 'letter_type_def', displayName: 'Letter Type', module: 'letters' },

  // DTP module
  { key: 'daily_trip_plan', displayName: 'Trip Plan', module: 'dtp', isSubmittable: true },
  { key: 'trip_stop', displayName: 'Trip Stop', module: 'dtp' },
  { key: 'trip_leg', displayName: 'Trip Leg', module: 'dtp' },
  { key: 'vehicle', displayName: 'Vehicle', module: 'dtp' },
  { key: 'driver', displayName: 'Driver', module: 'dtp' },
  { key: 'dtp_trip_type', displayName: 'Trip Type', module: 'dtp' },
  { key: 'dtp_settings', displayName: 'DTP Settings', module: 'dtp' },
  { key: 'dtp_department_approval', displayName: 'DTP Dept Approval', module: 'dtp' },
  { key: 'daily_run_sheet', displayName: 'Run Sheet', module: 'dtp' },
  { key: 'dtp_event', displayName: 'DTP Event Log', module: 'dtp' },
  { key: 'route_group', displayName: 'Route Group', module: 'dtp' },

  // Performance module
  { key: 'performance_settings', displayName: 'Performance Settings', module: 'performance' },
  { key: 'scorecard_template_family', displayName: 'Scorecard Template Family', module: 'performance' },
  { key: 'scorecard_template', displayName: 'Scorecard Template', module: 'performance', isSubmittable: true },
  { key: 'scorecard_tier', displayName: 'Scorecard Tier', module: 'performance' },
  { key: 'scorecard_criterion', displayName: 'Scorecard Criterion', module: 'performance' },
  { key: 'criterion_library_entry', displayName: 'Criterion Library Entry', module: 'performance' },
  { key: 'template_role_mapping', displayName: 'Template Role Mapping', module: 'performance' },
  { key: 'employee_template_assignment', displayName: 'Employee Template Assignment', module: 'performance' },
  { key: 'metric_source_mapping', displayName: 'Metric Source Mapping', module: 'performance' },
  { key: 'review_cycle', displayName: 'Review Cycle', module: 'performance', isSubmittable: true },
  { key: 'review_cycle_department', displayName: 'Review Cycle Department', module: 'performance' },
  { key: 'review_cycle_issue', displayName: 'Review Cycle Issue', module: 'performance' },
  { key: 'evaluation', displayName: 'Performance Evaluation', module: 'performance', isSubmittable: true },
  { key: 'evaluator_assignment', displayName: 'Evaluator Assignment', module: 'performance' },
  { key: 'evaluator_score', displayName: 'Evaluator Score', module: 'performance', isSubmittable: true },
  { key: 'criterion_result', displayName: 'Criterion Result', module: 'performance' },
  { key: 'evaluation_metric_source', displayName: 'Evaluation Metric Source', module: 'performance' },
  { key: 'evaluation_report', displayName: 'Evaluation Report', module: 'performance' },
  { key: 'evaluation_acknowledgement', displayName: 'Evaluation Acknowledgement', module: 'performance', isSubmittable: true },
  { key: 'improvement_focus', displayName: 'Improvement Focus', module: 'performance' },
  { key: 'development_action', displayName: 'Development Action', module: 'performance', isSubmittable: true },
  { key: 'performance_nudge_delivery', displayName: 'Performance Nudge Delivery', module: 'performance' },

  // Notifications module
  { key: 'notification', displayName: 'Notification', module: 'notifications' },
  { key: 'notification_preference', displayName: 'Notification Preference', module: 'notifications' },
  { key: 'org_notification_default', displayName: 'Org Notification Default', module: 'notifications' },
  { key: 'email_digest_queue', displayName: 'Email Digest Queue', module: 'notifications' },
  { key: 'outbound_email', displayName: 'Outbound Email', module: 'notifications' },
  { key: 'watcher', displayName: 'Watcher', module: 'notifications' },

  // Admin module
  { key: 'activity_log', displayName: 'Activity Log', module: 'admin' },
  { key: 'objective_view', displayName: 'Objective View', module: 'admin' },
  { key: 'client_error_log', displayName: 'Client Error Log', module: 'admin' },

  // Telegram module
  { key: 'telegram_chat', displayName: 'Telegram Chat', module: 'telegram' },
  { key: 'telegram_message', displayName: 'Telegram Message', module: 'telegram' },
  { key: 'telegram_bot_config', displayName: 'Telegram Bot Config', module: 'telegram' },

  // Permissions module
  { key: 'role', displayName: 'Role', module: 'permissions' },
  { key: 'role_profile', displayName: 'Role Profile', module: 'permissions' },
  { key: 'user_role', displayName: 'User Role Assignment', module: 'permissions' },
  { key: 'record_scope_rule', displayName: 'Record Scope Rule', module: 'permissions' },
  { key: 'feature_permission', displayName: 'Feature Permission', module: 'permissions' },
  { key: 'user_permission_override', displayName: 'User Permission Override', module: 'permissions' },
]

async function upsertDoctypes(): Promise<void> {
  console.log(`[3] Seeding DocTypeRegistry (${DOCTYPES.length} doctypes)...`)

  for (const dt of DOCTYPES) {
    await prisma.docTypeRegistry.upsert({
      where: { key: dt.key },
      create: {
        key: dt.key,
        displayName: dt.displayName,
        module: dt.module,
        isSubmittable: dt.isSubmittable ?? false,
        description: dt.description ?? null,
      },
      update: {
        displayName: dt.displayName,
        module: dt.module,
        isSubmittable: dt.isSubmittable ?? false,
      },
    })
  }

  console.log(`  Upserted ${DOCTYPES.length} doctypes`)
}

// ---------------------------------------------------------------------------
// 4. DocType permission matrix helpers
// ---------------------------------------------------------------------------

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

/** Full administrative access — no scoping. */
function all(): PermissionFlags {
  return {
    canRead: true,
    canWrite: true,
    canCreate: true,
    canDelete: true,
    canSubmit: true,
    canExport: true,
    canPrint: true,
    canShare: true,
    canImport: true,
    canReport: true,
    applyScoping: false,
  }
}

/** Read-only, no scoping. */
function readOnly(): PermissionFlags {
  return {
    canRead: true,
    canWrite: false,
    canCreate: false,
    canDelete: false,
    canSubmit: false,
    canExport: false,
    canPrint: false,
    canShare: false,
    canImport: false,
    canReport: false,
    applyScoping: false,
  }
}

/** Read-only with scoping applied. */
function readScoped(): PermissionFlags {
  return { ...readOnly(), applyScoping: true }
}

/** No permissions at all. */
function none(): PermissionFlags {
  return {
    canRead: false,
    canWrite: false,
    canCreate: false,
    canDelete: false,
    canSubmit: false,
    canExport: false,
    canPrint: false,
    canShare: false,
    canImport: false,
    canReport: false,
    applyScoping: false,
  }
}

// Helper: custom flags builder
function flags(
  overrides: Partial<PermissionFlags> & { applyScoping?: boolean },
): PermissionFlags {
  return { ...none(), applyScoping: false, ...overrides }
}

// ---------------------------------------------------------------------------
// Permission matrix definition
// ---------------------------------------------------------------------------

interface PermissionEntry {
  doctypeKey: string
  ADMIN: PermissionFlags
  EXECUTIVE: PermissionFlags
  DEPARTMENT_LEAD: PermissionFlags
  EMPLOYEE: PermissionFlags
}

function buildMatrix(): PermissionEntry[] {
  const matrix: PermissionEntry[] = []

  // Helper to add an entry
  function add(
    doctypeKey: string,
    admin: PermissionFlags,
    exec: PermissionFlags,
    deptLead: PermissionFlags,
    employee: PermissionFlags,
  ): void {
    matrix.push({ doctypeKey, ADMIN: admin, EXECUTIVE: exec, DEPARTMENT_LEAD: deptLead, EMPLOYEE: employee })
  }

  // ---- OKR module ----
  // objective
  add(
    'objective',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, canExport: true, canPrint: true, canReport: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, canExport: true, canPrint: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // key_result — same pattern as objective
  add(
    'key_result',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, canExport: true, canPrint: true, canReport: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, canExport: true, canPrint: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // key_result_check_in
  add(
    'key_result_check_in',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, canExport: true, canReport: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // confidence_snapshot
  add(
    'confidence_snapshot',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canReport: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // timeframe
  add(
    'timeframe',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    readOnly(),
    readOnly(),
  )

  // label
  add(
    'label',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true }),
    readOnly(),
  )

  // objective_contributor
  add(
    'objective_contributor',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // ---- Work module ----
  // todo
  add(
    'todo',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, canExport: true, canReport: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // todo_comment
  add(
    'todo_comment',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // todo_checklist
  add(
    'todo_checklist',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // todo_checklist_item
  add(
    'todo_checklist_item',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // todo_attachment
  add(
    'todo_attachment',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // initiative_update
  add(
    'initiative_update',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // sprint
  add(
    'sprint',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, canReport: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, applyScoping: true }),
  )

  // sprint_column
  add(
    'sprint_column',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, applyScoping: true }),
  )

  // sprint_participant
  add(
    'sprint_participant',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, applyScoping: true }),
  )

  // ---- AI module ----
  // ai_sprint_plan
  add(
    'ai_sprint_plan',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    none(),
  )

  // ai_generation_log
  add(
    'ai_generation_log',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true, applyScoping: true }),
    none(),
  )

  // ---- Org module ----
  // user
  add(
    'user',
    all(),
    flags({ canRead: true, canWrite: true, canExport: true, canReport: true }),
    flags({ canRead: true }),
    flags({ canRead: true }),
  )

  // department
  add(
    'department',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true }),
    flags({ canRead: true }),
  )

  // department_membership
  add(
    'department_membership',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true }),
    flags({ canRead: true }),
  )

  // manager_relationship
  add(
    'manager_relationship',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true }),
    flags({ canRead: true }),
  )

  // organization_settings
  add(
    'organization_settings',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true }),
    flags({ canRead: true }),
  )

  // user_preference
  add(
    'user_preference',
    all(),
    flags({ canRead: true, canWrite: true }),
    flags({ canRead: true, canWrite: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, applyScoping: true }),
  )

  // favorite
  add(
    'favorite',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
  )

  // risk
  add(
    'risk',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // ---- Letters module ----
  // letter — EMPLOYEE: RWCS + Print + scope:OWN
  add(
    'letter',
    all(),
    flags({ canRead: true, canPrint: true }),
    flags({ canRead: true, canPrint: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canSubmit: true, canPrint: true, applyScoping: true }),
  )

  // letter_enclosure
  add(
    'letter_enclosure',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
  )

  // letter_sequence
  add(
    'letter_sequence',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true }),
    none(),
  )

  // letter_type_def
  add(
    'letter_type_def',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true }),
    flags({ canRead: true }),
  )

  // ---- DTP module ----
  // daily_trip_plan — DEPT_LEAD: R+Submit+Export+Print+scope:DEPT; EMPLOYEE: RWC+Submit+scope:OWN
  add(
    'daily_trip_plan',
    all(),
    flags({ canRead: true, canExport: true, canPrint: true }),
    flags({ canRead: true, canSubmit: true, canExport: true, canPrint: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canSubmit: true, applyScoping: true }),
  )

  // trip_stop
  add(
    'trip_stop',
    all(),
    flags({ canRead: true, canExport: true }),
    flags({ canRead: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
  )

  // trip_leg
  add(
    'trip_leg',
    all(),
    flags({ canRead: true, canExport: true }),
    flags({ canRead: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
  )

  // vehicle
  add(
    'vehicle',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true }),
    flags({ canRead: true }),
  )

  // driver
  add(
    'driver',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true }),
    flags({ canRead: true }),
  )

  // dtp_trip_type
  add(
    'dtp_trip_type',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true }),
    flags({ canRead: true }),
  )

  // dtp_settings
  add(
    'dtp_settings',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true }),
    flags({ canRead: true }),
  )

  // dtp_department_approval
  add(
    'dtp_department_approval',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true, canWrite: true, applyScoping: true }),
    none(),
  )

  // daily_run_sheet
  add(
    'daily_run_sheet',
    all(),
    flags({ canRead: true, canExport: true, canPrint: true }),
    flags({ canRead: true, canPrint: true, applyScoping: true }),
    flags({ canRead: true, applyScoping: true }),
  )

  // dtp_event
  add(
    'dtp_event',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true, applyScoping: true }),
    flags({ canRead: true, applyScoping: true }),
  )

  // route_group
  add(
    'route_group',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true }),
    flags({ canRead: true }),
  )

  // ---- Performance module ----
  add('performance_settings', all(), readOnly(), none(), none())
  add('scorecard_template_family', all(), readOnly(), none(), none())
  add('scorecard_template', all(), readOnly(), readOnly(), none())
  add('scorecard_tier', all(), readOnly(), none(), none())
  add('scorecard_criterion', all(), readOnly(), none(), none())
  add('criterion_library_entry', all(), readOnly(), readOnly(), readOnly())
  add('template_role_mapping', all(), readOnly(), none(), none())
  add('employee_template_assignment', all(), readOnly(), readOnly(), readOnly())
  add('metric_source_mapping', all(), readOnly(), none(), none())
  add('review_cycle', all(), readOnly(), readOnly(), readOnly())
  add('review_cycle_department', all(), readOnly(), readOnly(), readOnly())
  add('review_cycle_issue', all(), readOnly(), readOnly(), none())
  add(
    'evaluation',
    all(),
    flags({ canRead: true, canWrite: true, canSubmit: true, canReport: true }),
    flags({ canRead: true, canWrite: true, canSubmit: true }),
    flags({ canRead: true, canWrite: true, canSubmit: true }),
  )
  add(
    'evaluator_assignment',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true }),
  )
  add(
    'evaluator_score',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canSubmit: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canSubmit: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canSubmit: true }),
  )
  add('criterion_result', all(), flags({ canRead: true, canWrite: true }), flags({ canRead: true, canWrite: true }), flags({ canRead: true, canWrite: true }))
  add('evaluation_metric_source', all(), readOnly(), readOnly(), readOnly())
  add('evaluation_report', all(), flags({ canRead: true, canCreate: true, canShare: true }), flags({ canRead: true, canCreate: true, canShare: true }), flags({ canRead: true, canCreate: true, canShare: true }))
  add('evaluation_acknowledgement', all(), flags({ canRead: true, canWrite: true, canCreate: true, canSubmit: true }), flags({ canRead: true, canWrite: true, canCreate: true, canSubmit: true }), flags({ canRead: true, canWrite: true, canCreate: true, canSubmit: true }))
  add('improvement_focus', all(), flags({ canRead: true, canWrite: true }), flags({ canRead: true, canWrite: true }), flags({ canRead: true, canWrite: true }))
  add('development_action', all(), flags({ canRead: true, canReport: true }), readOnly(), none())
  add('performance_nudge_delivery', all(), none(), none(), none())

  // ---- Notifications module ----
  // notification
  add(
    'notification',
    all(),
    flags({ canRead: true, applyScoping: true }),
    flags({ canRead: true, applyScoping: true }),
    flags({ canRead: true, applyScoping: true }),
  )

  // notification_preference
  add(
    'notification_preference',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, applyScoping: true }),
  )

  // org_notification_default
  add(
    'org_notification_default',
    all(),
    flags({ canRead: true }),
    flags({ canRead: true }),
    flags({ canRead: true }),
  )

  // email_digest_queue
  add(
    'email_digest_queue',
    all(),
    readOnly(),
    none(),
    none(),
  )

  // outbound_email
  add(
    'outbound_email',
    all(),
    readOnly(),
    none(),
    none(),
  )

  // watcher
  add(
    'watcher',
    all(),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
    flags({ canRead: true, canWrite: true, canCreate: true, canDelete: true, applyScoping: true }),
  )

  // ---- Admin module ----
  // activity_log — all roles get canRead only
  add('activity_log', readOnly(), readOnly(), readOnly(), readOnly())
  add('objective_view', all(), readOnly(), readOnly(), none())
  add('client_error_log', all(), readOnly(), none(), none())

  // ---- Telegram module ----
  // Only ADMIN has access to telegram doctypes
  add('telegram_chat', all(), none(), none(), none())
  add('telegram_message', all(), none(), none(), none())
  add('telegram_bot_config', all(), none(), none(), none())

  // ---- Permissions module ----
  // ADMIN all; others read only or none
  add('role', all(), readOnly(), none(), none())
  add('role_profile', all(), readOnly(), none(), none())
  add('user_role', all(), readOnly(), none(), none())
  add('record_scope_rule', all(), none(), none(), none())
  add('feature_permission', all(), none(), none(), none())
  add('user_permission_override', all(), none(), none(), none())

  return matrix
}

async function upsertDocTypePermissions(roleIdMap: Record<string, string>): Promise<void> {
  console.log('[4] Seeding RoleDocTypePermissions...')

  const matrix = buildMatrix()
  const roleKeys = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE'] as const

  let count = 0
  for (const entry of matrix) {
    for (const roleKey of roleKeys) {
      const roleId = roleIdMap[roleKey]
      if (!roleId) continue

      const perms = entry[roleKey]
      const doctypeKey = entry.doctypeKey

      await prisma.roleDocTypePermission.upsert({
        where: {
          roleId_doctypeKey_permLevel: { roleId, doctypeKey, permLevel: 0 },
        },
        create: {
          roleId,
          doctypeKey,
          permLevel: 0,
          ...perms,
        },
        // Preserve administrator changes made in Permission Manager. This
        // script runs on every deploy and must only fill missing baseline rows.
        update: {},
      })
      count++
    }
  }

  const performanceAdminRoleId = roleIdMap.PERFORMANCE_ADMIN
  if (performanceAdminRoleId) {
    for (const doctype of DOCTYPES.filter((item) => item.module === 'performance')) {
      await prisma.roleDocTypePermission.upsert({
        where: {
          roleId_doctypeKey_permLevel: {
            roleId: performanceAdminRoleId,
            doctypeKey: doctype.key,
            permLevel: 3,
          },
        },
        create: {
          roleId: performanceAdminRoleId,
          doctypeKey: doctype.key,
          permLevel: 3,
          ...all(),
        },
        update: {},
      })
      count++
    }
  }

  console.log(`  Upserted ${count} role-doctype permission rows across ${matrix.length} doctypes`)
}

// ---------------------------------------------------------------------------
// 5. Feature permissions
// ---------------------------------------------------------------------------

type RoleVisibilityMap = {
  ADMIN: boolean
  EXECUTIVE: boolean
  DEPARTMENT_LEAD: boolean
  EMPLOYEE: boolean
}

const FEATURES: Record<string, RoleVisibilityMap> = {
  'module.okr':                            { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'module.letters':                        { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'module.dtp':                            { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'module.performance':                    { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'module.reports':                        { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'module.admin':                          { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'module.settings':                       { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'module.org':                            { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'page.dashboard':                        { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'page.company-okrs':                     { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'page.department-okrs':                  { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'page.alignment-map':                    { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'page.filters':                          { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'page.settings.permissions':             { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.settings.users':                   { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.settings.teams':                   { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.settings.audit-logs':              { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.letter.approve':                 { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'button.letter.reject':                  { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'button.letter.delete':                  { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.letter.unarchive':               { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.letter.send':                    { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'button.dtp.approve':                    { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'button.dtp.reject':                     { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'button.dtp.assign-driver':              { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.dtp.console':                      { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'page.dtp.pool':                         { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'widget.ceo-dashboard':                  { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'widget.ai-sprint-planning':             { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'page.sprints-ai':                       { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'page.reports':                          { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'page.analytics':                        { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: false },
  'page.settings.notification-defaults':   { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.settings.okr-rules':              { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.settings.branding':               { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.settings.integrations':           { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.admin.ai-logs':                    { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.performance.my':                   { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'page.performance.evaluations':          { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'page.performance.calibration':          { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'page.performance.cycles':               { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.performance.templates':            { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.performance.actions':              { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.performance.culture-library':      { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.settings.performance':             { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'page.performance.score':                { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'button.performance.template.create':    { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.template.edit':      { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.template.publish':   { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.template.archive':   { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.template.fork':      { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.template.map-role':  { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.template.map-metric':{ ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.culture-library.create': { ADMIN: true, EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.culture-library.edit':   { ADMIN: true, EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.cycle.create':       { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.cycle.open':         { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.cycle.close':        { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.panel.manage':       { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'button.performance.score.save':         { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'button.performance.score.submit':       { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'button.performance.calibration.resolve':{ ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'button.performance.draft.share':        { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'button.performance.evaluation.finalize':{ ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'button.performance.report.acknowledge': { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'button.performance.report.dispute':     { ADMIN: true,  EXECUTIVE: true,  DEPARTMENT_LEAD: true,  EMPLOYEE: true  },
  'button.performance.action.approve':     { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.action.reject':      { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
  'button.performance.action.execute':     { ADMIN: true,  EXECUTIVE: false, DEPARTMENT_LEAD: false, EMPLOYEE: false },
}

async function upsertFeaturePermissions(roleIdMap: Record<string, string>): Promise<void> {
  console.log('[5] Seeding FeaturePermissions...')

  const roleKeys = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE'] as const
  let count = 0

  for (const [featureKey, visibilityMap] of Object.entries(FEATURES)) {
    for (const roleKey of roleKeys) {
      const roleId = roleIdMap[roleKey]
      if (!roleId) continue

      const visible = visibilityMap[roleKey]

      await prisma.featurePermission.upsert({
        where: {
          roleId_featureKey: { roleId, featureKey },
        },
        create: { roleId, featureKey, visible, enabled: visible },
        // Do not reset a configured feature flag during deployment.
        update: {},
      })
      count++
    }

    const performanceAdminRoleId = roleIdMap.PERFORMANCE_ADMIN
    if (performanceAdminRoleId && (
      featureKey.startsWith('module.performance')
      || featureKey.includes('.performance.')
      || featureKey === 'page.settings.performance'
    )) {
      await prisma.featurePermission.upsert({
        where: { roleId_featureKey: { roleId: performanceAdminRoleId, featureKey } },
        create: { roleId: performanceAdminRoleId, featureKey, visible: true, enabled: true },
        update: {},
      })
      count++
    }
  }

  console.log(`  Upserted ${count} feature permission rows across ${Object.keys(FEATURES).length} features`)
}

// ---------------------------------------------------------------------------
// 6. Sensitive field registry
// ---------------------------------------------------------------------------

const PERFORMANCE_FIELDS = [
  ['evaluation', 'normalized', 'Normalized Score', 2],
  ['evaluation', 'gatekeeperPass', 'Gatekeeper Result', 2],
  ['evaluation', 'decisionBand', 'Decision Band', 2],
  ['evaluator_score', 'score', 'Evaluator Score', 3],
  ['evaluator_score', 'remark', 'Evaluator Remark', 3],
  ['evaluator_score', 'lockedAt', 'Score Lock Time', 3],
  ['criterion_result', 'consolidated', 'Consolidated Score', 2],
  ['criterion_result', 'calibrationNote', 'Calibration Note', 3],
  ['evaluation_report', 'contentJson', 'Report Content', 2],
  ['evaluation_acknowledgement', 'comment', 'Acknowledgement Comment', 2],
  ['development_action', 'decisionReason', 'Decision Reason', 2],
] as const

async function upsertPerformanceFields(): Promise<void> {
  console.log('[6] Seeding Performance sensitive field registry...')
  for (const [doctypeKey, fieldName, displayLabel, permLevel] of PERFORMANCE_FIELDS) {
    await prisma.docTypeFieldRegistry.upsert({
      where: { doctypeKey_fieldName: { doctypeKey, fieldName } },
      create: { doctypeKey, fieldName, displayLabel, permLevel, isSensitive: true },
      update: {},
    })
  }
  console.log(`  Upserted ${PERFORMANCE_FIELDS.length} sensitive field definitions`)
}

// ---------------------------------------------------------------------------
// 7. Record scope rules (FR-4.1)
// ---------------------------------------------------------------------------

interface ScopeRuleDef {
  roleKey: string
  doctypeKey: string
  fieldName: string
  operator: string
  valueType: string
}

const SCOPE_RULE_DEFS: ScopeRuleDef[] = [
  {
    roleKey: 'DEPARTMENT_LEAD',
    doctypeKey: 'objective',
    fieldName: 'departmentId',
    operator: 'is_child_of',
    valueType: 'user_primary_dept',
  },
  {
    roleKey: 'EMPLOYEE',
    doctypeKey: 'objective',
    fieldName: 'ownerId',
    operator: 'equals',
    valueType: 'user_id',
  },
  {
    roleKey: 'EMPLOYEE',
    doctypeKey: 'todo',
    fieldName: 'assigneeId',
    operator: 'equals',
    valueType: 'user_id',
  },
  {
    roleKey: 'DEPARTMENT_LEAD',
    doctypeKey: 'sprint',
    fieldName: 'departmentId',
    operator: 'is_child_of',
    valueType: 'user_primary_dept',
  },
  {
    roleKey: 'EMPLOYEE',
    doctypeKey: 'daily_trip_plan',
    fieldName: 'requesterId',
    operator: 'equals',
    valueType: 'user_id',
  },
]

async function upsertScopeRules(roleIdMap: Record<string, string>): Promise<void> {
  console.log('[7] Seeding RecordScopeRules...')

  let created = 0
  let skipped = 0

  for (const def of SCOPE_RULE_DEFS) {
    const roleId = roleIdMap[def.roleKey]
    if (!roleId) {
      console.warn(`  ! Unknown role key "${def.roleKey}" — skipping scope rule for ${def.doctypeKey}`)
      skipped++
      continue
    }

    // Check for existing rule to stay idempotent
    const existing = await prisma.recordScopeRule.findFirst({
      where: {
        targetType: 'role',
        targetId: roleId,
        doctypeKey: def.doctypeKey,
        fieldName: def.fieldName,
        operator: def.operator,
        valueType: def.valueType,
      },
    })

    if (!existing) {
      await prisma.recordScopeRule.create({
        data: {
          targetType: 'role',
          targetId: roleId,
          doctypeKey: def.doctypeKey,
          fieldName: def.fieldName,
          operator: def.operator,
          valueType: def.valueType,
          staticValue: null,
          isActive: true,
        },
      })
      created++
    } else {
      // Existing rules may have been intentionally disabled by an admin.
      skipped++
    }
  }

  console.log(`  Created ${created} scope rule(s), ${skipped} already existed`)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Permission System Seed ===')
  console.log(`  Started at ${new Date().toISOString()}`)
  console.log('')

  const roleIdMap = await upsertRoles()
  await upsertPerformanceRoleProfile(roleIdMap)
  console.log('')

  await syncUserRoles(roleIdMap)
  console.log('')

  await upsertDoctypes()
  console.log('')

  await upsertDocTypePermissions(roleIdMap)
  console.log('')

  await upsertFeaturePermissions(roleIdMap)
  console.log('')

  await upsertPerformanceFields()
  console.log('')

  await upsertScopeRules(roleIdMap)
  console.log('')

  console.log('=== Seed complete ===')
}

main()
  .then(() => {
    console.log('Done.')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
