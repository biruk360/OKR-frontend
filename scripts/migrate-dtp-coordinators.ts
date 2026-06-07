/**
 * DTP Coordinator Permission Migration
 *
 * Idempotently grants UserPermissionOverride records for:
 *
 *   Source 1 — DtpSettings.poolCoordinatorIds (CSV of user IDs)
 *     → featureKey: 'button.dtp.assign-driver'  overrideType: 'grant'
 *     → featureKey: 'page.dtp.pool'             overrideType: 'grant'
 *
 *   Source 2 — DtpDepartmentApproval.primaryCoordinatorId
 *     → featureKey: 'button.dtp.approve'        overrideType: 'grant'
 *     → featureKey: 'button.dtp.reject'         overrideType: 'grant'
 *
 * Usage:
 *   npx ts-node scripts/migrate-dtp-coordinators.ts
 *   # or
 *   tsx scripts/migrate-dtp-coordinators.ts
 *
 * Safe to re-run: existing rows are detected via findFirst and skipped.
 */

import { prisma } from '../lib/prisma'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GrantSpec {
  userId: string
  featureKey: string
  reason: string
}

interface MigrationStats {
  poolCoordinatorUsers: number
  poolCoordinatorGrants: number
  deptApprovalUsers: number
  deptApprovalGrants: number
  totalCreated: number
  totalSkipped: number
  activityLogIds: string[]
  errors: string[]
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Upsert (idempotent create) a single UserPermissionOverride grant.
 * Because the model has no composite unique index, we do findFirst + create.
 * Returns true if a new row was created, false if it already existed.
 */
async function ensureGrant(spec: GrantSpec): Promise<boolean> {
  const existing = await prisma.userPermissionOverride.findFirst({
    where: {
      userId: spec.userId,
      featureKey: spec.featureKey,
      overrideType: 'grant',
    },
    select: { id: true },
  })

  if (existing) {
    return false // already granted
  }

  await prisma.userPermissionOverride.create({
    data: {
      userId: spec.userId,
      featureKey: spec.featureKey,
      overrideType: 'grant',
      reason: spec.reason,
      grantedById: spec.userId, // self-referential: migrated on behalf of the user
      expiresAt: null,
    },
  })

  return true
}

/**
 * Verify that a userId actually exists in the User table.
 * Returns the user id if found, null otherwise.
 */
async function resolveUserId(userId: string): Promise<string | null> {
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })
  return user?.id ?? null
}

// ---------------------------------------------------------------------------
// Step 1 — DtpSettings.poolCoordinatorIds
// ---------------------------------------------------------------------------

