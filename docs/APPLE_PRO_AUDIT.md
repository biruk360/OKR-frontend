# Apple Pro Rollout — Audit & Status

**Last updated:** 2026-04-27 (post-Reports/Auth/Viewers/Motion batch)
**Scope:** Status of the Apple Pro design system rollout across the OKR Management System (Next.js 14, Tailwind 3, shadcn-style tokens).
**Reference docs:**
- `docs/apple_pro_token.md` — token reference
- `docs/apple_pro_ux_guide.md` — page anatomy + behavior

---

## TL;DR

| Area | Status |
|------|--------|
| Foundation (tokens, typography, body class, theme switcher, motion tokens) | ✅ Complete |
| Sidebar + Topbar (with global search + ⌘K) | ✅ Complete |
| Cmd-K palette + topbar search + quick-action wiring | ✅ Complete (check-in only navigates) |
| To-dos page + Trello card modal | ✅ Complete |
| Objective detail page (incl. Risks + Viewers) | ✅ Complete |
| Key Result detail page (incl. Risks + Viewers + numeric confidence) | ✅ Complete |
| Work Board kanban | ✅ Complete |
| Dashboard | ✅ Complete |
| Analytics | ✅ Complete |
| OKR Hierarchy (interior) | ✅ Complete (card-tree with SVG connectors) |
| All OKRs (interior) | ✅ Complete (compact/rich, filters, sort, bulk-select) |
| Sprints (list + board + burndown sidebar) | ✅ Complete |
| Listings (My/Company/Dept/Archived OKRs) | ✅ Complete |
| Risks tab (Objective + KR) | ✅ Complete |
| Viewers tab (Objective + KR) | ✅ Complete (using existing ObjectiveView/KeyResultView models) |
| Numeric KR check-in confidence | ✅ Complete (slider, 0-100, preflight backfilled) |
| Theme-aware toasts + skeleton loaders | ✅ Complete |
| Reports / Progress / Progress-Report / Timeline | ✅ Page wrappers; client interiors of Reports/Goals/Plans/InitiativeReport not restyled |
| Notifications / Comments / Activity | ✅ Complete |
| Auth pages (signin/signup/forgot/reset) | ✅ Complete |
| Motion tokens (spring/ease/durations + utilities) | ✅ Tokens + utilities defined; broad surface-by-surface application pending |
| Empty-state component | ✅ Component upgraded; broad rollout to consumers pending |
| Print styles for reports | ❌ Not applied |
| Admin / Profile / Settings / Org | ⚠️ Stubs/redirects; no real pages exist |
| Cmd-K "Check in" full modal (currently only navigates) | ❌ Skipped (contextual; needs KR picker) |

---

## 1. Foundation

### ✅ Done
- [x] Apple Pro CSS variables in `app/globals.css` under `.apple-pro-surface` / `.theme-apple-full` (light + dark)
- [x] Shadcn tokens overridden inside `.theme-apple-full` so existing components render iOS palette
- [x] Body wrapped via theme switcher
- [x] Semantic color aliases (`--ap-red`, `--ap-green`, `--ap-orange`, `--ap-fg-secondary`)
- [x] SF Pro stack, `-0.01em` tracking, 13px body
- [x] Radii scale: 10/14/16/22px
- [x] Shadow tokens (sm/md/lg/card)
- [x] Glass utility (`.ap-glass`)
- [x] Theme switcher persisted to localStorage
- [x] **Motion tokens**: `--ap-spring`, `--ap-ease-out`, `--ap-duration-fast/base/slow`
- [x] **Motion utilities**: `.ap-hover-lift`, `.ap-focus-ring`, `.ap-modal-enter`
- [x] **Global focus-ring** for inputs/buttons/selects under `.theme-apple-full`

### ❌ Missing
- [ ] Broad sweep applying `.ap-hover-lift` / `.ap-modal-enter` across all listing rows, KPI cards, modals (currently only used in `ViewersList`)

---

## 2. Layout chrome

### ✅ Done
- [x] Sidebar (220 / 52px), glass, AP borders
- [x] Topbar (48px), glass, sticky, theme switcher
- [x] Global search input (280×32) with ⌘K kbd badge
- [x] Cmd-K palette (`cmdk` package) — Pages + Quick Actions + debounced search
- [x] `/api/search` role-aware endpoint
- [x] Cmd-K Quick Actions wired (Create Objective / Todo / Sprint via `create-intent-store` + `CmdkActionListener`)

### ❌ Missing
- [ ] Cmd-K **Check in** action only navigates to `/dashboard/my-okrs`; no app-wide check-in modal (would need KR picker)

---

## 3. To-dos / Initiatives

