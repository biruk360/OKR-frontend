# AI Automations — Module Specification

**Module:** Automations (AI Automations)
**Parent system:** Meda Business Platform / OKR Management
**Menu placement:** OKR & Operations → **Automations**
**Document version:** 1.0
**Owners:** Platform · Operations · Sales (Odoo CRM) · Business Development (tenders)
**Status:** Specification — not implemented
**Dependencies:** `lib/ai/*` (provider pipeline), `lib/odoo-contacts.ts` (Odoo XML-RPC), `lib/email.ts`, `lib/notifications/*`, `lib/rbac.ts`, `lib/permissions.ts`

---

## 1. Naming decisions

| Concept | Name | Notes |
|---|---|---|
| The feature / module | **Automations** | Plain, extensible. Not "Agents" — avoids confusion with the AI vendor sense and with `ProjectMember` roles. |
| A saved, user-authored automated task | **Automation** | The config record: instruction + schedule + tools + recipients. |
| One firing of an Automation | **Run** | The audit object. Has a transcript, cost, status, duration. |
| The document a Run produces | **Briefing** | The rendered HTML report. "Monday Tender Briefing", "Daily CRM Briefing". Business vocabulary, prints well, emails well. |
| One item of substance inside a Briefing | **Finding** | Structured record (`dedupeKey`, title, url, fields, score). Powers run-to-run diffing. |
| The compiled, executable form of the instruction | **Plan** | Versioned JSON. The instruction is the authoring surface; the Plan is the execution surface. |
| A permission to use an external capability | **Tool grant** | Admin-approved for Tier-2 tools; owner-selected for Tier-0/1. |

Alternates considered and rejected: "Routines" (collides with the `schedule` skill vocabulary), "Jobs" (already used for `ScrumJobRun` internals), "Workflows" (implies branching/approval chains this module does not have in v1).

---

## 2. Module goals

1. Let a non-technical user describe a recurring task **in natural language** and have the system execute it on a schedule, forever, without an engineer.
2. Gather from **internal data (OKR/Projects), Odoo CRM, and the public web**, synthesise with AI, and publish the result as a readable document in the system.
3. Notify a configured recipient list **only when there is something new**.
4. Keep every run auditable: what ran, what it read, what it cost, what it produced.

### Non-goals (v1)

- Logging into authenticated third-party websites. Deferred to Phase 3 (§18).
- Reading user mailboxes. Deferred to Phase 3.
- Branching / approval workflows inside an Automation. A Run is linear: gather → synthesise → publish → notify.
- Automations writing to Odoo or any external system. **v1 is read-only outbound**; the only writes are into this platform.
- Chaining (one Automation triggering another). Phase 4.

---

## 3. Roles & permissions

### 3.1 Doctypes

Two new entries in `DocTypeRegistry` (seed via `scripts/seed-automation-permissions.ts`, following the pattern of `scripts/seed-scrum-permissions.ts`):

| Doctype | Records | Notes |
|---|---|---|
| `AUTOMATION` | The config records | Create/Read/Update/Delete/Submit(=enable) |
| `AUTOMATION_BRIEFING` | The output documents | Read/Delete. Never user-created directly. |

### 3.2 Capability

`canAuthorAutomations` — a `FeaturePermission` key, mirroring `isProjectManager` from the Project Creation spec. Without it a user may only *read* Briefings they are a recipient of.

### 3.3 Roles

| Role | Rights |
|---|---|
| **Automation Author** (`canAuthorAutomations`) | Create/edit/delete own Automations. Select Tier-0 and Tier-1 tools. Add recipients from users they can already see under RBAC. Trigger manual runs. |
| **Automation Admin** (org admin) | All of the above, org-wide. Approves Tier-2 tool grants. Sets org cost caps. Global pause. Views all Briefings and run transcripts. |
| **Recipient** | Reads Briefings they are listed on. Cannot see the plan, the transcript, or the cost. |

### 3.4 Data-visibility rule (non-negotiable)

An Automation executes **as its owner**. Every internal read (`okr.query`) is passed through `lib/rbac.ts` + `lib/permissions.ts` + `RecordScopeRule` with the owner's identity. An Automation can never surface data its owner cannot see, and adding a recipient never widens what the recipient can see beyond the Briefing body itself.

Corollary: when an owner is deactivated, their Automations are **auto-paused**, not silently re-owned.

---

## 4. Concepts & lifecycle

```
  ┌─ Author ────────────────────────────────────────────────────┐
  │ user types instruction in natural language                  │
  │        ↓ COMPILE (AI, interactive, once)                    │
  │ PlanSpec JSON → shown in an editable form → user confirms   │
  └─────────────────────────────────────────────────────────────┘
                              ↓ save (mode = DRY_RUN)
  ┌─ Execute (every tick) ──────────────────────────────────────┐
  │ tick → due? → enqueue Run (QUEUED)                          │
  │ worker claims Run → walk plan steps → tools → AI synthesis  │
  │        → Findings → diff vs previous Run → Briefing blocks  │
  │        → render HTML (app + email) → publish → notify       │
  └─────────────────────────────────────────────────────────────┘
                              ↓ owner gains confidence
                    DRY_RUN → REVIEW → AUTO
```

