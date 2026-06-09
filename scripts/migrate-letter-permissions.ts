/**
 * Data migration: LetterRolePermission + LetterUserPermission → unified permission tables.
 *
 * Migrates rows from the old letter-specific permission tables into the new
 * ERPNext-style unified tables:
 *   - LetterRolePermission  → RoleDocTypePermission | FeaturePermission
 *   - LetterUserPermission  → UserPermissionOverride
 *
 * Usage:
 *   npx ts-node scripts/migrate-letter-permissions.ts
 *   # or
 *   tsx scripts/migrate-letter-permissions.ts
 *
 * Design notes:
 *   - Fully idempotent: every write uses upsert (createOrUpdate semantics).
 *   - Safe to re-run; existing data is never deleted.
 *   - Skips rows whose old permission key has no mapping in the new system
 *     (letter.view_all → module.letters feature key as defined in checkLetterPermissionV2).
 */

import { prisma } from '../lib/prisma'

// ---------------------------------------------------------------------------
// Types for old-model rows (raw query returns plain objects, so we type them)
// ---------------------------------------------------------------------------

interface OldLetterRolePermission {
  id: string
  role: string
  permission: string
  granted: boolean
  updatedById: string | null
  updatedAt: Date
}

interface OldLetterUserPermission {
  id: string
  userId: string
  permission: string
  granted: boolean
  updatedById: string | null   // schema field is updatedById, maps to grantedById in override
  updatedAt: Date
  // Note: reason and expiresAt are NOT in the LetterUserPermission schema — we default them
}

// ---------------------------------------------------------------------------
// Permission mapping
// ---------------------------------------------------------------------------

type DocTypeAction = 'canRead' | 'canCreate' | 'canWrite' | 'canSubmit' | 'canDelete' | 'canExport'

type PermissionTarget =
  | { kind: 'doctype'; doctypeKey: string; field: DocTypeAction }
  | { kind: 'feature'; featureKey: string }
  | { kind: 'skip' }

/**
 * Maps a LetterPermission key to its target in the new unified schema.
 * Mirrors checkLetterPermissionV2 in lib/letter-permissions.ts exactly.
 */
function mapPermission(permission: string): PermissionTarget {
  switch (permission) {
    case 'letter.read':
      return { kind: 'doctype', doctypeKey: 'letter', field: 'canRead' }
    case 'letter.create':
      return { kind: 'doctype', doctypeKey: 'letter', field: 'canCreate' }
    case 'letter.write':
      return { kind: 'doctype', doctypeKey: 'letter', field: 'canWrite' }
    case 'letter.submit':
      return { kind: 'doctype', doctypeKey: 'letter', field: 'canSubmit' }
    case 'letter.delete':
      return { kind: 'doctype', doctypeKey: 'letter', field: 'canDelete' }
    case 'letter.export':
      return { kind: 'doctype', doctypeKey: 'letter', field: 'canExport' }
    case 'letter.manage_types':
      return { kind: 'doctype', doctypeKey: 'letter_type_def', field: 'canCreate' }
    case 'letter.approve':
      return { kind: 'feature', featureKey: 'button.letter.approve' }
    case 'letter.dispatch':
      return { kind: 'feature', featureKey: 'button.letter.send' }
    case 'letter.archive':
      return { kind: 'feature', featureKey: 'button.letter.archive' }
    case 'letter.view_all':
      return { kind: 'feature', featureKey: 'module.letters' }
    default:
      return { kind: 'skip' }
  }
}

// ---------------------------------------------------------------------------
// DocType action → string action name for UserPermissionOverride.action
// ---------------------------------------------------------------------------

