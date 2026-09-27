# Letters, Daily Trip Plan, AI Automations and Telegram: Requirements Traceability

**Verified:** 2026-09-27 (agent T6, read-only code review; no code, schema or config changed)

**Specs:**

| Module | Spec | Scope applied |
|---|---|---|
| Letter Management | `../docs/letter_management_requirements.md` (v2.0) | All of §3–§10. §11 (Out of Scope) and §12 (Future) are OUT OF SCOPE. |
| Daily Trip Plan (DTP) | `../docs/Daily_Trip_Plan_Requirements_v1.0.md` (v1.0) | Web Phase 1 only. Flutter surfaces (§9.1, §9.2, FR-16, AC-20) and the spec's own "§13 Out of scope (Phase 2+)" and "Phase 2 with Finance" (§11) items are OUT OF SCOPE. Lines 743–1010 are a Daily Scrum epic (S11 OKR linkage) pasted into this file by mistake; they are not assessed here. |
| AI Automations | `docs/AI_Automations_Requirements_v1.0.md` (v1.0) | P0, P1 and P2a are in scope. P2b, P3 and P4 are checked for "deferred by design". |
| Telegram bot | `docs/TELEGRAM_BOT.md` | Stage 1 only. Stage 2/3 and the "deliberately does not do" list are OUT OF SCOPE. |

**Code surface:**
- **Letters:** `features/letters/**`, `app/api/letters/**`, `lib/letter*.ts(x)`, `lib/letters*.ts`, `app/dashboard/letters/**`, `prisma/schema.prisma:1817-1946`
- **DTP:** `features/daily-trip-plan/**`, `lib/dtp/**`, `app/api/dtp/**`, `app/dashboard/travel/**`, `app/dashboard/settings/travel`, `prisma/schema.prisma:1410-1757`
- **AI Automations:** `features/automations/**`, `lib/automations/**`, `app/api/automations/**`, `scripts/automations-worker.ts`
- **Telegram:** `lib/telegram/**`, `lib/ai/telegram-chat.ts`, `app/api/telegram/**`

**Status key:**

| Status | Meaning |
|---|---|
| DONE | Every acceptance criterion is met in code. Small notes may still be listed. |
| PARTIAL | At least one acceptance criterion is unmet, is API-only, or is broken at runtime. |
| DEVIATES | Built to a different design that changes a spec acceptance criterion. |
| MISSING | Not built. The Evidence column says what was searched. |
| OUT OF SCOPE | Excluded by the spec's own phase or scope label, cited in the row. |

Paths are relative to `OKR-frontend/`. These short aliases are used in the tables:

| Alias | Path |
|---|---|
| `api/` (Letters section) | `app/api/letters/` |
| `fc/` | `features/letters/components/` |
| `LFC` | `features/letters/components/LetterFormClient.tsx` |
| `schema` | `prisma/schema.prisma` |
| `T` | `lib/letters-security.test.ts` |
| `dapi/` | `app/api/dtp/` |
| `dfc/` | `features/daily-trip-plan/components/` |

---

## 1. Summary

| Module | Rows | DONE | PARTIAL | MISSING | DEVIATES | OUT OF SCOPE |
|---|---|---|---|---|---|---|
| Letter Management | 151 | 64 | 47 | 12 | 15 | 13 |
| Daily Trip Plan (web Phase 1) | 161 | 28 | 71 | 46 | 5 | 11 |
| AI Automations (P0/P1/P2a) | 148 | 84 | 40 | 6 | 6 | 12 |
| Telegram bot (Stage 1) | 23 | 15 | 2 | 0 | 0 | 6 |

**Headline findings**

1. **DTP: the adjust, acknowledge and approve path is broken at runtime.**
   - `dapi/plans/[id]/approve/route.ts:57` writes `decidedById`, but the `DailyTripPlan` field is `decisionById` (`schema:1561`). Every approval of a coordinator-edited plan returns a 500 while `adjustmentRequiresAcknowledgement` is on, which is the default.
   - The unit test fakes Prisma with the same wrong name (`lib/dtp/dtp.test.ts:381-382`), so the bug is hidden.
   - Approve also accepts `ADJUSTED` (`:42,47`), so a coordinator can skip the requester's acknowledgement.
2. **DTP: the late-submission cutoff is compared in UTC.** `dapi/plans/[id]/submit/route.ts:36-39` uses `setUTCHours`, so a 17:00 cutoff is enforced at 20:00 Addis time, and AC-14 fails.
3. **Letters: the reference allocator is not atomic, despite its comment.**
   - `lib/letters.ts:31-46` reads `lastSeq` and writes `lastSeq + 1` under READ COMMITTED, so two concurrent creates can get the same number.
   - The unique `referenceNumber` (`schema:1821`) turns this into a 409 instead of a duplicate. Spec FR-2.AC3 requires that concurrent saves never collide.
   - The format itself is correct: `360G/LT/{CL|OF|GR}/{SEQ:3}/{YEAR}` (`lib/letters.ts:9-10`).
4. **Letters: there are three different definitions of "approver".**

   | Source | Who it treats as approver |
   |---|---|
   | UI buttons (`LFC:57-59`) | ADMIN and EXECUTIVE |
   | Notifications (`lib/letters-notify.ts:87-94`) | ADMIN and EXECUTIVE |
   | DB seed that the server enforces | ADMIN and DEPARTMENT_LEAD |

   The legacy fallback matrix also gives EXECUTIVE letter-admin rights (`lib/letter-permissions.ts:67-79`). The Settings > Letter Permissions screen writes tables that the runtime never reads.
5. **AI Automations: mode gating holds, but spend caps and plan versioning do not.**
   - **Mode gating holds.** Create and PATCH can't set `mode`, and DRY_RUN and REVIEW never email.
   - **Only the per-run cost cap is checked, and only after the AI call.** A breach fails the run with no Briefing. `maxCostUsdMonth` and `orgDailyCostCapUsd` are never enforced.
   - **Owners can raise their own caps** through the API, up to $50 per run and $1000 per month.
   - **Runs execute the current plan, not the version they recorded** (`lib/automations/runner.ts:124-127`).
   - **There is no transient-error retry.**
6. **Telegram: two Stage 1 rows are PARTIAL.**
   - The default OpenAI path sends `max_tokens` (`lib/ai/telegram-chat.ts:97`). Every other OpenAI call site in the repo uses `max_completion_tokens`, and GPT-5-family models reject `max_tokens` on Chat Completions.
   - A Telegram retry or an edited `/ask` message re-runs the AI call after the duplicate row is skipped (`app/api/telegram/webhook/route.ts:115-122`).

**Test coverage at a glance**

| Module | Tests | What they cover | Not covered |
|---|---|---|---|
| Letters | `lib/letters-security.test.ts`, in CI via `npm run test:letters` | Sanitiser, fonts, PDF hardening, permission-key mapping, report aggregation. Route guards are checked by source-grep only. | Numbering, concurrency, transitions, validation, notifications |
| DTP | `lib/dtp/dtp.test.ts` only | State machine, Ethiopian calendar, routing resolution, leg generation, compare-and-set | Routes, e2e and UI |
| AI Automations | 10 automation unit suites (193 tests), `lib/odoo/client.test.ts`, plus `scripts/smoke-automations.ts` | Schedule, plan, findings, render, compiler, access, `okr.query`, `odoo.search` | Runner (caps, timeout, auto-disable), delivery, `changeMode`, and the approve, promote and mode routes |
| Telegram | `lib/security/platform-hardening.test.ts:52-101`, `lib/security/api-invariants.test.ts:48` | Secret comparison, allowlist, rate limiter | The webhook handler and `telegram-chat.ts` |

---

## 2. Letter Management (spec v2.0)

### 2.1 Summary counts

| Status | FR ACs (71) | DM (16) | SM (7) | UI (16) | NFR (7) | VR (9) | EC (7) | INT (6) | §11/§12 (12) | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|
| DONE | 34 | 7 | 3 | 7 | 1 | 7 | 2 | 3 | – | **64** |
| PARTIAL | 19 | 8 | 4 | 7 | 3 | 0 | 4 | 2 | – | **47** |
| MISSING | 7 | 0 | 0 | 2 | 1 | 1 | 1 | 0 | – | **12** |
| DEVIATES | 11 | 1 | 0 | 0 | 1 | 1 | 0 | 1 | – | **15** |
| OUT OF SCOPE | – | – | – | – | 1 | – | – | – | 12 | **13** |

