# Application Sitemap

> **Purpose:** Complete route map with owning feature module. AI checks this before adding/modifying pages. Updated when routes change.

## Public Routes

| Route | Page File | Description |
|-------|-----------|-------------|
| `/` | `app/page.tsx` | Root redirect |
| `/auth/signin` | `app/auth/signin/page.tsx` | Sign-in page — thin route over `SignInScreen` (`features/auth`); rotating photo backdrop |
| `/auth/signup` | `app/auth/signup/page.tsx` | Sign-up (`SignUpForm`, centred card). Creates an **inactive EMPLOYEE** account; an admin must activate it (2026-09-25). No role picker |
| `/auth/forgot-password` | `app/auth/forgot-password/page.tsx` | Request a reset link (`ForgotPasswordForm`); same answer whether or not the email exists |
| `/auth/reset-password` | `app/auth/reset-password/page.tsx` | Set a new password from an emailed token (`ResetPasswordForm`) |
| `/projects/snapshots/[snapshotId]` | `app/projects/snapshots/[snapshotId]/page.tsx` | Public read-only project snapshot (APPROVED `PUBLIC_SNAPSHOT` reports only) |

## Client Portal Routes

| Route | Page File | Description |
|-------|-----------|-------------|
| `/portal` | `app/portal/page.tsx` | Client portal project list / internal preview entry; project switcher + sign-out (`PortalProjectSwitcher`, `PortalSignOutButton`) |
| `/portal/signin` | `app/portal/signin/page.tsx` | Separate client portal sign-in; `callbackUrl` restricted to `/portal` paths (`lib/portal-callback-url.ts`) |
| `/portal/accept-invite` | `app/portal/accept-invite/page.tsx` | **New 2026-09-25.** Portal invitee sets a password from a single-use invite token (validated by `/api/portal/invite`) |
| `/portal/projects/[id]` | `app/portal/projects/[id]/page.tsx` | Client project dashboard with anonymized schedule, actions, comments (employee names redacted), client-visible attachments and reports. Tabs added 2026-09-25: **Planned vs Actual** (`PlannedVsActualTab`, baseline vs current + slip, G4) and **Change Requests** (`ChangeRequestsTab`, only CRs the PM marked `CLIENT_VISIBLE`, no names/cost, C4). Loader: `features/projects/services/portal-pages.server.ts` |

## Dashboard Routes (Authenticated)

### Daily Trip Plan (DTP) — `features/daily-trip-plan`

| Route | Page File | Description |
|-------|-----------|-------------|
| `/dashboard/automations` | `app/dashboard/automations/page.tsx` | Automations list — mode, schedule, next/last run, failure health |
| `/dashboard/automations/new` | `app/dashboard/automations/new/page.tsx` | Create an automation (plan authored by form; NL compiler is P2) |
| `/dashboard/automations/[id]` | `app/dashboard/automations/[id]/page.tsx` | Automation detail — distribution mode control, run timeline, Run now |
| `/dashboard/automations/[id]/edit` | `app/dashboard/automations/[id]/edit/page.tsx` | Edit an automation; widening changes are confirmed against a grouped plan diff |
| `/dashboard/automations/briefings` | `app/dashboard/automations/briefings/page.tsx` | All briefings the caller owns or was sent |
| `/dashboard/automations/briefings/[id]` | `app/dashboard/automations/briefings/[id]/page.tsx` | Rendered Briefing; Approve-and-send when the automation is in REVIEW |
| `/dashboard/settings/automations` | `app/dashboard/settings/automations/page.tsx` | Admin: global pause, cost caps, concurrency, retention, domain allowlist |
| `/dashboard/travel` | `app/dashboard/travel/page.tsx` | Employee home — recent plans + create-or-open CTA |
| `/dashboard/travel/plans/[id]` | `app/dashboard/travel/plans/[id]/page.tsx` | Plan detail / editor (employee + Coordinator action bar) |
| `/dashboard/travel/console` | `app/dashboard/travel/console/page.tsx` | Travel Coordinator console — pending plans, KPIs |
| `/dashboard/travel/sheet/[deptId]/[date]` | `app/dashboard/travel/sheet/[deptId]/[date]/page.tsx` | Daily Movement Sheet (printable). `:deptId = "all"` for org-wide |
| `/dashboard/travel/runsheet/[driverId]/[date]` | `app/dashboard/travel/runsheet/[driverId]/[date]/page.tsx` | Daily Run Sheet — driver-mode buttons render when viewer is the assigned driver |
| `/dashboard/travel/pool` | `app/dashboard/travel/pool/page.tsx` | Pool Coordinator — assign driver + vehicle to approved plans |
| `/dashboard/settings/travel` | `app/dashboard/settings/travel/page.tsx` | Admin DTP settings (SLAs, traffic, optimization, channels, pool/ops user lists) |

