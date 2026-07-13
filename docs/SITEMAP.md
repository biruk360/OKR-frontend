# Application Sitemap

> **Purpose:** Complete route map with owning feature module. AI checks this before adding/modifying pages. Updated when routes change.

## Public Routes

| Route | Page File | Description |
|-------|-----------|-------------|
| `/` | `app/page.tsx` | Root redirect |
| `/auth/signin` | `app/auth/signin/page.tsx` | Sign-in page |
| `/auth/signup` | `app/auth/signup/page.tsx` | Sign-up page |

## Dashboard Routes (Authenticated)

### Daily Trip Plan (DTP) — `features/daily-trip-plan`

| Route | Page File | Description |
|-------|-----------|-------------|
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
| `/dashboard` | `app/dashboard/page.tsx` | dashboard | Main dashboard overview |

### My Work
| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/goals` | `app/dashboard/goals/page.tsx` | goals | Goals listing (table, feed, team views) |
| `/dashboard/my-okrs` | `app/dashboard/my-okrs/page.tsx` | dashboard | User's own OKRs |
| `/dashboard/my-tasks` | `app/dashboard/my-tasks/page.tsx` | todos | User's assigned tasks |
| `/dashboard/todos` | `app/dashboard/todos/page.tsx` | todos | All to-dos / initiatives |
| `/dashboard/scrum` | `app/dashboard/scrum/page.tsx` | scrum | Daily Scrum foundation page; submission loop and team wall pending |
| `/dashboard/sprints` | `app/dashboard/sprints/page.tsx` | sprints | Sprint list |
| `/dashboard/sprints/[id]` | `app/dashboard/sprints/[id]/page.tsx` | sprints | Sprint board detail (kanban). Header has "Generate AI tasks" entry that opens a modal scoped to one team member; proposed todos land in the PENDING column after approval. |
| `/dashboard/sprints/ai/[planId]` | `app/dashboard/sprints/ai/[planId]/page.tsx` | sprints-ai | AI sprint plan review + approve. Shows subject user, KR relationships per task, accept/discard/regenerate. |

### OKRs
| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/plans` | `app/dashboard/plans/page.tsx` | plans | Planning page |
| `/dashboard/company-okrs` | `app/dashboard/company-okrs/page.tsx` | objectives | Company-level OKRs (DUPLICATE of department-okrs) |
| `/dashboard/department-okrs` | `app/dashboard/department-okrs/page.tsx` | objectives | Department-level OKRs (DUPLICATE of company-okrs) |
| `/dashboard/alignment-map` | `app/dashboard/alignment-map/page.tsx` | objectives | OKR alignment / strategy map |
| `/dashboard/filters` | `app/dashboard/filters/page.tsx` | filters | Filters Workspace — three-tab analytical surface (Objectives / Key Results / Initiatives) with segments, filter bar, KPI tiles, histogram, grouped results |
| `/dashboard/objectives` | `app/dashboard/objectives/page.tsx` | objectives | All objectives list |
| `/dashboard/objectives/[id]` | `app/dashboard/objectives/[id]/page.tsx` | objectives | Objective detail view |
| `/dashboard/objectives/cmnt25rlr000yhl7oktasxeml/design` | `app/dashboard/objectives/cmnt25rlr000yhl7oktasxeml/design/page.tsx` | objectives | Static design prototype page |
| `/dashboard/key-results/[id]` | `app/dashboard/key-results/[id]/page.tsx` | key-results | Key result detail view |

