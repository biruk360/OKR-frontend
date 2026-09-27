# Component Catalog

> **Purpose:** Inventory of all reusable components. AI and developers check this before creating anything new. Updated after every component change.
>
> **2026-09-25 remediation (okr-mgt-75):** catalogued through the final state — Waves 1–3, Wave 4 G1–G7 (OKR Explorer / Insights components, `LinkTabs`, portal tabs, AI-guided creation, filters sort, scrum drafts), and H2–H5 / C1–C6 (comment attachments for activities and scrum, OKR realtime, thin-page `*.server.ts` loaders). **Removed 2026-09-25:** the whole `features/goals` module, `OKRLevelView`, `PlansList`, `TimelineBoard`, `ProgressPagePrintButton` (routes retired, see *OKR Explorer & Insights*).

## Auth / Sign-in (`features/auth`)

> Import from the barrel: `import { SignInScreen, AuthBackdrop, AuthHero, CompanySignature, SignInForm, SignUpForm, ForgotPasswordForm, ResetPasswordForm, AuthCard, AuthScreenLayout, useWallpaper } from '@/features/auth'`

| Component | Props | Purpose |
|-----------|-------|---------|
| `SignInScreen` | — | Whole sign-in page: backdrop + hero column + credentials card. `app/auth/signin/page.tsx` is a thin Suspense wrapper over it. |
| `AuthBackdrop` | `children` | Full-bleed rotating photo backdrop with crossfade, Ken Burns drift, contrast scrims, Bing-style caption chip and pause / shuffle controls. Reusable on any pre-auth screen. |
| `AuthHero` | — | Editorial column: brand lockup, time-aware greeting, rotating tagline, product pillars, today's date. Client-only values to avoid hydration mismatch. |
| `CompanySignature` | `align?` ('start' \| 'center'), `className?` | House signature — 360Ground™ & Eldix IT Technology PLC set as one typographic lockup, with a hairline rule. Left-aligned in the hero, centred in the footer below `lg`. |
| `SignInForm` | — | Credentials card — one grouped inset field block (mono micro-labels, hairline divider, row-lift + left-bar focus signature), solid-accent CTA with a `⏎` hint, single note line for validation / Caps Lock, custom remember-me mark, host eyebrow. `react-hook-form`; safe `callbackUrl` redirect. |

| `AuthScreenLayout` | `children`, `footnote?` | **New 2026-09-25 (F7).** The sign-in frame (photo backdrop, editorial hero on large viewports, card column) for the secondary auth screens — same grid/breakpoints as `SignInScreen`. |
| `AuthCard` (+ `AuthFieldGroup`, `AuthFieldRow`, `AuthNote`, `AuthAlert`, `AuthSubmitButton`, `AUTH_INPUT_CLASS`, `AUTH_LINK_CLASS`) | see file | **New.** Glass card and field idiom shared by forgot/reset (visually identical to `SignInForm`, which keeps its own copy). oklch literals on purpose — it sits on a photograph, not an app surface. |
| `ForgotPasswordForm` | — | **New.** `react-hook-form` + `forgotPasswordSchema`; success copy is conditional because the API never reveals whether the email exists. |
| `ResetPasswordForm` | — | **New.** Choose a new password from `/auth/reset-password?token=…` (reset 1 h or invite 7 d token). Must render under Suspense. |
| `SignUpForm` | — | **New.** No role picker (server forces EMPLOYEE); shows a "pending activation" state because new accounts are inactive until an admin activates them. |

Hook: `useWallpaper()` → `{ current, previous, imageReady, source, index, count, paused, togglePaused, next }`. Fetches `/api/wallpaper`, picks a frame that differs from the previous visit, preloads before swapping, auto-rotates every 20 s (off under `prefers-reduced-motion`).

Services: `safeCallbackUrl(raw)` (open-redirect guard), `fetchWallpapers(signal)`, `pickStartIndex(images, lastShownId)`, `FALLBACK_SCENES`, `registerSchema` / `signUpFormSchema` (+ `PASSWORD_MIN_LENGTH`/`MAX`), `forgotPasswordSchema`, `resetPasswordFormSchema`, `zodFormResolver` (Zod → react-hook-form resolver, no new dependency).

## OKR Period Close (`components/shared`, `components/period-close-report`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `OkrCloseModal` | `open`, `onClose`, `entityType`, `entity`, `onInitiated?`, `onCommitted?`, `achievedShortcut?` | Shared three-step grade → retrospective → confirm-and-lock flow for Objectives and KRs. |
| `OkrReopenDialog` | `open`, `onClose`, `entity`, `entityType`, `onReopened?` | Reason-required reopen confirmation with permanent-scar and rolled-copy warnings; Objective KRs are opt-in. |
| `OkrLockBanner` | `entityType`, `reopenCount?`, `closedAt?` | Read-only closed-state banner explaining frozen fields and permanent reopen scars. |
| `RolledFromBanner` | `entityType`, `previous?`, `next?`, `lineageDepth?` | Immediate predecessor/successor provenance plus previous-period grade, progress, confidence, check-ins, note, and retrospective panel. |
| `PeriodCloseReportClient` | `report` | Period close KPIs, charts, lessons, ledger, PDF action, and sequenced personal close flow. |

## Daily Trip Plan (`features/daily-trip-plan`)

> Import from the barrel: `import { PlanEditor, CoordinatorConsole, MovementSheetView, RunSheetView, PoolConsole, TravelSettingsForm, TravelHome, dtpApi } from '@/features/daily-trip-plan'`

| Component | Props | Purpose |
|-----------|-------|---------|
| `TravelHome` | — | Employee dashboard surface — recent plans + create-or-open CTA |
| `PlanEditor` | `planId`, `isRequester?` | Two-column plan detail: stops list + status timeline + audit log + sticky footer (submit / withdraw / clone / delete) |
| `StopList` | `planId`, `stops`, `readOnly?`, `showDiff?` | Stop cards with edit / remove + Coordinator-adjustment diff strip |
| `StopEditorModal` | `open`, `onClose`, `initial?`, `onSubmit`, `busy?` | Full stop form (where / when / how / what / logistics) — used for both add and edit |
| `PlanTimeline` | `plan`, `events?` | Vertical state-machine timeline for a plan |
| `StatusBadge` | `status`, `className?` | Pill renderer for the 14 DTP statuses |
| `CoordinatorActions` | `plan` | Approve / Return / Reject action bar — used inside the plan-detail header |
| `CoordinatorConsole` | — | Pending-plans list + KPI strip + filters (date / late / emergency) |
| `MovementSheetView` | `deptId`, `date` (YYYY-MM-DD) | Office-facing Daily Movement Sheet with print CSS + signature blocks |
| `RunSheetView` | `driverId`, `date`, `driverMode?` | Driver-facing Daily Run Sheet — leg cards + confirm-pickup/drop-off buttons |
| `PoolConsole` | — | Pool Coordinator assignment table |
| `TravelSettingsForm` | — | Sectioned admin settings form (SLAs, working hours, traffic, optimization, channels) |
| `dtpApi` | — | Typed fetch client — call from server actions or other features |

Hooks (TanStack Query) exported from the same barrel: `usePlans`, `usePlan`, `useTripTypes`, `useDrivers`, `useVehicles`, `useMovementSheet`, `useRunSheet`, `useDtpSettings`, `useCreateOrOpenPlan`, `useAddStop`, `useUpdateStop`, `useDeleteStop`, `usePlanTransition`, `useAssignDriver`, `useSetLegStatus`, `useUpdateSettings`, `useInvalidatePlan`.

## Daily Scrum (`features/scrum`)

> Import from the barrel: `import { ScrumHome, ScrumWinsPage, ScrumSettingsPage, ScrumActivityPanel } from '@/features/scrum'`

| Component | Props | Purpose |
|-----------|-------|---------|
| `ScrumHome` | `ScrumHomeProps` | `/dashboard/scrum`: submit/update form, month/week/day/streak/analytics views, filters + saved views, deep links, blockers, celebrate, absences. |
| `ScrumWinsPage` | `currentUserId` | Wins feed with author and Celebrate. |
| `ScrumSettingsPage` | — | Scrum settings form (gated by `canReadScrumSettings`/`canWriteScrumSettings`). |
| `ScrumActivityPanel` | see file | Daily scrum activity panel injected on objective/KR/project pages (S11.2). |
| `ScrumUpdateCard` (internal, forwardRef) | update, member map, actions | **New 2026-09-25 (F4).** One update card: celebrate, comment thread, blocker resolve/escalate. |
| `ScrumMonthView` / `ScrumWeekView` / `ScrumDayView` / `ScrumStreakView` / `ScrumAnalyticsView` / `ScrumPanelSkeleton` (internal, `ScrumCalendarViews.tsx`) | see file | **New (F4).** Calendar views; month dots and week days open the day view. |
| `ScrumResolveBlockerDialog` / `ScrumEscalateBlockerDialog` (internal) | see file | **New (F4).** Resolve (note ≥5 chars) / escalate on the shared `Modal`. |
| `ScrumAbsenceModal` (internal) | see file | **New (F4).** Record an excused absence for self or a report. |
| `ScrumSavedViewsMenu` (internal) | see file | **New (F4).** Save/apply/delete filter views (`ConfirmDialog` on delete). |

Services exported from the same barrel: working-day utilities, `serializeScrumUpdate()` mood privacy serializer, `access` (`canEditScrumUpdateResolved`, `canActOnScrumUpdate`, `canReadScrumSettings`, `canProxyFor`, …), `html` (`escapeScrumHtml`, `sanitizeScrumRichText` — allowlist, server-side), `view-state` (`parseScrumDeepLink`, `isoWeekBounds`, `normalizeSavedViewFilters`, …), `mood-alert` (`shouldSendTeamMoodAlert`, thresholds 3 reporters / 50 %). `drafts` (G7, 2026-09-25): `SCRUM_DRAFT_STATUS` (`'DRAFT'`), `SUBMITTED_SCRUM_STATUSES`, `SUBMITTED_SCRUM_UPDATE_WHERE` / `excludeScrumDrafts(where)` — **spread into every scrum read that counts attendance, submissions, metrics, wins, analytics or the calendar** (`drafts.test.ts` enforces it) — and `isScrumDraft`. `ScrumUpdateCard` comments take file attachments (`CommentAttachment` `SCRUM`) through `AttachmentPicker`.

## AI Automations (`features/automations`)

| Component | Props | Notes |
|---|---|---|
| `AutomationList` | — | Automations the caller owns: mode badge, schedule summary, next/last run, consecutive-failure warning. Links to detail. |
| `AutomationDetail` | `id` | Distribution-mode control (DRY_RUN / REVIEW / AUTO), Run now, **Run test run**, pause/resume, run timeline with cost and duration. Promotion to AUTO opens a `ConfirmDialog` naming the recipient count. Polls the timeline only while a run is in flight. |
| `AutomationEditPage` | `id` | Loads an automation, then renders `AutomationForm` in edit mode. |
| `AutomationForm` | `automation?` | Creates **or edits** an automation by form (one component for both, so the plan is always built by the same code): basics, schedule preset + anchors, internal entities/scope, optional Odoo record type + staleness window, briefing objective, recipients. Builds the `PlanSpec` and the tool grants the worker executes. Renders the Odoo section disabled with a reason when Odoo is unconfigured (`GET /api/automations/tools`). A **Compile into a plan** button fills every field from a natural-language instruction and shows what the model assumed. When editing, widening changes are confirmed against a grouped plan diff before saving. `react-hook-form`. |
| `BriefingView` | `id` | Renders the server-produced Briefing HTML (escaped server-side in `lib/automations/render.ts`), with dry-run / pending-review / published banners and Approve-and-send. |
| `BriefingList` | `automationId?` | Every briefing the caller owns or was sent, with new/changed counts and status. |
| `RunTranscript` | `runId`, `onClose` | Modal showing one run's per-step trace — tool, resolved args, duration, rows, preview, error. Refused steps are styled distinctly from failed ones. Owner/admin only. |
| `TestRunPanel` | `automationId`, `mode` | **Run test run**: triggers a run, polls the run detail every 2s, renders each step as it lands, then drops the finished briefing inline — so verifying an automation does not mean navigating away and guessing when it finished. Polling stops at the terminal status rather than on a timer. Warns before running when the automation is in `AUTO`, because a test run there emails real people. |
| `PromoteFindingModal` | `briefingId`, `finding`, `onClose` | Turns a Finding into a Todo or Risk (FR-12), pre-filled, with a back-link to the briefing. Always manual. |
| `PlanDiffView` | `diff` | Grouped plan-version diff (FR-03). Widening changes — more often, more sources, more recipients, higher cap — are marked and sorted first. |
| `AutomationSettingsForm` | — | Admin org settings (FR-18). The global pause sits outside the form so the kill switch never waits on a Save. |
| `ModeBadge` | `mode`, `showHint?` | Distribution mode pill; the hint states plainly whether recipients get email. |
| `StatusBadge` / `RunStatusBadge` | `status` | Automation lifecycle and run-status pills using semantic design tokens. |

