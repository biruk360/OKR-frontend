# Project Creation, Import & AI Planning — Requirements Traceability

**Verified:** 2026-09-27 (agent T2, read-only code review)
**Authoritative spec:** `docs/PROJECT_CREATION_IMPORT_AI_REQUIREMENTS.md` (v1.1 Final, §1–§20 + Appendix A, AC1–AC36)
**Also checked against:** `docs/PROJECT_CREATION_IMPORT_AI_IMPLEMENTATION_STRATEGY.md` (the HOW), `docs/PROJECT_CREATION_TRACKER.md` (statuses were **not** taken on trust)
**Code surface read:** `lib/permissions.ts`, `lib/auth.ts`, `lib/ai/{ai-crypto,credentials,config,admin-settings,connection-test,generation-log}.ts`, `lib/projects/creation-*.ts`, `lib/projects/ai-guided-*.ts`, `lib/projects/project-creation-authorization.ts`, `lib/projects/docx-extract.ts`, `lib/projects/project-docx-template.ts`, `lib/background.ts`, `app/api/projects/creation-drafts/**`, `app/api/projects/creation-templates/route.ts`, `app/api/settings/integrations/ai/**`, `app/api/cron/project-creation-draft-purge/route.ts`, `app/api/users/[id]/project-manager-capability/route.ts`, `features/projects/components/creation/**`, `components/settings/AiProviderSettingsPanel.tsx`, `middleware.ts`, `.env.example`, `scripts/install-crontab.sh`

**Status key:** DONE = requirement met in code (small caveats noted) · PARTIAL = at least one clause unmet · DEVIATES = built to a deliberately different design that changes a spec clause · MISSING = not built / no evidence.

---

## 1. Summary

| Section | Rows | DONE | PARTIAL | DEVIATES | MISSING |
|---|---:|---:|---:|---:|---:|
| §4 Roles & access | 11 | 11 | 0 | 0 | 0 |
| §5 Entry experience | 6 | 6 | 0 | 0 | 0 |
| §6 Shared project info | 4 | 2 | 1 | 1 | 0 |
| §7 Manual creation | 4 | 4 | 0 | 0 | 0 |
| §8 File import | 25 | 22 | 1 | 1 | 1 |
| §9 Create with AI | 13 | 13 | 0 | 0 | 0 |
| §10 Draft review | 14 | 12 | 1 | 1 | 0 |
| §11 Commit | 5 | 5 | 0 | 0 | 0 |
| §12 AI safety rules | 12 | 11 | 1 | 0 | 0 |
| §13 Draft data / provider config | 25 | 19 | 4 | 1 | 1 |
| §14 Audit, privacy, security | 17 | 11 | 5 | 0 | 1 |
| §15 Error handling | 8 | 8 | 0 | 0 | 0 |
| §16 Performance & reliability | 7 | 3 | 1 | 0 | 3 |
| §18 Analytics | 1 | 0 | 0 | 0 | 1 |
| §19 Phase 4 | 1 | 0 | 0 | 0 | 1 |
| **Functional requirements (§4–§19)** | **153** | **127** | **14** | **4** | **8** |
| §17 Acceptance criteria AC1–AC36 | 36 | 34 | 2 | 0 | 0 |
| §20 Definition of Done | 18 | 14 | 3 | 0 | 1 |
| **All rows** | **207** | **175** | **19** | **4** | **9** |

**Test run (2026-09-27):** `npx tsx --test lib/projects/project-creation*.test.ts lib/projects/creation-draft-purge.test.ts` → **164 tests, 164 pass, 0 fail** (32 suites). Tests are unit/contract tests with fake Prisma and fake OpenAI clients. There are **no end-to-end tests** (no Playwright or Cypress in the repo), **no live OpenAI smoke test**, and **no performance measurements**.

**Where this review disagrees with the tracker:**
- The tracker marks **AC10** ✅. The change-decision mechanics are built. But nothing in the import pipeline ever produces an AI cleanup proposal: no duplicate, date, capitalisation, split or fill suggestions. The AC10 test builds its proposals by hand (see I-12).
- The tracker marks **AC32** ✅. That is true for **Test connection** only. When OpenAI rejects the key during a generation, the user gets a generic "provider request failed" message, and `lastVerifiedAt` is not cleared (see K-17).
- The tracker marks **AC13** ✅. Its test exercises `buildProjectCreationDocxExtractionPrompt` (`lib/projects/docx-extract.ts:266`), which **nothing in production calls**. The DOCX import is deterministic. The live AI path (TOR text) is covered by a different test (`project-creation-ai-guided.test.ts:683`), so the AC still holds.
- Story 2.6's open gap ("the AI generator must call the labeller") is **closed**. See `ai-guided-service.ts:700` and `:846`.

---

## 2. §4 Roles and access

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| A-01 | One server-authoritative `canCreateProject()`, used by UI and API; no hardcoded role lists | DONE | `lib/permissions.ts:38-43`; `app/api/projects/route.ts:83`; `app/dashboard/projects/page.tsx:17`; every creation route calls it (e.g. `creation-drafts/route.ts:28`). Test `project-creation-permission.test.ts:29` | — |
| A-02 | Matrix: Admin/Exec/DL/PM-capability allowed; Employee without the capability denied | DONE | `permissions.ts:39-42`. Test `project-creation-permission.test.ts:10,23` | — |
| A-03 | `User.isProjectManager` defaults to false; granted/revoked by Admin; written to ActivityLog | DONE | `app/api/users/[id]/project-manager-capability/route.ts:11` (`withRole('ADMIN')`); `lib/projects/project-manager-capability.ts:64-65`. Tests `project-creation-capability.test.ts:44,68` | — |
| A-04 | Capability not derived from PM membership or `projectManagerId` | DONE | `permissions.ts:38-43` reads only role and the flag | — |
| A-05 | Capability confers no other elevated access | DONE | Test `project-creation-capability.test.ts:105` | — |
| A-06 | Commit rejected server-side when the department is outside a DL/PM's scope | DONE | `project-creation-authorization.ts:79-94` (active `DepartmentMembership`, `endedAt: null`). Test `…commit-authorization.test.ts:50` | — |
| A-07 | Creator is the default PM; may nominate another active user | DONE | `project-creation-authorization.ts:96-105` | — |
| A-08 | Admin/Exec may commit into any department | DONE | `project-creation-authorization.ts:79`. Test `…commit-authorization.test.ts:118` | — |
| A-09 | Scope and permission re-checked at commit time, inside the transaction | DONE | `creation-commit.ts:142-150` (runs inside the `$transaction` started at `:127`); session capability refreshed from the DB at `lib/auth.ts:188-196` | — |
| A-10 | Draft private to its creator; Admin may inspect | DONE | `creation-draft.ts:257` (owner or ADMIN read); every mutation filters on `ownerUserId` (`:312,:374`) | Admin reads are not audited (not required) |
| A-11 | Only an authorized creator may commit | DONE | `project-creation-authorization.ts:65-77`. Test `…commit-authorization.test.ts:75,100` | — |

