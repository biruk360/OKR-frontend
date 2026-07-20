# OKR Period Close, Retrospective, Roll-Forward, Lineage & End-of-Period Report
## Consolidated Build Specification

> **Status:** Build-ready draft for review · **Owner:** biruk@360ground.com · **Date:** 2026-07-14 · **Version:** 2.0
> **Module:** Objectives & Key Results (`features/objectives`, `features/key-results`, `app/api/objectives`, `app/api/keyresults`)
> **Supersedes:** v1.0 (this file). Consolidates the internal v1 draft with the "Eldix / 360Ground" v1.0 spec — keeping what is practical against the **current** codebase and cutting what is speculative.

This spec is deliberately **scoped to what the existing platform can absorb without a parallel subsystem**. Every "adopt" below was checked against real code; every "defer" is called out with a reason so v2 has a backlog.

---

## 0. What was consolidated (decision log)

| From the ambitious spec | Decision | Why |
|---|---|---|
| Three independent concerns: **Close · Clone · Lineage** | ✅ **Adopt** as the organizing frame | Correct model — you roll forward mid-period, and you close OKRs that should die. |
| `CLOSING` intermediate state (retro drafted before lock) | ✅ **Adopt** | Retrospectives take more than one sitting; freezing instantly kills reflection quality. |
| Grade **0.0–1.0** + `outcome` (ACHIEVED/PARTIAL/MISSED/ABANDONED) | ✅ **Adopt**, pre-filled from computed progress | Cheap, industry-standard (Google), and `ABANDONED` as a first-class healthy outcome is genuinely useful. |
| `gradeDelta` (human grade − computed progress) | ✅ **Adopt** | One subtraction; surfaces the honesty gap for free. |
| **Mandatory retrospective** to close (`OkrRetrospective`) | ✅ **Adopt**, 2 required fields | This is the point of closing. Uses TipTap (already a dep). |
| **Auto-evidence panel** from existing data | ✅ **Adopt**, scoped | Reuses `KeyResultCheckIn`, `ConfidenceSnapshot`, `Todo`, `ScrumUpdateLink` — all already in schema. |
| ⭐ **Carried baseline** on clone (`startValue = prev finalValue`) | ✅ **Adopt** — must-have | Prevents a rolled-over KR from claiming false day-one progress. Highest-value mechanic in the whole spec. |
| **Lineage chain** (`rolledFromId`/`rolledToId`/`lineageRootId`/`lineageDepth`) | ✅ **Adopt** | Directly answers your "rolled from previous period" + "go back and see previous performance". |
| **Transitive server-side lock** + HTTP **423** guard | ✅ **Adopt** | Matches your Project-module server-guard guardrail; lock must cover check-in history, not just top fields. |
| **Reopen** with reason + permanent `reopenCount` scar + `OkrReopenLog` | ✅ **Adopt** | 14-day owner window kept but made a setting, not a hardcode. |
| **End-of-period report** on close | ✅ **Adopt & expand** (you asked for this) — see §10 | Grade distribution + outcome mix + retrospective digest per timeframe. |
| Sandbagging / grade-inflation / no-learning **detection rules** (5 rules, CEO flags) | ⏸ **Defer to v2** | Keep the raw grade-distribution histogram in the report (cheap); defer the scoring heuristics and any CEO-facing "flags". Never wire into the Performance module. |
| Full **`PeriodCloseWorkflow`** model + announce/deadline/escalating cron reminders | ⏸ **Trim** | v1 ships a **period report + "close all my open OKRs in this period"** convenience and reuses the existing digest/notification cron. Defer the orchestrated close-window state machine to v2. |
| Cross-period **analytics dashboard** (Epic C8) | ⏸ **Defer to v2** | v1 gives per-OKR lineage view + the one end-of-period report. |
| `rolledTo` as an **array** (an OKR splits into two) | 🟡 **Schema allows it, UI is single-successor in v1** | Keep the relation many-sided; only expose 1:1 roll-forward in the UI for now. |

Invented component names in the source spec that **do not exist** and must not be referenced in code: `RechartsWrapper` (use `recharts` directly or the existing chart usage), `StatusBadge` (use existing badge patterns), `useReferenceData` (use `useTimeframes`).