---

## Performance & Scorecard (`features/performance`)

> Import from the barrel: `import { PerformanceHome, TemplatesWorkspace, TemplateBuilder, CyclesWorkspace, EvaluatorQueue, ScoringWorkspace, ActionsWorkspace } from '@/features/performance'`

| Component | Props | Purpose |
|-----------|-------|---------|
| `PerformanceHome` | — | Employee focus cards, weekly-step entry, sealed reviews, and finalized history |
| `TemplatesWorkspace` | — | Template family/version list, create/publish/fork/archive actions, and role mappings |
| `TemplateBuilder` | `templateId` | Draft tier/criterion editor, rubric anchors, metric rules, culture block insertion, and native drag-drop reordering for tiers/criteria |
| `CultureLibraryManager` | — | Admin editor for reusable criterion-library entries (C1-C6 + custom); bilingual anchor editor; create/toggle-active |
| `RoleMappingManager` | — | Maps normalized employee designations to scorecard families |
| `MetricMappingManager` | `templateId`, `tiers` | Maps employee-owned Key Results to reusable metric criteria |
| `CyclesWorkspace` | — | Review-cycle creation (with inline validation), open/close-cycle actions (close supports incomplete-evaluation override), and issues drill-down |
| `CycleIssuesModal` | `cycleId`, `open`, `onClose` | Per-cycle issue list (type/employee/detail/status) with Resolve/Waive actions |
| `EvaluatorQueue` | — | Evaluator/admin work queue |
| `ScoringWorkspace` | `evaluationId` | Keyboard-driven scoring, live metric actuals, submission, calibration, panel management, consolidation retry, and report access |
| `PanelManager` | `evaluation` | Evaluator panel editor (add/remove evaluators, set lead) with submitted-score discard confirmation |
| `CalibrationPanel` | `evaluation` | Side-by-side evaluator score comparison for calibration, flag-resolution notes, and report/finalization workflow controls |
| `PerformanceReport` | `evaluation` | Employee-safe consolidated report and acknowledgement/dispute actions |
| `ActionsWorkspace` | — | HR recommendation approval/rejection/execution queue |
| `PerformanceStatusBadge` | `status`, `className?` | Status chip in the shared StatusPill visual language (colored dot + humanized label, AP rgba tints); also exports `humanizeEnum()` |
| `SectionCard` (internal) | `title?`, `actions?`, `children`, `className?`, `contentClassName?` | Apple Pro section card (rounded-[14px], `var(--ap-border)`, uppercase kicker header) used across the performance module |
| `NativeSelect` (internal) | native `<select>` props (forwardRef) | Styled native select matching `components/ui/input.tsx`; react-hook-form `register()`-compatible |
| `CompetencyRadar` | `items`, `height?` | Single-series competency radar (% of max per axis); `radarItemsFromTierBreakdown()` derives tier- or criterion-level axes from a report tierBreakdown |
| `PerformanceTrend` | `points`, `height?` | Multi-cycle normalized-score line chart (0-100); single point renders a "more data needed" note |
| `OkrAttainmentSection` | `attainment` | Employee-scoped OKR attainment list (objectives + KRs with progress bars) for the evaluation period |
| `TemplateScoringSettings` | `templateId`, `editable`, `tiers`, `gatekeeperJson`, `bandsJson` | Gatekeeper + decision-bands editor with inline validation, saved via template PATCH |

Hooks and API client are exported from the same barrel. Server-side scoring, policy, cycle-opening, consolidation, report, and finalization services live in `lib/performance/`. Shared anchor helpers (`anchorEn`, `anchorAm`, `buildAnchorValue`) live in `features/performance/components/anchor-helpers.ts`.

## Shared UI Primitives (`components/ui/`)

> Import from the barrel: `import { Modal, ConfirmDialog, EmptyState, StatCard, StatGrid, PageHeader } from '@/components/ui'`

| Component | Props | Replaces | Status |
|-----------|-------|----------|--------|
| `Modal` | `open`, `onClose`, `title`, `icon?`, `iconClassName?`, `size?` (sm/md/lg/xl/2xl/**940**), `children`, `footer?`, `closeOnBackdrop?`, `closeOnEsc?`, `hideHeader?`, `scrollBehavior?` ('outside'/'internal'), `stickyHeader?`, `showCloseButton?`, `preventInitialFocus?`, **`accentColor?`** | 19 duplicate modal wrappers (all migrated including CreateCheckInModal) | DONE — sizes are **additive only**, never remapped (50 importers). `940` is the first fixed-px size; `accentColor` paints the 6px top strip and is deliberately *not* bound to status. |
| `ConfirmDialog` | `open`, `onClose`, `onConfirm`, `title`, `message`, `description?`, `variant?` (danger/warning/info), `icon?`, `confirmLabel?`, `cancelLabel?`, `isLoading?`, `disabled?`, `bullets?`, `bulletsTitle?`, `details?`, `extraContent?` | Delete/Archive modals for Objectives, KRs, Todos, Teams | DONE |
| `EmptyState` | `icon?`, `title`, `description?`, `action?` (ReactNode), `bare?`, `className?` | 8+ identical empty-state blocks | DONE |
| `StatCard` | `label`, `value`, `icon?`, `iconText?`, `tone?` (blue/green/yellow/red/purple/gray/indigo), `trend?` {value, direction}, `helperText?`, `onClick?` | Repeated stat cards across 8+ pages | DONE — adopted in 7 dashboard pages |
| `StatGrid` | `children`, `columns?` (2/3/4/5) | Repeated grid layouts for stat cards | DONE |
| `PageHeader` | `title`, `description?`, `actions?` (ReactNode), `breadcrumb?` | Repeated page header + action bar patterns | DONE |
| `Popover` / `PopoverTrigger` / `PopoverContent` / `PopoverAnchor` / `PopoverClose` | `PopoverContent`: `label` (required a11y name), `heading?`, `showClose?`, `align?`, `sideOffset?`, `className?`, **`width?`** (px), **`variant?`** ('menu' \| 'panel'), **`shadow?`** | Hand-rolled absolutely-positioned popovers (date picker, card panels, OKR link, background picker) | DONE — Radix-backed; gives outside-click, Escape, focus management and collision-aware positioning. `heading` (not `title`) is the visible header, so it cannot clash with the HTML `title` attribute. `width` also **selects the shadow step** (`--ap-shadow-pop-sm…panel`) so call sites never pick elevation by hand; omit it to keep the legacy 300px + `--ap-shadow-lg`. |
| `Eyebrow` | `children`, `size?` ('sm' 9.5px/.12em \| 'md' 10px/.1em \| 'default' 11px), `align?`, `mono?`, `as?`, `className?` | 249 hand-rolled eyebrows across 94 files (3 sizes, 5 tracking values, 4 weights, 4 colour tokens) | NEW — ⚠ **the default is non-mono on purpose.** Not one of the 249 existing eyebrows is mono, so a mono default would be 249 regressions. `default` reproduces the 54-occurrence majority exactly; `mono` is opt-in for the redesigned surfaces. |
| `SectionHeading` | `title`, `right?`, `size?`, `mono?`, `bordered?`, `as?`, `className?` | 7 hand-rolled card/section header rows (`AppleDashboard.tsx:68` and `AppleAnalytics.tsx:22` are byte-identical) | NEW — extraction, not net-new: lifted out of `ui/dashboard/DashboardCard.tsx`, which now consumes it. |
| `FilterSelect` | `label`, `value?`, `onValueChange`, `options[]` ({value,label,hint?,disabled?}), `placeholder?`, `clearable?`, `onRemove?`, `searchThreshold?` (6), `width?`, `menuWidth?` (190), `disabled?`, `emptyLabel?` | ~25 native `<select>` filters + 2 hand-rolled popovers | NEW — ⚠ **a thin styled wrapper over `ui/select.tsx` (Radix), deliberately.** A div-based popover would lose listbox roles, type-ahead and arrow-key roving. **Single-select only** — Radix Select has no multi-select mode and the accessible multi-select pattern is a checkbox group, not a listbox. |
| `FilterMultiSelect` | `label`, `values[]`, `onValuesChange`, `options[]` ({value,label,hint?,leading?: ReactNode,disabled?}), `placeholder?` ('All'), `summary?` ((selected) => string; default `N selected`), `ariaLabel?`, `searchThreshold?` (6), `menuWidth?` (260), `align?`, `renderTrigger?` (({text,count,open}) => node), `triggerClassName?`, `triggerStyle?`, `disabled?`, `emptyLabel?`, `clearLabel?` ('Clear') | Sprint board's native assignee `<select>` | NEW 2026-09-25 — the multi-select companion to `FilterSelect`, built on Radix `DropdownMenuCheckboxItem` (`menuitemcheckbox`, arrow-key roving, type-ahead). Menu stays open while toggling; search box past the threshold; Clear row when anything is selected. Spec: `docs/card_comments_links_board_filter_REQUIREMENTS.md` AFL-9. |
| `EntityPicker` | `value`, `onChange`, `selectable?` ('keyResult' \| 'objective' \| 'both'), `objectives?`, `query?`, `recentKey?`, `showRecents?`, `placeholder?`, `width?`, `disabledIds?`, `disabled?`, `emptyLabel?` | 11 independent OKR search-and-pick implementations | NEW — promoted from `components/sprints/LinkToOkrPopover.tsx` (the most complete: recents, cascading expand, both entity types) and generalised. Fetches via `useOkrOptions`. The original file stays in place until its call sites migrate. |
| `MiniBadge` | `children`, `color?` (legacy), `tone?` (neutral/accent/ok/warn/danger/ahead), `mono?`, `className?` | Count/status pills | PROMOTED to the main barrel from `ui/dashboard/`. **This is also the count chip — do not add a `CountChip`.** `color` still wins over `tone` so the 10 existing call sites are byte-identical. |
| `Progress` | `value`, `height?` (6), `fill?` (`--ap-ok`), `track?` (`--ap-kr-bar-bg`), `className?` | 7 hand-rolled `ProgressBar` copies (`OkrAttainmentSection`, `NestedObjectivesList`, `SprintBoardClient`, `SprintsListClient`, `ResultsList`, `OkrHierarchyTable`, `OkrsAllClient`) | ADOPT — primitive now matches the design (6px, 99px radius, tokenised track/fill) and is Radix-backed so the value reaches assistive tech. **The 7 call sites are not migrated yet.** |
| `ScrollArea` / `ScrollBar` | `ScrollArea`: `orientation?` ('vertical' \| 'horizontal' \| 'both'), `scrollBarClassName?` | — | CHANGED — the Root used to hardcode a single vertical `<ScrollBar>`, so horizontal scrollers had no thumb. Default is still `vertical`, so no existing call site changes. |

### Usage Examples

**Modal with form content:**
```tsx
import { Modal } from '@/components/ui'
import { Target } from 'lucide-react'

<Modal
  open={open}
  onClose={onClose}
  title="Create Objective"
  icon={Target}
  size="md"
  footer={
    <>
      <button className="btn-outline" onClick={onClose}>Cancel</button>
      <button className="btn-primary" onClick={handleSubmit}>Create</button>
    </>
  }
>
  {/* form fields here */}
</Modal>
```

**ConfirmDialog for delete:**
```tsx
import { ConfirmDialog } from '@/components/ui'

<ConfirmDialog
  open={open}
  onClose={onClose}
  onConfirm={handleDelete}
  title="Delete Objective"
  message="This action is permanent and cannot be undone."
  description="You are about to permanently delete this objective and all its associated data."
  variant="danger"
  confirmLabel="Delete Permanently"
  loadingLabel="Deleting..."
  isLoading={isDeleting}
  bullets={[
    'The objective itself',
    `All associated key results (${objective._count?.keyResults || 0})`,
    'All progress tracking data',
    'All comments and activity history',
  ]}
/>
```

**EmptyState:**
```tsx
import { EmptyState } from '@/components/ui'
import { Target } from 'lucide-react'

<EmptyState
  icon={Target}
  title="No objectives yet"
  description="Create your first objective to get started."
  action={<button className="btn-primary" onClick={onCreate}>Create Objective</button>}
/>
```

**StatCard + StatGrid:**
```tsx
import { StatCard, StatGrid } from '@/components/ui'
import { Target, CheckSquare } from 'lucide-react'

<StatGrid columns={4}>
  <StatCard label="Company Objectives" value={objectives.length} icon={Target} tone="blue" />
  <StatCard label="Key Results" value={krCount} iconText="KR" tone="green" />
  <StatCard label="Completed" value={completed} tone="purple" trend={{ value: '+12%', direction: 'up' }} />
  <StatCard label="At Risk" value={atRisk} tone="red" />
