# Calendar View and Shared View Switcher — System Requirements

> Status: **SPECIFIED, NOT STARTED.** Owner: TBD. Last updated: 2026-09-25.
>
> **Decisions confirmed by the user 2026-09-25:** A1 (Planner → Calendar + List on the sprint dock),
> A2/A4 (defaults, plus explicit Day/Week/Month switching and back/forward in every mode — CUX-1a),
> A3 (week starts Monday), A6 (apply record scope to the SSR pages, with RBAC verified per role —
> CPM-2/CPM-11), A9 (decided by the coordinator: fix the generator — see
> `docs/recurring_subtasks_REQUIREMENTS.md` REC-FIX). New companion scope: **recurring sub-tasks**
> (`docs/recurring_subtasks_REQUIREMENTS.md`), shown in the calendar per CDT-10a.
>
> Legend: **[V]** verified against code in this repo · **[A]** assumption needing confirmation.
> Every requirement has an ID and Given/When/Then acceptance criteria.
>
> ID prefixes: `VSW` view switcher · `CAL` calendar core · `CUX` calendar UI/UX · `CDT` data and
> date mapping · `CAPI` API · `CPM` permissions · `CVP` performance · `CA11Y` accessibility ·
> `CRG` regression. `CPF-*` and `A11Y-*` are already used by other specs
> (`card_comments_links_board_filter_REQUIREMENTS.md`, `trello_parity_sprint_board_REQUIREMENTS.md`),
> so this spec uses `CVP-*` and `CA11Y-*` to keep IDs unique.
>
> Line numbers are as of 2026-09-25. `SprintBoardClient.tsx` was being edited by other work while
> this was written, so its line numbers will drift. Symbol names are the stable reference.

---

## Context

The request, verbatim: *"for each sprint board, do do board, work board , plans page and other pages
tha tmay need a calander view to allow userst upcomign tasks, items etc lets incldue a calander view
somethign that looks like apple calander on destkop or notion calander first prepare the requirmetn
for this includign the ui/ux and details and note that users need to be abe to toggle the different
views between list view, calander view, kanaban view and otehr views that might be incessary"*

Two things are being asked for:

1. **A calendar view** that looks and behaves like Apple Calendar (macOS) or Notion Calendar, on
   every page that has dated work.
2. **One way to switch views** (List, Board/Kanban, Calendar, and others where they fit) that is
   consistent across those pages.

The app is partway there already. The sprint board has a **Planner** tab that shows one day's hour
grid next to the lanes. The to-dos page has List/Board/Tree tabs, the Plans page has List/Gantt,
and projects have six views. But each page built its own switcher, **none of them remembers the
chosen view in the URL**, and there is no month, week or agenda calendar anywhere for tasks.

**Design decisions (proposed; confirm in §8):**

| # | Decision |
|---|---|
| D1 | **One shared calendar, built in-house on `date-fns` + `@dnd-kit`** (both already installed). No calendar library is added. The existing Planner becomes the first consumer. |
| D2 | **The calendar is a view of the page's data, not a new data source.** It shows the page's filtered rows (or the same visibility rule, applied to a date range). It never shows anything the page's list would not. |
| D3 | **Clicking an event opens the existing `TodoCardModal`** (or the project `ActivityDetailPanel`). The calendar does not get its own detail panel or editor. |
| D4 | **Rescheduling writes through the existing mutation routes** (`PATCH /api/todos/[id]`, `PATCH /api/projects/[id]/activities/schedule`), so every server rule (closed sprint, baseline slip gate, audit, reminder reset) still applies. |
| D5 | **One view-state contract everywhere:** `?view=` in the URL wins, then the remembered choice for that page, then the page default. |
| D6 | **The sprint board's dock stays the sprint board's switcher.** It is restyled data for the shared switcher, not a second switcher. `FloatingDock` is still not built (design refresh §4). |

---

## 1. Current implementation **[V]**

### 1.1 The calendar that already exists: the sprint Planner

`features/sprints/components/SprintPlannerView.tsx` (195 lines) is mounted by `SprintBoardClient`
when `view === 'planner'`. It has a day pane (`PlannerTimeGrid.tsx`, 169 lines) on the left and
compact lanes of `TaskCardTrello` on the right. It reads the board's **filtered** columns, so board
filters already apply to it. That is the right model, and this spec keeps it.

What it does today, and where it falls short:

| Behaviour | Where | Gap |
|---|---|---|
| One day at a time, with prev / Today / next | `SprintPlannerView.tsx:91-115` | No week, month or agenda. The day is `useState`, so it resets on reload. |
| Hour grid fixed to 07:00–21:00, 56 px per hour | `PlannerTimeGrid.tsx:58,66` | An item at 06:00 or 22:00 gets a negative or out-of-range `top` and is clipped. It does not scroll to "now". |
| A todo belongs to the day of `startDate ?? dueDate` | `PlannerTimeGrid.tsx:69-76` | A multi-day card shows only on its start day. |
| Timed only if **both** `startTime` and `endTime` are set | `PlannerTimeGrid.tsx:78-79` | A card with only a due time (`endTime`) shows as all-day, so the deadline time is lost. |
| Overlapping timed items | `PlannerTimeGrid.tsx:152-156` (`left-12 right-2` for all) | They are drawn on top of each other. |
| Red now-line | `PlannerTimeGrid.tsx:82-85,135-143` | Worked out once per render with no timer, so it goes stale. |
| Lane cards are draggable (`onDragStartCard` sets `dataTransfer`) | `SprintBoardClient` → `SprintPlannerView.tsx:175` | **Nothing accepts the drop.** Dragging a card onto the grid does nothing. |
| Status colours from `todoStatusMeta()` | `PlannerTimeGrid.tsx:53-56` | Good. Keep it. |
| Graphite fork (`dark` prop) | both files | Good. Keep it. |

The two **other** calendars in the repo are date pickers, not views:
`components/ui/date-picker.tsx` (`AppleDatePicker`/`AppleDateRangePicker`, an internal
`CalendarGrid` with roving-focus keyboard navigation, **Monday** week start, `:62-67,198-300`) and
the card modal's `DatesPanel` (`components/todos/TodoCardModal.tsx:650+`, hand-rolled grid,
**Sunday** week start). "DTE-1 was implemented by extending the existing calendar" in the Trello
spec means `DatesPanel`, not a calendar view.

`features/scrum` has its own month/week/day/streak calendar (`ScrumHome.tsx`, `GET
/api/scrum/calendar?from&to`). It shows one dot per team member per day, which is a different
thing (S3 of the scrum spec) and is left alone. Its `from`/`to` range API is the precedent this
spec follows.

### 1.2 Page inventory

| Page | Route → component | Views today | View state held in | Dated entities | Data source |
|---|---|---|---|---|---|
| Sprint board | `/dashboard/sprints/[id]` → `SprintBoardClient` | Board · Planner · Inbox (dock) | `useState<SprintBoardView>('board')` (~:329). Not in the URL and not persisted. | Sprint cards; sprint `startDate`/`endDate` | `GET /api/sprints/[id]/board`, TanStack `['sprint-board', id]`. Whole sprint, no row cap. |
| To-dos | `/dashboard/todos` → `components/todos-page/TodosPageClient` | List · Board · Tree (`role="tab"` underline, `:298-320`) | `useState<'list'\|'kanban'\|'tree'>('list')` (`:107`). Not persisted. | Todos | SSR Prisma in `app/dashboard/todos/page.tsx`, `take: 500` (`:70`), then zustand `todo-store` |
| Work Board | `/dashboard/work` → `components/work/WorkBoardClient` | Board only (4 status columns) | — | Todos | SSR Prisma in `app/dashboard/work/page.tsx`, no cap |
| Plans | `/dashboard/plans` → `components/plans/PlansList` | List · Gantt (`APSeg`, `:150`) | `useState<'list'\|'gantt'>('list')` (`:77`) | Objectives (timeframe window); initiatives and KR check-ins sit under them | SSR Prisma plus `GET /api/gantt` (dhtmlx) |
| Project detail | `/dashboard/projects/[id]` → `ProjectViewSwitcher` | Gantt · Table · Board · Workload · Mindmap · Overview | `useProjectViewStore` (zustand `persist`, key `projects.schedule-view` v3) | Activities `currentStart`/`currentEnd`; milestones `currentDate` | Project detail payload |
| My Tasks | `/dashboard/my-tasks` → `features/todos` `MyTasksList` | List | — | Assigned PENDING/IN_PROGRESS todos | SSR Prisma |
| Daily Scrum | `/dashboard/scrum` → `ScrumHome` | Month · Week · Day · Streak · Analytics (Radix Tabs) | `useState('month')` | Scrum updates | `GET /api/scrum/calendar` |

Other pages checked and **not** given a calendar (reasons in §3.2): Sprints list, Travel (DTP),
Letters, Performance cycles, Timeline, Goals.

### 1.3 Date fields **[V]** (`prisma/schema.prisma`)

- **`Todo`** (`:484+`): `startDate DateTime?`, `dueDate DateTime?`, `startTime String?` and
  `endTime String?` (`"HH:mm"` wall-clock, regex-validated in `POST`/`PATCH`), `completedAt`,
  `archivedAt`, `dueReminder`/`dueReminderSentAt`, and recurrence fields `recurrenceRule`
  (`DAILY|WEEKDAYS|WEEKLY|BIWEEKLY|MONTHLY|YEARLY`), `recurrenceEndsAt`, `recurrenceParentId`.
  Indexes exist on `(assigneeId,status)`, `(creatorId,status)`, `(sprintId…)` and
  `(recurrenceRule,dueDate)`. **There is no index led by `dueDate` or `startDate`.**
- **`TodoChecklistItem`**: `startDate`, `dueDate`, `assigneeId`.
- **`Sprint`**: `startDate?`, `endDate?`, `state` (`PLANNING|ACTIVE|COMPLETED|CANCELLED`).
- **`Objective`**: optional `startDate`/`endDate` and a required `timeframe` with start and end.
  **`KeyResult` has no due date**, only `checkInCadence`. `lib/check-in-cadence.ts` already
  exports `nextCheckInDue()`.
