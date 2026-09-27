# UI/UX & Conventions Conformance Audit

**Date:** 2026-09-27 · **Agent:** T8 (read-only for code) · **Scope:** `app/`, `components/`, `features/`
(1,102 `.ts/.tsx` files, 580 `.tsx`, test files excluded; `.css` excluded).

**Rule sources:** `CLAUDE.md` (Before Writing Code + Rules (Non-Negotiable)), `docs/CONVENTIONS.md`,
`../docs/DESIGN_SYSTEM.md` (§1–12), `../docs/apple_pro_ux_guide.md` (§9 accessibility floor),
`../docs/apple_pro_token.md`, `docs/design_refresh_IMPLEMENTATION_STRATEGY.md` (§4, §7, §10, §11),
`docs/APPLE_PRO_AUDIT.md` (2026-09-25 addendum), `docs/COMPONENT_CATALOG.md`, and the global guardrail:
every component applies RBAC/permissions/doctype (`lib/rbac.ts`, `lib/permissions.ts`), Apple Pro tokens & UX,
and system-wide conventions.

**Baseline:** the 2026-09-25 full-project audit figures supplied with this task (269 hex, 1,338 raw palette,
191 native `<select>`, 58 raw `<h1>`, 178 spinners, 21 unlabelled icon buttons), plus figures recorded in the
design-refresh doc and remediation plan (~127 `bg-white`, 249 hand-rolled eyebrows/94 files, 195 native
`<select>`/~90 files, 11 OKR pickers, 80 `font-5/6/700`, 35 pages importing Prisma). The baseline method
isn't recorded, so treat before→after deltas as approximate. The current counts come from regexes
and a JSX tag scanner (see §Method). Counts are occurrences unless a row says "files".

## Verdict legend
**PASS** = conforms (only documented or justified exceptions) · **MOSTLY** = small residue · **PARTIAL** = material
residue, adoption incomplete · **FAIL** = rule broadly not followed.

---

## 0. Scoreboard: baselined metrics, before → after

| Metric | Baseline (2026-09-25) | Now (2026-09-27) | Δ |
|---|---:|---:|---|
| Hardcoded hex in `.ts/.tsx` | 269 | **91** raw / **~63** needing a fix after exceptions | −66% / −77% |
| Raw Tailwind palette classes (`bg-gray-100`, `text-blue-600`, …) | 1,338 | **47** (11 files) | −96% |
| Native `<select>` | 191 (195/~90 files in design doc) | **145** (55 files) | −24% |
| Raw `<h1>` (outside `components/ui`) | 58 | **21** (≈9 in dashboard UI that bypass `PageHeader`) | −64% |
| Spinners (`animate-spin`) | 178 | **51**: 38 inline in buttons (acceptable), **13** region/page spinners | −71% (−93% region) |
| Unlabelled icon-only buttons | 21 | **13** (8 files) | −38% |
| Raw `bg-white` | ~127 | **30** (15 files), 8 solid `bg-white` + 10 inline `background:'#fff'` in live UI | −76% |
| Hand-rolled eyebrows vs `Eyebrow` | 249 / 94 files | **254 / 105 files** hand-rolled; `Eyebrow` has 8 importers | **no progress** |
| `font-500/600/700` (invalid Tailwind) | 80 → 0 (Phase 7 gate) | **3** (1 file) | regression |
| `text-[11px]` / `text-[10px]` | all converted in Wave 3 | **0** | held |
| `page.tsx` importing Prisma | 35 | **0** | fixed |
| Native `window.confirm/alert/prompt` | many (Wave 3 target) | **0** (1 grep hit is a code comment) | fixed |

---

## 1. Modularity & reuse (CLAUDE.md "Modularity", CONVENTIONS "Import Conventions")

| Rule | Check | Count now | Baseline | Top offenders | Verdict |
|---|---|---:|---|---|---|
| Features never import other features | `features/X` importing `@/features/Y` | **3** (all via barrel) | — | `features/key-results/components/KeyResultDetailClient.tsx:37` → todos · `features/key-results/components/KeyResultsList.tsx:15` → todos · `features/sprints/components/SprintBoardHeader.tsx:26` → sprints-ai | MOSTLY |
| Import from barrels, not internals | `@/features/Y/<path>` from `app/`/`components/` (excluding `app/api`) | **~44** lines; **20** reach into `/components/` | — | `components/cmdk/GlobalCheckInModal.tsx:5` (feature-internal modal) · `components/settings/TimeframeManagement.tsx:10` (imports `features/auth/services/zod-resolver`, a shared util living in a feature) · `app/dashboard/projects/**/loading.tsx` + `error.tsx` → `features/projects/components/RouteStates` (8) · `app/portal/page.tsx:4` · `app/dashboard/sprints/[id]/report/page.tsx:4` | PARTIAL |
| (same, API layer) | `app/api/**` deep imports of `features/*/services/*` | **73** | — | `app/api/scrum/**` → `scrum/services/*` · `app/api/portal/**` → `projects/services/portal-serializer` | Justified. Server-only services can't go through client barrels. Document it as an allowed exception. |
| `*.server.ts` page loaders | pages importing `features/*/services/*.server` | ~20 | 35 Prisma pages | `app/dashboard/org/users/[id]/page.tsx:2` etc. | PASS (intended H5 pattern) |
| Every feature has a barrel | `features/*/index.ts` present | 18/18 | — | — | PASS |
| Don't re-declare shared types | `type/enum UserRole|ObjectiveLevel|TodoStatus|ObjectiveStatus` outside `types/` | **1** | — | `components/settings/permissions/UserRolesPanel.tsx:22` | MOSTLY |
| Permission logic only in `lib/permissions.ts` | `can*/is*` exports in `lib/utils.ts` | 0 | — | — | PASS |
| Shared reference-data hooks | inline `fetch('/api/users|timeframes|departments')` in UI | **6** (5 files) | — | `components/settings/CreateTeamModal.tsx:27` · `components/settings/LetterPermissionsManagement.tsx:387` · `components/settings/UserManagement.tsx:440` · `components/settings/TimeframeManagement.tsx:106` · `features/filters/hooks/useFilterOptions.ts:15` (hook) | MOSTLY |
| Use `getProgressColor()`/`getConfidenceColor()` | local re-implementations | **2** | 3 (Phase 7) | `components/dashboard/HeroStats.tsx:38` · `components/hierarchy/KeyResultNode.tsx:30` | MOSTLY |