### 4.1 Distribution modes

The graduation gates **distribution**, because that is the irreversible side effect.

| Mode | Briefing created | Visible to | Email sent |
|---|---|---|---|
| `DRY_RUN` | Yes, flagged `isDraft` | Owner only | No |
| `REVIEW` | Yes, status `PENDING_REVIEW` | Owner only, until approved | On owner approval |
| `AUTO` | Yes, status `PUBLISHED` | Owner + recipients | Immediately (subject to `onEmpty`) |

**FR rule:** every newly created Automation starts in `DRY_RUN`. Promotion to `AUTO` requires at least one successful run in `DRY_RUN` or `REVIEW`. Promotion is a deliberate action with a confirm dialog naming the recipients who will start receiving email.

---

## 5. Schedule model

### 5.1 Presets

Raw cron is an escape hatch, not the primary UI.

| Preset | Anchors | Example |
|---|---|---|
| `ONCE` | `runAt` (datetime) | One-off research task |
| `HOURLY` | `minute`, `activeWindow` (start–end), `weekdaysOnly` | Inbox-style polling, 08:00–18:00 |
| `DAILY` | `atTime`, `weekdaysOnly` | 08:00 CRM sweep |
| `WEEKLY` | `byDay[]` (MON–SUN), `atTime` | Mondays 07:00 |
| `MONTHLY` | one of `dayOfMonth` \| `nthWeekday` \| `lastBusinessDay`, `atTime` | Last business day, 16:00 |
| `QUARTERLY` | `quarterSource` (`CALENDAR` \| `FISCAL`), `offset` (`FIRST_DAY` \| `LAST_DAY` \| `N_DAYS_BEFORE_END`), `atTime` | Fiscal Q close −5 days |
| `YEARLY` | `month`, `day`, `atTime` | Annual planning prep |
| `CUSTOM_CRON` | 5-field cron string | Power users only; validated server-side |

`FISCAL` quarters resolve against the existing `Timeframe` model so the schedule follows the org's actual fiscal calendar rather than Jan–Mar.

### 5.2 Required attributes on every schedule

| Attribute | Default | Purpose |
|---|---|---|
| `timezone` (IANA) | `Africa/Addis_Ababa` | All evaluation happens in this tz. Stored per Automation. |
| `calendarSystem` | `GREGORIAN` | `ETHIOPIAN` supported for `MONTHLY`/`YEARLY` via the existing `kenat` dependency. |
| `skipHolidays` | `false` | When true, suppress runs on org holidays. |
| `catchUpPolicy` | `SKIP` | `SKIP` (missed slot is lost) \| `RUN_LATE` (fire as soon as possible) \| `RUN_ONCE_LATEST` (collapse N missed slots into one). Monthly reports want `RUN_LATE`; morning digests want `SKIP`. |
| `catchUpWindowMinutes` | `120` | Beyond this, `RUN_LATE` gives up and records a `MISSED` run. |
| `overlapPolicy` | `SKIP` | `SKIP` \| `QUEUE`. A Run holding the lease blocks the next slot. |
| `jitterSeconds` | `0–300` (auto) | Auto-spread so 200 Automations at 08:00 do not hammer Odoo and the AI provider simultaneously. |
| `startDate` / `endDate` | null | Optional bounds. `endDate` auto-pauses. |
| `maxRuns` | null | Optional total-run cap. |

### 5.3 Evaluation contract

- The tick computes `nextRunAt` for every enabled Automation and persists it. `nextRunAt` is the index the tick queries — never scan all Automations and evaluate cron in memory.
- A Run row carries `scheduledFor` (the nominal slot, not the actual start). `@@unique([automationId, scheduledFor])` guarantees exactly-once per slot, the same idempotency idea as `ScrumJobRun`'s `@@unique([jobKey, userId, runDate])`.
- DST and tz changes: always recompute `nextRunAt` from the wall-clock rule in the stored tz after each run; never add a fixed millisecond delta.

---

## 6. The Plan (compiled instruction)

### 6.1 Why compile

The instruction is **not** re-interpreted on every run. Re-prompting from free text each time makes cost unpredictable, runs irreproducible, and lets a vague sentence silently change behaviour at 03:00. Instead:

- **Compile once**, interactively, at save time. AI turns the instruction into a `PlanSpec`.
- The user **reviews and edits the PlanSpec in a form** before saving.
- At run time the worker **walks the plan deterministically**. AI is used for judgment and prose (is this tender relevant? write the summary), not for deciding what to do.
- Editing the instruction produces `planVersion + 1` with a **diff preview**: "this will now also search dgmarket.com, and run daily instead of weekly — confirm."

### 6.2 PlanSpec shape