### 2.2 Functional requirements (§6)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| FR-1.AC1 | New Letter opens a blank Draft form dated today | PARTIAL | `fc/CreateLetterModal.tsx:50-70`; `api/route.ts:122,164` | Opens a short modal, not the full form. There is no date field; the server defaults it. |
| FR-1.AC2 | Required fields visually marked | MISSING | `fc/CreateLetterModal.tsx:114-122`; `LFC:296-302` | No markers. Customer is labelled "(optional)" (`features/letters/i18n.ts:42`). |
| FR-1.AC3 | `DRAFT-UNSAVED` placeholder until first save | PARTIAL | `api/route.ts:139`; `LFC:222`; `fc/LettersTable.tsx:116` | The reference is allocated on modal submit. No placeholder or preview is shown. |
| FR-1.AC4 | Inline per-field validation errors | PARTIAL | `fc/CreateLetterModal.tsx:52-53,133-137` | One banner for the whole form. The detail form has no field validation. |
| FR-2.AC1 | Pattern `360G/LT/{CL\|OF\|GR}/{SEQ}/{YEAR}` | DONE | `lib/letters.ts:9-10,24-29`; `types/index.ts:211-215` | User-defined types add other 2–4 character codes. |
| FR-2.AC2 | Sequence per type per year, reset to 001 | DONE | `schema:1889-1898` (`@@unique([typeCode, year])`); `lib/letters.ts:31-46` | Year comes from the UTC letter date (see §2.9). |
| FR-2.AC3 | Concurrent saves never duplicate (server lock) | PARTIAL | `lib/letters.ts:31-46`; `schema:1821` | Read-then-write, not a lock. The losing save gets a 409. No concurrency test. |
| FR-2.AC4 | Reference read-only except for `letter:admin` | DEVIATES | `api/[id]/route.ts:18-31` | Not editable by anyone, admins included. No sequence management. |
| FR-3.AC1 | Odoo typeahead from 2 characters | DONE | `components/customers/CustomerLookup.tsx:38-59`; `lib/odoo-contacts.ts:35,46-52` | – |
| FR-3.AC2 | Selecting a contact fills Name and Address | PARTIAL | `CustomerLookup.tsx:61-66`; `LFC:306-309` | The address is returned but discarded, so `recipientAddress` is never filled. |
| FR-3.AC3 | Store only partner id and display name | DONE | `schema:1830-1831` | – |
| FR-3.AC4 | Odoo down: banner plus free text | DONE | `lib/odoo-contacts.ts:60-62`; `CustomerLookup.tsx:50-54,91-96` | Missing credentials return **mock contacts** with `odooAvailable:true` (`lib/odoo-contacts.ts:37-42`). |
| FR-3.AC5 | Customer locked after submit | DONE | `api/[id]/route.ts:67-74,95-100`; `LFC:310` | – |
| FR-4.AC1 | Only Cover, Offer and Guarantee in the dropdown | DEVIATES | `api/types/route.ts:42-77`; `fc/LetterTypeSelect.tsx` (`allowCreate` defaults to true) | Any `letter.create` user can add types and prefixes. `letter.manage_types` is never checked. |
| FR-4.AC2 | Type applies a template; confirm before overwrite | PARTIAL | `api/route.ts:125-137`; `fc/CreateLetterModal.tsx:29-38,95-112` | Applied only at create. The type can't be changed, so there is no confirm step. |
| FR-4.AC3 | Type locked after submission | DONE | `api/[id]/route.ts:18-31,92-93`; `LFC:326-328` | Locked from creation (stricter than the spec). |
| FR-4.AC4 | Changing type before submit updates the prefix | MISSING | `LFC:327` (field disabled) | Type is immutable after creation. |
| FR-5.AC1 | Rich text: bold, lists, tables, images, links | DONE | `fc/SuperDocEditorClient.tsx:201-228` | DOCX (SuperDoc) is the source of truth, with an HTML mirror. |
| FR-5.AC2 | 7 dynamic placeholders | DONE | `lib/letters.ts:85-105` | – |
| FR-5.AC3 | Placeholders highlighted in the editor, resolved at PDF time | PARTIAL | `lib/letter-html.tsx:439-453` | No highlighting in the editor. |
| FR-5.AC4 | Autosave after 30 s idle, with a toast | DEVIATES | `fc/SuperDocEditorClient.tsx:163-169,253-258`; `api/[id]/docx/route.ts:154-164` | Saves after 2 s with an inline indicator. Every save writes an `UPDATED` log entry (log flood). |
| FR-5.AC5 | Body read-only after submission | DONE | `api/[id]/docx/route.ts:90-98`; `LFC:409` | – |
| FR-6.AC1 | Multi-file drag-and-drop or picker | DONE | `fc/EnclosuresPanel.tsx:86-123` | – |
| FR-6.AC2 | PDF, DOCX, XLSX, PNG, JPG up to 25 MB | DEVIATES | `lib/letter-enclosures.ts:37-45`; `lib/attachments/file-types.ts:81` | Cap is 20 MB, a platform constant. |
| FR-6.AC3 | Show name, size, uploader, time, delete | DONE | `fc/EnclosuresPanel.tsx:147-183` | – |
| FR-6.AC4 | Delete in Draft by uploader or admin | DONE | `api/[id]/enclosures/[enclosureId]/route.ts:67-78` | Admin can also delete outside Draft. |
| FR-6.AC5 | Total enclosure size shown | DONE | `fc/EnclosuresPanel.tsx:190-192` | – |
| FR-7.AC1 | Render template, placeholders and an enclosures cover page | PARTIAL | `lib/letter-html.tsx:437-495` | Enclosures are a list block, not a cover page. |
| FR-7.AC2 | PDF shown inline in the Preview tab | DEVIATES | `fc/PdfPreviewPanel.tsx:37,152-162` | The tab shows an HTML iframe. The PDF is reachable only via Download or Print. |
| FR-7.AC3 | Regenerate replaces the preview | DONE | `fc/PdfPreviewPanel.tsx:73-75,116-119` | – |
| FR-7.AC4 | Preview in ≤5 s for up to 10 pages | MISSING | `lib/letter-pdf-puppeteer.ts:119` (15 s timeout) | No budget or measurement. |
| FR-7.AC5 | `[MISSING: x]` marker plus banner | DONE | `lib/letters.ts:122-125`; `lib/letter-html.tsx:449-453`; `fc/PdfPreviewPanel.tsx:121-125` | – |
| FR-7.AC6 | Failure gives retry plus an error log | PARTIAL | `fc/PdfPreviewPanel.tsx:128-137`; `api/[id]/pdf/route.ts:84-93` | `LETTER_PDF_FAILED` is written only on POST, which the UI never calls. |
| FR-8.AC1 | Print downloads the PDF or opens the print dialog | DONE | `LFC:240-252`; `fc/PdfPreviewPanel.tsx:82-104` | – |
| FR-8.AC2 | Auto-generate a preview if none exists | DONE | `api/[id]/pdf/route.ts:51-60` | – |
| FR-8.AC3 | Print only from Approved (configurable) | MISSING | `LFC:240`; `fc/PdfPreviewPanel.tsx:11-12` | Print works in every state. |
| FR-8.AC4 | Print action logged | MISSING | `lib/activity-log.ts:99` (`LETTER_PRINTED` never written); `api/[id]/pdf/route.ts:106-112` | Print is not logged. |
| FR-9.AC1 | Submit shown only in Draft, disabled when incomplete | PARTIAL | `LFC:175-181` | The button is never disabled. |
| FR-9.AC2 | Body, customer and type locked on submit | DONE | `api/[id]/route.ts:67-74,95-100`; `api/[id]/docx/route.ts:90-98` | – |
| FR-9.AC3 | Submitted; notify signatory and approvers | PARTIAL | `api/[id]/submit/route.ts:37-48`; `lib/letters-notify.ts:87-108` | Approvers are chosen by hard-coded role (ADMIN, EXECUTIVE). Seeded approvers (Department Leads) are not notified. |
| FR-9.AC4 | Submission logged | DONE | `api/[id]/submit/route.ts:41-47` | – |
| FR-10.AC1 | Approve/Return shown to `letter:approve` in Submitted | DEVIATES | `LFC:57-59,182-193` | The UI uses a role check that doesn't match the server's permission check. |
| FR-10.AC2 | Approve sets Approved and logs it | DONE | `api/[id]/approve/route.ts:31-44` | – |
| FR-10.AC3 | Reject reason in a modal, logged, back to Draft | PARTIAL | `api/[id]/reject/route.ts:29-46`; `fc/RejectLetterModal.tsx` | The reason is stored in metadata, which `ActivityLogPanel` never shows. |
| FR-10.AC4 | Creator notified on approve and reject | DONE | `lib/letters-notify.ts:111-135` | – |
| FR-11.AC1 | Mark Sent only when Approved, for create or dispatch | PARTIAL | `api/[id]/send/route.ts:28-34,49` | The server enforces it. The UI shows the button to everyone (`LFC:194-200`). |
| FR-11.AC2 | Modal captures method, date, tracking reference | DONE | `fc/MarkAsSentModal.tsx:18-84` | – |
| FR-11.AC3 | Status Sent; dispatch details logged | DONE | `api/[id]/send/route.ts:56-76` | – |
| FR-11.AC4 | Read-only after Sent except Archive | DONE | `api/[id]/route.ts:66-74` | Admin can still edit. |
| FR-12.AC1 | Archive when Sent; admin any state with confirmation | PARTIAL | `api/[id]/archive/route.ts:28-32` | No force-archive UI or confirmation (`LFC:201-207`). |
| FR-12.AC2 | Archived hidden by default, shown under a filter | DONE | `api/route.ts:45-49`; `fc/LettersPageClient.tsx:62` | – |
| FR-12.AC3 | Archived letters fully read-only | DONE | `api/[id]/route.ts:66-74` | Admin can still edit. |
| FR-12.AC4 | Unarchive restores the previous state, logged | DEVIATES | `api/[id]/archive/route.ts:66-75` | Always restores to SENT, although `fromStatus` is logged (`:43`). |
| FR-13.AC1 | Shared `<ActivityLogPanel>` on the form | DONE | `LFC:437` | – |
| FR-13.AC2 | Transitions, comments and notes shown chronologically | PARTIAL | `api/[id]/activity/route.ts:19-26`; `components/shared/ActivityLogPanel.tsx:176-200` | Transitions only, newest first. Metadata is not rendered. |
| FR-13.AC3 | Users can post a comment or internal note | MISSING | `api/[id]/activity/route.ts` (GET only) | Not built. |
| FR-13.AC4 | Every transition writes a structured event | DONE | `lib/activity-log.ts:206-232` | Errors are swallowed (`:228-231`), and the write is outside the status-update transaction. |
| FR-13.AC5 | Audit attributes come from the log; no redundant columns | DEVIATES | `schema:1843,1848-1852` | Audit-style columns are kept on `Letter`. No "Approved By/On" attributes on the form. |
| FR-14.AC1 | Filters: Mine, Draft, Submitted, Approved, Sent, Archived | DONE | `fc/LettersPageClient.tsx:22-24,58-68`; `api/route.ts:44-49` | – |
| FR-14.AC2 | Group by customer, type, status, signatory, month | MISSING | Searched `fc/*` for groupBy / "Group by": no matches | Not built. |
| FR-14.AC3 | Search by reference, subject, customer | DONE | `api/route.ts:52-58` | Uses `contains`, not full-text search. |
| FR-14.AC4 | Platform `<FilterBar>` / `<GroupByMenu>` | DEVIATES | `fc/LettersPageClient.tsx:126-203` | Custom control. `GroupByMenu` doesn't exist in the repo. |
| FR-15.R1 | Letter User: create, edit own drafts, submit, mark sent | PARTIAL | `api/route.ts:90`; `api/[id]/submit/route.ts:28-32`; `api/[id]/send/route.ts:28-34` | Split into separate `create`/`write`/`submit` keys. |
| FR-15.R2 | Letter Approver: view all submitted, approve, reject | PARTIAL | `api/[id]/approve/route.ts:25`; `api/[id]/reject/route.ts:25`; `lib/letter-access.ts:18-23` | "View all submitted" is not guaranteed; it depends on record-scope rules. |
| FR-15.R3 | Letter Dispatcher: mark Approved as Sent | DONE | `lib/letter-permissions.ts:130`; `api/[id]/send/route.ts:30` | – |
| FR-15.R4 | Letter Admin: full access, force archive, unarchive, sequences, templates | PARTIAL | `lib/letter-permissions.ts:135,176-178`; `api/templates/route.ts:34` | No sequence management. No force-archive UI. |
| FR-15.AC1 | Non-admins edit only letters they authored | DONE | `api/[id]/route.ts:66-74`; `api/[id]/docx/route.ts:90-95`; `api/[id]/enclosures/route.ts:46-51` | – |
| FR-15.AC2 | Managed in the platform permission UI; no letter-specific screen | DEVIATES | `components/settings/LetterPermissionsManagement.tsx`; `app/dashboard/settings/letter-permissions/page.tsx` | The separate screen writes `letter_role_permissions` / `letter_user_permissions`, which `checkLetterPermissionV2` never reads. **It has no effect.** |
| FR-16.AC1 | Reports by status, type, customer, signatory, period | DONE | `lib/letter-reports.ts:57-81,144-230`; `app/dashboard/letters/reports/page.tsx` | – |
| FR-16.AC2 | Charts use `<RechartsWrapper>` | DEVIATES | `fc/LetterReportsClient.tsx:6,18,265` | The wrapper doesn't exist; Recharts is used directly. |
| FR-16.AC3 | Tables export to XLSX and PDF | PARTIAL | `fc/LetterReportsClient.tsx:85-109` | CSV only. No `letter.export` check. |

### 2.3 Data model (§3)

| ID | Attribute | Status | Evidence | Gap |
|---|---|---|---|---|
| DM-1 | Reference Number (auto, unique, admin-editable) | PARTIAL | `schema:1821` | Not editable by anyone. |
| DM-2 | Subject, 3–255 characters | DONE | `schema:1822`; `api/route.ts:95-98`; `api/[id]/route.ts:81-85` | – |
| DM-3 | Customer {partner id, name}, required | PARTIAL | `schema:1830-1831` | An empty name is accepted on create, update and submit. |
| DM-4 | Date defaults to today | DONE | `schema:1828`; `api/route.ts:122` | – |
| DM-5 | Letter Type enum CL/OF/GR | DEVIATES | `schema:1825-1826,1904-1920` | String plus a `LetterTypeDef` FK; users can add types. |
| DM-6 | Signatory holds `letter:sign` | PARTIAL | `schema:1844`; `api/[id]/approve/route.ts:32` | `letter:sign` doesn't exist. The picker lists all users. |
| DM-7 | Status is system-managed | DONE | `schema:1827` | A plain string, not a DB enum. |
| DM-8 | Recipient Name | DONE | `schema:1831` | – |
| DM-9 | Recipient Address | PARTIAL | `schema:1832` | No UI input, and not filled from Odoo. |
| DM-10 | Salutation | PARTIAL | `schema:1833` | Column only. |
| DM-11 | Closing | PARTIAL | `schema:1834` | Column only. |
| DM-12 | Sender Department | PARTIAL | `schema:1835` | Column only. |
| DM-13 | Body content | DONE | `schema:1836,1841` | – |
| DM-14 | Enclosures | DONE | `schema:1870-1885` | – |
| DM-15 | PDF preview (computed) | DONE | `api/[id]/pdf/route.ts`; `api/[id]/html/route.ts` | – |
| DM-16–22 | Prepared, Modified, Submitted, Approved, Rejected, Sent, Archived By/On | PARTIAL | All logged (`api/route.ts:187`, `api/[id]/route.ts:111`, transition routes) | None shown as a read-only attribute on the form. |

### 2.4 State machine (§4)

| ID | Transition | Status | Evidence | Gap |
|---|---|---|---|---|
| SM-1 | Draft → Submitted | PARTIAL | `api/[id]/submit/route.ts:23-39` | Checks subject and body, not customer. Non-preparer bypass uses `role==='ADMIN'`. |
| SM-2 | Submitted → Approved | PARTIAL | `api/[id]/approve/route.ts:22-37` | An approver can't set a signatory on a Submitted letter (`LFC:110,334-338`), so only an ADMIN can approve a letter submitted without one. |
| SM-3 | Submitted → Draft (reject) | DONE | `api/[id]/reject/route.ts:25-40` | – |
| SM-4 | Approved → Sent | DONE | `api/[id]/send/route.ts:28-64` | – |
| SM-5 | Sent → Archived | DONE | `api/[id]/archive/route.ts:21-37` | `letter.archive` key unused. |
| SM-6 | Any → Archived (admin force) | PARTIAL | `api/[id]/archive/route.ts:28-29` | No UI or confirmation. |
| SM-7 | `<StatusBar>` at the top of the form | PARTIAL | `fc/LetterStatusBar.tsx`; `LFC:261` | A letter-specific bar; no platform component. |