## 2. Shared UI primitives (CLAUDE.md "UI Components")

| Rule | Check | Count now | Baseline | Top offenders | Verdict |
|---|---|---:|---|---|---|
| `Modal` for every dialog | importers of `ui/Modal` vs hand-rolled `fixed inset-0` overlays / `role="dialog"` outside `ui/` | **70** importers; **0** hand-rolled modals (2 `fixed inset-0` hits are a transparent menu click-catcher `components/layout/Sidebar.tsx:231` and a full-screen map mode `components/profile/ProfileOrgMinimap.tsx:251`) | 50 importers (design doc) | — | PASS |
| `ConfirmDialog` for delete/archive; no native dialogs | `ConfirmDialog` importers; `window.confirm/alert/prompt` | **50** importers; **0** native calls | Wave 3 target | (`components/settings/permissions/FieldLevelsTab.tsx:40` mentions `window.prompt()` only in a comment) | PASS |
| `EmptyState` for empty data | importers; empty-copy literals (`No … yet/found/available`) in files that don't import it | **101** importers; **28** hand-rolled (25 files) | — | `app/portal/projects/[id]/page.tsx:159` (3) · `components/shared/ActivityLogPanel.tsx:158` (2) · `components/dashboard/AppleAnalytics.tsx:306` · `components/objective-detail/ActivityTabs.tsx:193` · `components/key-result-detail/KrInspectorTabs.tsx:220` · `features/todos/components/ToDoList.tsx:461` | PARTIAL (many are inline one-liners inside panels. Worth a pass on primary lists.) |
| `StatCard` for dashboard stats | importers vs locally defined KPI/Stat/Metric tiles | **5** importers vs **~15** local tiles | "adopted in 7 dashboard pages" | `components/dashboard/AppleDashboard.tsx:212` & `AppleAnalytics.tsx:89` (`KpiStrip`) · `features/projects/components/reports/ManagementReportsPanel.tsx:193` & `PerformanceReportsPanel.tsx:200` (`Kpi`) · `components/insights/ProgressTrackingPanel.tsx:71` · `features/daily-trip-plan/components/CoordinatorConsole.tsx:113` · `features/filters/components/KpiTiles.tsx:20` · `components/period-close-report/PeriodCloseReportClient.tsx:69` · `app/dashboard/comments/page.tsx:89` · `app/portal/projects/[id]/page.tsx:360` · `features/key-results/components/CreateCheckInModal.tsx:469` (a second component named `StatCard`) · `features/projects/components/views/ProjectViewSwitcher.tsx:832` | **FAIL** |
| `PageHeader` for page titles | importers; raw `<h1>` outside `ui/` | **55** importers; **21** `<h1>`. Excluding HTML exports (2), the shell `Header.tsx`, auth/portal standalone screens (6) and detail heroes per UX guide §3.1/§4.2 (`ObjectiveHero`, `KeyResultDetailClient`), **~9** dashboard pages bypass it | 58 `<h1>` | `app/dashboard/org/users/[id]/page.tsx:88` · `app/dashboard/org/teams/[id]/page.tsx:70` · `components/settings/UserDetail.tsx:253` · `components/work/WorkBoardClient.tsx:162` · `components/initiative-report/InitiativeReportClient.tsx:120` · `components/period-close-report/PeriodCloseReportClient.tsx:33` · `features/admin-org/components/AdminOrgWorkspace.tsx:43` · `features/sprints/components/SprintBoardHeader.tsx:112` · `features/sprints/components/SprintReportClient.tsx:311` | MOSTLY |
| `FilterSelect`/`FilterMultiSelect` over native `<select>` for filters | native `<select>` count; FilterSelect importers | **145** `<select>` (55 files); FilterSelect **19** + FilterMultiSelect **2** importers. Two styled native wrappers exist (`components/settings/SettingsSelect.tsx`, `features/performance/components/NativeSelect.tsx`) | 191–195 | `features/projects/components/creation/DraftReviewWorkspace.tsx:576` (23) · `features/projects/components/activity/ActivityDetailPanel.tsx:326` (10) · `features/projects/components/gantt/GanttChart.tsx:847` (8) · `features/objectives/components/EditObjectiveModal.tsx:145` (6) · `features/objectives/components/CreateObjectiveModal.tsx:345` (5) · `features/projects/components/registers/RaidRegister.tsx:91` (5) · `features/admin-org/components/PeopleTab.tsx:64` (4) | PARTIAL. Most remaining are form fields, which the docs don't mandate replacing. Filter-bar `<select>`s in PeopleTab/ProjectWorkspaceClient/registers should move. |

