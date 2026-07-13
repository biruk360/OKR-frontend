# Daily Scrum Module — Implementation Strategy (for Codex)

**Companion to:** `docs/daily_scrum_module_BUILD_SPEC.md` (the WHAT).
**This doc is the HOW** — repo-grounded conventions, spec↔codebase reconciliations, a file manifest, and a phase-by-phase task plan Codex executes.

> Read `CLAUDE.md` first (non-negotiable rules). This strategy assumes those rules and only adds specifics. The build spec's inline `.prisma` / TSX snippets are **illustrative** — where they conflict with the conventions below, **the conventions win.** Section 2 lists every such conflict explicitly; do not skip it.

---

## 0. How Codex should use this document

1. Work **phase by phase** (P1→P9, §5). Do not start a phase until the previous phase's DoD is green.
2. Before writing any file, run the **reuse audit** (CLAUDE.md) against the table in §1 — never create a primitive that already exists.
3. Every task references the spec epic (e.g. `S1.1`) for acceptance criteria. This doc does **not** restate acceptance criteria — read them from the spec.
4. After each story: run the **verification protocol** in §0.1 and update `docs/SCRUM_MODULE_TRACKER.md`. After each phase: update `CHANGELOG_AI.md`, run the phase's tests, then proceed.
5. **Schema changes ship via `prisma db push`** (this repo has no migration history — confirmed in memory + repo). Never author a migration file.

---

## 0.1 Verification protocol — how Codex tracks that a story is actually DONE

A story is **not** "done" because the code compiles. For **every** user story (S1.1, S1.2, S2.1, … S11.3) Codex must walk the spec entry top to bottom and confirm each of these dimensions before flipping the tracker row to ✅. This is the tracking method — the tracker (§8) has one column per dimension.

| # | Dimension | What Codex checks against | Where it lives in the spec |
|---|-----------|---------------------------|----------------------------|
| **A** | **User Story** | The built behavior delivers the actual "As a … I want … so that …" outcome — not a partial or literal-minded reading. | each story's *User Story* block |
| **B** | **Attributes / Fields** | Every field in the story's attribute table exists, with the right type, required/optional flag, default, validation, and derivation (client-trusted vs server-derived). | each story's *Attributes* table |
| **C** | **UI/UX Detail** | The rendered UI matches the ASCII mock's structure **and** every listed micro-interaction is implemented (autofocus, pre-fill grey→solid, progressive disclosure, countdown states, blocker hoisting, proxy banner, suggested-links, empty-state hiding, etc.). Mobile behavior where specified. | each story's *UI/UX Detail* + *Micro-interactions* |
| **D** | **Acceptance Criteria** | Every Given/When/Then bullet passes — ideally as a test, at minimum as a manual walk-through recorded in the tracker note. | each story's *Acceptance Criteria* |
| **E** | **Definition of Done** | Every `[ ]` checkbox in the story's DoD ticked. | each story's *Definition of Done* |
| **F** | **Claude guardrails & UI/UX guidelines** | Conforms to `CLAUDE.md` (reuse-first, response envelope, `withAuth`, `recordActivity` on every mutation, barrel exports, features-never-import-features, forms via react-hook-form, `Modal`/`ConfirmDialog`/`EmptyState`), the **design system** (Apple-HIG tokens: `surface-*`/`ink-*`/`primary`/`success`/`warning`/`danger`, `rounded-card`/`shadow-card`, `text-page-title`/`text-section-title`/`text-body`, `ease-apple` 180ms, Lucide ~1.75px, skeletons over spinners, **no hardcoded hex**, `cn()` only), and this module's **critical invariants** (§8, incl. #1 <60s submit, #4 mood privacy, #11 linking always optional). | `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`, §2 + §6 + §8 of this doc |

**Rule:** a tracker row may only read ✅ when **A–F all pass.** If any dimension is partial, the row is 🟡 with a note naming the gap. Design-system conformance (F) and the invariants are **not optional polish** — a beautiful feature that hardcodes a hex value or leaks mood to a peer is a failed story, not a done one.

---

## 1. Reuse map — exact import paths (do NOT rebuild any of these)