- **`Activity`** (project): `baselineStart/End` (frozen), `currentStart/End`. **`Milestone`**:
  `baselineDate`, `currentDate`.
- **`UserPreference`**: only `todoViewMode` and `colorBlindMode`. There is nowhere to store a
  view or calendar preference.

**How dates are handled.** The card modal saves a date as `"YYYY-MM-DD"`, and the server stores
it with `new Date(str)`, which is UTC midnight. Readers take the **local** calendar day of that
instant: `lib/todos/due-tone.ts` (`dueInstant`, `dueTone`) and `parseYmd` in
`TodoCardModal.tsx:518-532` (fixed 2026-09-18 so the badge and the panel agree). A due date with
no `endTime` counts as due at the **end** of its day. `endTime` is the due time. `startTime` is
stored only when a start date is set (`DatesPanel` save).

**Recurrence (DTE-5).** `lib/todos/recurrence-generator.ts` creates each occurrence as its own
`Todo` row (`recurrenceParentId` = head) with a **1-day horizon**. In the same transaction it moves
the **head's `dueDate`** to the last generated date (`:140-143`). It **does not move the head's
`startDate`**. So after a few runs a head with a start date covers a span that keeps growing, and
the head always shares its due day with its newest occurrence.

### 1.4 Visibility: three different rules for the same to-dos **[V]**

| Where | Rule |
|---|---|
| `app/dashboard/todos/page.tsx` (SSR) | ADMIN sees everything. Everyone else: assignee **or** creator **or** KR owner **or** the KR's objective owner **or** objective owner. `take: 500`. No record-scope filter. |
| `GET /api/todos?mine=all` (`app/api/todos/route.ts:44-102`) | assignee **or** creator, **plus** `buildScopeFilter(user,'todo')`. `take: 500`. |
| `app/dashboard/work/page.tsx` (SSR) | ADMIN/EXECUTIVE see everything. Everyone else: assignee **or** creator **or member**. No cap. |

This matters because "the calendar shows what the list shows" can only be tested against one rule.
Two defects follow from the mismatch, and they are **flagged here, not fixed by this spec**, except
where CPM-2 has to fix them:

- `todo-store.fetchTodos()` (`lib/stores/todo-store.ts:59`) refreshes the to-dos page from
  `?mine=all` after mutations. The list **quietly shrinks**: rows the user sees because they own
  the KR or objective disappear, and an ADMIN's "everything" becomes "mine".
- `WorkBoardClient.handleUpdated` (`:137-141`) replaces its rows with `?mine=all` data. That data
  has no `members`, `labels`, `checklists` or `attachments`, and the board filters call
  `t.members.some(...)` and `t.labels.some(...)` on those rows.

**Sprint board.** `GET /api/sprints/[id]/board` and the page route use `withAuth` and check that the
sprint exists, but **neither calls `canViewSprint`** (only `report`, `columns` and `share` do).
The calendar reuses the board's query, so it has the same gate as the board. This is flagged for
the sprint owners; since the user confirmed that roles and permissions must be enforced, CPM-9 now fixes it.

### 1.5 Mutation path and server rules **[V]**

`PATCH /api/todos/[id]` accepts `startDate`, `dueDate`, `startTime`, `endTime`, `dueReminder`,
`recurrenceRule`, `recurrenceEndsAt`, `status`, `columnId`, `sprintPosition`, and others.

- **Write access:** `hasTodoParticipantWriteAccess` (`lib/todos/access.ts`) **or** manages the KR
  **or** role ADMIN/EXECUTIVE/DEPARTMENT_LEAD, **or** DB-RBAC `todo:write` inside its record scope.
- **Closed sprint:** returns 409 `SPRINT_CLOSED` for locked fields (FR-04/CDM-11).
- **Reminder:** `shouldResetReminderSentAt` re-arms the reminder when the due date changes.
- **Audit and realtime:** `recordActivity` runs, and `broadcastSprintEvent(sprintId,
  'task:updated'|'task:moved')` fires.

**No client subscribes to `sprint-${id}`.** The events are broadcast and nothing listens.
**The server does not check that `due ≥ start` or `endTime > startTime`.** DTE-6 is enforced in
`DatesPanel` only.

Project schedule changes go through `PATCH /api/projects/[id]/activities/schedule`. It returns 403
without `slipReason` + `slipOwner` on a baselined project (invariant 2) and records a
`DelayEvent`. The "Record Schedule Slip" dialog lives inside `features/projects`
(`GanttChart.tsx`, `ActivityDetailPanel.tsx`).

### 1.6 Building blocks already available **[V]**

`date-fns@2.30` · `@dnd-kit/core`+`sortable` (used by the project Gantt) · `@tanstack/react-virtual`
· `@tanstack/react-query` · `components/ui/popover.tsx` (Radix, `width`/`variant`) ·
`components/ui/Modal`, `SideDrawer`, `sheet`, `Skeleton*`, `EmptyState`, `ActionsMenu`,
`FilterSelect`, `FilterMultiSelect` (landed 2026-09-25), `tabs.tsx` (Radix) ·
`components/shared/LiveAnnouncer` (`announce()`) · `UserAvatar`/`UserAvatarStack` ·
`lib/todo-status.ts` (`todoStatusMeta`) · `lib/todos/due-tone.ts` · `lib/todos/recurrence.ts`
(`nextOccurrence`, `recurrenceLabel`) · `lib/card-visuals.ts` (`CARD_PALETTE`) ·
`lib/sprint-backgrounds.ts` (`isDarkBackground`) · `hooks/useMediaQuery` (`useIsMobile`) ·
`lib/stores/user-prefs-store.ts` + `/api/user-preferences` · `.ap-segmented` in `globals.css` (now
used by `ThemeSwitcher`) · global `prefers-reduced-motion` handling (`globals.css:1607`) ·
`--ap-danger` for the now-line.

There is no keyboard-shortcut registry and no `?` shortcut sheet. The only global keys are ⌘K
(`CommandPalette.tsx:104`) and Escape handlers.

---

## 2. Conflict check against existing specs **[V]**

| Existing requirement | Relationship |
|---|---|
| Trello parity **FLB-1**: the dock keeps Inbox / Planner / Board / Switch boards, unchanged | **Amended — confirmed by the user (A1).** The dock gains **List**, and **Planner** is renamed **Calendar** so every page uses the same word (`?view=planner` still works as an alias). Order becomes Inbox · Calendar · Board · List · Switch boards. |
| **FLB-4**: the dock is hidden below `md` | Kept. This means mobile has **no view switch at all** today. VSW-7 adds a compact header switcher below `md`, on the sprint board only. |
| **FLB-3 / BRD-5**: unbuilt features are not rendered, rather than rendered inert | Followed. A view that is not available on a page is left out of its switcher, not shown greyed. |
| **BRD-2/BRD-3, AFL-1..9**: one filter model, persisted per sprint (`sprint-filters-${id}`) | Kept. The calendar reads the board's `filteredColumns`, so assignee, linked and future facets apply without change (VSW-5). |
| **DTE-6** (due ≥ start), **DTE-7** (outside-window warning), **DTE-8** (Remove clears all) | Followed. A drag always keeps the start-to-due span, a resize cannot cross the other end, a drop outside the sprint window shows the DTE-7 message as a non-blocking toast, and "Remove dates" follows DTE-8. |
| **DTE-5** recurring | Followed, with the mapping in CDT-9..11. The head-`startDate` defect is flagged (§1.3, A9). |
| **CDM-11 / FR-04**: closed sprints are read-only | Followed. On a closed sprint the calendar has no drag, no resize and no create, and it handles 409 as STA-7 does (CPM-5). |
| **A11Y-2**: keyboard card movement as a parallel path; **A11Y-3**: announcer; **A11Y-6**: reduced motion | Same pattern: keyboard move mode (CA11Y-4) using `@dnd-kit` `KeyboardSensor`, with `announce()`. |
| **PRF-4 / dnd-kit migration pending** for the board | Not blocked by it. The calendar is new code and uses `@dnd-kit` from the start. The board's HTML5 lanes are not touched. The Planner's dead HTML5 drag is replaced by the calendar's own tray (CUX-14). |
| **RSP-6 / A4**: touch drag out of scope on the board | The calendar offers long-press drag on touch through `@dnd-kit` `TouchSensor`, and a "Reschedule…" menu as the non-drag path (A10). |
| `DELIVERY_VIEWS_CLONE_SPEC.md` §6.2: fixed six-tab project bar; **Gantt uses the `CalendarDays` icon** | **Amended in P3 only.** A seventh tab, **Calendar**, is added after Board. Gantt moves to `GanttChartSquare` (the icon Plans already uses) so two tabs do not share an icon. `useProjectViewStore` stays the source of truth. |
| `project_workspace_optimization_requirements.md`: "existing view persistence remains authoritative" | Followed. On projects, `?view=` is read once, written into the existing store, and then stripped. No second store is added. |
| Project invariants **#1** (baseline immutable), **#2** (slip gate), **#10** (audit) | Followed. The project calendar writes only `currentStart/currentEnd`, through the schedule route, after the feature's own slip dialog. On cancel the bar snaps back. |
| Project rule: "The Gantt is a custom React component, do NOT use dhtmlx-gantt" | Not touched. The calendar is not a Gantt. It does not use dhtmlx, and it does not replace the Plans dhtmlx Gantt. |
| `daily_scrum_module_BUILD_SPEC.md` S3 ("The Wall") | Not replaced. It shows one dot per member per day, which is different from task events. Scrum could later use `CalendarToolbar` (optional, not required). |
| Design refresh §4: "Justify primitives by call sites"; do not build `FloatingDock`; adopt `.ap-segmented` | Followed. The switcher has 5 call sites and the calendar has 4, so both qualify. `.ap-segmented` is used instead of new CSS. The dock stays inline in `SprintFloatingBar`. Both `APSeg` copies (`PlansList.tsx:36`, `ReportDashboardClient.tsx:205`) are candidates to fold in. Only the Plans one is in scope. |
| `docs/DESIGN_SYSTEM.md` §12: `--ap-*` on sprint and card surfaces; never mix systems within one component | The shared calendar and switcher use `--ap-*` only, because 3 of 4 hosts are `--ap-*` surfaces. Project-module wrappers keep Tailwind tokens *outside* the calendar component. |
| `TODO_SPRINT_AUDIT_AND_REQUIREMENTS.md` (desktop app) R-06: ⌘⇧1/2/3 for views | Not copied to the web. On macOS, ⌘⇧3/4/5 are system screenshot shortcuts that the browser never receives. See VSW-6. |
| `card_comments…` **AFL-9**: `FilterMultiSelect` | Reused for calendar-page filters. No new filter control. |