---

## 1. The three independent concerns

```
 1. CLOSURE   period ended → grade → retrospective → lock
              outcome ∈ { ACHIEVED, PARTIAL, MISSED, ABANDONED }
                         │  (independent of ↓)
 2. CLONING   carry into next period → new OKR in a later timeframe
              may happen BEFORE or AFTER close; carries the baseline forward
                         │
 3. LINEAGE   both write the same chain:  Q1 → Q2 → Q3(current)
              walk backward from any node to the full arc
```

Close and Clone are **not** coupled: in week 10 of Q2 you can clone "Ship POS v2" into Q3 so planning is real, then close the Q2 copy at 62% with a retrospective in week 13. The Q3 clone already carries the lineage link.

---

## 2. State machine

```
 OPEN ──initiate close──▶ CLOSING ──retro complete + graded──▶ CLOSED
  ▲                        (still editable; NOT locked)         (isLocked=true,
  │                                                              all writes 423)
  └──────────────── reopen (reason ≥20 chars, reopenCount++) ──┘
```

`CLOSING` is a real persisted state, not a modal step — the retrospective can be drafted over days, and a value can still be corrected before it freezes.

---

## 3. Data model (Prisma — additive, nullable, `prisma db push` + `scripts/preflight.sql`)

> All fields are additive and nullable/defaulted. `closureStatus` is the **authoritative** state; `isLocked` is a denormalized convenience for the fast guard check. The existing `goalStatus='CLOSED'` badge keeps working; snapshot it into `preCloseGoalStatus` for clean reopen.

### 3.1 `Objective`
```prisma
// ─── Closure ───
closureStatus     String    @default("OPEN")   // OPEN | CLOSING | CLOSED
closedAt          DateTime?
closedById        String?
closedBy          User?     @relation("ObjectiveClosedBy", fields: [closedById], references: [id])
outcome           String?                       // ACHIEVED | PARTIAL | MISSED | ABANDONED
finalGrade        Float?                        // 0.0–1.0 (Google scale)
finalProgress     Float?                        // frozen computed progress at close
gradeDelta        Float?                        // finalGrade − finalProgress/100
finalConfidence   String?                       // ON_TRACK | AT_RISK | OFF_TRACK at close
initialConfidence String?                       // at first check-in
preCloseGoalStatus String?                      // restore on reopen
closureNote       String?                       // ≤500 chars

// ─── Lock ───
isLocked          Boolean   @default(false)
lockedAt          DateTime?

// ─── Reopen scar ───
reopenCount       Int       @default(0)
lastReopenedAt    DateTime?
lastReopenedById  String?

// ─── Lineage ───
rolledFromId      String?
rolledFrom        Objective?  @relation("ObjectiveLineage", fields: [rolledFromId], references: [id])
rolledTo          Objective[] @relation("ObjectiveLineage")
lineageRootId     String?                       // the original (period 1)
lineageDepth      Int       @default(0)

retrospective     OkrRetrospective?

@@index([closureStatus])
@@index([rolledFromId])
@@index([lineageRootId])
```

### 3.2 `KeyResult`
```prisma
closureStatus     String    @default("OPEN")
closedAt          DateTime?
closedById        String?
closedBy          User?     @relation("KeyResultClosedBy", fields: [closedById], references: [id])
outcome           String?
finalGrade        Float?
finalValue        Float?                        // frozen currentValue at close
finalProgress     Float?
gradeDelta        Float?
finalConfidence   String?
initialConfidence String?
preCloseConfidence String?
closureNote       String?

isLocked          Boolean   @default(false)
lockedAt          DateTime?
reopenCount       Int       @default(0)
lastReopenedAt    DateTime?
lastReopenedById  String?

// ─── Lineage + carried baseline ───
rolledFromId      String?
rolledFrom        KeyResult?  @relation("KeyResultLineage", fields: [rolledFromId], references: [id])
rolledTo          KeyResult[] @relation("KeyResultLineage")
lineageRootId     String?
lineageDepth      Int       @default(0)
carriedStartValue Float?     // ⭐ previous period's finalValue; new startValue when cloned

retrospective     OkrRetrospective?

@@index([closureStatus])
@@index([rolledFromId])
@@index([lineageRootId])
```