| Need | Use this | Import |
|------|----------|--------|
| API auth wrappers | `withAuth` / `withRole(roles, h)` / `withFeature(key, h)` | `@/lib/api/withAuth` (or `@/lib/api`) |
| Response envelope | `apiSuccess`, `apiPaginated`, `apiBadRequest`, `apiValidationError`, `apiForbidden`, `apiNotFound`, `apiConflict` | `@/lib/api` |
| Error mapping | automatic (withAuth try/catch → `handleApiError`) | `@/lib/api/handleError` |
| Prisma client | `prisma` | `@/lib/prisma` |
| Server-side input validation | `zod` `safeParse` + `apiValidationError(msg, err.flatten())` | `zod` |
| Audit trail | `recordActivity({ entityType, action, actorId, changes, metadata })` | `@/lib/activity-log` |
| Notifications | `emit(eventKey, payload)` | `@/lib/notifications` |
| Doctype permission check | `canDocType(userId, key, action)` / `canFeature(userId, key)` | `@/lib/rbac` |
| Field-level redaction | `filterFieldsByPermLevel(obj, doctypeKey, userId)` | `@/lib/field-filter` |
| Rich text editor (TipTap) | `RichTextEditor` (value=HTML in/out) | `@/components/shared/RichTextEditor` |
| @mention editor | `MentionEditor` | `@/components/todos/MentionEditor` |
| Modal / Confirm / Empty / Stat | `Modal`, `ConfirmDialog`, `EmptyState`, `StatCard`, `PageHeader`, `SideDrawer` | `@/components/ui` |
| Charts | **recharts** (`^2.8.0`) + `Sparkline`, `KpiCard` | `recharts`, `@/components/ui/dashboard` |
| Working-day / business-day math | reuse & extend `lib/projects/business-days.ts` | `@/lib/projects/business-days` |
| Ethiopian calendar/holidays | `kenat` (already a dependency) | `kenat` |
| Telegram send | `sendMessage({ chatId, text, parseMode })` | `@/lib/telegram/client` |
| Class merge | `cn()` | `@/lib/utils` |
| Reference-data hooks | `useUsersForSelection`, `useDepartments` | `@/hooks` |
| Forms | `react-hook-form` **without** a zod resolver (see §2.6) | `react-hook-form` |

**No new dependencies.** Everything the spec needs (rich text, charts, calendar, Telegram) already exists. If a genuine gap appears, stop and flag it in the tracker rather than adding a package.

---

## 2. Spec ↔ codebase reconciliations (the deltas — READ THIS)

The build spec was written against an idealized model. These are the concrete adjustments Codex must make so the module fits the actual repo.

### 2.1 Prisma: no enums, string FKs, no User back-relations
- The repo uses **no Prisma `enum` blocks** — every enum is a `String` field with allowed values in a trailing `//` comment (schema header line 16). Keep the spec's models but ensure `mood`, `status`, `blockerStatus`, `type`, `proxyReason`, etc. stay `String`.
- **Follow the PM-module convention**: user references are **plain-string FKs with NO formal Prisma relation** to avoid `User` back-relation explosion (schema lines 2248–2251). So in `ScrumUpdate`, **drop** the spec's `user User @relation("ScrumSubject")` and `submittedBy User @relation("ScrumAuthor")`. Use bare `userId String`, `submittedById String`, `managerId String?`, `escalatedToUserId String?`. Resolve names/avatars in the service layer by `userId in (...)` lookups, exactly like `features/projects`.
- **Keep** intra-module relations only: `ScrumUpdate.comments ScrumComment[]` ↔ `ScrumComment.update` (with `onDelete: Cascade`).
- **OKR linkage is a join table, NOT arrays (Epic S11 supersedes S1.1/S9.1).** Do **not** add `linkedTodoIds String[]` / `linkedKeyResultIds String[]` to `ScrumUpdate`. Instead add `links ScrumUpdateLink[]` and the full `ScrumUpdateLink` model (spec S11 §1). Details in §2.12.
- IDs: `String @id @default(cuid())`. Add `@@map("scrum_updates")`, `@@map("scrum_comments")`, `@@map("scrum_absences")`, `@@map("scrum_settings")` (snake_case table names, repo convention).
- `@db.Date`, `String[]`, `Int[]`, `DateTime[]` are all fine as written.

### 2.2 Permissions: numeric `permLevel` 0–3, not "L1/L2"
- The repo has **no "L1/L2" tokens**. Sensitivity is a numeric `permLevel` (0–3) + `isSensitive Boolean` on `DocTypeFieldRegistry`. Map: spec **L1 → permLevel 1**, spec **L2 → permLevel 2**.
- Register the 4 new doctypes (`scrum_update`, `scrum_comment`, `scrum_absence`, `scrum_settings`) by adding rows to a **new idempotent seed** `scripts/seed-scrum-permissions.ts` (mirror `scripts/seed-project-permissions.ts` / the `DOCTYPES` + field-upsert pattern in `scripts/seed-permissions.ts`). Register sensitive fields `mood` (permLevel 2), `blockers` (permLevel 1) on `scrum_update`, and all `scrum_settings` fields (permLevel 2).
- Coarse field hiding uses `filterFieldsByPermLevel(update, 'scrum_update', userId)` in read routes.
- ⚠️ **`permLevel` alone cannot express "mood visible to self + *direct manager*"** — that's a **relationship** check, not a role level. So mood requires a **custom serializer** (§2.3), not just field-filter. This is the single most important correctness detail in the module.

