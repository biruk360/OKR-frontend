# OKR Period Close — RESUME HERE (session handoff)

> **Read this first, then continue.** This file is the live progress marker for the OKR period-close
> feature. The full plan is in `docs/okr_period_close_IMPLEMENTATION_INSTRUCTIONS.md` (7 phases) and
> the spec is `docs/okr_period_close_and_rollover_requirements.md`. Follow both.

## Current completion marker — 2026-07-20

- Phases 1–7 are implemented and verified against the localhost development app/database.
- `npm run test:okr` has 9 passing tests; TypeScript and `git diff --check` were clean before the final regression.
- Close/retro/commit/423 lock, reopen/re-close scars, Q1→Q2 carried baseline and lineage, report aggregation, department scoping, rendered pages, and PDF export were exercised locally.
- Nothing has been committed or pushed. Production has not been contacted. The unrelated `EvaluationMetricManualActual` schema WIP remains untouched.
- Final gates: `npm run test:okr` (9/9), `npx tsc --noEmit`, `git diff --check`, and `npm run build` all pass. `npm run lint` cannot run non-interactively because this repository has no ESLint configuration and Next.js opens its first-run setup prompt; the production build's built-in type/lint stage passes.
- The temporary local verifier and all test clones, retrospectives, activity/reopen rows, and seed-record mutations were removed; the three seed records were confirmed restored.
- **DO THIS NEXT:** inspect the uncommitted diff with the user. Commit/push only if the user explicitly authorizes it, and exclude the unrelated `EvaluationMetricManualActual` WIP from any OKR commit.

## Current state (as of last session)

- **Branch:** `feature/okr-period-close` — **NOTHING is committed yet.** All work is uncommitted
  working-tree edits (~24 files). Nothing pushed to `origin`. Nothing on production. Do NOT assume
  prior work is saved anywhere but the working tree — verify with `git status` before touching files.
- **Local dev DB** (`localhost:5432/okr_system`) already has the Phase 1 schema pushed. Production DB
  is untouched.
- **Unrelated pre-existing WIP** is also in the tree: a Performance-module `EvaluationMetricManualActual`
  model in `prisma/schema.prisma`. **Do not commit or revert it** — it is not part of this feature.

### Phase 1 — Schema — ✅ DONE & verified locally
- `prisma/schema.prisma`: added closure/lock/reopen/lineage fields to `Objective` + `KeyResult`
  (`closureStatus`, `closedAt`, `outcome`, `finalGrade`, `finalProgress`/`finalValue`, `gradeDelta`,
  `finalConfidence`, `initialConfidence`, `preCloseGoalStatus`/`preCloseConfidence`, `closureNote`,
  `isLocked`, `lockedAt`, `reopenCount`, `lastReopenedAt`, `lastReopenedById`, `rolledFromId`,
  `lineageRootId`, `lineageDepth`, KR `carriedStartValue`) + self-relations `rolledFrom`/`rolledTo` +
  new models `OkrRetrospective`, `OkrReopenLog`. Reused existing `closedBy`/`closedById` and
  `OrganizationSettings.okrReopenWindowDays`.
- `scripts/preflight.sql`: appended idempotent backfill for legacy `goalStatus='CLOSED'` objectives.
- Verified: `prisma validate` clean, `prisma db push` (local) in sync, `prisma generate` clean.

### Phase 2 — Lock guard — ✅ DONE & verified
- `lib/okr/lock-guard.ts`: `objectiveLockResponse(id)` and `keyResultLockResponse(id)` (transitive:
  KR locked if its parent objective is locked). Returns a 423 `apiLocked` response or null.
- `lib/api/apiResponse.ts` + `lib/api/index.ts`: added `apiLocked()` (HTTP 423, code `OKR_LOCKED`).
- `lib/objectiveProgress.ts`: `recalcNodeAndAncestors` now SKIPS locked nodes (frozen progress) but
  still walks to ancestors.
- Guard wired into all 14 mutating routes (verified: 14 files contain `LockResponse(`):
  objectives `[id]` (PUT+DELETE), `archive`, `unarchive`, `complete`, `weights`, `labels`,
  `request-checkin`; keyresults `[id]` (PUT+DELETE), `check-ins`, `archive`, `unarchive`, `complete`,
  `request-checkin`, `todos`. EXEMPT (correct): `comments`, `clone`, `views`.
- `lib/okr/lock-guard.test.ts`: static wiring scan (every mutating route calls a guard; exempt routes
  do not) + `apiLocked` 423 behavioral check.

## Historical Phase 2 verification checklist — ✅ completed

1. Run the lock-guard test:
   `npx tsx --test lib/okr/*.test.ts`
   Expect all tests pass. If a route fails the wiring scan, add the guard to that route.
2. Typecheck the whole app: `npx tsc --noEmit` — must be clean (watch for type errors from the new
   Prisma fields / new imports).
3. Add a `test:okr` script to `package.json`: `"test:okr": "tsx --test lib/okr/*.test.ts"`.
4. Update `docs/CHANGELOG_AI.md` with the Phase 2 entry (files + "tests run" results).
5. Only then mark Phase 2 done.

## Then continue Phases 3 → 7 (see the IMPLEMENTATION_INSTRUCTIONS doc)

- Phase 3: close/initiate routes (grade/outcome → `CLOSING`) + `CloseObjectiveModal`/`CloseKeyResultModal`.
- Phase 4: retrospective + auto-evidence + close/commit (→ `CLOSED` + lock) in one transaction.
- Phase 5: reopen (reason ≥20 chars, `OrganizationSettings.okrReopenWindowDays`, transitive unlock, scar).
- Phase 6: extend clone routes/modals + `carriedStartValue` + lineage + `RolledFromBanner`.
- Phase 7: end-of-period report route/page + "close all my open OKRs" + digest reminders.

## Rules (do not skip)
- Server-side enforcement only (423), never UI-only. Every state change + `recalcNodeAndAncestors`
  in ONE `prisma.$transaction`. Every mutation calls `recordActivity()`. Reuse existing components
  (`Modal`, `ConfirmDialog`, `CloneObjectiveModal`, `CreateCheckInModal`, `CheckInTimeline`,
  `EntityLink`, `TimeframeBadge`, `useTimeframes`, TipTap, `recharts`). Apple-Pro tokens, no hex.
- `prisma db push` LOCALHOST ONLY. Never touch the production VPS DB. Do not commit or push unless
  the user explicitly asks. Keep the Performance-module WIP out of any OKR commit.
- Open-question defaults: reopen unlocks objective only (opt-in for KRs); reopen allowed after
  roll-forward (warn); clone stays ADMIN/EXECUTIVE/DEPARTMENT_LEAD; reopen window from
  `OrganizationSettings` (default 14); single-successor roll-forward only.