```jsonc
{
  "version": 3,
  "schedule": {
    "kind": "WEEKLY", "byDay": ["MON"], "atTime": "07:00",
    "timezone": "Africa/Addis_Ababa", "catchUpPolicy": "RUN_LATE"
  },
  "steps": [
    {
      "id": "s1", "tool": "odoo.search", "label": "Stalled leads",
      "params": {
        "model": "crm.lead",
        "domain": [["write_date", "<", "{{now-14d}}"], ["stage_id.is_won", "=", false]],
        "fields": ["name", "partner_id", "expected_revenue", "user_id", "write_date"],
        "limit": 100
      }
    },
    {
      "id": "s2", "tool": "web.search", "label": "New tenders",
      "params": {
        "queries": ["Ethiopia construction tender {{month}} {{year}}"],
        "sources": ["2merkato.com", "ppa.gov.et", "dgmarket.com"],
        "maxResults": 25, "recencyDays": 14
      }
    },
    { "id": "s3", "tool": "web.fetch", "label": "Read each hit",
      "params": { "from": "s2", "maxPages": 25, "extract": ["issuer","deadline","value","sector"] } }
  ],
  "synthesis": {
    "objective": "Surface construction tenders in Ethiopia above 5,000,000 ETB and leads stalled 14+ days.",
    "relevanceCriteria": "sector = construction OR civil works; value > 5,000,000 ETB; deadline in the future",
    "findingSchema": {
      "dedupeKeyFields": ["issuer", "title", "deadline"],
      "fields": ["issuer", "title", "deadline", "valueEtb", "sector", "sourceUrl"]
    },
    "maxFindings": 30
  },
  "briefing": {
    "titleTemplate": "Tender & CRM Briefing — {{date}}",
    "sections": ["SUMMARY", "NEW", "CHANGED", "UNCHANGED_COUNT", "SOURCES"],
    "tone": "concise, factual, no marketing language"
  },
  "notify": {
    "emailRecipients": ["userId:abc", "userId:def"],
    "inApp": true,
    "telegramChatId": null,
    "onEmpty": "SKIP"
  },
  "limits": { "maxSteps": 20, "maxCostUsd": 0.50, "timeoutSeconds": 600 }
}
```

### 6.3 Template variables

Resolved by the worker before tool invocation, never by the model: `{{now}}`, `{{now-14d}}`, `{{today}}`, `{{date}}`, `{{month}}`, `{{year}}`, `{{quarter}}`, `{{lastRunAt}}`, `{{owner.name}}`, `{{org.name}}`. Unknown variables are a compile-time validation error.

### 6.4 Compile-time validation

The compiler output is rejected (and re-prompted once, then surfaced to the user) if: an unknown tool is referenced; a tool is referenced that the owner lacks a grant for; a domain is outside the allowlist; `maxCostUsd` exceeds the owner's per-run cap; the cron is invalid; a step references an `id` that does not exist or is not earlier in the list.

---

## 7. Tool catalog (v1)

Tools are **granted**, not ambient. An Automation carries an explicit allowlist with bound parameters; the worker refuses any call outside it.

### Tier 0 — internal, reuses existing code

| Tool | Backing | Grant parameters |
|---|---|---|
| `okr.query` | Prisma + `lib/rbac.ts` | Which entity kinds (objectives, KRs, todos, projects, sprints, risks); always scoped to the owner's RBAC |
| `notify.email` | `sendMail` in `lib/email.ts` | Recipient list (users only, no free-text addresses in v1 — avoids exfiltration and bounces; `isBlockedRecipient` still applies) |
| `notify.inapp` | `emit()` in `lib/notifications` | New event key `AUTOMATION_BRIEFING_PUBLISHED` |
| `notify.telegram` | `TelegramBotConfig` / `TelegramChat` | A chat id the org already has configured |
| `ai.synthesize` | `lib/ai/pipeline.ts` | Provider + model from `lib/ai/config.ts`; new `AI_FEATURE_KEYS.AUTOMATION_RUN` |

### Tier 1 — new, bounded

| Tool | Notes | Grant parameters |
|---|---|---|
| `odoo.search` | Generalise `lib/odoo-contacts.ts` from `res.partner` to arbitrary `execute_kw` reads. **Read-only** (`search_read`, `read`, `search_count` only — `create`/`write`/`unlink` are not exposed in v1). | Allowlisted models (`crm.lead`, `sale.order`, `account.move`, `res.partner`, `project.task`), max `limit` |
| `web.search` | New external provider. Pick one agent-oriented search API (Tavily or Exa return extracted content rather than SERP HTML, which materially reduces the follow-up `web.fetch` volume). Key stored via the `AiProviderCredential` AES-256-GCM envelope pattern in `lib/ai/ai-crypto.ts`. | Max results, recency window, optional source restriction |
| `web.fetch` | Fetch + readability extraction + PDF text via the existing `pdfjs-dist`. | **Domain allowlist** (org-level, admin-managed), max pages per run, max bytes per page, 20s per-page timeout, robots.txt respected |

### Tier 2 — deferred to Phase 3

`site.login` (Puppeteer + per-site recipes + credential vault) and `mail.search` (IMAP / Microsoft Graph on a shared service mailbox). Both require admin-approved grants. Specified in §18, not built in v1.

### 7.1 Egress rule

An Automation holding both `okr.query` and any outbound tool (`web.*`) must not place internal data into outbound tool arguments. Enforced by the worker: outbound tool parameters are taken from the **Plan**, not from prior step output, except via an explicit `from: "<stepId>"` reference whose payload is restricted to URLs returned by a previous `web.search`. Any other cross-wiring is a compile-time error.