</StatGrid>
```

## Shared Components (`components/shared/`)

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| `ActivityLogPanel` | `components/shared/ActivityLogPanel.tsx` | `entityType`, `entityId` | Displays activity audit trail for any entity |
| `CommentAttachments` | `components/shared/CommentAttachments.tsx` | `attachments` | Renders a comment's attachments. Also exports **`useAttachmentViewer(attachments)`** — the single owner of how an attachment opens (`open`, `markBroken`, `isBroken`, `viewer`). Any new attachment surface must use this hook, not its own click handler; `lib/attachments/viewer-invariants.test.ts` enforces it. |
| `UserAvatar` / `UserAvatarStack` | `components/shared/UserAvatar.tsx` | `UserAvatar`: `user` ({id,name,avatar?}), `size?`, `ring?`, `className?`, **`tooltip?`** (default true), `tooltipDetail?`, `tooltipSide?` (forwards refs) · `UserAvatarStack`: `users`, `size?`, `max?`, `showNames?`, `detail?` ((u) => string) | The one avatar. Every avatar shows the person's full name in a styled hover card (UNH, `docs/user_name_hover_REQUIREMENTS.md`); pass `tooltip={false}` only where the full name is printed beside it. The stack's "+N" lists the hidden names. Colours from `lib/user-color.ts`. Never used under `/portal` (project invariant 4). |
| `PersonTooltip` / `PeopleTooltip` | `components/shared/UserAvatar.tsx` | `PersonTooltip`: `person` ({id?,name?,email?,avatar?}), `detail?`, `children` (ref-able trigger), `side?`, `align?`, `whenTruncated?` (opens only when the child text is clipped), `disabled?` · `PeopleTooltip`: `people`, `children`, `heading?`, `side?`, `limit?` (8) | The hover card itself: 28px avatar, full name, optional secondary line from data already on the page (never fetches). Radix Tooltip via the app-wide `TooltipProvider` in `app/providers.tsx`; 180 ms fade/scale, off under reduced motion; renders above `Modal`. Wrap clipped names with `whenTruncated`. |
| `LinkPreviewList` / `LinkPreviewCard` | `components/shared/LinkPreview.tsx` | `html`, `className?` / `url` | Link previews (favicon, site name, title, 2-line description, thumbnail, domain) for up to 3 URLs found in rich-text HTML. Rendered in the card modal (comments, replies, `CardDescription`) and, since 2026-09-25 (G2), in OKR comments (`OkrComments`). Uses `useLinkPreview`. Renders text nodes only, never page HTML; https-only images with no referrer. Client code imports `@/lib/link-preview/extract` and `/types` directly — the `@/lib/link-preview` barrel is server-only. |
| `CopyLinkButton` | `components/shared/CopyLinkButton.tsx` | `value` \| `getValue`, `label?`, `copiedLabel?`, `successMessage?`, `errorMessage?`, `iconOnly?`, `title?` | The single copy-to-clipboard control. Falls back to `document.execCommand` where `navigator.clipboard` is unavailable (non-HTTPS origins, older Safari) and reports a real failure instead of a false success. Use this rather than calling `navigator.clipboard.writeText` inline. |
| `AttachmentLightbox` | `components/shared/AttachmentLightbox.tsx` | `items`, `startId`, `onClose` | Full-size preview for images and PDFs, with arrows, download, size and failure placeholder. Built on `components/ui/Modal`. Reached through `useAttachmentViewer`, not directly. |
| `EntityLink` | `components/shared/EntityLink.tsx` | `entity`, `type` | Navigation link to objective/KR/todo detail |
| `TimeframeBadge` | `components/shared/TimeframeBadge.tsx` | `timeframe` | Badge display for timeframe (Q1 2025, etc.) |
| `LiveAnnouncer` + `announce()` | `components/shared/LiveAnnouncer.tsx` | none (mounted once in `app/layout.tsx`) | The app's only `aria-live` region. Call `announce('message')` or `announce('message', 'assertive')` from anywhere — no context, no prop drilling. Use for changes with no focus change (kanban moves, optimistic saves, bulk actions). |
| `notificationIcon()` / `notificationTypeLabel()` | `components/shared/notification-icon.ts` | `type: string` | Icon + tone for a notification, keyed off its `type`/`eventKey`. Shared by the header bell, `/dashboard/notifications` and the sprint Inbox so one event cannot render three different ways. Not a component — a mapping. |
| `MoveOkrModal` | `components/shared/MoveOkrModal.tsx` | `open`, `onClose`, `kind: 'OBJECTIVE' \| 'KEY_RESULT'`, `entity`, `disabledIds?`, `onMoved?` | Re-parent an objective or re-file a key result. One modal for both because the interaction is identical; they differ only in the field name and in what the picker refuses. Built on `EntityPicker` + `useOkrOptions`. Surfaces the server's rejection verbatim — "would create a circular dependency", "must be in the same timeframe" — rather than a generic failure. |
| `LinkTabs` | `components/shared/LinkTabs.tsx` | `items: { key, label, href, icon? }[]`, `activeKey`, `ariaLabel`, `variant?: 'tabs' \| 'segmented'`, `className?` | **New 2026-09-25 (G6).** URL-synced tab strip — each tab is a plain `<Link>` to its own URL (server pages, no client state). `tabs` = underlined page tabs, `segmented` = compact preset pills. Used by the OKR Explorer (views + levels) and Insights. Reuse it for any tab strip whose state belongs in the URL. |
| `OkrComments` | `components/shared/OkrComments.tsx` | see file | OKR comment thread (objective page since 2026-09-25, `KeyResultDetailClient`): link previews (G2), file attachments, live updates on the OKR private channel (H3). Server side gated by `canAccessOkrComments`. |

## Layout Components (`components/layout/`)

| Component | File | Description |
|-----------|------|-------------|
| `DashboardShell` | `components/layout/DashboardShell.tsx` | Main dashboard layout wrapper (sidebar + header + content) |

## Feature Components

> The Phase 5 migration is done: objectives, key results, todos and sprints live under `features/[name]/components/` and are imported from their barrels (`features/goals` was deleted 2026-09-25). The old `components/objectives|keyresults|goals` folders no longer exist.

### Objectives (`features/objectives/components/`)

| Component | Type | Notes |
|-----------|------|-------|
| `CreateObjectiveModal` | Form modal | MIGRATED to Modal + useReferenceData (keeps external API) |
| `EditObjectiveModal` | Form modal | MIGRATED to Modal + useReferenceData |
| `DeleteObjectiveModal` | Confirm modal | MIGRATED to ConfirmDialog |
| `CloneObjectiveModal` | Form modal | MIGRATED to Modal |
| `ObjectivesList` | List | Renders objective list with filters |
| `NestedObjectivesList` | List | Hierarchical objective view |
| `CreateObjectiveButton` | Trigger | Opens CreateObjectiveModal |
| `CreateCompanyObjectiveButton` | Trigger | → Merge into CreateObjectiveButton(level="COMPANY") |
| `CreateDepartmentObjectiveButton` | Trigger | → Merge into CreateObjectiveButton(level="DEPARTMENT") |
| `CreateIndividualObjectiveButton` | Trigger | → Merge into CreateObjectiveButton(level="INDIVIDUAL") |
| `EditObjectiveButton` | Trigger | Opens EditObjectiveModal |
| `DeleteObjectiveButton` | Trigger | Opens DeleteObjectiveModal |
| `CloneObjectiveButton` | Trigger | Opens CloneObjectiveModal |
| `ArchiveObjectiveButton` | Action | Direct archive action |
| `UnarchiveObjectiveButton` | Action | Direct unarchive action |
| `ObjectiveActionsMenu` | Menu | Objective overflow menu; onDelete wired and every item gated by `lib/okr/action-permissions.ts` (`canDeleteObjective`, `canCloneObjective`) — 2026-09-25 F2. |

Services (barrel): `createObjectiveSchema` / `createObjectiveResolver` / `buildCreateObjectivePayload` / `childLevelFor` (`services/create-objective-schema.ts`), `conservativeObjectivePermissions` / `NO_OBJECTIVE_PERMISSIONS` (`services/objective-permission-flags.ts`).

### Key Results (`features/key-results/components/`)

| Component | Type | Notes |
|-----------|------|-------|
| `AddKeyResultModal` | Form modal | MIGRATED to Modal |
| `EditKeyResultModal` | Form modal | MIGRATED to Modal |
| `DeleteKeyResultModal` | Confirm modal | MIGRATED to ConfirmDialog |
| `ArchiveKeyResultModal` | Confirm modal | MIGRATED to ConfirmDialog |
| `ArchiveObjectiveButton` | Trigger | MIGRATED — now uses ConfirmDialog (warning variant) instead of `window.confirm()` |
| ~~`OKRLevelView`~~ | — | **Deleted 2026-09-25** — the Company/Department OKR pages became OKR Explorer level presets (`?level=company\|department`). |
| `CloneKeyResultModal` | Form modal | MIGRATED to Modal |
| `CreateCheckInModal` | Form modal | On `Modal` (`stickyHeader`, internal scroll) with the progress chart |
| `KeyResultActionsMenu` | Menu | KR lifecycle actions; clone gated by `canCloneKeyResult` (2026-09-25 F2) |
| `KeyResultDetailClient` | Page client | KR detail; renders `OkrComments` with link previews (G2) |
| `KeyResultsList` | List | KR list under an objective |
| `AddKeyResultButton` | Trigger | Opens AddKeyResultModal |
| `EditKeyResultButton` | Trigger | Opens EditKeyResultModal |
| `DeleteKeyResultButton` | Trigger | Opens DeleteKeyResultModal |
| `CloneKeyResultButton` | Trigger | Opens CloneKeyResultModal |
| `ArchiveKeyResultButton` | Trigger | Opens ArchiveKeyResultModal |
| `UnarchiveKeyResultButton` | Action | Direct unarchive action |

### Todos (`features/todos/components/` + card modal in `components/todos/`)

| Component | Type | Notes |
|-----------|------|-------|
| `LazyTodoCardModal` | Lazy wrapper | **New 2026-09-25 (P3).** `next/dynamic(TodoCardModal, { ssr: false })`. **Use this, not `TodoCardModal`,** from pages/boards — used by the dashboard layout, `GlobalInitiativeDetail`, `TodosPageClient`, `WorkBoardClient`, `SprintBoardClient`. |
| `TodoCardModal` | Card modal | Split 2,778 → 1,143 lines (Wave 3) into the `Card*` pieces below; still the orchestrator. |
| `CardHeader` · `CardAttributes` · `CardDescription` · `CardChecklists` · `CardAttachments` · `CardComments` · `CardActivityFeed` (`ActivityFeed`) · `CardDatesPanel` (`DatesPanel`) · `CardPickers` (`CardMemberPicker`, `CardLabelsPanel`) · `CardRail` (+ `CardActionCluster`) · `CardLinkedOkr` (`LinkedOkrCard`) · `CardModalBits` (`Avatar`, `DueDateBadge`, `StatusPill`, `PriorityPill`, `ChecklistProgress`) | Card modal sections | Internal to the card modal: header/breadcrumb/meta; members-labels-due-priority grid; Tiptap description + link previews; checklists; attachment grid via `useAttachmentViewer`; comment composer/thread/attachments; activity; dates popover; member/label pickers; right rail; linked OKR card; small shared bits. Types in `cardModalTypes.ts`, date helpers in `cardDateUtils.ts`. |
| `CardCommentUploads` (`components/todos/CardCommentUploads.ts`) | Helpers | **New (G2).** `stageCardCommentFiles`, `discardStagedCardCommentFiles`, `cardCommentAttachmentSrc`, `isCommentAttachmentUrl` — card comment files go through `/api/comment-attachments` (`commentType: 'TODO'`). |
| `useTodoStatusToggle` | Hook | Single status-toggle implementation used by `ToDoList` (the `MyTasksList` duplicate was deleted 2026-09-25). |
| `EditTodoModal` | Form modal | MIGRATED to Modal |
| `DeleteTodoModal` | Confirm modal | MIGRATED to ConfirmDialog |
| `AssignUserModal` | Form modal | MIGRATED to Modal |
| `SetDueDateModal` | Form modal | MIGRATED to Modal |
| `ToDoList` | List | Main todo list with status toggle |
| `EditTodoButton` | Trigger | Opens EditTodoModal |
| `DeleteTodoButton` | Trigger | Opens DeleteTodoModal |
| `AssignUserButton` | Trigger | Opens AssignUserModal |
| `SetDueDateButton` | Trigger | Opens SetDueDateModal |

### Dashboard (`components/dashboard/`)

| Component | Type | Notes |
|-----------|------|-------|
| `MyOKRsPage` | Page component | My OKRs: the viewer's own and contributed objectives (rendered under `CheckInQueue` on `/dashboard/my-okrs`) |
| `AppleDashboard` | Page component | Home dashboard; opens the check-in picker on `?checkin=1` (`useOpenCheckInPicker` from `components/cmdk/check-in-due-hints.ts`) |
| `CheckInQueue` | Widget | **New 2026-09-25 (F1).** Due check-ins (from `lib/okr/check-in-queue.ts` `loadCheckInQueue`) on My OKRs |
| `SectionError` | Error boundary body | **New (Wave 3).** Props `{ error, reset, section }`. Reports to `/api/client-errors`, recovers stale chunks, renders `EmptyState` + "Try again". Use it as the body of any dashboard `error.tsx`. |
| `CheckInBanner`, `HeroStats`, `NeedsAttention`, `QuickStats`, `TeamActivityFeed`, `UserOkrTree`, `AppleAnalytics` | Widgets | Live home/analytics widgets |

> **Deleted 2026-09-25** (orphans, nothing imported them): `AtAGlanceRow`, `ConfidenceTracker`, `DashboardStats`, `MyActivityFeed`, `RecentObjectives`, `SprintWidget`, `TopSummaryBoxes`.

> `ProgressOverview.tsx` was **deleted** 2026-09-18. It rendered a hardcoded
> 7-point 2024 series behind a fake 1s loading delay as "Average progress across
> all objectives", ignoring the `userId` prop it took. Nothing imported it, but
> one mount would have shipped a fabricated chart. `/api/filters/progress-timeseries`
> and `/api/my/nav-progress` return the real series if the widget is ever rebuilt.

### OKR Explorer & Insights (2026-09-25, G6)

| Component | File | Props | Notes |
|-----------|------|-------|-------|
| `OkrsAllClient` | `app/dashboard/okrs-all/OkrsAllClient.tsx` | `currentUser`, `createPermissions` (from `canCreateObjective`), `scope?: ExplorerScope` | Explorer **List** view: KPIs, filter strip, rows, detail drawer, bulk archive/restore. Split into `OkrsAllFilterStrip`, `OkrsAllListChrome`, `OkrsAllRows`, `OkrsAllDetailDrawer`, `OkrsAllPrimitives`, `OkrsAllTabsBar`, `okrs-all-utils.ts`. |
| `OkrHierarchyTable` | `components/hierarchy/OkrHierarchyTable.tsx` | `scope?: ExplorerScope` | Explorer **Tree** view (moved from `app/dashboard/okr-hierarchy/`); reads `/api/okr-hierarchy`; filter pills locked by the level preset are hidden (`lockedScopeKeys`). |
| `ExplorerTimelineView` | `app/dashboard/okrs-all/ExplorerTimelineView.tsx` | — | Explorer **Timeline** view: `PlansGantt` loaded client-only (dhtmlx touches `window`). |
| `ExplorerMapView` | `app/dashboard/okrs-all/ExplorerMapView.tsx` | `viewer`, `timeframeId?`, `mode?` | Explorer **Map** view: strategy map (`features/strategy-map`) + `OKRHierarchy` org mode over `loadAlignmentMapData`. |
| `ExplorerCreateHandoff` | `app/dashboard/okrs-all/ExplorerCreateHandoff.tsx` | — | Renders no button: opens `CreateObjectiveModal` for the Cmd-K "Create objective" intent and for `?createUnder=<objectiveId>` (the map's "Add aligned objective", parent pre-filled) — the hand-offs that used to land on the retired `/dashboard/objectives`. |
| `ProgressDashboardPanel` / `ProgressTrackingPanel` | `components/insights/` | `{ data }` | Insights **Progress** tab (`view=dashboard` / `tracking`); data from `lib/okr/insights-data.ts`. `ProgressReportWeeklyBars` is the 10-week status chart. |
| `PeriodClosePicker` | `components/insights/PeriodClosePicker.tsx` | — | Insights **Period close** tab: pick a timeframe → `/dashboard/okrs-all/period-report/[timeframeId]`. |
| `PrintButton` | `components/insights/PrintButton.tsx` | — | Print action in the Insights header (Progress tab). |

Helpers: `lib/okr/explorer-params.ts` — `EXPLORER_VIEWS` (`list`, `tree`, `timeline`, `map`, `analyze`), `EXPLORER_LEVELS` (`all`, `company`, `department`, `mine`, `team`), `LEVEL_AWARE_VIEWS`, `parseExplorerView/Level`, `explorerHref`, `scopeForLevel`, `lockedScopeKeys`, `INSIGHTS_TABS`, `PROGRESS_VIEWS`, `parseInsightsTab`, `insightsHref`. Retired routes: `lib/retired-routes.js` (`RETIRED_ROUTE_REDIRECTS`, `retiredRouteRedirects()` for `next.config.js`).

### Goals (`features/goals/`) — REMOVED 2026-09-25

> The whole module (`CreateGoalModal`, `GoalsFeedView`, `GoalsFilterBar`, `GoalsListView`, `GoalsPageClient`,
> `GoalsSummaryDashboard`, `GoalsTabBar`, `GoalsTable`, `MyTeamView`, `services/goal-tab-queries.ts`,
> `services/goals-api.ts`, `index.ts`) was deleted after `/dashboard/goals` was retired — it now redirects to
> `/dashboard/okrs-all?level=mine`. Use the OKR Explorer (List view with the `mine` level) instead.

### Card visuals (`lib/card-visuals.ts`)

Not a component — the shared palette + pattern + contrast helpers used by card labels and covers.
Import these instead of writing hex literals.

| Export | Signature | Description |
|--------|-----------|-------------|
| `CARD_PALETTE` | `CardSwatch[]` | The ten shared swatches (key, label, `--ap-card-*` token, hex, default pattern). Labels and covers both draw from this. |
| `swatchStyle` | `(color, { colorBlind?, pattern?, ink? }) => CSSProperties` | Background for a colour chip; applies the colour-blind texture only when the viewer's preference is on. |
| `resolvePattern` | `(pattern, color) => CardPattern` | Stored pattern if valid, else one derived deterministically from the colour. |
| `readableInk` | `(hex) => '#1D1D1F' \| '#FFFFFF'` | Title ink for full-bleed covers; every palette colour is unit-tested to reach ≥4.5:1. |
| `contrastRatio` / `relativeLuminance` | `(hex, hex) => number` / `(hex) => number` | WCAG 2.1 maths behind `readableInk`. |

### Sprint board views (`features/sprints/`)

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| `SprintBoardHeader` | `features/sprints/components/SprintBoardHeader.tsx` | `SprintBoardHeaderProps` | **New 2026-09-25 (G1).** Board header, actions (Members, share via `CopyLinkButton`, AI) and the filter row: people (`FilterMultiSelect`), labels (incl. "no label"), due, watching, linked. |
| `SprintBoardLane` | `features/sprints/components/SprintBoardLane.tsx` | `SprintBoardLaneProps` | **New (G1).** One kanban list. |
| `AddTaskInline` | `features/sprints/components/SprintAddTaskInline.tsx` | see file | **New (G1).** Inline add-card composer. |
| `useBoardKeyboardMove` | `features/sprints/components/useBoardKeyboardMove.ts` | hook | **New (G1).** Keyboard lift/move/drop with live announcements. |
| Board types | `features/sprints/components/sprintBoardTypes.ts` | — | `BoardUser`, `BoardTodo`, `BoardColumn`, `BoardSprint`, `BoardData`. |
| `SprintInboxView` | `features/sprints/components/SprintInboxView.tsx` | `dark?` | The board's Inbox tab. Renders the notification feed from `useNotificationStore` with per-row mark-read and a Mark-all-read action. Replaced a static "Inbox is coming soon" panel — a selectable dock tab that went nowhere. |
| `SprintMembersDialog` | `features/sprints/components/SprintMembersDialog.tsx` | `sprintId`, `open`, `onClose` (see file) | Invite-only boards: list participants, add via `FilterMultiSelect` over `useUsersForSelection`, remove with confirmation. Calls `POST/DELETE /api/sprints/[id]/participants` one person at a time, so a stale dialog can't wipe out someone auto-invited meanwhile. Opened from the board header's **Members** button. |

### Sprint board lists (`features/sprints/`)

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| `AddListColumn` (default) | `features/sprints/components/SprintListManager.tsx` | `sprintId`, `dark?`, `onCreated` | Trailing "+ Add another list" column. Inline name input + required status mapping; keeps the typed name on a duplicate-name 409. |
| `ListHeaderMenu` | `features/sprints/components/SprintListManager.tsx` | `sprintId`, `lane` (`LaneSummary`), `lanes`, `disabled?`, `onChanged` | Per-lane "…" menu: rename, change status mapping (warns with the affected card count), archive (requires a destination when the lane holds cards). Disables archive for the last lane and the last Done lane, mirroring the server guards. |

### Sprints (`features/sprints/components/`, `components/sprints/`)

| Component | Type | Notes |
|-----------|------|-------|
| `SprintBoardClient` | Board | Trello-style kanban board, 1,210 → 757 lines (G1). Filters compiled by `lib/sprints/board-filters.ts`; live refresh via `useRealtimeRefresh` on `private-sprint-<id>`. |
| `components/sprints/{AddToSprintDropdown,EndSprintModal,LinkToOkrPopover,ScheduleSprintModal}` | Misc | Sprint helpers still in `components/sprints/`. (`SprintCardModal` no longer exists — cards open `TodoCardModal`.) |

### Settings (`components/settings/`)

| Component | Type | Notes |
|-----------|------|-------|
| `CreateTeamModal` | Form modal | MIGRATED to Modal |
| `EditTeamModal` | Form modal | MIGRATED to Modal |
| `DeleteTeamModal` | Confirm modal | MIGRATED to ConfirmDialog |
| `TeamsManagement` | Page section | Team CRUD with empty state (duplicate) |
| `UserManagement` | Page section | User CRUD (uses useState, not react-hook-form — INCONSISTENT). Props: `{ initialUsers, currentUserId, currentUserRole }`. Includes an accessible admin-only Project Manager capability switch backed by `/api/users/[id]/project-manager-capability`, plus a Shield button per row opening a `<Modal size="xl">` with Roles \| Info tab strip and `<UserRolesPanel>`. |
| `AuditLogsView` | Page section | Audit log viewer with empty state (duplicate) |
| `OKRRulesManagement` | Page section | react-hook-form |
| `BrandingManagement` | Page section | react-hook-form |
| `IntegrationsManagement` | Page section | Existing email/Slack react-hook-form settings plus an Administrator-only `AiProviderSettingsPanel` slot. Props: `{ showAiProviderSettings? }`. |
| `AiProviderSettingsPanel` | Page section | Project Creation P0.5–0.7 masked OpenAI credential insert/rotation/removal, approved model, caps, live connection testing, distinct safe outcomes, needs-verification state, last-verified display, and an independent project-creation AI master toggle. Uses react-hook-form/Controller, Skeleton, Checkbox, Button, and ConfirmDialog; full key is write-only and cleared after save. |
| `SettingsSelect` | Form select | **New 2026-09-25 (Wave 3 area A).** `components/settings/SettingsSelect.tsx`. Props `value`, `onValueChange`, `options: {value,label,group?,disabled?}[]`, `placeholder?` ('Select…'), `disabled?`, `id?`, `className?`, `size?` ('sm'\|'default'), `aria-label?`. Thin option-list wrapper over Radix `components/ui/select` replacing native `<select>` in Settings (17 files); `group` renders `SelectGroup` headings (replaces `<optgroup>`). `''` shows the placeholder — never pass `''` as an option value. Use `FilterSelect` for filter bars, this for labelled form fields. |
| `UserDetail` | Page section | `/dashboard/settings/users/[id]` detail; ADMIN-only destructive actions (delete = anonymise). |
| `TimeframeManagement` | Page section | Timeframe create/edit on react-hook-form + zod (`zodFormResolver`) since 2026-09-25 (G7); labels linked to controls. |
| `ByRoleTab` (`permissions/`) | Tab panel | Role create/rename/delete (`RoleFormModal` + `ConfirmDialog`); system roles locked (2026-09-25 F6). |
| `LetterPermissionsManagement` | Page section | 3-tab component: Role Matrix (toggle grid), User Overrides (per-user grant/revoke), Letter Types (LetterTypeDef CRUD). Consumes `/api/settings/letter-permissions/roles`, `/api/settings/letter-permissions/users`, `/api/letters/types`. ADMIN-only. |

### Permission Manager Tabs (`components/settings/permissions/`)

| Component | Type | Notes |
|-----------|------|-------|
| `UserRolesPanel` | Panel | (2026-09-25 G7: removals/revocations confirm through `ConfirmDialog`.) Props: `{ userId, userName, currentUserId }`. Four sections: Role Profiles (assign/remove), Individually Assigned Roles (assign with optional expiry/revoke), User-Specific Overrides (add/remove with doctypeKey, featureKey, action, overrideType, reason, expiresAt), Effective Permissions (read-only, with "Preview as User" button). Shows self-mod banner and hides all action buttons when `userId === currentUserId`. Uses `/api/permissions/users/{id}`, `.../profiles`, `.../roles`, `.../overrides`. |
| `EffectivePermissionsPreview` | Modal | Props: `{ userId, userName, onClose }`. Full-screen overlay modal. Three sections: (1) Nav Preview — simulated sidebar with green/gray dot per module + collapsible page sub-items; (2) Why can/can't they do X? — DocType + Action selectors with plain-English result (ok/no/warn); (3) DocType Permissions Table — grouped by module, collapsible, shows Read/Write/Create/Delete/Submit columns + Scope. Fetches `GET /api/permissions/preview/{userId}`. |
| `ByDocTypeTab` | Tab panel | Select a DocType (grouped `<optgroup>` by module), fetch all roles + per-doctype role permissions from `GET /api/permissions/doctypes/{key}` + `GET /api/permissions/roles`. Renders Role × 9-Actions grid (checkbox cells) plus a per-row Scope dropdown (own/department/all). Each cell toggle fires `PUT /api/permissions/roles/{roleId}/permissions`. Scope change propagates to all granted actions for that role. Optimistic updates with rollback. |
| `FieldLevelsTab` | Tab panel | Select a DocType, then renders fields table: fieldName, displayLabel, permLevel dropdown (0–3), isSensitive checkbox. Save button fires `PUT /api/permissions/doctypes/{key}/fields`. Preview panel below table shows "Level 0 visibility" and "Level 0+1 visibility" field lists derived from live state. |
| `RecordScopingTab` | Tab panel | (2026-09-25 G7: add-rule form on react-hook-form + zod.) Role + DocType dual selectors. Fetches `GET /api/permissions/roles/{id}/scope-rules`, filters by doctypeKey client-side. Rules table: #, Field, Operator, Value Type, Status toggle (`PUT .../scope-rules/{ruleId}`), Delete (`DELETE .../scope-rules/{ruleId}`). Inline Add Rule form (fieldName, operator, valueType, staticValue) submits via `POST .../scope-rules`. Multi-rule AND note shown when >1 rule present. |
| `FeaturesTab` | Tab panel | Role selector; fetches `GET /api/permissions/roles/{id}/features`. Two-panel layout (40/60%). Left: feature tree grouped into Modules, Pages (OKR), Pages (Letters), Pages (DTP), Admin, Widgets; green dot = visible, gray = hidden. Right: visible + enabled toggles with 500ms debounce auto-save via `PUT .../features`; amber banner when parent feature is hidden (inherited OFF). |
| `ExplainPanel` | Tab panel | Self-contained "Permission Check" panel. User dropdown (from `/api/users/for-selection`), DocType selector (8 hardcoded options), Action selector (read/write/create/delete/submit/export). On submit calls `GET /api/permissions/explain?userId=&doctypeKey=&action=`. Displays green/red allowed badge, explanation text, and detail rows (adminBypass, explicitDeny, explicitGrant, roleGrants, scopingApplied, scopeRules). No props. |

## Feature Barrels (`features/`)

Strangler-pattern barrels. Import from these for new code:

| Feature | Path | Contents |
|---|---|---|
| AI Automations | `features/automations/index.ts` | `AutomationList`, `AutomationDetail`, `AutomationForm`, `BriefingView`, `ModeBadge`, `StatusBadge`, `RunStatusBadge`, `TestRunPanel`, `automationsApi`, `useAutomations`, `useAutomation`, `useAutomationRuns`, `useAutomationSettings`, `useAutomationTools`, `useBriefing`, `useBriefings`, `useCompileInstruction`, `useCreateAutomation`, `useRunAutomationNow`, `useRunDetail`, `useSetMode`, `useSetStatus`, `useApproveBriefing`, `useDeleteAutomation`, `usePromoteFinding`, `useUpdateAutomation`, `useUpdateAutomationSettings` |
| Objectives | `@/features/objectives` | modals, buttons, lists, `ObjectiveActionsMenu`, create-objective schema + permission-flag services, shared form/filter types |
| Key Results | `@/features/key-results` | modals, buttons, chart, `KeyResultsList`, `KeyResultActionsMenu`, `KeyResultDetailClient`, confidence/form types |
| Todos | `@/features/todos` | modals, buttons, `AddToDo`, `ToDoList`, form types (`MyTasksList` deleted 2026-09-25) |
| Sprints | `@/features/sprints` | `SprintBoardClient`, `SprintsListClient`, `SprintBoardData` type |
| Letters | `@/features/letters` | `LettersPageClient`, `LetterFormClient`, `LettersTable`, `CreateLetterModal`, `LetterStatusBadge`, `LetterStatusBar`, `CustomerLookup`, `LetterTypeSelect`, `SuperDocEditorClient`, `EnclosuresPanel`, `PdfPreviewPanel`, `MarkAsSentModal`, `RejectLetterModal`, **`LetterReportsClient`**, **`LetterTemplatesClient`** (both new 2026-09-25 G3) |
| Auth | `@/features/auth` | see *Auth / Sign-in* above |
| Scrum | `@/features/scrum` | see *Daily Scrum* above |

Root barrel: `@/features` exposes namespace objects (`objectives`, `keyResults`, `todos`, `sprints`, `performance`, `projects`, `scrum`) if a consumer needs multiple features.

## Shared Hooks (`hooks/`)

> Import from the barrel: `import { useDebounce, useUsersForSelection, useTimeframes, useDepartments, useReferenceData } from '@/hooks'`

| Hook | File | Returns | Description |
|------|------|---------|-------------|
| `useDebounce(value, delay)` | `hooks/useDebounce.ts` | `T` | Debounce any value by delay |
| `useUsersForSelection()` | `hooks/useUsersForSelection.ts` | `{ users, isLoading, isError, error, refetch }` | Fetch active users for owner/assignee dropdowns (React Query cached) |
| `useTimeframes({ activeOnly? })` | `hooks/useTimeframes.ts` | `{ timeframes, isLoading, isError, error, refetch }` | Fetch timeframes for dropdowns (React Query cached) |
| `useDepartments()` | `hooks/useDepartments.ts` | `{ departments, isLoading, isError, error, refetch }` | Fetch departments with counts (React Query cached) |
| `useReferenceData({ users?, timeframes?, departments?, activeTimeframesOnly? })` | `hooks/useReferenceData.ts` | `{ users, timeframes, departments, isLoading, isError, errors, refetch }` | Combined hook for forms needing all three (parallel fetch) |
| `useOkrOptions({ status?, ownerId?, timeframeId?, level?, limit?, requireKeyResults?, enabled? })` | `hooks/useOkrOptions.ts` | `{ objectives, isLoading, isError, error, refetch }` | Objectives **with nested key results** for any OKR picker (React Query cached, 60s stale). Replaces two competing fetch strategies for the same data: `LinkToOkrPopover` called `/api/objectives` *and* `/api/key-results` and re-joined them client-side; `/api/objectives` already returns `keyResults`, so one request does it. |
| `useRealtimeRefresh({ channel, events, onRefresh, debounceMs?, maxWaitMs?, ignoreActorId?, shouldDefer?, enabled? })` | `hooks/useRealtimeRefresh.ts` | `void` | **New 2026-09-25 (G1).** Subscribes to a private Pusher channel and calls `onRefresh` debounced (400 ms, max wait 2 s); skips events whose actor is `ignoreActorId`; `shouldDefer` postpones while e.g. a drag is in flight. No-op without Pusher. Used by the sprint board; the payload is only a signal — always refetch. |
| `useLinkPreview(url)` | `hooks/useLinkPreview.ts` | `{ preview, isLoading, isError }` | Page metadata from `GET /api/link-preview` (React Query, 24 h stale, no retry). Also exports `linkPreviewQueryKey` and the `LinkPreviewData` type. |

### Usage Examples

**Single reference data source:**
```tsx
import { useUsersForSelection } from '@/hooks'

