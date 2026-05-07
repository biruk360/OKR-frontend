# Feature Spec — AI-Generated Bi-Weekly Sprint Plans

> Status: IN PROGRESS. Owner: TBD. Last updated: 2026-05-07.
>
> This document is the single source of truth for the AI Sprint Planning feature. It consolidates the feature scope, AI integration design, data model changes, API surface, and acceptance criteria — including the carryover of incomplete todos from prior sprints.

---

## 0. Design change — 2026-05-07

The original spec assumed the AI **creates** a fresh sprint as part of generation, with one plan per sprint and a PLANNING→ACTIVE flip on accept. That model is replaced as follows; sections below that contradict this take-precedence note are superseded:

- **Team sprint first.** A user creates an empty team sprint via the existing kanban flow (`/dashboard/sprints` → New sprint). The sprint must be in `PLANNING` state with `startDate`/`endDate` set before AI generation is allowed.
- **Per-user, in-place generation.** From the sprint board header, a lead/admin triggers AI generation scoped to one team member. The pipeline appends `aiSuggested=true` todos to the existing sprint (no new Sprint row is created).
- **Multiple plans per sprint.** `AiSprintPlan.sprintId` is no longer `@unique` — one team sprint can hold one plan per `subjectUserId`. Idempotency key for `/generate` is `(sprintId, subjectUserId, status='DRAFT')`.
- **Per-user review.** Each generated plan goes to its own review page (`/dashboard/sprints/ai/[planId]`), which now shows the subject user, sprint window, and per-todo KR contribution with objective context.
- **Accept does not start the sprint.** On accept, kept proposed todos lose `aiSuggested` (so they appear on the kanban as normal cards) and dropped todos are deleted. The sprint stays in `PLANNING`. The lead manually starts the sprint from the board header once all team members' plans are loaded.
- **Board filters draft tasks.** `/api/sprints/[id]/board` excludes `aiSuggested=true` rows so draft tasks don't leak onto the kanban before approval.

---

## 1. Production state observed at spec time

Surveyed `okr_system` on the VPS (76.13.33.23) on 2026-05-03:

- **10 active users**, **7 active departments**, **65 active objectives** (9 COMPANY / 22 DEPARTMENT / 34 INDIVIDUAL), **295 KRs**, **43 initiatives** (39 PENDING / 1 IN_PROGRESS / 3 COMPLETED).
- Active timeframe: **FY2025/26 (yearly)**. All quarterly timeframes currently `isActive=false`.
- Only **1 Sprint** row exists ("1 asd", state=PLANNING, no dates) — real sprint usage hasn't started yet.
- Many KRs use `targetValue=100, unit="%"` and `weight=0` (auto-equal split). Several KRs are owned by the `unassigned@360ground.com` placeholder. Initiatives mostly have no `dueDate` or `progressValue` populated. **The AI must handle this sparse data gracefully — it cannot assume every KR has a numeric scalar target with weights.**
- Schema already has `Sprint` v2 fields (`state`, `goal`, `goalTarget`, `goalUnit`, `departmentId`, `endedAt`, `reflectionNote`) and `Todo.sprintId` linking. `SprintActivity` is deprecated — we plan on `Todo`.
- `KeyResultCheckIn` provides velocity history; `ActivityLog` provides per-todo completion timestamps.

## 2. Concept

At the start of each two-week cadence (or on demand), an authorized user can ask the system to **draft** a sprint plan for an individual or a department. The AI:

1. Loads that owner's OKRs + the surrounding org context (parents, siblings, child objectives, KRs the owner contributes to, department goals, company-level goals).
2. Reviews the previous sprint: completion rate, blockers from `InitiativeUpdate`, KR check-in deltas, off-track KRs.
3. **Triages every incomplete todo from the prior sprint** (`PENDING` / `IN_PROGRESS`) and assigns a carryover disposition (KEEP / SPLIT / RESCHEDULE / DESCOPE / ESCALATE).
4. Computes **sprint-share targets** per KR (how much of the remaining gap is fair to attempt in 2 weeks given remaining time, weight, historical velocity, and carryover budget already consumed).
5. Generates a draft `Sprint` (PLANNING state) with **proposed Todos**: title, description, KR/Objective link, suggested assignee, suggested `dueDate`, `progressValue`, `priority`, and a per-task ambition flag.
6. The owner reviews → accepts / edits / rejects → on accept, sprint flips to ACTIVE and Todos (carried + new) are committed.

The AI **never** writes directly to live OKRs — it produces a **draft** that requires explicit human approval.

## 3. Functional requirements

### 3.0 Initiation flow (user-driven)

Sprint generation is **always** initiated by a user — there is no auto-cron in v1. The entry point is a single "Generate AI Sprint" button on the Sprints workspace and on the user's "My OKRs" page. Clicking it opens a guided modal that asks the user one question first: should the AI pick which OKRs to plan around, or will the user pre-select?

**Step 1 — entry point.**
- Button label: **"Generate AI Sprint"** with a Sparkles icon. Visible only when:
  - `OrganizationSettings.aiSprintPlanningEnabled = true`, AND
  - The viewer has permission to generate for themselves (always true for any signed-in user) or for the subject they're viewing (per §7).
- Disabled-state tooltip when over the cooldown / cap, surfacing the exact reason from `/api/sprints/ai/generate` preflight.