All transitions call `update({where:{id}})` after a separate read, with no status predicate and no transaction. A double click can approve or send twice.

### 2.5 UI (§5)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| UI-1 | Stack alignment | DONE | `package.json:79,81` | – |
| UI-2 | Shared ActivityLogPanel | DONE | `LFC:437` | – |
| UI-3 | Header: back, reference, status, Submit, Preview, Print | PARTIAL | `LFC:221-264` | Preview lives in a tab, not the header. |
| UI-4 | Two-column Recipient / Sender layout | PARTIAL | `LFC:284-372` | No address, salutation, closing or department fields. |
| UI-5 | Body / Enclosures / PDF Preview tabs | DONE | `LFC:376-433` | – |
| UI-6 | Comment box and Log Note | MISSING | `components/shared/ActivityLogPanel.tsx` | Not built. |
| UI-7 | List columns | DONE | `fc/LettersTable.tsx:42-51` | – |
| UI-8 | Status filters | DONE | `fc/LettersPageClient.tsx:22-24` | – |
| UI-9 | Group-by | MISSING | – | Not built. |
| UI-10 | Search | DONE | `fc/LettersPageClient.tsx:158-167` | – |
| UI-11 | Sortable columns; default date descending | PARTIAL | `api/route.ts:73` | Default sort only. |
| UI-12 | Status badge colours | PARTIAL | `fc/LetterStatusBadge.tsx:9-15` | Archived looks the same as Draft. |
| UI-13 | Amharic and English | DONE | `features/letters/i18n.ts`; `LFC:514-535` | – |
| UI-14 | WCAG 2.1 AA contrast | PARTIAL | – | Not verified. |
| UI-15 | Keyboard navigation | PARTIAL | `fc/LettersTable.tsx:104-106` | The custom `LetterTypeSelect` has no ARIA or keyboard handling. |
| UI-16 | Responsive | PARTIAL | `LFC:284` | Not verified. |

### 2.6 Non-functional requirements (§7), validation rules (§8), edge cases (§9), integrations (§10)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| NFR-1 | Open, save, tab switch under 1.5 s | MISSING | – | Not measured. |
| NFR-2 | 50-page PDF; enclosures ≤100 MB total | PARTIAL | `lib/letter-pdf-puppeteer.ts:119` | No total cap. |
| NFR-3 | Sequence lock; stale-data warning | PARTIAL | `lib/letters.ts:31-46` | Not a real lock; no stale check. |
| NFR-4 | Every action logged | PARTIAL | `lib/activity-log.ts:228-231` | Print, preview and download not logged; log errors swallowed. |
| NFR-5 | Noto Sans Ethiopic on screen and in PDF | DONE | `lib/letter-html.tsx:129-142`; `T:165-224` | – |
| NFR-6 | Letters and logs kept ≥7 years | DEVIATES | `schema:1048` (`onDelete: Cascade`); `api/[id]/route.ts:122-149` | Hard delete (admin, any status) also deletes the audit trail. |
| NFR-7 | Platform SLA | OUT OF SCOPE | – | Operational item. |
| VR-1 | Subject 3–255 | DONE | `api/route.ts:96`; `api/[id]/route.ts:83` | – |
| VR-2 | Customer is a valid Odoo contact or non-empty text | MISSING | `api/route.ts:121`; `api/[id]/route.ts:78-80` | Never validated. |
| VR-3 | Date not in the future at Mark Sent | DONE | `api/[id]/send/route.ts:51-54` | – |
| VR-4 | Type required and immutable | DONE | `api/route.ts:119` | – |
| VR-5 | Reference unique | DONE | `schema:1821` | – |
| VR-6 | Enclosure types; 25 MB | DEVIATES | `lib/attachments/file-types.ts:81` | 20 MB. |
| VR-7 | Rejection reason non-empty | DONE | `api/[id]/reject/route.ts:30-31` | – |
| VR-8 | Dispatch method required | DONE | `api/[id]/send/route.ts:41-43` | – |
| VR-9 | No direct state writes | DONE | `api/[id]/route.ts:18-31` | See the race note in §2.4. |
| EC-1 | Odoo down: free text, null partner | DONE | `CustomerLookup.tsx:80-82,91-96` | – |
| EC-2 | PDF failure: retry plus log | PARTIAL | see FR-7.AC6 | – |
| EC-3 | Unresolved placeholder marker | DONE | `lib/letter-html.tsx:449-453` | – |
| EC-4 | Chunked upload, progress, per-file retry | PARTIAL | `fc/EnclosuresPanel.tsx:47-65,122-130` | No chunking, progress or retry. |
| EC-5 | Concurrent edit: "modified by…" | MISSING | – | Not built. |
| EC-6 | 10 s undo after archive | PARTIAL | `LFC:150-155` | No undo toast. |
| EC-7 | Duplicate reference: 409 plus refresh prompt | PARTIAL | `lib/api/handleError.ts:20` | Generic error in the UI. |
| INT-1 | Odoo `res.partner`, read-only | DONE | `lib/odoo-contacts.ts:46-52` | Uses XML-RPC. |
| INT-2 | Log management | DONE | `lib/activity-log.ts:206` | – |
| INT-3 | Role and permission service | PARTIAL | `lib/letter-permissions.ts:144-173` | The UI and notifications use hard-coded roles. |
| INT-4 | Notification service | PARTIAL | `lib/letters-notify.ts:29-94` | Approver recipients chosen by hard-coded role. |
| INT-5 | ActivityLogPanel | DONE | `LFC:437` | – |
| INT-6 | Platform StatusBadge, FilterBar, GroupByMenu, RechartsWrapper | DEVIATES | – | These don't exist (FilterBar exists but is unused); letter-specific versions were built. |

### 2.7 Out of scope (§11) and future (§12)

All 12 rows are OUT OF SCOPE.

| Item | Status in code |
|---|---|
| §11.1 Bid, tender, sale-order links | Not built |
| §11.2 CRM links | Not built |
| §11.3 Chatter | Not built |
| §11.4 Kanban | Not built |
| §11.5 `ir.sequence` | Replaced by `LetterSequence` |
| §11.6 Odoo ACL | Not built |
| §12.1 Template management | **Built anyway**: `app/dashboard/letters/templates/page.tsx`, `api/templates/*`, admin-only, no version history |
| §12.2 Delivery tracking | Only the tracking reference |
| §12.3 Digital signature | Not built |
| §12.4 Multi-level approval | Not built |
| §12.5 Email dispatch | Not built |
| §12.6 Bulk export | Not built |

Built but not in the spec: duplicate letter, user-defined types, DOCX editing, Ethiopian date picker, PDF language and font pickers, desktop delta-sync, and hard DELETE.

### 2.8 Permissions matrix (FR-15)

| Spec key | Code key | Seeded grant (`scripts/seed-permissions.ts`) | Legacy fallback (`lib/letter-permissions.ts:53-106`) | UI / notification check | Verdict |
|---|---|---|---|---|---|
| `letter:create` | `letter.create` | EMPLOYEE, ADMIN | All four roles | New Letter button shown to all | Two sources disagree |
| (edit own) | `letter.write` | EMPLOYEE | All | `LFC:52-55` | OK |
| (submit) | `letter.submit` | EMPLOYEE | All | – | Extra key |
| `letter:approve` | `letter.approve` → `button.letter.approve` | ADMIN, DEPARTMENT_LEAD | ADMIN, EXECUTIVE | UI and notifications: ADMIN, EXECUTIVE | **Three approver sets.** Executives see buttons but get 403; Department Leads can approve but see no button and get no notification. |
| `letter:dispatch` | `letter.dispatch` → `button.letter.send` | ADMIN, EXEC, DEPT_LEAD | same | Button shown to all | OK on the server |
| `letter:admin` | `button.letter.admin` | ADMIN | **ADMIN and EXECUTIVE** (`:65-79`, `view_all`) | `role==='ADMIN'` (`LFC:53,208`) | Legacy path makes EXECUTIVE an admin; untested (`T:279` covers EMPLOYEE only) |
| `letter:sign` | – | – | – | – | MISSING |
| Unused keys | `letter.archive`, `letter.manage_types`, `letter.export`; `button.letter.reject/.delete/.unarchive` | – | – | – | Dead configuration |

### 2.9 Numbering verification: `360G/LT/{CL|OF|GR}/{SEQ}/{YEAR}`

- **Generator:** `allocateLetterReference` at `lib/letters.ts:24-49`. Called on create (`api/route.ts:139`) and duplicate (`api/[id]/duplicate/route.ts:48`). The number is assigned on first save, as §3.1 and FR-2 require.
- **Format:** `` `360G/LT/${typeCode}/${String(seq).padStart(3,'0')}/${year}` `` (`lib/letters.ts:9-10`).
  - The prefix is correct.
  - SEQ is padded to 3 digits and grows past 999.
  - Type codes are COVER→CL, OFFER→OF, GUARANTEE→GR (`types/index.ts:211-215`). The spec's CL/OF/GR mean Cover, Offer and Guarantee.
  - User-defined types allow any 2–4 character code, and the duplicate route falls back to `LTR`. This breaks the fixed three-code pattern.
- **Year:** `date.getUTCFullYear()` of the letter date. A letter created between 00:00 and 03:00 Addis time on 1 January gets the previous year. Changing the date later does not re-number.
- **Reset:** one `LetterSequence` row per (typeCode, year) (`schema:1896`), so each type restarts at 001 each year. Correct.
- **Concurrency: not safe.**
  - The code runs `findUnique`, then `update(lastSeq + 1)` inside a READ COMMITTED interactive transaction, so two callers can both write N+1.
  - The first allocation of a year can race on `create` (P2002).
  - The `Letter.referenceNumber` unique constraint prevents a duplicate row, but the loser gets a 409.
  - The comment at `:16-18` overstates the guarantee.
  - Allocation also happens before the client-id conflict check and outside the `letter.create` transaction, so failed creates burn numbers.
- **Immutability:** fully immutable; nobody can edit the reference, which deviates from FR-2.AC4.
- **Tests:** none (searched `allocateLetterReference` across `*.test.ts`).

### 2.10 Workflow guard verification

| Transition | Route | State guard | Permission | Other preconditions |
|---|---|---|---|---|
| Draft → Submitted | `api/[id]/submit/route.ts` | `status!=='DRAFT'` → 400 (`:29`) | `letter.submit` plus preparer or `role==='ADMIN'` (`:28-30`) | subject and body only (`:33`); customer and signatory not required |
| Submitted → Approved | `api/[id]/approve/route.ts` | `!=='SUBMITTED'` (`:31`) | `letter.approve` (`:25`) | signatory required (`:32`); no `letter:sign`; no self-approval block |
| Submitted → Draft | `api/[id]/reject/route.ts` | `!=='SUBMITTED'` (`:35`) | `letter.approve` | reason required (`:30-31`) |
| Approved → Sent | `api/[id]/send/route.ts` | `!=='APPROVED'` (`:49`) | `letter.create` OR `letter.dispatch` (`:28-34`) | method (`:41`), dispatch date, letter date not in the future (`:52`) |
| Sent → Archived | `api/[id]/archive/route.ts` POST | `!=='SENT'` unless force (`:30`) | read scope only | – |
| Force archive | same, `force:true` | any | `button.letter.admin` | no UI, no confirmation |
| Unarchive | same, DELETE | `!=='ARCHIVED'` (`:64`) | `button.letter.admin` (`:58`) | always goes to SENT (`:68`) |
| Edit lock after Submit | PATCH, docx, enclosure routes | non-DRAFT → 403 for non-admins | – | admin can edit in any state |
| Hard delete | `api/[id]/route.ts:122-149` | preparer: own Draft; admin: any | no `letter.delete` check for the preparer | cascades ActivityLog |

Every transition route runs `letterReadGuard` before reading the letter. `T:308-316` checks this by source-grep.

---

## 3. Daily Trip Plan (spec v1.0, web Phase 1)

### 3.1 Summary counts

