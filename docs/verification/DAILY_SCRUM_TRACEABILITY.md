# Daily Scrum Module — Requirements Traceability

**Audit date:** 2026-09-27 · **Auditor:** T3 (read-only requirements traceability; no code changed)
**Sources of truth:** `docs/daily_scrum_module_BUILD_SPEC.md` (spec v1.0 — authoritative),
`docs/daily_scrum_module_IMPLEMENTATION_STRATEGY.md` (§2 reconciliations, §2.12 + P9 = Epic S11, §0.1 protocol A–F),
`docs/SCRUM_MODULE_TRACKER.md` (statuses **not** trusted — every row below was re-derived from code).

**Code surveyed:** `features/scrum/**`, `app/api/scrum/**`, `app/api/cron/scrum-*`, `app/dashboard/scrum/**`,
`prisma/schema.prisma` (Scrum* models, lines 3267–3480), `lib/notifications/events.ts`, `lib/email/templates/index.ts`,
`lib/projects/raid.ts`, `lib/performance/metric-resolver.ts`, `lib/dashboards/home.server.ts`,
`scripts/seed-scrum-{permissions,settings}.ts`, `scripts/install-crontab.sh`, objective/KR detail routes.

**Tests:** `npm run test:scrum` run during this audit → **81 pass / 0 fail, 18 suites** (12 files in
`features/scrum/services/*.test.ts`). All are pure/unit tests; there are no DB-backed or UI tests for this module.

> Note: the build spec contains no S11 text and no attachments requirement. S11 (OKR linkage) is traced against
> strategy §2.12 + P9; draft behaviour against the G7 tracker note + `features/scrum/services/drafts.ts`;
> comment attachments against CHANGELOG H2/C1.

### Status legend
- **DONE** — requirement met in code (evidence given); test noted where one exists.
- **PARTIAL** — some of the requirement is built; the gap column says what is missing.
- **MISSING** — nothing implements it.
- **DEVIATES** — built, but behaves differently from the spec in a way that matters (bug or unapproved design change).

---

## Summary

| Section | DONE | PARTIAL | MISSING | DEVIATES | Total |
|---|---:|---:|---:|---:|---:|
| §1 Data model | 6 | 0 | 0 | 3 | 9 |
| S1.1 Submit my update | 14 | 3 | 5 | 4 | 26 |
| Drafts (G7) | 9 | 0 | 0 | 0 | 9 |
| S1.2 Previous-day panel | 5 | 4 | 2 | 1 | 12 |
| S2.1 Proxy entry | 7 | 7 | 1 | 1 | 16 |
| S3.1 Month wall | 4 | 5 | 4 | 1 | 14 |
| S3.2 Day view | 7 | 4 | 1 | 0 | 12 |
| S3.3 Streak view | 1 | 3 | 6 | 0 | 10 |
| S3.4 Week view | 1 | 0 | 3 | 0 | 4 |
| S4.1 Filters & search | 2 | 7 | 6 | 1 | 16 |
| S5.1 Blocker lifecycle | 5 | 2 | 1 | 2 | 10 |
| S5.2 Blocker taxonomy | 2 | 1 | 1 | 1 | 5 |
| S6.1 Wins | 5 | 0 | 0 | 1 | 6 |
| S7.1 Automation / nudges / Telegram | 6 | 0 | 2 | 2 | 10 |
| S8.1 Analytics & team health | 2 | 10 | 3 | 1 | 16 |
| S9 Integration (OKR / Performance / PM) | 3 | 5 | 2 | 2 | 12 |
| S10 Settings & absences | 8 | 3 | 1 | 1 | 13 |
| §11 Permissions | 6 | 1 | 0 | 2 | 9 |
| §12 Notifications | 12 | 0 | 1 | 3 | 16 |
| §13 Cron | 3 | 3 | 0 | 0 | 6 |
| S11 OKR linkage | 6 | 9 | 5 | 2 | 22 |
| Global DoD / guardrails (F) | 3 | 6 | 0 | 0 | 9 |
| **Total** | **117** | **73** | **44** | **28** | **262** |

**Headline:** the core loop (submit, pre-fill, drafts, one-per-day, lateness, mood serializer, blocker state machine,
celebrate, absences, metrics API) is solid. The weak areas are the **escalation side-effects** (duplicate RAID/Delay
records daily, CEO never notified), **attendance-stamp integrity on re-save**, **proxy overwrite of self-reports**,
**OKR links other than WIN never persisted** (which starves S11 panels and makes the neglect alert fire for almost
every objective every night), and large unbuilt portions of S3.3/S3.4/S4/S8 UI.

---

## §1 — Data model

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| DM-01 | `ScrumUpdate`, one update per person per day, DB-enforced | DONE | `prisma/schema.prisma:3289`, `@@unique([userId, scrumDate])` at `:3338` | — |
| DM-02 | `status` = SUBMITTED \| LATE \| ABSENT \| EXCUSED | DEVIATES | `types/scrum.ts:8` adds DRAFT/CONFIRMED/AMENDED; schema comment `schema.prisma:3298` omits LATE | ABSENT/EXCUSED are never written (derived at read time from missing row / `ScrumAbsence`). PATCH-amend overwrites LATE with AMENDED (`scrum-updates.ts:241`), so status alone no longer tells you lateness. Fix the schema comment; document derived states. |
| DM-03 | Plain-string user FKs, no `User` back-relations (strategy §2.1) | DONE | `schema.prisma:3289-3303` | — |
| DM-04 | Links as join table `ScrumUpdateLink` + OKR back-relations (strategy §2.1/§2.12) | DONE | `schema.prisma:3450-3472`; `Objective/KeyResult/Todo.scrumLinks` at `:315/:403/:600` | — |
| DM-05 | Calendar indexes (`[scrumDate,teamId]`, `[hasBlocker,…]`, `[hasWin,…]`, `[managerId,…]`, `[blockerStatus]`) | DONE | `schema.prisma:3339-3348` | — |
| DM-06 | `ScrumComment` (mentions, cascade) / `ScrumAbsence` unique `[userId,date]` | DONE | `schema.prisma:3351-3381`, `:3377` | — |
| DM-07 | `ScrumSettings` field set and defaults | DEVIATES | `schema.prisma:3383-3409`; `settings.ts:32-61` | `telegramEnabled` defaults **false** (spec true); spec `nudgeTime 08:00` split into `reminderTime 08:00` + `nudgeTime 09:05`; `blockerEscalationDays` defined but never read. Low impact, undocumented. |
| DM-08 | `ScrumJobRun` idempotency row | DONE | `schema.prisma:3437-3448` (`@@unique([jobKey,userId,runDate])`) | — |
| DM-09 | Invariant #10 — this module supersedes PM G6; PM `ScrumLog` must not be wired | DEVIATES | G6 is built and live: `app/api/projects/[id]/scrum-log/route.ts`, `features/projects/components/ScrumLogWidget.tsx`, rendered at `features/projects/components/ProjectDeliveryControlCenter.tsx:146`, `features/projects/services/scrum-attendance.ts`, `lib/performance/project-scrum-attendance.ts` | Two competing sources of scrum attendance. Decide: retire G6 or re-point it at `ScrumUpdate`. |

