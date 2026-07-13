# Daily Scrum Update Module — Comprehensive User Story Document

**Eldix IT Technology PLC (360Ground™) | Internal OKR Platform**
**Version 1.0 — BUILD READY | July 2026**

> A new module inside the 360Ground OKR Platform that captures, visualizes, and analyzes daily
> scrum updates — what was done yesterday, what's planned today, blockers, and wins — for every
> team member, routed to their manager, with an attractive calendar visualization and rich filtering.
>
> **Assumes existing platform capabilities — do not rebuild:**
> `User` · `Department` · `DepartmentMembership` · `ManagerRelationship` · `Todo` (initiatives) ·
> `Objective` / `KeyResult` · `Notification` dispatcher · `ActivityLog` · Telegram bot ·
> Permission module · `components/ui/*` primitives
>
> **Stack (fixed):** Next.js 14 App Router · TypeScript · Prisma/PostgreSQL · TanStack Query ·
> Zustand · Tailwind · shadcn/ui · Lucide · recharts

---

## Table of Contents

- [0. Design Principles & Industry Best Practice](#0-design-principles--industry-best-practice)
- [1. Data Model](#1-data-model)
- [Epic S1 — Submitting the Daily Update](#epic-s1--submitting-the-daily-update)
- [Epic S2 — Proxy Entry (PM / Delegate Submission)](#epic-s2--proxy-entry-pm--delegate-submission)
- [Epic S3 — Calendar Visualization](#epic-s3--calendar-visualization)
- [Epic S4 — Filtering & Search](#epic-s4--filtering--search)
- [Epic S5 — Blockers & Escalation](#epic-s5--blockers--escalation)
- [Epic S6 — Wins & Recognition](#epic-s6--wins--recognition)
- [Epic S7 — Automation, Nudges & Telegram](#epic-s7--automation-nudges--telegram)
- [Epic S8 — Analytics & Team Health](#epic-s8--analytics--team-health)
- [Epic S9 — Integration (OKR, PM, Performance)](#epic-s9--integration-okr-pm-performance)
- [Epic S10 — Settings & Administration](#epic-s10--settings--administration)
- [11. Permissions](#11-permissions)
- [12. Notifications](#12-notifications)
- [13. Cron Jobs](#13-cron-jobs)
- [14. Build Sequence & Global DoD](#14-build-sequence--global-dod)

---

# 0. Design Principles & Industry Best Practice

## 0.1 The Three Rules That Determine Success or Failure

| # | Principle | Why It Matters |
|---|-----------|----------------|
| **1** | **Friction kills adoption.** Submission must take **under 60 seconds.** | Async standup tools (Geekbot, Standuply, Range) consistently show that abandonment correlates almost entirely with time-to-submit. The single highest-leverage feature in this entire module is the **pre-fill of yesterday's plan into today's "what I did" field.** |
| **2** | **Submission IS attendance.** | Do not build a separate attendance checkbox. The `submittedAt` timestamp is the evidence. This removes an entire step from the manager's morning and eliminates double-entry. |
| **3** | **The developmental signal must not become a surveillance signal.** | Mood tracking and blocker reporting only stay honest if people don't feel punished for them. Mood is **optional** and **never surfaced individually to peers.** Blockers are treated as *system* problems, not personal failures. |

## 0.2 Industry Best Practice Adopted

| Practice | Source | How We Implement It |
|----------|--------|---------------------|
| **The 3 canonical questions** | Scrum Guide | Yesterday / Today / Blockers — never expand beyond this core. Wins and mood are *optional* additions. |
| **Async-first, sync-optional** | Geekbot, Range, Standuply | The written update is the record. The 8:30 meeting is for *discussion of blockers*, not for reading updates aloud. |
| **Yesterday's plan pre-fills today's "done"** | Range, Standuply | The #1 friction reducer. Editable draft, never forced. |
| **Blockers escalate on a clock** | Toyota Andon cord / Amazon | A blocker that persists 2+ days is a *system* failure, not a person failure. Auto-escalate. |
| **Wins are captured deliberately** | Range, Officevibe | Teams systematically under-report wins. An explicit field surfaces them, feeding recognition and morale. |
| **Streaks & consistency > volume** | GitHub contribution graph | Visualizing *consistency* drives habit far better than nagging. |
| **Mood as a leading indicator** | Officevibe, Culture Amp | A team trending 🔴 for two weeks predicts burnout and attrition **before** it shows in delivery metrics. |
| **Linking updates to real work** | Jira/Linear standups | Updates that link to actual todos/initiatives are verifiable and useful; free-text-only updates degrade into noise. |
| **Proxy entry for the absent** | Standuply, Jell | People travel, get sick, sit in client meetings. A PM must be able to log on their behalf — **with attribution**, so the record stays honest. |

## 0.3 Anti-Patterns We Explicitly Avoid

- ❌ **Mandatory mood** → becomes dishonest within two weeks
- ❌ **Public individual mood** → chills honest reporting
- ❌ **Long forms** → 3+ minutes to submit means abandonment by week three
- ❌ **Blockers with no escalation path** → they quietly rot
- ❌ **Attendance as a separate action** → redundant, and managers won't do it
- ❌ **Using submission rate as a punitive metric** → converts a health tool into a surveillance tool and destroys data quality

---

# 1. Data Model

```prisma
model ScrumUpdate {
  id              String    @id @default(cuid())

  // WHO & WHEN
  userId          String                              // the person the update is ABOUT
  scrumDate       DateTime  @db.Date                  // the day it covers
  teamId          String?                             // resolved from DepartmentMembership
  managerId       String?                             // resolved from ManagerRelationship
  projectId       String?                             // optional link to PM module

  // THE THREE CANONICAL QUESTIONS
  yesterdayDone   String                              // rich text (HTML)
  todayPlan       String                              // rich text (HTML)
  blockers        String?                             // rich text — null/empty = no blockers

  // OPTIONAL ENRICHMENT
  wins            String?                             // rich text
  mood            String?                             // GOOD | OKAY | STRUGGLING — OPTIONAL

  // DERIVED FLAGS (indexed for fast calendar filtering)
  hasBlocker      Boolean   @default(false)
  hasWin          Boolean   @default(false)

  // SUBMISSION & ATTENDANCE (submission IS attendance)
  submittedAt     DateTime                            // the attendance stamp
  isLate          Boolean   @default(false)           // submittedAt > cutoffTime
  status          String    @default("SUBMITTED")
  // SUBMITTED | LATE | ABSENT | EXCUSED

  // PROXY ENTRY (Epic S2)
  submittedById   String                              // WHO physically entered it
  isProxyEntry    Boolean   @default(false)           // true when submittedById != userId
  proxyReason     String?                             // required when isProxyEntry
  proxyConfirmedByUser Boolean @default(false)        // subject can confirm/amend later
  proxyConfirmedAt DateTime?

  // WORK LINKAGE
  linkedTodoIds   String[]                            // FK -> Todo (initiatives)
  linkedKeyResultIds String[]                         // FK -> KeyResult

  // BLOCKER LIFECYCLE (Epic S5)
  blockerStatus   String?                             // OPEN | RECURRING | ESCALATED | RESOLVED
  blockerCategory String?                             // taxonomy — see S5
  blockerDaysOpen Int       @default(0)               // consecutive days
  blockerFirstRaisedAt DateTime?
  blockerResolvedAt DateTime?
  blockerResolutionNote String?
  escalatedToUserId String?
  raidItemId      String?                             // auto-created RAID Issue (PM module)

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user            User      @relation("ScrumSubject", fields: [userId], references: [id])
  submittedBy     User      @relation("ScrumAuthor", fields: [submittedById], references: [id])
  comments        ScrumComment[]

  @@unique([userId, scrumDate])                       // ONE update per person per day
  @@index([scrumDate, teamId])
  @@index([managerId, scrumDate])
  @@index([hasBlocker, scrumDate])                    // fast blocker filtering
  @@index([hasWin, scrumDate])
  @@index([userId, scrumDate])
  @@index([blockerStatus])
}

model ScrumComment {
  id          String      @id @default(cuid())
  updateId    String
  authorId    String
  content     String                                  // HTML
  mentions    String[]                                // @mentioned userIds
  createdAt   DateTime    @default(now())
  update      ScrumUpdate @relation(fields: [updateId], references: [id], onDelete: Cascade)
  @@index([updateId])
}

model ScrumAbsence {
  id          String   @id @default(cuid())
  userId      String
  date        DateTime @db.Date
  type        String                                  // LEAVE | SICK | HOLIDAY | CLIENT_MEETING | TRAVEL
  note        String?
  recordedById String
  createdAt   DateTime @default(now())
  @@unique([userId, date])                            // excused — excluded from absent counts
}

model ScrumSettings {
  id                  String   @id @default("default")

  // Timing
  nudgeTime           String   @default("08:00")      // pre-meeting reminder
  cutoffTime          String   @default("08:30")      // late threshold
  absentTime          String   @default("09:00")      // absence finalized
  managerDigestTime   String   @default("09:00")
  weeklyDigestDay     Int      @default(5)            // Friday
  weeklyDigestTime    String   @default("16:00")

  // Calendar
  workingDays         Int[]    @default([1,2,3,4,5])  // Mon–Fri
  holidays            DateTime[]                       // Ethiopian public holidays
  timezone            String   @default("Africa/Addis_Ababa")

  // Blocker escalation
  recurringThresholdDays  Int  @default(2)            // same blocker 2 days -> RECURRING
  escalationThresholdDays Int  @default(3)            // 3 days -> CEO + RAID Issue

  // Feature toggles
  moodEnabled         Boolean  @default(true)
  winsEnabled         Boolean  @default(true)
  telegramEnabled     Boolean  @default(true)
  proxyEntryEnabled   Boolean  @default(true)
  requireTodoLink     Boolean  @default(false)

  // Team health
  moodAlertThresholdDays Int   @default(10)           // 10 working days trending RED -> alert CEO
}
```

---

# EPIC S1 — Submitting the Daily Update

---

## S1.1 — Submit My Daily Update

### User Story
> As a **team member**, I want to submit my daily scrum update in under 60 seconds before 8:30 AM, so that my manager and team have visibility into my work without me having to write a report or attend a long meeting.

### Attributes / Form Fields

| Field | Type | Required | Default | Validation | Behavior |
|-------|------|----------|---------|-----------|----------|
| `yesterdayDone` | Rich text (WYSIWYG) | ✅ | **Pre-filled from yesterday's `todayPlan`** | Min 10 chars | ⭐ **The single most important feature.** Editable draft, never forced. |
| `todayPlan` | Rich text | ✅ | — | Min 10 chars | Becomes tomorrow's `yesterdayDone` pre-fill |
| `blockers` | Rich text | ❌ | — | — | Non-empty → `hasBlocker = true` → manager notified immediately |
| `blockerCategory` | Select | Conditional | — | Required if `blockers` non-empty | Taxonomy — see S5.2 |
| `wins` | Rich text | ❌ | — | — | Non-empty → `hasWin = true` |
| `mood` | Icon selector | ❌ | — | — | 🟢 Good · 🟡 Okay · 🔴 Struggling. **Optional. Never shown to peers individually.** |
| `linkedTodoIds` | Multi-select | ❌ | — | — | Pulls from the user's assigned `Todo`s |
| `linkedKeyResultIds` | Multi-select | ❌ | — | — | Pulls from the user's owned `KeyResult`s |
| `projectId` | Select | ❌ | — | — | From PM module, if any |
| `submittedAt` | datetime | auto | `now()` | — | **The attendance stamp** |
| `isLate` | boolean | auto | — | — | `submittedAt > cutoffTime` |

### UI/UX Detail

**Route:** `/dashboard/scrum` — plus a persistent dashboard widget and a Telegram entry point.

**The form is deliberately a single scrollable column, no tabs, no steps.** Every extra click costs adoption.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Daily Scrum — Wednesday, 15 July 2026            ⏱ 08:12          │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  ⏰ 18 minutes until the 8:30 cutoff                           │ │  ← live countdown, calm not alarming
│  └───────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ✅ WHAT I DID YESTERDAY                          [↺ from my plan]  │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Finished POS pre-session UI refinements                     │ │  ← PRE-FILLED (grey italic
│  │ • Merged PR #241                                              │ │     until user edits, then
│  │ • Started QR ordering spec                                    │ │     turns solid black)
│  └───────────────────────────────────────────────────────────────┘ │
│  💡 Pre-filled from yesterday's plan. Edit freely.                  │
│                                                                     │
│  🎯 WHAT I'LL DO TODAY                                              │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ |                                                              │ │  ← autofocus lands HERE
│  └───────────────────────────────────────────────────────────────┘ │
│  🔗 Link to my work:  [+ Todo]  [+ Key Result]                     │
│     [Meda POS QR Spec ✕]  [KR: Ship POS v2 ✕]                      │
│                                                                     │
│  🚫 BLOCKERS                                        (optional)      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                                                                │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  ↳ appears when text entered:                                       │
│    Category: [ External Dependency ▼ ]                              │
│                                                                     │
│  🏆 WINS                                            (optional)      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                                                                │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  😊 HOW ARE YOU FEELING?                            (optional)      │
│     [ 🟢 Good ]  [ 🟡 Okay ]  [ 🔴 Struggling ]                    │
│     🔒 Only your manager sees this. Never shared with the team.     │
│                                                                     │
│                                     [Save Draft]  [Submit Update]   │
└─────────────────────────────────────────────────────────────────────┘
```

**Micro-interactions that matter**

| Interaction | Behavior |
|-------------|----------|
| **Autofocus** | Lands on `todayPlan` — because `yesterdayDone` is already pre-filled. Saves a click and signals "this is the part that needs you." |
| **Pre-fill styling** | Pre-filled text renders in **grey italic**. The moment the user types, it becomes **solid black** — a subtle signal that it's now *theirs*, not a machine's guess. |
| **`[↺ from my plan]`** | If the user cleared the field and wants the pre-fill back. |
| **Blocker reveal** | The `blockerCategory` dropdown only appears once text is entered — progressive disclosure, no clutter. |
| **Countdown** | Calm and factual ("18 minutes until cutoff"), not a red panic timer. Turns amber at 5 min, and after cutoff becomes "Submitting late — that's fine, just later than 8:30." |
| **Mood privacy note** | Shown inline, always. The reassurance *is* the feature. |
| **Autosave** | Draft autosaves every 10s. Closing the tab never loses work. |
| **Keyboard** | `Cmd/Ctrl + Enter` submits from anywhere in the form. |

**Mobile:** Full-width single column, sticky Submit button at the bottom, `yesterdayDone` collapsed by default behind a "Yesterday's plan ▾" accordion (since it's pre-filled and often needs no edit).

### Functionality
- One update per person per day, enforced by `@@unique([userId, scrumDate])`. Re-opening edits the existing record.
- `hasBlocker` / `hasWin` derived on save.
- On submit: resolve `teamId` from `DepartmentMembership`, `managerId` from `ManagerRelationship`.
- If `blockers` is non-empty → immediate notification to manager (S5).
- `submittedAt` is the attendance record. No separate attendance step exists anywhere in the system.

### Linking & Dependencies
- `User`, `DepartmentMembership`, `ManagerRelationship` (routing)
- `Todo`, `KeyResult` (work linkage)
- `Project` (optional PM module link)
- Notification dispatcher (blocker alerts)
- `ActivityLog` via `recordActivity()`

### Acceptance Criteria
- **Given** I submitted yesterday with a `todayPlan`, **when** I open today's form, **then** `yesterdayDone` is pre-filled with yesterday's plan, rendered in grey italic, and fully editable.
- **Given** I have no update from yesterday (e.g. Monday after a weekend), **then** `yesterdayDone` pre-fills from my **most recent working-day** update, not literally "yesterday."
- **Given** I have never submitted before, **then** `yesterdayDone` is empty with placeholder text.
- **Given** the form opens, **then** focus lands on `todayPlan`, not `yesterdayDone`.
- **Given** I type in the pre-filled `yesterdayDone`, **then** the text turns from grey italic to solid black.
- **Given** I submit at 08:22 (cutoff 08:30), **then** `isLate = false`, `status = SUBMITTED`, and I am recorded present.
- **Given** I submit at 09:15, **then** `isLate = true`, `status = LATE`, and I am still recorded present.
- **Given** I enter blocker text, **then** the category dropdown appears and becomes required before submit.
- **Given** I submit with a blocker, **then** my manager receives an immediate notification.
- **Given** I already submitted today, **when** I reopen the form, **then** I am editing the existing record (not creating a duplicate).
- **Given** I close the tab mid-entry, **when** I return, **then** my draft is restored.
- **Given** `Cmd/Ctrl + Enter`, **then** the form submits.
- **Given** mood is optional, **when** I skip it, **then** submission succeeds without warning.

### Definition of Done
- [ ] `POST /api/scrum/updates` and `PATCH /api/scrum/updates/[id]` with `withAuth`, Zod validation, `{success, data, error}` envelope
- [ ] Unique constraint `[userId, scrumDate]` enforced at DB level
- [ ] ⭐ Pre-fill pulls from the **last working-day** update, not calendar-yesterday
- [ ] Pre-fill visual state (grey italic → solid on edit)
- [ ] Autofocus on `todayPlan`
- [ ] Autosave every 10 seconds
- [ ] `hasBlocker` / `hasWin` derived server-side (not trusted from client)
- [ ] `teamId` / `managerId` auto-resolved server-side
- [ ] Blocker → immediate manager notification
- [ ] Rich text editor reuses existing WYSIWYG component
- [ ] `Cmd/Ctrl + Enter` submit
- [ ] Mobile responsive with collapsed `yesterdayDone`
- [ ] `recordActivity()` on create and update
- [ ] Unit tests: pre-fill logic across weekends/holidays, late calculation, flag derivation
- [ ] **Measured: median submission time < 60 seconds**

---

## S1.2 — View My Previous Day's Plan While Updating

### User Story
> As a **team member**, I want to clearly see what I *planned* to do yesterday while I write today's update, so that I can honestly assess what I actually completed versus what slipped — and so I don't forget commitments.

*This is separate from the pre-fill. Pre-fill puts yesterday's plan **into** the field. This shows it **alongside**, as an unedited reference, so the user can compare intent vs reality.*

### UI/UX Detail

A **collapsible reference panel** pinned above the form — showing yesterday's plan as an *immutable* record, distinct from the editable pre-filled field.

```
┌─────────────────────────────────────────────────────────────────────┐
│  📋 YESTERDAY'S PLAN (Tue, 14 Jul)                     [▾ collapse] │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  You planned to:                                               │ │
│  │  ☐ Finish POS pre-session UI                    [✓ Done]      │ │  ← check off
│  │  ☐ Review Yohannes' PR                          [✓ Done]      │ │
│  │  ☐ Start QR ordering spec                       [→ Carried]   │ │  ← carried forward
│  │  ☐ Fix the sync bug                             [✗ Not done]  │ │
│  │                                                                │ │
│  │  Blockers you raised: Waiting on Abay API creds (3 days)  🚫  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  💡 Items marked "Carried" will be added to today's plan.           │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
      [The main form below — with carried items pre-added to Today]
```

**Behavior**
- Yesterday's plan is parsed into checkable line items (split on newlines / bullets).
- Each item can be marked: **✓ Done** · **→ Carried** · **✗ Not done**.
- Items marked **Done** flow into today's `yesterdayDone`.
- Items marked **Carried** are **auto-added to today's `todayPlan`** — closing the loop and preventing quiet abandonment of commitments.
- Yesterday's raised blockers show with their running day-count — a visible nudge that they're still open.
- Panel is collapsible; the collapsed state persists per user.

### Acceptance Criteria
- **Given** I open today's form, **then** a reference panel shows yesterday's plan as an unedited, read-only record.
- **Given** yesterday's plan had 4 bullet items, **then** each renders as a separate checkable line.
- **Given** I mark an item **✓ Done**, **then** it is added to today's `yesterdayDone` field.
- **Given** I mark an item **→ Carried**, **then** it is auto-added to today's `todayPlan` field.
- **Given** I had an unresolved blocker yesterday, **then** it shows in the panel with its consecutive day count and a 🚫 badge.
- **Given** I collapse the panel, **then** that preference persists for me across sessions.
- **Given** yesterday was a weekend/holiday, **then** the panel shows my **last working-day** plan with its actual date labeled.
- **Given** an item is carried 3+ consecutive days, **then** it is flagged amber with "carried 3 days" — visible drift detection.

### Definition of Done
- [ ] Reference panel above form, collapsible, state persisted
- [ ] Plan text parsed into line items (newline/bullet aware)
- [ ] Three-state marking (Done / Carried / Not done)
- [ ] Carried items auto-populate today's plan
- [ ] Done items auto-populate today's `yesterdayDone`
- [ ] Open blockers shown with day count
- [ ] Weekend/holiday-aware "last working day" resolution
- [ ] Repeated-carry detection (3+ days → amber flag)
- [ ] Unit tests for parsing and carry-forward logic

---

# EPIC S2 — Proxy Entry (PM / Delegate Submission)

---

## S2.1 — Submit an Update on Behalf of Someone Else

### User Story
> As a **Project Manager or team lead**, I want to submit a scrum update on behalf of a team member who is travelling, in a client meeting, or otherwise unable to log it themselves, so that the team's record stays complete and nobody is falsely marked absent.

> ⚠️ **Integrity rule:** A proxy entry must be **visibly and permanently marked as such.** The record must always show *who was the subject* and *who physically entered it*. Proxy entry must never be able to masquerade as a self-report.

### Attributes

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `userId` | User picker | ✅ | **The subject** — who the update is about |
| `submittedById` | auto | ✅ | **The author** — the logged-in proxy |
| `isProxyEntry` | bool | auto | `true` when `submittedById != userId` |
| `proxyReason` | select + text | ✅ | **Mandatory.** Why the proxy was needed. |
| `proxyConfirmedByUser` | bool | — | Subject can later confirm or amend |
| `proxyConfirmedAt` | datetime | — | — |

**`proxyReason` taxonomy:**
`IN_CLIENT_MEETING` · `TRAVELLING` · `SICK` · `ON_LEAVE` · `NO_CONNECTIVITY` · `VERBAL_UPDATE_IN_STANDUP` · `OTHER` (free text required)

### Who Can Proxy

| Role | Can submit on behalf of |
|------|------------------------|
| **Manager** (`ManagerRelationship`) | Their direct reports |
| **Department Lead** | Anyone in their department |
| **Project Manager** | Any member of their project team |
| **Scrum Facilitator** (per-team designate) | Their team |
| **Admin** | Anyone |
| **Peer** | ❌ Never (integrity boundary) |

### UI/UX Detail

**Entry point 1 — From the team calendar day view:**

Absent members show a `[+ Log on their behalf]` action on their empty card.

**Entry point 2 — Explicit action:** `/dashboard/scrum` → `[Log for someone else]`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Log Scrum Update on Behalf Of                                      │
├─────────────────────────────────────────────────────────────────────┤
│  ⚠️  You are logging this update FOR someone else.                  │
│      It will be permanently marked as a proxy entry.                │
│                                                                     │
│  Team member *      [🔍 Mintesinot Alemu                        ▼ ] │
│  Date *            [ 15 July 2026                               📅] │
│                                                                     │
│  Why are you logging this for them? *                               │
│  [ In client meeting                                            ▼ ] │
│  Detail: [ At MoR for the EIMS integration review              ]    │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  📋 THEIR PLAN FROM YESTERDAY (for your reference)      [▾]        │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  • Complete the D365 mapping doc                              │ │
│  │  • Sync with Samuel on LLRP data model                        │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ✅ WHAT THEY DID YESTERDAY              [↺ pre-fill their plan]    │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Complete the D365 mapping doc                               │ │  ← pre-filled from
│  └───────────────────────────────────────────────────────────────┘ │     THEIR plan
│                                                                     │
│  🎯 WHAT THEY'LL DO TODAY                                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ |                                                              │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  🚫 BLOCKERS  (optional)     🏆 WINS  (optional)                    │
│                                                                     │
│  ℹ️  Mood is not captured on proxy entries — only the person        │
│      themselves can report how they're feeling.                     │
│                                                                     │
│                              [Cancel]  [Submit as Proxy]            │
└─────────────────────────────────────────────────────────────────────┘
```

**How proxy entries appear everywhere afterwards:**

```
┌────────────────────────────────────────────────────────────────┐
│ 👤 Mintesinot A.              08:35  🔄 Logged by Biruk H.     │  ← distinct badge
│    ┌──────────────────────────────────────────────────────┐   │
│    │ 🔄 PROXY ENTRY — In client meeting (MoR EIMS review) │   │  ← amber banner
│    │    [Confirm this is accurate]  [Amend]               │   │  ← subject's actions
│    └──────────────────────────────────────────────────────┘   │
│ ✅ Yesterday: Completed the D365 mapping doc                   │
│ 🎯 Today:     Sync with Samuel on LLRP data model              │
└────────────────────────────────────────────────────────────────┘
                          ↓ after the subject confirms
┌────────────────────────────────────────────────────────────────┐
│ 👤 Mintesinot A.       08:35  🔄 by Biruk H. · ✓ Confirmed     │  ← green check
└────────────────────────────────────────────────────────────────┘
```

**Subject confirmation loop:** the person is notified that an update was logged for them and can **Confirm** or **Amend** it. Amending preserves the proxy attribution but marks the content as user-corrected. This keeps the record honest without creating friction.

### Functionality
- **Mood is never captured on proxy entries.** Only the person themselves can report their own state. This is a hard rule — the field is absent from the proxy form entirely.
- Proxy entries **count as present** for attendance, but are reported separately in analytics (`% self-reported` vs `% proxy`) so that a team where the PM logs everything doesn't look artificially healthy.
- Pre-fill works identically — it pulls **the subject's** last working-day plan, not the proxy's.
- The subject can amend at any time; amendments are logged.

### Acceptance Criteria
- **Given** I am a manager, **when** I open the proxy form, **then** the user picker shows only my direct reports (scoped by role — see the permission table above).
- **Given** I am a peer with no managerial relationship, **then** the "Log for someone else" action is **not visible** and the API rejects the attempt with 403.
- **Given** I submit a proxy entry, **then** `isProxyEntry = true`, `submittedById` = me, `userId` = the subject, and `proxyReason` is stored.
- **Given** I attempt to submit a proxy entry without a `proxyReason`, **then** submission is blocked.
- **Given** a proxy entry, **then** the mood field is **absent from the form entirely** — not merely disabled.
- **Given** a proxy entry exists, **then** it renders everywhere with a `🔄 Logged by [name]` badge and an amber proxy banner.
- **Given** I am the subject of a proxy entry, **then** I receive a notification and can **Confirm** or **Amend** it.
- **Given** I confirm, **then** `proxyConfirmedByUser = true` and a green ✓ appears alongside the proxy badge.
- **Given** I amend, **then** the content updates, proxy attribution is **retained**, and the amendment is logged in `ActivityLog`.
- **Given** analytics, **then** self-reported and proxy-reported updates are counted separately.
- **Given** the pre-fill on a proxy form, **then** it pulls the **subject's** previous plan, not the proxy author's.

### Definition of Done
- [ ] Proxy entry form with mandatory reason
- [ ] Role-scoped user picker (manager → reports, PM → project team, dept lead → dept, admin → all)
- [ ] Server-side authorization check — peers cannot proxy (403)
- [ ] `isProxyEntry` derived server-side, never trusted from client
- [ ] **Mood field entirely absent from proxy form**
- [ ] Proxy badge + amber banner rendered in all views (calendar, day view, streak, digests, exports)
- [ ] Subject notification + Confirm/Amend flow
- [ ] Amendment preserves proxy attribution
- [ ] Analytics separate self-reported vs proxy
- [ ] Pre-fill uses the subject's history
- [ ] `recordActivity()` logs both the proxy submission and any amendment
- [ ] Unit tests: authorization matrix, mood exclusion, attribution integrity

---

# EPIC S3 — Calendar Visualization

> ⭐ This is the visual centerpiece. It must make patterns **instantly** legible without reading text.

---

## S3.1 — Team Month Calendar ("The Wall")

### User Story
> As a **manager or CEO**, I want to see my team's entire month of scrum updates on one visual calendar where blockers, wins, absences, and lateness are recognizable at a glance, so that I can spot patterns in seconds rather than reading dozens of entries.

### UI/UX Detail

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Daily Scrum — July 2026                    [Month] [Week] [Day] [Streak]     │
│  Team: [Engineering ▼]                                       [◀ Jul ▶] [Today]│
├──────────────────────────────────────────────────────────────────────────────┤
│  🔍 [Search updates...]                                                       │
│  Filters:  [👤 All Users ▼]  [🚫 Blockers]  [🏆 Wins]  [⏰ Late]  [❌ Absent] │
│            [😊 Mood ▼]  [📁 Project ▼]  [📅 Date Range ▼]     [Clear] [Save] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│      Mon 13        Tue 14        Wed 15        Thu 16        Fri 17          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│   │ ●●●●●●   │  │ ●●●●○●   │  │ ●●🚫●●●  │  │ ●●●●●●   │  │ ●🏆●●🏆● │      │
│   │          │  │          │  │          │  │          │  │          │      │
│   │  6/6  ✓  │  │  5/6  ⚠  │  │  6/6  ✓  │  │  6/6  ✓  │  │  6/6  ✓  │      │
│   │ 🏆1      │  │ ⏰1 ❌1  │  │ 🚫2      │  │          │  │ 🏆3      │      │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│                                                                               │
│      Mon 20        Tue 21        Wed 22        Thu 23        Fri 24          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│   │ ●●●●●●   │  │ ●🚫🚫●●● │  │ ●●●●●●   │  │ ○○○●●●   │  │ ●●●●●●   │      │
│   │  6/6  ✓  │  │  6/6  ✓  │  │  6/6  ✓  │  │  3/6  🔴 │  │  6/6  ✓  │      │
│   │          │  │ 🚫2      │  │          │  │ ❌3      │  │          │      │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│                                  ▲ red tinted cell — >30% absent              │
└──────────────────────────────────────────────────────────────────────────────┘

  LEGEND
  ● green   submitted on time
  ● amber   submitted late
  ○ grey    absent (no submission)
  ○ blue    excused (leave/holiday)
  🚫 red    has blocker
  🏆 gold   has win
  🔄        proxy entry (small badge on the dot)
```

**Interaction design**

| Interaction | Behavior |
|-------------|----------|
| **Each dot = one team member** | Ordered consistently (alphabetical or by seniority) so the *same person is always in the same position* across days — this is what makes vertical pattern-scanning possible. |
| **Hover a dot** | Mini-card popover: name, submitted time, yesterday/today snippet, blocker/win badges. No navigation. |
| **Click a dot** | Opens that person's full update in a side panel. |
| **Click a day cell** | Zooms to Day View (S3.2). |
| **Day cell tinting** | Normal = white. `>30%` absent = red tint. All submitted + ≥1 win = subtle gold tint. |
| **Cell badges** | Bottom row of the cell shows counts: `🚫2` `🏆3` `⏰1` `❌1`. |
| **Today** | Bold border + accent color. |
| **Weekend/holiday** | Greyed out, no dots, labeled. |
| **Empty future days** | Rendered faintly, no data. |

**Why consistent dot ordering matters:** if Mintesinot is always the 4th dot, a manager scanning down the 4th position across a month instantly sees his pattern of absence — without a single query.

### Acceptance Criteria
- **Given** the month view, **then** each working day cell renders one dot per team member, colored by state, with the same person in the same position every day.
- **Given** a day where >30% did not submit, **then** the cell is tinted red.
- **Given** a day where everyone submitted and there is ≥1 win, **then** the cell has a subtle gold tint.
- **Given** I hover a dot, **then** a mini-card appears with that person's update summary without navigating.
- **Given** I click a dot, **then** the full update opens in a side panel.
- **Given** I click a day cell, **then** the view zooms to Day View for that date.
- **Given** a weekend or configured holiday, **then** the cell is greyed with no dots.
- **Given** a proxy entry, **then** its dot carries a small `🔄` badge.
- **Given** an excused absence, **then** the dot is blue (not grey) and excluded from the absent count.
- **Given** today, **then** its cell has a bold accent border.
- **Given** a team of 25+, **then** dots wrap gracefully and the cell remains scannable (or condenses to a count + heat color).

### Definition of Done
- [ ] Month grid rendering with per-member dots
- [ ] **Consistent dot ordering across all days** (the key to pattern scanning)
- [ ] All 6 dot states with exact colors
- [ ] Cell tinting rules (red >30% absent, gold on all-submitted-with-win)
- [ ] Badge counts per cell
- [ ] Hover mini-card (no navigation)
- [ ] Click-through to side panel and day view
- [ ] Weekend/holiday handling
- [ ] Proxy badge on dots
- [ ] Excused vs absent visual distinction
- [ ] Graceful degradation for large teams
- [ ] Performance: renders a 31-day × 25-person month in < 500ms

---

## S3.2 — Day View

### User Story
> As a **manager**, I want to read all of today's updates on one screen, with blockers visually prominent, so that I can prepare for the 8:30 standup in two minutes.

### UI/UX Detail

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ◀  Wednesday, 15 July 2026  ▶            6/6 submitted · 2 blockers · 1 win  │
│                                                    [Export] [Copy for standup]│
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  🚫 BLOCKERS FIRST  (2)                                    ← always surfaced  │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│  ┃ 👤 Yohannes M.               08:29 ✓            🔴 Struggling         ┃  │
│  ┃ 🚫 BLOCKER · External Dependency · 🔥 3 DAYS OPEN · RECURRING         ┃  │
│  ┃    Still waiting on Abay Bank API credentials. Emailed Andualem       ┃  │
│  ┃    twice, no response.                                                 ┃  │
│  ┃    ✅ Yesterday: Debugged sync locally, no resolution possible         ┃  │
│  ┃    🎯 Today:     Continue local mocking until creds arrive             ┃  │
│  ┃    [🔺 Escalate to CEO]  [✓ Mark Resolved]  [💬 Comment]              ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│      ▲ thick red left border, red-tinted background                          │
│                                                                               │
│  ─────────────────────────────────────────────────────────────────────────   │
│                                                                               │
│  🏆 WINS  (1)                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 👤 Eyob T.                   08:14 ✓             🟢 Good              │  │
│  │ 🏆 Cut POS checkout latency by 40% — from 1.2s to 0.7s                 │  │
│  │    [👏 Celebrate]  [💬 Comment]                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│      ▲ gold left border                                                       │
│                                                                               │
│  ─────────────────────────────────────────────────────────────────────────   │
│                                                                               │
│  ✅ ALL UPDATES  (6)                              [Compact ▾] [Expanded]      │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 👤 Eyob T.                   08:14 ✓ On time            🟢            │  │
│  │ ✅ Finished POS pre-session UI · Merged PR #241                        │  │
│  │ 🎯 Start QR table-ordering spec                                        │  │
│  │ 🔗 Meda POS QR Spec · KR: Ship POS v2                                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 👤 Mintesinot A.             08:35 🔄 Logged by Biruk H.               │  │
│  │ 🔄 PROXY — In client meeting (MoR EIMS review)                         │  │
│  │ ✅ Completed D365 mapping doc                                          │  │
│  │ 🎯 Sync with Samuel on LLRP data model                                 │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│      ▲ amber left border                                                      │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 👤 Dawit K.                  ❌ No update submitted                    │  │
│  │                        [+ Log on their behalf]  [📨 Send Reminder]     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│      ▲ grey, dimmed, dashed border                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key design decision: blockers are hoisted to the top.** They are never buried in alphabetical order. The manager's most important job in a standup is unblocking — the UI must serve that first.

**`[Copy for standup]`** copies a plain-text digest to the clipboard for pasting into Telegram/Slack — a small feature with outsized daily utility.

### Acceptance Criteria
- **Given** the day view, **then** blockers are hoisted into a dedicated section at the top, above all other updates.
- **Given** a blocker open 3+ days, **then** it shows a 🔥 flame icon, its day count, and its `RECURRING`/`ESCALATED` status.
- **Given** a win, **then** it appears in a wins section with a gold border and a `[👏 Celebrate]` action.
- **Given** a proxy entry, **then** it shows an amber border and the proxy banner.
- **Given** an absent person, **then** their card is dimmed with a dashed border and offers `[+ Log on their behalf]` and `[Send Reminder]`.
- **Given** `[Copy for standup]`, **then** a plain-text digest is copied to the clipboard.
- **Given** compact mode, **then** cards collapse to one line each.
- **Given** I comment on an update, **then** the author is notified.
- **Given** mood, **then** it is visible **only to the manager and the person themselves** — never to peers.

### Definition of Done
- [ ] Blockers hoisted to top section
- [ ] Wins section with celebrate action
- [ ] Absent cards with proxy + reminder actions
- [ ] Proxy entries visually distinct
- [ ] `[Copy for standup]` clipboard export
- [ ] Compact / Expanded toggle
- [ ] Comments with @mention
- [ ] **Mood visibility restricted to manager + self (enforced server-side)**
- [ ] Day navigation (◀ ▶ + Today)

---

## S3.3 — Individual Streak View

### User Story
> As a **manager**, I want to see one person's submission consistency over months as a heatmap, so that patterns of disengagement or persistent blockers become visible in one second instead of taking weeks to notice.

### UI/UX Detail

GitHub-contributions-style heatmap, one row per person:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Streak View — Engineering Team                    [Last 3 months ▼]          │
├──────────────────────────────────────────────────────────────────────────────┤
│                  May              June             July                        │
│                                                                                │
│  Eyob T.        ▪▪▪▪▪ ▪▪▪▪▪  ▪▪▪🏆▪ ▪▪▪▪▪  ▪▪🚫▪▪ ▪▪▪▪     🔥 47-day streak  │
│                 98% submitted · 96% on time · 2 blockers · 8 wins             │
│                                                                                │
│  Yohannes M.    ▪▪🚫🚫▪ 🚫▪▪▪▪  ▪▪▪▪▪ ▪🚫🚫▪▪  ▪▪▪▪▪ ▪▪▪▪     ⚠ 7 blockers    │
│                 100% submitted · 89% on time · 7 blockers · 3 wins            │
│                 ⚠️ Recurring blocker theme: External Dependency (5 of 7)      │
│                                                                                │
│  Mintesinot A.  ▪▫▫▪▪ ▪▪▫▫▪  ▫▪▪▫▫ ▪▫▪▪▫  🔄🔄▪▫▪ ▪▫▪▫     🔴 68% submitted  │
│                 68% submitted · 71% on time · 1 blocker · 0 wins              │
│                 🔴 Declining trend — was 92% in April                         │
│                                                                                │
│  Meklit H.      ▪▪▪▪▪ ▪▪▪▪▪  ▪▪▪▪▪ ▪▪▪▪▪  ▪▪▪🏆▪ ▪▪▪▪     🔥 62-day streak  │
└──────────────────────────────────────────────────────────────────────────────┘

  ▪ dark    submitted on time      🚫 red   blocker raised that day
  ▪ mid     submitted late          🏆 gold  win logged that day
  ▫ light   absent                  🔄 amber proxy entry
  ▫ blue    excused
```

**The Mintesinot row is the entire point of this view.** A 68% submission rate with a declining trend is a pattern that would take a manager weeks to notice in a day-by-day view — and one second here.

### Acceptance Criteria
- **Given** the streak view, **then** each person renders as a heatmap row of one square per working day.
- **Given** a person's stats, **then** submission %, on-time %, blocker count, and win count show beside their row.
- **Given** a consecutive submission run, **then** a 🔥 streak counter shows.
- **Given** a submission rate < 75%, **then** the row is flagged 🔴.
- **Given** a declining trend (this month vs last), **then** it is called out explicitly.
- **Given** a recurring blocker category (≥3 in a period), **then** the theme is named.
- **Given** I hover a square, **then** that day's update previews.
- **Given** I click a square, **then** that day's full update opens.

### Definition of Done
- [ ] Heatmap rows with one square per working day
- [ ] All 6 square states
- [ ] Per-person stats sidebar
- [ ] Streak calculation (consecutive on-time submissions)
- [ ] Low-rate flagging (< 75%)
- [ ] Trend detection (month over month)
- [ ] Recurring blocker theme detection
- [ ] Hover preview + click-through
- [ ] Range selector (1 / 3 / 6 / 12 months)

---

## S3.4 — Week View

### User Story
> As a **team member**, I want to see my own week at a glance, so that I can review my commitments, what I carried forward, and what I actually shipped.

**UI:** 5 columns (Mon–Fri), each showing the day's update in a card. Carried-forward items are highlighted with a `→` chain across days, making drift visible.

### Acceptance Criteria
- **Given** my week view, **then** each working day shows my update as a card.
- **Given** an item carried across days, **then** a visual `→` chain links it across the columns.
- **Given** an item carried 3+ days, **then** the chain turns amber.
- **Given** an unresolved blocker, **then** it spans the days it remained open.

### Definition of Done
- [ ] 5-column week grid
- [ ] Carry-forward chain visualization
- [ ] Drift highlighting (3+ days amber)
- [ ] Blocker span rendering

---

# EPIC S4 — Filtering & Search

---

## S4.1 — Compose Filters

### User Story
> As a **manager or CEO**, I want to filter the calendar by person, blockers, wins, lateness, mood, and project, so that I can answer questions like "who has been blocked repeatedly this quarter?" or "show me all wins this month" instantly.

### Filter Attributes

| Filter | Type | Options |
|--------|------|---------|
| **User** | Multi-select | Specific people · My direct reports · My team · My department · Everyone |
| **State** | Multi-select | ✓ On time · ⏰ Late · ❌ Absent · ✓ Excused · 🔄 Proxy |
| **Content** | Multi-select | 🚫 Has blocker · 🏆 Has win |
| **Blocker status** | Select | Open · Recurring · Escalated · Resolved |
| **Blocker category** | Multi-select | See S5.2 taxonomy |
| **Mood** | Multi-select | 🟢 Good · 🟡 Okay · 🔴 Struggling · Not reported |
| **Project** | Select | From PM module |
| **Team / Dept** | Select | From `DepartmentMembership` |
| **Date range** | Preset + custom | This week · This month · This quarter · Last 30/90 days · Custom |
| **Free text** | Search | Searches `yesterdayDone`, `todayPlan`, `blockers`, `wins` |

**Filters compose with AND. Results update live. Counts update in the header.**

### UI/UX Detail

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Filters:  [👤 3 users ✕]  [🚫 Blockers ✕]  [📅 Last 30 days ✕]              │
│            + Add filter ▾                                        [Clear all]  │
│  ─────────────────────────────────────────────────────────────────────────   │
│  📊 Showing 14 updates across 9 days · 14 blockers · 2 wins    [💾 Save view] │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Active filters render as removable chips.
- Filter state is encoded in the **URL** — `?users=eyob,yohannes&hasBlocker=true&from=2026-06-15` — making any view **shareable**. A colleague opening the link sees exactly the same thing.
- Saved views persist per user (reuses the existing Filters Workspace pattern in the platform).

### Acceptance Criteria
- **Given** I apply `Blockers` + `Last 30 days`, **then** only days containing at least one blocker render, and the count in the header is correct.
- **Given** I filter to a single user, **then** the view automatically switches to their Streak view.
- **Given** filters applied, **then** the URL updates and is shareable — opening it in another session reproduces the identical view.
- **Given** I save a view, **then** it appears in my saved views list and persists.
- **Given** free-text search "Abay API", **then** all updates whose blocker/plan text contains it are returned, with the term highlighted.
- **Given** I filter by mood, **then** only managers and the individuals themselves can see mood-filtered results (server-side permission check).
- **Given** I clear all filters, **then** the default team-month view returns.

### Definition of Done
- [ ] All 10 filter dimensions
- [ ] AND composition with live count updates
- [ ] Filter chips with individual removal
- [ ] **URL-encoded, shareable filter state**
- [ ] Saved views (reuse existing pattern)
- [ ] Free-text search across all text fields with highlighting
- [ ] Auto-switch to streak view on single-user filter
- [ ] **Mood filtering permission-gated server-side**
- [ ] Server-side filtering (not client-side array filter — must scale)

---

# EPIC S5 — Blockers & Escalation

---

## S5.1 — Blocker Lifecycle

### User Story
> As a **manager**, I want blockers to escalate automatically if they persist, so that nothing quietly rots for a week while everyone assumes someone else is handling it.

*This is the Andon-cord principle: a blocker that survives 2+ days is a **system** failure, not a person's failure.*

### State Machine

```
        Blocker raised in an update
                  │
                  ▼
              ┌───────┐
              │ OPEN  │  ──── manager notified immediately
              └───┬───┘
                  │ same blocker appears again next working day
                  ▼
            ┌───────────┐
            │ RECURRING │  ──── dept lead notified
            └─────┬─────┘
                  │ 3+ consecutive working days
                  ▼
            ┌───────────┐
            │ ESCALATED │  ──── CEO notified
            └─────┬─────┘        + auto-create RaidItem (type=ISSUE) on linked project
                  │               + flag linked project activity as blocked
                  │ resolved
                  ▼
            ┌───────────┐
            │ RESOLVED  │  ──── resolution note required; daysOpen recorded
            └───────────┘
```

**Same-blocker detection:** fuzzy text similarity (≥80%) against the previous day's blocker, plus matching `blockerCategory`. The system suggests "Is this the same blocker as yesterday?" and the user confirms — avoiding both false merges and manual re-typing.

### Acceptance Criteria
- **Given** I raise a blocker, **then** my manager is notified immediately and `blockerStatus = OPEN`.
- **Given** the same blocker appears the next working day, **then** the system prompts "Same as yesterday?" and, on confirmation, sets `blockerStatus = RECURRING`, increments `blockerDaysOpen`, and notifies the department lead.
- **Given** a blocker reaches 3+ consecutive working days, **then** `blockerStatus = ESCALATED`, the CEO is notified, and a `RaidItem` of type `ISSUE` is auto-created on the linked project.
- **Given** an escalated blocker linked to a project activity, **then** that activity is flagged blocked in the Gantt (PM module).
- **Given** I mark a blocker resolved, **then** a resolution note is **required**, `blockerResolvedAt` is set, and total `blockerDaysOpen` is recorded for analytics.
- **Given** a weekend/holiday, **then** it does **not** count toward `blockerDaysOpen`.
- **Given** an escalated blocker, **then** it appears in the manager's and CEO's dashboards until resolved.

### Definition of Done
- [ ] Full state machine (OPEN → RECURRING → ESCALATED → RESOLVED)
- [ ] Fuzzy same-blocker detection with user confirmation
- [ ] Working-day-aware day counting
- [ ] Escalation notifications at each stage
- [ ] Auto-creation of `RaidItem` on escalation (PM module integration)
- [ ] Linked activity flagged blocked in Gantt
- [ ] Mandatory resolution note
- [ ] Escalated blockers surface on manager + CEO dashboards
- [ ] Unit tests: state transitions, weekend handling, similarity matching

---

## S5.2 — Blocker Taxonomy

### User Story
> As a **CEO**, I want blockers categorized, so that after a quarter I can see *what actually blocks us most often* and fix the system rather than the symptom.

### Categories

| Category | Typical Owner | Example |
|----------|---------------|---------|
| `EXTERNAL_DEPENDENCY` | Client / third party | Waiting on Abay Bank API credentials |
| `CLIENT_APPROVAL` | Client | Awaiting sign-off on requirements |
| `INTERNAL_DEPENDENCY` | Another team member | Waiting on Yohannes' API contract |
| `TECHNICAL` | Self / team | Can't reproduce the bug locally |
| `ENVIRONMENT_ACCESS` | IT / infra | No access to the UAT server |
| `UNCLEAR_REQUIREMENTS` | BA / PM | Spec is ambiguous on tax handling |
| `RESOURCE_CAPACITY` | Management | Need a second dev on this |
| `TOOLING` | IT | Build server is down |
| `OTHER` | — | Free text required |

### Acceptance Criteria
- **Given** I enter a blocker, **then** category selection is **required** before submit.
- **Given** a quarter of data, **then** a Pareto chart ranks blocker categories by total days lost.
- **Given** the Pareto, **then** it explicitly answers: *"41% of our blocked days are External Dependency."*
- **Given** `EXTERNAL_DEPENDENCY` or `CLIENT_APPROVAL` on a project-linked blocker, **then** it can auto-generate a `DelayEvent` in the PM module with the correct owner attribution.

### Definition of Done
- [ ] 9-category taxonomy enforced
- [ ] Category required when blocker present
- [ ] Blocker Pareto chart (days lost by category)
- [ ] Client-owned categories feed PM module `DelayEvent` attribution

---

# EPIC S6 — Wins & Recognition

---

## S6.1 — Capture and Celebrate Wins

### User Story
> As a **team member**, I want to log wins alongside my update, so that good work is visible rather than invisible — and as a **manager**, I want to celebrate them so recognition is timely rather than annual.

*Industry insight: teams systematically **under-report** wins. Without an explicit field, they simply don't get captured, and recognition defaults to whoever is loudest.*

### Functionality
- Optional `wins` field on every update.
- Managers and peers can `[👏 Celebrate]` a win (a lightweight reaction — no comment required).
- Wins aggregate into the **Friday weekly digest** — the team sees all of the week's wins together.
- Win count per person feeds the Performance module.
- A **Wins Feed** at `/dashboard/scrum/wins` shows all recent wins across the org.

### Acceptance Criteria
- **Given** I log a win, **then** `hasWin = true` and it appears in the day view's wins section with a gold border.
- **Given** a colleague clicks `[👏 Celebrate]`, **then** I receive a notification and the count increments.
- **Given** the Friday digest, **then** it contains every win from that week, attributed.
- **Given** the wins feed, **then** wins across all teams are visible (wins are **not** private — this is deliberate).
- **Given** a person's win count, **then** it is exposed to the Performance module as a Metric criterion.

### Definition of Done
- [ ] Optional wins field
- [ ] Celebrate reaction with notification
- [ ] Wins section in day view (gold border)
- [ ] Weekly digest aggregation
- [ ] Org-wide wins feed
- [ ] Win count exposed to Performance module

---

# EPIC S7 — Automation, Nudges & Telegram

---

## S7.1 — The Daily Rhythm

### User Story
> As a **team member**, I want a gentle reminder before the standup and never to be nagged aggressively, so that the system feels helpful rather than punitive.

### Schedule (all configurable in `ScrumSettings`)

| Time | Action | Recipient | Channel |
|------|--------|-----------|---------|
| **08:00** | *"Daily scrum in 30 minutes — submit your update"* (with a one-tap link) | Anyone with no submission today | In-app + Telegram |
| **08:30** | **Cutoff.** Later submissions flagged `isLate`. | — | — |
| **09:00** | Absence finalized. Consolidated manager digest: `submitted / late / absent / blockers`. | Managers | In-app + Email |
| **09:05** | A gentle personal nudge (once — never repeated) | Non-submitters | In-app + Telegram |
| **Friday 16:00** | Weekly team digest: submission rate, all wins, all blockers (open + resolved), mood trend | Team + manager | Email |

### Telegram Integration

Reuses the **existing** 360Ground Telegram bot (already in the platform).

```
🤖 360Ground Bot

Good morning Eyob! ☀️
Daily scrum in 30 minutes.

📋 Yesterday you planned:
   • Finish POS pre-session UI
   • Review Yohannes' PR
   • Start QR ordering spec

[ 📝 Submit Update ]   ← deep-links to the pre-filled form
[ ⏭ I'm on leave today ]
```

Submitting directly in Telegram via a conversational flow is a **Phase 2** enhancement; Phase 1 deep-links to the web form.

### Acceptance Criteria
- **Given** 08:00 and I have not submitted, **then** I receive one nudge (in-app + Telegram) containing **yesterday's plan** as a memory aid.
- **Given** 09:00, **then** each manager receives **one consolidated digest** — not one notification per person.
- **Given** 09:05, **then** non-submitters get **one** gentle nudge. **Never more.**
- **Given** a weekend or configured holiday, **then** no nudges fire at all.
- **Given** a person has an approved `ScrumAbsence`, **then** they receive no nudge and are not counted absent.
- **Given** the Friday digest, **then** it contains submission rate, all wins, all blockers, and the mood trend.
- **Given** Telegram is disabled in settings, **then** only in-app notifications fire.

### Definition of Done
- [ ] All 5 scheduled jobs with configurable times
- [ ] Nudge includes yesterday's plan as a memory aid
- [ ] **Manager digest is consolidated (one notification, not N)**
- [ ] **Max one nudge per person per day** (anti-nagging guard)
- [ ] Weekend/holiday suppression
- [ ] Excused-absence suppression
- [ ] Telegram deep-link to pre-filled form
- [ ] Friday weekly digest
- [ ] All jobs secured by `Bearer CRON_SECRET`

---

# EPIC S8 — Analytics & Team Health

---

## S8.1 — Team Health Dashboard

### User Story
> As a **CEO**, I want scrum data to reveal team health patterns, so that I can act on burnout, chronic blockers, and disengagement **before** they show up in delivery metrics.

### Metrics & Charts

| ID | Metric / Chart | Type | Insight It Provides |
|----|----------------|------|---------------------|
| **SC1** | Submission Rate | % per person / team | Engagement & discipline |
| **SC2** | Punctuality Rate | % on time | Standup discipline |
| **SC3** | **Blocker Pareto** ⭐ | Pareto (days lost by category) | *"What actually blocks us most?"* |
| **SC4** | Blocker Resolution Time | Avg days | How fast we unblock |
| **SC5** | **Mood Trend** ⭐ | Line, per team | **Leading indicator of burnout** |
| **SC6** | Win Frequency | Count per person/team | Recognition & momentum |
| **SC7** | Streak Leaderboard | Ranked list | Consistency (celebratory, not punitive) |
| **SC8** | Self-Report vs Proxy Ratio | Stacked bar | Data integrity check |
| **SC9** | Carry-Forward Rate | % of items carried | Planning realism |
| **SC10** | Recurring Blocker Themes | Word cloud / list | Systemic issues |

**⭐ SC5 (Mood Trend) is the highest-value chart in this module.** A team trending 🔴 for two weeks predicts attrition and delivery failure **before** any velocity metric moves.

### Acceptance Criteria
- **Given** a team's mood trends 🔴 for ≥10 working days, **then** the CEO is alerted.
- **Given** the blocker Pareto, **then** it quantifies: *"41% of blocked days are External Dependency."*
- **Given** the carry-forward rate exceeds 40%, **then** it flags that planning is unrealistic.
- **Given** the self-report vs proxy ratio, **then** a team where >30% of updates are proxy entries is flagged — because it means people aren't self-reporting.
- **Given** mood data, **then** it is **aggregated at team level only** in any view visible beyond a person's own manager. **Individual mood is never exposed org-wide.**

### Definition of Done
- [ ] All 10 metrics/charts
- [ ] SC5 mood trend with 10-day CEO alert
- [ ] SC3 blocker Pareto
- [ ] **Individual mood never exposed beyond self + direct manager (server-enforced)**
- [ ] Proxy ratio integrity check
- [ ] Carry-forward realism flag
- [ ] All charts export to PNG

---

# EPIC S9 — Integration (OKR, PM, Performance)

---

## S9.1 — Link Updates to Real Work

### User Story
> As a **team member**, I want my daily updates to link to my actual todos and key results, so that my update is verifiable and my daily work visibly connects to company strategy.

### Acceptance Criteria
- **Given** I link a `Todo`, **then** that initiative's activity feed shows the update.
- **Given** I link a `KeyResult`, **then** the KR detail page shows recent scrum mentions.
- **Given** a linked todo has not been mentioned in 5+ working days, **then** it flags as potentially stalled.
- **Given** an update linked to a project, **then** it appears in the PM module's project activity feed.

### Definition of Done
- [ ] Todo linkage bidirectional
- [ ] KeyResult linkage bidirectional
- [ ] Project linkage into PM module feed
- [ ] Stalled-todo detection

---

## S9.2 — Feed the Performance Module

### User Story
> As an **HR Administrator**, I want scrum consistency to be an objective, auto-pulled criterion in performance scorecards, so that accountability is measured rather than assumed.

### Metrics Exposed as Performance Metric Criteria

| Metric | Scoring Rule |
|--------|-------------|
| **Submission Rate %** | `min(10, rate/100 × 10)` |
| **Punctuality Rate %** | `min(10, rate/100 × 10)` |
| **Win Count** | Banded |
| **Blocker Resolution Speed** | Inverse-banded (faster = higher) |

> ⚠️ **Deliberate exclusion:** **Mood is NEVER used in performance evaluation.** Doing so would immediately destroy the honesty of mood data and turn a wellbeing signal into a surveillance metric. This is a hard rule enforced by excluding mood from the metrics API entirely.

### Acceptance Criteria
- **Given** the Performance module, **then** submission rate and punctuality rate are available as auto-pullable Metric criteria.
- **Given** any attempt to expose mood to the Performance module, **then** it **fails** — mood is not present in the metrics API surface at all.
- **Given** a scorecard with a scrum criterion, **then** the actual auto-pulls from `ScrumUpdate` data for the review period.

### Definition of Done
- [ ] `GET /api/scrum/metrics/[userId]` exposing submission rate, punctuality, wins, blocker resolution
- [ ] **Mood physically absent from the metrics API** (verified by test)
- [ ] Performance module can auto-pull these as Metric criteria

---

## S9.3 — Feed the PM Module

### Acceptance Criteria
- **Given** an escalated blocker with category `CLIENT_APPROVAL` or `EXTERNAL_DEPENDENCY` on a project-linked update, **then** a `DelayEvent` can be created in the PM module with the correct owner attribution.
- **Given** an escalated blocker, **then** a `RaidItem` of type `ISSUE` is auto-created on the linked project.
- **Given** scrum attendance data, **then** it satisfies the PM module's `ScrumLog` requirement (**this module supersedes PM Epic G6** — do not build both).

### Definition of Done
- [ ] Blocker → `DelayEvent` creation with attribution
- [ ] Escalation → `RaidItem` creation
- [ ] **PM module G6 (ScrumLog) removed — this module is the single source**

---

# EPIC S10 — Settings & Administration

---

## S10.1 — Configure Scrum Settings

### User Story
> As an **Administrator**, I want to configure timings, working days, holidays, and feature toggles, so that the module fits how our teams actually work.

### Configurable Attributes
All fields in `ScrumSettings` (§1) — timing, working days, Ethiopian public holidays, escalation thresholds, and feature toggles (mood, wins, Telegram, proxy entry, required todo link).

### Acceptance Criteria
- **Given** I change the cutoff to 09:00, **then** lateness is calculated against the new time from the next day.
- **Given** I add an Ethiopian public holiday, **then** no nudges fire and no absences are recorded on that date.
- **Given** I disable mood, **then** the field disappears from all forms and all mood analytics are hidden.
- **Given** I disable proxy entry, **then** the "Log for someone else" action disappears and the API rejects proxy attempts.

### Definition of Done
- [ ] Settings UI (Admin only)
- [ ] All toggles functional and immediately effective
- [ ] Ethiopian holiday calendar seeded
- [ ] Timezone: `Africa/Addis_Ababa`

---

## S10.2 — Record Excused Absences

### User Story
> As a **manager**, I want to mark someone as on leave, so that they're not nagged and not falsely counted absent.

### Acceptance Criteria
- **Given** an approved `ScrumAbsence`, **then** the person receives no nudge, is shown as blue (excused) on the calendar, and is excluded from absent counts and submission-rate denominators.
- **Given** a multi-day leave, **then** all days in the range are excused in one action.

### Definition of Done
- [ ] Absence recording (single + date range)
- [ ] Excluded from nudges, absent counts, and rate denominators
- [ ] Blue visual state on calendar

---

# 11. Permissions

New DocTypes for the Permission module:

| DocType Key | Sensitive Fields (Level) |
|-------------|--------------------------|
| `scrum_update` | `mood` (**L2 — self + direct manager only**), `blockers` (L1) |
| `scrum_comment` | — |
| `scrum_absence` | — |
| `scrum_settings` | all (L2 — Admin only) |

**Default permissions**

| DocType | ADMIN | EXECUTIVE | DEPT_LEAD / PM | EMPLOYEE |
|---------|-------|-----------|----------------|----------|
| `scrum_update` | All | R (all, **except individual mood**) | R W C (team) + **proxy** | R W C (**own only**) + R (team, **no mood**) |
| `scrum_comment` | All | R W C | R W C | R W C |
| `scrum_absence` | All | R | R W C (team) | R (own) |
| `scrum_settings` | All | R | — | — |

### ⭐ Hard Privacy Rules (server-enforced, not UI-hidden)

1. **`mood` is readable ONLY by the subject themselves and their direct manager.** Not peers. Not Executives. Not the CEO at individual level. Executives see **team-aggregated mood only**.
2. **`mood` is absent from the Performance metrics API entirely.**
3. **Peers cannot create proxy entries** — 403 at the API layer.
4. **Proxy attribution can never be removed** from a record.

---

# 12. Notifications

New category: `SCRUM`

| Event Key | Recipient | Cadence |
|-----------|-----------|---------|
| `SCRUM_REMINDER` | Non-submitters | Daily 08:00 |
| `SCRUM_MISSED` | Non-submitters | Daily 09:05 (**once only**) |
| `SCRUM_MANAGER_DIGEST` | Managers | Daily 09:00 (**consolidated**) |
| ⭐`SCRUM_BLOCKER_RAISED` | Manager | Immediate |
| ⭐`SCRUM_BLOCKER_RECURRING` | Dept Lead | Immediate |
| ⭐`SCRUM_BLOCKER_ESCALATED` | CEO | Immediate |
| `SCRUM_BLOCKER_RESOLVED` | Manager, originator | Immediate |
| `SCRUM_PROXY_SUBMITTED` | **The subject** | Immediate |
| `SCRUM_WIN_CELEBRATED` | Win author | Immediate |
| `SCRUM_COMMENT` | Update author | Immediate |
| `SCRUM_WEEKLY_DIGEST` | Team + manager | Friday 16:00 |
| ⭐`SCRUM_TEAM_MOOD_ALERT` | CEO | When team 🔴 for 10+ working days |
| `SCRUM_LOW_SUBMISSION_RATE` | Manager | Weekly, when a person < 75% |

---

# 13. Cron Jobs

| Route | Schedule | Purpose |
|-------|----------|---------|
| `POST /api/cron/scrum-reminder` | Daily 08:00 | Nudge non-submitters (with yesterday's plan) |
| `POST /api/cron/scrum-finalize` | Daily 09:00 | Finalize absences · manager digest · blocker escalation checks |
| `POST /api/cron/scrum-nudge` | Daily 09:05 | Single gentle nudge to non-submitters |
| `POST /api/cron/scrum-weekly` | Friday 16:00 | Weekly team digest |
| `POST /api/cron/scrum-health` | Daily 02:00 | Recompute streaks, rates, mood trends, blocker day counts |

All secured by `Bearer CRON_SECRET` (existing pattern).

---

# 14. Build Sequence & Global DoD

## 14.1 Build Phases

| Phase | Epics | Deliverable |
|-------|-------|-------------|
| **P1 — The Core Loop** ⭐ | S1 | Submit form · **pre-fill from last working day** · **yesterday's-plan reference panel** · autosave · attendance-by-submission |
| **P2 — Visualization** ⭐ | S3 | Month calendar · day view · streak view · week view |
| **P3 — Filtering** | S4 | All 10 filter dimensions · URL-shareable state · saved views |
| **P4 — Proxy Entry** | S2 | Proxy submission · role scoping · attribution · confirm/amend loop |
| **P5 — Blockers** | S5 | Lifecycle · escalation · taxonomy · RAID integration |
| **P6 — Automation** | S7 | Nudges · digests · Telegram |
| **P7 — Wins & Analytics** | S6, S8 | Wins feed · celebrate · all 10 charts · mood alerting |
| **P8 — Integration** | S9, S10 | OKR / PM / Performance links · settings · absences |

> **P1 and P2 must ship together.** Submission without the calendar is a form nobody looks at; the calendar without submission has nothing to show.

## 14.2 Global Definition of Done

- [ ] **API:** `withAuth` / `withRole`, `{success, data?, error?}` envelope, Zod-validated input
- [ ] **Permissions:** DocTypes registered, defaults seeded, **mood restriction server-enforced**
- [ ] **Audit:** `recordActivity()` on every mutation (including proxy entries and amendments)
- [ ] **Types:** shared types in `types/index.ts`
- [ ] **Forms:** `react-hook-form` — no raw `useState` for form state
- [ ] **Modals:** `components/ui/Modal` — no custom wrappers
- [ ] **Confirms:** `components/ui/ConfirmDialog` — never `window.confirm()`
- [ ] **Empty states:** `components/ui/EmptyState`
- [ ] **Styles:** `cn()` — no hardcoded hex, no string concat
- [ ] **Barrel:** exported from `features/scrum/index.ts`
- [ ] **Tests:** pre-fill logic · working-day math · blocker state machine · proxy authorization · **mood privacy**
- [ ] **Docs:** `docs/MASTER_REFERENCE.md` + `docs/CHANGELOG_AI.md` updated

## 14.3 Critical Invariants

1. ⭐ **Submission time < 60 seconds median.** If it exceeds this, the module has failed regardless of feature completeness.
2. ⭐ **Pre-fill pulls from the last *working day*,** never literally "yesterday."
3. ⭐ **Submission IS attendance.** No separate attendance action exists anywhere.
4. ⭐ **Mood is visible only to self + direct manager.** Never peers. Never org-wide at individual level. **Never in performance evaluation.**
5. ⭐ **Proxy entries are permanently and visibly attributed.** Attribution cannot be removed.
6. ⭐ **Mood is never captured on proxy entries.**
7. ⭐ **Maximum one nudge per person per day.** Anti-nagging is a feature.
8. **One update per person per day** (DB-enforced unique constraint).
9. **Weekends and holidays never count** toward absences, blocker days, or streaks.
10. **This module supersedes PM Epic G6** — the PM `ScrumLog` model is not built.

---

*Prepared by: 360Ground Internal Platform Team | Build Spec v1.0 | July 2026*
*Sources: Daily scrum requirement · PM Challenges document · OKR Platform Master Reference · Industry practice (Geekbot, Range, Standuply, Scrum Guide, Officevibe)*