const { users, isLoading } = useUsersForSelection()
```

**All three (forms):**
```tsx
import { useReferenceData } from '@/hooks'

const { users, timeframes, departments, isLoading } = useReferenceData()
// replaces: Promise.all([fetch('/api/users/for-selection'), fetch('/api/timeframes'), fetch('/api/departments')])
```

**Caching:** All hooks share the React Query cache with a 1-minute staleTime (set in `app/providers.tsx`). Opening the same modal twice in under a minute will NOT trigger a refetch — one of the main token/network savings.

## Zustand Stores (`lib/stores/`)

| Store | File | Description |
|-------|------|-------------|
| `useTodoStore` | `lib/stores/todo-store.ts` | Todo filters, selection state |
| `useNotificationStore` | `lib/stores/notification-store.ts` | In-app notification feed + server-supplied `unreadCount`. `fetch(limit)`, `markRead(id)`, `markAllRead()`, each with optimistic update and rollback on `!res.ok`. Mounted by the header bell and `SprintInboxView`, so marking read in one clears the badge in the other. (It is **not** toast state — toasts are `react-hot-toast`.) |
| `useUserPrefsStore` | `lib/stores/user-prefs-store.ts` | User preferences (sidebar vs modal view) |

## API Helpers (`lib/api/`)

> Import from the barrel: `import { withAuth, withRole, apiSuccess, apiError, ... } from '@/lib/api'`

### Route Wrappers

| Wrapper | Purpose | Example |
|---------|---------|---------|
| `withAuth(handler)` | Enforces session. Returns 401 envelope if absent. Catches all thrown errors. | `export const GET = withAuth(async (req, { session }) => apiSuccess(data))` |
| `withRole(roles, handler)` | Enforces session + role whitelist. Returns 403 if role not allowed. | `export const POST = withRole(['ADMIN','EXECUTIVE'], async (req, { session }) => ...)` |

Handler signature: `(req: NextRequest, ctx: { session: Session, params: P }) => Promise<NextResponse>`

### Response Helpers

| Function | Status | Envelope |
|----------|--------|----------|
| `apiSuccess(data, { status?, message? })` | 200 default | `{ success: true, data }` |
| `apiPaginated(data, pagination, opts?)` | 200 | `{ success: true, data, pagination: { page, limit, total, totalPages } }` |
| `apiError(error, { status?, code?, details? })` | 500 default | `{ success: false, error, code?, details? }` |
| `apiUnauthorized(msg?)` | 401 | error envelope with `code: UNAUTHORIZED` |
| `apiForbidden(msg?)` | 403 | error envelope with `code: FORBIDDEN` |
| `apiNotFound(msg?)` | 404 | error envelope with `code: NOT_FOUND` |
| `apiBadRequest(msg, details?)` | 400 | error envelope with `code: BAD_REQUEST` |
| `apiValidationError(msg, details?)` | 422 | error envelope with `code: VALIDATION_ERROR` |
| `apiConflict(msg, details?)` | 409 | error envelope with `code: CONFLICT` |

### Error Handler

`handleApiError(error, context?)` — auto-called by `withAuth`/`withRole`. Detects Prisma codes (P2002 → 409, P2025 → 404) and falls back to 500.

### Example Migration

**Before (16 lines):**
```ts
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSessionSafe()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const users = await prisma.user.findMany(...)
    return NextResponse.json({ success: true, users })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**After (4 lines):**
