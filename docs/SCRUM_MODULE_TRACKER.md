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
| P1 Core loop ⭐ | S1 | 🟡 | Submit/upsert, prefill, autosave draft buffer, carry-forward UI, and dashboard widget implemented; full manual UX timing/mobile pass still needed |
| P2 Visualization ⭐ | S3 | 🟡 | Month/day/streak/week/health views implemented with server aggregation; side-drawer polish, copy-for-standup, and mobile manual pass remain |
| P3 Filtering | S4 | 🟡 | Date/user/blocker/win/state filters implemented server-side; URL-shareable saved-view UI remains partial |
| P4 Proxy entry | S2 | 🟡 | Proxy subject lookup, reason/detail, mood omission, proxy confirm route, and immutable attribution implemented; full peer-403/manual walkthrough still pending |
| P5 Blockers | S5, S9.3 | 🟡 | Blocker lifecycle, resolve/escalate, RAID/Delay seams, activity-blocked flag, and cron escalation implemented; fuzzy-confirm UI and expanded tests remain |
| P6 Automation | S7 | 🟡 | Five cron routes, idempotency rows, manager/weekly/health jobs, crontab entries, and notification emits implemented; Telegram direct send is deep-link/no-op until user-chat mapping exists |
| P7 Wins & analytics | S6, S8 | 🟡 | Wins page, celebrate route, health analytics, Pareto/proxy/carry-forward aggregates implemented; PNG export and full SC dashboard polish remain |
| P8 Integration & admin | S9, S10 | 🟡 | Settings/absence APIs and UI, Performance Scrum metric resolver/mapping UI, mood-free metrics API, dashboard widget, and PM panel implemented; expanded metric tests remain |
| P9 OKR linkage | S11 | 🟡 | Join table, scoped picker, selectable update links, route-level Objective/KR panels, attention endpoint, and neglect cron implemented; carry-forward link inheritance and richer attention UI remain |

---

## Story-level tracker

| Story | Title | A | B | C | D | E | F | Status | Notes |
|-------|-------|---|---|---|---|---|---|--------|-------|
| S1.1 | Submit my daily update | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Form/API/upsert/derived flags/lateness implemented; manual <60s/mobile pass pending |
| S1.2 | View previous day's plan while updating | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Previous-plan panel and carry action implemented; carried-link inheritance still pending |
| S2.1 | Submit on behalf (proxy) | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Proxy auth/service/form/confirm implemented; peer-403 and amend flow need explicit test coverage |
| S3.1 | Team month calendar ("The Wall") | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Server aggregation and dot states implemented; performance/mobile manual pass pending |
| S3.2 | Day view | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Blockers/wins/all sections implemented; copy-for-standup remains |
| S3.3 | Individual streak view | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Streak grid implemented; richer trend labels pending |
| S3.4 | Week view | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Week slice implemented; carry-forward chain visualization pending |
| S4.1 | Compose filters | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Core filters implemented; saved views and URL persistence partial |
| S5.1 | Blocker lifecycle | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | State machine, recurring/escalate/resolve implemented; fuzzy confirm UI and tests pending |
| S5.2 | Blocker taxonomy | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | 9 categories and Pareto implemented; UX polish/manual pass pending |
| S6.1 | Capture & celebrate wins | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Wins field/page/celebrate route/Performance metric support implemented; org-feed polish pending |
| S7.1 | Daily rhythm / nudges / Telegram | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Cron jobs and idempotency implemented; Telegram send awaits user-chat mapping |
| S8.1 | Team health dashboard | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Analytics service and Health tab implemented; PNG export and full SC1-SC10 UI pending |
| S9.1 | Link updates to real work | — | — | — | — | — | — | — | **superseded by S11** |
| S9.2 | Feed the Performance module | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Scrum metrics API and Performance mapping/resolver implemented; mood absent by selected fields; explicit test pending |
| S9.3 | Feed the PM module | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | RaidItem/DelayEvent wrappers and project panel implemented; G6/ScrumLog intentionally left unwired in favor of ScrumUpdate |
| S10.1 | Configure scrum settings | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Settings page/API/upsert implemented; manual permission walkthrough pending |
| S10.2 | Record excused absences | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Absence API and denominator exclusion implemented; admin UI is still API-first |
| S11.1 | Link an update to my OKRs | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | Optional scoped picker, selectable links, and one-FK guard implemented; context auto-inference/carry-forward inheritance still partial |
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
| Mood & SC16 absent from metrics API + tests | 🟡 | API returns only four metrics and resolver never reads mood; explicit regression test still pending |
| `SCRUM` notification category + keys + `SCRUM_OBJECTIVE_NEGLECTED` + templates | ✅ | category/events/deep links/email template branches added |
| 5 cron routes + crontab entries + tz note | ✅ | reminder/finalize/nudge/weekly/health routes added; crontab documents UTC/Addis Ababa timing |
| `recordActivity()` on every mutation (incl. proxy + amend) | 🟡 | Core mutations record activity; exhaustive route audit still needed before all story rows can be ✅ |
| Barrel `features/scrum/index.ts`; features never import features | ✅ | barrel exports services/hooks/pages/panel; route pages compose Scrum panels, feature internals do not import Scrum |
| Design system: tokens only, no hex, `cn()`, skeletons | 🟡 | Uses existing primitives/tokens; final visual/mobile review still pending |
| Docs updated: MASTER_REFERENCE / FEATURE_STATUS / SITEMAP / COMPONENT_CATALOG / CHANGELOG_AI | 🟡 | Scrum tracker/strategy updated for this pass; broader reference docs were pre-existing dirty and need a separate doc-only pass |
| Tests: pre-fill/working-day, blocker machine, proxy auth, mood privacy, link scoping, neglect math | 🟡 | working-day + mood privacy tests pass; wider service tests remain |
