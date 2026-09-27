# OKR Core & Permissions — Requirements Traceability (T7)

**Date:** 2026-09-27 · **Mode:** read-only; no code was changed · **Tree:** working tree at `OKR-frontend/`, released to `main` on 2026-09-26.

**Sources traced**

- `docs/okr_period_close_and_rollover_requirements.md` (PC)
- `../docs/permission_management_requirements_v2.md` (PM)
- `../docs/User_Permissions.md` (UP), plus `docs/NOTIFICATIONS.md` §6 (NR6)
- `docs/NOTIFICATIONS.md`, every event and §1/4/5/7/8 (N)
- `docs/REPORTS.md` (RP)
- `../docs/TIMEFRAME_TYPE_FEATURE.md` (TF)
- `../docs/PROJECT_STATUS.md`, OKR functional requirements only (PS)
- `docs/REMEDIATION_PLAN_2026-09-25.md`: every row S1–S8, F1–F7, I1, P1–P2, U1, G6, and the Decisions (R)

**Method**

Each requirement was mapped to code and judged against file:line evidence. The work ran as six parallel read-only tracing passes plus direct checks by T7. The findings behind the top gaps were re-read by T7 before being listed:

- redaction owner bug, `dispatcher.ts:364-366`
- KR `PARENT_OWNER` routing, `dispatcher.ts:151-155`
- `POST /api/keyresults` has no lock guard
- the KR clone target is the same objective
- the objective `children` / `labels` routes have no permission check
- EMPLOYEE can create objectives for another owner (`objectives/route.ts:229`)
- `can()` deny falls through (`rbac.ts:196`)
- `UserRole` is never synced with `User.role`
- `risks/[id]` uses the legacy check
- OKR comments notify 2–3 times
- CI does not run on pushes to `main`

**Status legend**

| Status | Meaning |
|---|---|
| DONE | The requirement is met. |
| PARTIAL | Built, but with a material gap. |
| MISSING | Not built. |
| DEVIATES | Built, but differently from the spec. The difference can be a regression, a looser rule, or a documented decision; the Gap cell says which. |

**Test tags** (inside the Evidence cell)

| Tag | Meaning |
|---|---|
| **T:B** | Behavioural: the test executes the logic. |
| **T:SR** | Source-regex: the test only reads source text or the file tree. |
| **T:–** | No test covers it. |

**Path shorthand**

- Paths are relative to `OKR-frontend/`.
- `obj` = `app/api/objectives`, `kr` = `app/api/keyresults`.
- `idx` = `lib/email/templates/index.ts`, `disp` = `lib/notifications/dispatcher.ts`.

---

## Summary counts

| Source | Rows | DONE | PARTIAL | MISSING | DEVIATES |
|---|---|---|---|---|---|
| Period close & rollover (PC) | 85 | 53 | 24 | 4 | 4 |
| Permission management v2 (PM) | 72 | 31 | 28 | 4 | 9 |
| User_Permissions + NOTIFICATIONS §6 (UP/NR6) | 38 | 16 | 9 | 1 | 12 |
| Notification events (N-EV) | 54 | 18 | 19 | 13 | 4 |
| Notification requirements (N) | 31 | 21 | 2 | 5 | 3 |
| Reports (RP) | 14 | 11 | 1 | 2 | 0 |
| Timeframe type (TF) | 11 | 8 | 2 | 0 | 1 |
| PROJECT_STATUS OKR functions (PS) | 30 | 22 | 7 | 1 | 0 |
| Remediation 2026-09-25 (R) | 121 | 107 | 7 | 1 | 6 |
| **Total** | **456** | **287** | **99** | **31** | **39** |

**Headline findings**

1. **Most remediation claims hold.** 107 of 121 sub-tasks are DONE. Six claims are only partly done, and P1.3 (row cap) is missing:
   - S4.3: `risks/[id]` still uses the legacy check.
   - S5.4: some report POSTs are not audited.
   - S7.3: OKR comments still double-notify; the fix covered to-dos only.
   - F3.9: the status-threshold helper is not used system-wide.
   - F7.4: CI does not run on pushes to `main`.
   - I1.3: four `/api/objectives/[id]/*` routes have no permission check.
   - P1.3: list queries have no row cap.

   Six more were done differently from the plan: S1.8 (session check location), S3.2 (custom sanitizer instead of DOMPurify), S5.5 (enum instead of min length), S7.4 (label POST has no role check), F1.6 and F2.5 (superseded by the consolidation).
2. **The period-close feature is broadly built, but the lock can be bypassed.** Indirect writers, KR create and KR clone can all change a closed OKR (see G1).
3. **The permission-manager tables, APIs and UI exist, but they do not govern OKR actions.** `can()` has no route callers, and deny overrides fall through to the old rules. Permission changes are almost never audited.
4. **Private-OKR redaction is correct in the helpers but leaks through several APIs.** The notification redaction also hides a private OKR's own title from its non-admin owner.

---

## Gaps to fix (prioritised)

Severity: **C** = Critical, **H** = High, **M** = Medium, **L** = Low. Effort: **S** = < ½ day, **M** = 1–3 days, **L** = > 3 days.

| # | Gap | Sev | Effort | Refs |
|---|---|---|---|---|
| G1 | **The period-close lock can be bypassed.** Five writers ignore it: (a) `POST /api/keyresults` creates a KR under a locked objective (`kr/route.ts:115-158`). (b) KR clone writes into the *same* objective with no lock or permission check on the target (`CloneKeyResultModal.tsx:80`, `kr/[id]/clone/route.ts:53-89`). (c) Todo PATCH → `recalcKrFromInitiatives` rewrites a closed KR's value (`lib/objectiveProgress.ts:121-160`). (d) `lib/projects/okr-bridge.ts:27-75` does the same. (e) The confidence crons overwrite locked KRs' confidence and objective `goalStatus` (`lib/confidence-calc.ts:191-201`). | C | M | PC-C1.4, PC-C1.5, PC-E1.10 |
| G2 | **Private OKR data leaks through the APIs.** Endpoints with no check or partial redaction: `obj/[id]/children` (no auth check, returns private titles and descriptions); `obj/[id]/weights` GET; `GET /api/keyresults` (no redaction for DEPARTMENT_LEAD); `GET obj/[id]` redacted branch still returns todos, comments and children; `GET kr/[id]` returns the parent title; `/api/dashboards/me` and the Insights Reports payload. The redaction helpers also copy `finalValue`, `carriedStartValue` and `closureNote` through. | C | M | UP-R.4, RP-5, R-I1.3 |
| G3 | **Missing edit checks.** (a) `obj/[id]/labels` POST/DELETE has no `canEditObjective`: any user can relabel any open objective. (b) An EMPLOYEE can create INDIVIDUAL objectives owned by someone else (`obj/route.ts:229` checks the owner for leads only). (c) `risks/[id]` PATCH/DELETE uses the legacy owner/reporter check with no DELETED check. | H | S | R-I1.3, UP-VII.1, R-S4.3 |
| G4 | **DB permissions cannot restrict OKR actions.** `can()` has no route callers. A deny override or a removed grant falls through to the hardcoded rules (`lib/rbac.ts:196`). Custom roles get nothing on OKR actions. | C | L | PM-FR7, PM-FR6.3 |
| G5 | **`UserRole` is never synced with `User.role`** (users PATCH/POST). A demoted ADMIN keeps the resolver's ADMIN shortcut. New users get a synthetic `legacy-*` role with no rows, so record scoping is not applied to them until the next seed run. | C | S | PM-NFR-2 |
| G6 | **Permission changes are not audited** (FR-11). Only `permissions/reset` (logged under entityType `OBJECTIVE`) and the cleanup cron write ActivityLog. | H | M | PM-FR11 |
| G7 | **The notification redaction bug hides a private OKR from its own owner.** A non-admin owner of a private objective/KR sees `[Private …]` in their own notifications because `entityOwnerId` is only set for USER/TIMEFRAME (`disp:364-366`). The render test uses a copy of the logic and misses it. | H | S | N-5 |
| G8 | **KR notifications never reach the objective owner.** `PARENT_OWNER` resolves to the objective's *parent* owner (`disp:151-155`, `recipients.ts:34-45`). This affects `KR_ADDED_TO_OBJECTIVE`, `KR_PROGRESS_UPDATED`, `KR_AT_RISK`, `KR_COMPLETED` and `KR_ARCHIVED`. | H | S | N-EV |
| G9 | **OKR comments notify 2–3 times and ignore cadence.** Objective/KR comment routes call `fanOutCommentNotifications` (an immediate direct email) *and* `emit(USER_MENTIONED)` *and* `emit(COMMENT_ON_OWNED_ENTITY)`. The to-do path sends `commentSnippet`, but the template reads `snippet`. | M | S | N-7.7, R-S7.3 |
| G10 | **Record scoping and features fail open.** The scope engine returns no filter for `static`/`user_team`, for users with no department, and when `applyScoping` is on but there are no rules (e.g. `key_result`). `canFeature` fails open on error. Role CRUD can be reached through the feature key `page.settings.permissions`. | H | M | PM-FR4.2, PM-NFR-4 |
| G11 | **Sixteen documented events are never emitted, or only emitted on create.** Never: `ACCOUNT_ROLE_CHANGED`, `ACCOUNT_DEACTIVATED`, `OBJECTIVE_VISIBILITY_CHANGED`, `TODO_REASSIGNED_AWAY`, `CHECKIN_WEEKLY_DUE`, `ALIGNMENT_*`, `ADMIN_SECURITY_ALERT`, `ADMIN_BULK_JOB_DONE`, `ACCOUNT_VERIFY_EMAIL`. Create-only: `OBJECTIVE_EDITED`, `OBJECTIVE_ASSIGNED`, `KR_ASSIGNED`. There are no close/reopen events. | M | M | N-EV |
| G12 | **Reminder timing.** The daily digest drains at 04:00 UTC, *before* the todos (05:00), escalation (06:00) and sprint-deadline (09:00) jobs run. So `TODO_DUE_TODAY` arrives after the due date and `CHECKIN_MISSED_14D` about a day late. `TODO_DUE_TOMORROW` and `TODO_OVERDUE` each have two producers, which creates duplicate in-app rows. | M | S | N-EV, N-4.2 |
| G13 | **The 423 lock test only greps source** (`lib/okr/lock-guard.test.ts`). It uses a hand-kept list that misses KR create and KR clone. No route-handler tests exist for close, reopen, clone, the period report, `app/api/permissions/**` or `/api/dashboards/ceo`. | M | M | PC-C1.8, RP-12 |
| G14 | **Role deviations from the User_Permissions matrix need a product decision.** (a) DEPARTMENT_LEAD can edit/archive direct reports' OKRs, and `rbac.test.ts:198` locks this in. (b) EXEC gets timeframe/department/notification-default admin rights, which conflicts between UP and NR6. (c) The timeframes page lets EXEC in, but the API returns 403. (d) A lead's "full view" of their own department vs "owner's manager only". | M | S (decision) + S | UP-V.2, UP-I.3, NR6-8/10 |
| G15 | **Seeded OKR matrix deviates from §6.1.** `key_result`, `key_result_check_in`, `confidence_snapshot` and `objective_contributor` are seeded looser than spec. "Reset to defaults" applies generic flags and grants ADMIN `canDelete` on `activity_log`. | M | S | PM-M6.1, PM-FR2.3 |
| G16 | **Unbounded list queries.** `/api/objectives` has no ceiling on `limit`, and okr-hierarchy/gantt have no `take` when asked for all timeframes. | M | S | R-P1.3 |
| G17 | **Mail that ignores preferences.** `lib/weekly-digest.ts` (scheduled) and `lib/confidence-calc.ts` email all active users with no preference check. Direct writers (comments, letters, travel, automations) respect on/off but always send immediately. | M | S | N-EV (direct senders) |
| G18 | **Period-close v1 features not built:** sequenced KR close walk; lineage history list; reopen-log display; clone labels, contributors and KR subset; clone action at step 3; UI setting for the reopen window; lock banner detail; close/reopen/rollForward doctype actions. | L | L | PC-A2.2, PC-E2.3, PC-DM-5, PC-PERM-6 |
| G19 | **CI does not run on direct pushes to `main`** (`.github/workflows/ci.yml:3-9`); the 2026-09-26 release went this way. The status-threshold helper is not used system-wide (F3). | M | S | R-F7.4, R-F3.9 |

---

## 1. Period close & rollover — `docs/okr_period_close_and_rollover_requirements.md`

