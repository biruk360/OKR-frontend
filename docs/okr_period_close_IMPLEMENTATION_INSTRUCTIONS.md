# OKR Period Close / Retrospective / Roll-Forward — Implementation Instructions (Agent Handoff)

> **For:** the implementing coding agent (Codex/Claude). **Planner:** Claude.
> **Spec (single source of truth):** [`docs/okr_period_close_and_rollover_requirements.md`](./okr_period_close_and_rollover_requirements.md) — read it fully before writing code.
> **Repo rules (non-negotiable):** [`CLAUDE.md`](../CLAUDE.md) — reuse audit, barrel exports, `withAuth`, response envelope, Apple-Pro tokens, doc updates.

---

## 0. Ground rules (read once, obey always)

1. **Reuse before building.** Before creating any component/hook/type/route, confirm nothing existing satisfies it (see the reuse map in §13 of the spec and `docs/COMPONENT_CATALOG.md`). New code is only allowed for the "justified gaps" listed there.
2. **Server-side enforcement, never UI-only.** The close lock is a server guard (HTTP 423). Hiding a button is not locking.
3. **One transaction per state change.** Freeze + `recalcNodeAndAncestors` run inside a single `prisma.$transaction`.
4. **Every mutation writes `ActivityLog`** via `recordActivity()`.
5. **`closureStatus` is authoritative; `isLocked` is a denormalized mirror.** Never let them disagree.
6. **Do not touch the Performance module.** Grades/retros never feed performance metrics.
7. **Ship in the phase order below.** Do not start a phase until the previous phase's DoD + verification pass. Commit per phase.
8. **After each phase:** update `docs/CHANGELOG_AI.md` (date, summary, files, tests run) and, if relevant, `FEATURE_STATUS.md` / `SITEMAP.md` / `COMPONENT_CATALOG.md` / `MASTER_REFERENCE.md`.

---

## 1. Build order (7 phases — one PR/commit each)

### Phase 1 — Schema + migration + backfill
- Add all fields/models from spec §3: `Objective` + `KeyResult` closure/lock/reopen/lineage columns, `carriedStartValue` on KR, new models `OkrRetrospective` and `OkrReopenLog`, and the named back-relations on `User` (`ObjectiveClosedBy`, `KeyResultClosedBy`).
- **Verified pre-existing:** `OrganizationSettings.okrReopenWindowDays Int @default(14)` **already exists** in the schema (unused). Do NOT re-add it — wire Phase 5 to read it. None of the closure/lineage fields or the two new models exist yet; everything else in §3 is net-new.
- Update `scripts/preflight.sql` for the new columns (CI runs it; deploy uses `prisma db push`).
- Backfill script (`scripts/`): every existing `Objective` with `goalStatus='CLOSED'` → set `closureStatus='CLOSED'`, `closedAt=updatedAt`, `isLocked=true`, `lockedAt=updatedAt`.
- **DoD:** `npx prisma validate` clean; `npx prisma generate` clean; backfill script idempotent (safe to re-run).
- **Verify:** run `prisma generate`, typecheck; run backfill on a dev DB and confirm previously-closed objectives report `isLocked=true`.