---

## 8. The Briefing

### 8.1 Block model, not free-form HTML

The synthesis step emits a **typed block list**, which the server renders. The model never emits raw HTML into the document body.

| Block | Fields |
|---|---|
| `heading` | `level` (2–3), `text` |
| `paragraph` | `text` (plain, inline `**bold**`/`_italic_`/links only) |
| `metric` | `label`, `value`, `delta?`, `tone` (neutral/success/warning/danger) |
| `table` | `columns[]`, `rows[][]`, `caption?` |
| `list` | `ordered`, `items[]` |
| `callout` | `tone`, `title`, `text` |
| `finding` | `dedupeKey`, `status` (NEW/CHANGED/UNCHANGED), `title`, `url?`, `fields{}`, `score?` |
| `linkCard` | `url`, `title`, `source`, `publishedAt?`, `snippet` |
| `divider` | — |

Rationale: every Briefing stays on-brand regardless of who wrote the instruction; email rendering is reliable across Outlook/Gmail; findings stay machine-readable for diffing; sanitisation is structural rather than a blocklist arms race.

An `html` block exists as an escape hatch, passed through `dompurify` with a strict tag/attribute allowlist and no remote resources. Admin-gated.

### 8.2 Two renderers, one source

| Target | Renderer | Notes |
|---|---|---|
| In-app | React components using the Apple Pro tokens from `docs/DESIGN_SYSTEM.md` (`surface-*`, `ink-*`, `primary-500`, semantic badges) | Full interactivity: expand findings, open sources, promote a finding |
| Email | Table-based HTML with inlined CSS, 600px, light-mode-safe | Same block list, different renderer. Plain-text alternative generated from the same blocks for `MailMessage.text` |
| PDF / DOCX | Existing `lib/letter-pdf-puppeteer.ts` and `lib/html-to-docx.ts` against the in-app HTML | Export button; no new dependencies |

### 8.3 Run-to-run diffing

Every Finding carries `dedupeKey` (from `synthesis.findingSchema.dedupeKeyFields`, hashed) and `contentHash`.

| Comparison to previous Run | Status | Rendering |
|---|---|---|
| key absent before | `NEW` | Full card in the **New** section |
| key present, hash changed | `CHANGED` | Card with a "what changed" line |
| key present, hash identical | `UNCHANGED` | Collapsed into a count: "12 previously reported items unchanged" |
| key present before, absent now | `RESOLVED` | One line in a **Closed since last run** list |

`onEmpty: "SKIP"` suppresses the email entirely when the NEW and CHANGED buckets are both empty. The Briefing is still created and visible in-app. **This is the single most important adoption requirement in the document** — a daily tender scan re-finds the same tender for three weeks, and without this every recipient mutes the automation by day three.

### 8.4 Promote a finding (manual only)

From a published Briefing, a user with the relevant doctype permission may promote a Finding to a **Todo**, **Risk**, or **RaidItem**, pre-filled from `fields{}` with a back-link to the Briefing. This is a human action, never automatic, in v1. It is the escape valve that keeps the generic-document model from being a dead end.

---

## 9. Data models

Prisma sketches. All status/kind fields are `String` for portability, with canonical unions in `types/automations.ts`, matching the DTP convention.

