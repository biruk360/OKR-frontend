# Project Creation, Intelligent Import, and AI Planning Requirements

**Status:** Final — approved for implementation
**Version:** 1.1
**Date:** 2026-08-16
**Module:** Delivery > Projects
**Primary users:** Project Managers, Department Leads, Executives, Administrators

**Approved decisions (v1.1):**

1. **Creation access** — Administrators, Executives, Department Leads, and users holding the new **Project Manager capability** may create projects (§4.1).
2. **AI provider** — **OpenAI** is the provider for all phases. The API key is administered in-app: an Administrator can insert, view (masked), rotate, test, and remove it from Settings without a redeploy (§13.5).
3. **Scope** — All four delivery phases in §19 are approved. Phase 1 still ships independently and without AI.

---

## 1. Purpose

Provide three clear, safe, and user-controlled ways to create a project from **Delivery > Projects > New Project**:

1. **Create manually** — enter project information and build from a blank schedule or an existing lifecycle template.
2. **Import a project file** — upload CSV, XLS, XLSX, or DOCX; validate structured files and use AI to clean, map, and extract imperfect or narrative content.
3. **Create with AI** — provide a guided project brief or paste/upload a Terms of Reference (TOR); AI proposes the project structure, activities, deliverables, dates, dependencies, and assumptions.

Every method must converge on the same editable **Project Draft Review** experience. The system must not create a project, import a schedule, commit a baseline, notify stakeholders, or assign work until the user reviews the draft and explicitly selects **Create Project**.

---

## 2. Business Outcomes

- Reduce the time required to turn contracts, TORs, work plans, and spreadsheets into an actionable delivery schedule.
- Preserve the Project Manager's ownership of scope, dates, responsibilities, and deliverables.
- Make imports usable even when source files have inconsistent columns, incomplete dates, duplicated rows, or narrative content.
- Produce a consistent Phase > Milestone > Activity hierarchy regardless of the creation method.
- Prevent AI-generated scope inflation, invented commitments, unsafe assignments, and silent changes.
- Retain source traceability and an audit history for imported or AI-generated project plans.

### Success measures

- At least 80% of valid template-based spreadsheet imports reach the review screen without manual column mapping.
- A user can create a reviewed project from a standard TOR or work plan in under 10 minutes.
- Zero projects or schedule rows are persisted before explicit user confirmation.
- All imported or generated fields remain editable before creation.
- All AI-derived commitments expose their source, confidence, or assumption status.

---

## 3. Scope

### 3.1 In scope

- A new three-option entry experience under **Delivery > Projects > New Project**.
- Manual project creation using the current project fields and lifecycle templates.
- CSV, XLS, XLSX, and DOCX upload.
- Downloadable CSV, XLSX, and DOCX templates.
- Deterministic parsing and validation of structured schedule files.
- AI-assisted header mapping, cleanup, normalization, extraction, and schedule proposal.
- Guided AI project creation from project dates, type, deliverables, constraints, and other brief information.
- AI project creation from pasted TOR text or an uploaded DOCX TOR.
- Draft persistence, preview, direct editing, validation, versioning, and explicit confirmation.
- Atomic creation of the project, project membership, phases, milestones, activities, dependencies, and audit records.
- AI generation usage, cost, latency, and outcome logging using the existing AI generation audit infrastructure.

### 3.2 Out of scope for version 1

- Importing PDF, image, email, or scanned documents.
- OCR.
- Automatic resource leveling based on employee calendars.
- Automatic acceptance of contractual or legal obligations.
- Automatic baseline commitment or project activation.
- Automatic emails, notifications, client portal publishing, or Jira creation.
- Replacing or appending schedules on already-baselined projects.
- AI-generated contract values, budgets, or legal interpretations.

---

## 4. Roles and Access

### 4.1 Creation access

The feature must use **one** server-authoritative project-creation permission, `canCreateProject()`, added to `lib/permissions.ts`. UI visibility and API authorization must call the same helper. The two current hardcoded checks — the `withRole([...])` guard on `POST /api/projects` and the `CAN_CREATE` array in `ProjectsListClient` — must be replaced by it, so creation rights exist in exactly one place.

Access:

| Grantee | Create manually | Import | Create with AI | Commit draft |
|---|---:|---:|---:|---:|
| Administrator | Yes | Yes | Yes | Yes |
| Executive | Yes | Yes | Yes | Yes |
| Department Lead | Yes | Yes | Yes | Yes, within own department scope |
| Project Manager capability | Yes | Yes | Yes | Yes, within own department scope |
| Employee without the capability | No | No | No | No |

The implementation must not infer creation authority from job title or designation text alone.

### 4.1.1 The Project Manager capability

`UserRole` has four values (`ADMIN`, `EXECUTIVE`, `DEPARTMENT_LEAD`, `EMPLOYEE`); "Project Manager" is a **project-level** role on `ProjectMember`, not a system role. Creation rights therefore require an explicit, user-level capability rather than a new system role:

- Add a boolean capability to `User` (`isProjectManager`, default `false`).
- The capability is granted and revoked by Administrators from **Settings > Users**, and every change is written to `ActivityLog`.
- `canCreateProject(user)` returns true when the user's role is `ADMIN`, `EXECUTIVE`, or `DEPARTMENT_LEAD`, **or** the user holds the capability.
- The capability must be explicitly granted. It must **not** be derived from a user already being a project's `projectManagerId` or a `ProjectMember` with role `PM` — derivation cannot bootstrap a new PM's first project and would silently widen access as membership changes.
- A user holding only this capability has no other elevated rights anywhere in the system.
- Granting the capability alone must not expose Settings, user management, or organization configuration.