**Step 2 — scope-selection modal ("Plan a new sprint").**
The modal presents three sections, top-to-bottom:
1. **Sprint window** — start date (default: next Monday), duration (default: 14 days, options 10/14/21).
2. **Provider** (collapsed by default; only ADMIN/EXECUTIVE see it expanded) — choice of `Anthropic` / `OpenAI` / `Gemini`, defaulting to `OrganizationSettings.aiPreferredProvider`. Greyed-out for providers without an API key.
3. **Scope** — two large mutually-exclusive cards the user picks between:

   | Card | Sub-label | Behavior |
   |---|---|---|
   | **Let AI pick OKRs** | "Recommended. The AI reviews all your active objectives and key results and chooses what to plan around." | No further input. The "Generate" button is enabled. |
   | **I'll choose OKRs** | "Pick the specific objectives and key results you want this sprint to focus on." | Reveals an inline OKR Picker (see §3.0.1). The "Generate" button is disabled until at least 1 KR is selected. |

   Selecting a card highlights it; the other dims. Switching cards preserves the picker selection in case the user toggles.

**Step 3 — buttons.**
The modal footer has three buttons, left-to-right:
- **Cancel** (ghost) — closes the modal, no API call.
- **Back** (only visible when on the picker step) — collapses the picker without losing dates/provider selection.
- **Generate Sprint** (primary, with Sparkles icon) — calls `POST /api/sprints/ai/generate` with `mode: "AUTO" | "MANUAL"` and the body shape in §6. Shows the streaming progress modal (§8) while the AI works.

**Step 4 — failure / empty cases.**
- If "Let AI pick" is chosen and the user has 0 active objectives, the modal shows an empty-state CTA "Create an objective first" and `Generate` is disabled.
- If "I'll choose" is chosen and the picker is empty, an inline hint reads "Pick at least one key result — we'll build the sprint around it."
- All errors from `/generate` (cap reached, provider not configured, validation) bubble back to the same modal as a red banner; the modal stays open so the user can adjust.

#### 3.0.1 OKR Picker (objectives + key results)

The picker is a new shared component built by **extending the existing `ParentObjectiveSelector` modal** used by the Alignment Map / parent-objective flow (`features/objectives/components/ParentObjectiveSelector.tsx`, backed by `/api/objectives/alignment-search`). The selector is generalised into a reusable `OkrPicker` under `components/shared/OkrPicker/`:

- **Multi-select** instead of single-select (current `ParentObjectiveSelector` is single-select for the parent dropdown).
- **Two-level selection** — when the user expands an objective row, the inline children show that objective's active key results, each with its own checkbox.
- **Selection model**: `Set<{ kind: "OBJECTIVE", id } | { kind: "KEY_RESULT", id, objectiveId }>`. Selecting an objective auto-selects all its currently-loaded KRs but the user can de-select individuals; the chip count reflects whichever leaves are checked.
- **Filters preserved from the alignment selector**: timeframe, level (`COMPANY` / `DEPARTMENT` / `INDIVIDUAL` / `ALL`), search, "active timeframe only" toggle.
- **New filter**: "Mine only" toggle (default ON when the picker is opened from the AI Sprint modal) that scopes to objectives + KRs the subject owns or contributes to. Users can toggle it off to also see cross-team OKRs they're allowed to support.
- **Selection summary footer** inside the picker: "12 KRs across 4 objectives selected" with a one-click "Clear all".
- **Backend**: `/api/objectives/alignment-search` is extended to accept `includeKeyResults=true`, returning each objective with an embedded `keyResults[]` array filtered by privacy and active status. Existing single-select usage is unaffected (omit the param → existing shape).
- **The original `ParentObjectiveSelector`** is refactored to call into `OkrPicker` in single-select / objectives-only mode so the alignment-map UX stays identical pixel-for-pixel.

**Privacy** — the picker honors the same visibility rules as the alignment search: the viewer never sees `isPrivate=true` items unless they own / contribute to them or are ADMIN / EXECUTIVE. Items the user can't see don't appear; nothing is greyed out.

### 3.1 Scope of an AI-generated sprint

The scope of a generation depends on the mode chosen in §3.0:

- **AUTO mode** — server loads the subject's full active OKR set (every active objective + every active KR they own or contribute to) and the AI picks which subset to focus on. This is what the original draft of this spec described.
- **MANUAL mode** — the user passes a curated `objectiveIds[]` and `keyResultIds[]` list from the OKR Picker (§3.0.1). Server validates the user has permission to plan against each, then loads ONLY those plus their direct parents (1 hop up — for hierarchical context) and any incomplete todos linked to them. The AI is told "the user has pre-selected these — do not propose work outside this scope" in the system prompt.

**Common to both modes**:
- **Subject**: one User (individual sprint) — v1. Department-scope sprints land in v2.
- **Duration**: default 14 days, configurable per-call (10 / 14 / 21). Start date defaults to next Monday.
- **Inputs the AI always receives** (server-built context bundle, mode-aware):
  - Selected objectives + KRs (full set in AUTO, curated in MANUAL): title, description, weight, target, current, unit, confidence, progress, due date.
  - Parent objectives of every selected objective (1 hop up) — context only, never planned against in MANUAL.
  - Last 2 sprints for the same subject: planned todos vs completed, completion %, KR check-ins during that window, blockers from `InitiativeUpdate`. Used by the velocity / carryover layer regardless of mode.
  - Active timeframe window (so AI knows how many weeks remain to deadline).
  - **Incomplete todos from the prior sprint** linked to the in-scope KRs (see §3.5). In MANUAL mode, todos linked to KRs the user did NOT pick are surfaced as a warning ("3 incomplete todos on KRs you didn't select — drop or include?") but excluded from the plan unless the user adds the KR.
  - Cross-team off-track KRs that name the subject as contributor — **AUTO mode only**. In MANUAL the user has explicitly scoped the plan and we don't expand it.
- **Privacy**: KRs / objectives marked `isPrivate=true` belonging to other users are **excluded from the context** unless the subject is the owner / contributor or the requester has ADMIN / EXECUTIVE role. The picker already filters these out, so MANUAL mode trivially respects this.

### 3.2 Generation algorithm (deterministic shell + AI core)

The server does the math, the AI does the judgment.