```prisma
model Automation {
  id                String   @id @default(cuid())
  name              String
  description       String?
  ownerId           String
  departmentId      String?

  instructionText   String              // the natural-language source
  planJson          Json                // compiled PlanSpec
  planVersion       Int      @default(1)
  compiledAt        DateTime?
  compiledModelId   String?

  scheduleKind      String              // ONCE|HOURLY|DAILY|WEEKLY|MONTHLY|QUARTERLY|YEARLY|CUSTOM_CRON
  scheduleJson      Json                // anchors + tz + policies (§5.2)
  timezone          String   @default("Africa/Addis_Ababa")
  nextRunAt         DateTime?           // the tick's only index
  lastRunAt         DateTime?

  mode              String   @default("DRY_RUN")   // DRY_RUN|REVIEW|AUTO
  status            String   @default("ENABLED")   // ENABLED|PAUSED|DISABLED_ON_FAILURE|ENDED
  toolGrants        Json                // [{tool, params}]
  recipientsJson    Json                // [{userId, channels[]}]

  maxCostUsdPerRun  Float    @default(0.50)
  maxCostUsdMonth   Float    @default(10)
  timeoutSeconds    Int      @default(600)
  consecutiveFailures Int    @default(0)

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  runs              AutomationRun[]
  @@index([status, nextRunAt])
  @@index([ownerId, updatedAt])
  @@map("automations")
}

model AutomationRun {
  id              String   @id @default(cuid())
  automationId    String
  planVersion     Int
  scheduledFor    DateTime           // nominal slot
  startedAt       DateTime?
  finishedAt      DateTime?
  status          String   @default("QUEUED")  // QUEUED|LEASED|RUNNING|SUCCEEDED|FAILED|SKIPPED|MISSED|CANCELLED
  trigger         String   @default("SCHEDULE") // SCHEDULE|MANUAL|RETRY

  leaseOwner      String?            // worker id
  leaseExpiresAt  DateTime?
  attempt         Int      @default(1)

  stepsJson       Json?              // transcript: per-step tool, args, duration, result size, error
  findingsJson    Json?              // Finding[] with dedupeKey + contentHash
  costUsd         Float    @default(0)
  inputTokens     Int      @default(0)
  outputTokens    Int      @default(0)
  errorMessage    String?

  automation      Automation @relation(fields: [automationId], references: [id], onDelete: Cascade)
  briefing        AutomationBriefing?

  @@unique([automationId, scheduledFor])
  @@index([status, scheduledFor])
  @@map("automation_runs")
}

model AutomationBriefing {
  id            String   @id @default(cuid())
  runId         String   @unique
  automationId  String
  title         String
  summary       String              // one line, used as email preview text
  blocksJson    Json                // the block list (§8.1)
  htmlApp       String              // rendered, cached
  htmlEmail     String
  textPlain     String
  status        String   @default("PUBLISHED") // DRAFT|PENDING_REVIEW|PUBLISHED|ARCHIVED
  newCount      Int      @default(0)
  changedCount  Int      @default(0)
  unchangedCount Int     @default(0)
  publishedAt   DateTime?
  approvedById  String?
  createdAt     DateTime @default(now())

  run           AutomationRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  recipients    AutomationBriefingRecipient[]
  @@index([automationId, createdAt])
  @@map("automation_briefings")
}

model AutomationBriefingRecipient {
  id           String   @id @default(cuid())
  briefingId   String
  userId       String
  channel      String              // EMAIL|IN_APP|TELEGRAM
  deliveredAt  DateTime?
  openedAt     DateTime?
  status       String   @default("PENDING") // PENDING|SENT|FAILED|SUPPRESSED
  briefing     AutomationBriefing @relation(fields: [briefingId], references: [id], onDelete: Cascade)
  @@unique([briefingId, userId, channel])
  @@map("automation_briefing_recipients")
}

/// External credentials for Tier-1/2 tools. Same envelope pattern as AiProviderCredential.
model AutomationCredential {
  id            String   @id @default(cuid())
  key           String   @unique   // "web_search", "odoo", "mailbox:bd@..."
  label         String?
  encryptedKey  String
  lastFour      String
  createdById   String
  lastVerifiedAt DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@map("automation_credentials")
}

model AutomationSettings {
  id                  String  @id @default("singleton")
  globalPaused        Boolean @default(false)
  domainAllowlist     Json    @default("[]")
  orgDailyCostCapUsd  Float   @default(25)
  maxConcurrentRuns   Int     @default(3)
  defaultTimezone     String  @default("Africa/Addis_Ababa")
  retentionDays       Int     @default(365)
  updatedAt           DateTime @updatedAt
  @@map("automation_settings")
}
```

AI cost rows continue to go to the existing `AiGenerationLog` with `feature = "AUTOMATION_RUN"` and `planId = runId` — no parallel cost ledger.

---

## 10. Execution architecture

The existing cron pattern (`crontab → GET /api/cron/<job>` with `CRON_SECRET`, synchronous work in the request) is correct for `scrum-nudge` and **wrong for this module**: an agent run with web search, page fetches and LLM synthesis takes 30s–5min, needs retries, and must not block a batch.

```
 VPS crontab (* * * * *)
        │
        ▼
 POST /api/cron/automations-tick            ← cheap, < 1s, idempotent
        │  SELECT ... WHERE status='ENABLED' AND nextRunAt <= now()
        │  INSERT AutomationRun (status=QUEUED, scheduledFor=slot)   [unique constraint = exactly once]
        │  recompute nextRunAt
        ▼
 automations-worker  (separate long-lived Node process, pm2)
        │  loop: SELECT ... FROM automation_runs WHERE status='QUEUED'
        │         ORDER BY scheduledFor FOR UPDATE SKIP LOCKED LIMIT 1
        │  → lease (leaseOwner, leaseExpiresAt = now+60s, heartbeat every 30s)
        │  → walk plan steps → tools → ai.synthesize → findings → diff
        │  → render blocks → create Briefing → notify
        │  → status=SUCCEEDED, release lease
        ▼
 POST /api/cron/automations-reap            ← every 5 min
        reclaims runs whose lease expired (worker crashed) → attempt+1 or FAILED
```

**Why the split:** the tick is idempotent and instant, so it is safe every minute and schedule fidelity survives worker restarts. `FOR UPDATE SKIP LOCKED` on Postgres gives safe multi-worker concurrency with no Redis.

### 10.1 Worker requirements