### 4.1.2 Department scope on commit

For Department Leads and capability holders:

- The draft's `departmentId` must be one the user is permitted to create within; otherwise commit is rejected server-side.
- The user is set as `projectManagerId` by default and may nominate another active user as PM.
- Administrators and Executives may commit into any department.
- Scope is re-checked at commit time (§4.2), not only at draft creation.

### 4.2 Draft access

- A draft is private to its creator by default.
- The creator may explicitly share edit access with another authorized internal user in a later phase; sharing is not required for version 1.
- Administrators may inspect drafts for support and audit purposes.
- Only an authorized creator may commit a draft.
- A draft must be re-authorized at commit time; permission at draft creation time is not sufficient.

---

## 5. Entry Experience

Selecting **Delivery > Projects > New Project** opens a creation-method screen with three cards.

### 5.1 Option cards

#### A. Create manually

**Description:** Enter project details and create a blank schedule or use a standard project template.

**Best for:** A project whose structure is already known or will be planned directly in the system.

#### B. Import a project file

**Description:** Upload CSV, Excel, or Word. The system validates structured data and uses AI to clean or extract the schedule when needed.

**Best for:** Existing work plans, schedules, implementation plans, and TOR documents.

#### C. Create with AI

**Description:** Describe the project or paste its TOR. AI prepares an editable project plan for review.

**Best for:** Early planning where a complete structured schedule does not yet exist.

### 5.2 Shared navigation requirements

- The user may move backward without losing entered or extracted data.
- The current method and progress step must always be visible.
- The user may save and exit a draft.
- Closing a new unsaved draft must show a discard confirmation.
- Switching creation methods must preserve common project metadata and require confirmation if method-specific work would be discarded.

---

## 6. Shared Project Information

All three creation methods must collect or derive the following project information before commit:

| Field | Required | Rules |
|---|---:|---|
| Project name | Yes | 3–200 characters; AI may propose, user confirms |
| Project code | No | Auto-generated if blank; unique; editable |
| Client name | Yes | Select using the existing customer lookup where available |
| Description | No | Maximum 2,000 characters |
| Project manager | Yes | Active internal user; defaults to current user |
| Department | No | Must be within the user's permitted scope |
| Contract value | No | Non-negative; never inferred by AI |
| Currency | No | ETB default; ETB, USD, or EUR |
| Planned start | Yes | Valid date |
| Planned end | Yes | Must be after planned start |
| Project type | Required for AI; optional otherwise | Controlled list plus “Other” |
| Working calendar | Yes | Defaults to organization calendar; initially Monday–Friday |
| Source method | System | MANUAL, FILE_IMPORT, AI_GUIDED, or AI_TOR |

Common fields extracted from a source must display their source and remain editable.

---

## 7. Option A — Create Manually

### 7.1 Flow

1. Enter common project information.
2. Enter project start and end dates.
3. Choose either:
   - **Start blank**, or
   - an existing approved project lifecycle template.
4. Review the project summary and template structure.
5. Select **Create Project**.

### 7.2 Requirements

- Preserve the existing manual project fields and validation.
- Preserve system and custom project templates.
- Show the number of phases, milestones, and activities before selecting a template.
- Allow the user to preview a template tree before creation.
- A manually created project must start in `PLANNING` with no committed baseline.
- When **Start blank** is selected, create no phases, milestones, or activities.
- When a lifecycle template is selected, instantiate a copy; later edits to the source template must not alter the project.

---

## 8. Option B — Import a Project File

### 8.1 Supported formats

| Format | Processing mode | Initial limit |
|---|---|---:|
| CSV | Deterministic parse first; AI cleanup/mapping when required | 10 MB / 2,000 activity rows |
| XLS | Deterministic parse first; AI cleanup/mapping when required | 10 MB / 2,000 activity rows |
| XLSX | Deterministic parse first; AI cleanup/mapping when required | 10 MB / 2,000 activity rows |
| DOCX | Text/table extraction followed by AI structuring | 10 MB / 200 pages |

Limits must be server-configurable. The server must verify MIME type, extension, file signature, archive safety, and file size; client-side checks are not sufficient.

### 8.2 Downloadable templates

The import screen must offer:

- **Excel schedule template (.xlsx)** — an Instructions sheet, Schedule sheet, examples, validation guidance, frozen headers, and controlled-value guidance.
- **CSV schedule template (.csv)** — the same schedule columns in flat form.
- **Project TOR/work-plan template (.docx)** — structured headings for project overview, dates, scope, deliverables, milestones, activities, dependencies, assumptions, responsibilities, approvals, and exclusions.

Templates must be downloadable before a project or draft is created.

The spreadsheet schedule template must support at least:

- Row ID
- Phase and phase weight
- Milestone and milestone weight
- Key milestone flag
- Activity and optional parent activity
- Description
- Deliverable indicator or deliverable name
- Owner party (`360GROUND`, `CLIENT`, `SHARED`)
- Assignee email
- Start and end dates
- Activity weight
- Estimated hours, if provided
- Priority and risk
- Blocker state and details
- Predecessor row IDs
- Dependency types (`FS`, `SS`, `FF`, `SF`)
- Lag days
- Assumptions or source notes

### 8.3 Structured spreadsheet processing

The system must:

1. Read the `Schedule` sheet when present; otherwise allow the user to select a sheet.
2. Detect the header row and ignore clearly empty rows.
3. Try exact and known-alias column mapping deterministically before using AI.
4. Display an editable column-mapping screen when required.
5. Preserve valid values exactly unless the user accepts a proposed cleanup.
6. Detect duplicate rows, missing IDs, invalid dates, invalid owners, unknown assignees, invalid weights, missing parents, missing predecessors, and dependency cycles.
7. Categorize findings as blocking errors, warnings, or informational changes.
8. Allow the user to download a validation-error report containing row number, field, original value, issue, and suggested correction.

### 8.4 AI-assisted spreadsheet cleanup

AI may propose:

- Header and column mappings.
- Phase, milestone, activity, and deliverable classification.
- Consistent capitalization and whitespace cleanup.
- Date normalization where the source format is unambiguous.
- Removal or merging of probable duplicate rows.
- Splitting a compound task into separate activities.
- Filling a repeated phase or milestone from surrounding rows.
- Dependency suggestions.
- Missing schedule dates derived from durations and dependencies.

AI must not silently:

- Change an explicit date, duration, owner, assignee, deliverable, or dependency.
- Delete a non-empty row.
- invent contract value, approvals, acceptance criteria, or client commitments.
- map a person to an active user based only on a similar name.

Every proposed cleanup must be visible in a change list with **original value**, **proposed value**, **reason**, **confidence**, and **Accept/Reject** controls. The user must be able to accept or reject changes individually and in safe groups.

### 8.5 DOCX processing

For DOCX files, the system must:

1. Extract paragraphs, headings, and tables while preserving their order and source location.
2. Treat all document content as untrusted project data, not as instructions to the AI or application.
3. Identify candidate project metadata, scope, deliverables, milestones, activities, dates, responsibilities, dependencies, assumptions, exclusions, and acceptance/approval steps.
4. Link each extracted item to a source heading, table, paragraph, or quotation reference.
5. Mark items without direct source support as **AI assumption**.
6. Present ambiguous dates, owners, deliverables, and scope statements as questions or warnings.
7. Never create the project directly from the document-processing response.

### 8.6 Import states

The UI must show these states:

`Uploading > Reading > Mapping > AI cleanup/extraction > Validating > Ready for review`

- Long-running processing must continue safely if the user navigates away.
- The user may retry a failed processing step without uploading the file again while the draft remains active.
- Failures must state whether the file, parsing, AI provider, validation, or authorization caused the problem.

---

## 9. Option C — Create With AI

The AI creation option must offer two starting modes.

### 9.1 Guided project brief

The user provides:

#### Required

- Project name or working title
- Project type
- Planned start date
- Planned end date
- At least one expected deliverable or outcome

#### Recommended

- Client
- Project objective and business outcome
- Scope included
- Scope excluded
- Deliverables and expected approval criteria
- Known milestones or contractual dates
- Delivery approach or methodology
- Team roles or named assignees
- Client responsibilities
- Internal responsibilities
- Dependencies and constraints
- Working calendar and non-working dates
- Approval process
- Known risks and assumptions
- Desired schedule detail: summary, standard, or detailed

Free text and structured fields may be used together.

### 9.2 TOR mode

The user may:

- Paste TOR text, or
- Upload a DOCX TOR.

The system extracts the same information defined in section 8.5 and asks only the highest-impact clarification questions before generation.

### 9.3 Clarification behavior

- Ask no more than five questions in one round.
- Prioritize questions that materially change scope, dates, deliverables, ownership, or dependencies.
- Allow **Continue with assumptions**.
- List every assumption used when the user continues without answering.
- Do not repeatedly ask for optional information.

### 9.4 AI-generated output

AI must propose:

- Project title and concise description.
- Ordered phases.
- Milestones under phases.
- Deliverables represented as key milestones with the activities required to produce, review, revise, approve, and hand over them where applicable.
- Activities and one level of subtasks.
- Start and end dates within project boundaries.
- Dependency links and lag where justified.
- Responsibility owner (`360GROUND`, `CLIENT`, `SHARED`).
- Suggested internal assignee only when an exact active user or selected team member exists; otherwise suggest a role, not a person.
- Priority, risk, estimated effort, and weights where supported.
- Client approval activities for deliverables that require acceptance.
- Assumptions, exclusions, open questions, and schedule risks.

### 9.5 Schedule-generation rules

- Respect the project start/end boundary and selected working calendar.
- Do not schedule work on non-working days unless the user permits it.
- A successor must respect its dependency type and lag.
- A child activity must remain within its parent activity's date range.
- A milestone date must be consistent with its producing activities.
- The generated critical sequence must fit within the project period; otherwise show an infeasibility warning and suggested resolutions.
- Do not compress activities below reasonable minimum duration without warning.
- Phase and milestone weights should be normalized and shown for review.
- Generated dates are proposals until user confirmation.
- Generated projects must remain `PLANNING` and unbaselined.

### 9.6 AI revision controls

The user may revise the draft through direct editing or constrained instructions such as:

- “Move user testing two weeks earlier.”
- “Add a client approval step after each deliverable.”
- “Reduce this to a summary-level schedule.”
- “Split implementation into mobile and web workstreams.”
- “Do not schedule work on weekends.”

Before applying a revision, the system must show the number of affected items. After applying it, the user must be able to view the diff and undo the revision. AI revisions must never overwrite direct user edits without highlighting the conflict.

---

## 10. Project Draft Review

All creation methods converge on a single review workspace.

### 10.1 Review layout

The workspace must include:

1. **Project Details** — common metadata and dates.
2. **Schedule** — editable grid and Gantt preview.
3. **Deliverables** — deliverable name, producing activities, due date, owner, approval step, and source.
4. **Dependencies** — predecessor/successor relationships and cycle warnings.
5. **Assumptions and Questions** — unresolved or AI-assumed information.
6. **Validation** — blocking errors, warnings, and informational notices.
7. **Source and Changes** — source references and original-versus-proposed values.

