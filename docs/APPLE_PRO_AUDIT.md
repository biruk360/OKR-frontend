# Apple Pro Rollout — Audit & Status

**Last updated:** 2026-04-25
**Scope:** Status of the Apple Pro design system rollout across the OKR Management System (Next.js 14, Tailwind 3, shadcn-style tokens).
**Reference docs:**
- `docs/apple_pro_token.md` — token reference
- `docs/apple_pro_ux_guide.md` — page anatomy + behavior

---

## TL;DR

| Area | Status |
|------|--------|
| Foundation (tokens, typography, body class, theme switcher) | ✅ Complete |
| Sidebar + Topbar | ✅ Complete |
| To-dos page + Trello card modal | ✅ Complete |
| Objective detail page | ✅ Complete |
| Key Result detail page | ✅ Complete |
| Work Board kanban | ✅ Complete |
| Dashboard / Analytics / Hierarchy / Reports / Sprints / etc. | ⚠️ Get AP colors via token override; layouts NOT redesigned |
| Risks tab content (both detail pages) | ❌ Stub only — no data model |
| Cmd-K global search palette (UX guide §2.2) | ❌ Not implemented |
| Motion specs (spring curves, hover lifts) | ❌ Not systematically applied |
| Numeric KR check-in confidence | ❌ Still uses enum |

---

## 1. Foundation

### ✅ Done
- [x] Apple Pro CSS variables added to `app/globals.css` under `.apple-pro-surface` / `.theme-apple-full` scope (light + dark)
- [x] Shadcn-style tokens (`--background`, `--card`, `--border`, `--muted-foreground`, `--primary`, etc.) overridden inside `.theme-apple-full` so every existing component using `bg-card text-muted-foreground border-border bg-primary` automatically renders with iOS palette
- [x] Body wraps in `apple-pro-surface theme-apple-full` (gated by client theme switcher)
- [x] Semantic color aliases: `--ap-red`, `--ap-green`, `--ap-orange`, `--ap-fg-secondary`
- [x] SF Pro font stack applied globally with `-0.01em` tracking and 13px body
- [x] Radii scale: 10/14/16/22px
- [x] Shadow tokens (sm/md/lg/card)
- [x] Glass utility (`.ap-glass`) — `backdrop-filter: saturate(180%) blur(24px)`
- [x] Theme switcher — `Default | Apple | Apple Pro` in topbar, persisted via Zustand+localStorage
- [x] `app/theme-body-class.tsx` client wrapper hydrates `document.body.className` from store

### ❌ Missing
- [ ] Motion / animation tokens not centralized (no spring curve constants, no consistent `transition-*` utility)
- [ ] Focus-ring style not unified across inputs/buttons (some use `focus:ring-2 focus:ring-[var(--ap-accent)]`, others rely on default browser ring)

---

## 2. Layout chrome

### ✅ Done
- [x] **Sidebar** — 220px expanded / 52px collapsed, glass background, AP borders, active-nav style
- [x] **Topbar** — 48px height, glass, sticky, theme switcher mounted

### ❌ Missing
- [ ] **Topbar global search + Cmd-K palette** (UX guide §2.2) — search field, keyboard shortcut chip, command palette overlay

---

## 3. To-dos / Initiatives

### ✅ Done
- [x] To-dos list page (`/dashboard/todos`) — header, filter bar, view switcher tabs (List/Board/Tree), AP table styling
- [x] `CreateTodoModal` — glass backdrop, AP inputs/buttons, KR/Objective pickers
- [x] `TodoCardModal` (Trello-style) — cover, title, description (Tiptap), members, labels, checklists, attachments with image preview, threaded comments with @mention support
- [x] `TodoCard` chip component for kanban
- [x] `MentionEditor` (Tiptap with Mention extension + portal dropdown)
- [x] @mention notifications + email
- [x] Work Board page (`/dashboard/work`) — global Kanban, drag-and-drop, search, member/label filters
- [x] Sidebar nav entry for "Work Board"
- [x] Schema: `Todo.priority`, `Todo.coverColor`, `TodoMember`, `TodoLabelDef`, `TodoLabel`, `TodoChecklist`, `TodoChecklistItem`, `TodoAttachment`, `TodoComment`
- [x] API routes: `/api/todos/[id]`, `.../comments`, `.../checklists`, `.../attachments`, `/api/todo-labels`

### ❌ Missing / Punted
- [ ] WYSIWYG attachment in comments (currently text only — file uploads work on the card itself, not within a comment)
- [ ] Activity feed inside `TodoCardModal` (only comments tab is wired)

---

## 4. Objective detail page (`/dashboard/objectives/[id]`)

