# Project Workspace — Consolidated Requirements Tracker

Source of truth: `../../docs/PM_Tool_Consolidated_Requirements.md` (outside this application repository).

Status values:

- **Done** — implemented and verified in the application.
- **Partial** — useful implementation exists, but one or more acceptance details remain.
- **In progress** — being changed in the current implementation batch.
- **Pending** — no production implementation yet.
- **Not applicable** — deliberately excluded because it belongs to Instagantt's commercial product, not this OKR application.

This is a living delivery record. A requirement is only moved to **Done** after build/test verification.

## Architecture and navigation

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| Dedicated full-screen project workspace without OKR dashboard header/sidebar | Done | `/projects/[id]` renders outside the dashboard layout; legacy project detail URLs redirect to it. |
| Compact workspace header and slim project rail | Partial | Implemented with collapsible rail and viewport-locked canvas; exact subscription/trial controls and completed-health behavior remain. |
| Preserve existing project governance, reporting, Jira, Scrum, OKR and schedule features | Done | Existing modules are grouped into the full-height delivery control center without duplicating the schedule canvas. |
| Six primary views: Gantt, Table, Board, Workload, Mindmap, Overview | Done | All views render from the compact underlined workspace navigation. |
| Persist selected view and favorites | Partial | Zustand persistence retains selected view, favorite views and workspace filters; the active-tab overflow is not yet a complete options menu. |
| Free-trial and upgrade controls | Pending | The consolidated requirement calls for subscription state; no real subscription/trial source currently exists, so fake controls were not added. |

## Project header and collaboration

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| Inline editable project name | Done | Header name editor persists through the guarded project PATCH API. |
| Project settings and delivery controls | Done | Full-height control center provides Team/OKR, Governance, Delivery, Reports and Integrations. |
| Health, reference date, assignee, priority and risk chips | Partial | Health and filters persist; completed health state, formatted reference-date display and dedicated popover panels remain. |
| Invite and member management | Done | Guarded member upsert/remove API and allocation/role UI are implemented. |
| Read-only permission enforcement | Partial | Existing writable-project guards and UI `canEdit` checks are retained; view-by-view audit remains. |

## Schedule views

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| Gantt split task list/timeline, section hierarchy and compact rows | Partial | Production Gantt already supports hierarchy, virtualization, splitter, dates and status columns; compact workspace integration remains. |
| Gantt drag, resize, reorder, zoom and dependency links | Partial | Drag/resize/reorder/zoom/dependencies exist; dependency creation ergonomics and full keyboard parity remain. |
| Gantt critical path, baseline overlay, minimap and sync state | Partial | Critical path, baseline display, minimap and sync UI exist; cross-client realtime sync is pending. |
| Table view hides Gantt and fills the content area | Done | Dedicated table rendering replaces the Gantt canvas and uses the full workspace width. |
| Table hierarchy, columns, sorting and inline editing | Partial | Hierarchy, status/progress editing, bulk selection and add task/section work; sortable headers, tags, DPD, separate WD/CD, dynamic columns and edit-in-every-cell remain. |
| Board grouped into sections with task/subtask cards and drag/drop | Partial | Phase columns, cards, add task/section and cross-section drag/drop work; expanded subtask rows, inline rename, within-column reorder and group-by-status/assignee remain. |
| Workload member list and dated allocation timeline | Partial | Project members, hour totals, organization allocation and dated task bars render; task editing/dragging and the exact workload toolbar remain. |
| Mindmap hierarchy and navigation | Partial | Project/phase/milestone/activity graph exists; edit/context actions remain. |
| Overview timeline, progress curve and resource table | Partial | Phase timeline, completion metrics, chart library and resource rollup render; the exact current-vs-expected curve/layout controls remain. |

## Task management

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| Task details side panel | Done | Assignee, dates, progress, effort/cost, priority, risk, status, description and completion controls are implemented. |
| Subtasks, tags, comments/mentions and files | Partial | Subtasks, tags, comments and attachments exist; antivirus scanning and some inline creation flows remain. |
| Blockers, predecessors, successors, dependency type and lag | Done | Persisted activity dependencies and blocked-state editing are available in the task panel and Gantt. |
| Multi-select and bulk status updates | Done | Available in the table and Gantt task list. |
| Duplicate task/section and free-edit spreadsheet mode | Partial | Task duplication and inline spreadsheet edits exist; whole-section duplication and unrestricted free-edit mode remain. |
| Undo history (20 actions) | Pending | Not implemented. |

## Import, export, baselines and sharing

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| CSV/XLSX import with downloadable schema templates | Done | Import, validation and CSV/XLSX templates include schedule ownership, blockers and dependencies. |
| CSV/spreadsheet, PNG, PDF and XML export | Done | Server-backed Gantt export endpoints and controls exist. |
| Baseline commit, re-baseline, diff and overlay | Partial | Immutable baseline workflow and overlays exist; named baseline list/delete/load is pending. |
| Public read-only snapshots with manual refresh | Partial | Durable unauthenticated snapshots and list/copy/refresh/delete work; configurable view/column/baseline/branding creation options and count badge remain. |
| Custom fields and configurable status columns | Pending | Activity core fields exist, but user-defined field/status schemas do not. |

## Platform and non-functional requirements

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| 500-task usable rendering | Partial | Gantt task list is virtualized; other views require load/performance tests. |
| Optimistic editing and visible saving/sync feedback | Partial | Query mutations and sync state exist; offline queue and two-second multi-user propagation are pending. |
| Accessibility and keyboard operation | Partial | Semantic controls and labels exist; complete focus, contrast and drag/drop keyboard audit remains. |
| Localization | Pending | Project workspace strings are currently English-only. |
| Attachment malware scanning | Pending | Upload validation/storage exists; malware scanner integration does not. |
| Realtime collaboration and offline recovery | Pending | No project-scoped realtime transport or offline mutation queue yet. |

## Current implementation batch

1. **Done:** dedicated full-screen route and project entry/deep links.
2. **Done:** compact header, project rail, filters, favorites and delivery control center.
3. **Done:** full-viewport six-view composition plus activity detail panel.
4. **Done:** section Board, dated Workload and timeline/resource Overview upgrades.
5. **Done:** guarded member management and durable public snapshots.
6. **Verified locally:** 201 project tests, TypeScript and the production Next.js build pass. Interactive browser visual QA remains unavailable because no in-app browser target was attached to this session.

## Second-pass acceptance audit

Audited against every heading in `PM_Tool_Consolidated_Requirements.md` before publication. The release is suitable as a substantial workspace optimization, not as a claim of total Instagantt feature parity. Highest-priority remaining acceptance work:

1. Complete Table sorting, DPD/tags/WD/CD columns, column addition and universal inline editing.
2. Add Board subtask expansion, configurable grouping/card fields and within-column ordering.
3. Add named baseline CRUD/load and the full configurable public-snapshot modal.
4. Add real undo history, realtime propagation, offline queueing and persisted scroll restoration.
5. Add custom fields/status schemas, localization/RTL, full keyboard/contrast audit and upload malware scanning.
6. Connect trial/upgrade controls only after a real subscription entitlement source is defined.
