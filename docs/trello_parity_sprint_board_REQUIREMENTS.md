# Trello-Parity Sprint Board — System Requirements

> Status: **Phases 1–5 IMPLEMENTED; Phase 6 PARTIAL** (foundations, dynamic lists, card visuals,
> card modal, sharing, keyboard card movement).
> **Remaining:** the dnd-kit migration of both drag paths and PRF-4 virtualisation (which depends on
> it), CDM-9 (blocked on assumption A3), and DTE-5 recurring (deferred by decision).
> `DTE-1` was implemented by extending the existing calendar rather than replacing it — see the
> 2026-09-16 dates entry in `docs/CHANGELOG_AI.md`.
> **A11Y-2 was implemented differently from the text below** — as a parallel keyboard path rather
> than a replacement of HTML5 drag. See the 2026-09-16 entry in `docs/CHANGELOG_AI.md` for why.
> Owner: TBD. Last updated: 2026-09-15.
>
> §4 "Verified baseline" describes the codebase **as it stood when this spec was written** and is
> deliberately not rewritten as phases land — it is the record of what the plan was built against.
> For current state see `docs/FEATURE_STATUS.md` and the dated entries in `docs/CHANGELOG_AI.md`.
> Phases 1–2 are deployed-pending: they need `scripts/preflight.sql` then `prisma db push`.
>
> Source: UI/UX design review of the reference board design (5 screens). This document is the
> single source of truth for the Trello-parity work on `/dashboard/sprints/[id]`.
>
> Legend: **[V]** = verified against code in this repo · **[A]** = assumption needing confirmation.
> Every requirement has an ID and Given/When/Then acceptance criteria.

---

## Context

The sprint board (`/dashboard/sprints/[id]`) was already built to a Trello visual reference —
`TaskCardTrello` says so in its header comment, the board renders gradient backgrounds behind
translucent lanes, and a floating Inbox/Planner/Board/Switch-boards pill bar mirrors Trello's. The
design raises the bar from "looks like Trello" to "works like Trello": named dynamic lists,
colour-blind-safe labels, card covers, a complete card-detail modal, and a comments-and-activity rail.

The work must not regress what makes this board *not* Trello: KR linkage on cards, the sprint state
machine, carryover lineage badges, read-only closed sprints, AI-draft isolation (`aiSuggested`), the
dual task/goal progress header, and the end-sprint disposition engine — all of which key off
`Todo.status`.

**Locked decisions:**

| # | Decision |
|---|---|
| D1 | **Dynamic lists mapped to a status.** Honour `SprintColumn`; add/rename/reorder/delete lists; `Todo` gains `columnId`; several lists may share one `statusKey` so completion maths survives. |
| D2 | **Cover = colours + colour-blind patterns only.** No image upload, no Unsplash. |
| D3 | **Share = in-app deep link only.** No tokens, no anonymous access. |
| D4 | **Custom Fields deferred** — specified, not built; the popover row stays hidden. |

---

## 1. Screen inventory

| # | Surface | Evidence |
|---|---|---|
| S1 | Board shell — header, horizontal lists, add-another-list | Design screen 1 |
| S2 | List — header (name, count, overflow), card stack, "Add a card" + template button | Design screen 1 |
| S3 | Card front — patterned label bar, title, date chip, badge row, member avatars | Design screen 1 |
| S4 | Card detail modal — content pane left, comments/activity rail right | Design screen 2 |
| S5 | Cover popover — size, colours, colour-blind toggle | Design screen 3 |
| S6 | Dates popover — calendar range, start/due, time, recurring, reminder | Design screen 4 |
| S7 | "Add to card" popover | Design screen 5 |
| S8 | Contextual floating bar — board vs card context | Design screens 1 & 2 |
| S9 | **Share card** — requester instruction, not in the design screens | Requester |

## 2. Observed design details

**Board header:** title · view chevron · member avatars · power-ups · automations · filter · star ·
visibility lock · **Share** · overflow.

**Lists:** To Do (13) · In Progress (17) · In Review (5) · Done (79) · **Backlogs (28)** ·
"+ Add another list". Counts sit right of the name.

**Card front:** patterned colour-label strip (colour-blind mode ON — each colour carries a distinct
hatch/dot/stripe); title; date chip, **red when overdue**; badges — attachment count, checklist
`4/4` **green only when complete**, description present, comment count, watching eye; member chips.

**Card modal:** list-selector chip "To Do ⌄"; cover / watch / overflow / close; circular
**mark-complete** toggle; action row "+ Add · Checklist · Attachment"; Members / Labels / Dates rows;
Description with full toolbar and Save / Cancel / Formatting help; right rail "Comments and
activity" with **Hide details**, a composer, and a feed whose comments carry Edit / Add link as
attachment / Delete.

**Cover:** two size options (band vs full-bleed); 10 patterned colours; "Disable colorblind friendly
mode".

**Dates:** month grid with range highlight, today underlined; ‹‹ ‹ › ››; Start-date checkbox + input;
Due-date checkbox + input + **time dropdown**; Recurring select; reminder select; helper text
"Reminders will be sent to all members and watchers of this card."; Save + Remove.

**Add to card:** Labels · Dates · Checklist · Members · Attachment · Custom Fields.

## 3. User journeys

- **J1 Plan** — open board → add/rename lists → add cards → label, assign, date → Start sprint.
- **J2 Work a card** — open → mark complete / move list / checklist / comment / attach.
- **J3 Triage** — label → filter by label/member/due → scan the colour bar without opening cards.
- **J4 Schedule** — Dates → start + due + time → reminder → Save → chip reflects state.
- **J5 Personalise** — card cover colour; board background (exists).
- **J6 Share** — copy a card deep link; recipient signs in and passes existing permission checks.
- **J7 Close** — unchanged EndSprintModal → dispositions → report.

---

## 4. Verified baseline

### 4.1 Card features **[V]**

`components/todos/TodoCardModal.tsx` (1720 lines) is portal-rendered and **not** built on
`components/ui/Modal`, so it has **no focus trap**. One popover at a time via `activePanel`.

**Exists — reuse, do not rebuild:** title inline edit · Members (`TodoMember` + `memberIds`
full-replace) · Labels (`TodoLabelDef` global palette + `TodoLabel` join + `labelIds` full-replace,
`/api/todo-labels`) · `DatesPanel` (hand-rolled calendar, `startTime`/`endTime` as `HH:mm`) ·
Checklists (`TodoChecklist`/`TodoChecklistItem` — items already have `assigneeId`, `startDate`,
`dueDate`, `position` — full CRUD routes) · Attachments (`TodoAttachment`, multipart POST, 20 MB cap
→ `public/uploads/todos`) · Comments (`TodoComment`, HTML, `parentId`, `commentAttachments` JSON
string; GET/POST + PATCH/DELETE on `[commentId]`) · Activity (`GET /api/todos/[id]/activity`) ·
`Todo.coverColor` (10 hardcoded hex, `h-14` strip) · TipTap via `MentionEditor` · reorder routes.