### 2.3 Mood privacy needs a dedicated serializer (invariant #4)
Build `features/scrum/services/scrum-serializer.ts` — the **single** choke point every read path funnels through (mirrors the PM `portal-serializer.ts` pattern that CLAUDE.md praises). Rule inside it:
```
mood is included ONLY IF viewer.id === update.userId
                 OR viewer.id === (direct manager of update.userId via ManagerRelationship)
otherwise the mood field is DELETED from the object (not nulled, deleted).
```
- Executives/CEO/peers never receive individual mood — only team-aggregated numbers from the analytics service.
- Add an **automated test** asserting no `mood` key survives serialization for a non-manager/non-self viewer (parallels the PM "zero User.name in portal response" test). This test gates P1.
- Mood is also **physically absent from the metrics API** (§2.8) and **absent from the proxy form** (invariant #6).

### 2.4 Blocker escalation seams (`RaidItem` / `DelayEvent`) don't exist yet — you build them
- `RaidItem` (schema 2569) and `DelayEvent` (2520) models exist but have **no create service or API**. `RaidItem` is read-only today (`lib/projects/health.ts`); `DelayEvent` creation is a stubbed TODO ("Wired in P2") and `lib/projects/delay-ledger.ts` does not exist.
- Therefore, blocker escalation (S5/S9.3) must **create these seams**: add `createRaidIssue(...)` and `createDelayEvent(...)` in `lib/projects/` (thin, transactional, `recordActivity` on write, business-day math via `lib/projects/business-days.ts`). Keep them in the PM module's `lib/projects/` namespace (they are PM writes), and call them from the scrum blocker service. Do **not** import `features/projects` from `features/scrum` — go through `lib/projects/*` service functions (allowed; features never import features, but shared `lib/` services are fine).
- Attribution: `DelayEvent.owner` is `CLIENT | 360GROUND | SHARED` (plain string); map `EXTERNAL_DEPENDENCY`/`CLIENT_APPROVAL` → `owner=CLIENT`.

### 2.5 `ScrumLog` collision (invariant #10 / S9.3)
- A `ScrumLog` model **already exists** (schema 2865, `@@map("project_scrum_logs")`) but is unwired (no service/API). The spec says this module **supersedes PM Epic G6** — so **do not** build any service/API/UI for `ScrumLog`. Leave the model in place (removing it is a destructive schema change; not worth it), and record in the tracker that G6/`ScrumLog` is intentionally dead in favor of `ScrumUpdate`.

### 2.6 Forms: react-hook-form **without** `zodResolver`
- `@hookform/resolvers` is **not installed**; no client form uses `zodResolver`. The established pattern (e.g. `features/goals/components/CreateGoalModal.tsx`) is `useForm<T>({ defaultValues })` with inline `register` validation rules.
- **Zod is server-side only** (route `safeParse`). Define each endpoint's schema in the route (or a colocated `features/scrum/services/schemas.ts` imported by routes only — not by client forms). Do **not** add `@hookform/resolvers`.

### 2.7 Activity log registration
- Add scrum entity/action values to the unions in `lib/activity-log.ts`: `ActivityEntityType += 'SCRUM_UPDATE' | 'SCRUM_ABSENCE'`; `ActivityAction` — reuse existing (`CREATED`, `UPDATED`, `STATUS_CHANGED`) and add any missing (`PROXY_SUBMITTED`, `PROXY_CONFIRMED`, `AMENDED`, `ESCALATED`, `RESOLVED`). Call `recordActivity()` on **every** mutation incl. proxy submit + amend (invariant #10 / global DoD).

### 2.8 Performance integration is a NEW resolver path (S9.2)
- Today, Performance auto-pulls metrics from **KeyResult check-ins** via `resolveMetricActual` (`lib/performance/metric-resolver.ts`) reading `EvaluationMetricSource`. Scrum metrics (submission rate, punctuality, wins, blocker-resolution speed) are a **different shape** — not KR check-ins.
- Plan: expose `GET /api/scrum/metrics/[userId]?from=&to=` returning `{ submissionRate, punctualityRate, winCount, blockerResolutionDays }` (computed in `features/scrum/services/scrum-metrics.ts`). **Mood must not appear in this response or the service — enforce with a test** (spec S9.2 DoD). Then extend the Performance metric-source layer so a `ScorecardCriterion` of `type: 'METRIC'` can point at a scrum metric key. Treat the Performance-side wiring as a small, reviewed change to `lib/performance/*` and flag it in the tracker; keep the scrum service the source of truth.

### 2.9 Notifications: add a `SCRUM` category
- Extend `lib/notifications/events.ts`: add `'SCRUM'` to `EventCategory`; add all §12 event keys **plus `SCRUM_OBJECTIVE_NEGLECTED` (S11.3 → objective owner + CEO)** to the `EventKey` union; add an `EVENT_META` row per key with the correct `defaultCadence` (`IMMEDIATE` for blocker/proxy/celebrate/comment; the digests and neglect alert fire from cron, so model them as `IMMEDIATE` emits triggered by the job). Add email templates in `lib/email/templates` for the digest keys. Dispatch via `emit(key, { actorId, entityType, entityId, explicitRecipients: [userId], data })`. `emit` never throws — safe to call inside mutations.
- For "notify the manager immediately on blocker" use `explicitRecipients: [managerId]` (managerId resolved server-side from `ManagerRelationship`).

### 2.10 Cron: host crontab, not Vercel; Bearer **or** `?key=`
- There is **no `crons` array in `vercel.json`**. Schedules live in `deploy/notifications-crontab.example` + `scripts/install-crontab.sh`. Add the 5 scrum jobs (§13 of spec) to `deploy/notifications-crontab.example` (with the timezone note — cutoffs are `Africa/Addis_Ababa`, crontab runs UTC, so convert or run the host in Addis time; document the offset in the tracker).
- Each `app/api/cron/scrum-*` route copies the existing auth block (accept `Authorization: Bearer $CRON_SECRET` OR `?key=$CRON_SECRET`), stays thin, and delegates to `features/scrum/services/scrum-jobs.ts` (or `lib/scrum/jobs.ts`). `export const GET = POST`.
- **Timezone + working-day math is load-bearing** across pre-fill, lateness, absence, blocker-day-count, streaks, and nudge suppression. Centralize it in **one** service (`features/scrum/services/working-days.ts`) that composes `lib/projects/business-days.ts` with `ScrumSettings.workingDays`/`holidays`/`timezone` (+ `kenat` for Ethiopian holidays) and reuse it everywhere. Do not scatter date logic.

### 2.11 Telegram is deep-link only in Phase 1
- Spec S7 Phase 1 = deep-link to the pre-filled web form; conversational submit-in-Telegram is Phase 2 (**out of scope**). Reuse `sendMessage`; look up the user's `TelegramChat` for `chatId`. Respect `ScrumSettings.telegramEnabled`.

### 2.12 Epic S11 (OKR linkage) — join table specifics & real-repo caveats
- **`ScrumUpdateLink` uses FORMAL relations** to `Objective`/`KeyResult`/`Todo` — unlike the plain-string user FKs of §2.1. This is correct and consistent: these are core OKR models (`Objective` already carries `projects Project[]`, `KeyResult` carries `milestones`). Add the reciprocal back-relation to each: `Objective.scrumLinks ScrumUpdateLink[]`, `KeyResult.scrumLinks ScrumUpdateLink[]`, `Todo.scrumLinks ScrumUpdateLink[]`. (Only **User** relations are avoided in this codebase — OKR relations are fine.)
- ⚠️ **Prisma has no native CHECK constraint** — the spec's "exactly one of objectiveId/keyResultId/todoId set" cannot be expressed in `schema.prisma`. Enforce it **two ways**: (1) a zod `.refine()` in the create route (authoritative), and (2) optionally add the raw SQL check constraint out-of-band after `db push` (document it in the tracker; it will not round-trip through Prisma). Never trust the client for `linkType` — **derive it server-side** from which FK is present.
- The `@@unique([updateId, keyResultId, context])` (and the objective/todo variants) work correctly with nullable FKs — Postgres treats NULLs as distinct, so the constraint only bites when the FK is non-null. This is exactly the "same KR under two different contexts is valid, a duplicate in one context is not" behavior the spec wants.
- **`context` is auto-derived from the field the link was made from** (TODAY/BLOCKER/WIN/YESTERDAY) — never a user dropdown. Thread this through the form so linking from the blocker field produces `context=BLOCKER`, etc.
- **Scoping query is the performance lever** (keeps the picker to ~5–15 items): KRs where user is `ownerId` OR an `ObjectiveContributor` on the parent; Objectives owned/contributed/department; Todos assigned or `TodoMember` — all **active-timeframe only**. Build this as one service (`scrum-links.ts::getLinkableEntities(userId)`) reused by the picker and by proxy (which passes the **subject's** id, not the author's — S11.1 AC).
- **Suggested section** = the user's last 3 updates' links, frequency-ranked. Compute server-side; it's what keeps linking within the +10s budget (S11.1 DoD).
- **Carry-forward inheritance:** links attached to a carried item (S1.2) must auto-attach to today's update — integrate `scrum-links.ts` with `prefill.ts`.
- **Daily Activity tab (S11.2) is a cross-feature composition problem.** The tab renders on the **Objective** and **KeyResult** detail pages, which live in `features/objectives` / `features/key-results`. Features must **never import** `features/scrum`. So the scrum-owned `DailyActivityPanel` component is composed in at the **page/route level** (`app/dashboard/...` for the objective/KR detail routes) as an additional tab, OR via a shared slot — **not** by importing scrum inside the objectives/key-results features. Flag the exact injection point in the tracker.
- **Attention analytics (S11.3)** — SC11–SC16 computed nightly in `scrum-health` cron. **SC16 (individual OKR-focus rate) is a coaching signal and is explicitly EXCLUDED from the metrics API** (same hard rule as mood, §2.8) — assert with a test. `SCRUM_OBJECTIVE_NEGLECTED` fires to objective owner + CEO at 14 working days of zero mentions.
- **Linking is always optional (new invariant #11):** submission with zero links must always succeed; link presence/rate is **never** a validation gate and **never** a performance penalty.

---

## 3. Data model plan (Prisma)

Add 4 models to `prisma/schema.prisma` (append near the PM block, its own banner comment `// ===== DAILY SCRUM MODULE =====`). Copy the spec's §1 field lists **with the §2.1 adjustments**: strings not enums, plain-string user FKs (no `User` relations), intra-module `ScrumComment` relation + cascade, all `@@index` and the `@@unique([userId, scrumDate])` / `@@unique([userId, date])` / `@@unique` on settings id.

Then:
1. `npx prisma db push` (or the repo's script) — **coordinate with the user first** since it touches the production DB (memory: prod is Postgres on VPS, `prisma db push`, run preflight).
2. `npx prisma generate`.
3. Seed defaults: one `ScrumSettings` row (`id="default"`), Ethiopian holidays via `kenat` in a seed script `scripts/seed-scrum-settings.ts`.

**DoD gate for the model:** `@@unique([userId, scrumDate])` enforced at DB level (invariant #8); indexes present for calendar filtering (`[scrumDate, teamId]`, `[hasBlocker, scrumDate]`, `[hasWin, scrumDate]`, `[managerId, scrumDate]`, `[blockerStatus]`).

---

## 4. File / directory manifest

```
prisma/schema.prisma                         # +4 models (§3)
types/scrum.ts                               # domain enums/consts (statuses, moods, blocker cats, proxy reasons)
types/index.ts                               # +ScrumUpdateWithRelations etc. IF cross-cutting

features/scrum/
  index.ts                                   # barrel — ONLY public surface
  types.ts                                   # re-export @/types/scrum + API/client shapes
  services/
    api.ts                                   # fetch client (scrumApi) — unwraps envelope, throws
    schemas.ts                               # zod schemas (imported by ROUTES only)
    scrum-serializer.ts                      # ⭐ mood privacy choke point (§2.3)
    working-days.ts                          # ⭐ tz + working-day/holiday math (§2.10)
    prefill.ts                               # last-working-day pre-fill + plan parsing/carry-forward (S1.1/S1.2)
    blocker-lifecycle.ts                     # OPEN→RECURRING→ESCALATED→RESOLVED + fuzzy match (S5)
    scrum-metrics.ts                         # Performance feed, mood-free (§2.8)
    scrum-analytics.ts                        # SC1–SC10 aggregates, team-only mood (S8)
    scrum-links.ts                           # ⭐ S11: linkable-entity scoping, suggested, attention aggregates
    scrum-jobs.ts                            # cron job bodies (§2.10)
  hooks/queries.ts                           # TanStack Query — KEYS root 'scrum', useX hooks, invalidation
  components/                                # see §5 per-phase list
lib/stores/scrum-store.ts                    # Zustand: draft autosave buffer + filter/panel UI state only

lib/projects/raid.ts                         # createRaidIssue() (new seam, §2.4)
lib/projects/delay-ledger.ts                 # createDelayEvent() (new seam, §2.4)

app/dashboard/scrum/page.tsx                 # thin server comp → feature client
app/dashboard/scrum/wins/page.tsx            # wins feed (S6)
app/dashboard/scrum/settings/page.tsx        # admin settings (S10)

app/api/scrum/updates/route.ts               # GET list (filtered, server-side) + POST create
app/api/scrum/updates/[id]/route.ts          # GET one (serialized) + PATCH
app/api/scrum/updates/[id]/confirm/route.ts  # proxy confirm/amend (S2)
app/api/scrum/updates/[id]/comments/route.ts # comments + @mention (S3.2)
app/api/scrum/updates/[id]/blocker/route.ts  # escalate / resolve (S5)
app/api/scrum/updates/[id]/celebrate/route.ts# win celebrate (S6)
app/api/scrum/links/route.ts                 # S11: create/delete links (server-derives linkType)
app/api/scrum/linkable/route.ts              # S11: scoped picker entities + suggested (for subject or self)
app/api/scrum/attention/route.ts             # S11.2/S11.3: per-entity daily-activity + SC11–SC16
app/api/scrum/calendar/route.ts              # month/day/streak aggregates (S3)
app/api/scrum/absences/route.ts              # excused absences (S10.2)
app/api/scrum/settings/route.ts              # GET/PATCH settings (admin)
app/api/scrum/metrics/[userId]/route.ts      # Performance feed, mood-free (S9.2)
app/api/cron/scrum-reminder/route.ts         # 08:00
app/api/cron/scrum-finalize/route.ts         # 09:00 (absences+digest+escalation)
app/api/cron/scrum-nudge/route.ts            # 09:05 (single nudge)
app/api/cron/scrum-weekly/route.ts           # Fri 16:00
app/api/cron/scrum-health/route.ts           # 02:00 recompute

scripts/seed-scrum-permissions.ts            # doctypes + sensitive fields
scripts/seed-scrum-settings.ts               # default settings + ET holidays

lib/dashboard-navigation.ts                  # +Scrum sidebar entry
lib/activity-log.ts                          # +entity/action unions (§2.7)
lib/notifications/events.ts                  # +SCRUM category + event keys + EVENT_META (§2.9)
deploy/notifications-crontab.example         # +5 scrum schedules (§2.10)

docs/SCRUM_MODULE_TRACKER.md                 # per-feature status (mirror PM tracker) — create in P0
docs/{MASTER_REFERENCE,CHANGELOG_AI,FEATURE_STATUS,SITEMAP,COMPONENT_CATALOG}.md  # update per phase
```

Plus for S11 (§2.12): add `Objective.scrumLinks` / `KeyResult.scrumLinks` / `Todo.scrumLinks` back-relations to `prisma/schema.prisma`; add a scrum-owned `DailyActivityPanel` component composed into the **objective and key-result detail routes at the page level** (not inside those features); add `Objective`/`KeyResult` filter dimensions to the S4 filter set.

Barrel + import discipline: app pages and other features import scrum **only** from `@/features/scrum`. Scrum reaches PM writes only via `@/lib/projects/*`, never `@/features/projects`. The Daily Activity tab is injected at the route/composition layer — `features/objectives` and `features/key-results` never import `features/scrum`.

---

## 5. Phase-by-phase build plan

Ordering follows the spec's §14.1 (**P1+P2 ship together**). Each phase lists concrete build tasks; acceptance criteria + DoD checkboxes come from the referenced spec epic.

### P0 — Foundations (do first, ~half day)
- Add the 4 Prisma models (§3) + `db push` + generate (coordinate DB push with user).
- `types/scrum.ts` enums/consts.
- `scripts/seed-scrum-permissions.ts` + `scripts/seed-scrum-settings.ts`; run both.
- Register `SCRUM` notification category + event keys (§2.9). Register activity entity/actions (§2.7). Add sidebar nav entry + empty `/dashboard/scrum` route + `features/scrum/index.ts` barrel.
- Build `working-days.ts` + `scrum-serializer.ts` skeletons with unit tests (they are dependencies of everything).
- Create `docs/SCRUM_MODULE_TRACKER.md`.

### P1 — Core loop (S1) ⭐
- `app/api/scrum/updates` POST/PATCH: `withAuth`, zod (`schemas.ts`), envelope, `@@unique` upsert (re-open edits existing), server-derive `hasBlocker`/`hasWin`, resolve `teamId`/`managerId` server-side, `isLate` from settings cutoff, `recordActivity`, blocker → immediate `emit('SCRUM_BLOCKER_RAISED', {explicitRecipients:[managerId]})`.
- `prefill.ts`: last-**working-day** pre-fill (not calendar-yesterday), plan parse into line items, carry-forward. Unit-test across weekend/holiday/never-submitted.
- Components: `ScrumForm` (single scrollable column, autofocus `todayPlan`, `RichTextEditor` fields, pre-fill grey-italic→solid, progressive blocker category, mood selector w/ privacy note, `Cmd/Ctrl+Enter`), `YesterdayPlanPanel` (collapsible, 3-state Done/Carried/Not-done, persisted collapse in `scrum-store`), countdown, `DashboardScrumWidget`.
- Autosave every 10s via `scrum-store` draft buffer + PATCH.
- **Gate:** mood-serializer test green; pre-fill/working-day/flag-derivation unit tests green.

### P2 — Visualization (S3) ⭐ (ships with P1)
- `app/api/scrum/calendar` — **server-side** aggregation for month/day/streak (never client array filtering; must scale). Return per-member dot state, cell badge counts, tint flags.
- Components: `MonthCalendar` ("The Wall" — consistent per-member dot ordering, 6 dot states, red/gold cell tint, hover mini-card, click→side panel/day view), `DayView` (**blockers hoisted to top**, wins section, absent cards with proxy/reminder actions, `Copy for standup` clipboard, compact/expanded), `StreakView` (GitHub-style heatmap rows, per-person stats, streak calc, <75% flag, trend, recurring-theme), `WeekView` (carry-forward `→` chains, 3-day amber drift). Build calendar/heatmap fresh (none exist) with recharts only where a chart is needed.
- **Perf gate:** 31-day × 25-person month renders <500ms.

### P3 — Filtering & search (S4)
- Extend `calendar`/`updates` list endpoints with all 10 filter dimensions **+ 2 from S11 (Objective, Key Result — multi-select)**, **AND composition, server-side**, live counts. URL-encoded shareable state (read/write `searchParams`). Saved views reuse the existing Filters Workspace pattern (`features/filters`). Free-text search across text fields with highlight. Single-user filter auto-switches to streak view. **Mood filter permission-gated server-side** (via serializer).

### P4 — Proxy entry (S2)
- Server: `isProxyEntry` derived server-side, mandatory `proxyReason`, **role-scoped subject picker** (manager→reports, PM→project team, dept-lead→dept, admin→all), **peer attempt → 403** (`canDocType` + relationship check). **Mood field absent from proxy path entirely.** Confirm/amend route preserves attribution + `recordActivity('AMENDED')`, `emit('SCRUM_PROXY_SUBMITTED', {explicitRecipients:[subjectId]})`.
- UI: proxy form (mood-less), proxy badge + amber banner **in every view** (calendar dot `🔄`, day view, streak, digests, exports), subject confirm/amend actions. Analytics count self vs proxy separately.
- Tests: authorization matrix, mood exclusion, attribution integrity.

### P5 — Blockers & escalation (S5, S9.3)
- `blocker-lifecycle.ts`: state machine OPEN→RECURRING→ESCALATED→RESOLVED, working-day-aware day counting (weekends/holidays excluded), fuzzy same-blocker match (≥80% + same category) with user confirmation, mandatory resolution note. Emits at each stage (`SCRUM_BLOCKER_RECURRING`→dept lead, `SCRUM_BLOCKER_ESCALATED`→CEO).
- Escalation side-effects via the new PM seams: `createRaidIssue(type=ISSUE)` + `createDelayEvent` (owner attribution for client-owned categories), flag linked activity blocked. 9-category taxonomy enforced; blocker Pareto (days lost) in analytics.
- Tests: transitions, weekend handling, similarity.

### P6 — Automation, nudges, Telegram (S7)
- 5 cron routes (§2.10) + bodies in `scrum-jobs.ts`. **Consolidated manager digest (one notification, not N)**; **max one nudge per person per day** (idempotency guard keyed by `userId+date+job`); weekend/holiday + excused-absence suppression; nudge includes yesterday's plan; Telegram deep-link (respect `telegramEnabled`). Add crontab entries + timezone note.

### P7 — Wins & analytics (S6, S8)
- Wins: optional field (already on model), `[👏 Celebrate]` reaction + `emit('SCRUM_WIN_CELEBRATED')`, gold day-view section, org-wide wins feed page, weekly digest aggregation, win count exposed to Performance (§2.8).
- Analytics: SC1–SC10 in `scrum-analytics.ts` (recharts). **SC5 mood trend team-aggregated only** + 10-working-day CEO alert (`SCRUM_TEAM_MOOD_ALERT`). SC3 Pareto, SC8 proxy-ratio integrity flag (>30%), SC9 carry-forward realism flag (>40%). All charts export PNG. **Individual mood never beyond self+manager — server-enforced.**

### P8 — Integration & admin (S9, S10)
- OKR/PM links: Todo/KeyResult bidirectional surfacing, project activity feed, stalled-todo (5+ working days) detection.
- Performance metrics API (§2.8) + Performance-side auto-pull wiring; **mood-absent test.**
- Settings UI (admin-only): all `ScrumSettings` toggles immediately effective (disable mood → field gone everywhere + analytics hidden; disable proxy → action gone + API 403). ET holiday calendar. Absences (single + range) exclude from nudges/absent counts/rate denominators + blue calendar state.

---

### P9 — OKR Linkage (S11) — depends on P1 + P2 shipping first
- **Data model:** `ScrumUpdateLink` join table + back-relations (§2.12); `db push`; app-layer "exactly one FK" enforcement + server-derived `linkType`; context-aware unique constraints. Register doctype `scrum_update_link` (inherits `scrum_update` perms) in the seed.
- **S11.1 (link my update):** inline linking from the field the work relates to (Today/Blocker/Wins → auto `context`); scoped picker via `scrum-links.ts::getLinkableEntities` (KR own/contributor, Objective own/contributor/dept, Todo assignee/member; active timeframe only); ⭐ Suggested from last 3 updates; live progress %/confidence chip; **section hidden entirely when user has no linkable entities**; proxy shows **subject's** OKRs; carry-forward inherits links; `progressNote` ≤120 chars; **zero links always submits**; measure link cost <10s median.
- **S11.2 (OKR-side Daily Activity):** scrum-owned `DailyActivityPanel` (summary stats, per-person mention heatmap, recent mentions with context badges, inline escalate on blocker mentions, empty-state signal, **mood never shown**) composed into Objective + KeyResult detail routes at the page level.
- **S11.3 (attention analytics):** SC11–SC16 computed nightly in `scrum-health`; ⭐ SC12 Neglected (14 working days zero mentions → `SCRUM_OBJECTIVE_NEGLECTED` to owner+CEO); ⭐ SC13 divergence (both directions); SC14/SC15 blocker/win concentration; SC16 individual focus rate **excluded from metrics API** (test-asserted). Surface on CEO Portfolio dashboard.
- **Invariant #11:** linking always optional; never a validation gate, never a performance penalty.
- Tests: FK-exactly-one enforcement, context derivation, scoping correctness, proxy-subject scoping, SC16-absent-from-metrics, neglect-alert working-day math.

---

## 6. Cross-cutting requirements (apply in every phase)

- **API:** `withAuth`/`withRole`, `{success,data?,error?}` envelope, zod `safeParse` on input. Thin routes; logic in `features/scrum/services/*` or `lib/`.
- **Permissions:** doctypes registered + defaults seeded; mood restriction server-enforced via serializer (not UI-hidden); peer-proxy 403; proxy attribution immutable.
- **Audit:** `recordActivity()` on every mutation incl. proxy + amend.
- **Types:** shared in `types/`; feature shapes re-exported through the barrel.
- **UI:** `Modal`/`ConfirmDialog`/`EmptyState` primitives only; `cn()` + design tokens (no hex); `react-hook-form` (no zodResolver); `RichTextEditor` for all rich fields.
- **Barrel:** everything public via `features/scrum/index.ts`.

---

## 7. Testing plan (unit tests gate each phase)

Priority tests (spec §14.2 + invariants):
1. **Mood privacy** — serializer removes `mood` for non-self/non-manager; `/api/scrum/metrics` response contains no `mood` key. (P1, P8)
2. **Pre-fill / working-day math** — last-working-day across weekend/holiday/never-submitted; lateness vs cutoff; flag derivation. (P1)
3. **Blocker state machine** — transitions, weekend-excluded day counts, ≥80% fuzzy match. (P5)
4. **Proxy authorization matrix** — each role's allowed subjects; peer 403; mood excluded; attribution retained on amend. (P4)
5. **Nudge idempotency** — one nudge per person per day; suppression on weekend/holiday/excused. (P6)
6. Perf: month-view render <500ms (P2).

---

## 8. Definition-of-Done gate (per phase, before moving on)

- [ ] Phase's spec DoD checkboxes satisfied.
- [ ] Phase tests (from §7) green.
- [ ] `recordActivity` on all mutations in the phase.
- [ ] No new dependency added; reuse audit clean.
- [ ] `docs/SCRUM_MODULE_TRACKER.md` rows updated; `CHANGELOG_AI.md` entry added.
- [ ] `MASTER_REFERENCE.md` / `FEATURE_STATUS.md` / `SITEMAP.md` / `COMPONENT_CATALOG.md` updated where relevant.

## Critical invariants (never break — from spec §14.3, restated for Codex)
1. Median submission < 60s. 2. Pre-fill = last **working day**. 3. Submission **is** attendance (no separate step). 4. Mood = self + direct manager only, never peers/org/performance. 5. Proxy attribution permanent & visible. 6. No mood on proxy entries. 7. Max one nudge/person/day. 8. One update/person/day (DB unique). 9. Weekends/holidays never count. 10. This module supersedes PM `ScrumLog` — don't wire G6. **11. OKR linking is always optional** — no update is ever blocked for lack of a link, and link rate is never a performance penalty (SC16 excluded from metrics API).