**Server pre-computes per KR**:
- `remainingGap = max(0, targetValue - currentValue)`
- `weeksLeftInTimeframe`
- `sprintsLeft = ceil(weeksLeftInTimeframe / 2)`
- `linearShare = remainingGap / sprintsLeft` (raw fair-share)
- `velocityFactor`: from last 2 sprints, the ratio of actual-delivered vs planned. Cap to `[0.5, 1.5]`.
- `weightShare`: KR weight as % of objective total (auto-equal when all are 0).
- `timeBudgetPct`: allocated effort % for the sprint, derived from `weightShare × confidenceBoost` (off-track KRs get +20% effort, on-track −10%, normalized to 100%).
- `carryoverDelta`: sum of remaining `progressValue` of every `KEEP` + `SPLIT` carryover item attached to this KR (see §3.5). Calculated **before** new-task generation.

**New-task target after carryover**:
```
newTaskTarget = clamp(linearShare × velocityFactor − carryoverDelta, 0, +∞)
```

If `carryoverDelta` already meets or exceeds `linearShare × velocityFactor` for a KR, the AI generates **no** new tasks for that KR this sprint — only the carryovers run. If carryovers fill ≥ 80% of total sprint capacity, the rationale flags this as **"sprint debt"** and the AI biases new tasks toward `STRETCH`.

**AI receives** these numbers + KR / objective context + the carryover dispositions and decides:
- Concrete todo titles (e.g. "Generate 12 leads via LinkedIn outreach (week 1)" rather than just a number).
- Which KRs to attack first vs defer (off-track + high-weight first).
- How to break a numeric `newTaskTarget` into 1–4 tasks with realistic per-task quantities summing to ≥ `newTaskTarget × 0.5` and ≤ `newTaskTarget × 1.5`.
- Per-task `priority`, `dueDate` (within the sprint window), `progressValue`, `taskType`.
- A short rationale paragraph the user sees before accepting.
- Per-task `ambitionLevel: "COMMITTED" | "STRETCH"` so the user can drop stretch items.

### 3.3 Outputs
- One draft `Sprint` row (`state=PLANNING`, owner=requester, optional `departmentId`).
- One `Todo` row per generated **new** task (`status=PENDING`, `sprintId=<draft sprint>`, `keyResultId` or `objectiveId` populated, `aiSuggested=true`).
- For carryovers (see §3.5): existing `Todo` rows are re-linked, split, descoped, or escalated according to disposition. No duplicate rows are created for `KEEP`.
- One `AiSprintPlan` row holding the rationale, allocations, prev-sprint review, and carryover summary.
- One `ActivityLog` row of action `SPRINT_AI_GENERATED`.

### 3.4 Review & commit flow
- Owner sees a "Review Plan" screen: rationale, per-KR allocation chart, **carryover section above new tasks**, list of proposed todos with checkboxes.
- Carryover items show: original sprint name, days overdue, last blocker (if any), `carryoverCount`, and the AI's one-sentence reason.
- Actions: **Accept all** / **Accept selected** / **Edit task** (inline edit) / **Override carryover disposition** / **Regenerate with feedback** (free-text → re-call AI with prior plan + feedback) / **Discard**.
- On Accept, sprint flips `state=ACTIVE`, todos are committed, watchers / notifications fire as today.

### 3.5 Carryover of incomplete todos

When the previous sprint ends (`Sprint.state` flipping to `COMPLETED` / `CANCELLED`, or when generating a new sprint while the prior is still `ACTIVE`), every todo from the prior sprint with `status ∈ {PENDING, IN_PROGRESS}` is a **carryover candidate**. The AI does not silently re-add them — it triages each one.

#### 3.5.1 Carryover decision per todo
For each candidate, the system passes the AI:
- The todo (title, description, status, priority, `progressValue`, `dueDate`, `assigneeId`, `taskType`).
- The parent KR / Objective and **its current state** (a KR may have moved while the sprint ran — `currentValue` could be higher, confidence could have shifted, the KR may have been archived).
- `carryoverCount` — how many prior sprints this todo has already been deferred from.
- Last 5 `InitiativeUpdate` rows (daily updates, especially `blockers`).
- Whether the parent KR / Objective is still `ACTIVE` and whether `currentValue >= targetValue` (already-hit KRs don't need more work).

#### 3.5.2 Disposition values

| Disposition | Meaning | Effect |
|---|---|---|
| `KEEP` | Carry as-is into the new sprint | No new `Todo` rows are created — the existing row is re-linked to the new sprint via `Todo.sprintId` and `dueDate` is shifted into the new window. `carryoverCount` increments by 1. |
| `SPLIT` | Too big / vague — break into 2–4 smaller todos | Original todo is closed with status `CANCELLED` and a `carryoverReplacedById` chain; new todos inherit the KR link, with `carryoverCount = prior + 1` and `originalSprintId` preserved. |
| `RESCHEDULE` | Still valid but shouldn't run this sprint (deps blocking, lower priority) | Stays unassigned to a sprint (`sprintId = null`) with a flag to surface in backlog; rationale entry explains why. |
| `DESCOPE` | No longer needed (KR archived, target already met, redundant) | Closed with status `CANCELLED`, reason recorded in activity log + rationale. |
| `ESCALATE` | Carried 2+ sprints already, or has unresolved blockers | `KEEP` behavior + a `Notification` to the assignee's manager (via existing dispatcher) + tagged in rationale's "needs attention" section. |

The owner can override every disposition during the review step (§3.4). Nothing is destructive until they accept.

#### 3.5.3 Server-forced rules (non-negotiable)
The server **overrides** the AI's choice in these cases:
1. **KR no longer active** — if `keyResult.status != ACTIVE` or `archivedAt != null`, force `DESCOPE`.
2. **KR target already met** — if `currentValue >= targetValue`, force `DESCOPE` regardless of AI judgment.
3. **Owner / assignee inactive** — if assignee is `isActive=false`, force `ESCALATE` with a `suggestedAssigneeId` populated in the rationale.
4. **Repeat carryover** — `carryoverCount >= 2` disallows plain `KEEP`. The AI must pick `SPLIT`, `DESCOPE`, or `ESCALATE`.
5. **Stale due date** — if original `dueDate` is more than 14 days past, the new `dueDate` is recomputed and the todo description is annotated with the slip (e.g. "Originally due 2026-04-12 — slipped from sprint '…'.").
6. **Privacy** — carryover items belonging to other users that the requester / subject can't see are excluded from context (§3.1).
7. **Cancelled-sprint todos** — todos from a `CANCELLED` sprint are eligible for carryover only if their parent KR is still active and the cancel reason wasn't "scope removed".
8. **No double-count of progressValue** — server must NOT add carryover `progressValue` to the KR's `currentValue` again; that already happened (or didn't) when the todo was originally completed.