### 3.3 New `OkrRetrospective`
```prisma
model OkrRetrospective {
  id              String   @id @default(cuid())
  objectiveId     String?  @unique
  keyResultId     String?  @unique
  entityType      String                     // OBJECTIVE | KEY_RESULT
  whatWasAchieved String                     // TipTap rich text — REQUIRED
  whatWentWell    String?
  whatBlockedUs   String?
  whatWeLearned   String                     // ⭐ REQUIRED — the point of closing
  primaryBlocker  String?                    // NONE|UNCLEAR_GOAL|INSUFFICIENT_RESOURCE|EXTERNAL_DEPENDENCY|
                                             // SHIFTING_PRIORITY|TECHNICAL|CAPACITY|POOR_ESTIMATION|
                                             // CLIENT_DELAY|SCOPE_CREEP|OTHER
  wouldSetAgain   Boolean?
  wasAmbitious    Boolean?
  recommendedAction String                   // ROLL_FORWARD|ROLL_FORWARD_MODIFIED|ABANDON|COMPLETE_NO_ROLLOVER|SPLIT
  autoStatsJson   Json                       // evidence snapshot (see §6.2) — frozen at close
  authorId        String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  objective       Objective? @relation(fields: [objectiveId], references: [id], onDelete: Cascade)
  keyResult       KeyResult? @relation(fields: [keyResultId], references: [id], onDelete: Cascade)
}
```

### 3.4 New `OkrReopenLog`
```prisma
model OkrReopenLog {
  id           String   @id @default(cuid())
  entityType   String                        // OBJECTIVE | KEY_RESULT
  entityId     String
  reason       String                        // REQUIRED, min 20 chars
  reopenedById String
  reopenedAt   DateTime @default(now())
  reclosedAt   DateTime?
  changesJson  Json?
  @@index([entityType, entityId])
}
```

> **Deferred to v2:** `PeriodCloseWorkflow` model (orchestrated close window). v1 derives period-report data on demand from the fields above — no new model needed.

---

## 4. EPIC A — Closing an OKR

### A1 · Initiate closure (Objective or KR)
**Story:** *As an owner, I want to close an OKR when its period ends, so its result is graded, reflected on, and permanently recorded.*

**Entry:** `[Close]` in `ObjectiveActionsMenu` / `KeyResultActionsMenu`, visible when `closureStatus='OPEN'` **and** (timeframe ended **or** user is Admin/Executive — early close).

**3-step `Modal` (`components/ui/Modal`, size `xl`):** `Grade → Reflect → Confirm & Lock`.

**Step 1 — Grade** captures:

| Field | Req | Notes |
|---|---|---|
| `outcome` | ✅ | ACHIEVED / PARTIAL / MISSED / **ABANDONED** (shown as a healthy choice, not a failure) |
| `finalGrade` | ✅ | 0.0–1.0 slider, **pre-filled to `computedProgress/100`**, 0.05 snap, 0.7 "win line" marker |
| `finalProgress`, `gradeDelta`, `finalValue`(KR), `finalConfidence`, `initialConfidence` | auto | frozen/derived |
| `closureNote` | ❌ | ≤500 chars |

Micro-rules: moving the grade **>0.15** from computed reveals a required "why does your grade differ?" field (stored on the retro). Selecting **ABANDONED** hides the grade slider and requires a "why are we abandoning this?" reason. The panel shows computed progress, confidence start→end **with flip count** (from `KeyResultCheckIn`/`ConfidenceSnapshot`), check-in count and longest gap.

**AC:**
- Timeframe ended → `[Close]` visible to owner, manager, Admin/Executive; not ended → Admin/Executive only.
- Grade pre-fills from computed progress and is editable; >0.15 divergence → required explanation.
- `ABANDONED` → no grade, mandatory reason.
- Completing step 1 sets `closureStatus='CLOSING'` — **not yet locked**; OKR stays editable.