async function migratePoolCoordinators(stats: MigrationStats): Promise<void> {
  console.log('[1] Reading DtpSettings rows...')

  const settings = await prisma.dtpSettings.findMany({
    select: { id: true, poolCoordinatorIds: true },
  })

  if (settings.length === 0) {
    console.log('    No DtpSettings rows found — skipping.')
    return
  }

  const POOL_FEATURES: { featureKey: string }[] = [
    { featureKey: 'button.dtp.assign-driver' },
    { featureKey: 'page.dtp.pool' },
  ]

  // Collect unique user IDs across all settings rows
  const allUserIds = new Set<string>()
  for (const row of settings) {
    const ids = (row.poolCoordinatorIds ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const id of ids) allUserIds.add(id)
  }

  console.log(
    `    Found ${settings.length} DtpSettings row(s), ${allUserIds.size} unique pool coordinator user ID(s).`,
  )
  stats.poolCoordinatorUsers = allUserIds.size

  for (const userId of allUserIds) {
    const resolvedId = await resolveUserId(userId)
    if (!resolvedId) {
      const msg = `    ! User ID "${userId}" from DtpSettings.poolCoordinatorIds not found — skipping`
      console.warn(msg)
      stats.errors.push(msg)
      continue
    }

    for (const { featureKey } of POOL_FEATURES) {
      const created = await ensureGrant({
        userId: resolvedId,
        featureKey,
        reason: 'Migrated from DtpSettings.poolCoordinatorIds',
      })

      if (created) {
        stats.poolCoordinatorGrants++
        stats.totalCreated++
        console.log(`    + Granted ${featureKey} → ${userId}`)
      } else {
        stats.totalSkipped++
        console.log(`    ~ Already exists ${featureKey} → ${userId}`)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Step 2 — DtpDepartmentApproval.primaryCoordinatorId
// ---------------------------------------------------------------------------

async function migrateDeptApprovalCoordinators(stats: MigrationStats): Promise<void> {
  console.log('[2] Reading DtpDepartmentApproval rows...')

  const approvals = await prisma.dtpDepartmentApproval.findMany({
    where: { primaryCoordinatorId: { not: null } },
    select: { id: true, departmentId: true, primaryCoordinatorId: true },
  })

  if (approvals.length === 0) {
    console.log('    No DtpDepartmentApproval rows with a primaryCoordinatorId — skipping.')
    return
  }

  console.log(`    Found ${approvals.length} approval row(s) with a primaryCoordinatorId.`)

  // Collect unique primary coordinator IDs
  const coordinatorIds = new Set<string>()
  for (const row of approvals) {
    if (row.primaryCoordinatorId) coordinatorIds.add(row.primaryCoordinatorId)
  }
  stats.deptApprovalUsers = coordinatorIds.size

  const APPROVAL_FEATURES: { featureKey: string }[] = [
    { featureKey: 'button.dtp.approve' },
    { featureKey: 'button.dtp.reject' },
  ]

  for (const userId of coordinatorIds) {
    const resolvedId = await resolveUserId(userId)
    if (!resolvedId) {
      const msg = `    ! User ID "${userId}" from DtpDepartmentApproval.primaryCoordinatorId not found — skipping`
      console.warn(msg)
      stats.errors.push(msg)
      continue
    }

    for (const { featureKey } of APPROVAL_FEATURES) {
      const created = await ensureGrant({
        userId: resolvedId,
        featureKey,
        reason: 'Migrated from DtpDepartmentApproval.primaryCoordinatorId',
      })

      if (created) {
        stats.deptApprovalGrants++
        stats.totalCreated++
        console.log(`    + Granted ${featureKey} → ${userId}`)
      } else {
        stats.totalSkipped++
        console.log(`    ~ Already exists ${featureKey} → ${userId}`)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Step 3 — Write summary to ActivityLog
// ---------------------------------------------------------------------------

async function logToActivityLog(stats: MigrationStats): Promise<void> {
  console.log('[3] Writing ActivityLog entry...')

  const summary = {
    poolCoordinatorUsers: stats.poolCoordinatorUsers,
    poolCoordinatorGrants: stats.poolCoordinatorGrants,
    deptApprovalUsers: stats.deptApprovalUsers,
    deptApprovalGrants: stats.deptApprovalGrants,
    totalCreated: stats.totalCreated,
    totalSkipped: stats.totalSkipped,
    errors: stats.errors,
  }

  const log = await prisma.activityLog.create({
    data: {
      entityType: 'MIGRATION',
      action: 'DTP_COORDINATOR_PERMISSION_MIGRATION',
      actorId: null,
      changes: summary,
      metadata: {
        script: 'scripts/migrate-dtp-coordinators.ts',
        runAt: new Date().toISOString(),
      },
    },
  })

  stats.activityLogIds.push(log.id)
  console.log(`    ActivityLog entry created: ${log.id}`)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== DTP Coordinator Permission Migration ===')
  console.log(`    Started at ${new Date().toISOString()}`)
  console.log('')

  const stats: MigrationStats = {
    poolCoordinatorUsers: 0,
    poolCoordinatorGrants: 0,
    deptApprovalUsers: 0,
    deptApprovalGrants: 0,
    totalCreated: 0,
    totalSkipped: 0,
    activityLogIds: [],
    errors: [],
  }

  await migratePoolCoordinators(stats)
  console.log('')

  await migrateDeptApprovalCoordinators(stats)
  console.log('')

  await logToActivityLog(stats)
  console.log('')

  // Print summary
  console.log('=== Migration Summary ===')
  console.log(`  Pool coordinator users processed : ${stats.poolCoordinatorUsers}`)
  console.log(`  Pool coordinator grants created  : ${stats.poolCoordinatorGrants}`)
  console.log(`  Dept approval users processed    : ${stats.deptApprovalUsers}`)
  console.log(`  Dept approval grants created     : ${stats.deptApprovalGrants}`)
  console.log(`  Total grants created             : ${stats.totalCreated}`)
  console.log(`  Total grants skipped (existing)  : ${stats.totalSkipped}`)
  console.log(`  ActivityLog IDs                  : ${stats.activityLogIds.join(', ') || 'none'}`)

  if (stats.errors.length > 0) {
    console.log('')
    console.warn(`  Warnings (${stats.errors.length}):`)
    for (const e of stats.errors) console.warn(`    ${e}`)
  }

  console.log('')
  console.log('=== Migration complete ===')
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