## 3. §5 Entry experience

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| E-01 | Three cards (Manual / Import / AI) with descriptions | DONE | `features/projects/components/creation/NewProjectEntry.tsx:37`, `methods.ts:35-58`. Test `project-creation-entry.test.ts:12` | — |
| E-02 | Move back without losing data | DONE | Drafts persist immediately. `CreationDraftShell.tsx`; browser-verified per tracker 1.3 | — |
| E-03 | Current method and step always visible | DONE | `CreationDraftShell.tsx:39` (method labels) and step chrome | — |
| E-04 | Save and exit | DONE | URL-backed resume via `?creationDraft=` (`app/dashboard/projects/page.tsx:24-35`) | — |
| E-05 | Discard confirmation | DONE | `CreationDraftShell.tsx:55-61,127` using `ConfirmDialog` | — |
| E-06 | Switching method keeps common metadata and needs confirmation | DONE | `creation-draft.ts:358-398` clears only schedule, validation and source; `[id]/route.ts:53-67` requires `discardMethodData` | — |

## 4. §6 Shared project information

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| S-01 | Field set: name, code, client, PM, department, value, currency, dates, type, working calendar | DONE | `creation-normalize.ts` project schema; readiness checks at `creation-validate.ts:234-242` | — |
| S-02 | Contract value is never inferred by AI | DONE | The AI plan schema has no `contractValue` (`ai-guided-schema.ts`). Only user input reaches `creation-commit.ts:210` | — |
| S-03 | Source method recorded as MANUAL / FILE_IMPORT / AI_GUIDED / **AI_TOR** | DEVIATES | TOR is a brief `mode` inside `AI_GUIDED`. No code path ever creates an `AI_TOR` draft (it appears only in labels, `methods.ts:60`) | The creation audit cannot tell a TOR plan from a guided plan |
| S-04 | Common fields extracted from a source show their source and stay editable | PARTIAL | AI and manual metadata are user input (USER_INPUT sources) | The file import never extracts project metadata (name, client, dates) from the DOCX or spreadsheet (see I-17) |

## 5. §7 Manual creation

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| M-01 | Flow: details → dates → blank/template → review → Create | DONE | `CreateProjectWizard.tsx` routes to `DraftReviewWorkspace` (`:203`) | — |
| M-02 | Keep existing fields and validation; system and custom templates | DONE | `lib/projects/manual-creation.ts`; tracker 1.4 browser proof | — |
| M-03 | Counts and preview tree before selection | DONE | Tracker 1.4 (browser `5/5/12`) | — |
| M-04 | PLANNING, no baseline; blank creates zero rows; template tree copied | DONE | Tests `project-creation-manual.test.ts:86,102,136` | — |

## 6. §8 Import a project file

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| I-01 | CSV/XLS/XLSX/DOCX; limits of 10 MB / 2,000 rows / 200 pages, server-configurable | DONE | `resolveProjectCreationImportLimits` (`creation-import.ts`); `docx-extract.ts:10-12,74-80` | — |
| I-02 | Server checks MIME, extension, signature, archive safety and size | DONE | `creation-upload-security.ts:240-308` (signature, OLE/ZIP, EOCD walk, ZIP64/multi-disk refusal); `validateProjectCreationImportFile` | — |
| I-03 | XLSX, CSV and DOCX templates downloadable before any project or draft exists | DONE | `app/api/projects/creation-templates/route.ts:14-38`. Tests `…import-templates.test.ts:30,43,62,102` | Manual browser download of the DOCX is still pending (tracker AC5) |
| I-04 | Template column superset (deliverable, estimated hours, notes, …) | DONE | Story 1.6. `schedule-import.ts` keeps its 21 legacy headers and adds optional ones | — |
| I-05 | Use the `Schedule` sheet or let the user select; detect the header row | DONE | `inspectProjectCreationSpreadsheet` (`creation-import.ts`); `SHEET_SELECTION` stage (`creation-processing.ts:437-443`) | — |
| I-06 | Exact and alias mapping before AI; editable mapping screen | DONE | `ColumnMappingStep.tsx:90-148`. Test `…deterministic-import.test.ts:66` | — |
| I-07 | Keep valid values exactly | DONE | Test `…deterministic-import.test.ts:27` (AC6) | — |
| I-08 | Detect duplicates, bad dates/owners/assignees/weights/parents/predecessors, and cycles | DONE | `creation-validate.ts:116-293` | "Duplicate rows" means duplicate Row IDs only (`schedule-import.ts:142`); content-level duplicates are not detected |
| I-09 | Classify findings as blocking / warning / info | DONE | `creation-validate.ts` issue severities | — |
| I-10 | Downloadable report with row, field, original value, issue, correction | DONE | `ValidationReportPanel.tsx:19-33,50` | Formula-injection risk tracked at P-12 |
| I-11 | AI header/column mapping proposals | DONE | `lib/projects/creation-ai-mapping.ts:72-149`; `mapping-proposal/route.ts:31-190`. Test `…ai-mapping.test.ts:27` | — |
| I-12 | AI cleanup proposals: classification, casing/whitespace, date normalisation, duplicate merge, split, fill-down, dependency and missing-date suggestions | **MISSING** | The change-kind enum exists (`creation-normalize.ts:198-209`) and so does the decision engine (`creation-changes.ts`). **Nothing produces these proposals**: a grep for producers of `DUPLICATE_ROW`, `DATE_NORMALIZATION`, `SPLIT_ACTIVITY` and similar returns only the enum. `ChangeListPanel` only ever receives server-authored changes | The whole AI-cleanup half of §8.4 is unbuilt. AC10 is proven only on hand-made proposals |
| I-13 | AI never silently changes explicit values, deletes rows, invents values, or name-matches people | DONE | Mapping never transforms values (`creation-ai-mapping.ts:83,119`). Change transitions are guarded (`creation-changes.ts:188-217`). Import assignees match by email only | — |
| I-14 | Change list shows original, proposed, reason and confidence; individual and safe-group accept/reject | DONE | `ChangeListPanel.tsx`; safe groups limited to casing/whitespace on text fields (`creation-changes.ts:9-22,134-162`). Test `…change-list.test.ts:45` | Only reachable once I-12 exists |
| I-15 | DOCX: ordered paragraphs, headings and tables with source locations | DONE | `docx-extract.ts:159-260`. Test `…docx-extract.test.ts:47` | — |
| I-16 | DOCX content treated as untrusted data | DONE | `externalFileAccess: false`, images stubbed (`docx-extract.ts:170,176`); output is plain text | — |
| I-17 | DOCX: find candidate metadata, scope, deliverables, milestones, activities, dates, responsibilities, dependencies, assumptions, exclusions, approvals | PARTIAL | Blocks are tagged (`docx-extract.ts:131-150`). `creation-docx-schedule.ts` turns tables and lists into activities, key milestones and deliverables | Project metadata, scope, exclusions and assumptions sections are tagged but never mapped into `project.*` or `assumptions[]` |
| I-18 | Each DOCX item linked to its source; unsupported items marked as assumptions | DONE | `DOCX_TABLE`/`DOCX_PARAGRAPH` sources with excerpts; generated groupings are PROPOSED assumptions (`creation-docx-schedule.ts:850-902`) | — |
| I-19 | Ambiguous dates, owners and deliverables shown as questions or warnings | DONE | LOW-confidence and undated-deliverable warnings plus an unacknowledged `DOCX_SCHEDULE_REVIEW` warning (tracker W4-G4) | — |
| I-20 | DOCX processing is "text/table extraction followed by **AI structuring**" (§8.1 table) | DEVIATES | Extraction is fully deterministic. `buildProjectCreationDocxExtractionPrompt` (`docx-extract.ts:266`) is used only by tests | A deliberate choice (Import card copy updated), but it changes the §8.1 and §19 Phase 2 scope. Needs a product sign-off |
| I-21 | Document processing never creates the project | DONE | The processing job writes only to the draft (`creation-processing.ts:476-481`) | — |
| I-22 | UI shows the §8.6 states | DONE | `ImportUploadStep.tsx:49-51` | There is no "AI cleanup" step (none exists) |
| I-23 | Long processing continues if the user leaves the page | DONE | `upload/route.ts:108-121` (202 + `runAfterResponse`); polling `GET` at `:131-150` | Runs in-process: a PM2 restart leaves an INTERRUPTED draft (user can retry) |
| I-24 | Retry a failed step without uploading again | DONE | `upload/retry/route.ts:33-78`; `beginProjectCreationProcessing` idempotency (`creation-processing.ts:169-239`). Test `…background-processing.test.ts:167,194` | — |
| I-25 | Failures name their cause (file, parsing, provider, validation, authorization) | DONE | `creation-processing.ts:300-328` categories. Test `…background-processing.test.ts:226` | — |