### A2 · Close Key Results before the Objective
**Story:** *As an owner, I want each KR closed with its own grade + retro before the Objective closes, so measurable outcomes aren't swept into one vague judgment.*

- An Objective **cannot** reach `CLOSED` while any child KR is `OPEN`/`CLOSING`. A sequenced flow walks each KR (progress curve from its `KeyResultCheckIn` history via `recharts`; per-KR outcome, grade, retro, `primaryBlocker`, `wouldSetAgain`). `[Skip for now]` leaves a KR open and keeps the Objective un-closable.
- On close, each KR's `finalValue`/`finalProgress` freeze; parent recomputes via `recalcNodeAndAncestors`, then the parent is itself frozen.

---

## 5. EPIC B — The retrospective (price of closing)

### B1 · Record the retrospective — Step 2 of close
**Story:** *As an owner, I want to record what was achieved, what blocked us, and what we learned before lock, so the next period is informed by this one.*

**Required:** `whatWasAchieved`, `whatWeLearned`, `recommendedAction`. Optional: `whatWentWell`, `whatBlockedUs`, `primaryBlocker`, `wouldSetAgain`, `wasAmbitious`. Rich text via **TipTap** (already a dep).

### B2 · Auto-evidence panel (the differentiator)
Pre-loads facts so reflection is against data, not memory. **All sources already exist** — nothing new is captured:

| Evidence | Source |
|---|---|
| check-in count, longest gap, progress curve | `KeyResultCheckIn` |
| confidence start→end, flip count, days-at-risk | `KeyResultCheckIn.confidence` + `ConfidenceSnapshot` |
| linked todo count + completion rate | `Todo` (linked to KR/Objective) |
| scrum mentions / blocker days / wins (if module present) | `ScrumUpdateLink` |

The frozen snapshot is persisted to `OkrRetrospective.autoStatsJson` so evidence survives even if source rows are later archived. Check-in gaps >14 days are flagged ⚠.

**AC:** empty `whatWasAchieved`/`whatWeLearned`/`recommendedAction` blocks closing; retro is editable while `CLOSING`, immutable at `CLOSED`; `recommendedAction ∈ {ROLL_FORWARD, ROLL_FORWARD_MODIFIED, SPLIT}` → clone flow (Epic D) offered at step 3.

> **Deferred (v2):** sandbagging / grade-inflation / no-learning detection and any CEO "flags". The raw grade distribution still appears in the end-of-period report (§10) — that's cheap and non-judgmental.

---

## 6. EPIC C — Lock & immutability

### C1 · Transitive server-side lock
**Story:** *As a CEO, I want a closed OKR genuinely immutable — including its check-in history — so every trend is built on a record that can't be quietly rewritten.*

On `closureStatus → CLOSED`: `isLocked=true`, `lockedAt` set. Immutable: **all** Objective/KR fields, the **entire `KeyResultCheckIn` history** (no create/edit/delete), the retrospective, contributors, labels. **Still permitted:** read, **comments**, clone-forward, reopen.

**Implementation — `lib/okr/lock-guard.ts::assertNotLocked(entityType, id)`** called at the **top of every mutating OKR endpoint** (PUT/DELETE, check-in create, weights, contributors, archive, complete). For a check-in it walks **up** to the parent KR and Objective — a check-in on a KR whose Objective is closed is also blocked. Rejects with **HTTP 423 Locked**, `{ code: 'OKR_LOCKED', reopenUrl }`. `recalcNodeAndAncestors` **skips** locked objectives (never recomputes frozen progress). Bulk endpoints skip locked entities and report them.

**AC / DoD highlight:** ⭐ an **automated test asserts every mutating endpoint × closed entity → 423**; UI **removes** edit controls (not merely disables) and shows a lock banner (`🔒 CLOSED — <timeframe> · Outcome · Grade · [Reopen] [Clone →]`).

---

## 7. EPIC D — Reopening

### D1 · Reopen a closed OKR
**Story:** *As an owner/Admin, I want to reopen for a genuine mistake — but the reopen is visible forever so it isn't casual.*