**Missing — must be built:** watch/subscribe UI · card move/list selector · cover patterns & size ·
Custom Fields (nothing at all) · comment edit/delete/reply UI · label rename/recolor ·
mark-complete circle · archive (no `archivedAt` on `Todo` — hard delete only) · share · split
comments/activity rail.

**Dead code found [V]:** `TaskCardTrello.tsx:34,118,213` renders a watcher badge from
`todo.watchers[]` that **no API ever populates**. `TodoCardModal.tsx:1270-1291` has three checklist
hover buttons (due date, assign, more) with **no `onClick` handlers**.

**Blast radius of any `TodoCardModal` change:** `components/shared/GlobalInitiativeDetail.tsx`,
`components/todos-page/TodosPageClient.tsx`, `components/work/WorkBoardClient.tsx`,
`features/sprints/components/SprintBoardClient.tsx:776`.

### 4.2 Lists / columns **[V]**

- `SprintColumn` = `id, sprintId, name, statusKey String?, position, color String?, createdAt,
  updatedAt`; `@@unique([sprintId, name])`, **`@@unique([sprintId, statusKey])`**, `@@index([sprintId, position])`.
- `GET /api/sprints/[id]/board` uses a **hardcoded `COLUMN_DEFS`** array of 5 statuses and
  **never queries `sprintColumn`**. Todos in other statuses (e.g. `CANCELLED`) silently vanish.
- `POST /columns` and `PATCH|DELETE /columns/[colId]` exist but **nothing in the app calls them** —
  no `fetch` anywhere targets that path. There is **no `GET /columns`**. Neither route checks
  `canEditSprint` (only `withAuth` + a closed-sprint guard), unlike `board/reorder` which does.
- `PATCH /columns/[colId]` writes `position` on one row with **no sibling reorder and no transaction**.
- `POST /columns` never sets `statusKey`, so created rows are `null`.
- Backlog is **not** a column — it is `Todo.sprintId === null`. **Bug [V]:**
  `SprintsListClient.tsx:206` fetches `?sprintId=null`; the route expects `?noSprint=1`, and the
  string `"null"` is truthy, so the Backlog tab currently returns **zero rows**.
- Ordering: `Todo.sprintPosition`, rewritten as `(i+1)*1000` by `board/reorder`.

### 4.3 Auth, sharing, permissions **[V]**

- **No share-token infrastructure exists** — no token column, no `/share/` route, no revocation.
- `middleware.ts` (matcher `/api/sprints/:path*`, `/dashboard/:path*`) **does not authenticate**;
  it only 403s portal-only cookies and stamps deprecation headers. The real gates are
  `app/dashboard/layout.tsx` (`getServerSessionSafe()` → `redirect('/auth/signin')`) and
  `lib/api/withAuth.ts` (401).
- Sprint permissions live **only** in `lib/permissions.ts`: `canCreateSprint`, `canEditSprint`,
  `canDeleteSprint`, `canViewSprint` — all `(role, userId, ctx) => Promise<boolean>`.
  `lib/rbac.ts`'s `Action` union contains **no sprint actions**; it does carry
  `todo.create|edit|delete|assign|complete|setDueDate`.
- `ActivityLog.entityType`/`action` are **plain String columns**; the enums are TypeScript unions in
  `lib/activity-log.ts`. **Adding an action needs no migration.** No share-ish action exists
  (closest precedent: `DRAFT_SHARED`).
- Notifications: `emit(eventKey, payload)` with `explicitRecipients[]`. There is **no `SPRINT`
  event category and no sprint `EntityType`**.
- Copy-link is `navigator.clipboard.writeText` + toast in ~7 places; **no shared component**.

### 4.4 Design system **[V]**

- `--ap-*` tokens live in `app/globals.css` (L943-1431), scoped to `.apple-pro-surface` /
  `.theme-apple-full`, with full dark-mode overrides, and they **remap the shadcn HSL tokens** — so
  `bg-card`, `text-muted-foreground`, `border-border` are auto-themed. Motion tokens:
  `--ap-spring`, `--ap-ease-out`, `--ap-duration-fast|base|slow`.
- **Two parallel systems** — Tailwind-config tokens (`surface-*`, `ink-*`, `rounded-card`,
  `shadow-card`, `ease-apple`; mandated by CLAUDE.md) and the CSS `--ap-*` tokens.
  `rounded-card` = **12px** but `--ap-radius-card` = **16px**; `shadow-card` differs from
  `--ap-shadow-card`; `ease-apple` differs from `--ap-spring`.
- `components/ui/Modal` wraps Radix Dialog → focus trap, focus restore, `aria-modal`, Escape, scroll
  lock. It is **the only real focus trap in the repo**.
- **No `components/ui/popover.tsx` exists** — every popover is a hand-rolled absolutely-positioned div.
- `@dnd-kit/*` is installed but used **only** by `features/projects/components/gantt/GanttChart.tsx`.
  Every kanban is hand-rolled HTML5 DnD → **zero keyboard accessibility**.
- **No `aria-live` region and no `role="status"` anywhere.** **No `prefers-reduced-motion`
  handling** in CSS or JS, despite the UX guide mandating it.
- Global focus ring is a **3px glow**; `docs/apple_pro_ux_guide.md` §9 mandates a 2px outline with
  2px offset — a live divergence.
- No file-upload library (raw `FormData` → `fs.writeFile`), no Unsplash, no `next/image` here.
- Reusable: `Modal`, `ConfirmDialog`, `EmptyState`, `Skeleton*`, `ActionsMenu`, `SideDrawer`,
  `AppleDatePicker`/`AppleDateRangePicker`/`toIso`, `UserAvatar`/`UserAvatarStack`, `StatusPill`,
  `KanbanDropLine`, `MentionEditor`, `getBackgroundStyle`, `useIsMobile`, `useDebounce`,
  `useUsersForSelection`.

---

## 5. Data model changes

All additive fields are nullable/defaulted → `prisma db push` suffices. **The one exception** is
dropping a unique constraint, which needs a `preflight.sql` entry (see DM-2).

```prisma
model Todo {
  columnId  String?   // board list membership; null → fall back to statusKey match
  coverSize String?   // 'BAND' | 'FULL'  (default BAND when coverColor set)
  column    SprintColumn? @relation(fields: [columnId], references: [id], onDelete: SetNull)
  @@index([columnId, sprintPosition])
}

model SprintColumn {
  statusKey  String     // becomes REQUIRED for new rows
  archivedAt DateTime?
  todos      Todo[]
  // DROP @@unique([sprintId, statusKey])   ← several lists may share a status
  // KEEP  @@unique([sprintId, name])
}

model TodoLabelDef {
  pattern String?   // 'SOLID'|'DIAGONAL'|'DOTS'|'VERTICAL'|'HORIZONTAL'|'ZIGZAG'|'CROSS'|'WAVE'|'GRID'|'DASH'
}
```

