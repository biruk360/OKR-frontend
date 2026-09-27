# Daily Scrum Module — Implementation Tracker

**Governs:** `docs/daily_scrum_module_BUILD_SPEC.md` (WHAT) + `docs/daily_scrum_module_IMPLEMENTATION_STRATEGY.md` (HOW).
**Codex: update the relevant row(s) every time you touch a story. A row is ✅ only when A–F all pass.**

## How to read a row (the verification protocol — strategy §0.1)

Each story is scored on 6 dimensions. Mark each cell `✅` done · `🟡` partial (add note) · `⬜` not started · `—` n/a.

| Col | Dimension | Pass when… |
|-----|-----------|-----------|
| **A** | User Story | the "As a… I want… so that…" outcome is genuinely delivered |
| **B** | Attributes/Fields | every field present with correct type/required/default/validation/derivation |
| **C** | UI/UX Detail | UI matches the mock structure **and** every micro-interaction is implemented (+ mobile where specified) |
| **D** | Acceptance Criteria | every Given/When/Then passes (test or recorded walk-through) |
| **E** | Definition of Done | every DoD `[ ]` checkbox ticked |
| **F** | Guardrails & UI/UX | conforms to `CLAUDE.md` + `docs/DESIGN_SYSTEM.md` + module invariants (envelope, `recordActivity`, barrel, no hex, tokens, reuse, privacy/optional-link invariants) |

**Status** = overall (⬜ / 🟡 / ✅). Keep the **Notes** column current — it's where partial gaps and design decisions get recorded.

---

## Phase status

| Phase | Epic(s) | Status | Notes |
|-------|---------|--------|-------|
| P0 Foundations | model, seeds, nav, serializer/working-days skeletons | ✅ | Schema, seeds, serializer, CI branch trigger, and build-spec reconciliation completed; `prisma validate`, `db push`, seed scripts, `test:scrum`, `tsc`, and `build` pass |
| P1 Core loop ⭐ | S1 | 🟡 | Submit/upsert, prefill, autosave draft buffer, carry-forward UI, inherited links, and dashboard widget implemented; full manual UX timing/mobile pass still needed |
| P2 Visualization ⭐ | S3 | 🟡 | Month/day/streak/week/health views implemented with server aggregation; copy-for-standup and PNG health export implemented; side-drawer polish/mobile manual pass remain |
| P3 Filtering | S4 | 🟡 | Date/user/blocker/win/state filters implemented server-side; URL-shareable saved-view UI remains partial |
| P4 Proxy entry | S2 | 🟡 | Proxy subject lookup, reason/detail, mood omission, proxy confirm route, and immutable attribution implemented; full peer-403/manual walkthrough still pending |
| P5 Blockers | S5, S9.3 | 🟡 | Blocker lifecycle, resolve/escalate, RAID/Delay seams, activity-blocked flag, cron escalation, and lifecycle tests implemented; fuzzy-confirm UI remains |
| P6 Automation | S7 | 🟡 | Five cron routes, idempotency rows, manager/weekly/health jobs, crontab entries, and notification emits implemented; Telegram direct send is deep-link/no-op until user-chat mapping exists |
| P7 Wins & analytics | S6, S8 | 🟡 | Wins page, celebrate route, health analytics, Pareto/proxy/carry-forward aggregates, and PNG export implemented; full SC dashboard polish remains |
| P8 Integration & admin | S9, S10 | 🟡 | Settings/absence APIs and UI, Performance Scrum metric resolver/mapping UI, mood-free metrics API, dashboard widget, PM panel, and metric privacy tests implemented |
| P9 OKR linkage | S11 | 🟡 | Join table, scoped picker, selectable update links, carried-link inheritance, route-level Objective/KR panels, attention endpoint, and neglect cron implemented; richer attention UI remains |

---

## Story-level tracker