### Dashboard Home
| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard` | `app/dashboard/page.tsx` | dashboard | Main dashboard overview. Check-in button / `?checkin=1` opens the check-in picker; team feed (30 days / 80 rows) is scoped to own department + direct reports, sprint-visibility filtered, private OKRs redacted |

> Every dashboard area listed below now has `loading.tsx` (skeleton) and `error.tsx` (retryable boundary) files — added 2026-09-25 (Wave 3).

### My Work
| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/my-okrs` | `app/dashboard/my-okrs/page.tsx` | dashboard | The viewer's own and contributed objectives with the "Needs a check-in" queue on top (`CheckInQueue`, `loadCheckInQueue`). Everyone else's OKRs → OKR Explorer. `/dashboard/goals` redirects to `/dashboard/okrs-all?level=mine` (2026-09-25) |
| `/dashboard/my-tasks` | `app/dashboard/my-tasks/page.tsx` | todos | **Redirect only** (2026-09-25) → `/dashboard/todos?scope=assigned`; kept for old links |
| `/dashboard/todos` | `app/dashboard/todos/page.tsx` | todos | All to-dos / initiatives; `?scope=assigned` preselects "Assigned to me" |
| `/dashboard/work` | `app/dashboard/work/page.tsx` | todos | Work Board (visibility surface `work`; portal sessions 404) |
| `/dashboard/scrum` | `app/dashboard/scrum/page.tsx` | scrum | Daily Scrum: submit/update, month wall, week + day views, deep links `?date=`/`?update=`/`?view=`, saved views, blockers, celebrate, absences |
| `/dashboard/scrum/wins` | `app/dashboard/scrum/wins/page.tsx` | scrum | Wins feed with Celebrate |
| `/dashboard/scrum/settings` | `app/dashboard/scrum/settings/page.tsx` | scrum | Scrum settings; redirects to `/dashboard/scrum` without `canReadScrumSettings` |
| `/dashboard/sprints` | `app/dashboard/sprints/page.tsx` | sprints | Sprint list (invite-only visibility) |
| `/dashboard/sprints/[id]` | `app/dashboard/sprints/[id]/page.tsx` | sprints | Sprint board detail (kanban). Header (`SprintBoardHeader`): Members, filter facets — people, labels (incl. "no label"), due (overdue/today/this week/none), watching, linked — persisted per sprint; "Generate AI tasks". Board refreshes live on the private `private-sprint-<id>` Pusher channel when configured (2026-09-25 G1) |
| `/dashboard/sprints/[id]/report` | `app/dashboard/sprints/[id]/report/page.tsx` | sprints | Sprint report (`canViewSprint`) |
| `/dashboard/sprints/ai/[planId]` | `app/dashboard/sprints/ai/[planId]/page.tsx` | sprints-ai | AI sprint plan review + approve. Shows subject user, KR relationships per task, accept/discard/regenerate. |

### OKRs

> **OKR page consolidation (2026-09-25, G6 — approved IA).** One browse page (OKR Explorer), one reporting page
> (Insights), plus My OKRs under *My Work*. Sidebar group *OKRs*: OKR Explorer, Key Results, Insights
> (`lib/dashboard-navigation.ts`). Query params are parsed by `lib/okr/explorer-params.ts`; tabs render with
> `components/shared/LinkTabs.tsx`.

| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/okrs-all` | `app/dashboard/okrs-all/page.tsx` | objectives | **OKR Explorer.** `?view=` `list` (default — `OkrsAllClient`: KPIs, filters, bulk archive/restore, role-aware Create menu via `ExplorerCreateHandoff`) · `tree` (`components/hierarchy/OkrHierarchyTable`) · `timeline` (`ExplorerTimelineView` → `PlansGantt`, `/api/gantt`) · `map` (`ExplorerMapView` — strategy map + org/combined modes, `?timeframeId=`, `?mode=`) · `analyze` (`FiltersWorkspace`). `?level=` `all` · `company` · `department` · `mine` · `team` (List and Tree only; narrows the shared visibility scope) |
| `/dashboard/key-results` | `app/dashboard/key-results/page.tsx` | filters | Key-results index: thin route over `FiltersWorkspace`, defaults to `?tab=key-results&segment=kr-owned` |
| `/dashboard/insights` | `app/dashboard/insights/page.tsx` | reports | **Insights.** `?tab=` `overview` (default, `AppleAnalytics`) · `progress` (`&view=dashboard` default \| `tracking`; `ProgressDashboardPanel` / `ProgressTrackingPanel`, print button) · `reports` (`ReportDashboardClient`) · `initiatives` (`InitiativeReportClient`) · `period-close` (`PeriodClosePicker`). Only the active tab's data loads (`lib/okr/insights-data.ts`), each with its previous scoping |
| `/dashboard/objectives/[id]` | `app/dashboard/objectives/[id]/page.tsx` | objectives | Objective detail (404 unless `canViewObjective`). Comment thread (`OkrComments`) and live refresh on `private-objective-<id>` (`ObjectiveRealtimeRefresher`, H3). Loader: `features/objectives/services/objective-detail.server.ts` |
| `/dashboard/key-results/[id]` | `app/dashboard/key-results/[id]/page.tsx` | key-results | Key result detail. Loader: `features/key-results/services/key-result-detail.server.ts` |
| `/dashboard/okrs-all/period-report/[timeframeId]` | `app/dashboard/okrs-all/period-report/[timeframeId]/page.tsx` | reports | Department/org-scoped end-of-period close report, close queue, and PDF export |

### Retired routes (permanent redirects, 2026-09-25)

Defined once in `lib/retired-routes.js` and applied by `next.config.js` `redirects()` (308; the request's query
string is carried over). `lib/okr/route-consolidation.test.ts` checks every source redirects, every destination
is a real page, and no source file still links to a retired route. The page files were deleted.

| Retired route | Redirects to |
|---------------|--------------|
| `/dashboard/objectives` | `/dashboard/okrs-all?level=all` |
| `/dashboard/company-okrs` | `/dashboard/okrs-all?level=company` |
| `/dashboard/department-okrs` | `/dashboard/okrs-all?level=department` |
| `/dashboard/goals` | `/dashboard/okrs-all?level=mine` |
| `/dashboard/plans` | `/dashboard/okrs-all?view=timeline` |
| `/dashboard/timeline` | `/dashboard/okrs-all?view=timeline` |
| `/dashboard/okr-hierarchy` | `/dashboard/okrs-all?view=tree` |
| `/dashboard/alignment-map` | `/dashboard/okrs-all?view=map` |
| `/dashboard/filters` | `/dashboard/okrs-all?view=analyze` |
| `/dashboard/analytics` | `/dashboard/insights?tab=overview` |
| `/dashboard/progress-report` | `/dashboard/insights?tab=progress` |
| `/dashboard/progress` | `/dashboard/insights?tab=progress&view=tracking` |
| `/dashboard/reports` | `/dashboard/insights?tab=reports` |
| `/dashboard/initiative-report` | `/dashboard/insights?tab=initiatives` |

### Project Management
| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/projects/[id]` | `app/projects/[id]/page.tsx` | projects | Full-screen project workspace (`ProjectWorkspaceClient`); `/dashboard/projects/[id]` redirects here. The unused `ProjectDetailClient` was deleted 2026-09-25 |
| `/dashboard/projects` | `app/dashboard/projects/page.tsx` | projects | Project list plus authorized Manual/Import/AI creation; Manual uses compact responsive steps and type-linked schedule selection; `?creationDraft=<id>` resumes a saved draft |
| `/dashboard/projects/[id]` | `app/dashboard/projects/[id]/page.tsx` | projects | Redirect → `/projects/[id]` (the full-screen workspace with Gantt, registers, Delay Ledger, portal access/Jira settings, scrum log, charts, and confirmed soft archive under Project settings) |
| `/dashboard/projects/portfolio` | `app/dashboard/projects/portfolio/page.tsx` | projects | Project portfolio view; `canReadPortfolio` (`lib/projects/portfolio-access.ts`), others redirected to `/dashboard/projects` |
| `/dashboard/projects/templates` | `app/dashboard/projects/templates/page.tsx` | projects | Search/filter reusable schedules by project type; create, clone, edit, or delete custom templates |
| `/dashboard/projects/templates/new` | `app/dashboard/projects/templates/new/page.tsx` | projects | Create a project-type-linked reusable schedule |
| `/dashboard/projects/templates/[id]` | `app/dashboard/projects/templates/[id]/page.tsx` | projects | View system schedules or edit a custom template and its project-type association |