---

## 3. Scope

### 3.1 Per-page rollout

| Page | Route | Owner | Views offered (in order) | Default view | Calendar shows | Phase |
|---|---|---|---|---|---|---|
| **To-dos** | `/dashboard/todos` | `components/todos-page` | List · Board · Tree · **Calendar** | List | The page's filtered todos. The Unscheduled tray holds filtered todos with no dates. | **P1** |
| **Sprint board** | `/dashboard/sprints/[id]` | `features/sprints` | Board · **Calendar** (was Planner) · **List** · Inbox (dock only) | Board | The sprint's cards (same as the board: no AI drafts, no archived) plus the sprint-window band. The tray holds undated cards grouped by lane. | Calendar **P1**, List **P2** |
| **Work Board** | `/dashboard/work` | `components/work` | Board · **List** · **Calendar** | Board | Work-board todos (assignee/creator/member; ADMIN/EXEC all) | **P2** |
| **Plans** | `/dashboard/plans` | `components/plans` | List · Gantt · **Calendar** | List | Plan start/end markers, initiative due dates under visible plans, and KR check-in due markers | **P2** |
| **Project detail** | `/dashboard/projects/[id]` | `features/projects` | Gantt · Table · Board · **Calendar** · Workload · Mindmap · Overview | Stored (Gantt) | Activities (`currentStart→currentEnd`, all-day spans) and milestones (`currentDate`) | **P3** |
| **My Tasks** | `/dashboard/my-tasks` | `features/todos` | List · **Calendar** | List | Assigned open todos | **P3** or retire (A12) |
| **My Calendar** (new, optional) | `/dashboard/calendar` | new `features/calendar` | Calendar · List (agenda) | Calendar | Everything the user is on across pages | **P4, open question** (A13) |

**Why Board is not offered on Plans [A]:** a board would group plans by `goalStatus`. Dragging
between columns would then set a status that is meant to come from confidence and check-ins, not
from a drag.

**Why Timeline is not offered on to-dos/work in P1–P3:** Notion's Timeline is a Gantt of tasks.
The project Gantt lives in `features/projects` (features never import features), and Plans uses
dhtmlx. A todo Timeline would be a third Gantt. It is deferred to P4 (A14).

### 3.2 Pages checked and deliberately left without a calendar

| Page | Why not |
|---|---|
| Daily Scrum | It already has a purpose-built month/week/day calendar (S3). |
| Sprints list (`/dashboard/sprints`) | It shows a handful of sprint windows, and each board already shows its own window. A sprint roadmap is a P4 candidate. |
| Travel (DTP) | It has one plan per person per day, an Ethiopian-calendar UI (`lib/dtp/ec-calendar.ts`), and an SLA workflow. It is a candidate for its own later spec. |
| Letters | Letters are documents with one `date`. A calendar would not help anyone find one. |
| Performance cycles | There are a few cycles a year, and the list already shows their periods. |
| Timeline / Goals | Objectives cover whole quarters. In month or week view every cell would carry the same bar. |

---

## 4. Requirements

### 4.1 View switcher — `VSW`

