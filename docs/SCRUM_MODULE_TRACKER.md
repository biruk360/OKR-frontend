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
| P0 Foundations | model, seeds, nav, serializer/working-days skeletons | 🟡 | Foundation files added, validated, `db push` applied, and seed scripts run on local Postgres; build spec file absent from workspace |
| P1 Core loop ⭐ | S1 | ⬜ | ships with P2 |
| P2 Visualization ⭐ | S3 | ⬜ | ships with P1 |
| P3 Filtering | S4 | ⬜ | |
| P4 Proxy entry | S2 | ⬜ | |
| P5 Blockers | S5, S9.3 | ⬜ | builds `lib/projects/raid.ts` + `delay-ledger.ts` |
| P6 Automation | S7 | ⬜ | host crontab, tz caveat |
| P7 Wins & analytics | S6, S8 | ⬜ | |
| P8 Integration & admin | S9, S10 | ⬜ | Performance feed, settings, absences |
| P9 OKR linkage | S11 | 🟡 | schema join table/back-relations added early; UI/API/analytics still pending and depends on P1+P2 |

---

## Story-level tracker

| Story | Title | A | B | C | D | E | F | Status | Notes |
|-------|-------|---|---|---|---|---|---|--------|-------|
| S1.1 | Submit my daily update | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⭐ pre-fill = last working day; <60s |
| S1.2 | View previous day's plan while updating | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | carry-forward inherits OKR links (S11) |
| S2.1 | Submit on behalf (proxy) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | mood absent from form; peer→403; attribution immutable |
| S3.1 | Team month calendar ("The Wall") | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | consistent dot order; <500ms 31×25 |
| S3.2 | Day view | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | blockers hoisted; Copy for standup; mood self+mgr only |
| S3.3 | Individual streak view | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| S3.4 | Week view | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | carry-forward chains |
| S4.1 | Compose filters | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 10 + Objective/KR (S11); server-side; URL-shareable; mood gated |
| S5.1 | Blocker lifecycle | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | state machine; working-day counts; fuzzy match |
| S5.2 | Blocker taxonomy | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 9 categories; Pareto |
| S6.1 | Capture & celebrate wins | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | org-wide feed; Perf win count |
| S7.1 | Daily rhythm / nudges / Telegram | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ≤1 nudge/day; consolidated digest; deep-link only |
| S8.1 | Team health dashboard | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | SC1–SC10; SC5 mood team-agg; PNG export |
| S9.1 | Link updates to real work | — | — | — | — | — | — | — | **superseded by S11** |
| S9.2 | Feed the Performance module | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | mood absent from metrics API (test) |
| S9.3 | Feed the PM module | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🟡 | ⬜ | RaidItem + DelayEvent seams pending; G6/ScrumLog intentionally left unwired in favor of ScrumUpdate |
| S10.1 | Configure scrum settings | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | toggles immediately effective; ET holidays |
| S10.2 | Record excused absences | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | single + range; blue state; excluded from denominators |
| S11.1 | Link an update to my OKRs | ⬜ | 🟡 | ⬜ | ⬜ | ⬜ | 🟡 | ⬜ | optional; schema join table/back-relations added; scoped picker/API/UI/one-FK route guard pending |
| S11.2 | See daily activity from OKR side | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Daily Activity tab injected at page level; mood never shown |
| S11.3 | Attention analytics ⭐ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | SC11–SC16; neglect alert; SC16 excluded from metrics API |

---

## Cross-cutting checklist (global DoD — spec §14.2)

| Item | Status | Notes |
|------|--------|-------|
| Prisma models + `@@unique([userId, scrumDate])` + indexes (via `db push`) | ✅ | schema added; `npx prisma validate` + `npx prisma db push` + Prisma Client generate pass on local Postgres `okr_system` |
| `ScrumUpdateLink` join table + back-relations + app-layer "one FK" guard | 🟡 | schema/back-relations added; route-level zod one-FK guard pending |
| Doctypes registered + defaults seeded (`seed-scrum-permissions.ts`) | ✅ | `db:seed:scrum-permissions` upserted 5 doctypes, 8 sensitive fields, 20 role permission rows; `db:seed:scrum-settings` seeded default settings with 10 public holidays |
| Mood serializer (self + direct manager only) + test | ✅ | serializer + test added; `npm run test:scrum` passes |
| Mood & SC16 absent from metrics API + tests | ⬜ | ⭐ hard rules |
| `SCRUM` notification category + keys + `SCRUM_OBJECTIVE_NEGLECTED` + templates | 🟡 | category/events/deep links/basic email templates added; exact §12 list unverified because build spec file is absent |
| 5 cron routes + crontab entries + tz note | ⬜ | Africa/Addis_Ababa vs UTC |
| `recordActivity()` on every mutation (incl. proxy + amend) | 🟡 | activity entity/action values added; no scrum mutations exist yet |
| Barrel `features/scrum/index.ts`; features never import features | ✅ | barrel added; foundation route imports from `@/features/scrum` |
| Design system: tokens only, no hex, `cn()`, skeletons | 🟡 | foundation page reuses existing primitives/tokens; full feature UI pending |
| Docs updated: MASTER_REFERENCE / FEATURE_STATUS / SITEMAP / COMPONENT_CATALOG / CHANGELOG_AI | ✅ | updated for P0 foundation |
| Tests: pre-fill/working-day, blocker machine, proxy auth, mood privacy, link scoping, neglect math | 🟡 | working-day + mood privacy tests pass; other phase tests pending |
