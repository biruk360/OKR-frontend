-- Idempotent preflight run on the VPS before `prisma db push`.
-- Every block is guarded so running this repeatedly is a no-op.
-- Keep changes narrow and reversible.

-- 1. Rename legacy `todos` table to `initiatives` if it hasn't happened yet.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='todos')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='initiatives') THEN
    EXECUTE 'ALTER TABLE "public"."todos" RENAME TO "initiatives"';
  END IF;
END $$;

-- 2. Make initiatives.keyResultId nullable so todos can be standalone.
--    Also drop the NOT NULL constraint idempotently.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='initiatives'
      AND column_name='keyResultId' AND is_nullable='NO'
  ) THEN
    EXECUTE 'ALTER TABLE "public"."initiatives" ALTER COLUMN "keyResultId" DROP NOT NULL';
  END IF;
END $$;

-- 3. Add initiatives.objectiveId with a FK to objectives(id) ON DELETE SET NULL.
--    Nullable on purpose — most todos will have at most one of keyResultId/objectiveId.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='initiatives' AND column_name='objectiveId'
  ) THEN
    EXECUTE 'ALTER TABLE "public"."initiatives" ADD COLUMN "objectiveId" TEXT';
    EXECUTE 'ALTER TABLE "public"."initiatives"
             ADD CONSTRAINT "initiatives_objectiveId_fkey"
             FOREIGN KEY ("objectiveId") REFERENCES "public"."objectives"("id")
             ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

-- 4. Add key_result_check_ins.confidenceScore (Int, default 50) and backfill from
--    the legacy `confidence` string. Doing this in preflight (before `prisma db push`)
--    means existing rows get a meaningful score on the first deploy that ships this column,
--    and `db push` then sees it already in place.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='key_result_check_ins' AND column_name='confidenceScore'
  ) THEN
    EXECUTE 'ALTER TABLE "public"."key_result_check_ins" ADD COLUMN "confidenceScore" INTEGER NOT NULL DEFAULT 50';
    EXECUTE $upd$
      UPDATE "public"."key_result_check_ins"
      SET "confidenceScore" = CASE
        WHEN "confidence" = 'ON_TRACK' THEN 85
        WHEN "confidence" = 'AT_RISK' THEN 55
        WHEN "confidence" = 'OFF_TRACK' THEN 25
        ELSE 50
      END
    $upd$;
  END IF;
END $$;

-- Note: initiative_updates, confidence_snapshots, and user_preferences tables
-- are created automatically by `prisma db push` (new tables, no destructive changes).
-- Only destructive pre-operations (renames, dropping NOT NULL) need explicit preflight.

-- ---------------------------------------------------------------------------
-- Sprint v2 schema additions (Phase 1, 2026-04)
-- Adds new columns/tables for the unified Sprint+Todo model. Idempotent.
-- Runs BEFORE `prisma db push` so push sees nothing to migrate.
-- ---------------------------------------------------------------------------

-- 5. Extend sprints with state/goal/department/reflection columns.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sprints' AND column_name='state') THEN
    EXECUTE 'ALTER TABLE "public"."sprints" ADD COLUMN "state" TEXT NOT NULL DEFAULT ''PLANNING''';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sprints' AND column_name='goal') THEN
    EXECUTE 'ALTER TABLE "public"."sprints" ADD COLUMN "goal" TEXT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sprints' AND column_name='goalLabel') THEN
    EXECUTE 'ALTER TABLE "public"."sprints" ADD COLUMN "goalLabel" TEXT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sprints' AND column_name='goalTarget') THEN
    EXECUTE 'ALTER TABLE "public"."sprints" ADD COLUMN "goalTarget" DOUBLE PRECISION';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sprints' AND column_name='goalCurrent') THEN
    EXECUTE 'ALTER TABLE "public"."sprints" ADD COLUMN "goalCurrent" DOUBLE PRECISION DEFAULT 0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sprints' AND column_name='goalUnit') THEN
    EXECUTE 'ALTER TABLE "public"."sprints" ADD COLUMN "goalUnit" TEXT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sprints' AND column_name='departmentId') THEN
    EXECUTE 'ALTER TABLE "public"."sprints" ADD COLUMN "departmentId" TEXT';
    EXECUTE 'ALTER TABLE "public"."sprints"
             ADD CONSTRAINT "sprints_departmentId_fkey"
             FOREIGN KEY ("departmentId") REFERENCES "public"."departments"("id")
             ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sprints' AND column_name='reflectionNote') THEN
    EXECUTE 'ALTER TABLE "public"."sprints" ADD COLUMN "reflectionNote" TEXT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sprints' AND column_name='endedAt') THEN
    EXECUTE 'ALTER TABLE "public"."sprints" ADD COLUMN "endedAt" TIMESTAMP';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sprints' AND column_name='endedById') THEN
    EXECUTE 'ALTER TABLE "public"."sprints" ADD COLUMN "endedById" TEXT';
    EXECUTE 'ALTER TABLE "public"."sprints"
             ADD CONSTRAINT "sprints_endedById_fkey"
             FOREIGN KEY ("endedById") REFERENCES "public"."users"("id")
             ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

