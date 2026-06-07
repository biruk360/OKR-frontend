-- drop-legacy-permissions.sql
-- Run ONLY after verify-migration.ts passes (exit code 0).
--
-- Usage:
--   psql $DATABASE_URL -f scripts/drop-legacy-permissions.sql
--
-- What this does:
--   Drops letter_role_permissions and letter_user_permissions if they exist.
--   Uses a safe DO block so the script is idempotent and will not fail on
--   a database that has already been cleaned up.

DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'letter_role_permissions'
  ) THEN
    DROP TABLE letter_role_permissions;
    RAISE NOTICE 'Dropped letter_role_permissions';
  ELSE
    RAISE NOTICE 'letter_role_permissions does not exist — skipping';
  END IF;

  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'letter_user_permissions'
  ) THEN
    DROP TABLE letter_user_permissions;
    RAISE NOTICE 'Dropped letter_user_permissions';
  ELSE
    RAISE NOTICE 'letter_user_permissions does not exist — skipping';
  END IF;
END $$;