| Requirement | Value |
|---|---|
| Concurrency | `AutomationSettings.maxConcurrentRuns`, default 3 |
| Lease TTL / heartbeat | 60s / 30s |
| Retries | 3 attempts, exponential backoff 1m → 5m → 25m, only for transient errors (network, 5xx, provider rate limit). Plan/validation errors do not retry. |
| Hard timeout | `Automation.timeoutSeconds`, default 600; kills in-flight tool calls |
| Step cap | `plan.limits.maxSteps`, default 20 |
| Cost cap | Abort mid-run when accumulated `costUsd` exceeds `maxCostUsdPerRun`; Briefing renders with a `callout` noting truncation |
| Auto-disable | After 3 consecutive failed runs → `status = DISABLED_ON_FAILURE` + notify owner. Never silently keep failing. |
| Transcript | Every step records tool, resolved args, duration, result byte size, truncated result preview, error. Args are redacted through `lib/notifications/redact.ts` before persisting. |
| Realtime | Emit run status over Pusher (`lib/pusher.ts`) so the run timeline updates live. Guard for placeholder credentials — a `dev-placeholder` key passes a truthy check and makes every mutation wait on a 400 from Pusher. |

### 10.2 Deployment

New pm2 process on the VPS alongside the Next app, sharing the Prisma client and `DATABASE_URL`. `npm run worker:automations`. Schema goes out with `prisma db push` per the project's existing deploy practice.

---

## 11. Functional requirements

### FR-01 · Author an Automation from natural language
The author opens **Automations → New**, types an instruction, and picks a suggested or custom name. On **Compile**, the system calls the AI compiler and returns a PlanSpec. Compilation failures surface the validation reason in plain language, not a stack trace.

### FR-02 · Review and edit the compiled plan
The PlanSpec renders as an editable form: schedule controls (§5.1), an ordered step list with per-tool parameter editors, synthesis criteria, briefing sections, recipients, and limits. The user may edit any field. The raw JSON is available behind a "View plan JSON" disclosure for power users. Saving stores both `instructionText` and `planJson`.

### FR-03 · Re-compile on instruction change
Editing `instructionText` and re-compiling produces a new plan version and shows a **diff** against the current version, grouped as Schedule / Steps / Synthesis / Recipients / Limits. Saving increments `planVersion`. Runs record the `planVersion` they executed.

### FR-04 · Schedule evaluation
The tick enqueues exactly one Run per `(automationId, scheduledFor)`, honours `catchUpPolicy`, `overlapPolicy`, `jitterSeconds`, `startDate`/`endDate`, `maxRuns`, and `AutomationSettings.globalPaused`. `nextRunAt` is recomputed from the wall-clock rule in the stored timezone.

### FR-05 · Manual run
An owner or admin may trigger a Run immediately (`trigger = MANUAL`). Manual runs do not consume or shift the schedule and are marked as such in the run list. Manual runs in `AUTO` mode still email recipients — the confirm dialog says so.

### FR-06 · Tool execution with grants
The worker refuses any tool call not present in `toolGrants`, any Odoo model outside the allowlist, any domain outside `AutomationSettings.domainAllowlist`, and any Odoo write method. Each refusal is recorded as a step error and rendered in the Briefing as a warning callout rather than failing the whole run.

### FR-07 · Synthesis and findings
The synthesis step receives the collected step outputs and the plan's `synthesis` object, and returns `{ summary, blocks[], findings[] }` through structured output. Findings exceeding `maxFindings` are truncated with a note. Provider/model comes from `lib/ai/config.ts`; the call is logged to `AiGenerationLog`.

### FR-08 · Diff against the previous run
Findings are compared to the most recent `SUCCEEDED` run of the same Automation (§8.3) and assigned NEW / CHANGED / UNCHANGED / RESOLVED before rendering.

### FR-09 · Briefing creation and rendering
One Briefing per successful Run. Blocks are rendered to `htmlApp`, `htmlEmail`, and `textPlain` at creation time and cached on the row. Briefings are listed at **Automations → Briefings**, filterable by automation, date, and status, and are searchable by title and summary.

### FR-10 · Distribution
Per §4.1. In `REVIEW` mode the owner gets an in-app notification and an approve/discard action; approval sends the email. In `AUTO` mode delivery is immediate unless `onEmpty` suppresses it. Each recipient row records `status` and `deliveredAt`. `sendMail` takes one recipient per call, so delivery iterates recipients and records per-recipient outcomes; `isBlockedRecipient` suppressions are recorded as `SUPPRESSED`, not `FAILED`.

### FR-11 · Empty-result suppression
When NEW and CHANGED are both zero and `onEmpty = SKIP`, no email or Telegram message is sent. The Briefing is still created, and the run list shows a "nothing new" marker.

### FR-12 · Promote a finding
From a published Briefing, a permitted user promotes a Finding to a Todo / Risk / RaidItem via a pre-filled modal, with a back-link stored on the created record and the Finding marked as promoted.

### FR-13 · Export
Briefing → Export as PDF or DOCX using the existing Puppeteer and `html-to-docx` paths. Print stylesheet included.

### FR-14 · Run history and transcript
Each Automation has a run timeline: slot, trigger, status, duration, cost, findings counts, and an expandable per-step transcript. Owners see their own; admins see all. Recipients see neither.

### FR-15 · Pause, resume, disable, delete
Owner may pause/resume. Deleting an Automation soft-deletes it and retains Briefings for `retentionDays`. Admin may pause any Automation and globally pause all.

### FR-16 · Failure handling and surfacing
Failed runs notify the owner (in-app, and email on the third consecutive failure). The Automations list shows a health indicator: last run status, consecutive failures, next run time.