-- 6. Backfill state from legacy status. Safe to run repeatedly — only fills NULL/empty.
UPDATE "public"."sprints" SET "state" = COALESCE(NULLIF("state",''), "status", 'PLANNING')
 WHERE "state" IS NULL OR "state" = '';

-- 7. Indexes on sprints state and departmentId.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='sprints_state_endDate_idx') THEN
    EXECUTE 'CREATE INDEX "sprints_state_endDate_idx" ON "public"."sprints"("state","endDate")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='sprints_departmentId_idx') THEN
    EXECUTE 'CREATE INDEX "sprints_departmentId_idx" ON "public"."sprints"("departmentId")';
  END IF;
END $$;

-- 8. Add sprintId / taskType to initiatives.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='initiatives' AND column_name='sprintId') THEN
    EXECUTE 'ALTER TABLE "public"."initiatives" ADD COLUMN "sprintId" TEXT';
    EXECUTE 'ALTER TABLE "public"."initiatives"
             ADD CONSTRAINT "initiatives_sprintId_fkey"
             FOREIGN KEY ("sprintId") REFERENCES "public"."sprints"("id")
             ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='initiatives' AND column_name='taskType') THEN
    EXECUTE 'ALTER TABLE "public"."initiatives" ADD COLUMN "taskType" TEXT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='initiatives_sprintId_idx') THEN
    EXECUTE 'CREATE INDEX "initiatives_sprintId_idx" ON "public"."initiatives"("sprintId")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='initiatives_taskType_idx') THEN
    EXECUTE 'CREATE INDEX "initiatives_taskType_idx" ON "public"."initiatives"("taskType")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='initiatives_sprintId_status_idx') THEN
    EXECUTE 'CREATE INDEX "initiatives_sprintId_status_idx" ON "public"."initiatives"("sprintId","status")';
  END IF;
END $$;

-- 9. Add sprintId to activity_logs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='activity_logs' AND column_name='sprintId') THEN
    EXECUTE 'ALTER TABLE "public"."activity_logs" ADD COLUMN "sprintId" TEXT';
    EXECUTE 'ALTER TABLE "public"."activity_logs"
             ADD CONSTRAINT "activity_logs_sprintId_fkey"
             FOREIGN KEY ("sprintId") REFERENCES "public"."sprints"("id")
             ON DELETE CASCADE ON UPDATE CASCADE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='activity_logs_sprintId_createdAt_idx') THEN
    EXECUTE 'CREATE INDEX "activity_logs_sprintId_createdAt_idx" ON "public"."activity_logs"("sprintId","createdAt")';
  END IF;
END $$;