### 10.2 User controls

The user must be able to:

- Add, edit, reorder, duplicate, or delete phases, milestones, activities, and dependencies.
- Edit all generated dates, durations, owners, weights, risks, descriptions, and deliverables.
- Accept or reject AI cleanup suggestions.
- Resolve uncertain source mappings.
- Filter the schedule to errors, warnings, assumptions, or AI-generated items.
- Undo and redo draft changes.
- Save and exit.
- Restart from the original source without destroying the prior draft version.
- Download the reviewed draft as XLSX before project creation.
- Cancel without modifying production project data.

### 10.3 Confidence and provenance

Each imported or AI-derived field must support:

- Source type: user input, spreadsheet cell, DOCX paragraph/table, template, or AI assumption.
- Source reference such as sheet/cell, row number, heading/paragraph, or brief field.
- Confidence: high, medium, or low.
- Last editor: user or AI revision.

Low-confidence values that affect dates, deliverables, owner party, scope, or dependencies must appear in the review checklist.

### 10.4 Validation and commit readiness

**Create Project** remains disabled while any blocking error exists.

Blocking errors include:

- Missing required project metadata.
- Invalid project date range.
- Activity dates outside project boundaries unless explicitly approved.
- Activity end before start.
- Missing phase, milestone, or activity title.
- Invalid parent reference.
- Circular dependency.
- Unknown selected assignee.
- Duplicate project code.
- No activity rows for a non-manual imported/generated schedule.
- Loss of project-creation authorization.

Warnings do not block creation but require acknowledgement when they affect scope, dates, deliverables, ownership, or assumptions.

---

## 11. Commit Behavior

### 11.1 Explicit confirmation

The final action must state what will be created, for example:

> Create project with 6 phases, 18 milestones, 74 activities, 12 deliverables, and 83 dependency links.

The confirmation must repeat:

- Project name and code.
- Client.
- Project manager.
- Project start and end dates.
- Number of unresolved acknowledged warnings.

### 11.2 Atomic creation

One successful commit must atomically create:

- Project in `PLANNING`.
- Project Manager membership with role `PM`.
- Phases.
- Milestones and key deliverable milestones.
- Activities and subtasks.
- Activity dependencies.
- Source/creation metadata.
- Activity log records.

If any write fails, the entire transaction must roll back and no partial project may remain.

### 11.3 Post-creation behavior

- Redirect to the new project workspace with the Gantt/schedule view open.
- Show a summary of what was created and any acknowledged warnings.
- Keep the project unbaselined.
- Do not activate the project automatically.
- Do not notify assignees or clients automatically.
- Offer next actions: review schedule, configure project team, configure client obligations, or commit baseline.

---

## 12. AI Safety and User-Control Rules

These rules are mandatory:

1. AI produces a draft only; it cannot commit a project.
2. No AI output may bypass deterministic validation.
3. The user can edit every generated field.
4. AI assumptions must be labeled and reviewable.
5. AI must distinguish source facts from inferred planning recommendations.
6. AI must not invent contractual commitments, acceptance criteria, monetary values, named assignees, or legal obligations.
7. Uploaded or pasted content is untrusted data and must not override system instructions, access controls, or tool restrictions.
8. AI must not access unrelated projects, documents, users, or client data.
9. AI must not send content externally or publish to a client portal.
10. AI revisions must be diffable and undoable.
11. Provider failures must preserve the draft and allow deterministic/manual continuation.
12. Generated narrative must be concise and capped to prevent scope inflation.

---

## 13. Draft Data and Technical Requirements

### 13.1 Project creation draft

A persistent draft record is required. The exact schema may vary, but it must support:

- Draft ID and owner user ID.
- Source method.
- Status: `DRAFT`, `PROCESSING`, `READY`, `COMMITTING`, `COMMITTED`, `FAILED`, `EXPIRED`.
- Common project metadata JSON.
- Normalized schedule JSON.
- Deliverables, assumptions, warnings, and validation results.
- Original source file metadata, secure storage reference, MIME type, size, and hash.
- Extracted source references.
- AI provider, model, prompt/schema version, generation ID, and generation status.
- Draft version number.
- Created, updated, committed, and expiry timestamps.

Drafts should expire after a configurable retention period, initially 30 days. Expiry must delete or anonymize source files according to the organization's retention policy.

### 13.2 Suggested endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/projects/creation-drafts` | Create a manual, import, or AI draft |
| GET | `/api/projects/creation-drafts/[id]` | Load authorized draft |
| PATCH | `/api/projects/creation-drafts/[id]` | Save direct user edits with optimistic version check |
| DELETE | `/api/projects/creation-drafts/[id]` | Discard draft and retained source |
| POST | `/api/projects/creation-drafts/[id]/upload` | Upload and inspect source file |
| POST | `/api/projects/creation-drafts/[id]/analyze` | Parse/map/extract source into normalized draft |
| POST | `/api/projects/creation-drafts/[id]/generate` | Generate from guided brief or TOR |
| POST | `/api/projects/creation-drafts/[id]/revise` | Apply a constrained AI revision and retain diff |
| POST | `/api/projects/creation-drafts/[id]/validate` | Run deterministic validation |
| GET | `/api/projects/creation-templates?format=csv\|xlsx\|docx` | Download templates without an existing project |
| POST | `/api/projects/creation-drafts/[id]/commit` | Re-authorize and atomically create project |