The spec's `assertNotLocked()` is implemented as `objectiveLockResponse` / `keyResultLockResponse` in `lib/okr/lock-guard.ts:26-71`.

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| PC-DM-1 | Objective closure/lock/reopen/lineage fields + indexes | DONE | `prisma/schema.prisma:259-281,302-305,319-321` T:– | — |
| PC-DM-2 | KR fields incl. `carriedStartValue`, lineage relation, indexes | DONE | `schema.prisma:357-380,393-410` T:– | — |
| PC-DM-3 | `OkrRetrospective` model | DONE | `schema.prisma:419-445` T:– | Adds `gradeRationale` (not in spec) |
| PC-DM-4 | `OkrReopenLog` model | DONE | `schema.prisma:450-462` T:– | — |
| PC-DM-5 | Reopen window setting (default 14) | PARTIAL | `schema.prisma:216` `okrReopenWindowDays`; read at `obj/[id]/reopen/route.ts:29-30` T:– | Can't be changed: `app/api/admin/org-settings/route.ts:23` doesn't accept it, and there is no UI |
| PC-A1.1 | [Close] only after timeframe end, or Admin/Exec any time | PARTIAL | Server: `obj/[id]/close/initiate:43-45`, `kr/[id]/close/initiate:48-50`. UI: `ObjectiveActionsMenu.tsx:230-234`. T:B helper `lib/okr/period-close.test.ts:36` | UI shows Close to any editor whatever the timeframe; only the server blocks it |
| PC-A1.2 | 3-step xl Modal Grade→Reflect→Confirm | DONE | `components/shared/OkrCloseModal.tsx:134-166` T:– | — |
| PC-A1.3 | Grade prefilled from progress/100, 0.05 snap, 0.7 marker | DONE | `OkrCloseModal.tsx:49,61,151`; `lib/okr/period-close.ts:54` T:B `period-close.test.ts:29-33` | — |
| PC-A1.4 | Grade >0.15 from computed progress requires an explanation (server) | PARTIAL | `period-close.ts:55-58`; obj initiate `:55-56,101-103`; KR initiate `:53-54,84-86` T:B parser | A later retro PUT without `gradeRationale` nulls it (`retrospective-input.ts:94-114`), and commit doesn't re-check |
| PC-A1.5 | ABANDONED: no grade, reason required | DONE | `period-close.ts:42-47`; `OkrCloseModal.tsx:151-153` T:B `period-close.test.ts:18-19` | Reason stored in `closureNote` (≤500) |
| PC-A1.6 | Step-1 panel: confidence start→end + flips, check-in count, longest gap | PARTIAL | Step 1 shows progress only (`OkrCloseModal.tsx:149`); EvidencePanel appears at step 2/3 (`:183`) T:– | No flip count, no confidence start→end, no progress curve |
| PC-A1.7 | Step 1 → CLOSING (not locked) | DONE | obj initiate `:77,86`; KR initiate `:60,70` T:– | — |
| PC-A1.8 | Freeze/derive finalProgress, gradeDelta, finalValue, confidences | DONE | obj initiate `:71-85`; KR initiate `:61-69` T:– | — |
| PC-A2.1 | Objective can't be CLOSED while a KR is OPEN/CLOSING | PARTIAL | obj initiate `:47-52`; obj commit `:22-23` T:– | Only ACTIVE KRs are checked; G1 lets an open KR appear under a closed objective |
| PC-A2.2 | Sequenced per-KR close walk, [Skip for now] | MISSING | `CloseObjectiveModal.tsx` wraps `OkrCloseModal` only; server 409 lists the open KRs T:– | No guided walk |
| PC-A2.3 | KR freeze, parent recompute, freeze — one transaction | DONE | `kr/[id]/close/commit:30-51`; `obj/[id]/close/commit:28-50` T:– | — |
| PC-B1.1 | whatWasAchieved / whatWeLearned / recommendedAction required | DONE | `period-close.ts:97-106`; obj commit `:24-25`; KR commit `:26-27` T:B `lib/okr/evidence.test.ts:10-18` | — |
| PC-B1.2 | TipTap rich text, sanitised | DONE | `OkrCloseModal.tsx:175`; `lib/okr/retrospective-input.ts:51-54,72-80` T:B `retrospective-input.test.ts` | — |
| PC-B1.3 | `primaryBlocker` from the fixed enum | PARTIAL | `retrospective-input.ts:88-92` (regex only) T:B | Not checked against the spec's enum list |
| PC-B2.1 | Evidence from check-ins, ConfidenceSnapshot, Todo, ScrumUpdateLink | DONE | `lib/okr/evidence.ts:5-106` T:– | `daysAtRisk` ≈ snapshots×14 |
| PC-B2.2 | `autoStatsJson` frozen at commit | DONE | obj commit `:29-30`; KR commit `:31-32` T:– | — |
| PC-B2.3 | Check-in gap >14 days flagged | DONE | `evidence.ts:19`; `OkrCloseModal.tsx:183` T:– | — |
| PC-B2.4 | Retro editable while CLOSING, immutable when CLOSED | DONE | `obj/[id]/retrospective` PUT `:31-35`; KR `:28-35` T:– | — |
| PC-B2.5 | ROLL_FORWARD* offers the clone flow at step 3 | PARTIAL | `OkrCloseModal.tsx:166` T:– | Text hint only |
| PC-C1.1 | CLOSED sets isLocked + lockedAt | DONE | obj commit `:38-42`; KR commit `:40-44` T:– | — |
| PC-C1.2 | 423 `OKR_LOCKED` + reopenUrl | DONE | `lib/okr/lock-guard.ts:26-71`; `lib/api/apiResponse.ts:108-110` T:B `lock-guard.test.ts:48-54` | `reopenUrl` sits under `details` |
| PC-C1.3 | Check-in guard walks KR → Objective | DONE | `lock-guard.ts:46-71`; `kr/[id]/check-ins/route.ts:114-115` T:– | — |
| PC-C1.4 | Guard on EVERY mutating OKR route | PARTIAL | Guarded: `obj/[id]` PUT/DELETE, archive, unarchive, complete, weights, labels, request-checkin, retrospective; `kr/[id]` PUT/DELETE, check-ins, archive, unarchive, complete, request-checkin, todos, retrospective. T:SR | **Unguarded:** `POST /api/keyresults` (`kr/route.ts:115-158`); `kr/[id]/clone` target objective; `POST /api/objectives` with a locked parent (minor) |
| PC-C1.5 | Lock blocks indirect writers | MISSING | `app/api/todos/[id]/route.ts:356-377` → `lib/objectiveProgress.ts:121-160`; `lib/projects/okr-bridge.ts:27-75`; `lib/confidence-calc.ts:191-201` (writes `:415,:445,:510,:552`) T:– | A closed KR's value, progress and confidence can still change |
| PC-C1.6 | `recalcNodeAndAncestors` skips locked objectives | DONE | `lib/objectiveProgress.ts:183,192` T:B `objectiveProgress.test.ts:201-213` | — |
| PC-C1.7 | Bulk endpoints skip + report locked items | PARTIAL | No OKR bulk routes; weights PATCH guards only the parent T:– | Weights on an individually closed KR under an open objective are still editable |
| PC-C1.8 | ⭐ Test: every mutating endpoint × closed entity → 423 | DEVIATES | `lib/okr/lock-guard.test.ts:19-79` T:SR | No request is executed; the route list is hand-kept and misses KR create and clone |
| PC-C1.9 | UI removes edit controls when locked | PARTIAL | `ObjectiveActionsMenu.tsx:213-307`; `KeyResultActionsMenu.tsx:188-293`; `app/dashboard/objectives/[id]/page.tsx:84,132` T:– | `WorkItemsKanban` drag still PATCHes todos (`components/shared/WorkItemsKanban.tsx:125-126`) |
| PC-C1.10 | Lock banner: timeframe · outcome · grade · [Reopen][Clone] | PARTIAL | `components/shared/OkrLockBanner.tsx:3-17` T:– | No timeframe, outcome, grade or buttons |
| PC-D1.1 | Reopen reason ≥20 chars (server) | DONE | `period-close.ts:108-113`; obj/KR reopen `:16-17` T:B `period-close.test.ts:22-24` | — |
| PC-D1.2 | reopenCount++, OkrReopenLog row, activity REOPENED | DONE | `obj/[id]/reopen:55-77`; `kr/[id]/reopen:42-52` T:– | — |
| PC-D1.3 | 14-day window for owner/manager; Admin/Exec any time; server-side | PARTIAL | `obj/[id]/reopen:28-37`; `kr/[id]/reopen:26-34`; `period-close.ts:115-119` T:B helper | Enforced, but the window isn't configurable (PC-DM-5) |
| PC-D1.4 | Reopening an objective unlocks its KRs + check-ins | DEVIATES | `obj/[id]/reopen:39-60` (`reopenKeyResults===true`); `OkrReopenDialog.tsx:30` defaults to false T:– | Deliberate (Q1 answered "objective-only + opt-in") |
| PC-D1.5 | Reopen → OPEN, no auto-reclose | DONE | `obj/[id]/reopen:64`; `kr/[id]/reopen:41` T:– | — |
| PC-D1.6 | Reopen count + full log visible | PARTIAL | Count shown in `OkrLockBanner.tsx:13` and `ObjectiveActionsMenu.tsx:224` T:– | `OkrReopenLog` is never read or shown |
| PC-D1.7 | ConfirmDialog warning variant | DONE | `components/shared/OkrReopenDialog.tsx:70-79` T:– | — |
| PC-D1.8 | Notify owner, manager, original closer | DONE | `obj/[id]/reopen:78-83`; `kr/[id]/reopen:53-58` T:– | Reuses `OBJECTIVE_EDITED` / `KR_PROGRESS_UPDATED` (no dedicated event) |
| PC-E1.1 | Extend the existing clone modals/routes | DONE | `CloneObjectiveModal.tsx`, `CloneKeyResultModal.tsx`, both `/clone` routes T:– | — |
| PC-E1.2 | Copy fields, labels, contributors | PARTIAL | `obj/[id]/clone:72-90` T:– | Labels and contributors not copied |
| PC-E1.3 | Timeframe defaults to next period of same type | DONE | `CloneObjectiveModal.tsx:29,46-52` T:– | — |
| PC-E1.4 | Clone all KRs or a subset | PARTIAL | `obj/[id]/clone:59,98` (`includeKeyResults` boolean) T:– | All-or-none |
| PC-E1.5 | ⭐ KR start = previous finalValue → `carriedStartValue` | DONE | `obj/[id]/clone:62-63,101-111`; `kr/[id]/clone:49-50,72-77` T:– | — |
| PC-E1.6 | Target editable in the clone modal | DONE | `CloneObjectiveModal.tsx:172`; `CloneKeyResultModal.tsx:170-183` T:– | — |
| PC-E1.7 | Reset current/progress/confidence | DONE | `obj/[id]/clone:113-115`; `kr/[id]/clone:74-76` T:– | Confidence becomes ON_TRACK, not null |
| PC-E1.8 | No check-in/retro copy; optional carry of incomplete todos | DONE | `obj/[id]/clone:126-147`; `kr/[id]/clone:91-99` T:– | — |
| PC-E1.9 | rolledFromId, lineageRootId, lineageDepth+1 | DONE | `obj/[id]/clone:87-89`; `kr/[id]/clone:82-84` T:– | — |
| PC-E1.10 | KR clone goes to the next period | DEVIATES | `CloneKeyResultModal.tsx:80` sends `objectiveId: keyResult.objectiveId` T:– | Clones into the same objective/period; into a locked objective if it is closed (G1) |
| PC-E1.11 | Conscious baseline reset | DONE | `CloneObjectiveModal.tsx:176-177`; `CloneKeyResultModal.tsx:188` T:– | — |
| PC-E1.12 | Clone entry points: any OKR, close step 3, bulk from report | PARTIAL | `app/dashboard/objectives/[id]/page.tsx:78-83`; `KeyResultActionsMenu.tsx:198-202` T:– | No step-3 action and no bulk clone |
| PC-E1.13 | Duplicate-title 409 kept | DONE | `obj/[id]/clone:52-57`; `kr/[id]/clone:59-64` T:– | — |
| PC-E2.1 | RolledFromBanner + previous-performance panel | DONE | `components/shared/RolledFromBanner.tsx:50-93` T:SR `okr-access-invariants.test.ts:90` | Shows "reached 0%" if the source was cloned before it closed |
| PC-E2.2 | Forward link on the source | DONE | `RolledFromBanner.tsx:59-66` T:– | — |
| PC-E2.3 | Full chain history list | MISSING | `lineageRootId` is never read in the UI T:– | — |
| PC-F.1 | `/complete` becomes a shortcut into close | PARTIAL | `obj/[id]/complete:20-24`; `kr/[id]/complete:25-29`; `OkrCloseModal.tsx:60-61` T:– | KRs not prefilled at target; the objective shortcut returns 409 while any KR is open |
| PC-F.2 | Backfill legacy `goalStatus=CLOSED` | DONE | `scripts/preflight.sql:567-591` T:SR `preflight-sql.test.ts` | Objectives only |
| PC-G.1 | Report page + GET API, built on demand | DONE | `app/dashboard/okrs-all/period-report/[timeframeId]/page.tsx`; `app/api/reports/period-close/[timeframeId]/route.ts`; `lib/okr/period-report.ts:13-104` T:SR | — |
| PC-G.2 | Close-progress header + still-open list with owners | DONE | `period-report.ts:73-79`; `PeriodCloseReportClient.tsx:49` T:– | — |
| PC-G.3 | Outcome donut, grade histogram, avg gradeDelta, blocker Pareto | DONE | `PeriodCloseReportClient.tsx:52-57`; `period-report.ts:49-58,82-83` T:– | — |
| PC-G.4 | Lessons digest grouped by department, linked | PARTIAL | `PeriodCloseReportClient.tsx:59` T:– | Flat list, not grouped |
| PC-G.5 | Roll-forward status | DONE | `period-report.ts:85-89` T:– | — |
| PC-G.6 | Per-OKR table with filters | PARTIAL | `PeriodCloseReportClient.tsx:62` T:– | No filters; objectives only |
| PC-G.7 | Dept-scoped for leads, org-wide for Admin/Exec | PARTIAL | `period-report.ts:14-25` T:– | Uses DepartmentMembership, not `lib/permissions`; no isPrivate/canView filter; EMPLOYEE blocked entirely |
| PC-G.8 | PDF export | PARTIAL | `app/api/reports/period-close/[timeframeId]/pdf/route.ts:12-25` T:– | No charts or blockers; lesson HTML is inserted unescaped (`:18`), mitigated only by write-time sanitisation |
| PC-G.9 | "Close all my open OKRs" | DONE | `PeriodCloseReportClient.tsx:37,63`; `period-report.ts:96-102` T:– | — |
| PC-G.10 | Digest reminder "N OKRs still open — close by …" | PARTIAL | `lib/weekly-digest.ts:186-194,226,331` T:– | Weekly only, no close-by date, link fails for EMPLOYEE |
| PC-API | initiate / commit / reopen / retrospective / report routes | DONE | files under `obj/[id]/{close,reopen,retrospective}`, `kr/[id]/…`, `app/api/reports/period-close/…` T:– | No route tests |
| PC-PERM-1 | Close = canEdit | DONE | obj initiate `:41`; KR initiate `:41-47`; commits T:– | — |
| PC-PERM-2 | Reopen = edit permission + window | DEVIATES | `obj/[id]/reopen:28-37` (owner/manager/Admin/Exec) T:B `objective-permission-flags.test.ts` | A department lead with edit rights can't reopen; UI (`KeyResultActionsMenu.tsx:216`) and server disagree |
| PC-PERM-3 | Retro = check-in permission | DONE | `kr/[id]/retrospective:36` vs check-ins `:121-132` T:– | — |
| PC-PERM-4 | Clone keeps Admin/Exec/Lead guard | DONE | `lib/okr/action-permissions.ts:32-45` T:B `action-permissions.test.ts` | Objective clone doesn't check canView on the source |
| PC-PERM-5 | Register close/reopen/rollForward doctype actions | MISSING | `scripts/seed-permissions.ts:403-418`; `lib/rbac.ts:77-79` T:– | Not registered |
| PC-DoD-1 | Server guard, not UI-only, for every lock | PARTIAL | See PC-C1.4, PC-C1.5 T:SR | — |
| PC-DoD-2 | ActivityLog on close/reopen/clone | DONE | `lib/activity-log.ts:161-164` (CLOSURE_INITIATED/CLOSED/REOPENED/ROLLED_FORWARD) T:– | Written after the tx, best effort |
| PC-DoD-3 | Freeze + recompute in one `$transaction` | DONE | both commit routes T:– | — |
| PC-DoD-4 | Docs updated | DONE | `docs/SITEMAP.md:82`; `docs/COMPONENT_CATALOG.md:33-36` | — |
| PC-Q1 | Q1: reopen objective-only, KRs opt-in | DONE | `obj/[id]/reopen:39`; `OkrReopenDialog.tsx:30` | Contradicts D1's "transitive" wording |
| PC-Q2 | Q2: reopen allowed after roll-forward, with warning | DONE | `OkrReopenDialog.tsx:40-42,86` | — |
| PC-Q3 | Q3: clone stays Admin/Exec/Lead | DONE | `action-permissions.ts:19,32-45` T:B | — |
| PC-Q4 | Q4: window configurable via OrganizationSettings | PARTIAL | `schema.prisma:216` | No API or UI |
| PC-Q5 | Q5: single successor in v1 | DONE | `obj/[id]/clone:45-47`; `kr/[id]/clone:45-47` | — |

