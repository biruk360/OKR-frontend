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