```ts
export const GET = withAuth(async () => {
  const users = await prisma.user.findMany(...)
  return apiSuccess(users)
})
```

## Utilities (`lib/utils.ts`)

| Function | Description |
|----------|-------------|
| `cn(...inputs)` | Merge Tailwind classes (clsx + `extendTailwindMerge`). Since 2026-09-25 it knows the custom font sizes (`display`, `page-title`, `section-title`, `overline`, `body`, `body-sm`, `caption`, `micro`), so `text-body-sm text-ink-secondary` no longer drops the size (`lib/utils-cn.test.ts`). |
| `formatDate(date, format?)` | Format date string (date-fns) |
| `formatRelativeTime(date)` | "3 hours ago" format |
| `calculateProgress(current, target, start?)` | Progress percentage (0-100) |
| `getProgressColor(progress)` | Tailwind classes for progress color |
| `getProgressBarClass(progress)` | Solid bar fill class |
| `getConfidenceColor(confidence)` | Tailwind classes for ON_TRACK/AT_RISK/OFF_TRACK |
| `truncateText(text, maxLength)` | Truncate with ellipsis |
| `capitalizeFirst(str)` | Capitalize first letter |
| `isValidEmail(email)` | Email regex validation |
| `getErrorMessage(error)` | Extract error message from unknown |
| `hasPermission(userRole, requiredRole)` | **DEPRECATED** — use `lib/permissions.ts` instead |
| `canEditObjective(userRole, level)` | **DEPRECATED** — use `lib/permissions.ts` instead |


## Design-system helpers (2026-09-25, Wave 3)

| Export | File | Description |
|--------|------|-------------|
| Palette tokens as CSS variables | `tailwind.config.js`, `app/globals.css` | `surface-*`, `ink-*`, `primary/success/warning/danger-*` resolve to `rgb(var(--rgb-*) / <alpha-value>)`; dark values under `:root.dark` (toggled by `app/theme-body-class.tsx`). One accent: `--ap-accent-lch`. `primary`/`secondary` have `DEFAULT` + `foreground`. Light values are pinned to the old hex by `lib/design-tokens.test.ts`. |
| `text-caption` (11px) / `text-micro` (10px) | `tailwind.config.js` | Size-only type tokens. **Never write `text-[11px]`/`text-[10px]`** — all were converted. |
| `chartColors`, `ChartColor`, `STATUS_CHART_COLOR`, `chartAlpha(color, pct)`, `chartTooltipStyle`, `chartAxisTick` | `lib/chart-colors.ts` | Recharts colours from tokens — use instead of hex in any chart. |

