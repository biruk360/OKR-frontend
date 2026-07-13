# Project Management Module — Handover to Kimi Code

**You (Kimi Code) are taking over an in-progress build.** This document is your entry point.
Read it fully before writing any code. Do not re-plan or re-architect — the plan is approved and
partially built. Your job is to continue the phase-gated build from **P2** onward.

---

## 1. What this is

A new **Project Management & Delivery Intelligence** module inside an existing Next.js 14 OKR
platform (repo root for the app is `OKR-frontend/`). It adds project scheduling, frozen baselines, an
automatic delay ledger, an Instagantt-parity Gantt, governance registers, a client portal, optional
Jira sync, charts/reports, and OKR/portfolio intelligence.

The build is **phase-gated** (P0→P8). **P0 (groundwork) and P1 (foundation) are DONE and verified.**
You start at **P2 (the delay-ledger core)**, which the spec says must ship before P3 (Gantt).

---

## 2. Read these first, in this order

1. `docs/project_management_module_BUILD_SPEC.md` — **the authoritative spec.** 2,595 lines, 11 epics
   (A–K), full data model, per-feature user stories + acceptance criteria + DoD. Everything you build
   traces to this.
2. `docs/PROJECT_MANAGEMENT_MODULE_TRACKER.md` — **live build status**, one row per feature (req · AC ·
   UI/UX · DoD · status · files). **Update the row for every feature you touch.** Status values:
   `⬜ Not Started` · `🟨 In Progress` · `🟩 Done` · `✅ Verified`.
3. `CLAUDE.md` → section **"Project Management Module — Guardrails"** — the non-negotiable rules,
   including the **10 Critical Invariants**. Also read the top of `CLAUDE.md` (reuse-first, where
   things live, response envelope, after-work doc updates).
4. `docs/CHANGELOG_AI.md` — the two most recent entries (2026-07-13 P1, 2026-07-12 P0) describe exactly
   what already exists.
5. This file's §7 (next task) and §8 (gotchas) — save yourself the mistakes already made.

---

## 3. Current state (what's done vs. what's left)

**Done & verified (do NOT rebuild):**
- **P0 groundwork:** all 30 Prisma models (pushed to DB), `ActivityLog.projectId`, design tokens
  (`project-status-*`), 15 permission DocTypes + role matrix, `PROJECT` notification category + 22
  events, feature skeleton + shared types, and the pure core algorithms with **34 passing unit tests**:
  `lib/projects/{business-days,rollup,confidence,evm}.ts`.
- **P1 foundation:** A1 create-project (wizard + `POST/GET /api/projects` + `lib/projects/service.ts`),
  A2 templates (`lib/projects/templates.ts` + seed + `GET /api/projects/templates`), B1 schedule CRUD
  (all `app/api/projects/[id]/…` routes with **in-transaction rollup**), B2 confidence/EVM +
  `app/api/cron/project-health`. UI: `features/projects/components/{ProjectsListClient,
  ProjectDetailClient,ScheduleTree,CreateProjectWizard,ProjectBadges}.tsx`.

**Remaining (your work), in strict order — see the tracker for the per-feature spec:**
- **P2 — Epic C (delay ledger core) ⭐ START HERE.** C1 commit baseline, C2 re-baseline, C3 approval
  clock, C4 slip attribution, C5 delay ledger table. **Blocks P3.**
- **P3 — Epics D, E, F.** Custom Gantt (install `@tanstack/react-virtual` — the ONE approved new dep),
  6 view toggles, activity detail panel + comments.
- **P4 — Epic H.** RAID, Change Control Board, Stage-Gates, Client Obligations, COE, Payment Milestones.
- **P5 — Epic I.** Client portal (separate NextAuth provider, anonymized serializer + no-name test).
- **P6 — Epic G.** Jira connect/sync/mapping/idle/adoption/scrum.
- **P7 — Epic J.** 24 charts + 10 reports + constrained AI.
- **P8 — Epic K.** OKR link + CEO portfolio + cross-project.
- **Cron:** 5 of 6 remain (approval-clock, client-report, wbr-pack, project-digest, jira-sync); the
  `project-health` one is done as the template to copy.

---

## 4. Environment & commands

- **App lives in `OKR-frontend/`.** Run all commands from there. Stack: Next.js 14 App Router,
  TypeScript, Prisma/PostgreSQL, TanStack Query, Zustand, Tailwind, react-hook-form, recharts, tiptap.