function doctypeFieldToActionName(field: DocTypeAction): string {
  const map: Record<DocTypeAction, string> = {
    canRead:   'read',
    canCreate: 'create',
    canWrite:  'write',
    canSubmit: 'submit',
    canDelete: 'delete',
    canExport: 'export',
  }
  return map[field]
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== migrate-letter-permissions ===')
  console.log('Start:', new Date().toISOString())

  // ── Step 1: Fetch old LetterRolePermission rows ──────────────────────────

  const oldRolePerms: OldLetterRolePermission[] = await (prisma as any).letterRolePermission.findMany()
  console.log(`Found ${oldRolePerms.length} LetterRolePermission rows`)

  // ── Step 2: Build role key → role id map ────────────────────────────────

  const roles = await prisma.role.findMany({ select: { id: true, key: true } })
  const roleIdByKey = new Map<string, string>(roles.map((r) => [r.key, r.id]))

  console.log(`Loaded ${roles.length} Role rows: [${roles.map((r) => r.key).join(', ')}]`)

  // ── Step 3: Migrate LetterRolePermission rows ────────────────────────────

  let roleMigratedCount = 0
  let roleSkippedCount = 0

  for (const row of oldRolePerms) {
    const roleId = roleIdByKey.get(row.role)
    if (!roleId) {
      console.warn(`  [SKIP] No Role row for key="${row.role}" (permission="${row.permission}")`)
      roleSkippedCount++
      continue
    }

    const target = mapPermission(row.permission)

    if (target.kind === 'skip') {
      console.warn(`  [SKIP] No mapping for permission="${row.permission}"`)
      roleSkippedCount++
      continue
    }

    if (target.kind === 'doctype') {
      // Upsert RoleDocTypePermission — only set the one field this row controls.
      // Use a two-step approach: upsert the row to ensure it exists, then set field.
      await prisma.roleDocTypePermission.upsert({
        where: {
          roleId_doctypeKey_permLevel: {
            roleId:     roleId,
            doctypeKey: target.doctypeKey,
            permLevel:  0,
          },
        },
        create: {
          roleId:     roleId,
          doctypeKey: target.doctypeKey,
          permLevel:  0,
          [target.field]: row.granted,
        },
        update: {
          [target.field]: row.granted,
        },
      })
      console.log(
        `  [ROLE-DT] role=${row.role} perm=${row.permission} → ${target.doctypeKey}.${target.field}=${row.granted}`
      )

      // Special case: letter.manage_types granted=true also means canRead on the type def
      if (row.permission === 'letter.manage_types' && row.granted) {
        await prisma.roleDocTypePermission.upsert({
          where: {
            roleId_doctypeKey_permLevel: {
              roleId:     roleId,
              doctypeKey: 'letter_type_def',
              permLevel:  0,
            },
          },
          create: {
            roleId:     roleId,
            doctypeKey: 'letter_type_def',
            permLevel:  0,
            canRead:    true,
            canCreate:  true,
          },
          update: {
            canRead:   true,
            canCreate: true,
          },
        })
      }
    } else {
      // feature permission
      await prisma.featurePermission.upsert({
        where: {
          roleId_featureKey: {
            roleId:     roleId,
            featureKey: target.featureKey,
          },
        },
        create: {
          roleId:     roleId,
          featureKey: target.featureKey,
          visible:    row.granted,
          enabled:    row.granted,
        },
        update: {
          visible: row.granted,
          enabled: row.granted,
        },
      })
      console.log(
        `  [ROLE-FT] role=${row.role} perm=${row.permission} → feature=${target.featureKey} visible=${row.granted}`
      )
    }

    roleMigratedCount++
  }

  // ── Step 4: Fetch old LetterUserPermission rows ──────────────────────────

  const oldUserPerms: OldLetterUserPermission[] = await (prisma as any).letterUserPermission.findMany()
  console.log(`Found ${oldUserPerms.length} LetterUserPermission rows`)

  // ── Step 5: Migrate LetterUserPermission rows ────────────────────────────

  let userMigratedCount = 0
  let userSkippedCount = 0

  for (const row of oldUserPerms) {
    const target = mapPermission(row.permission)

    if (target.kind === 'skip') {
      console.warn(`  [SKIP] No mapping for user permission="${row.permission}" userId=${row.userId}`)
      userSkippedCount++
      continue
    }

    const overrideType = row.granted ? 'grant' : 'deny'
    const grantedById  = row.updatedById ?? row.userId
    const reason       = 'Migrated from LetterUserPermission'

    if (target.kind === 'doctype') {
      const actionName = doctypeFieldToActionName(target.field)

      // UserPermissionOverride has no unique constraint in the schema, so we
      // use findFirst + create/update to stay idempotent.
      const existing = await prisma.userPermissionOverride.findFirst({
        where: {
          userId:     row.userId,
          doctypeKey: target.doctypeKey,
          action:     actionName,
          featureKey: null,
        },
      })

      if (existing) {
        await prisma.userPermissionOverride.update({
          where: { id: existing.id },
          data:  { overrideType, reason, grantedById },
        })
      } else {
        await prisma.userPermissionOverride.create({
          data: {
            userId:       row.userId,
            doctypeKey:   target.doctypeKey,
            action:       actionName,
            featureKey:   null,
            overrideType,
            reason,
            grantedById,
            grantedAt:    row.updatedAt,
          },
        })
      }

      console.log(
        `  [USER-DT] userId=${row.userId} perm=${row.permission} → ${target.doctypeKey}.${actionName} ${overrideType}`
      )
    } else {
      // feature key override
      const existing = await prisma.userPermissionOverride.findFirst({
        where: {
          userId:     row.userId,
          featureKey: target.featureKey,
          doctypeKey: null,
        },
      })

      if (existing) {
        await prisma.userPermissionOverride.update({
          where: { id: existing.id },
          data:  { overrideType, reason, grantedById },
        })
      } else {
        await prisma.userPermissionOverride.create({
          data: {
            userId:       row.userId,
            featureKey:   target.featureKey,
            doctypeKey:   null,
            action:       null,
            overrideType,
            reason,
            grantedById,
            grantedAt:    row.updatedAt,
          },
        })
      }

      console.log(
        `  [USER-FT] userId=${row.userId} perm=${row.permission} → feature=${target.featureKey} ${overrideType}`
      )
    }

    userMigratedCount++
  }

  // ── Step 6: Log migration event ──────────────────────────────────────────

  await prisma.activityLog.create({
    data: {
      entityType: 'migration',
      action:     'letter_permissions_migrated',
      actorId:    undefined,
      changes:    undefined,
      metadata:   {
        roleMigratedCount,
        roleSkippedCount,
        userMigratedCount,
        userSkippedCount,
        migratedAt: new Date().toISOString(),
      },
    },
  })

  // ── Step 7: Summary ──────────────────────────────────────────────────────

  console.log('')
  console.log('=== Migration complete ===')
  console.log(
    `Migrated ${roleMigratedCount} LetterRolePermission rows` +
    (roleSkippedCount > 0 ? ` (${roleSkippedCount} skipped)` : '')
  )
  console.log(
    `Migrated ${userMigratedCount} LetterUserPermission rows` +
    (userSkippedCount > 0 ? ` (${userSkippedCount} skipped)` : '')
  )
  console.log('End:', new Date().toISOString())
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