### Performance & Scorecard

| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/performance` | `app/dashboard/performance/page.tsx` | performance | Employee My Performance dashboard |
| `/dashboard/performance/evaluations` | `app/dashboard/performance/evaluations/page.tsx` | performance | Evaluator/admin queue |
| `/dashboard/performance/evaluations/[id]/score` | `app/dashboard/performance/evaluations/[id]/score/page.tsx` | performance | Scoring, calibration, and report workspace |
| `/dashboard/performance/templates` | `app/dashboard/performance/templates/page.tsx` | performance | Scorecard template/version management |
| `/dashboard/performance/templates/[id]` | `app/dashboard/performance/templates/[id]/page.tsx` | performance | Template builder and metric mappings |
| `/dashboard/performance/culture-library` | `app/dashboard/performance/culture-library/page.tsx` | performance | Culture-library admin editor (C1-C6 criteria) |
| `/dashboard/performance/cycles` | `app/dashboard/performance/cycles/page.tsx` | performance | Review-cycle management |
| `/dashboard/performance/actions` | `app/dashboard/performance/actions/page.tsx` | performance | Development/reward action queue |
| `/dashboard/performance/settings` | `app/dashboard/performance/settings/page.tsx` | performance | Performance module settings (admin) |

### Communication
| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/activity` | `app/dashboard/activity/page.tsx` | activity | Activity feed |
| `/dashboard/comments` | `app/dashboard/comments/page.tsx` | comments | Comment threads |
| `/dashboard/notifications` | `app/dashboard/notifications/page.tsx` | notifications | Notifications |

### Letters
| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/letters` | `app/dashboard/letters/page.tsx` | letters | Letters list (filters, search, status tabs) |
| `/dashboard/letters/[id]` | `app/dashboard/letters/[id]/page.tsx` | letters | Letter form: details, body, enclosures (real file upload), PDF preview (sandboxed iframe), activity log + workflow transitions |
| `/dashboard/letters/reports` | `app/dashboard/letters/reports/page.tsx` | letters | **New 2026-09-25 (FR-16).** `LetterReportsClient` (recharts) — letters by status, type, month and customer, plus preparers and signatories; scoped server-side by `GET /api/letters/reports` to the letters the viewer may read |
| `/dashboard/letters/templates` | `app/dashboard/letters/templates/page.tsx` | letters | **New 2026-09-25.** `LetterTemplatesClient` — letter body template management; letter-admin only (`button.letter.admin`, ADMIN), others redirected to `/dashboard/letters` |

### People & Organization
| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/org/teams` | `app/dashboard/org/teams/page.tsx` | teams | Teams directory |
| `/dashboard/org/teams/[id]` | `app/dashboard/org/teams/[id]/page.tsx` | teams | Team detail |
| `/dashboard/org/users` | `app/dashboard/org/users/page.tsx` | users | Users directory |
| `/dashboard/org/users/[id]` | `app/dashboard/org/users/[id]/page.tsx` | users | User detail |
| `/dashboard/profile` | `app/dashboard/profile/page.tsx` | profile | User profile |

### Management
| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/archived-objectives` | `app/dashboard/archived-objectives/page.tsx` | objectives | Archived objectives |

### Settings
| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/settings` | `app/dashboard/settings/page.tsx` | settings | Settings home |
| `/dashboard/settings/profile` | `app/dashboard/settings/profile/page.tsx` | settings | Profile settings |
| `/dashboard/settings/account` | `app/dashboard/settings/account/page.tsx` | settings | Account settings |
| `/dashboard/settings/notifications` | `app/dashboard/settings/notifications/page.tsx` | settings | Notification preferences |
| `/dashboard/settings/users` | `app/dashboard/settings/users/page.tsx` | settings | User management (ADMIN). Only ADMIN creates/deletes users; delete anonymises (2026-09-25) |
| `/dashboard/settings/users/[id]` | `app/dashboard/settings/users/[id]/page.tsx` | settings | User detail (`UserDetail`) |
| `/dashboard/settings/permissions` | `app/dashboard/settings/permissions/page.tsx` | settings | Permission manager (roles incl. create/delete UI, doctypes, fields, scopes, features) |
| `/dashboard/settings/notification-defaults` | `app/dashboard/settings/notification-defaults/page.tsx` | settings | Org notification defaults (ADMIN); 15 categories, BATCHED cadence option |
| `/dashboard/admin/ai-logs` | `app/dashboard/admin/ai-logs/page.tsx` | admin | AI generation logs (`canManageOrg`) |
| `/dashboard/admin/org` | `app/dashboard/admin/org/page.tsx` | admin | Org administration workspace (`canManageOrg`) |
| `/dashboard/settings/teams` | `app/dashboard/settings/teams/page.tsx` | settings | Team management (ADMIN) |
| `/dashboard/settings/timeframes` | `app/dashboard/settings/timeframes/page.tsx` | settings | Timeframe management |
| `/dashboard/settings/okr-rules` | `app/dashboard/settings/okr-rules/page.tsx` | settings | OKR rules config |
| `/dashboard/settings/branding` | `app/dashboard/settings/branding/page.tsx` | settings | Branding config |
| `/dashboard/settings/integrations` | `app/dashboard/settings/integrations/page.tsx` | settings | Integrations config; Administrator-only OpenAI project-creation key/model/caps/testing panel with independent master toggle |
| `/dashboard/settings/audit-logs` | `app/dashboard/settings/audit-logs/page.tsx` | settings | Audit log viewer |
| `/dashboard/settings/letter-permissions` | `app/dashboard/settings/letter-permissions/page.tsx` | settings | Letter role matrix + user overrides + letter types (ADMIN only) |