### Tracking & Analytics
| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/progress` | `app/dashboard/progress/page.tsx` | reports | Progress tracking |
| `/dashboard/reports` | `app/dashboard/reports/page.tsx` | reports | Reports & analytics |
| `/dashboard/initiative-report` | `app/dashboard/initiative-report/page.tsx` | reports | Daily initiative updates report |
| `/dashboard/analytics` | `app/dashboard/analytics/page.tsx` | reports | Analytics dashboard |

### Performance & Scorecard

| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/performance` | `app/dashboard/performance/page.tsx` | performance | Employee My Performance dashboard |
| `/dashboard/performance/evaluations` | `app/dashboard/performance/evaluations/page.tsx` | performance | Evaluator/admin queue |
| `/dashboard/performance/evaluations/[id]/score` | `app/dashboard/performance/evaluations/[id]/score/page.tsx` | performance | Scoring, calibration, and report workspace |
| `/dashboard/performance/templates` | `app/dashboard/performance/templates/page.tsx` | performance | Scorecard template/version management |
| `/dashboard/performance/templates/[id]` | `app/dashboard/performance/templates/[id]/page.tsx` | performance | Template builder and metric mappings |
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
| `/dashboard/letters/[id]` | `app/dashboard/letters/[id]/page.tsx` | letters | Letter form: details, body, enclosures, PDF preview, activity log + workflow transitions |

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
| `/dashboard/settings/users` | `app/dashboard/settings/users/page.tsx` | settings | User management (ADMIN) |
| `/dashboard/settings/teams` | `app/dashboard/settings/teams/page.tsx` | settings | Team management (ADMIN) |
| `/dashboard/settings/timeframes` | `app/dashboard/settings/timeframes/page.tsx` | settings | Timeframe management |
| `/dashboard/settings/okr-rules` | `app/dashboard/settings/okr-rules/page.tsx` | settings | OKR rules config |
| `/dashboard/settings/branding` | `app/dashboard/settings/branding/page.tsx` | settings | Branding config |
| `/dashboard/settings/integrations` | `app/dashboard/settings/integrations/page.tsx` | settings | Integrations config |
| `/dashboard/settings/audit-logs` | `app/dashboard/settings/audit-logs/page.tsx` | settings | Audit log viewer |
| `/dashboard/settings/letter-permissions` | `app/dashboard/settings/letter-permissions/page.tsx` | settings | Letter role matrix + user overrides + letter types (ADMIN only) |

## API Routes

### Objectives
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/objectives` | List (with role-based filtering) / Create |
| GET/PUT/DELETE | `/api/objectives/[id]` | Read / Update / Delete |
| GET | `/api/objectives/[id]/children` | Child objectives (hierarchy) |
| GET/POST | `/api/objectives/[id]/labels` | Manage labels |
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
| GET/PUT/DELETE | `/api/todos/[id]` | Read / Update / Delete |
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
| GET/POST | `/api/users` | List / Create |
| GET/PUT/DELETE | `/api/users/[id]` | Read / Update / Delete |
| GET | `/api/users/for-selection` | Users for dropdowns |
| GET | `/api/users/me/direct-reports` | Manager's direct reports |
| GET | `/api/users/me/departments` | User's departments |
| POST | `/api/users/[id]/reset-password` | Admin password reset |
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
| GET/PUT | `/api/settings/integrations` | Integrations config |
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

### Reports & Background
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/initiative-report` | Daily initiative report data |
| POST | `/api/cron/confidence-calc` | Bi-weekly confidence snapshots |
| POST | `/api/cron/weekly-digest` | Weekly email digest |
| GET | `/api/health` | Health check |
| POST | `/api/client-errors` | Client error logging |

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
| GET | `/api/letters/[id]` | Letter detail incl. preparedBy, signatory, enclosures. |
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
| POST | `/api/letters/[id]/pdf` | Render letter with resolved placeholders; returns HTML + missing-placeholder list. |
| POST | `/api/letters/[id]/enclosures` | Register an enclosure (PDF/DOCX/XLSX/PNG/JPG, ≤25 MB). |
| DELETE | `/api/letters/[id]/enclosures/[enclosureId]` | Remove an enclosure (uploader or admin, DRAFT only). |
| GET | `/api/letters/odoo/contacts?q=…` | Mocked Odoo contact typeahead (≥2 chars). |

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