## Server libraries (2026-09-25 remediation)

Not components — the shared server helpers new code must reuse.

| Export(s) | File | Purpose |
|-----------|------|---------|
| `loadViewerContext`, `makeViewerContext`, `buildObjectiveVisibilityWhere`, `buildKeyResultVisibilityWhere`, `canViewObjectiveInMemory`, `canViewKeyResultInMemory`, `redactObjectiveForViewer`, `redactKeyResultForViewer`, `SEES_ALL_ROLES` | `lib/okr/visibility-scope.ts` | One OKR visibility rule, in SQL and in memory. Private rows are redacted unless ADMIN/EXECUTIVE, owner or owner's manager. `lib/permissions.ts` `canViewObjective`/`canViewKeyResult` delegate here. |
| `canDeleteObjective`, `canCloneObjective`, `canCloneKeyResult` | `lib/okr/action-permissions.ts` (re-exported by `lib/permissions.ts`) | Prisma-free action gates for OKR menus (client-safe). |
| `PROGRESS_HEALTHY_MIN` (70), `PROGRESS_WARNING_MIN` (40), `progressBand`, `countByGoalStatus`, `completionRate` | `lib/okr/progress-thresholds.ts` | Shared status thresholds. |
| `loadCheckInQueue` · `classifyCheckInDue`, `summarizeCheckInsDue`, `momentumFromPeriodAverages` | `lib/okr/check-in-queue.ts` · `lib/okr/dashboard-home.ts` | Check-in queue and home dashboard derivations. |
| `parseRetrospectiveInput`, `sanitizeRetroRichText` | `lib/okr/retrospective-input.ts` | Retrospective validation + sanitising (stored-XSS fix). |
| `withCronAuth`, `checkCronAuth`, `verifyCronRequest`, `MIN_SECRET_LENGTH` (16) | `lib/cron-auth.ts` | **Every `/api/cron/*` route must use `withCronAuth`.** Header-only, timing-safe, fail-closed (503). |
| `hitRateLimit`, `peekRateLimit`, `AUTH_RATE_LIMITS`, `clientIp`, `emailKey`, `rateLimitedResponse` | `lib/security/rate-limit.ts` | In-memory sliding-log limiter (per process) — 429 `RATE_LIMITED` with `Retry-After`. |
| `generateAuthToken`, `hashAuthToken`, `authTokenLookupValues`, `HASHED_TOKEN_PREFIX`, `isAuthTimeStale`, `authTimeFromClaims` | `lib/security/auth-tokens.ts` | CSPRNG reset/activation tokens stored as `sha256:` hashes; session staleness vs `User.passwordChangedAt`. |
| `verifyCredentials`, `reissueSessionCookie`, `SESSION_MAX_AGE` | `lib/auth.ts` | The one credentials check (NextAuth + `/api/auth/login`). |
| `EMAIL_CADENCES`, `DEFAULT_EMAIL_CADENCE` (`BATCHED`), `SELECTABLE_CADENCES`, `CADENCE_LABEL`, `resolveEffectivePref`, `seedCadenceFor` | `lib/notifications/cadence.ts` | Email cadence vocabulary and preference resolution. |
| `emit` (deferred delivery), `emitNow` (awaits delivery) · `createEmitter`, `mapWithConcurrency`, `DELIVERY_CONCURRENCY`, `RECIPIENT_CONCURRENCY` | `lib/notifications/dispatcher.ts` · `lib/notifications/fanout.ts` | Request handlers call `emit`; crons/scripts/workers call `emitNow`. |
| `runAfterResponse(label, work)`, `flushBackgroundWork(timeoutMs?)`, `pendingBackgroundWork`, `setBackgroundScheduler` | `lib/background.ts` | Run slow side effects after the response; long-running scripts must `flushBackgroundWork()` before exit. |
| `pruneRetainedTables`, `RETENTION_RULES`, `retentionDays` | `lib/retention/prune-tables.ts` | Nightly retention for append-only tables (env-overridable, min 7 days). |
| `deletedAccountData`, `deletedAccountName`, `deletedAccountEmail`, `isDeletedAccountEmail` | `lib/users/deleted-account.ts` | Admin delete = anonymise, records kept. |
| `webhookSecretMatches`, `isAskAllowed`, `allowedChatIdsFromEnv`, `checkAskRateLimit` | `lib/telegram/access.ts` | Telegram webhook secret + `/ask` allowlist and limits. |
| `WIRED_AI_PROVIDERS`, `isWiredAiProvider` | `lib/ai/providers/wired.ts` | Only offer AI providers that are actually wired (`openai`). |
| `compileBoardFilter`, `cardMatchesLabels`, `cardMatchesDue`, `isWatchingCard`, `countActiveFilters`, `readBoardFilters`/`serializeBoardFilters`, `NO_LABEL_FILTER_ID` | `lib/sprints/board-filters.ts` | Sprint board facets (G1). |
| `sprintRealtimeChannel`, `parseSprintRealtimeChannel`, `SPRINT_REALTIME_EVENTS`, `isOwnRealtimeEvent` | `lib/sprints/realtime.ts` | `private-sprint-<id>` channel naming/events; server broadcasts with `broadcastSprintEvent` (`lib/pusher.ts`). |
| `hydrateTodoCommentAttachments`, `resolveCommentAttachments`, `deleteTodoCommentAttachments`, `parseLegacyAttachmentIds` | `lib/attachments/todo-comments.ts` | To-do comments on `CommentAttachment` (G2). |
| `persistProjectFile`, `resolveProjectAttachmentPath`, `deleteProjectFile`, `PROJECT_UPLOAD_ROOT` | `lib/attachments/project-storage.ts` | Private project activity uploads. |
| `sanitizeLetterBodyHtml`, `escapeHtml`, `resolveLetterFont`, `isAllowedPdfRequestUrl` | `lib/letter-sanitize.ts` | Server-side letter HTML allowlist (no DOM needed) and PDF request allowlist. |
| `buildLetterReadWhere`, `checkLetterReadAccess`, `letterReadGuard` | `lib/letter-access.ts` | Letter read scope for every letter read route. |
| `buildLetterReport`, `parseReportFilters`, `aggregateLetterReport` | `lib/letter-reports.ts` | FR-16 report. |
| `ensureLetterTemplatesSeeded`, `listLetterTemplates`, `parseLetterTemplateCreate/Update`, `resolveTemplateBodyForNewLetter` | `lib/letter-templates.ts` | `LetterTemplate` CRUD helpers. |
| `persistEnclosureFile`, `readEnclosureFile`, `deleteEnclosureFile`, `LETTER_UPLOAD_ROOT` · `letterEnclosureDownloadUrl`, `LETTER_ENCLOSURE_ACCEPT` | `lib/letter-enclosure-storage.ts` · `lib/letter-enclosures.ts` | Real enclosure files (private storage). |
| `grantPortalAccess`, `resetPortalCredential`, `revokePortalAccess`, `acceptPortalInvite`, `listProjectPortalAccounts` · `sendPortalInviteEmail` | `lib/projects/portal-accounts.ts` · `lib/projects/portal-account-audit.ts` | Client-portal account lifecycle. |
| `scrubPortalPayload`, `redactForbiddenNames`, `loadPortalForbiddenNames`, `PORTAL_REDACTED_LABEL` | `features/projects/services/portal-serializer.ts` | Portal name redaction (every employee name, incl. inactive users). |
| `safePortalCallbackUrl`, `PORTAL_HOME` | `lib/portal-callback-url.ts` | Portal sign-in redirect guard. |
| `purgeExpiredProjectCreationDrafts` | `lib/projects/creation-draft-purge.ts` | Draft retention job. |
| `canReadPortfolio`, `PORTFOLIO_READ_ROLES` | `lib/projects/portfolio-access.ts` | Portfolio page/API gate. |
| `objectiveRealtimeChannel`, `keyResultRealtimeChannel`, `parseOkrRealtimeChannel`, `canSubscribeToOkrChannel`, `OKR_REALTIME_EVENTS`, `buildOkrRealtimePayload` | `lib/okr/realtime.ts` | **H3.** Pure contract for `private-objective-<id>` / `private-keyresult-<id>` (auth only when the viewer sees the entity unredacted; payloads are signals). Broadcast helpers live in `lib/pusher.ts`. |
| `canAccessOkrComments` | `lib/okr/comment-access.ts` | **C2.** OKR comment read/post needs a full view of the objective/KR; missing, deleted and unviewable all answer not-found. |
| `COMMENT_SCOPES` (`TODO`, `OKR`, `ACTIVITY`, `SCRUM`), scope access | `lib/attachments/access.ts` | **H2.** One permission check per comment-attachment scope. |
| `withActivityCommentAttachments`, `ACTIVITY_COMMENT_TYPE` | `lib/attachments/activity-comments.ts` | Project activity comment files (internal only, never portal). |
| `sweepAbandonedStagedAttachments`, `stagedCleanupCutoff`, `STAGED_ATTACHMENT_TTL_HOURS` (24) | `lib/attachments/staging-cleanup.ts` | Nightly staged-upload sweep (`/api/cron/attachment-staging-cleanup`). |
| `purgeCommentAttachmentsAfterParentDelete`, `purgeCommentAttachmentsForEntity` | `lib/attachments/parent-delete.ts` | Call after a parent (scrum update, project activity) is deleted. |
| `SCRUM_DRAFT_STATUS`, `SUBMITTED_SCRUM_UPDATE_WHERE`, `excludeScrumDrafts`, `isScrumDraft` | `features/scrum/services/drafts.ts` | **G7.** Keep drafts out of every counting read. |
| `RETIRED_ROUTE_REDIRECTS`, `retiredRouteRedirects` | `lib/retired-routes.js` | **G6.** The 14 retired OKR/analytics routes (CommonJS, required by `next.config.js`). |
| Ethiopian ↔ Gregorian conversion | `lib/dtp/ec-calendar.ts` | **B2.** JDN-based, leap year = `year % 4 === 3`; checked day-by-day 2020–2030. |
| Thin-page loaders (`*.server.ts`) | `features/{admin-org,daily-trip-plan,key-results,letters,objectives,projects,sprints,todos}/services/*.server.ts`, `lib/{dashboards/home,notifications/notifications-page,okr/activity-feed,okr/comments-page,settings/settings-pages}.server.ts` | **H5/C3/C6.** Server-only data loaders; `app/**/page.tsx` must call these instead of importing Prisma. |
| Project creation G4 services | `lib/projects/project-docx-template.ts`, `creation-docx-schedule.ts`, `creation-provenance.ts`, `creation-processing.ts` | Word TOR template (2.5), deterministic DOCX → schedule, server-owned provenance (2.6, 422 on client source edits), background upload processing + retry (2.7). |
| AI-guided creation services | `lib/projects/ai-guided-{api,brief,ids,openai,prompt,revise,schedule,schema,service,tor-upload}.ts` | **G5/C5.** OpenAI-only brief → clarify → generate → revise/undo; `ai-guided-openai.ts` = strict `json_schema` + one repair round; `ai-guided-revise.ts` = HMAC preview token bound to draft id + version. |

## Plans

| Component | Purpose |
|-----------|---------|
| ~~`components/plans/PlansList`~~ | **Deleted 2026-09-25 (G6)** — `/dashboard/plans` redirects to the OKR Explorer Timeline view. |
| `components/plans/PlansGantt` | Rendered by the OKR Explorer **Timeline** view (`ExplorerTimelineView`). DHTMLX-Gantt view of all accessible objectives + nested KRs. Columns: title, assignee (avatar+name), status/confidence pill, progress %. Zoom: week/month/quarter/year. Clicking a bar routes to the objective/KR detail page. Data from `GET /api/gantt`. |

## Project Management

> Import from the barrel: `import { TemplateListClient, TemplateBuilderClient } from '@/features/projects'`