### 3.6 Admin observability interface

A dedicated admin page exposes everything the system has done with AI so operators can audit cost, latency, and quality.

- **Route**: `app/dashboard/admin/ai-logs/page.tsx`. Sidebar entry under Admin (gated to `ADMIN` + `EXECUTIVE`).
- **List view** — paginated table over `AiGenerationLog`:
  - Columns: timestamp, user (email + role), feature (`SPRINT_PLAN`), model, status (OK / ERROR), input tokens, output tokens, cached tokens, cache-hit % (cached / input), cost USD, latency ms, error message (truncated), action (link to detail).
  - Filters: date range, user, feature, status, model, min/max cost.
  - Aggregate strip at the top: total generations, total cost (period), avg latency, cache-hit %, error rate.
- **Detail view** — `app/dashboard/admin/ai-logs/[id]/page.tsx`:
  - Full request metadata, full rationale, full allocations JSON pretty-printed, carryover summary, link to the resulting `AiSprintPlan` + `Sprint` (so admin can jump to the sprint board).
  - Side panel: raw context bundle that was sent to the AI (collapsed by default), structured tool-use response. Useful for debugging "why did it pick that".
  - Actions for ADMIN: copy bundle as JSON, mark plan `DISCARDED` (force-cleanup).
- **Cost page** — `app/dashboard/admin/ai-logs/cost/page.tsx`:
  - Daily / weekly / monthly cost rollups by feature + model.
  - Per-user leaderboard (top 10 generators).
  - Cap utilisation: `<used>/<daily-cap>` with warning banner at ≥ 80%.
- **Sprint plan inspector** — `app/dashboard/admin/ai-logs/plans/[planId]/page.tsx`:
  - Shows the plan exactly as the owner saw it during review, plus the ground-truth follow-up: how many proposed todos were accepted, how many completed by sprint end, KR delta achieved vs `plannedDelta`. This becomes our quality metric to tune prompts later.
- **API endpoints**:
  - `GET /api/admin/ai-logs` — list with filters + pagination (`{ data, pagination }` envelope).
  - `GET /api/admin/ai-logs/:id` — detail.
  - `GET /api/admin/ai-logs/cost?from=&to=&groupBy=` — rollup.
  - `GET /api/admin/ai-logs/plans/:planId/quality` — accepted/completed/delta computed on the fly.
- All endpoints behind `withAuth` + role gate (`ADMIN` | `EXECUTIVE`). Non-admins get 403 even on the detail page.

## 4. AI integration design

### 4.1 Multi-provider support

The system supports **three AI providers** behind a single `AiProvider` interface in `lib/ai/providers/`. The provider is selectable per-org (`OrganizationSettings.aiPreferredProvider`) and per-call (optional body param on `/generate`). Each provider implementation handles its own SDK call, structured-output parsing, and token reporting; the surrounding context bundler, math layer, and persistence are provider-agnostic.

| Provider | Default model | Summary helper | SDK | Env var | Notes |
|---|---|---|---|---|---|
| `anthropic` (default) | `claude-sonnet-4-6` | `claude-haiku-4-5-20251001` | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | Explicit `cache_control` for prompt caching (best cache-hit predictability). Tool-use schema. |
| `openai` | `gpt-4.1` | `gpt-4.1-mini` | `openai` | `OPENAI_API_KEY` | Automatic prompt caching for inputs > 1024 tokens (no manual control). Structured outputs via `response_format: { type: "json_schema" }`. |
| `gemini` | `gemini-2.5-pro` | `gemini-2.5-flash` | `@google/generative-ai` | `GEMINI_API_KEY` | Explicit cached content via Cache API. Function-calling tool with JSON schema. |

Models per provider are overridable via env (`AI_OPENAI_PLANNER_MODEL`, `AI_GEMINI_PLANNER_MODEL`, etc.).

**Default provider is `anthropic`** unless the org overrides it. **No automatic failover between providers** — if a call fails, the user sees the error and can retry or switch provider manually. Silent failover would hide quality drift.

### 4.2 Provider abstraction

```ts
// lib/ai/providers/types.ts
export interface AiProvider {
  id: 'anthropic' | 'openai' | 'gemini'
  generateSprintPlan(
    bundle: ContextBundle,
    options: { modelId: string; maxOutputTokens: number; signal?: AbortSignal }
  ): Promise<{
    plan: SprintPlanToolPayload   // normalized shape across providers
    usage: { inputTokens: number; outputTokens: number; cachedTokens: number }
    raw: unknown                   // provider-native response, kept for admin debug view
  }>
}
```

A factory `getProvider(id): AiProvider` resolves the implementation. Provider-specific SDK calls + cache control + tool-use parsing are isolated to one file per provider.

### 4.3 Common settings (apply to all providers)