| Status | FR | AC | ROLE | CFG | SM | ENT | NOTIF | UI | RPT | NFR | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DONE | 8 | 3 | 1 | 1 | 7 | 3 | 5 | 0 | 0 | 0 | **28** |
| PARTIAL | 17 | 10 | 7 | 8 | 5 | 3 | 6 | 7 | 2 | 6 | **71** |
| MISSING | 20 | 4 | 1 | 0 | 2 | 1 | 5 | 0 | 10 | 3 | **46** |
| DEVIATES | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | **5** |
| OUT OF SCOPE | 4 | 2 | 0 | 0 | 1 | 0 | 1 | 2 | 1 | 0 | **11** |

No routing provider is wired: a grep for `maps.googleapis`, Distance Matrix, Places and `GOOGLE_MAPS` finds nothing. There is also no DTP cron route. That explains most of the MISSING rows: traffic, optimisation, SLA, failover, missed stops and reports.

### 3.2 Functional requirements (§7)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| FR-01.a | One plan per employee per date | DONE | `dapi/plans/route.ts:105-110`; `schema:1589`; `dfc/TravelHome.tsx:46-50` | No route test. |
| FR-01.b | Inline quick-add, drag-to-reorder | PARTIAL | `dfc/StopList.tsx:44-77`; `dapi/plans/[id]/stops/[stopId]/route.ts:31` | Modal only; `seq` changeable via API only. |
| FR-01.c | Autocomplete: recent, favourites, Google Places | MISSING | `dfc/StopEditorModal.tsx:167-180` (plain inputs) | No favourites model, no Places. |
| FR-01.d | Dwell pre-fill from trip type | DONE | `dfc/StopEditorModal.tsx:103-104`; `prisma/seed-dtp.ts:12-23` | – |
| FR-01.e | Trip mode default from settings | DEVIATES | `dfc/StopEditorModal.tsx:76`; `dapi/plans/[id]/stops/route.ts:95` | Hard-coded `ROUND_TRIP`; `defaultTripMode` never read. |
| FR-01.f | Draft autosave every 10 s | MISSING | – | Not built. |
| FR-01.g | Validation: ≥1 stop, working hours, dwell ≥5, place_id | PARTIAL | `dapi/plans/[id]/submit/route.ts:30`; `dapi/plans/[id]/stops/route.ts:61` | No working-hours check with override reason; no place_id check. |
| FR-02.a | Route to Line Manager (if enabled), then Coordinator | PARTIAL | `dapi/plans/[id]/submit/route.ts:53-71` | Both are notified, but endorsement mode is never consulted. |
| FR-02.b | After-cutoff submission flagged and queued | DEVIATES | `dapi/plans/[id]/submit/route.ts:32-49`; `dfc/CoordinatorConsole.tsx:80-89` | **Cutoff compared in UTC** (3 h late). |
| FR-02.c | Traffic estimate per stop at submit | MISSING | `trafficEstimate` never written | Needs Distance Matrix. |
| FR-03 | Manager endorse, comment or reject; advisory or required | PARTIAL | `dapi/plans/[id]/endorse/route.ts:22-86` | No UI (hook `queries.ts:130` unused); `button.dtp.endorse` not seeded; mode not enforced. |
| FR-04 | Consolidated Movement Sheet with map, suggestions, conflicts | PARTIAL | `lib/dtp/sheets.ts:52-117` | Sorted list only. |
| FR-05.a–d | Distance Matrix, heavy-traffic flag, refresh, caching | MISSING | `lib/dtp/legs.ts:17,38-41` (fixed 10 min, TODO) | No provider. |
| FR-06.a | DBSCAN grouping and drop-off suggestions | MISSING | `lib/dtp/optimizer.ts:27-30` (returns `[]`) | Stub. |
| FR-06.b | Generate DROPOFF and RETURN_PICKUP legs | DONE | `lib/dtp/legs.ts:63-114`; `lib/dtp/dtp.test.ts:311-352` | – |
| FR-06.c | Fill dwell windows; VRP | MISSING | stub | – |
| FR-06.d | Lock a stop and re-run | MISSING | – | – |
| FR-07.a | Coordinator edits any field before approval | PARTIAL | `dapi/plans/[id]/stops/[stopId]/route.ts:23-119`; `dfc/PlanEditor.tsx:127` | No joiners, per-stop mode or reorder in the UI. |
| FR-07.b | Insert and remove stops | DONE | `dapi/plans/[id]/stops/route.ts:52-55`; `dapi/plans/[id]/stops/[stopId]/route.ts:121-148` | – |
| FR-07.c | Merge into a joint trip | MISSING | – | – |
| FR-07.d | Change `requires_vehicle` | DONE | `dapi/plans/[id]/stops/[stopId]/route.ts:28` | – |
| FR-07.e | Override traffic estimate with reason | MISSING | – | – |
| FR-07.f | Three-panel screen, live diff, Approve all | PARTIAL | `dfc/CoordinatorConsole.tsx:26-111` | Single list; no bulk approve. |
| FR-07.g | Return for edit requires a note | DONE | `dapi/plans/[id]/return/route.ts:23` | – |
| FR-07.h | Adjustments logged with before/after | PARTIAL | `dapi/plans/[id]/stops/[stopId]/route.ts:104-117` | Plan PATCH logs field names only; stop delete logs no snapshot. |
| FR-08 | Acknowledge adjustment | PARTIAL | `dapi/plans/[id]/acknowledge/route.ts:15-50`; `dfc/PlanEditor.tsx:103-117` | **Unreachable** (approve crashes at `:57`), and it can be bypassed (`approve:42,47`). |
| FR-09.a | Approved legs join the vehicle pool | DONE | `dapi/plans/[id]/approve/route.ts:90`; `dapi/plans/[id]/acknowledge/route.ts:34` | – |
| FR-09.b | Pool Coordinator assigns, or auto-assign by capacity | PARTIAL | `dapi/runsheet/assign/route.ts` | Manual only; open call §14.6. |
| FR-09.c | Run Sheet with ETA, passengers, phones, dwell | PARTIAL | `lib/dtp/sheets.ts:139-204` | Phones always null (`:161,177`); placeholder ETA. |
| FR-09.d | Driver receives the sheet on mobile the evening before | OUT OF SCOPE (Flutter §9.2) | Web substitute: `TRAVEL_RUN_SHEET_READY` at assignment (`assign/route.ts:83-92`) | No scheduled send. |
| FR-10 | Driver execution on mobile | OUT OF SCOPE (Flutter §9.2) | Web substitute: `dfc/RunSheetView.tsx:99-113`; `dapi/legs/[id]/status/route.ts` | No geo-tag or "delayed" action on web. |
| FR-11.a | Auto In Progress at planned start | MISSING | Only on the first EN_ROUTE (`dapi/legs/[id]/status/route.ts:69-79`) | Needs a cron. |
| FR-11.b | Employee Mark Done / Ready | OUT OF SCOPE (Flutter §9.1E) | – | – |
| FR-11.c | Missed-stop alert | MISSING | `TRAVEL_STOP_MISSED` declared (`lib/dtp/notifier.ts:35`), never sent | – |
| FR-12.a | Movement Sheet print (A4 landscape, map, QR, signatures) | PARTIAL | `dfc/MovementSheetView.tsx:23-106` (`window.print()`) | No PDF, QR, map or `@page`. |
| FR-12.b | Run Sheet print | PARTIAL | `dfc/RunSheetView.tsx:23-130` | No PDF, map, QR or phones. |
| FR-12.c | Spec PDF filenames | MISSING | – | – |
| FR-13 | Notifications per §8 | PARTIAL | see §3.6 | – |
| FR-14.a | Withdraw before approval | DONE | `dapi/plans/[id]/withdraw/route.ts:12-39` | – |
| FR-14.b | Cancel after approval (Coordinator or Ops Manager) | PARTIAL | `dapi/plans/[id]/cancel/route.ts:18-69` | No UI (hook `queries.ts:155` unused); TC not notified; no re-optimisation. |
| FR-15.a–c | Emergency lane, fast approve, weekly digest | MISSING | `emergency` never set true | – |
| FR-16 | Mobile offline | OUT OF SCOPE (Flutter) | – | – |
| FR-17.a | Repeat tomorrow or next week | PARTIAL | `dapi/plans/[id]/clone/route.ts:16-77` | No one-click "next week". |
| FR-17.b | Per-user route templates | MISSING | – | – |
| FR-18 | Append-only audit: actor, time, IP, device, before/after | PARTIAL | `schema:1716-1734`; `lib/dtp/audit.ts` | IP and user agent never passed; notifications not logged. |
| FR-19 | Re-optimisation triggers | MISSING | `dapi/plans/[id]/cancel/route.ts:48` only deletes legs | Depends on the optimiser. |

### 3.3 Acceptance criteria (§10)

| ID | Criterion | Status | Evidence | Gap |
|---|---|---|---|---|
| AC-01 | Single plan per day | DONE | `dapi/plans/route.ts:105-110`; `schema:1589` | No test. |
| AC-02 | Dwell and mode required | PARTIAL | `dfc/StopEditorModal.tsx:113-135`; `dapi/plans/[id]/stops/route.ts:57-63` | Submit does not re-validate. |
| AC-03 | Configurable approver per department | PARTIAL | `lib/dtp/settings.ts:28-50` (test `dtp.test.ts:258`); `submit/route.ts:54-56` | API-only configuration; EMPLOYEE-role coordinators are blocked. |
| AC-04 | Alternate failover; first action wins | PARTIAL | first-wins: `lib/dtp/api-helpers.ts:94-119` (tests `:395,:404`) | `failoverHours` unused; no timer. |
| AC-05 | Save without approving → Adjusted, with diff and audit | DEVIATES | `dapi/plans/[id]/stops/[stopId]/route.ts:69-117` | Stays SUBMITTED with an `adjusted` flag. |
| AC-06 | Traffic-aware estimate at submission | MISSING | – | – |
| AC-07 | Heavy-traffic flag | MISSING | display only: `dfc/StopList.tsx:141-158` | – |
| AC-08 | Dwell-aware optimisation | MISSING | `lib/dtp/optimizer.ts:27` | – |
| AC-09 | One Way vs Round Trip legs | DONE | `lib/dtp/legs.ts:69-113`; test `dtp.test.ts:311-340` | The spec's §6.5 and AC-09 formulas conflict; the code follows §6.5. |
| AC-10 | Adjustment requires acknowledgement | PARTIAL | `dapi/plans/[id]/acknowledge/route.ts` | **Broken** (`approve:57`) and bypassable (`:42,47`). |
| AC-11 | Driver Run Sheet generated and notified | DONE | `dapi/runsheet/assign/route.ts:52-92`; `lib/dtp/sheets.ts:150-157` | No test. |
| AC-12 | Driver confirms pickup on mobile | OUT OF SCOPE (Flutter) | Web substitute: `dfc/RunSheetView.tsx:103` | No lat/lng; passenger not notified. |
| AC-13 | Live re-optimisation on delay | MISSING | – | – |
| AC-14 | Late submission | DEVIATES | `submit/route.ts:32-49`; `dapi/plans/route.ts:37` | UTC cutoff. |
| AC-15 | Movement Sheet PDF | PARTIAL | `dfc/MovementSheetView.tsx` | Browser print only. |
| AC-16 | Run Sheet PDF | PARTIAL | `dfc/RunSheetView.tsx` | No phones, map or PDF. |
| AC-17 | Withdraw; console updates in <5 s | PARTIAL | `withdraw/route.ts` | No realtime refetch on the console. |
| AC-18 | Cancel after approval | PARTIAL | `cancel/route.ts:29-67` | No UI; no re-optimisation. |
| AC-19 | Notification delivery logging | PARTIAL | `lib/notifications/direct.ts:131`; `lib/dtp/notifier.ts:92-99`; `schema:1277` | No `dtp_notification_log`. |
| AC-20 | Offline mark done | OUT OF SCOPE (Flutter FR-16) | – | – |
| AC-21 | Audit trail completeness | PARTIAL | `dapi/plans/[id]/route.ts:32-38`; `dfc/PlanEditor.tsx:183-196` | UI shows no actor, diff or channel. |