### ✅ Done
- [x] **CriticalBanner** — orange/amber strip, icon + headline + sub
- [x] **ObjectiveHero** — chip row (level + OBJ pill + ID + timeframe + alignment chips), 24px title with -0.02em tracking, description, meta row (owner, contributors, due, week counter), 5-stat strip (Progress ring · Status pill + Pace chip · Confidence bar · KR count + status dots · Deadline)
- [x] **KRList** — Rich/Compact segmented toggle, Filter, Add KR; rows with KR badge, ID, target chip, dates, title, owner, progress bar; footer aggregates (avg progress, avg confidence, pace delta, initiatives, work items)
- [x] **WorkItemsKanban** — restyled to AP (14px cards, accent-soft chips, drag-drop preserved)
- [x] **ProgressConfidenceCard** (right rail) — twin stat block + custom SVG line chart (burn-up blue, confidence orange dashed, expected grey dotted) + legend pills + W## → W## header
- [x] **PerKrProgressCard** (right rail) — vertical bar chart per KR, status-colored, average headline
- [x] **ActivityTabs / Inspector** — 4 tabs (Details / Activity / Risks / Viewers); Details has Owner card, Timeframe, Aligned-to, Measurement, Collaborators, Data source
- [x] Grid tightened to `1fr 340px`
- [x] `Objective.confidence Int @default(50)` added to Prisma; PUT route persists it; hero reads real value (preflight + `prisma db push` will sync on next deploy)
- [x] Dead components removed: `AlignmentCard`, `ObjectiveDetailsCard`, `ContributorsCard`, `ProgressTimelineChart`

### ❌ Missing
- [ ] **Risks tab** — stub only ("No risks logged."). No `Risk` Prisma model exists; needs schema decision (separate model vs JSON column)
- [ ] **Viewers tab** — stub only. Needs `ViewLog` aggregation
- [ ] No empty-state illustrations (the guide mentions friendly empty states)

---

## 5. Key Result detail page (`/dashboard/key-results/[id]`)

### ✅ Done
- [x] **Hero** — chip row (KR badge, ID, target chip, dates), 24px title, parent objective link with Target icon, 5-stat strip (Progress ring + value display X/Y, Status pill, Confidence bar, Initiatives count, Last check-in)
- [x] **Quick check-in bar** — inline value input + confidence selector + button
- [x] **CheckInTimeline** — vertical timeline, 2px line, colored dots by confidence tier (green ≥70 / amber 40–69 / red <40), "Apr 15, 2026 · Author" header, large "62 → 68 (+6)" value, confidence pill, optional note
- [x] **Initiatives list** — restyled to AP card (14px radius, soft borders)
- [x] **WorkItemsKanban** — same AP styling as Objective page
- [x] **KrProgressConfidenceCard** (right rail) — same twin-stat-block + chart as Objective version, but burn-up = currentValue progression %, confidence orange dashed, expected = linear interpolation between startValue→targetValue
- [x] **KrInspectorTabs** (right rail) — Details / Check-ins / Activity / Risks; Details has Owner, Timeframe, Parent objective accent-soft card, Measurement (start/target/current with units), Confidence trend mini-bars, Last updated
- [x] Grid `1fr 340px`

### ❌ Missing / Punted
- [ ] **Numeric check-in confidence** — `KeyResultCheckIn.confidence` is still an enum (`ON_TRACK`/`AT_RISK`/`OFF_TRACK`), mapped to 85/55/25 for the chart. Widening to numeric requires a migration + UI update on every check-in surface
- [ ] **Risks tab** — stub
- [ ] **`KeyResultProgressChart.tsx`** — orphaned file (no longer rendered, not deleted)

---

## 6. Other pages (legacy layouts, AP colors only)

These pages currently inherit the iOS palette via the shadcn token override but their layouts and component shapes haven't been redesigned to match the UX guide.

- [ ] **Dashboard** (`/dashboard`) — stat cards + charts; needs AP card shells, sparklines, status pills
- [ ] **Analytics** (`/dashboard/analytics`) — chart-heavy page; needs AP chart styling
- [ ] **OKR Hierarchy** (`/dashboard/okr-hierarchy`) — tree visualization; needs AP node cards
- [ ] **My OKRs** (`/dashboard/my-okrs`) — listing
- [ ] **Company / Department OKRs** — listings
- [ ] **All OKRs** (`/dashboard/okrs-all`)
- [ ] **Archived Objectives**
- [ ] **Reports / Initiative Report / Progress Report**
- [ ] **Sprints** (`/dashboard/sprints`) — kanban; should adopt the same WorkItemsKanban AP styling
- [ ] **Goals**
- [ ] **Plans**
- [ ] **Timeline**
- [ ] **Notifications** (`/dashboard/notifications`)
- [ ] **Profile** (`/dashboard/profile`)
- [ ] **Settings** (`/dashboard/settings`)
- [ ] **Admin / Users** (`/dashboard/org`, `/dashboard/admin/users`)
- [ ] **Comments** (`/dashboard/comments`)
- [ ] **Activity** (`/dashboard/activity`)
- [ ] **Alignment Map** (`/dashboard/alignment-map`)
- [ ] **Auth pages** — `/auth/signin`, `/auth/signup`, etc.