| ID | Requirement |
|---|---|
| VSW-1 | New `components/ui/ViewSwitcher.tsx` (zero business logic): a segmented control on `.ap-segmented`. Props: `views: {key,label,icon,shortcut?}[]`, `value`, `onChange`, `appearance: 'segmented' \| 'underline'` (`underline` keeps the to-dos page's current tab look), `size`, `iconOnlyBelow?: 'md'`. It is a Radix Tabs list (`role="tablist"`/`tab`, arrow-key roving), which fixes the to-dos page's `role="tab"` buttons that have no `tablist` (`TodosPageClient.tsx:300-306`). |
| VSW-2 | **One registry of views** (`lib/views.ts`) with a single label, Lucide icon and order for each view everywhere: `list` List (`List`), `board` Board (`Columns`), `calendar` Calendar (`CalendarDays`), `tree` Tree (`ListTree`), `gantt` Gantt (`GanttChartSquare`), plus the page-specific `inbox`, `table`, `workload`, `mindmap`, `overview`. Each page declares which of these it offers and which is its default (table in §3.1). |
| VSW-3 | New `hooks/useViewPreference(pageKey, { views, default })` returns `[view, setView]`. It resolves the view in this order: **URL `?view=`** (if valid for the page) → the **remembered** value (`localStorage` key `view-pref:${pageKey}`, every access wrapped in try/catch) → the **page default**. An unknown or no-longer-offered value falls back silently. |
| VSW-4 | Changing the view calls `router.replace(?view=…, { scroll:false })`, so views do not fill the Back history and the link can be copied. Other query params (`card`, `open`, `activity`, calendar `mode`/`date`) are kept. The page default is **not** written to the URL, which keeps clean URLs clean. |
| VSW-5 | **Filters, search, grouping and selection belong to the page, not the view.** Switching views never resets them. Every view renders the same filtered set, and the "Showing N of M" counter keeps meaning the same thing. In Calendar, the counter reads "N in view · U unscheduled". |
| VSW-6 | **Shortcuts** (ignored while focus is in an input, textarea, `contenteditable` or an open dialog): `Alt/⌥+1…9` selects the n-th offered view, matched by `event.code` (`Digit1`…) so the ⌥ character layer on macOS does not matter. They are listed in each tab's tooltip ("Calendar ⌥3"). |
| VSW-7 | **Mobile (<768 px):** the switcher shows icons only, each with an `aria-label`, and the page default becomes List for pages whose default is Board [A]. On the sprint board, where the dock is hidden (FLB-4), the same switcher appears in the header. |
| VSW-8 | The sprint board's `SprintFloatingBar` keeps its inline dock look (D6). Its tabs come from the VSW-2 registry, and its state comes from `useViewPreference('sprint')` (one preference for all sprints [A]). `SprintBoardView` becomes `'board' \| 'calendar' \| 'list' \| 'inbox'`, and `'planner'` maps to `'calendar'`. |
| VSW-9 | The project page keeps `useProjectViewStore` as its remembered value (§2). The hook takes an adapter that reads from and writes to that store instead of `localStorage`. `ProjectScheduleView` gains `'calendar'`. A stored value that is not valid falls back to `gantt`. |
| VSW-10 | A view that a page does not offer is **not rendered** (FLB-3). The switcher is hidden entirely when a page offers only one view. |
| VSW-11 | The to-dos page's bespoke tab strip, the `APSeg` view toggle in `PlansList`, and `ProjectViewSwitcher`'s tab row all move onto `ViewSwitcher`. Their look is kept through `appearance`, and the project row keeps its favourite-star affordance as a slot. |

- **VSW-AC-1** — *Given* `/dashboard/todos`, *when* the user picks Calendar, *then* the URL reads
  `?view=calendar`, reloading returns to Calendar, and the status/scope/link filters and the search
  text are unchanged.
- **VSW-AC-2** — *Given* someone opens a link `/dashboard/todos?view=board`, *when* their remembered
  view is Calendar, *then* Board shows, and the remembered value becomes Board.
- **VSW-AC-3** — *Given* `?view=gantt` on the to-dos page (a view it does not offer), *then* the
  remembered or default view shows and no error appears.
- **VSW-AC-4** — *Given* a sprint board at 375 px, *then* a header switcher with Board / Calendar /
  List icons is present and works, and the dock is not.
- **VSW-AC-5** — *Given* focus is in the to-dos search box, *when* ⌥3 is pressed, *then* the view
  does not change. *Given* focus is on the page body, *then* it does.
- **VSW-AC-6** — *Given* a sprint link with `?view=planner`, *then* the Calendar view opens.

### 4.2 Calendar core — `CAL`

| ID | Requirement |
|---|---|
| CAL-1 | New `components/shared/calendar/`: `CalendarView` (shell), `CalendarToolbar`, `MonthGrid`, `TimeGrid` (week, day and 3-day), `AgendaList`, `MiniMonth`, `UnscheduledTray`, `EventChip`, `EventHoverCard`, `QuickCreateComposer`. They are presentational and **controlled**: they do no fetching and hold no domain rules. |
| CAL-2 | The generic input is `CalendarEvent { id; title; kind: 'item'\|'ghost'\|'marker'; start: DateKey; end: DateKey; startTime?; endTime?; allDay; tone; stripe; done; overdue; editable; avatars?; badges?; ariaLabel }`. `DateKey` is `"YYYY-MM-DD"`. Adapters map domain rows to events (CDT). |
| CAL-3 | Pure, unit-tested date logic goes in `lib/calendar/`. `range.ts` computes the visible range for mode + anchor + `weekStartsOn`. `layout.ts` packs all-day lanes and month rows (with a `+N more` count) and splits overlapping timed events into columns. `keys.ts` converts between `DateKey` and local `Date` using the due-tone local-day rule. It uses `date-fns` only. |
| CAL-4 | **Modes:** `month`, `week`, `day`, `agenda`, plus `3day`. `3day` is used automatically in place of `week` between 768 and 1023 px, and it is also available in the mode menu. Week can hide weekends ("Work week"). Year is out of scope. |
| CAL-5 | **Mutations are callbacks** that return a Promise: `onMove(event, {start,end,startTime,endTime,allDay})`, `onResize(...)`, `onCreate(draft)`, `onUnschedule(event)`, `onSchedule(trayItem, target)`, `onToggleDone(event)`, `onOpen(event)`. The calendar keeps an **optimistic override map**. It shows the new position straight away, keeps it when the Promise resolves, and **snaps back with a 180 ms `ease-apple`** transition when it rejects. The host shows the toast. |
| CAL-6 | **Background layers**, in paint order: non-working days, working hours (default 08:00–18:00), an optional `highlightRange` (the sprint window), today, and the now-line. |
| CAL-7 | The mode and the anchor date are **URL state** on the calendar view (`?view=calendar&mode=week&date=2026-09-14`), which makes them deep-linkable. When the URL has neither, the last mode is remembered per page (`cal-pref:${pageKey}`) and the anchor is today. |
| CAL-8 | `editable:false` events cannot be dragged or resized. They still open on click. The host decides `editable` (CPM-3). |
| CAL-9 | The planner is rebuilt on top of the shared core. `PlannerTimeGrid.tsx` is **deleted** once `TimeGrid` covers day mode, and `SprintPlannerView.tsx` becomes the sprint's calendar host. There is never a second calendar implementation. |

- **CAL-AC-1** — *Given* `lib/calendar/layout.ts` is given three timed events 09:00–10:00,
  09:30–11:00 and 10:30–11:00, *then* it returns 2 columns: A in column 0, B in column 1, and C
  back in column 0.
- **CAL-AC-2** — *Given* September 2026 with `weekStartsOn=1`, *then* the month range runs from
  Mon Aug 31 to Sun Oct 11 (42 cells).
- **CAL-AC-3** — *Given* `onMove` rejects, *then* the chip returns to its original slot within
  about 180 ms, and no stale override is left behind.

### 4.3 Calendar UI/UX — `CUX`

The goal is **Apple Calendar's calm grid with Notion Calendar's keyboard speed.** Lots of white
space, hairline rules, a red now-line, colour stripes rather than filled blocks, and every action
reachable from the keyboard.

**Toolbar and shell**

| ID | Requirement |
|---|---|
| CUX-1 | **Toolbar** (54 px, sticky): sidebar toggle · `‹` · **Today** · `›` · a title (`text-section-title`, e.g. "September 2026", "Sep 14 – 20, 2026", "Friday, 25 September 2026") · an optional context chip ("Sprint 14 · Sep 14 – Sep 25") · then, on the right, the **mode segmented control** Day \| Week \| Month \| Agenda (`.ap-segmented`, pills 26 px) · an overflow `ActionsMenu` (Show weekends, Show completed, Colour by, Week starts on, Density). |
| CUX-1a | **Mode switching and stepping (confirmed).** The mode control always offers **Day · Week · Month** (plus Agenda; 3-day replaces Week only at 768–1023 px). `‹` / `›` (and `←`/`→`, `J`/`K`) step by the unit of the current mode: **Day ±1 day · 3-day ±3 days · Week ±1 week · Month ±1 month · Agenda ±1 week** (scrolls the list's start). **Today** returns to the range containing today in the current mode. Switching mode keeps the anchor date (Month → Week on 17 Sep shows the week of 17 Sep, not the month's first week). Clicking a day number in Month or a column header in Week opens Day for that date. Each step updates `?mode=&date=` (CAL-7) so Back/Forward in the browser and copied links reproduce the view. |
| CUX-2 | **Left sidebar** (240 px, collapsible, remembered per page) has three parts. At the top, a **MiniMonth** (it reuses `date-picker.tsx`'s `CalendarGrid`, exported for this, including its keyboard support). It highlights the visible range, shows a dot on days with items, and navigates on click. In the middle, the **Unscheduled** tray (CUX-14). At the bottom, **Show** toggles. Below 1024 px the sidebar becomes a `Sheet` opened from the toggle. |
| CUX-3 | There is no inspector panel. A click opens the host's existing detail surface (D3). |

**Month view**

| ID | Requirement |
|---|---|
| CUX-4 | 7 columns and 5 or 6 week rows filling the viewport height. Weekday headers are short (`MON`, eyebrow style, `--ap-fg-subtle`). Each cell's day number sits top-left. **Today** gets a filled `--ap-accent` circle behind its number, as in Apple Calendar. Days outside the month use `--ap-fg-subtle`, and weekends use `--ap-bg-sunken`. |
| CUX-5 | Multi-day and all-day items are **spanning bars** packed into lanes across the week row. A bar broken by a row end shows a notch or arrow (`◂`/`▸`). Timed items are single-line chips: a dot, the time, then the title. |
| CUX-6 | When a cell overflows, it shows "**+N more**". That opens a `Popover` (`width 268`, heading "Tue 15 Sep") listing every item for the day, with the same keyboard support. Clicking the day number switches to Day view for that date. |

**Week, day and 3-day views**

| ID | Requirement |
|---|---|
| CUX-7 | Column headers show the weekday and date ("TUE 15"). Today's header is accent-tinted. Below the headers is an **all-day lane** that grows up to 4 rows before collapsing into "+N". Then comes the **timed grid**: a 24 h hour gutter (`font-mono`, tabular, "9 AM"), hairline hour rules, lighter half-hour rules, and **48 px per hour** at default density. |
| CUX-8 | **Now-line:** a 1 px `--ap-danger` rule with a 8 px dot at the gutter edge. It is shown on today's column (and faintly across the other columns in week view) and updated **every 60 s from one interval**. |
| CUX-9 | **Auto-scroll** on open and on "Today": to one hour before now, or to 07:30 when now is outside 07:00–20:00. It never scrolls the all-day lane out of view. |
| CUX-10 | Overlapping timed events sit side by side (CAL-3 columns) with a 2 px gap. Events shorter than 30 minutes show the title only. |

**Agenda ("Upcoming") view**

| ID | Requirement |
|---|---|
| CUX-11 | A list grouped by day, starting at **today** with sticky day headers ("TODAY · FRIDAY 25 SEPTEMBER", "TOMORROW", then dates). It shows **Overdue** first, as a collapsible group, when the page's filters include open items. Rows show a time (or "All day"), the chip, the context (sprint / KR link text) and avatars. Empty days are skipped. Loading more: 30 days at a time, with infinite scroll that is virtualised past 100 rows. |
| CUX-12 | Agenda is the **default mode below 768 px**. |

**Events**

| ID | Requirement |
|---|---|
| CUX-13 | **Chip layout:** a 3 px colour stripe on the left (Colour by: **Status** by default, from `todoStatusMeta`; or **Label**, the first label's `CARD_PALETTE` swatch with its colour-blind pattern; or **Sprint** on pages that span sprints). A hollow **completion circle** toggles COMPLETED through the host's existing status mutation. Then the title (1 line in month view, up to 2 lines in the time grid), the time for timed items, and the first avatar plus "+N". **Overdue:** a `--ap-danger-fg` time or date, with an "Overdue" accessible name. **Completed:** strikethrough and 55 % opacity. **Recurring:** a small ↻ glyph. **Ghost** (projected repeat): a dashed border, with no circle. **Read-only:** no grab cursor. The fill is `--ap-bg-raised` with the stripe; a filled tint (`meta.bg`) is used only for timed blocks. |
| CUX-14 | **Unscheduled tray:** the host's items with no start or due date, listed as compact chips, searchable once there are more than 8. On the sprint board they are grouped by lane, replacing the Planner's right-hand lanes. Chips can be dragged onto the grid. Dropping a gridded event onto the tray asks for confirmation and then clears its dates (CDT-13). The empty text is "Everything here has a date." |
| CUX-15 | **Hover card** (400 ms delay, and on focus): title, `#cardNumber`, status pill, date/time range in words ("Mon 14 – Thu 17 Sep"), linked KR/objective, members, checklist `n/m`, and the recurrence label. It uses only fields already in the payload (CPM-7) and makes no request. It never opens on touch. |
| CUX-16 | **Click** calls `onOpen`, which opens `TodoCardModal` (the sprint board passes its `sprintWindow`, so DTE-7 still works). **Right-click, or the ⋯ on focus,** opens an `ActionsMenu`: Open · Reschedule… (Today / Tomorrow / Next Monday / Pick date… with `AppleDatePicker`) · Mark complete · Remove dates · Copy link (`CopyLinkButton`). |

**Direct manipulation**

| ID | Requirement |
|---|---|
| CUX-17 | **Drag to move.** `@dnd-kit` with Pointer (4 px activation), Touch (250 ms long-press) and Keyboard sensors. While dragging, the chip follows the pointer as a `DragOverlay`, the original stays as a 40 % ghost, and the target slot or day is outlined. In the time grid, a live label reads "Thu 17 · 10:15 – 11:15". Moves snap to **15 minutes** in the time grid and to whole days in the month grid and all-day lane. |
| CUX-18 | **Drag between lanes:** dropping a timed event into the all-day lane makes it all-day. Dropping an all-day item into the time grid makes it a 1-hour timed block at the drop slot (CDT-12). |
| CUX-19 | **Resize** (P3): a timed block's bottom edge changes `endTime` and its top edge changes `startTime`. A multi-day bar's left and right ends change `startDate`/`dueDate`. The minimum is 15 minutes or 1 day, and the edge cannot cross the other end (DTE-6). |
| CUX-20 | **Quick create** (P3): click-drag on empty time-grid space, or double-click an empty month cell, draws a draft block and opens an inline **composer** anchored to it (a Popover with a title field; ↵ saves and Esc cancels; "More options" opens the full create flow with the dates filled in). Create uses the host's existing create call (CDT-14). |
| CUX-21 | **Undo:** every successful move, resize, schedule or unschedule shows a toast "Moved to Thu 17 Sep · Undo" for 6 s. Undo writes the previous values back through the same PATCH. |
| CUX-22 | **Sprint window** (sprint board): days outside `startDate…endDate` get a light hatch, and the window's first and last days get a subtle top band that reads "Sprint start"/"Sprint end". A drop outside the window succeeds and shows the DTE-7 warning toast. With no dates set there is no shading. |

**Settings, looks and states**

| ID | Requirement |
|---|---|
| CUX-23 | **Density:** Comfortable (48 px/hour) or Compact (32 px/hour, and 1-line month chips), remembered per user in `localStorage`. **Show weekends** (default on), **Show completed** (default on, but it can only *narrow* the page's filter, never widen it), and **Week starts on** Monday (default — **confirmed**) or Sunday. The week-start choice moves to `UserPreference` in P2 (CDT-16). |
| CUX-24 | **Graphite sprint background:** the calendar takes the `dark` prop that `SprintPlannerView` already threads through. It uses the same translucent pane fills, inverted hairlines, and ink ≥ 4.5:1, and the dock contrast rules apply. |
| CUX-25 | **App dark mode:** only `--ap-*` tokens, which already have dark values. No hex (CLAUDE.md), and no `oklch` literals except the graphite forks copied from `SprintPlannerView`. |
| CUX-26 | **Motion:** page and view switches use a 180 ms fade plus a 4 px rise (UX guide §7). Chips move by transform only, and grid cells never move (§7 "never animate layout"). The snap-back is 180 ms `ease-apple`, and the "+N more" popover uses Radix presence. With `prefers-reduced-motion`, everything is instant (the global rule already covers this). |
| CUX-27 | **Loading:** a skeleton of the current mode appears within 100 ms, with no spinner: 42 cells with 2 shimmer bars each for month, or hour rules plus 3 blocks for week. Real data then replaces it with no layout shift (CLS < 0.1). |
| CUX-28 | **Empty:** a range with no items shows `EmptyState bare` centred over the grid: "Nothing scheduled this week", with actions "Go to next item →" (it jumps to the next dated item in the data) and, where the host allows create, "Add a to-do". Empty because of filters: "No items match your filters" plus "Clear filters", matching BRD-AC-3. |
| CUX-29 | **Errors:** a failed range fetch keeps the last good data and shows an inline banner with Retry. A failed mutation snaps back and shows a toast carrying the server message. 409 `SPRINT_CLOSED` shows "This sprint is closed", refetches, and makes the view read-only (STA-7). |
| CUX-30 | **Keyboard** (active when focus is inside the calendar and not in an input): `T` goes to today; `D` `W` `M` `A` switch mode; `←`/`→` or `J`/`K` move to the previous or next range; `N` opens a quick-create composer for today, or for the focused day (P3); `/` focuses the page search; `?` opens a small shortcut Popover. These match Notion Calendar's single-key scheme. |

**Wireframes** (desktop ≥1280, light)

```
MONTH ─────────────────────────────────────────────────────────────────────────────────────────
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ [◧]  ‹  Today  ›   September 2026                          [ Day │ Week │▐Month▌│ Agenda ] ⋯ │
├──────────────────┬──────────────────────────────────────────────────────────────────────────┤
│  September 2026  │  MON       TUE       WED       THU       FRI       SAT       SUN          │
│  M  T  W  T  F  S│ ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐ │
│     1  2  3  4  5│ │ 31      │ 1       │ 2       │ 3       │ 4       │ 5 ░░░░░ │ 6 ░░░░░ │ │
│  7  8  9 10 11 12│ │         │▌Bid rev │● 10:00 Vendor call│         │         │         │ │
│ 14 15 16 17 18 19│ ├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤ │
│ 21 22 23 24 (25) │ │ 7       │ 8       │ 9       │ 10      │ 11      │ 12 ░░░░ │ 13 ░░░░ │ │
│ ──────────────── │ │▌═══ Site survey  Mon 7 – Thu 10 ════════════▸│         │         │ │
│ UNSCHEDULED   7  │ │▌Draft SOW ↻       │▌Invoice │ +3 more │         │         │         │ │
│ ○ Call Abebe     │ ├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤ │
│ ○ Update deck    │ │ …       │         │         │         │  (25)●  │         │         │ │
│ ○ Review budget  │ │         │         │         │         │▌Q3 rpt ⚠│         │         │ │
│ ──────────────── │ └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘ │
│ SHOW  ☑ Completed│   ▌ = colour stripe   ⚠ = overdue (text + icon)   ↻ = recurring          │
└──────────────────┴──────────────────────────────────────────────────────────────────────────┘

WEEK (sprint board, sprint window Sep 14 – Sep 25 shaded outside) ──────────────────────────────
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ [◧] ‹ Today ›  Sep 21 – 27, 2026   ⟦Sprint 14 · Sep 14 – Sep 25⟧  [ Day │▐Week▌│ Month │ Agenda ] │
├──────┬────────────┬────────────┬────────────┬────────────┬────────────┬─────────┬─────────┤
│      │  MON 21    │  TUE 22    │  WED 23    │  THU 24    │ (FRI 25)   │ SAT 26░ │ SUN 27░ │
│ all- │▌══ QA regression pass ══════════════▸│            │▌Release ✓  │ ░░░░░░░ │ ░░░░░░░ │
│ day  │▌Bid review │            │            │            │            │ ░░░░░░░ │ ░░░░░░░ │
├──────┼────────────┼────────────┼────────────┼────────────┼────────────┼─────────┼─────────┤
│ 9 AM │┌──────────┐│            │            │            │            │ ░░░░░░░ │ ░░░░░░░ │
│      ││▌Standup  ││            │┌─────┬────┐│            │            │ ░░░░░░░ │ ░░░░░░░ │
│10 AM ││ 9:30–10  ││            ││▌Call││▌Rv ││            │            │ ░░░░░░░ │ ░░░░░░░ │
│      │└──────────┘│            │└─────┴────┘│            │            │ ░░░░░░░ │ ░░░░░░░ │
│11 AM ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  (now-line, red)      │
│12 PM │            │            │            │            │ ◆ Due 17:00 Invoice    │         │
└──────┴────────────┴────────────┴────────────┴────────────┴────────────┴─────────┴─────────┘

AGENDA ────────────────────────────────────────────────────────────────────────────────────────
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▾ OVERDUE · 2                                                                               │
│   Wed 23      ○ ▌Submit Q3 report            KR · Grow ARR 20%          (BH)   ⚠ 2 days     │
│ TODAY · FRIDAY 25 SEPTEMBER                                                                 │
│   All day     ○ ▌Release notes               Sprint 14 · In Review      (YA)(+2)           │
│   10:00–11:00 ○ ▌Vendor call ↻               —                           (BH)               │
│ TOMORROW · SATURDAY 26                                                                      │
│   All day     ○ ▌Weekend on-call                                         (MT)               │
│ MONDAY 28 SEPTEMBER                                                                         │
│   17:00       ◆ ▌Due: Budget draft                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

VIEW SWITCHER ─────────────────────────────────────────────────────────────────────────────────
 Page header (segmented):   To-dos                     [ ≡ List │ ▦ Board │ ⌥ Tree │▐▣ Calendar▌]
 To-dos (appearance=underline, today's look):  List   Board   Tree   Calendar
                                                                     ‾‾‾‾‾‾‾‾
 Sprint dock (inline, D6):  ( ✉ Inbox 3 )(▐▣ Calendar▌)( ▦ Board )( ≡ List )( ⊞ Switch boards )
 Mobile < 768 (header):     [ ≡ │ ▦ │▐▣▌]      calendar opens in Agenda mode
```

- **CUX-AC-1a** — *Given* Week mode showing 14–20 Sep 2026, *when* `›` is pressed twice, *then* 28 Sep – 4 Oct shows; *when* the mode is switched to Day, *then* Mon 28 Sep shows; *when* `‹` is pressed, *then* Sun 27 Sep shows; *when* Month is chosen, *then* September 2026 shows; *when* `›` is pressed, *then* October 2026 shows, and the URL reads `?view=calendar&mode=month&date=2026-10-27` (the anchor keeps its day of month, clamped at month end).
- **CUX-AC-1b** — *Given* any mode, *when* Today is pressed, *then* the range containing today shows in the same mode.
- **CUX-AC-1** — *Given* Month view with 7 items on one day and room for 3, *then* the cell shows
  2 items plus "+5 more". Opening it lists all 7, and Escape returns focus to "+5 more".
- **CUX-AC-2** — *Given* Week view at 14:05, *then* the now-line is at 14:05. At 14:06 it has moved
  without a reload, and the grid scrolled to about 13:00 on open.
- **CUX-AC-3** — *Given* an open sprint card dragged from Tue 22 to Mon 28 (outside a window ending
  Sep 25), *then* it saves, the DTE-7 toast shows "This is outside the sprint window (Sep 14 –
  Sep 25).", and Undo puts it back on Tue 22.
- **CUX-AC-4** — *Given* the `graphite` background, *then* the hour labels, headers and chip titles
  all reach ≥ 4.5:1.
- **CUX-AC-5** — *Given* a 375 px viewport, *then* the calendar opens in Agenda, the sidebar is a
  sheet, and `document.body.scrollWidth <= 375`.

### 4.4 Data and date mapping — `CDT`

| ID | Requirement |
|---|---|
| CDT-1 | **Day anchoring:** a stored `DateTime` is placed on its **local calendar day**, using the rule shared by `dueTone`/`parseYmd`. The adapter uses one helper (`lib/calendar/keys.ts`) and never slices ISO strings. |
| CDT-2 | **Todo → event** (adapter `lib/todos/calendar-events.ts`, shared by the to-dos, sprint, work and my-tasks hosts): |

| Todo has | Rendered as |
|---|---|
| no `startDate`, no `dueDate` | **Unscheduled tray**, not on the grid |
| `dueDate` only | all-day on the due day |
| `dueDate` + `endTime`, no start | a **deadline point** at `endTime` on the due day (◆, minimum 24 px, "Due 17:00") |
| `startDate` only | all-day on the start day, labelled "Starts" |
| `startDate` = `dueDate`, no times | all-day, single day |
| `startDate` < `dueDate` | a **spanning all-day bar** from start to due inclusive. Any times show as labels on the first and last segment. |
| `startDate` = `dueDate` + `startTime` + `endTime` (end > start) | a **timed block** from `startTime` to `endTime` |
| `startTime` without `endTime`, same day | a timed block drawn 30 min tall, labelled "from 10:00" (nothing is written) |
| `endTime ≤ startTime`, same day | all-day, with a ⚠ in the hover card ("Times look reversed"). It is not draggable in the time grid. |
| `dueDate < startDate` | a span from due to start, with ⚠. Nothing is ever auto-corrected. |

| ID | Requirement |
|---|---|
| CDT-3 | **Status and state** come from the host's filtered rows. The adapter does not filter anything. `done` = COMPLETED or CANCELLED. `overdue` = `isOverdue(dueDate, {endTime, done})`. |
| CDT-4 | **Tone and stripe:** Status uses `todoStatusMeta(status)`, Label uses the first label's `CARD_PALETTE` swatch (and its pattern when `colorBlindMode` is on), and Sprint uses a stable hash of the sprint id mapped onto `CARD_PALETTE`. There are no new colour tokens. |
| CDT-5 | **Sprint window:** `highlightRange = {sprint.startDate, sprint.endDate}` when both are set. |
| CDT-6 | **Plans adapter** (P2): each visible plan becomes two `marker` events, "▶ Plan starts" and "■ Plan ends" (objective `startDate ?? timeframe.startDate`, and `endDate ?? timeframe.endDate`). There are no spanning bars unless the user turns on "Show plan spans". Initiatives (todos linked to the plan's KRs) use CDT-2. KR check-ins become `marker` events on `nextCheckInDue(cadence, lastCheckInAt ?? updatedAt)`, labelled "Check-in due · {KR}" and read-only. |
| CDT-7 | **Project adapter** (P3, inside `features/projects`): activities are all-day spans `currentStart → currentEnd`, with the tone from the `project-status-*` tokens. Milestones are `marker` events on `currentDate`. There is no time grid for projects: modes are Month, Week (all-day lanes only) and Agenda. |
| CDT-8 | **Occurrences** (`recurrenceParentId` set) are ordinary cards: they can be dragged and completed, and moving one moves only that one. |
| CDT-9 | A **series head** (`recurrenceRule` set) is drawn **on its `dueDate` only**; its `startDate` is ignored for spanning until REC-FIX-1 ships (the generator does not move it today, §1.3); after the fix it spans normally. If a visible occurrence has the same local due day, **the occurrence is drawn and the head is hidden** on that day. The head is **not draggable** in the calendar ("Edit the repeat in the card"), because its `dueDate` is the generator's cursor [A9]. |
| CDT-10 | **Projected repeats:** for each visible head, future dates after its `dueDate` up to the end of the visible range (and `recurrenceEndsAt`) are worked out with `nextOccurrence()` and drawn as **ghost** events. They are capped at 62 per series per range. They are read-only, and clicking one opens the head. There is a toggle, "Show future repeats" (default on). |
| CDT-10a | **Recurring sub-tasks** (`docs/recurring_subtasks_REQUIREMENTS.md`): tasks already generated from a sub-task are ordinary cards (CDT-2/CDT-8). Each active recurring sub-task also projects its future occurrences in the visible range as **ghost** events, exactly like CDT-10 (dashed, read-only, capped, "Show future repeats" toggle), labelled with the sub-task title and "↻ from {parent card}". Clicking a ghost opens the parent card scrolled to its Recurring sub-tasks section. |
| CDT-11 | Ghosts are never counted in "N in view" and never appear in the Unscheduled tray. |
| CDT-12 | **What rescheduling writes.** One `PATCH /api/todos/[id]` per gesture, sending **only** the fields listed. Dates go as `"YYYY-MM-DD"` and times as `"HH:mm"`, exactly as `DatesPanel` sends them: |

| Gesture | PATCH body |
|---|---|
| Move an all-day single item (due only) to day D | `{ dueDate: D }` |
| Move a "Starts" item (start only) to D | `{ startDate: D }` |
| Move a span by Δ days | `{ startDate: start+Δ, dueDate: due+Δ }` (the span is kept) |
| Move a timed block to day D, time T (duration kept) | `{ startDate: D, dueDate: D, startTime: T, endTime: T+dur }` |
| Move a deadline point to D, T | `{ dueDate: D, endTime: T }` |
| Timed → all-day lane on D | `{ startDate: D, dueDate: D, startTime: null, endTime: null }` |
| All-day → time grid at D, T | `{ startDate: D, dueDate: D, startTime: T, endTime: T+60m }` |
| Resize a timed block's top or bottom | `{ startTime }` or `{ endTime }` |
| Resize a span's start or end | `{ startDate }` or `{ dueDate }` |
| Tray → month or all-day D | `{ dueDate: D }` |
| Tray → time grid D, T | `{ startDate: D, dueDate: D, startTime: T, endTime: T+60m }` |
| Grid → tray ("Remove dates", confirmed) | `{ startDate: null, dueDate: null, startTime: null, endTime: null, dueReminder: null }` (DTE-8) |

| ID | Requirement |
|---|---|
| CDT-13 | Moving across a DST or month boundary uses `date-fns` calendar-day maths (`addDays`, `differenceInCalendarDays`), never ms arithmetic. The reminder re-arm stays with the server (`shouldResetReminderSentAt`). |
| CDT-14 | **Quick create** (P3) calls `POST /api/todos` with the draft's dates or times plus the host's context. Sprint board: `sprintId` + the first PENDING lane's `columnId` (the same as `AddTaskInline`). To-dos page: `assigneeId = me` **when the scope filter is "Assigned to me"**, so the new card does not vanish at once. If the created item still does not match the active filters, a toast says "Created — hidden by your filters" with a **Show** action that clears them. |
| CDT-15 | **Project writes** (P3): a moved or resized activity calls `PATCH /api/projects/[id]/activities/schedule` with `currentStart/currentEnd`. On a baselined project the gesture first opens the feature's existing **Record Schedule Slip** dialog. Nothing is saved until reason + owner are given, and Cancel snaps the bar back (invariant 2). Milestones are read-only in the calendar. |
| CDT-16 | **Preferences** (P2): `UserPreference` gains `weekStartsOn Int @default(1)` and `viewPrefs Json?` (`{ [pageKey]: { view, calMode, density, showWeekends } }`). Both are additive, so `prisma db push` is enough. `useViewPreference` and the calendar read and write them through `user-prefs-store`, with `localStorage` as the offline cache. `DatesPanel` and `AppleDatePicker` both follow `weekStartsOn`, which ends today's Sunday/Monday mismatch [A]. |

- **CDT-AC-1** — *Given* a card with start Sep 14 and due Sep 17, no times, *then* one bar spans Mon
  14 to Thu 17. *When* it is dragged 7 days right, *then* one PATCH is sent,
  `{startDate:"2026-09-21", dueDate:"2026-09-24"}`.
- **CDT-AC-2** — *Given* a card with only `dueDate` Sep 25 and `endTime` 17:00, *then* week view
  shows a ◆ point at 17:00 on Fri 25, and it is not in the all-day lane.
- **CDT-AC-3** — *Given* a weekly head whose generator has run twice, *then* no day shows both the
  head and an occurrence, the head is not spread across weeks, and dashed ghosts show the following
  weeks.
- **CDT-AC-4** — *Given* a baselined project, *when* an activity bar is dragged and the slip dialog is
  cancelled, *then* no request is sent and the bar is back in place.
- **CDT-AC-5** — *Given* the to-dos page filtered to "Assigned to me", *when* a quick-created card is
  saved, *then* it has `assigneeId = me` and stays visible.

### 4.5 API — `CAPI`

| ID | Requirement |
|---|---|
| CAPI-1 | **Sprint board and project pages: no new endpoint.** The calendar uses the payload already loaded (`['sprint-board', id]`, which covers the whole sprint, and the project detail). |
| CAPI-2 | New `GET /api/todos/calendar?surface=todos\|work\|mine&from=YYYY-MM-DD&to=YYYY-MM-DD[&unscheduled=1][&q=][&status=][&assignees=a,b][&linked=]` with `withAuth` and the standard envelope `{ success, data: CalendarTodo[] }`. It is a thin route over `lib/todos/calendar-query.ts`. A separate route is justified because `GET /api/todos` has a different visibility rule (§1.4), returns the full relation include, and caps at 500 with no range. |
| CAPI-3 | **Range semantics:** a row is returned when `(startDate ?? dueDate) ≤ to` **and** `(dueDate ?? startDate) ≥ from`. The server widens by ±1 day to cover time-zone anchoring, and the client trims to CDT-1 local days. `from ≤ to` and a span of ≤ 93 days are required (400 otherwise). `unscheduled=1` instead returns rows with neither date, newest `updatedAt` first, with `limit ≤ 100` and cursor pagination (`pagination` in the envelope). |
| CAPI-4 | **Projection:** `id, cardNumber, title, status, priority, startDate, dueDate, startTime, endTime, completedAt, archivedAt, recurrenceRule, recurrenceEndsAt, recurrenceParentId, coverColor, sprintId, sprint{ id,name,state,startDate,endDate }, keyResult{ id,title }, objective{ id,title }, assignee, members[user], labels[labelDef], checklist counts, canEdit`. Series heads for projected repeats (CDT-10) are included when their next occurrence falls in the range, even if their own dates do not. **Recurring sub-tasks (CDT-10a):** the response also carries `recurringSubtasks: { id, parentTodoId, parentTitle, title, rule, nextDueDate, startTime, endTime, recurrenceEndsAt, paused, assignee }[]` for active sub-tasks on parent cards the viewer can see whose next date falls on or before `to` — enough to project ghosts client-side with `nextOccurrence()`; generated tasks carry `recurringSubtaskId` (see `docs/recurring_subtasks_REQUIREMENTS.md`). |
| CAPI-5 | **TanStack Query keys:** `['todo-calendar', surface, from, to, filterHash]` with `staleTime` 60 s and `placeholderData: keepPreviousData`, and the previous and next ranges prefetched. Any todo mutation (calendar or not) invalidates `['todo-calendar']`. The sprint calendar updates `['sprint-board', id]` optimistically with `setQueryData` and rolls back on error. |
| CAPI-6 | **Realtime (P3):** the sprint board subscribes to `sprint-${id}` (`task:*` events already broadcast) and invalidates `['sprint-board', id]`, which updates the board and calendar together. It must do nothing when Pusher is unconfigured or has placeholder credentials. |
| CAPI-7 | **Plans (P2):** `GET /api/plans/calendar?from&to` returns plan markers, initiatives and check-in markers, using the Plans role scoping (the same `where` as `app/dashboard/plans/page.tsx` and `/api/gantt`), extracted to one shared builder. |

- **CAPI-AC-1** — *Given* `from=2026-09-01&to=2026-09-30`, *then* a card spanning Aug 28 – Sep 2 is
  returned and a card due Oct 1 is not.
- **CAPI-AC-2** — *Given* `from=2026-01-01&to=2026-12-31`, *then* the response is 400 "Range too
  large".
- **CAPI-AC-3** — *Given* the calendar request for any range, *then* the SQL query count is ≤ 4 and
  does not grow with the number of rows.

### 4.6 Permissions — `CPM`

| ID | Requirement |
|---|---|
| CPM-1 | **Parity:** for any user, filters and range, the calendar's items are a **subset of what that page's list would show without its row cap.** It never uses a broader query than its host. |
| CPM-2 | **One visibility builder per surface:** new `lib/todos/visibility.ts` exports `todoVisibilityWhere(session, surface)` for `todos` (the current SSR rule), `work` (the current work SSR rule) and `mine`. `app/dashboard/todos/page.tsx`, `app/dashboard/work/page.tsx`, `todo-store.fetchTodos()`, `WorkBoardClient.handleUpdated` and `CAPI-2` **all call it**. This fixes both defects in §1.4 and is a **prerequisite for P1**. **Confirmed (A6):** every surface also applies `buildScopeFilter(user, 'todo')`, so the SSR pages, the refresh path and the calendar all honour record-scope rules. |
| CPM-3 | **`canEdit` per row** comes from the same rule `PATCH /api/todos/[id]` enforces, extracted from the route into `lib/todos/access.ts` `canWriteTodo()`. It is computed in a **bounded** number of queries (one RBAC resolve and one scoped id-query per request, never per row). `editable = canEdit && !closedSprint && kind==='item' && !isSeriesHead`. |
| CPM-4 | **The server stays the only real gate.** No route loosens. A 403 snaps the event back with "You can't change this card's dates". A 409 follows CUX-29. |
| CPM-5 | **Closed sprint** (COMPLETED/CANCELLED): the whole calendar is read-only, just like the board. Chips still open the modal in its read-only mode (CDM-11). |
| CPM-6 | Quick create is offered only where the host already offers create: the board composer (hidden on closed sprints) and the to-dos create modal. `POST /api/todos` still checks KR edit rights for KR-linked cards. |
| CPM-7 | Hover cards and agenda rows show **only fields already in the list payload**. The calendar never fetches detail on hover. |
| CPM-8 | The calendar is **never** rendered under `/portal` (project invariant 4). The project calendar's hover card has no assignee names, because it only runs inside the internal workspace anyway. |
| CPM-9 | **In scope (changed with A6):** `GET /api/sprints/[id]/board` and the sprint page route call `canViewSprint` like `report`, `columns` and `share` already do; a user who may not view the sprint gets 403 / the not-found page, not the board or its calendar. Covered by the CPM-11 role matrix. |
| CPM-10 | Record-scope rules (`RecordScopeRule`) keep their effect: the calendar endpoint applies `buildScopeFilter` exactly as its surface's list does after CPM-2. |

| CPM-11 | **RBAC verified, not assumed (confirmed with A6).** Before P1 ships: (a) a role-matrix integration test seeds ADMIN, EXECUTIVE, DEPARTMENT_LEAD (own dept + another dept), EMPLOYEE (assignee / member / KR owner / unrelated), a CLIENT_PORTAL user, and one `RecordScopeRule`, and asserts for each surface (`todos`, `work`, `mine`, calendar endpoint, sprint board) exactly which card ids are returned and which PATCHes succeed; (b) doctype/feature gates from `lib/rbac.ts` / `lib/permissions.ts` that already guard these pages are applied to the new endpoint too (a user without the to-dos feature gets 403, not an empty calendar); (c) **pre-deploy diff:** a script lists, per user, rows visible today but hidden after scope is applied, so the change is reviewed rather than discovered — release notes name it. |

- **CPM-AC-1** — *Given* an EMPLOYEE who owns KR "Grow ARR" and a todo under it assigned to someone
  else, *then* the todo appears in the to-dos list **and** in its calendar, and it is still there
  after completing any other card (no shrink after refresh).
- **CPM-AC-2** — *Given* a user who is neither participant nor manager of a card, *then* its chip
  has no grab cursor. *When* a forged PATCH is sent anyway, *then* it gets 403 and nothing changes.
- **CPM-AC-3** — *Given* a COMPLETED sprint, *then* no chip can be dragged, and the composer and the
  "Remove dates" menu item are absent.
- **CPM-AC-4** — *Given* a test that compares the ids from `/api/todos/calendar?surface=todos` over
  one month with the SSR list's ids filtered to that month for 5 seeded roles, *then* the calendar
  set ⊆ the list set for every role.
- **CPM-AC-5** — *Given* a `RecordScopeRule` limiting an EMPLOYEE to their department's to-dos, *then* the to-dos list, its calendar and a refresh after an edit all return the same set, and none contain another department's card.
- **CPM-AC-6** — *Given* the role matrix of CPM-11, *then* every role sees exactly the expected ids on every surface, and every forbidden PATCH returns 403 with no change.

### 4.7 Performance — `CVP`

| ID | Requirement |
|---|---|
| CVP-1 | Only the **visible range** (plus a prefetch of the ranges on each side) is fetched on range-based hosts. The sprint board uses its one existing payload. |
| CVP-2 | **Budget:** Month view with 500 events and Week view with 200 timed events are interactive in < 200 ms p95 on a 2019-class laptop. Layout runs in `useMemo` keyed on events + range + mode, and it is O(n log n). |
| CVP-3 | Drag is ≥ 50 fps with 500 events. Pointer moves change only the overlay transform and the target outline. Layout re-runs once, on drop. |
| CVP-4 | Agenda and the Unscheduled tray are virtualised with `@tanstack/react-virtual` beyond 100 rows. |
| CVP-5 | Range navigation is debounced by 150 ms (holding `→`), and there is one request per settled range. |
| CVP-6 | One 60 s interval per mounted calendar drives the now-line. There is no per-event timer. |
| CVP-7 | DB: add `@@index([dueDate])` and `@@index([startDate])` on `Todo` (additive, `db push`) so range filters do not scan. |
| CVP-8 | The calendar bundle is loaded with `next/dynamic` when the Calendar view is first chosen, so pages that open in List or Board do not pay for it. |

- **CVP-AC-1** — *Given* 500 seeded todos in September, *when* Month view renders, *then* the
  Performance panel shows the scripting + layout of the first render under 200 ms.
- **CVP-AC-2** — *Given* holding `→` for 2 s in Week view, *then* at most 2 range requests are sent.

### 4.8 Accessibility — `CA11Y`

| ID | Requirement |
|---|---|
| CA11Y-1 | **Month:** the grid is `role="grid"` labelled with the month, with `row` and `columnheader` roles. Each day is a `gridcell` labelled "Tuesday 15 September 2026, 3 items, today". There is **one tab stop** (roving `tabindex`, reusing `CalendarGrid`'s logic). ←/→/↑/↓ move by day or week, Home/End go to the start or end of the week, PageUp/PageDown change month, Enter goes into the day's events, and Esc comes back out to the cell. |
| CA11Y-2 | **Week/Day:** each day column is a labelled `group`. Events are `button`s in time order, each labelled "Vendor call, 10:00 to 11:00, Thursday 17 September, In progress, assigned to Biruk Hailu, overdue" (the words are there, not just the colour). Tab order is all-day first, then by time. |
| CA11Y-3 | **Agenda** is a real `list` with `listitem` rows and `h3` day headers. It is the complete non-visual equivalent of the other modes. |
| CA11Y-4 | **Keyboard rescheduling** (the non-drag path, parallel to pointer drag, A11Y-2 precedent): on a focused event, Space lifts it. ←/→ then move a day, ↑/↓ move 15 min (time grid) or a week (month), Shift+↑/↓ change the end (resize, P3), Space/Enter drops, and Esc cancels. Each step is announced with `announce()`, e.g. "Vendor call, Thursday 17 September, 10:15 to 11:15", and the drop is announced as "Moved to …". The "Reschedule…" menu (CUX-16) is also available. |
| CA11Y-5 | Toolbar: Prev and Next have `aria-label`s that name the range ("Previous week"). The title is an `h2`. A range change announces "Week of 21 September 2026, 12 items" politely. |
| CA11Y-6 | Colour is never the only signal: overdue gets text and an icon, done gets strikethrough and its accessible name, recurring gets ↻ with "repeats weekly", and label colours get patterns when `colorBlindMode` is on. |
| CA11Y-7 | Focus rings use `.ap-focus-ring` (DESIGN_SYSTEM §12) on every chip, cell and control. After the modal closes, focus returns to the chip that opened it. |
| CA11Y-8 | Contrast is ≥ 4.5:1 for chip titles, hour labels and headers, on light, dark and graphite. Now-line colour is decorative, and "now" is announced through the today cell's label. |
| CA11Y-9 | Touch targets are ≥ 32 px (the design's control height) on mobile Agenda rows and chips. |

- **CA11Y-AC-1** — *Given* keyboard-only use, *when* the user tabs into Month, presses →→, Enter, Tab to
  a chip, Space, →, Space, *then* the card moves one day later, the change persists, and the
  announcer read the new date.
- **CA11Y-AC-2** — *Given* axe-core on Month, Week and Agenda for the to-dos and sprint hosts, *then*
  there are zero serious or critical violations.
- **CA11Y-AC-3** — *Given* reduced motion, *when* a move is dropped or rolled back, *then* nothing
  animates.

### 4.9 Regression — `CRG`

| ID | Requirement |
|---|---|
| CRG-1 | The sprint board's Board view, its HTML5 and keyboard card movement, lanes, filters (`sprint-filters-${id}`), `?card=` deep link, Inbox and Switch boards behave exactly as before. |
| CRG-2 | The to-dos page keeps its `?open=` deep link, the Board/Tree behaviour, `sortOrder` reorder and the create modal. Its tab look is unchanged (`appearance="underline"`). |
| CRG-3 | Projects: the Gantt, Table, Board, Workload, Mindmap and Overview, favourites, and `projects.schedule-view` persistence all work unchanged. The Gantt is still the custom component. |
| CRG-4 | Plans: the dhtmlx Gantt view and the List are unchanged apart from the switcher control. |
| CRG-5 | No `Todo` field changes except the two indexes, so desktop companion sync (`?updatedSince=`) keeps round-tripping (REG-7). |
| CRG-6 | `TodoCardModal`'s other consumers (`GlobalInitiativeDetail`, `WorkBoardClient`) are unaffected. The calendar calls the modal as-is. |
| CRG-7 | `lib/todos/*.test.ts` (due-tone, recurrence, reminders) and `lib/sprints/end-sprint.test.ts` pass unchanged. |

---

## 5. Reuse audit **[V]**

| Need | Reused | New (the gap it fills) |
|---|---|---|
| Date maths | `date-fns@2.30` | `lib/calendar/{range,layout,keys}.ts` for pure range, packing and anchoring logic. Nothing in the repo does event layout. |
| Drag and drop, including keyboard and touch | `@dnd-kit/core` (proven in `GanttChart.tsx`) | — (**no new dependency**) |
| Calendar library? | Rejected: **FullCalendar** (≈100 kB+, its own DnD that clashes with `@dnd-kit`, heavy CSS overrides to reach `--ap-*` and graphite, advanced views paid), **react-big-calendar** (a localizer layer, HTML5-only DnD, weak grid a11y), **dhtmlx scheduler** (commercial, and the dhtmlx line is barred from the project module). The existing Planner shows the in-house approach works. | — |
| Mini month + grid keyboard support | `components/ui/date-picker.tsx` `CalendarGrid` | Export it (with a `weekStartsOn` prop) instead of writing a fourth month grid. |
| Day/time grid | `PlannerTimeGrid.tsx` (pattern and tokens) | `components/shared/calendar/TimeGrid` replaces it and **deletes the original** (CAL-9). |
| Segmented control | `.ap-segmented`, Radix `tabs.tsx` | `components/ui/ViewSwitcher.tsx`. Every existing switcher is bespoke (4 of them, plus 2 `APSeg` copies). |
| View-state persistence | `useSearchParams`/`router.replace` pattern (sprint `?card=`), `user-prefs-store`, `useProjectViewStore` | `hooks/useViewPreference.ts`. No shared URL+memory view hook exists. |
| Detail surface | `TodoCardModal`, `ActivityDetailPanel` | — |
| Popovers, menus, sheets, empty and loading states | `Popover`, `ActionsMenu`, `Sheet`/`SideDrawer`, `EmptyState`, `Skeleton` | — |
| Status, due and recurrence semantics | `todoStatusMeta`, `dueTone`/`isOverdue`, `nextOccurrence`/`recurrenceLabel`, `nextCheckInDue` | `lib/todos/calendar-events.ts`, the todo → event adapter |
| Colours and patterns | `CARD_PALETTE`, `--ap-card-*`, `project-status-*` tokens, `isDarkBackground` | — (no new tokens) |
| Avatars | `UserAvatar`/`UserAvatarStack` | — |
| Filters | Each page's existing filters, `FilterMultiSelect` | — |
| Announcements | `announce()` | — |
| Reschedule date pick | `AppleDatePicker` | — |
| Copy link | `CopyLinkButton` | — |
| Virtualisation | `@tanstack/react-virtual` | — |
| Todo visibility | Three inline Prisma `where`s | `lib/todos/visibility.ts` (CPM-2): a single source of truth |
| Write-permission check | Inline in `PATCH /api/todos/[id]` | `canWriteTodo()` in `lib/todos/access.ts` (CPM-3), extracted rather than copied |
| Range fetch | Scrum's `from`/`to` precedent, `withAuth`, envelope | `GET /api/todos/calendar` (+ `lib/todos/calendar-query.ts`), and `GET /api/plans/calendar` in P2 |
| Table for List views on the work board and sprint | `TodoTableRow` inside `TodosPageClient.tsx` | Extract it to `components/todos/TodoTable.tsx` (P2) so three hosts share one table |

---

## 6. Phasing

| Phase | Contents | Exit check |
|---|---|---|
| **P0 — Prerequisites** | CPM-2 visibility builder with `buildScopeFilter` on every surface (fixes the to-dos shrink and the work-board refresh shape), CPM-9 `canViewSprint` on the board route/page, CPM-11 role-matrix test + pre-deploy visibility diff, `canWriteTodo()` extraction, CVP-7 indexes, `CalendarGrid` export with Monday `weekStartsOn`, REC-FIX-1/2 generator fixes | CPM-AC-1, CPM-AC-5, CPM-AC-6; work board survives a card edit; diff reviewed before deploy |
| **P1 — Switcher + calendar on To-dos and the sprint board** | VSW-1..11 (all current switchers migrated), CAL-1..9, `lib/calendar/*` with tests; Month/Week/Day/3-day/Agenda; toolbar, sidebar, mini month, Unscheduled tray; chips, hover card, click-to-open, context menu, **drag to move** + tray scheduling + keyboard move + Undo; sprint window; graphite; skeleton/empty/error; CAPI-2..5 for the to-dos host; the sprint Planner becomes Calendar and `PlannerTimeGrid` is deleted | VSW-AC, CAL-AC, CUX-AC-1..5, CDT-AC-1..3, CPM-AC-2..4, CA11Y-AC-1..3 |
| **P2 — Work Board, Plans, List views, preferences** | Work Board Board/List/Calendar; sprint List view; `TodoTable` extraction; Plans Calendar (CDT-6, CAPI-7); CDT-16 prefs in `UserPreference` (week start, remembered across devices); colour by Label/Sprint | Work and plans parity tests; week start honoured by `DatesPanel` too |
| **P3 — Power editing + more hosts** | CUX-19 resize, CUX-20 quick create + composer (CDT-14), drag to the tray (unschedule), checklist items toggle, CAPI-6 realtime, Project Calendar view (CDT-7, CDT-15), My Tasks (or retire it) | CDT-AC-4..5; slip-gate test |
| **P4 — Open questions** | `/dashboard/calendar` "My Calendar" aggregate, todo Timeline view, Ethiopian-calendar secondary labels, holidays, an ICS feed for external calendars, a sprint roadmap on the sprints list | Each needs its own go-ahead |

---

## 7. Verification

**Automated:** unit tests for `lib/calendar/*` (ranges for both week starts, DST weeks, month
packing, overlap columns, `+N`), the CDT-2 mapping table (one case per row), and the CDT-12 write
table (one case per gesture). An integration test for CPM-AC-4 parity across roles. API tests for
CAPI-AC-1..3. A regression test: `PATCH` from the calendar on a closed sprint returns 409 and
nothing changes. axe-core for CA11Y-AC-2.

**Manual:** keyboard-only pass (move a card a week, open it, close it, focus returns). Checks at
375, 834 and 1512 px. Graphite plus app dark mode. Reduced motion. Seed 500 todos and profile
Month. Drag a sprint card outside the window and use Undo. Check a weekly recurring card after two
generator runs.

**Docs to update when this is built** (CLAUDE.md): `CHANGELOG_AI.md`, `FEATURE_STATUS.md`,
`COMPONENT_CATALOG.md` (ViewSwitcher, calendar components, useViewPreference), `SITEMAP.md` (only
if `/dashboard/calendar` ships), `MASTER_REFERENCE.md`, and amendment notes in the Trello-parity
spec (FLB-1) and `DELIVERY_VIEWS_CLONE_SPEC.md` §6.2.

---

## 8. Assumptions and open questions

| # | Assumption / question |
|---|---|
| A1 | **Confirmed:** rename **Planner → Calendar** and add **List** on the sprint dock (amends FLB-1). `?view=planner` stays as an alias. |
| A2 | **Confirmed.** The page defaults in §3.1 are right (to-dos List, sprint Board, work Board, plans List), and so is the per-page remembered choice (one preference for all sprints, not one per sprint). |
| A3 | **Confirmed.** **Monday** is the default first day of the week (Ethiopian work week; `AppleDatePicker` already uses it). `DatesPanel` switches from Sunday to follow the preference. |
| A4 | **Confirmed**, with explicit Day/Week/Month switching and per-mode back/forward (CUX-1a): Week on the sprint board, Month on to-dos and the work board, Agenda on mobile. |
| A5 | The rows the calendar shows are those of the page's existing filters. "Show completed" in the calendar can only narrow the page filter, never widen it. |
| A6 | **Confirmed:** the SSR to-dos and work pages also apply `buildScopeFilter`, with the RBAC role matrix and pre-deploy diff of CPM-11 so nobody silently loses rows. |
| A7 | Plans calendar content is plan start/end markers, initiatives and KR check-in due markers, with no Board view on Plans. |
| A8 | Projects get a Calendar tab (P3), with Gantt's icon changed to `GanttChartSquare`. |
| A9 | **Decided:** series heads stay non-draggable in the calendar, and the generator is fixed to advance the head's `startDate` with its `dueDate` and to shift checklist-item dates onto each occurrence (REC-FIX-1/2 in `docs/recurring_subtasks_REQUIREMENTS.md`). |
| A10 | Long-press drag on touch is wanted in the calendar, unlike the board (RSP-6). |
| A11 | View shortcuts are ⌥1…9, and calendar keys are single letters (T/D/W/M/A, ←/→, J/K). |
| A12 | `/dashboard/my-tasks` gets a Calendar (P3), or it is retired in favour of `/dashboard/todos?view=calendar` with scope "Assigned to me". |
| A13 | A unified **My Calendar** page (`/dashboard/calendar`, everything I'm on across sprints, to-dos, checklist items, project activities, KR check-ins and trips) is wanted as P4. |
| A14 | A todo **Timeline** (Gantt of to-dos) is not needed before P4. |
| A15 | All times are shown in the browser's local time zone, and `startTime`/`endTime` are wall-clock with no conversion. The existing date-only UTC storage is fine for users east of UTC (Addis Ababa, UTC+3). West-of-UTC users would see off-by-one days everywhere in the app, not only here, and that is out of scope. |
| A16 | Showing Ethiopian-calendar day numbers as secondary labels (as Letters/DTP do via `kenat`) is a P4 option, not a requirement. |
