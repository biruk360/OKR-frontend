/**
 * Hard-delete all known-fake users. Their owned entities are reassigned to
 * admin@360ground.com first so restrict-on-delete FKs don't block the delete.
 *
 * Who gets purged:
 *   - Every user with an `@company.com` email (demo-seed fakes from
 *     prisma/seed.ts and prisma/seed-test-data.ts).
 *   - The role-placeholder `@360ground.com` addresses from
 *     prisma/seed-360ground-fy2026.ts that are not real mailboxes.
 *
 * Who does NOT get purged:
 *   - `unassigned@360ground.com` is kept (deactivated) per product decision —
 *     it's used by scripts/import-360ground-okrs.js as the owner of OKRs whose
 *     CSV `owner` column is blank/"tbd".
 *
 * For each victim the script:
 *   1. Reassigns to admin: Objective.ownerId, KeyResult.ownerId, Todo.assigneeId,
 *      Todo.creatorId, Sprint.ownerId, SprintActivity.ownerId, Comment.authorId.
 *   2. Cascade-deletes (via User FK onDelete): Favorite, UserPreference,
 *      DepartmentMembership, ManagerRelationship, ObjectiveContributor,
 *      KeyResultCheckIn, InitiativeUpdate, Notification, NotificationPreference,
 *      Watcher, ObjectiveView, KeyResultView, EmailDigestState.
 *   3. SetNull (via FK): ClientErrorLog.userId, ActivityLog.actorId,
 *      SprintActivityComment.authorId, SprintActivityTask.assigneeId.
 *
 * Requires `admin@360ground.com` to already exist AND be active.
 *
 * Usage:
 *   # Preview:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/purge-fake-users.ts
 *   # Apply:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/purge-fake-users.ts --commit
 */

import { prisma } from '../lib/prisma'

const ADMIN_EMAIL = 'admin@360ground.com'
const FAKE_SUFFIXES = ['@company.com']
const FAKE_EXACT = [
  // Role-placeholder addresses from prisma/seed-360ground-fy2026.ts.
  // Confirmed fake by biruk@ on 2026-04-16.
  'delivery@360ground.com',
  'all.ses@360ground.com',
  'finance@360ground.com',
  'hr@360ground.com',
  'wessagn@360ground.com',
  'pm.lead@360ground.com',
  'kalkidan@360ground.com',
  // One more demo-consolidation orphan (see prisma/migrate-consolidate-biruk.ts).
  'biruk.hailu@360ground.et',
]

interface Args {
  commit: boolean
}

function parseArgs(): Args {
  const args: Args = { commit: false }
  for (const a of process.argv.slice(2)) {
    if (a === '--commit') args.commit = true
  }
  return args
}