## API Routes

### Auth & Sign-in
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/wallpaper` | **Unauthenticated.** Backdrop photos for the sign-in screen (Bing image-of-the-day, memoised 6 h; falls back to built-in CSS scenes) |
| GET/POST | `/api/auth/[...nextauth]` | NextAuth credentials (`verifyCredentials`: rate-limited, passwordless/inactive/unknown all return the same `invalid`; JWT carries `authTime`) |
| POST | `/api/auth/login` | Bearer login for API clients — same `verifyCredentials`; 429 + `Retry-After` when rate-limited |
| POST | `/api/auth/register` | **Public.** Always creates an inactive EMPLOYEE (body `role` ignored); identical 201 for new and existing emails; rate-limited per IP; admins notified after the response |
| POST | `/api/auth/forgot-password` | **Public.** Constant-time answer; lookup + hashed token + email run after the response; rate-limited per IP and email |
| POST | `/api/auth/reset-password` | **Public.** Consume a hashed reset token; sets `User.passwordChangedAt` (older sessions are rejected) |

### Objectives
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/objectives` | List (with role-based filtering) / Create |
| GET/PUT/DELETE | `/api/objectives/[id]` | Read / Update / Delete |
| GET | `/api/objectives/[id]/children` | Child objectives (hierarchy) |
| GET/POST | `/api/objectives/[id]/labels` | Manage labels |
| GET | `/api/objectives/[id]/delivery` | Linked projects with delivery health (RAG/SPI/slip) |
| GET | `/api/objectives/[id]/activity` | Activity log |
| POST | `/api/objectives/[id]/views` | Track views |
| GET | `/api/objectives/[id]/key-result-permissions` | KR permission check |
| POST | `/api/objectives/[id]/clone` | Clone objective with KRs |
| GET | `/api/objectives/alignment-search` | Search alignment candidates |

### Key Results
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/keyresults` | Create (validates values, recalc parent) |
| GET/PUT/DELETE | `/api/keyresults/[id]` | Read / Update / Delete |
| GET/POST | `/api/keyresults/[id]/check-ins` | Check-in history / Record check-in |
| GET | `/api/keyresults/[id]/activity` | Activity log |
| POST | `/api/keyresults/[id]/views` | Track views |
| POST | `/api/keyresults/[id]/archive` | Archive |
| POST | `/api/keyresults/[id]/unarchive` | Unarchive |
| POST | `/api/keyresults/[id]/clone` | Clone |
| GET | `/api/keyresults/[id]/todos` | Initiatives under KR |

### Todos / Initiatives
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/todos` | List / Create |
| GET/PUT/DELETE | `/api/todos/[id]` | Read / Update / Delete (GET 404s without `canReadTodo`) |
| GET/POST | `/api/todos/[id]/comments` | Card comments. Attachments are `CommentAttachment` rows (`commentType: 'TODO'`, 2026-09-25 G2); legacy `attachmentIds` JSON still rendered, rows win |
| POST/GET | `/api/comment-attachments` | Stage/list comment attachments for `commentType` `TODO` (read/write → `canReadTodo`/`canWriteTodo`), `OKR`, `ACTIVITY` (project activity, internal only) and `SCRUM` (2026-09-25 H2) — `lib/attachments/access.ts` |
| GET/DELETE | `/api/comment-attachments/[id]` | Stream / remove one comment attachment |
| GET/POST | `/api/initiatives/[id]/updates` | Daily initiative updates |

### Sprints
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/sprints` | List / Create |
| GET/PUT/DELETE | `/api/sprints/[id]` | Read / Update / Delete |
| GET/POST | `/api/sprints/[id]/columns` | Sprint columns |
| PUT/DELETE | `/api/sprints/[id]/columns/[colId]` | Column CRUD |
| GET/POST | `/api/sprints/[id]/activities` | Sprint cards |
| GET/PUT/DELETE | `/api/sprints/[id]/activities/[actId]` | Card CRUD |
| GET/POST | `/api/sprints/[id]/activities/[actId]/comments` | Card comments |
| PUT/DELETE | `/api/sprints/[id]/activities/[actId]/comments/[commentId]` | Comment CRUD |
| GET/POST | `/api/sprints/[id]/activities/[actId]/tasks` | Card sub-tasks |
| PUT/DELETE | `/api/sprints/[id]/activities/[actId]/tasks/[taskId]` | Sub-task CRUD |
| POST | `/api/sprints/[id]/activities/[actId]/convert-to-initiative` | Convert to initiative |
| POST | `/api/sprints/ai/generate` | Generate AI tasks for a (subjectUserId, sprintId) into an existing PLANNING team sprint. Idempotent on (subjectUserId, sprintId, status='DRAFT'). |
| GET | `/api/sprints/ai/[planId]` | Fetch a draft plan: subject, sprint window, proposed tasks (with KR + objective context), carryover dispositions. |
| POST | `/api/sprints/ai/[planId]/accept` | Drop unselected proposed todos for the subject; promote kept ones to normal kanban cards (aiSuggested=false). Sprint stays in PLANNING. |
| POST | `/api/sprints/ai/[planId]/discard` | Discard a draft plan and its proposed todos for this subject. |
| POST | `/api/sprints/ai/[planId]/regenerate` | Supersede this subject's draft, drop their proposed todos, re-run pipeline against the same sprint with feedback. |
| GET | `/api/sprints/ai/[planId]/debug` | Admin/exec diagnostic: subject KR coverage, generation logs, one-line diagnosis for empty plans. |

### Organization
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/users` | List / Create (**create is ADMIN-only**, 2026-09-25) |
| GET/PATCH/DELETE | `/api/users/[id]` | Read / Update / Delete. **DELETE is ADMIN-only and anonymises**: name → "<job title> (deleted account)", records kept (`lib/users/deleted-account.ts`); last active ADMIN protected |
| GET | `/api/users/for-selection` | Users for dropdowns |
| GET | `/api/users/me/direct-reports` | Manager's direct reports |
| GET | `/api/users/me/departments` | User's departments |
| POST | `/api/users/[id]/reset-password` | Admin password reset |
| PATCH | `/api/users/[id]/project-manager-capability` | Admin-only audited grant/revoke of project-creation capability |
| POST | `/api/auth/change-password` | Authenticated user changes own password (requires `currentPassword` + `newPassword`) |
| GET/POST | `/api/departments` | List / Create |
| GET/PUT/DELETE | `/api/departments/[id]` | Read / Update / Delete |