### 3.4 Roles (§3), settings (§4), state machine (§5), entities (§6)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| ROLE-1 | Employee | PARTIAL | `lib/dtp/state-machine.ts:37-39` | Acknowledge is broken. |
| ROLE-2 | Line Manager | PARTIAL | `submit/route.ts:58-62`; `endorse/route.ts` | No UI; feature key unseeded. |
| ROLE-3 | Travel Coordinator | PARTIAL | `lib/dtp/permissions.ts:80-89` | EMPLOYEE-role coordinators are scoped to their own plans (`scripts/seed-permissions.ts:1157-1162`, `dapi/plans/route.ts:58-62`) and need one-off grants to approve (`scripts/migrate-dtp-coordinators.ts:160-187`). |
| ROLE-4 | Alternate coordinator | PARTIAL | `lib/dtp/permissions.ts:80-89` | No timer. |
| ROLE-5 | Ops Manager | PARTIAL | `lib/dtp/permissions.ts:49-54`; `cancel/route.ts:22` | No reports; no override justification. |
| ROLE-6 | Driver | PARTIAL | `dapi/runsheet/[driverId]/[date]/route.ts:21-27` | No ETA update; no leg-status transition guard. |
| ROLE-7 | Pool Coordinator | DONE | `dapi/runsheet/assign/route.ts:34-35` | – |
| ROLE-8 | HR / Finance read-only | MISSING | `lib/dtp/permissions.ts` | No role. |
| ROLE-9 | Admin configuration | PARTIAL | `dapi/settings/route.ts` | Routing, trip types, drivers and vehicles are API-only. |
| CFG-4.1 | Approval routing | PARTIAL | `schema:1486-1498`; `dapi/settings/route.ts:42-70` | No UI; failover and endorsement mode unused. |
| CFG-4.2 | SLAs | PARTIAL | `schema:1505-1506` | SLA unused; UTC bug. |
| CFG-4.3 | Hours, geofence, defaults | PARTIAL | `schema:1508-1514` | Hours and default mode unenforced. |
| CFG-4.4 | Trip types | PARTIAL | `schema:1467-1482`; `prisma/seed-dtp.ts` | No admin UI. |
| CFG-4.5 | Flexibility levels | DONE | `types/dtp.ts:35`; `dfc/StopEditorModal.tsx:36-42` | – |
| CFG-4.6 | Traffic preferences | PARTIAL | `schema:1516-1518` | Stored; no effect. |
| CFG-4.7 | Optimisation toggles | PARTIAL | `schema:1520-1523` | No effect. |
| CFG-4.8 | Drivers and vehicles | PARTIAL | `schema:1420-1463`; `dapi/drivers`, `dapi/vehicles` | Create and list only. |
| CFG-4.9 | Notification channels | PARTIAL | `schema:1532-1535` | `notify*` never read by `notifier.ts`. |
| SM-1 | Draft → Submitted | DONE | `submit/route.ts:41-50` | – |
| SM-2 | → Manager Endorsed | PARTIAL | `endorse/route.ts:63-73` | Not gated by mode. |
| SM-3 | → Under Review | MISSING | `lib/dtp/state-machine.ts:13-14` | No route sets it. |
| SM-4 | → Adjusted | PARTIAL | `approve/route.ts:49-70` | Crashes. |
| SM-5 | Adjusted → Approved on acknowledge | PARTIAL | `acknowledge/route.ts:22-31` | Unreachable. |
| SM-6 | → Approved | DONE | `approve/route.ts:73-86` | – |
| SM-7 | → Returned / Rejected | DONE | `return/route.ts`; `reject/route.ts` | Reject lands in RETURNED. |
| SM-8 | Returned → Draft | DEVIATES | `submit/route.ts:29` | Resubmitted directly from RETURNED (harmless). |
| SM-9 | → Driver Assigned | DONE | `dapi/runsheet/assign/route.ts:62-64` | Not compare-and-set. |
| SM-10 | → In Progress | PARTIAL | `dapi/legs/[id]/status/route.ts:69-79` | No time trigger. |
| SM-11 | → Completed | DONE | `dapi/legs/[id]/status/route.ts:80-93` | Plans with no vehicle stops never complete. |
| SM-12 | → Reconciled | OUT OF SCOPE (§13 Phase 2 per-diem) | hook `lib/dtp/state-machine.ts:21` | – |
| SM-13 | → Withdrawn | DONE | `withdraw/route.ts` | Route lists UNDER_REVIEW, which the state machine forbids. |
| SM-14 | → Cancelled | PARTIAL | `cancel/route.ts` | No UI. |
| SM-15 | → Expired (SLA) | MISSING | – | No cron. |
| SM-16 | Clone to another day | DONE | `clone/route.ts` | Any readable plan can be cloned into the caller's name. |
| ENT-6.1 | `daily_trip_plan` | PARTIAL | `schema:1544-1594` | No `attachments[]`; totals never computed. |
| ENT-6.2 | `trip_stop` | PARTIAL | `schema:1598-1647` | place_id optional; `trafficEstimate` unused. |
| ENT-6.3 | `daily_movement_sheet` | DONE | derived: `lib/dtp/sheets.ts:52` | – |
| ENT-6.4 | `daily_run_sheet` | DONE | `schema:1693-1712` | – |
| ENT-6.5 | `trip_leg` | DONE | `schema:1652-1688` | – |
| ENT-6.6 | `route_group` | PARTIAL | `schema:1739-1757` | Never populated. |
| ENT-6.7 | `dtp_notification_log` | MISSING | – | Generic `Notification` and `OutboundEmail` rows are used instead. |

### 3.5 UI (§9.3), reports (§11), NFR (§12)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| UI-A | Coordinator console | PARTIAL | `app/dashboard/travel/console`; `dfc/CoordinatorConsole.tsx` | No department or status filter, map, adjustments queue or bulk actions. |
| UI-B | Plan detail | PARTIAL | `dfc/PlanEditor.tsx`; `dfc/CoordinatorActions.tsx` | No Endorse, Cancel or Re-run buttons; audit has no actor or diff. |
| UI-C | Movement Sheet page | PARTIAL | `app/dashboard/travel/sheet/[deptId]/[date]/page.tsx` | No map or PDF; not linked from navigation. |
| UI-D | Run Sheet page | PARTIAL | `dfc/RunSheetView.tsx` | No Notes, phones or map. |
| UI-E | Pool console | PARTIAL | `dfc/PoolConsole.tsx` | Select-based; no capacity warnings; shows plan id instead of requester. |
| UI-F | Travel settings | PARTIAL | `dfc/TravelSettingsForm.tsx` | No Routing, Trip Types, Drivers or Vehicles sections. |
| UI-G | §9.4 visual language | PARTIAL | `dfc/StatusBadge.tsx:9-24` | Colours differ; trip-type icons not rendered. |
| UI-M1 / UI-M2 | Flutter employee and driver apps | OUT OF SCOPE (§9.1/§9.2) | Web substitutes: `TravelHome`, `PlanEditor`, `RunSheetView` | – |
| RPT-1 / RPT-2 | Movement Sheet and Run Sheet | PARTIAL | see FR-12 | – |
| RPT-3 to RPT-11 | Analytics reports | MISSING | No report endpoint under `app/api/dtp` | – |
| RPT-12 | Cost and allowance | OUT OF SCOPE (§11 "Phase 2 with Finance") | – | – |
| RPT-13 | Export and scheduled email | MISSING | – | – |
| NFR-1 / NFR-2 | Performance and scalability | PARTIAL | `dapi/plans/route.ts:31`; `schema:1590-1592` | Not measured. |
| NFR-3 | Availability 99.5% | MISSING | – | Infrastructure item. |
| NFR-4 | Row-level security per department | PARTIAL | `dapi/plans/route.ts:54-58` | Coordinators see all departments. |
| NFR-5 | Immutable audit; 90-day location anonymisation | PARTIAL | `schema:1728` (cascade) | No anonymisation. |
| NFR-6 | Amharic and Ethiopian calendar everywhere | PARTIAL | see §3.7 | No Amharic; EC missing from emails and audit. |
| NFR-7 | WCAG 2.1 AA | PARTIAL | – | Not audited. |
| NFR-8 | Maps API cap | MISSING | – | Needed once Maps ships. |
| NFR-9 | Observability | MISSING | – | – |

§13 Phase 2+ items (KR linkage, per-diem, GPS, ride-hail, AI trips, carbon, multi-day) are OUT OF SCOPE. The KR-linkage hooks exist (`schema:1574-1576`) and are hidden in the UI, which is consistent with the spec.

### 3.6 Approval chain and notification matrix verification

| Action | Route (`dapi/plans/[id]/…`) | Role check | State guard | Finding |
|---|---|---|---|---|
| Submit | `submit` | requester (`:28`) | DRAFT or RETURNED (`:29`) | **UTC cutoff** (`:36-39`) |
| Endorse / reject (manager) | `endorse` | `ManagerRelationship` plus `button.dtp.endorse` or ADMIN/DEPT_LEAD | SUBMITTED | Key not seeded; mode ignored; no UI |
| Coordinator edit | `route`, `stops`, `stops/[stopId]` | `canActAsCoordinator` | SUBMITTED, MANAGER_ENDORSED, UNDER_REVIEW | Status unchanged on save |
| Approve / adjust | `approve` | coordinator plus `button.dtp.approve` | includes **ADJUSTED** (`:42`) | **`decidedById` crash (`:57`)**; acknowledgement can be bypassed |
| Acknowledge | `acknowledge` | requester | ADJUSTED | Unreachable |
| Return | `return` | coordinator | … or ADJUSTED | Note required |
| Reject | `reject` | coordinator plus `button.dtp.reject` | … | Lands in RETURNED |
| Withdraw | `withdraw` | requester | pre-approval | – |
| Cancel | `cancel` | coordinator or Ops Manager | APPROVED, DRIVER_ASSIGNED, IN_PROGRESS | Reason required; no UI |
| Assign driver | `dapi/runsheet/assign` | Pool Coordinator | APPROVED, DRIVER_ASSIGNED | Not compare-and-set |
| Leg status | `dapi/legs/[id]/status` | driver or coordinator | **none** | COMPLETED → EN_ROUTE is allowed |

**Approval chain:**
- There are no SLA timers or failover: `approvalSlaTime` and `failoverHours` are unused, and EXPIRED is never set.
- "First action wins" is correct, via compare-and-set in `lib/dtp/api-helpers.ts:94-119`.

**Notification matrix (§8):**
- Channels: in-app `Notification` with Pusher, plus email via `sendMail` into `OutboundEmail` (`lib/dtp/notifier.ts:51-105`). **No SMS or Telegram.**
- The org toggles `DtpSettings.notifyInApp` / `notifyEmail` are never read.
- Row outcomes: 5 DONE (submitted, approved, returned, run-sheet ready, trip completed), 6 PARTIAL, 5 MISSING, 1 OUT OF SCOPE.
  - **PARTIAL:** endorse-reject does not notify the TC; the adjusted message has no diff and is never reached; reject does not notify the LM; driver assigned has no SMS; cancelled does not notify the TC; templates are English-only.
  - **MISSING:** joint trip, cash advance, SLA breach, traffic flag, stop missed. Five event keys are declared but never emitted (`lib/dtp/notifier.ts:33-37`).
  - **OUT OF SCOPE:** ready-early (mobile trigger).
- `dtp_notification_log` (AC-19) is MISSING.

### 3.7 Ethiopian calendar verification (`lib/dtp/ec-calendar.ts`)

- **Algorithm:** Gregorian → JDN → Ethiopian, epoch JDN 1724221 (`:15-54`). An EC year is a leap year when `year % 4 === 3`. Pagume is month 13, with 5 or 6 days.
- **Correctness:** the same algorithm was re-run against the Dershowitz & Reingold reference for every day from 1900-01-01 to 2099-12-31 (73,049 dates), with **0 mismatches**.
  - Anchors: 2023-09-11 = 6 Pagume 2015; 2023-09-12 = 1 Meskerem 2016; 2024-09-10 = 5 Pagume 2016.
- **Tests:** `lib/dtp/dtp.test.ts:171-242`, including a day-by-day check for 2020–2030 (`:209-219`). The "BUG" comment at `:203-208` is stale.
- **Direction:** Gregorian → EC only. There is no EC → Gregorian function and no EC date picker; input is `<input type="date">`. Month names are transliterated only, with no Ge'ez. `formatDual` is unused.
- **Storage stays Gregorian:** `tripDate` is a UTC-midnight DateTime, and times are "HH:MM" strings.
- **Where EC is shown:** `TravelHome.tsx:56,77`, `CoordinatorConsole.tsx:141`, `PlanEditor.tsx:60`, and the print headers (`MovementSheetView.tsx:36`, `RunSheetView.tsx:46`).
- **Where it is not shown:** emails, audit timestamps, and the "Today/Tomorrow" label.
- **Timezone issue:** "today" is computed in UTC in `TravelHome.tsx:23-27`, which is wrong between 00:00 and 03:00 Addis time.

---

## 4. AI Automations (spec v1.0)

### 4.1 Scope and phase labels

The spec has a single phase, "P2 — Language + web" (§17, l.666). Later project docs split it:

| Phase | Contents | Source |
|---|---|---|
| P2a | NL compiler | `docs/FEATURE_STATUS.md:40` |
| P2b | `web.search`, `web.fetch`, source registry | `docs/FEATURE_STATUS.md:40` |
| P3, P4 | – | `docs/FEATURE_STATUS.md:40` |

P2b, P3 and P4 are **deferred by design**. `docs/FEATURE_STATUS.md:244` says they are "BLOCKED on keys (Tavily etc.) and the SSRF review"; `docs/MASTER_REFERENCE.md:343-344,1958`, `docs/REMEDIATION_PLAN_2026-09-25.md:69` and `docs/CHANGELOG_AI.md:860` agree. These rows are therefore OUT OF SCOPE, not MISSING. The web tools are also held out of `AVAILABLE_TOOL_IDS` (`types/automations.ts:98`).

**Doc drift:** `docs/CHANGELOG_AI.md:767-778` describes four paths that exist in no working tree or branch (`git log --all` finds nothing):
- `lib/automations/credential-store.ts`
- `lib/automations/credential-verify.ts`
- `app/api/automations/credentials/**`
- `lib/automations/tools/web-search.ts`

Code surface reviewed: `types/automations.ts`, `schema:3524-3699`, `lib/automations/**`, `app/api/automations/**`, `app/api/cron/automations-{tick,reap,prune}`, `scripts/automations-worker.ts`, `scripts/seed-automation-permissions.ts`, `scripts/smoke-automations.ts`, `features/automations/**`, `app/dashboard/automations/**`.

### 4.2 Summary counts (148 rows)

| DONE | PARTIAL | MISSING | DEVIATES | OUT OF SCOPE (deferred by design) |
|---|---|---|---|---|
| 84 | 40 | 6 | 6 | 12 |

The core loop is proven in production (`docs/CHANGELOG_AI.md:267-289`): schedule, tick, `SKIP LOCKED` claim, `okr.query`, synthesis, diff, the three renderers, and the DRY_RUN hold.

The gaps cluster in four areas:
- **Spend governance:** the monthly and org-daily caps are never enforced.
- **Worker resilience:** there is no transient retry, the timeout doesn't abort in-flight calls, and a lost lease doesn't stop the worker.
- **Plan versioning:** runs execute the *current* plan, not the version they recorded.
- **Authoring form:** saving drops compiled fields.

In this section, `aapi/` = `app/api/automations/` and `la/` = `lib/automations/`.

### 4.3 Functional requirements (§11)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| FR-01 | NL instruction → compiled PlanSpec; plain-language failures | DONE | `aapi/compile/route.ts:41-83`; `la/compiler.ts:345-420`; `AutomationForm.tsx:206-264` | – |
| FR-02 | Edit any plan field; "View plan JSON" | PARTIAL | `features/automations/components/AutomationForm.tsx:143-148,313-340` | Only 4 presets. Save overwrites timezone, `catchUpPolicy`, `onEmpty`, limits and `dedupeKeyFields:['title']`. No JSON view. |
| FR-03 | Recompile → grouped diff, `planVersion`++, runs record their version | PARTIAL | `la/plan-diff.ts`; `la/crud.ts:84-95`; `la/service.ts:126` | The runner executes `automation.planJson` (`la/runner.ts:124-127`) and ignores `run.planVersion`. The UI claim at `AutomationForm.tsx:394` is false. |
| FR-04 | Exactly-once tick; catch-up, overlap, jitter, bounds, `maxRuns`, `globalPaused` | DONE | `la/service.ts:57-169`; `la/schedule.ts:486-541`; `schema:3607` | – |
| FR-05 | Manual run: no schedule shift, marked MANUAL, AUTO warning | PARTIAL | `aapi/[id]/run/route.ts:15-45`; `la/service.ts:262-280` | Manual runs consume `maxRuns` (`la/runner.ts:318`). The in-flight check is not atomic. |
| FR-06 | Worker refuses ungranted tool, model, domain or write as a step warning | PARTIAL | `la/tools/index.ts:20-28`; `la/tools/odoo-search.ts:156-166`; `lib/odoo/client.ts:49` | An ungranted step fails the whole run at `validatePlan` (`la/runner.ts:126`); it is not refused per step. |
| FR-07 | Structured synthesis; `maxFindings` note; logged | PARTIAL | `la/synthesis.ts:302-437` | Silent truncation (`:275-277`). OpenAI only. |
| FR-08 | Diff against the last SUCCEEDED run | DONE | `la/runner.ts:207-214`; `la/findings.ts:93-147` | – |
| FR-09 | One Briefing per run; list filter and search | PARTIAL | `la/runner.ts:235-265`; `aapi/briefings/route.ts:11-63` | Filters by `automationId` only. |
| FR-10 | REVIEW approve or discard; per-recipient status | PARTIAL | `aapi/briefings/[id]/approve/route.ts:16-68`; `la/delivery.ts:67-204` | No discard. Approve race (non-atomic `PENDING_REVIEW` check) can double-send. |
| FR-11 | `onEmpty` SKIP suppresses send; "nothing new" marker | PARTIAL | `la/findings.ts:144`; `la/runner.ts:229,269,285` | No explicit marker in the UI. |
| FR-12 | Promote a finding to Todo, Risk or RaidItem with back-link | PARTIAL | `aapi/briefings/[id]/promote/route.ts:20-132` | No RaidItem; back-link is text only; no doctype or assignee-visibility check; `promotedJson` race. |
| FR-13 | Export to PDF and DOCX; print stylesheet | PARTIAL | `aapi/briefings/[id]/export/route.ts:23-61` | No `@media print`. |
| FR-14 | Run timeline and transcript, owner or admin only | DONE | `aapi/[id]/runs/route.ts`; `aapi/runs/[runId]/route.ts:13-45` | – |
| FR-15 | Pause, resume, soft delete, admin pause, global pause | DONE | `aapi/[id]/route.ts:36,105-122`; `la/crud.ts:135-140` | – |
| FR-16 | Failures notify the owner (email on the 3rd); list health | PARTIAL | `la/runner.ts:335-369`; `la/delivery.ts:228-270` | Reaper-failed runs (`la/service.ts:240-251`) are silent and don't count toward auto-disable. The list shows no last-run status. |
| FR-17 | Month-to-date spend vs cap; org dashboard; SKIPPED on cap | PARTIAL | `la/crud.ts:147-154`; `AutomationDetail.tsx:262-265` | Display only. See §4.6. |
| FR-18 | Admin settings including credentials and grants | PARTIAL | `AutomationSettingsForm.tsx`; `aapi/settings/route.ts` | No credential UI or API. `defaultTimezone`, `orgDailyCostCapUsd` and `domainAllowlist` are stored but inert. |

### 4.4 Phase acceptance (§17)

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| PH-P0.1 | P0 scope (schema, tick, worker, leases, transcript, `okr.query`, synthesis, render, email) | DONE | see §4.5 | – |
| PH-P0.2 | Daily Briefing from OKR data, emailed on demand | PARTIAL | Production DRY_RUN run: `docs/CHANGELOG_AI.md:273-285` | The AUTO email path has never been exercised, in tests or in production. |
| PH-P0.3 | A killed worker leaves the run reclaimable | DONE | `la/service.ts:214-256`; `scripts/smoke-automations.ts:310-315` | – |
| PH-P1.1 | `odoo.search`, REVIEW/AUTO, recipients, diffing, `onEmpty`, in-app, run UI | DONE | `la/tools/odoo-search.ts`; `la/delivery.ts` | – |
| PH-P1.2 | Worked example A for a week | PARTIAL | `docs/FEATURE_STATUS.md:40` ("a real Odoo call still unexercised") | The form forces `dedupeKeyFields:['title']`, so it can't key on `odoo_lead_id`. |
| PH-P2a.1 | NL compiler, plan review, version diff | DONE | `la/compiler.ts`; `la/plan-diff.ts`; `docs/CHANGELOG_AI.md:858-871` | – |
| PH-P2a.2 | Export | DONE | `aapi/briefings/[id]/export/route.ts` | – |
| PH-P2b | `web.search`, `web.fetch`, source registry, allowlist, example B | OUT OF SCOPE (deferred: `FEATURE_STATUS.md:40,244`) | `types/automations.ts:98` | – |
| PH-P3 | Credential vault, `site.login`, `mail.search`, grant approvals | OUT OF SCOPE (deferred) | Only the `AutomationCredential` model exists | – |
| PH-P4 | Chaining, event triggers, templates | OUT OF SCOPE (deferred) | – | – |
| PH-DOC | MASTER_REFERENCE and CHANGELOG updated | PARTIAL | `docs/MASTER_REFERENCE.md:317-346` | Drift: `CHANGELOG_AI.md:767-778` (absent files), `:854` (false plan-version claim). |

### 4.5 Roles, lifecycle, schedule, plan, tools, briefing, worker, notifications, security, pages