## 3. Styling & design tokens (CLAUDE.md "Styling", DESIGN_SYSTEM §2–§6, §12)

| Rule | Check | Count now | Baseline | Top offenders | Verdict |
|---|---|---:|---|---|---|
| No hardcoded hex | `#rgb/#rrggbb/#rrggbbaa` in `.ts/.tsx` | **91** raw (27 files). Justified: gantt HTML export route 15, label-default palette in `app/api/{labels,todo-labels}` 3, `app/layout.tsx` themeColor 2, `app/global-error.tsx` 4 (renders without app CSS), canvas PNG fallbacks 3, one code comment. **~63 need a fix** | 269 | `features/strategy-map/**` **37** (`OrgStrategyMap.tsx:145`, `nodes/MapObjectiveNode.tsx:15` `ON_TRACK:'#10b981'…`, `nodes/DepartmentNode.tsx:15`, `DiagnosticsTray.tsx:35`, `MapFilterBar.tsx:45`, `nodes/PersonNode.tsx:19`, `ModeToggle.tsx:29`, `nodes/CompanyNode.tsx:18`) · `features/admin-org/**` **17** (`OrgChartTab.tsx:26`, `DepartmentsTab.tsx:49`, `AdminOrgWorkspace.tsx:38`, `PeopleTab.tsx:81`, `CompanyHeader.tsx:43`) · `features/reports/components/EmployeeSuperDashboard.tsx:169` (5, `Sparkline color="#34C759"`) · `features/projects/components/activity/ActivityDetailPanel.tsx:280` (legacy `#007AFF` default) · `components/ui/date-picker.tsx:141` | PARTIAL (the two modules that missed the Wave 3 area passes hold 85% of it) |
| Documented hex exceptions | `project-status-*` (tailwind config), card palette (`lib/card-visuals.ts`), letter paper preview | out of scan scope (`lib/`, config) / 0 in `features/letters` | — | — | PASS |
| No numeric `rgb()/rgba()/hsl()` literals | `rgba?(\d…` | **108** (35 files) | not baselined | `components/shared/StatusPill.tsx:19` (15 tint washes `rgba(52,199,89,.12)`) · `components/ui/date-picker.tsx:76` (10) · `components/sprints/EndSprintModal.tsx:222` (7) · `components/shared/notification-icon.ts:11` (6) · `components/plans/PlansGantt.tsx:386` · `features/sprints/components/SprintReportClient.tsx:143` · `features/sprints-ai/components/ReviewPlanClient.tsx:223` · `components/work/WorkBoardClient.tsx:244` (`rgba(0,0,0,.06)` hovers → invisible in dark) | PARTIAL |
| Semantic tokens, not raw palette | `(bg|text|border|ring|from|to|fill|stroke|…)-(gray|blue|…)-NNN` | **47** (11 files) | 1,338 | `features/strategy-map/components/nodes/DepartmentNode.tsx:27` (13) · `components/layout/NavProgressCircles.tsx:25` (8) · `features/admin-ai-logs/components/AiLogsClient.tsx:40` (6) · `features/strategy-map/components/nodes/PersonNode.tsx:33` (5) · `features/objectives/components/EditWeightsModal.tsx:132` (4) · `app/error.tsx:47` (2) · `components/ui/StatCard.tsx:66` (1, inside the primitive) | MOSTLY |
| Type scale tokens, no `text-[Npx]` | arbitrary `text-[Npx/rem]` | **193** (70 files). Values: 13px×35, 9px×33, 12px×28, 12.5px×25, 9.5px×15, 11.5px×8 … (11/10px = 0) | 11/10px fully converted in Wave 3 | `features/auth/components/SignUpForm.tsx:33` (12) · `components/layout/Header.tsx:190` (10) · `components/todos-page/TodosPageClient.tsx:275` (10) · `features/reports/components/EmployeeSuperDashboard.tsx:163` (10) · `features/auth/components/AuthCard.tsx:24` (9) | PARTIAL. 13px = `text-body-sm`. 9/9.5px are `Eyebrow size="sm"` territory. |
| Radius tokens, no `rounded-[Npx]` | arbitrary px radii | **113** (45 files): 8px×41, 6px×19, 12px×16, 10px×8 … (vs **405** `rounded-[var(--ap-radius-*)]`) | "294 radii swept" in Phase 1 | `features/key-results/components/KeyResultDetailClient.tsx:210` (10) · `components/sprints/EndSprintModal.tsx:291` (5) · `components/sprints/LinkToOkrPopover.tsx:178` (5) · `features/auth/components/SignInForm.tsx:162` (5) · `features/reports/components/EmployeeSuperDashboard.tsx:209` (5) | PARTIAL |
| Valid font weights | `font-500/600/700` | **3** | 80 → 0 (Phase 7 gate "no font-5/6/700 remaining") | `components/shared/AttachmentLightbox.tsx:102` | **Regression** (trivial fix) |
| `cn()` for conditional classes | `className={\`…${…}\`}` template literals | **91** (56 files) | — | `components/todos-page/TodosPageClient.tsx:323` (9) · `features/key-results/components/KeyResultsList.tsx:180` (5) · `components/dashboard/HeroStats.tsx:72` · `components/hierarchy/ObjectiveNode.tsx:154` · `components/reports/ReportResultTables.tsx:91` | PARTIAL (also bypasses `cn()`'s custom-font-size merge fix) |
| One focus style (`ap-focus-ring`) | `focus(-visible)?:ring-*` outside `ui/` | **195**; `ap-focus-ring` used 29× outside `ui/` | DESIGN_SYSTEM §12 "do not add focus:ring-* in new code" | `features/key-results/components/EditKeyResultModal.tsx` (8) · `AddKeyResultModal.tsx` (8) · `components/settings/permissions/UserRolesPanel.tsx` (7) · `CloneKeyResultModal.tsx` (6) · `RecordScopingTab.tsx` (6) | MOSTLY. A global `:focus-visible` rule neutralises these rings, so it's cleanup, not a user-facing bug. |
| Card shadow tokens | raw `shadow-sm|md|lg|xl` / `shadow-[…]` | 124 / 20 | — | `features/projects/components/gantt/schedule-grid.tsx:106` · `features/sprints/components/TaskCardTrello.tsx:152` | Informational |

## 4. Dark mode (DESIGN_SYSTEM §12 "Palette tokens are CSS variables")

| Rule | Check | Count now | Baseline | Top offenders | Verdict |
|---|---|---:|---|---|---|
| No raw `bg-white` surfaces | `bg-white` (incl. `/NN`) | **30** (15 files); **8** solid (3 files). The other 22 are `/NN` glass on the auth photo hero, which is justified | ~127 | `features/admin-org/components/PeopleTab.tsx:60` (5) · `features/admin-org/components/DepartmentsTab.tsx:130` (2) · `features/admin-org/components/CompanyHeader.tsx:92` · `features/sprints/components/SprintPlannerView.tsx:95` (3, `/NN`) | MOSTLY |
| No inline white surfaces | `style={{ background:'#fff'|'white' }}` | **10** (7 files) | — | `features/admin-org/components/OrgChartTab.tsx:37,55,105` · `features/admin-org/components/DepartmentsTab.tsx` (2) · `features/strategy-map/components/nodes/{MapObjectiveNode:24,DepartmentNode,PersonNode}` · `features/strategy-map/components/ModeToggle.tsx` | **FAIL for these two modules** (Org Admin and the OKR Explorer Map view render light cards in dark mode) |
| Filled buttons use `text-primary-foreground`, not `text-white` | `text-white` on the same line as a `bg-primary`/accent fill | **4** (3 files); `text-white` overall 84 (53 in `features/auth` on photo, justified) | — | `components/layout/Sidebar.tsx:373` (2) · `app/error.tsx:47` · `components/todos/CardDatesPanel.tsx:256` | MOSTLY |
| Overlays via `--ap-overlay` | `bg-black/NN` outside `ui/dialog` | 16 (9 files) | — | `features/admin-org/components/DepartmentsTab.tsx:57` (4) · `features/admin-org/components/CompanyHeader.tsx:72` (3) · `features/projects/components/gantt/GanttChart.tsx:1473` (3) | Informational |

## 5. Loading, errors, route boundaries (DESIGN_SYSTEM §6 "skeletons over spinners", Wave 3)

| Rule | Check | Count now | Baseline | Top offenders | Verdict |
|---|---|---:|---|---|---|
| Skeletons over spinners where layout is known | `animate-spin` split by context | **51**: **38** inline in buttons (OK), **13** region/page spinners; `Skeleton`/`.skeleton` used 349× in 132 files | 178 | Region spinners: `components/settings/permissions/RecordScopingTab.tsx:505,585` · `components/settings/LetterPermissionsManagement.tsx:206` · `components/settings/permissions/FeaturesNavTab.tsx:434` · `features/admin-org/components/AdminOrgWorkspace.tsx:120` · `features/admin-org/components/CompanyHeader.tsx:26` · `features/strategy-map/components/OrgStrategyMap.tsx:74` · `features/letters/components/SuperDocEditorClient.tsx:249` · `features/automations/components/TestRunPanel.tsx:125` · `components/cmdk/CommandPalette.tsx:165` · `components/cmdk/CheckInPickerModal.tsx:189` · `features/auth/components/{AuthCard:182,SignInForm:320}` | MOSTLY |
| No bare "Loading…" text placeholders | `>Loading…<` | **5** | — | `components/layout/Header.tsx:260` · `components/sprints/EndSprintModal.tsx:229` · `components/ui/EntityPicker.tsx:269` · `features/filters/components/FiltersWorkspace.tsx:275` · `features/sprints/components/SprintInboxView.tsx:72` | MOSTLY |
| Every route has a `loading.tsx` | nearest `loading.tsx` for each of 88 `page.tsx` | **83/88** covered; **5** without are `app/page.tsx` (redirect) and 4 `app/auth/*` client forms; 5 dashboard pages fall back only to `app/dashboard/loading.tsx` (`admin/ai-logs`, `admin/org`, `my-tasks` (redirect), `dashboard`, `profile`) | "missing boundaries" | — | PASS |
| Every route has an `error.tsx` | nearest `error.tsx` | **88/88** (5 auth/home pages rely on `app/error.tsx`; 6 dashboard pages on `app/dashboard/error.tsx`) | — | — | PASS |

## 6. Routes & pages (CLAUDE.md "Routes: thin composition only")

| Rule | Check | Count now | Baseline | Top offenders | Verdict |
|---|---|---:|---|---|---|
| No Prisma in `page.tsx` | imports of `@/lib/prisma` / `prisma.` | **0** / 88 | 35 | — | PASS |
| No `fetch` in `page.tsx` | `fetch(` in page files | **2** | — | `app/portal/accept-invite/page.tsx` (client page, 7 `useState`, form + fetch) · `app/portal/signin/page.tsx` | MOSTLY |
| No business logic / thin composition | `page.tsx` > 120 lines or ≥4 awaited calls | **9** long pages | — | `app/dashboard/org/users/[id]/page.tsx` (423 L of JSX) · `app/portal/projects/[id]/page.tsx` (417 L, 10 local helpers/components incl. `Stat`) · `app/dashboard/org/teams/[id]/page.tsx` (372 L) · `app/dashboard/objectives/[id]/page.tsx` (208 L) · `app/dashboard/activity/page.tsx` (168 L, 3 helpers) · `app/dashboard/insights/page.tsx` (149 L, 6 awaits + role checks) | PARTIAL (data is loaded through `*.server.ts`, but the presentation should move to feature components) |
| Client `page.tsx` files | `'use client'` pages | **5** | — | `app/dashboard/settings/account/page.tsx` (144 L) · `settings/notification-defaults` · `settings/notifications` · `app/portal/accept-invite` · `app/portal/signin` | Informational |

## 7. API routes (CLAUDE.md "API Routes", COMPONENT_CATALOG "API Helpers")

| Rule | Check | Count now | Baseline | Top offenders | Verdict |
|---|---|---:|---|---|---|
| Handlers wrapped (`withAuth/withRole/withFeature/withRoleOrFeature/withCronAuth/withPortalAuth/withPortalProject`) | exported GET/POST/PUT/PATCH/DELETE in 401 `route.ts` | **597 / 607** wrapped; 10 unwrapped, all intentionally public: `auth/{login,register,forgot-password,reset-password}`, `health`, `telegram/webhook` (secret-checked), `portal/invite` GET+POST (token), `wallpaper`, `client-errors`. The two NextAuth `[...nextauth]` routes re-export handlers | — | — | PASS |
| No manual `getServerSession` + 401 | manual session calls in routes | **1** | — | `app/api/client-errors/route.ts:66` (optional session on a public beacon, fine) | PASS |
| Standard envelope | `NextResponse.json({…})` without `success` | **8** (3 files) + 2 raw payloads | — | `app/api/telegram/webhook/route.ts:44` (5, `{ ok }`, Telegram protocol) · `app/api/health/route.ts:8` (2) · `app/api/auth/login/route.ts:79` · `app/api/pusher/auth/route.ts:95` (Pusher protocol, required) · `app/api/portal/projects/[id]/reports/[reportId]/route.ts:41` (raw DTO) | MOSTLY |
| Never `{ ok: true }` / `{ items }` / `{ todos }` | entity-keyed or `ok` payloads | **4** `apiSuccess({ ok: true })` | — | `app/api/users/[id]/org/route.ts:114` · `app/api/letters/[id]/views/route.ts:7` · `app/api/departments/[id]/members/[membershipId]/route.ts:82` · `app/api/departments/[id]/head/route.ts:31` | MOSTLY |
| Response helpers used | route files using `apiSuccess/apiError/…` | 369 / 401 | — | — | PASS |

## 8. Forms (CLAUDE.md "Forms")

| Rule | Check | Count now | Baseline | Top offenders | Verdict |
|---|---|---:|---|---|---|
| `react-hook-form`, not raw `useState` | `.tsx` files with `<form>`/`onSubmit` | **48 / 69** on RHF; **21** on `useState` | — | `features/projects/components/gantt/GanttChart.tsx:1196` (30 `useState`) · `components/todos-page/TodosPageClient.tsx:755` (18) · `features/letters/components/LetterFormClient.tsx:443` (18) · `features/projects/components/activity/ActivityDetailPanel.tsx:647` (18) · `features/projects/components/ScheduleTree.tsx:61` (14) · `features/projects/components/views/ProjectViewSwitcher.tsx:283` · `features/projects/components/TemplateBuilderClient.tsx:941` · `features/projects/components/TemplateListClient.tsx:313` · `features/sprints/components/SprintAddTaskInline.tsx:109` · `app/portal/accept-invite/page.tsx:93` | PARTIAL |
| (broader) inputs + mutation without RHF | `.tsx` with `<input/Textarea>` and POST/PATCH/PUT or `useMutation`, no RHF | **47 / 90** | — | `components/settings/permissions/UserRolesPanel.tsx` · `features/sprints/components/SprintListManager.tsx` · `components/work/WorkBoardClient.tsx` · `components/sprints/EndSprintModal.tsx` (many are inline editors, not forms) | Informational |
| Zod schemas, no inline validation | files using `zodResolver`/`zodFormResolver`; `if (!x.trim())` guards in non-RHF forms | **7** files with Zod; 6 inline guards (3 files) | — | shared resolver lives in `features/auth/services/zod-resolver` (should be `lib/`) | PARTIAL |

## 9. Accessibility floor (apple_pro_ux_guide §9, DESIGN_SYSTEM §8)

| Rule | Check | Count now | Baseline | Top offenders | Verdict |
|---|---|---:|---|---|---|
| Icons never standalone without `aria-label` | `<button>/<Button>` whose only content is icon(s), no `aria-label`/`title`/`sr-only` (JSX scanner; `IconButton label=` excluded) | **13** (8 files) | 21 | `features/projects/components/TemplateBuilderClient.tsx:491,623,653,756,781` (expand chevrons + 3 delete `Trash2`) · `components/work/WorkBoardClient.tsx:246` (`Plus`), `:307` (`X`) · `components/todos/CardChecklists.tsx:85` (checklist toggle: no name, no `role="checkbox"`/`aria-checked`) · `components/todos/CardComments.tsx:160` · `components/hierarchy/OkrHierarchyTable.tsx:687` · `features/admin-org/components/DepartmentsTab.tsx:151` · `features/projects/components/ScheduleTree.tsx:90` · `features/projects/components/TemplateListClient.tsx:199` (`MoreHorizontal`) | PARTIAL |
| Clickable non-interactive elements have role + keyboard | `div/span/li/tr/td/…` with `onClick` (stopPropagation wrappers, backdrops and `<label>` excluded) lacking `role` and `onKey*` | **8** of 22 (9 conform) | — | `features/projects/components/gantt/GanttChart.tsx:1431,1448` (milestone diamonds) · `components/customers/CustomerLookup.tsx:101` (`<li>` result options: no `role="option"`) · `components/sprints/EndSprintModal.tsx:388` · `components/todos/CardDatesPanel.tsx:79` · `components/todos-page/TodoKanbanView.tsx:195` (draggable card) · `components/todos-page/TodosPageClient.tsx:489` (`<tr onClick>`) · `features/letters/components/LettersTable.tsx:107` (documented intentional: row links are the focus targets) | MOSTLY |
| Tables scroll horizontally on mobile | `<table>` without `overflow-x-auto`/`ScrollArea` in the preceding 12 lines (the one hit, `LetterTemplatesClient.tsx:148`, was checked by hand and is wrapped 13 lines up) | **0 / 49** | Wave 3 target | — | PASS |
| Images have `alt` | `<img>`/`next/image` without `alt` | **0 / 51**; 21 `alt=""` (decorative) | — | spot-check `features/auth/components/AuthBackdrop.tsx:38` (3 decorative) | PASS |

## 10. RBAC / permissions / doctype guardrail (global rule, `lib/rbac.ts` header, `lib/permissions.ts`)

| Rule | Check | Count now | Baseline | Top offenders | Verdict |
|---|---|---:|---|---|---|
| Client UI gates on permission flags, not role strings | `role === 'ADMIN'` / `['ADMIN',…].includes(role)` in `'use client'` files | **30** (17 files); only **2** client files use `useEffectivePermissions` | — | `features/sprints-ai/components/GenerateSprintModal.tsx:46` (5) · `features/letters/components/LetterFormClient.tsx:53` (4) · `components/reports/ReportDashboardClient.tsx:97` · `components/shared/RisksPanel.tsx:99` · `components/todos/TodoCardModal.tsx:299` · `features/admin-org/components/{CompanyHeader:18,PeopleTab:205}` · `features/projects/components/baseline/RebaselineDialog.tsx:33` · `features/todos/components/{DeleteTodoButton:20,EditTodoButton:20,AssignUserButton:21,SetDueDateButton:21}` · `components/settings/{SettingsNav:73,UserDetail:98,UserManagement:117}` | **FAIL**. The client mirrors API rules by hand, so a feature/doctype grant or custom role in the permission manager won't show up in the UI. |
| Server pages gate via permissions, not role strings | role-string checks in server UI | **6** (4 files) | — | `app/dashboard/insights/page.tsx:134` · `app/dashboard/settings/travel/page.tsx:15` · `app/dashboard/settings/integrations/page.tsx:14` · `app/dashboard/settings/permissions/page.tsx:15` | PARTIAL |
| API routes use `can()`/`withFeature`/doctype checks, not inline roles (`lib/rbac.ts`: "MUST use `can()` instead of re-checking roles inline") | route files with inline role strings; files using `lib/rbac` / `canDocType` / `withFeature` / `withRole` / `lib/permissions` | **89** inline role checks in **41** route files; `lib/rbac` in 5, doctype checks in 10, `withFeature` in 15, `withRole` in 45, `lib/permissions` in 68 | — | `app/api/users/[id]/route.ts:67` (8) · `app/api/search/route.ts:19` (7) · `app/api/dtp/settings/route.ts:15` (4) · `app/api/dtp/trip-types/[id]/route.ts:14` (4) · `app/api/objectives/route.ts:74` (4) | PARTIAL |
| Nav is permission-gated | `lib/dashboard-navigation.ts` feature/permission keys | 15 gated entries (14 groups intact per design refresh) | — | — | PASS |

## 11. Design refresh: items still pending (`design_refresh_IMPLEMENTATION_STRATEGY.md`)

| Item | Check | Now | Plan / baseline | Verdict |
|---|---|---|---|---|
| **Browser / visual check** of Phases 1–8 + U1–U5 | tracker notes | **Not run** for any phase ("No browser check yet" ×6) | Phase 1 gate: "Full-app visual review, ~124 files" | **Open** (highest risk: dark mode was never looked at) |
| `Eyebrow` adoption | `Eyebrow` importers vs hand-rolled `uppercase tracking-*` | **8** vs **254 / 105 files** | 249 / 94 files | **Not started** (the count has grown) |
| `SectionHeading` extraction | importers outside `ui/`; byte-identical copies | **0** importers; `AppleDashboard.tsx:72` `SectionHeader` + `:81` `APCard` and `AppleAnalytics.tsx:23` `SectionHeader` still hand-rolled | §4 "delete both copies plus the duplicate `APCard`" | **Open** |
| `EntityPicker` consolidation | importers; legacy pickers | **2** importers; `LinkToOkrPopover`, `CheckInPickerModal`, `ParentObjectiveSelector`, `AddAlignedObjectiveModal`, `MetricMappingManager` still their own implementations | 11 implementations | **Open** |
| `FilterSelect` for filter `<select>`s | see §2 | 19 importers, 145 native | ~25 filter selects | PARTIAL |
| `Progress` call-site migration | importers of `ui/progress` | **14** | 7 hand-rolled copies → all migrated 2026-09-18 | PASS |
| `font-5/6/700` removal | count | **3** (`components/shared/AttachmentLightbox.tsx:102`) | 0 at Phase 7 gate | Regression |
| Broken `var(--text-sm …)` names | count | **0** | 18 | PASS |
| `.ap-glass` reads tokens | `app/globals.css:606` | uses `color-mix(… var(--ap-bg) …)` | §2.7 | PASS |
| Satellite palette: email `TOKENS` | `lib/email/templates/components.ts:19-22` | retargeted to new `--ap-*` hexes with source comments | §2.6 | PASS (still a hand-synced copy) |
| `DueDateChip` | component exists? | not built. `lib/todos/due-tone.ts` helper shipped (Phase 8) | deferred by decision | Deferred (OK) |
| §11 backlog (per-lane `+`, avatar stack, bulk dock, tabs in card modal, URL filter state, etc.) | — | not built | out of scope by Decision 0 | Deferred (OK) |
| Remaining raw `bg-white` | see §4 | 30 / 15 files | ~30 / 15 files at Wave 3 close | Held |

---

## 12. Prioritised fix list

| # | Gap | Severity | Effort | Suggested fix |
|---|---|---|---|---|
| 1 | **No browser/visual QA** of the token retarget, dark mode or refreshed shell/modal/board (every tracker row says so) | High | M (0.5–1 d, both themes, ~15 key routes) | Run a two-theme visual pass. It's also the only guard for token mistakes, since the repo has no visual tests. |
| 2 | **Client RBAC by role string** (30 checks / 17 client files; `useEffectivePermissions` in 2) and 89 inline role checks in 41 API route files | High (a doctype/feature grant or custom role diverges between UI and API) | L | Expose effective permission flags (feature + doctype) via `useEffectivePermissions` / server props. Start with the to-do action buttons (4 files), `TodoCardModal`, `RisksPanel`, `LetterFormClient`, `GenerateSprintModal`, then route `can()` adoption beginning with `app/api/users/[id]`, `app/api/search`, `app/api/dtp/**`. |
| 3 | **Dark-mode breakage in Org Admin + OKR Explorer Map** (`features/admin-org`, `features/strategy-map`): 54 hex, 10 inline `#fff` surfaces, 8 solid `bg-white`, 18 raw palette classes, 3 region spinners | High (visible light cards on dark app) | S–M (~12 files) | Give these two modules the Wave 3 area pass they missed: `--ap-bg-raised`/`surface-card`, `--ap-ok/warn/danger` for the confidence tones, `lib/chart-colors.ts`, Skeletons. |
| 4 | **StatCard not adopted** (5 importers vs ~15 local KPI tiles) | Medium | M | Migrate `KpiStrip` (AppleDashboard/AppleAnalytics), project report `Kpi`s, `ProgressTrackingPanel`, `CoordinatorConsole`, portal `Stat`. Rename `CreateCheckInModal`'s private `StatCard`. |
| 5 | **Eyebrow / SectionHeading never adopted** (254 hand-rolled eyebrows in 105 files; 0 SectionHeading importers; byte-identical `SectionHeader` copies still in AppleDashboard/AppleAnalytics) | Medium | M (codemod-able for the 54-occurrence majority pattern) | Codemod `text-caption font-semibold uppercase tracking-wide text-muted-foreground` → `<Eyebrow>`; delete the two `SectionHeader`s + `APCard`. |
| 6 | **13 unlabelled icon-only buttons** (incl. checklist toggle without `role="checkbox"`/`aria-checked`) + **8 clickable divs/rows** without role/keyboard | Medium (WCAG 4.1.2 / 2.1.1) | S | Add `aria-label`s (TemplateBuilderClient ×5, WorkBoardClient ×2, CardChecklists, CardComments, OkrHierarchyTable, DepartmentsTab, ScheduleTree, TemplateListClient). Give `CustomerLookup` options `role="option"`. Add a keyboard path for Gantt milestones and kanban cards. |
| 7 | **Forms on `useState`** (21 of 69 form files; Zod in 7) and shared Zod resolver living in `features/auth` | Medium | L (GanttChart/ActivityDetailPanel are big) | Start with modal/page forms: `LetterFormClient`, `TemplateBuilderClient`, `TemplateListClient`, `SprintAddTaskInline`, `portal/accept-invite`. Move `zod-resolver` to `lib/forms/`. |
| 8 | **Arbitrary type/radius values** (193 `text-[Npx]`, 113 `rounded-[Npx]`) and 91 template-literal classNames bypassing `cn()` | Low–Medium | M (mechanical) | `text-[13px]`→`text-body-sm`, `text-[9/9.5px]`→`Eyebrow size="sm"`/`text-micro`, `rounded-[8px]`→`rounded-[var(--ap-radius-sm)]` or `rounded-lg`. Convert template literals to `cn()`. |
| 9 | **Native `<select>` in filter bars** (145 total, 55 files) | Low–Medium | M | Move filter-role selects (PeopleTab, ProjectWorkspaceClient, registers, SprintListManager) to `FilterSelect`. Form-field selects can stay as the styled native wrappers. |
| 10 | **EntityPicker consolidation** (2 importers; ≥5 legacy OKR pickers) | Low | M | Migrate `CheckInPickerModal`, `ParentObjectiveSelector`, `AddAlignedObjectiveModal` onto `EntityPicker` + `useOkrOptions`, then delete `LinkToOkrPopover`. |
| 11 | **Fat route files** (`org/users/[id]` 423 L, `portal/projects/[id]` 417 L, `org/teams/[id]` 372 L; 2 portal pages `fetch` directly) | Low | S–M | Lift the JSX into `features/admin-org/components/*Profile.tsx` and `features/projects/components/portal/*`. Turn portal sign-in/accept-invite into feature components with RHF. |
| 12 | **Residual token nits**: 108 numeric `rgba()` (StatusPill washes, `rgba(0,0,0,.06)` hovers invisible in dark), 195 legacy `focus:ring-*`, 4 `text-white` on accent fills, 3 `font-600`, 4 `apiSuccess({ ok: true })`, 1 re-declared `UserRole`, 13 region spinners, 5 "Loading…" strings | Low | S each | Batch into one cleanup PR. `color-mix(in oklab, var(--ap-ok) 12%, transparent)` for the pill washes. |
| 13 | Barrel bypass from `app/` / `components/` into feature internals (20 `…/components/…` imports) | Low | S | Re-export `RouteStates`, `ProjectProgress`, `SprintReportClient`, `CreateCheckInModal`, `Portfolio*` from their barrels. Document that `services/*.server.ts` and API-route service imports are an allowed exception in `CONVENTIONS.md`. |

---

## Method (reproducible)

- Scope: every `.ts/.tsx/.js/.jsx` under `app/`, `components/`, `features/`, excluding `*.test.*`. `components/ui/**`
  is excluded where the check is about *consumers* (importers, hand-rolled overlays, `<h1>`, focus rings).
- Hex: `#[0-9a-f]{3,4,6,8}` preceded by a quote, space, `:`, `(`, `,` or `[` (anchors and `href="#…"` excluded).
  Cross-check: `rg -o -g '*.ts*' '#[0-9a-fA-F]{3,8}\b' app components features` → 91.
- Raw palette: `(bg|text|border|ring|ring-offset|from|to|via|fill|stroke|divide|outline|placeholder|decoration|accent|caret|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100…950)`,
  variant prefixes included. Cross-check with `rg` → 47.
- JSX checks (icon-only buttons, clickable non-interactive elements, images) use a brace/quote-aware opening-tag
  scanner, not a single regex. Icon-only = the button's children, once self-closing components/SVG and pure
  JSX conditionals are removed, contain no text, and the tag has no `aria-label`/`aria-labelledby`/`title`/spread
  and no `sr-only` child. `IconButton label=` counts as labelled.
- Spinner split: `animate-spin` whose preceding 6 lines contain `<button|<Button|type="submit"|disabled=` →
  in-button. Otherwise region.
- Boundaries: for each `page.tsx`, the nearest `loading.tsx` / `error.tsx` walking up to `app/` (Next.js App Router
  semantics: an ancestor segment's boundary wraps nested segments).
- API: each exported HTTP handler checked for being a call to one of the seven wrappers (aliased exports resolved).
- Known limits: regexes can't evaluate runtime class composition (e.g. colour names built in strings) or
  semantic intent (form-field vs filter `<select>`). Empty-state and KPI-tile detection are heuristics, so
  treat those counts as lower bounds. Measurement scripts were run from the session scratchpad and aren't
  committed.