---

## 2. Permission management v2 — `../docs/permission_management_requirements_v2.md`

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| PM-1.3a | `can()` public API stable | DONE | `lib/rbac.ts:134` T:B `lib/rbac.test.ts` | Spec's `(action,resource,actor)` form differs from the real `(action, ctx)` shape |
| PM-1.3b | withAuth/withRole signatures stable | DONE | `lib/api/withAuth.ts:41,63-74` T:B `lib/api/api.test.ts` | — |
| PM-1.3c | recordActivity non-breaking | DONE | `lib/activity-log.ts:206-209` T:– | — |
| PM-1.3d | `checkLetterPermission()` API kept | DEVIATES | Old fn `lib/permissions.ts:556-583` (reads legacy tables, unused); new `checkLetterPermissionV2` `lib/letter-permissions.ts:144` T:B+SR `letters-security.test.ts` | Two APIs; the orphan reads tables slated for drop |
| PM-2 | 4 DB-driven layers, additive, cached | PARTIAL | `lib/permission-resolver.ts:138-232` T:B | Layer 1 is not the gate for OKR actions (PM-FR7) |
| PM-3.P1 | Schema add-only | DONE | `schema.prisma:1982-2149`; extra `RoleDocTypeFieldPermission` `:2623-2634` T:– | Scope rules orphan on role delete (polymorphic `targetId`) |
| PM-3.P2 | Letter data migration | DONE | `scripts/migrate-letter-permissions.ts`; `scripts/drop-legacy-permissions.sql` T:– | Legacy models still in schema |
| PM-3.P3 | OKR rules seeded from hardcoded logic | PARTIAL | `scripts/seed-permissions.ts:401-463` T:B subset | Runtime still uses `lib/permissions.ts:48-70` etc.; values deviate (PM-M6.1) |
| PM-3.P4 | rbac refactored to DB + LRU | DEVIATES | `lib/rbac.ts:183-200` hybrid T:B | See PM-FR7 |
| PM-3.P5 | Feature seed; withRole reads FeaturePermission | PARTIAL | `seed-permissions.ts:1041-1075`; `withAuth.ts:63-74` unchanged T:B | withRole not converted |
| PM-3.P6 | Manager UI live; letter Role Matrix retired | PARTIAL | `app/dashboard/settings/permissions/page.tsx`; `LetterPermissionsManagement.tsx:782,818` still live T:– | Legacy matrix writes tables nobody reads; no deprecation notice |
| PM-4 | Data model §4.1–4.8 | DONE | `schema.prisma:1982-2149` (Role, UserRole, RoleProfile, RoleProfileMembership, UserRoleProfile, DocTypeRegistry, DocTypeFieldRegistry, RoleDocTypePermission, RecordScopeRule, FeaturePermission, UserPermissionOverride) T:– | Role delete silently cascades profile memberships |
| PM-FR1.1 | Create custom role (name, key slug, description, colour) | PARTIAL | `app/api/permissions/roles/route.ts:16-55`; UI `ByRoleTab.tsx:60-72,406` T:– | No colour field; not audited; a new role can't be granted from the By Role tab |
| PM-FR1.2 | Clone role incl. perms/features/scope, "(Copy)" | DONE | `roles/[id]/clone/route.ts:28,39-103` ($transaction) T:– | Not audited |
| PM-FR1.3 | Delete non-system role with 0 users; modal listing users | PARTIAL | `roles/[id]/route.ts:99-111` (409 HAS_USERS); `ByRoleTab.tsx:330-345,421` T:– | Counts expired rows; ignores profiles; no user list or "Reassign" CTA |
| PM-FR1.4 | Role profiles | DONE | `profiles/route.ts:41-97`; `profiles/[id]/route.ts:54-164`; resolver union `permission-resolver.ts:83-103`; `UserRolesPanel.tsx:182-216` T:– | Not audited |
| PM-FR2.1 | By Role grid: optimistic + 5 s undo, grey zero rows, level sub-rows | PARTIAL | `ByRoleTab.tsx:293-299,459-465` T:– | No undo toast, no de-emphasis, no L0/L1/L2 sub-rows, no search/module filter |
| PM-FR2.2 | By DocType grid | DONE | `ByDocTypeTab.tsx:116-130,181-192` T:– | — |
| PM-FR2.3 | Reset to defaults per role/doctype, logged | DEVIATES | `roles/[id]/permissions/reset/route.ts:24-97,114-150` T:– | Per role only; generic flags, not the seed matrix; ADMIN reset grants `activity_log` canDelete; logged as entityType `OBJECTIVE` |
| PM-FR2.4 | Export / Import with diff preview | PARTIAL | `export/route.ts:18-76`; `import/route.ts:122-142,386-393` T:– | Diff = id counts only; rows keyed by `roleId` (can't promote across environments); no value validation; not audited |
| PM-FR3 | Field-level editor (levels 0–3, R/W, live preview) | PARTIAL | `FieldLevelsTab.tsx:183-189,259`; `doctypes/[key]/fields/route.ts:82-85,108,134-139` T:– | No live L0-vs-L0+1 preview |
| PM-FR4.1 | 5 implicit scopes seeded as rules | PARTIAL | `seed-permissions.ts:1125-1164` T:B `lib/todos/record-scope-engine.test.ts` | Todo rule → `is_participant` (decided); no `key_result` rules although applyScoping is on |
| PM-FR4.2 | Scope rule UI: CRUD, disable, live record-count preview, AND | PARTIAL | `roles/[id]/scope-rules/route.ts:53-117`; `[ruleId]/route.ts:37-128`; `RecordScopingTab.tsx:135-138,308-331` T:B | Preview shows no record count; API rejects `is_participant` but accepts `static`/`user_team`, which the engine ignores (fail open, `lib/apply-scope.ts:185-186`); not audited |
| PM-FR4.3 | `is_child_of` over the full department tree | PARTIAL | `apply-scope.ts:102-126,173-178` T:– | Depth capped at 5; `Department.parentId` not editable via any API |
| PM-FR5 | Features tab: tree, cascade, sidebar absence | PARTIAL | `FeaturesNavTab.tsx:31-60,227-250`; `lib/dashboard-navigation.ts:103,111-119,140` T:B nav list only | Resolver has no parent→child cascade; hiding letters/dtp/reports/okr doesn't remove sidebar items |
| PM-FR5.1 | withRole reads FeaturePermission | DEVIATES | `withAuth.ts:63-74` (`roles.includes`); additive `withRoleOrFeature` `:89-136` T:B+SR | Not migrated |
| PM-FR6.1 | User Roles tab + effective summary | PARTIAL | `components/settings/UserDetail.tsx:223,515-548` → `UserRolesPanel.tsx`; `app/api/permissions/users/[id]/route.ts:54-117` T:– | Summary includes expired roles, ignores overrides, applyScoping always false |
| PM-FR6.2 | Time-bound grants + daily revoke | DONE | `users/[id]/roles/route.ts:36-46`; `app/api/cron/permission-cleanup/route.ts:17-61` (audited); `install-crontab.sh:166` T:SR | Delete and log not atomic |
| PM-FR6.3 | Overrides: grant/deny, deny absolute, reason ≥10, time-bound | PARTIAL | `users/[id]/overrides/route.ts:80-117`; resolver deny `:168-194` T:– | `can()` acts on true only (`rbac.ts:196`), so a deny never restricts OKR actions; `expiresAt` optional |
| PM-FR6.4 | Admin can't modify own roles/overrides (403) | DONE | `users/[id]/roles/route.ts:23-25`, `roles/[roleId]:25-27`, `overrides:57-59`, `profiles:22-24` T:– | — |
| PM-FR7 | `can()` DB-backed: deny → grant → roles; custom roles; cache | DEVIATES | `rbac.ts:183-200`; no route imports `can` T:B | **OKR permissions can't be restricted from the DB; custom roles get nothing on OKR actions** |
| PM-FR8 | Letter permissions as a thin wrapper over can() | PARTIAL | `lib/letter-permissions.ts:124-173` (over resolver); legacy `app/api/settings/letter-permissions/roles/route.ts` T:B+SR | Letter Types tab not moved; legacy tables and UI still writable |
| PM-FR9 | DTP coordinator via features + can(submit) | PARTIAL | `app/api/dtp/**/approve/route.ts:34-39`; `lib/dtp/permissions.ts:13-16` CSV still used T:B canFeature | assign-driver not migrated; `canFeature` fails open |
| PM-FR10 | Preview-as-user sidebar + "why" explainer | PARTIAL | `EffectivePermissionsPreview.tsx:88,166-253`; `explain/route.ts:162-200`; `ExplainPanel.tsx` T:– | Preview doesn't use the real nav builder; explainer ignores the hardcoded OKR rules, so it can contradict them |
| PM-FR11 | All permission changes → recordActivity with typed entities | MISSING | Only `reset/route.ts:145-150` (wrong type) and the cleanup cron; no recordActivity in roles, clone, permissions, features, scope-rules, users/*, profiles, import T:– | G6 |
| PM-FR11b | Audit Logs "Permissions" tab | DONE | `components/settings/AuditLogsView.tsx:34-51,136-162` T:– | Nearly empty (FR11) |
| PM-API-roles | GET/POST roles; GET/PUT/DELETE roles/[id]; POST clone | DONE | `roles/route.ts:6,16`; `roles/[id]/route.ts:7,26,88`; `clone/route.ts:7` T:– | Gated `withRoleOrFeature(['ADMIN'],'page.settings.permissions')`: a non-admin with that feature can do role CRUD |
| PM-API-perms | GET/PUT role permissions + features | DONE | `roles/[id]/permissions/route.ts:34,71,113`; `features/route.ts:23,47,78` T:– | No permLevel range or activity_log guard; not audited |
| PM-API-scope | scope-rules CRUD | DONE | `scope-rules/route.ts:33,53`; `[ruleId]/route.ts:37,109` T:– | See FR4.2 |
| PM-API-doctypes | GET list, GET [key], PUT fields | DONE | `doctypes/route.ts:36`; `[key]/route.ts:20`; `fields/route.ts:41,108` T:– | — |
| PM-API-profiles | profiles CRUD | DONE | `profiles/route.ts:22,41,70`; `profiles/[id]/route.ts:54,138` T:– | — |
| PM-API-users | user summary, roles, profiles, overrides (8 endpoints) | DONE | `app/api/permissions/users/[id]/**` T:– | Summary bugs (FR6.1) |
| PM-API-misc | me, export, import, preview/[userId] | DONE | `me/route.ts:103`; `export:18`; `import:154`; `preview/[userId]:91` T:– | Extras: explain, field-permissions, reset |
| PM-API-9.2 | Deprecate legacy letter endpoints | MISSING | `app/api/settings/letter-permissions/roles/route.ts:12,45` still live T:– | — |
| PM-API-9.3 | `POST /api/cron/permission-cleanup` daily | DONE | route `:14-73`; `install-crontab.sh:166-167` T:SR `cron-auth.test.ts` | — |
| PM-10.1 | Route + ADMIN-only nav + legacy deprecation notice | PARTIAL | `components/settings/SettingsNav.tsx`; `app/dashboard/settings/letter-permissions/page.tsx:12-18` T:– | No deprecation notice |
| PM-10.2 | 5 tabs | DONE | `components/settings/PermissionManager.tsx:11-25` (+ "permission-check") T:– | — |
| PM-NFR-1 | can() hit ≤1 ms / miss ≤10 ms | PARTIAL | `scripts/benchmark-permissions.ts` (manual) T:– | Not measured in CI |
| PM-NFR-2 | LRU 30 s TTL, invalidate on write | PARTIAL | `lib/permission-cache.ts:6-40`; key `permission-resolver.ts:143` T:B indirect | FIFO not LRU; per process; **`User.role` changes never touch `UserRole` or the cache** (G5) |
| PM-NFR-3 | Bulk saves transactional | DONE | `permissions:113`, `features:78`, `fields:108`, `import:386`, `clone:39` T:– | — |
| PM-NFR-4 | All checks server-side | PARTIAL | `withAuth.ts:69` T:SR `api-invariants.test.ts` | Scope fail-open, canFeature fail-open, feature-gated role CRUD (G10) |
| PM-NFR-5 | 100 % of permission changes audited; append-only | MISSING | See FR11; no `activityLog.delete` in app/lib T:– | Append-only holds; coverage does not |
| PM-NFR-6 | Backward-compatible public APIs | PARTIAL | See 1.3d | — |
| PM-NFR-7 | Add-only migrations; drop only in Phase 6 | DONE | `scripts/drop-legacy-permissions.sql` (separate, manual) T:– | — |
| PM-NFR-8 | Scale to 500 roles / 5k users | PARTIAL | cache cap 10k `permission-cache.ts:6` T:– | Untested; likely cache thrash |
| PM-VR-1 | Role name/key unique, case-insensitive | PARTIAL | `roles/route.ts:29-37` T:– | Name comparison is case-sensitive |
| PM-VR-2 | System roles undeletable | DONE | `roles/[id]/route.ts:99-101` T:– | Returns 400, not 409 |
| PM-VR-3 | Delete guard 409 | DONE | `roles/[id]/route.ts:103-108` T:– | Counts expired rows |
| PM-VR-4 | Override reason ≥10 | DONE | `overrides/route.ts:86` T:– | — |
| PM-VR-5 | expiresAt must be in the future | DONE | `users/[id]/roles/route.ts:43`; `overrides/route.ts:97` T:– | — |
| PM-VR-6 | Self-modification 403 | DONE | See FR6.4 | — |
| PM-VR-7 | DocType key immutable | DONE | `doctypes/[key]/route.ts` GET only; import upserts by key T:– | — |
| PM-VR-8 | permLevel ∈ {0..3} | PARTIAL | `fields/route.ts:82-85` ✓; `permissions/route.ts:93` type-only; import unchecked T:– | — |
| PM-VR-9 | Department cycle prevention | MISSING | `app/api/departments/route.ts:24-39`, `[id]/route.ts:34-50` never accept parentId T:– | Hierarchy is DB-only |
| PM-VR-10 | No canDelete on activity_log (seed + cron) | PARTIAL | `seed-permissions.ts:874-875` readOnly ✓ T:– | Reset grants it to ADMIN; no API/import guard; no cron re-validation |
| PM-M6.1-objective | ADMIN All; EXEC RWCDEP; DL RWCDEP+DEPT; EMP RWC+OWN | PARTIAL | `seed-permissions.ts:403-409` T:B subset | EXEC gets extra Report; enforcement still hardcoded (FR7) |
| PM-M6.1-key_result | EXEC RWCDE; DL RWCDE+DEPT; EMP RWC+OWN | DEVIATES | `seed-permissions.ts:412-418` T:B subset | EXEC gets extra Print/Report, DL extra Print; no KR scope rules |
| PM-M6.1-check_in | EXEC/DL RWCD; EMP RWC; no scoping | DEVIATES | `seed-permissions.ts:421-427` T:– | EXEC gets extra E/Report; DL/EMP scoped |
| PM-M6.1-conf_snapshot | EXEC R E; DL R; EMP R(OWN) | DEVIATES | `seed-permissions.ts:430-436` T:– | DL/EMP get W+C; EXEC has no Export |
| PM-M6.1-timeframe | EXEC RWCD; DL R; EMP R | DONE | `seed-permissions.ts:439-445` T:– | Conflicts with UP (Admin only), see G14 |
| PM-M6.1-label | EXEC RWCD; DL RWC; EMP R | DONE | `seed-permissions.ts:448-454` T:– | — |
| PM-M6.1-contributor | EXEC RWCD; DL RWC; EMP R | DEVIATES | `seed-permissions.ts:457-463` T:– | DL gets extra D; EMP gets extra W+C |

---

## 3. User_Permissions matrix (`../docs/User_Permissions.md`) + NOTIFICATIONS.md §6 RBAC

Doc conflict: User_Permissions has no EXECUTIVE role (the CEO persona is Admin), while NOTIFICATIONS §6 and the code treat EXECUTIVE almost like ADMIN.

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| UP-I.1 | Settings: Admin only | DONE | `lib/permissions.ts:301-303` T:B `rbac.test.ts:149` | EXEC also allowed (not a role in UP) |
| UP-I.2 | Manage users & teams: Admin only | DEVIATES | users API ADMIN only (`app/api/users/route.ts:38`); departments ADMIN+EXEC (`app/api/departments/route.ts:24`); dept HEAD can add members (`departments/[id]/members/route.ts:21`) T:B legacy `can` | `canManageUsers` = ADMIN+EXEC (`permissions.ts:308-310`), so EXEC sees the page and then gets 403 |
| UP-I.3 | Manage timeframes: Admin only | DEVIATES | page ADMIN+EXEC (`app/dashboard/settings/timeframes/page.tsx:15`); API ADMIN or feature `page.settings.timeframes` (`app/api/timeframes/route.ts:24`) T:B helper | UP says Admin, NR6 says Admin+Exec; EXEC sees the page but writes return 403 |
| UP-I.4 | Hierarchy map: full view for all | DONE | `lib/dashboard-navigation.ts:90`; redaction `lib/okr/alignment-map-data.ts:57-62` T:– | Stale seed flag `page.alignment-map` EMPLOYEE:false (unused) |
| UP-II.1 | Create COMPANY: Admin only | DONE | `permissions.ts:48-55`; `obj/route.ts:214` T:B `rbac.test.ts:162` | — |
| UP-II.2 | Edit/delete COMPANY: Admin only | DONE | `permissions.ts:81-83`; `lib/okr/action-permissions.ts:27` T:B | The owner of a company objective can also edit it |
| UP-II.3 | View company objective/KR: full view for all | DEVIATES | `lib/okr/visibility-scope.ts:157-158` T:B `visibility-scope.test.ts:201` | A private COMPANY objective is redacted for non-owners |
| UP-III.1 | Lead creates own-department objectives | PARTIAL | `obj/route.ts:218-227` T:B | Check skipped when `departmentId` is empty; membership query ignores `endedAt` |
| UP-III.2 | Lead edits/deletes own dept; Member can't | PARTIAL | edit `permissions.ts:91-98`; archive `obj/[id]/archive/route.ts:31`; delete owner-only `action-permissions.ts:22-29` T:B | Lead can't hard-delete; ended memberships still grant edit |
| UP-III.3 | Lead: full view of own department | DEVIATES | `visibility-scope.ts:148-159` T:B | Private dept objectives of non-reports are redacted (NR6 says "owner's manager only"): needs a decision |
| UP-IV.1 | Create/edit other departments: Admin only | DONE | `obj/route.ts:218-227`; `permissions.ts:91-98` T:B | — |
| UP-IV.2 | View other dept / other individuals: visibility rule | PARTIAL | rule `visibility-scope.ts:148-171` T:B `visibility-scope.test.ts:251-277` | Rule is right; the APIs leak (UP-R.4) |
| UP-V.1 | Lead creates objectives for direct reports | DONE | `obj/route.ts:229-240` T:– | — |
| UP-V.2 | Lead edits/deletes a report's objectives: **No** | DEVIATES | `permissions.ts:100-110`; KR `:224-261` T:B `rbac.test.ts:198` asserts **true** | The test locks in the deviation |
| UP-V.3 | Lead views reports' OKRs in full | DONE | `visibility-scope.ts:149` T:B | — |
| UP-VI.1 | Own OKRs: create / edit / delete / full view | DONE | `permissions.ts:61-63,86-88`; `action-permissions.ts:28`; `visibility-scope.ts:149,168` T:B | — |
| UP-VII.1 | Create OKRs for other individuals: Lead/Member **No** | DEVIATES | `obj/route.ts:229` checks the owner for DEPARTMENT_LEAD only T:– | **EMPLOYEE can create INDIVIDUAL objectives owned by anyone** |
| UP-VII.2 | Edit/delete other individuals: No | DONE | `permissions.ts:112`; `action-permissions.ts:28` T:B | Except UP-V.2 |
| UP-R.1 | `isPrivate` on Objective and KR, default false | DONE | `schema.prisma:252,354` T:– | — |
| UP-R.2 | Private title → `[Private Objective]` / `[Private Key Result]` | DONE | `permissions.ts:498,517` T:B `rbac.test.ts:220` | Helper level |
| UP-R.3 | Description hidden | DONE | `permissions.ts:499,518` T:B | Helper level |
| UP-R.4 | Raw values hidden in API responses | DEVIATES | helper `permissions.ts:520-523` passes other fields through; `app/api/objectives/[id]/children/route.ts:5-27` (no check); `kr/route.ts:28-33` (no lead redaction); `obj/[id]/route.ts:39-106`; `kr/[id]/route.ts:33-69`; `lib/dashboards/payload.ts:122-205` T:– | G2 |
| UP-R.5 | % progress stays visible | PARTIAL | `permissions.ts:501,524` T:B `visibility-scope.test.ts:335` | EMPLOYEE KR list drops private KRs instead of redacting them (`kr/route.ts:30-32`) |
| UP-R.6 | Own objectives always full | DONE | `visibility-scope.ts:149,168` T:B | — |
| NR6-1 | Create COMPANY: ADMIN, EXEC | DONE | `permissions.ts:48-55` T:B | — |
| NR6-2 | Create DEPARTMENT: ADMIN, EXEC, Lead (own) | PARTIAL | `obj/route.ts:214-227` T:B | Same gaps as UP-III.1 |
| NR6-3 | Create INDIVIDUAL: Employee (own only) | DEVIATES | `obj/route.ts:229` T:– | Same as UP-VII.1 |
| NR6-4 | Edit: Lead dept + own; Employee own | DEVIATES | `permissions.ts:100-110` T:B | Lead can also edit reports' objectives |
| NR6-5 | Archive/delete: Lead dept + own | PARTIAL | `obj/[id]/archive/route.ts:31`; `action-permissions.ts:22-29` T:B | Archive also allows reports; delete owner-only; KR delete excludes EXEC (`kr/[id]/route.ts:243-245`) |
| NR6-6 | See PRIVATE: Lead = owner's manager; Employee = owner | DONE | `visibility-scope.ts:148-150` T:B | Conflicts with UP-III.3 |
| NR6-7 | Manage users: ADMIN only | PARTIAL | `app/api/users/route.ts:11,38`; `users/[id]/route.ts:25,51,159` T:– | Helpers say ADMIN+EXEC (`permissions.ts:308-310`, `rbac.ts:203-205`) |
| NR6-8 | Manage departments: ADMIN only | DEVIATES | `departments/route.ts:24`; `[id]/route.ts:34,58` ADMIN+EXEC; HEAD manages members T:– | — |
| NR6-9 | Manage timeframes: ADMIN+EXEC | DEVIATES | See UP-I.3 T:B helper | API is ADMIN only |
| NR6-10 | Org notification defaults: ADMIN only | DEVIATES | `app/api/settings/notification-defaults/route.ts:7,26` ADMIN+EXEC T:B `rbac.test.ts:248` asserts EXEC true | — |
| NR6-11 | Trigger cron / bulk import: ADMIN | PARTIAL | `app/api/cron/notifications/route.ts:14` (CRON_SECRET only) T:SR | No role-gated admin trigger |
| NR6-12 | Approve alignment: ADMIN, EXEC, Lead (own reports) | MISSING | rule only in `rbac.ts:254-260` (unused); `ALIGNMENT_REQUESTED` never emitted T:B helper | No request/approve route or UI |
| NR6-13 | Comment/mention: all roles | DONE | `obj/[id]/comments/route.ts:26-57`; `lib/okr/comment-access.ts` T:SR `okr-comment-access.test.ts` | — |
| NR6-14 | Watch only visible entities | PARTIAL | `app/api/watchers/route.ts:20-37` T:– | Visibility checked for TODO only, not OBJECTIVE/KR |

---

## 4. Notifications — `docs/NOTIFICATIONS.md`

**Common facts for the event table**

- **Preference gate.** Every `emit`/`emitNow` goes through `getUserPrefsBulk` (`disp:413`) → `resolveEffectivePref` (`lib/notifications/cadence.ts:78-97`). `ACCOUNT` is mandatory; `FORCE_DIGEST_EVENTS` (`disp:40-43`) and `FORCE_IMMEDIATE_EVENTS` (`disp:53-55`) override cadence.
- **Templates.** Every `EVENT_META` key has a dedicated template case in `idx`. The generic fallback is unreachable (T:B `lib/email/templates-render.test.ts`).
- **Cadence.** Every documented default cadence matches `EVENT_META` in `lib/notifications/events.ts:169-280`.
- **Status.** DONE means emitted, templated, correctly categorised, preference-gated and correctly routed.

### 4a. Event matrix (all 99 `EventKey`s; events the doc doesn't list are grouped at the end)

| ID | Requirement (emitted · template · category/cadence · pref-gated) | Status | Evidence | Gap |
|---|---|---|---|---|
| ACCOUNT_INVITE | Invite | DEVIATES | never emitted; sent directly via `lib/email.ts:186` from `app/api/users/route.ts:104`; idx:536; ACCOUNT/IMM | Bypasses the dispatcher: no in-app row (acceptable, mandatory category) |
| ACCOUNT_VERIFY_EMAIL | Verify email | MISSING | never emitted; idx:553 | No verify flow |
| ACCOUNT_PASSWORD_RESET_REQUESTED | Reset requested | DEVIATES | never emitted on purpose; direct `sendPasswordResetEmail` `lib/email.ts:200` from `app/api/auth/forgot-password/route.ts:74`; idx:568 | Plain-text mail, not the template |
| ACCOUNT_PASSWORD_CHANGED | Password changed | DONE | `app/api/auth/reset-password/route.ts:69`; idx:584; ACCOUNT/IMM | — |
| ACCOUNT_ROLE_CHANGED | Role changed | MISSING | never emitted (`app/api/users/[id]/route.ts` PATCH has no emit); idx:598; routing `disp:89` dead | — |
| ACCOUNT_DEACTIVATED | Deactivated | MISSING | never emitted; idx:615 | — |
| OBJECTIVE_ASSIGNED | Assigned | PARTIAL | `obj/route.ts:326` (create only); idx:628; OBJ/IMM; gated | An owner change via PUT emits nothing |
| OBJECTIVE_CREATED_IN_TEAM | Created in team | PARTIAL | `obj/route.ts:334`; idx:649; OBJ/DAILY; gated | Routes to owner/managers/watchers; no TEAM members |
| OBJECTIVE_EDITED | Edited | DEVIATES | only `obj/[id]/reopen/route.ts:79`; idx:662; OBJ/DAILY | A normal edit (PUT) never fires it |
| OBJECTIVE_ARCHIVED | Archived | DONE | `obj/[id]/archive/route.ts:71`; idx:675; OBJ/IMM; gated | — |
| OBJECTIVE_VISIBILITY_CHANGED | Visibility changed | MISSING | never emitted (PUT writes `isPrivate`); idx:689 | — |
| KR_ASSIGNED | KR assigned | PARTIAL | `kr/route.ts:173` (create only); idx:702; KR/IMM; gated | An owner change via PUT emits nothing |
| KR_ADDED_TO_OBJECTIVE | KR added | PARTIAL | `kr/route.ts:181`; idx:720; KR/IMM; gated | **Objective owner not routed** (G8) |
| KR_PROGRESS_UPDATED | Progress | PARTIAL | `kr/[id]/check-ins/route.ts:251`; idx:732; CHECK_IN/DAILY; gated | G8 |
| KR_AT_RISK | At risk | PARTIAL | `check-ins/route.ts:253`; idx:754; KR/IMM; gated | G8 |
| KR_COMPLETED | Completed | PARTIAL | `check-ins/route.ts:256`; idx:773; KR/IMM; gated | G8 |
| KR_ARCHIVED | Archived | PARTIAL | `kr/[id]/archive/route.ts:83`; idx:788; KR/IMM; gated | G8 |
| CHECKIN_WEEKLY_DUE | Weekly due | MISSING | never emitted; idx:801 | No producer job |
| CHECKIN_MISSED_7D | Missed 7 d | PARTIAL | `lib/notifications/jobs.ts:145`; idx:815; CHECK_IN/WEEKLY → forced DAILY | Re-fires daily; uses `updatedAt` as the check-in signal |
| CHECKIN_MISSED_14D | Missed 14 d (escalation) | PARTIAL | `jobs.ts:138`; idx:828; forced DAILY | Escalation lands about 22 h late (G12) |
| TODO_ASSIGNED | Assigned | DONE | `app/api/todos/route.ts:348`; idx:842; TODO/IMM; gated | — |
| TODO_REASSIGNED_AWAY | Reassigned away | MISSING | never emitted; idx:859 | — |
| TODO_DUE_TOMORROW | Due tomorrow | PARTIAL | `jobs.ts:198` + `app/api/cron/sprint-deadlines/route.ts:70`; idx:895; forced DAILY | Two producers; drains on the due date |
| TODO_DUE_TODAY | Due today | DEVIATES | `sprint-deadlines/route.ts:86`; idx:909; forced DAILY | Email lands after the due date; sprint to-dos only |
| TODO_OVERDUE | Overdue | PARTIAL | `jobs.ts:204` + `sprint-deadlines/route.ts:103`; idx:922 | Duplicate producers → duplicate in-app rows |
| TODO_COMPLETED | Completed | DONE | `app/api/todos/[id]/route.ts:399`; idx:935; TODO/DAILY | — |
| SPRINT_TASK_ASSIGNED | Sprint task | DONE | `todos/route.ts:359`; idx:947 | — |
| SPRINT_STARTING_TOMORROW | Sprint starting | DONE | `sprint-deadlines/route.ts:31`; idx:959 | — |
| SPRINT_ENDING_SOON | Sprint ending | DONE | `sprint-deadlines/route.ts:49`; idx:971 | — |
| SPRINT_ENDED_BY_USER | Sprint ended | DONE | `app/api/sprints/[id]/end/route.ts:141`; idx:984 | — |
| INITIATIVE_CARRIED_OVER | Carried over | DONE | `sprints/[id]/end/route.ts:156`; idx:996 | — |
| TIMEFRAME_OPENED | Opened | DONE | `app/api/timeframes/route.ts:68`; idx:1033; TF/IMM | All active users, 5 at a time |
| TIMEFRAME_ENDING_7D | Ending 7 d | PARTIAL | `jobs.ts:229`; idx:1050 | Exact `diffDays===7` match, so a missed cron day skips it |
| TIMEFRAME_CLOSING_1D | Closing 1 d | PARTIAL | `jobs.ts:232`; idx:1062 | Same exact-match issue |
| TIMEFRAME_CLOSED | Closed | DONE | `jobs.ts:235`; idx:1074 | — |
| ALIGNMENT_REQUESTED | Requested | MISSING | never emitted; idx:1088; routing `disp:253` dead | No alignment workflow (NR6-12) |
| ALIGNMENT_DECISION | Decision | MISSING | never emitted; idx:1101 | — |
| OBJECTIVE_ALIGNED_CHILD_ADDED | Child aligned | PARTIAL | `obj/route.ts:342` (create only); idx:1113; ALIGNMENT/IMM | A re-parent via PUT is silent; `isPrivate` comes from the child, so the parent is mis-redacted |
| PARENT_OBJECTIVE_ARCHIVED_ORPHAN | Orphaned | DONE | `obj/[id]/archive/route.ts:84`; idx:1125 | — |
| USER_MENTIONED | Mentioned | PARTIAL | `obj/[id]/comments/route.ts:86`, `kr/[id]/comments:96`, `todos/[id]/comments:170`; idx:1138 | OKR comments also send a direct email (`lib/comments.ts:147`); to-do path drops the snippet (G9) |
| COMMENT_ON_OWNED_ENTITY | Comment on owned | PARTIAL | `obj/[id]/comments/route.ts:94`, `kr/[id]/comments:104`, `todos/[id]/comments:198`; idx:1151 | Owner also gets the direct email → 2–3 notifications |
| ADMIN_USER_CREATED | User created | PARTIAL | `app/api/auth/register/route.ts:73`, `app/api/users/route.ts:105`; idx:1165 | No `departmentId` sent, so the TEAM branch is dead |
| ADMIN_BULK_JOB_DONE | Bulk job | MISSING | never emitted; idx:1182 | — |
| ADMIN_SECURITY_ALERT | Security alert | MISSING | never emitted; idx:1198; not mandatory | See N-8.10 |
| ADMIN_WEEKLY_HEALTH_DIGEST | Weekly health | DONE | `jobs.ts:250`; idx:1210; ADMIN/WEEKLY | Also goes to EXEC (`recipients.ts:57`) |
| ADMIN_MONTHLY_EXEC_SUMMARY | Monthly summary | DONE | `jobs.ts:286`; idx:1232; ADMIN/MONTHLY | Same |
| EV-extra-TODO | TODO_DUE_REMINDER, SPRINT_REOPENED, INITIATIVE_CANCELLED_AT_CLOSE (not in doc) | DONE | `app/api/cron/todo-reminders/route.ts:82`; `sprints/[id]/reopen/route.ts:116`; `sprints/[id]/end/route.ts:171`; idx:875,1008,1020 | Undocumented |
| EV-extra-PERF | PERF_* (6 events) | DONE | `app/api/performance/cycles/[id]/open:33`, `evaluations/[id]/{submit:75,share-draft:30,dispute:44,finalize:41}`, `app/api/cron/performance-nudge:56`; idx:1248-1308 | Undocumented |
| EV-extra-PROJ-ok | 13 PROJECT events emitted (baseline, rebaseline, RAG, went-red, approval pending/SLA, CR approved, RAID, client report, client comment, payment, WBR, daily digest) | DONE | e.g. `app/api/projects/[id]/baseline/route.ts:54`; `lib/projects/health.ts:108,113`; `lib/projects/delay-ledger.ts:240,292`; `lib/projects/project-digest.ts:291`; idx:227-445,1446 | Undocumented; routing is EXPLICIT only |
| EV-extra-PROJ-dead | PROJECT_CREATED, ACTIVITY_BLOCKED, ACTIVITY_OVERDUE, BASELINE_SLIPPED, STAGE_GATE_PENDING/BYPASSED, CHANGE_REQUEST_SUBMITTED, JIRA_SYNC_FAILED, COE_REQUIRED, SCRUM_NOT_LOGGED | MISSING | never emitted; templates idx:216-457 | Dead keys |
| EV-extra-SCRUM-ok | 15 SCRUM events emitted | DONE | `features/scrum/services/scrum-jobs.ts:12,16,40,85,109,167`; `scrum-updates.ts:272,290,306,392`; `blocker-actions.ts:31,93`; `app/api/scrum/updates/[id]/comments:67`, `/celebrate:27` | — |
| EV-extra-SCRUM-dead | SCRUM_NUDGE, SCRUM_UPDATE_AMENDED, SCRUM_COMMENT_ADDED, SCRUM_LOW_SUBMISSION_RATE | MISSING | never emitted; idx:1335,497,1410,1422 | Dead keys |
| EV-extra-OKRCLOSE | OKR close/reopen events | MISSING | `obj|kr/[id]/close/{initiate,commit}` emit nothing; reopen reuses OBJECTIVE_EDITED / KR_PROGRESS_UPDATED | — |
| EV-direct | Direct `sendMail` callers that bypass the dispatcher | PARTIAL | No pref check: `lib/weekly-digest.ts:562` (scheduled), `lib/daily-digest.ts:681`, `lib/confidence-calc.ts:636,688,703`. On/off-gated via `writeDirectNotifications` but always immediate: `lib/comments.ts:147`, `lib/letters-notify.ts:63`, `lib/dtp/notifier.ts:83`, `lib/automations/delivery.ts:113` | G17 |

### 4b. Notification requirements (§1, §4, §5, §7, §8)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| N-1.1 | emit resolves after recipients are resolved; delivery via runAfterResponse | DONE | `disp:341-387,611-635`; `lib/notifications/fanout.ts:125` T:B `fanout.test.ts:41,60,230` | — |
| N-1.2 | DELIVERY_CONCURRENCY 2 / RECIPIENT 5 | DONE | `fanout.ts:30,32` T:B `fanout.test.ts:173,192` | — |
| N-1.3 | Per-key ordering | DONE | `disp:617` T:B `fanout.test.ts:140` | — |
| N-1.4 | One createManyAndReturn + one digest findMany/createMany | DONE | `disp:496,543-572` T:– | — |
| N-1.5 | `emitNow` in crons | DONE | `jobs.ts:11`; sprint-deadlines, scrum-jobs T:B `fanout.test.ts:121` | — |
| N-1.6 | `writeDirectNotifications` applies the same gate | PARTIAL | `lib/notifications/direct.ts:66-137` T:– | Callers ignore the returned cadence and send immediately |
| N-1.7 | `flushBackgroundWork` | DONE | `lib/background.ts:77` T:– | — |
| N-1.8 | Resolution order mandatory → user → org → BATCHED; DISABLED = off | DONE | `cadence.ts:78-97` T:B `preferences.test.ts:23-72` | — |
| N-4.1 | Cron jobs daily/weekly/monthly/escalation/todos/timeframes/admin-* | DONE | `app/api/cron/notifications/route.ts:20-29` T:– | No route test |
| N-4.2 | All jobs scheduled | DONE | `scripts/install-crontab.sh:130-146` T:SR `cron-auth.test.ts:137` | Order problem (G12) |
| N-4.3 | BATCHED drain job | DONE | `job=batch` every 10 min (`install-crontab.sh:130`) T:– | Not in doc §4 |
| N-5 | Owner, owner's managers and ADMIN see full content; others redacted | DEVIATES | `lib/notifications/redact.ts:18-56`; `disp:364-378,446-447` T:B `templates-render.test.ts` (copy of the logic) | **Non-admin owner redacted** (G7); `displayTitle` not gated on `redactable`; EXEC also sees full content |
| N-7.1 | 15 categories on both preference pages | DONE | `events.ts:288-307`; `app/api/notifications/preferences/route.ts:22` T:B `preferences.test.ts:93` | — |
| N-7.2 | SELECTABLE_CADENCES + CADENCE_LABEL drive the UIs | DONE | `cadence.ts:21-37` T:B `preferences.test.ts:82` | — |
| N-7.3 | 400 on unknown cadence/category | DONE | `preferences/route.ts:53-55`; `notification-defaults/route.ts:35-37` T:– | No API test |
| N-7.4 | ACCOUNT forced on/IMMEDIATE | DONE | `cadence.ts:84-86` T:B `preferences.test.ts:66` | — |
| N-7.5 | `ensureOrgDefaults` seeds BATCHED | DONE | `lib/notifications/preferences.ts:60-68`; `schema.prisma:852,869` T:B | — |
| N-7.6 | `notifications-set-batched-defaults.ts` dry-run/apply | DONE | `scripts/notifications-set-batched-defaults.ts:36-92` T:– | — |
| N-7.7 | No second, preference-blind mention email | DEVIATES | to-dos fixed (`app/api/todos/[id]/comments/route.ts:164-187`); OKR comments still double (`lib/comments.ts:147` + emits) T:– | G9 |
| N-7.8 | Org defaults admin-only (§6) | DEVIATES | `notification-defaults/route.ts:7,26` ADMIN+EXEC T:B `rbac.test.ts:248` | — |
| N-8.1 | FORCE_DIGEST coalescing | DONE | `disp:40-43,465-469` T:– | `emailMode` records the preference, not the effective cadence |
| N-8.2 | Queue idempotency | PARTIAL | `disp:540-552` T:– | No unique index; in-app rows not deduped |
| N-8.3 | Digest template | DONE | `lib/email/templates/digest.ts`; `jobs.ts:87` T:B render test | — |
| N-8.4 | Prune job (30 d read / 90 d delete) | DONE | `app/api/cron/prune-notifications/route.ts`; `lib/retention/prune-tables.ts` T:– | Doc still lists it as open |
| N-8.5 | Per-user timezone / quiet hours | MISSING | no `User.timezone` T:– | — |
| N-8.6 | Observability admin page | MISSING | OutboundEmail read only by pruning T:– | — |
| N-8.7 | One-click unsubscribe/snooze | MISSING | "Snooze" links to settings (`idx:811`) T:– | — |
| N-8.8 | Batched sendMail | DONE | `jobs.ts:43,58-60`; `disp:581` T:– | Legacy `daily-digest.ts` sends sequentially |
| N-8.9 | Watcher UI | DONE | `app/api/watchers/route.ts`; `ObjectiveActionsMenu.tsx`, `KeyResultActionsMenu.tsx`, `TodoCardModal.tsx` T:– | No canView check for OKR watches (NR6-14); doc stale |
| N-8.10 | ADMIN_SECURITY_ALERT mandatory | MISSING | `events.ts:310` `MANDATORY_CATEGORIES=['ACCOUNT']`; never emitted T:– | — |
| N-8.11 | `?dryRun=1` on the cron route | MISSING | none found T:– | — |

---

## 5. Reports — `docs/REPORTS.md`

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| RP-1 | Reports page (now `/dashboard/insights?tab=reports`) | DONE | `lib/retired-routes.js:35`; `app/dashboard/insights/page.tsx:113-135` T:B+SR `lib/okr/route-consolidation.test.ts` | REPORTS.md still names `/dashboard/reports/page.tsx` |
| RP-2 | Three modes CEO / Employee / Detailed | DONE | `components/reports/ReportDashboardClient.tsx:354-364,398-452` T:– | Detailed is always shown, not a third segment |
| RP-3 | CEO segment ADMIN/EXEC only | DONE | `ReportDashboardClient.tsx:97-100,354` T:– | — |
| RP-4 | `/api/dashboards/ceo` returns 403 to lower roles | DONE | `app/api/dashboards/ceo/route.ts:10-13` T:– | — |
| RP-5 | `/api/dashboards/me` scoped to the caller | PARTIAL | `app/api/dashboards/me/route.ts:10-12`; `lib/dashboards/payload.ts:109-120` T:– | No private-item redaction (G2) |
| RP-6 | One loader, shared by page + both APIs | DONE | `insights/page.tsx:134-135`; `ceo/route.ts:14`; `me/route.ts:11` T:– | The APIs have no client caller |
| RP-7 | Scope rules: KRs, todos ≤500, filter dictionaries | DONE | `payload.ts:109-120,137,212-215,250-266` T:– | Includes DRAFT KRs |
| RP-8 | Explicit `select` | DONE | `payload.ts:124` T:– | — |
| RP-9 | Sparklines on hero tiles | DONE | `ReportDashboardClient.tsx:446-451` T:– | Current-data shape only |
| RP-10 | Phase-2 employee widgets | DONE | `features/reports/components/EmployeeSuperDashboard.tsx:114-326` T:– | — |
| RP-11 | Phase 3: `dashboard_snapshots`, Send nudge, Pusher `dashboard:ceo` | MISSING | none found T:– | Roadmap item |
| RP-12 | Phase 4: `__tests__/api/dashboards.test.ts` (403s) | MISSING | no `__tests__/`; no test of the ceo route T:– | G13 |
| RP-13 | Phase 4: skeletons, EmptyState, error boundary | DONE | `app/dashboard/insights/loading.tsx`, `error.tsx`; `ReportResultTables.tsx:12,63,140,181` T:– | Bundle budget unverified |
| RP-14 | CSV / PDF export | DONE | `ReportDashboardClient.tsx:330-340,370-384` T:B `components/reports/report-csv.test.ts` | PDF = print |

---

## 6. Timeframe type — `../docs/TIMEFRAME_TYPE_FEATURE.md`

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| TF-1 | `Timeframe.type`, default QUARTERLY | PARTIAL | `schema.prisma:228` T:– | String column, not an enum |
| TF-2 | MONTHLY / QUARTERLY / SIX_MONTH / YEARLY | DONE | `lib/timeframe-utils.ts:5`; `components/settings/TimeframeManagement.tsx:22-26` T:– | — |
| TF-3 | Type selector on create + edit | DONE | `TimeframeManagement.tsx:276-284,349-357` T:– | — |
| TF-4 | Auto start/end dates from type + base date | DONE | `TimeframeManagement.tsx:91-101`; `timeframe-utils.ts:16-63` T:– | — |
| TF-5 | Auto names (month / Qn / Hn / year) | DONE | `timeframe-utils.ts:27-56` T:– | — |
| TF-6 | Changing type recalculates dates | DONE | `TimeframeManagement.tsx:225-231` T:– | — |
| TF-7 | POST validates type | DONE | `app/api/timeframes/route.ts:32-38` T:– | — |
| TF-8 | PATCH validates type | DONE | `app/api/timeframes/[id]/route.ts:13-20` T:– | No date-order, format or unique-name check |
| TF-9 | Type badge across the platform | PARTIAL | `components/shared/TimeframeBadge.tsx` used only in `RolledFromBanner.tsx:54,63`; labels copied inline in `ObjectivesList.tsx:131-134`, `EditObjectiveModal.tsx:183-186`, `CloneObjectiveModal.tsx:123-126`, `KrInspectorTabs.tsx:132-137` T:– | Duplicated logic; recent widget, todo lists and progress page not confirmed |
| TF-10 | Helpers in `lib/timeframe-utils.ts` | DONE | `timeframe-utils.ts:16,68,103,157` T:– | No tests |
| TF-11 | Timeframe management permission | DEVIATES | See UP-I.3 T:B helper | Doc conflict + page/API split |

---

## 7. PROJECT_STATUS.md — OKR functional requirements (historical checklist)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| PS-1 | Objective CRUD at 3 levels | DONE | `obj/route.ts:164-357`; `obj/[id]/route.ts:135,331` T:B `features/objectives/services/create-objective-schema.test.ts` (schema only) | No route tests |
| PS-2 | Alignment / parent validation | DONE | `obj/[id]/route.ts:222-235` (active, same timeframe, cycle); `obj/route.ts:248-259` T:B rollup | — |
| PS-3 | Hierarchy tree | DONE | `app/dashboard/okrs-all/page.tsx:21,33,46` T:– | — |
| PS-4 | KR CRUD with start/target | DONE | `kr/route.ts:90-190`; `kr/[id]/route.ts:79-273` T:– | — |
| PS-5 | Automatic progress calculation | DONE | `lib/objectiveProgress.ts:47,168` T:B `objectiveProgress.test.ts` | — |
| PS-6 | Confidence tracking | DONE | `kr/[id]/check-ins/route.ts:76-85`; `lib/confidence-calc.ts:76` T:B `confidence-calc.test.ts` | — |
| PS-7 | Todos/initiatives under KR | DONE | `kr/[id]/todos/route.ts:21,54` T:– | — |
| PS-8 | KR archive / delete | DONE | `kr/[id]/archive/route.ts:18-50`; `kr/[id]/route.ts:223-249` T:B `rbac.test.ts:183` | — |
| PS-9 | Company dashboard | DONE | CEO mode; `lib/retired-routes.js:22` T:– | — |
| PS-10 | Department dashboard | PARTIAL | `ReportSuperDashboard.tsx:214` (heatmap) T:– | No dedicated team view |
| PS-11 | My OKRs | DONE | `app/dashboard/my-okrs/page.tsx:14-24` T:– | — |
| PS-12 | Progress charts with history | PARTIAL | `lib/okr/insights-data.ts:304-306` T:– | Reports have no snapshot history |
| PS-13 | Pusher live updates | DONE | `lib/pusher.ts:177,201` T:B `lib/okr/realtime.test.ts` | Placeholder credentials on prod (see memory) |
| PS-14 | Comments on objectives/KRs | DONE | `obj/[id]/comments/route.ts:12-55` T:SR | — |
| PS-15 | @mentions | DONE | `lib/comments.ts:20,47` T:B `lib/comments.test.ts` | Duplicate notifications (G9) |
| PS-16 | Comment threading | PARTIAL | `schema.prisma:793` `parentId` T:– | OKR comment POST never sets `parentId` |
| PS-17 | Activity feed | DONE | `lib/okr/activity-feed.server.ts:27-53` T:– | — |
| PS-18 | Email notifications | DONE | `disp:588` T:B `fanout.test.ts` | See §4 gaps |
| PS-19 | In-app notifications | DONE | `app/api/notifications/route.ts:16` T:– | — |
| PS-20 | Notification preferences | DONE | `app/api/notifications/preferences/route.ts:14,42` T:B `preferences.test.ts` | — |
| PS-21 | Notification history | DONE | `app/dashboard/notifications/page.tsx` T:– | — |
| PS-22 | Company / dept / individual / alignment reports | PARTIAL | CEO/Employee modes; alignment map T:– | Department report = heatmap only |
| PS-23 | CSV / PDF export | PARTIAL | `ReportDashboardClient.tsx:330-340,379-384` T:B `report-csv.test.ts` | PDF via `window.print()` |
| PS-24 | Advanced filtering | DONE | `app/dashboard/okrs-all/page.tsx:22,56` (analyze view) T:– | — |
| PS-25 | User admin with bulk operations | PARTIAL | `app/api/users/route.ts:38` T:– | No bulk user operations |
| PS-26 | Department admin with hierarchy | DONE | `app/api/departments/route.ts:24`; `schema.prisma:146-147` T:– | parentId not editable (PM-VR-9) |
| PS-27 | Timeframe admin | DONE | §6 | — |
| PS-28 | OKR templates | MISSING | no OKR template model (Letter/Scorecard/Project templates only) T:– | Clone is the closest thing |
| PS-29 | Bulk operations on objectives | PARTIAL | `app/dashboard/okrs-all/OkrsAllClient.tsx:198-277` (client loop, archive/restore) T:– | No bulk API |
| PS-30 | Audit logs | DONE | `app/dashboard/settings/audit-logs/page.tsx:14`; `obj/route.ts:315-321` T:– | — |

---

## 8. Remediation plan 2026-09-25 — was each claimed fix actually made?

### Wave 1 — Security (S1–S8)

| ID | Claimed fix | Status | Evidence | Gap |
|---|---|---|---|---|
| R-S1.1 | Register ignores body role → EMPLOYEE | DONE | `app/api/auth/register/route.ts:44-49,65` T:B `lib/security/auth-hardening.test.ts:127`, SR `:144` | — |
| R-S1.2 | Role picker removed | DONE | `features/auth/components/SignUpForm.tsx:11-13` T:SR `:155` | — |
| R-S1.3 | New accounts inactive (Decision) | DONE | `register/route.ts:18,66`; `lib/auth.ts:96` T:SR `:144` | — |
| R-S1.4 | Null-password login rejected (NextAuth) | DONE | `lib/auth.ts:88-99,117-124` T:SR `:164` | — |
| R-S1.5 | Null-password login rejected (`/api/auth/login`) | DONE | `app/api/auth/login/route.ts:51` (shared `verifyCredentials`) T:SR `:164` | — |
| R-S1.6 | Crypto reset tokens | DONE | `lib/security/auth-tokens.ts:18-25`; `forgot-password/route.ts:59`; `users/[id]/reset-password/route.ts:25`; `users/route.ts:60` T:B `:95,:102` | — |
| R-S1.7 | `User.passwordChangedAt` | DONE | `schema.prisma:34` T:SR `:175` | Not in `preflight.sql` (relies on `db push`) |
| R-S1.8 | Session invalidation after password change | DEVIATES | `authTime` stamped in the jwt callback; checked in `lib/auth.ts:188-194,234-237` via `isAuthTimeStale` T:B `:113` | `/api/auth/session` still returns a revoked session to the client; every server data path denies it |
| R-S1.9 | Login rate limit | DONE | `lib/security/rate-limit.ts:36-45`; `lib/auth.ts:74-80,97` T:B `:35-86` | In-memory, per process |
| R-S1.10 | Register/forgot rate limit | DONE | `register:39-40`; `forgot-password:34-42` T:SR `:211` | — |
| R-S1.11 | Forgot-password constant response | DONE | `forgot-password/route.ts:44-46` (`runAfterResponse`) T:SR `:203` | — |
| R-S1.12 | Register 409 enumeration | DONE | `register/route.ts:51-56,84-93` T:SR `:144` | — |
| R-S2.1 | Scrum items HTML-escaped | DONE | `features/scrum/services/items.ts:65`; `html.ts:24-26` T:B `html.test.ts` | — |
| R-S2.2 | Stored HTML sanitised + DOMPurify render | DONE | `html.ts:42-56`; `components/shared/RichTextContent.tsx`; `ScrumUpdateCard.tsx:87-91` T:B | Server side uses its own allowlist |
| R-S2.3 | PATCH ownership | DONE | `app/api/scrum/updates/[id]/route.ts:14-20` → `scrum-updates.ts:76-82` T:B `access.test.ts:54` | Route wiring untested |
| R-S2.4 | links / absences / blockers / metrics / comments / prefill / analytics access checks | DONE | `links/route.ts:17,52`; `absences:20-39`; `updates/[id]/blocker:13,22`; `metrics/[userId]:11`; `updates/[id]/comments:19,37`; `updates/route.ts:11-15`; `analytics:11` T:B `access.test.ts` | — |
| R-S2.5 | recordActivity on settings / saved-views / celebrate / links | DONE | `settings/route.ts:28-35`; `saved-views:19,33`; `celebrate:20-25`; `links:32,54` T:– | — |
| R-S2.6 | Scrum settings page RBAC gate | DONE | `app/dashboard/scrum/settings/page.tsx:9-11` T:– | `GET /api/scrum/settings` open to any user (low) |
| R-S3.1 | `?origin` / `?font` injection | DONE | `?origin` removed; font allowlisted (`app/api/letters/[id]/html/route.ts:51-55`) T:B `letters-security.test.ts` | — |
| R-S3.2 | DOMPurify `sanitizeBody` | DEVIATES | Custom allowlist `lib/letter-sanitize.ts` (explains why) T:B | Library differs; protection in place |
| R-S3.3 | iframe sandbox | DONE | `features/letters/components/PdfPreviewPanel.tsx:159`; `LetterTemplatesClient.tsx:328`; CSP sandbox `html/route.ts:29` T:– | — |
| R-S3.4 | Puppeteer request interception | DONE | `lib/letter-pdf-puppeteer.ts:75` T:B | — |
| R-S3.5 | `letter.view_all` → real admin key | DONE | `lib/letter-permissions.ts:111-135` T:B+SR | — |
| R-S3.6 | `letter.read` on GET id/html/pdf/docx/activity | DONE | `lib/letter-access.ts:39` `letterReadGuard` imported by all 5 routes T:SR | — |
| R-S4.1 | Objective page: canViewObjective + DELETED | DONE | `features/objectives/services/objective-detail.server.ts:70,76-82` T:SR `okr-access-invariants.test.ts:29` | — |
| R-S4.2 | Card read gate | DONE | `app/api/todos/[id]/route.ts:59`; `lib/todos/access.ts` T:SR+B | — |
| R-S4.3 | Risks object-level checks | PARTIAL | `app/api/risks/route.ts` ✓; **`risks/[id]/route.ts:10-33` PATCH/DELETE still use admin/reporter/owner** T:SR (`route.ts` only) | Reporter keeps edit rights after losing access; no DELETED check |
| R-S4.4 | Retrospective stored XSS (route) | DONE | `lib/okr/retrospective-input.ts:16,51-53,79` T:B+SR | — |
| R-S4.5 | RolledFromBanner / PeriodCloseReportClient via DOMPurify | DONE | `components/shared/RolledFromBanner.tsx:35-38,91-92`; `PeriodCloseReportClient.tsx:59` T:SR `:90` | PDF route inserts lessons raw (PC-G.8) |
| R-S5.1 | Portal comment redaction | DONE | `features/projects/services/portal-serializer.ts:487-499,758-769` T:B `portal-serializer.test.ts` | — |
| R-S5.2 | Portal signin callbackUrl | DONE | `lib/portal-callback-url.ts`; `app/portal/signin/page.tsx:42` T:B `redirect-safety.test.ts:79-114` | — |
| R-S5.3 | Uploads out of `public/` | DONE | `lib/attachments/project-storage.ts:33`; `middleware.ts:18-28,64-77` T:B `project-upload.test.ts` | Middleware blocks only the two legacy roots |
| R-S5.4 | Audit entries (Invariant #10) | PARTIAL | snapshots, reports, ai-assistant audited T:SR `portal-route-guards.test.ts:96` | management-reports, performance-reports and portfolio report POST not audited |
| R-S5.5 | Slip reason min length | DEVIATES | `z.enum(SLIP_REASONS)` (`activities/[activityId]/route.ts:52`, `activities/schedule/route.ts:19`) T:B+SR | Enum instead of length; stronger, but `slipDetail` has no minimum |
| R-S5.6 | Portal attachment CLIENT_VISIBLE filter | DONE | `app/api/portal/projects/[id]/activities/[activityId]/attachments/[attachmentId]/route.ts` uses `portalActivityAttachmentWhere` T:SR `project-upload.test.ts` | — |
| R-S6.1 | Cron auth fail-closed / header-only / timing-safe / ≥16 chars | DONE | `lib/cron-auth.ts` T:B `cron-auth.test.ts:25-96` | — |
| R-S6.2 | Every cron route uses it | DONE | all 30 `app/api/cron/*/route.ts` (T7 grep) T:SR `cron-auth.test.ts:115,128` | — |
| R-S6.3 | `withFeature` deny on error | DONE | `lib/api/withAuth.ts:97-104,123-130` T:SR `platform-hardening.test.ts:24` | `canFeature` in rbac still fails open (PM-FR9) |
| R-S6.4 | Integrations ADMIN-only + masked | DONE | `app/api/settings/integrations/route.ts:9-43` T:SR | Audit is `console.info` only |
| R-S6.5 | Telegram allowlist + rate limit + timing-safe secret | DONE | `lib/telegram/access.ts:22-118`; webhook `:133` T:B `platform-hardening.test.ts:52-88` | In-memory limiter |
| R-S6.6 | CSP + security headers | DONE | `next.config.js:15-97` T:B `platform-hardening.test.ts:117,143` | No HSTS header (maybe set in nginx) |
| R-S6.7 | Image `remotePatterns` restricted | DONE | `next.config.js:111,115` T:SR `:152` | — |
| R-S7.1 | BATCHED cadence honoured | DONE | `schema.prisma:852,869`; `cadence.ts:21-37`; `install-crontab.sh:130` T:B `preferences.test.ts` | — |
| R-S7.2 | 15 categories on preferences page | DONE | `events.ts:288-307` T:B | — |
| R-S7.3 | No double mention email | PARTIAL | to-do comments fixed (`app/api/todos/[id]/comments/route.ts:164-187`) T:– | **OKR comments still double/triple-notify** (G9) |
| R-S7.4 | Label POST role check + audit | DEVIATES | audit ✓ (`app/api/todo-labels/route.ts:28-33`); POST is `withAuth` only (comment CDM-9) T:SR wrapper only | Role check not done (deliberate per code comment) |
| R-S7.5 | Label delete hidden for non-admins | DONE | `components/todos/CardPickers.tsx:97-98`; API `todo-labels/[id]/route.ts:46` T:– | — |
| R-S8 | Next ≥14.2.25 | DONE | `package.json:81` `"next": "14.2.35"` | Plan still says "deferred" |

### Wave 2 — Functional (F1–F7) and Wave 2.5 (I1)

| ID | Claimed fix | Status | Evidence | Gap |
|---|---|---|---|---|
| R-F1.1 | Home Check-in → check-in picker | DONE | `components/dashboard/AppleDashboard.tsx:108-137`; `components/dashboard/CheckInQueue.tsx:9-12` T:B `stores.test.ts:219` | — |
| R-F1.2 | `/dashboard/key-results` index | DONE | `app/dashboard/key-results/page.tsx:12-29` T:– | — |
| R-F1.3 | Explorer Create menu | DONE | `OkrsAllClient.tsx:384-402`; `OkrsAllTabsBar.tsx:3`; `ExplorerCreateHandoff.tsx:15-39` T:– | — |
| R-F1.4 | Email links → live routes | DONE | `idx:57,644,658,685,824,1046,1058` T:SR `template-routes.test.ts:80-94` | — |
| R-F1.5 | Home cadence + sparkline | DONE | `lib/dashboards/home.server.ts:57,117-218` T:B `dashboard-home.test.ts` | — |
| R-F1.6 | Plans More / `?create=1` | DEVIATES | `/dashboard/plans` retired; `?createUnder` replaces it (`ExplorerCreateHandoff.tsx:25-39`) T:– | Old `?create=1` links have no create flow |
| R-F1.7 | "Coming soon" stubs removed | DONE | only comments remain (`SprintInboxView.tsx:15`, `MoveOkrModal.tsx:12`) T:– | — |
| R-F2.1 | Objective detail Add KR / Filter | DONE | `components/objective-detail/KRList.tsx:75-228` T:B `kr-filters.test.ts` | — |
| R-F2.2 | KR lifecycle menu | DONE | `KeyResultActionsMenu.tsx:185-249` T:B clone rule | — |
| R-F2.3 | Objective menu onDelete + permission gating | DONE | `ObjectiveActionsMenu.tsx:87-113,300-361`; `objective-permission-flags.ts:45-60` T:B | — |
| R-F2.4 | My OKRs owner filter | DONE | `components/dashboard/MyOKRsPage.tsx:54-75`; `obj/route.ts:86-91` T:– | Requests `limit=500` |
| R-F2.5 | Goals tabs | DEVIATES | `features/goals` deleted; `/dashboard/goals` → `okrs-all?level=mine` T:SR+B | Lands on Explorer "mine", not My OKRs |
| R-F2.6 | KR list mobile grid | DONE | `KRList.tsx:45,197,286` T:– | — |
| R-F3.1 | okr-hierarchy scoped | DONE | `app/api/okr-hierarchy/route.ts:75-112`; `lib/okr/visibility-scope.ts:199-209` T:B rule | No route test |
| R-F3.2 | progress / progress-report scoped | DONE | `lib/okr/insights-data.ts:174-193,256-289` T:– | — |
| R-F3.3 | analytics scoped | DONE | `insights-data.ts:45-63` T:– | — |
| R-F3.4 | alignment-map scoped | DONE | `lib/okr/alignment-map-data.ts:26-108` T:– | — |
| R-F3.5 | timeline scoped | DONE | `app/api/gantt/route.ts:61-78` T:– | — |
| R-F3.6 | Activity from ActivityLog, scoped | DONE | `lib/okr/activity-feed.server.ts:34-53` T:– | — |
| R-F3.7 | Home team feed scoped | DONE | `home.server.ts:343-410` T:B `dashboard-home.test.ts:93` | Own rule, not the scope engine |
| R-F3.8 | Portfolio page gated | DONE | `app/dashboard/projects/portfolio/page.tsx:14-16` T:– | — |
| R-F3.9 | Consistent status thresholds | PARTIAL | `lib/okr/progress-thresholds.ts` used only by insights-data; hard-coded in `NestedObjectivesList.tsx:48-56`, `AppleDashboard.tsx:458,463`, `lib/weekly-digest.ts:350,355`, `idx:734`, `lib/utils.ts:29-36` T:B helper | NestedObjectivesList uses 70/35 |
| R-F4.1 | Scrum celebrate / blocker / comment / absence / saved-view UI | DONE | `features/scrum/components/ScrumUpdateCard.tsx`, `ScrumBlockerDialogs.tsx`, `ScrumAbsenceModal.tsx`, `ScrumSavedViewsMenu.tsx` (T7 grep) T:B `blocker-lifecycle.test.ts` | UI itself untested |
| R-F4.2 | Deep links; week view; month click | DONE | `scrum-jobs.ts:47` (`?view=day&date=`); `ScrumCalendarViews.tsx:13` (month/week/day) T:B `view-state.test.ts` | — |
| R-F4.3 | Server draft autosave | DONE | `app/api/scrum/updates/route.ts:19-35` (draft 200) T:B `drafts.test.ts` | — |
| R-F4.4 | Mood-alert + recurring-blocker events; same-blocker prompt | DONE | `scrum-jobs.ts:167` SCRUM_TEAM_MOOD_ALERT; `blocker-lifecycle.ts:88` / `scrum-updates.ts:290` RECURRING T:B `mood-alert.test.ts` | — |
| R-F4.5 | Skeletons | DONE | `app/dashboard/scrum/loading.tsx`; `ScrumCalendarViews.tsx` T:– | — |
| R-F5.1 | Portal account mgmt API+UI + `portalEnabled` toggle | DONE | `app/api/projects/[id]/portal-users/route.ts:29-32`, `[portalUserId]/route.ts`; `features/projects/components/portal/PortalAccessPanel.tsx`; `app/api/projects/[id]/route.ts:62` T:B `portal-accounts.test.ts` | — |
| R-F5.2 | Draft purge job | DONE | `app/api/cron/project-creation-draft-purge`; `install-crontab.sh:168` T:SR | — |
| R-F5.3 | Portal logout / attachments | DONE | `app/portal/PortalSignOutButton.tsx`; `app/api/portal/projects/[id]/attachments/route.ts` T:SR | — |
| R-F5.4 | Replace `window.prompt/confirm` with modals | DONE | no `window.prompt/confirm` in features/projects, app/dashboard/projects, app/portal; `features/projects/components/dialogs/TextPromptDialog.tsx` T:– | — |
| R-F5.5 | Route-level Invariant #4 test | DONE | `lib/projects/portal-routes-invariant.test.ts` T:SR | — |
| R-F6.1 | 14 perf routes recordActivity | DONE | all performance mutation routes audited T:SR `app/api/performance/audit-coverage.test.ts:24-40` | Scan misses `export async function` handlers |
| R-F6.2 | Role create/delete UI | DONE | `ByRoleTab.tsx:36-103,222-235,335,482-494` T:– | No colour field |
| R-F6.3 | Hide DTP SMS/Telegram toggles | DONE | `features/daily-trip-plan/components/TravelSettingsForm.tsx:136-144` T:– | — |
| R-F6.4 | AI sprint: hide unwired providers, MANUAL scope | DONE | `features/sprints-ai/components/GenerateSprintModal.tsx:14-183`; `lib/ai/providers/wired.ts:8` T:B `providers.test.ts` | — |
| R-F6.5 | Account deletion (Decision): ADMIN-only, "<job title> (deleted account)", records kept | DONE | `app/api/users/[id]/route.ts:153-205`; `lib/users/deleted-account.ts:36-58` T:B `deleted-account.test.ts` | No route test for the ADMIN gate |
| R-F7.1 | Crontab: permission-cleanup, performance-nudge, client-report, wbr-pack, jira-sync, draft purge | DONE | `scripts/install-crontab.sh:117,119,121,166,168,187` T:SR `cron-auth.test.ts:137` | `confidence-calc`, `daily-digest`, `sprint-migration-check` unscheduled; `docs/CRON.md:165-169` says deliberate |
| R-F7.2 | Prune unbounded tables | DONE | `lib/retention/prune-tables.ts:27-132`; crontab `:154,:164` T:– | — |
| R-F7.3 | env.example keys | DONE | `env.example:116` CRON_SECRET; `:138` TELEGRAM_ALLOWED_CHAT_IDS (commented) T:– | — |
| R-F7.4 | CI runs all suites + lint | PARTIAL | `.github/workflows/ci.yml:41-77` runs 14 suites + tsc + lint + build T:– | **Triggers only on `agent/**` pushes and PRs** (`ci.yml:3-9`), so a direct push to `main` skips CI |
| R-F7.5 | ESLint config | DONE | `.eslintrc.json` T:– | — |
| R-F7.6 | Auth secondary screens use the `features/auth` look | DONE | `features/auth/components/{SignUpForm,ForgotPasswordForm,ResetPasswordForm}.tsx` T:– | — |
| R-I1.1 | OKR helpers in `lib/permissions.ts` | DONE | `permissions.ts:71,150,171,205,241,267,290` T:B `visibility-scope.test.ts:251-266` | `canEditObjective` dept check ignores `endedAt` (`:92-95`) |
| R-I1.2 | Batched visibility | DONE | `visibility-scope.ts:113-124,199-234`; `obj/route.ts:64-68` T:B | — |
| R-I1.3 | Helpers used across `/api/objectives/**` | PARTIAL | most routes gated T:SR partial | **`obj/[id]/children` GET (no session use), `obj/[id]/weights` GET, `obj/[id]/labels` POST/DELETE (no canEdit), `obj/[id]/request-checkin` (no canView)** |
| R-I1.4 | okrs-all uses the helpers | DONE | `app/dashboard/okrs-all/page.tsx:77-87` T:– | — |

### Wave 3 — Performance & UI (P1, P2, U1)

| ID | Claimed fix | Status | Evidence | Gap |
|---|---|---|---|---|
| R-P1.1 | `@@index` + 18 `CREATE INDEX CONCURRENTLY` in preflight | DONE | `scripts/preflight.sql:822-856` (18); `schema.prisma:322,323,616,804,839,910,…` T:SR `preflight-sql.test.ts:53` | Schema ↔ preflight parity not fully checked (8/18 spot-checked) |
| R-P1.2 | Timeframe defaults | PARTIAL | okr-hierarchy `route.ts:76-91`; gantt `:72-78` T:– | `/api/objectives` has no default |
| R-P1.3 | `take` limits | MISSING | `obj/route.ts:61` `Math.max(1, …)` with no ceiling; okr-hierarchy `:114-152` and gantt have no `take` T:– | G16 |
| R-P1.4 | groupBy stats | DONE | `home.server.ts:103-126` T:B | — |
| R-P1.5 | objectiveProgress seen-set | DONE | `lib/objectiveProgress.ts:172-178,206-211,240-257` T:B `objectiveProgress.test.ts:215,279,298` | — |
| R-P1.6 | Chunked confidence cron writes | DONE | `lib/confidence-calc.ts:171-174,320-336` T:B partial | Chunking untested |
| R-P2.1 | `emit()` off the request path | DONE | `lib/background.ts:39-65`; `fanout.ts:125-192` T:B `fanout.test.ts:206` | — |
| R-P2.2 | `emitNow` for crons/scripts | DONE | `jobs.ts:8-11`; cron routes import `emitNow` T:B | — |
| R-P2.3 | Remaining `await emit(` calls in handlers | DONE | 51 calls in 35 routes; each waits only for recipient resolution | Acceptable |
| R-U1.1 | Tokens → CSS vars | DONE | `tailwind.config.js:6,21-24,84-112`; `app/globals.css:301-310` T:B `lib/design-tokens.test.ts` | — |
| R-U1.2 | Dark mode | DONE | `tailwind.config.js:39`; `globals.css:424-428,511` T:B `design-tokens.test.ts:110` | — |
| R-U1.3 | `primary` DEFAULT | DONE | `tailwind.config.js:130-136` T:B | — |
| R-U1.4 | Focus ring | DONE | `globals.css:127-133` T:– | — |
| R-U1.5 | Mobile drawer on Sheet | DONE | `components/layout/Sidebar.tsx:19,332-391` T:– | Dead-CSS cleanup not checked |

### Wave 4 — G6 page consolidation, and the Decisions

| ID | Claimed fix | Status | Evidence | Gap |
|---|---|---|---|---|
| R-G6.1 | Retired-route redirects wired | DONE | `next.config.js:1,72-74`; `lib/retired-routes.js:19-43` (14 routes, permanent) T:B `route-consolidation.test.ts:88-105` | — |
| R-G6.2 | Destinations exist (Explorer views, Insights tabs) | DONE | `app/dashboard/okrs-all/page.tsx`; `insights/page.tsx:31-117` T:B+SR `:118-132` | — |
| R-G6.3 | Consolidation test | DONE | `lib/okr/route-consolidation.test.ts` (9 tests) | Mixed B / file-tree / SR |
| R-G6.4 | Retired page dirs removed | DONE | none of the 14 dirs exist; `features/goals` gone T:SR `:107-116` | Orphan `app/dashboard/objectives/error.tsx` (harmless) |
| R-G6.5 | No source links to retired routes | DONE | T7 grep: only comments reference them T:SR `:164` | — |
| R-G6.6 | Nav points at consolidated pages | DONE | `lib/dashboard-navigation.ts:66,90-92` T:B `:185-196` | — |
| R-G6.7 | My OKRs page + Explorer views List/Tree/Timeline/Map/Analyze | DONE | `app/dashboard/my-okrs/page.tsx`; `okrs-all/page.tsx:33,43-49,128-140` T:B | — |
| R-DEC.1 | Public sign-up stays, EMPLOYEE + inactive | DONE | see R-S1.1/S1.3 | — |
| R-DEC.2 | EMPLOYEE to-do scope = own + member sprints | DONE | `lib/apply-scope.ts:57-73` (`is_participant`); `scripts/update-employee-todo-scope.ts` T:B `lib/todos/record-scope-engine.test.ts` | Whether the prod `--apply` run happened can't be checked from code |
| R-DEC.3 | Page consolidation approved and done | DONE | see R-G6.* | Plan's "Blocked" list still names it (stale) |
| R-DEC.4 | Account deletion: ADMIN only, anonymise, keep records | DONE | see R-F6.5 | — |
| R-W0.2 | Sync with origin/main before the joint commit | DONE | plan: "RELEASE 2026-09-26 … on top of origin/main" | Doc-level evidence only |

---

## Test coverage — overall picture

- **Behavioural tests** cover pure helpers well: `period-close`, `retrospective-input`, `visibility-scope`, `rbac` with a fake Prisma, preferences, fanout, `objectiveProgress`, `auth-tokens`, the rate limiter, `cron-auth`, scrum access, and the portal serializer.
- **Source-regex tests** are the only barrier for the lock guard (the ⭐ requirement), the S4 invariants, the performance audit coverage, `okr-comment-access`, and parts of letters/platform hardening.
- **No test at all** covers any route handler for:
  - close / reopen / clone / period report;
  - `app/api/permissions/**`;
  - `/api/dashboards/ceo` (403);
  - notification recipient routing (`resolveRecipients`, where G7 and G8 live);
  - `lib/timeframe-utils.ts`;
  - retention pruning;
  - the §6.1 seed matrix.