| ID | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| ROLE-1 | Doctypes seeded | DONE | `scripts/seed-automation-permissions.ts:21-26,145-151` | – |
| ROLE-2 | `canAuthorAutomations` gates authoring | DONE | `la/access.ts:129-136` | – |
| ROLE-3 | Authors self-select Tier-0 and Tier-1 tools | DEVIATES | `la/access.ts:67` (only `okr.query` is self-service) | `odoo.search` needs ADMIN. Stricter than the spec; record it as a decision. |
| ROLE-4 | Admin: org-wide view, org caps, global pause | PARTIAL | `la/access.ts:163-171` | UI never requests `scope=all`; org caps not enforced. |
| ROLE-5 | Recipients see the published Briefing only | DONE | `la/access.ts:224-239`; `access.test.ts:159` | – |
| ROLE-6 | Run as the owner via `lib/rbac`, `lib/permissions`, RecordScopeRule | PARTIAL | `la/runner.ts:62-78`; `la/tools/okr-query.ts:45-54,106-279` | Hand-rolled predicates. Custom scope rules and doctype reads are ignored. |
| ROLE-7 | Adding a recipient never widens data | DONE | `la/tools/okr-query.ts:281-321` | – |
| ROLE-8 | Owner deactivated → automations paused | MISSING | only `la/runner.ts:71` throws | Runs fail 3 times, then are disabled. |
| LC-1 | Compile → editable plan → confirm | PARTIAL | see FR-02 | – |
| LC-2 | New automation starts in DRY_RUN | DONE | `la/crud.ts:50`; strict create schema `aapi/route.ts:24-36` | – |
| LC-3 | Full pipeline | DONE | `la/service.ts`; `la/runner.ts:102-334` | – |
| LC-4 | DRY_RUN: draft, owner only, no email | DONE | `la/runner.ts:230-233,269-294`; `scripts/smoke-automations.ts:246-253` | – |
| LC-5 | REVIEW: PENDING_REVIEW, email on approval | DONE | `la/runner.ts:285-294`; `aapi/briefings/[id]/approve/route.ts` | – |
| LC-6 | AUTO: immediate send subject to `onEmpty` | DONE | `la/runner.ts:269-284` | No test. |
| LC-7 | AUTO requires a prior successful run | PARTIAL | `la/crud.ts:122-132` | Any SUCCEEDED run counts. Edits never re-gate. |
| LC-8 | AUTO confirm dialog names recipients | PARTIAL | `AutomationDetail.tsx:287-297` | Shows a count only. |
| SCH-1, 2, 6–13 | Presets, fiscal quarters, catch-up, overlap, jitter, bounds, `maxRuns`, `nextRunAt`, unique slot, DST | DONE | `la/schedule.ts`; `la/schedule.test.ts:52-289`; `schema:3570,3607` | The form exposes only 4 presets and hard-codes CALENDAR. |
| SCH-3 | IANA timezone per automation; default from settings | PARTIAL | `la/plan.ts:203-207` | The form hard-codes the timezone; `defaultTimezone` is unused. |
| SCH-4 | ETHIOPIAN calendar | MISSING | accepted at `la/plan.ts:209`; nothing in `la/schedule.ts` | Open question §19.3. |
| SCH-5 | `skipHolidays` | PARTIAL | `la/schedule.ts:297` | The tick passes no holidays (`la/service.ts:86-95`), so it does nothing in production. |
| PLAN-1, 2, 4, 5 | Compile once; shape; compile-time validation; one re-prompt | DONE | `la/runner.ts:148-192`; `types/automations.ts:263-350`; `la/plan.ts:160-265`; `la/compiler.ts:363-420` | – |
| PLAN-3 | Template variables | PARTIAL | `la/plan.ts:252-254,352-390` | `{{org.name}}` is always empty; month and year computed in UTC. |
| PLAN-6 | A run executes the plan version it recorded | DEVIATES | `la/runner.ts:124-127` | Snapshot the plan per run. |
| TOOL-1, 2, 3, 5, 6, 10 | `okr.query`, `notify.email`, `notify.inapp`, `ai.synthesize`, `odoo.search`, granted-only | DONE | `la/tools/*`; `la/delivery.ts:104-173`; `lib/odoo/client.ts:49` | – |
| TOOL-4 | `notify.telegram` | OUT OF SCOPE (deferred, `FEATURE_STATUS.md:40`) | SUPPRESSED at `la/delivery.ts:175-177` | – |
| TOOL-7, 8, 9, 11 | `web.search`, `web.fetch`, `site.login`/`mail.search`, egress rule §7.1 | OUT OF SCOPE (P2b/P3) | – | Egress enforcement must ship with P2b. The runner ignores `from` today. |
| BRF-1, 4–9 | Typed blocks, email HTML, plain text, PDF/DOCX, dedupe hash, NEW/CHANGED rendering, `onEmpty` | DONE | `types/automations.ts:140-233`; `la/render.ts`; `la/findings.ts` | – |
| BRF-2 | Admin-gated `html` block | MISSING | not in `BLOCK_TYPES` | Optional. |
| BRF-3 | Interactive React in-app renderer | DEVIATES | `la/render.ts:100`; `BriefingView.tsx:120` | Server HTML; findings are not interactive. |
| BRF-10 | Promote | PARTIAL | see FR-12 | – |
| BRF-11 | Deadline callout (example B) | OUT OF SCOPE (P2b) | – | – |
| DM-1–8 | Models, cost log, canonical unions | DONE | `schema:3524-3699`; `la/synthesis.ts:363-435`; `types/automations.ts:19-81` | `AutomationCredential` is unused. Compile cost is logged under AUTOMATION_RUN with no runId. |
| WRK-1, 6, 8, 11, 12 | Tick/worker/reap split, step cap, auto-disable, pm2, retention | DONE | `scripts/automations-worker.ts`; `la/plan.ts:86,108`; `la/runner.ts:337-369`; `package.json:43` | – |
| WRK-2 | Concurrency = `maxConcurrentRuns` | PARTIAL | `scripts/automations-worker.ts:102-108` | Jobs are awaited serially, one per process. |
| WRK-3 | Lease and heartbeat, `SKIP LOCKED` | PARTIAL | `la/service.ts:178-202`; worker `:39-53` | A lost lease doesn't stop execution (`:43-46`). |
| WRK-4 | 3 retries with backoff (1m/5m/25m) on transient errors | MISSING | only the crash reaper requeues (`la/service.ts:227-239`) | A provider 5xx fails the run and counts toward auto-disable. |
| WRK-5 | Hard timeout kills in-flight calls | PARTIAL | `la/runner.ts:129-134,149,195` | Checked between steps only; no AbortSignal. |
| WRK-7 | Cost cap aborts mid-run with a truncation callout | DEVIATES | `la/runner.ts:203-204` | Checked after the call; the run FAILS with no Briefing. |
| WRK-9 | Transcript arguments redacted | PARTIAL | `la/runner.ts:164-190` | Raw params stored. The comment at `la/service.ts:307` claims redaction. |
| WRK-10 | Pusher realtime | DEVIATES | polling: `AutomationDetail.tsx:39` | Record the decision. |
| NOTIF-1–3 | Published, review pending, run failed | DONE | `la/delivery.ts:149,214,237` | – |
| NOTIF-4 | Disabled on failure → owner and admin | PARTIAL | `la/delivery.ts:233-270` | Owner only. |
| NOTIF-5 | `COST_CAP_REACHED` | MISSING | grep finds nothing | – |
| NOTIF-6 | Event keys registered in `events.ts`; preferences respected | PARTIAL | `lib/notifications/events.ts:35` | Keys not in the `EventKey` union; emails bypass preferences. |
| NOTIF-7 | Deep links | PARTIAL | `la/delivery.ts:247,265` | `/dashboard/automations/[id]/runs` returns **404**. |
| SEC-1 | Run-as identity | PARTIAL | see ROLE-6 | – |
| SEC-2, 6, 10, 12 | Explicit grants, prompt-injection posture, kill switch, tokens | DONE | `la/synthesis.ts:146,190`; `la/service.ts:63` | – |
| SEC-3, 4, 7 | Domain allowlist, egress, SSRF | OUT OF SCOPE (P2b; SSRF review is the blocker) | `domainAllowlist` stored only | – |
| SEC-5 | AES-GCM credential store | PARTIAL | model at `schema:3670` | No store, API or UI (doc drift). |
| SEC-8 | Spend caps | PARTIAL | see §4.6 | – |
| SEC-9 | Per-provider concurrency cap | MISSING | – | – |
| SEC-11 | ActivityLog for create, edit, compile, mode, grant, delete | PARTIAL | `aapi/route.ts:85`; `aapi/[id]/mode/route.ts:34` | Compile not logged; no grant event. |
| PAGE-1 | Automations list | PARTIAL | `AutomationList.tsx` | No owner column, last-run status or admin all-scope view. |
| PAGE-2, 3, 6 | New, detail, briefing view | DONE | `app/dashboard/automations/**` | – |
| PAGE-4 | `/automations/[id]/runs` | DEVIATES | merged into the detail page | Notification links still point here (404). |
| PAGE-5 | Briefings list filters | PARTIAL | `BriefingList.tsx:16-17` | – |
| PAGE-7 | Settings page | PARTIAL | – | No server page guard. |
| API-1–10, 12–15 | §16.2 routes | DONE | `app/api/automations/**`; `withCronAuth` on tick and reap | – |
| API-11 | Promote | PARTIAL | see FR-12 | – |

### 4.6 Mode gating verification (DRY_RUN → REVIEW → AUTO)

- **Storage:** `Automation.mode` (`schema:3547`), default DRY_RUN. Create forces DRY_RUN (`la/crud.ts:50`).
- **No bypass via create or PATCH.** Both zod schemas are `.strict()` with no `mode` field (`aapi/route.ts:24-36`, `aapi/[id]/route.ts:21-37`). The only path is `POST aapi/[id]/mode` → `changeMode`.
- **Behaviour at distribution** (`la/runner.ts:229-294`):

  | Mode | What happens |
  |---|---|
  | DRY_RUN | DRAFT Briefing, no recipient rows, nothing sent. Proven by the smoke test and in production. |
  | REVIEW | PENDING_REVIEW; recipient rows seeded; delivery only via approve. Recipients can't read non-PUBLISHED briefings (`la/access.ts:235`). |
  | AUTO | PUBLISHED and delivered immediately, unless `onEmpty` suppresses. |

- **Who can promote:** the owner (doctype `submit`) or ADMIN (`la/access.ts:163-181`). The seeded field-level `mode` permLevel (`scripts/seed-automation-permissions.ts:36`) is not enforced.
- **Guard weaknesses:**
  - The AUTO guard is only "≥1 SUCCEEDED run, of any version or mode" (`la/crud.ts:122-132`, verified).
  - Once in AUTO, editing the plan, recipients or grants never re-gates or demotes. The widening confirm is client-side only (`AutomationForm.tsx:716`).
  - REVIEW → AUTO has no additional check.
- **Tests:** none for `changeMode`, AUTO delivery or approve.

### 4.7 Cost cap verification

| Cap | Enforced? | Where | On breach |
|---|---|---|---|
| Per run (`maxCostUsdPerRun`, default $0.50; plan `limits.maxCostUsd` ≤ that) | **After the fact.** Checked once, after the single synthesis call (`la/runner.ts:131,203-204`, verified). The plan limit is validated at `la/plan.ts:257-261`. | Worker | `CostCapError`: run FAILED, no Briefing, `consecutiveFailures`+1, owner gets RUN_FAILED. Spec: a truncated Briefing with a callout. |
| Monthly (`maxCostUsdMonth`, default $10) | **No.** grep: only CRUD, UI and seed references. | Display only (`AutomationDetail.tsx:262-265`) | Nothing. No SKIPPED run, no pause, no `COST_CAP_REACHED`. |
| Org daily (`orgDailyCostCapUsd`) | **No.** Editable (`aapi/settings/route.ts:13`), never read by the tick or worker. | – | Nothing. |
| Who sets caps | The owner can raise per-run to $50 and monthly to $1000 (`aapi/[id]/route.ts:34-35`, `aapi/route.ts:34-35`), although the seed marks these fields admin-only permLevel 2 (`scripts/seed-automation-permissions.ts:33-35`). | API | – |
| Compile spend | Not counted against any cap. | – | – |

Visibility (FR-17): per-automation month-to-date spend (UTC month) from `AutomationRun.costUsd` (`la/crud.ts:147-154`), plus per-run cost in the timeline. There is no org dashboard and no tests for caps.

### 4.8 Security and egress verification

- **Run as owner (§3.4):**
  - The owner's live role and departments are resolved per run (`la/runner.ts:62-78`).
  - `okr.query` clamps to the role ceiling and fails closed to OWNER, with 27 tests (`la/tools/okr-query.test.ts:90,339-399`).
  - It is a parallel implementation, not `lib/rbac` / `lib/permissions` / RecordScopeRule, so admin-configured scope rules don't apply.
- **Grants:**
  - Checked at save (`la/plan.ts:226-227`) and at run (`la/tools/index.ts:22-24`).
  - Odoo is read-only before any I/O (`lib/odoo/client.ts:49`, test `client.test.ts:122`), with model allowlist ∩ grant and a 20 s per-call timeout.
- **Egress and SSRF:** not applicable yet, because no outbound web tool exists. Deferred to P2b pending the SSRF review.
- **Rendering and injection:**
  - Escaping plus an http(s)-only URL allowlist (`la/render.ts:20-50`, tests `render.test.ts:8-47`).
  - Untrusted-data delimiting, with no tools during synthesis.
- **Worker:**
  - Claims use `FOR UPDATE SKIP LOCKED` (`la/service.ts:178-193`).
  - Idempotency: unique slot plus P2002, SENT rows skipped on delivery, `runId @unique` on Briefing.
  - The reaper requeues immediately with no backoff.
  - Graceful shutdown drains in-flight work (`scripts/automations-worker.ts:115-124`).

### 4.9 Test coverage

**Covered:**
- `la/schedule.test.ts` (31 tests)
- `la/plan.test.ts` (20)
- `la/findings.test.ts` (12)
- `la/briefing.test.ts` (10)
- `la/render.test.ts` (12)
- `la/compiler.test.ts` (16)
- `la/plan-diff.test.ts` (12)
- `la/access.test.ts` (36)
- `la/tools/okr-query.test.ts` (27)
- `la/tools/odoo-search.test.ts` (17)
- `lib/odoo/client.test.ts:113-135`
- `scripts/smoke-automations.ts:182-315` (34 live-DB checks)

**Not covered:**
- `runner.ts`: cost cap, timeout, auto-disable, grant refusal
- `delivery.ts`: AUTO/REVIEW send, SUPPRESSED/FAILED
- `changeMode`
- The approve, promote, export, settings, mode and run routes
- The worker loop and prune

---

## 5. Telegram bot (`docs/TELEGRAM_BOT.md`, Stage 1)