| Story | Title | A | B | C | D | E | F | Status | Notes |
|-------|-------|---|---|---|---|---|---|--------|-------|
| S1.1 | Submit my daily update | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Form/API/upsert/derived flags/lateness implemented. F4 (2026-09-25): 10s autosave + restore-on-return + Discard, Cmd/Ctrl+Enter submit, G7 (2026-09-25): **server drafts** — "Save draft" stores the row with existing `ScrumUpdate.status = 'DRAFT'` (no schema change) and no To-do sync, links, activity or notifications; submitting it runs those once as a first submit (not an amend). Drafts are owner-only (not proxy), never overwrite a submitted row, restored via prefill `serverDraft` (newer of server/device copy wins), discardable (`DELETE /api/scrum/updates/[id]`, drafts only). Every counting read excludes DRAFT (`features/scrum/services/drafts.ts`, guarded by `drafts.test.ts`); home dashboard `todaySubmitted` ignores drafts. Device-local autosave kept as fallback. Manual <60s/mobile pass pending |
| S1.2 | View previous day's plan while updating | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Previous-plan panel, carry action, carried-link inheritance, and regression tests implemented; manual timing/mobile pass pending |
| S2.1 | Submit on behalf (proxy) | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Proxy auth/service/form/confirm implemented; peer-403 authorization regression covered; manual amend walkthrough pending |
| S3.1 | Team month calendar ("The Wall") | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Server aggregation and dot states implemented. F4: day header opens day view; dots are labelled buttons that open + highlight that update; stat cards count the visible month only; performance/mobile manual pass pending |
| S3.2 | Day view | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | F4: day view now filters to the selected day (was the whole month); ◀ ▶ step days; blocker status/category/🔥 days-open; Celebrate, Comment thread, Mark resolved, Escalate on cards; "No update" list. Deep links `?date=`/`?update=`/`?view=` read (update is scrolled to + highlighted). Pending: compact/expanded toggle, @mention picker, absent-card proxy/reminder actions |
| S3.3 | Individual streak view | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Streak grid implemented; richer trend labels pending |
| S3.4 | Week view | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | F4: selected ISO week (Mon–Sun, server working days/holidays), columns per day, clicking a day or update opens day view; ◀ ▶ step weeks. Carry-forward chain, drift amber and blocker span still pending |
| S4.1 | Compose filters | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Core filters implemented. F4: saved views UI (save current filters + view, apply, delete with ConfirmDialog); state filter on FilterSelect. Filter state is still not written to the URL; user/mood/category/project/free-text filters pending |
| S5.1 | Blocker lifecycle | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | F4: "Same blocker as yesterday?" prompt on submit (same category + ≥0.65 similarity) → `sameBlockerConfirmed`; "new" restarts the clock; resolved blockers never carry over; `SCRUM_BLOCKER_RECURRING` emitted once on first move to RECURRING (dept leads, fallback manager); resolve (note ≥5) / escalate (optional target) UI for owner/manager via `viewerCanActOnBlocker`. Tests added. Manual walkthrough pending |
| S5.2 | Blocker taxonomy | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | 9 categories and Pareto implemented; UX polish/manual pass pending |
| S6.1 | Capture & celebrate wins | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | F4: Celebrate button + count on day-view cards and the Wins page; Wins cards show author name/avatar; skeleton loading; audit action `CELEBRATED`. Manual walkthrough pending |
| S7.1 | Daily rhythm / nudges / Telegram | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Cron jobs and idempotency implemented; Telegram send awaits user-chat mapping |
| S8.1 | Team health dashboard | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Analytics service, Health tab, and PNG export implemented. F4: `SCRUM_TEAM_MOOD_ALERT` emitted by the daily health job when a department is red (≥50% STRUGGLING, ≥3 reporters) for `moodAlertDays` consecutive completed working days → CEO (fallback EXECUTIVEs), idempotent per dept/day, repeats every further threshold run. Full SC1-SC10 charts pending |
| S9.1 | Link updates to real work | — | — | — | — | — | — | — | **superseded by S11** |
| S9.2 | Feed the Performance module | 🟡 | ✅ | 🟡 | ✅ | 🟡 | ✅ | 🟡 | Scrum metrics API and Performance mapping/resolver implemented; mood and SC16 exclusion regression covered |
| S9.3 | Feed the PM module | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | RaidItem/DelayEvent wrappers and project panel implemented; G6/ScrumLog intentionally left unwired in favor of ScrumUpdate |
| S10.1 | Configure scrum settings | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Settings page/API/upsert implemented; manual permission walkthrough pending |
| S10.2 | Record excused absences | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | F4: "Absence" modal on Daily Scrum — self, or reports (proxy-subject list = the route's manage rule); date range, type, reason. Manual walkthrough pending |
| S11.1 | Link an update to my OKRs | 🟡 | ✅ | 🟡 | ✅ | 🟡 | ✅ | 🟡 | Optional scoped picker, selectable links, one-FK guard, link-type derivation tests, and carry-forward inheritance implemented; richer inline context inference remains UI polish |
| S11.2 | See daily activity from OKR side | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Route-level panels injected into Objective/KR and Project pages; richer tab/heatmap UI pending; mood never selected |
| S11.3 | Attention analytics ⭐ | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Attention endpoint and neglect cron implemented; SC16 remains excluded from metrics API, explicit test pending |

---

## Cross-cutting checklist (global DoD — spec §14.2)

| Item | Status | Notes |
|------|--------|-------|
| Prisma models + `@@unique([userId, scrumDate])` + indexes (via `db push`) | ✅ | schema added; `npx prisma validate` + `npx prisma db push` + Prisma Client generate pass on local Postgres `okr_system` |
| `ScrumUpdateLink` join table + back-relations + app-layer "one FK" guard | ✅ | schema/back-relations added; zod route guard derives link type server-side |
| Doctypes registered + defaults seeded (`seed-scrum-permissions.ts`) | ✅ | `db:seed:scrum-permissions` upserted 5 doctypes, 16 sensitive fields, 20 role permission rows; `db:seed:scrum-settings` seeded default settings with 10 public holidays |
| Mood serializer (self + direct manager only) + test | ✅ | serializer + test added; `npm run test:scrum` passes |
| Mood & SC16 absent from metrics API + tests | ✅ | Metrics serializer returns only submissionRate, punctualityRate, winCount, blockerResolutionDays; regression asserts mood and SC16 are excluded |
| `SCRUM` notification category + keys + `SCRUM_OBJECTIVE_NEGLECTED` + templates | ✅ | category/events/deep links/email template branches added |
| 5 cron routes + crontab entries + tz note | ✅ | reminder/finalize/nudge/weekly/health routes added; crontab documents UTC/Addis Ababa timing |
| `recordActivity()` on every mutation (incl. proxy + amend) | 🟡 | Core mutations record activity. F4: settings → `SCRUM_SETTINGS`, saved views → `SCRUM_SAVED_VIEW`, links → `SCRUM_LINK`, celebrate → `CELEBRATED` (interim `metadata.event` removed); exhaustive route audit still needed |
| Barrel `features/scrum/index.ts`; features never import features | ✅ | barrel exports services/hooks/pages/panel; route pages compose Scrum panels, feature internals do not import Scrum |
| Design system: tokens only, no hex, `cn()`, skeletons | 🟡 | Uses existing primitives/tokens; final visual/mobile review still pending |
| Docs updated: MASTER_REFERENCE / FEATURE_STATUS / SITEMAP / COMPONENT_CATALOG / CHANGELOG_AI | 🟡 | Scrum tracker/strategy updated for this pass; broader reference docs were pre-existing dirty and need a separate doc-only pass |
| Tests: pre-fill/working-day, blocker machine, proxy auth, mood privacy, link one-FK/type derivation, metrics privacy | ✅ | `npm run test:scrum` covers 23 tests across 7 suites |
