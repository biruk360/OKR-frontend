# Notification Emails — Mentions, Assignments, and 10-Minute Batching

> Status: SPECIFIED, NOT STARTED. Owner: TBD. Last updated: 2026-09-22.
>
> Legend: **[V]** verified against code in this repo · **[A]** assumption needing confirmation.
> Every requirement has an ID and Given/When/Then acceptance criteria.

---

## Context

The ask: *when someone is tagged in a comment or assigned a task, they should get an email with a
link to that item — and the emails should batch every ~10 minutes rather than fire per event.*

Investigating the current implementation turned up more than a cadence problem. **Tagging someone in
a to-do comment has never sent anything at all**, and the three other comment surfaces detect
mentions by a different mechanism that only works if the reader types the name in an exact form the
UI never produces.

---

## 1. Current implementation **[V]**

### 1.1 The pipeline that already exists — and is good

`lib/notifications/dispatcher.ts` → `emit(eventKey, payload)`:
resolves recipients → loads each one's effective preference → writes the in-app row → **auto-attaches
a deep link to every event** → sends `IMMEDIATE` mail via `lib/email.sendMail`, or enqueues a row in
`EmailDigestQueue` for any other cadence.

`lib/notifications/jobs.ts` → `runDigestDrain(cadence)` already groups pending rows **by user** and
sends one consolidated email. `lib/notifications/deep-link.ts` already resolves
`OBJECTIVE` → `/dashboard/objectives/:id`, `KEY_RESULT` → `/dashboard/key-results/:id`,
`TODO` → `/dashboard/todos?open=:id`.

**So consolidation and linking are already built.** The gap is that the shortest batch window is a
day.

### 1.2 Mentions are broken, in two different ways

| Surface | Editor | Detection | Works? |
|---|---|---|---|
| To-do comments | `MentionEditor` (TipTap + picker) | `extractMentions()` — regex for `data-mention-id="([^"]+)"` | **❌ never** |
| Objective comments | `RichTextEditor` (no picker) | `resolveMentions()` — text token vs email local-part / name-slug | ⚠️ only on an exact hand-typed token |
| Key-result comments | `RichTextEditor` (no picker) | `resolveMentions()` | ⚠️ same |
| Project activity comments | — | `resolveMentions()` | ⚠️ same |
| Scrum comments | — | none | ❌ |

**The to-do bug, proven by running the regex against the editor's own output [V]:**
`MentionEditor` configures `HTMLAttributes: { class: 'mention', 'data-mention-id': '' }` — a static
**empty** string, applied to every mention. The extractor requires one-or-more characters
(`[^"]+`), so it never matches. The real user id is in TipTap's own `data-id` attribute. Result:
`extractMentions()` always returns `[]`, `USER_MENTIONED` never fires, no in-app row, no email.

**The OKR bug:** `resolveMentions()` matches `@token` against `email.split('@')[0]`, the name
lowercased-and-hyphenated, and the name with spaces stripped. A mention rendered as `@Biruk Hailu`
yields the token `biruk`, which matches none of `biruk@…`, `biruk-hailu`, `birukhailu`. And those
surfaces have no mention picker at all, so the reader must guess the exact spelling.

### 1.3 Assignment works **[V]**

`TODO_ASSIGNED` is emitted from `app/api/todos/route.ts` (create) and
`app/api/todos/[id]/route.ts` (reassign), with a working deep link. Its only problem is cadence.

### 1.4 Cadence **[V]**

`DefaultCadence = 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'`, defaulting to **IMMEDIATE**
(`preferences.ts` `HARDCODED_DEFAULT`). `/api/cron/notifications` drains `daily`, `weekly`,
`monthly`. There is no sub-daily batch, so the only alternative to one-email-per-event is
waiting a day.

---

## 2. Requirements

### 2.1 Batching — `BAT`

| ID | Requirement |
|---|---|
| BAT-1 | Add a `BATCHED` cadence meaning "at most one email per user per batch window". Window length comes from `NOTIFICATION_BATCH_MINUTES` (default **10**), so it is tunable without a deploy. |
| BAT-2 | `BATCHED` becomes the default cadence for every non-mandatory category, replacing `IMMEDIATE`. Existing explicit user preferences are untouched. |
| BAT-3 | `runDigestDrain` accepts `BATCHED`. `EmailDigestQueue.cadence` is already a plain `String`, so no enum migration is required. |
| BAT-4 | A cron endpoint drains the batch every `NOTIFICATION_BATCH_MINUTES`, registered in `scripts/install-crontab.sh` **and** `docs/CRON.md`. |
| BAT-5 | One email per user per drain, regardless of how many events queued — subject states the count, body groups by entity. |
| BAT-6 | Draining is idempotent and concurrency-safe: a row is claimed before send, so two overlapping runs cannot double-send. |
| BAT-7 | `IMMEDIATE` remains selectable, and stays forced for `MANDATORY_CATEGORIES` (ACCOUNT) and for the existing `FORCE_IMMEDIATE_EVENTS` set. |
| BAT-8 | An empty window sends nothing — no "you have 0 notifications" email. |