- **Server-side only** — keys never exposed to the client.
- **Prompt caching** (5-min TTL on Anthropic, automatic on OpenAI, explicit on Gemini): the org-wide / department-wide OKR snapshot is the cacheable prefix. Expected cache hit rate ≥ 70% on Anthropic during a planning window. OpenAI/Gemini cache effects show in the same `cachedTokens` column but the admin UI labels the column "cached (provider-dependent)".
- **Structured output**: every provider returns the same normalized `sprint_plan` JSON via its native structured-output mechanism (Zod-validated server-side after parsing). No free-text parsing.
- **Token budget**: cap input at 60k tokens, output at 8k. Reject + warn if context bundle exceeds 60k.
- **Idempotency**: keyed by `(subjectUserId | subjectDeptId, sprintStartDate)` — independent of provider. Re-running with a different provider on the same key still returns the existing draft unless `Regenerate` is used.
- **Cost guardrails**: per-org daily generation cap (default 50 sprints / day, all providers combined), per-user cooldown (1 generation per 30 min unless ADMIN). Counts and per-provider cost rollups in `AiGenerationLog`.
- **Failure mode**: any AI / tool error → draft sprint is NOT created, user sees the error message + provider name + a retry button (with a "try a different provider" link). No partial writes.

## 5. Data model changes

Add to `prisma/schema.prisma`:

```prisma
model AiSprintPlan {
  id               String   @id @default(cuid())
  sprintId         String   @unique
  subjectUserId    String?
  subjectDeptId    String?
  generatedById    String
  modelId          String   // e.g. "claude-sonnet-4-6"
  promptTokens     Int
  outputTokens     Int
  cachedTokens     Int      @default(0)
  rationale        String   // markdown summary shown to user
  allocations      Json     // see shape below
  prevSprintReview Json?    // { completed, planned, blockers[], krDeltas[] }
  carryoverSummary Json?    // { total, kept, split, rescheduled, descoped, escalated, blockers[] }
  feedback         String?  // user instruction on regenerate
  status           String   @default("DRAFT") // DRAFT | ACCEPTED | DISCARDED | SUPERSEDED
  createdAt        DateTime @default(now())
  acceptedAt       DateTime?
  sprint           Sprint   @relation(fields: [sprintId], references: [id], onDelete: Cascade)
}

model AiGenerationLog {
  id            String   @id @default(cuid())
  userId        String
  feature       String   // "SPRINT_PLAN"
  modelId       String
  inputTokens   Int
  outputTokens  Int
  cachedTokens  Int      @default(0)
  costUsd       Float
  status        String   // OK | ERROR
  errorMessage  String?
  createdAt     DateTime @default(now())
  @@index([userId, createdAt])
  @@index([feature, createdAt])
}
```

`AiSprintPlan.allocations` JSON shape:
```ts
Array<{
  keyResultId: string;
  weightShare: number;       // 0..1
  timeBudgetPct: number;     // 0..1
  plannedDelta: number;      // newTaskTarget after carryover subtraction
  carryoverDelta: number;    // sum of carried progressValue for this KR
  velocityFactor: number;    // 0.5..1.5
  carryoverItemIds: string[];
}>
```

Add to `Todo`:
```prisma
aiSuggested            Boolean  @default(false)
ambitionLevel          String?  // COMMITTED | STRETCH
originalSprintId       String?  // sprint where this todo was first introduced
carryoverCount         Int      @default(0)
lastCarriedAt          DateTime?
carryoverReplacedById  String?  // when SPLIT, points to the new parent group
carryoverDisposition   String?  // KEEP | SPLIT | RESCHEDULE | DESCOPE | ESCALATE — null on first creation
@@index([originalSprintId])
@@index([carryoverCount])
```

Add to `OrganizationSettings`:
```prisma
aiSprintPlanningEnabled Boolean @default(false)
/// Default provider for AI generation: "anthropic" | "openai" | "gemini".
aiPreferredProvider     String  @default("anthropic")
```

Add to `AiSprintPlan` and `AiGenerationLog`:
```prisma
provider String  // "anthropic" | "openai" | "gemini"
```

All additions are nullable / default-safe → no destructive `preflight.sql` needed; `prisma db push` is sufficient.

## 6. API surface