## 7. §9 Create with AI

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| G-01 | Guided brief with all required and recommended fields | DONE | `ai-guided-brief.ts:80` (`aiGuidedBriefSchema`); `AiBriefStep.tsx`. Test `…ai-guided.test.ts:260` | — |
| G-02 | Free text and structured fields together | DONE | Same brief schema (notes and all structured fields) | — |
| G-03 | Paste TOR text | DONE | TOR mode, max 20,000 characters (`ai-guided-brief.ts`) | — |
| G-04 | Upload a DOCX TOR | DONE | `ai-guided-tor-upload.ts:100-195` (scan → store → extract → editable text). Test `…ai-guided-intake.test.ts:109,124` | — |
| G-05 | TOR mode asks only the highest-impact questions before generating | DONE | `clarifyAiGuidedDraft` (`ai-guided-service.ts:491-583`) | — |
| G-06 | At most 5 questions per round, prioritised | DONE | `ai-guided-service.ts:536-545` (LOW dropped, HIGH first, `.slice(0,5)`). Test `…ai-guided.test.ts:444` | — |
| G-07 | "Continue with assumptions", listing every assumption used | DONE | `ai-guided-service.ts:563-570,609-619,660-669` | — |
| G-08 | No repeated asks for optional information | DONE | De-dup plus a 2-round cap (`ai-guided-service.ts:502-506,534-543`) | — |
| G-09 | §9.4 output content (phases, milestones, deliverables as key milestones, one subtask level, dependencies, owner party, roles, weights, approvals, assumptions/exclusions/risks) | DONE | `ai-guided-schema.ts` plan schema; `ai-guided-schedule.ts:585,680-683` (deliverable → key milestone + approval step). Test `…ai-guided.test.ts:271` | — |
| G-10 | Assign a person only on an exact active-user match, otherwise suggest a role | DONE | `ai-guided-schedule.ts:382-409`. Test `…ai-guided.test.ts:380` | An exact normalised full-name match (no email) does assign. Accepted as "exact" |
| G-11 | §9.5 rules: calendar, boundaries, dependency type and lag, containment, milestone consistency, infeasibility warning, no compression, normalised weights | DONE | `ai-guided-schedule.ts` (`AI_SCHEDULE_INFEASIBLE` at `:840`). Tests `…ai-guided.test.ts:329,357` | — |
| G-12 | Constrained revision: affected count before apply; diff and undo afterwards | DONE | `previewAiGuidedRevision`/`applyAiGuidedRevision`/`undoAiGuidedRevisionForDraft` (`ai-guided-service.ts:736-891`); signed, version-bound preview token (`ai-guided-revise.ts:506-527`). Test `…ai-guided.test.ts:498` | — |
| G-13 | Revisions never overwrite direct edits without highlighting the conflict | DONE | `ai-guided-service.ts:840-845` (`acceptConflicts`). Test `…ai-guided.test.ts:552,581` | Unsaved workspace edits are discarded when a revision is applied (the UI warns) |

## 8. §10 Project draft review

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| R-01 | Seven panels, including an editable grid and Gantt preview | DONE | `DraftReviewWorkspace.tsx:67,90,647-648,728-734`. Test `…review.test.ts:38` | — |
| R-02 | Add, edit, reorder, duplicate and delete phases, milestones, activities and dependencies | DONE | Same test (AC18) | — |
| R-03 | Accept or reject cleanup; resolve uncertain mappings | DONE | `ChangeListPanel` in the Sources panel (`DraftReviewWorkspace.tsx:793`) | — |
| R-04 | Filter to errors, warnings, assumptions or AI items | DONE | `DraftReviewWorkspace.tsx:68,97-100,318-323` | — |
| R-05 | Undo and redo | DONE | `DraftReviewWorkspace.tsx:144,192,378-382` | In-session only |
| R-06 | Save and exit | DONE | Versioned PATCH | — |
| R-07 | Restart from the original source **without destroying the prior draft version** | PARTIAL | Restart confirmation at `DraftReviewWorkspace.tsx:432-439` | No persisted version history. Re-analysis overwrites `scheduleJson` (`creation-processing.ts:192-207`); only the in-session "review-open version" can be restored |
| R-08 | Download the reviewed draft as XLSX | DONE | `DraftReviewWorkspace.tsx:385` | — |
| R-09 | Cancel without touching production data | DONE | Drafts are separate rows; no project write before commit | — |
| R-10 | Provenance per value (type, reference, confidence, last editor), server-owned | DONE | `creation-provenance.ts:64-95` (client add/remove/edit rejected with 422); `creation-draft.ts:340-357`. Tests `…provenance.test.ts:103,140` | — |
| R-11 | Low-confidence date, deliverable, owner, scope and dependency values appear in the review checklist | DONE | DOCX LOW → warnings. AI-inferred date/owner → PROPOSED assumptions (`ai-guided-service.ts:408-426`) | — |
| R-12 | Create disabled while any blocking error exists | DONE | `creation-commit-shared.ts:47-79`; server re-check at `creation-commit.ts:162-183`. Test `…commit.test.ts:116` | — |
| R-13 | Warnings need acknowledgement | DONE | `creation-commit-shared.ts:54-56` | — |
| R-14 | Activity dates outside the project are blocking "unless explicitly approved" | DEVIATES | `creation-validate.ts:266-267` is always BLOCKING | There is no approve-exception mechanism, although the correction text says "explicitly approve the exception". Stricter than the spec |