| Component | Props | Purpose |
|-----------|-------|---------|
| `features/projects/components/ProjectWorkspaceClient` | `{ projectId, user }` | Full-screen project workspace shell. Coordinates project data, views, delivery controls, imports, and the confirmed archive flow; successful archive returns to the active Projects directory. |
| `features/projects/components/ProjectDeliveryControlCenter` | `{ project, canEdit, onArchive, archivePending? }` | Tabbed team/governance/delivery/reports/integrations/settings drawer. Project settings exposes a permission-aware Archive project danger zone while retaining delivery records and audit history. |
| `features/projects/components/ProjectsListClient` | `{ currentUserId, canCreateProject, aiFeatureEnabled, aiAvailable, initialDraftId }` | Project directory and KPI/search surface plus Story 1.3–1.10 orchestration for the three-method modal, private draft create/resume, URL persistence, confirmed switching/discard, Manual/Import branches, and their shared successful-commit handoff to the created project Gantt. Server-supplied permission and safe AI booleans keep UI aligned with API/configuration state without exposing credentials. |
| `features/projects/components/creation/NewProjectEntry` | `{ aiFeatureEnabled, aiAvailable, savedDraft?, ... }` | Story 1.3/1.5 accessible Manual/Import/AI option cards with exact descriptions and best-for guidance, saved-draft resume, unavailable-AI messaging, flag-off AI hiding, and project-less CSV/XLSX downloads before method selection. |
| `features/projects/components/creation/CreationDraftShell` | `{ draft, progressStep?, children?, onBack, onSaveAndExit, onDiscard, ... }` | Shared private-draft chrome with method/version/saved state, compact responsive Method → Prepare → Review → Create cards visually separated from branch-specific steps, back without data loss, method change, save/exit, and confirmed discard. |
| `features/projects/components/CreateProjectWizard` | `{ draft, currentUserId, onDraftUpdated, onCreated, onSaveExit, onProgressChange }` | React-hook-form Manual branch with compact responsive substeps, common details/dates, required seven-value project type, type-linked system/custom schedule cards, Start blank, template preview/management link, shared editable review, and confirmed commit. |
| `features/projects/components/creation/ImportTemplateDownloads` | `{ context?, onSaveExit? }` | Story 1.5 tokenized CSV/XLSX download surface reused before draft creation and inside the Import branch; explains each format and explicitly disables DOCX until Story 2.5. |
| `features/projects/components/creation/ImportUploadStep` | `{ draft, onDraftUpdated, onCommitted, onSaveExit, onProgressChange }` | Story 1.7–1.10/P2.4 react-hook-form CSV/XLS/XLSX/DOCX creation-draft upload: shared template downloads, spreadsheet file/sheet/mapping/validation flow, DOCX scanning/extraction counts and untrusted-data notice, safe errors, change-file reset, then the shared editable review and confirmed commit path. |
| `features/projects/components/creation/ColumnMappingStep` | `{ inspection, proposedMapping, onApprove, onBack, busy }` | Story 1.7 editable deterministic column-mapping table with required/optional fields, exact/known-alias labels, live source samples, duplicate-source prevention, and explicit approval before normalization. |
| `features/projects/components/creation/ValidationReportPanel` | `{ validation, sourceFileName? }` | Story 1.8 blocking/warning/info counts, exact source-row/field/original-value/issue/correction table, explicit commit-blocked guidance, and client-side downloadable CSV error report using shared tokens, Button, Lucide, and `cn()`. |
| `features/projects/components/creation/DraftReviewWorkspace` | `{ draft, onDraftUpdated, onCommitted, onSaveExit, onRestartSource, onProgressChange }` | Story 1.9–1.10/P2.3 shared Manual/Import seven-panel react-hook-form workspace for complete review/editing, private-draft Gantt, controls, filters, undo/redo, restore/restart, optimistic save, XLSX export, and history-backed explicit cleanup decisions. Its one Create Project action derives actionable commit blockers, saves the current version, and opens the exact final confirmation before calling the dedicated atomic commit endpoint. |
| `features/projects/components/creation/ChangeListPanel` | `{ changes, onAccept, onReject }` | Story 2.3 read-only cleanup evidence and decision surface: target/kind/original/proposed/reason/confidence/status, individual accept/reject, and safe grouped capitalization/whitespace controls with explicit exclusions. Nothing applies while proposed, and completed decisions direct users to Undo before save. |
| `features/projects/components/creation/CommitConfirmDialog` | `{ open, draft, counts, acknowledgedWarnings, busy, error, onBack, onConfirm }` | Story 1.10 final explicit confirmation: repeats exact phase/milestone/activity/deliverable/dependency counts, project context, acknowledged unresolved-warning count, and Planning/unbaselined/no-assignment/client/portal/external-notification consequences with loading, retry, and back-to-review controls. |
| `features/projects/components/creation/ai-guided/AiGuidedFlow` | `{ draft, aiFeatureEnabled, aiAvailable, onDraftUpdated, onProgressChange, onSaveExit, onCommitted }` | **New 2026-09-25 (G5).** AI branch of project creation: brief → clarifying questions → generated plan → shared review/commit. OpenAI only; hidden/refused when the project-creation AI flag is off. |
| `features/projects/components/creation/ai-guided/AiBriefStep` | `{ brief, defaults, aiAvailable, hasSchedule, busyAction, onSubmit, onUploadTor?, onSaveExit, onCancelEdit? }` | **New (G5/C5).** react-hook-form brief; optional DOCX TOR upload fills the TOR field (editable). |
| `features/projects/components/creation/ai-guided/ClarifyQuestions` | `{ questions, assumptions, busy, onSubmit, onBack }` | **New (G5).** Answer or skip AI questions; "continue with assumptions". |
| `features/projects/components/creation/ai-guided/AiRevisionPanel` | `{ draft, normalized, aiAvailable, onDraftReplaced, onRequestError }` | **New (G5).** Constrained revision: preview (affected counts, diff, conflicts with direct edits) → apply → undo. |
| `features/projects/components/creation/ai-guided/useAiGuided` | hooks | **New.** TanStack mutations for the `ai-guided/*` routes (`useSaveAiGuidedBrief`, `useClarifyAiGuidedDraft`, …) + `AiGuidedRequestError`. |
| `components/customers/CustomerLookup` | `{ value, onChange, disabled? }` | Shared Odoo-backed customer picker with debounced search, degraded/manual-entry messaging, and tokenized loading/result states; reused by Letters and Manual project creation without a feature-to-feature import. |
| `features/projects/components/TemplateListClient` | `{ user: { id, role } }` | A2 searchable/type-filterable system + custom template directory with project-type badges, type-linked creation, clone/delete controls, and builder navigation. |
| `features/projects/components/TemplateBuilderClient` | `{ templateId?, userRole }` | A2 template editor: explicit project-type association, name/description, phase→milestone→activity tree, properties panel, native drag-and-drop, validation, save/create, and type-preserving clone. |
| `features/projects/components/activity/ActivityDetailPanel` | — | F1/F2 `SideDrawer` activity panel opened from Gantt/Table/Board, with editable fields, owner-party radio, approval-clock banner, subtasks, threaded TipTap comments, default-internal/client-visible controls, client-author badges, undo saves, and seven header actions. |
| `features/projects/components/views/ProjectViewSwitcher` | E1 six-view project surface with persisted Zustand search/status/view state: Gantt, sortable/editable Table, drag/drop status Board, all-project Workload heatmap, ReactFlow Mindmap, and Overview ring/registers. |
| `features/projects/components/gantt/GanttChart` | Custom PM-module Gantt: virtualized phase/milestone/activity/subactivity rows, synced task/timeline scrolling, persisted split width/columns, search, sort, five scales, zoom, today marker, minimap, status-colored bars, baseline ghost overlays, progress fill, milestone diamonds, phase summary bars, approval-wait badges, drag/resize with C4 reason gate, successor cascade, dependency draw/delete, D4 toolbar/export, options/columns persistence, critical path, undo, duplicate, comments badges. Uses `@tanstack/react-virtual`, not `dhtmlx-gantt`. |
| `features/projects/components/DelayLedgerTable` | C5 Delay Ledger table with server-side totals, filters, inline recovery editing, CSV export, and PDF export through the shared Puppeteer renderer. |
| `features/projects/components/charts/ChartWrapper` | J1 chart shell with AP tokens, responsive/dark frame, and PNG export for Recharts SVGs plus custom chart surfaces. |
| `features/projects/components/charts/ProjectChartsLibrary` | J1 C1-C24 chart catalog rendered in the Overview tab, including C24 completion ring/KPI tiles and C18 ranked Pareto with cumulative line. |
| `features/projects/components/reports/ClientReportsPanel` | J2 R2 client report workflow panel for generate/edit/review/approve/send/PDF with the PM approval hard gate. |
| `features/projects/components/reports/PortfolioWbrPanel` | J3 portfolio WBR panel for generate/view/download with SPI, red item, and no-recovery-plan indicators. |
| `features/projects/components/reports/PerformanceReportsPanel` | J4 Jira-gated R3/R4 performance report panel for cadence selection, generate, PM-editable insights, and PDF export. |
| `features/projects/components/reports/ManagementReportsPanel` | J5 R6/R7/R9/R10 management report panel for monthly/quarterly generation, KPI review, PM summary edit/workflow controls, and PDF export. |
| `features/projects/components/ai/AiAssistantPanel` | J6 constrained AI assistant modal launched from the Gantt toolbar. Intent selector, optional context, capped data-grounded output, grounded-in metadata, and PM-approval warning. Copy-to-clipboard only — no send/client/auto-send path. |
| `features/projects/components/okr/ProjectObjectiveLinker` | K1 objective selector on project detail; links/unlinks `Project.objectiveId` via PATCH `/api/projects/[id]`. |
| `features/projects/components/okr/MilestoneKeyResultLinker` | K1 KR selector on each milestone row; links/unlinks `Milestone.keyResultId` via PATCH `/api/projects/[id]/milestones/[milestoneId]`. |
| `features/projects/components/okr/ObjectiveDeliveryPanel` | K1 delivery panel on objective detail showing linked projects with RAG, SPI, completion %, and slip days. |
| `features/projects/components/portfolio/PortfolioDashboard` | K2 CEO portfolio dashboard: summary KPIs, project table, filters, escalations, and real-data charts. |
| `features/projects/components/portfolio/PortfolioFilters` | K2 client/PM filters for the portfolio dashboard. |
| `features/projects/components/portfolio/PortfolioReportPanel` | K3 cross-project performance report list/generate/download panel. |
| `features/projects/components/charts/PortfolioChartsLibrary` | K2 portfolio chart catalog: C1 RAG wall, C6 delay by owner, C9 client health, C17 bubble, C18 Pareto, C20 bench forecast — all driven by real cross-project aggregation. |
| `features/projects/components/registers/RaidRegister` | H1 RAID register with Risks/Assumptions/Issues/Dependencies tabs, type-specific create fields, 5×5 risk matrix, days-open display, client-visible controls, red overdue client dependency flag, and DelayEvent generation. |
| `features/projects/components/registers/ChangeControlBoard` | (2026-09-25 C4: per-CR Internal / Client-visible toggle.) H2 Change Control Board with CR create form, affected activity selection, workflow actions, rejection reason capture, client sign-off, pending report count, and approved scope-volatility total. |
| `features/projects/components/registers/StageGateRegister` | H3 Stage Gate register with per-phase entry/exit/deliverable/approval checklists, pass/waive/fail controls, waiver reason capture, and reportable gate status display. |
| `features/projects/components/registers/ClientObligationsRegister` | H4 Client Obligations register with named responsible people, SLA business days, contractual/R6 controls, compliance rate, breach count, client health score, and CEO warning below 60. |
| `features/projects/components/registers/CorrectionOfErrorsRegister` | H5 COE register with milestone/RED prompts, 5-Whys entry, root-cause counts, overdue CEO warning, systemic fix, template feedback, and Lessons Learned output. |
| `features/projects/components/registers/PaymentMilestonesRegister` | H6 Payment Milestones register with linked approval trigger, ready-to-invoice state, invoice/paid actions, outstanding days, and overdue CEO warning. |
| `features/projects/components/integrations/JiraIntegrationPanel` | G1/G4/G5 Project Settings integration panel for Jira site URL, email, write-only token, project key, Test Connection, Save, masked-token display, sync controls, developer Jira evidence metrics, and Jira adoption score warnings. |
| `features/projects/components/dialogs/TextPromptDialog` | `{ open, onClose, onSubmit(value), title, label, message?, placeholder?, confirmLabel?, icon?, multiline?, minLength?, maxLength?, initialValue? }` | **New 2026-09-25 (F5).** Single-field prompt on the shared `Modal` — the replacement for `window.prompt` (Gantt, view switcher, stage gates, portal panel). Exported from `@/features/projects`. |
| `features/projects/components/baseline/CommitBaselineDialog` | `{ open, onClose, projectId, activityCount, defaultNotes? }` | **New (F5).** Commit-baseline confirmation (replaces `window.confirm`). |
| `features/projects/components/baseline/RebaselineDialog` | `{ open, onClose, projectId, baselineVersion }` | **New (F5).** Formal re-baseline with the old→new diff preview and a required reason ≥ `REBASELINE_REASON_MIN_LENGTH` (20). |
| `features/projects/components/portal/PortalAccessPanel` | `{ projectId, projectClientName, canEdit }` | **New (F5).** Project settings panel: portal on/off (`portalEnabled`), list accounts with status (Active / Invite sent / Invite expired / Inactive), grant by invite link or password, resend invite, set password, revoke. Mounted in `ProjectDeliveryControlCenter`. |
| `features/projects/components/RouteStates` | `ProjectRouteError({ error, reset, source, showMessage?, className? })`, `ProjectListSkeleton`, `ProjectWorkspaceSkeleton({ fullScreen? })`, `ProjectDashboardSkeleton({ label? })`, `PortalSkeleton` | **New (Wave 3 area B).** Bodies for the projects/portal `loading.tsx` and `error.tsx` files. |
| `app/portal/PortalSignOutButton` · `app/portal/PortalProjectSwitcher` | — | **New (F5).** Portal sign-out and project switcher in the portal shell. |
| `app/portal/accept-invite` | — | **New (F5).** Invite acceptance page (password ≥10). |
| `app/portal/projects/[id]/PlannedVsActualTab` | `{ data: ClientPlannedVsActual }` | **New 2026-09-25 (G4).** Baseline vs current dates + signed slip per milestone/activity (from `/api/portal/projects/[id]/planned-vs-actual`). |
| `app/portal/projects/[id]/ChangeRequestsTab` | `{ rows: readonly ClientChangeRequest[] }` | **New (C4).** Change requests marked `CLIENT_VISIBLE`, no names or cost. |
| ~~`features/projects/components/ProjectDetailClient`~~ | — | **Deleted 2026-09-25** — dead code; `/dashboard/projects/[id]` redirects to `/projects/[id]` (`ProjectWorkspaceClient`). |
| `features/projects/components/ScrumLogWidget` | G6 project-page quick-log widget for daily scrum date/time/duration/facilitator, In/Late/Out attendance, blockers/notes, R5 attendance report flags, and C16 people-by-date heatmap. |
| `features/projects/services/portal-serializer` | I2 portal data serializer and SQL filter contract: scoped projects, client-visible comments/attachments/RAID, owner anonymization, forbidden user/cost/Jira key stripping, and employee-name redaction. 2026-09-25 (S5): comment bodies scrubbed of every user's name tokens (≥3 chars, inactive users included; mentions → `@360Ground`) via `scrubPortalPayload`/`redactForbiddenNames`; the `opts` argument is now required on every serializer. |
| `features/projects/services/portal-project-query` | Shared portal project Prisma include shape used by portal routes/pages without exporting non-handler values from Next route modules. |
| `features/projects/services/portal-dashboard` | I3 pure portal dashboard helpers for awaiting-action business-day counters, anonymized activity flattening, and delay-row mapping. |
| `lib/projects/jira-crypto` | P6 6.1 AES-256-GCM helper for write-only Jira API tokens, backed by `JIRA_TOKEN_ENCRYPTION_KEY`. |
| `lib/ai/ai-crypto` | Project Creation P0.4 AES-256-GCM helper for server-only AI provider keys, with a distinct authenticated-data domain and `AI_CREDENTIAL_ENCRYPTION_KEY`. |
| `lib/ai/credentials` | Project Creation P0.4 server resolver that forces OpenAI for this feature, prefers the encrypted database credential, and preserves `OPENAI_API_KEY` fallback. |
| `lib/ai/admin-settings` | Project Creation P0.5/P0.7 transaction-safe Administrator service for safe credential metadata, insert/rotation/removal, allowlisted model, cap and independent feature-flag persistence, and required secret-free ActivityLog rows. |
| `app/api/settings/integrations/ai` | Project Creation P0.5/P0.7 `withRole('ADMIN')` GET/PUT/DELETE API exposing only masked OpenAI settings and validating the independent feature toggle through standard envelopes. |
| `lib/ai/connection-test` | Project Creation P0.6 zero-generation-token OpenAI connection probe, safe status/type/code classification, atomic `lastVerifiedAt`, invalid-key revocation, concurrency guard, and required secret-free `KEY_TESTED` audit. |
| `app/api/settings/integrations/ai/test` | Project Creation P0.6 `withRole('ADMIN')` POST API returning fixed connection-test outcomes through the standard envelope without provider/key details. |
| `lib/ai/config` project-creation flag helpers | Project Creation P0.7 dedicated `PROJECT_CREATION_AI` feature key plus an independent default-off flag reader and reusable 404 refusal guard for future project-creation AI endpoints; never reads sprint-planning enablement. |
| `lib/projects/creation-draft` | Project Creation P1.1–P2.3 persistent creator-private draft service: configurable expiry, safe serialization, audited CRUD, owner-only mutation, Administrator inspection, editable-state guards, atomic optimistic version conflicts, confirmed method switching, review saves, atomic normalized import/validation metadata plus clean opaque source-reference persistence, server-enforced cleanup transitions and decision audits, and committed-project serialization. |
| `lib/projects/creation-normalize` | Project Creation P1.2/P2.3 single provider-neutral version-1 Zod contract, typed project/schedule/validation persistence slices, lossless split/combine, safe empty defaults, field provenance, explicit typed replacement/deletion changes, and structural rejection helpers for every future parser/provider. |
| `lib/projects/creation-changes` | Project Creation P2.3 pure cleanup decision and server-transition guard: prototype-safe paths, stable-ID list targets, exact-value conflict detection, immutable/terminal proposal evidence, explicit replace/delete application, and deterministic safe-group discovery limited to approved capitalization/whitespace text fields. |
| `lib/projects/creation-import` | Project Creation P1.7–1.8/P2.4 shared CSV/XLS/XLSX/DOCX file-metadata boundary plus deterministic SheetJS inspector/normalizer/validator: configurable limits, safe filename/MIME checks, `Schedule` preference, sheet/header detection, exact/alias proposals, strict user mapping validation, parser reuse, active-assignee resolution, normalized schedules, exact source-row provenance, and persisted blocking/warning reports. |
| `lib/projects/docx-extract` | Project Creation P2.4 Mammoth-based ordered DOCX extractor and AI-facing data boundary: headings, paragraphs, tables/cells, nested heading context, stable references, candidate categories, configurable page/block/character caps, bounded plain-text normalized sources, credential redaction, external-file denial, and fixed `UNTRUSTED_PROJECT_DATA` JSON framing. |
| `lib/projects/creation-validate` | Project Creation P1.8 deterministic validation and commit-readiness service: converts parser failures into exact structured issues, checks weights/active assignees/dates/parents/predecessors/project constraints, separates blocking errors from warnings, and reuses `wouldCreateDependencyCycle`. |
| `lib/projects/creation-import-api` | Project Creation P1.7/P2.1/P2.4 safe import API error adapter for draft conflicts, bounded spreadsheet/DOCX parsing and mapping failures, unsafe/malware files, and fail-closed scanner/storage availability without internal paths or scanner details. |
| `lib/projects/creation-upload-security` | Project Creation P2.1 server-only file-safety and private-storage boundary: signature/Office-container validation, configurable archive-bomb limits, encrypted/macro/active-content/path rejection, ClamAV INSTREAM scanning, generated opaque references, 0600 file storage outside `public/`, safe reads, and deletion. |
| `lib/projects/creation-ai-mapping` | Project Creation P2.2 OpenAI-only proposal service: minimum/redacted prompt data, strict structured mapping schema, output cap, exact-match preservation, known/unique source validation, original/proposed/reason/confidence evidence, and no persistence. |
| `lib/projects/manual-creation` | Project Creation P1.4/1.9 normalized Manual template-choice encoder/decoder and materializer: Start blank remains truly empty; a selected lifecycle is retained as a `TEMPLATE` decision, then copied to provider-neutral phases/milestones/activities before shared review. |
| `lib/projects/creation-review` | Project Creation P1.9 pure review helpers for deterministic schedule position renumber/reorder and seven-sheet XLSX draft export covering project, schedule, deliverables, dependencies, assumptions/questions, validation, and source/changes. |
| `lib/projects/creation-commit-shared` | Project Creation P1.10 client-safe pure commit counts, acknowledged-warning counting, and actionable readiness blockers covering validation, warnings, unresolved review decisions, metadata, hierarchy, dates, references, and dependency cycles. |
| `lib/projects/creation-commit` | Project Creation P1.10 atomic/idempotent server coordinator: private draft lookup, version/state claim, commit-time scope reauthorization, deterministic readiness, existing project-service reuse, complete normalized hierarchy/dependency creation, rollup, required audits, and committed-project reference with full rollback on failure and no external side effects. |
| `app/api/projects/creation-drafts` | Project Creation P1.1–1.3 authenticated, capability-gated draft creation plus private GET/PATCH/DELETE endpoints with exact normalized-slice validation, 1 MB bounds, standard envelopes, optimistic version conflicts, and explicit discard confirmation for source-method changes. |
| `app/api/projects/creation-drafts/[id]/upload` | Project Creation P1.7–P2.4 authenticated owner-only CSV/XLS/XLSX/DOCX endpoint that scans and privately retains safe bytes before spreadsheet inspection or ordered DOCX extraction, persists safe audited metadata/typed source references, and never creates a production project. |
| `app/api/projects/creation-drafts/[id]/analyze` | Project Creation P1.7–P2.1 authenticated owner-only mapping-approval endpoint that rehashes, re-scans, privately replaces, reinspects, validates, and saves the normalized schedule/report with a required safe audit. |
| `app/api/projects/creation-drafts/[id]/mapping-proposal` | Project Creation P2.2 authenticated owner-only optional AI mapping endpoint with capability/version/hash/flag/credential/model/cap/cooldown guards, safe generation/activity logs, and a proposal-only response that cannot mutate the draft. |
| `app/api/projects/creation-drafts/[id]/commit` | Project Creation P1.10 authenticated owner-only POST accepting only the expected positive version, delegating all reauthorization/readiness/transaction/idempotency work to the commit service, and returning standard 201/200/error envelopes. |
| `lib/projects/schedule-import` | Project Creation P1.6–1.8 backward-compatible 24-column schedule contract and parser: retains the original 21 header positions, parses optional metadata, preserves legacy behavior, and additionally emits structured exact-row/field/value/correction issues alongside legacy error strings. |
| `lib/projects/schedule-import-template` | Project Creation P1.5–1.6 shared CSV/XLSX generator for the creation and project-scoped endpoints: 24 schedule headers, examples and controlled-value guidance, widths, filters, Instructions/Schedule sheets, and a serialized OOXML frozen header. |
| `app/api/projects/creation-templates` | Project Creation P1.5 authenticated, capability-gated project-less CSV/XLSX download route with strict format validation, attachment metadata, and no project/draft lookup. |
| `app/api/projects/[id]/schedule-import` | Existing authorized transactional schedule importer, extended in Project Creation P1.6 to map optional deliverables to key milestones, persist activity estimates, and preserve source notes while retaining rollup and audit behavior. |
| `features/projects/services/jira/connection` | G1 Jira connection service for credential testing, issue/sprint counts, safe serialization, and Jira status error mapping. |
| `features/projects/services/jira/sync` | G2 Jira sync service for incremental issue/sprint/worklog/changelog ingestion, throttling/backoff, email→User resolution, and per-run `JiraSyncLog` writes. |
| `features/projects/services/jira/rollup` | G3 Jira mapping and auto-rollup service for Manual/Epic/Label/Component/Sprint mappings, preview filtering, and story-point weighted activity completion. |
| `features/projects/services/jira/metrics` | G4 Jira developer metrics service for working-day idle days, per-issue estimate accuracy, median estimate bias, and Performance/R3 reuse. |
| `features/projects/services/jira/adoption` | G5 Jira adoption service for assignee, estimate, recent-update, and story-point data-quality scoring per project/team. |
| `features/projects/services/scrum-attendance` | G6 scrum attendance service for project scrum logs, attendance rates, late/absent counts, team rate, and <70% flags. |
| `app/api/cron/jira-sync` | G2 `CRON_SECRET`-protected 30-minute Jira sync route for all active connections. |
| `app/api/projects/[id]/jira/sync` | G2 manual Sync Now route for a project's linked Jira connection. |
| `app/api/projects/[id]/jira/mapping-preview` | G3 scoped mapping preview route returning matched Jira issue counts, completion percent, weighting mode, and sample issue keys. |
| `app/api/projects/[id]/jira/metrics` | G4 scoped metrics route returning Jira-linked status, working days, idle days, issue estimate accuracy, and per-developer estimator bias. |
| `app/api/projects/[id]/jira/adoption` | G5 scoped adoption route returning project/team Jira data-quality scores and warning state. |
| `app/api/projects/[id]/scrum-log` | G6 scoped scrum log route for listing attendance evidence and upserting a date's scrum log by `projectId+scrumDate`. |
| `app/portal/signin` | I1 client portal sign-in surface wired to the separate `/api/portal/auth` NextAuth provider. |
| `app/portal` | I1 portal shell with client-scoped project list and internal preview banner. |
| `app/portal/projects/[id]` | I3 client dashboard with Awaiting Your Action first, anonymized Gantt bars, delay table, published reports, visible RAID, and internal preview banner. |
| `app/portal/projects/[id]/PortalCommentBox` | I3 client-visible comment reader/writer for awaiting actions; posts through the portal API with `isClientAuthor=true`. |
| `lib/portal-auth` | I1 portal auth config/helpers with distinct cookies, `ClientPortalUser` credentials, hard project scoping, and dashboard-block predicate. |