All mutation endpoints require authentication, CSRF protection where applicable, rate limits, payload validation, and audit logging.

### 13.3 Normalized draft structure

All parsers and AI providers must return one versioned server-defined schema, not provider-specific free text. At minimum:

- `project`
- `phases[]`
- `milestones[]`
- `activities[]`
- `dependencies[]`
- `deliverables[]`
- `assumptions[]`
- `questions[]`
- `warnings[]`
- `sources[]`
- `changes[]`

The server must reject AI output that does not validate against this schema.

### 13.4 Concurrency

- Draft updates must use optimistic concurrency through a version number.
- If the draft changed in another browser tab, the user must choose whether to reload, compare, or save a copy.
- Commit must be idempotent. Repeated commit requests for the same committed draft must return the existing project, not create duplicates.

### 13.5 AI Provider Configuration and API Key Management

**Provider decision:** OpenAI is the provider for all phases of this feature. The existing provider abstraction (`lib/ai/providers/`) already implements `OpenAIProvider`; `anthropic` and `gemini` remain unimplemented stubs and must not be selectable for this feature until they are built.

The API key must be administered **in the application**, not only through environment variables, so it can be inserted, rotated, and corrected without a redeploy.

#### 13.5.1 Storage

- The key is stored **encrypted at rest** using AES-256-GCM. Reuse the existing envelope format in `lib/projects/jira-crypto.ts` (versioned `v1:iv:authTag:ciphertext`, with its own AAD string for AI keys and its own key-encryption-key environment variable). Do not invent a second crypto scheme.
- Store the ciphertext, the provider id, the key's last four characters, a label, the granting user, and created/updated/last-verified timestamps.
- The key-encryption key itself remains an environment variable and is never stored in the database or exposed by any API.
- Resolution order at call time: **database-configured key first, environment variable as fallback.** An existing `OPENAI_API_KEY` deployment must keep working with no configuration change.
- If neither source has a key, AI features degrade per §15 — the manual and deterministic-import paths must remain fully usable.

#### 13.5.2 Administration UI

Located under **Settings > Integrations** (Administrator only, gated by the same server check as the API):

- Insert a key for a provider.
- Display the key **masked at all times** as `sk-…` plus the last four characters. The full key must never be returned by any API response, log line, error message, analytics event, or client-side state — including to Administrators, after saving.
- Replace or rotate the key. Rotation overwrites the stored ciphertext; the previous value is not retained.
- Remove the key, with a confirmation that names what will stop working.
- **Test connection** — performs a minimal, low-cost live call and reports success, invalid key, insufficient quota, rate limit, or network failure as distinct outcomes, and records `lastVerifiedAt` on success.
- Select the model used for project creation, from a server-defined allowlist, with a documented default.
- Set the daily generation cap and per-user rate limit (§16), reusing the existing `DAILY_GENERATION_CAP` mechanism.
- A master on/off switch for the project-creation AI feature that is **independent** of `aiSprintPlanningEnabled`. Turning it off must hide the AI creation option and cause AI endpoints to refuse, while leaving Options A and B fully working.
- Show current usage and spend for the feature, sourced from the existing `AiGenerationLog` records.

#### 13.5.3 Feature flag and audit

- Add a dedicated AI feature key (for example `PROJECT_CREATION_AI`) to `AI_FEATURE_KEYS` so this feature's generations are logged, capped, and costed separately from sprint planning and the project AI assistant.
- Every key insert, rotation, removal, test, model change, and flag toggle writes an `ActivityLog` entry recording **who, when, which provider, and the outcome — never the key value or any fragment beyond the stored last four characters.**
- A validation failure at call time must produce an actionable administrator-facing message ("The configured OpenAI key was rejected") and must not leak the key, the request body, the prompt, or a stack trace to end users.

---

## 14. Audit, Privacy, and Security

### 14.1 Audit events

Record at least:

- Draft created, saved, discarded, expired, and committed.
- File uploaded, hash, type, size, and processing outcome.
- Column mapping accepted.
- AI generation and revision requested/completed/failed.
- AI model/provider, prompt version, tokens, cost, latency, and status.
- Cleanup changes accepted or rejected.
- Blocking validation errors and warning acknowledgements.
- Final counts and source method at project creation.

Audit logs must not store full sensitive TOR text unless explicitly required by retention policy.

### 14.2 File safety

- Store uploads outside publicly served paths.
- Use generated storage names; never trust user filenames as paths.
- Reject macro-enabled, encrypted, malformed, or suspicious archive files.
- Protect against ZIP bombs and decompression limits for XLSX/DOCX.
- Sanitize extracted rich text and never render active content.
- Scan uploads with the available malware-scanning service before AI processing or extraction.

### 14.3 Data privacy

- Send only the minimum required source content to the configured AI provider.
- Do not include unrelated organization, user, client, or project data in prompts.
- Redact secrets and obvious credentials before provider submission.
- Display a notice before a TOR or work plan is sent to an external AI provider.
- Follow configured provider retention and regional-processing settings.

---

## 15. Error Handling and Recovery

- Preserve user edits when parsing, validation, or AI generation fails.
- Separate retryable provider/network errors from source-data errors.
- Allow users to continue manually if AI is unavailable.
- Never delete the original source when regenerating a draft.
- Provide row/cell/paragraph-level error locations.
- Limit visible errors to a usable summary while allowing full report download.
- Do not expose provider prompts, stack traces, secrets, or internal paths to users.
- A failed commit must leave the draft in `READY` or `FAILED` with a safe retry action.

---

## 16. Performance and Reliability