- Reason **required, ≥20 chars**. `reopenCount++`, `OkrReopenLog` row written, `recordActivity('reopened')`.
- **Who:** owner/manager within **14 days** of close (`OrganizationSettings`-configurable, default 14); Admin/Executive any time. Enforced **server-side**.
- **Transitive unlock:** reopening an Objective unlocks its KRs and their check-ins; `closureStatus→OPEN`; it must be closed again (no auto-reclose).
- **Permanent scar:** `reopenCount` + full reopen log stay visible after re-close. Uses `ConfirmDialog` (`variant="warning"`). Notifies owner, manager, and original closer.

> `≥3 reopens → CEO integrity flag` is **deferred to v2** (the count is still displayed).

---

## 8. EPIC E — Cloning forward (roll-over)

### E1 · Clone Objective (+ KRs) into the next period
**Story:** *As an owner, I want one action to clone an Objective and its KRs into the next period with history intact, not retyped as if new.*

**Extends** the existing `CloneObjectiveModal` / `CloneKeyResultModal` and `/api/objectives/[id]/clone` / `/api/keyresults/[id]/clone` — do not build parallel modals/routes.

| Element | Behavior |
|---|---|
| Objective fields, labels, contributors | copied |
| Timeframe | ⭐ new period (defaulted to next period of same `type`, via `useTimeframes`) |
| KRs | all or selected subset |
| **KR `startValue`** | ⭐⭐ = previous KR's `finalValue` (**not** old startValue); stored as `carriedStartValue` |
| KR `targetValue` | copied, **editable in the clone modal** |
| `currentValue` / progress / confidence | reset to new startValue / 0 / null |
| check-in history, retrospective | **not** copied (belong to the old period) |
| linked Todos | optional carry of *incomplete* todos |
| `rolledFromId` | source OKR |
| `lineageRootId` | inherited from source (or source id if source is root) |
| `lineageDepth` | `source.lineageDepth + 1` |

**⭐ Carried baseline** is the critical mechanic: a KR that ended Q2 at 21/50 clones into Q3 as `start=21, target=50, current=21 → 0% progress with 21 banked`, so every Q3 point is genuinely new work — rolling over never manufactures false progress. The clone modal shows the carried baseline and lets the user consciously reset it (new fiscal year / changed definition).

**Entry points:** `[Clone to next period]` on any OKR (open or closed); auto-offered at close step 3 when `recommendedAction=ROLL_FORWARD*`; bulk from the period report (§10). Existing duplicate-title-in-timeframe **409 guard is preserved**.

### E2 · Provenance display (lineage)
**Story:** *As a viewer of a rolled-forward OKR, I want a "Rolled from previous period" link + its previous performance; on the source, a forward link.*

- **`RolledFromBanner`** (new, `components/shared/`) on the clone: *"Rolled from previous period · <Timeframe> — reached 62%"* using `TimeframeBadge` + `EntityLink` to the source, plus **"View previous period performance"** → read-only panel rendering the source's final grade/progress/confidence, `CheckInTimeline`, closure note, and retrospective.
- **Forward link** on the source: *"Rolled forward to <Timeframe> →"* via `EntityLink`.
- Chain walk uses `lineageRootId`/`rolledFromId`; v1 shows the immediate predecessor + a "full history" list of the chain (Q1→…→current).

---

## 9. EPIC F — Complete vs Close (reconcile existing `/complete`)

Both `POST /api/objectives/[id]/complete` **and** `POST /api/keyresults/[id]/complete` exist today (force 100%, `goalStatus='CLOSED'` on the objective). Each becomes a **shortcut into the close path**: it pre-fills the close flow with all KRs at target, `outcome=ACHIEVED`, grade 1.0 — but the retrospective is still required and the record still goes through `CLOSING → CLOSED`. Existing `goalStatus='CLOSED'` rows get `closureStatus='CLOSED'`, `closedAt=updatedAt`, `isLocked=true` backfilled by a one-off script so they lock consistently.

---

## 10. EPIC G — End-of-OKR-Period Report ⭐ (new, you asked for this)

**Story:** *As a lead/CEO, when OKRs in a period are closed, I want a single end-of-period report summarizing outcomes, grades, and lessons, so the period ends with a shared, durable record instead of scattered closures.*