**BAT-AC-1** — *Given* a user with default preferences, *when* 7 events fire for them inside one
window, *then* exactly **one** email is sent containing all 7, and 7 in-app rows exist.

**BAT-AC-2** — *Given* the same user, *when* the drain runs again with nothing queued, *then* no
email is sent.

**BAT-AC-3** — *Given* two drains racing, *when* both process the same queued row, *then* the row is
sent exactly once (claim-before-send), verifiable from `sentAt`.

**BAT-AC-4** — *Given* a user who has explicitly chosen `IMMEDIATE`, *when* an event fires, *then*
the email goes out immediately, unchanged from today.

**BAT-AC-5** — *Given* `NOTIFICATION_BATCH_MINUTES=2`, *when* the drain runs, *then* the window
honours 2 minutes with no code change.

### 2.2 Mentions — `MEN`

| ID | Requirement |
|---|---|
| MEN-1 | One shared mention extractor in `lib/comments.ts`, used by **every** comment surface. It must resolve TipTap's `data-id`, the legacy `data-mention-id`, and a plain `@token` fallback for hand-typed mentions and historical content. |
| MEN-2 | `MentionEditor` must emit the user id in its rendered HTML, rather than a hardcoded empty `data-mention-id`. |
| MEN-3 | Extraction never returns the author — you are not notified for mentioning yourself. |
| MEN-4 | Extraction returns only ids of **active** users, and is capped to guard against a paste-bomb of mentions. |
| MEN-5 | A mention fires `USER_MENTIONED` with `entityType`/`entityId` set, so the existing deep-link resolver produces a working link with no per-surface link code. |
| MEN-6 | To-do, objective and key-result comments all route through MEN-1. **[A]** Scrum and project-activity comments are in scope only if confirmed — they have their own recipient rules. |

**MEN-AC-1** — *Given* a comment whose HTML is TipTap's mention markup, *when* it is parsed, *then*
the mentioned user's id is returned. (Today this returns `[]` — the regression test for the live bug.)

**MEN-AC-2** — *Given* a comment mentioning the author themselves, *then* the author is not in the result.

**MEN-AC-3** — *Given* a mention of an inactive user, *then* they are excluded.

**MEN-AC-4** — *Given* a to-do comment mentioning user B, *when* it is posted, *then* B has an in-app
notification and a queued email whose link opens that to-do.

**MEN-AC-5** — *Given* legacy plaintext `@biruk`, *then* the fallback still resolves it, so old
comments and non-picker surfaces keep working.

### 2.3 Email content — `EML`

| ID | Requirement |
|---|---|
| EML-1 | Every batched item shows what happened, the entity title, and an **absolute** link to it. |
| EML-2 | Items group by entity so five comments on one to-do read as one block, not five rows. |
| EML-3 | Subject names the volume and dominant context, e.g. *"3 updates — 2 to-dos, 1 objective"*. |
| EML-4 | Existing redaction for private entities (`lib/notifications/redact.ts`) applies unchanged. |
| EML-5 | Plain-text alternative alongside HTML, as `sendMail` already supports. |

**EML-AC-1** — *Given* a batch containing a mention and an assignment, *then* the email contains two
links, each resolving to that entity's dashboard route, absolute against `NEXTAUTH_URL`.

**EML-AC-2** — *Given* three comments on one to-do, *then* the email shows one block for that to-do.

**EML-AC-3** — *Given* a private entity the recipient cannot see, *then* the title is redacted exactly
as it is today.

### 2.4 Non-regression — `NRG`

| ID | Requirement |
|---|---|
| NRG-1 | In-app notifications keep firing immediately — batching is **email only**. |
| NRG-2 | `FORCE_IMMEDIATE_EVENTS` and cron-reminder coalescing behave exactly as now. |
| NRG-3 | Existing DAILY/WEEKLY/MONTHLY drains and their crons are unchanged. |
| NRG-4 | `emit()` still never throws. |
| NRG-5 | The `sendMail` block-list for seeded/placeholder users still applies. |

**NRG-AC-1** — *Given* an event for a user with in-app enabled, *then* the in-app row appears at once
even though the email waits for the window.

**NRG-AC-2** — *Given* the existing notification suites, *when* they run, *then* they pass unchanged.

---

## 3. Assumptions

| # | Assumption |
|---|---|
| A1 | 10 minutes is the default window; tunable via env, not per user. |
| A2 | `BATCHED` becomes the org default. Users who explicitly chose `IMMEDIATE` keep it. |
| A3 | Scrum and project-activity comments are out of scope for MEN-6 unless confirmed. |
| A4 | Adding a mention **picker** to OKR comments (they use `RichTextEditor`, which has none) is a follow-on; this spec only makes detection work. |

## 4. Verification

- Unit: mention extraction across TipTap markup, legacy markup, plaintext, self-mention, inactive users.
- Unit: batch grouping, subject construction, empty-window no-send.
- Integration: claim-before-send under two concurrent drains.
- Manual: post a comment tagging a colleague; confirm one email inside the window with a link that opens the item.
