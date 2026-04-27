# Apple Pro Rollout — Audit & Status

**Last updated:** 2026-04-27 (post-Sprints v2 all 4 phases + mobile kanban)
**Scope:** Status of the Apple Pro design system rollout + Sprints v2 unified-task migration.
**Reference docs:**
- `docs/apple_pro_token.md` — token reference
- `docs/apple_pro_ux_guide.md` — page anatomy + behavior
- `docs/CRON.md` — VPS cron schedule

---

## TL;DR — Everything shipped

| Area | Status |
|------|--------|
| Foundation (tokens, typography, body class, theme switcher, motion tokens) | ✅ Complete |
| Sidebar + Topbar (with global search + ⌘K) | ✅ Complete |
| Cmd-K palette + topbar search + quick-action wiring (incl. Check-in with KR picker) | ✅ Complete |
| To-dos page + Trello card modal (Activity tab + comment attachments) | ✅ Complete |
| Objective detail (Risks + Viewers + real confidence) | ✅ Complete |
| Key Result detail (Risks + Viewers + numeric confidence slider) | ✅ Complete |
| Work Board kanban | ✅ Complete |
| Dashboard + Analytics | ✅ Complete |
| OKR Hierarchy (card-tree with SVG connectors) | ✅ Complete |
| All OKRs (compact/rich, filters, sort, bulk-select) | ✅ Complete |
| Sprints v2 (Phase 1-4: schema → migration → UI swap → lifecycle/realtime/notifs) | ✅ Complete |
| Listings (My/Company/Dept/Archived OKRs) | ✅ Complete |
| Reports / Goals / Plans / Initiative-Report client interiors | ✅ Complete |
| Notifications / Comments / Activity | ✅ Complete |
| Auth pages (signin/signup/forgot/reset) | ✅ Complete |
| Profile (redirects to org/users/[id] which has rich UI) | ✅ Complete via redirect |
| Settings (full subroutes layout: account/notifications/teams/timeframes/users/etc.) | ✅ Real pages exist |
| Motion polish + EmptyState rollout + skeleton loaders | ✅ Complete |
| Print styles for reports | ✅ Complete |
| Mobile single-column sprint kanban | ✅ Complete (this commit) |
| Theme-aware toasts (`AppleToaster`) | ✅ Complete |

---

## Sprints v2 — Phased rollout (all 4 phases shipped)

### Phase 1: Schema + API foundation (commit `0f6da03`)
- `Sprint`: `state`, `goal`, `goalLabel/Target/Current/Unit`, `departmentId`, `participants` M2M, `reflectionNote`, `endedAt/By`
- `Todo`: `sprintId` + `taskType` with `[sprintId,status]` index
- `SprintParticipant`, `ActivityLog.sprintId`
- 7 new ActivityActions (SPRINT_*, INITIATIVE_SPRINT_CHANGED, INITIATIVE_TASK_TYPE_CHANGED)
- API: `POST/PATCH /api/sprints` (extended), `POST /api/sprints/[id]/end`, `/clone`, `/active`, `/api/cron/sprint-tick`
- `GET/PATCH /api/todos` accept `sprintId`/`taskType`
- Permission helpers: `canCreateSprint/Edit/Delete/View`
- Idempotent preflight SQL

### Phase 2: Data migration (commit `b7f9486`)
- Idempotent SQL block: `SprintActivity` → `Todo` with status derived from column name
- Tracking table `sprint_activity_migration` prevents re-migration
- `SprintActivityComment` → `TodoComment` with dedup
- `SprintActivity` table preserved for rollback through 2026-05-11
- `GET /api/sprints/[id]/board` Todo-shaped read shim
- `GET /api/cron/sprint-migration-check` ops health check

### Phase 3: UI swap (commit `2e210a0`)
- `SprintBoardClient` reads `/api/sprints/[id]/board` (Todo single-source-of-truth)
- 3-column kanban (PENDING/IN_PROGRESS/COMPLETED) with drag-drop → PATCH `/api/todos/[id]`
- `TodoCardModal` reused as right-side drawer (480px slide-in)
- Inline `AddTaskInline` form with cascading `LinkToOkrPopover` (objectives → KRs)
- `EndSprintModal`: per-task or batch incomplete handling + reflection note
- Sprint create extended: goal/department/participants/state
- `AddToSprintDropdown` (active filled dot, planning empty dot, "no sprint" option)
- `SprintsListClient` 4 tabs (Active / Planning / Backlog / Completed) + dual progress cards
- `BacklogList` with bulk-move
- KR detail initiatives sprint-aware