**Recommendation:** prioritize Dashboard, Analytics, OKR Hierarchy, Sprints (highest traffic), then sweep listings, then admin/profile/settings.

---

## 7. Schema / Backend

### ✅ Done
- [x] Trello card model: `Todo.priority`, `Todo.coverColor`, plus `TodoMember`, `TodoLabelDef`, `TodoLabel`, `TodoChecklist`, `TodoChecklistItem`, `TodoAttachment`, `TodoComment`
- [x] `Objective.confidence Int @default(50)`
- [x] `withAuth` API wrapper used consistently for new routes
- [x] Standard response envelope `{ success, data, error }` on new routes

### ❌ Missing
- [ ] `Risk` model (or JSON column on Objective/KeyResult) for the Risks tabs
- [ ] `ViewLog` model for the Viewers tab
- [ ] Numeric confidence on `KeyResultCheckIn` (currently enum)
- [ ] No Objective check-in route — confidence flows only through the Edit modal PUT

---

## 8. Cross-cutting / Polish

### ❌ Missing
- [ ] **Cmd-K global search palette** (UX guide §2.2)
- [ ] **Motion**: hover lifts on cards, spring curves on modals, focus-ring polish
- [ ] **Empty-state illustrations** across listings
- [ ] **Skeleton loaders** styled to AP (currently mix of spinners/empty)
- [ ] **Toast styling** — Toaster currently uses dark `#1D1D1F` regardless of theme; should adapt to light/dark + AP token
- [ ] **Modal sheet transitions** — most modals fade in/out only; the guide specifies a soft scale + slide
- [ ] **Print styles** for reports

---

## 9. Deployment / Operational

### ✅ Done
- [x] CI + Deploy to VPS pipeline (GitHub Actions)
- [x] `prisma db push` on deploy with preflight SQL
- [x] PM2 zero-downtime reload
- [x] Nginx serves `/_next/static/*` with `Cache-Control: public, max-age=31536000, immutable`; HTML with `no-cache, no-store, must-revalidate`

### ❌ Missing
- [ ] No staging environment — every push lands on production
- [ ] No automated visual-regression tests
- [ ] No design tokens are exported for non-CSS consumers (charts, framer-motion) beyond `lib/design/apple-pro-tokens.ts`

---

## 10. Recommended next batch (in priority order)

1. **Dashboard + Analytics page redesign** — highest user traffic, most "incomplete" feel right now
2. **OKR Hierarchy + Sprints** — heavily used; Sprints should reuse `WorkItemsKanban`
3. **Cmd-K palette** — the guide specifies it and it's a quick win once topbar search exists
4. **Risks data model + tab content** — small schema decision unlocks the stub on both detail pages
5. **Numeric KR confidence** — schema migration + check-in form update
6. **Motion polish + skeleton loaders + toast theming**
7. **Listings sweep** — Company/Department OKRs, My OKRs, Reports, Goals, Plans, Timeline
8. **Admin/profile/settings sweep** — lowest priority; pure utility pages

---

## File map (where each piece lives)

| Concern | Path |
|---|---|
| Tokens (CSS) | `app/globals.css` lines 945–1180 |
| Tokens (TS) | `lib/design/apple-pro-tokens.ts` |
| Theme store | `lib/stores/theme-store.ts` |
| Theme switcher | `components/layout/ThemeSwitcher.tsx` |
| Body class hydration | `app/theme-body-class.tsx` |
| Sidebar | `components/layout/Sidebar.tsx` |
| Topbar | `components/layout/Header.tsx` |
| To-dos page | `components/todos-page/TodosPageClient.tsx` |
| Trello card modal | `components/todos/TodoCardModal.tsx` |
| Mention editor | `components/todos/MentionEditor.tsx` |
| Work Board | `components/work/WorkBoardClient.tsx` |
| Objective detail | `app/dashboard/objectives/[id]/page.tsx` + `components/objective-detail/*` |
| KR detail | `features/key-results/components/KeyResultDetailClient.tsx` + `components/key-result-detail/*` |
| Kanban | `components/shared/WorkItemsKanban.tsx` |

---

*Generated as part of the Apple Pro rollout audit. Update this file in tandem with `docs/CHANGELOG_AI.md` whenever progress is made.*