### ✅ Done
- [x] To-dos list page (List/Board/Tree views) — **Cmd-K wired** to open create modal
- [x] `CreateTodoModal`, `TodoCardModal` (Trello-style), `MentionEditor`
- [x] @mention notifications + email
- [x] Work Board kanban
- [x] Schema: TodoMember/Label/Checklist/ChecklistItem/Attachment/Comment

### ❌ Missing
- [ ] WYSIWYG attachment in comments
- [ ] Activity feed inside `TodoCardModal`
- [ ] EmptyState rollout to per-column "No items"

---

## 4. Objective detail page

### ✅ Done
- [x] CriticalBanner, ObjectiveHero, KRList, WorkItemsKanban, ProgressConfidenceCard, PerKrProgressCard
- [x] ActivityTabs: Details / Activity / **Risks** ✅ / **Viewers** ✅ (real data)
- [x] `Objective.confidence` real field
- [x] Dead components removed
- [x] `useViewTracker` fires on mount

---

## 5. Key Result detail page

### ✅ Done
- [x] Hero, Quick check-in bar (slider 0-100), CheckInTimeline, Initiatives list, WorkItemsKanban
- [x] KrProgressConfidenceCard, KrInspectorTabs (Details / Check-ins / Activity / **Risks** ✅ / **Viewers** ✅)
- [x] **Numeric `confidenceScore` field** (0-100) with preflight backfill
- [x] `useViewTracker` fires on mount

### ❌ Missing
- [ ] Orphaned `features/key-results/components/CreateCheckInModal.tsx` still imports old `KeyResultProgressChart.tsx` — can't delete the chart yet without rewiring the modal

---

## 6. Other pages

### ✅ Done
- [x] **Dashboard, Analytics**
- [x] **OKR Hierarchy** — full card-tree rebuild with SVG L-connectors, search, keyboard nav
- [x] **All OKRs** — full rebuild with compact/rich toggle, filters, sort, bulk-select
- [x] **Sprints list + Sprint board** with burndown sidebar (`SprintBurndownCard` + `SprintMembersCard`)
- [x] **My / Company / Department / Archived Objectives** via `NestedObjectivesList` rewrite
- [x] **Progress** + **Progress-Report** + **Timeline** (header)
- [x] **Notifications** (All / Unread / Mentions tabs)
- [x] **Comments** + **Activity** feeds
- [x] **Auth pages**: signin / signup / forgot-password / reset-password (centered AP card, max 420px)

### ⚠️ Partial
- [ ] **Reports / Goals / Plans / Initiative-Report** — route files are thin server wrappers delegating to `ReportDashboardClient`, `GoalsPageClient`, `PlansList`, `InitiativeReportClient`. Page hero is AP-correct; the heavy client interiors are not rebuilt. Each is a substantial standalone task.
- [ ] **Alignment Map** — header bar minimal; the OKRHierarchy canvas (pan/zoom) intentionally untouched

### ❌ Missing
- [ ] **Profile** + **Settings** are 5–9 line redirect stubs to other routes; no real page yet
- [ ] **Admin / Org / Users** routes don't exist in this project

---

## 7. Schema / Backend

### ✅ Done
- [x] Trello card model (TodoMember/Label/Checklist/ChecklistItem/Attachment/Comment)
- [x] `Objective.confidence Int @default(50)`
- [x] `KeyResultCheckIn.confidenceScore Int @default(50)` + preflight backfill
- [x] `Risk` model + 4 ActivityAction enums
- [x] `withAuth` wrapper used consistently
- [x] Standard response envelope `{ success, data, error }`
- [x] `/api/search` role-aware endpoint
- [x] `/api/views` endpoints (POST upsert, GET viewers list) using existing `ObjectiveView`/`KeyResultView` models
- [x] No Objective check-in route — confidence flows through Edit modal PUT

### ❌ Missing
- [ ] No dedicated polymorphic `ViewLog` (built on existing per-entity view models instead — equivalent functionality)

---

## 8. Cross-cutting / Polish

### ✅ Done
- [x] Cmd-K palette + topbar search + Quick Actions wiring
- [x] Theme-aware toasts (`AppleToaster`)
- [x] Skeleton loaders + `loading.tsx` boundaries on Dashboard/Objectives/Analytics
- [x] Motion tokens + utilities defined
- [x] Shared `EmptyState` component upgraded
- [x] `StatusPill` / `PaceChip` / `LevelBadge` extracted to `components/shared/StatusPill.tsx`

### ❌ Missing
- [ ] Broad rollout of `.ap-hover-lift` / `.ap-modal-enter` to all KPI cards, listing rows, modals
- [ ] EmptyState consumer rollout (to-dos column-empty, work board, KR check-in timeline, risks panel, listings empty filter)
- [ ] **Print styles** for reports
- [ ] Modal sheet transitions beyond simple fade (some now use `ap-modal-enter`; not all)