### Settings & Config
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/timeframes` | List / Create |
| PUT/DELETE | `/api/timeframes/[id]` | Update / Delete |
| GET/POST | `/api/labels` | List / Create |
| GET/PUT | `/api/user-preferences` | User view preferences |
| GET/PUT | `/api/settings/okr-rules` | OKR rules config |
| GET/PUT | `/api/settings/branding` | Branding config |
| GET/POST | `/api/settings/integrations` | Integrations config — **ADMIN-only** (EXECUTIVE removed 2026-09-25); secrets returned masked (`••••••••` + last 4), a still-masked value on save leaves the secret unchanged |
| GET/PUT/DELETE | `/api/settings/integrations/ai` | Administrator-only masked OpenAI project-creation credential, model, caps, and independently audited feature-flag administration |
| POST | `/api/settings/integrations/ai/test` | Administrator-only live OpenAI credential test with safe distinct outcomes |
| GET/PUT | `/api/settings/letter-permissions/roles` | Letter role × permission matrix (ADMIN) |
| GET/POST | `/api/settings/letter-permissions/users` | Per-user letter permission overrides (ADMIN) |
| GET/DELETE | `/api/settings/letter-permissions/users/[userId]` | Per-user override detail + delete (ADMIN) |
| POST | `/api/email/test` | Admin-only SMTP test email |

### Permissions — Miscellaneous
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/permissions/me` | Caller's effective permissions: union of all active roles → `{ doctypePermissions, featurePermissions }` (any authenticated user) |
| POST | `/api/permissions/export` | Export full permission snapshot as JSON download (ADMIN only) |
| POST | `/api/permissions/import` | Import permission JSON; `dryRun=true` returns per-table diff counts, `dryRun=false` upserts in $transaction (ADMIN only) |
| GET | `/api/permissions/preview/[userId]` | Preview effective permissions for any user: `{ user, activeRoles, effectivePermissions, overrides, visibleFeatures, hiddenFeatures }` (ADMIN only) |

### Permissions & Role Profiles
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/permissions/profiles` | List all RoleProfiles with memberships / Create (ADMIN) |
| GET/PUT/DELETE | `/api/permissions/profiles/[id]` | Profile detail / Update (incl. replace memberships) / Delete — 409 if users assigned (ADMIN) |

### Permissions — Roles CRUD
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/permissions/roles` | List all roles with userRoles count (ADMIN only) |
| POST | `/api/permissions/roles` | Create a new role; key auto-uppercased/slugified, unique name+key enforced (ADMIN only) |
| GET | `/api/permissions/roles/[id]` | Role detail with doctypePermissions, featurePermissions, _count.userRoles (ADMIN only) |
| PUT | `/api/permissions/roles/[id]` | Update role fields; blocks key change on isSystem roles (ADMIN only) |
| DELETE | `/api/permissions/roles/[id]` | Delete role; guards isSystem (400) and roles with users (409 HAS_USERS) (ADMIN only) |
| POST | `/api/permissions/roles/[id]/clone` | Clone role copying all doctype perms, feature perms, and scope rules (ADMIN only) |

### Permissions — Role Scope Rules
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/permissions/roles/[id]/scope-rules` | List all RecordScopeRule rows for a role (ADMIN only) |
| POST | `/api/permissions/roles/[id]/scope-rules` | Create a new scope rule for a role; validates operator, valueType, and doctypeKey existence (ADMIN only) |
| PUT | `/api/permissions/roles/[id]/scope-rules/[ruleId]` | Partial-update a scope rule; verifies ownership by role before saving (ADMIN only) |
| DELETE | `/api/permissions/roles/[id]/scope-rules/[ruleId]` | Delete a scope rule; verifies ownership by role before deleting (ADMIN only) |

### User Permission Management
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/permissions/users/[id]` | Full permission picture: basic info, userRoles, userRoleProfiles (with memberships), permissionOverrides, effectivePermissions union (ADMIN only) |
| POST | `/api/permissions/users/[id]/roles` | Assign a role to a user (upsert); validates roleId and future expiresAt; self-mod blocked (ADMIN only) |
| DELETE | `/api/permissions/users/[id]/roles/[roleId]` | Remove a role assignment from a user; 404 if not found; self-mod blocked (ADMIN only) |
| POST | `/api/permissions/users/[id]/profiles` | Assign a RoleProfile to a user (upsert); validates profileId; self-mod blocked (ADMIN only) |
| DELETE | `/api/permissions/users/[id]/profiles/[profileId]` | Remove a profile assignment from a user; 404 if not found; self-mod blocked (ADMIN only) |
| GET | `/api/permissions/users/[id]/overrides` | List all UserPermissionOverride records for the user (ADMIN only) |
| POST | `/api/permissions/users/[id]/overrides` | Create a permission override; validates overrideType (grant/deny), reason (min 10 chars), future expiresAt; self-mod blocked (ADMIN only) |
| DELETE | `/api/permissions/users/[id]/overrides/[overrideId]` | Delete an override; verifies it belongs to the target user; self-mod blocked (ADMIN only) |
| GET | `/api/permissions/explain` | Explain why a user can/cannot perform an action on a doctype; traces overrides, role grants, and scope rules (ADMIN only; query params: userId, doctypeKey, action) |

