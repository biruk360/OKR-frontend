import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Sprint v2 migration health check (Phase 2).
 *
 * Reports counts ops can use to verify the SprintActivity → Todo migration
 * (in scripts/preflight.sql) completed without gaps.
 *
 * Auth: shared secret via `Authorization: Bearer $CRON_SECRET`.
 *
 * Response shape:
 *   {
 *     success: true,
 *     data: {
 *       totalSprintActivities: <count>,
 *       totalMigrated:         <count from sprint_activity_migration>,
 *       todosWithSprintId:     <count of initiatives with sprintId set>,
 *       unmigrated:            <count of activities not yet migrated and not pre-converted>
 *     }
 *   }
 *
 * Healthy state once Phase 2 has shipped: `unmigrated` should be 0.
 */
export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = request.headers.get('authorization') || ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Use raw queries — `sprint_activity_migration` is not a Prisma model.
  const [activitiesRow, migratedRow, todosWithSprintIdRow, unmigratedRow] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "public"."sprint_activities"',
    ),
    prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "public"."sprint_activity_migration"',
    ),
    prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "public"."initiatives" WHERE "sprintId" IS NOT NULL',
    ),
    prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count
         FROM "public"."sprint_activities" sa
         LEFT JOIN "public"."sprint_activity_migration" m ON m.activity_id = sa.id
        WHERE m.activity_id IS NULL
          AND sa."convertedInitiativeId" IS NULL`,
    ),
  ])

  return NextResponse.json({
    success: true,
    data: {
      totalSprintActivities: Number(activitiesRow[0]?.count ?? 0),
      totalMigrated:         Number(migratedRow[0]?.count ?? 0),
      todosWithSprintId:     Number(todosWithSprintIdRow[0]?.count ?? 0),
      unmigrated:            Number(unmigratedRow[0]?.count ?? 0),
    },
  })
}