---

## 9. Deployment / Operational

### ✅ Done
- [x] CI + Deploy to VPS pipeline
- [x] `prisma db push` on deploy with preflight SQL (idempotent backfill for `confidenceScore`)
- [x] PM2 zero-downtime reload
- [x] Nginx caching (immutable static, no-cache HTML)

### ❌ Missing
- [ ] No staging environment (every push → production)
- [ ] No automated visual-regression tests

---

## 10. Recommended next batch (priority order)

1. **EmptyState + motion-utility broad rollout** — small high-value polish; touch ~15 components to add `ap-hover-lift` / replace bare "No items" with `<EmptyState>`
2. **Reports / Goals / Plans / Initiative-Report client interiors** — the last big unrebuilt clients
3. **Print styles** for reports
4. **CreateCheckInModal cleanup** — remove dependency on `KeyResultProgressChart`, then delete the orphan
5. **Admin / Profile / Settings real pages** — currently redirect stubs; if the product needs these, build them in AP from scratch
6. **Cmd-K Check-in** — KR picker → context-aware open of `CreateCheckInModal`
7. **Staging environment + visual-regression tests** — quality infrastructure
8. **TodoCardModal**: WYSIWYG attachment in comments + Activity tab content

---

## 11. CI status snapshot (latest 6 runs)

| Run | Status | Commit |
|---|---|---|
| 24979720719 | in_progress | feat(theme): rebuild Reports/Auth/... `0d22324` |
| 24978419297 | success | feat: numeric KR confidence + cmd-k + burndown `6fb1ebf` |
| 24978367021 | cancelled (superseded) | feat(theme): hierarchy/all-okrs interiors `f11d96d` |
| 24978180771 | success | docs(audit) refresh `346f632` |
| 24966025537 | success | feat(theme): hierarchy + sprints + listings `c236f17` |
| 24965767198 | success | fix(ui): Tabs primitive `0ba68bf` |

The `cancelled` run was auto-superseded by the next push (deploy concurrency = 1) — the same code shipped in the next successful run, so no actual deploy gap.

---

## File map

| Concern | Path |
|---|---|
| Tokens (CSS) | `app/globals.css` lines 945–1180 (motion utilities at end) |
| Tokens (TS) | `lib/design/apple-pro-tokens.ts` |
| Theme store | `lib/stores/theme-store.ts` |
| Theme switcher | `components/layout/ThemeSwitcher.tsx` |
| Body class hydration | `app/theme-body-class.tsx` |
| Sidebar | `components/layout/Sidebar.tsx` |
| Topbar | `components/layout/Header.tsx` |
| Cmd-K palette | `components/cmdk/CommandPalette.tsx` + `lib/stores/cmdk-store.ts` |
| Cmd-K wiring | `components/cmdk/CmdkActionListener.tsx` + `lib/stores/create-intent-store.ts` |
| Search API | `app/api/search/route.ts` |
| Theme toasts | `components/layout/AppleToaster.tsx` |
| Skeletons | `components/ui/Skeleton.tsx` + `app/dashboard/(*)/loading.tsx` |
| EmptyState | `components/ui/EmptyState.tsx` |
| Status primitives | `components/shared/StatusPill.tsx` |
| To-dos page | `components/todos-page/TodosPageClient.tsx` |
| Trello card modal | `components/todos/TodoCardModal.tsx` |
| Work Board | `components/work/WorkBoardClient.tsx` |
| Dashboard | `components/dashboard/AppleDashboard.tsx` |
| Analytics | `components/dashboard/AppleAnalytics.tsx` |
| Objective detail | `app/dashboard/objectives/[id]/page.tsx` + `components/objective-detail/*` |
| KR detail | `features/key-results/components/KeyResultDetailClient.tsx` + `components/key-result-detail/*` |
| Listings | `features/objectives/components/NestedObjectivesList.tsx` + `OKRLevelView.tsx` |
| Sprint board | `features/sprints/components/SprintBoardClient.tsx` (+ `SprintBurndownCard`, `SprintMembersCard`) |
| Risks | `components/shared/RisksPanel.tsx` + `app/api/risks/*` |
| Viewers | `components/shared/ViewersList.tsx` + `hooks/useViewTracker.ts` + `app/api/{objectives,keyresults}/[id]/views/route.ts` |
| Kanban | `components/shared/WorkItemsKanban.tsx` |
| Notifications | `app/dashboard/notifications/NotificationsClient.tsx` |
| Auth | `app/auth/signin/page.tsx`, `signup`, `forgot-password`, `reset-password` |

---

*Update this file in tandem with `docs/CHANGELOG_AI.md` whenever progress is made.*
