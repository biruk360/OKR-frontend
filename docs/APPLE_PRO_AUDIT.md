# Apple Pro Rollout — Audit & Status

**Last updated:** 2026-04-27
**Scope:** Status of the Apple Pro design system rollout across the OKR Management System (Next.js 14, Tailwind 3, shadcn-style tokens).
**Reference docs:**
- `docs/apple_pro_token.md` — token reference
- `docs/apple_pro_ux_guide.md` — page anatomy + behavior

---

## TL;DR

| Area | Status |
|------|--------|
| Foundation (tokens, typography, body class, theme switcher) | ✅ Complete |
| Sidebar + Topbar (with global search + ⌘K) | ✅ Complete |
| To-dos page + Trello card modal | ✅ Complete |
| Objective detail page | ✅ Complete |
| Key Result detail page | ✅ Complete |
| Work Board kanban | ✅ Complete |
| Dashboard | ✅ Complete |
| Analytics | ✅ Complete |
| OKR Hierarchy | ⚠️ Hero done; interior 1224-line table not rebuilt |
| All OKRs | ⚠️ Hero done; interior 1571-line table not rebuilt |
| Sprints (list + board) | ✅ Complete (no burndown sidebar) |
| Listings (My/Company/Dept/Archived OKRs) | ✅ Complete via `NestedObjectivesList` rewrite |
| Risks tab (Objective + KR) | ✅ Complete (model, API, UI) |
| Cmd-K palette + topbar search | ✅ Palette + nav done; quick-action wiring pending |
| Theme-aware toasts + skeleton loaders | ✅ Complete |
| Numeric KR check-in confidence | ❌ Still uses enum |
| Motion polish (hover lifts, spring curves) | ❌ Not systematically applied |
| Empty-state illustrations | ❌ Not applied |
| Print styles | ❌ Not applied |
| Auth pages | ❌ Legacy |
| Admin / Profile / Settings / Notifications / Org | ❌ Legacy (low priority) |

---

## 1. Foundation

### ✅ Done
- [x] Apple Pro CSS variables in `app/globals.css` under `.apple-pro-surface` / `.theme-apple-full` (light + dark)
- [x] Shadcn tokens (`--background`, `--card`, `--border`, `--muted-foreground`, `--primary`, etc.) overridden inside `.theme-apple-full` so existing components automatically render iOS palette
- [x] Body wrapped in `apple-pro-surface theme-apple-full` (gated by client theme switcher)
- [x] Semantic color aliases: `--ap-red`, `--ap-green`, `--ap-orange`, `--ap-fg-secondary`
- [x] SF Pro font stack, `-0.01em` tracking, 13px body
- [x] Radii scale: 10 / 14 / 16 / 22px
- [x] Shadow tokens (sm/md/lg/card)
- [x] Glass utility (`.ap-glass`)
- [x] Theme switcher — `Default | Apple | Apple Pro` in topbar, persisted to localStorage
- [x] `app/theme-body-class.tsx` client wrapper hydrates body className from store

### ❌ Missing
- [ ] Motion / animation tokens not centralized
- [ ] Focus-ring style not unified across all inputs/buttons

---

## 2. Layout chrome

### ✅ Done
- [x] **Sidebar** — 220 / 52px, glass, AP borders, active-nav style
- [x] **Topbar** — 48px, glass, sticky, theme switcher mounted
- [x] **Global search input** — 280×32 AP input with ⌘K kbd badge (visible md+)
- [x] **Cmd-K palette** — portal-mounted with `cmdk` package; Pages + Quick Actions groups; debounced (200ms) search via `/api/search`
- [x] `/api/search` route with role-aware visibility

### ❌ Missing
- [ ] **Cmd-K Quick Actions wiring** — emits `window` CustomEvent `cmdk:action`; not connected to existing create modals

---

## 3. To-dos / Initiatives

### ✅ Done
- [x] To-dos list page (List/Board/Tree views)
- [x] `CreateTodoModal`
- [x] `TodoCardModal` (Trello-style)
- [x] `MentionEditor` (Tiptap with Mention)
- [x] @mention notifications + email
- [x] Work Board kanban
- [x] Schema: TodoMember/Label/Checklist/ChecklistItem/Attachment/Comment

### ❌ Missing
- [ ] WYSIWYG attachment in comments
- [ ] Activity feed inside `TodoCardModal`

---

## 4. Objective detail page

### ✅ Done
- [x] CriticalBanner, ObjectiveHero, KRList, WorkItemsKanban, ProgressConfidenceCard, PerKrProgressCard, ActivityTabs (Details / Activity / Risks / Viewers)
- [x] `Objective.confidence Int @default(50)`; PUT route persists; hero reads real value
- [x] Dead components removed
- [x] **Risks tab** — fully wired

### ❌ Missing
- [ ] **Viewers tab** — stub; needs `ViewLog` aggregation
- [ ] No empty-state illustrations

---

## 5. Key Result detail page

### ✅ Done
- [x] Hero, Quick check-in bar, CheckInTimeline, Initiatives list, WorkItemsKanban
- [x] KrProgressConfidenceCard, KrInspectorTabs (Details / Check-ins / Activity / Risks)
- [x] **Risks tab** — fully wired