### FR-17 · Cost visibility
Per-Automation month-to-date spend against `maxCostUsdMonth`, and an org-wide dashboard in settings. Runs blocked by a cap produce a `SKIPPED` run with a clear reason rather than a silent no-op.

### FR-18 · Settings page
Admin-only: global pause, domain allowlist, org daily cost cap, max concurrent runs, default timezone, retention days, credential management for `web_search` and Odoo, and Tier-2 grant approvals. Follows the existing settings-page patterns (`PerformanceSettings`, `ScrumSettings`, `DtpSettings`).

---

## 12. Notifications

New event keys in `lib/notifications/events.ts`:

| Event | Audience | Default cadence |
|---|---|---|
| `AUTOMATION_BRIEFING_PUBLISHED` | recipients | Immediate |
| `AUTOMATION_REVIEW_PENDING` | owner | Immediate |
| `AUTOMATION_RUN_FAILED` | owner | Immediate |
| `AUTOMATION_DISABLED_ON_FAILURE` | owner + admin | Immediate |
| `AUTOMATION_COST_CAP_REACHED` | owner + admin | Immediate |

All respect `NotificationPreference` / `OrgNotificationDefault`. Deep links via `lib/notifications/deep-link.ts` point at `/automations/briefings/[id]`.

---

## 13. Security & governance

| Control | Requirement |
|---|---|
| Run-as identity | Every internal read passes the owner's RBAC, doctype permissions, and `RecordScopeRule`. §3.4. |
| Tool grants | Explicit allowlist per Automation. Tier-2 grants require admin approval. |
| Domain allowlist | Org-level, admin-managed. `web.fetch` and `web.search` source restriction both enforce it. |
| Egress restriction | §7.1. Internal data may not appear in outbound tool arguments. |
| Credential storage | AES-256-GCM envelope, `AutomationCredential`. APIs expose `lastFour` only; plaintext and `encryptedKey` never leave the server. |
| Prompt-injection posture | Fetched web content and Odoo records are **data, never instructions**. The synthesis prompt states this explicitly, external content is delimited, and the model's only structured output is the findings/blocks schema — it has no tool access during synthesis, so injected text cannot trigger an action. |
| SSRF | `web.fetch` blocks private IP ranges, link-local, loopback, and redirects that land on them. |
| Spend | Per-run cap, per-automation monthly cap, org daily cap, step cap, timeout. |
| Rate limiting | Per-host politeness delay on `web.fetch`; per-provider concurrency cap. |
| Kill switch | `AutomationSettings.globalPaused` short-circuits the tick. |
| Audit | `ActivityLog` entries for create/edit/compile/mode-change/grant-approval/delete. Run transcripts retained per `retentionDays`. |
| Design compliance | All new UI uses the Apple Pro tokens in `docs/DESIGN_SYSTEM.md`. No ad-hoc colours or spacing. |

---

## 14. Worked example A — Odoo CRM stalled-lead sweep

**Instruction:** *"Every weekday at 8am, find leads in Odoo that haven't been touched in 14 days and aren't won or lost. Rank them by expected revenue. Suggest a next step for each. Email me and the sales lead."*

**Plan:** `DAILY`, weekdaysOnly, 08:00 Africa/Addis_Ababa, `catchUpPolicy: RUN_LATE` → `odoo.search` on `crm.lead` with a `write_date` domain → `ai.synthesize` ranks by expected revenue × staleness and drafts a next-best-action per lead → Briefing with a `metric` row (total stalled, pipeline value at risk), a `table` of the top 10, and one `finding` per lead keyed on `odoo_lead_id`.

**Diff behaviour:** a lead stalled for three weeks appears as NEW once, then collapses into the unchanged count, and reappears as CHANGED only when its stage or expected revenue moves. It becomes RESOLVED when someone finally touches it — which is the actual signal the sales lead wants.

## 15. Worked example B — Bid & tender radar

**Instruction:** *"Every Monday at 7am search for new construction and civil works tenders in Ethiopia over 5 million birr. Give me the issuer, deadline, and value, and email the BD team."*

**Plan:** `WEEKLY`/MON/07:00 → `web.search` across a configured source registry → `web.fetch` each hit with PDF extraction → `ai.synthesize` scores relevance against the criteria and drops anything below threshold or past deadline → Briefing with `linkCard` + `finding` blocks keyed on `issuer+title+deadline`.

**Source registry:** per-source parsing hints (list-page URL pattern, date format, currency, whether tenders are published as PDF). Pure open-web search produces noise; the registry is what makes this usable. Seed it with the sources BD already checks by hand — Ethiopian Public Procurement Agency, 2merkato, dgMarket, UNDP, World Bank, Devex — and let admins add more.

**Deadline handling:** findings whose deadline falls within 7 days render in a `danger`-tone callout at the top of the Briefing. Promoting one to a Todo pre-fills a due date three days before the submission deadline.

---

## 16. Pages & API surface

### 16.1 Pages