| ID | Requirement |
|---|---|
| **DM-1** | Add `Todo.columnId` (nullable, `onDelete: SetNull`) + index. Backfill every existing todo to its sprint's column whose `statusKey` matches `Todo.status`. |
| **DM-2** | Drop `@@unique([sprintId, statusKey])` on `SprintColumn` via `preflight.sql`, so multiple lists can map to one status. Keep `@@unique([sprintId, name])`. |

> **Implementation note (2026-09-15).** `SprintColumn.statusKey` stays **nullable at the DB level**,
> diverging from the "becomes REQUIRED" wording above. Making the column `NOT NULL` would make
> `prisma db push` fail against any production row still holding a null, and this project has no
> migration history to sequence that safely. Instead: the preflight backfills every null (by lane
> name, defaulting to `PENDING`), and the API rejects a create or update without a valid
> `statusKey`. The functional guarantee is identical; only the enforcement point moved.

| **DM-3** | Add `SprintColumn.archivedAt`. Deleting a list with cards **archives** it rather than hard-deleting, so cards are never orphaned. |
| **DM-4** | Add `TodoLabelDef.pattern`, defaulting deterministically from the colour's palette index so existing labels get a pattern without a data migration. |
| **DM-5** | Add `Todo.coverSize`. |
| **DM-6** | Add activity actions to the `ActivityAction` union (no migration): `SPRINT_COLUMN_CREATED`, `SPRINT_COLUMN_RENAMED`, `SPRINT_COLUMN_DELETED`, `SPRINT_COLUMN_REORDERED`, `TODO_MOVED_COLUMN`, `TODO_SHARED`, `TODO_WATCH_ADDED`, `TODO_WATCH_REMOVED`. |

**DM-AC-1** — *Given* a sprint with 40 todos across 5 statuses, *when* the backfill runs, *then*
every todo has a non-null `columnId` pointing at a column in its own sprint whose `statusKey` equals
the todo's `status`, and `SELECT count(*) FROM initiatives WHERE "sprintId" IS NOT NULL AND "columnId" IS NULL` returns 0.

**DM-AC-2** — *Given* the constraint is dropped, *when* two lists named "QA" and "Review" are both
created with `statusKey='IN_REVIEW'`, *then* both persist and no P2002 is raised.

**DM-AC-3** — *Given* a list holding 6 cards, *when* it is deleted, *then* `archivedAt` is set, the
cards keep their `columnId`, and they are re-homed per LST-7 rather than disappearing.

---

## 6. API changes

| ID | Endpoint | Change |
|---|---|---|
| **API-1** | `GET /api/sprints/[id]/board` | Replace the hardcoded `COLUMN_DEFS` with `SprintColumn` rows where `archivedAt IS NULL`, ordered by `position`. Bucket by `columnId`; for `columnId IS NULL`, fall back to first column with a matching `statusKey`. Keep the `aiSuggested: false` filter. Return `statusKey`, `color`, `position`, `cardCount` per column. |
| **API-2** | `GET /api/sprints/[id]/columns` | **New.** List non-archived columns. `withAuth` + `canViewSprint`. |
| **API-3** | `POST /api/sprints/[id]/columns` | Require `statusKey` (validate against `BOARD_STATUSES`). **Add the missing `canEditSprint` check.** |
| **API-4** | `PATCH /api/sprints/[id]/columns/[colId]` | Add `canEditSprint`. Wrap repositioning in a transaction that renumbers siblings. Accept `archivedAt`. |
| **API-5** | `DELETE /api/sprints/[id]/columns/[colId]` | Add `canEditSprint`. Soft-delete (set `archivedAt`), re-home cards per LST-7, keep the "at least one column" guard. |
| **API-6** | `POST /api/sprints/[id]/board/reorder` | Key `columnOrders` by **`columnId`**, not status. When a card lands in a list with a different `statusKey`, update `status` in the **same transaction** as `sprintPosition` (today the client fires two independent requests). |
| **API-7** | `PATCH /api/todos/[id]` | Accept `columnId` and `coverSize`. When `columnId` changes, derive and write `status` from the target column's `statusKey` server-side. Log `TODO_MOVED_COLUMN`. |
| **API-8** | `POST /api/todos/[id]/members` + `DELETE .../members/[userId]` | **New.** Single-member add/remove, replacing the `memberIds` full-array replace (lost-update risk under concurrent edits). Keep the array form for back-compat. |
| **API-9** | `POST /api/todos/[id]/labels` + `DELETE .../labels/[labelId]` | **New**, same rationale as API-8. |
| **API-10** | `GET/POST/DELETE /api/watchers` | No change — already supports `entityType='TODO'`. Wire the board/card UI to it and **populate `watchers[]` in the board payload** so the existing `TaskCardTrello` badge stops being dead code. |
| **API-11** | `PATCH /api/todo-labels/[id]` | Relax from ADMIN/EXECUTIVE-only to `canEditSprint` on the sprint in context, so leads can rename labels. **[A]** — confirm this loosening is wanted. |
| **API-12** | `GET /api/todos?noSprint=1` | No change; **fix the caller** (`SprintsListClient.tsx:206`) which currently sends `?sprintId=null`. |

**API-AC-1** — *Given* a sprint with lists To Do, Doing, QA, Review, Done, *when* `GET /board` is
called, *then* the response has 5 columns in `position` order, each with `id` = the `SprintColumn`
id, and every returned todo appears in exactly one column.

**API-AC-2** — *Given* a card in "To Do" (`PENDING`), *when* `POST /board/reorder` moves it into
"Done" (`COMPLETED`), *then* a single transaction sets `columnId`, `sprintPosition` and
`status='COMPLETED'`, and `GET /board` `aggregates.taskDone` increases by exactly 1.

**API-AC-3** — *Given* an EMPLOYEE who is neither owner nor participant, *when* they
`POST /api/sprints/[id]/columns`, *then* the response is 403 and no row is created.

---

## 7. Requirements

### 7.1 Board shell — `BRD`