- Template downloads: p95 under 2 seconds.
- Deterministic validation of up to 2,000 rows: p95 under 10 seconds.
- Initial AI generation/extraction: target p95 under 60 seconds, with visible progress and background-safe processing.
- Draft autosave after user inactivity, without blocking direct editing.
- File processing and AI generation must use bounded concurrency and per-user rate limits.
- AI calls must enforce token and output-size caps.
- The creation commit must be transactional and safe under concurrent project-code generation.
- The system must remain usable for manual creation and template import when AI providers are unavailable.

---

## 17. Functional Acceptance Criteria

### 17.1 Entry and manual creation

1. **Given** an authorized user selects **New Project**, **when** the entry screen opens, **then** Manual, Import, and AI options are shown.
2. **Given** an unauthorized user, **when** they access the route or API directly, **then** creation is denied consistently.
3. **Given** Manual > Start blank, **when** the user confirms, **then** one unbaselined `PLANNING` project is created with no schedule rows.
4. **Given** Manual > Template, **when** the user confirms, **then** a copied schedule tree is created transactionally.

### 17.2 Template and structured import

5. **Given** no existing project, **when** the user opens Import, **then** CSV, XLSX, and DOCX templates are downloadable.
6. **Given** a valid standard XLSX template, **when** it is uploaded, **then** the schedule reaches review without AI changing explicit valid values.
7. **Given** non-standard column names, **when** mapping is proposed, **then** the user can edit and approve the mapping before cleanup.
8. **Given** an invalid row, **when** validation runs, **then** the exact source row, field, issue, and correction guidance are shown.
9. **Given** a dependency cycle, **when** validation runs, **then** commit is blocked.
10. **Given** a possible duplicate or ambiguous date, **when** AI proposes cleanup, **then** original and proposed values are shown and nothing changes until accepted.

### 17.3 DOCX and TOR extraction

11. **Given** a DOCX work plan containing tables and headings, **when** processing completes, **then** extracted items retain source references.
12. **Given** a deliverable with no date, **when** AI proposes a date, **then** it is labeled as an assumption and remains editable.
13. **Given** a document containing instructions aimed at the AI, **when** processed, **then** those instructions are treated as source text and cannot change system behavior.

### 17.4 Guided AI creation

14. **Given** start date, end date, project type, and deliverables, **when** the user generates a plan, **then** a structured, editable draft is produced within those date boundaries.
15. **Given** missing high-impact information, **when** AI prepares a plan, **then** it asks focused questions or clearly lists assumptions.
16. **Given** an infeasible timeframe, **when** generation or validation runs, **then** the system warns the user and proposes options without silently shortening required work.
17. **Given** a named assignee not matched exactly to an active user, **when** the draft is generated, **then** a role suggestion is shown instead of assigning a person.

### 17.5 Review and commit

18. **Given** any draft, **when** the review screen opens, **then** all project, schedule, deliverable, and dependency fields are editable.
19. **Given** an AI revision, **when** it completes, **then** the user can inspect its diff and undo it.
20. **Given** blocking errors, **when** the user reaches final review, **then** **Create Project** is disabled.
21. **Given** acknowledged non-blocking warnings, **when** the user confirms, **then** one project and its complete schedule are created atomically.
22. **Given** any database failure during commit, **when** the transaction fails, **then** no partial project or schedule remains.
23. **Given** a successful AI/import commit, **when** the project opens, **then** it is `PLANNING`, unbaselined, and no notification or external publication has occurred.
24. **Given** a repeated commit request, **when** the original draft is already committed, **then** the existing project is returned and no duplicate is created.

### 17.6 Access and the Project Manager capability

25. **Given** an Employee **without** the Project Manager capability, **when** they view the Projects list or call the creation API directly, **then** the New Project entry point is hidden **and** the API denies the request through the same `canCreateProject()` check.
26. **Given** an Administrator grants the Project Manager capability to an Employee, **when** that user reloads Projects, **then** all three creation options are available and the grant is recorded in `ActivityLog`.
27. **Given** a user holding only the Project Manager capability, **when** they navigate the application, **then** they gain no additional access to Settings, user management, or organization configuration.
28. **Given** a Department Lead commits a draft whose department is outside their scope, **when** commit runs, **then** it is rejected server-side even if the UI allowed the selection.
29. **Given** a user whose capability is revoked while a draft is open, **when** they attempt to commit, **then** commit is denied and the draft is preserved.

### 17.7 AI provider configuration

30. **Given** no API key in the database or environment, **when** an Administrator opens Settings > Integrations, **then** the AI creation option is shown as unavailable, and Options A and B remain fully functional.
31. **Given** an Administrator enters a valid OpenAI key, **when** they select **Test connection**, **then** success is reported, `lastVerifiedAt` is set, and the AI creation option becomes available without a redeploy.
32. **Given** an invalid or revoked key, **when** connection is tested or generation is attempted, **then** the failure is reported as a distinct, actionable message and no key material appears in any response, log, or error.
33. **Given** a stored key, **when** any API returns the AI settings, **then** only the masked form (last four characters) is returned — never the full key, to any role.
34. **Given** an Administrator rotates the key, **when** the next generation runs, **then** it uses the new key, and the change is audited without recording the key value.
35. **Given** a key exists in both the database and the environment, **when** a generation runs, **then** the database key is used.
36. **Given** the project-creation AI flag is turned off, **when** users open New Project, **then** the AI option is hidden and its endpoints refuse, while sprint-planning AI is unaffected.

---

## 18. Reporting and Product Analytics

Track without storing unnecessary source content:

- Creation method selected and completed.
- Draft abandonment rate by step.
- File format and validation outcome.
- AI cleanup acceptance/rejection rate.
- Number of user edits before commit.
- Time from draft start to project creation.
- Generation latency, token usage, cost, and error rate.
- Count of phases, milestones, activities, deliverables, assumptions, and warnings created.
- Post-creation deletion or major-rework signal, where measurable.

Analytics must not include TOR text, project descriptions, activity descriptions, or client-sensitive content.

---

## 19. Delivery Plan

All four phases are approved (v1.1). They are sequenced so that each phase is independently shippable and Phase 1 delivers working value with no AI dependency whatsoever.

### Phase 0 — Access and configuration foundation

Small, and a prerequisite for the rest.

- `canCreateProject()` in `lib/permissions.ts`; replace the `withRole([...])` guard on `POST /api/projects` and the `CAN_CREATE` array in `ProjectsListClient` with it.
- `User.isProjectManager` capability, granted from Settings > Users, audited (§4.1.1).
- Department scope enforcement on commit (§4.1.2).
- AI settings: encrypted key storage, masked admin UI, test connection, model allowlist, independent feature flag, dedicated AI feature key (§13.5). Ships ahead of the AI phases so the key can be configured and verified before it is needed.

### Phase 1 — Unified creation and deterministic import

No AI dependency. Fully usable on its own.

- Three-option New Project entry.
- Persistent draft and shared review workspace.
- Manual creation.
- CSV/XLS/XLSX template downloads before project creation.
- Deterministic spreadsheet parsing, mapping, validation, preview, and atomic commit.
- Reuse and extend the existing schedule-import parser and transaction logic.

### Phase 2 — AI-assisted spreadsheet and DOCX import

- AI cleanup proposals and change approval.
- DOCX template and structured extraction.
- Source provenance, confidence, and assumptions.
- Background processing and retry.

### Phase 3 — Guided AI and TOR planning

- Guided brief.
- Pasted/uploaded TOR generation.
- Clarification questions.
- AI revisions, diffs, undo, and cost controls.

### Phase 4 — Optimization

- Quality metrics and feedback loop.
- Expanded template library by project type.
- Organization-specific planning rules and holidays.
- Optional collaborative draft review.

---

## 20. Definition of Done

The feature is complete when:

- All three creation methods are available to the same authorized users.
- UI and API use one project-creation authorization rule (`canCreateProject()`), with no remaining hardcoded role list at either call site.
- The Project Manager capability is grantable and revocable by Administrators, is audited, and confers no other elevated access.
- An Administrator can insert, mask-view, rotate, test, and remove the OpenAI API key from Settings without a redeploy; the full key is never returned by any API, log, or error.
- The project-creation AI feature has its own flag and its own AI feature key, and can be disabled without affecting sprint-planning AI.
- CSV, XLS, XLSX, and DOCX are supported as specified.
- CSV, XLSX, and DOCX templates are downloadable without an existing project.
- All methods converge on an editable, persistent review draft.
- Imported and AI-generated values expose provenance, confidence, and assumptions where applicable.
- AI changes are explicit, diffable, reversible, and never auto-committed.
- Deterministic validation blocks invalid schedules.
- Commit is re-authorized, idempotent, audited, and transactional.
- Created projects remain `PLANNING` and unbaselined.
- No assignments, notifications, portal publishing, Jira writes, or baseline commitment happen automatically.
- Security tests cover malicious files, prompt injection, access control, unsafe archives, and oversized payloads.
- Automated tests cover parsers, mappings, validation, scheduling, AI schema validation, draft concurrency, authorization, commit rollback, and idempotency.
- End-to-end tests cover one successful flow for Manual, standard XLSX, non-standard spreadsheet cleanup, DOCX extraction, guided AI, and pasted TOR.
- User documentation and downloadable templates are published.

---

## Appendix A — Codebase Grounding (verified 2026-08-16)

This appendix records what already exists so implementation reuses rather than rebuilds. Verified against the working tree.

### A.1 Existing assets to reuse

| Requirement area | Existing asset | Notes |
|---|---|---|
| Manual creation (§7) | `features/projects/components/CreateProjectWizard.tsx` | 3-step wizard (Basics / Schedule / Template) already implements §7 almost in full. Becomes the "Manual" branch behind the new entry screen. |
| Create API | `app/api/projects/route.ts` `POST` | Zod schema + `createProjectWithTemplate` + `recordActivity` + `emit('PROJECT_CREATED')`. Commit endpoint (§13.2) should call the same service, not duplicate it. |
| Template instantiation (§7.2) | `lib/projects/templates.ts`, `lib/projects/service.ts` | Already copies `structureJson` into concrete rows and seeds approval activities with `ownerParty='CLIENT'`. |
| Spreadsheet parsing (§8.3) | `lib/projects/schedule-import.ts` | 21-column parser with row-level validation, dependency-cycle-adjacent checks, parent/predecessor resolution. §8.2's column list is a **superset** — it adds Deliverable indicator, Estimated hours, Assumptions/source notes. |
| Import UI (§8.6) | `features/projects/components/ScheduleImportModal.tsx` | Validate-then-import two-phase pattern with append/replace modes; the new flow reuses the interaction model but targets a draft, not a live project. |
| Template downloads (§8.2) | `app/api/projects/[id]/schedule-import/template` | **Project-scoped today.** §13.2 requires a project-less variant (`/api/projects/creation-templates`). |
| AI plumbing (§12, §14.1) | `lib/ai/config.ts`, `lib/ai/providers/`, `lib/ai/generation-log.ts`, `lib/ai/cost.ts`, `lib/ai/prompt.ts` | Provider abstraction, daily cap, token/cost/latency logging into `AiGenerationLog` all exist. |
| File parsing deps | `xlsx@0.18`, `mammoth@1.12`, `docx@9.6`, `zod@4`, `@anthropic-ai/sdk@0.95` | **No new dependency is required** for CSV/XLS/XLSX/DOCX read or DOCX template generation. |