- **DB:** local Postgres via `docker-compose.yml` (`localhost:5432`, db `okr_system`). `.env` /
  `.env.local` already point there. Schema is applied with **`prisma db push` (NOT migrations)** — the
  repo has no migration history by design.
- **Key commands:**
  - `npx prisma db push --skip-generate && npx prisma generate` — after any schema edit.
  - `npm run test:projects` — the module's unit tests (tsx + Node built-in `node:test`, **no test
    framework installed** — keep it that way; write new tests the same way).
  - `npx tsc --noEmit` — must be clean before you consider anything done.
  - `PORT=3939 npm run dev` (background) then curl to smoke-test routes/pages.
  - `npm run db:seed:project-templates`, `npm run db:seed:project-permissions` — idempotent seeds.

---

## 5. Conventions you MUST follow (enforced in review)

- **Reuse first.** Before adding anything, confirm nothing existing covers it. The reuse map is in the
  approved plan and the CHANGELOG P0 entry. Auth = `lib/api/withAuth.ts` (`withAuth`/`withRole`);
  responses = `lib/api/apiResponse.ts` (`apiSuccess`/`apiError`/…); audit = `lib/activity-log.ts`
  (`recordActivity`); notifications = `lib/notifications` (`emit(eventKey, payload)`); UI primitives =
  `components/ui/*` (Modal, ConfirmDialog, EmptyState, StatCard, PageHeader, SideDrawer, Skeleton);
  reference data = `hooks/useUsersForSelection`, `useDepartments`; OKR rollup (for K1) =
  `lib/objectiveProgress.ts` (reuse `recalcNodeAndAncestors`, do NOT duplicate). **Only approved new
  dep: `@tanstack/react-virtual` (P3).**
- **Design system:** Apple-HIG tokens only — `surface-*`/`ink-*`/`primary`/`success`/`warning`/`danger`,
  `rounded-card`/`shadow-card`, `text-page-title`/`text-section-title`/`text-body`/`text-body-sm`,
  `ease-apple` 180ms, Lucide ~1.75px, skeletons over spinners. **No hardcoded hex** — the 6 Gantt status
  colors use the `project-status-*` tokens.
- **Every feature:** thin route → `withAuth`/`withRole` → Zod-validate → `{success,data}` envelope;
  `recordActivity()` on every mutation; rollup (`recalcProjectRollup`) in the **same transaction** as
  the mutation; shared types in `features/projects/types.ts`; export from the barrel; unit-test business
  logic; update the tracker + `CHANGELOG_AI.md` + `MASTER_REFERENCE.md`.
- **The 10 Critical Invariants** (CLAUDE.md) — especially: baseline dates immutable after commit
  (server guard, already partially enforced in the activity route); no baselined date change without
  slip reason+owner (hard gate, already enforced — you add the DelayEvent in C4); approval clock is
  automatic and uses **business days** (`lib/projects/business-days.ts`); client portal serializer must
  make employee names physically absent (with an automated test); internal comments filtered at SQL
  level; AI capped + PM-approved; Jira read-only; module works without Jira.

---

## 6. Where things live (module map)

```
features/projects/
  types.ts                     # enums + slip-reason→owner taxonomy + AI caps (source of truth)
  index.ts                     # barrel — export new components/hooks here
  components/                  # ProjectsListClient, ProjectDetailClient, ScheduleTree, CreateProjectWizard, ProjectBadges
  hooks/                       # useProjects, useProject (TanStack Query patterns to copy)
lib/projects/
  business-days.ts   rollup.ts   confidence.ts   evm.ts     # pure, unit-tested — reuse, don't reimplement
  service.ts         templates.ts   access.ts    health.ts  # create, template instantiation, authz, health recompute
  delay-ledger.ts    # ⚠ NOT created yet — you create it in C3/C4 (onStatusChange state machine)
app/api/projects/…             # route.ts (list/create), [id]/ (detail/patch/delete), [id]/{phases,milestones,activities}/…
app/api/cron/project-health/   # cron template to copy for the other 5
app/dashboard/projects/        # page.tsx (list), [id]/page.tsx (detail), portfolio/ (placeholder)
prisma/schema.prisma           # all 30 models present at the bottom under the module banner
scripts/                       # seed-project-permissions.ts, verify-p1.ts (E2E template used as verify pattern)
```

---

## 7. Your immediate task: P2 (Epic C) — concrete steps

Follow `docs/…BUILD_SPEC.md` §Epic C and the tracker rows C1–C5. Suggested order:

1. **C1 Commit Baseline** — `POST /api/projects/[id]/baseline`: in one txn, copy `current*→baseline*`
   for every Phase/Milestone/Activity, set `baselineCommittedAt`/`baselineVersion=1`, write a
   `BaselineSnapshot` (full JSON). Audit action `BASELINE_COMMITTED` (already in the activity-log union).
   Add a **server-side guard** so no route can write `baseline*` fields except re-baseline (the activity
   PATCH already never writes them — keep it that way). UI: wire the "Commit Baseline" action into the
   existing amber banner in `ProjectDetailClient.tsx` (a `ConfirmDialog` with the activity count).
2. **C2 Re-Baseline** — versioned, reason ≥20 chars, diff preview, **preserve prior snapshots**.
3. **C3 Approval Clock** — create `lib/projects/delay-ledger.ts` with `onStatusChange()`. Wire it into
   the activity PATCH route (`app/api/projects/[id]/activities/[activityId]/route.ts`) where the
   `NOTE (P2)` comment already marks the spot. On `→APPROVAL_REQUESTED`: set `waitingSince`, force
   `ownerParty=CLIENT`, emit `CLIENT_APPROVAL_PENDING`. On `→APPROVED|REJECTED`: compute
   `businessDaysBetween` (reuse `lib/projects/business-days.ts`), create a `DelayEvent`, create an
   `ApprovalSlaBreach` if over SLA. Add cron `app/api/cron/approval-clock` for SLA/+3/+7 escalations
   (copy the `project-health` cron for the CRON_SECRET pattern).
4. **C4 Slip Attribution** — the activity PATCH already **rejects** a baselined date change without
   `slipReason`+`slipOwner` (Invariant #2). Add the DelayEvent creation + `phaseAtTime` capture there,
   and build the reason modal on the client (reason→owner auto-suggest is in
   `features/projects/types.ts::SLIP_REASON_OWNER`). Bar snap-back on cancel is a Gantt concern (P3) —
   for now enforce the gate on the schedule-tree date edit.
5. **C5 Delay Ledger Table** — `GET /api/projects/[id]/delays` with server-computed owner totals;
   `features/projects/components/DelayLedgerTable.tsx` (filter/sort/CSV export). Reuse
   `@tanstack/react-table` (already installed).

Write unit tests for the business-day/SLA/rejection paths (extend `lib/projects/*.test.ts`). Then
verify (see §below), flip the tracker rows to `✅ Verified`, and append a `CHANGELOG_AI.md` entry.

---

## 8. Gotchas already learned (don't repeat these)

- **Shell cwd resets between some tool calls** — always run commands from `OKR-frontend/` explicitly.
- **`diffEntity()` in `lib/activity-log.ts` is hard-coded to OKR field lists** — do NOT use it for
  project entities; build the change map inline (see the project PATCH route for the pattern).
- **`StatCardTone`** values are `blue|green|yellow|red|purple|gray|indigo` — not `success/warning/danger`.
- **`ConfirmDialog` requires a `message` prop** (not just `description`).
- **Dynamic Tailwind classes** like `` `bg-${token}` `` are purged unless safelisted — the
  `project-status-*` and `project-baseline` utilities are already in `tailwind.config.js` `safelist`;
  add any new dynamic class names there too.
- **Notifications:** a new `PROJECT` event's `entityType` must be in `EntityType` in **three** files —
  `lib/notifications/{events.ts (EventPayload),deep-link.ts,redact.ts}` — or `tsc` breaks. `PROJECT` is
  already added; add deep-link paths for genuinely new event keys.
- **No test runner is installed** — use `import { test } from 'node:test'` + `node:assert/strict`, run
  via `npm run test:projects`. Do not add jest/vitest.
- **Pusher:** placeholder creds (`dev-placeholder`/`your-*`/`0`) pass the truthy guard and make every
  mutation await a 400 — if local mutations feel slow, check `lib/pusher.ts` / env.
- **`prisma db push`, never `migrate`.** Production is Postgres on a VPS; there's no migration history.

---

## 9. Definition of done for each phase

Per phase: `tsc --noEmit` clean · `npm run test:projects` green · a throwaway E2E/script or `next dev`
HTTP smoke exercising the real flow (model it on `scripts/verify-p1.ts`) · tracker rows updated to
`✅ Verified` with the Files list · `CHANGELOG_AI.md` + `MASTER_REFERENCE.md` updated. **P5 has a hard
gate:** the client-portal automated test asserting zero employee names in any `/api/portal/*` response
must pass before the portal ships.

Good luck — the foundation is solid and proven. Build on it, don't around it.
```