**Route:** `app/dashboard/okrs-all/period-report/[timeframeId]/page.tsx` (thin) + `GET /api/reports/period-close/[timeframeId]`. Generated **on demand** from the closure fields above — no new model in v1.

**Contents (all from existing/added data):**
1. **Header** — timeframe, window, close progress: `closedObjectives/totalObjectives`, `closedKeyResults/totalKeyResults` (open ones listed with owners as a "still to close" checklist).
2. **Outcome mix** — donut of ACHIEVED / PARTIAL / MISSED / ABANDONED (`recharts`).
3. **Grade distribution histogram** — buckets of `finalGrade`; a healthy period clusters ~0.6–0.7 (shown as guidance text, **not** a judgment on anyone).
4. **Score vs grade** — average `gradeDelta` for the period (the honesty gap), listed, not flagged.
5. **Blocker Pareto** — `primaryBlocker` frequency across retrospectives → what most got in the way.
6. **Lessons digest** — a scannable list of every `whatWeLearned`, grouped by department, each linking to its OKR.
7. **Roll-forward status** — how many closed OKRs were rolled into the next period vs abandoned vs completed, with lineage links.
8. **Per-OKR table** — objective, owner, outcome, grade, progress, reopen count, rolled-to link; filters reuse the existing `okrs-all` filter patterns.

**Permissions:** department-scoped for `DEPARTMENT_LEAD`, org-wide for Admin/Executive (reuse `lib/permissions.ts` scoping). **Export:** reuse the existing PDF path (`lib/letter-pdf-puppeteer.ts` pattern) for a shareable period report.

**Convenience action (replaces the deferred bulk workflow):** `[Close all my open OKRs in <period>]` on the report opens the sequenced close flow across the user's open OKRs in that timeframe. Reminders reuse the **existing daily/weekly digest cron** ("N OKRs still open in Q2 — close by <date>") rather than a new escalation engine.

**AC:** report renders for any timeframe; counts and charts derive only from closed-OKR fields; open OKRs are listed with owners; each lesson/OKR links out; export produces a PDF; a `DEPARTMENT_LEAD` sees only their department.

> **Deferred to v2:** the orchestrated `PeriodCloseWorkflow` (announced window, escalating reminders, hard block on advancing the period) and cross-period trend analytics (Epic C8 in the source spec).

---

## 11. API surface

Follow existing conventions: `withAuth`, response envelope, `resolveParams`, `recordActivity`, transactional writes, `canEditObjective`/`canEditKeyResult`.

| Route | Purpose |
|---|---|
| `POST /api/objectives/[id]/close/initiate` · `POST /api/keyresults/[id]/close/initiate` | → `CLOSING`, capture grade/outcome |
| `POST /api/objectives/[id]/close/commit` · `.../keyresults/[id]/close/commit` | retro complete → `CLOSED` + lock + freeze + `recalcNodeAndAncestors` |
| `POST /api/objectives/[id]/reopen` · `.../keyresults/[id]/reopen` | reason-gated transitive unlock |
| `POST /api/objectives/[id]/clone` · `.../keyresults/[id]/clone` | **extend**: persist lineage + `carriedStartValue` |
| `GET/PUT /api/objectives/[id]/retrospective` (and KR) | draft/edit retro during `CLOSING` |
| `GET /api/reports/period-close/[timeframeId]` | end-of-period report data |
| existing `POST /api/objectives/[id]/complete` | routes into the close path (Epic F) |

Shared guard `lib/okr/lock-guard.ts::assertNotLocked()` is added to **every** existing mutating OKR route.

---

## 12. Permissions (reuse `lib/permissions.ts`)

| Action | Rule |
|---|---|
| Close / Reopen | = edit permission (`canEditObjective`/`canEditKeyResult`); reopen adds the 14-day window for non-admins (setting) |
| Record retrospective | anyone who can currently check in on that KR |
| Clone / roll forward | keep current guard (ADMIN / EXECUTIVE / DEPARTMENT_LEAD) |
| Period report | department-scoped for leads, org-wide for Admin/Executive |