## 9. §11 Commit behaviour

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| C-01 | Confirmation states the counts and repeats name, code, client, PM, dates and warning count | DONE | `CommitConfirmDialog.tsx:34,59-68` | — |
| C-02 | Atomic creation: project, PM member, phases, milestones and deliverables, activities and subtasks, dependencies, source metadata, activity logs | DONE | `creation-commit.ts:127-352`, reusing `createProjectWithTemplate` (`:202-216`). Test `…commit.test.ts:125` | Source metadata is kept only in ActivityLog metadata (`:306-330`), not on the Project row |
| C-03 | Any failure rolls everything back | DONE | Single `$transaction`. Test `…commit.test.ts:143` | — |
| C-04 | Redirect to the Gantt with a summary and next actions | DONE | Tracker 1.10 browser proof | — |
| C-05 | Unbaselined, not activated, no notifications | DONE | There is no `emit` in `creation-commit.ts` (the strategy's §2.10 `emit('PROJECT_CREATED')` was rightly dropped because the requirement wins). Test `…commit.test.ts:151` | — |

## 10. §12 AI safety rules

| ID | Rule | Status | Evidence | Gap |
|---|---|---|---|---|
| Z-01 | AI produces a draft only; it cannot commit | DONE | AI services write only through `persistDraft` (`ai-guided-service.ts:195-251`); commit is a separate user action | — |
| Z-02 | No AI output bypasses deterministic validation | DONE | `splitNormalizedProjectCreationDraft` strict gate (`:209`); commit re-validates (`creation-commit.ts:162`) | — |
| Z-03 | The user can edit every generated field | DONE | Shared workspace (AC18) | — |
| Z-04 | Assumptions are labelled and reviewable | DONE | PROPOSED assumptions block commit (`creation-commit-shared.ts:60-62`) | — |
| Z-05 | Source facts distinguished from inferences | DONE | `basis: SOURCE_FACT/INFERRED` (`ai-guided-prompt.ts:160`; provenance sources) | — |
| Z-06 | No invented commitments, criteria, money, named assignees or legal obligations | DONE | `ai-guided-prompt.ts:26-27,159`; no money fields in the schema; role-only assignment (G-10) | — |
| Z-07 | Uploaded or pasted content is untrusted and cannot override instructions | PARTIAL | Brief and TOR text sit inside `UNTRUSTED_PROJECT_DATA` (`ai-guided-prompt.ts:25,137,172`). Test `…ai-guided.test.ts:683` | The **revision** prompt sends `CURRENT_PLAN` (titles derived from TOR or user content) outside the untrusted delimiter (`ai-guided-prompt.ts:193-202`; `ai-guided-revise.ts:97-119`) |
| Z-08 | No access to unrelated projects, users or clients | DONE | Only the brief is sent. The active-user list is used only server-side for redaction and matching (`ai-guided-service.ts:312-322`) | — |
| Z-09 | No external send or publish | DONE | The revise prompt refuses non-edit requests (`ai-guided-prompt.ts:191`); no send path exists | — |
| Z-10 | Revisions are diffable and undoable | DONE | G-12 | — |
| Z-11 | Provider failures keep the draft; manual path continues | DONE | `runLoggedCall` writes nothing on failure (`ai-guided-service.ts:365-397`). Test `…ai-guided.test.ts:412,658` | — |
| Z-12 | Narrative is concise and capped | DONE | `AI_GUIDED_CAPS` (`ai-guided-schema.ts:31-43`): 800-character description, 300-character narratives, activity caps by detail level | — |

## 11. §13 Draft data, endpoints and AI provider configuration

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| T-01 | Persistent draft with owner, method, 7 statuses, JSON slices, source metadata, AI provider/model/prompt version, version, timestamps | DONE | `creation-draft.ts:26-49`; `persistDraft` stamps `aiProvider/aiModelId/aiPromptVersion` (`ai-guided-service.ts:225`) | The generation ID lives only in source IDs and logs, with no draft column. The `EXPIRED` status is never set (the purge deletes instead) |
| T-02 | 30-day configurable retention; expiry deletes or anonymises source files | PARTIAL | `expiresAt` set at `creation-draft.ts:167-174,224`. Purge at `creation-draft-purge.ts:65-117`; cron in `scripts/install-crontab.sh:168` | (a) Stale `PROCESSING` drafts are skipped forever (`creation-draft-purge.ts:28,72`), so their files are never purged. (b) COMMITTED drafts keep brief/TOR text and DOCX excerpts in `projectJson`/`scheduleJson` indefinitely (only the file is removed). (c) The default storage root is `os.tmpdir()` (`creation-upload-security.ts:120`) |
| T-03 | Endpoint set including `/generate`, `/revise`, `/validate` | DEVIATES | AI endpoints live under `…/ai-guided/{brief,clarify,answers,generate,revise,undo,tor-upload}`. There is no `/validate` (validation runs inside the upload job, `analyze` and `commit`) | Functionally covered; the paths differ from §13.2 |
| T-04 | Every mutation endpoint has auth, CSRF protection, rate limits, payload validation and audit | PARTIAL | Auth via `withAuth`/`withRole`; strict Zod on every route; audited writes | **Rate limits exist only on AI calls** (`ai-guided-service.ts:259-310`, `mapping-proposal/route.ts:62-88`). Upload, PATCH and commit have none. CSRF relies on `sameSite: 'lax'` (`lib/auth.ts:279`). Nothing caps the body size before `request.formData()` (`upload/route.ts:50`) |
| T-05 | One versioned server schema; AI output that fails it is rejected | DONE | `creation-normalize.ts` strict v1; `validateAiGuidedPlan` plus one repair round (`ai-guided-openai.ts:131-170`) | — |
| T-06 | Optimistic concurrency via the version number | DONE | `creation-draft.ts:371-413`; `persistDraft` at `ai-guided-service.ts:213-233` | — |
| T-07 | On a conflict the user chooses reload, compare or save a copy | PARTIAL | The server returns the `RELOAD/COMPARE/SAVE_COPY` actions (`creation-draft.ts:49`; `[id]/route.ts:78-85`) | The UI offers **reload only**, in the AI flow (`AiGuidedFlow.tsx:100,215`). `DraftReviewWorkspace` has no 409 handling. Compare and save-copy are not built |
| T-08 | Idempotent commit returns the existing project | DONE | `creation-commit.ts:133,185-200`. Test `…commit.test.ts:163` | — |
| K-01 | OpenAI only; Anthropic and Gemini not selectable | DONE | `credentials.ts:5,57-62`; model allowlist `config.ts:35-41`; the settings schema accepts only allowlisted models (`settings/integrations/ai/route.ts:18`) | — |
| K-02 | AES-256-GCM, `v1:iv:tag:ct`, its own AAD and KEK variable | DONE | `ai-crypto.ts:3-9,11-53` (AAD `okr-ai:provider-key:v1`, `AI_CREDENTIAL_ENCRYPTION_KEY`) | — |
| K-03 | Stores ciphertext, provider, last 4, label, granting user and timestamps | DONE | `admin-settings.ts:207-225` | — |
| K-04 | The KEK stays an environment variable, never in the DB or an API | DONE | `ai-crypto.ts:55-70` | **Ops:** `AI_CREDENTIAL_ENCRYPTION_KEY` is missing from `.env.example`. Without it, saving a key fails with a 500 |
| K-05 | DB key first, environment fallback | DONE | `credentials.ts:37-55`; a corrupt DB ciphertext fails closed. Test `…ai-credentials.test.ts:60` | — |
| K-06 | Without a key, AI degrades and Manual/Import keep working | DONE | `admin-settings.ts:136-142`; `methods.ts:39-47`. Test `…ai-admin-settings.test.ts:130` | — |
| K-07 | Admin-only UI; key always masked; full key never returned | DONE | `withRole('ADMIN')` (`settings/integrations/ai/route.ts:23,27,40`); mask at `admin-settings.ts:107-109`; the ciphertext is never selected (`:118`); the form field resets (`AiProviderSettingsPanel.tsx:61,72-73`). Test `…ai-admin-settings.test.ts:144` | — |
| K-08 | Rotation overwrites; the old value is not kept | DONE | Upsert with `lastVerifiedAt: null` (`admin-settings.ts:207-240`). Test `…:184` | — |
| K-09 | Removal confirmation names what stops working | DONE | `AiProviderSettingsPanel.tsx:194-196,337-346`; `admin-settings.ts:327-355` | — |
| K-10 | Test connection gives distinct outcomes and records `lastVerifiedAt` | DONE | `connection-test.ts:132-148,160-217` (a zero-token `models.list` probe). Tests `…ai-connection-test.test.ts:85,128` | — |
| K-11 | Model chosen from a server allowlist with a default | DONE | `config.ts:35-41` | — |
| K-12 | Daily cap and per-user limit | DONE | `admin-settings.ts:13-14,270-283`; enforced at `ai-guided-service.ts:271-299` and `mapping-proposal/route.ts:62-88` | The cap counts only `status:'OK'` calls (`:272`), so failed calls that spent tokens are not counted. There is no USD budget. The 30-minute cooldown also blocks mapping after **any** successful AI call (`mapping-proposal/route.ts:68-88`) |
| K-13 | Independent master switch: hides the AI option; endpoints refuse; sprint AI unaffected | DONE | `config.ts:62-78`; every AI route calls `requireProjectCreationAiEnabled`; draft create and method switch refuse (`ai-guided-api.ts:35-47`, `creation-drafts/route.ts:41`, `[id]/route.ts:116`). Tests `…ai-feature-flag.test.ts:81`, `…ai-guided-intake.test.ts:22,40`, `…ai-guided.test.ts:614` | — |
| K-14 | Show current usage and spend from `AiGenerationLog` | **MISSING** | `AiProviderAdminSettings` (`admin-settings.ts:66-81`) and `AiProviderSettingsPanel.tsx` have no usage or spend fields | Admins cannot see feature consumption |
| K-15 | Dedicated `PROJECT_CREATION_AI` feature key: logged, capped, costed | DONE | `config.ts:6`; `generation-log.ts:26-52` (cost via `estimateCostUsd`) | — |
| K-16 | Every key insert, rotate, remove, test, model change and flag toggle audited without key material | DONE | `admin-settings.ts:227-240,248-254,313-321,340-350`; `connection-test.ts:192-211` | — |
| K-17 | A key rejected at call time gives an actionable admin message and leaks nothing | PARTIAL | Nothing leaks: `providerFailure` (`ai-guided-service.ts:353-358`); mapping `:178-183`; production 500s are generic (`lib/api/handleError.ts:34-38`) | A 401 during generation or mapping shows the generic "provider request failed", not "The configured OpenAI key was rejected". `lastVerifiedAt` is not cleared, so the option stays "available" |

## 12. §14 Audit, privacy and security

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| P-01 | Audit draft created, saved, discarded, expired, committed | DONE | `creation-draft.ts:237-247,417-437,579-589`; `creation-commit.ts:323-330`; purge `creation-draft-purge.ts:97-110` | The purge audit is written outside a transaction and after the delete |
| P-02 | Audit file upload with hash, type, size and outcome | DONE | `creation-processing.ts:218-236,280-294` | — |
| P-03 | Audit column-mapping acceptance | DONE | `analyze/route.ts:140-154` (`mappingMode: 'MANUAL'`) | — |
| P-04 | Audit AI generation and revision: requested, completed, failed | PARTIAL | Mapping has request/proposed/failed events (`mapping-proposal/route.ts:109,136,172`). Guided generate/revise/undo success is audited (`ai-guided-service.ts:706,858,887`) | Guided **request** and **failure** events reach `AiGenerationLog` only, never ActivityLog |
| P-05 | Record model, provider, prompt version, tokens, cost, latency and status | DONE | `generation-log.ts:26-52`; `logCall` (`ai-guided-service.ts:326-351`) | — |
| P-06 | Audit accepted and rejected cleanup changes | DONE | `creation-draft.ts:438-463` | — |
| P-07 | Audit blocking validation errors and warning acknowledgements | PARTIAL | Validation outcome is in the processing audit (`outcome: VALIDATION_FAILED`) | Acknowledgements appear only as a generic `UPDATED` with `changedFields:['validationJson']`, with no specific event or count |
| P-08 | Audit final counts and source method at creation | DONE | `creation-commit.ts:304-330` | — |
| P-09 | Audit never stores full TOR text | DONE | Brief and TOR audits carry counts only (`ai-guided-service.ts:462-468`; `ai-guided-tor-upload.ts:168-180`) | — |
| P-10 | Uploads stored outside public paths under generated names | DONE | `creation-upload-security.ts:116-129,388-439` (`wx`, `0600`/`0700`, UUID names, public-root refusal). Test `…upload-security.test.ts:52,153` | Default root is `os.tmpdir()`, which is volatile and shared. Set `PROJECT_CREATION_UPLOAD_DIR` in production |
| P-11 | Reject macro, encrypted, malformed and suspicious archives; zip-bomb limits | DONE | `creation-upload-security.ts:64-71,146-238,264-303`. Test `…upload-security.test.ts:106` | — |
| P-12 | Sanitise extracted content; never render active content | PARTIAL | Extraction is plain text; React escapes it | The validation CSV report writes raw source values without neutralising a leading `= + - @` (`ValidationReportPanel.tsx:13-17`), so spreadsheet formula injection reaches the user's Excel |
| P-13 | Malware scan before extraction or AI; fail closed | PARTIAL | ClamAV `INSTREAM` refuses when the host is missing, times out or errors (`creation-upload-security.ts:310-367,404-419`). The TOR upload path does the same (`ai-guided-tor-upload.ts:122-129`). Tests `…upload-security.test.ts:83`, `…ai-guided-intake.test.ts:124` | For XLS and XLSX, `XLSX.read` fully parses the workbook **before** the scan (`validateProjectCreationUploadContent` at `:268,296` is called at `:399`; the scan runs at `:406`) |
| P-14 | Send the provider only the minimum content; no unrelated data | DONE | Mapping sends headers plus 3 redacted samples (`creation-ai-mapping.ts:72-94`). Guided sends the brief only; the team goes as `{ref, role}` (`ai-guided-prompt.ts:67-103`) | Client name is sent (`:76`). Probably needed, but it is not minimised |
| P-15 | Redact secrets and credentials before sending | PARTIAL | `redactForProvider` covers credentials, secret assignments, emails and known names (`ai-guided-prompt.ts:30-53`). Test `…ai-guided.test.ts:399` | Revision `CURRENT_PLAN` titles and names are **not** passed through `redactForProvider` (`ai-guided-revise.ts:99-111`) |
| P-16 | Notice shown before a TOR or work plan goes to the external provider | DONE | `AiBriefStep.tsx:385-388`; enforced on the server (`requireNotice`, `ai-guided-service.ts:253-257`); mapping notice at `ColumnMappingStep.tsx:98-99` | — |
| P-17 | Follow the configured provider retention and regional-processing settings | **MISSING** | The Responses API calls (reasoning/`-pro` models) set no `store: false` (`ai-guided-openai.ts:66-75`; `creation-ai-mapping.ts:167-176`). No region or base URL setting exists | With `gpt-5.5-pro` selected, TOR content may be retained by OpenAI under the Responses default |

## 13. §15 Error handling

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| X-01 | Keep user edits when parsing, validation or AI fails | DONE | Failed jobs and AI calls leave the draft unchanged (`ai-guided-service.ts:365-397`) | — |
| X-02 | Separate retryable provider errors from source-data errors | DONE | 502 `AI_PROVIDER_FAILED`/`AI_OUTPUT_INVALID` vs 422 validation; `retryable` flag (`creation-processing.ts:300-328`) | — |
| X-03 | Continue manually if AI is unavailable | DONE | 503 `AI_PROVIDER_UNAVAILABLE` with manual guidance (`ai-guided-service.ts:264-266,306-308`) | — |
| X-04 | Never delete the original source when regenerating | DONE | Retry reuses the retained file (`upload/retry/route.ts`) | A **new** upload replaces the previous file (`upload/route.ts:104-106`), which is correct |
| X-05 | Error locations at row, cell or paragraph level | DONE | `sourceRow`/`field`/`originalValue` on issues (AC8) | — |
| X-06 | Usable summary plus full report download | DONE | `ValidationReportPanel.tsx` | — |
| X-07 | No prompts, stack traces, secrets or paths exposed | DONE | `handleError.ts:34-38` (no details in prod); processing failures sanitised (`creation-processing.ts:299-328`) | — |
| X-08 | A failed commit leaves the draft READY or FAILED with a safe retry | DONE | Transaction rollback restores the pre-claim status (`creation-commit.ts:185-200`) | — |

## 14. §16 Performance and reliability

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| F-01 | p95 targets: templates < 2 s; validating 2,000 rows < 10 s; AI < 60 s | MISSING | No benchmark, load test or telemetry assertion | Unverified |
| F-02 | AI generation is background-safe with visible progress | MISSING | Generate, clarify and revise run synchronously in the request (`generate/route.ts:30-38`). The client has a 90 s timeout with `maxRetries: 1` (`ai-guided-service.ts:156`) and up to 2 attempts (`ai-guided-openai.ts:16`), so the worst case is about 6 minutes | Proxy or browser timeouts can abort the request. A navigate-away cancels it through `request.signal` |
| F-03 | Draft autosaves after inactivity | MISSING | No autosave in `features/projects/components/creation/**` (grep); saves are explicit | — |
| F-04 | Bounded concurrency and per-user rate limits for file processing and AI | PARTIAL | AI has hourly (15), burst (4/min) and cooldown limits (`ai-guided-service.ts:87-88,285-299`) | File processing is unbounded `runAfterResponse` (`lib/background.ts`), with synchronous SheetJS parsing on the event loop. Uploads have no rate limit |
| F-05 | Token and output-size caps on AI calls | DONE | `AI_GUIDED_MAX_OUTPUT_TOKENS` (`ai-guided-schema.ts:25-29`); mapping 2,500 (`creation-ai-mapping.ts:12`); TOR ≤ 20,000 characters | — |
| F-06 | Commit is transactional and safe under concurrent code generation | DONE | `createProjectWithTemplate` inside the transaction; `P2002` mapped (`commit/route.ts:59-61`) | — |
| F-07 | Usable when AI is unavailable | DONE | K-06 / AC30 | — |

## 15. §17 Acceptance criteria

| AC | Requirement (abridged) | Status | Evidence (test file:line) | Gap |
|---|---|---|---|---|
| 1 | Authorized user sees Manual / Import / AI | DONE | `project-creation-entry.test.ts:12` | — |
| 2 | Unauthorized user denied consistently in route and API | DONE | `project-creation-entry.test.ts:26` | — |
| 3 | Blank → one PLANNING, unbaselined project with no rows | DONE | `project-creation-manual.test.ts:86` | — |
| 4 | Template → copied tree, transactional | DONE | `project-creation-manual.test.ts:102,136` | — |
| 5 | CSV, XLSX and DOCX templates downloadable with no project | DONE | `project-creation-import-templates.test.ts:30,43,62,102` | Manual DOCX browser check pending |
| 6 | Standard XLSX reaches review with no AI changes | DONE | `project-creation-deterministic-import.test.ts:27` | — |
| 7 | Non-standard mapping editable and approved before cleanup | DONE | `…deterministic-import.test.ts:66`; `…ai-mapping.test.ts:27` | — |
| 8 | Invalid row: exact row, field, issue and correction | DONE | `project-creation-validation.test.ts:22` | — |
| 9 | Dependency cycle blocks commit | DONE | `project-creation-validation.test.ts:51` | — |
| 10 | AI cleanup on a duplicate or ambiguous date shows original → proposed; nothing changes until accepted | **PARTIAL** | `project-creation-change-list.test.ts:45` (hand-built proposals) | No AI cleanup generator exists (I-12), so the "when AI proposes cleanup" trigger never happens in the product |
| 11 | DOCX items keep source references | DONE | `project-creation-docx-extract.test.ts:47` | — |
| 12 | AI-proposed deliverable date labelled as an assumption and editable | DONE | `project-creation-provenance.test.ts:150`; wired in the AI flow (`ai-guided-service.ts:700,846`) | — |
| 13 | In-document instructions cannot change behaviour | DONE | `…docx-extract.test.ts:75` (tests an unused prompt builder); live TOR path `…ai-guided.test.ts:683` | Point the AC13 evidence at the live path; add a revise-path injection test (Z-07) |
| 14 | Guided generation produces an editable draft within date boundaries | DONE | `project-creation-ai-guided.test.ts:271` | Manual walkthrough pending |
| 15 | Missing high-impact info → focused questions or listed assumptions | DONE | `…ai-guided.test.ts:444` | Manual walkthrough pending |
| 16 | Infeasible timeframe warns, offers options, never shortens silently | DONE | `…ai-guided.test.ts:357` | — |
| 17 | Unmatched named assignee → role suggestion | DONE | `…ai-guided.test.ts:380` | — |
| 18 | All review fields editable | DONE | `project-creation-review.test.ts:38` | — |
| 19 | AI revision diff is inspectable and undoable | DONE | `…ai-guided.test.ts:498,581` | — |
| 20 | Create disabled while blocking errors exist | DONE | `project-creation-commit.test.ts:116` | — |
| 21 | Acknowledged warnings → one project created atomically | DONE | `…commit.test.ts:125` | — |
| 22 | A DB failure rolls back everything | DONE | `…commit.test.ts:143` | — |
| 23 | PLANNING, unbaselined, no notification or publication | DONE | `…commit.test.ts:151` | — |
| 24 | A repeated commit returns the existing project | DONE | `…commit.test.ts:163` | — |
| 25 | Employee without the capability: entry hidden and API denied by the same check | DONE | `project-creation-permission.test.ts:10,29` | — |
| 26 | Capability grant → all three options, and the grant is audited | DONE | `project-creation-capability.test.ts:44,85`; `…entry.test.ts:41` | — |
| 27 | Capability alone gives no Settings or user-management access | DONE | `project-creation-capability.test.ts:105` | — |
| 28 | DL out-of-scope commit rejected server-side | DONE | `project-creation-commit-authorization.test.ts:50` | — |
| 29 | Revoked mid-draft → commit denied and draft preserved | DONE | `…commit-authorization.test.ts:75` | — |
| 30 | No key anywhere → AI unavailable; A and B still work | DONE | `project-creation-ai-admin-settings.test.ts:130` | — |
| 31 | Valid key + Test → success, `lastVerifiedAt` set, AI available with no redeploy | DONE | `project-creation-ai-connection-test.test.ts:85` | — |
| 32 | Invalid key on **test or generation** → distinct actionable message; no key material anywhere | **PARTIAL** | `…ai-connection-test.test.ts:128` (test path only) | The generation and mapping paths give a generic message (K-17) |
| 33 | Settings API returns only the masked form, to every role | DONE | `…ai-admin-settings.test.ts:144` | — |
| 34 | Rotation used by the next call and audited without the key | DONE | `…ai-admin-settings.test.ts:184` | — |
| 35 | DB key wins over the environment key | DONE | `project-creation-ai-credentials.test.ts:60` | — |
| 36 | Flag off → option hidden, endpoints refuse, sprint AI unaffected | DONE | `…ai-feature-flag.test.ts:81`; `…ai-guided-intake.test.ts:22,40,47`; `…ai-guided.test.ts:614` | — |

## 16. §18 Analytics and §19 Phase 4

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| Y-01 | §18 product analytics (method selected and completed, abandonment by step, acceptance rate, edit counts, time to create, counts) with no source content | MISSING | No analytics emitter in the creation code (grep) | Only `AiGenerationLog` and ActivityLog exist and could be mined. Planned for P4 |
| Q-01 | Phase 4: quality feedback loop, templates by project type, org holidays and rules, collaborative review | MISSING | Not started (strategy §5 P4) | Planned |

## 17. §20 Definition of Done

| ID | DoD bullet | Status | Evidence / gap |
|---|---|---|---|
| D-01 | All three methods available to the same authorized users | DONE | A-01, E-01 |
| D-02 | One authorization rule, with no hardcoded list at either call site | DONE | A-01 |
| D-03 | PM capability grantable, revocable and audited, with no other access | DONE | A-03, A-05 |
| D-04 | Admin can insert, mask-view, rotate, test and remove the key with no redeploy; the key is never returned | DONE | K-07 to K-10 |
| D-05 | Own flag and own feature key; disabling leaves sprint AI alone | DONE | K-13, K-15 |
| D-06 | CSV, XLS, XLSX and DOCX supported "as specified" | PARTIAL | The DOCX AI structuring deviates (I-20). Metadata and scope extraction missing (I-17) |
| D-07 | CSV, XLSX and DOCX templates downloadable with no project | DONE | I-03 |
| D-08 | All methods converge on one editable, persistent draft | DONE | R-01, `AiGuidedFlow.tsx:270` |
| D-09 | Provenance, confidence and assumptions exposed | DONE | R-10, R-11 |
| D-10 | AI changes explicit, diffable, reversible, never auto-committed | DONE | Z-01, Z-10, I-14 |
| D-11 | Deterministic validation blocks invalid schedules | DONE | R-12 |
| D-12 | Commit is re-authorized, idempotent, audited and transactional | DONE | A-09, T-08, C-02, C-03 |
| D-13 | PLANNING and unbaselined | DONE | C-05 |
| D-14 | No automatic assignments, notifications, portal, Jira or baseline | DONE | C-05 |
| D-15 | Security tests: malicious files, prompt injection, access control, unsafe archives, oversized payloads | PARTIAL | File, archive and access tests exist (`…upload-security.test.ts:83,106`). No HTTP-level oversized-body test. No injection test for the revise path |
| D-16 | Automated tests: parsers, mapping, validation, scheduling, AI schema, concurrency, auth, rollback, idempotency | DONE | 164 tests pass |
| D-17 | End-to-end tests for Manual, standard XLSX, non-standard cleanup, DOCX, guided AI and pasted TOR | MISSING | No E2E harness in the repo |
| D-18 | User documentation and templates published | PARTIAL | Templates yes. No end-user guide found under `docs/` or `app/dashboard/help` |

---

## 18. Gaps to fix (prioritised)

Severity: **H** = safety, privacy or release-blocking · **M** = spec-visible gap or a real risk · **L** = polish or planned. Effort: **S** < ½ day · **M** 1–3 days · **L** > 3 days.

| # | Gap | Refs | Sev | Effort | Fix |
|---|---|---|---|---|---|
| 1 | **Deploy prerequisites undocumented.** `AI_CREDENTIAL_ENCRYPTION_KEY` is missing from `.env.example`, so saving a key throws a 500. Without `PROJECT_CREATION_CLAMAV_HOST` and a running clamd, **every upload fails closed**. With the default `os.tmpdir()` upload root, retained sources vanish on reboot. `NEXTAUTH_SECRET` doubles as the revision-token HMAC key | K-04, P-10, P-13, T-02 | H | S | Add the KEK and `PROJECT_CREATION_UPLOAD_DIR` to `.env.example` and the deploy runbook; confirm on the VPS; health-check clamd |
| 2 | **OpenAI retention not controlled.** Responses API calls (the `-pro` model path) omit `store: false`; there is no retention or region setting | P-17 | H | S | Pass `store: false` in `ai-guided-openai.ts:66` and `creation-ai-mapping.ts:167`; document the org's ZDR stance |
| 3 | **Revision prompt leaks and trusts plan text.** `CURRENT_PLAN` titles go out unredacted and outside `UNTRUSTED_PROJECT_DATA` | Z-07, P-15 | M | S | Run titles through `redactForProvider` in `buildAiGuidedRevisionContext`; move `CURRENT_PLAN` under the untrusted envelope; add an injection test |
| 4 | **AI spreadsheet cleanup generator missing.** §8.4 proposals (duplicates, date normalisation, split, fill, dependency and missing-date suggestions) are never produced, so AC10 cannot occur in the product | I-12, AC10 | M | L | Build a flag-guarded `cleanup-proposal` step that emits `changes[]` through `allowNewAiProposals`, or record a product decision to defer it and amend AC10 |
| 5 | **Key rejected at generation time is generic** and stays "available" | K-17, AC32 | M | S | Classify 401/403 in `providerFailure` and the mapping route; clear `lastVerifiedAt` for DB keys; return "The configured OpenAI key was rejected" |
| 6 | **Retention holes.** Stale `PROCESSING` drafts are never purged; COMMITTED drafts keep TOR and brief text and excerpts forever | T-02 | M | S–M | Purge or fail stale `PROCESSING` drafts older than the stale threshold; on committed expiry, scrub `sources[].excerpt`, the brief/TOR sources and `torText` |
| 7 | **Usage and spend panel missing** in Settings > Integrations | K-14 | M | S | Aggregate `AiGenerationLog` (feature `PROJECT_CREATION_AI`) for today and 30 days: calls, tokens, `costUsd`, errors |
| 8 | **AI generation not background-safe.** Synchronous, worst case about 6 minutes; a navigate-away aborts it | F-02 | M | M–L | Reuse the Story 2.7 `PROCESSING` + `runAfterResponse` + polling pattern for generate and revise-preview |
| 9 | **No rate limits or body caps on non-AI mutations**; unbounded background parsing | T-04, F-04 | M | M | Add `hitRateLimit` to upload, retry, PATCH and commit; check `Content-Length` before `formData()`; add a small concurrency semaphore for processing jobs |
| 10 | **Review gates writable by the client.** `validationJson.assumptions` and `issues` can be deleted by a crafted PATCH, bypassing the per-item decision on AI PROPOSED assumptions and persisted import findings. `changes[]` is protected; assumptions are not | R-12, Z-04 | M | S | Extend the `validateProjectCreationCleanupTransitions` pattern to server-authored assumptions and issues: decide, never delete |
| 11 | **SheetJS parses XLS/XLSX before the malware scan** | P-13 | L–M | S | Run the ClamAV scan before `XLSX.read` (the cheap signature and ZIP checks can stay first) |
| 12 | **CSV formula injection** in the validation report | P-12 | L–M | S | Prefix `'` to cells starting with `= + - @ \t \r` in `ValidationReportPanel.tsx:13` |
| 13 | **Daily cap ignores failed calls; the cooldown is shared across operations.** No USD budget. Mapping is blocked for 30 minutes after any AI success | K-12 | L–M | S | Count ERROR rows that used tokens; add an optional daily `costUsd` cap; limit the mapping cooldown to mapping calls |
| 14 | **DOCX import deviates** (no AI structuring; metadata, scope, exclusions and assumptions not populated) | I-17, I-20, S-04, D-06 | M | M–L | Get a product decision. Either sign off the deterministic design (update §8.1 and §19) or wire `buildProjectCreationDocxExtractionPrompt` into a guarded AI step and map the metadata and assumption categories |
| 15 | **Conflict UX**: no compare or save-copy; the review workspace has no 409 handling | T-07 | L–M | M | Handle `PROJECT_CREATION_DRAFT_VERSION_CONFLICT` in `DraftReviewWorkspace`; save-copy = create a draft from the current form values |
| 16 | **Audit granularity**: guided AI request and failure not in ActivityLog; warning acknowledgements not distinct; purge audit not transactional | P-04, P-07, P-01 | L | S | Add `AI_PLAN_REQUESTED`/`AI_PLAN_FAILED` and `WARNING_ACKNOWLEDGED` metadata; put the purge audit and delete in one transaction |
| 17 | **No autosave** | F-03 | L | S–M | Debounced PATCH after inactivity, reusing the existing versioned save |
| 18 | **Restart destroys the prior version; no boundary-exception approval; `AI_TOR` never used** | R-07, R-14, S-03 | L | S–M | Snapshot `scheduleJson` before re-analysis; add an "approve out-of-boundary" acknowledgement; set `sourceMethod: 'AI_TOR'` for TOR mode |
| 19 | **Verification debt**: no E2E tests, no perf measurements, no live OpenAI smoke, no user guide; tracker walkthroughs pending for 2.5–3.7 | D-17, F-01, D-18 | L | M–L | Add Playwright happy paths for the 6 flows; one scripted p95 run; a short user guide |
| 20 | **§18 analytics and Phase 4** not started | Y-01, Q-01 | L | L | Planned P4 |
