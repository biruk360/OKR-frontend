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

### Communication
| Route | Page File | Feature | Description |
|-------|-----------|---------|-------------|
| `/dashboard/activity` | `app/dashboard/activity/page.tsx` | activity | Activity feed |
| `/dashboard/comments` | `app/dashboard/comments/page.tsx` | comments | Comment threads |
| `/dashboard/notifications` | `app/dashboard/notifications/page.tsx` | notifications | Notifications |

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
| POST | `/api/email/test` | Admin-only SMTP test email |

### Reports & Background
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/initiative-report` | Daily initiative report data |
| POST | `/api/cron/confidence-calc` | Bi-weekly confidence snapshots |
| POST | `/api/cron/weekly-digest` | Weekly email digest |
| GET | `/api/health` | Health check |
| POST | `/api/client-errors` | Client error logging |

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
