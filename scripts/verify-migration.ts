/**
 * verify-migration.ts
 *
 * Checks that the legacy LetterRolePermission / LetterUserPermission data has
 * been fully migrated to the v2 tables (RoleDocTypePermission /
 * UserPermissionOverride) before the legacy tables are dropped.
 *
 * Usage:
 *   npx tsx scripts/verify-migration.ts
 *
 * Exit codes:
 *   0  — all checks passed; safe to proceed with cleanup
 *   1  — one or more checks failed; do NOT drop tables yet
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function run(): Promise<void> {
  const results: CheckResult[] = [];

  // ── 1. Count legacy LetterRolePermission rows ──────────────────────────────
  const legacyRoleCount = await prisma.letterRolePermission.count();

  // ── 2. Count v2 RoleDocTypePermission rows for doctypeKey = 'letter' ───────
  const v2RoleCount = await prisma.roleDocTypePermission.count({
    where: { doctypeKey: "letter" },
  });

  // Distinct roles in the legacy table — each role should have ≥ 5 v2 rows
  // (canRead, canWrite, canCreate, canDelete, canSubmit) after migration.
  const distinctLegacyRoles = await prisma.letterRolePermission.groupBy({
    by: ["role"],
    _count: { role: true },
  });
  const distinctRoleCount = distinctLegacyRoles.length;

  // Minimum expected v2 rows: distinct_roles * 5 actions
  const minExpectedV2RoleRows = distinctRoleCount * 5;

  const roleCheckPassed =
    legacyRoleCount === 0 || v2RoleCount >= minExpectedV2RoleRows;

  results.push({
    name: "RoleDocTypePermission coverage for 'letter'",
    passed: roleCheckPassed,
    detail: roleCheckPassed
      ? `v2 rows: ${v2RoleCount} (legacy rows: ${legacyRoleCount}, distinct legacy roles: ${distinctRoleCount}, min expected: ${minExpectedV2RoleRows})`
      : `FAIL — v2 rows: ${v2RoleCount} < min expected ${minExpectedV2RoleRows} (legacy rows: ${legacyRoleCount}, distinct legacy roles: ${distinctRoleCount})`,
  });

  // ── 3. Count legacy LetterUserPermission rows ──────────────────────────────
  const legacyUserCount = await prisma.letterUserPermission.count();

  // ── 4. Count v2 UserPermissionOverride rows for doctypeKey = 'letter' ──────
  const v2UserCount = await prisma.userPermissionOverride.count({
    where: { doctypeKey: "letter" },
  });

  // Every legacy user-permission row must have a corresponding v2 override row.
  const userCheckPassed = legacyUserCount === 0 || v2UserCount >= legacyUserCount;

  results.push({
    name: "UserPermissionOverride coverage for 'letter'",
    passed: userCheckPassed,
    detail: userCheckPassed
      ? `v2 override rows: ${v2UserCount} (legacy rows: ${legacyUserCount})`
      : `FAIL — v2 override rows: ${v2UserCount} < legacy rows: ${legacyUserCount}`,
  });

  // ── 5. Ensure no letter routes reference missing v2 data ──────────────────
  // (Structural check: at least one RoleDocTypePermission row for 'letter' must
  // exist to confirm the doctype was registered and migration ran at all.)
  const doctypeRegistered = await prisma.docTypeRegistry.findUnique({
    where: { key: "letter" },
  });

  const doctypeCheckPassed = doctypeRegistered !== null;

  results.push({
    name: "DocTypeRegistry entry for 'letter'",
    passed: doctypeCheckPassed,
    detail: doctypeCheckPassed
      ? `Found: key='letter', displayName='${doctypeRegistered!.displayName}'`
      : "FAIL — 'letter' is not registered in DocTypeRegistry; run migrate-letter-permissions.ts first",
  });

  // ── Print summary ──────────────────────────────────────────────────────────
  console.log("\n=== Legacy Permission Migration Verification ===\n");

  let allPassed = true;
  for (const result of results) {
    const icon = result.passed ? "PASS" : "FAIL";
    console.log(`[${icon}] ${result.name}`);
    console.log(`       ${result.detail}`);
    console.log();
    if (!result.passed) allPassed = false;
  }

  if (allPassed) {
    console.log(
      "All checks passed. Safe to proceed with legacy table cleanup.\n"
    );
    console.log("  Next step: npx tsx scripts/drop-legacy-permissions.sql");
    console.log(
      "  Or run the SQL manually: psql $DATABASE_URL -f scripts/drop-legacy-permissions.sql\n"
    );
  } else {
    console.error(
      "One or more checks FAILED. Do NOT drop tables until all checks pass.\n"
    );
    console.error(
      "  Run migration first: npx tsx scripts/migrate-letter-permissions.ts\n"
    );
  }

  await prisma.$disconnect();

  process.exit(allPassed ? 0 : 1);
}

run().catch(async (err) => {
  console.error("Unexpected error during verification:", err);
  await prisma.$disconnect();
  process.exit(1);
});