### ❌ Missing
- [ ] **Numeric check-in confidence** — `KeyResultCheckIn.confidence` still enum
- [ ] Orphaned `KeyResultProgressChart.tsx` on disk

---

## 6. Other pages

### ✅ Done
- [x] **Dashboard** — hero + KPI strip + My OKRs + Activity timeline + Initiatives kanban
- [x] **Analytics** — filter strip + KPIs + Progress Trend + Distribution donut + tables
- [x] **OKR Hierarchy hero** (interior table legacy)
- [x] **All OKRs hero** (interior legacy)
- [x] **Sprints list** + **Sprint board**
- [x] **My OKRs**, **Company OKRs**, **Department OKRs**, **Archived Objectives**

### ❌ Missing
- [ ] **OkrHierarchyTable.tsx** (1224 lines) — interior rebuild as card-tree
- [ ] **OkrsAllClient.tsx** (1571 lines) — interior rebuild
- [ ] **Sprint sidebar** — burndown chart + members
- [ ] **Reports / Initiative Report / Progress Report**
- [ ] **Goals / Plans / Timeline**
- [ ] **Notifications / Profile / Settings**
- [ ] **Admin / Users / Org**
- [ ] **Comments / Activity / Alignment Map**
- [ ] **Auth pages**

---

## 7. Schema / Backend

### ✅ Done
- [x] Trello card model
- [x] `Objective.confidence Int @default(50)`
- [x] `Risk` model + 4 ActivityAction enums
- [x] `withAuth` wrapper used consistently
- [x] Standard response envelope `{ success, data, error }`
- [x] `/api/search` role-aware endpoint

### ❌ Missing
- [ ] `ViewLog` model
- [ ] Numeric confidence on `KeyResultCheckIn`
- [ ] No Objective check-in route

---

## 8. Cross-cutting / Polish

### ✅ Done
- [x] **Cmd-K palette + topbar search**
- [x] **Theme-aware toasts** — `AppleToaster`
- [x] **Skeleton loaders** — `Skeleton` + `loading.tsx` boundaries

### ❌ Missing
- [ ] **Motion** — hover lifts, spring curves on modals, focus-ring polish
- [ ] **Empty-state illustrations**
- [ ] **Modal sheet transitions** beyond simple fade
- [ ] **Print styles** for reports
- [ ] **Cmd-K Quick Actions** to actual create modals

---

## 9. Deployment / Operational

### ✅ Done
- [x] CI + Deploy to VPS pipeline
- [x] `prisma db push` on deploy with preflight SQL
- [x] PM2 zero-downtime reload
- [x] Nginx caching strategy

### ❌ Missing
- [ ] No staging environment
- [ ] No automated visual-regression tests

---

## 10. Recommended next batch (priority order)

1. **OkrHierarchyTable + OkrsAllClient** interior rebuilds — biggest visible gap left
2. **Numeric KR check-in confidence** — schema migration + check-in form update
3. **Cmd-K Quick Actions wiring** — connect `cmdk:action` events to create modals
4. **Sprint burndown sidebar**
5. **Motion polish + empty-state illustrations**
6. **Reports / Goals / Plans / Timeline** sweep
7. **Auth / Notifications / Profile / Settings / Admin** sweep
8. **`ViewLog` model + Viewers tab**
9. **Delete orphaned `KeyResultProgressChart.tsx`**
10. **Print styles + staging env + visual-regression tests**

---

## File map

| Concern | Path |
|---|---|
| Tokens (CSS) | `app/globals.css` lines 945–1180 |
| Tokens (TS) | `lib/design/apple-pro-tokens.ts` |
| Theme store | `lib/stores/theme-store.ts` |
| Theme switcher | `components/layout/ThemeSwitcher.tsx` |
| Body class hydration | `app/theme-body-class.tsx` |
| Sidebar | `components/layout/Sidebar.tsx` |
| Topbar | `components/layout/Header.tsx` |
| Cmd-K palette | `components/cmdk/CommandPalette.tsx` + `lib/stores/cmdk-store.ts` |
| Search API | `app/api/search/route.ts` |
| Theme toasts | `components/layout/AppleToaster.tsx` |
| Skeletons | `components/ui/Skeleton.tsx` + `app/dashboard/(*)/loading.tsx` |
| To-dos page | `components/todos-page/TodosPageClient.tsx` |
| Trello card modal | `components/todos/TodoCardModal.tsx` |
| Work Board | `components/work/WorkBoardClient.tsx` |
| Dashboard | `components/dashboard/AppleDashboard.tsx` |
| Analytics | `components/dashboard/AppleAnalytics.tsx` |
| Objective detail | `app/dashboard/objectives/[id]/page.tsx` + `components/objective-detail/*` |
| KR detail | `features/key-results/components/KeyResultDetailClient.tsx` + `components/key-result-detail/*` |
| Listings | `features/objectives/components/NestedObjectivesList.tsx` + `OKRLevelView.tsx` |
| Sprint board | `features/sprints/components/SprintBoardClient.tsx` |
| Risks | `components/shared/RisksPanel.tsx` + `app/api/risks/*` |
| Kanban | `components/shared/WorkItemsKanban.tsx` |

---

*Update this file in tandem with `docs/CHANGELOG_AI.md` whenever progress is made.*