Register `close`, `reopen`, `rollForward` as doctype actions on `objective`/`keyResult` (global RBAC/doctype guardrail).

---

## 13. Component / code reuse map

| Need | Reuse (verified to exist) |
|---|---|
| Menu items (Close/Reopen/Clone) | `ActionsMenu` (`components/ui/ActionsMenu.tsx`), used in `ObjectiveActionsMenu`/`KeyResultActionsMenu` |
| Close/reopen confirm | `ConfirmDialog` (`components/ui/ConfirmDialog.tsx`) |
| Close/report/clone modals | `Modal` (`components/ui/Modal.tsx`) |
| Grade slider + final report fields | fields/slider from `CreateCheckInModal` (`features/key-results/components/`) |
| Progress curve + report charts | `recharts` (raw dep — no wrapper component exists) |
| Previous-period timeline | `CheckInTimeline` (`components/key-result-detail/`) |
| Retro rich text | TipTap (`@tiptap/*`, already installed) |
| Clone forward | `CloneObjectiveModal` / `CloneKeyResultModal` + `/clone` routes |
| Timeframe / next-period default | `useTimeframes` (`hooks/useTimeframes.ts`) |
| Provenance links/badges | `EntityLink`, `TimeframeBadge` (`components/shared/`) |
| Evidence sources | `KeyResultCheckIn`, `ConfidenceSnapshot`, `Todo`, `ScrumUpdateLink` (all in schema) |
| Progress recompute | `recalcNodeAndAncestors` (`lib/objectiveProgress.ts`) |
| Audit / notifications | `recordActivity` (`lib/activity-log.ts`), existing notification dispatcher + digest cron |
| PDF export | existing puppeteer PDF path (`lib/letter-pdf-puppeteer.ts`) |
| Empty states | `EmptyState` (`components/ui/EmptyState.tsx`) |

**New code (justified gaps):** `lib/okr/lock-guard.ts`; `close/initiate`+`close/commit`+`reopen` routes (only `/complete` exists, KRs have no closed state); `CloseObjectiveModal`/`CloseKeyResultModal` (compose existing fields); retrospective form + `OkrRetrospective`/`OkrReopenLog` models; `RolledFromBanner`; period-report page + route; schema fields in §3.

---

## 14. Build sequence

1. **Schema + `db push`** (§3) + `preflight.sql` + backfill existing `CLOSED` (Epic F).
2. **Lock guard** (`lib/okr/lock-guard.ts`) + wire into every mutating route + the 423 test suite (Epic C). *Ship this early — it protects everything after.*
3. **Close flow** initiate/commit + grade + `CLOSING` state (Epic A).
4. **Retrospective** form + auto-evidence + `autoStatsJson` freeze (Epic B).
5. **Reopen** + scar + log (Epic D).
6. **Clone forward** extend + carried baseline + lineage (Epic E1) + `RolledFromBanner`/previous-performance (E2).
7. **End-of-period report** + "close all my open OKRs" + digest reminders (Epic G).
8. Docs: update `CHANGELOG_AI.md`, `FEATURE_STATUS.md`, `SITEMAP.md`, `COMPONENT_CATALOG.md`, `MASTER_REFERENCE.md`.

**Global DoD:** server-side guard (not UI-only) for every lock; every close/reopen/clone writes `ActivityLog`; freeze + recompute in one `prisma.$transaction`; Apple-Pro tokens only (no hex); features never import features; barrel exports.

---

## 15. Open questions

- **Q1.** Reopen an Objective → reopen its KRs too by default, or objective-only with opt-in? *(Proposed: objective-only + opt-in.)*
- **Q2.** Reopen allowed after roll-forward exists? *(Proposed: allowed, with a warning that a newer-period copy exists.)*
- **Q3.** Can owners/employees initiate roll-forward, or only request it (keeping clone admin/lead-only)? *(Proposed: keep current guard.)*
- **Q4.** Reopen window default 14 days — org-configurable via `OrganizationSettings`? *(Proposed: yes.)*
- **Q5.** v1 single-successor roll-forward only (schema allows split) — confirm split UI is v2. *(Proposed: yes.)*
```