Under `app/api/sprints/ai/` — all behind `lib/api/withAuth.ts` and the role gate in §7.

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/sprints/ai/carryover-candidates?subjectUserId=…&priorSprintId=…` | Returns the list of incomplete todos + AI-suggested dispositions, **without** persisting a draft. |
| POST | `/api/sprints/ai/generate` | Build context, call AI, persist draft sprint + AiSprintPlan + carryover assignments. Body: `{ subjectUserId, startDate, durationDays, mode: "AUTO" \| "MANUAL", objectiveIds?: string[], keyResultIds?: string[], feedback?, provider? }`. `mode="MANUAL"` requires non-empty `keyResultIds[]` (validated server-side). `mode="AUTO"` ignores `objectiveIds` / `keyResultIds`. Provider defaults to `OrganizationSettings.aiPreferredProvider`. Response includes `proposedTodos`, `carryover`, and the chosen `provider`/`modelId`/`mode`. |
| GET  | `/api/sprints/ai/:planId` | Fetch draft + rationale + proposed todos + carryover for review. |
| POST | `/api/sprints/ai/:planId/carryover/override` | Body: `{ todoId, disposition, reason? }` — owner overrides the AI's choice. |
| POST | `/api/sprints/ai/:planId/accept` | Body: `{ todoIds: string[] }` → flips sprint ACTIVE, deletes unselected proposed todos, applies carryover dispositions. |
| POST | `/api/sprints/ai/:planId/regenerate` | Body: `{ feedback }` → marks current `SUPERSEDED`, generates new. |
| POST | `/api/sprints/ai/:planId/discard` | Cascades sprint + todos delete. |
| GET  | `/api/sprints/ai/preview-context` | (admin debug) returns the exact context bundle the AI would receive — useful to validate privacy filtering. |

## 7. Permissions

| Role | Can generate | Subject scope |
|---|---|---|
| ADMIN / EXECUTIVE | Yes | Any user, any department |
| DEPARTMENT_LEAD | Yes | Themselves + any member of their primary department |
| EMPLOYEE | Yes | Themselves only |

Cross-team OKR context is read through existing visibility rules in `lib/permissions.ts` — private items belonging to others are filtered server-side before the AI sees them. Carryover only includes todos visible to the **subject** (the sprint owner), not the requester. An ADMIN generating for an EMPLOYEE doesn't get to see private todos the EMPLOYEE could see — they get the EMPLOYEE's filtered view, because the resulting sprint is the EMPLOYEE's.

## 8. UI touchpoints

- **"Generate AI Sprint" button** with Sparkles icon on:
  - `features/sprints/components/SprintsListClient.tsx` (top-right of the sprints list).
  - `app/dashboard/my-okrs/page.tsx` (header row, right side).
  - Both share the same handler that opens the scope-selection modal.
- **Scope-selection modal** — `features/sprints/components/GenerateSprintModal.tsx`:
  - Three sections per §3.0 step 2: sprint window, provider (collapsed for non-admin), scope card-picker.
  - The "I'll choose OKRs" card embeds the new `OkrPicker` (§3.0.1) inline below the cards (not in a separate modal — same surface, expanded).
  - Footer buttons: Cancel / Back (when picker open) / Generate Sprint.
  - On submit, calls `POST /api/sprints/ai/generate` with `{ mode, objectiveIds?, keyResultIds?, ... }`.
- **Shared OKR Picker** — `components/shared/OkrPicker/`:
  - Generalised from `features/objectives/components/ParentObjectiveSelector.tsx` (which currently powers the Alignment Map's parent-objective selection).
  - Modes: `single-objective` (existing behavior, alignment-map / parent-of-objective use), `multi` (new — used by the AI sprint modal).
  - In `multi` mode: each objective row is expandable to reveal its KRs; both objectives and KRs have checkboxes; selection summary footer shows aggregate count.
  - Filters: timeframe, level, search, "active timeframe only", and (new) "Mine only" toggle (default ON in the AI modal context, OFF in alignment-map).
  - The Alignment Map continues to consume the picker in `single-objective` mode — its UX must remain unchanged after the refactor.
- **Backend extension**: `/api/objectives/alignment-search` accepts `includeKeyResults=true&multi=true`; existing single-select callers omit these and get the existing payload shape.
- New review screen at `app/(dashboard)/sprints/ai/[planId]/page.tsx` showing:
  - Rationale (markdown).
  - Allocation chart per KR.
  - **Carryover section above new tasks** with disposition badges (`Keep`, `Split into 3`, `Reschedule`, `Descope`, `Escalate`), per-section toggle to "accept all dispositions" or override individually.
  - New tasks list with edit / checkbox / `STRETCH` toggle / regenerate.
- Generation progress modal (streaming AI tokens via existing Pusher channel `private-user-{id}`): "Reviewing previous sprint…", "Triaging carryover items…", "Computing allocations…", "Drafting tasks…". When the user picked MANUAL mode, the first step label changes to "Reviewing your selected OKRs…".

## 9. Non-functional requirements

- p95 generation latency ≤ 25s (warm cache) / 45s (cold).
- Generation must work with the current sparse data state (KRs with `weight=0`, missing dueDates, placeholder owners) — see AC #6.
- All AI inputs / outputs logged to `AiGenerationLog` for audit; rationale text retained even after sprint completion.
- No PII leaves the server beyond what's already in the OKR (titles / descriptions). Anthropic API call uses TLS, no training opt-in.
- Feature behind a per-org flag (`OrganizationSettings.aiSprintPlanningEnabled`) so it can be rolled out gradually.

## 10. Acceptance criteria

### Core generation
1. **Happy path — individual sprint, warm cache.** Logged in as `biruk@360ground.com` (ADMIN, owns 13 objectives), POST `/api/sprints/ai/generate` with `subjectUserId=<self>, startDate=next Monday, durationDays=14`. Within 25s the response returns a `planId` and a draft sprint with **3–15 todos** linked to **at least 3 distinct KRs** the user owns, with `dueDate` between start and start+14d. `AiSprintPlan.rationale` is non-empty. The sprint stays `state=PLANNING` until accepted.
2. **Allocation math.** For any KR in the plan with numeric `targetValue > 0`, the sum of `progressValue` across **new** proposed todos for that KR is ≥ `plannedDelta × 0.5` and ≤ `plannedDelta × 1.5` (where `plannedDelta = max(0, linearShare × velocityFactor − carryoverDelta)`).
3. **Weight balancing.** When two active KRs on the same objective have weights 70 and 30, the total proposed `progressValue × estimatedHours` budget for the heavier KR is greater than for the lighter — verifiable from `AiSprintPlan.allocations[i].timeBudgetPct`.
4. **Previous-sprint review.** If a prior sprint exists for the subject, `AiSprintPlan.prevSprintReview` contains `completed`, `planned`, and a `blockers` array. If no prior sprint, the field is null and the rationale text states "first sprint — using baseline".
5. **Privacy filter.** With an EMPLOYEE user, no `isPrivate=true` objective / KR belonging to another user appears in the context bundle returned by `GET /api/sprints/ai/preview-context` (admin endpoint, but data is filtered as that EMPLOYEE).
6. **Sparse-data resilience.** Run generation against a user whose KRs all have `weight=0`, `targetValue=100`, `currentValue=0`, no `dueDate` on any todo. Result: still a valid plan with auto-equal weights and a rationale explaining the assumption. No 500.
7. **RBAC.** EMPLOYEE calling generate with another user's `subjectUserId` returns 403. DEPARTMENT_LEAD calling for a member of a department they don't lead returns 403.
8. **Idempotency.** Two POSTs to `/generate` with identical `(subjectUserId, startDate)` within 30 min return the same `planId`. The second call does NOT create a second sprint.
9. **Regenerate replaces, doesn't dup.** POST `/regenerate` with `feedback="I want fewer marketing tasks"` marks the prior plan `SUPERSEDED`, deletes its draft todos, and creates a new plan in `DRAFT`. Only one DRAFT plan per `(subject, startDate)` ever exists.
10. **Selective accept.** POST `/accept` with `todoIds=[t1, t3]` keeps only those two new todos under the sprint, deletes the rest, and flips `Sprint.state=ACTIVE`. `AiSprintPlan.status=ACCEPTED, acceptedAt` is set. An `ActivityLog` row `SPRINT_AI_ACCEPTED` is written.
11. **Failure isolation.** Simulate Anthropic 500. The endpoint returns 502 with `{ error }`, no Sprint or Todo rows are created, an `AiGenerationLog` row with `status=ERROR` is recorded.
12. **Cost cap.** When `AiGenerationLog` count for the org reaches the daily limit, further `/generate` calls return 429 with a clear message.
13. **Feature flag off.** With `OrganizationSettings.aiSprintPlanningEnabled=false`, the API endpoints return 404 and the "AI Plan" button is hidden.
14. **Cache observability.** After the second generation in the same 5-min window for the same department, `AiGenerationLog.cachedTokens > 0`.

### Carryover
15. **Basic carryover.** A user with 8 PENDING todos in a just-ended sprint runs `/generate` for the next sprint. The response contains a `carryover` array with all 8 items, each with one of the 5 dispositions. No new `Todo` rows are created for items marked `KEEP`; their `sprintId` is updated to the new sprint and `carryoverCount` increments by 1.
16. **Carryover subtracts from new-task target.** A KR has `linearShare × velocityFactor = 10`. Carryovers contribute `progressValue` summing to 6. New tasks generated for that KR have `progressValue` summing to ≥ 3 and ≤ 6. Verifiable from `AiSprintPlan.allocations[i].plannedDelta` and `carryoverDelta`.
17. **Saturated KR.** If carryovers for a KR already meet / exceed the sprint share, the AI generates **0** new tasks for that KR and the rationale text explicitly says so.
18. **Auto-descope when KR archived.** Archive a KR mid-sprint, leave one PENDING todo on it, generate next sprint. That todo's disposition is `DESCOPE` (server-forced). The todo is `CANCELLED` after accept; an `ActivityLog` `TODO_DESCOPED_BY_AI` row is written.
19. **Auto-descope when KR target met.** A KR's `currentValue >= targetValue` at sprint end. Any incomplete todo on it is `DESCOPE`.
20. **Repeat carryover escalation.** A todo with `carryoverCount = 2` cannot be returned with disposition `KEEP`. The response disposition is one of `SPLIT | DESCOPE | ESCALATE`. If `ESCALATE`, a `Notification` row is created for the assignee's manager (via `ManagerRelationship`) on accept.
21. **Split.** AI returns disposition `SPLIT` for one todo. After accept, the original todo is `CANCELLED` with `carryoverReplacedById` set; 2–4 new todos exist with `keyResultId` matching the original, `carryoverCount = original + 1`, `originalSprintId` matching the original, and titles that reflect smaller chunks.
22. **Override.** User flips disposition from `DESCOPE` to `KEEP` via `/carryover/override`. After accept, the todo is moved into the new sprint as `KEEP`, the override + reason is logged in `ActivityLog`.
23. **No double-count.** A todo has `progressValue=5` and is carried over with `KEEP`. The parent KR's `currentValue` is unchanged by the act of carrying over (it changes only when the todo is eventually `COMPLETED`).
24. **Stale due date acknowledgement.** A todo with `dueDate` 21 days in the past is carried with `KEEP`. The new `dueDate` is within the new sprint window AND its description contains a generated note (e.g. "Originally due 2026-04-12 — slipped from sprint '…'.").
25. **Sprint debt warning.** When carryovers consume ≥ 80% of estimated sprint capacity, `AiSprintPlan.rationale` contains a "sprint debt" warning section AND `carryoverSummary.escalated >= 1` OR new tasks are tagged `STRETCH`.
26. **Cancelled sprint.** Generate from a `CANCELLED` prior sprint — todos whose KR is still active are still considered for carryover; `prevSprintReview` notes the prior sprint was cancelled rather than completed.
27. **Reassignment when assignee inactive.** Carryover on a todo whose `assignee.isActive=false` returns disposition `ESCALATE` with a `suggestedAssigneeId` populated in the rationale.
28. **First-sprint scenario unchanged.** When there is no prior sprint, the response's `carryover` array is empty and AC #4 still holds.

### Observability
29. **Admin log list.** ADMIN visiting `/dashboard/admin/ai-logs` sees a paginated table of every `AiGenerationLog` row with all columns from §3.6. EMPLOYEE visiting the same URL gets 403.
30. **Cost rollup correctness.** `GET /api/admin/ai-logs/cost?from=2026-05-01&to=2026-05-31&groupBy=day` returns sum of `costUsd` per day; the sum across days equals the sum of `costUsd` of all matching `AiGenerationLog` rows.
31. **Cache-hit visibility.** After AC #14 fires, the admin list view shows the second row with `cachedTokens > 0` and a cache-hit % computed as `cachedTokens / inputTokens` rounded to 1dp.
32. **Plan quality telemetry.** After AC #10 (selective accept) followed by sprint completion, `GET /api/admin/ai-logs/plans/:planId/quality` returns `{ proposed, accepted, completed, krDeltaAchieved, plannedDelta }` where `accepted = todoIds.length` from accept payload and `completed` matches the count of those todos with `status=COMPLETED`.
33. **Cap warning surface.** When `AiGenerationLog` count for the day reaches 80% of the daily cap, the admin cost page displays a yellow banner; at 100% it is red. The same threshold drives the 429 in AC #12.

### Initiation flow & MANUAL scope
34a. **Button gated by flag.** When `OrganizationSettings.aiSprintPlanningEnabled=false`, the "Generate AI Sprint" button is not rendered on the sprints list or on My OKRs.
34b. **Modal AUTO path.** Clicking "Generate AI Sprint" opens the modal. With "Let AI pick OKRs" selected, the user can press Generate immediately. The resulting `/generate` request body has `mode: "AUTO"` and no `objectiveIds`/`keyResultIds`. The plan can target any active KR the subject owns or contributes to.
34c. **Modal MANUAL path.** Selecting "I'll choose OKRs" reveals the OKR picker inline. With 0 KRs selected, the Generate button is disabled and the inline hint reads "Pick at least one key result — we'll build the sprint around it." Selecting at least 1 KR enables Generate. The request body has `mode: "MANUAL"` and a non-empty `keyResultIds[]`.
34d. **MANUAL respects scope.** When `mode="MANUAL"` is sent with `keyResultIds=[krA, krB]`, every proposed Todo in the response has `keyResultId` ∈ {krA, krB} OR `objectiveId` matching one of those KRs' objectives. No proposed task is linked to a KR outside the picked set.
34e. **MANUAL permission check.** When the requester (or subject) lacks read-permission on one of the supplied `keyResultIds`, `/generate` returns 403 with the specific id flagged in `details.invalidIds`. No partial plan is created.
34f. **MANUAL out-of-scope carryover warning.** When MANUAL is used and the prior sprint has incomplete todos linked to KRs the user did NOT pick, the response includes `outOfScopeCarryover: [{ todoId, keyResultId, keyResultTitle, count }]`. The review UI displays a banner; those todos are NOT auto-included.
34g. **OKR picker reuse.** After the alignment-map refactor, the Alignment Map's parent-objective selector still works exactly as before — single-select, objectives only — verified by the existing alignment-map flow producing the same network payload to `/api/objectives/alignment-search` (without the new params).
34h. **Picker multi-select shape.** With `includeKeyResults=true&multi=true` on `/api/objectives/alignment-search`, each objective row in the response carries an embedded `keyResults[]` array, each KR filtered for active status and visibility. Without these params, the response shape is byte-identical to the pre-change shape.
34i. **"Mine only" toggle default.** When the picker is opened from the AI Sprint modal, the "Mine only" filter is checked by default and the result set is limited to KRs the subject owns or contributes to. When opened from the alignment-map flow, the toggle is off by default to preserve current behavior.

### Multi-provider
34. **Provider override per call.** POST `/generate` with `provider="openai"` calls the OpenAI implementation regardless of `OrganizationSettings.aiPreferredProvider`. The resulting `AiSprintPlan.provider="openai"` and `AiGenerationLog.provider="openai"`.
35. **Provider default fallback.** POST `/generate` without a `provider` param uses `OrganizationSettings.aiPreferredProvider`. With the default seed (`"anthropic"`), the call goes to Anthropic.
36. **Missing key per provider.** With `OPENAI_API_KEY` unset, POST `/generate` with `provider="openai"` returns 503 with `{ error: "Provider not configured: openai" }`. Anthropic / Gemini calls in the same env still succeed if their keys are set.
37. **No cross-provider failover.** When the chosen provider returns an error, the response is the standard 502 (AC #11) — the system does NOT silently retry with a different provider. The error message names the provider.
38. **Cost rollups split by provider.** `GET /api/admin/ai-logs/cost?groupBy=provider` returns one row per provider (`anthropic`, `openai`, `gemini`) summing `costUsd`. Sum across providers equals total org spend for the period.
39. **Admin UI provider filter.** The admin AI logs list view exposes a `provider` filter (All / Anthropic / OpenAI / Gemini). Each row shows the provider as a badge alongside the model.
40. **Idempotency is provider-agnostic.** Two `/generate` calls with the same `(subjectUserId, startDate)` but different `provider` values still return the same `planId` (from AC #8). To switch provider, the user must use `/regenerate`.

## 11. Resolved decisions (v1 scope)

Locked 2026-05-03 after review:

1. **Subject scope** → **individual only**. Department-scope sprints land in v2 once individual flow is proven.
2. **Stretch toggle** → **visible** in the review screen. Per-task `ambitionLevel` is shown as a toggle so users can drop stretch items before accepting.
3. **Anthropic key** → `ANTHROPIC_API_KEY` env var, server-side only. Key value provisioned by org admin before flipping `OrganizationSettings.aiSprintPlanningEnabled=true`.
4. **Regenerate cost** → **separate budget** of 3 regenerations per 30 min per user (independent from the 1-generation-per-30-min cooldown), so reviewers can iterate without exhausting their generate quota.
5. **Reschedule semantics** → **backlog only** (`sprintId=null`). No queue-for-future-sprint pointer in v1.

## 12. Suggested build order

1. Schema additions (`AiSprintPlan`, `AiGenerationLog`, `Todo` carryover columns, org flag) via `prisma db push`.
2. Deterministic context bundler + math layer (no AI) with unit tests against current prod data shape.
3. Carryover-candidate detection + server-forced disposition rules (still no AI).
4. AI integration last (Anthropic SDK, tool-use schema, prompt caching), behind the org flag.
5. UI: review screen, generation progress modal, carryover override controls.
