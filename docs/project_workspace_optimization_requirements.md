# Project Workspace UI Optimization Requirements

## 1. Objective

Optimize the existing Delivery → Projects detail page into a workspace-first schedule experience inspired by modern project-planning tools. This is an enhancement of the current implementation, not a replacement.

The optimized landing experience must make the schedule the primary surface, present activities in clear collapsible sections, allow safe drag-and-drop ordering, and expose direct actions for creating tasks and sections.

## 2. Existing capabilities to preserve

The implementation must retain and reuse the current:

- `Project → Phase → Milestone → Activity → Subactivity` data model.
- Gantt, Table, Board, Workload, Mindmap, and Overview views.
- Activity detail panel, inline status/progress editing, comments, attachments, tags, owners, assignees, priority, risk, effort, and cost.
- Current-date bar dragging and resizing, including the required slip reason/owner gate after baseline commitment.
- Baseline commit and re-baseline workflow, baseline overlays, dependency links, critical path, minimap, exports, and sharing.
- Project permissions and read-only behavior.
- Schedule CSV/XLS/XLSX imports and all downstream reporting, portal, Jira, OKR, stage-gate, payment, and delay-ledger integrations.

## 3. UX requirements

### 3.1 Workspace-first project landing

- Keep project identity, status, health, client, and timeline visible in a compact header.
- Place view tabs and the schedule workspace before secondary registers and reporting panels.
- Preserve health statistics and objective linking without allowing them to dominate the first viewport.
- Default to the user's stored view; existing view persistence remains authoritative.

### 3.2 Sectioned activity list

- Render Phase rows as primary sections and Milestone rows as nested subsections.
- Render activities and one-level subtasks beneath their existing parent.
- Section rows must be visually distinct, collapsible, and show their date span and completion.
- Activity rows must continue to align exactly with their Gantt timeline rows.
- The Task column must include hierarchy indentation, completion/status affordance, and a dedicated drag handle.

### 3.3 Create actions

- Provide a prominent `New task` action in the schedule toolbar.
- Provide a `New section` action that creates a Phase.
- Creating a task requires choosing its section (Phase) and subsection (Milestone). If a selected Phase has no Milestone, the system may create a `General` Milestone before creating the task.
- Phase and Milestone rows should expose contextual add actions when editable.
- All creation uses the existing APIs and query invalidation behavior.

### 3.4 Drag and drop

- Users with schedule edit permission can reorder Phases, Milestones within a Phase, activities within a Milestone, and subtasks within their parent.
- The first release only supports same-level/same-parent ordering. Dragging must not silently re-parent records.
- Reordering is enabled only for the natural `Schedule` sort with no active search or alternative grouping.
- A visible drag handle is required; the whole row must not become a drag target because timeline bars already use horizontal pointer dragging.
- Pointer and keyboard dragging must be supported, with an accessible label and live feedback from the drag-and-drop library.
- Reordering must be persisted in one database transaction and renumber all siblings to contiguous positions.
- Baseline dates, dependencies, activity IDs, progress, and audit history must remain unchanged by an order-only operation.

## 4. Technical approach

### 4.1 Library decision

Use `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities`.

Reasons:

- Sortable primitives are designed specifically for ordered interfaces.
- Pointer and keyboard sensors support the required input and accessibility modes.
- Activation constraints and drag handles avoid accidental activation while clicking row controls.
- It composes with the existing React components and virtualized Gantt rows without replacing the Gantt renderer.

Alternatives considered:

- Atlassian Pragmatic Drag and Drop is capable and framework-agnostic, but would require more custom sortable/keyboard composition for this existing virtual row architecture.
- `@hello-pangea/dnd` is optimized for list experiences but is more opinionated around list containers and less suitable for combining the current virtualized two-pane Gantt row with custom timeline dragging.
- Native HTML5 drag-and-drop was rejected because consistent touch and keyboard support would require bespoke implementation.

Primary references:

- https://dndkit.com/concepts/sortable/
- https://dndkit.com/react/guides/sensors/
- https://docs.dndkit.com/guides/accessibility
- https://atlassian.design/components/pragmatic-drag-and-drop/
- https://github.com/hello-pangea/dnd

### 4.2 API contract

Add `PATCH /api/projects/:projectId/schedule/reorder`:

```json
{
  "kind": "phase | milestone | activity",
  "parentId": "projectId | phaseId | milestoneId/parentActivityId",
  "orderedIds": ["id-1", "id-2", "id-3"]
}
```

The API must authenticate, require writable project access, verify the submitted IDs are the complete sibling set for the stated parent, reject duplicates or cross-project IDs, update positions transactionally, and record one project activity-log event.

## 5. Compatibility and safety constraints

- No schema migration is required; existing `position` fields remain authoritative.
- Reordering is allowed on baselined projects because it changes presentation order only, not baseline/current dates.
- Timeline date dragging remains governed by existing baseline slip controls.
- Alternative sorts and search results are never persisted as schedule order.
- Read-only users see the optimized hierarchy but no drag handles or create actions.
- The UI must degrade to the server order after a failed mutation and display the existing mutation error toast.

## 6. Acceptance criteria

1. Opening a project lands on a compact workspace with the existing view switcher and schedule above secondary registers.
2. Phases and milestones are clearly styled as collapsible sections/subsections.
3. Editors can create a task or Phase directly from the Gantt workspace.
4. Editors can drag a handle to reorder same-parent rows; the order persists after refresh.
5. Keyboard users can focus the handle and reorder using the library's keyboard sensor.
6. Searching or choosing a non-schedule sort disables reordering with a clear explanation.
7. Timeline drag/resize, dependencies, baselines, imports, other project views, and permissions continue to work.
8. TypeScript, project tests, and the production build pass.
