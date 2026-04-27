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