| ID | Requirement (doc line) | Status | Evidence | Gap |
|---|---|---|---|---|
| TG-1 | Receive every group/channel message, scrape mode ALL (l.9) | DONE | `app/api/telegram/webhook/route.ts:59-60,78-119`; `lib/telegram/client.ts:85` (`allowed_updates`) | `TelegramChat.scrapeMode` is never read, but `env.example:136` says it is. Correct for Stage 1; fix the comment or honour the field. |
| TG-2 | Persist chats and messages (l.10) | DONE | `schema:1764-1804`; `webhook/route.ts:78-119` | Edited messages share a `message_id`, hit P2002 and are dropped, so edit text is lost. |
| TG-3 | `/ask` via the configured provider: OpenAI `gpt-5.5` by default, Anthropic optional (l.11) | PARTIAL | `lib/ai/telegram-chat.ts:13-20,57-114` | The OpenAI path sends `max_tokens: 512` (`:97`). Every other OpenAI call site uses `max_completion_tokens` (`lib/ai/providers/openai.ts:73`, `lib/automations/synthesis.ts:352`, `lib/automations/compiler.ts:329`), and GPT-5-family models reject `max_tokens` on Chat Completions. This likely makes every default-provider `/ask` fail silently: the error is caught at `webhook/route.ts:65-67` and no reply is sent. Verify against the live key. Also reads only env `OPENAI_API_KEY`, not the encrypted in-app key. |
| TG-4 | No live data access (l.11) | DONE | `lib/ai/telegram-chat.ts:30` | – |
| TG-5 | `/ask` only in allowlisted chats, fail closed; DB flags only narrow (l.97) | DONE | `lib/telegram/access.ts:34-66`; `webhook/route.ts:133`; tests `platform-hardening.test.ts:65-86` | – |
| TG-6 | Rate limits 5/user and 20/chat per 10 min; first-denial reply (l.98) | DONE | `lib/telegram/access.ts:83-139`; `webhook/route.ts:148-167`; test `:88-101` | In-memory, single process, as documented. A user hit is consumed even when the chat limit then denies (minor). |
| TG-7 | Refused chat gets ≤1 notice per hour (l.97) | DONE | `lib/telegram/access.ts:123`; `webhook/route.ts:138` | – |
| TG-8 | ADMIN/EXECUTIVE register, inspect and clear the webhook (l.12, l.72-80) | DONE | `app/api/telegram/admin/setup/route.ts:27-61` | Also opens to holders of feature `page.admin.telegram` (`withRoleOrFeature`), which is broader than the doc. `withRole` import unused (`:9`). |
| TG-9 | Secret-token webhook auth, constant time (l.60, l.91) | DONE | `lib/telegram/access.ts:22-25`; `webhook/route.ts:41-50`; tests `platform-hardening.test.ts:52-63`, `api-invariants.test.ts:48` | – |
| TG-10 | Always return 200 (l.91) | DONE | `webhook/route.ts:44,49,56,60,69` | – |
| TG-11 | BigInt chat and message IDs (l.99) | DONE | `schema:1766,1785-1786`; `lib/telegram/client.ts:70-75` | – |
| TG-12 | Idempotency on `(chatId, messageId)` (l.100) | PARTIAL | `schema:1800`; `webhook/route.ts:115-119` | Rows are deduped, but after the P2002 is swallowed, command dispatch still runs (`:121-178`). A Telegram retry (for example, a webhook timeout during a slow LLM call) or an edited `/ask` produces a second answer and a second LLM charge. |
| TG-13 | Anthropic path caches the system prompt (l.101) | DONE | `lib/ai/telegram-chat.ts:72` | – |
| TG-14 | Model override env vars (l.101) | DONE | `lib/ai/telegram-chat.ts:19-20`; `env.example:83-85` | – |
| TG-15 | `env.example` variables documented (l.31) | DONE | `env.example:71-85,138` | – |
| TG-16 | `/help` and `/start` usage reply (l.85) | DONE | `webhook/route.ts:179-190` | – |
| TG-17 | Stateless single-turn (l.119) | DONE | `lib/ai/telegram-chat.ts:57-65` | – |
| TG-D1 | Odoo CRM integration | OUT OF SCOPE (l.16, Stage 2) | none | – |
| TG-D2 | Scheduled morning digests | OUT OF SCOPE (l.17, Stage 2) | `digestEnabled` column reserved (`schema:1773`) | – |
| TG-D3 | Tool use | OUT OF SCOPE (l.18, Stage 3) | – | – |
| TG-D4 | `/admin/telegram` page | OUT OF SCOPE (l.19, Stage 3) | Feature key exists (`components/settings/permissions/FeaturesNavTab.tsx:60`) | – |
| TG-D5 | ActivityLog for bot actions | OUT OF SCOPE (l.113, Stage 3) | – | Webhook register and clear are not audited today. |
| TG-D6 | Outbound throttle, conversation memory | OUT OF SCOPE (l.117-119, known limitations) | – | – |

Additional observations:
- **Retention is built.** `TelegramMessage` retention (180 days, `lib/retention/prune-tables.ts:43,115-118`) is not in the doc but is built.
- **Usage is not logged.** `AskResult.usage` is returned but discarded (`webhook/route.ts:173`), so `/ask` spend is not visible anywhere; nothing is written to `AiGenerationLog`.
- **Tests:**
  - Covered: webhook secret, allowlist parsing, fail-closed gate and gate ordering, rate limiter (`lib/security/platform-hardening.test.ts:52-101`).
  - Not covered: the webhook handler's persistence and dispatch, and `telegram-chat.ts` (which would have caught the `max_tokens` issue).

**Telegram counts:** 15 DONE, 2 PARTIAL, 0 MISSING, 0 DEVIATES, 6 OUT OF SCOPE (23 rows).

---

## 6. Gaps to fix (prioritised)

Severity: **P0** = broken at runtime or a security/integrity hole · **P1** = spec-visible functional gap · **P2** = polish.
Effort: **S** < ½ day · **M** 1–3 days · **L** > 3 days.

| # | Module | Gap | Evidence | Sev | Effort |
|---|---|---|---|---|---|
| 1 | DTP | `decidedById` → `decisionById` in the adjusted-approve patch; fix the fake-Prisma test that hides it | `dapi/plans/[id]/approve/route.ts:57`; `lib/dtp/dtp.test.ts:381-382` | P0 | S |
| 2 | DTP | Approve must reject `ADJUSTED` (acknowledgement bypass); disable Approve in the UI | `approve/route.ts:42,47`; `dfc/CoordinatorActions.tsx:23-24` | P0 | S |
| 3 | DTP | Compute the submission cutoff in Africa/Addis_Ababa | `submit/route.ts:36-39` | P0 | S |
| 4 | Letters | Make reference allocation atomic: `upsert` with `{increment:1}` or `FOR UPDATE`, in the same transaction as `letter.create`; add a concurrency test | `lib/letters.ts:31-46` | P0 | S |
| 5 | Letters | Unify the approver definition: UI from a server-computed `can.approve`, notifications resolved from `letter.approve`; remove EXECUTIVE from the legacy admin fallback | `LFC:57-59`; `lib/letters-notify.ts:87-94`; `lib/letter-permissions.ts:67-79` | P0 | M |
| 6 | Letters | Hard delete cascades ActivityLog (7-year retention). Soft delete, or block non-Draft deletes; change the FK to `SetNull` | `schema:1048`; `api/[id]/route.ts:122-149` | P0 | M |
| 7 | Automations | Enforce `maxCostUsdMonth` and `orgDailyCostCapUsd` (SKIPPED run, `COST_CAP_REACHED` notice); check the per-run cap before the call, or truncate instead of failing; enforce the admin-only cap fields server-side | `lib/automations/runner.ts:203-204`; `app/api/automations/[id]/route.ts:34-35`; `scripts/seed-automation-permissions.ts:33-40` | P0 | M |
| 8 | Telegram | Switch the OpenAI call to `max_completion_tokens` (or the shared provider in `lib/ai/providers/openai.ts`); add a unit test | `lib/ai/telegram-chat.ts:97` | P0 | S |
| 9 | DTP | Coordinator authority should come from `DtpDepartmentApproval` (primary and alternate), not one-off feature grants; exempt coordinators from the EMPLOYEE `requesterId=self` scope | `scripts/seed-permissions.ts:1157-1162`; `dapi/plans/route.ts:58-62`; `scripts/migrate-dtp-coordinators.ts:160-187` | P1 | M |
| 10 | Letters | Settings > Letter Permissions writes tables that are never read. Remove it, or wire it in | `components/settings/LetterPermissionsManagement.tsx`; `lib/permissions.ts:556` | P1 | S–M |
| 11 | Letters | Make transitions atomic: `updateMany({where:{id,status}})` and check the count | submit, approve, reject, send and archive routes | P1 | S |
| 12 | Telegram | Skip command dispatch when the message row already existed (P2002), or key on `update_id` | `webhook/route.ts:115-122` | P1 | S |
| 13 | DTP | Add a DTP cron: failover to the alternate, SLA breach and EXPIRED, missed stop, auto In Progress | none exists | P1 | M |
| 14 | DTP | Add Endorse and Cancel UI (hooks exist); enforce `managerEndorsementMode`; seed `button.dtp.endorse` | `features/daily-trip-plan/queries.ts:130,155` | P1 | S |
| 15 | Letters | Approver can't set a signatory on a Submitted letter. Require it at submit, or allow approvers to PATCH it; add `letter:sign` | `LFC:110,334-338`; `api/[id]/approve/route.ts:32` | P1 | S |
| 16 | Letters | Validate customer (VR-2); remove the "(optional)" label; stop returning mock Odoo contacts when credentials are missing | `api/route.ts:121`; `lib/odoo-contacts.ts:37-42` | P1 | S |
| 17 | Letters | Log print (`LETTER_PRINTED`) and gate print to Approved onward; log PDF failure on the UI path | `lib/activity-log.ts:99`; `fc/PdfPreviewPanel.tsx` | P1 | S |
| 18 | Letters | Unarchive to `fromStatus`; add a force-archive UI with confirmation | `api/[id]/archive/route.ts:66-75` | P1 | S |
| 19 | Letters | Gate letter-type creation on `letter.manage_types` | `api/types/route.ts:42-77` | P1 | S |
| 20 | DTP | Add per-department Approval Routing, Trip Types, Drivers and Vehicles admin UI | `dfc/TravelSettingsForm.tsx` | P1 | M |
| 21 | DTP | Add `dtp_notification_log` (or write notifications to `DtpEvent`); honour `notify*`; fill missing recipients (TC on cancel and manager-reject, LM on reject) | `lib/dtp/notifier.ts` | P1 | M |
| 22 | DTP | Emergency lane (FR-15) | – | P1 | M |
| 23 | All | Route-level tests for Letters (numbering, transitions, validation, recipients), DTP routes (AC-05/10/14/17/18) and the Telegram handler | – | P1 | M |
| 24 | Automations | Execute the plan version a run recorded (snapshot `planJson` per run); fix the UI and CHANGELOG claim | `lib/automations/runner.ts:124-127`; `AutomationForm.tsx:394` | P1 | S |
| 25 | DTP | Distance Matrix client with caching, traffic flag and refresh; optimiser (clustering, dwell-window fill, VRP) and re-optimisation triggers | `lib/dtp/legs.ts:17`; `lib/dtp/optimizer.ts:27-30` | P1 | L |
| 26 | Automations | Transient-error retry with backoff (1m/5m/25m); pass an AbortSignal for the hard timeout; stop the worker on lease loss; count reaper failures and notify | `lib/automations/service.ts:227-251`; `scripts/automations-worker.ts:43-46` | P1 | M |
| 27 | Automations | Stop the authoring form overwriting compiled fields (timezone, catch-up, `onEmpty`, limits, `dedupeKeyFields`, extra schedule kinds); add a plan-JSON view | `features/automations/components/AutomationForm.tsx:313-340` | P1 | M |
| 28 | Automations | Harden the AUTO gate: require a success on the current `planVersion`, re-gate or demote on plan, recipient or grant edits, and name recipients in the confirm; make REVIEW approve atomic and add a discard action | `lib/automations/crud.ts:122-132`; `app/api/automations/briefings/[id]/approve/route.ts` | P1 | S |
| 29 | Automations | Fix the 404 deep link `/dashboard/automations/[id]/runs` in failure notifications; auto-pause on owner deactivation; notify admins on disable | `lib/automations/delivery.ts:247,265` | P1 | S |
| 30 | Letters | Activity comment and note composer; render metadata (reject reason, dispatch details) | `components/shared/ActivityLogPanel.tsx` | P2 | M |
| 31 | Letters | Stale-edit detection (NFR-3, EC-5); group-by and column sort; XLSX/PDF export; Recipient Address, Salutation, Closing and Department inputs; 25 MB cap | various | P2 | M |
| 32 | DTP | Print: server PDF, QR, map, spec filenames, passenger phones; reports RPT-3 to RPT-11 | `lib/dtp/sheets.ts:161`; – | P2 | L |
| 33 | DTP | Ethiopian calendar and i18n polish: EC in emails and audit, Amharic month names, EC date input, UTC today fix, stale test comment | `dfc/TravelHome.tsx:23-27`; `lib/dtp/dtp.test.ts:203-208` | P2 | S |
| 34 | Telegram | Log `/ask` usage (tokens and cost); audit webhook register and clear; correct the `scrapeMode` comment in `env.example` | `webhook/route.ts:173`; `env.example:136` | P2 | S |
| 35 | Automations | Redact transcript args; register event keys in `EventKey`; log compile in ActivityLog; fix CHANGELOG drift (`CHANGELOG_AI.md:767-778` names files that do not exist) | `lib/automations/runner.ts:164-190` | P2 | S |