### Phase 4: Lifecycle + realtime + notifications (commit `2e210a0`)
- `/api/cron/sprint-tick` (hourly): auto Planning→Active + lifecycle notifications
- `/api/cron/sprint-deadlines` (daily 09:00): TODO_DUE_SOON / OVERDUE
- `Sprint.startNotifiedAt/endNotifiedAt/endingSoonNotifiedAt` for dedup
- 7 notification events: `SPRINT_TASK_ASSIGNED`, `SPRINT_STARTING_TOMORROW`, `SPRINT_ENDING_SOON`, `SPRINT_ENDED_BY_USER`, `INITIATIVE_CARRIED_OVER`, `TODO_DUE_*`, `OVERDUE`
- Email templates for each notification type
- Pusher channel `sprint-{id}` with `task:created/updated/moved/deleted`, `goal:updated`, `participants:changed`
- `middleware.ts` marks legacy `SprintActivity` routes deprecated (sunset 2026-05-11)
- `docs/CRON.md` + `scripts/install-crontab.sh` document VPS cron install

### Mobile kanban (this commit)
- `useMediaQuery` / `useIsMobile` shared hook
- `SprintBoardClient`: tab switcher above grid on `<lg`, columns hide except active
- Drawer (TodoCardModal) already responsive (`w-full max-w-[480px]`)

---

## 1. Foundation

### ✅ Done
- [x] Apple Pro CSS variables in `app/globals.css` (light + dark)
- [x] Shadcn tokens overridden inside `.theme-apple-full`
- [x] Body wrapped via theme switcher
- [x] Semantic color aliases
- [x] SF Pro stack, `-0.01em` tracking, 13px body
- [x] Radii scale (10/14/16/22px), shadow tokens, glass utility
- [x] Theme switcher persisted to localStorage
- [x] Motion tokens + utilities (`ap-hover-lift`, `ap-focus-ring`, `ap-modal-enter`)

---

## 2. Layout chrome

### ✅ Done
- [x] Sidebar (220 / 52px), Topbar (48px glass)
- [x] Global search input (280×32) with ⌘K kbd badge
- [x] Cmd-K palette + `/api/search` role-aware
- [x] Cmd-K Quick Actions: Create Objective / Todo / Sprint / Check-in (with KR picker)

---

## 3. To-dos / Initiatives

### ✅ Done
- [x] To-dos list (List/Board/Tree) — Cmd-K wired
- [x] `CreateTodoModal`, `TodoCardModal` (Trello-style with Activity tab + comment attachments)
- [x] `MentionEditor` (Tiptap) + @mention notifications + email
- [x] Work Board kanban
- [x] Schema: TodoMember/Label/Checklist/ChecklistItem/Attachment/Comment

---

## 4. Objective detail page

### ✅ Done
- [x] CriticalBanner, ObjectiveHero, KRList, WorkItemsKanban, ProgressConfidenceCard, PerKrProgressCard
- [x] ActivityTabs: Details / Activity / Risks / Viewers (all real data)
- [x] `Objective.confidence` real field
- [x] `useViewTracker` fires on mount

---

## 5. Key Result detail page

### ✅ Done
- [x] Hero, Quick check-in bar (slider 0-100), CheckInTimeline, Initiatives, WorkItemsKanban
- [x] KrProgressConfidenceCard, KrInspectorTabs (Details/Check-ins/Activity/Risks/Viewers)
- [x] Numeric `confidenceScore` (0-100) with preflight backfill
- [x] Sprint column in initiatives section
- [x] `useViewTracker` fires on mount

---

## 6. Other pages — all complete

- [x] Dashboard, Analytics
- [x] OKR Hierarchy (card-tree, SVG connectors, search, keyboard nav)
- [x] All OKRs (compact/rich, filters, sort, bulk-select)
- [x] Sprints (list + board + burndown sidebar + 4 tabs + backlog + end flow)
- [x] My / Company / Department / Archived Objectives
- [x] Progress + Progress-Report + Initiative-Report (with Print buttons)
- [x] Reports / Goals / Plans (client interiors rebuilt)
- [x] Timeline + Alignment Map (header)
- [x] Notifications (All / Unread / Mentions tabs)
- [x] Comments + Activity feeds
- [x] Auth: signin / signup / forgot-password / reset-password
- [x] Profile (redirects to rich `org/users/[id]`)
- [x] Settings (full subroutes layout)

---

## 7. Schema / Backend