### A.2 Gaps that must be built

1. **No project-creation permission exists.** Authorization is hardcoded in two places — `withRole(['ADMIN','EXECUTIVE','DEPARTMENT_LEAD'])` in [route.ts:82](app/api/projects/route.ts#L82) and `CAN_CREATE` in [ProjectsListClient.tsx:20](features/projects/components/ProjectsListClient.tsx#L20). §4.1's "Project Manager capability" row has no backing concept. Implementing §4.1 means adding one helper in `lib/permissions.ts` and having both call sites use it.
2. **No draft model.** `ProjectCreationDraft` (§13.1) is new. Adding it requires `prisma db push` against production per the existing deploy process.
3. **No `Deliverable` model.** The schema is `Project → Phase → Milestone → Activity`. §9.4's decision to represent deliverables as key milestones (`Milestone.isKeyMilestone`) is the correct and only fit — the Deliverables tab in §10.1 is a view over key milestones, not a new table.
4. **The Anthropic provider is a stub.** `lib/ai/providers/index.ts` throws `ProviderNotConfiguredError` for `anthropic` and `gemini`; only `OpenAIProvider` is implemented, while `DEFAULT_PROVIDER` is `'anthropic'`. Phase 2/3 either implements the Anthropic provider or ships configured for OpenAI.
5. **AI feature flag is sprint-specific.** `getAiOrgConfig()` reads `organizationSettings.aiSprintPlanningEnabled`, and `AI_FEATURE_KEYS` has only `SPRINT_PLAN` and `PROJECT_AI_ASSISTANT`. This feature needs its own key (e.g. `PROJECT_CREATION_AI`) and its own org flag so it can be disabled independently.
6. **No file storage for uploads.** §14.2 (store outside public paths, hash, retention, malware scan) has no existing counterpart — the current import parses in-request and discards the file.
7. **Background processing.** §8.6 ("continues safely if the user navigates away") and §16's 60s p95 imply a job path; current AI calls are synchronous inside the request.

### A.3 Invariants inherited from the module spec

The build spec's 10 critical invariants (see `CLAUDE.md`) apply unchanged. The ones this feature touches directly:

- Created projects stay unbaselined — §11.3 already states this, which keeps invariant 1 (immutable baselines) and 2 (no date change without slip reason) out of scope for creation.
- Invariant 6 — AI output capped and post-validated, requiring explicit approval before external use — is what §10.4/§11.1 enforce via the draft review gate.
- Invariant 10 — every mutation writes to `ActivityLog` via `recordActivity()` — covers all draft and commit events in §14.1.
- Invariants 4 and 5 (portal anonymization) are untouched: creation never publishes to the portal (§11.3).

### A.4 Resolved decisions (2026-08-16)

1. **Creation rights** — Administrator, Executive, Department Lead, plus an explicit `User.isProjectManager` capability. Recorded in §4.1 and §4.1.1. Requires the new `canCreateProject()` helper and one schema field.
2. **AI provider** — **OpenAI only.** `OpenAIProvider` in `lib/ai/providers/openai.ts` is already implemented, so no provider work is needed; the Anthropic and Gemini stubs stay unimplemented and must not be selectable. The API key becomes admin-configurable per §13.5 rather than environment-only. Note that `OrganizationSettings.aiPreferredProvider` currently defaults to `"anthropic"` — this feature must resolve to OpenAI regardless of that default, or the default must be changed.
3. **Scope** — all phases approved, with a new Phase 0 (§19) carrying the permission and key-administration work as a prerequisite.

### A.5 Schema changes required

Three additions, all needing `prisma db push` per the project's deploy process:

| Model | Change | Section |
|---|---|---|
| `User` | `isProjectManager Boolean @default(false)` | §4.1.1 |
| `ProjectCreationDraft` | New model — draft state, source metadata, normalized schedule JSON, version | §13.1 |
| AI provider credential | New model (or fields on `OrganizationSettings`) — provider, ciphertext, last four, label, `lastVerifiedAt` | §13.5.1 |

`OrganizationSettings` additionally needs the project-creation AI flag and model selection (§13.5.2).

### A.6 Reuse confirmed for the newly added requirements

- **Encryption (§13.5.1)** — `lib/projects/jira-crypto.ts` already implements AES-256-GCM with a versioned `v1:iv:authTag:ciphertext` envelope, AAD, and a key-env accessor. The AI key uses the same scheme with its own AAD and key-encryption-key variable.
- **Settings surface (§13.5.2)** — `app/dashboard/settings/integrations/page.tsx` and `app/api/settings/integrations/route.ts` already exist as the integrations settings pattern to extend.
- **Usage and spend (§13.5.2)** — `lib/ai/generation-log.ts` and `lib/ai/cost.ts` already record tokens, latency, cost, and status per generation; the usage panel is a read over `AiGenerationLog`.
- **Rate limiting (§13.5.2)** — `DAILY_GENERATION_CAP` in `lib/ai/config.ts` already exists and becomes configurable per feature.
- **Permission helper (§4.1)** — `lib/permissions.ts` already follows this exact shape (`canManageUsers`, `canAccessSettings`, `canCreateLetter`); `canCreateProject()` is a consistent addition, not a new pattern.