-- 10. Create sprint_participants table.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='sprint_participants') THEN
    EXECUTE '
      CREATE TABLE "public"."sprint_participants" (
        "id" TEXT PRIMARY KEY,
        "sprintId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT ''MEMBER'',
        "joinedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "sprint_participants_sprintId_fkey"
          FOREIGN KEY ("sprintId") REFERENCES "public"."sprints"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "sprint_participants_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )';
    EXECUTE 'CREATE UNIQUE INDEX "sprint_participants_sprintId_userId_key" ON "public"."sprint_participants"("sprintId","userId")';
    EXECUTE 'CREATE INDEX "sprint_participants_userId_idx" ON "public"."sprint_participants"("userId")';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Sprint v2 data migration (Phase 2, 2026-04)
-- Migrates rows from `sprint_activities` into `initiatives` (Todo) so the
-- unified Sprint+Todo board (Phase 3) has a single source of truth.
--
-- Key properties:
--   * Idempotent — a tracking table `sprint_activity_migration` records every
--     activity that has been migrated. Re-running this block migrates only
--     activities not yet in the tracking table. Safe to run on every deploy.
--   * Non-destructive — `sprint_activities` rows are NOT deleted or modified.
--     Phase 4 will drop the legacy table after a 2-week soak window.
--   * Activities with a non-null `convertedInitiativeId` link to the existing
--     todo (no duplicate insert) — that initiative just gets `sprintId` set.
--   * Status is derived from the originating SprintColumn name.
--   * Comments are migrated in a second pass after the tracking table is
--     populated, with content+author+createdAt dedup to handle edge cases.
-- ---------------------------------------------------------------------------

-- 11. Ensure pgcrypto is available for gen_random_uuid() used to mint todo ids.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 11. Migration tracking table (source of truth for "already migrated").
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='sprint_activity_migration') THEN
    EXECUTE '
      CREATE TABLE "public"."sprint_activity_migration" (
        "activity_id" TEXT PRIMARY KEY,
        "todo_id"     TEXT NOT NULL,
        "migrated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )';
    EXECUTE 'CREATE INDEX "sprint_activity_migration_todo_id_idx" ON "public"."sprint_activity_migration"("todo_id")';
  END IF;
END $$;

-- 12. Run the migration in a single transactional block. Any insert failure
--     rolls back the entire batch — operators get a clean retry.
DO $$
DECLARE
  linked_count   INTEGER := 0;
  inserted_count INTEGER := 0;
  comment_count  INTEGER := 0;
  total_pending  INTEGER := 0;
BEGIN
  -- Bail out early if the legacy table does not exist (fresh env, nothing to do).
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='sprint_activities') THEN
    RAISE NOTICE 'sprint_activity_migration: sprint_activities table not present, skipping';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO total_pending
    FROM "public"."sprint_activities" sa
    LEFT JOIN "public"."sprint_activity_migration" m ON m.activity_id = sa.id
   WHERE m.activity_id IS NULL;

  -- 12a. Activities already converted into an initiative — link the existing todo
  --      to the sprint (if not already) and record in tracking table.
  WITH already_converted AS (
    SELECT sa.id              AS activity_id,
           sa."convertedInitiativeId" AS todo_id,
           sa."sprintId"       AS sprint_id
      FROM "public"."sprint_activities" sa
      LEFT JOIN "public"."sprint_activity_migration" m ON m.activity_id = sa.id
     WHERE m.activity_id IS NULL
       AND sa."convertedInitiativeId" IS NOT NULL
       AND EXISTS (SELECT 1 FROM "public"."initiatives" i WHERE i.id = sa."convertedInitiativeId")
  ),
  link_sprint AS (
    UPDATE "public"."initiatives" i
       SET "sprintId" = ac.sprint_id
      FROM already_converted ac
     WHERE i.id = ac.todo_id
       AND i."sprintId" IS NULL
    RETURNING i.id
  ),
  track_linked AS (
    INSERT INTO "public"."sprint_activity_migration" (activity_id, todo_id, migrated_at)
    SELECT ac.activity_id, ac.todo_id, NOW() FROM already_converted ac
    ON CONFLICT (activity_id) DO NOTHING
    RETURNING activity_id
  )
  SELECT COUNT(*) INTO linked_count FROM track_linked;

  -- 12b. Activities with no existing initiative — create new Todo rows.
  --      Status is derived from the SprintColumn name. completedAt set when COMPLETED.
  --      Generated id has a 'mig_' prefix so migrated rows are distinguishable from
  --      cuid()-generated ids in case forensic queries are needed later.
  WITH to_create AS (
    SELECT sa.id              AS activity_id,
           sa.title,
           sa.description,
           sa."ownerId",
           sa."sprintId",
           sa."keyResultId",
           sa."objectiveId",
           sa."dueDate",
           sa."createdAt",
           sa."updatedAt",
           CASE
             WHEN lower(sc.name) IN ('done', 'completed', 'finished', 'closed') THEN 'COMPLETED'
             WHEN lower(sc.name) IN ('in progress', 'doing', 'active', 'wip')   THEN 'IN_PROGRESS'
             WHEN lower(sc.name) IN ('cancelled', 'canceled', 'dropped')        THEN 'CANCELLED'
             ELSE 'PENDING'
           END AS derived_status,
           sc.name AS column_name
      FROM "public"."sprint_activities" sa
      LEFT JOIN "public"."sprint_columns" sc ON sc.id = sa."columnId"
      LEFT JOIN "public"."sprint_activity_migration" m ON m.activity_id = sa.id
     WHERE m.activity_id IS NULL
       AND (sa."convertedInitiativeId" IS NULL
            OR NOT EXISTS (SELECT 1 FROM "public"."initiatives" i WHERE i.id = sa."convertedInitiativeId"))
  ),
  with_id AS (
    SELECT activity_id,
           'mig_' || replace(gen_random_uuid()::text, '-', '') AS new_todo_id,
           title, description, "ownerId", "sprintId", "keyResultId", "objectiveId",
           "dueDate", "createdAt", "updatedAt", derived_status
      FROM to_create
  ),
  ins AS (
    INSERT INTO "public"."initiatives" (
      id, title, description, status, priority,
      "assigneeId", "creatorId",
      "keyResultId", "objectiveId",
      "sprintId", "taskType",
      "dueDate", "completedAt",
      "createdAt", "updatedAt"
    )
    SELECT
      w.new_todo_id,
      w.title,
      w.description,
      w.derived_status,
      'MEDIUM',
      w."ownerId",
      w."ownerId",
      w."keyResultId",
      w."objectiveId",
      w."sprintId",
      'GENERAL',
      w."dueDate",
      CASE WHEN w.derived_status = 'COMPLETED' THEN w."updatedAt" ELSE NULL END,
      w."createdAt",
      w."updatedAt"
    FROM with_id w
    RETURNING id
  ),
  track_created AS (
    INSERT INTO "public"."sprint_activity_migration" (activity_id, todo_id, migrated_at)
    SELECT w.activity_id, w.new_todo_id, NOW() FROM with_id w
    ON CONFLICT (activity_id) DO NOTHING
    RETURNING activity_id
  )
  SELECT COUNT(*) INTO inserted_count FROM track_created;

  -- 12c. Migrate sprint_activity_comments → todo_comments via tracking table.
  --      Dedup on (todoId, authorId, content, createdAt) so re-runs don't double-insert.
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='sprint_activity_comments') THEN
    WITH ins_comments AS (
      INSERT INTO "public"."todo_comments" (id, "todoId", "authorId", content, "createdAt", "updatedAt")
      SELECT
        'mig_' || replace(gen_random_uuid()::text, '-', ''),
        m.todo_id,
        sac."authorId",
        sac.content,
        sac."createdAt",
        sac."updatedAt"
      FROM "public"."sprint_activity_comments" sac
      JOIN "public"."sprint_activity_migration" m ON m.activity_id = sac."activityId"
      WHERE sac."authorId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "public"."todo_comments" tc
           WHERE tc."todoId"    = m.todo_id
             AND tc."authorId"  = sac."authorId"
             AND tc.content     = sac.content
             AND tc."createdAt" = sac."createdAt"
        )
      RETURNING id
    )
    SELECT COUNT(*) INTO comment_count FROM ins_comments;
  END IF;

  RAISE NOTICE 'sprint_activity_migration: % pending activities processed, % new todos inserted, % linked to existing initiatives, % comments migrated',
    total_pending, inserted_count, linked_count, comment_count;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 4 cleanup notes (run after 2-week soak; uncomment to drop deprecated tables)
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS sprint_activity_comments CASCADE;
-- DROP TABLE IF EXISTS sprint_activity_tasks CASCADE;
-- DROP TABLE IF EXISTS sprint_activities CASCADE;
-- DROP TABLE IF EXISTS sprint_activity_migration; -- only after confirming no rollback needed