### ✅ Done
- [x] Trello card model (TodoMember/Label/Checklist/ChecklistItem/Attachment/Comment)
- [x] `Objective.confidence Int @default(50)`
- [x] `KeyResultCheckIn.confidenceScore Int @default(50)` + preflight backfill
- [x] `Risk` model + 4 ActivityAction enums
- [x] `Sprint` v2 fields, `SprintParticipant`, `ActivityLog.sprintId`
- [x] `Todo.sprintId`, `Todo.taskType`
- [x] 7+ Sprint ActivityActions
- [x] `withAuth` wrapper used consistently
- [x] Standard response envelope `{ success, data, error }`
- [x] `/api/search` role-aware
- [x] `/api/views` endpoints
- [x] `/api/sprints/[id]/board` Todo-shaped read endpoint
- [x] `/api/cron/sprint-tick`, `/sprint-deadlines`, `/sprint-migration-check`
- [x] Pusher channel `sprint-{id}` with 6 broadcast types

---

## 8. Cross-cutting / Polish

### ✅ Done
- [x] Cmd-K palette + topbar search + Quick Actions
- [x] Theme-aware toasts (`AppleToaster`)
- [x] Skeleton loaders + `loading.tsx` boundaries
- [x] Motion tokens + utilities (broad rollout: KPIs, listings, modals)
- [x] Shared `EmptyState` component (used in todos/work/risks/check-ins/listings/notifications)
- [x] `StatusPill` / `PaceChip` / `LevelBadge` shared
- [x] Print styles for reports
- [x] Mobile responsive (sprint kanban tab switcher; modals/drawers full-width on mobile)

---

## 9. Deployment / Operational

### ✅ Done
- [x] CI + Deploy to VPS pipeline
- [x] `prisma db push` on deploy with idempotent preflight SQL (Sprint v2 schema + data migration + KR confidence backfill)
- [x] PM2 zero-downtime reload
- [x] Nginx caching strategy
- [x] Cron infrastructure (`docs/CRON.md` + `scripts/install-crontab.sh`)

### ⚠️ Future infrastructure (not blocking)
- [ ] Staging environment (every push currently → production)
- [ ] Automated visual-regression tests
- [ ] **2026-05-11**: drop `SprintActivity*` tables after soak (preflight cleanup block, operator uncomments)

---

## 10. File map

| Concern | Path |
|---|---|
| Tokens (CSS) | `app/globals.css` |
| Tokens (TS) | `lib/design/apple-pro-tokens.ts` |
| Theme store | `lib/stores/theme-store.ts` |
| Theme switcher | `components/layout/ThemeSwitcher.tsx` |
| Sidebar / Topbar | `components/layout/{Sidebar,Header}.tsx` |
| Cmd-K | `components/cmdk/CommandPalette.tsx` + `lib/stores/cmdk-store.ts` + `CmdkActionListener.tsx` |
| Search API | `app/api/search/route.ts` |
| Toasts | `components/layout/AppleToaster.tsx` |
| Skeletons | `components/ui/Skeleton.tsx` + `app/dashboard/(*)/loading.tsx` |
| EmptyState | `components/ui/EmptyState.tsx` |
| Status primitives | `components/shared/StatusPill.tsx` |
| Mobile hook | `hooks/useMediaQuery.ts` |
| Dashboard / Analytics | `components/dashboard/{AppleDashboard,AppleAnalytics}.tsx` |
| Objective detail | `app/dashboard/objectives/[id]/page.tsx` + `components/objective-detail/*` |
| KR detail | `features/key-results/components/KeyResultDetailClient.tsx` + `components/key-result-detail/*` |
| Listings | `features/objectives/components/{NestedObjectivesList,OKRLevelView}.tsx` |
| Sprint board (v2) | `features/sprints/components/SprintBoardClient.tsx` |
| Sprint list | `features/sprints/components/SprintsListClient.tsx` |
| Sprint pieces | `components/sprints/{EndSprintModal,LinkToOkrPopover,AddToSprintDropdown}.tsx` |
| Sprint API | `app/api/sprints/[id]/{route,board,end,clone}.ts` + `/active` |
| Sprint cron | `app/api/cron/{sprint-tick,sprint-deadlines,sprint-migration-check}/route.ts` |
| Pusher | `lib/pusher.ts` |
| Risks | `components/shared/RisksPanel.tsx` + `app/api/risks/*` |
| Viewers | `components/shared/ViewersList.tsx` + `hooks/useViewTracker.ts` |
| Auth pages | `app/auth/{signin,signup,forgot-password,reset-password}/page.tsx` |
| Crontab | `docs/CRON.md` + `scripts/install-crontab.sh` |
| Migration tracker | `prisma/schema.prisma` (sprint_activity_migration table in preflight.sql) |
| Deprecation gate | `middleware.ts` |

---

*Apple Pro rollout + Sprints v2 unified-task migration: complete.*
