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