## S1.1 — Submit my daily update

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S1.1-01 | `POST /api/scrum/updates` + `PATCH /[id]` with `withAuth`, zod, envelope | DONE | `app/api/scrum/updates/route.ts:26-36`; `app/api/scrum/updates/[id]/route.ts:14-24`; `schemas.ts:31-69` | — |
| S1.1-02 | Re-opening edits the existing record (no duplicate) | DONE | upsert `scrum-updates.ts:238-247` | — |
| S1.1-03 | ⭐ Pre-fill from the **last working-day** update, not calendar-yesterday | DONE | `prefill.ts:37-56` (most recent submitted update before the date; drafts excluded) | `getScrumPrefill` has no test (only `previousScrumWorkingDay` is tested, `working-days.test.ts:28`). |
| S1.1-04 | Never submitted → empty with placeholder | DONE | `ScrumYesterdayPanel.tsx:55-56` | — |
| S1.1-05 | Pre-fill rendered grey italic, turns solid on edit | DEVIATES | Form redesigned as item lists (`ScrumItemList.tsx:119-128`) | No pre-fill styling state exists. Unapproved redesign of the ⭐ interaction. |
| S1.1-06 | `[↺ from my plan]` restores the pre-fill | MISSING | Only "Discard draft" resets to pre-fill (`ScrumHome.tsx:284-296`), and only when a draft was restored | — |
| S1.1-07 | Autofocus lands on `todayPlan` | MISSING | no `autoFocus` anywhere in `features/scrum` | — |
| S1.1-08 | Rich-text WYSIWYG fields (reuse existing editor), min 10 chars | DEVIATES | `RichTextEditor` only for Remarks (`ScrumHome.tsx:557-561`); item text `z.string().min(1)` (`schemas.ts:16`) | Yesterday/today/blocker/win are plain-text lines; the 10-char minimum applies only to the legacy HTML path. |
| S1.1-09 | Blocker category appears on text, required before submit | DONE | `ScrumHome.tsx:523-539`, `:325-328`; zod refine `schemas.ts:54-69`; test `drafts.test.ts:90` | — |
| S1.1-10 | `hasBlocker`/`hasWin` derived server-side | DONE | `scrum-updates.ts:195-196` | No flag-derivation test. |
| S1.1-11 | `teamId`/`managerId` resolved server-side | DONE | `access.ts:113-130`; `scrum-updates.ts:99` | — |
| S1.1-12 | `isLate` / `status=LATE` vs cutoff; late still counts present | DONE | `working-days.ts:127-142`; `scrum-updates.ts:101,207`; test `working-days.test.ts:42` | — |
| S1.1-13 | `submittedAt` is the attendance stamp (invariant #3) | DEVIATES | every save rewrites `submittedAt: new Date()` and recomputes `isLate` (`scrum-updates.ts:100-101, 220-221`), applied on update/upsert (`:232-247`) | Editing an 08:10 update at 10:00 moves the attendance stamp and flips it to late. Preserve `submittedAt/isLate/status` on amend; use `amendedAt`. **High.** |
| S1.1-14 | Blocker → immediate manager notification | DONE | `scrum-updates.ts:271-279` | Re-fires on every re-save while the blocker exists; no fallback when `managerId` is null. |
| S1.1-15 | Autosave every 10 s; draft restored after tab close | DONE | `ScrumHome.tsx:247-252` (device), `:210-245` (restore newer of server/device) | — |
| S1.1-16 | `Cmd/Ctrl+Enter` submits | DONE | `ScrumHome.tsx:435` | — |
| S1.1-17 | Mood optional, never warned, inline privacy note | DONE | `ScrumHome.tsx:564-583` | — |
| S1.1-18 | Calm countdown (amber at 5 min, friendly late message) | MISSING | only static `cutoff 08:30` text (`ScrumHome.tsx:441`) | — |
| S1.1-19 | Mobile: sticky Submit; `yesterdayDone` collapsed by default | PARTIAL | sticky bar `ScrumHome.tsx:585`; panel open by default `ScrumYesterdayPanel.tsx:25` | Collapse on mobile missing. |
| S1.1-20 | `linkedTodoIds` / `linkedKeyResultIds` pickers | PARTIAL | Objective/KR picker per item (`ScrumItemList.tsx:161-191`, options `ScrumHome.tsx:399-404`) | Todos never offered in the picker. |
| S1.1-21 | Optional `projectId` select (PM link) | MISSING | `projectId`/`projectActivityId` exist in form state (`ScrumHome.tsx:88-89,198-199`) but no input is rendered — always `null` | Makes every PM integration (RAID, DelayEvent, Gantt flag, project feed) unreachable from the UI. |
| S1.1-22 | `recordActivity()` on create and update | DONE | `scrum-updates.ts:264-269` | — |
| S1.1-23 | Route `/dashboard/scrum` + persistent dashboard widget | DONE | `app/dashboard/scrum/page.tsx`; `components/dashboard/AppleDashboard.tsx:503,582`; `lib/dashboards/home.server.ts:458-505` | — |
| S1.1-24 | Form "today" is the Addis Ababa date | DEVIATES | `todayKey = new Date().toISOString().slice(0,10)` (`ScrumHome.tsx:101`) is UTC | 00:00–03:00 EAT the form defaults to the previous day. Low. |
| S1.1-25 | ⭐ Median submission < 60 s measured | MISSING | no instrumentation | Invariant #1 is unverified. |
| S1.1-26 | Unit tests: pre-fill across weekends/holidays, late calc, flag derivation | PARTIAL | `working-days.test.ts:22-52` | No DB-path pre-fill test, no flag-derivation test. |

## Drafts (G7 — `status = 'DRAFT'`)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| DR-01 | "Save draft" stores a DRAFT row with no To-do sync, links, activity, notifications | DONE | `scrum-updates.ts:125-161`, `saveScrumDraft :407-427` | — |
| DR-02 | Owner-only; never for proxy; never overwrites a submitted row | DONE | `drafts.ts:38-46`; `scrum-updates.ts:88, 411-425` (conditional `updateMany`, P2002 guard); test `drafts.test.ts:67` | — |
| DR-03 | Submitting a draft is a first submit (CREATED, side-effects once) | DONE | `drafts.ts:53-60`; `scrum-updates.ts:164,189,266`; test `drafts.test.ts:79` | — |
| DR-04 | Every counting read excludes DRAFT | DONE | `drafts.ts:20-24`; static scan test `drafts.test.ts:98-150` | — |
| DR-05 | Drafts invisible to others (GET, comments, links, celebrate, attention) | DONE | `scrum-updates.ts:325`; `comments/route.ts:18,36`; `links/route.ts:16`; `celebrate/route.ts:11`; `attention/route.ts:19` | — |
| DR-06 | Restore newer of server/device copy; Discard | DONE | `ScrumHome.tsx:221-243, 284-296`; `DELETE /updates/[id]` `[id]/route.ts:27-35` (+ attachment purge) | — |
| DR-07 | Category optional on draft, enforced on submit | DONE | `schemas.ts:54-59`; test `drafts.test.ts:90` | — |
| DR-08 | Proxy "draft" is device-only | DONE | `ScrumHome.tsx:257-262` | — |
| DR-09 | Reminder/nudge treat a draft as not submitted | DONE | `scrum-jobs.ts:187-188`; test `drafts.test.ts:146` | — |

## S1.2 — Previous day's plan while updating

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S1.2-01 | Read-only reference panel above the form, collapsible | PARTIAL | `ScrumYesterdayPanel.tsx:44-73` | Items are editable `Input`s (`ScrumItemList.tsx:119`), and carried items are removed from the panel (`ScrumYesterdayPanel.tsx:27-41`) — not an immutable record. |
| S1.2-02 | Plan parsed into line items (newline/bullet aware) | DONE | `items.ts:49-56`; `prefill.ts:158-165`; tests `items.test.ts:28`, `prefill.test.ts:6` | — |
| S1.2-03 | Three-state Done / Carried / Not done | DONE | `ScrumItemList.tsx:75-116` | — |
| S1.2-04 | Done → today's `yesterdayDone` | DONE | `items.ts:68-71`; `scrum-updates.ts:208` | — |
| S1.2-05 | Carried → auto-added to `todayPlan` | DONE | `ScrumYesterdayPanel.tsx:27-41` | — |
| S1.2-06 | Marking is never forced | DEVIATES | untouched items auto-marked CARRIED on submit (`ScrumHome.tsx:299-318`) | Inflates carry-forward rate and creates Todos for items the user never chose to carry. |
| S1.2-07 | Open blocker shown with running day count + 🚫 | PARTIAL | `ScrumYesterdayPanel.tsx:66-71`; `prefill.ts:95-126` | Shows days + category but not the blocker text. |
| S1.2-08 | Collapse state persists per user | MISSING | `useState(true)` `ScrumYesterdayPanel.tsx:25`; `lib/stores/scrum-store.ts` `yesterdayPanelCollapsed` never used | — |
| S1.2-09 | Weekend/holiday → last working-day plan with its date labelled | PARTIAL | `previousDate` returned (`prefill.ts:58-62`) | Title is always "Yesterday's plan"; date not shown. |
| S1.2-10 | Item carried 3+ consecutive days flagged amber | MISSING | — | — |
| S1.2-11 | Todo-completed items pre-marked Done (extension) | DONE | `prefill.ts:69-84` | — |
| S1.2-12 | Unit tests for parsing and carry-forward | PARTIAL | parsing tested; link inheritance `prefill.test.ts:11` | `applyPlanItemState` / carry logic untested. |

## S2.1 — Proxy entry

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S2-01 | Proxy form with mandatory reason (taxonomy + detail) | PARTIAL | `ScrumHome.tsx:464-489`; server `scrum-updates.ts:92`; `schemas.ts:43-44` | `OTHER` does not require free text. |
| S2-02 | Role-scoped picker (manager→reports, dept lead→dept, PM→project team, admin→all) | DONE | `access.ts:166-211` | "Scrum Facilitator" designate role not modelled. |
| S2-03 | Peers: action hidden + API 403 | DONE | `ScrumHome.tsx:406,420`; `scrum-updates.ts:91`; `access.ts:140-164`; test `access.test.ts:14` | — |
| S2-04 | `isProxyEntry` derived server-side | DONE | `scrum-updates.ts:87,222` | — |
| S2-05 | ⭐ Mood absent from proxy form (not disabled) + never stored | DONE | `ScrumHome.tsx:564`; `scrum-updates.ts:217` | No test for the server-side strip. |
| S2-06 | Proxy badge + amber banner in all views (calendar, day, streak, digests, exports) | PARTIAL | badge `ScrumUpdateCard.tsx:67`, `ScrumCalendarViews.tsx:147`; copy text `:360` | No "Logged by [name]", no reason banner, dot badge lost when blocker/win/late (`calendar.ts:74-76`), nothing in streak/digests. |
| S2-07 | Subject notified | DONE | `scrum-updates.ts:305-313` | — |
| S2-08 | Subject Confirm / Amend actions | PARTIAL | API `updates/[id]/confirm/route.ts`; `confirmProxyUpdate` `scrum-updates.ts:368-400` | No UI calls it — `scrumApi` has no confirm method (`services/api.ts`). |
| S2-09 | Confirm → `proxyConfirmedByUser` + green ✓ | PARTIAL | `scrum-updates.ts:372` | ✓ not rendered anywhere. |
| S2-10 | Amend keeps attribution, logged `AMENDED` | PARTIAL | `scrum-updates.ts:373-391` | Amend body is not zod-validated (`confirm/route.ts:6-7`; `blockerCategory` unchecked); blocker lifecycle not recomputed; "confirm" is accepted on non-proxy updates (`:371`). |
| S2-11 | ⭐ Proxy entry can never masquerade as / overwrite a self-report | DEVIATES | owner edit keeps attribution (`scrum-updates.ts:232-235`) but a proxy **POST** for a subject who already self-submitted upserts over it (`:243-247`) | Manager can replace a self-report and convert it into a proxy entry. Reject with 409. **High.** |
| S2-12 | Analytics count self vs proxy separately | PARTIAL | `proxyRatio` `scrum-analytics.ts:62,76` | Org/team ratio only; no per-team split or flag. |
| S2-13 | Pre-fill uses the subject's history | DONE | `updates/route.ts:12-18`; `ScrumHome.tsx:151` | — |
| S2-14 | `recordActivity` for proxy submit and amend | DONE | `scrum-updates.ts:266, 386-391` | — |
| S2-15 | Tests: auth matrix, mood exclusion, attribution integrity | PARTIAL | auth matrix `access.test.ts:5-68` | Mood exclusion and attribution integrity untested. |
| S2-16 | Entry point "[+ Log on their behalf]" on absent cards | MISSING | absent list is names only (`ScrumCalendarViews.tsx:222-232`) | — |

## S3.1 — Team month calendar ("The Wall")

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S3.1-01 | One dot per member, same position every day | DONE | `calendar.ts:71-78` (members sorted by name `:133-138`); `ScrumCalendarViews.tsx:64-91` | — |
| S3.1-02 | Six dot states with exact colours | PARTIAL | `calendar.ts:74-76`; `ScrumCalendarViews.tsx:325-335` | Single-priority state (blocker hides late/proxy); win `warning-400` vs late `warning-500` barely distinguishable; proxy is a state, not a badge. |
| S3.1-03 | Red tint >30 % absent; gold tint all-submitted + win | DONE | `calendar.ts:94-95`; `ScrumCalendarViews.tsx:37-38` | See S3.1-08 (future days). |
| S3.1-04 | Badge counts 🚫 🏆 ⏰ ❌ per cell | PARTIAL | `ScrumCalendarViews.tsx:51-55` | No late count. |
| S3.1-05 | Hover → mini-card, no navigation | PARTIAL | native `title` tooltip only (`:80`) | — |
| S3.1-06 | Click dot → full update in side panel | DEVIATES | navigates to Day view + highlight (`ScrumHome.tsx:374-378`) | No side panel. |
| S3.1-07 | Click day → Day view | DONE | `ScrumCalendarViews.tsx:41-46` | — |
| S3.1-08 | Weekend/holiday greyed + labelled; future days faint | MISSING | server drops non-working days (`calendar.ts:69`); fixed 5-col grid (`ScrumCalendarViews.tsx:31`) | Holidays shift columns off weekday alignment; future days render as grey "absent" dots and can be red-tinted. |
| S3.1-09 | Today: bold accent border | MISSING | — | — |
| S3.1-10 | Excused = blue, excluded from absent count | DONE | `calendar.ts:76,84`; `dotColor` `primary-200` | — |
| S3.1-11 | Proxy `🔄` badge on dot | PARTIAL | see S3.1-02 | — |
| S3.1-12 | 25+ members degrade gracefully | PARTIAL | flex-wrap only; members silently capped at 100 (`calendar.ts:137`) | — |
| S3.1-13 | 31×25 month renders < 500 ms | MISSING | not measured; per-day `updates.filter` is O(days×updates) (`calendar.ts:82-83`) | — |
| S3.1-14 | Team selector (`Team: [Engineering ▼]`) | MISSING | API accepts `teamId` (`calendar.ts:119`); no UI | — |

## S3.2 — Day view

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S3.2-01 | Blockers hoisted to top section | DONE | `ScrumCalendarViews.tsx:198-221` | — |
| S3.2-02 | 3+ days: 🔥, day count, RECURRING/ESCALATED | DONE | `ScrumUpdateCard.tsx:73-83` | — |
| S3.2-03 | Wins section, gold, `[👏 Celebrate]` | DONE | `ScrumCalendarViews.tsx:200`; `ScrumUpdateCard.tsx:97-110` | — |
| S3.2-04 | Proxy: amber border + proxy banner | PARTIAL | badge only `ScrumUpdateCard.tsx:67` | — |
| S3.2-05 | Absent card dimmed/dashed with Log-on-behalf + Send Reminder | PARTIAL | dashed name list `ScrumCalendarViews.tsx:222-232` | No actions. |
| S3.2-06 | `[Copy for standup]` plain-text digest | DONE | `ScrumCalendarViews.tsx:193-195, 345-369` | — |
| S3.2-07 | Compact / Expanded toggle | MISSING | — | — |
| S3.2-08 | Comments with @mention; author notified; attachments | PARTIAL | thread `ScrumUpdateCard.tsx:147-206`; notify `comments/route.ts:67-73`; attachments claimed `:56-65` | API accepts `mentions` but UI never sends any (`ScrumUpdateCard.tsx:160`) — no @mention picker. |
| S3.2-09 | ⭐ Mood visible only to self + manager (server-enforced) | DONE | `scrum-serializer.ts:18-47`; used by list/get/calendar/attention; test `scrum-serializer.test.ts` | Uses stored `managerId` — a former manager keeps access to historical mood. |
| S3.2-10 | ◀ ▶ + Today navigation | DONE | `ScrumHome.tsx:704-709`; `view-state.ts:72-79`; test `view-state.test.ts:29` | — |
| S3.2-11 | Header "6/6 submitted · 2 blockers · 1 win" + [Export] | PARTIAL | per-section counts only | No header summary, no Export. |
| S3.2-12 | Resolve / Escalate / Comment on blocker cards | DONE | `ScrumUpdateCard.tsx:121-142`; `ScrumBlockerDialogs.tsx` | — |

## S3.3 — Individual streak view

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S3.3-01 | Heatmap row, one square per working day | PARTIAL | `ScrumCalendarViews.tsx:237-259` | Only the viewed month (`ScrumHome.tsx:618`). |
| S3.3-02 | All six square states | PARTIAL | reuses `dotColor` | Same state collapsing as S3.1-02. |
| S3.3-03 | Stats: submission %, on-time %, blockers, wins | PARTIAL | submission % only (`:252`) | Future days counted as absent. |
| S3.3-04 | 🔥 consecutive streak counter | MISSING | — | — |
| S3.3-05 | < 75 % flagged 🔴 | DONE | `:252` | — |
| S3.3-06 | Month-over-month declining trend call-out | MISSING | — | — |
| S3.3-07 | Recurring blocker theme (≥3 in period) named | MISSING | — | — |
| S3.3-08 | Hover preview + click-through | MISSING | squares are inert `span`s (`:250`) | — |
| S3.3-09 | Range selector 1/3/6/12 months | MISSING | — | — |
| S3.3-10 | Single-user filter auto-switches to streak | MISSING | — | — |

## S3.4 — Week view

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S3.4-01 | 5-column week, each day's update as a card | DONE | `ScrumCalendarViews.tsx:94-157` | Team week, not "my week". |
| S3.4-02 | Carry-forward `→` chain across columns | MISSING | — | — |
| S3.4-03 | Chain amber after 3+ days | MISSING | — | — |
| S3.4-04 | Unresolved blocker spans its open days | MISSING | — | — |

## S4.1 — Compose filters

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S4-01 | User (specific / reports / team / dept / everyone) | PARTIAL | API `userId`/`teamId` (`calendar/route.ts:13-14`) | No UI; `userId` only follows the proxy selection (`ScrumHome.tsx:183`). |
| S4-02 | State: on time / late / absent / excused / proxy | PARTIAL | late + proxy only (`calendar.ts:34-35`; `view-state.ts:10`) | — |
| S4-03 | Content: has blocker / has win | DONE | `calendar.ts:32-33`; `ScrumHome.tsx:711-712` | — |
| S4-04 | Blocker status | MISSING | — | — |
| S4-05 | Blocker category | MISSING | — | — |
| S4-06 | Mood (permission-gated server-side) | MISSING | — | — |
| S4-07 | Project | PARTIAL | API only `calendar.ts:31` | — |
| S4-08 | Team / Dept | PARTIAL | API only `calendar.ts:119` | — |
| S4-09 | Date-range presets + custom | MISSING | month/week/day stepping only | — |
| S4-10 | Free-text search across 4 fields, term highlighted | PARTIAL | API `calendar.ts:36-43` | No UI, no highlighting. |
| S4-11 | Objective / Key Result filters (S11 addition) | MISSING | — | — |
| S4-12 | AND composition server-side; "only matching days render" | DEVIATES | filters remove updates before dots are built (`calendar.ts:46-50, 72-76`) | Non-matching members show as **absent** and cells red-tint when a filter is on. |
| S4-13 | Removable filter chips | PARTIAL | toggle buttons (`ScrumHome.tsx:711-719`) | — |
| S4-14 | URL-encoded, shareable filter state | MISSING | filters in `useState` (`ScrumHome.tsx:149`); only `?date/update/view` read | — |
| S4-15 | Saved views persist per user | DONE | `app/api/scrum/saved-views/route.ts`; `ScrumSavedViewsMenu.tsx`; `view-state.ts:112-126`; test `view-state.test.ts:51` | Own model rather than Filters Workspace reuse (acceptable). |
| S4-16 | Clear all → default view | PARTIAL | no Clear-all control | — |

## S5.1 — Blocker lifecycle

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S5-01 | Raise → OPEN + manager notified | DONE | `blocker-lifecycle.ts:35-66`; `scrum-updates.ts:271-279`; test `blocker-lifecycle.test.ts:14` | — |
| S5-02 | "Same as yesterday?" → RECURRING, daysOpen++, dept lead notified once | DONE | prompt `ScrumHome.tsx:329-339, 639-650`; `blocker-lifecycle.ts:40-47, 91-99`; `scrum-updates.ts:281-304`; tests `blocker-lifecycle.test.ts:29-127` | ≥ 0.8 similarity auto-merges without asking (spec: user confirms). |
| S5-03 | ⭐ 3+ days → ESCALATED, **CEO notified** | DEVIATES | status computed at submit (`blocker-lifecycle.ts:51`); side-effects only via finalize cron (`scrum-jobs.ts:53-66`) or manual; recipients = `escalatedToUserId` + manager (`blocker-actions.ts:93-99`) | CEO (`organizationSettings.companyCeoUserId`) never notified. Blockers submitted after 09:00 never auto-escalate. **High.** |
| S5-04 | Escalation auto-creates RAID ISSUE on linked project | DEVIATES | `blocker-actions.ts:52-63`; `lib/projects/raid.ts:94` | `raidItemId`/`escalatedAt` are not carried to the next day's row, so finalize (`escalatedAt: null` filter, `scrum-jobs.ts:59`) re-escalates the same blocker **every working day** → duplicate RAID issues, DelayEvents (daysLost double-counted) and notifications. Also unreachable from UI (S1.1-21). **High.** |
| S5-05 | Linked activity flagged blocked in Gantt | PARTIAL | `blocker-actions.ts:86`; `raid.ts:163-167` | `projectActivityId` is never set by the UI. |
| S5-06 | Resolve: note required, `blockerResolvedAt`, daysOpen recorded | DONE | `blocker-actions.ts:11-39`; `schemas.ts:79-81`; `ScrumBlockerDialogs.tsx:17-51` | Only that day's row is resolved; earlier rows of the same blocker stay OPEN. |
| S5-07 | Weekends/holidays excluded from daysOpen | DONE | `working-days.ts:76-94`; tests `working-days.test.ts:33`, `blocker-lifecycle.test.ts:29` | — |
| S5-08 | Escalated blockers on manager + CEO dashboards until resolved | MISSING | home dashboard counts only the viewer's own open blockers (`home.server.ts:468-473`) | — |
| S5-09 | Resolved → manager + originator notified | DONE | `blocker-actions.ts:31-37` | — |
| S5-10 | Tests: transitions, weekend handling, similarity | PARTIAL | `blocker-lifecycle.test.ts` (10 cases) | No test of escalation side-effects / idempotency. |

## S5.2 — Blocker taxonomy

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S5.2-01 | 9-category taxonomy enforced | DONE | `types/scrum.ts:17-27`; `schemas.ts:38` | — |
| S5.2-02 | Category required when blocker present | DONE | see S1.1-09 | — |
| S5.2-03 | `OTHER` requires free text | MISSING | — | — |
| S5.2-04 | Pareto of **days lost** by category, "41 % of blocked days are …" | DEVIATES | `scrum-analytics.ts:41-45`; list render `ScrumCalendarViews.tsx:284-287` | Sums each daily row's cumulative `blockerDaysOpen` → a 5-day blocker counts 1+2+3+4+5 = 15 days. No chart, no % sentence. |
| S5.2-05 | Client-owned categories → `DelayEvent` owner attribution | PARTIAL | `blocker-actions.ts:74-85` (owner CLIENT) | Only on escalation with a `projectId`, which the UI never sets. |

## S6.1 — Wins & recognition

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S6-01 | Optional wins field → `hasWin` | DONE | `ScrumHome.tsx:542-550`; `scrum-updates.ts:196` | — |
| S6-02 | Celebrate → notification + count | DONE | `updates/[id]/celebrate/route.ts:9-36`; `ScrumUpdateCard.tsx:97-110` | — |
| S6-03 | Wins section with gold border | DONE | `ScrumCalendarViews.tsx:200` | — |
| S6-04 | Friday digest lists every win of the week, attributed | DEVIATES | `scrum-jobs.ts:70-98` | Sends counts only; query is unbounded (`scrumDate lte today`, last 200 rows), so "this week" counts are wrong; no attribution. |
| S6-05 | Org-wide wins feed at `/dashboard/scrum/wins` | DONE | `app/api/scrum/wins/route.ts` (win-only projection); `ScrumWinsPage.tsx` | — |
| S6-06 | Win count exposed to Performance | DONE | `scrum-metrics.ts:46`; `lib/performance/metric-resolver.ts:103-116` | — |

## S7.1 — Automation, nudges & Telegram

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S7-01 | 08:00 reminder to non-submitters incl. yesterday's plan | DONE | `scrum-jobs.ts:11-13, 178-207` (`previousPlan` `:199`) | Iterates **all** active users with a pre-fill query each (N+1). |
| S7-02 | 09:00 one consolidated manager digest | DONE | `scrum-jobs.ts:19-51` | No late count in digest. |
| S7-03 | 09:05 single nudge, never repeated | DONE | `ScrumJobRun` guard `scrum-jobs.ts:190-203` | Untested. |
| S7-04 | No nudges on weekends/holidays | DONE | `scrum-jobs.ts:21,180`; crontab `1-5` | — |
| S7-05 | Excused absence → no nudge, not absent | DONE | `scrum-jobs.ts:189,192` | — |
| S7-06 | Friday digest: submission rate, all wins, all blockers (open+resolved), mood trend; team + manager | DEVIATES | `scrum-jobs.ts:85-94` | Only `winCount` + `openBlockerCount`; recipients are department members only. |
| S7-07 | Telegram delivery + deep link, honouring `telegramEnabled` | MISSING | no Telegram call in `scrum-jobs.ts` or `lib/notifications`; flag stored only (`settings.ts:23`) | — |
| S7-08 | All 5 job times configurable in `ScrumSettings` | DEVIATES | hard-coded crontab `scripts/install-crontab.sh:174-184` | Settings times are cosmetic. |
| S7-09 | Jobs secured by `Bearer CRON_SECRET` | DONE | `withCronAuth` in each `app/api/cron/scrum-*/route.ts`; `lib/cron-auth.ts` | `deploy/notifications-crontab.example:51-60` still uses `?key=`, which `withCronAuth` ignores (stale doc). |
| S7-10 | Nudge idempotency test (strategy §7.5) | MISSING | — | — |

## S8.1 — Team health dashboard

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| SC1 | Submission rate per person/team | PARTIAL | computed `scrum-analytics.ts:52-60` | Not rendered in the Health tab. |
| SC2 | Punctuality rate | PARTIAL | same | Not rendered. |
| SC3 | ⭐ Blocker Pareto | DEVIATES | see S5.2-04 | Over-counts. |
| SC4 | Blocker resolution time | PARTIAL | per-user `blockerResolutionDays` (`scrum-metrics.ts:39-42`) | Not rendered. |
| SC5 | ⭐ Mood trend line per team | PARTIAL | `moodTrend` totals `scrum-analytics.ts:64-67` | No time series, not rendered. |
| SC5-alert | Team 🔴 ≥ 10 working days → CEO alert | DONE | `mood-alert.ts`; `scrum-jobs.ts:127-176`; tests `mood-alert.test.ts` (min 3 reporters) | — |
| SC6 | Win frequency per person/team | PARTIAL | totals only | — |
| SC7 | Streak leaderboard | MISSING | — | — |
| SC8 | Self vs proxy ratio; >30 % flagged | PARTIAL | `ScrumCalendarViews.tsx:291` | No flag, no stacked bar. |
| SC9 | Carry-forward rate; >40 % flagged | PARTIAL | `scrum-analytics.ts:96-104` | % of updates (string search on JSON), not items; no flag. |
| SC10 | Recurring blocker themes | MISSING | — | — |
| S8-11 | ⭐ Individual mood never beyond self + manager (incl. aggregates) | PARTIAL | serializer DONE | Analytics mood aggregates have no minimum group size (`teamId`/`userIds` of any size), and DEPARTMENT_LEAD scope includes non-reports — small groups reveal individuals. |
| S8-12 | All charts export to PNG | PARTIAL | `ScrumCalendarViews.tsx:371-402` | Text summary, not charts; reads `data.submissionRate`, which the API never returns → always "0%" (`:386`). |
| S8-13 | Charts (recharts) | MISSING | no chart components | — |
| S8-14 | Mood disabled → mood analytics hidden | PARTIAL | form hidden | API still returns `moodTrend`. |
| S8-15 | Analytics access: managers/admins only | DONE | `scrum-analytics.ts:21-26`; `analytics/route.ts:11`; test `access.test.ts:61` | — |

## S9 — Integration (OKR / Performance / PM)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S9.1-01 | Linked Todo's activity feed shows the update | PARTIAL | `/api/scrum/links` logs `SCRUM_LINK` with `todoId` (`links/route.ts:32-40`) | UI never calls `/links`; form path writes no TODO links. |
| S9.1-02 | KR detail page shows recent scrum mentions | PARTIAL | `app/dashboard/key-results/[id]/page.tsx:80` | Only WIN-context links are ever persisted (see S11.1-02), so Today/Blocker mentions never appear. |
| S9.1-03 | Todo not mentioned 5+ working days → "stalled" | MISSING | — | — |
| S9.1-04 | Project-linked update appears in PM project feed | MISSING | project page renders PM `ScrumLogWidget` (`ProjectDeliveryControlCenter.tsx:146`), not `ScrumActivityPanel`; `projectId` never set | — |
| S9.1-05 | (Extension) items become real Todos; removed items cancelled | DEVIATES | `items.ts:105-195`, called in `scrum-updates.ts:193` | Not in spec; creates/cancels/completes Todos with **no ActivityLog**; amend deletes-and-recreates links. Needs product sign-off. |
| S9.2-01 | `GET /api/scrum/metrics/[userId]` (rate, punctuality, wins, resolution) | DONE | `app/api/scrum/metrics/[userId]/route.ts`; `scrum-metrics.ts:51-68` | — |
| S9.2-02 | ⭐ Mood physically absent from metrics API (tested) | DONE | `scrum-metrics.ts:70-77`; test `scrum-metrics.test.ts:6` | — |
| S9.2-03 | Performance auto-pulls scrum Metric criteria | DONE | `lib/performance/metric-resolver.ts:103-116`; `cycle-opening.ts:188-190` | — |
| S9.2-04 | Scoring rules (`min(10, rate/10)`, banded wins, inverse-banded resolution) | PARTIAL | raw values returned (`resolveScrumMetricValue` `scrum-metrics.ts:79-87`) | No scrum-specific banding found. |
| S9.3-01 | Escalated client blocker → `DelayEvent` with attribution | PARTIAL | `blocker-actions.ts:74-85`; `raid.ts:127-161` | Server-only; duplicate per day (S5-04). |
| S9.3-02 | Escalation → `RaidItem` ISSUE | PARTIAL | see S5-04 | Duplicates. |
| S9.3-03 | PM G6 removed — this module is the single source | DEVIATES | see DM-09 | — |

## S10 — Settings & absences

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S10-01 | Settings UI, Admin only | DEVIATES | page gate `settings/page.tsx:11`; write = ADMIN **or EXECUTIVE** (`access.ts:96-99`; seed `seed-scrum-permissions.ts:118`); `GET /api/scrum/settings` open to any signed-in user (`settings/route.ts:10`) | Spec: EXECUTIVE read-only, settings L2 Admin. |
| S10-02 | All toggles functional immediately | PARTIAL | mood: form `ScrumHome.tsx:564` + server `scrum-updates.ts:217`; proxy: UI `:406` + 403 `scrum-updates.ts:90` | `winsEnabled` UI-only; `telegramEnabled` no-op; `requireTodoLink` never enforced. |
| S10-03 | Working days, holidays, timezone editable | PARTIAL | API supports (`schemas.ts:96,104-105`) | No UI fields (`ScrumSettingsPage.tsx:51-76`); `objectiveNeglectDays` has no input either. |
| S10-04 | Ethiopian holidays seeded | DONE | `scripts/seed-scrum-settings.ts:38-52` (kenat) | — |
| S10-05 | Timezone `Africa/Addis_Ababa` | DONE | `types/scrum.ts:51`; `working-days.ts:41-51` | — |
| S10-06 | Cutoff change applies to later submissions | DONE | `isLateSubmission` at save time | Undermined by S1.1-13 on re-save. |
| S10-07 | Holiday → no nudges, no absences | DONE | `scrum-jobs.ts:21,180`; `calendar.ts:69` | — |
| S10-08 | Settings changes audited | DONE | `settings/route.ts:28-36` | — |
| S10.2-01 | Absence: single day + range in one action | DONE | `absences/route.ts:33-54`; `ScrumAbsenceModal.tsx` | — |
| S10.2-02 | Excused excluded from nudges, absent counts, rate denominators | DONE | `scrum-jobs.ts:189`; `calendar.ts:84`; `scrum-metrics.ts:35` | — |
| S10.2-03 | Blue state on calendar | DONE | `dotColor('excused')` | — |
| S10.2-04 | Absence permissions (manager team; employee read own) | PARTIAL | manage rule `absences/route.ts:38` | Employees may record their own absences (spec: read-only). Low. |
| S10.2-05 | Correct / delete an absence | MISSING | no DELETE route | Low. |

## §11 — Permissions & hard privacy rules

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| P-01 | DocTypes `scrum_update/comment/absence/settings` (+ `scrum_update_link`) and sensitive fields | DONE | `scripts/seed-scrum-permissions.ts:19-36` (mood permLevel 2, blockers 1) | — |
| P-02 | Default role matrix | PARTIAL | `seed-scrum-permissions.ts:97-127` | EXECUTIVE gets settings write; DEPARTMENT_LEAD gets settings read. |
| P-03 | ⭐ Mood readable only by subject + direct manager | DONE | `scrum-serializer.ts`; test `scrum-serializer.test.ts:14-29` | Aggregate caveat in S8-11. |
| P-04 | ⭐ Mood absent from Performance metrics API | DONE | see S9.2-02 | — |
| P-05 | ⭐ Peers cannot proxy (403) | DONE | see S2-03 | — |
| P-06 | ⭐ Proxy attribution can never be removed | DEVIATES | see S2-11 | — |
| P-07 | Employee reads team updates without mood | DONE | `scrum-updates.ts:347-357`; `access.ts:132-138` | — |
| P-08 | Blockers (L1) not exposed outside team scope | DEVIATES | `ScrumActivityPanel.tsx:37-54` queries updates by link with no viewer check | Anyone who can open an Objective/KR page sees other departments' plans and blockers. `/api/scrum/attention` does filter (`attention/route.ts:26-29`). |
| P-09 | Wins org-wide, win fields only | DONE | `wins/route.ts:9-35` | — |

## §12 — Notifications

| ID | Event | Status | Evidence | Gap |
|---|---|---|---|---|
| N-01 | `SCRUM` category | DONE | `lib/notifications/events.ts:24,300` | — |
| N-02 | `SCRUM_REMINDER` 08:00 | DONE | `scrum-jobs.ts:11-13`; template `templates/index.ts:1322` | — |
| N-03 | `SCRUM_MISSED` 09:05 once | DONE | `scrum-jobs.ts:15-17` | — |
| N-04 | `SCRUM_MANAGER_DIGEST` consolidated | DONE | `scrum-jobs.ts:40-49` | — |
| N-05 | ⭐ `SCRUM_BLOCKER_RAISED` → manager | DONE | `scrum-updates.ts:271-279` | — |
| N-06 | ⭐ `SCRUM_BLOCKER_RECURRING` → dept lead | DONE | `scrum-updates.ts:281-304` (fallback manager) | — |
| N-07 | ⭐ `SCRUM_BLOCKER_ESCALATED` → CEO | DEVIATES | `blocker-actions.ts:93-99` | Goes to manager/escalation target, never CEO. |
| N-08 | `SCRUM_BLOCKER_RESOLVED` → manager + originator | DONE | `blocker-actions.ts:31-37` | — |
| N-09 | `SCRUM_PROXY_SUBMITTED` → subject | DONE | `scrum-updates.ts:305-313` | — |
| N-10 | `SCRUM_WIN_CELEBRATED` → author | DONE | `celebrate/route.ts:26-34` | — |
| N-11 | `SCRUM_COMMENT` → author (+ mentions) | DONE | `comments/route.ts:67-73` | — |
| N-12 | `SCRUM_WEEKLY_DIGEST` team + manager, Friday | DEVIATES | `scrum-jobs.ts:70-98` | Content/window/recipients (S7-06). |
| N-13 | ⭐ `SCRUM_TEAM_MOOD_ALERT` → CEO | DONE | `scrum-jobs.ts:167-172` | — |
| N-14 | `SCRUM_LOW_SUBMISSION_RATE` weekly → manager | MISSING | registered `events.ts:279`, template `templates/index.ts:1422`, **never emitted** | — |
| N-15 | `SCRUM_OBJECTIVE_NEGLECTED` → owner + CEO at 14 working days | DEVIATES | `scrum-jobs.ts:103-116` | Selects every ACTIVE objective with **zero links ever**; ignores `objectiveNeglectDays`; no idempotency → nightly repeats for up to 50 objectives. Because only WIN links are persisted, nearly every objective qualifies. **High (notification spam to CEO).** |
| N-16 | Email templates for scrum events | DONE | `lib/email/templates/index.ts:457-520, 1322-1445` | Dead keys `SCRUM_NUDGE`, `SCRUM_UPDATE_AMENDED`, `SCRUM_COMMENT_ADDED` registered but unused. |

## §13 — Cron jobs

| ID | Route | Status | Evidence | Gap |
|---|---|---|---|---|
| C-01 | `scrum-reminder` 08:00 EAT | DONE | route + `install-crontab.sh:177` (05:00 UTC) | — |
| C-02 | `scrum-finalize` 09:00 (absences · digest · escalation) | PARTIAL | `scrum-jobs.ts:19-68`; `install-crontab.sh:179` | Escalation duplicates (S5-04); fake ADMIN session built from `submittedById` (`:65`). |
| C-03 | `scrum-nudge` 09:05 | DONE | `install-crontab.sh:181` | — |
| C-04 | `scrum-weekly` Fri 16:00 | PARTIAL | `install-crontab.sh:183` | Content (S7-06). |
| C-05 | `scrum-health` 02:00 recompute streaks, rates, mood, blocker days | PARTIAL | `scrum-jobs.ts:100-119` | Only neglect alert + mood alert; SC11–SC16 not computed. |
| C-06 | All secured by Bearer `CRON_SECRET` | DONE | `lib/cron-auth.ts` | Stale `?key=` example (S7-09). |

## S11 — OKR linkage (strategy §2.12 / P9)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S11.1-01 | Join table; exactly one FK; `linkType` derived server-side | DONE | `scrum-links.ts:6-22`; `schemas.ts:123-132`; test `scrum-links.test.ts` | Optional raw SQL CHECK not added (documented as optional). |
| S11.1-02 | `context` auto-derived from the field (TODAY/BLOCKER/WIN/YESTERDAY) and persisted | PARTIAL | only WIN links written (`scrum-updates.ts:248-257`); UI sends `links: []` (`ScrumHome.tsx:352`) | Today/Blocker OKR picks are stored only on `contentJson` items and Todos, **never** as `ScrumUpdateLink`. Root cause of S9.1-02, S11.2 and N-15 issues. |
| S11.1-03 | Scoped picker: KR owner/contributor; Objective owner/contributor/dept; Todo assignee/member; active timeframe | PARTIAL | full scope in `scrum-links.ts:41-104` | UI requests `ownerOnly=true` (`queries.ts:46`) and save rejects non-owned (`scrum-links.ts:106-135`) — contributor/department OKRs can never be linked; Todos not offered (`ScrumHome.tsx:399-404`). |
| S11.1-04 | ⭐ Suggested links from last 3 updates | PARTIAL | `scrum-links.ts:137-156` | Returned by API, not rendered. |
| S11.1-05 | Live progress % / confidence chip | MISSING | fields fetched (`scrum-links.ts:78-86`), not shown | — |
| S11.1-06 | Section hidden when user has no linkable entities | DONE | `ScrumItemList.tsx:129` | — |
| S11.1-07 | Proxy picker shows the **subject's** OKRs | DONE | `linkable/route.ts:8-13`; `ScrumHome.tsx:155` | — |
| S11.1-08 | Carry-forward inherits links | PARTIAL | carried items keep `objectiveId/keyResultId` (`ScrumYesterdayPanel.tsx:31-38`) | `inheritedLinks` from `prefill.ts:63,92,129-156` never consumed by the UI. |
| S11.1-09 | `progressNote` ≤ 120 chars | PARTIAL | schema `scrum-links.ts:11` | No UI. |
| S11.1-10 | Invariant #11 — zero links always submits; never a gate/penalty | DONE | links optional throughout; `requireTodoLink` not enforced | — |
| S11.1-11 | Link cost < 10 s median measured | MISSING | — | — |
| S11.2-01 | Daily Activity panel on Objective + KR detail, composed at route level | DONE | `app/dashboard/objectives/[id]/page.tsx:22,178`; `app/dashboard/key-results/[id]/page.tsx:6,80` | — |
| S11.2-02 | Summary stats, per-person heatmap, context badges, inline escalate, empty-state signal | PARTIAL | `ScrumActivityPanel.tsx:61-106` (3–6 row list + empty text) | — |
| S11.2-03 | Mood never shown | DONE | not selected (`ScrumActivityPanel.tsx:40-53`) | — |
| S11.2-04 | Panel respects scrum visibility | DEVIATES | see P-08 | — |
| S11.2-05 | Design tokens | DEVIATES | inline `style={{ borderColor: 'var(--ap-border)' }}`, `text-muted-foreground`, `text-sm` (`ScrumActivityPanel.tsx:62-66`) | Low. |
| S11.3-01 | SC11 mention counts per entity | PARTIAL | `attention/route.ts:31-36`; `lib/okr/evidence.ts:52-90` | Starved by S11.1-02. |
| S11.3-02 | ⭐ SC12 neglected objective (14 working days) → owner + CEO | PARTIAL | see N-15 | Built but wrong (counted in N-15 as DEVIATES). |
| S11.3-03 | ⭐ SC13 divergence (both directions) | MISSING | — | — |
| S11.3-04 | SC14 / SC15 blocker / win concentration | MISSING | — | — |
| S11.3-05 | SC16 individual focus rate, excluded from metrics API (tested) | PARTIAL | metrics return only 4 keys (`scrum-metrics.test.ts:6`) | SC16 not implemented; exclusion holds trivially. |
| S11.3-06 | Surface attention on CEO Portfolio dashboard | MISSING | — | — |

## Global DoD / guardrails (dimension F)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| F-01 | `withAuth`, envelope, zod on every input | PARTIAL | all scrum routes use `withAuth` + `apiSuccess` | `confirm/route.ts:6-7` passes raw `body.amend` unvalidated. |
| F-02 | `recordActivity()` on every mutation | PARTIAL | updates, proxy, amend, comments, celebrate, blockers, links, saved views, settings, absences all log | Todo create/cancel/complete in `syncScrumTodos` (`items.ts:125-187`) and link replacement on save (`scrum-links.ts:24-39`) are unaudited. |
| F-03 | Shared types in `types/` | DONE | `types/scrum.ts` | — |
| F-04 | `react-hook-form`, no raw `useState` form state | PARTIAL | main forms use RHF | `ScrumItemList.tsx:35` new-item input uses `useState`. |
| F-05 | `Modal` / `ConfirmDialog` / `EmptyState` primitives | DONE | `ScrumHome.tsx:639,665`; `ScrumBlockerDialogs.tsx`; `ScrumCalendarViews.tsx:205,266` | — |
| F-06 | Tokens only, `cn()`, no hex | PARTIAL | module uses tokens | `ScrumActivityPanel.tsx` inline style / non-token classes. |
| F-07 | Barrel exports; features never import features | PARTIAL | `features/scrum/index.ts`; route-level composition | Routes import `@/features/scrum/services/*` internals (e.g. `app/api/scrum/updates/route.ts:3-7`); `lib/performance/metric-resolver.ts:3` and `lib/dashboards/home.server.ts:23-24` import feature internals from `lib/`. |
| F-08 | Tests: pre-fill · working-day · blocker machine · proxy auth · mood privacy | PARTIAL | 81 tests pass | Missing: DB-path pre-fill, proxy mood strip, attribution integrity, nudge idempotency, escalation side-effects, calendar/filter behaviour, neglect math. |
| F-09 | No dead code | DONE* | — | *`lib/stores/scrum-store.ts` is unused (drafts/collapse/filters never wired) — low. Counted DONE because it causes no harm. |

---

## Gaps to fix (prioritised)

Severity: **H** = breaks an invariant/ACs or causes bad data/spam in production · **M** = visible feature gap or privacy
weakness · **L** = polish / docs. Effort: **S** ≤ ½ day · **M** 1–2 days · **L** 3+ days.

| # | Sev | Effort | Gap | Where | Fix direction |
|---|---|---|---|---|---|
| 1 | H | S | Persisting blocker re-escalated **every working day** → duplicate RAID issues, DelayEvents (days double-counted) and notifications | `scrum-jobs.ts:53-66`; `scrum-updates.ts:199-228` (doesn't carry `raidItemId`/`escalatedAt`) | When the lifecycle confirms "same blocker", copy `raidItemId`, `escalatedAt`, `escalatedToUserId` from the previous row; make finalize skip blockers whose chain already escalated. Add a test. |
| 2 | H | S | `SCRUM_OBJECTIVE_NEGLECTED` fires nightly for up to 50 objectives with no window/idempotency | `scrum-jobs.ts:103-116` | Use last-link date vs `objectiveNeglectDays` working days, `ScrumJobRun` guard, fire once per threshold crossing. Gate on #6 first or it still fires for nearly everything. |
| 3 | H | S | Escalation never notifies the CEO (spec ⭐) | `blocker-actions.ts:93-99` | Add `organizationSettings.companyCeoUserId` (fallback EXECUTIVEs) to recipients; also escalate at submit time, not only at 09:00. |
| 4 | H | S | Re-saving an update rewrites `submittedAt`/`isLate`/`status` (attendance integrity, invariant #3) | `scrum-updates.ts:100-101, 207, 220-247` | Only set `submittedAt/isLate/status` on first submit; amendments set `amendedAt` only. |
| 5 | H | S | Proxy POST overwrites a subject's self-submitted update and converts it to a proxy entry (invariant #5) | `scrum-updates.ts:243-247` | If an existing non-draft self-report exists and actor ≠ subject, return 409. Add attribution-integrity test. |
| 6 | H | M | Today/Blocker OKR picks never become `ScrumUpdateLink` rows (only WIN) → S11 panels, attention, KR mentions, neglect alert all wrong | `scrum-updates.ts:248-257`; `ScrumHome.tsx:352` | Derive links for every item with `objectiveId/keyResultId/todoId` using its section as `context`; consume `inheritedLinks`; allow contributor/department scope consistently between picker and `validateLinkOwnership`. |
| 7 | M | M | No project / project-activity selector in the form → RAID, DelayEvent, Gantt flag, project feed unreachable | `ScrumHome.tsx:88-89` (state only) | Add optional project (+ activity) select scoped to the user's projects; show `ScrumActivityPanel` on project detail. |
| 8 | M | S | `ScrumActivityPanel` has no viewer access check (blockers L1 leak across departments) | `ScrumActivityPanel.tsx:37-54` | Filter authors with `canViewScrumUser` (as `attention/route.ts` does) or pass the session in. |
| 9 | M | S | Filters and future days render members as "absent" and red-tint cells | `calendar.ts:46-50, 69-95` | Build dots from unfiltered data, apply filters as highlight/visibility; treat `date > today` as `future`. |
| 10 | M | S | Blocker Pareto over-counts (sums cumulative `blockerDaysOpen` per row) | `scrum-analytics.ts:41-45` | Count one day per blocker-day (or take max per `blockerFirstRaisedAt` chain); add "% of blocked days" sentence. |
| 11 | M | S | Weekly digest window/content/recipients wrong | `scrum-jobs.ts:70-98` | Bound to Mon–Fri of the current week; include submission rate, attributed wins, open+resolved blockers, team mood trend; add managers. |
| 12 | M | S | Mood aggregates have no minimum group size; still returned when mood is disabled | `scrum-analytics.ts:64-67` | Suppress `moodTrend` for groups < 3 reporters (reuse `MOOD_ALERT_MIN_REPORTERS`) and when `moodEnabled=false`. |
| 13 | M | M | Proxy Confirm/Amend has no UI; confirm route unvalidated and accepts non-proxy rows; no reason banner / "Logged by" | `confirm/route.ts`; `scrum-updates.ts:368-400`; `ScrumUpdateCard.tsx:67` | Zod schema, `isProxyEntry` check, subject banner with Confirm/Amend, green ✓, author name. |
| 14 | M | M | Invariant #10 broken: PM G6 `ScrumLog` built and shown on project page | `ScrumLogWidget.tsx`; `ProjectDeliveryControlCenter.tsx:146`; `app/api/projects/[id]/scrum-log` | Product decision: retire G6 or back it with `ScrumUpdate`. |
| 15 | M | M | Telegram delivery missing (reminder/nudge "In-app + Telegram"; `telegramEnabled` is a no-op) | `scrum-jobs.ts`; `settings.ts:23` | Use `lib/telegram/client` with the user↔chat mapping; honour the toggle. |
| 16 | M | L | Filters: 6 of 10 dimensions missing in UI, no URL-encoded state, no chips/clear-all, no Objective/KR filters, no highlight | `ScrumHome.tsx:149, 691-724`; `calendar.ts` | Add filter bar + `searchParams` sync; mood filter server-gated. |
| 17 | M | L | Health tab shows 3 numbers; SC1/2/4/5/6/7/10 not rendered, no recharts, flags (>30 % proxy, >40 % carry) missing; PNG shows "0 %" submission | `ScrumCalendarViews.tsx:261-299, 386` | Build SC charts with recharts from the existing payload; fix PNG field. |
| 18 | M | M | Escalated blockers not surfaced on manager/CEO dashboards | `home.server.ts:468-473` | Add escalated-blocker list for managed users / CEO. |
| 19 | M | S | `SCRUM_LOW_SUBMISSION_RATE` never emitted | `events.ts:279` | Emit from `scrum-weekly` per manager for reports < 75 %. |
| 20 | L | L | Streak view (streak counter, trend, themes, hover/click, range), week-view carry chain/drift/blocker span, month grid weekday alignment/today border/holiday labels, side panel, compact toggle, absent-card actions | `ScrumCalendarViews.tsx` | UI build-out per S3.1–S3.4. |
| 21 | L | M | S1 micro-interactions: countdown, autofocus, pre-fill styling/restore, panel collapse persistence (unused `scrum-store`), dated panel title, 3-day carry flag, no forced auto-carry, mobile collapse, Addis-timezone default date, `OTHER` free text | `ScrumHome.tsx`, `ScrumYesterdayPanel.tsx`, `ScrumItemList.tsx` | Mostly S each. Decide whether item-list redesign replaces the rich-text spec formally. |
| 22 | L | S | Settings: EXECUTIVE can write, `GET /settings` open to all, no UI for working days/holidays/timezone/neglect days; job times not configurable | `access.ts:96-99`; `settings/route.ts:10`; `ScrumSettingsPage.tsx`; `install-crontab.sh:174-184` | Align with spec §11 or record an approved deviation. |
| 23 | L | S | Audit gaps: Todo create/cancel/complete from scrum and link replacement unlogged | `items.ts:125-187`; `scrum-links.ts:24-39` | `recordActivity` per Todo mutation (or one summary entry). |
| 24 | L | M | Test gaps: DB pre-fill, proxy mood strip, attribution integrity, nudge idempotency, escalation idempotency, neglect math, calendar filters | `features/scrum/services/*.test.ts` | Add pure-function extractions + tests. |
| 25 | L | S | Docs/layering: stale `?key=` crontab example; `lib/*` importing `features/scrum/services/*`; S11 not in build spec; status enum comment | `deploy/notifications-crontab.example:51-60`; `lib/performance/metric-resolver.ts:3` | Doc fixes; route through the barrel. |

### Tracker drift (for the tracker owner)
The tracker marks the cross-cutting "Tests" and "`SCRUM` notification keys" rows ✅ and S9.2/S11.1 dimension D ✅.
Against this audit: S11.1 D fails (context/links, scoping), notifications include one never-emitted key (N-14) and three
mis-targeted/mis-scoped ones (N-07, N-12, N-15), and the tracker does not record gaps #1–#5 at all.