### Phase 2 — Lock guard (ship before any close logic)
- Create `lib/okr/lock-guard.ts` exporting `assertNotLocked(entityType: 'objective'|'keyresult'|'checkin', id: string)`. For `checkin`, resolve up to parent KR → parent Objective; if any ancestor `isLocked`, throw. Throw the standard envelope error with HTTP **423**, `{ code: 'OKR_LOCKED', reopenUrl }`.
- Call it at the **top** of every mutating OKR route. **Verified route inventory (classify each):**
  - **BLOCK when locked:** `PUT`+`DELETE /api/objectives/[id]`; `objectives/[id]/archive`, `/unarchive`, `/complete`, `/weights` (PATCH), `/labels` (POST+DELETE), `/request-checkin`; `PUT`+`DELETE /api/keyresults/[id]`; `keyresults/[id]/check-ins` (POST), `/archive`, `/unarchive`, `/complete`, `/request-checkin`, `/todos` (POST — no new work under a frozen KR). Owner/contributor changes flow through the objective `PUT`, so they're covered there.
  - **EXEMPT (allowed on a closed OKR):** `objectives|keyresults/[id]/comments` (discussion is not editing), `/clone` (reads the source, doesn't mutate it), `/views` (per-user view tracking), and all reads/activity endpoints.
  - Note both `objectives/[id]/complete` **and** `keyresults/[id]/complete` exist — cover both.
  - Any bulk endpoint skips locked entities and reports them.
- Make `recalcNodeAndAncestors` skip `isLocked` objectives.
- **DoD + Verify:** ⭐ add an automated test that, for a closed Objective and a closed KR, hits **every** mutating endpoint and asserts **423** on each. This test is the gate for the whole feature — it must stay green.

### Phase 3 — Close flow (Grade → CLOSING)
- Routes: `POST /api/objectives/[id]/close/initiate`, `POST /api/keyresults/[id]/close/initiate`. Guard with `canEditObjective`/`canEditKeyResult`; enforce "timeframe ended OR Admin/Executive". Set `closureStatus='CLOSING'`, capture `outcome`, `finalGrade` (pre-fill `computedProgress/100`), freeze snapshots (`finalProgress`, `finalValue`, `finalConfidence`, `initialConfidence`, `gradeDelta`).
- UI: `CloseObjectiveModal` / `CloseKeyResultModal` (compose `Modal` + `CreateCheckInModal` field/slider patterns). 3 steps: Grade → Reflect (phase 4) → Confirm & Lock. Grade slider pre-filled, 0.05 snap, 0.7 marker; >0.15 divergence → required "why differ" field; `ABANDONED` hides grade + requires reason. Objective close is **blocked** while any child KR is `OPEN`/`CLOSING` (offer the sequenced KR-close flow, spec §4 A2).
- **DoD + Verify:** close an objective end-to-end in the running app (use the `run`/`verify` skills); confirm `CLOSING` set, KRs sequenced, snapshots frozen, and it is still editable in `CLOSING`.

### Phase 4 — Retrospective + auto-evidence + commit (CLOSED + lock)
- Model already exists (Phase 1). Routes: `GET/PUT /api/objectives/[id]/retrospective` (+ KR) editable during `CLOSING`; `POST .../close/commit` requires `whatWasAchieved`, `whatWeLearned`, `recommendedAction`, then sets `CLOSED`, `isLocked=true`, freezes `autoStatsJson`, runs `recalcNodeAndAncestors` in one transaction.
- Auto-evidence: compute from `KeyResultCheckIn` (count, longest gap, curve), `ConfidenceSnapshot` (start→end, flips, days-at-risk), `Todo` (linked count + completion), `ScrumUpdateLink` if present. Rich text via TipTap. Flag check-in gaps >14 days.
- `recommendedAction ∈ {ROLL_FORWARD, ROLL_FORWARD_MODIFIED, SPLIT}` → offer clone (Phase 6) at step 3.
- **DoD + Verify:** commit a close; confirm retro required-field validation, evidence panel renders from real data, record becomes locked (Phase 2 test now covers it), retro immutable after `CLOSED`.

### Phase 5 — Reopen
- Routes: `POST /api/objectives/[id]/reopen` (+ KR). Reason ≥20 chars (server-validated). Owner/manager within 14 days (read window from `OrganizationSettings`, default 14), Admin/Executive any time. Transitive unlock (Objective → its KRs + check-ins). `reopenCount++`, write `OkrReopenLog`, restore `preCloseGoalStatus`/`preCloseConfidence`, `closureStatus='OPEN'`. Notify owner + manager + original closer.
- UI: `ConfirmDialog variant="warning"` + reason textarea; permanent scar (`reopenCount`, reopen log) on the record.
- **DoD + Verify:** reopen a closed OKR, edit a value, re-close; confirm scar persists and window is enforced for non-admins.

### Phase 6 — Clone forward + lineage
- **Extend** `POST /api/objectives/[id]/clone` and `/api/keyresults/[id]/clone` and `CloneObjectiveModal`/`CloneKeyResultModal` — do not fork them. Add: target timeframe defaulting to next period of same `type` (`useTimeframes`); ⭐ **KR `startValue = source.finalValue`, stored as `carriedStartValue`**, `currentValue`=start, progress/confidence reset, check-ins/retro not copied; set `rolledFromId`, `lineageRootId` (inherit or =source), `lineageDepth=source+1`; optional carry of incomplete linked Todos. Preserve the existing 409 duplicate-title guard.
- Provenance UI: new `components/shared/RolledFromBanner.tsx` ("Rolled from previous period · <Timeframe> — reached X%" via `TimeframeBadge`+`EntityLink`) + "View previous period performance" read-only panel (source grade/progress/`CheckInTimeline`/retro); forward link on source; chain list via `lineageRootId`/`rolledFromId`.
- **DoD + Verify:** clone a closed objective into next timeframe; assert carried baseline (e.g. 21/50 → start 21, current 21, 0% progress), lineage links both directions, previous-performance panel opens.

### Phase 7 — End-of-period report + convenience
- Route `GET /api/reports/period-close/[timeframeId]` + thin page `app/dashboard/okrs-all/period-report/[timeframeId]/page.tsx`. Derive on demand (no new model). Sections per spec §10: close progress, outcome donut, grade histogram, avg `gradeDelta`, blocker Pareto, lessons digest, roll-forward status, per-OKR table. Department-scoped for `DEPARTMENT_LEAD`, org-wide for Admin/Executive. Charts via `recharts`. PDF export via the existing puppeteer path.
- `[Close all my open OKRs in <period>]` opens the sequenced close flow over the user's open OKRs. Reminders reuse the existing daily/weekly digest cron.
- **DoD + Verify:** open the report for a timeframe with closed + open OKRs; confirm counts/charts derive only from closure fields, scoping works for a lead, PDF exports.

---

## 2. Definition of Done (applies to every phase)

- [ ] Server guard enforced (not UI-only) wherever a lock/permission applies.
- [ ] `withAuth` + standard response envelope (`{ success, data?, error? }`); no ad-hoc shapes.
- [ ] State change + `recalcNodeAndAncestors` in one `prisma.$transaction`.
- [ ] `recordActivity()` on every mutation (`closure_initiated`, `closed`, `reopened`, `rolled_forward`).
- [ ] Apple-Pro tokens only, `cn()`, no hardcoded hex; skeletons over spinners; Lucide icons.
- [ ] `react-hook-form` for forms; no raw `useState` form state.
- [ ] Features never import other features; import via barrels.
- [ ] Typecheck + lint clean; Phase 2 lock test green.
- [ ] Ran the change in the real app (`run`/`verify` skill), not just tests.
- [ ] Docs updated (`CHANGELOG_AI.md` always; others if relevant).

## 3. Explicitly OUT of scope (v1 — do not build)

Sandbagging/grade-inflation detection & CEO flags · orchestrated `PeriodCloseWorkflow` (announced window / escalating engine / hard period-advance block) · cross-period analytics dashboard · split-into-two roll-forward UI (schema allows it; UI is single-successor). All are v2.

## 4. Open questions — use these defaults unless told otherwise

Q1 reopen unlocks Objective only (opt-in for KRs) · Q2 reopen allowed after roll-forward, with warning · Q3 clone stays ADMIN/EXECUTIVE/DEPARTMENT_LEAD · Q4 reopen window = `OrganizationSettings`, default 14 days · Q5 single-successor roll-forward only.

## 5. Ask-before-proceeding triggers

Stop and ask the human if: a required schema change would be destructive/non-additive; an existing endpoint's response contract must change in a breaking way; or a reuse target named in the spec turns out not to exist (don't silently build a parallel one).