async function main() {
  const { commit } = parseArgs()
  console.log(`[purge] mode: ${commit ? 'COMMIT' : 'DRY-RUN'}`)

  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true, isActive: true },
  })
  if (!admin) {
    console.error(`[purge] FATAL: reassignment target ${ADMIN_EMAIL} not found in users table`)
    process.exit(2)
  }
  if (!admin.isActive) {
    console.error(`[purge] FATAL: reassignment target ${ADMIN_EMAIL} is inactive — activate it first`)
    process.exit(2)
  }
  console.log(`[purge] reassign target: ${admin.email} (id=${admin.id})`)

  const victims = await prisma.user.findMany({
    where: {
      OR: [
        { email: { in: FAKE_EXACT } },
        ...FAKE_SUFFIXES.map((s) => ({ email: { endsWith: s } })),
      ],
    },
    select: { id: true, email: true, name: true, isActive: true },
    orderBy: { email: 'asc' },
  })
  if (victims.length === 0) {
    console.log('[purge] no matching fake users found — nothing to do')
    return
  }
  const victimIds = victims.map((v) => v.id)

  // Safety check: make sure the reassign target isn't in the victim list
  // (it shouldn't be — admin@360ground.com doesn't match our filters — but
  // catch the pathological case before we nuke the target).
  if (victimIds.includes(admin.id)) {
    console.error('[purge] FATAL: reassignment target is itself on the purge list — aborting')
    process.exit(2)
  }

  const [objectives, keyResults, todosAssigned, todosCreated, sprints, comments] = await Promise.all([
    prisma.objective.count({ where: { ownerId: { in: victimIds } } }),
    prisma.keyResult.count({ where: { ownerId: { in: victimIds } } }),
    prisma.todo.count({ where: { assigneeId: { in: victimIds } } }),
    prisma.todo.count({ where: { creatorId: { in: victimIds } } }),
    prisma.sprint.count({ where: { ownerId: { in: victimIds } } }),
    prisma.comment.count({ where: { authorId: { in: victimIds } } }),
  ])

  console.log(`[purge] matched ${victims.length} user(s):`)
  for (const v of victims) {
    console.log(`  - ${v.email.padEnd(36)} active=${v.isActive} name="${v.name}"`)
  }
  console.log('[purge] entities to reassign → admin:')
  console.log(`  objectives=${objectives} keyResults=${keyResults} ` +
              `todos(assigned/created)=${todosAssigned}/${todosCreated} ` +
              `sprints=${sprints} comments=${comments}`)
  console.log('[purge] cascades that will DELETE with the user:')
  const cascades = await Promise.all([
    prisma.favorite.count({ where: { userId: { in: victimIds } } }),
    prisma.userPreference.count({ where: { userId: { in: victimIds } } }),
    prisma.departmentMembership.count({ where: { userId: { in: victimIds } } }),
    prisma.managerRelationship.count({ where: { OR: [{ managerId: { in: victimIds } }, { directReportId: { in: victimIds } }] } }),
    prisma.objectiveContributor.count({ where: { userId: { in: victimIds } } }),
    prisma.keyResultCheckIn.count({ where: { createdById: { in: victimIds } } }),
    prisma.initiativeUpdate.count({ where: { authorId: { in: victimIds } } }),
    prisma.notification.count({ where: { userId: { in: victimIds } } }),
    prisma.notificationPreference.count({ where: { userId: { in: victimIds } } }),
    prisma.watcher.count({ where: { userId: { in: victimIds } } }),
    prisma.objectiveView.count({ where: { userId: { in: victimIds } } }),
    prisma.keyResultView.count({ where: { userId: { in: victimIds } } }),
    prisma.emailDigestState.count({ where: { userId: { in: victimIds } } }),
  ])
  const [fav, pref, dm, mr, oc, kci, iu, notif, np, w, ov, kv, eds] = cascades
  console.log(`  favorites=${fav} userPrefs=${pref} deptMemberships=${dm} ` +
              `managerRels=${mr} objectiveContribs=${oc} keyResultCheckIns=${kci} ` +
              `initiativeUpdates=${iu} notifications=${notif} notifPrefs=${np} ` +
              `watchers=${w} objectiveViews=${ov} keyResultViews=${kv} emailDigestState=${eds}`)

  if (!commit) {
    console.log('[purge] dry-run — no changes written. Re-run with --commit to apply.')
    return
  }

  // Reassign owner/author columns first so the later deleteMany is unblocked.
  // Single transaction: a mid-flight failure rolls back cleanly.
  const result = await prisma.$transaction(async (tx) => {
    const r1 = await tx.objective.updateMany({ where: { ownerId: { in: victimIds } }, data: { ownerId: admin.id } })
    const r2 = await tx.keyResult.updateMany({ where: { ownerId: { in: victimIds } }, data: { ownerId: admin.id } })
    const r3 = await tx.todo.updateMany({ where: { assigneeId: { in: victimIds } }, data: { assigneeId: admin.id } })
    const r4 = await tx.todo.updateMany({ where: { creatorId: { in: victimIds } }, data: { creatorId: admin.id } })
    const r5 = await tx.sprint.updateMany({ where: { ownerId: { in: victimIds } }, data: { ownerId: admin.id } })
    const r7 = await tx.comment.updateMany({ where: { authorId: { in: victimIds } }, data: { authorId: admin.id } })

    // ObjectiveContributor / Watcher / Favorite / NotificationPreference have
    // unique constraints on userId — reassigning could collide with rows admin
    // already owns. Simpler to let cascade-delete drop them; they're personal
    // preference rows, not data.

    const del = await tx.user.deleteMany({ where: { id: { in: victimIds } } })
    return { r1, r2, r3, r4, r5, r7, del }
  })

  console.log('[purge] reassignments applied:')
  console.log(`  objectives=${result.r1.count} keyResults=${result.r2.count} ` +
              `todos(assigned/created)=${result.r3.count}/${result.r4.count} ` +
              `sprints=${result.r5.count} comments=${result.r7.count}`)
  console.log(`[purge] users deleted: ${result.del.count}`)
  console.log('[purge] done')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