| ID | Requirement |
|---|---|
| BRD-1 | The sticky header keeps its existing rows (back link, name, `StatusPill`, state-dependent actions, closed banner, dates, dual progress, filters, avatars) and gains a **Share** button and an overflow `ActionsMenu`. |
| BRD-2 | The ad-hoc assignee `<select>` and the all/linked/unlinked segmented control collapse into a single **Filter** popover: assignee (multi), label (multi), due (overdue / due soon / no date), OKR linkage, and "Cards I'm watching". An active-filter count badge sits on the trigger. |
| BRD-3 | Filter state persists per sprint in `localStorage` (pattern: `LinkToOkrPopover`'s `RECENT_KEY`) and is cleared by a "Clear all" action. |
| BRD-4 | The board background picker, floating bar, and gradient behaviour are unchanged. |
| BRD-5 | **Out of scope, documented:** star/favourite, board visibility lock, power-ups, automations. No backing model exists. The icons are **not** rendered rather than rendered inert. |

**BRD-AC-1** — *Given* a board with 30 cards, 8 assigned to Yared, *when* the user selects Yared in
the Filter popover, *then* only those 8 remain, every list count updates to the filtered count, the
trigger shows a badge of `1`, and the URL/localStorage records the filter.

**BRD-AC-2** — *Given* filters are active, *when* the user reloads the page, *then* the same filters
are still applied and the badge count matches.

**BRD-AC-3** — *Given* a filter hides every card in a list, *when* the list renders, *then* it shows
a "No cards match your filters" empty state with a "Clear filters" action, **not** the generic empty
state — and the list itself is not hidden.

### 7.2 Lists — `LST`

| ID | Requirement |
|---|---|
| LST-1 | The board renders lists from `SprintColumn` (`archivedAt IS NULL`) in `position` order. Each header shows name, card count, and an `ActionsMenu`. |
| LST-2 | "+ Add another list" appears as the last column: click → inline name input + a **required status mapping** select (To Do / In Progress / In Review / Stuck / Done). Enter or "Add list" submits; Escape cancels. |
| LST-3 | List overflow menu: Rename · Change status mapping · Add card · Move all cards in this list · Sort by (due date / priority / created) · Archive list. |
| LST-4 | Lists are reorderable by dragging the header; the new order is persisted via API-4 in one transaction. |
| LST-5 | A list's card count reflects the **filtered** set, matching the design's numeric badge. |
| LST-6 | Changing a list's `statusKey` bulk-updates the `status` of every card in it, inside one transaction, with an `ActionsMenu` confirmation (`ConfirmDialog`) naming the number of cards affected. |
| LST-7 | Archiving a list with cards requires choosing a destination list; cards are moved (and re-statused) before the archive commits. Archiving an empty list skips the prompt. |
| LST-8 | A sprint must always keep at least one list (existing server guard preserved), and at least one list mapped to `COMPLETED` — otherwise completion maths and `EndSprintModal` break. |
| LST-9 | **Backlog:** the sprint-list Backlog tab (`Todo.sprintId = null`) is fixed to call `?noSprint=1`. A board list may be *named* "Backlog"; this is distinct from the global backlog. **[A]** — confirm the design's "Backlogs" list means an in-sprint list, not the global backlog surfaced on the board. |
| LST-10 | Closed sprints (`COMPLETED`/`CANCELLED`) render lists read-only: no add, rename, archive, reorder, or drag — consistent with the existing `isClosed` behaviour. |

**LST-AC-1** — *Given* a PLANNING sprint with 5 lists, *when* the user adds "QA" mapped to
`IN_REVIEW`, *then* a 6th column appears at the far right, `GET /board` returns it at the highest
`position`, and an `ActivityLog` row `SPRINT_COLUMN_CREATED` is written.

**LST-AC-2** — *Given* a list named "QA" already exists, *when* the user tries to add another "QA",
*then* the API returns 409 and the inline input shows "A list with this name already exists",
keeping the typed value.

**LST-AC-3** — *Given* "QA" maps to `IN_REVIEW` and holds 4 cards, *when* the mapping changes to
`STUCK`, *then* a confirm dialog says "This will change the status of 4 cards", and on confirm all 4
move to `STUCK` in one transaction with per-card `ActivityLog` rows.

**LST-AC-4** — *Given* a list holding 3 cards, *when* the user archives it and picks "To Do" as the
destination, *then* the 3 cards appear at the bottom of "To Do" with `status='PENDING'`, the list
disappears, and no card is deleted.

**LST-AC-5** — *Given* a COMPLETED sprint, *when* the board renders, *then* "+ Add another list" is
absent, list overflow menus are absent, and list headers are not draggable.

**LST-AC-6** — *Given* a sprint with exactly one list, *when* the user tries to archive it, *then*
the action is disabled with the tooltip "A sprint must have at least one list".

### 7.3 Card front — `CRD`

| ID | Requirement |
|---|---|
| CRD-1 | `TaskCardTrello` gains a **label strip** above the title: one chip per label, `background: labelDef.color`, rendering the `pattern` overlay when colour-blind mode is on. Chips are 8px tall in compact mode and expand to show names on click (Trello's label-toggle behaviour). |
| CRD-2 | The cover colour renders as a band above the label strip when `coverSize='BAND'`, or as a full-bleed background with contrast-corrected text when `'FULL'`. |
| CRD-3 | The badge row gains an **attachment count** (`N`) and a **description-present** indicator, joining the existing comment count, checklist, date chip and watcher eye. |
| CRD-4 | The **watcher eye** badge is wired to real data — `GET /board` includes `watchers` per todo (API-10). The badge appears only when the current user is a watcher. |
| CRD-5 | Checklist badge is neutral by default and **green-filled only at 100%** — already implemented; preserve exactly. |
| CRD-6 | Date chip tone logic (`overdue` danger / `done` success / `soon` warning / neutral) is preserved unchanged. |
| CRD-7 | Existing priority dots, the urgent stripe, the OKR pill, the carryover `×N` badge and the member stack are preserved unchanged. |
| CRD-8 | Card visual density must not exceed the current card height by more than 24px with zero labels, so lane scanning is not degraded. |

**CRD-AC-1** — *Given* a card with labels "High Priority" (red) and "Blocked" (orange), *when* the
board renders, *then* two chips appear above the title in label order, each with
`aria-label="Label: High Priority"`, and no chip overlaps the title.

**CRD-AC-2** — *Given* colour-blind mode is ON, *when* the card renders, *then* each label chip
carries its `pattern` overlay, and two labels of different colours are distinguishable in a
greyscale screenshot diff.

**CRD-AC-3** — *Given* a card with 2 attachments and a non-empty description, *when* it renders,
*then* the badge row shows the attachment count and the description glyph, each with a
`title`/`aria-label`.

**CRD-AC-4** — *Given* the current user watches a card, *when* the board loads, *then* the eye badge
shows; *given* they do not, *then* it is absent. (Today the badge never shows for anyone.)

### 7.4 Card detail modal — `CDM`

| ID | Requirement |
|---|---|
| CDM-1 | Rebuild the modal shell on `components/ui/Modal` with `size="2xl"`, `scrollBehavior="internal"`, `stickyHeader` — inheriting the Radix focus trap, focus restore, `aria-modal` and scroll lock the hand-rolled portal currently lacks. Keep `mode='drawer'` for other callers. |
| CDM-2 | Header left: a **list selector chip** showing the current list name, opening a menu of the sprint's lists. Selecting one issues API-7 and moves the card. |
| CDM-3 | Header right: **Cover** · **Watch** (eye, toggles via API-10) · **overflow `ActionsMenu`** (Copy link · Move · Duplicate · Delete) · **Close**. |
| CDM-4 | A circular **mark-complete** toggle sits left of the title; toggling sets `status` to `COMPLETED` (moving the card to the first `COMPLETED`-mapped list) or back to the previous status. |
| CDM-5 | The right rail becomes a dedicated **Comments and activity** panel with a **Hide details** toggle that hides system activity rows and keeps comments. The toggle state persists per user in `localStorage`. |
| CDM-6 | Each comment gains **Edit**, **Delete** and **Reply** affordances, wired to the already-existing `PATCH`/`DELETE /comments/[commentId]` and the already-supported `parentId`. Edit is inline; delete goes through `ConfirmDialog`. |
| CDM-7 | Only the comment's author, an ADMIN or an EXECUTIVE may edit or delete a comment; enforced **server-side**, with the UI hiding what the user cannot do. |
| CDM-8 | The three dead checklist buttons (`TodoCardModal.tsx:1270-1291`) are wired to the existing item `PATCH` route: set due date (`AppleDatePicker`), assign (`useUsersForSelection`), and an overflow with Rename / Delete / Convert to card. |
| CDM-9 | The label popover gains **rename** and **recolor** (API-11) alongside the existing create/delete/toggle. |
| CDM-10 | Description keeps `MentionEditor` with explicit Save / Cancel and adds a "Formatting help" link to a static help popover. |
| CDM-11 | Closed sprints render the modal read-only: no edits, no comment composer, no drag; the read-only banner is repeated in the modal header. |
| CDM-12 | The existing Link-OKR card, attachments grid, priority/status pills, and member row are preserved unchanged. |

**CDM-AC-1** — *Given* the modal is open, *when* the user presses Tab repeatedly, *then* focus stays
inside the dialog and cycles; *when* they press Escape, *then* the modal closes and focus returns to
the originating card.

**CDM-AC-2** — *Given* a card in "To Do", *when* the user picks "Done" in the list chip, *then* the
card's `columnId` and `status` update in one request, the modal chip reads "Done", and the board
behind it reflects the move without a full refetch flash.

**CDM-AC-3** — *Given* a comment authored by another user, *when* an EMPLOYEE views it, *then* no
Edit/Delete controls render, **and** a direct `PATCH /comments/[commentId]` from that user returns 403.

**CDM-AC-4** — *Given* "Hide details" is on, *when* the rail renders, *then* only `TodoComment` rows
show; *when* the user reloads, *then* the toggle is still on.

**CDM-AC-5** — *Given* a checklist item, *when* the user clicks the calendar button, *then* an
`AppleDatePicker` opens and the chosen date persists to `TodoChecklistItem.dueDate` (today the
button does nothing).

**CDM-AC-6** — *Given* a COMPLETED sprint, *when* a card is opened, *then* every input is disabled,
the composer is absent, and a PATCH attempted directly against the API returns 409 `SPRINT_CLOSED`.

### 7.5 Cover — `CVR`

| ID | Requirement |
|---|---|
| CVR-1 | The Cover popover offers **Size** (Band / Full-bleed), **Colours** (10 swatches), a **colour-blind mode toggle**, and **Remove cover**. |
| CVR-2 | The 10 hardcoded hex values move onto named design tokens; no raw hex in components (CLAUDE.md styling rule). |
| CVR-3 | Colour-blind mode is a **per-user preference** stored in the existing `lib/stores/user-prefs-store` and applied to both cover swatches and label chips board-wide. |
| CVR-4 | In `FULL` mode, title text colour is computed from the cover's luminance to keep ≥4.5:1 contrast. |
| CVR-5 | **Out of scope (D2):** image upload and Unsplash. The "Create a cover image" upsell and the Unsplash grid are **not** rendered. |

**CVR-AC-1** — *Given* a card with no cover, *when* the user picks green + Full-bleed, *then* the
card front shows a full-bleed green cover, the title remains ≥4.5:1 against it, and `coverColor`
plus `coverSize='FULL'` persist across reload.

**CVR-AC-2** — *Given* colour-blind mode is toggled on in one card, *when* the user opens a
different sprint board, *then* patterns are applied there too.

**CVR-AC-3** — *Given* a card with a cover, *when* the user clicks "Remove cover", *then*
`coverColor` becomes null, `coverSize` is cleared, and the card front loses the band with no layout jump.

### 7.6 Dates — `DTE`

| ID | Requirement |
|---|---|
| DTE-1 | The Dates popover is rebuilt on `AppleDateRangePicker` rather than the bespoke `DatesPanel` calendar, gaining presets, min/max handling and the existing Escape/outside-click behaviour. |
| DTE-2 | Independent **Start date** and **Due date** checkboxes: unchecking clears that field; both may be set, or only one. |
| DTE-3 | A **time** control for the due date, persisted to the existing `Todo.endTime` (`HH:mm`, already regex-validated server-side). A start time maps to `startTime`. |
| DTE-4 | **Due-date reminder** select (None / At time / 5 min / 1 hour / 1 day / 2 days before), delivered through `emit()` with `explicitRecipients` = card members + watchers, matching the design's helper text. Requires a new `EventKey` + `EVENT_META` entry and a cron tick. |
| DTE-5 | **Recurring** is specified but **deferred** [A] — it needs a recurrence engine and a generator cron that no module currently has. The control renders disabled with "Coming soon" until then, consistent with how `GenerateSprintModal` disables MANUAL scope. |
| DTE-6 | Validation: due must be ≥ start. Violations block Save with an inline message, never a silent correction. |
| DTE-7 | Dates outside the sprint window are allowed but surface a non-blocking warning: "This is outside the sprint window (Sep 14 – Sep 25)." |
| DTE-8 | **Remove** clears start, due, both times and the reminder in one request. |

**DTE-AC-1** — *Given* start = Sep 14 and due = Sep 25 08:20, *when* saved, *then* the card chip
reads "Sep 14 - Sep 25", `dueDate` and `endTime='08:20'` persist, and the chip tone follows CRD-6.

**DTE-AC-2** — *Given* a start of Sep 20, *when* the user picks a due of Sep 14, *then* Save is
disabled and "Due date must be on or after the start date" shows inline.

**DTE-AC-3** — *Given* a due date of Sep 25 and a reminder of "1 Day before", *when* the cron runs on
Sep 24, *then* exactly one notification per member and watcher is created, and a re-run the same day
creates none (idempotent).

**DTE-AC-4** — *Given* a sprint window Sep 14–25, *when* a due date of Oct 2 is chosen, *then* the
warning shows but Save still succeeds.

### 7.7 Add to card — `ATC`

| ID | Requirement |
|---|---|
| ATC-1 | "+ Add" opens a menu with icon + title + subtitle rows: Labels, Dates, Checklist, Members, Attachment — matching the design's copy. |
| ATC-2 | Selecting a row opens that feature's popover within the existing single-`activePanel` model, so two popovers can never be open at once. |
| ATC-3 | **Custom Fields is hidden** in this phase (D4). The row and its data model are specified for a later phase; nothing ships disabled-but-visible. |
| ATC-4 | Checklist and Attachment remain as separate top-level buttons beside "+ Add", matching the design. |

**ATC-AC-1** — *Given* the modal, *when* "+ Add" is clicked, *then* exactly 5 rows render (no Custom
Fields), each with icon, title and subtitle, and arrow keys move between them.

**ATC-AC-2** — *Given* the Labels popover is open, *when* the user opens Dates from "+ Add", *then*
the Labels popover closes first.

### 7.8 Share card — `SHR` (D3: in-app deep link only)

| ID | Requirement |
|---|---|
| SHR-1 | A **Share** action appears in the card's overflow menu and as a Share button in the board header. It copies `{origin}/dashboard/sprints/{sprintId}?card={todoId}` to the clipboard, using the established `navigator.clipboard.writeText` + toast pattern. |
| SHR-2 | **The Share affordance renders only for an authenticated session.** Because `/dashboard/*` is already gated by `app/dashboard/layout.tsx`, an anonymous visitor never reaches the board — but the control is additionally guarded on `session` so it cannot render in any future unauthenticated embed. |
| SHR-3 | **No token, no public route, no anonymous access is created.** A recipient must sign in and independently pass `canViewSprint`. The link grants nothing on its own. |
| SHR-4 | Opening a board URL with `?card=<id>` auto-opens that card's modal after the board query resolves, then strips the param via `router.replace` so a refresh doesn't reopen it. |
| SHR-5 | If the `card` id does not exist, is not in this sprint, or the viewer lacks permission, the board renders normally and a toast reads "That card isn't available." — the error must **not** disclose whether the card exists. |
| SHR-6 | An unauthenticated recipient is redirected to `/auth/signin` by the existing layout guard and returned to the exact deep link after sign-in (`callbackUrl`). |
| SHR-7 | Each share writes an `ActivityLog` row `TODO_SHARED` with the actor, so sharing is auditable. |
| SHR-8 | Extract a reusable `CopyLinkButton` in `components/shared/` and refactor the ~7 existing ad-hoc clipboard call sites onto it. **[A]** — confirm the refactor of existing call sites is in scope, or whether only the new usage should adopt it. |

**SHR-AC-1** — *Given* a signed-in user viewing a card, *when* they click Share, *then* the clipboard
holds `https://<origin>/dashboard/sprints/<sprintId>?card=<todoId>`, a success toast appears, and an
`ActivityLog` `TODO_SHARED` row exists.

**SHR-AC-2** — *Given* a signed-out visitor opens that URL, *when* the page loads, *then* they are
redirected to `/auth/signin`, and after signing in they land back on the board with the card modal open.

**SHR-AC-3** — *Given* a signed-in user who fails `canViewSprint`, *when* they open the link, *then*
they get the sprint's existing not-found/forbidden handling and **no** card content, title, or
existence signal is leaked in the response body.

**SHR-AC-4** — *Given* the deep link opens a card, *when* the user refreshes, *then* the modal does
not reopen, because the param was stripped.

**SHR-AC-5 (security regression)** — *Given* the whole feature, *when* the codebase is grepped,
*then* no new route exists outside `/dashboard`, no new token column exists, and no handler skips
`withAuth` — asserted by a test.

### 7.9 Floating bar — `FLB`

| ID | Requirement |
|---|---|
| FLB-1 | The bar keeps Inbox / Planner / Board / Switch boards in board context (unchanged). |
| FLB-2 | While a card modal is open, the bar switches to card context. Only **Comments** is implemented — it scrolls/focuses the comment composer. |
| FLB-3 | **Power-ups and Automations are not rendered** (no backing feature), rather than shown inert. |
| FLB-4 | The bar hides entirely below the `useIsMobile()` breakpoint to avoid colliding with the mobile column tabs. |

**FLB-AC-1** — *Given* a card modal is open, *when* the bar renders, *then* it shows only Comments;
*when* the modal closes, *then* the board tabs return with the previous view still selected.

### 7.10 States — `STA`

| ID | Requirement |
|---|---|
| STA-1 | **Loading:** the board renders `SkeletonCard` lanes (3 lists × 3 cards), not the current "Loading sprint…" text — CLAUDE.md mandates skeletons over spinners. The card modal renders a skeleton of its own layout. |
| STA-2 | **Empty board:** `EmptyState` with "This sprint is empty" and a working "Add a card" action that focuses the first list's inline composer. The current no-op `onClick` is a bug to fix. |
| STA-3 | **Empty list:** `EmptyState bare` with "No cards" and a dashed drop target — the drop target must remain even when empty (already handled by the "Drop here" box). |
| STA-4 | **Empty filter result:** distinct from STA-3, per BRD-AC-3. |
| STA-5 | **Success:** every mutation shows a `react-hot-toast` success. Optimistic UI applies to drag, checklist toggle, and label toggle only. |
| STA-6 | **Error:** every failed mutation **rolls back the optimistic state** and shows an error toast carrying the server message. A failed drag returns the card to its origin with a 180ms `ease-apple` transition. |
| STA-7 | **Conflict:** a 409 `SPRINT_CLOSED` shows "This sprint is closed" and triggers a board refetch to resync UI that thinks it is editable. |
| STA-8 | **Offline / network failure:** a single persistent toast, not one per failed request. |

**STA-AC-1** — *Given* a slow network, *when* the board loads, *then* skeleton lanes render within
100ms and no layout shift occurs when real data arrives (CLS < 0.1).

**STA-AC-2** — *Given* a card drag, *when* the reorder request fails, *then* the card visibly returns
to its original list and position, an error toast shows the server message, and a subsequent
`GET /board` confirms the card never moved.

**STA-AC-3** — *Given* another user completes the sprint, *when* this user drags a card, *then* the
409 surfaces "This sprint is closed", the board refetches, and the UI becomes read-only without a reload.

### 7.11 Responsive — `RSP`

| ID | Requirement |
|---|---|
| RSP-1 | ≥1024px: all lists in a horizontal scroller at `w-[272px]` (unchanged). |
| RSP-2 | <768px (`useIsMobile`): the existing single-list tab strip is extended to render **all** dynamic lists in a horizontally scrollable strip, with the active list's count. |
| RSP-3 | <768px: the card modal becomes a full-screen sheet; the comments rail moves **below** the content pane rather than beside it. |
| RSP-4 | All popovers (cover, dates, labels, members, add-to-card) render as bottom sheets on mobile to avoid clipping. |
| RSP-5 | No horizontal page scroll at 375px: lanes scroll inside their own container only. |
| RSP-6 | Touch: HTML5 DnD does not work on touch. Mobile card movement uses the list-selector chip (CDM-2), which must therefore be present on mobile. **[A]** — confirm drag on touch is out of scope for this phase. |

**RSP-AC-1** — *Given* a 375px viewport with 6 lists, *when* the board renders, *then* the tab strip
scrolls horizontally, exactly one list is visible, and `document.body.scrollWidth <= 375`.

**RSP-AC-2** — *Given* a 375px viewport, *when* a card opens, *then* the modal fills the screen and
the comments rail appears below the description, both reachable by vertical scroll.

### 7.12 Accessibility — `A11Y`

The UX guide's §9 floor is currently **not met** in several respects; these requirements close the
gap for the surfaces being touched.

| ID | Requirement |
|---|---|
| A11Y-1 | The card modal inherits the Radix focus trap by moving onto `components/ui/Modal` (CDM-1): focus trapped, restored on close, `role="dialog"`, labelled by the card title. |
| A11Y-2 | **Keyboard card movement** — cards become focusable with `Space` to lift, arrow keys to move between positions and lists, `Space` to drop, `Escape` to cancel. Implemented with the already-installed `@dnd-kit` `KeyboardSensor`, replacing HTML5 DnD on the board. |
| A11Y-3 | An **`aria-live="polite"` announcer** is added (none exists anywhere in the repo) and announces card moves: "Card *X* moved to *In Progress*, position 2 of 7". |
| A11Y-4 | Colour is never the sole carrier of meaning: labels carry patterns (CRD-2) and accessible names; the date chip has text, not just tone; the checklist badge has text, not just green. |
| A11Y-5 | Every icon-only control (cover, watch, overflow, close, list menu, filter) has an `aria-label`. |
| A11Y-6 | **`prefers-reduced-motion`** is honoured: drop animations, modal springs and the status-dot pulse reduce to instant. This requires adding the media query that does not currently exist in `globals.css`. |
| A11Y-7 | Focus rings are visible on every interactive element, including cards and list headers, and are never removed. Reconcile the 3px glow against the guide's 2px/2px mandate and apply one consistently on these surfaces. |
| A11Y-8 | Lists are `role="list"` / cards `role="listitem"`, with the list's accessible name = list name and card count. |
| A11Y-9 | Body text ≥4.5:1 against every board background preset and every cover colour, in both light and dark themes. |

**A11Y-AC-1** — *Given* keyboard-only navigation, *when* the user tabs to a card, presses Space,
presses Right then Down, and presses Space, *then* the card moves to the next list, the change
persists, and the announcer reads the new position.

**A11Y-AC-2** — *Given* the axe-core rule set, *when* it runs on the board and on an open card modal,
*then* there are zero serious or critical violations.

**A11Y-AC-3** — *Given* OS reduced-motion is on, *when* a card is dropped and a modal opens, *then*
no transition animation plays.

**A11Y-AC-4** — *Given* the `graphite` (dark) background preset, *when* contrast is measured on card
titles, list headers and the floating bar, *then* every ratio is ≥4.5:1.

### 7.13 Security — `SEC`

| ID | Requirement |
|---|---|
| SEC-1 | Every new/changed route uses `withAuth`; the two column routes gain the **missing `canEditSprint` check** (API-3/4/5). |
| SEC-2 | Permission is enforced **server-side on every mutation**; the UI hiding a control is never the only gate. |
| SEC-3 | Comment edit/delete is restricted to author, ADMIN or EXECUTIVE, server-side (CDM-7). |
| SEC-4 | The share feature creates **no** new access path (SHR-3, SHR-AC-5). |
| SEC-5 | Not-found and forbidden responses for cards are **indistinguishable**, so a deep link cannot be used to enumerate card ids. |
| SEC-6 | Comment and description HTML continues to be sanitised through the existing DOMPurify allowlist (`components/shared/RichTextContent.tsx`) before any `dangerouslySetInnerHTML`. **This is a pre-existing risk to verify:** `TodoCardModal` currently renders comment HTML directly. |
| SEC-7 | `columnId` in any mutation is validated to belong to the same sprint as the todo, preventing cross-sprint card injection. |
| SEC-8 | All list/card mutations are blocked on closed sprints by the existing `sprintClosedGuard`. |
| SEC-9 | Every mutation writes to `ActivityLog` via `recordActivity()` (project-wide invariant). |

**SEC-AC-1** — *Given* an EMPLOYEE not on a sprint, *when* they call each of `POST /columns`,
`PATCH /columns/[id]`, `DELETE /columns/[id]`, `POST /board/reorder`, `PATCH /todos/[id]`
with `columnId`, *then* every one returns 403 and no row changes.

**SEC-AC-2** — *Given* a `columnId` belonging to a different sprint, *when* it is sent in
`PATCH /api/todos/[id]`, *then* the response is 400 and the todo is unchanged.

**SEC-AC-3** — *Given* a comment containing a `<script>` tag, *when* it renders in the rail, *then*
the script is stripped and does not execute.

### 7.14 Performance — `PRF`

| ID | Requirement |
|---|---|
| PRF-1 | `GET /board` stays a bounded number of queries regardless of list count (one sprint query, one column query, one todo query) — no N+1 per list. |
| PRF-2 | Board interactive in <1.5s p95 with 200 cards across 8 lists. |
| PRF-3 | Drag stays ≥50fps with 200 cards; the existing rAF-throttled indicator and ref-based dedupe are preserved. |
| PRF-4 | Lists with >50 cards virtualise using the already-installed `@tanstack/react-virtual`. |
| PRF-5 | Reorder sends **one** request per drop (API-6), replacing today's two independent requests for a cross-list move. |
| PRF-6 | Label, member and watcher data arrive in the board payload — no per-card fetch. |

**PRF-AC-1** — *Given* a sprint with 8 lists × 25 cards, *when* `GET /board` is profiled, *then* the
SQL query count is ≤4 and does not grow with list count.

**PRF-AC-2** — *Given* 200 cards, *when* a card is dragged across the board, *then* Performance panel
frame time stays ≤20ms and no request fires until drop.

### 7.15 Regression — `REG`

These protect the OKR-specific behaviour that Trello does not have.

| ID | Requirement |
|---|---|
| REG-1 | `aggregates.taskPercent` still counts `status='COMPLETED'` regardless of which list a card sits in — verified across several `COMPLETED`-mapped lists. |
| REG-2 | AI-draft todos (`aiSuggested=true`) remain hidden from the board; `runSprintPlanPipeline` sets `columnId` to the sprint's first `PENDING` list on create, and `/accept` keeps it. |
| REG-3 | `EndSprintModal` + `executeSprintClose` still disposition every incomplete todo. Carryover into the next sprint assigns a `columnId` in the **target** sprint matching the carried status. |
| REG-4 | Backlog moves (`sprintId=null`) also null the `columnId`. |
| REG-5 | `POST /api/sprints/[id]/clone` maps `columnId` through to the cloned sprint's corresponding new column, and keeps copying `coverColor`. |
| REG-6 | Carryover `×N` badges, the sprint report, and `SprintCompletionSummary` outcome chips are unchanged. |
| REG-7 | The desktop companion sync (`?updatedSince=` on `/api/sprints`, `desktop/src/sync/adapters/sprint-adapter.ts`) still round-trips; the new fields are additive. **[A]** — confirm whether the desktop app must ship a matching change in the same release. |
| REG-8 | The three other `TodoCardModal` consumers (`GlobalInitiativeDetail`, `TodosPageClient`, `WorkBoardClient`) continue to work; where there is no sprint context, the list chip and share action are hidden. |
| REG-9 | Sprint state transitions, the `USE_END_ENDPOINT` guard, and read-only closed boards are unchanged. |

**REG-AC-1** — *Given* a sprint with two lists mapped to `COMPLETED` ("Done", "Shipped") holding 3
and 2 cards out of 10, *when* the header renders, *then* it reads "5/10 done (50%)".

**REG-AC-2** — *Given* an AI plan generating 6 todos, *when* the board loads before acceptance,
*then* none of the 6 appear; *when* accepted, *then* all 6 appear in the first `PENDING` list.

**REG-AC-3** — *Given* an ACTIVE sprint with 4 incomplete cards across 3 lists, *when* it is
completed with "all → next", *then* all 4 land in the next sprint with a valid `columnId` in **that**
sprint, and `carryoverCount` increments by 1 each.

**REG-AC-4** — *Given* the full existing test suite, *when* it runs, *then*
`lib/sprints/end-sprint.test.ts` and every other suite passes unchanged.

---

## 8. Gaps, dependencies, assumptions

### 8.1 Gaps to close as part of this work

| Gap | Impact |
|---|---|
| No `Popover` primitive — every popover is hand-rolled | Build `components/ui/Popover.tsx` on Radix (already a dependency) and use it for all 6 new popovers. Without it, the design's popover count triples the hand-rolled code. |
| No `aria-live` region anywhere | Blocks A11Y-3. |
| No `prefers-reduced-motion` handling | Blocks A11Y-6. |
| HTML5 DnD has zero keyboard support | Blocks A11Y-2; fixed by migrating the board to `@dnd-kit` (installed, proven in `GanttChart.tsx`). |
| `ActivityLogPanel` supports only objective / key-result / letter | Either extend it to `todo` or keep the card's hand-rolled feed. Recommend extending, to stop the duplication. |
| Two parallel token systems; `rounded-card` 12px vs `--ap-radius-card` 16px; `shadow-card` vs `--ap-shadow-card`; `ease-apple` vs `--ap-spring` | Pick `--ap-*` for this surface (the board already uses it) and state that choice in `docs/DESIGN_SYSTEM.md`. |
| Focus ring is a 3px glow; the guide mandates 2px + 2px offset | Reconcile before A11Y-7 can be verified. |
| `TodoLabelDef` is **global**, not board- or org-scoped | Trello labels are per-board. Every sprint currently shares one palette. **[A]** — confirm global labels are acceptable, or scope them to sprint/department. |
| `memberIds`/`labelIds` full-array replace | Lost updates when two people edit one card concurrently; API-8/9 fix it. |
| `Todo` has no archive concept | "Archive card" cannot be built; only hard delete. Out of scope here. |

### 8.2 Dependencies

- **DM-2 requires a `preflight.sql` entry** (dropping a unique constraint is not something
  `prisma db push` will do safely against production data).
- DTE-4 requires a new notification `EventKey` + `EVENT_META` entry and a cron tick; there is no
  `SPRINT` event category or sprint `EntityType` today.
- A11Y-2 depends on the `@dnd-kit` migration landing first.
- CDM-1 depends on `components/ui/Modal` gaining an `initialFocus` escape hatch (it has none).

### 8.3 Assumptions requiring confirmation

| # | Assumption |
|---|---|
| A1 | The design's "Backlogs" list is an **in-sprint list**, not the global `sprintId=null` backlog surfaced on the board (LST-9). |
| A2 | Global `TodoLabelDef` is acceptable; labels need not be scoped per sprint. |
| A3 | Loosening `PATCH /api/todo-labels/[id]` from ADMIN-only to sprint-editor is wanted (API-11). |
| A4 | Touch drag is out of scope; mobile card movement goes through the list chip (RSP-6). |
| A5 | Recurring tasks are deferred to a later phase (DTE-5). |
| A6 | The desktop companion app does not need a same-release change (REG-7). |
| A7 | Refactoring the ~7 existing clipboard call sites onto `CopyLinkButton` is in scope (SHR-8). |
| A8 | Star/favourite, board visibility lock, power-ups and automations are permanently out of scope, not merely deferred (BRD-5, FLB-3). |
| A9 | Existing sprints may be migrated in place; no sprint needs to keep the legacy hardcoded-lane behaviour. |

---

## 9. Suggested phasing

1. **Foundations** — `Popover` primitive · `aria-live` announcer · `prefers-reduced-motion` ·
   token reconciliation · fix the Backlog `?noSprint=1` bug · wire the dead watcher badge and the
   dead checklist buttons.
2. **Lists** — DM-1/2/3 + API-1..6 + `LST-*`. Highest risk; ship behind a flag and verify REG-1..5.
3. **Card front** — `CRD-*` + `CVR-*` (labels, patterns, covers, badges).
4. **Card modal** — CDM-1 (Modal migration) first, then CDM-2..12 + `ATC-*` + `DTE-*`.
5. **Share** — `SHR-*` (small, independent; can ship any time after phase 1).
6. **Accessibility & performance** — `@dnd-kit` migration, A11Y-2/3, virtualisation.

---

## 10. Verification

**Automated**
- Unit: `lib/sprints/end-sprint.test.ts` (must stay green), plus new tests for column↔status mapping,
  the `columnId` backfill, and the reorder transaction.
- Integration: each `SEC-AC` as an API test asserting status codes and that no row changed.
- Regression: `REG-AC-1..4` as integration tests over a seeded sprint.
- A11y: axe-core on the board and on an open card modal (A11Y-AC-2).
- Security: a test asserting no route outside `/dashboard` and no handler without `withAuth` (SHR-AC-5).

**Manual**
- Seed a sprint with 8 lists × 25 cards and walk J1–J7 end to end.
- Keyboard-only pass: create a list, move a card between lists, open and close a card — no mouse.
- 375px pass for `RSP-AC-1/2`.
- Deep-link pass: signed out → sign in → card opens → refresh → modal stays closed.
- Dark mode + `graphite` background contrast check (A11Y-AC-4).

**Docs to update after implementation** (per CLAUDE.md): `docs/CHANGELOG_AI.md`,
`docs/FEATURE_STATUS.md`, `docs/SITEMAP.md`, `docs/COMPONENT_CATALOG.md`, `docs/MASTER_REFERENCE.md`.