### Project Management
| Method | Route | Description |
|--------|-------|-------------|
| GET/PATCH/DELETE | `/api/projects/[id]` | Read/update a scoped project or atomically soft-archive it with a required `ARCHIVED` audit; archived projects leave the active directory while records remain retained |
| POST | `/api/projects/creation-drafts` | Create an authorized, creator-owned manual/import/AI draft with version-1 normalized project metadata; AI methods are refused while the project-creation AI flag is off |
| GET/PATCH/DELETE | `/api/projects/creation-drafts/[id]` | (2026-09-25: a PATCH that adds, removes or changes a provenance source record is rejected with **422** — `lib/projects/creation-provenance.ts`.) Load, strict-schema/version-save editable seven-panel review data, or discard a private creation draft and its retained source; Administrators may inspect but only the creator may mutate |
| POST | `/api/projects/creation-drafts/[id]/commit` | Owner-only, versioned, commit-time-reauthorized atomic and idempotent conversion of a ready normalized draft into one Planning/unbaselined project and full schedule, with required audits and no external notification |
| POST | `/api/projects/creation-drafts/[id]/upload` | Owner-only CSV/XLS/XLSX/DOCX safety scan and private generated-name retention; spreadsheets continue through deterministic inspection/validation, while DOCX preserves ordered heading/paragraph/table source references under untrusted-data framing. Unsafe, encrypted, macro-enabled, suspicious archives, malware, and unavailable scanning fail closed before parsing/extraction |
| POST | `/api/projects/creation-drafts/[id]/analyze` | Owner-only re-scan and approval of an edited deterministic mapping; revalidates the same hashed source, active assignees, schedule, and dependency graph, then replaces the private retained source and saves normalized data/report plus safe audit metadata |
| POST | `/api/projects/creation-drafts/[id]/mapping-proposal` | Owner-only, versioned, rate-limited optional OpenAI column proposal over the integrity-checked retained spreadsheet; returns strict editable original/proposed/reason/confidence evidence without updating the draft or applying values |
| GET | `/api/projects/creation-drafts/[id]/upload` | **New 2026-09-25 (Story 2.7).** Processing status of the retained upload; the UI polls it while the draft is PROCESSING. The POST now answers **202** and processes in the background (`lib/projects/creation-processing.ts`); DOCX sources are turned into a draft schedule deterministically (`lib/projects/creation-docx-schedule.ts`) |
| POST | `/api/projects/creation-drafts/[id]/upload/retry` | **New (2.7).** Reprocess the retained, already-scanned file (no re-upload); idempotent, restarts stale jobs |
| POST | `/api/projects/creation-drafts/[id]/assumptions/bulk-decision` | **New.** Accept or reject every pending assumption in one phase or all remaining; atomic, version-checked, audited once |
| PUT | `/api/projects/creation-drafts/[id]/ai-guided/brief` | **New (P3, G5).** Save the AI-guided brief |
| POST | `/api/projects/creation-drafts/[id]/ai-guided/clarify` | **New.** OpenAI clarifying questions for the brief |
| POST | `/api/projects/creation-drafts/[id]/ai-guided/answers` | **New.** Save answers to the clarifying questions |
| POST | `/api/projects/creation-drafts/[id]/ai-guided/generate` | **New.** Generate the draft plan (strict `json_schema`, one repair round); audit `AI_PLAN_GENERATED` |
| POST | `/api/projects/creation-drafts/[id]/ai-guided/revise` | **New.** Constrained revision: preview (no write) or apply from the signed preview token; audit `AI_PLAN_REVISED` |
| POST | `/api/projects/creation-drafts/[id]/ai-guided/undo` | **New.** Undo the last applied revision; audit `AI_PLAN_REVISION_UNDONE` |
| POST | `/api/projects/creation-drafts/[id]/ai-guided/tor-upload` | **New (C5).** DOCX TOR upload through the import security path (ClamAV fail-closed); returns extracted text, no AI call |
| GET | `/api/projects/creation-templates?format=csv\|xlsx` | Authorized project-less schedule template download; shared generator also serves the existing project-scoped template endpoint |
| GET/POST | `/api/projects/templates` | List reusable schedules with type/count metadata or create a custom project-type-linked template |
| GET/PATCH/DELETE | `/api/projects/templates/[id]` | Read a full template, update a custom template/type link, or delete a custom template; system templates are immutable |
| POST | `/api/projects/templates/[id]/clone` | Clone any template into an editable custom copy while preserving its project-type association |
| GET | `/api/projects/[id]/schedule-import/template?format=csv\|xlsx` | Authorized project-scoped download of the shared 24-column schedule template |
| POST | `/api/projects/[id]/schedule-import` | Existing validated append/replace schedule import; accepts the backward-compatible 24-column contract and preserves optional deliverable, estimate, and source-note values |
| GET/POST | `/api/projects/[id]/reports` | List project reports / generate the R2 bi-monthly client report draft |
| GET/PATCH | `/api/projects/[id]/reports/[reportId]` | Read report / edit summary and transition DRAFT→PM_REVIEW→APPROVED→SENT |
| GET | `/api/projects/[id]/reports/[reportId]/pdf` | Download R2 report PDF |
| GET/POST | `/api/projects/portfolio/wbr` | List/generate portfolio WBR packs |
| GET | `/api/projects/portfolio/wbr/[reportId]/pdf` | Download WBR pack PDF |
| GET | `/api/projects/portfolio/dashboard` | Portfolio dashboard aggregation (RAG/SPI/delays/escalations) |
| GET/POST | `/api/projects/portfolio/report` | List/generate cross-project performance reports |
| GET | `/api/projects/portfolio/report/[reportId]` | Read a portfolio report |
| GET | `/api/projects/portfolio/report/[reportId]/pdf` | Download portfolio report PDF |
| GET/POST | `/api/projects/[id]/performance-reports` | List/generate Jira-backed R3/R4 performance reports |
| GET/PATCH | `/api/projects/[id]/performance-reports/[reportId]` | Read report / edit PM-reviewable AI insights |
| GET | `/api/projects/[id]/performance-reports/[reportId]/pdf` | Download R3/R4 performance report PDF |
| GET/POST | `/api/projects/[id]/management-reports` | List/generate R6/R7/R9/R10 monthly or quarterly management reports |
| GET/PATCH | `/api/projects/[id]/management-reports/[reportId]` | Read report / edit summary and transition DRAFT→PM_REVIEW→APPROVED→SENT |
| GET | `/api/projects/[id]/management-reports/[reportId]/pdf` | Download R6/R7/R9/R10 management report PDF |
| POST | `/api/projects/[id]/ai-assistant` | Constrained AI assistant: generate capped, data-grounded executive summary, risk detection, delay pattern, or estimate suggestion |
| POST | `/api/cron/client-report` | Bi-weekly R2 draft generation for active projects |
| POST | `/api/cron/wbr-pack` | Weekly WBR pack generation for CEO and PMs |
| GET/POST | `/api/cron/project-creation-draft-purge` | **New 2026-09-25.** Nightly purge of expired project-creation drafts and their private retained sources (`lib/projects/creation-draft-purge.ts`) |
| GET/POST | `/api/projects/[id]/portal-users` | **New 2026-09-25.** List / grant client-portal accounts for a project (project write access); invite link (7-day, single-use) or set password; audited |
| PATCH/DELETE | `/api/projects/[id]/portal-users/[portalUserId]` | **New.** PATCH `{action:'RESEND_INVITE'}` or `{action:'SET_PASSWORD'}` (ends the account's portal sessions); DELETE revokes this project (account deactivated when it has none left); audited |

### Client Portal API (`/api/portal/*`, portal session only — every response through `portal-serializer.ts`)
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/portal/invite` | **Public, rate-limited.** GET validates an invite token; POST sets the password (single-use token) |
| GET | `/api/portal/projects/[id]/attachments` | **New.** Client-visible activity attachments only (`CLIENT_VISIBLE` filter in SQL, Invariant 5) |
| GET | `/api/portal/projects/[id]/activities/[activityId]/attachments/[attachmentId]` | **New.** Stream one client-visible attachment (`portalActivityAttachmentWhere`) |
| GET | `/api/portal/projects/[id]/planned-vs-actual` | **New 2026-09-25 (G4).** Baseline vs current dates + signed slip for every milestone and activity |
| GET | `/api/portal/projects/[id]/change-requests` | **New (C4).** Only change requests with `visibility = 'CLIENT_VISIBLE'` (SQL filter, Invariant 5); no requester/approver names or cost |

> Internal: `PATCH /api/projects/[id]/change-requests/[crId]` accepts `visibility: 'INTERNAL' | 'CLIENT_VISIBLE'` (default INTERNAL).

### Notifications
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/notifications` | Current user's notifications + unread count. `limit` (1-100, default 20), `unreadOnly=1`, `cursor`. Returns `{ items, unreadCount, nextCursor }`. |
| PATCH | `/api/notifications/[id]` | Mark one read/unread. Scoped to the session user via `updateMany`; 404 on a miss. |
| DELETE | `/api/notifications/[id]` | Dismiss one. Same ownership scoping. |
| POST | `/api/notifications/mark-all-read` | Clear the user's unread count. |
| POST | `/api/pusher/auth` | Pusher private-channel authorization. Authorizes `private-user-<your own id>`, (2026-09-25 G1) `private-sprint-<id>` when `canViewSprint`, and (H3) `private-objective-<id>` / `private-keyresult-<id>` when the viewer sees that objective / key result unredacted; any other channel is 403. Returns 503 when Pusher is unconfigured so the client degrades to polling. |
| GET/PATCH | `/api/notifications/preferences` | Per-category in-app/email/cadence prefs. |

### Account
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/me/export` | The signed-in user's own data as a JSON download (objectives, KRs, to-dos, check-ins, comments). Scoped to the caller; returns a file, not the envelope. |

### Reports & Background
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/initiative-report` | Daily initiative report data |
| GET | `/api/okr-hierarchy` | OKR hierarchy feed — role/record-scoped via `lib/okr/visibility-scope.ts` (per-KR initiative counts only) |
| GET | `/api/okr-hierarchy/initiatives?keyResultId=…` | **New 2026-09-25.** On-demand initiative rows for ≤50 KRs; same visibility rule as the main feed; portal sessions 403 |
| GET | `/api/link-preview?url=` | SSRF-safe page metadata for comment/description link previews (now also used by OKR comments, 2026-09-25 G2) |
| POST | `/api/cron/confidence-calc` | Bi-weekly confidence snapshots |
| POST | `/api/cron/weekly-digest` | Weekly email digest |
| GET/POST | `/api/cron/todo-recurrence` | Generates the next occurrence of each recurring card (DTE-5). Daily. |
| GET/POST | `/api/cron/automations-prune` | AI Automations retention sweep. Nightly. |
| GET/POST | `/api/cron/attachment-staging-cleanup` | **New 2026-09-25 (H2).** Nightly (00:50 UTC) delete of staged comment uploads unclaimed for 24 h, then their files (`lib/attachments/staging-cleanup.ts`) |
| GET | `/api/health` | Health check |
| POST | `/api/client-errors` | Client error logging |

> The full cron schedule — which routes run, when, and which exist but are
> deliberately unscheduled — is `docs/CRON.md`, installed by
> `scripts/install-crontab.sh`.
>
> **Cron auth (2026-09-25):** every `/api/cron/*` route is wrapped in `withCronAuth` (`lib/cron-auth.ts`):
> `Authorization: Bearer $CRON_SECRET` or `x-cron-secret` only (`?key=` ignored), timing-safe compare,
> **503 `CRON_NOT_CONFIGURED`** when `CRON_SECRET` is unset or shorter than 16 chars, 401 on a wrong token.
> Newly scheduled: `permission-cleanup` (00:15 UTC), `project-creation-draft-purge` (00:40), `prune-notifications`
> (00:45, now its own route and also prunes other append-only tables — `lib/retention/`), `notifications?job=batch`
> (every 10 min, BATCHED cadence), `performance-nudge` (daily 05:00), `client-report`/`wbr-pack` (Mon 03:00), `jira-sync` (*/30), `attachment-staging-cleanup` (00:50).

> AI Automations is not driven by a `/api/cron/*` route for the work itself: the
> tick only enqueues `AutomationRun` rows, and the long-lived pm2 worker
> (`npm run worker:automations`, `okr-automations-worker` in `ecosystem.config.cjs`)
> claims them. A permanent self-test fixture lives on production — re-arm or
> remove it with `npm run automations:test-schedule -- --minutes N` / `--remove`
> (`scripts/create-test-automation.ts`).

### Performance & Scorecard

| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/performance/templates` | List/create scorecard templates |
| GET/PATCH | `/api/performance/templates/[id]` | Template detail/configuration |
| PUT | `/api/performance/templates/[id]/builder` | Replace draft tiers and criteria |
| POST | `/api/performance/templates/[id]/{publish,fork,archive,culture-block}` | Template lifecycle and culture block |
| GET/PUT/DELETE | `/api/performance/template-mappings` | Role/designation-to-template mappings |
| GET/PUT/DELETE | `/api/performance/metric-mappings` | Employee KR-to-metric mappings |
| GET/POST | `/api/performance/cycles` | List/create review cycles |
| GET | `/api/performance/cycles/[id]` | Cycle detail, issues, evaluations, and panels |
| POST | `/api/performance/cycles/[id]/{open,close}` | Generate or close cycle evaluations |
| GET | `/api/performance/evaluations` | Actor-scoped evaluation queue |
| GET | `/api/performance/evaluations/[id]` | Sealed/employee/evaluator/admin detail DTO |
| PUT/POST | `/api/performance/evaluations/[id]/{scores,submit,panel,calibration,share-draft,acknowledge,dispute,finalize}` | Evaluation workflow |
| GET | `/api/performance/evaluations/[id]/report` | Employee-safe report |
| GET | `/api/performance/okr-actual/[criterionId]?evaluationId=...` | Resolve period-bounded metric actual and score |
| GET | `/api/performance/me` | Employee performance history and active focuses |
| PUT | `/api/performance/focuses/[id]/weekly-step` | Save employee weekly growth step |
| GET/PATCH | `/api/performance/actions`, `/api/performance/actions/[id]` | Recommendation queue and transitions |
| GET/POST | `/api/cron/performance-nudge` | Bundled score-free weekly focus notification |

### Letters
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/letters` | List letters; supports `status`, `letterType`, `search`, `mine`, `includeArchived`, `page`, `limit`. |
| POST | `/api/letters` | Create a draft letter and allocate its `360G/LT/{CL\|OF\|GR}/{SEQ}/{YEAR}` reference. |
| GET | `/api/letters/[id]` | Letter detail incl. preparedBy, signatory, enclosures. Out-of-scope letters 404 (`letterReadGuard`, also on html/pdf/docx/activity/duplicate and workflow routes). |
| PATCH | `/api/letters/[id]` | Update editable fields (locked after submission for non-admins). |
| DELETE | `/api/letters/[id]` | Delete a DRAFT letter (admin can delete any). |
| POST | `/api/letters/[id]/submit` | DRAFT → SUBMITTED. |
| POST | `/api/letters/[id]/approve` | SUBMITTED → APPROVED (requires `letter:approve`). |
| POST | `/api/letters/[id]/reject` | SUBMITTED → DRAFT with reason (requires `letter:approve`). |
| POST | `/api/letters/[id]/send` | APPROVED → SENT, captures dispatch method/date/tracking. |
| POST | `/api/letters/[id]/archive` | SENT → ARCHIVED (admin can force from any state). |
| DELETE | `/api/letters/[id]/archive` | Admin-only unarchive. |
| GET | `/api/letters/[id]/activity` | Activity log entries for the shared `ActivityLogPanel`. |
| POST | `/api/letters/[id]/views` | No-op view beacon (panel compatibility). |
| GET/POST | `/api/letters/[id]/pdf` | Real PDF via Puppeteer (`renderLetterToPdf`); page JavaScript off, network requests intercepted (only data:/about:/blob: and Google Fonts). `?font` checked against the font catalog. |
| POST | `/api/letters/[id]/enclosures` | **Real multipart upload** (field `file`, 2026-09-25 G3): magic-byte validated, stored privately under `LETTER_UPLOAD_DIR` (default `var/uploads/letters`). Letter admin, or `letter.write` + DRAFT + preparer. |
| GET | `/api/letters/[id]/enclosures/[enclosureId]` | **New.** Stream an enclosure file (`letterReadGuard`). |
| DELETE | `/api/letters/[id]/enclosures/[enclosureId]` | Remove an enclosure (same rule as upload). |
| GET | `/api/letters/reports` | **New (FR-16).** Aggregated letter report (`byStatus`, `byType`, `byMonth`, `byCustomer`, preparers, signatories; ≤20,000 rows, `truncated` flag); scoped by `buildLetterReadWhere`, 403 without read scope. |
| GET/POST | `/api/letters/templates` | **New.** GET: active templates (letter admin, `letter.create` or `letter.read`; `?letterType`; `?includeArchived` admin-only). POST: create (letter admin; body sanitised; audited). Seeds from the old `LETTER_TEMPLATES` constants on first read. |
| PATCH/DELETE | `/api/letters/templates/[templateId]` | **New.** Update / archive / unarchive (PATCH) or soft-archive (DELETE); letter admin only; audited. |
| GET | `/api/letters/odoo/contacts?q=…` | Odoo `res.partner` typeahead (≥2 chars); falls back to a mock roster when `ODOO_URL`/`ODOO_DB`/`ODOO_USER` are unset. |

### Telegram Bot
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/telegram/webhook` | Public webhook called by Telegram. Auth via `X-Telegram-Bot-Api-Secret-Token` header (not NextAuth). |
| GET | `/api/telegram/admin/setup` | Admin: inspect bot identity + current webhook info. |
| POST | `/api/telegram/admin/setup` | Admin: register webhook with Telegram, save config. |
| DELETE | `/api/telegram/admin/setup` | Admin: clear webhook. |

## Layouts

| Layout File | Scope |
|-------------|-------|
| `app/layout.tsx` | Root layout (fonts, providers, toasts) |
| `app/dashboard/layout.tsx` | Dashboard layout (DashboardShell wrapper) |
| `app/dashboard/settings/layout.tsx` | Settings nested layout |