| Route | Purpose |
|---|---|
| `/automations` | List: name, owner, schedule summary, mode badge, last run, next run, health |
| `/automations/new` | Instruction → compile → plan form → save |
| `/automations/[id]` | Overview, plan (read-only + edit), recipients, limits, mode control |
| `/automations/[id]/runs` | Run timeline with expandable transcripts |
| `/automations/briefings` | All Briefings the user may read, filterable |
| `/automations/briefings/[id]` | The rendered Briefing + export + promote actions |
| `/settings/automations` | Admin settings (§FR-18) |

### 16.2 API

| Method | Route | Notes |
|---|---|---|
| `GET/POST` | `/api/automations` | List / create |
| `GET/PATCH/DELETE` | `/api/automations/[id]` | |
| `POST` | `/api/automations/compile` | Instruction → PlanSpec (does not save) |
| `POST` | `/api/automations/[id]/run` | Manual trigger |
| `POST` | `/api/automations/[id]/mode` | Mode change, with confirm semantics |
| `GET` | `/api/automations/[id]/runs` | |
| `GET` | `/api/automations/runs/[runId]` | Includes transcript, owner/admin only |
| `GET` | `/api/automations/briefings` | |
| `GET` | `/api/automations/briefings/[id]` | |
| `POST` | `/api/automations/briefings/[id]/approve` | REVIEW mode |
| `POST` | `/api/automations/briefings/[id]/promote` | Finding → Todo/Risk/RaidItem |
| `GET` | `/api/automations/briefings/[id]/export` | `?format=pdf\|docx` |
| `GET/PATCH` | `/api/automations/settings` | Admin |
| `POST` | `/api/cron/automations-tick` | `CRON_SECRET` bearer, matching the existing cron route pattern |
| `POST` | `/api/cron/automations-reap` | Lease reclamation |

---

## 17. Phasing & acceptance

| Phase | Scope | Acceptance |
|---|---|---|
| **P0 — Loop** | Schema, tick, worker, leases, run transcript, `okr.query` + `ai.synthesize` + block rendering + `notify.email`, DRY_RUN only, no NL compiler (plan authored via the form) | An Automation scheduled daily produces a Briefing from internal OKR data and emails it on demand; killing the worker mid-run leaves the run reclaimable |
| **P1 — CRM + distribution** | `odoo.search` generalised, REVIEW/AUTO modes, recipients, diffing, `onEmpty`, in-app notifications, run history UI | Worked example A runs end-to-end for a week with correct NEW/CHANGED/UNCHANGED behaviour |
| **P2 — Language + web** | NL compiler with plan review and version diff, `web.search`, `web.fetch`, source registry, domain allowlist, export | Worked example B runs end-to-end from a typed sentence |
| **P3 — Credentialed sources** | Credential vault, `site.login` with scripted per-site recipes, `mail.search` on a shared mailbox, admin grant approval flow | One declared authenticated source scraped on schedule, with a clear failure mode when the site's DOM changes |
| **P4 — Composition** | Chained automations, event triggers alongside schedules, shared/org-level automation templates | — |

Post-merge for every phase: update `OKR-frontend/docs/MASTER_REFERENCE.md` (modules, models, APIs, cron, permissions, notifications) and `OKR-frontend/docs/CHANGELOG_AI.md`.

---

## 18. Phase 3 note — authenticated sites, honestly

This is where projects of this shape usually stall, so the expectation is set here rather than discovered later.

The runtime exists (Puppeteer already ships for letter PDFs). What does not exist: a credential vault, per-site recipes (selectors for the login form, the list page, pagination), session/cookie reuse, and a story for MFA, CAPTCHA, and DOM drift.

Two approaches, both imperfect:

- **Scripted recipes** — fast, cheap, deterministic, and brittle. An engineer writes selectors per site. Breaks silently when the site redesigns. Viable for a handful of high-value sources that BD checks anyway.
- **Vision-driven browser agent** — flexible, roughly two orders of magnitude more expensive and slower per page, and still unreliable on login flows specifically.

Recommendation: ship scripted recipes for a **declared, admin-approved list** of sources, treat a recipe failure as a first-class alert ("source X could not be read for 3 consecutive runs"), and do not promise arbitrary-site login. Sites protected by MFA or CAPTCHA are out of scope in all phases.

---

## 19. Open questions

1. **Web search provider** — Tavily, Exa, Brave, Serper, or the AI provider's native web-search tool? Affects cost per run, result quality, and whether `web.fetch` volume is high or low.
2. **Odoo service account** — does the existing `ODOO_USER` have read access to `crm.lead`, or is a second, more-privileged service account needed? Access scope should be decided before P1.
3. **Ethiopian calendar scheduling** — is `MONTHLY`/`YEARLY` on Ethiopian months an actual requirement, or is Gregorian with an Ethiopian-date *display* sufficient?
4. **Recipient scope** — v1 restricts recipients to platform users. Is emailing external addresses (client contacts, partners) needed, and if so under what approval?
5. **Retention** — 365 days of Briefings and transcripts is the proposed default. Transcripts can be large; consider pruning transcripts at 90 days while keeping Briefings for the full year.
6. **Who may author** — is `canAuthorAutomations` granted broadly, or restricted to department heads and admins at launch?
