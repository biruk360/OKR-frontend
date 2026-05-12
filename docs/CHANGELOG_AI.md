# AI Changelog

> **Purpose:** Log of all changes made by AI assistants. Every AI session that modifies code MUST append an entry here.

## Format

```
## YYYY-MM-DD — [Summary]
- **[Action]** Description — `path/to/file`
- **Tests:** [ran / not run / passed / failed with reason]
- **Docs updated:** [list which docs were updated]
```

---

## 2026-05-12 — Letters: switch to HTML-based preview + Puppeteer PDF (ERPNext-style)

Replace the @react-pdf rendering pipeline with a unified HTML approach that
produces byte-identical output across preview, browser print, and PDF download.

Architecture:
  SuperDoc → bodyDocx → mammoth → bodyContent HTML
                              ↓
                  Single HTML template (lib/letter-html.tsx)
                              ↓
       ┌──────────────┬──────────────┬──────────────┐
       ▼              ▼              ▼              ▼
   GET /html      iframe.print()   Puppeteer →  GET /pdf
   (iframe        (browser print   server-side    (Chromium
   preview)        of same HTML)   PDF of same     prints same
                                   HTML)           HTML)

One HTML source, three consumers. Identity is real — the same bytes flow
through preview, print, and PDF download.

- Add lib/letter-html.tsx — server-side template that implements the Eldix
  Letterhead Spec (12/10/14/14mm inset, full-width header with Eldix
  wordmark + ref/date in JetBrains Mono, 2-column body grid + 42mm right
  rail with Address/Telephone/Email·Web/Mailing sections + brand block,
  Amharic ለ / ጉዳዩ labels, monochrome). Self-contained HTML with
  @font-face rules pointing at /fonts/* and image refs at /branding/*.
- Add GET /api/letters/[id]/html — serves the rendered HTML for iframe
  consumption. Surfaces unresolved {{placeholders}} via the
  X-Missing-Placeholders response header.
- Add lib/letter-pdf-puppeteer.ts — keeps a single Chromium instance per
  process, recycled every 200 PDFs. Waits for document.fonts.ready +
  every <img> before printing so the PDF never falls back to Times.
- Rewrite /api/letters/[id]/pdf — replaces the @react-pdf path with
  Puppeteer feeding the same HTML the iframe loads.
- Rewrite PdfPreviewPanel — iframe loads /html (~250ms), Print fires
  iframe.contentWindow.print() (no popup, no popup-blocker), Download
  hits /pdf?download=1.
- Delete lib/letter-pdf.tsx and uninstall @react-pdf/renderer. Remove the
  serverComponentsExternalPackages entries that were there to work around
  the B.Component minification bug — no longer relevant.
- Install puppeteer (auto-downloads Chromium ~170MB to ~/.cache/puppeteer
  on first npm install).
- Prod VPS: installed Chromium runtime deps (libnss3, libatk1.0-0t64,
  libgbm1, libxss1, libpangocairo-1.0-0, libgtk-3-0t64, fonts-liberation,
  libappindicator3-1, xdg-utils + a handful more).

Verified locally: HTML preview = 11.6KB, PDF (via Puppeteer) = 248KB,
rendered from a mixed Amharic+Latin letter with a table, enclosure, and
unresolved placeholder. Build clean, tsc clean.

**Docs updated:** docs/CHANGELOG_AI.md.

---

## 2026-05-12 — Letters: implement Eldix Letterhead Spec (A4 + right rail + monochrome)

Per the design handoff bundle `eldix-branding-letter-head/project/Letterhead Spec.md`:

- **lib/letter-pdf.tsx rewrite** — matches the spec exactly: A4 page, inset 12/10/14/14 mm, full-width header band (Eldix wordmark left, REFERENCE/DATE mono labels right), two-column body grid (1fr main + 42mm right rail with hairline left border), four rail sections (Address, Telephone, Email·Web, Mailing) followed by a brand block at the bottom (Eldix mark 9mm + 360Ground mark 13mm + "Addis Ababa · Ethiopia" city stamp + Ethiopian flag SVG). Monochrome — ink #0e0e0e, ink-soft #2a2a2a, muted #8a8a86, rule #c4c4be. Mono font for ref/date/labels, Ethiopic for ለ/ጉዳዩ labels and the subject heading (with 1px underline + 3px offset). Page number rendered as "PAGE 01 / 02" in mono at the bottom-right of the main column, fixed across pages.
- **lib/letterhead.ts** — updated with the full company info from the spec: legal name (English + Amharic), P.O. Box 14417, the four-line address (7th Floor, REWINA Building, Equatorial Guinea St., 22 Bole Sub-City, Addis Ababa, Ethiopia), three phone numbers, email info@360ground.com, web www.360ground.com.
- **Assets** — committed the high-res logos from the handoff bundle: `public/branding/eldix-primary.png` (2052×620, transparent) and `public/branding/360ground.png` (1000×1000, transparent).
- **Fonts** — added JetBrains Mono Regular + Medium TTFs to `public/fonts/` for the mono ref/date/labels. Total bundled font weight is now ~3.8 MB (NotoSans + Ethiopic + Mono).
- **Body parser kept** — the existing Tiptap → block tree → react-pdf primitives pipeline is unchanged; only the page chrome (header, rail, signature) is redesigned.

Files: `lib/letter-pdf.tsx`, `lib/letterhead.ts`, `public/branding/{eldix-primary,360ground}.png`, `public/fonts/JetBrainsMono-{Regular,Medium}.ttf`.

**Tests:** `tsc --noEmit` clean, `npm run build` clean, renderer probed locally — 117 KB PDF rendered with logos + Amharic mixed body + Ethiopian flag SVG (no warnings).
**Docs updated:** `docs/CHANGELOG_AI.md`.

---

## 2026-05-12 — Letters: letterhead, print + print-preview, page numbers

Per spec FR-8 and user request:

- **Letterhead** — new `lib/letterhead.ts` defines the Eldix IT Technology PLC contact block (English + Amharic company name, tagline, address, phone, email, website). The PDF renderer now starts every page with a letterhead band: logo (top-left), company name + contact lines (centre), reference number + date (right), and a bottom border. Renders bilingually — when the user is in Amharic mode the company name switches to ኤልዲክስ አይቲ ቴክኖሎጂ ኃ.የተ.የግ.ማ. (Ethiopic glyphs use the bundled Noto Sans Ethiopic font).
- **Logo** — drop a PNG/JPG into `public/branding/letterhead-logo.png` (or .jpg/.jpeg). The renderer detects it at process start; missing file → text-only letterhead, no crash. README in `public/branding/` documents the size/format expectations.
- **Print button** — added to two places: the PageHeader actions on the letter form (visible from any tab), and the PDF Preview tab. Opens the PDF in a new tab via `GET /api/letters/[id]/pdf` and triggers `window.print()` once the embedded viewer fires `load`. Works for all statuses including DRAFT (previously gated to APPROVED+).
- **Print-preview UX** — the PDF Preview tab now auto-fetches the PDF on first open, so users see exactly what will print without clicking Generate first. Print + Download buttons promoted to primary; Regenerate kept as ghost.
- **PDF route** — added `GET` method alongside the existing `POST` so the Print flow can navigate directly to the PDF URL (browsers only do GET for top-level navigation). New `?lang=en|am` and `?download=1` query params. GET does not record an activity log entry (POST still does, so the existing Generate-button flow remains tracked).
- **Page numbers** — every page now shows "N / Total" in a small footer, fixed-positioned so it survives multi-page letters.

Files: `lib/letterhead.ts`, `lib/letter-pdf.tsx`, `app/api/letters/[id]/pdf/route.ts`, `features/letters/components/{PdfPreviewPanel,LetterFormClient}.tsx`, `features/letters/services/lettersApi.ts`, `public/branding/README.md`.

**Tests:** `tsc --noEmit` clean, `npm run build` clean, renderer probed locally (18.9 KB PDF without logo, no crashes).
**Docs updated:** `docs/CHANGELOG_AI.md`.

---

## 2026-05-12 — Letters: dynamic letter types, slimmer form, Apple-style redesign, altChunk fix

Three things in one pass:

1. **Dynamic letter types.** New `LetterTypeDef` Prisma model + `Letter.letterTypeId` FK column. `GET/POST /api/letters/types` lists/creates types; built-in `CL/OF/GR` are auto-seeded with `isBuiltIn: true`. New `LetterTypeSelect` combobox shows built-ins first, then custom types, with an inline "Create new letter type" modal that derives a 2–4 letter code from the name. Reference numbers (`360G/LT/{CODE}/{SEQ}/{YEAR}`) work with any code.
2. **Trim form fields.** Removed Recipient Address, Salutation, Closing, and Sender Department from the form per user feedback. DB columns retained for back-compat with the PDF placeholder pipeline. Customer remains optional.
3. **Apple-style redesign.** Consumed the existing `--ap-*` design tokens (CSS variables in `app/globals.css`) and the `ap-status-pill` class. `LetterStatusBadge`, `LettersTable`, `LettersPageClient`, `LetterFormClient`, and `CreateLetterModal` all rebuilt around `rounded-[14px]` / `rounded-[16px]` cards, `shadow-card`, `var(--ap-border)` borders, and the platform's grey scale. Button positioning matches `PageHeader` conventions (actions top-right). Status tabs now look like a real iOS segmented control. Type-filter pills replaced the old square buttons.

Also fixed the **altChunk-wrapped docx** bug from the earlier SuperDoc round-trip:
- Replaced `html-docx-js-typescript` (which writes MIME-HTML `w:altChunk` that mammoth can't read) with a focused `lib/html-to-docx.ts` using the `docx` library — produces real OOXML that round-trips cleanly through mammoth (verified locally).
- Hardened `PUT /api/letters/[id]/docx`: if mammoth ever returns an empty HTML mirror in the future, the previous `bodyContent` is kept rather than blanked. Activity log records mammoth warnings for any save where this happens, so we can diagnose silently-broken docx imports without dropping content.
- Dropped `html-docx-js-typescript` and the Tiptap table extensions (no longer used since SuperDoc owns the editor).

Files: `prisma/schema.prisma`, `app/api/letters/{route.ts,types/route.ts,[id]/docx/route.ts}`, `lib/{letters.ts,html-to-docx.ts}`, `types/index.ts`, `features/letters/{services/lettersApi.ts,types.ts,components/{LetterTypeSelect,LetterStatusBadge,LettersTable,LettersPageClient,CreateLetterModal,LetterFormClient}.tsx,index.ts}`.

**Tests:** `tsc --noEmit` clean, `npm run build` clean.
**Docs updated:** `docs/CHANGELOG_AI.md`.

---

## 2026-05-12 — Letter Management: swap Tiptap for SuperDoc (Word-class .docx editor)

Replace the Tiptap-based `LetterBodyEditor` with SuperDoc (Harbour Enterprises, AGPLv3) for true Word-class editing — native .docx storage, tables with cell ops, headers/footers, comments, track changes, pagination. Keeps the existing PDF pipeline (mammoth converts the saved .docx back to HTML, which feeds the existing @react-pdf parser).

- **Add** dependencies — `superdoc` 1.32, `@superdoc-dev/react` 1.3, `mammoth` 1.12, `docx` 9.6, `html-docx-js-typescript` 0.1.5, plus SuperDoc peer deps (`yjs`, `y-prosemirror`, `prosemirror-*`, `pdfjs-dist`, `@hocuspocus/provider`).
- **Add** Prisma column `Letter.bodyDocx Bytes?` — stores the authoritative .docx blob from SuperDoc. `bodyContent` is retained as an HTML mirror that the PUT route regenerates server-side via mammoth on every save.
- **Add** `GET/PUT /api/letters/[id]/docx` — GET streams the .docx (or converts the existing HTML template to .docx on first open); PUT receives the .docx blob from the client after edits and rewrites both `bodyDocx` and the HTML mirror.
- **Add** `lib/empty-docx.ts` — cached single-paragraph .docx for letters with no body yet.
- **Add** `features/letters/components/SuperDocEditorClient.tsx` — SSR-safe wrapper that dynamic-imports SuperDoc only on mount (Vue/Pinia/Konva internals would crash an SSR pass otherwise). Debounced 2s autosave with optimistic save indicator + retry on failure.
- **Update** `LetterFormClient` — body tab now renders `SuperDocEditorClient` instead of the Tiptap `LetterBodyEditor`; the form's own save flow no longer handles bodyContent (SuperDoc owns it end-to-end via the docx PUT route).
- **Bundle** — `/dashboard/letters/[id]` static portion is 176 KB First Load JS; SuperDoc itself is split into two lazy chunks (~1.5 + 2.3 MB unminified) that only download when the body tab is first rendered. No SSR penalty.
- **Server load** — zero new processes. The editor runs entirely in the browser (per SuperDoc docs). mammoth runs server-side on each save (~500ms typical) inside the existing Next.js process.

**Honest gaps** (verified against the audit):
- **No drag-handle ruler / column-width handles** in the AGPL build — table cell operations (add/del row/col, merge/split) are toolbar-driven only. This is a SuperDoc limit, not a config knob.
- **PDF export** stays on `@react-pdf/renderer` via the HTML mirror. SuperDoc has no built-in PDF.
- **Amharic + tables fidelity** verified via build + Unicode font registration; live UX needs the smoke test you're about to run.
- AGPLv3 obligation: we're consuming unmodified upstream, internal-only — minimum-obligation path. Patching SuperDoc would require offering modified source to all users of the deployed app.

**Tests:** `tsc --noEmit` clean, `npm run build` clean, letters page bundle 176 KB static + lazy SuperDoc chunks. Live smoke test next.
**Docs updated:** `docs/CHANGELOG_AI.md`. The earlier "WYSIWYG editor, Ethiopian calendar, bilingual UI, real PDF" entry (just below) still applies — calendar + bilingual UI carried over unchanged.

---

## 2026-05-12 — Letter Management: WYSIWYG editor, Ethiopian calendar, bilingual UI, real PDF

Round 2 of Letter Management. Adds true rich-text editing, dual-calendar date entry, full Amharic/English UI switching for the Letters module, and a robust server-side PDF pipeline. Fixes the "PDF generation failed" error from the first round (cause: default Helvetica/Times in @react-pdf had no glyph for ™ and other Unicode chars, which crashed the renderer on common letter content).

- **Add** Tiptap-based WYSIWYG editor — `features/letters/components/LetterBodyEditor.tsx`. Supports bold/italic/underline/strikethrough, H2/H3, bulleted & numbered lists, blockquote, hyperlinks, and **tables** (insert/add-row/delete). Page-like writing surface for visual feedback; real pagination is in the PDF.
- **Add** Tiptap extensions — `@tiptap/extension-table`, `-table-row`, `-table-cell`, `-table-header`, `-underline` (all pinned 3.22.4 to match existing `@tiptap/starter-kit`).
- **Add** Ethiopian calendar date picker — `features/letters/components/LetterDatePicker.tsx`. Uses `kenat@3.2.0`. Stores canonical GC ISO under the hood; lets users pick EC or GC and shows the other calendar inline for confirmation.
- **Add** i18n dictionary + context — `features/letters/i18n.ts`. Letters-module-only bilingual support (Amharic / English) per scoped requirements. Form, list, create modal, dispatch modal, reject modal, PDF panel, table all translated.
- **Add** Amharic font class — `font-amharic` in `app/globals.css` falls back to Noto Sans Ethiopic / Abyssinica SIL / Nyala / Ethiopia Jiret.
- **Rewrite** PDF renderer — `lib/letter-pdf.tsx` now parses Tiptap HTML (paragraphs, headings, lists, tables, inline bold/italic, links, blockquote) into a structured tree and maps each block to @react-pdf primitives. Registers `NotoSans` (Latin) and `NotoSansEthiopic` (Ge'ez) TTFs from `/public/fonts/` so Unicode chars and Amharic glyphs render correctly. Pages auto-switch to the Ethiopic family when Ge'ez codepoints are detected in the body.
- **Add** bundled fonts — `public/fonts/NotoSans-{Regular,Bold,Italic}.ttf` and `public/fonts/NotoSansEthiopic-{Regular,Bold}.ttf` (~3.3 MB total).
- **Update** `app/api/letters/route.ts` and `app/api/letters/[id]/submit/route.ts` — customer is now optional at create time; submission requires only subject + body (not customer).
- **Update** `CreateLetterModal` — customer field labelled "(optional)" and validation removed.
- **Update** form header — added EN / አማ language toggle pill; status bar + transition buttons localize on toggle.
- **Verified** locally: full-letter PDF probe with tables + Amharic text + em-dash + ™ produces a valid 21 KB PDF (was failing before).
- **Tests:** not run. `tsc --noEmit` clean across the repo. PDF renderer probed directly via `scripts/pdf-full-probe.ts` (cleaned up after).
- **Docs updated:** `docs/CHANGELOG_AI.md`.

---

## 2026-05-12 — Letter Management: vertical slice (mocked Odoo + PDF)

New standalone module per `docs/letter_management_requirements.md` v2.0 — Cover, Offer, and Guarantee letters with the full Draft → Submitted → Approved → Sent → Archived workflow. Odoo contact lookup and PDF rendering are mocked (typeahead returns a stub roster; the PDF endpoint returns server-rendered HTML for inline preview + print). Sequence allocation, permissions, activity log, and enclosures are real.

- **Add** Prisma models — `Letter`, `LetterEnclosure`, `LetterSequence`; extend `ActivityLog` with `letterId` + `LETTER` entityType — `prisma/schema.prisma` (run `prisma db push` against staging/prod before shipping).
- **Add** types — `LetterType`, `LetterStatus`, `LetterDispatchMethod`, `CreateLetterForm`, `UpdateLetterForm`, `LetterFilters`, labels & code maps — `types/index.ts`.
- **Add** server helpers — `allocateLetterReference` (transactional sequence per type+year), `LETTER_TEMPLATES`, `resolvePlaceholders` — `lib/letters.ts`.
- **Add** permissions — `canCreateLetter`, `canApproveLetter`, `canDispatchLetter`, `canAdminLetter`, `canEditLetter` — `lib/permissions.ts`.
- **Add** activity-log actions — `LETTER_SUBMITTED/APPROVED/REJECTED/SENT/PRINTED/PDF_GENERATED/PDF_FAILED/ENCLOSURE_ADDED/REMOVED` and `letterId` plumbing — `lib/activity-log.ts`.
- **Add** API routes under `app/api/letters/` — `route.ts` (list+create), `[id]/route.ts` (read/update/delete), `[id]/{submit,approve,reject,send,archive,activity,views,pdf}/route.ts`, `[id]/enclosures/{route,[enclosureId]/route}.ts`, `odoo/contacts/route.ts` (mocked typeahead).
- **Add** feature module — `features/letters/` with `LettersPageClient`, `LetterFormClient`, `LettersTable`, `CreateLetterModal`, `LetterStatusBar`, `LetterStatusBadge`, `CustomerLookup`, `EnclosuresPanel`, `PdfPreviewPanel`, `MarkAsSentModal`, `RejectLetterModal`, plus `services/lettersApi.ts` client + `types.ts` + `index.ts` barrel.
- **Add** pages — `app/dashboard/letters/page.tsx` (list) and `app/dashboard/letters/[id]/page.tsx` (form).
- **Update** shared `ActivityLogPanel` — add `'letter'` entityType + API base + lifecycle action labels — `components/shared/ActivityLogPanel.tsx`.
- **Update** sidebar navigation — new "Letters" group — `lib/dashboard-navigation.ts`.
- **Tests:** not run. `tsc --noEmit` passes for the whole repo. Real Odoo integration and real PDF generation are deliberately mocked — see the comments at the top of `app/api/letters/odoo/contacts/route.ts` and `app/api/letters/[id]/pdf/route.ts`.
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/SITEMAP.md`, `docs/FEATURE_STATUS.md`.

---

## 2026-05-08 — Telegram bot: switchable OpenAI / Anthropic provider for /ask

The Telegram `/ask` command now supports both OpenAI and Anthropic. Provider is selected by `TELEGRAM_AI_PROVIDER` env var (`openai` default, `anthropic` alt). Default OpenAI model is `gpt-5.5`; default Anthropic model is `claude-sonnet-4-6`. Both override-able via `AI_OPENAI_TELEGRAM_MODEL` / `AI_ANTHROPIC_TELEGRAM_MODEL`. Lazy clients — neither SDK is instantiated until first /ask hits its branch, so a missing key for the unused provider doesn't crash startup.

- **Refactor** `lib/ai/telegram-chat.ts` — single `answerAskCommand` that dispatches to `runOpenAI` / `runAnthropic`. Returns `{provider, model, usage}` so we can log which path served each reply later.
- **Update** `env.example` — document `TELEGRAM_AI_PROVIDER`, `AI_OPENAI_TELEGRAM_MODEL`, `AI_ANTHROPIC_TELEGRAM_MODEL`.
- **Update** `docs/TELEGRAM_BOT.md` — provider-selection note.
- **Tests:** not run. `tsc --noEmit` passes.
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/TELEGRAM_BOT.md`

---

## 2026-05-08 — Fix: cannot create initiative under a key result (assignee no longer required)

`POST /api/keyresults/[id]/todos` rejected requests without `assigneeId` and `creatorId` ("Title, assignee, and creator are required"), but the frontend in `features/todos/components/ToDoList.tsx` intentionally creates Trello-style unassigned cards (members are added later). The Prisma `Todo.assigneeId` is already nullable. Aligned the API: only `title` is required, `creatorId` is taken from the session (no longer trusted from the client), `assigneeId` is optional and validated only when provided.

- **Fix** `app/api/keyresults/[id]/todos/route.ts` — drop required check on assigneeId/creatorId, source creatorId from session, conditional assignee validation.
- **Tests:** not run (no API test suite). Type-check via `tsc --noEmit` passes.
- **Docs updated:** `docs/CHANGELOG_AI.md`

---

## 2026-05-08 — Telegram bot integration (Stage 1: foundation)

Stage 1 of a multi-stage Telegram + Odoo + Claude integration. Adds a Telegram bot hosted in this Next.js app that logs every message in chats it has been added to and answers `/ask` queries via Claude Sonnet 4.6. Stages 2 (Odoo + scheduled digests) and 3 (tool use + admin UI) are deferred. See `docs/TELEGRAM_BOT.md`.

- **Add** Prisma models `TelegramChat`, `TelegramMessage`, `TelegramBotConfig` — `prisma/schema.prisma`
- **Add** Telegram Bot API client (sendMessage, setWebhook, getMe, parseCommand) — `lib/telegram/client.ts`
- **Add** Claude `/ask` answerer with prompt-cached system prompt — `lib/ai/telegram-chat.ts`
- **Add** Public webhook endpoint, secret-token auth (not NextAuth) — `app/api/telegram/webhook/route.ts`
- **Add** Admin webhook setup endpoint (GET/POST/DELETE), `withRole(['ADMIN','EXECUTIVE'])` — `app/api/telegram/admin/setup/route.ts`
- **Add** env vars `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_PUBLIC_URL` — `env.example`
- **Add** Dependency: `@anthropic-ai/sdk`
- **Add** Stage docs and BotFather setup checklist — `docs/TELEGRAM_BOT.md`
- **Tests:** not run (no test suite in repo for API routes). Type-check via `tsc --noEmit` passes for new files. Prisma schema validated via `prisma format` + `prisma generate`.
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/FEATURE_STATUS.md`, `docs/SITEMAP.md`, new `docs/TELEGRAM_BOT.md`

---

## 2026-05-08 — Filters page: split Progress Distribution into 3 insight cards

Replaced the single, often-empty Progress Distribution panel on `/dashboard/filters` with a 3-card row: progress histogram, confidence breakdown, and progress over time (12-week sparkline from check-in history). Confidence segments are click-to-filter. Also fixed the underlying data bug: `/api/keyresults` was not returning `progress`, `currentValue`, `targetValue`, `startValue`, or `unit`, so the existing chart's bars rendered as 2px stubs even with real data.

- **Add** `ConfidenceChart` and `ProgressTimeseriesChart` components — `features/filters/components/ProgressChart.tsx`
- **Add** time-series API that averages KR progress per week from `KeyResultCheckIn` history — `app/api/filters/progress-timeseries/route.ts`
- **Add** `confidence` + `timeseries` to `useFiltersData`, plus a second TanStack query for the time-series — `features/filters/hooks/useFiltersData.ts`
- **Update** layout: 1 card → 3-card grid; confidence segments wire into the existing `confidence` filter — `features/filters/components/FiltersWorkspace.tsx`
- **Fix** `/api/keyresults` to select KR-level fields (`progress`, `currentValue`, `targetValue`, `startValue`, `unit`, etc.) so the histogram has real values — `app/api/keyresults/route.ts`
- **Types** `ConfidenceBreakdown`, `ProgressTimeseriesPoint` — `features/filters/types.ts`
- **Tests:** not run (UI + API change; no automated coverage exists for this surface)
- **Docs updated:** CHANGELOG_AI.md (this entry)

---

## 2026-05-07 — Fix empty bundle when subject has no OKRs in the active timeframe
 
`responseJson` logging from the previous commit confirmed plan `cmove2gr80002mag4rlrlzhqi` (subject: Yared Teferra) sent the AI an empty Objectives/KR section despite the user having 23 active KRs in the DB. Root cause: `loadScopeAuto` in the context-bundler scoped objectives to `WHERE timeframeId = activeTimeframe.id`, but Yared's KRs sit in other timeframes (quarterly windows, FY2024/25, etc.) — a real data-shape characteristic of this org.

- **Bundler fallback** `loadScopeAuto` now retries without the timeframe filter when the timeframe-scoped query returns 0 objectives. Prevents empty plans for users whose active work-in-progress KRs aren't in the currently-active timeframe — `lib/ai/context-bundler.ts`
- **Tests:** not run; typecheck passes
- **Docs updated:** CHANGELOG_AI

## 2026-05-07 — Fix empty proposedTodos + log raw AI response for diagnosis

Investigated plan `cmovaxr5o000gvjjr67rzzbiw` which generated only a rationale (zero new tasks) despite the subject having 44 KRs with headroom. Root cause: the AI fixated on disposing carryover (24 prior-sprint todos linked to inactive KRs got force-DESCOPED) and returned `proposedTodos: []`. The prompt allowed this because `min(0)` on the schema and "1–4 per KR" was advisory.

- **Schema** Added `AiGenerationLog.responseJson Json?` so the raw provider response body is persisted alongside token counts. Future empty-task incidents are diagnosable in seconds. Requires `prisma db push` (auto-runs on deploy) — `prisma/schema.prisma`
- **Pipeline + log writer** `recordGenerationLog` accepts `responseJson`; pipeline passes `aiResult.plan` on the OK path — `lib/ai/generation-log.ts`, `lib/ai/pipeline.ts`
- **Prompt** Replaced advisory "generate 1–4 todos" with imperative "you MUST generate 1–4 todos for EACH non-saturated KR with plannedDelta>0", plus an explicit anti-pattern: empty proposedTodos array is invalid unless every KR is saturated. Added a clarifier so the model doesn't conflate force-DESCOPED carryover (about prior-sprint todos on inactive KRs) with new-task generation (about active KRs in Allocations) — `lib/ai/prompt.ts`
- **Debug endpoint** Now distinguishes `AI_RETURNED_EMPTY_ARRAY` from `AI_RETURNED_N_TODOS_ALL_FILTERED` by inspecting `responseJson.proposedTodos.length`. Older plans without a recorded body fall back to the original ambiguous diagnosis — `app/api/sprints/ai/[planId]/debug/route.ts`
- **Tests:** not run; typecheck passes
- **Docs updated:** CHANGELOG_AI

## 2026-05-07 — AI Sprint Planning: per-user generation INTO an existing team sprint

Restructured AI sprint planning so the AI fills tasks into a user-created team sprint rather than creating its own. Triggered from the sprint board header, scoped to one subject user at a time; multiple plans on the same sprint, each reviewed and approved independently.

- **Schema** Dropped `@unique` on `AiSprintPlan.sprintId`; added `@@index([sprintId, status])`. Renamed `Sprint.aiPlan` → `Sprint.aiPlans` (1-to-many). Requires `prisma db push` on prod — `prisma/schema.prisma`
- **Pipeline** `runSprintPlanPipeline` now takes `sprintId` instead of `startDate/durationDays`; loads sprint, validates PLANNING + dates set, no longer calls `tx.sprint.create` — `lib/ai/pipeline.ts`
- **API** `/api/sprints/ai/generate` body changed to `{ subjectUserId, sprintId, mode, ... }`; idempotency key now `(sprintId, subjectUserId, status='DRAFT')`. `/regenerate` no longer deletes the team sprint — only this subject's draft AI todos. `/accept` keeps sprint in PLANNING; promotes kept proposals to `aiSuggested=false` so they render as normal kanban cards. `/[planId]` GET returns `subject` + KR objective context. `/board` excludes `aiSuggested=true`.
- **UI** `GenerateSprintButton` now requires `sprintId`, lives in the sprint board header (PLANNING + dates set). `GenerateSprintModal` drops date inputs, takes `sprintId` prop. `ReviewPlanClient` shows subject user in header and per-todo "→ contributes +X to KR (Objective)" relationship block. Removed standalone button from sprints list — `features/sprints-ai/components/`, `features/sprints/components/SprintBoardClient.tsx`, `features/sprints/components/SprintsListClient.tsx`
- **Tests:** not run (typecheck passes via `tsc --noEmit`)
- **Docs updated:** SITEMAP, FEATURE_STATUS, AI_SPRINT_PLANNING (Section 0 supersession note)

## 2026-05-07 — Daily Trip Plan (DTP) module — Phase 1 web backbone

Implemented the web slice of the Travel & Mobility module per `docs/Daily_Trip_Plan_Requirements_v1.0.md`. Schema, server logic, REST API, employee plan editor, Coordinator console, Movement / Run sheets (with print CSS), Pool Coordinator, and admin settings. Flutter mobile, Google Distance Matrix, full VRP optimizer, and server-PDF export are clearly marked TODO and stubbed.

- **Added** Prisma models: `DailyTripPlan`, `TripStop`, `TripLeg`, `DailyRunSheet`, `DtpEvent`, `RouteGroup`, `DtpSettings`, `DtpDepartmentApproval`, `DtpTripType`, `Vehicle`, `Driver`. Reserved nullable `linkedObjectiveId / linkedKeyResultId / linkedInitiativeId` (Phase-2 KR linkage). User back-relations added — `prisma/schema.prisma`
- **Added** `lib/dtp/` server utilities: `state-machine.ts`, `audit.ts`, `settings.ts`, `permissions.ts`, `diff.ts`, `legs.ts`, `sheets.ts`, `optimizer.ts` (stub), `notifier.ts`, `ec-calendar.ts`, `time.ts`, `api-helpers.ts`, `index.ts` barrel
- **Added** REST endpoints under `app/api/dtp/`: list/create plans, plan CRUD, stops CRUD, transitions (submit, withdraw, endorse, approve, return, reject, acknowledge, cancel, clone), Movement Sheet, Run Sheet, driver assignment, leg-status, settings (GET/PUT), trip types CRUD, drivers/vehicles list+create
- **Added** `features/daily-trip-plan/` module: `types.ts`, `services/api.ts`, `hooks/queries.ts` (TanStack Query), and components — `StatusBadge`, `StopEditorModal`, `StopList` (with diff strip), `PlanTimeline`, `PlanEditor`, `CoordinatorActions`, `CoordinatorConsole`, `MovementSheetView`, `RunSheetView`, `PoolConsole`, `TravelSettingsForm`, `TravelHome`. Barrel exports in `index.ts`
- **Added** pages: `/dashboard/travel`, `/dashboard/travel/plans/[id]`, `/dashboard/travel/console`, `/dashboard/travel/sheet/[deptId]/[date]`, `/dashboard/travel/runsheet/[driverId]/[date]`, `/dashboard/travel/pool`, `/dashboard/settings/travel`
- **Added** "OKR & Operations" sidebar group with Daily Trip Plan, Coordinator Console, Pool Coordinator entries; Travel & Mobility added under Settings — `lib/dashboard-navigation.ts`
- **Added** seed script `prisma/seed-dtp.ts` (12 default trip types + default settings row + org-default approval routing). Wired as `npm run db:seed:dtp`
- **Notifications:** writes `Notification` rows under `category="TRAVEL"` and dispatches IMMEDIATE emails via the existing `sendMail` helper. Recipient resolution uses `DtpDepartmentApproval` + `ManagerRelationship` + Pool Coordinator CSV. The central `lib/notifications/dispatcher.ts` is intentionally not extended — DTP routing depends on settings the central dispatcher is unaware of.
- **Print/PDF:** Movement & Run sheets use `window.print()` against print-styled HTML. Server-rendered PDF is a TODO marker (will plug in puppeteer or @react-pdf/renderer in a follow-up).
- **Phase-2 hooks (intentionally not implemented):** Distance Matrix calls (legs use a flat 10-min travel placeholder), VRP route optimizer (returns no suggestions), Flutter mobile surfaces, SMS / Telegram channels, offline mode, scheduled-email reports, KR linkage UI.
- **Tests:** `npx tsc --noEmit` clean across the new module. Manual smoke (UI + API) not run; admin must run `npm run db:push && npm run db:seed:dtp` then sign in to exercise the flows.
- **Docs updated:** CHANGELOG_AI.md, FEATURE_STATUS.md, SITEMAP.md, COMPONENT_CATALOG.md

## 2026-05-04 — Sprint board UX fixes

- **Fixed** `TodoCardModal`: backdrop click now closes the drawer (removed `pointer-events-none` from outer wrapper, applied `onClick={onClose}` for both drawer and modal modes) — `components/todos/TodoCardModal.tsx`
- **Fixed** `TodoCardModal`: assignee is excluded from the member toggle list so they can no longer appear as an unremovable member — `components/todos/TodoCardModal.tsx`
- **Fixed** `SprintBoardClient`: "Add task" button moved below the task list so new tasks always appear at the bottom — `features/sprints/components/SprintBoardClient.tsx`
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md

## 2026-05-04 — Sprint Trello UX (Stage 1: foundations)

Foundation pass for the sprint board overhaul (see Codex spec consolidated with Claude phasing). Stages 2 (dnd + dynamic 5-lane board API + KPI chips) and 3 (Trello-parity labels, checklist start dates, polish) follow.

- **Added** `lib/todo-status.ts` — central `TODO_STATUSES`, `BOARD_STATUSES` (5 lanes excluding `CANCELLED`), and `TODO_STATUS_META` (label/tone/dot color) so all sprint and todo surfaces render the new statuses consistently.
- **Extended** `TodoStatus` type to include `IN_REVIEW` and `STUCK` — `types/index.ts`
- **Schema** (Prisma): added `Todo.startDate`, `Todo.sprintPosition`, `TodoChecklistItem.startDate`, `SprintColumn.statusKey` + per-sprint unique `(sprintId, statusKey)` and `(sprintId, status, sprintPosition)` index — `prisma/schema.prisma`
- **Preflight SQL**: idempotent ALTERs for the four new columns; two-step `SprintColumn` backfill — claims existing same-name lanes by case-insensitive match (Backlog/In progress/Review/Done → status keys), then inserts any missing lanes per sprint. Each `(sprintId, statusKey)` ends up with exactly one row — `scripts/preflight.sql`
- **Updated** `app/api/sprints/route.ts` `DEFAULT_COLUMNS` to seed five status-bound lanes (To Do, In Progress, In Review, Stuck, Done) on new sprints.
- **Updated** consumers to handle the new statuses: `TodoCardModal` (status pill now reads from central meta; STATUS_OPTIONS = 5 lanes + Cancelled), `lib/email/templates/cards.ts` (TODO_STATUS_LABEL/TONE include IN_REVIEW + STUCK), `features/filters/hooks/useFiltersData.ts` (mapTodoStatus / reverseMapWorkStatus include In Review and Blocked).
- **Added** `components/sprints/ScheduleSprintModal.tsx` — sets sprint start/end dates with a single PATCH; defaults to today and +14 days; activates the sprint in the same call when invoked from "Start sprint".
- **Added** Start sprint + Schedule/Edit dates buttons on the `SprintBoardClient` header for `PLANNING` sprints. Clicking "Start sprint" without dates opens the schedule modal in `start` mode (transitions to ACTIVE on save); with dates already set it PATCHes `state: ACTIVE` directly.
- **Switched** `SprintBoardClient` task detail from drawer mode to centered `modal` mode — `features/sprints/components/SprintBoardClient.tsx`
- **Widened** sprint board column types (`BoardTodo.status`, `BoardColumn.id`/`status`, `mobileCol`) to `TodoStatus` so Stage 2's dynamic-lane rewrite drops in cleanly.
- **Tests:** `npx prisma validate` (pass), `npx tsc --noEmit` (pass), `npm run build` (pass — only pre-existing dynamic-render notices unrelated to this change).
- **Docs updated:** CHANGELOG_AI.md



---

## 2026-05-03 — AI Sprint Planning: Phases 1, 1.6, 2 (schema + math layer, no AI calls yet)

- **Added** `lib/ai/sprint-math.ts` — pure allocation math: `computeRemainingGap`, `computeWeeksLeft`, `computeSprintsLeft`, `computeLinearShare`, `computeVelocityFactor` (clamps [0.5, 1.5]), `computeWeightShares` (auto-equal when all weights 0), `computeTimeBudgets` (off-track +20%, on-track −10%, normalized), `computeNewTaskTarget`, `buildAllocations`, `isSprintDebt`. ES5-compatible (no for-of on Maps).
- **Added** `lib/ai/carryover.ts` — `selectIncomplete`, `classifyCandidate` with server-forced rules (KR_INACTIVE → DESCOPE, KR_TARGET_MET → DESCOPE, ASSIGNEE_INACTIVE → ESCALATE, REPEAT_CARRYOVER ≥ 2 → no plain KEEP), `isStaleDueDate`, `carryoverDeltaByKr`, `summarize`.
- **Added** `lib/ai/context-bundler.ts` — `buildContextBundle` supporting AUTO + MANUAL modes per spec §3.0. Privacy filter (admin/exec bypass), parents 1 hop up, prior 2 sprints, partitioned carryover candidates, MANUAL out-of-scope detection, AUTO-only cross-team off-track signal. Throws `InvalidScopeError` for permission/scope failures.
- **Added** `lib/ai/config.ts` — multi-provider support (`anthropic` / `openai` / `gemini`), `AI_PROVIDERS`, `getAiOrgConfig()`, `hasProviderKey()`, `availableProviders()`, per-provider model defaults.
- **Added** `lib/ai/cost.ts` — pricing tables for all three providers including cache-hit pricing, `inferProvider()` model-prefix matcher.
- **Added** `lib/ai/generation-log.ts` — `recordGenerationLog()` with provider field, `isDailyCapReached()` cross-provider counter.
- **Added** `lib/ai/providers/types.ts` + `lib/ai/providers/index.ts` — `AiProvider` interface, `ProviderNotConfiguredError`, `ProviderCallError`, `getProvider()` factory stub. Phase 3 will wire concrete Anthropic / OpenAI / Gemini implementations.
- **Added** `app/api/admin/ai-logs/route.ts` — paginated list with filters (feature/status/model/user/provider/date), ADMIN+EXECUTIVE gated, joins user data, computes cache-hit % per row.
- **Added** `app/dashboard/admin/ai-logs/page.tsx` + `features/admin-ai-logs/` — table view with 5-card aggregate strip (generations, cost, avg latency, cache hit %, error rate), provider badge column, provider/feature/status filters, pagination, empty/error states.
- **Added** `scripts/validate-ai-math.ts` — runnable smoke test (`npx tsx`) loading real DB data and asserting 12 invariants (no NaN, velocity factor in range, weightShare sums to 1.0, server-forced rules applied, MANUAL scope match). Verified passing locally.
- **Added** `docs/AI_SPRINT_PLANNING.md` — consolidated requirements doc with §3.0 user-driven initiation flow (Generate AI Sprint button + scope-selection modal with AUTO vs MANUAL cards), §3.0.1 OkrPicker (multi-select extension of ParentObjectiveSelector with KR-level checkboxes), §3.5 carryover triage (5 dispositions + server-forced rules), §3.6 admin observability surface, §4.1 multi-provider matrix (Anthropic / OpenAI / Gemini), §5 schema additions, §6 API surface, 49 acceptance criteria.
- **Added** `docs/REQUIREMENTS.md` — central requirements index with status legend and authoring conventions.
- **Modified** `prisma/schema.prisma` — `OrganizationSettings.aiSprintPlanningEnabled` (default false), `OrganizationSettings.aiPreferredProvider` (default "anthropic"), `Todo` carryover columns (`aiSuggested`, `ambitionLevel`, `originalSprintId`, `carryoverCount`, `lastCarriedAt`, `carryoverReplacedById`, `carryoverDisposition`), new `AiSprintPlan` model, new `AiGenerationLog` model with provider column. All additive / nullable / default-safe — `prisma db push` is sufficient on deploy, no preflight SQL needed.
- **Modified** `lib/dashboard-navigation.ts` — added "AI Logs" entry under People & Organization, gated behind page-level role check (ADMIN/EXECUTIVE).
- **Modified** `env.example` — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, optional model overrides per provider, `AI_DAILY_GENERATION_CAP`.
- **Modified** `docs/FEATURE_STATUS.md` — added `AI Sprint Planning` row (PLANNED) under Work Management.
- **Tests:** `npx tsc --noEmit` passes. `npx tsx scripts/validate-ai-math.ts` passes 12/12 invariants against local DB.
- **Docs updated:** `docs/AI_SPRINT_PLANNING.md`, `docs/REQUIREMENTS.md`, `docs/FEATURE_STATUS.md`, `docs/CHANGELOG_AI.md`.

## 2026-05-03 — AI Sprint Planning: feature spec + requirements index (no code)

- **Added** `docs/AI_SPRINT_PLANNING.md` — consolidated requirements for AI-generated bi-weekly sprint plans, including incomplete-todo carryover triage (KEEP / SPLIT / RESCHEDULE / DESCOPE / ESCALATE), allocation math that nets carryover against new-task targets, server-forced disposition rules (archived KR → DESCOPE, target-met KR → DESCOPE, repeat carryover ≥ 2 → no plain KEEP), schema additions (`AiSprintPlan`, `AiGenerationLog`, `Todo` carryover columns, `OrganizationSettings.aiSprintPlanningEnabled`), API surface under `app/api/sprints/ai/`, RBAC matrix, UI touchpoints, NFRs, and 28 acceptance criteria (14 core + 14 carryover).
- **Added** `docs/REQUIREMENTS.md` — central index of all feature spec docs, with status legend (DRAFT / APPROVED / IN PROGRESS / SHIPPED / DEFERRED / REJECTED), authoring conventions for future specs, and an active-requirements table seeded with the AI Sprint Planning entry.
- **Modified** `docs/FEATURE_STATUS.md` — added `AI Sprint Planning` row under Work Management, status `PLANNED`, pointing at the spec.
- **Tests:** not run — spec only, no code changed.
- **Docs updated:** `docs/AI_SPRINT_PLANNING.md` (new), `docs/REQUIREMENTS.md` (new), `docs/FEATURE_STATUS.md`.

## 2026-04-28 — Reports/dashboards Phase 2: employee super-dashboard

- **Added** `features/reports/components/EmployeeSuperDashboard.tsx` — purpose-built employee experience: Today strip (due today / KRs needing check-in / streak), radial gauges per owned KR with log-check-in CTA, personal velocity sparkline (8 weeks), alignment strip (me → parent → … → root), in-progress kanban preview that opens `TodoCardModal` via `useInitiativeDetailStore`, 12-week SVG streak heatmap, 14-day upcoming agenda, and recommendations.
- **Modified** `lib/dashboards/payload.ts` — `me` scope now also returns `personal.{ completionDates, checkinDates, alignmentChains }` derived from `Todo.completedAt`, `KeyResultCheckIn.createdAt`, and a bounded parent-objective chain walker (max 5 hops). CEO scope returns empty arrays.
- **Modified** `components/reports/ReportDashboardClient.tsx` — accepts a new `personal` prop and renders `EmployeeSuperDashboard` when `mode === 'employee'`; CEO mode unchanged.
- **Modified** `app/dashboard/reports/page.tsx` — threads `payload.personal` to the client.
- **Added** `features/reports/index.ts` barrel export per CLAUDE.md feature-module rule.
- **Modified** `docs/REPORTS.md` — Phase 2 marked shipped.
- **Tests:** `npx tsc --noEmit` passes. UI not exercised end-to-end.

## 2026-04-28 — Reports/dashboards Phase 1: shared primitives, API routes, CEO gate, sparklines

- **Added** `components/ui/dashboard/` barrel — `DashboardCard`, `InsightTile`, `KpiCard`, `MiniBadge`, `Sparkline` (new). Promoted from local definitions in `ReportDashboardClient.tsx` so `/dashboard` and other surfaces can reuse the same primitives. `Sparkline` is a 28px-tall Recharts area chart with no axes.
- **Added** `lib/dashboards/payload.ts` — single shared loader returning denormalized objectives/KRs/todos + filter dictionaries for either `'ceo'` or `'me'` scope. Used by the page (SSR) and both API routes.
- **Added** `app/api/dashboards/ceo/route.ts` (gated to ADMIN + EXECUTIVE — returns 403 otherwise) and `app/api/dashboards/me/route.ts` (any authenticated user). Both reuse `loadDashboardPayload`.
- **Modified** `app/dashboard/reports/page.tsx` — replaced inline Prisma query with `loadDashboardPayload`. Server renders the right scope based on session role.
- **Modified** `components/reports/ReportDashboardClient.tsx` — hid the CEO segment for non-admin/exec users (matches the API gate). Replaced four inline UI primitives with the shared `@/components/ui/dashboard` exports. Wired sparklines into the four hero `InsightTile`s, derived from `planRows` and `departmentRows` (real shape, not synthetic).
- **Added** `docs/REPORTS.md` — architecture reference: surfaces, data flow, permission matrix, roadmap (Phase 2 employee upgrade, Phase 3 CEO advanced widgets), where-to-look index.
- **Tests:** `npx tsc --noEmit` passes. UI not exercised end-to-end.

## 2026-04-28 — Initiative card modal redesign + Link OKR picker

- **Redesigned** `components/todos/TodoCardModal.tsx` — bigger 26px hero title with hover-affordance, pill-style status / priority controls (`StatusPill`, `PriorityPill`) using the design tokens, refreshed `DueDateBadge` (rounded-full), grouped member avatars + "+ add" affordance, taller cover gradient, refined right rail with bordered card-style action buttons, tonal Mark-done / Delete-card buttons, and modal width bumped to 860px.
- **Added** `LinkedOkrCard` inside the modal — always-visible card showing the linked objective/KR or inviting the user to link one. Embeds a debounced search picker (uses `/api/search`) that lists Key results and Objectives with progress %, plus an "Open" affordance and an "Unlink" control.
- **Modified** `app/api/todos/[id]/route.ts` — PATCH now accepts `keyResultId` / `objectiveId` (nullable) so the modal can re-link initiatives. Validates targets, recalculates KR aggregates and objective ancestors on both old and new KR sides of a move, and writes activity log entries (`INITIATIVE_KR_LINK_CHANGED`, `INITIATIVE_OBJECTIVE_LINK_CHANGED`).
- **Modified** `lib/activity-log.ts` — extended `ActivityAction` with the two new link-change actions.
- **Tests:** `npx tsc --noEmit` passes; UI not exercised in a browser this session.

## 2026-04-28 — Action-driving email templates + token-consistent in-app notifications

- **Added** `lib/email/templates/components.ts` — shared building blocks (`button`, `kpiRow`, `metaRow`, `progressBar`, `alert`, `badge`, `heading`, `lead`, `muted`, `actionRow`, `divider`) using design tokens. Centralizes the visual language so every event email looks the same.
- **Rewrote** `lib/email/templates/index.ts` — every event (account, objective, KR, check-in, todo, sprint, timeframe, alignment, comment, admin) now renders with: tokenised heading + status badge → contextual KPIs / metadata / progress bar → primary CTA button (tone matches urgency: warning for at-risk, danger for overdue/escalations, success for completions) → secondary action links (snooze, manage, drill-down). Plain-text fallbacks updated in parallel.
- **Modified** `lib/email/templates/invitation.ts` — swapped legacy palette (`#2563eb`/`#0f172a`/`#64748b`) for design tokens (`#007AFF`/`#1D1D1F`/`#8E8E93`/`#F2F2F7`/`#E5E5EA`) so the welcome email matches the in-app surface.
- **Modified** `app/dashboard/notifications/page.tsx` + `NotificationsClient.tsx` — derive a deep link from `notification.metadata` and wrap the row in a `<Link>` so the in-app inbox is itself action-driving. Added a chevron affordance on linked rows.
- **Tests:** `npx tsc --noEmit` passes; not exercised end-to-end (no email sandbox).

## 2026-04-28 — Notification consolidation + design-token email digests

- **Added** `docs/NOTIFICATIONS.md` — single-source matrix of every event's cadence, recipients, redaction, RBAC, plus optimization recommendations
- **Added** `lib/email/templates/digest.ts` — Apple-style bundled digest template grouped by category, using the system design tokens (`#F2F2F7`/`#FFFFFF`/`#007AFF`/`#1D1D1F`/`#8E8E93`/`#E5E5EA`)
- **Modified** `lib/email/templates/index.ts` — `wrapHtml()` upgraded to design tokens so all per-event emails share consistent branding; exported for digest reuse
- **Modified** `lib/notifications/dispatcher.ts` — added `FORCE_DIGEST_EVENTS` (CHECKIN_MISSED_7D/14D, CHECKIN_WEEKLY_DUE, TODO_DUE_TOMORROW/TODAY, TODO_OVERDUE) which override the recipient's pref to DAILY, ending one-email-per-day-per-overdue-item floods. Also added per-day idempotency via `findFirst` on userId+eventKey+entityId before queue insert
- **Modified** `lib/notifications/jobs.ts` — `runDigestDrain` now delegates HTML/text rendering to `renderDigest`; removed inline hand-built HTML
- **Tests:** `npx tsc --noEmit` passes; not exercised end-to-end (no email sandbox in this session)
- **Docs updated:** `docs/NOTIFICATIONS.md` (status of recommendations 1-3 marked implemented)

---

## 2026-04-24 — Trello-style Todo/Initiative card system + Work Board

### Schema (prisma/schema.prisma + prisma db push)
- Added `priority` (LOW/MEDIUM/HIGH/URGENT) and `coverColor` fields to `Todo`
- New models: `TodoMember` (multi-assignee), `TodoLabelDef` + `TodoLabel` (coloured labels), `TodoChecklist` + `TodoChecklistItem` (checklists with per-item assignee/due date), `TodoAttachment` (file uploads with image preview), `TodoComment` (WYSIWYG threaded comments with @mention support)

### API routes
- **Modified** `app/api/todos/[id]/route.ts` — GET now returns full card data (members, labels, checklists, attachments); PATCH accepts `assigneeId`, `priority`, `coverColor`, `memberIds`, `labelIds`; emits `TODO_ASSIGNED` notification on reassign
- **Added** `app/api/todos/[id]/comments/route.ts` — GET/POST threaded comments; POST extracts `data-mention-id` @mentions, emits notification + sends email to each mentioned user
- **Added** `app/api/todos/[id]/comments/[commentId]/route.ts` — PATCH/DELETE
- **Added** `app/api/todos/[id]/checklists/route.ts` — GET/POST checklist groups
- **Added** `app/api/todos/[id]/checklists/[checklistId]/route.ts` — PATCH/DELETE
- **Added** `app/api/todos/[id]/checklists/[checklistId]/items/route.ts` — POST items
- **Added** `app/api/todos/[id]/checklists/[checklistId]/items/[itemId]/route.ts` — PATCH/DELETE
- **Added** `app/api/todos/[id]/attachments/route.ts` — POST multipart upload (20 MB limit, saved to public/uploads/todos)
- **Added** `app/api/todos/[id]/attachments/[attachmentId]/route.ts` — DELETE
- **Added** `app/api/todo-labels/route.ts` — GET/POST global label palette
- **Added** `app/api/todo-labels/[id]/route.ts` — PATCH/DELETE

### Components
- **Added** `components/todos/MentionEditor.tsx` — Tiptap WYSIWYG with @mention dropdown (portal, keyboard nav), bold/italic/code/lists toolbar
- **Added** `components/todos/TodoCardModal.tsx` — Full Trello-style card modal: cover strip, multi-member avatars, coloured labels, priority/status selectors, due date, description (WYSIWYG), checklists with per-item toggle/assignee, attachment grid with image previews, WYSIWYG comment thread with @mention, right sidebar (Members/Labels/Checklist/Due Date/Attachment/Cover/Actions)
- **Added** `components/todos/TodoCard.tsx` — Kanban card chip: cover, label dots, title, due date badge, checklist progress, attachment count, member avatars, drag-and-drop props
- **Modified** `components/shared/GlobalInitiativeDetail.tsx` — Replaced `TodoDetailPanel` with `TodoCardModal`; all existing `open(id)` call sites work unchanged
- **Modified** `components/todos-page/TodosPageClient.tsx` — Replaced `TodoDetailPanel` with `TodoCardModal`; imported `fetchTodos` from store
- **Added** `components/work/WorkBoardClient.tsx` — Global permission-filtered Kanban board (4 columns: To Do/In Progress/Done/Cancelled), drag-and-drop status change, inline card creation, search + member + label filters, opens `TodoCardModal`

### Pages & Nav
- **Added** `app/dashboard/work/page.tsx` — Server component; loads todos filtered by permission (ADMIN/EXEC see all, others see assigned/created/member), users, label defs
- **Modified** `lib/dashboard-navigation.ts` — Added "Work Board" nav item under My Work
- **Modified** `components/layout/DashboardShell.tsx` — `/dashboard/work` added to full-width routes
- **Modified** `lib/stores/todo-store.ts` — `fetchTodos` destructured in `TodosPageClient`

### Packages
- `@tiptap/extension-mention` installed for @mention support

- **Tests:** `npx tsc --noEmit` — clean (0 errors)
- **Docs updated:** CHANGELOG_AI.md

---

## 2026-04-24 — Apple Pro theme wired app-wide

- **Modified** `app/layout.tsx` — `<body>` now carries `apple-pro-surface theme-apple-full` so Apple Pro tokens apply globally (page bg `#F2F2F7`, body type 13px / -0.01em / ss01, SF-system font stack).
- **Modified** `components/layout/Sidebar.tsx` — desktop `<aside>` switched to `ap-glass`, widths pinned to Apple Pro spec (`220px` expanded, `52px` collapsed), right border uses `--ap-border`.
- **Modified** `components/layout/Header.tsx` — topbar now `ap-glass sticky top-0 z-20`, height trimmed to `48px` (h-12), bottom border uses `--ap-border`.
- **Tests:** not run.
- **Docs updated:** CHANGELOG_AI.md

---

## 2026-04-24 — Apple Pro design tokens + theme scope

- **Modified** `app/globals.css` — appended Apple Pro theme layer scoped under `.apple-pro-surface` / `.theme-apple-full` (coexists with existing `.notion-surface` / `.atlas-surface` scopes; does not touch the base `:root` tokens or any existing component). Adds full iOS/macOS token set (bg/fg/accent/status/radii/shadows), `.ap-glass`, `.ap-card`, `.ap-btn` variants, `.ap-segmented`, `.ap-switch`, `.ap-input`, `.ap-status-pill`, `.ap-status-dot` (with pulse), `.ap-progress`, `.ap-kbd`, `.ap-modal`, plus sidebar active-nav override and dark-mode nesting under `.dark`.
- **Added** `lib/design/apple-pro-tokens.ts` — TS export of the same tokens for JS consumers (charts, framer-motion, canvas).
- **Tests:** not run (CSS-only addition + new tokens file with no imports yet).
- **Docs updated:** CHANGELOG_AI.md

---

## 2026-04-22 — Gantt fills viewport on /dashboard/plans

- **Modified** `components/layout/DashboardShell.tsx` — added `/dashboard/plans` to the `isFullWidth` route set so the shell no longer caps the page at `max-w-content`. This lets the Gantt stretch to the full width of the main column.
- **Modified** `components/plans/PlansList.tsx` — outer wrapper now drops the `max-w-[1280px]` cap when `view === 'gantt'` (list view keeps the 1280px cap so the table layout is unchanged).
- **Modified** `components/plans/PlansGantt.tsx` — Gantt inner container height switched from fixed `640px` to `calc(100vh - 220px)` with `minHeight: 520px`. 220px approximates the header + tabs + filter row + card toolbar stack above it; DHTMLX handles window resize internally, so it re-flows on viewport changes without extra wiring.
- **Tests:** `npx tsc --noEmit` clean. Not verified in browser.
- **Docs updated:** CHANGELOG_AI.md

---

## 2026-04-22 — Fix Gantt crash on /dashboard/plans (`getGanttInstance is not a function`)

- **Modified** `components/plans/PlansGantt.tsx` — replaced `gantt.getGanttInstance()` with the singleton `gantt`. `getGanttInstance` only exists on `GanttEnterprise` (the commercial build); the GPL `dhtmlx-gantt` package exports `gantt` as a `GanttStatic` singleton, so the enterprise factory call threw at runtime in production (`c.E.getGanttInstance is not a function`). Only one Gantt is mounted on this page, so the singleton is fine; cleanup already detaches the click handler, deletes the today marker, and calls `clearAll()`.
- **Tests:** `npx tsc --noEmit` — four pre-existing column-template signature errors remain (unrelated to this change); no new errors. Not verified in browser.
- **Docs updated:** CHANGELOG_AI.md

---

## 2026-04-20 — Plans page: DHTMLX Gantt view + fix broken list table

- **Added** `app/api/gantt/route.ts` — new auth-scoped endpoint returning `{ data: GanttTask[], links: GanttLink[] }` for DHTMLX. Objectives render as `type:'project'` parents; active KRs nest as `type:'task'` children inheriting the objective's start/end (falling back to timeframe dates). `parentObjectiveId` becomes a dependency link between objective bars. Role scoping mirrors `/api/objectives` (EMPLOYEE sees own; DEPARTMENT_LEAD sees own + team; ADMIN/EXECUTIVE see all).
- **Added** `components/plans/PlansGantt.tsx` — client component that mounts DHTMLX Gantt with custom columns (Objective/KR title with level badge, Assignee avatar+name, Status/Confidence pill, Progress% with KR current/target/unit). Adds zoom toolbar (Week / Month / Quarter / Year), legend, today marker, and tooltip with full context. Clicking a bar routes to `/dashboard/objectives/[id]` or `/dashboard/key-results/[id]`. Loaded via `next/dynamic` with `ssr:false` since DHTMLX touches `window`.
- **Modified** `components/plans/PlansList.tsx` — added List/Gantt view toggle in header; fixed broken `<table>` `className` that had tab-button classes glued onto it (caused broken layout on production `/dashboard/plans`); replaced with `w-full text-sm`.
- **Installed** `dhtmlx-gantt@^9` via npm.
- **Tests:** `npx tsc --noEmit` passed clean; did not hit the browser (no dev server run in this session).
- **Docs updated:** CHANGELOG_AI.md, FEATURE_STATUS.md, COMPONENT_CATALOG.md

---

## 2026-04-18 — Goals/My-OKRs page: compact list rows, single filter toolbar, fix overflow

- **Modified** `features/objectives/components/NestedObjectivesList.tsx` — removed duplicate inner filter bar entirely; replaced bulky p-6 cards with compact single-row layout (chevron + level badge + truncated title + meta pills + inline progress bar + % + actions menu on hover); fixed broken progress bar color (was using text→bg class conversion); fixed text overflow via truncate + title attr; removed unused imports
- **Modified** `components/dashboard/MyOKRsPage.tsx` — removed 4 stat cards (duplicate of dashboard); replaced two-section filter area with a single compact flex toolbar (search + level select + timeframe select + count + create button); shortened loading/empty states
- **Fixed** `.github/workflows/deploy.yml` — changed CI DATABASE_URL from `file:./dev.db` to `postgresql://ci:ci@localhost:5432/ci_placeholder` to satisfy Prisma's postgresql:// URL validation at build time (was breaking every CI run)
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md

---

## 2026-04-18 — Dashboard redesign: 3-col hero, 50/50 grids, social activity feeds

- **Modified** `components/dashboard/HeroStats.tsx` — expanded to 3-column layout: Your Performance · Confidence Tracker · Momentum (inline mini LineChart from ConfidenceSnapshots); removed dependency on ProgressOverview
- **Created** `components/dashboard/TeamActivityFeed.tsx` — social media-style feed showing actor avatar/initials, entity name+link, action label, relative time, and progress % pill; pulls from ActivityLog across all users
- **Created** `components/dashboard/MyActivityFeed.tsx` — same feed shape scoped to current user's activity
- **Modified** `app/dashboard/page.tsx` — row 1: HeroStats (3-col); row 2: UserOkrTree (50%) + NeedsAttention (50%); row 3: TeamActivityFeed (50%) + MyActivityFeed (50%); removed SprintWidget/ProgressOverview from layout; added getTeamActivity/getMyActivity fetchers; Momentum data wired from ConfidenceSnapshot history
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md, FEATURE_STATUS.md

---

## 2026-04-18 — Auto-confidence on check-in + FY2026 date fix migration

Confidence is now computed automatically from time-elapsed vs progress gap at check-in time instead of using the user-supplied value. Date migration script aligns all timeframes to Sep 2025 – Jul 30, 2026.

- **Modified** `app/api/keyresults/[id]/check-ins/route.ts` — POST now calls `computeKrConfidence()` after saving the check-in; computed `autoConfidence` replaces user-supplied value for KR update, snapshot upsert, and objective rollup
- **Modified** `app/api/keyresults/[id]/check-ins/route.ts` — expanded objective include to fetch `startDate`, `endDate`, `timeframe` (needed for confidence calc)
- **Created** `prisma/fix-dates-fy2026.ts` — idempotent migration that sets all Timeframe start/end to FY Sep 2025 – Jul 30, 2026, corrects out-of-range Objective dates, then re-runs full confidence calculation
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md, FEATURE_STATUS.md

---

## 2026-04-17 — shadcn/ui pilot: settings profile page + Card/Badge/Separator/Button primitives

Side-by-side shadcn pilot on the settings profile page. No existing components were modified or removed — all new primitives coexist alongside the existing Modal/StatCard/EmptyState/ConfirmDialog set.

- **Added** `components/ui/card.tsx` (shadcn `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`, `CardAction`, `CardDescription`)
- **Added** `components/ui/badge.tsx` (shadcn `Badge` with variant props)
- **Added** `components/ui/separator.tsx` (shadcn `Separator`)
- **Rebuilt** `app/dashboard/settings/profile/page.tsx` using shadcn `Card`, `Badge`, `Separator`, `Button`. Replaced hardcoded `bg-white shadow rounded-lg` / `bg-green-100 text-green-800` with shadcn primitives and semantic tokens (`text-muted-foreground`, `bg-card`). Also parallelized the 3 sequential Prisma queries into `Promise.all`. Added Lucide icons for section headers.
- **Updated** `app/dashboard/settings/layout.tsx` — swapped `text-gray-500` to `text-muted-foreground` for token consistency.
- **Updated** `components/ui/index.ts` — added barrel exports for all new shadcn primitives.
- **Tests:** typecheck passed (0 new errors; 18 pre-existing errors unrelated to this change).

---

## 2026-04-16 — Block-list guard in `sendMail` + email audit script

Admin was still receiving bounce notices (`engineer1@company.com`, etc.) even after the earlier cleanup/purge scripts were added. Root cause analysis revealed three seed scripts, not one, create fake users — `prisma/seed.ts` (admin/engineer1/marketer1), `prisma/seed-test-data.ts` (10 `*@company.com` users), and `prisma/seed-360ground-fy2026.ts` (role-placeholder `@360ground.com` addresses like `finance@`, `hr@`, `pm.lead@`, `delivery@`, `all.ses@`, `wessagn@`, `kalkidan@`). Plus `prisma/migrate-consolidate-biruk.ts` references `biruk.hailu@360ground.et`. Earlier scripts only matched `*@company.com`.

- **Added** `lib/email.ts` block-list. `sendMail()` now refuses SMTP handoff for any recipient on the known-fake list (both `@company.com` domain and explicit role-placeholder 360ground addresses). Blocked sends persist to `outbound_emails` with `status='FAILED'` and a clear error so the audit trail stays intact but nothing leaves the server. This is belt-and-braces: even if a seed/import script ever repopulates the DB with fakes, no bounces can reach the admin inbox.
- **Added** `scripts/email-audit.ts` — read-only diagnostic. Reports every outbound email in a rolling window (default 48h) grouped by recipient + status, lists any suspect users still present in the DB, counts pending digest queue rows, and all-time sends to suspect addresses. Use to prove/disprove "the app is still sending" before reporting to the client.
- **Tests:** not run.

---

## 2026-04-16 — Hard-delete all fake users (seed + role-placeholder) → admin

Superset of the earlier narrower purge. Biruk confirmed the role-placeholder `@360ground.com` addresses from `prisma/seed-360ground-fy2026.ts` are not real mailboxes either. All 17+ fake users are now in scope for hard deletion; `unassigned@360ground.com` remains as the import-pipeline placeholder per product decision.

- **Added** `scripts/purge-fake-users.ts` — dry-run by default, `--commit` to apply. Supersedes the earlier `purge-company-com-users.ts` (removed). Preflights that `admin@360ground.com` exists and is active; also asserts the admin isn't somehow on the victim list. In one transaction: reassigns every `Objective.ownerId`, `KeyResult.ownerId`, `Todo.assigneeId`/`creatorId`, `Sprint.ownerId`, `SprintActivity.ownerId`, and `Comment.authorId` from the fake users to admin, then `deleteMany`s the users. Cascade/SetNull FKs (notifications, watchers, prefs, check-ins they authored, activity log actor refs, etc.) fall out automatically from the User delete. Match list: `*@company.com` plus explicit addresses `delivery@`, `all.ses@`, `finance@`, `hr@`, `wessagn@`, `pm.lead@`, `kalkidan@` (all `@360ground.com`) and `biruk.hailu@360ground.et`.
- **Removed** `scripts/purge-company-com-users.ts` — replaced by the broader `purge-fake-users.ts`.
- **Tests:** not run — DB-touching script; dry-run output first.

---

## 2026-04-16 — Stop bounce emails to bogus seeded users

Bounce reports were coming from `liam@company.com` (and nine other `*@company.com` seed users) and `unassigned@360ground.com`. Root cause: those users were seeded into the production DB (by `prisma/seed-test-data.ts` and `scripts/import-360ground-okrs.js`) with `isActive: true`, so every cron path (weekly digest, digest drain, todo reminders, check-in escalation, timeframe watcher) resolved them as recipients and dispatched mail to the fake addresses. Recipient routing itself was correct — each user's stored `email` was being sent to faithfully.

- **Added** `scripts/cleanup-bogus-email-users.ts` — dry-run by default, `--commit` to apply. Deactivates `*@company.com` + `unassigned@360ground.com` users, drains their pending `EmailDigestQueue` rows, and cancels any `PENDING` `OutboundEmail` rows addressed to them. Deactivation (not deletion) because these rows own real entities with restrict-on-delete FKs.
- **Fixed** `lib/notifications/dispatcher.ts` — the recipient user lookup now filters `isActive: true`. Previously, when an inactive user was reached via `resolveOwnersOfObjective` / `resolveManagersOf` (which don't check active), they still received email. Belt-and-braces so future seed/import leaks can't resurrect the same bug.
- **Tests:** not run — DB-touching script; will be dry-run in prod first.
- **Docs updated:** CHANGELOG_AI.md only (no feature/sitemap/component changes).

---

## 2026-04-14 — Global RBAC + notification matrix implementation

Implemented the full RBAC matrix and email notification matrix from `docs/User_Permissions.md`. Additive-only schema changes; domain mutations now fire canonical events through a single dispatcher.

### Schema (additive, safe `prisma db push`)

- `Notification` — added `eventKey`, `category`, `redacted`, `emailMode`, `emailSent`, `emailAt`, `outboundEmailId`; added composite indexes.
- `NotificationPreference` — new; per-user per-category in-app/email/cadence toggle.
- `OrgNotificationDefault` — new; admin-set org defaults (fallback when user has no row).
- `Watcher` — new; opt-in watchers on `OBJECTIVE`/`KEY_RESULT`/`TODO`.
- `EmailDigestQueue` — new; pending rows drained by daily/weekly/monthly cron.

### New modules

- `lib/rbac.ts` — single `can(action, resource, actor)` API wrapping `lib/permissions.ts`; covers 40+ actions across users, departments, objectives, KRs, todos, timeframes, settings, watchers, comments.
- `lib/notifications/events.ts` — canonical `EventKey` registry (40 events, 9 categories, default cadence per event).
- `lib/notifications/redact.ts` — `isPrivate`-aware title/data redaction.
- `lib/notifications/preferences.ts` — `getUserPref` / `getUserPrefsBulk` / `ensureOrgDefaults`.
- `lib/notifications/recipients.ts` — recipient resolvers (owners, managers, parent-owner, watchers, admins, team).
- `lib/notifications/dispatcher.ts` — `emit(event, payload)` fan-out: writes in-app `Notification` rows, sends IMMEDIATE emails or enqueues to `EmailDigestQueue`.
- `lib/notifications/jobs.ts` — cron jobs: digest drain (daily/weekly/monthly), check-in escalation (7d/14d), todo reminders (due-tomorrow + overdue), timeframe watcher, admin weekly health, admin monthly exec summary.
- `lib/email/templates/index.ts` — `renderTemplate(eventKey, data) → { subject, text, html }` for every event.

### API routes (new)

- `app/api/notifications/preferences/route.ts` — GET / PATCH current user's prefs.
- `app/api/settings/notification-defaults/route.ts` — GET / PATCH org defaults (Admin only).
- `app/api/watchers/route.ts` — GET / POST / DELETE watcher opt-in.
- `app/api/cron/notifications/route.ts` — unified cron entrypoint (`?job=daily|weekly|monthly|escalation|todos|timeframes|admin-weekly|admin-monthly`).

### Dispatcher wiring (existing mutations)

- `app/api/objectives/route.ts` (POST) — `OBJECTIVE_ASSIGNED`, `OBJECTIVE_CREATED_IN_TEAM`, `OBJECTIVE_ALIGNED_CHILD_ADDED`.
- `app/api/objectives/[id]/archive/route.ts` — `OBJECTIVE_ARCHIVED` + `PARENT_OBJECTIVE_ARCHIVED_ORPHAN` for children.
- `app/api/keyresults/route.ts` (POST) — `KR_ASSIGNED`, `KR_ADDED_TO_OBJECTIVE`.
- `app/api/keyresults/[id]/archive/route.ts` — `KR_ARCHIVED`.
- `app/api/keyresults/[id]/check-ins/route.ts` — `KR_PROGRESS_UPDATED`, `KR_AT_RISK` (on transition), `KR_COMPLETED` (≥100%).
- `app/api/todos/route.ts` (POST) — `TODO_ASSIGNED` (when assignee ≠ actor).
- `app/api/todos/[id]/route.ts` (PATCH) — `TODO_COMPLETED` on status transition.
- `app/api/users/route.ts` (POST) — `ADMIN_USER_CREATED` (invite email unchanged).
- `app/api/timeframes/route.ts` (POST) — `TIMEFRAME_OPENED`.
- `app/api/objectives/[id]/comments/route.ts` & `app/api/keyresults/[id]/comments/route.ts` — `USER_MENTIONED`, `COMMENT_ON_OWNED_ENTITY`.

### UI

- `app/dashboard/settings/notifications/page.tsx` — per-category in-app/email/cadence grid wired to the preferences API.
- `app/dashboard/settings/notification-defaults/page.tsx` — Admin-only org defaults editor.
- `components/settings/SettingsNav.tsx` — new "Notification defaults" admin entry.

### Ops

- `deploy/notifications-crontab.example` — documented cron schedule (curl-driven, protected by `CRON_SECRET`).

### Tests

- **Tests:** not run (no existing test suite for affected paths).
- **Typecheck:** `npx tsc --noEmit` — 0 errors.
- **Schema:** `npx prisma validate` + `prisma generate` — pass. **Not yet `db push`ed** — run `scripts/deploy.sh` (or `prisma db push`) on production to apply the additive migration.

### Docs updated

- `docs/CHANGELOG_AI.md` (this entry)
- `docs/FEATURE_STATUS.md` (notifications + RBAC status)

---

## 2026-04-13 — Final Pass: Sprint API + Modal Extension + Phase 5 Physical Migration

### Sprint API route migration (11 route files, ~25 handlers)

All sprint routes migrated to `withAuth` + standard `{data}` envelope. Response shapes changed from per-entity keys (`sprint`, `column`, `activity`, `comment`, `task`, `initiative`) to standard `data`.

- `/api/sprints` GET+POST
- `/api/sprints/[id]` GET+PATCH+DELETE
- `/api/sprints/[id]/columns` POST
- `/api/sprints/[id]/columns/[colId]` PATCH+DELETE
- `/api/sprints/[id]/activities` POST
- `/api/sprints/[id]/activities/[actId]` PATCH+DELETE
- `/api/sprints/[id]/activities/[actId]/comments` GET+POST
- `/api/sprints/[id]/activities/[actId]/comments/[commentId]` PATCH+DELETE
- `/api/sprints/[id]/activities/[actId]/tasks` GET+POST
- `/api/sprints/[id]/activities/[actId]/tasks/[taskId]` PATCH+DELETE
- `/api/sprints/[id]/activities/[actId]/convert-to-initiative` POST

**Consumer updates** (3 files, 10 sites): `SprintBoardClient.tsx` (4 sites), `SprintCardModal.tsx` (6 sites), `SprintsListClient.tsx` (1 site).

### Modal scroll extension + CreateCheckInModal migration

- **Extended** `components/ui/Modal.tsx` with `scrollBehavior` prop (`'outside' | 'internal'`) and `stickyHeader` flag. In `internal` mode: card is capped at `max-h-[95vh]`, body scrolls inside the card, header/footer remain pinned.
- **Migrated** `CreateCheckInModal` (last modal in the original list) to use `<Modal size="2xl" scrollBehavior="internal" stickyHeader>`. Removed ~15 lines of custom overlay/sticky-header markup.

### Phase 5 — Physical feature file migration (full completion)

Moved all 5 feature directories from `components/[feature]/` to `features/[feature]/components/` and updated every consumer to import from `@/features/*` barrels.

| Feature | Files moved | External consumers updated |
|---|---|---|
| objectives | 18 | 7 (CreateGoalModal, MyOKRsPage, 5 app pages) |
| key-results | 16 | 3 (GoalsTable, objectives/[id]/page, key-results/[id]/page) |
| todos | 11 | 1 (my-tasks/page) |
| goals | 9 | 1 (goals/page) |
| sprints | 3 | 2 (sprints/page, sprints/[id]/page) |

**Cross-feature imports fixed:** `KeyResultDetailClient` and `KeyResultsList` had relative imports (`../todos/ToDoList`). Converted to `@/features/todos` barrel imports per convention.

**Barrels updated:** Each `features/[name]/index.ts` now re-exports from `./components/` (local) rather than `@/components/[feature]/`. Zero external consumer changes required — the barrel path is the stable contract.

**Empty dirs removed:** `components/{objectives,keyresults,todos,goals,sprints}`.

**Still under `components/`** (intentional — not feature-scoped): `ui/`, `layout/`, `shared/`, `dashboard/`, `hierarchy/`, `initiative-report/`, `plans/`, `profile/`, `reports/`, `settings/`, `todos-page/`, `CrashReporter.tsx`.

**Tests:** TypeScript check passed throughout (`npx tsc --noEmit -p tsconfig.json` — no errors in OKR-frontend code; pre-existing `lib/email.ts` nodemailer-type and `project-scaffold/` errors ignored).
**Docs updated:** `docs/CHANGELOG_AI.md`, `docs/CONVENTIONS.md`, `docs/COMPONENT_CATALOG.md`, `docs/FEATURE_STATUS.md`, `docs/AI_CONTEXT.md`.

**Phase 6 running total:** 42 of ~43 routes migrated. Only `/api/cron/*` (custom CRON_SECRET bearer auth) and `/api/health` (public, trivial) intentionally deferred.

**Cumulative across all phases (including this session):** ~6,500+ lines eliminated, ~800 lines of shared primitives/hooks/helpers/feature barrels introduced.

## 2026-04-13 — Omnibus Refactor (Items 1–5)

Worked through all 5 remaining backlog items in one pass.

### Item 1 — ArchiveObjectiveButton ↦ ConfirmDialog
- **Refactored** `components/objectives/ArchiveObjectiveButton.tsx` — replaced inline `window.confirm()` with shared `ConfirmDialog` (warning variant, title + description + details panel). 74 → 79 lines (logic unchanged; UX significantly improved).

### Item 2 — Phase E: Company + Department OKR page consolidation
- **Created** `components/objectives/OKRLevelView.tsx` — shared server component that handles stats, filtering, and list rendering for both levels. Takes `level: 'COMPANY' | 'DEPARTMENT'` prop.
- **Refactored** `app/dashboard/company-okrs/page.tsx` (74 → 20 lines, -73%).
- **Refactored** `app/dashboard/department-okrs/page.tsx` (94 → 22 lines, -77%).
- **Net:** 168 lines of duplicated page code → 42 lines + 109-line shared view.

### Item 3 — Reference-data hook adoption (5 consumers)
- **Refactored** `components/keyresults/KeyResultsList.tsx` — replaced inline `fetch('/api/users/for-selection')` with `useUsersForSelection` hook.
- **Refactored** `components/goals/GoalsListView.tsx` — same.
- **Refactored** `components/dashboard/MyOKRsPage.tsx` — swapped 3 inline fetches for `useTimeframes` + `useDepartments`; kept `/api/users/me/departments` inline (user-scoped, no shared hook).
- **Refactored** `components/settings/TeamsManagement.tsx` — swapped inline department fetches for `useDepartments` + `refetch` on mutations. Shared cache now invalidates across MyOKRsPage / goal modals on team changes.
- **Refactored** `components/goals/GoalsFilterBar.tsx` — swapped `/api/timeframes` fetch for `useTimeframes`. Labels stay inline (no hook yet).

### Item 4 — Bulk API route migration (18 additional routes)

**Users (4):**
- `/api/users` GET+POST — `withRole('ADMIN')`, envelope change (`{users}`/`{user}` → `{data}`). Consumer `UserManagement.tsx` updated at 3 sites.
- `/api/users/[id]` GET+PATCH+DELETE — `withRole('ADMIN')`, envelope change.
- `/api/users/me/departments` GET — `withAuth`.
- `/api/users/me/direct-reports` GET — `withAuth`.
- `/api/users/[id]/reset-password` POST — `withRole('ADMIN')`.

**Key Results sub-routes (5):**
- `/api/keyresults/[id]/archive` POST — `withAuth`, envelope change (flattens `newObjectiveProgress` into `data`).
- `/api/keyresults/[id]/unarchive` POST — same.
- `/api/keyresults/[id]/clone` POST — envelope change (`{keyResult}` → `{data}`).
- `/api/keyresults/[id]/todos` GET+POST — envelope change (`{todos}`/`{todo}` → `{data}`). Consumers `ToDoList.tsx` (2 sites) and `CreateCheckInModal.tsx` updated.
- `/api/keyresults/[id]/check-ins` GET+POST — envelope change (`{checkIns}` → `{data}`; POST now returns `{data: {checkIn, keyResult}}`).
- `/api/keyresults/[id]/activity` GET — `{logs, views}` → `{data: {logs, views}}`. Consumer `ActivityLogPanel.tsx` updated with envelope-aware read.
- `/api/keyresults/[id]/views` POST — `withAuth`.

**Objectives sub-routes (6):**
- `/api/objectives/[id]/clone` POST — envelope change (`{objective}` → `{data}`). Consumer `CloneObjectiveModal.tsx` updated.
- `/api/objectives/[id]/children` GET — already `{data: {…}}`; cleaned up with helpers.
- `/api/objectives/[id]/labels` POST+DELETE — `withAuth` + envelope helpers.
- `/api/objectives/[id]/key-result-permissions` GET — flat permissions shape → `{data: {canCreate, canEditByKeyResultId, …}}`. Consumer `KeyResultsList.tsx` updated.
- `/api/objectives/[id]/activity` GET — same as keyresults activity.
- `/api/objectives/[id]/views` POST — `withAuth`.
- `/api/objectives/alignment-search` GET — already `{data}`; cleaned up with helpers.

**Settings + misc (5):**
- `/api/settings/okr-rules` GET+POST — `withAuth` + `canAccessSettings`.
- `/api/settings/branding` GET+POST — same.
- `/api/settings/integrations` GET+POST — same.
- `/api/departments/[id]` GET+PATCH+DELETE — `withAuth`/`withRole(['ADMIN','EXECUTIVE'])`. Soft-delete preserved.
- `/api/auth/register` POST — public route, uses helpers but no `withAuth` (intentional).
- `/api/client-errors` POST+GET — POST stays public (anonymous crash reports OK); GET uses `withAuth` + `canAccessSettings`. Envelope change (`{ok:true}` → standard).
- `/api/initiatives/[id]/updates` GET+POST — envelope change (`{updates}`/`{update}` → `{data}`). Consumer `TodoDetailPanel.tsx` updated at 2 sites.

**Not migrated (intentional):**
- `/api/cron/confidence-calc`, `/api/cron/weekly-digest` — custom `CRON_SECRET` bearer auth, not session-based.
- `/api/health` — public, trivial, no value to migrating.
- Sprint routes (`/api/sprints/**`) — coherent unit, better migrated together in a dedicated pass.

**Aggregate for Item 4:** ~3000 lines → ~1600 lines across 18 route files (-47%). TypeScript clean after each batch.

### Item 5 — Phase 5 feature-module scaffolding (strangler pattern)
- **Created** `features/objectives/index.ts`, `features/key-results/index.ts`, `features/todos/index.ts`, `features/goals/index.ts`, `features/sprints/index.ts` — each re-exports from `components/[feature]/` with named exports.
- **Created** `features/index.ts` — root barrel with `objectives`, `keyResults`, `todos`, `goals`, `sprints` namespaces.
- **Updated** `docs/CONVENTIONS.md` — added Feature Barrels section documenting the strangler pattern: new code imports from `@/features/*`, old code keeps working from `@/components/*`, files physically move later with zero consumer-side churn.
- **No consumer migrations yet** — scaffolding only, lets future work opt in gradually.

**Tests:** TypeScript check passed after each item (`npx tsc --noEmit -p tsconfig.json` — only unrelated `project-scaffold/` and `lib/email.ts` pre-existing errors ignored).
**Docs updated:** `docs/CHANGELOG_AI.md`, `docs/CONVENTIONS.md`, `docs/FEATURE_STATUS.md`, `docs/COMPONENT_CATALOG.md`.

**Phase 6 running total:** 31 of ~40 routes migrated. **~4,500+ lines eliminated** across the refactor so far while adding ~700 lines of shared primitives/hooks/helpers/feature barrels.

## 2026-04-13 — Phase D: StatCard/StatGrid Adoption (7 dashboard pages)

Migrated 7 dashboard pages to use the shared `StatCard` + `StatGrid` primitives, eliminating the repeated `bg-white overflow-hidden shadow rounded-lg` stat card markup that appeared across 28 copies.

**Pages migrated:**
- **Refactored** `app/dashboard/company-okrs/page.tsx` (177 → 74 lines, -58%) — 4 stat cards.
- **Refactored** `app/dashboard/department-okrs/page.tsx` (199 → 94 lines, -53%) — 4 stat cards.
- **Refactored** `app/dashboard/analytics/page.tsx` (193 → 105 lines, -46%) — 4 stat cards + preserved department performance + level distribution sections.
- **Refactored** `app/dashboard/notifications/page.tsx` (150 → 92 lines, -39%) — 3 stat cards.
- **Refactored** `app/dashboard/progress/page.tsx` (241 → 133 lines, -45%) — 4 stat cards (On Track / At Risk / Off Track / Avg Progress).
- **Refactored** `app/dashboard/activity/page.tsx` (249 → 137 lines, -45%) — 4 stat cards.
- **Refactored** `components/dashboard/MyOKRsPage.tsx` — 4 stat cards (Total Objectives / Key Results / Avg Progress / Completed). Full client component size ~353 lines (down from ~424).

**Skipped:** `components/todos/MyTasksList.tsx` — Codex's audit included it, but inspection showed no stat cards in the file. Only contains task rows; nothing to migrate.

**Aggregate:**
- 1,209 lines → 635 lines across 6 server pages (-47%)
- 28 stat card divs (`bg-white overflow-hidden shadow rounded-lg`) eliminated — all now one-line `<StatCard>` calls
- Consistent tone vocabulary (blue/green/yellow/red/purple) across the app
- `iconText` prop naturally supports existing emoji-style icons ("O", "KR", "%", "✓", "📊", "🎯", "🔔")

**Tests:** TypeScript check passed (`npx tsc --noEmit -p tsconfig.json` — no errors in OKR-frontend code; pre-existing `lib/email.ts` nodemailer type-decl error ignored, it belongs to the unrelated SMTP wiring change).
**Docs updated:** `docs/CHANGELOG_AI.md`, `docs/COMPONENT_CATALOG.md`.

**Remaining StatCard targets:** None from the original 8-page list. Future usage expected in new dashboard features.

## 2026-04-13 — Phase 6 Wave 2: Core CRUD Migration (6 routes, 13 handlers)

Migrated all primary CRUD routes for Objectives, Key Results, and Todos to `withAuth` + `apiSuccess` standard envelope.

**Routes migrated:**
- **Refactored** `/api/todos/route.ts` (203 → 175 lines, -14%) — GET + POST via `withAuth`. Response: `{ todos }`/`{ todo }` → `{ data }`.
- **Refactored** `/api/todos/[id]/route.ts` (232 → 148 lines, -36%) — PATCH + DELETE via `withAuth`. Response: `{ todo }` → `{ data }`.
- **Refactored** `/api/keyresults/route.ts` (142 → 97 lines, -32%) — POST via `withAuth`. Response: `{ keyResult }` → `{ data }`.
- **Refactored** `/api/keyresults/[id]/route.ts` (331 → 202 lines, -39%) — GET + PUT + DELETE via `withAuth`. Response: `{ keyResult }`/`{ remainingKeyResults }` → `{ data }`.
- **Refactored** `/api/objectives/route.ts` (429 → 269 lines, -37%) — GET uses `apiPaginated`, POST via `withAuth`. Already-standard shapes preserved.
- **Refactored** `/api/objectives/[id]/route.ts` (421 → 247 lines, -41%) — GET + PUT + DELETE via `withAuth`. Already-standard shapes preserved.

**Consumer updates (2 files — minimal thanks to prior audit):**
- **Updated** `components/todos/ToDoList.tsx` line 185 — `updatedTodo.todo.assignee` → `updatedTodo.data.assignee`.
- **Updated** `components/todos-page/TodosPageClient.tsx` line 583 — `data.todo` → `data.data`.

**Existing consumers already compatible:**
- `components/goals/GoalsListView.tsx` (reads `data.data`)
- `components/dashboard/MyOKRsPage.tsx` (2 sites — reads `data.data`)
- `components/goals/MyTeamView.tsx` (reads `objData.data`)
- `components/goals/CreateGoalModal.tsx` (reads `result.data.id` for label creation)
- All Modal components (CreateObjective, EditObjective, AddKeyResult, EditKeyResult, etc.) — only read `result.error` on failure, not success bodies

**Aggregate:**
- 1758 lines → 1138 lines across 6 route files (-35%)
- 13 handlers total: all authenticated via `withAuth`
- 15+ inline `getServerSessionSafe()` + 401 blocks eliminated
- 12 inline try/catch blocks replaced by `handleApiError` via wrappers
- Prisma error handling (P2002 → 409, P2025 → 404) now automatic via `handleError.ts`

**Tests:** TypeScript check passed (`npx tsc --noEmit -p tsconfig.json` — no errors in OKR-frontend code).
**Docs updated:** `docs/CHANGELOG_AI.md`, `docs/FEATURE_STATUS.md`.

**Phase 6 running total:** 13 of ~40 routes migrated. Main CRUD complete.

**Remaining legacy routes (~27):** All `/api/objectives/[id]/*` sub-routes (children, labels, activity, views, key-result-permissions, clone, alignment-search), all `/api/keyresults/[id]/*` sub-routes (check-ins, activity, views, archive, unarchive, clone, todos), `/api/initiatives/[id]/updates`, all sprint routes, `/api/users` and `/api/users/[id]` and variants, `/api/users/me/*`, `/api/departments/[id]`, `/api/settings/*`, `/api/auth/register`, `/api/client-errors`, `/api/cron/*`, `/api/health`. These can be migrated on-demand as touched.

## 2026-04-13 — Phase 6 Wave 1: Bulk Route Migration (5 routes, 9 handlers)

Migrated 5 simple/medium routes to `withAuth`/`withRole` + `apiSuccess` standard envelope.

**Routes migrated:**
- **Refactored** `/api/timeframes/route.ts` (131 → 65 lines, -50%) — GET via `withAuth`, POST via `withRole('ADMIN')`. Response: `{ timeframe }` → `{ data }`.
- **Refactored** `/api/timeframes/[id]/route.ts` (127 → 52 lines, -59%) — PATCH/DELETE via `withRole('ADMIN')`. Response: `{ timeframe }` → `{ data }`.
- **Refactored** `/api/labels/route.ts` (83 → 41 lines, -51%) — GET via `withAuth`, POST via `withRole(['ADMIN','EXECUTIVE'])`. Response already `{ data }` — no consumer changes.
- **Refactored** `/api/user-preferences/route.ts` (35 → 24 lines, -31%) — GET/PATCH via `withAuth`. Response: `{ preferences }` → `{ data }`.
- **Refactored** `/api/initiative-report/route.ts` (136 → 122 lines, -10%) — GET via `withAuth`. Response: `{ dates, rows }` → `{ data: { dates, rows } }`.

**Consumer updates (3 files):**
- **Updated** `components/settings/TimeframeManagement.tsx` — 3 call sites (`result.timeframe` / `data.timeframe` → `.data`).
- **Updated** `lib/stores/user-prefs-store.ts` — `data.preferences?.todoViewMode` → `data.data?.todoViewMode`.
- **Updated** `components/initiative-report/InitiativeReportClient.tsx` — `data.dates`/`data.rows` → `data.data.dates`/`data.data.rows`.

**Aggregate:**
- 512 lines → 304 lines across 5 route files (-41%)
- 9 handlers total: 5 authenticated-only, 4 role-gated
- 11 inline `getServerSessionSafe()` + 401 blocks eliminated
- 6 inline try/catch blocks replaced by `handleApiError` via wrappers
- 1 `window.location.reload()` kept (pre-existing pattern) — not part of this refactor

**Tests:** TypeScript check passed (`npx tsc --noEmit -p tsconfig.json` — no errors in OKR-frontend code).
**Docs updated:** `docs/CHANGELOG_AI.md`, `docs/FEATURE_STATUS.md`.

**Phase 6 running total:** 7 of ~40 routes migrated (`/api/departments`, `/api/users/for-selection`, `/api/timeframes`, `/api/timeframes/[id]`, `/api/labels`, `/api/user-preferences`, `/api/initiative-report`).

**Wave 2 deferred:** `/api/todos`, `/api/keyresults`, `/api/objectives` and their sub-routes need explicit sign-off because migrating them requires updating ~10+ consumer files that read `.todo`/`.keyResult`/`.objective` keys from POST/PUT responses (TodosPageClient, ToDoList, MyTasksList, CloneObjectiveModal, sprint board, etc.).

## 2026-04-13 — Phase 6: API Helpers + 2-Route Pilot

**Created API helper layer** (replaces 91+ repeated auth checks and 4 response formats):

- **Created** `apiSuccess`, `apiPaginated`, `apiError`, `apiUnauthorized`, `apiForbidden`, `apiNotFound`, `apiBadRequest`, `apiValidationError`, `apiConflict` — standard envelope helpers — `lib/api/apiResponse.ts`
- **Created** `withAuth`, `withRole` — route wrappers that auto-401 missing sessions and auto-403 insufficient roles — `lib/api/withAuth.ts`
- **Created** `handleApiError` — catches all thrown errors with known Prisma codes (P2002 → 409, P2025 → 404), falls back to 500 envelope — `lib/api/handleError.ts`
- **Created** Barrel export — `lib/api/index.ts`

**Standard envelope shapes:**
- Success: `{ success: true, data: T, message?: string }`
- Paginated: `{ success: true, data: T[], pagination: { page, limit, total, totalPages } }`
- Error: `{ success: false, error: string, code?: string, details?: unknown }`
- Error codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `VALIDATION_ERROR`, `CONFLICT`, `INTERNAL_ERROR`

**Pilot migrations (2 routes):**

- **Refactored** `/api/departments/route.ts` (87 → 45 lines, -48%) — `withAuth` for GET, `withRole(['ADMIN','EXECUTIVE'])` for POST, `apiSuccess` / `apiBadRequest` / `apiConflict` envelope helpers. Zero consumer changes — response shape already `{ data }`.
- **Refactored** `/api/users/for-selection/route.ts` (45 → 15 lines, -67%) — `withAuth` + `apiSuccess`. Response shape changed from `{ users: [...] }` to `{ data: [...] }` (standard envelope). Updated hook `useUsersForSelection` and inline consumers `KeyResultsList.tsx` + `GoalsListView.tsx` to read `d.data` instead of `d.users`.

**Eliminated per migrated route:**
- 2 lines of `const session = await getServerSessionSafe()` + 401 check per handler
- 4-7 lines of try/catch error handling per handler
- Inline role-check boilerplate (2+ lines)

**Before:** `export async function GET(request) { try { const session = await getServerSessionSafe(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); ... } catch (error) { console.error(...); return NextResponse.json({ error: 'Internal server error' }, { status: 500 }) } }`

**After:** `export const GET = withAuth(async () => { ... return apiSuccess(data) })`

**Tests:** TypeScript check passed (`npx tsc --noEmit -p tsconfig.json` — no errors in OKR-frontend code).
**Docs updated:** `docs/CHANGELOG_AI.md`, `docs/COMPONENT_CATALOG.md`, `docs/FEATURE_STATUS.md`.
**Validation result:** `withAuth` / `withRole` wrappers work with Next.js App Router route handler signature. Standard envelope is compatible with existing hook consumers. Safe to proceed with bulk migration of remaining 40+ API routes.

**Pending:** 40+ API routes still use the legacy pattern. Migration will be done progressively as each route is touched, or in a dedicated sweep batch.

## 2026-04-13 — Phase 4.7: Bulk Modal Migration (13 modals → shared primitives)

Migrated 13 remaining modals to use `Modal` / `ConfirmDialog` / `useReferenceData`. External APIs (props) preserved — no call sites needed changes.

**Batch 1 — ConfirmDialog (3 modals):**
- **Refactored** `DeleteKeyResultModal` to `ConfirmDialog` — `components/keyresults/DeleteKeyResultModal.tsx` (157 → 85 lines, -46%)
- **Refactored** `DeleteTodoModal` to `ConfirmDialog` — `components/todos/DeleteTodoModal.tsx` (121 → 72 lines, -40%)
- **Refactored** `DeleteTeamModal` to `ConfirmDialog` — `components/settings/DeleteTeamModal.tsx` (101 → 76 lines, -25%)

**Batch 2 — Form modals with reference data (5 modals):**
- **Refactored** `EditObjectiveModal` to `Modal` + `useReferenceData` — `components/objectives/EditObjectiveModal.tsx` (360 → 278 lines, -23%)
- **Refactored** `AddKeyResultModal` to `Modal` — `components/keyresults/AddKeyResultModal.tsx` (333 → 262 lines, -21%)
- **Refactored** `EditKeyResultModal` to `Modal` — `components/keyresults/EditKeyResultModal.tsx` (316 → 251 lines, -21%)
- **Refactored** `CloneKeyResultModal` to `Modal` — `components/keyresults/CloneKeyResultModal.tsx` (292 → 229 lines, -22%)
- **Refactored** `CloneObjectiveModal` to `Modal` — `components/objectives/CloneObjectiveModal.tsx` (215 → 158 lines, -27%)
- **Refactored** `CreateGoalModal` to `Modal` + `useReferenceData` — `components/goals/CreateGoalModal.tsx` (533 → 321 lines, -40%)

**Batch 3 — Simple form modals (5 modals):**
- **Refactored** `CreateTeamModal` to `Modal` — `components/settings/CreateTeamModal.tsx` (123 → 82 lines, -33%)
- **Refactored** `EditTeamModal` to `Modal` — `components/settings/EditTeamModal.tsx` (139 → 91 lines, -35%)
- **Refactored** `EditTodoModal` to `Modal` — `components/todos/EditTodoModal.tsx` (207 → 151 lines, -27%)
- **Refactored** `AssignUserModal` to `Modal` — `components/todos/AssignUserModal.tsx` (206 → 151 lines, -27%)
- **Refactored** `SetDueDateModal` to `Modal` — `components/todos/SetDueDateModal.tsx` (226 → 182 lines, -19%)

**Skipped:** `CreateCheckInModal` — has a 2-column layout with sticky header, internal scroll container (`max-h-[95vh] overflow-y-auto` on the card), and embedded chart. Requires extending Modal with a `scrollBehavior="internal"` option before migration. Deferred to a future iteration.

**Aggregate:**
- ~3,409 lines → ~2,388 lines across 13 modals (-30% average reduction)
- 4 inline `Promise.all` reference-data fetches eliminated (replaced by cached `useReferenceData`)
- 13 custom modal wrappers (overlay + card + header + close button) eliminated

**Tests:** TypeScript check passed after each batch (`npx tsc --noEmit -p tsconfig.json` — no errors in OKR-frontend code).
**Docs updated:** `docs/CHANGELOG_AI.md`, `docs/COMPONENT_CATALOG.md`.

## 2026-04-13 — Phase 4.6: Form Modal Migration (validate Modal + useReferenceData)

- **Refactored** `CreateObjectiveModal` to use `Modal` primitive + `useReferenceData` hook — `components/objectives/CreateObjectiveModal.tsx` (371 → 322 lines, -13%)
- **Eliminated** inline `fetchFormData()` Promise.all of 3 `/api/` endpoints (users/timeframes/departments) — now uses `useReferenceData({ enabled: isOpen })`
- **Eliminated** custom modal overlay/card/header markup — now uses `<Modal>` with `icon`, `iconClassName`, `size="lg"`
- **Preserved** external API: `isOpen`, `onClose`, `defaultLevel`, `title`, `defaultOwnerId`, `onObjectiveCreated`, `userDepartments` — call sites need no changes
- **Preserved** behavior: form reset on open, timeframe auto-selection via `pickCurrentTimeframe`, parent objective selector, check-in cadence, privacy toggle
- **Tests:** TypeScript check passed (`npx tsc --noEmit -p tsconfig.json` — no errors in OKR-frontend code, unrelated `project-scaffold/` errors ignored)
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/COMPONENT_CATALOG.md`
- **Validation result:** `Modal` + `useReferenceData` together are sufficient for full CRUD form modals. Shared React Query cache means opening CreateObjectiveModal after another consumer has fetched users/timeframes/departments triggers zero network calls. Safe to proceed with remaining form modals (EditObjectiveModal, AddKeyResultModal, EditKeyResultModal, CreateGoalModal).

## 2026-04-13 — Phase 4.5: Pilot Migration (validate shared primitives)

- **Refactored** `DeleteObjectiveModal` to use `ConfirmDialog` primitive — `components/objectives/DeleteObjectiveModal.tsx` (184 → 124 lines, -33%)
- **Refactored** `ArchiveKeyResultModal` to use `ConfirmDialog` primitive — `components/keyresults/ArchiveKeyResultModal.tsx` (142 → 84 lines, -41%)
- **Preserved** external API of both modals: `isOpen`, `onClose`, entity props unchanged — call sites in `DeleteObjectiveButton` and `ArchiveKeyResultButton` need no changes
- **Tests:** TypeScript check passed (`npx tsc --noEmit` — no errors in OKR-frontend code; pre-existing errors in unrelated `project-scaffold/` directory were ignored)
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/COMPONENT_CATALOG.md`
- **Validation result:** `ConfirmDialog` with `bullets`, `details`, and `extraContent` props is sufficient to cover both the simple archive case AND the complex delete-with-type-to-confirm case. Safe to proceed with migrating remaining 5+ delete/archive modals.

## 2026-04-13 — Admin SMTP Test Endpoint

- **Added** admin-only test email API endpoint: `POST /api/email/test`
- **Access control:** `ADMIN` role only (via `withRole`)
- **Response:** standard API envelope with send status (`SENT` / `LOGGED_ONLY` / `FAILED`)
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/FEATURE_STATUS.md`, `docs/SITEMAP.md`

## 2026-05-01 — Filters Workspace

- **Added** `Filters` sidebar nav entry (`SlidersHorizontal` icon, `/dashboard/filters`) in `lib/dashboard-navigation.ts`
- **Added** full Filters Workspace feature module at `features/filters/`:
  - `types.ts` — `FiltersTab`, `SegmentId`, `FilterState`, `KpiData`, `FilteredResult`, `SavedSegment`
  - `segments.ts` — pre-built segments catalogue for all three tabs (Objectives / Key Results / Initiatives)
  - `components/SegmentsPanel.tsx` — left-rail segments panel with search
  - `components/FilterBar.tsx` — collapsed chip strip + expandable filter dropdowns (multi-select)
  - `components/KpiTiles.tsx` — per-tab KPI metric tiles with status colour tokens; tile click adds filter
  - `components/ProgressChart.tsx` — 10-bucket progress distribution histogram; bucket click adds filter
  - `components/ResultsList.tsx` — grouped-by-plan results list with confidence pills, progress bars, status pills
  - `components/FiltersWorkspace.tsx` — root client component wiring tab state, URL sync, filter state
  - `hooks/useFiltersData.ts` — TanStack Query hook that fetches objectives/KRs/todos and computes KPIs + histogram buckets
  - `index.ts` — barrel export
- **Added** `GET /api/keyresults` endpoint (pagination, confidence filter, owner filter, search) in `app/api/keyresults/route.ts`
- **Added** route `app/dashboard/filters/page.tsx`
- **Modified** `components/layout/DashboardShell.tsx` — `/dashboard/filters` gets full-height flex layout (same as alignment-map)
- **Tests:** type-check passes (`tsc --noEmit` — zero errors)
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/FEATURE_STATUS.md`, `docs/SITEMAP.md`

## 2026-04-13 — Objective Design Prototype Page

- **Added** static OKR design page: `/dashboard/objectives/cmnt25rlr000yhl7oktasxeml/design`
- **Purpose:** new UI layout prototype using existing Atlas design tokens and components
- **Files:** `app/dashboard/objectives/cmnt25rlr000yhl7oktasxeml/design/page.tsx`
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/SITEMAP.md`

## 2026-04-13 — SMTP Email Delivery Wiring

- **Added** SMTP delivery via Nodemailer in `lib/email.ts` (respects `EMAIL_DRIVER=smtp`)
- **Added** env support: `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_SECURE`, `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD`, `EMAIL_FROM`, `EMAIL_FROM_NAME`
- **Updated** `sendUserInvitationEmail`, `sendPasswordResetEmail`, `sendWelcomeEmail` to call `sendMail()`
- **Updated** `env.example` with SMTP config and driver toggle
- **Dependencies:** added `nodemailer` to `package.json` (lockfile pending install)
- **Tests:** not run (configuration change)
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/FEATURE_STATUS.md`

## 2026-04-13 — Phase 4: Shared Reference-Data Hooks

- **Created** `useUsersForSelection` — React Query hook for `/api/users/for-selection` — `hooks/useUsersForSelection.ts`
- **Created** `useTimeframes({ activeOnly? })` — React Query hook for `/api/timeframes` — `hooks/useTimeframes.ts`
- **Created** `useDepartments` — React Query hook for `/api/departments` — `hooks/useDepartments.ts`
- **Created** `useReferenceData` — combined hook (users + timeframes + departments) for forms — `hooks/useReferenceData.ts`
- **Created** Barrel export for all hooks — `hooks/index.ts`
- **Tests:** TypeScript check passed (`npx tsc --noEmit` — no errors in `hooks/`)
- **Docs updated:** `docs/COMPONENT_CATALOG.md` (hooks section with usage examples), `docs/CHANGELOG_AI.md`, `docs/FEATURE_STATUS.md`
- **Note:** No existing fetch calls have been migrated yet. All hooks share React Query's 1-minute staleTime cache, so consumers across the app share a single network request. Phase 5 will migrate components (CreateObjectiveModal, EditObjectiveModal, CreateGoalModal, etc.) to use these hooks.

## 2026-04-13 — Phase 3: Shared UI Foundations

- **Created** `Modal` — shared modal shell replacing 19 duplicate wrappers — `components/ui/Modal.tsx`
- **Created** `ConfirmDialog` — shared confirm dialog for delete/archive flows (danger/warning/info variants) — `components/ui/ConfirmDialog.tsx`
- **Created** `EmptyState` — shared empty-state component replacing 8+ duplicates — `components/ui/EmptyState.tsx`
- **Created** `StatCard` — shared stat card replacing dashboard stat duplication — `components/ui/StatCard.tsx`
- **Created** `StatGrid` — responsive grid wrapper for stat cards — `components/ui/StatGrid.tsx`
- **Created** `PageHeader` — shared page header + action bar — `components/ui/PageHeader.tsx`
- **Created** Barrel export for UI primitives — `components/ui/index.ts`
- **Tests:** TypeScript check passed (`npx tsc --noEmit` — no errors in `components/ui/`)
- **Docs updated:** `docs/COMPONENT_CATALOG.md` (moved primitives from PLANNED to DONE with usage examples), `docs/CHANGELOG_AI.md`
- **Note:** No existing modals/empty states have been migrated yet. Phase 4+ will refactor feature components to use these primitives.

## 2026-04-12 — Phase 2: AI-Optimized Docs Scaffold

- **Created** Global AI prompt with architecture rules, conventions, and workflow — `CLAUDE.md`
- **Created** Architecture summary and entrypoints for AI context — `docs/AI_CONTEXT.md`
- **Created** Reusable component inventory with current + planned components — `docs/COMPONENT_CATALOG.md`
- **Created** Feature/module status tracker (done, in-progress, planned) — `docs/FEATURE_STATUS.md`
- **Created** Complete application sitemap (all routes + API endpoints) — `docs/SITEMAP.md`
- **Created** AI changelog template — `docs/CHANGELOG_AI.md`
- **Created** Code conventions and rules for new code — `docs/CONVENTIONS.md`
- **Tests:** not run (docs-only change, no code modified)
- **Docs updated:** All docs created fresh
