# AI Changelog

> **Purpose:** Log of all changes made by AI assistants. Every AI session that modifies code MUST append an entry here.

## 2026-09-18 — The sign-in screen: a photograph that changes every time you log in

The sign-in page was a 420px card on a flat `--ap-bg`. It is now a full-bleed photograph with a glass credentials card over it, and the photo is different on every visit.

**Where the photos come from.** `GET /api/wallpaper` (new, deliberately unauthenticated — it feeds a pre-login screen and returns only public photo metadata) proxies Bing's published image-of-the-day archive, the same feed behind bing.com. Eight frames, normalised to `Wallpaper` objects with title, location, photographer and a blur-up thumbnail, memoised in-process for six hours so a burst of sign-ins costs one outbound request rather than one per visitor. Browsers fetch the image files straight from bing.com with `referrerpolicy="no-referrer"`; only the metadata goes through us.

**It never depends on that working.** Six built-in CSS gradient scenes ship with the feature. They paint instantly under every photo while it decodes, and they *are* the backdrop when the archive is unreachable, when the fetch is slow, or when an operator sets `AUTH_WALLPAPER_SOURCE=off` on an egress-restricted host — in which case the page makes no outbound request at all. A stale six-hour memo is served in preference to no photo. The one thing a sign-in page may not do is fail to render.

**What the screen does now.** A different frame per visit (the last one shown is remembered in `localStorage` and excluded), a 20s auto-rotation with preload-then-swap so a slow photo never blanks mid-fade, a 45s Ken Burns drift, a Bing-style caption chip that expands on hover to the location and photographer, pause and shuffle controls, and a `n / 8` counter. On `lg` and up there is an editorial column: brand lockup, a greeting that knows the hour, one of five rotating taglines, the product pillars, today's date — all resolved client-side, because the server has no idea what time it is for the visitor and guessing is a hydration mismatch.

**The card.** Rebuilt on `react-hook-form` (it was raw `useState`), with inline field validation, a caps-lock hint, show/hide password, and "Remember me" that now actually does something — it stores the email so the next visit arrives pre-filled. `safeCallbackUrl` moved to `features/auth/services/callback-url.ts` unchanged; the SHR-6 open-redirect guard still runs on every sign-in.

**Two real bugs found while building it.**

1. **`components/ui/Input` was not a `forwardRef`.** Every `react-hook-form` field rendered through it silently read as empty: React logged "Function components cannot be given refs", validation ran against `undefined`, and a `setValue()` prefill never reached the DOM. Caught in the browser, not by `tsc` — the empty-submit screenshot showed "Enter your email address" under a field with an email in it. Now forwards its ref, which fixes it for every other consumer too.
2. **Contrast against an unknown photograph.** The first scrim was tuned on a dusk shot and fell apart on the polar-bear frame — white-on-snow. There is now a flat 24% wash under the diagonal gradient, the hero text carries a shadow, and the card sits at 58% rather than 42%. Verified against the brightest frame in the set specifically.

**Files.** New: `features/auth/` (`components/SignInScreen|AuthBackdrop|AuthHero|SignInForm`, `hooks/useWallpaper`, `services/wallpaper|bing-wallpaper|callback-url`, `types.ts`, `index.ts`), `app/api/wallpaper/route.ts`. Changed: `app/auth/signin/page.tsx` (now a thin Suspense wrapper), `components/ui/input.tsx` (forwardRef), `app/globals.css` (three auth keyframes + their `prefers-reduced-motion` overrides — the global rule collapses durations to 0.01ms, which would have snapped the drift to its end frame), `features/index.ts`, `env.example`, `lib/security/api-invariants.test.ts` (wallpaper exemption, with the guard it must prove), `lib/security/redirect-safety.test.ts` (now imports the real `safeCallbackUrl` instead of a mirrored copy that could drift), docs.

**Accessibility.** Photos are `alt=""` and `aria-hidden`; the caption is real text, not baked into the image. Rotation, drift and entrance are all off under `prefers-reduced-motion` (verified with an emulated media feature). The scrim work is what keeps the text legible on an unpredictable backdrop.

**Sign-up and forgot-password were left on the old centred card.** `AuthBackdrop` is exported from the barrel and takes `children`, so giving them the same treatment is a small follow-up — but it was not what was asked for.

**Verification** — `tsc --noEmit` clean; `npm run build` exits 0 (`/auth/signin` 10.2 kB, `/api/wallpaper` listed); security 20/20, todos 28/28, cards 9/9, sprints 21/21, scrum 29/29, okr 9/9; and rendered in a real browser at 1512/834/390 px plus a reduced-motion pass — empty-submit validation, rejected credentials, remember-me, the caption chip, shuffle, and the worst-case bright photo all inspected. Not verified: a successful sign-in redirect (no valid local credentials were used).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## 2026-09-18 — Card modal: popover anchoring, a friendlier date picker, and a hover reflow

Four defects reported from the running app, all in `components/todos/TodoCardModal.tsx`.

**1 & 4 — Popovers opened away from their triggers (Members, Labels, Dates).** Every panel was a hand-rolled `absolute … top-full z-[91]` div inside a `relative` ancestor, with a `fixed inset-0 z-[90]` scrim. Three consequences: the panel anchored to the *container* rather than the button; it was clipped by the `overflow-y-auto` column it lived in; and it had no collision detection, so a 688px-tall dates panel simply ran off the bottom. All five (Members, Labels, Dates, and the rail's Checklist and Cover) now use `components/ui/popover.tsx`, which portals out of the scrolling column, anchors to the trigger and flips when it would overflow. Verified in a browser: date trigger at x=278 → popover at x=278; member trigger at x=286 → popover at x=286.

**2 — The date and time fields were unusable.** The date was a free-text `M/D/YYYY` field parsed with `new Date()`, and the time was a bare `<input type="time">` that renders as `--:-- --` until touched. Both rows are now the design's shape: a checkbox, a label and a readable summary, with the calendar above as the only input — nothing to type. Time moved to an explicit picker (All day + half-hour steps in 12-hour labels) that appears only once a date is set.

**A real bug surfaced while fixing that.** `parseYmd`'s regex was unanchored, so on a full ISO datetime it matched the first ten characters — the **UTC** calendar day — while the due badge and `due-tone` parse the same value as a `Date` and read the **local** day. East of UTC, a card due at local midnight showed one day in the badge and the day before in the panel, and saving would have written that wrong day back. The regex is now anchored to date-only strings, and a datetime is normalised to its local calendar day. Confirmed on screen: badge, calendar highlight and row summary all now read Sep 15 where the panel previously said Sep 14.

**3 — Checklist rows jumped on hover.** The per-item action cluster was `hidden → group-hover:flex`, so three 24px buttons entered the flow on hover and shoved the row's contents. It now fades with `opacity`, staying in layout. Measured rather than eyeballed: the idle cluster reports `width: 76px, display: flex, opacity: 0`, so hover cannot reflow the row.

**Closer to the reference design**, from the same report: the due badge leads with the date and trails the relative note ("Sep 15 · overdue by 3 days") instead of prefixing "Overdue ·"; the checklist header shows `n/total` and gained a **Hide checked** toggle (view-only and local — it filters what is rendered, never what is stored).

**Still not built, and both need more than styling:** the `FIN-482` card-ID chip needs a field that does not exist on `Todo`, and the rail's **Archive** action needs an endpoint. Flagged rather than faked.

**Verification** — `tsc --noEmit` clean for this file; cards 9/9, todos 28/28, sprints 21/21. Popover anchoring, the date rows and the hover reserve were each confirmed in a real browser with measurements, not just screenshots. A full local `npm run build` was deliberately **not** run: another session has uncommitted work in the tree (`features/auth/`, `app/api/wallpaper/`, plus edits to `app/auth/signin/page.tsx`, `app/globals.css`, `components/ui/input.tsx`) that does not compile, and stashing it while they were mid-edit was the riskier option. CI builds from a clean checkout, which is the authoritative gate.

> **Two failures in `test:security` belong to that in-flight work, not to this change**, and both are worth their author's attention: `app/api/wallpaper/route.ts` carries **no auth wrapper** (SEC-1), and the rewritten sign-in page no longer routes `callbackUrl` through the validator, which is the open-redirect guard (SHR-6).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## 2026-09-17 — Browser pass on the design refresh: four defects the test suite could not see

First time any of this was rendered. Ran the dev server against a local Postgres and drove it with Puppeteer (sign-in, sprint board, card modal, to-dos, dashboard, light + dark). Every phase had passed `tsc`, six test suites and a production build; all four defects below survived that.

**1. Dark mode was unusable on the sprint board.** The board header and every lane name were invisible. The cause was the opposite of what it looked like: the text had correctly flipped to `oklch(0.96 …)`, but the surface beneath it was a hardcoded `oklch(1 0 0 / 0.72)` — light on light. The board's `dark` flag means "the background **preset** is graphite", not "the app is in dark mode", so with any light preset the else branch painted a literal white. Fixed by deriving all 11 glass surfaces from `--ap-bg-raised` through `color-mix` — byte-identical in light mode, theme-following in dark — across `SprintBoardClient`, `SprintPlannerView` and `SprintListManager`. `SprintFloatingBar`'s dock got the same treatment: it is chrome, not board decoration, and should not follow the preset at all.

**2. Every heading utility in the app was being silently overridden — pre-existing.** The top-bar page title declared `text-[15px]` and rendered at **30px**. `.apple-pro-surface h1` was unlayered, and class+element (0,1,1) beats any Tailwind utility (0,1,0). Moving the block into `@layer base` did **not** fix it: Tailwind v3's `@layer` is a build-time directive, not a native CSS layer, so placement alone does not change the cascade. `:where()` does — it drops the selector to 0,1,0 and the utility wins the tie on source order. These rules are now defaults an explicit class can override, which is what they were always meant to be. The header title is also now 18px/700 per the design.

**3. The card modal's tinted right rail stopped partway down** with its `border-l` dangling — `items-start` on the grid sized it to its own content. Now `items-stretch`.

**4. A regression from the Phase 6 restyle:** the status lozenge had a fixed `h-[22px]` but no `whitespace-nowrap`, so "In Progress" wrapped and spilled out of its own background. Fixed, and the Status column widened to 112px.

**Confirmed working, visually:** the due-tone fix end to end — a card due TODAY renders amber rather than red, yesterday renders red with an alert icon, tomorrow renders amber where it used to be green, and the to-dos header counts "58 overdue · 2 due today" as separate buckets. Also verified: the 228px sidebar with no dead strip, dot markers and mono eyebrows; the 54px header; the card modal's inline complete-toggle with no ID chip; and dark mode across dashboard, board, to-dos and modal.

**A correction to an earlier claim in this session:** the Done lane is *not* missing from the board. The API returns all five lanes and the DOM contains all five — five 286px lanes simply exceed the content width, so the fifth is off-screen and the board scrolls. Correct behaviour.

**Left as a product decision, not styled around:** board background presets stay light in dark mode. They are user-chosen decoration and `graphite` exists for dark, so changing that is a behaviour choice rather than a styling one.

**Local environment note:** the local database was behind `prisma/schema.prisma` (`initiatives.coverSize` missing) and every authenticated page 500'd until `prisma db push` was run against it. Additive, local only. A throwaway admin and a seeded sprint were created to exercise the date boundaries and both were deleted afterwards.

**Verification** — `tsc --noEmit` clean; sprints 21/21, todos 28/28, cards 9/9, security 20/20, scrum 29/29, automations 206/206; `npm run build` exits 0; and this time, **rendered and inspected in a real browser.**

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## 2026-09-17 — Adopt the Progress primitive, and settle the control-border rule

Closes the last two open items from `docs/design_refresh_IMPLEMENTATION_STRATEGY.md`.

**All 7 hand-rolled `ProgressBar` copies now use `components/ui/progress.tsx`** — `OkrAttainmentSection`, `NestedObjectivesList`, `SprintBoardClient`, `SprintsListClient`, `ResultsList`, `OkrHierarchyTable`, `OkrsAllClient`. The primitive is Radix-backed, so every progress bar in these surfaces now exposes `role="progressbar"` and `aria-value*`; **none of the seven copies did**. Each file keeps its own local wrapper where it had one (widths, percentage labels differ by surface) — only the bar markup was replaced, so the diff stays small and nothing re-flows.

**Three more duplications came out with them**, all entangled in those copies:
- `progressColor(status)` was **byte-identical** in `OkrHierarchyTable` and `OkrsAllClient`, with an inline variant in `NestedObjectivesList`. Now `getOkrStatusColor()` in `lib/utils.ts`.
- `ResultsList` had `getProgressColor`'s exact 70/40 threshold ladder inline. Now `getProgressBarColor()`, which returns a token rather than a Tailwind class — `progress.tsx` styles its indicator inline, so a class was not usable.
- Both helpers sit next to `getConfidenceColor` with a note on the docblock that they take **different vocabularies**: `getOkrStatusColor` handles kebab-case UI status (`on-track`), `getConfidenceColor` handles the `ON_TRACK` enum. Conflating them is how the app grew the near-copies in the first place.

**The header search-field border is resolved, and the rule is now sharper.** §2 said control boundaries need `--ap-border-strong` for WCAG 1.4.11's 3:1; the design specifies a lighter value. The deciding fact is that the field is `--ap-bg-sunken` on an `--ap-bg-raised` header — a **1.04:1** fill difference, so nothing but the stroke shows where the control is. That makes the boundary "required to identify the component", which is exactly what 1.4.11 covers. `--ap-border-strong` stays. The rule in §2 now states the real test — *is the boundary load-bearing*, not *is it technically a control* — so a field that is identifiable by a distinct fill or a persistent icon may still use `--ap-border`. Rationale recorded inline in `Header.tsx` so it is not relitigated.

**Not done, deliberately:** six files still draw progress bars inline without a named `ProgressBar` — `ObjectiveNode` (3 bars), `AppleDashboard`, `ObjectiveDetailModal`, `MapObjectiveNode`, and the two `progress*` pages. They are the same pattern and would benefit from the same a11y, but they were outside the stated set of seven and several sit in contexts (a reactflow node, a hierarchy tree) I cannot check visually. Logged rather than swept.

**Verification** — `tsc --noEmit` clean; sprints 21/21, todos 28/28, cards 9/9, security 20/20, scrum 29/29; `npm run build` exits 0. **Not opened in a browser.**

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## 2026-09-17 — Harmonize due-date tone: one helper, ten call sites, and an overdue bug

Adds `lib/todos/due-tone.ts` (+ `due-tone.test.ts`, 14 tests, picked up by the existing `test:todos` glob) and retires ten private implementations. This was listed as the open behaviour change in `docs/design_refresh_IMPLEMENTATION_STRATEGY.md`.

**A real bug, not just inconsistency.** Five UI files decided lateness with `new Date(dueDate).getTime() < Date.now()`. A `dueDate` carries no time component, so it parses to midnight — meaning **a task due today rendered as overdue from 00:01 onward**. The fix was not a judgement call, because the repo had already answered this twice on the server:

- `lib/todos/due-reminders.ts` treats an all-day task as due at the **END** of its day (that is why a "1 day before" reminder lands the previous evening rather than at midnight).
- `lib/daily-digest.ts` compares `t.dueDate < todayStart` — day-normalized.

So the reminder system and the email digest were both already correct and only the UI disagreed. `dueInstant()` now follows the reminder convention, and a test asserts the two stay aligned. Affected: `TaskCardTrello`, `TodosPageClient` (badge **and** the overdue counter), `TodoKanbanView`, `TodoTreeView`, `ReportDashboardClient`.

**The ≤2d vs ≤7d conflict is resolved by parameterising, not by picking a winner.** `TaskCardTrello` used a 2-day "soon" window and `ReportDashboardClient` used 7. Both are right for their surface — a sprint card has a tighter horizon than a weekly report — so `soonWithinDays` is an argument with a documented default of 2, and the report passes 7. `ReportDashboardClient` additionally keeps its own `overdue|soon|later|none` vocabulary via a four-line adapter that folds `today` into `soon`, because it filters on `=== 'soon'` and a naive swap would have silently undercounted.

**Green now means one thing.** `TodoCardModal` painted "due tomorrow" green and `SetDueDateButton` painted *any* future date green, with `SetDueDateModal` labelling it "Future Date - On Track" — an assertion a due date cannot support, since a task is not on track merely because it is scheduled. Green is reserved for `done`, and a test asserts no other tone may use the success token. The modal keeps its richer "Tomorrow ·" **label** while taking the shared **colour**, so no information is lost.

**Consolidated:** `pickDateChipTone` (TaskCardTrello), `DueDateBadge` (TodoCardModal), `getDueDateStatus` (MyTasksList and its byte-identical copy in ToDoList), `getDateStatus` + `getButtonColor` (SetDueDateButton), `getDateStatus` (SetDueDateModal), `dueState` (ReportDashboardClient), and three boolean `overdue` expressions. All tone styling now flows through `DUE_TONE_STYLE`, which returns `--ap-*` pairs, so these surfaces follow dark mode for the first time — several of them were on raw Tailwind palette classes (`text-red-600`, `bg-green-50`) that do not.

**Visual changes, all intended:** fewer items marked overdue; "due tomorrow" amber rather than green; "scheduled" neutral rather than green.

**Not touched:** raw palette colours in those same files that serve other purposes (delete buttons, completed-state cards, validation text) — out of scope for due-date tone, deliberately left rather than widening the change.

**Verification** — `tsc --noEmit` clean; todos **28/28** (14 new), sprints 21/21, cards 9/9, security 20/20, automations 206/206, scrum 29/29; `npm run build` exits 0. **Not opened in a browser.**

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## 2026-09-17 — Design refresh Phase 6 + 7: the to-dos list, and the cleanup sweep

Closes the last two phases of `docs/design_refresh_IMPLEMENTATION_STRATEGY.md`. All eight phases are now done.

**Phase 6 — to-dos list. A restyle, not a rebuild.** Per Decision 0 the features the design adds (date grouping, row selection, the bulk-action dock, the priority column, "Showing N of 150") are deferred to §11 rather than built, and the existing 8-column table was kept rather than reshaped to the design's 7-column grid — that grid exists to carry a selection checkbox and a priority column we are not filling. Applied: 1180px content width, 26px title, 38px filter controls, the tab underline treatment, a 42px mono eyebrow header strip on `--ap-bg-sunken`, 11px/14px row padding.

Defects fixed in the same pass:
- **A regex sanitiser feeding an HTML sink.** The description preview ran `.replace(/<[^>]+>/g, '')` and injected the result through `dangerouslySetInnerHTML` — malformed or nested tags can survive that pattern. Now returns a string React escapes; the sink is gone rather than guarded.
- **`StatusLozenge` was a private 4-status map**, so `IN_REVIEW` and `STUCK` rendered as raw uppercase strings and had no kanban column. Now reads `todoStatusMeta()`.
- **`TODO_STATUS_META` was another hand-copied palette snapshot** (literal `#34C759`, `rgba(0,122,255,…)`) — retargeted onto tokens, so it follows dark mode for free. Marked canonical in a comment, since the two designs disagree on the status set and on STUCK's colour (amber on the board, red in the modal).
- **The create form's assignee `<select>` had no "Unassigned" option** despite initialising to `''`, so the browser showed the first user while state said empty.
- `CreateTodoModal` moved onto `components/ui/Modal` per CLAUDE.md — the hand-rolled overlay had no focus trap, no Escape handling and no scroll lock. Row delete moved to `ConfirmDialog`.
- `TodoKanbanView` and `TodoTreeView` moved off Tailwind-config tokens onto `--ap-*`; the page no longer crosses token systems when you switch from List to Board. Kanban's private 4-status `COLUMNS` const with raw hex dots is gone.
- Removed the modal/sidebar view toggle: it persisted a preference to the database that nothing consumed, and drawer mode was deleted in Phase 5, so sidebar mode is now impossible.

**Phase 7 — cleanup.**
- **Deleted** `features/sprints/components/SprintCardModal.tsx` (810 lines; its own header said it should have gone in Phase 4) plus the barrel line and the `SprintBoardActivity` type that existed only for it; `components/todos-page/TodoDetailPanel.tsx` (325 lines, zero references); and 5 dead CSS blocks — `.ap-segmented`, `.ap-progress*`, `.ap-kbd`, `.ap-sidebar`, `.ap-topbar`. The last two were a **third** copy of the 228/52/54 sidebar metrics that nothing applied.
- **18 malformed `var()` names fixed** in `ToDoList` and `AddToDo` — a Tailwind class name pasted inside `var()`, e.g. `text-[color:var(--text-sm text-muted-foreground)]`. These resolve to nothing, so those elements had been silently inheriting colour.
- 6 more dead `font-500/600/700` classes replaced outside the card modal.
- **`getConfidenceColor` added to `lib/utils.ts`.** CLAUDE.md, `COMPONENT_CATALOG.md` and `MASTER_REFERENCE.md` have all mandated it "from lib/utils.ts" and **it never existed** — so three call sites each grew their own map: raw hex in `PlansGantt`, `--ap-*` vars in `PerKrProgressCard`, raw Tailwind palette classes in `NavProgressCircles`. All three now use it. Unknown confidence falls back to the neutral token, not green — "no data" must not read as "on track".
- **`DialogOverlay` now carries `.ap-modal-overlay`**, closing the one gap Phase 5 could not reach from its own scope. `--ap-overlay` + `blur(3px)` replaces a flat `bg-black/10` that was nearly invisible over the refreshed light surfaces and far too weak in dark mode. This is the single scrim for all ~50 `Modal` consumers.

**Left open, deliberately** — both need a decision rather than a default:
- `lib/todos/due-tone.ts` is not extracted. It is a behaviour change, not a refactor: "soon" means ≤2 days in `TaskCardTrello` and ≤7 in `ReportDashboardClient`, and `TodoCardModal` renders "tomorrow" in a success tone while `SetDueDateButton` renders it as warning. Someone has to pick a vocabulary.
- The 7 hand-rolled `ProgressBar` copies are not migrated onto `ui/progress.tsx`. The primitive is ready and adds `role=progressbar` + `aria-value*`, which none of the copies have.

**Verification** — `tsc --noEmit` clean; sprints 21/21, cards 9/9, todos 14/14, automations 206/206, scrum 29/29, security 20/20; `npm run build` exits 0. **Nothing has been opened in a browser.** Given this changes appearance across ~124 files beyond the four redesigned surfaces, and dark mode has literally never rendered before, a visual pass is the main outstanding risk.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## 2026-09-17 — Design refresh Phase 5: the task card modal

Executes Phase 5 of `docs/design_refresh_IMPLEMENTATION_STRATEGY.md` (§6.4, §2 tokens, §5 metrics) against `design-import/Modal design optimization with Trello/Task Card Modal.dc.html`. Files: `components/todos/TodoCardModal.tsx`, `components/todos/TodoCard.tsx`, plus one stale doc line in `features/sprints/components/SprintBoardClient.tsx`.

**Shell.** 860 → **940px** (`Modal size="940"`), `--ap-radius-lg` (14px), the 6px accent strip via `Modal`'s new `accentColor` — bound to the card's own status through `TODO_STATUS_META`, so it reads as state rather than decoration. The dialog is **top-aligned, not centred**: `top-[28px] translate-y-0 max-h-[calc(100vh-88px)]`, giving the design's 28/20/60 gutters, with each column capped at `calc(100vh - 140px)` and scrolling on its own so the shell itself never has to.

**Relayout, not just restyle.** The absolutely-positioned header action row is gone, and with it the `pt-16` compensation on the left column and the `mt-4`/`mt-14` flip on the closed-sprint banner — both existed only to clear it. The complete-toggle is now a 26px round control inline to the left of the title. Under the title sits the metadata line: "in list" · list chip · status dropdown · "added {date} by {person}" (`Todo.createdAt` + `creator`, both already returned by `GET /api/todos/[id]`). **No card-ID chip** — no such field exists on `Todo`, and Decision 0 drops the element rather than adding the column. Below it, a responsive `repeat(auto-fit, minmax(192px, 1fr))` attribute grid holds Members, Labels (span 2), Due date and Priority, each under a mono `Eyebrow`. The two-column grid is `minmax(0,1fr) 232px`; the left column's padding is deliberately asymmetric (`20px 8px 28px 28px`) so its gutter sits under its own scrollbar, and the 232px rail is tinted `--ap-bg-sunken` with a `border-l`.

**Priority kept its own semantics.** `PRIORITY_COLORS` was retargeted from four raw hexes onto `--ap-none / --ap-warn / --ap-danger / --ap-ahead` rather than adopting the design's four hues, two of which have no token (§2.11). `TodoCard`'s duplicate `PRIORITY_DOT` map followed, and its private six-hex avatar palette was replaced with `lib/user-color`, so the same person is no longer one colour on the card and another everywhere else.

**Deleted.** `mode="drawer"` had no call sites: the branch, its portal, its `isDrawer` flag and the window-level Escape listener guarded by `if (mode !== 'drawer') return` (i.e. dead since the day it was written) are all gone. The `mode` prop survives narrowed to `'modal'` and marked deprecated, purely so `SprintBoardClient`'s existing `mode="modal"` keeps type-checking.

**Fixed.** ~70 `font-500` / `font-600` / `font-700` classes are **not valid Tailwind v3 utilities** — they rendered nothing. All are now `font-medium` / `font-semibold` / `font-bold`, which makes the card genuinely bolder for the first time. `DatesPanel` rendered two identical close buttons flanking its title; one is gone. `deleteLabel` used `window.confirm`; it now routes through `ConfirmDialog` and says what the blast radius is (labels are workspace-wide). All `rounded-[8px]/[12px]/[6px]/[5px]`, `rounded-md` and `rounded-lg` moved onto `--ap-radius-*`; popovers moved onto the `--ap-shadow-pop-*` ramp; the last hardcoded hex (`#AF52DE` on the objective search chip, `#61BD4F` as the default new-label colour) are gone.

**Not built**, per §6.4's deferred table: per-item due-date/assignee popovers stay as they already were (they exist and work — the deferral is about *adding* them, not removing them), no named/multiple checklists, no "Hide checked", **no tabbed Comments/Activity** (the existing stack is restyled in place), no comment formatting toolbar, no Reply/React. The `⌘↵` behaviour is unchanged; only the mono hint is new.

**Preserved and re-verified:** the `activePanel` single-slot state; every optimistic path with snapshot-and-rollback (members, labels, checklist item delete, comment delete, watch toggle); `sprintClosed` gating (disables complete, hides the comment composer, hides the whole rail, swaps the description copy); `DatesPanel`'s state machine (`activeTarget`, `pickDay` auto-drag, `rangeInvalid` gate, `outsideSprint` warning, `onRemove` clearing five fields); `RichTextContent` as the SEC-6 sanitisation boundary; the `z-[90]`/`z-[91]` scrim/panel pairing above Radix's `z-50`; and the `lanesLoaded && lanes.length === 0` guard that prevents a duplicate status control.

**Two judgement calls worth flagging.**
- The rail carries watch/more/close, and the rail is removed wholesale on a closed sprint — which would have taken the only close button with it. The same cluster is therefore also rendered inline at the top of the left column in that one case.
- Members, Labels and Dates now have two triggers (the attribute-grid control and the rail row) but **one** panel, anchored in the grid where there is room for it. Opening from the rail scrolls the grid back into view. The checklist and cover popovers stay in the rail and were sized to 212px to fit the 232px track, because a scrolling column clips horizontally whatever its children stick out by.

**Known gap.** §6.4's overlay scrim (`--ap-overlay` + `backdrop-filter: blur(3px)`) could not land here: the overlay is `DialogOverlay` in `components/ui/dialog.tsx` (`bg-black/10` + `backdrop-blur-xs`), which was out of this phase's scope. `globals.css` already defines `.ap-modal-overlay` with exactly the specified values — adding that class to `DialogOverlay` is the whole fix. The top-alignment and scrolling half of the requirement is done.

**Tests:** `npx tsc --noEmit` clean; `npm run test:cards` 9/9; `npm run test:security` 20/20 (SEC-6 included). `npm run build` **not** run — other agents were building concurrently. **No browser check yet.**

## 2026-09-17 — Design refresh Phase 4: the sprint board

Executes Phase 4 of `docs/design_refresh_IMPLEMENTATION_STRATEGY.md` (§6.3, with §2 tokens, §4.1 idioms, §5 metrics), against `design-import/Modal design optimization with Trello/Sprint Board.dc.html`.

**Lanes and board (`SprintBoardClient.tsx`).** 272 → **286px**, `10px` padding, `8px` gap, `--ap-radius-card` (12px), `1px solid oklch(1 0 0 / 0.8)` on `oklch(1 0 0 / 0.72)`, `--ap-shadow-sm`. The card scroller is now its own `overflow-y-auto` region at `max-height: calc(100vh - 340px)`. Lane headers took the design's shape: colour dot, 13.5px/700 name, mono count chip on `--ap-bg-sunken`, spacer, list menu. The empty lane gained the §4.1 dashed panel (`18px 12px`, `1px dashed oklch(0.86 0.01 262)`, 10px radius, 12.5px) — the design's "Nothing stuck right now…" copy is used on lanes mapped to `STUCK`, a neutral line elsewhere, since the copy is lane-specific but the state is not. The all/linked/unlinked filter is now the §4.1 segmented control (3px track, 2px gap, 26px pills) and `.ap-segmented`'s geometry; the progress bars are 6px on `--ap-kr-bar-bg` with the design's only two transitions.

**Cards (`TaskCardTrello.tsx`).** `10px` radius, cover strip `h-8` → **5px**, 10/11/11px body, 22×6px pill label chips, and one **21px meta chip row** at `--ap-radius-xs` (6px) carrying due / checklist / KR / watching — plus the existing attachment, comment, description and time-range signals, which the design has no slot for but which are live data. Hover is the specified `oklch(0.72 0.1 255)` border + `--ap-shadow-md`; both live in Tailwind classes rather than inline styles, because an inline `borderColor` would beat the `:hover` variant. Member avatars moved into the meta row's trailing slot (design), replacing the name-label footer — names remain on hover via `UserAvatarStack`. The KR chip keeps the key-result title truncated rather than the design's bare "KR", which would have dropped real information.

**Two token-retarget consequences fixed.**
- The URGENT stripe mixed `var(--ap-warn)` with a literal `rgba(255,149,0,0.5)`; post-retarget that was two different oranges. The second stop is now `color-mix(in oklab, var(--ap-warn) 50%, transparent)` — the same idiom `globals.css:1253` already uses.
- `SprintListManager` and `SprintPlannerView` drew lane edges with Tailwind's `border` (shadcn `hsl(var(--border))`). Both now take the board's own lane treatment, so the three surfaces agree. Control boundaries in those files moved to `--ap-border-strong` per §2's decorative/control split; `PlannerTimeGrid` stopped carrying a second copy of the status palette and reads `todoStatusMeta()` instead.

**"Add another list"** is 218 × 44 with the §4.1 white-on-white dashed ghost; its open state matches a lane exactly. The background picker adopted the §4.1 selection ring, the `--ap-shadow-pop-xl` ramp and 268px/40px swatches.

**Dark-background fork finished.** `dark` (true only for `graphite`) reached six places; it now also reaches the floating bar, the planner and its time grid, task cards, the mobile lane tab strip, the background-picker trigger, the sticky header chrome and the quick-add composer. The dock was the contrast-critical one: it was the only element that could not borrow the ground's darkness, and its active pill was `#007AFF` + white at **4.0:1**. It now flips to a dark fill with `oklch(0.96 0.004 262)` ink (~10:1) and an accent pill at 5.0:1, over the deeper `0 14px 34px -10px` dock shadow §2 specifies for dark docks. No hardcoded hex remains in any of the seven files.

**Not built, per Decision 0:** the per-lane `+` add-card button in lane headers (the lane-footer composer is the existing, canonical affordance). `SprintFloatingBar` stays inline — no `FloatingDock` extraction (§4, one consumer).

**Must-not-break, all verified in place.** `data-sprint-card` and `onCardKeyDown` are still on the card *wrapper*, not the card, so the `onDragOver` rect scan and the keyboard lift path are unaffected; the wrapper's new 8px spacing is `pb-2` on the wrapper rather than a flex `gap` on the scroller, because the always-mounted drop indicator is a flex child and `gap` would have reserved 8px above the first card at height 0. The rAF-throttled indicator with its ref dedupe, the optimistic reorder + rollback, the `?card=` deep link and its neutral SEC-5 message, the mobile lane tab strip, and `quickAddSignal` as a counter are all unchanged. All ten closed-sprint suppression points carried over (drag-over / drag-leave / drop / key handler / `readOnly` / drag-start / per-card drop line / list menu `disabled` / quick-add / add-list, plus the background picker and the board desaturation).

**Files changed:** `features/sprints/components/` — `SprintBoardClient.tsx`, `TaskCardTrello.tsx`, `SprintListManager.tsx`, `SprintFloatingBar.tsx`, `SprintPlannerView.tsx`, `PlannerTimeGrid.tsx`, `SprintBackgroundPicker.tsx` (the last only to accept and apply `dark`, which §6.3 lists in the fork).

**Verification** — `npx tsc --noEmit`: no errors in any sprint file (four pre-existing errors remain in `components/todos/TodoCardModal.tsx`, a concurrently-edited Phase 5 file). `npm run test:sprints`: 21/21 pass. `npm run build` deliberately not run (concurrent agents). **Not opened in a browser.**


## 2026-09-17 — Design refresh Phase 3: the app shell

Executes phase 3 of `docs/design_refresh_IMPLEMENTATION_STRATEGY.md` (§5, §6.1, §6.2). Scope was `components/layout/DashboardShell.tsx`, `components/layout/Sidebar.tsx`, `components/layout/Header.tsx` only.

**The width mismatch — a live bug, not a restyle.**
- The aside was `w-[220px] shrink-0` inside a `260px` grid column, so every desktop page carried a 40px strip of bare `bg-background` between the sidebar's `border-r` and the content column (12px when collapsed: 52px inside `4rem`). Both are now **228px / 52px**, and they read the *same* `--ap-sidebar-w` custom property rather than two literals that can drift apart again.
- **The pre-hydration branch used the expanded column regardless of the stored value.** `sidebarCollapsed` starts `false` and is only corrected in an effect, so a collapsed user got a 176px layout jump on every page load. A small boot script (`SIDEBAR_WIDTH_BOOT_SCRIPT`, exported from `Sidebar.tsx` so the storage key and the two widths stay in one file) sets `--ap-sidebar-w` on `<html>` before first paint; `DashboardShell` deliberately publishes no inline value until hydrated, then takes over so toggling stays reactive. The rail's *contents* still swap at hydration — fully fixing that needs the collapsed flag in a cookie, which is outside this phase.
- Grid rows moved `3rem` → `54px` to match the new top bar.

**Sidebar (§6.1).** 228px, solid `--ap-bg-raised` instead of `ap-glass`; 32px rows at 13px/500 with `--ap-radius-sm` (7px); 5px dot markers replace the per-item Lucide icons inside grouped nav; mono 9.5px/0.12em section eyebrows; active row is `--ap-accent-soft` fill + `--ap-accent-on-soft` text + weight 600 + accent dot. The design's three shapes map onto the real IA: single-item groups keep their icon (the design's "Dashboard"/"Filters" block), open multi-item groups render as eyebrow + dot rows ("MY WORK", "OKRS"), closed ones as a single row with a trailing chevron (the design's tail nav) — so the group-collapse affordance survives the flattening.
- Preserved: the collapsed icon rail and its portal flyout, the mobile drawer, `getVisibleNavigationGroups` permission filtering, `useNavOpenState`, the `okr-sidebar-collapsed` key, `isNavPathActive` / `getActiveNavContext`. **All 14 permission-gated nav groups are intact** — the design shows 3 and is an excerpt, not a replacement IA. `lib/dashboard-navigation.ts` untouched.

**Top bar (§6.2).** 54px; the 280px right-aligned search button is now a centred 420px field at 34px with `--ap-radius-md` (9px) and a mono `⌘K` chip; 26px profile avatar. It stays a button that opens the cmdk palette — turning it into a real input is a behaviour change this phase does not own. Deferred as instructed: the participant avatar stack with `+N` (`NavProgressCircles` already holds that slot with real data).

**Two pre-existing defects fixed while there.**
- **Two bottom borders.** The grid cell carried `border-b bg-card` *and* the `<header>` carried `ap-glass border-b`; the opaque `bg-card` underneath also cancelled the glass `backdrop-filter`, so the blur was pure cost. Resolved in favour of the design's solid bar — the wrapper is now plain, the header is `bg-[var(--ap-bg-raised)]` with one border. Nothing scrolls beneath it (main is a sibling grid row with its own `overflow-y-auto`), so the only thing the blur contributed was a stacking context, which `NavProgressCircles` already portals out of.
- **The notifications dropdown was fiction** — a literal `3` badge over three hardcoded strings. There is no `/api/notifications` list route to back it (only `.../preferences` and the cron writer). The fake badge and fake rows are gone; the dropdown now shows an honest empty state and routes to `/dashboard/notifications`, which *does* read `Notification` rows server-side. A comment marks where to restore the badge and preview once the route exists.

**Verification** — `tsc --noEmit` reports no errors in the three files (one unrelated error in `components/todos/TodoCardModal.tsx`, a concurrently-edited Phase 5 file). Every new arbitrary Tailwind utility was confirmed to compile by building the stylesheet to a temp file — including the grid track, which was initially written as a template literal that Tailwind's source scanner cannot see and would have emitted no CSS. `npm run build` deliberately not run (concurrent agents). **Not opened in a browser.**


## 2026-09-17 — Design refresh Phase 2: the four new primitives, three extensions, and four deletions

Executes Phase 2 of `docs/design_refresh_IMPLEMENTATION_STRATEGY.md` §4/§4.1. Scope was `components/ui/` plus one new shared hook; no call sites migrated — later phases do that.

**Built (4).**
- **`Eyebrow`** — ⚠ **default is non-mono, deliberately.** 249 eyebrows exist across 94 files and *not one* is mono, so shipping the design's mono eyebrow as the default would have been 249 visual regressions. The `default` size reproduces the 54-occurrence majority byte for byte (`text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`); `sm` (9.5px/.12em) and `md` (10px/.1em) are the design's two sizes, and `mono` is opt-in.
- **`FilterSelect`** — a thin styled wrapper over the Radix `ui/select.tsx`, *not* a hand-rolled div popover: the latter would drop listbox roles, type-ahead and arrow-key roving. Shape copied from `FilterBar.tsx:305-372` (labelled trigger, conditional search above 6 options, clear, remove). **Single-select only** — Radix Select has no multi-select mode, and the accessible multi-select pattern is a checkbox group rather than a listbox, so FilterBar's multi-select fields keep their own control for now. The search box calls `stopPropagation` on keydown; without it Radix's type-ahead also consumes the typing.
- **`EntityPicker`** — promoted from `components/sprints/LinkToOkrPopover.tsx`, the most complete of the 11 independent OKR pickers (recents, cascading expand, both entity types), then generalised with `selectable`, `recentKey`, `disabledIds` and `query`. `LinkToOkrPopover` is left in place; its call sites migrate in a later phase.
- **`SectionHeading`** — extracted out of `ui/dashboard/DashboardCard.tsx:14`, which now consumes it. Seven hand-rolled copies exist; two are byte-identical.

**`hooks/useOkrOptions.ts`** — one fetch strategy for OKR pickers. There were two for the same data: `LinkToOkrPopover` called `/api/objectives?limit=200` **and** `/api/key-results?limit=500` and re-joined them client-side, while `CheckInPickerModal` called `/api/objectives` alone. The second is right — `app/api/objectives/route.ts:104` already nests `keyResults` — so one request replaces two. Consolidating the component without the fetch would only have moved the duplication.

**Extended (3).**
- **`Popover`** — `width` (px) and `variant` ('menu' 5px/9px vs 'panel' 12px/11px). `width` also **selects the shadow step** from the `--ap-shadow-pop-sm…panel` ramp, so no call site picks elevation by hand. The design's own ramp is not monotonic (168 sits a step above 176); it is collapsed to a monotonic ladder — ~0.02 shadow alpha of difference — with a `shadow` prop to override. Omitting `width` keeps the legacy `w-[300px]` **class** and `--ap-shadow-lg`, which matters because the 3 existing call sites size themselves with `w-[260px]` and an inline width would have beaten it.
- **`ScrollArea`** — `orientation` ('vertical' | 'horizontal' | 'both'). The Root hardcoded one vertical `<ScrollBar>`, so horizontal scrollers (board lanes, the to-do table) had no thumb at all. Default is unchanged.
- **`Modal`** — highest-risk file here at 50 importers, so sizes are **additive only, never remapped**. Added `'940'`, the first fixed-px size; the ceiling was never the problem (`2xl` = 1152px is already wider than the design's 940). Added `accentColor` for the 6px top strip — **not** bound to card status, because the design hardcodes one value and that value matches no entry in the status colour map, so any mapping would be invented.

**Promoted, not duplicated.**
- **`MiniBadge`** → main barrel, with `tone` (neutral/accent/ok/warn/danger/ahead) and `mono`. `color` is kept and still wins over `tone`, so the 10 existing call sites render identically. **No `CountChip` was created** — this plus `.ap-kbd` already cover that shape; a third way to render a count makes it worse.
- **`Progress`** now matches the design (6px, 99px radius, `--ap-kr-bar-bg` track, `--ap-ok` fill, tokenised `fill`/`track` overrides for status tinting) and is exported. It had **zero consumers** while `ProgressBar` was re-implemented seven times. Being Radix-backed it also exposes `role=progressbar` + `aria-value*`, which none of the seven copies do. The 7 call sites are **not** migrated — that is a later phase.

**Deleted (4)** — each verified to have zero external consumers (referenced only by the barrel): `accordion.tsx` (81 lines), `alert-dialog.tsx` (199 — superseded by `ConfirmDialog`, 33 importers), `toggle-group.tsx` (89), `toggle.tsx` (47, whose only consumer was `toggle-group`). Barrel updated; the Radix `select` primitive `FilterSelect` wraps was also added to it, having never been exported. Net barrel count is unchanged at 32 files.

**Decided against.** `CountChip` and `FloatingDock` (§4 says don't — 1 real consumer for the dock, two existing equivalents for the chip). `StatCard`'s tone retarget and the `bg-muted0` fixes were already done in Phase 1. `DueDateChip` is deferred: §4 flags it as a behaviour change needing a deliberate vocabulary choice ("soon" is ≤2 days in `TaskCardTrello` but ≤7 in `ReportDashboardClient`), and the helper belongs in `lib/todos/due-tone.ts`, outside this phase's scope.

**Verification** — `tsc --noEmit` clean (exit 0; confirmed the new files are actually in the program by planting and removing a deliberate type error). `npm run build` **not run** — other agents were working in the repo concurrently. No browser check.

## 2026-09-17 — Design refresh Phase 0 + Phase 1: the live crash, and the token retarget

Executes phases 0 and 1 of `docs/design_refresh_IMPLEMENTATION_STRATEGY.md`. Phase 2 (primitives) onward is not started.

**Phase 0 — a crash that was live in production.**
- `lib/stores/todo-store.ts` read `data.todos`, but `GET /api/todos` returns the standard `{ success, data }` envelope. `data.success` was truthy, so `todos` was set to `undefined` and `TodosPageClient`'s `filteredRows` / `counts` memos threw on the next render. It fired on the page's only refresh path — `onUpdated` from `TodoCardModal` — i.e. **every time a user edited a to-do**. Now reads `data.data` behind an `Array.isArray` guard.
- `TodoItem.assignee` is nullable, matching `TodoRow`. That was the only difference between the two types, and the reason for the two `as any` casts in `TodosPageClient` — both removed.
- Same envelope bug fixed in `lib/stores/notification-store.ts`. That store has no consumers and calls two routes that do not exist, so nothing was breaking; it is now commented as a trap not to mount until those routes are built.

**Phase 1 — token retarget.**
- **`--ap-*` moved from `.apple-pro-surface, .theme-apple-full` to `:root`.** 97% of the ~2,300 `var(--ap-*)` call sites carry no fallback, so scoping the *definitions* meant any context without those classes rendered colourless. Only the custom properties moved: the block also sets `font-size: 13px`, and on `:root` that would rebase every `rem` in the app, so the applied properties stay on the scope class.
- All values retargeted to the design's oklch palette, **with the WCAG corrections from the audit rather than the design's own numbers** — the design fails AA in several places. `--ap-fg-faint` was 2.21–2.48 (below even the 3:1 large-text floor); `--ap-ok` and `--ap-ahead` could not carry white text; five values were outside sRGB and have had their chroma clamped so browsers stop gamut-mapping them differently.
- **`--ap-border` is now decorative-only and `--ap-border-strong` dropped to `oklch(0.62 …)`** for anything that identifies a control. The design's border values sit at 1.13–1.27 against every surface, against the 3:1 WCAG 1.4.11 requires for input outlines, checkbox edges and focus indicators. Documented inline — using `--ap-border` on an input is now an accessibility bug.
- New tokens: `--ap-radius-xs`, `--ap-accent-on-soft`, `--ap-focus`, a six-step popover shadow ramp keyed to popover width, `--ap-overlay`, `--ap-priority-low/high`.
- **Radius scale is measured, not estimated.** 7px (48 uses) and 6px (41) are the workhorses across the designs — 89 of 207 radii — and neither was in the first draft's scale. 14px occurs exactly once.
- **Dark mode wired end to end.** `darkMode: 'class'` added to `tailwind.config.js` (absent, so `dark:` variants were following `prefers-color-scheme` while the CSS keyed off a `.dark` class that nothing set). The class goes on `<html>`, not `<body>`, because `theme-body-class.tsx` rewrites `body.className` wholesale and would wipe it. The dark block previously defined ~20 of the tokens, so status-pill text, radii and shadows kept light values on dark surfaces; it is now complete. Appearance is a new light/dark/system axis in the theme store, defaulting to system.
- **`tailwind.config.js` had no `fontFamily` key at all.** Every `font-mono` in the app was resolving to Tailwind's default stack, so without this the mono face would have landed on two CSS selectors instead of the whole app.
- Fonts → Instrument Sans + IBM Plex Mono via `next/font`, referenced through the token variables. `app/layout.tsx` applied `inter.className` directly to `<body>`, which outranked `--ap-font-sans` — the token was defined but never rendered. **Noto Sans Ethiopic kept in the stack**: Instrument Sans has no Ethiopic coverage, and Amharic outside `.font-amharic`/`.letter-amharic` would have lost its fallback now that the token genuinely applies.
- **`'default'` theme removed.** It dropped both scope classes and so rendered the app colourless; after the `:root` move it would have been near-identical to `'apple'`. Store migrated to v2 so persisted `'default'` normalises rather than leaving the switcher with nothing selected.
- `.ap-glass` now reads `--ap-border` via `color-mix` instead of hardcoding `rgba(60,60,67,0.12)` — it would otherwise have kept the old border, a visible seam on every page. `.ap-modal` uses `var(--ap-radius-lg)` instead of a literal 20px; `.ap-switch` uses `--ap-ok` instead of `#34C759`; the `.ap-sidebar`/`.ap-topbar` helpers moved to 228/52/54.
- **294 hardcoded radii swept onto tokens** across 89 files (`rounded-[10px]` → `var(--ap-radius-sm)`, and so on). Retargeting the tokens alone would have done almost nothing — they had only 25 call sites, while ~250 literals matching the *old* token values sat in components. `Skeleton` at 14px under a 12px card was the most visible case.
- **Board backgrounds merged.** Every existing key preserved (the DB stores the key, not the colour, so this needs no migration), 10 mapped to the design's values, `sunrise` derived since it has no counterpart, `clay` added. `isDarkBackground()` unchanged — `graphite` is still the only dark preset on both sides.
- **`bg-muted0` fixed in all 3 places.** A typo generating no CSS rule: an **invisible modal backdrop** in `ParentObjectiveSelector`, a transparent avatar placeholder in `AssignUserModal`, and `StatCard`'s gray tone.
- **`StatCard` tones retargeted** from raw Tailwind palette to tokens. Each fill carries white text, so `yellow` deliberately uses `--ap-warn-fg` rather than `--ap-warn` — white on amber is 2.55:1 and cannot be fixed by lightness at that hue.

**Verification** — `tsc --noEmit` clean; sprints 21/21, cards 9/9, todos 14/14, automations 206/206, scrum 29/29, security 20/20; `npm run build` exits 0 (204 pages). **Not opened in a browser** — no visual check has been done on the retargeted palette, and that is the main outstanding risk given ~124 files outside this redesign change appearance.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## 2026-09-17 — Design-token retarget, part 2: the three hand-copied palette duplicates

`app/globals.css` was retargeted to an oklch palette. Three files held hand-copied snapshots of the old Apple-HIG hexes that nothing kept in sync, so they still rendered the pre-retarget colours.

- **`lib/design/apple-pro-tokens.ts` deleted.** A complete JS mirror of every colour, radius, font and shadow, with **zero importers** — the only references anywhere were two doc lines. Updating it would have produced a second source of truth that is right today and silently wrong after the next retarget; a missing file is better than a confident lie. Anything that needs a token value in JS should read the CSS custom property (`getComputedStyle`) or use `var(--ap-*)` directly. The stale `docs/APPLE_PRO_AUDIT.md` file-map row now points at the email snapshot instead.
- **`lib/email/templates/components.ts` — `TOKENS` converted to the new palette as sRGB hex.** Email clients support neither `oklch()` nor CSS custom properties (Gmail strips `<style>`/`var()`; Outlook renders unknown colour functions as black), so this one duplicate has to stay. It is now documented as a deliberate snapshot, each entry names its source `--ap-*` token, and the header states the conversion recipe and that it must be regenerated by hand whenever `globals.css` changes. Radii (xs 6 / sm 7 / md 9 / card 12 / lg 14 / pill 999) were added and wired into the markup that previously hardcoded 8/10/12/999px, and two off-palette literals (`#FAFAFC`, `#EEF0F3`) now use tokens.
- **Two contrast bugs fixed while in there.** `badge()` used each status *base* colour as text on its own soft fill — amber base on amber fill is 2.3:1 — and now uses the `--ap-*-fg` tokens (`successFg`/`warningFg`/`dangerFg`/`primaryOnSoft`), all of which clear 4.5:1. `button(variant='warning')` painted white on amber (2.4:1) and now uses ink, matching the explicit `--ap-warn` warning in `globals.css`.
- **`components/layout/AppleToaster.tsx` de-hardcoded.** It renders inside the app document, so it never needed a palette copy: `#1C1C1E`/`#FFFFFF`/`#000000`/`#34C759`/`#FF3B30`/`#007AFF` and the 12px radius are now `var(--ap-bg-raised)`, `var(--ap-fg)`, `var(--ap-ok)`, `var(--ap-danger)`, `var(--ap-accent)`, `var(--ap-radius-card)` and `var(--ap-shadow-md)`. That deleted the whole dark-mode mechanism — `useThemeStore` subscription, `useState`, and two `MutationObserver`s on `<html>` and `<body>` — because `:root.dark` flips the vars itself. (The old detector did already check `documentElement`, so it was working; it is simply no longer needed.)
- **Hex derivation** — converted oklch → oklab → LMS → linear sRGB → gamma-encoded sRGB, with chroma reduced at constant L/h for the four out-of-gamut values (the mapping browsers apply). The converter was validated against five known pairs first — `#F9FAFC`, `#0267C7`, `#D33A3C`, `#E2E5E9`, `#20242B` — all exact.
- **Files** — `lib/design/apple-pro-tokens.ts` (deleted), `lib/email/templates/components.ts`, `components/layout/AppleToaster.tsx`, `docs/APPLE_PRO_AUDIT.md`.
- **Tests** — `npx tsc --noEmit` clean. No unit tests touched (`npm run build` deliberately not run: another build was in flight).
- **Still open** — `lib/email/templates/index.ts`, `cards.ts` and `digest.ts` still hardcode radii (`14px`, `12px`) and a few greys inline rather than going through `TOKENS`; out of scope here.

## 2026-09-16 — Briefing promotion: the RAID write path extracted, and the promotion made atomic

Review follow-up on `POST /api/automations/briefings/[id]/promote` and `PromoteFindingModal`. The RAID branch worked, but it had been copy-pasted out of the register's own route.

- **~70 lines of RAID business logic moved out of the route.** `buildRaidItemData` (type-specific column nulling + P×I score), `createRaidItemRecord` (refCode allocation inside the caller's transaction) and `shouldEscalateRaidItem` now live in `lib/projects/raid.ts`; the activity row, the `RAID_HIGH_RISK_ADDED` escalation and the health recompute live in the new `lib/projects/raid-service.ts#afterRaidItemCreated`. **Both** writers — `app/api/projects/[id]/raid/route.ts` and the promotion route — call them, so the copies cannot drift again.
- **The drift they had already accumulated is gone.** Promotion accepted a title of 1–300 characters and then sliced it to 200, while the register requires 3–200; a long title is now rejected (and the modal says so before you submit), and the description the promotion generates is capped at the register's 2000 so a promoted item round-trips through the register's own PATCH.
- **The promotion is one transaction and one claim.** `claimPromotionKey` locks the briefing row (`SELECT … FOR UPDATE`) before reading `promotedJson`, and the record is created in the same transaction — two concurrent clicks no longer both pass the check, and a failure after the insert no longer leaves an orphaned RAID item that can be promoted again.
- **`assigneeId` is checked.** `RaidItem.ownerId` has no FK, so an arbitrary id used to persist silently and render as "no owner"; an unknown user is now a 400.
- **The project picker shows the writable scope, not the readable one.** New `GET /api/projects/for-selection` + `hooks/useProjectsForSelection.ts` (the sanctioned shared-hook shape, replacing an inline `fetch('/api/projects?limit=100')` in the modal) return the projects `getWritableProject` would allow, ordered, searchable and no longer capped at 100 — an EMPLOYEE who is merely a project member is no longer offered a form that 403s on submit.
- **A failed fetch is no longer reported as a permissions fact.** `projectPickerState` separates loading / error / empty, so a transient 500 on the projects list says "projects could not be loaded" with a retry, not "you are not a member of any project".
- **Files** — `lib/automations/promotion.ts` (new), `lib/automations/promotion-ui.ts` (new), `lib/automations/promotion.test.ts` (new), `lib/projects/raid.ts`, `lib/projects/raid-constants.ts` (new), `lib/projects/raid-service.ts` (new), `lib/projects/raid-create.test.ts` (new), `lib/projects/selection.ts` (new), `lib/projects/selection.test.ts` (new), `app/api/projects/for-selection/route.ts` (new), `app/api/projects/[id]/raid/route.ts`, `app/api/automations/briefings/[id]/promote/route.ts`, `features/automations/components/PromoteFindingModal.tsx`, `hooks/useProjectsForSelection.ts` (new), `hooks/index.ts`, `docs/SITEMAP.md`, `docs/FEATURE_STATUS.md`, `docs/PROJECT_MANAGEMENT_MODULE_TRACKER.md`.
- **Tests** — `npm run test:automations` 738/738, `npm run test:projects` 352/352, `tsc --noEmit` clean. 35 tests added. Each behavioural fix was proved against the old implementation first: a harness re-running the new assertions over the pre-change code fails all 7 (title truncation, 2-char title, unbounded description, the two-concurrent-clicks race, the unchecked ownerId, the membership claim on a fetch error, the readable-scope picker).
- **Still open (integration owners)** — `PromoteFindingPayload` in `features/automations/services/api.ts` still declares `target: 'TODO' | 'RISK'` with no RAID fields, so the modal still casts; and `getWritableProject` returns the project for any `DEPARTMENT_LEAD` who can merely read it (inherited, not introduced by this work).

## 2026-09-16 — Automations credential shelf: wired to Odoo, given a verify path, and made honest about rotation

Review follow-up on `lib/automations/credential-store.ts`. The store itself was sound (no secret leak, real auth on both routes); it was simply not connected to anything.

- **The `odoo` key was write-only storage.** `lib/odoo/client.ts` read `process.env.ODOO_KEY` directly, so an admin could rotate the Odoo key in the shelf, get a 200 and an audit entry, and nothing would change. Added `resolveOdooConfig()` — endpoint details still env-only, API key resolved store → `ODOO_KEY` — and `executeKw` now uses it. The read-only guard still runs **before** resolution, so a write is refused with no I/O at all, not even a database read. The endpoint check runs before the store lookup, so a deployment with no Odoo never pays for a query per call.
- **The UID cache would have survived a rotation.** It keyed on url/db/user only, so after a rotation every call for the life of the process would keep authenticating with the revoked key while the UI showed the new one. The cache key now includes the API key.
- **`lastVerifiedAt` was a column nothing ever wrote** — cleared on every rotation, selected into every read, permanently null. New `lib/automations/credential-verify.ts` + `POST /api/automations/credentials/[key]/verify`, modelled on `lib/ai/connection-test.ts`: one cheap authenticated probe per type (Tavily one-result search; Odoo `authenticate` on the common endpoint), a closed outcome set, no provider text in the response or the audit trail. A mailbox password reports `UNSUPPORTED` rather than pretending — and the list now carries a `verifiable` flag so the UI does not read a mailbox's null as a failure. Only a credential that actually came from the database is stamped, and the row is re-read inside the stamp so a key rotated mid-verification is `CONFIGURATION_CHANGED`, not "verified".
- **`updatedAt` was dropped from the summary**, and `createdAt` survives a rotation — so "when was this key last rotated", the one question that matters about a secret, was unanswerable. Added to the summary and to a single shared `select` so a field can never again be added to the interface and forgotten in one of three places.
- **The mailbox regex contradicted its own comment.** It admitted `/ ? & = %` and `'` in the local part; each of those breaks the `[key]` route (an unencoded `?` truncates the key, `%2F` is refused by common nginx configs), so POST could create a row that could never be read or deleted again. Narrowed to what a real address needs.
- **Files** — `lib/automations/credential-store.ts`, `lib/automations/credential-verify.ts` (new), `lib/automations/credential-verify.test.ts` (new), `lib/automations/credential-store.test.ts`, `lib/odoo/client.ts`, `lib/odoo/client.test.ts`, `app/api/automations/credentials/route.ts`, `app/api/automations/credentials/[key]/route.ts`, `app/api/automations/credentials/[key]/verify/route.ts` (new), `docs/SITEMAP.md`.
- **Tests** — `npm run test:automations` 662/662. 36 tests added across the three files. Each behavioural fix was proved by reverting it alone and watching the new test fail: the regex revert fails 2, the `updatedAt` revert fails 3, the UID-cache revert fails 1, the `executeKw` wiring revert fails 2. `tsc --noEmit` clean.
- **Still open** — no admin UI consumes these routes yet, and `lib/automations/tools/web-search.ts` wraps `resolveAutomationCredential` in a bare `catch` that falls back to `TAVILY_API_KEY`, which defeats the store's documented fail-loud behaviour for an undecryptable row. Both belong to other work in flight.

## 2026-09-16 — Design refresh: strategy doc for the Claude Design import (planning only, no code changed)

Imported three Claude Design files from `design-import/Modal design optimization with Trello/` — `Sprint Board.dc.html`, `To-dos List.dc.html`, `Task Card Modal.dc.html` — audited the current sprint board, to-dos page, card modal, sidebar and top bar against them, and wrote `docs/design_refresh_IMPLEMENTATION_STRATEGY.md`.

- **No source files were modified.** This entry exists because a doc was added.
- **Three decisions locked with the user.** The governing one is **Decision 0: the existing implementation takes precedence — the designs are a skin, not a product spec.** Where a design implies a feature, a schema field, or a product decision that differs from what is built, the existing implementation wins and the design yields. Then: (1) keep the `--ap-*` token architecture and retarget only the *values* to the new palette, so ~330 existing call sites inherit the look with no component edits; (2) adopt Instrument Sans + IBM Plex Mono app-wide.
- **Decision 0 rebalanced the plan.** The to-dos list had been scoped as "mostly net-new feature work" and was the largest phase; it is now a restyle and one of the smallest. Date grouping, row selection, the bulk-action dock, the priority column and the "Showing N of 150" total are all deferred to a backlog (§11) rather than built. Same for the card modal's ID chip, per-item checklist dates, named checklists and tabbed comments. Three carve-outs remain in scope because they are not features: defect fixes, WCAG corrections, and reuse consolidation.
- **Every claim in the doc was verified by a separate pass**, and several were corrected in the process: the dead `font-500/600/700` classes number **80**, not ~60 (70 of them in `TodoCardModal.tsx`); `bg-muted0` appears in **3** places, two of which are an invisible modal backdrop and a transparent avatar; `TodoDetailPanel.tsx` has *zero* references, not just no real importers.
- **The `done`/`completed` checklist mismatch is type-only — runtime is correct.** Written into the doc in bold, because the obvious "fix" (changing `TaskCardTrello` to read `done`) would break the badge.
- **Blast radius corrected upward by ~10×.** `--ap-*` is read at ~2,300 sites across 130 files; ~1,750 sit outside this redesign. `/dashboard/filters` alone has 275 refs and is effectively a fifth redesigned surface. Phase 1's gate is a full-app visual review.
- **Contrast-checked before committing to values.** An oklch→sRGB converter was written and self-verified, then every token pair tested. The design's own palette fails WCAG in several places: `fg-faint` at 2.21–2.48 (below even the 3:1 large-text floor), borders at 1.13–1.27 against the 3:1 that 1.4.11 requires for control boundaries, and white-on-`warn` at 2.55 — unfixable by lightness, since the required L is outside sRGB at that hue. Corrected values are in §2, with `--ap-border` split into decorative vs control roles.
- **Radius scale was wrong in the first draft and is now measured.** 7px (48×) and 6px (41×) are the workhorses and neither was in the original scale; 14px occurs exactly once. A fifth token (`--ap-radius-xs`) was added.
- **Primitive count cut from 7 to 4** after counting real call sites rather than design occurrences. `FloatingDock` has 1 consumer; `CountChip` duplicates `MiniBadge` *and* the already-dead `.ap-kbd`. Also found `components/ui/progress.tsx` has zero consumers while `ProgressBar` is re-implemented 7×, and 5 more barrel files are dead or single-use.
- **`Eyebrow` must not default to mono** — all 249 existing eyebrows are non-mono, so a mono default is 249 regressions.
- **26 open questions** (schema, API, product) are listed in §11 rather than assumed. The largest: lane counts in the design are server totals distinct from loaded cards, implying per-lane aggregates the board API may not return.
- **Verification** — none run; no code changed. `tsc` not run for the same reason.

## 2026-09-16 — STA-2 empty-state CTA, and the due-date reminder cron entry

- **STA-2 fixed** — the sprint board's empty-state "Create task" button carried an empty handler (`onClick: () => { /* opens via inline form below */ }`), so it had literally never done anything. `AddTaskInline` now accepts an `openSignal` counter (a counter, not a boolean, so repeat presses re-open it after a cancel); the button bumps it, scrolls the composer into view, and on mobile first switches to the lane that holds it — otherwise the composer would open on a lane the user cannot see.
- **Due-date reminders were deployed but inert.** `app/api/cron/todo-reminders` shipped and `docs/CRON.md` documented the schedule, but `scripts/install-crontab.sh` was never updated, so the entry would never exist on the VPS and no reminder could fire. Added, matching the existing `\$CRON_SECRET` convention exactly.
- **Staging note** — `scripts/install-crontab.sh` also holds uncommitted changes from the in-flight AI Automations work. Only this commit's three lines were staged (via a hand-built index entry), so that work stays uncommitted and intact in the working tree rather than being swept into this commit.
- **Build note** — local `npm run build` failed twice with unrelated `ENOENT` races (`_not-found.js.nft.json`, then `export/500.html`). Cause was a second `next build` running concurrently in the same directory from the parallel automations session, both writing `.next`. Rebuilding into an isolated dist dir via the new `NEXT_DIST_DIR` override passed at exit 0, 204/204 pages — which is also a live demonstration that the override works.
- **Verification** — `tsc --noEmit` clean; sprints 21/21, cards 9/9, todos 14/14, security 20/20; isolated build exits 0. The cron entry itself is only proven once `install-crontab.sh` is run on the VPS.

## 2026-09-16 — Fix: duplicate status control and header overlap on the card modal

Reported from the running app with a screenshot: the card showed **two "To Do" dropdowns**, and the top one sat on top of the card title.

- **Duplicate status control (my regression).** CDM-2 added a list chip to the modal header. A lane carries its `statusKey`, so moving lists sets status and setting status moves the card — which meant the new chip and the existing `StatusPill` were two controls for one value, both rendering "To Do", and able to disagree mid-update. The pill now renders only when the card has no lane to govern it (todos page, work board, or a card outside a sprint); inside a sprint the chip is the single control.
- **Header overlapped the title (my regression).** The header actions row is `absolute … top-4`, but the left column kept its original `p-6`, so with no cover the title rendered underneath the chip. The column now takes `pt-16` when there is no cover; a cover already provides the clearance.
- **No flicker while lanes load.** Gating the pill on `lanes.length === 0` alone made it appear and then vanish on every open, since lanes start empty and arrive async. A `lanesLoaded` flag holds it back until the answer is known, and if the lane fetch fails the pill still appears — the card is never left with no way to set status.
- **Read-only banner spacing** now follows the same cover/no-cover rule instead of a hardcoded `mt-14`.
- **Verification** — `tsc --noEmit` clean; sprints 21/21, cards 9/9, todos 14/14, security 20/20; `npm run build` exits 0. Not re-checked in a browser.

## 2026-09-16 — Production fix: chunk-load failures after deploy, plus SEC-6 and SHR-6

Triaged from a live report of "Loading chunk 7921 failed" on /dashboard/sprints. The chunk was serving a valid 200 at the time of investigation, which pointed at the deploy window rather than a bad build.

- **Root cause — `scripts/deploy.sh` deleted the live build before rebuilding.** It ran `rm -rf .next && npm run build` while PM2 was still serving from `.next`, so for the entire build (~8 minutes on this box) every static asset 404'd and anyone with the app open got a ChunkLoadError. Now it builds into `.next.build` via a new `NEXT_DIST_DIR` override in `next.config.js` and swaps with `mv`, so the gap is milliseconds. A failed build now leaves the running app untouched instead of leaving it assetless.
- **Second cause — chunk recovery was switched off in production.** `lib/dev-stale-chunk-reload.ts` already implemented one-shot reload on stale chunks, but both handlers in `app/providers.tsx` were gated behind `NODE_ENV !== 'development'`, so production users got the raw error with no recovery. Ungated, renamed to `lib/stale-chunk-reload.ts` (the `dev-` prefix is now actively misleading), docstring corrected, and the message matcher widened to non-numeric chunk ids and CSS chunks. This still matters after the deploy fix: a tab held open across a deploy asks for hashes that genuinely no longer exist, and only the client can recover from that.
- **SEC-6 fixed** — `TodoCardModal` injected comment bodies with `dangerouslySetInnerHTML` and no sanitization, while `RichTextContent` (DOMPurify allowlist, keeps `span`+`class` so mentions still style) sat unused next to it. Comments now render through it. The modal has zero raw-HTML injection left.
- **SHR-6 fixed** — a shared card link died at sign-in in three places, all needed: `middleware.ts` now exposes `x-pathname` (a server layout cannot read the request URL), `app/dashboard/layout.tsx` redirects with a `callbackUrl`, and `app/auth/signin/page.tsx` honours it instead of hardcoding `/dashboard`. The callback is validated to same-origin `/dashboard` paths, so restoring the target does not introduce an open redirect.
- **Reuse note** — the first draft of the chunk fix added a new `lib/chunk-reload.ts` before spotting the existing module. That duplicate was deleted and the existing one extended, per the repo's reuse-first rule.
- **Tests** — `lib/security/redirect-safety.test.ts` pins both fixes: the shared link round-trips, eight hostile callbackUrl values (absolute, protocol-relative, `javascript:`, malformed encoding) all fall back, the three SHR-6 pieces stay wired, and `TodoCardModal` contains no `dangerouslySetInnerHTML`.
- **Verification** — `tsc --noEmit` clean; `test:sprints` 21/21, `test:cards` 9/9, `test:todos` 14/14, `test:security` 20/20; `npm run build` exits 0. **Not verified:** the deploy-script change has not itself been run — it only proves itself on the next deploy.

## 2026-09-16 — AI Automations: smoke harness, and the pipeline actually runs

**The first real execution.** Everything before this was type-checked and unit-tested but had never touched a database or a worker. `scripts/smoke-automations.ts` (`npm run smoke:automations`) drives the real pipeline end to end and asserts 34 things unit tests structurally cannot.

- **Proven against a live Postgres**, on a throwaway database created and dropped by the run — the developer's own `okr_system` was never touched:
  - the Prisma schema matches the code (every query in the module executed);
  - the tick enqueues a due slot and advances `nextRunAt` to exactly what `computeNextRunAt` predicts;
  - **re-firing an already-fired slot creates no duplicate run** — the `@@unique([automationId, scheduledFor])` constraint does the work and the P2002 is swallowed, not counted;
  - one worker claims the run and **a second worker claims nothing** — `FOR UPDATE SKIP LOCKED` behaving as designed;
  - the lease holder can heartbeat and a non-holder cannot;
  - the runner produces a Briefing with all three renderings from real rows, releases its lease, and persists both a transcript and findings;
  - **DRY_RUN genuinely sends nothing** — briefing stays `DRAFT`, `publishedAt` is null, zero delivery rows;
  - a second run diffs correctly against the first: 1 NEW, 1 CHANGED, 1 UNCHANGED;
  - the reaper requeues a dead worker's run, increments `attempt`, and clears the lease.
- **Injection seam** — `executeRun(runId, { synthesize })`. Its only purpose is letting the harness drive the real pipeline without paying for a provider call; everything else runs exactly as it does in production, which is the point of a smoke test. `--live` uses the real provider.
- **Safety** — refuses any non-local `DATABASE_URL` without `--i-know`; the fixture is created in DRY_RUN so no email can escape; everything it creates is deleted unless `--keep`. `--create-owner` bootstraps a throwaway user so the harness works on a blank database.
- **Found while running it:** the local dev database was behind `schema.prisma` by 7 tables, 6 column additions and an index drop from *other* work in this repo — not just the automations tables. Flagged rather than pushed; `prisma db push` there is the developer's call to make, not this session's.
- **Verification** — `tsc --noEmit` clean; `test:automations` 143/143; smoke **34/34** against PostgreSQL 5432. **Still not run:** a live provider call (`--live`), the pm2 worker as a long-lived process, and browser QA.

## 2026-09-16 — AI Automations: the edit page

Last unbuilt item from P0/P1/P2a. `PATCH`, `useUpdateAutomation` and `PlanDiffView` all already existed — this wires them into a page.

- **One component for both modes.** `AutomationForm` now takes an optional `automation` prop rather than getting a parallel `AutomationEditForm`. The plan a user edits must be built by exactly the same code that built it originally, or the two drift and an edit silently changes a field the user never touched.
- **`planToFormState()` is the explicit inverse of the submit handler** — it rebuilds form state from a saved plan, including pulling the Odoo staleness window back out of the templated `{{now-Nd}}` domain where it lives. Commented as a pair so the next person changes both.
- **Widening edits are confirmed, not applied silently.** On save, the new plan is diffed against the *saved* one; if anything widens — runs more often, adds a source, more recipients, a higher cap, `onEmpty` flipping SKIP→SEND — a dialog shows the full grouped diff before writing. Narrowing edits save straight through, because tightening an automation is not the dangerous direction.
- **Re-compiling while editing diffs against what is actually scheduled**, not against a draft compiled a minute earlier — that is the comparison the user cares about.
- **The header states the consequence**: saving creates plan version N+1, and runs already queued keep the version they started with.
- **`AutomationEditPage`** loads before rendering, so the form derives its whole initial state in one pass instead of mounting empty and back-filling — which would flash wrong values and fight the user's first keystroke.
- **Verification** — `tsc --noEmit` clean; `test:automations` 143/143; `npm run build` exits 0. **Not run:** browser QA of the edit flow.

## 2026-09-16 — AI Automations P2a: the natural-language compiler

The headline feature from the original brief — describe a recurring task in a sentence and have the system schedule it. P2's other half (`web.search`/`web.fetch`) is still blocked on the search-provider decision; this half needed only OpenAI, which was already wired.

- **`lib/automations/compiler.ts`** — instruction → PlanSpec via OpenAI structured output. The compile happens **once, interactively**, and the user reviews the result before anything is scheduled. Re-prompting from free text on every run would make cost unpredictable, runs irreproducible, and let a vague sentence quietly change behaviour at 03:00 — §6.1 of the spec, now actually enforced by the architecture rather than just asserted in a document.
- **Two attempts, not a loop.** A plan that fails `validatePlan` is re-prompted **once** with the exact validation issues appended, then surfaced to the user with those issues. An instruction the model cannot compile twice is one the user needs to see the errors for, and an unbounded retry loop spends real money failing.
- **The model's authority is deliberately narrow.** It chooses schedule anchors, steps and synthesis. It does **not** choose recipients (an identity question the server resolves — the compiled plan always comes back with an empty recipient list) and does **not** choose cost caps or timeouts (a governance question the owner's grant fixes). Grants are *derived from the steps it produced*, so an Odoo step pins the specific model it asked for rather than handing over the whole allowlist.
- **It is told only about tools that are both implemented and credentialed** — `odoo.search` is omitted from the prompt entirely when Odoo is unconfigured, so it cannot propose a step that would fail at run time. It is instructed that if the instruction names a source it has no tool for, it must leave it out and say so in `notes` rather than fake it.
- **`notes` is surfaced verbatim** — every assumption the model made ("assumed 08:00 since no time was given") appears above the form so the user can correct it rather than discover it a week later.
- **`lib/automations/plan-diff.ts` (12 tests)** — grouped Schedule/Steps/Synthesis/Briefing/Recipients/Limits diff for FR-03. Changes that *widen* what the automation does — runs more often, adds a step, more recipients, a raised cost cap, `onEmpty` flipping SKIP→SEND — are flagged and sorted first, because those are the ones worth a second look. Frequency comparison is by preset rank, so WEEKLY→DAILY widens and DAILY→MONTHLY does not.
- **`POST /api/automations/compile`** — compiles without saving; returns the plan, derived grants, suggested name, notes, and (when `previousPlan` is supplied) the diff. Distinct status codes so the UI can say something useful: 503 no credential, 422 uncompilable with the issues, 502 provider unreachable.
- **16 compiler tests** covering the shaping of the model's flattened wire output: nulls dropped rather than written through, timezone taken from the caller and never the model, recipients always empty, caps server-fixed, grants derived per step, two Odoo steps collapsing into one grant listing both models, a step with a missing payload skipped rather than emitted broken, and quarterly/monthly anchors satisfying the validator.
- **Form** — a **Compile into a plan** button fills every setting below it, then shows what the model assumed and, on a re-compile, what changed. The copy states plainly that the plan is what runs, not the sentence.
- **Verification** — `tsc --noEmit` clean; `test:automations` 143/143 (115 + 16 compiler + 12 plan-diff); `npm run build` exits 0. **Not run:** a real compile call — the network path is unexercised, only the shaping logic is tested.

## 2026-09-16 — AI Automations: closing the P0/P1 gaps (export, promotion, transcripts, settings)

Finishes the spec'd-but-unbuilt items from P0/P1, and the four endpoints that had no screen on top of them. No new phase work — this is the module becoming usable rather than merely complete on paper.

- **FR-12 promote a finding** — `POST /api/automations/briefings/[id]/promote` turns one Finding into a Todo or a Risk, carrying its fields and a back-link to the Briefing. New `AutomationBriefing.promotedJson` records which `dedupeKey`s have been actioned so the UI can show "Created" instead of offering it twice. Deliberately manual: it is the escape valve that stops the generic-document model from being a dead end, without reintroducing the "AI created 300 tasks overnight" failure the DRY_RUN gate exists to prevent. The **Take action** list offers only NEW and CHANGED findings — re-offering unchanged items every run is the exact noise the diff exists to remove.
- **FR-13 export** — `GET /api/automations/briefings/[id]/export?format=pdf|docx` reusing the Letters pipeline (`renderHtmlToPdf`, `htmlToDocxBuffer`); no new dependency. The **email** rendering is the export source, not the in-app one: it is already a self-contained document with inline styles, whereas the in-app HTML relies on Tailwind classes that do not exist outside the app shell.
- **FR-17 cost visibility** — `monthToDateSpend()` sums `AutomationRun.costUsd` for the current month and the detail sidebar shows it against the monthly cap, turning red on breach. Summed from runs rather than `AiGenerationLog` so a run that burned tokens and *then* hit the timeout still counts — it cost real money.
- **FR-18 settings page** — `/dashboard/settings/automations`. Global pause sits outside the form so the kill switch never waits on a Save; cost cap, concurrency, timezone, retention and the domain allowlist are one form.
- **Run transcript viewer** — the per-step trace (tool, resolved args, duration, rows, preview, error) was reachable only by calling the API by hand. Now a modal off each run row, with refused steps styled distinctly from failed ones. Owner/admin only; the API already refused it to recipients.
- **Briefings list** — `/dashboard/automations/briefings`. Previously a recipient could only reach a briefing through the emailed link.
- **Edit and delete** — delete with a confirm that states briefings are retained; `useUpdateAutomation` is wired for the edit form that follows.
- **Files** — new: `app/api/automations/briefings/[id]/{export,promote}/route.ts`, `features/automations/components/{BriefingList,RunTranscript,PromoteFindingModal,AutomationSettingsForm}.tsx`, `app/dashboard/automations/briefings/page.tsx`, `app/dashboard/settings/automations/page.tsx`. Changed: `prisma/schema.prisma` (+`promotedJson`), `lib/automations/crud.ts`, the automation/briefing detail routes, the feature barrel, api client, hooks, `BriefingView`, `AutomationDetail`, `lib/dashboard-navigation.ts`.
- **Verification** — `prisma validate` passes; `tsc --noEmit` clean; `test:automations` 115/115; `npm run build` exits 0. **Not run:** `prisma db push` (the new `promotedJson` column needs it), any live run, browser QA.

## 2026-09-16 — AI Automations P1: Odoo CRM as an automation source

P1 of `docs/AI_Automations_Requirements_v1.0.md`. Most of P1's distribution half (REVIEW/AUTO, recipients, diffing, `onEmpty`, in-app notifications, run history) shipped inside P0, so this phase is the `odoo.search` tool and the plumbing it needed. Worked example A — the stalled-lead sweep — is now buildable from the UI.

- **Extracted `lib/odoo/client.ts`** — the hand-rolled XML-RPC codec, auth, and UID cache moved out of `lib/odoo-contacts.ts` so the Letters contact typeahead and the automation tool share one implementation instead of two copies. `lib/odoo-contacts.ts` drops from 289 to 64 lines and keeps its public API (`searchOdooContacts`, `isOdooConfigured`, `OdooContactsResult`) byte-identical; its only consumer, `app/api/letters/odoo/contacts/route.ts`, is untouched.
- **The client is read-only by construction.** `executeKw` refuses any method outside `READ_ONLY_METHODS` *before* doing any I/O, so a write cannot leave the process even when the ERP is reachable and a caller asks for one. Writing to Odoo is a separate decision that should get its own review, not something a plan can reach by accident.
- **13 tests for the codec, which previously had none** — `encodeCall` envelope shape, int-vs-double, boolean 0/1, XML escaping of both values and struct keys, domain nesting; `parseResponse` scalars, `search_read` row sets, entity decoding, many2one pairs, empty arrays, Odoo faults becoming thrown errors; plus the write refusal and the not-configured error being distinguishable.
- **`odoo.search` tool (`lib/automations/tools/odoo-search.ts`, 17 tests)** — narrowing happens in three layers, outermost first: the client's read-only guard, `ODOO_ALLOWED_MODELS` as the outer bound, then the grant's `models` list. `resolveAllowedModels` intersects rather than unions, so a grant naming a model outside the outer bound yields an empty allowlist rather than smuggling it in.
- **Odoo's value conventions are handled rather than stringified** — `false` means "unset" for every type (not the string `"false"`), many2one arrives as `[id, "Label"]` and resolves to the label, `write_date` is converted to an ISO instant the differ and prompt can actually parse, and identity fields are not duplicated into the row's `fields` bag. Per-model hints map title/subtitle/status/owner for the eight allowlisted models, with a default hint for anything else.
- **Domain validation** — a domain is validated for shape (`[field, operator, value]` triples interleaved with `&`/`|`/`!`, ≤40 terms) at both plan-validation time and tool time, so a malformed domain is a readable transcript entry instead of a 500 from the ERP.
- **`ToolContext` gained `grant`** — the runner now passes the matching grant to the tool, so tools that narrow by grant parameters read them from one place a plan cannot widen.
- **`GET /api/automations/tools`** — returns each tool's `available` (is it implemented in this phase?) and `configured` (are its credentials present?), plus whether an OpenAI credential exists. The form needs both to explain *why* something is unusable rather than silently hiding it.
- **Form** — an optional, collapsible Odoo section: record type, "untouched for N days" (compiled into a `[['write_date','<','{{now-Nd}}']]` domain the worker resolves), and a record limit. It renders disabled with an explanation when Odoo is unconfigured. The generated grant pins the chosen model, so a later plan edit cannot reach a different one.
- **Test glob fixed** — `test:automations` only matched `lib/automations/*.test.ts`, so suites under `tools/` would have been silently uncovered. It now includes `lib/automations/tools/*.test.ts` and `lib/odoo/*.test.ts`.
- **Verification** — `tsc --noEmit` clean; `test:automations` 115/115 (81 from P0 + 17 odoo.search + 13 odoo client + 4 new plan-validation cases); `npm run build` exits 0. **Not run:** any call against a real Odoo instance — the tool's I/O path is unexercised, only its pure logic is tested.

## 2026-09-16 — AI Automations P0: scheduled AI tasks that publish Briefings

First phase of `docs/AI_Automations_Requirements_v1.0.md`. A user configures a recurring task; a worker executes it; the output is a rendered HTML **Briefing** emailed to configured recipients. P0 ships the whole loop with one tool (`okr.query`) and no natural-language compiler — the plan is authored through a form, and the compiler lands in P2.

- **Schema (6 models)** — `Automation` (config + compiled plan + schedule mirror), `AutomationRun` (audit object: transcript, cost, lease), `AutomationBriefing` (the document, rendered three ways at creation), `AutomationBriefingRecipient` (per-recipient/channel delivery outcome), `AutomationCredential` (AES-256-GCM envelope, same pattern as `AiProviderCredential`), `AutomationSettings` (singleton: kill switch, caps, retention). `@@unique([automationId, scheduledFor])` on runs is what makes the tick exactly-once per slot — the same idea as `ScrumJobRun`.
- **Schedule engine (`lib/automations/schedule.ts`, 31 tests)** — 8 presets, IANA timezones, catch-up policies (SKIP / RUN_LATE / RUN_ONCE_LATEST), overlap policy, deterministic per-automation jitter, fiscal quarters injected from `Timeframe`, holiday suppression, and a 5-field cron parser. `nextRunAt` is always recomputed from the wall-clock rule rather than by adding a delta — there is an explicit test that a daily 09:00 London slot stays at 09:00 across the March DST transition, which a fixed-delta scheduler fails.
- **Execution split** — `POST /api/cron/automations-tick` (every minute, cheap, idempotent) only enqueues due slots; `scripts/automations-worker.ts` (pm2, `npm run worker:automations`) claims them with `SELECT … FOR UPDATE SKIP LOCKED`, heartbeats a 60s lease, and executes. `POST /api/cron/automations-reap` (every 5 min) requeues runs whose worker died, failing them explicitly after 3 attempts. The existing synchronous `/api/cron` pattern was deliberately **not** reused: a run takes 30s–5min and needs retries.
- **Distribution gate** — every automation starts in `DRY_RUN`; `REVIEW` routes the Briefing to the owner for approval; `AUTO` sends immediately. Promotion to AUTO is refused until at least one successful run exists, and the UI confirm names the recipient count. The gate is on *distribution*, because that is the irreversible side effect.
- **Findings + diffing (`findings.ts`, 12 tests)** — each finding carries a `dedupeKey` (hashed from plan-nominated fields, order-insensitive, normalised) and a `contentHash`. Run-to-run comparison yields NEW / CHANGED / UNCHANGED / RESOLVED; unchanged items collapse to one line and `onEmpty: SKIP` suppresses the email entirely when nothing is new or changed. Without this a daily scan re-reports the same twenty items every morning and gets muted in week one.
- **Briefing rendering (`render.ts`, 12 tests)** — one typed block list → in-app HTML (design tokens only, asserted hex-free), email HTML (600px tables, inline styles, light-mode pinned), and plain text. The model emits blocks, never raw HTML; all model text is escaped before the three allowed inline forms are applied, so `<script>` in a finding title renders as visible text. `javascript:`/`data:`/protocol-relative URLs are dropped.
- **Synthesis (`synthesis.ts`)** — OpenAI structured output via the existing `strict: true` JSON-schema pattern; cost lands in `AiGenerationLog` under the new `AUTOMATION_RUN` feature key with `planId = runId`, so automation spend appears in the existing AI dashboards rather than a parallel ledger. Collected rows are delimited and labelled untrusted; the synthesis call has no tool access, so injected text has nothing to act with. The model never emits `finding` blocks — only the server knows the previous run's contents.
- **Data visibility** — an automation executes as its owner. `okr.query` clamps the requested scope to the role ceiling (EMPLOYEE→OWNER, DEPARTMENT_LEAD→DEPARTMENT), excludes other people's private objectives/KRs, and adding a recipient never widens it. Recipients read the Briefing and nothing else — no plan, transcript, or cost.
- **Permissions** — `automation`, `automation_briefing`, `automation_settings` doctypes with a full role matrix, 8 sensitive field definitions, and the `canAuthorAutomations` / `canApproveAutomationGrants` capabilities, seeded idempotently by `npm run db:seed:automation-permissions`. Nav entry gated on `canAuthorAutomations`.
- **Deliberate deviation** — Briefing email goes through `sendMail` directly rather than `lib/notifications/dispatcher`. The dispatcher resolves recipients itself from the event key, which cannot express "whoever this automation lists"; and a Briefing is a document, not a templated notification. In-app rows are still written with `eventKey`/`category` set so they behave like every other notification.
- **Shared types extended** — `ActivityEntityType` gained `AUTOMATION`/`AUTOMATION_BRIEFING`, `ActivityAction` gained three automation actions, `AI_FEATURE_KEYS` gained `AUTOMATION_RUN`, and `isBlockedRecipient` is now exported so delivery can record SUPPRESSED distinctly from FAILED.
- **Verification** — `prisma validate` passes; `tsc --noEmit` clean; `test:automations` 81/81 (schedule 31, findings 12, plan 16, render 12, briefing 10); `npm run build` exits 0. **Not run:** `prisma db push` against any database, the worker against a live queue, a real OpenAI synthesis call, and browser QA.

## 2026-09-16 — Executable guardrails: API auth invariants + preflight idempotency

Test-only change. No production code touched. These are the checks §10 of the requirements calls for, and they attack the two risks this work has been accumulating: a route shipped without auth, and a preflight that is not safe to re-run.

- **`lib/security/api-invariants.test.ts`** — sweeps all 347 `app/api/**/route.ts` files and asserts every one uses `withAuth`/`withRole`/`withFeature`, or appears on an explicit exemption list that names *why* and the guard it must prove instead (`CRON_SECRET` for cron, `withPortalAuth` for the portal, `TELEGRAM_WEBHOOK_SECRET` for the webhook, NextAuth for auth routes, nothing for the health probe). A second test verifies each exempt route actually contains the guard its exemption claims, so an exemption cannot be used as a blanket excuse. Also pins decision D3: the schema must contain no `shareToken`/`publicToken`-style column, the share route must require a session and re-check `canViewSprint`, and every path it builds must start with `/dashboard/` — which is the single thing making "logged-in users only" true.
- **`lib/security/preflight-sql.test.ts`** — `scripts/preflight.sql` promises in its own header that re-running is a no-op, but nothing enforced it, and the file is now 700+ lines across three sections this work added. Asserts every bare `ADD COLUMN`/`CREATE INDEX`/`CREATE TABLE` carries `IF NOT EXISTS`, constraint changes only happen inside guarded `DO` blocks, adds are guarded either by `pg_constraint` or by the column-existence check that creates them, drops always check `pg_constraint`, the DM-2 statusKey unique constraint is dropped exactly once and never re-added, and the `columnId` backfill stays scoped to `"columnId" IS NULL` (without which a re-run would re-home every card and silently undo user moves).
- **Both suites were proved able to fail**, not just to pass: a temporary unguarded route made the auth sweep fail, and temporary non-idempotent SQL made two preflight assertions fail. Both were removed and the suites returned green.
- **One rule corrected rather than silenced** — the first version demanded every constraint-changing `DO` block check `pg_constraint`, which flagged four pre-existing blocks. Those turned out to be safe: they add the constraint inside the same `IF NOT EXISTS (column…)` guard that creates the column, so they can only run once. The rule was narrowed to match that reality (adds: either guard; drops: `pg_constraint` only) instead of being weakened to green.
- **Also found** — `lib/todos/access.test.ts` had existed with no npm script running it; 5 tests had been dormant. Now covered by `test:todos`.
- **Verification** — `tsc --noEmit` clean; `test:sprints` 21/21, `test:cards` 9/9, `test:todos` 14/14, `test:security` 15/15; `npm run build` exits 0.

## 2026-09-16 — Trello parity: dates popover, due-date reminders (DTE-*)

- **Schema** — `Todo.dueReminder` (AT_TIME | M5 | H1 | D1 | D2) and `Todo.dueReminderSentAt` (idempotency marker), plus an index for the cron scan and a matching idempotent `preflight.sql` section.
- **New pure module** — `lib/todos/due-reminders.ts`: lead-time table, `reminderFireAt` (counts back from the due *time*, or end-of-day for an all-day card so "1 day before" does not land at midnight), `shouldSendReminder` (fires once past the moment, never twice, skips finished cards, and drops reminders more than 6h stale so a cron outage cannot deliver a flood), and `shouldResetReminderSentAt` (re-arms when the card is rescheduled or the lead time changes).
- **Cron** — `app/api/cron/todo-reminders` on the same `CRON_SECRET` bearer pattern as the other routes, every 5 minutes because the shortest lead time offered is 5 minutes. Recipients are the card's members, watchers and assignee. `docs/CRON.md` updated with the entry and the rationale.
- **Notifications** — new `TODO_DUE_REMINDER` event key, IMMEDIATE cadence (batching a "5 minutes before" reminder into a daily digest would defeat it).
- **Dates popover** — reminder select with the helper text from the design; Recurring rendered disabled and labelled "coming soon" (DTE-5 was deferred by decision — it needs a recurrence engine and generator cron nothing has yet); due-before-start blocked with an inline message rather than silently corrected (DTE-6); a non-blocking warning when a date falls outside the sprint window (DTE-7); Remove now clears both dates, both times *and* the reminder in one request, since a reminder with no due date can never fire (DTE-8). `PATCH /api/todos/[id]` accepts `dueReminder`, coerces anything unrecognised to null, and clears `dueReminderSentAt` when the due date or lead time changes.
- **Deviation from DTE-1** — the spec called for rebuilding the panel on `AppleDateRangePicker`. The existing hand-rolled calendar already implements DTE-2 (independent start/due checkboxes) and DTE-3 (both times) and matches the design; replacing a working, already-Apple-styled calendar that cannot be exercised in a browser here would have risked the whole dates flow to gain presets. The missing behaviour was added to it instead. Same reasoning as the dnd-kit decision on 2026-09-16.
- **Found while testing** — `lib/todos/access.test.ts` existed but **no npm script ran it**, so 5 tests had been dormant. The new `test:todos` script picks them up; all 5 pass.
- **Verification** — `prisma validate`/`generate` pass; `tsc --noEmit` clean; `test:sprints` 21/21, `test:cards` 9/9, `test:todos` 14/14 (9 new + the 5 recovered); `npm run build` exits 0 and emits the new cron route. **Not run:** database migration, the cron itself, and browser QA.

## 2026-09-16 — Trello parity Phase 6: keyboard card movement and board a11y

- **A11Y-2 keyboard card movement** — cards can now be moved without a mouse: Space/Enter lifts, arrow keys move (left/right between lists, up/down within a list), Space drops, Escape reverts to the snapshot taken on lift. Arrow presses mutate local state only; a single reorder request fires on drop, and a cross-list move writes the destination lane's status exactly as a pointer drop does. Every step is announced through the Phase 1 live region.
- **Deliberate deviation from the spec, recorded here.** The spec (A11Y-2) called for *replacing* HTML5 drag-and-drop with `@dnd-kit`. This implements a **parallel** keyboard path over the same reorder endpoint and leaves pointer drag untouched. Reason: a wholesale swap of the board's primary interaction cannot be exercised in a browser from this environment, so replacing working pointer-drag to fix a secondary path risked breaking the main one on evidence no stronger than a passing type check. Migrating both paths onto dnd-kit remains the right long-term move and is still open.
- **A11Y-8 list semantics** — each lane's card stack is a labelled `role="list"` ("In Progress, 7 cards") and each card a `role="listitem"` whose accessible name states its list, position and how to move it. A lifted card carries a focus ring so the eye can follow the arrow keys.
- **A11Y-5** — named the two remaining icon-only board controls: the header overflow button and the assignee filter select.
- **PRF-4 virtualisation NOT done, and why** — virtualising lanes over 50 cards conflicts head-on with the current pointer-drag implementation, which computes the drop index by scanning every `[data-sprint-card]` rect in the DOM. Removing off-screen cards from the DOM would silently corrupt drop positions. This depends on the dnd-kit migration above and should land with it, not before.
- **Verification** — `tsc --noEmit` clean; `test:sprints` 21/21; `test:cards` 9/9; `npm run build` exits 0 (192/192 pages; an earlier run was killed by a sandbox OOM, re-run clean with a larger heap). **Not run:** database migration and browser QA. The keyboard path in particular has never been exercised by an actual key press — it is verified by types and build only.

## 2026-09-15 — Trello parity Phase 4: card modal parity + card sharing

- **Modal primitive fixed first** — `components/ui/Modal` rendered **no `DialogTitle` at all** when `hideHeader` was set, so such dialogs were announced unnamed and Radix logged an error. It now renders an sr-only title + description in that case, and gained `showCloseButton` and `preventInitialFocus` escape hatches.
- **CDM-1 — card modal now has a focus trap.** `TodoCardModal` was a hand-rolled portal with no focus trap, no focus restore and no scroll lock. In `mode="modal"` it now renders inside the shared `Modal` (Radix), which supplies all three; the body was extracted to a variable so `mode="drawer"` keeps its side-sheet portal unchanged. The window-level Escape listener is now scoped to drawer mode — Radix dismisses only the topmost layer, which is the correct behaviour.
- **CDM-2 list chip** — header chip showing the card's list, with a menu to move it. Sends only `columnId`; the server derives status from the lane. This is also the mobile move path, since HTML5 drag does not work on touch.
- **CDM-3 / CDM-4** — header actions row: mark-complete circle (toggles COMPLETED ↔ PENDING), watch toggle (Phase 1), an overflow menu (Copy card link, Delete card), and close.
- **CDM-5 / CDM-6 / CDM-7** — the rail is now "Comments and activity" with a **Hide details** toggle persisted per viewer in `localStorage`; comments gained inline **Edit** and **Delete** wired to the routes that already existed but had no UI. `PATCH`/`DELETE /comments/[commentId]` now also allow EXECUTIVE, which was excluded while being treated as ADMIN-equivalent everywhere else; the client mirrors the same rule so it never offers an action the API refuses.
- **CDM-10 / CDM-11** — a Formatting help popover beside description Save/Cancel; and a closed sprint now renders the card **read-only** (banner, no list chip, no mark-complete, no delete, no composer, no right sidebar) instead of offering controls the API answers with 409.
- **Delete** — `window.confirm` replaced with the project-standard `ConfirmDialog`, stating what is removed and what is kept.
- **SHR-1/3/4/5/7 (Phase 5 brought forward)** — the overflow menu's Copy card link required the share flow, so it landed here. New `POST /api/todos/[id]/share` records a `TODO_SHARED` activity and returns the canonical path; **no token is minted and no route outside `/dashboard` is added** — the recipient must sign in and pass `canViewSprint`. Not-found and forbidden return the same response so the link cannot be used to probe card ids. `SprintBoardClient` opens `?card=<id>` after the board loads, then strips the param so a refresh does not reopen it; an unavailable card shows a neutral "That card isn't available."
- **Verification** — `tsc --noEmit` clean; `test:sprints` 21/21; `test:cards` 9/9; `npm run build` exits 0. **Not run:** database migration and browser QA.
- **Deliberately not done** — CDM-9 (label rename/recolor) is blocked on assumption **A3**: it needs `PATCH /api/todo-labels/[id]` loosened from ADMIN-only, which has not been confirmed, so permissions were left alone. The `ATC-*` "+ Add" menu is not restyled — the right sidebar already exposes every one of those actions. `DTE-*` (dates popover rebuild, reminders, recurring) is untouched; DTE-4 needs a new notification EventKey plus a cron tick, and DTE-5 was deferred by decision.

## 2026-09-15 — Trello parity Phase 3: card labels, covers and colour-blind patterns

- **Schema** — `Todo.coverSize` ('BAND' | 'FULL', null behaves as BAND), `TodoLabelDef.pattern` (colour-blind texture, null derives one from the colour so no backfill is needed), `UserPreference.colorBlindMode`. Matching idempotent `preflight.sql` section; existing covers are set to BAND so they look unchanged.
- **New module** — `lib/card-visuals.ts`: one `CARD_PALETTE` of ten swatches shared by labels and covers (they were previously two separate arrays of raw hex inside `TodoCardModal`, so a label colour and a cover colour could never agree), each with a distinct colour-blind texture; `swatchStyle()` applies a pattern only when the viewer has colour-blind mode on; `relativeLuminance`/`contrastRatio`/`readableInk` pick title ink for full-bleed covers. The ten colours are also registered as `--ap-card-*` tokens in `globals.css`, so components no longer carry hardcoded hex.
- **Preference** — `colorBlindMode` added to `UserPreference`, `/api/user-preferences` and `lib/stores/user-prefs-store`, toggled from the cover popover and applied board-wide (cards, modal chips, both colour pickers).
- **Card front** — `TaskCardTrello` gained the label strip above the title (each chip carries `aria-label` and, in colour-blind mode, its texture), cover rendering in both BAND and FULL modes with luminance-picked ink, and attachment-count + has-description badges. Board payload now returns `_count.attachments`; `description` was already present. Existing priority dots, urgent stripe, OKR pill, carryover badge, date-chip tones and the checklist "green only at 100%" rule are untouched.
- **Cover popover** — rebuilt per the design: Size (Band / Full bleed), the ten patterned swatches, a colorblind-friendly-mode toggle, and Remove cover. Image upload and Unsplash remain deliberately out of scope (decision D2).
- **Verification** — `prisma validate`/`generate` pass; `tsc --noEmit` clean; `npm run test:sprints` 21/21; new `npm run test:cards` 9/9 — including a check that **every palette colour reaches at least 4.5:1** against the ink `readableInk` chooses, which is the acceptance criterion for full-bleed covers; `npm run build` exits 0. **Not run:** `prisma db push`/preflight against any database, and no browser QA — the visuals are verified by unit tests and build only, not by looking at them.

## 2026-09-15 — Trello parity Phase 2: dynamic board lists

- **Schema** — `Todo.columnId` (nullable, `onDelete: SetNull`) + `@@index([columnId, sprintPosition])`; `SprintColumn.archivedAt` (soft delete) and `@@index([sprintId, archivedAt])`; `Todo.column` / `SprintColumn.todos` relation. Dropped `@@unique([sprintId, statusKey])` so several lanes may share one status ("QA" + "Review" → IN_REVIEW, "Done" + "Shipped" → COMPLETED). `statusKey` stays nullable at the DB level — see the implementation note in the requirements doc — with the API enforcing it instead.
- **preflight.sql** — new "Dynamic board lists" section: drops the unique constraint, adds `archivedAt`, backfills legacy null `statusKey` values by lane name (fallback PENDING), adds `initiatives.columnId` + FK + index, and backfills every sprint-attached todo into its sprint's lowest-positioned lane matching its status. The older block that *created* the dropped constraint is neutralised so repeat runs don't fight each other. All blocks idempotent.
- **New service** — `lib/sprints/columns.ts`: `DEFAULT_LANES` (now single-sourced into `POST /api/sprints`), `getSprintLanes` (self-healing — a sprint with no lanes gets the defaults rather than an empty board), `laneForStatus`, `resolveLane` (explicit `columnId` wins, else status fallback, so pre-backfill rows and cards whose lane was archived still render), `isBoardStatusKey`, `nextLanePosition`.
- **APIs** — `GET /api/sprints/[id]/board` now renders lanes from `SprintColumn` instead of a hardcoded 5-status array, returning `statusKey`/`color`/`position`/`cardCount`; `GET /api/sprints/[id]/columns` added; `POST /columns` requires a valid `statusKey`; `PATCH /columns/[colId]` renumbers siblings inside a transaction (it previously wrote one row's `position` with no transaction, leaving duplicates) and bulk-remaps card status when `statusKey` changes; `DELETE /columns/[colId]` is now a soft archive that re-homes cards via `?moveTo=`, refusing to remove the last lane or the last Done lane; `POST /board/reorder` keys on lane id (legacy status keys still accepted) and writes `columnId` + `sprintPosition` + `status` in ONE transaction — the client previously fired two independent requests, so a failure between them could leave a card in "Done" still marked PENDING; `PATCH`/`POST /api/todos` understand `columnId`, derive status from the lane, reject a lane belonging to another sprint, and clear `columnId` when a card leaves a sprint.
- **Regression paths wired** — AI pipeline parks drafts in the sprint's To Do lane; sprint close maps carried cards into the *next* sprint's lanes (lane ids are per-sprint, so the arriving `columnId` would otherwise dangle) and nulls `columnId` on backlog/cancel; clone copies only non-archived lanes and places copied cards in the clone's own To Do lane.
- **UI** — `features/sprints/components/SprintListManager.tsx` (new): `AddListColumn` ("+ Add another list" with a required status mapping) and `ListHeaderMenu` (rename / change status mapping / archive, with card-count warnings and destination picker). `SprintBoardClient` renders lanes dynamically, keys drag-and-drop and the mobile tab strip on lane ids, shows lane colour dots, announces card moves through the Phase 1 live region, rolls back and refetches on a failed reorder, and creates new cards directly into their lane. Removed the now-dead `moveTodo` helper.
- **Verification** — `npx prisma validate` and `prisma generate` pass; `npx tsc --noEmit` clean; `npm run test:sprints` 21/21 (12 existing + 9 new in `lib/sprints/columns.test.ts` covering multi-lane statuses, archived-lane fallback and CANCELLED exclusion); `npm run build` exits 0. **Not run:** `prisma db push` and the preflight against any database, and no browser QA — the lane UI is verified by types, unit tests and build only.

## 2026-09-15 — Trello-parity sprint board: requirements + Phase 1 foundations

- **New spec** — added `docs/trello_parity_sprint_board_REQUIREMENTS.md`: implementation-ready requirements translating the reference board design into this system's sprint architecture. Covers 9 surfaces, 7 journeys, data-model deltas (DM-1..6), API changes (API-1..12), and 15 requirement groups (BRD/LST/CRD/CDM/CVR/DTE/ATC/SHR/FLB/STA/RSP/A11Y/SEC/PRF/REG), each with Given/When/Then acceptance criteria. Locked decisions: dynamic lists mapped to a status, cover colours + colour-blind patterns only, share as an authenticated in-app deep link with no tokens or anonymous access, Custom Fields deferred.
- **Defects identified during the audit (not yet fixed)** — Backlog tab calls `?sprintId=null` where `/api/todos` expects `?noSprint=1`, so it returns zero rows; `POST/PATCH/DELETE /api/sprints/[id]/columns*` omit the `canEditSprint` check that `board/reorder` performs; `GET /api/sprints/[id]/board` ignores `SprintColumn` entirely in favour of a hardcoded 5-status array, leaving both column routes unreachable from the app; `TaskCardTrello` renders a watcher badge from a field no API populates; three checklist buttons in `TodoCardModal` have no click handlers; `TodoCardModal` is a hand-rolled portal with no focus trap.
- **Phase 1 foundations (code)** — added `components/ui/popover.tsx`, a Radix-backed `Popover` primitive replacing hand-rolled absolutely-positioned popovers (its visible header prop is `heading`, not `title`, to avoid clashing with the HTML `title` attribute); added `components/shared/LiveAnnouncer.tsx`, the app's first `aria-live` region, with a context-free `announce()` helper, mounted in `app/layout.tsx`; added a global `prefers-reduced-motion` block to `app/globals.css` collapsing animation/transition durations and stopping the status-dot pulse and skeleton shimmer.
- **Phase 1 defect fixes (code)** — Backlog tab now calls `?noSprint=1` instead of `?sprintId=null` (the string "null" is truthy, so the tab always returned zero rows); `POST /api/sprints/[id]/columns` and `PATCH`/`DELETE .../columns/[colId]` now go through a new `sprintEditGuard` (existence + closed-state + `canEditSprint`) and verify the column belongs to the sprint in the URL — previously any signed-in user could create, rename or delete another team's columns; `GET /api/sprints/[id]/board` now returns per-todo `watchers` scoped to the viewer, so the watcher badge `TaskCardTrello` renders is no longer dead; `TodoCardModal` gained a Watch/Unwatch toggle wired to the existing `/api/watchers`, and its three previously handler-less checklist buttons now set a due date, assign a user, and rename/delete the item via the existing item `PATCH`/`DELETE` routes.
- **Phase 1 interaction fixes** — `TodoCardModal`'s window-level Escape handler no longer closes the whole card when a nested popover, dropdown, date picker or inline rename is consuming the key; the checklist `ActionsMenu` trigger passes an icon rather than a nested `<button>`.
- **Docs** — `docs/DESIGN_SYSTEM.md` §12 now records which token system applies where (`--ap-*` on sprint/card surfaces, Tailwind config tokens elsewhere), the three known divergences (`rounded-card` 12px vs `--ap-radius-card` 16px; `shadow-card`; `ease-apple` vs `--ap-spring`), and the unresolved focus-ring divergence.
- **Verification** — `npx tsc --noEmit` clean; `npm run test:sprints` 12/12 pass; `npm run build` exits 0 (192/192 static pages); `git diff --check` clean. No schema change and no migration — Phase 1 is additive code only. The repo has no ESLint config, so lint was not run. Not manually exercised in a browser.

## 2026-08-17 — Project archive control

- **Discoverable lifecycle action** — added Project settings to the delivery-control drawer with a permission-aware Archive project action, explicit retained-data/no-notification consequences, pending state, and shared `ConfirmDialog`; success returns to the active Projects directory.
- **Atomic safe archive** — connected the existing project `DELETE` endpoint through a TanStack Query mutation and made the soft-archive update plus required `ARCHIVED` activity audit commit in one transaction.
- **Verification** — focused archive-flow tests, Project Management regression, TypeScript, production build, and diff check.

## 2026-08-17 — Project creation modal repair and project-type template linking

- **Responsive creation UI** — reduced New Project from the full-width `2xl` dialog to `xl`, replaced the visually colliding stacked progress bars with clearly labelled responsive Project creation and Manual setup step cards, and preserved internal scrolling and draft controls.
- **Type-first schedule selection** — Manual creation now requires Website, Web Portal, Data Platform, Mobile App, Banking App, ICT Equipment Supply, or Import before review. The template step filters linked templates, labels exact matches as recommended, keeps Start blank, previews the selected schedule, and links directly to template management.
- **Linked template library** — added a nullable `ProjectTemplate.projectType`, API/list/builder/create/clone support, directory type filtering/badges, seven type-linked system schedules plus the three existing general schedules, and idempotent production seeding after schema sync. Existing project/template copy semantics remain unchanged.
- **Verification** — focused type/template tests pass 4/4, project-creation regression passes 108/108, full Project Management regression passes 331/331, Prisma generation and TypeScript pass, and the production build succeeds. Browser visual QA is performed after CI/CD deployment.

## 2026-08-17 — Project creation P2 Story 2.4: ordered DOCX extraction and untrusted-data framing

- **Ordered DOCX sources** — added a Mammoth-backed extractor that reads top-level headings, paragraphs, and tables in document order, retains nested heading context and table cells, assigns stable source IDs/references, detects candidate project-information categories, and persists bounded plain-text evidence as typed normalized DOCX sources. Configurable defaults enforce 200 saved/explicit pages, 10,000 blocks, and 500,000 extracted characters.
- **Secure Import integration** — extended the existing project-file upload boundary and react-hook-form Import surface to DOCX. Files are still MIME/signature/archive/malware checked and privately retained before extraction; safe parse/limit errors preserve the draft. The review handoff reports extraction counts and explicitly states that document instructions were not executed, no AI values were applied, and no project was created.
- **Prompt-injection boundary** — added a fixed, versioned AI-facing framing helper that places credential-redacted/bounded document content only in a JSON payload labelled `UNTRUSTED_PROJECT_DATA`. The invariant system message rejects commands, role/tool/access requests, and output overrides contained in the document. Story 2.4 does not call a provider or persist provider output.
- **Verification and ledger** — AC11 and mandatory TEST AC13 pass. Story 2.4 tests pass 4/4, project-creation passes 108/108, PM regression passes 327/327, TypeScript and production build pass, and `git diff --check` is clean. Story 2.5 has not started.

## 2026-08-17 — Project creation P2 Story 2.3: explicit AI cleanup change acceptance

- **Change-list user control** — added a dedicated read-only `ChangeListPanel` to the shared review workspace. Every proposal shows its target, cleanup kind, original → proposed value, reason, confidence, and decision status. Users can accept or reject proposals individually; values remain unchanged while proposed, rejection preserves the current value, and accepted decisions remain undoable in the existing review history until saved.
- **Fail-closed decisions** — added a pure proposal decision/transition service with prototype-safe paths, stable-ID array lookup, immutable proposal evidence, terminal accepted/rejected states, exact current-value conflict detection, and explicit replacement or whole-row deletion semantics. Safe grouped acceptance is limited to verified capitalization/whitespace cleanup on approved text fields and excludes dates, durations, owners, assignees, deliverables, rows, and dependencies.
- **Server enforcement and audit** — optimistic draft updates now validate cleanup transitions transactionally instead of trusting client status changes. Accepted and rejected proposal IDs are recorded through explicit required audit actions without source values, proposal values, prompts, or credentials. Trusted server processing retains an explicit path for introducing new proposals; clients cannot add or rewrite them.
- **Verification and ledger** — AC10 passes. Story 2.3 tests pass 4/4, the project-creation suite passes 104/104, PM regression passes 323/323, TypeScript and production build pass, and `git diff --check` is clean. Story 2.4 has not started.

## 2026-08-17 — Project creation P2 Story 2.2: AI-assisted editable column mapping

- **Proposal-only AI path** — added an authenticated, owner/capability/version-gated endpoint that rereads and integrity-checks the retained clean spreadsheet, applies the independent project-creation AI flag, verified DB-first OpenAI credential, allowlisted model, organization daily cap, per-user cooldown, and bounded structured output. It returns a mapping proposal only; it never writes the draft, normalizes schedule values, creates a project, or changes the draft version.
- **Strict user control and privacy** — exact deterministic matches cannot be replaced. AI output is schema-validated against known targets/source keys, unique source usage, bounded reasons, and 0–1 confidence. The mapping screen identifies the external OpenAI transfer, sends only bounded/redacted headers plus three samples, shows original → proposed, reason, and confidence, keeps selects editable, preserves manual fallback on AI failure, and requires the existing separate Approve mapping action before normalization.
- **Safe observability** — requested/proposed/failed ActivityLog events and AI generation usage/cost/latency/status are recorded without prompt/source content, raw provider messages, credentials, or internal paths. Output tokens are capped and failures return a safe manual-fallback message.
- **Verification and ledger** — AC7 is now fully passing. Focused AC7 tests pass 3/3, the project-creation suite passes 100/100, PM regression passes 319/319, TypeScript and production build pass, and `git diff --check` is clean. Story 2.3 has not started.

## 2026-08-17 — Project creation P2 Story 2.1: secure upload storage and file safety

- **Fail-closed safety gate** — added a server-only upload security service that verifies CSV/XLS/XLSX/DOCX signatures and Office container structure, rejects extension-specific MIME mismatches, encrypted/malformed/macro-enabled or active-content files, unsafe archive paths/duplicates/compression methods, ZIP64/multipart archives, and configurable entry/count/expanded-size/compression-ratio limits before parsing or extraction.
- **Private retained sources** — clean files are stored outside `public/` with a generated UUID name, private directory/file permissions, SHA-256 hash, canonical detected MIME, and an opaque strict source reference. User filenames remain metadata only. The source reference is persisted for later processing but excluded from API responses and audits; failed writes are cleaned up, and replacement, method switch, and draft discard remove retained sources.
- **Required malware scanning** — added a dependency-free ClamAV INSTREAM client configured by `PROJECT_CREATION_CLAMAV_HOST`/port/timeout. Malware, scanner unavailability, and storage unavailability return safe distinct errors; no unscanned file is stored or parsed. `.env.example` documents storage, scanner, and archive-safety settings.
- **Verification** — Story 2.1 owns no numbered AC rows. Five dedicated security tests cover private generated storage and cleanup, 0600 permissions, malware/unavailable fail-closed behavior, signature mismatch, encryption, macros, traversal, ZIP bombs, public-root refusal, scan-before-parse wiring, safe persistence, and error envelopes. Focused tests pass 97/97, PM regression passes 316/316, TypeScript and production build pass, and `git diff --check` is clean. Temporary test storage was removed. Story 2.2 has not started.

## 2026-08-17 — Project creation P1 Story 1.10: atomic confirmed commit

- **One controlled commit path** — Manual and deterministic Import now share the same Create Project action. Commit remains disabled while blocking validation, unacknowledged warnings, unresolved changes/assumptions, invalid metadata/hierarchy/dates/references, or dependency cycles remain. The final confirmation repeats exact hierarchy/deliverable/dependency counts, project context, acknowledged-warning count, and the Planning/unbaselined/no-notification consequences.
- **Atomic and idempotent service** — added a creator-private, versioned commit endpoint and transaction coordinator that reauthorizes capability/department/PM scope at commit time, claims the draft, reuses the existing project creation service inside the outer transaction, materializes the normalized hierarchy/dependencies, recalculates rollup, writes required `PROJECT/CREATED` and `PROJECT_CREATION_DRAFT/DRAFT_COMMITTED` audits, and marks the draft committed. Any failure rolls back every write; replay returns the existing committed project without duplicates.
- **Safe post-create handoff** — successful commit opens the project Gantt with actual persisted counts and explicit Review schedule, Configure project team, Configure client obligations, and Commit baseline when ready actions. Projects remain `PLANNING` and unbaselined; creation does not assign users, invite clients, enable the portal, link Jira, send notifications, or emit external events.
- **Verification and ledger** — AC20–AC24 pass individually. Focused project-creation tests pass 92/92, PM regression passes 311/311, TypeScript and production build pass, and the diff/guardrail checks are clean. A disposable authenticated browser/PostgreSQL walkthrough confirmed the exact confirmation, `1/1/2/1/1` committed counts, Gantt landing, draft `COMMITTED` v3, project `PLANNING`, baseline 0/null, portal/Jira false, zero notifications, and exactly one audit of each required action. Temporary infrastructure/data were removed. P1 is complete; P2 has not started.

## 2026-08-17 — Project creation P1 Story 1.9: shared editable draft review

- **One review workspace for Manual and Import** — added `DraftReviewWorkspace` with the required Project Details, Schedule, Deliverables, Dependencies, Assumptions & Questions, Validation, and Source & Changes panels. Manual template choices are materialized into the same provider-neutral normalized schedule used by deterministic imports before review.
- **Complete user-controlled draft editing** — users can edit normalized project and schedule fields; add, reorder, duplicate, and confirm-delete schedule/dependency items; see cycle warnings and a private-draft Gantt; filter errors/warnings/assumptions/AI items; accept or reject proposed changes; undo/redo; restore the review-open version; save/exit; confirm restart from source; and export a seven-sheet XLSX. All persistence uses the versioned private-draft PATCH and never calls the production project mutation path.
- **Reusable and bounded implementation** — reused the shared customer/user/department selectors, `ConfirmDialog`, `EmptyState`, `Button`, normalized Zod schema, `wouldCreateDependencyCycle`, and installed `xlsx`; added no dependency or hardcoded color. The workbook/reorder helpers remain pure and independently tested.
- **Verification and ledger** — AC18 passes individually. Focused project-creation tests pass 86/86, PM regression passes 305/305, TypeScript, production build, and diff checks pass. A disposable authenticated browser/PostgreSQL walkthrough exercised all seven panels, cross-panel edits, undo/redo, filtering, confirmation, save v1→v2, reload persistence, and audit creation while production project count remained zero. Temporary infrastructure and data were removed. Story 1.10 has not started.

## 2026-08-17 — Project creation P1 Story 1.8: deterministic validation and error report

- **Actionable deterministic validation** — added a server-side validation layer that separates blocking errors from warnings and reports exact source row, field, original value, issue, and correction guidance. It covers parser failures, dates, IDs, weights, owners, active-user assignees, parents/predecessors, and schedule/project commit-readiness constraints without invoking AI.
- **Cycle-safe draft readiness** — reused the PM scheduler's `wouldCreateDependencyCycle` helper for imported dependencies. Cycles persist as `DEPENDENCY_CYCLE`, return `VALIDATION_ERRORS` with `commitBlocked:true`, and cannot reach future commit readiness; structurally invalid rows retain the report but no normalized schedule.
- **User-controlled report UI** — Import now shows blocking/warning counts, an exact evidence table, correction/retry and save-exit controls, and a downloadable CSV error report. Valid schedules with warnings can continue; blocking schedules cannot. The detailed seven-panel editor remains Story 1.9.
- **Verification and ledger** — AC8 and AC9 pass individually. Focused project-creation tests pass 80/80, PM regression passes 299/299, TypeScript, production build, and diff/guardrail checks pass. A disposable authenticated production-API/database run returned exact row-2 corrections and a row-4 cycle, persisted `VALIDATION_FAILED`, used no AI, and left project count at zero; browser verification covered the authorized Import/error controls. Temporary infrastructure was removed after verification.

## 2026-08-16 — Project creation P1 Story 1.7: deterministic spreadsheet import and editable mapping

- **Deterministic creation import** — added authenticated, creator-owned upload and mapping endpoints for CSV/XLS/XLSX private drafts. The server prefers a `Schedule` sheet, requests an explicit sheet choice when necessary, detects headers, hashes the source, applies exact or known-alias mappings, and writes the normalized schedule without invoking AI or changing valid explicit values.
- **User-controlled mapping UI** — Import now provides template downloads, a react-hook-form upload/sheet step, pulse loading and safe errors, an editable column-mapping table with samples and required-field checks, and a Ready for review summary. Users can replace any proposed alias mapping before approval; changing the source file resets only the method-specific result.
- **Bounded and audited processing** — the new creation path uses server-configurable 10 MB and 2,000-row defaults without changing the existing project-scoped 5 MB importer. Owner/capability/version/method, safe file metadata, unique source mappings, required fields, hash continuity, and normalized output are enforced server-side. Each processing result stores only safe metadata/hash/outcome/mapping mode in the required atomic audit; raw file bytes are not retained in audit data.
- **Verification and ledger** — AC6 passes. AC7's deterministic/manual-mapping portion passes and remains partial only for Story 2.2's AI-proposed mapping. Story 1.7 also closes AC30's deferred no-key deterministic Import evidence. Focused project-creation tests pass 76/76, PM regression passes 295/295, TypeScript, production build, and diff checks pass. Disposable authenticated API/database and browser walkthroughs verified standard XLSX `2/2/4/4/1`, editable alias correction, preserved dates/owner, `aiUsed:false`, safe audits, and zero production projects; temporary infrastructure was removed. P0 remains gated only by AC36, and Story 1.8 has not started.

## 2026-08-16 — Project creation P1 Story 1.6: backward-compatible schedule columns

- **Optional schedule metadata without breaking legacy files** — appended `Deliverable`, `Estimated Hours`, and `Assumptions / Source Notes` after the original 21 schedule headers. The first 21 names and positions remain unchanged, blank new cells normalize to `null`, invalid supplied estimates are rejected, and existing 21-column CSV/XLSX inputs continue to validate and import unchanged.
- **Existing importer carries the values** — a deliverable name or affirmative indicator marks the containing milestone as key, with a supplied name used for the milestone when available; estimates persist to `Activity.estimatedHours`; source notes remain reviewable in the activity description. This deliberately follows the v1.1 rule that deliverables are key milestones and does not introduce a duplicate Deliverable model.
- **Templates and guidance** — the shared CSV/XLSX generator now emits all 24 columns, representative indicator/name/estimate/source-note examples, and controlled-value guidance while preserving the existing Instructions/Schedule workbook structure, filters, widths, and frozen header.
- **Verification and tracker** — Story 1.6 owns no numbered AC ledger rows. Six new focused contract tests pass along with the untouched legacy parser tests; the complete project-creation suite passes 69/69, PM regression passes 288/288, TypeScript, production build, and diff check pass. A disposable authenticated database/API walkthrough imported both a modern 24-column file and a legacy 21-column file, verified the stored milestone/estimate/notes and legacy null defaults, and then removed the temporary server/database. P0 remains gated under the user's sequencing exception; Story 1.7 has not started.

## 2026-08-16 — Project creation P1 Story 1.5: project-less CSV/XLSX templates

- **Downloads before creation** — added the authenticated, capability-gated `GET /api/projects/creation-templates?format=csv|xlsx` route with no project or draft identifier. Authorized users can download both formats directly from the New Project method screen before choosing a method, and the controls remain available inside the saved Import draft.
- **One spreadsheet contract** — moved workbook construction into `lib/projects/schedule-import-template.ts`. The new project-less route and the existing project-scoped schedule-import route now share the same 21 headers, examples, widths, instructions, controlled-value guidance, filters, filenames, and output bytes, preventing drift. CSV remains a flat Schedule representation; XLSX contains Instructions and Schedule sheets.
- **Real frozen header** — the installed SheetJS Community Edition does not serialize its informal `!freeze` property, so the generator safely adds the standard OOXML frozen-pane metadata to the generated Schedule worksheet through SheetJS's bundled archive API. Automated coverage inspects the workbook XML, along with sheet names, headers, examples, guidance, and filters.
- **Verification and ledger** — Story 1.5's CSV/XLSX portion of AC5 passes; AC5 remains 🟡 only because Story 2.5 owns the DOCX template. Focused tests pass 63/63, PM regression passes 282/282, TypeScript, production build, and diff check pass. A disposable authenticated browser/API walkthrough downloaded both formats before a draft existed, observed the same links inside Import, verified 200 content types/dispositions and readable contents, plus 401 unauthorized and 400 DOCX responses; cleanup left zero projects/drafts and removed the temporary server/database. P0 remains gated under the user's sequencing exception.

## 2026-08-16 — Project creation P1 Story 1.4: Manual blank/template branch

- **Draft-backed Manual flow** — folded the existing `CreateProjectWizard` behind Create manually and expanded it to Basics → Dates → Template → Review. Common fields and the Start blank/template decision persist in the private normalized draft, save/exit remains available, both progress indicators stay visible, and the final review states `PLANNING` with no baseline before the user explicitly creates.
- **Template selection under user control** — system and custom lifecycle cards show phase/milestone/activity counts before selection. Selecting a template loads and displays its full phase → milestone → activity tree both during selection and final review, with skeleton, safe failure/retry, and disabled-create states. The customer lookup was lifted into a shared component so Projects no longer imports another feature.
- **Fail-closed creation semantics** — Start blank produces zero schedule rows. A chosen template is parsed and required inside the existing creation transaction before the project is written, then copied into concrete rows; a missing or malformed template returns a safe 400 and leaves no project behind. Automatic `PROJECT_CREATED` notification emission was removed to honor the v1 no-notification rule; normal project activity logging remains.
- **Verification and ledger** — AC3 and AC4 pass individually. Focused project-creation tests pass 58/58, PM regression passes 277/277, TypeScript, production build, and diff check pass. A disposable PostgreSQL/browser walkthrough created a blank project (`0/0/0`) and a Consulting-template project (`5/5/12`); both were `PLANNING` with null baseline, the template tree was visible before confirmation and in the Gantt afterward, notifications remained zero, and completed draft cleanup left zero drafts. The temporary browser, server, database, users, projects, templates, and audits were removed. P0 remains gated under the user's sequencing exception.

## 2026-08-16 — Project creation P1 Story 1.3: three-method entry and persistent draft shell

- **Three explicit creation methods** — Delivery > Projects > New Project now opens an accessible card screen for Create manually, Import a project file, and Create with AI, with the v1.1 descriptions and best-for guidance. AI availability is derived server-side: a disabled project-AI flag hides only the AI card, while an enabled but unavailable provider disables it and keeps Manual/Import active.
- **Persistent, user-controlled shell** — selecting a method creates a private versioned draft rather than a production project. The shared shell always shows method, saved version, and Method → Prepare → Review → Create progress; users can go back without losing the draft, save and exit, resume through the persisted draft URL, and discard only through a consequence-specific confirmation. Immediate persistence means modal close never silently loses an unsaved draft.
- **Safe method switching** — switching methods requires confirmation, preserves common `projectJson`, clears method-specific schedule/validation slices, increments the optimistic version atomically, and writes the required draft audit. The route rejects unconfirmed switches and mixed switch-plus-method-data requests.
- **Verification and ledger** — AC1 and AC2 pass individually; Story 1.3 also supplies the deferred UI needed to close AC26 and AC31. AC30 remains partial only until Story 1.7 makes deterministic Import functional; AC36 remains partial only until P2/P3 add concrete AI endpoints. Focused project-creation tests pass 53/53, PM regression passes 272/272, TypeScript, production build, and diff check pass. A disposable PostgreSQL/browser walkthrough verified three cards, flag-off hiding, back, switch cancel/confirm (`v1→v2`), save/exit/resume, discard cancel/confirm, an unauthenticated 401, five draft audits, and zero remaining drafts/projects; the temporary server/database were removed. P0 remains gated under the user's sequencing exception.

## 2026-08-16 — Project creation P1 Story 1.2: normalized draft contract

- **One versioned contract** — added `lib/projects/creation-normalize.ts` as the provider-neutral version-1 Zod schema every future parser and AI provider must emit. It covers project metadata, phases, milestones, activities/subtasks, dependencies, key-milestone deliverables, assumptions, clarification questions, warnings, validation issues, source provenance, and explicit proposed changes.
- **Storage without schema drift** — added typed split/combine helpers for the existing `projectJson`, `scheduleJson`, and `validationJson` columns, plus safe empty-slice factories with the current user as default PM, ETB currency, organization calendar, and Monday–Friday working days. The combined shape round-trips losslessly.
- **Strict server boundary** — draft create, patch, and response serialization now use the exact schemas rather than arbitrary JSON objects. Unknown/provider-specific keys, legacy unversioned shapes, missing required arrays, invalid JSON values, impossible ISO dates, invalid enums/ranges, and more than five clarification questions in one round are rejected while the existing 1 MB per-field cap remains enforced.
- **Verification** — `npm run test:project-creation` (44/44), `npm run test:projects` (263/263), `npx tsc --noEmit`, production build, and `git diff --check` pass. The build completed with only the repository's existing localhost-database and dynamic-render notices. Story 1.2 owns no numbered AC ledger rows; no database schema, production data, route inventory, UI, dependency, or AI call was added. P0 remains gated under the user's sequencing exception.

## 2026-08-16 — Project creation P1 Story 1.1: persistent creation drafts

- **Persistent private draft model** — added the strategy-defined `ProjectCreationDraft` table for all four source methods, draft lifecycle status, optimistic version, project/schedule/validation JSON, source and AI metadata, commit idempotency reference, timestamps, and a configurable 30-day expiry. The internal storage reference is deliberately excluded from API responses.
- **Authenticated CRUD and concurrency** — added `POST /api/projects/creation-drafts` plus `GET/PATCH/DELETE /api/projects/creation-drafts/[id]`. Creation reuses `canCreateProject()` and derives ownership from the session; drafts are creator-private with Administrator read-only inspection; only the creator can edit or discard. Atomic version checks return current/expected versions and `RELOAD`, `COMPARE`, and `SAVE_COPY` choices on stale edits.
- **Mutation safety** — strict server validation bounds source methods, versions, JSON objects, and each JSON field to 1 MB. Create, update, and discard run with required transaction-bound `PROJECT_CREATION_DRAFT` audits; an audit failure rolls the draft mutation back, and audit metadata excludes draft/source content.
- **Verification** — `npm run test:project-creation` (37/37), `npm run test:projects` (256/256), `npx prisma validate`, `npx prisma generate`, `npx tsc --noEmit`, production build, and `git diff --check` pass. A disposable PostgreSQL database passed `prisma db push` and a real create → versioned update → discard smoke (`1→2`, three audit rows, zero drafts remaining), then was removed. No production database was changed. Story 1.1 owns no numbered AC ledger rows. It was started after the user's explicit continue instruction as a sequencing exception; P0 partial criteria remain unchanged and its phase gate remains closed.

## 2026-08-16 — Project creation P0 Story 0.7: independent AI feature flag

- **Independent configuration** — added the default-off `OrganizationSettings.aiProjectCreationEnabled` field and the dedicated `AI_FEATURE_KEYS.PROJECT_CREATION_AI` key. Project-creation AI no longer needs to reuse or infer from `aiSprintPlanningEnabled`.
- **Guarded and audited control** — added a reusable server refusal guard with a stable 404 error/code for future project-creation AI endpoints. Settings > Integrations now exposes an Administrator-only master toggle; the API validates the Boolean server-side, persists it atomically with the existing project-AI settings, and audits each actual toggle without key or prompt data.
- **UI and isolation verification** — live browser verification observed Disabled → Unavailable → Disabled with both saves succeeding and no console errors. A disposable PostgreSQL check confirmed `aiSprintPlanningEnabled=true` while `aiProjectCreationEnabled=false`, plus separate successful audit rows for enable and disable; no production data was changed.
- **Verification and tracker status** — AC36 remains 🟡: the flag guard and sprint isolation pass, but its exact New Project AI option and concrete project-creation AI endpoints are assigned to Stories 1.3 and P2/P3. Focused tests passed 27/27, PM regression passed 246/246, Prisma validate/push/generate, TypeScript, a clean production build, browser verification, and diff checks passed. The P0 gate therefore remains closed and P1 was not started.

## 2026-08-16 — Project creation P0 Story 0.6: safe OpenAI connection testing

- **Administrator-only live test** — added `POST /api/settings/integrations/ai/test` behind `withRole('ADMIN')`. The server resolves the current DB-first OpenAI credential and calls the authenticated `GET /v1/models` endpoint with no prompt, generation tokens, or user data; the client never supplies or receives credential material.
- **Distinct safe outcomes** — added fixed, actionable results for success, missing/unreadable/changed configuration, invalid or revoked key, insufficient quota/spend, rate limit, network/timeout/provider failure. Classification uses status/type/code only and never copies the provider message, request, stack, plaintext key, or ciphertext into a response or audit event.
- **Verification state and audit** — successful database-key tests set `lastVerifiedAt` atomically with required `AI_CREDENTIAL`/`KEY_TESTED` audit. A rejected database key clears stale verification. Every attempted test records actor, provider, source, outcome, retryability, and at most the stored last four characters.
- **Settings UI** — added disabled no-key, testing, inline success/error, retryable failure, and last-verified states to the existing panel. Browser verification on a disposable local database observed masked storage, needs-verification state, a live dummy-key `INVALID KEY` result, a cleared password field, zero browser console errors, and an audit row containing no full key. The disposable database cluster and app server were stopped and removed afterward.
- **Verification and tracker status** — AC32 passes. AC31 remains 🟡 because its service-level verification and availability transition pass, while the exact New Project AI option depends on Stories 0.7/1.3 and cannot yet be observed. Focused tests 24/24, PM regression 243/243, TypeScript, production build, and diff check passed. Build emitted only the existing stopped-default-database health warning and dynamic-render notices. No production or deployed environment was changed.

## 2026-08-16 — Project creation P0 Story 0.5: masked AI provider administration

- **Administrator-only API and service** — added `GET/PUT/DELETE /api/settings/integrations/ai` behind `withRole('ADMIN')` plus a transaction-safe administration service. Administrators can insert, overwrite/rotate, relabel, or remove the encrypted OpenAI credential; choose a server-allowlisted project-creation model; and configure the feature-specific daily cap and per-user cooldown. Credential, model, and cap mutations write required `AI_CREDENTIAL` activity rows atomically.
- **Write-only secret handling** — API responses and database read projections contain only `sk-…last4`; plaintext and ciphertext never enter response, error, or audit payloads. The form key field is always reset empty after saving. Rotation replaces the only ciphertext, resets `lastVerifiedAt`, and records `KEY_ROTATED` using only safe metadata. Removing a database key reveals any environment fallback without attempting to modify server environment variables.
- **Settings UI** — added the OpenAI project-creation panel to Settings > Integrations for Administrators only. It includes skeleton/error states, unavailable/configured/needs-verification status, masked metadata, password input, label, approved-model select, cap controls, and the shared `ConfirmDialog` with consequences tailored to whether `OPENAI_API_KEY` will take over.
- **Model/cap persistence** — added nullable `OrganizationSettings.aiProjectCreationModel`; registered the documented `gpt-5.5` default and server allowlist (`gpt-5.5`, `gpt-5.5-pro`, `gpt-5.5-mini`); and used existing `SystemSettings` for project-creation daily-cap and cooldown overrides. A database key is not marked available until Story 0.6 records successful verification; environment fallback remains available for backward compatibility.
- **Verification and tracker status** — AC33 and AC34 pass automated security tests. AC30 remains 🟡 because its exact wording also requires the future three-option entry and deterministic Option B flow assigned to Stories 1.3/1.7; those stories were not batched. Prisma validate/push/generate passed; focused tests 21/21, PM regression 240/240, TypeScript, production build, browser save/mask/remove verification, and diff check passed. The temporary local administrator, credential, audit rows, and cap/model test values were removed. No production or deployed environment was changed.

## 2026-08-16 — Project creation P0 Story 0.4: encrypted AI credentials and DB-first resolution

- **Encrypted credential model** — added `AiProviderCredential` with unique provider id, AES-256-GCM ciphertext, safe last-four metadata, optional label, granting user id, and created/updated/last-verified timestamps. Applied the non-destructive schema addition to the local database through the prescribed Prisma validate → db push → generate sequence.
- **Isolated key encryption** — added `lib/ai/ai-crypto.ts`, mirroring the existing Jira `v1:iv:authTag:ciphertext` envelope with Node crypto, a random 12-byte IV, 16-byte authentication tag, strict 32-byte KEK parsing, and separate `okr-ai:provider-key:v1` authenticated data plus `AI_CREDENTIAL_ENCRYPTION_KEY`. Jira and AI ciphertexts are intentionally non-interchangeable.
- **Database-first OpenAI resolution** — added `lib/ai/credentials.ts`. Project creation always resolves `openai`, uses the encrypted database credential before `OPENAI_API_KEY`, preserves the environment-only deployment path, returns unavailable when neither source exists, and fails closed when a configured database envelope cannot be authenticated.
- **AC35 and regression verification** — added automated coverage for database precedence, OpenAI forcing, environment fallback, unavailable degradation, fail-closed invalid ciphertext, round trips, random IVs, tampering, wrong keys, key parsing, and bidirectional Jira/AI cross-decryption rejection.
- Verification: `npx prisma validate` (pass) · `npx prisma db push` (local database in sync) · `npx prisma generate` (pass) · `npm run test:project-creation` (17/17 pass) · `npm run test:projects` (236/236 pass) · `npx tsc --noEmit` (clean) · `npm run build` (pass; existing dynamic-render warnings only) · `git diff --check` (clean). No route, UI, production database, or deployed environment was changed.

## 2026-08-16 — Project creation P0 Story 0.3: commit-time scope authorization

- **`lib/projects/project-creation-authorization.ts`** — added the reusable, server-authoritative authorization contract for the future creation-draft commit endpoint. Every call reloads the creator's active state, system role, and Project Manager capability; requires the actor to own the draft; reuses `canCreateProject()`; restricts Department Leads and capability holders to active `DepartmentMembership` scope; permits Administrators/Executives across departments; defaults PM to the creator; and rejects an inactive nominated PM.
- **Commit safety contract** — the service is read-only on denial, preserving the draft. Its database parameter accepts the future commit transaction client, and its contract requires authorization before any writes inside that transaction so capability/scope state cannot go stale between check and commit.
- **AC28–29 verification** — added focused tests for out-of-scope Department Lead rejection, active-membership filtering, capability revocation while a `READY` draft is open, draft preservation, owner-only commit, required department for scoped creators, unrestricted Administrator/Executive scope, and active nominated PM validation.
- Verification: `npm run test:project-creation` (11/11 pass) · `npm run test:projects` (230/230 pass) · `npx tsc --noEmit` (clean) · `npm run build` (pass; existing dynamic-render warnings only) · `git diff --check` (clean). Standalone lint remains unconfigured. No schema, route, UI, local data, or production changes were made for Story 0.3.

## 2026-08-16 — Project creation P0 Story 0.2: Project Manager capability

- **Persisted capability and live authorization** — added `User.isProjectManager Boolean @default(false)`, exposed it through internal cookie/bearer sessions, refreshed role/capability state from the database on authenticated server requests, and passed it into the shared `canCreateProject()` decision for both Projects UI and API. Client-portal sessions are explicitly never Project Managers.
- **Admin-only, audited management** — added the Settings > Users Project creation column and accessible grant/revoke switch. `PATCH /api/users/[id]/project-manager-capability` is guarded by `withRole('ADMIN')`; its service transaction updates the user and records the required `PROJECT_MANAGER_CAPABILITY_GRANTED`/`REVOKED` `ActivityLog` row atomically through the shared `recordActivity()` helper. No generic user-update or Settings permission was widened.
- **Verification and status** — Prisma `validate` → local `db push` → `generate` passed; focused tests 7/7, PM regression 226/226, `npx tsc --noEmit`, production build, and browser rendering of the admin switches passed. The temporary browser-test admin was deleted after verification. Standalone lint remains unconfigured and opens the Next.js setup prompt.
- **Tracker stop condition** — AC27 passes. AC26 is marked 🟡 because its exact wording requires all three creation options, while the strategy explicitly defers the `NewProjectEntry` three-card UI to Story 1.3 and forbids batching it into Story 0.2. Story 0.2 therefore remains 🟡 and work stopped for review rather than weakening the AC.

## 2026-08-16 — Project creation P0 Story 0.1: centralized creation authorization

- **`lib/permissions.ts`** — added the pure `canCreateProject()` authorization source of truth for Administrator, Executive, Department Lead, and the explicit Project Manager capability contract. Employees without the capability are denied.
- **Projects UI + API parity** — removed the `CAN_CREATE` array from `ProjectsListClient` and the `withRole([...])` creation guard from `POST /api/projects`. The server-rendered Projects page evaluates `canCreateProject()` for UI visibility, while the authenticated API evaluates the same helper before reading the request body and returns the standard 403 envelope when denied.
- **Regression coverage and tracking** — added `npm run test:project-creation`, authorization truth-table/capability/call-site wiring tests, and `docs/PROJECT_CREATION_TRACKER.md` with all stories and AC1–AC36 seeded. Story 0.1 and AC25 are verified; no later story was started.
- Verification: `npm run test:project-creation` (3/3 pass) · `npm run test:projects` (222/222 pass) · `npx tsc --noEmit` (clean) · `npm run build` (pass; existing dynamic-render warnings only) · `git diff --check` (clean). Standalone `npm run lint` is not configured and opens Next.js's interactive setup prompt, so it was not counted as a lint pass.

## 2026-08-16 — Modal internal-scroll fix + dashboard shell density

- **`components/ui/Modal.tsx`** — fixed `scrollBehavior="internal"` never working. `DialogContent` hardcodes `grid`, and Tailwind emits `.grid` (byte 58328 of the built CSS) *after* `.flex` (58255) at equal specificity, so the `flex flex-col` added for internal scroll silently lost the display conflict. Consequences: `flex-col` inert, the body's `flex-1` inert, the grid row auto-sized to content, and `max-h-[90vh]` overflowed instead of scrolling — a tall modal (e.g. Complete sprint with 11 incomplete tasks) rendered taller than the viewport with its footer off-screen. Fix: `!flex` to win the conflict deterministically, `min-h-0` on the body (a flex item's default `min-height:auto` refuses to shrink below content and defeats `overflow-y-auto`), and `flex-shrink-0` on the footer. Affects all 5 internal-scroll modals: `EndSprintModal`, `AddAlignedObjectiveModal`, `ProjectsListClient`, `AiAssistantPanel`, `CreateCheckInModal`.
- **`components/layout/Header.tsx`** — page title `text-lg` → `text-[15px]` with `-0.01em` tracking.
- **`components/layout/DashboardShell.tsx`** — grid header row `3.5rem` → `3rem` to match the header's actual `h-12`, removing an 8px dead band under the header; main vertical padding `py-6` → `py-4`; content gutters `px-4 sm:px-6 lg:px-8` → `px-3 sm:px-4 lg:px-5` so page content aligns with the header's own gutters instead of sitting inset from it. Applies to all dashboard pages.
- Tests run: `npx tsc --noEmit` clean. Root cause confirmed by byte-offset comparison in the built CSS. **Not visually verified** — local dev server requires an authenticated session.

## 2026-08-16 — Project creation / import / AI — Codex implementation strategy (docs only)

- **`docs/PROJECT_CREATION_IMPORT_AI_IMPLEMENTATION_STRATEGY.md`** (new) — the HOW companion to the v1.1 requirements, following the same format as `daily_scrum_module_IMPLEMENTATION_STRATEGY.md`. Contains: a kickoff prompt (§0.0); the A–F verification protocol (§0.1); the **AC ledger** requiring all 36 acceptance criteria to be validated one at a time with method + evidence, with authorization/masking/rollback/idempotency ACs forced to automated tests (§0.2); a reuse map of exact import paths with a no-new-dependency rule (§1); **12 spec↔codebase reconciliations** (§2) covering no-Prisma-enums, react-hook-form without zodResolver, forcing OpenAI over the `anthropic` default, DB-first key resolution, mirroring rather than reusing `jira-crypto`, the 5 MB vs 10 MB limit divergence, backward-compatible column extension, no `Deliverable` model, project-less template downloads, reusing `createProjectWithTemplate`, untrusted-document framing, and activity-log registration; the three schema additions (§3); a file manifest (§4); a story-by-story P0–P4 plan with per-story requirement sections and owned AC ids (§5); a test plan (§6); tracker format (§7); 8 stop conditions (§8); and 10 non-negotiables (§9).
- No code changed. Tests run: none (documentation-only change).

## 2026-08-16 — Project creation / import / AI planning requirements finalized to v1.1 (docs only)

- **`docs/PROJECT_CREATION_IMPORT_AI_REQUIREMENTS.md`** → **v1.1, Status: Final**. Resolved the three open decisions: (1) creation access = ADMIN/EXECUTIVE/DEPARTMENT_LEAD **plus** a new explicit `User.isProjectManager` capability behind a single `canCreateProject()` helper (§4.1, §4.1.1, §4.1.2); (2) **OpenAI only** as provider, with the API key administered in-app — AES-256-GCM at rest reusing the `jira-crypto.ts` envelope, masked display, rotate, remove, test-connection, model allowlist, and a feature flag independent of `aiSprintPlanningEnabled` (new §13.5); (3) all phases approved, with a new **Phase 0** in §19 carrying the permission + key-administration prerequisites.
- Added acceptance criteria §17.6 (access/capability, 5 scenarios) and §17.7 (provider configuration, 7 scenarios); extended §20 Definition of Done.
- Appendix A: open decisions replaced by the resolved record (A.4), plus **A.5** listing the three required schema additions (`User.isProjectManager`, `ProjectCreationDraft`, AI provider credential — all needing `prisma db push`) and **A.6** confirming reuse of `lib/projects/jira-crypto.ts`, the existing integrations settings page, `lib/ai/generation-log.ts`/`cost.ts`, `DAILY_GENERATION_CAP`, and the `lib/permissions.ts` helper shape.
- Flagged that `OrganizationSettings.aiPreferredProvider` defaults to `"anthropic"` while the Anthropic provider is an unimplemented stub — this feature must resolve to OpenAI regardless.
- No code changed. Tests run: none (documentation-only change).

## 2026-08-16 — Project creation / import / AI planning requirements (docs only)

- **`docs/PROJECT_CREATION_IMPORT_AI_REQUIREMENTS.md`** — added **Appendix A (Codebase Grounding)**: maps each requirement area to the existing asset that satisfies it (`CreateProjectWizard`, `POST /api/projects`, `lib/projects/templates.ts`, `lib/projects/schedule-import.ts`, `ScheduleImportModal`, `lib/ai/*`), lists the seven real gaps (no project-creation permission helper, no `ProjectCreationDraft` model, no `Deliverable` model — deliverables map to `Milestone.isKeyMilestone`, Anthropic provider is a stub, AI flag is sprint-specific, no upload storage, no background job path), records which of the module's 10 invariants the feature touches, and states three open decisions for the product owner.
- Confirmed no new npm dependency is required: `xlsx`, `mammoth`, `docx`, `zod`, and `@anthropic-ai/sdk` are already in `package.json`.
- No code changed. Tests run: none (documentation-only change).

## 2026-07-31 — BGI Ethiopia Stage-1 project import (production data)

Imported `docs/BGI_Ethiopia_Stage1_ - 8Week_WorkPlan v1.0.xlsx` into the live Project Management module on production (76.13.33.23).

- **`scripts/import-bgi-project.ts`** (new, one-shot) — reuses `createProjectWithTemplate` (`lib/projects/service.ts`), the same phase/milestone/activity creation transaction as `app/api/projects/[id]/schedule-import/route.ts`, `recalcProjectRollup`, and `recordActivity` so all module invariants (transactional rollup, audit trail) hold. Source rows are embedded verbatim from the workbook's Work Plan + Milestones sheets.
- Created **PRJ-2026-003** "BGI Ethiopia - Stage 1 IT Modernization" (client BGI Ethiopia, PM `eyoel@360ground.com`, status ACTIVE, planned 2026-07-16 → 2026-09-10) with 3 phases (weighted by planned duration-days), one key milestone per phase (dates from the Milestones sheet), and 33 activities (owner party derived from the sheet's Owner column: BGI Ethiopia→CLIENT, 360 Ground→360GROUND, Both Teams→SHARED). Activity #1 (kickoff, already complete in the source plan) was marked FINISHED/100%; all others NOT_STARTED.
- Verified on production after run: project rollup 1.1%, Phase 1 2.5% (reflecting the one completed activity), 33/33 activities present across the 3 milestones, milestone dates match the source sheet.
- Ran via `npx tsx scripts/import-bgi-project.ts` directly on the VPS (no HTTP layer available for this one-shot; DB write went through the app's own service/rollup/audit code, not raw SQL). Tests run: none (one-shot data-import script, not a code-path change) — `npx tsc --noEmit` clean.

## 2026-07-20 — OKR Period Close / Retrospective / Roll-Forward — Phases 3–7

Completed the seven-phase OKR period-close feature on `feature/okr-period-close` without committing, pushing, or touching production.

- **Close lifecycle:** added Objective/KR initiate, retrospective, evidence, commit, and reopen routes; legacy Complete now enters the mandatory close flow. Closing freezes snapshots, `CLOSED` enforces server-side HTTP 423, and reopening requires a 20-character reason, respects `OrganizationSettings.okrReopenWindowDays`, restores the frozen snapshot, and leaves an append-only scar.
- **Transactions and audit:** lifecycle changes and `recalcNodeAndAncestors()` run together in Prisma transactions; all mutations record activity. Re-close timestamps open reopen logs.
- **Shared UI:** added the three-step `OkrCloseModal`, `OkrReopenDialog`, and feature wrappers/action-menu wiring. Locked records hide mutation actions while remaining readable/commentable/cloneable.
- **Roll-forward:** extended the existing Objective/KR clone routes and modals with next-period defaults, single-successor protection, lineage, optional incomplete-initiative carry, and the critical carried baseline (`startValue=currentValue=previous finalValue`, new-period progress 0). Added `RolledFromBanner` with forward links and previous-period performance.
- **Period report:** added scoped on-demand report/API/PDF with close progress, outcomes, grade histogram/delta, blocker Pareto, lessons, roll-forward status, still-open checklist, ledger, and sequenced “close all my open OKRs.” Department leads are membership-scoped; Admin/Executive are org-wide. Weekly digest now includes ended-period close reminders.
- **Local verification:** lifecycle lock/reopen/re-close and scars verified through authenticated localhost APIs; Q1→Q2 KR baseline verified at 78→100 with 0% new progress; lineage page rendered; Q1 report returned mixed open/closed aggregates; department scoping returned Marketing only; Puppeteer produced a 137,963-byte PDF.
- Final gates: `npm run test:okr` (9 passed) · `npx tsc --noEmit` (clean) · `git diff --check` (clean) · `npm run build` (pass, including Next build type/lint stage). Standalone `npm run lint` is not configured and opens Next.js's first-run ESLint prompt.

## 2026-07-20 — OKR Period Close / Retrospective / Roll-Forward — Phase 2 (lock guard)

Completed and verified the transitive server-side lock foundation before starting the close workflow.

- **`lib/okr/lock-guard.ts`** — added objective and Key Result lock resolution, including inheritance from a locked parent Objective, with the standard HTTP 423 `OKR_LOCKED` response and reopen URL.
- **OKR mutation routes** — wired the guard into all Objective and Key Result mutation endpoints while keeping comments, clone, view tracking, and reads exempt.
- **`lib/objectiveProgress.ts`** — prevents recalculation from changing frozen locked Objectives while preserving ancestor traversal.
- **`lib/api/apiResponse.ts`, `lib/api/index.ts`** — added and exported the standard `apiLocked()` response helper.
- **`lib/okr/lock-guard.test.ts`, `package.json`** — added lock response and route-wiring coverage plus the `npm run test:okr` command.
- Tests run: `npx tsx --test lib/okr/*.test.ts` (3 passed) · `npx tsc --noEmit` (clean).

## 2026-07-19 — OKR Period Close / Retrospective / Roll-Forward — Phase 1 (schema)

Foundation for the OKR period-close lifecycle (spec: `docs/okr_period_close_and_rollover_requirements.md`; build plan: `docs/okr_period_close_IMPLEMENTATION_INSTRUCTIONS.md`). Branch `feature/okr-period-close`.

- **`prisma/schema.prisma`** — added period-close lifecycle to `Objective` and `KeyResult`: `closureStatus` (OPEN|CLOSING|CLOSED, authoritative), `closedAt`, `outcome`, `finalGrade`, `finalProgress`/`finalValue`(KR), `gradeDelta`, `finalConfidence`, `initialConfidence`, `preCloseGoalStatus`/`preCloseConfidence`, `closureNote`, `isLocked`/`lockedAt`, `reopenCount`/`lastReopenedAt`/`lastReopenedById`; lineage `rolledFromId`/`lineageRootId`/`lineageDepth` with self-relations `rolledFrom`/`rolledTo`; KR `carriedStartValue`. Added new models `OkrRetrospective` (mandatory reflection, 1:1 with an objective or KR) and `OkrReopenLog` (append-only reopen scar). Reused pre-existing `closedBy`/`closedById` relations and `OrganizationSettings.okrReopenWindowDays`.
- **`scripts/preflight.sql`** — appended idempotent backfill: legacy `goalStatus='CLOSED'` objectives → `closureStatus='CLOSED'`, `isLocked=true`, `closedAt/lockedAt=updatedAt`, seeded `finalProgress`/`outcome`.
- Tests run: `prisma validate` (valid) · `prisma db push` to local dev DB (in sync) · `prisma generate` (clean) · backfill applied to local DB (0 legacy rows; new columns queryable via client). Full `tsc` deferred to Phase 2 (no TS written yet).

## 2026-07-15 — Project Management module: Cross-cutting Cron — project-digest

Completes the PM module cron table (6 of 6) with the daily 07:00 project digest.

- **`lib/projects/project-digest.ts`** — added pure `aggregatePmDigest()` plus `buildPmDigest()` and `runProjectDigest()`. Aggregates per-project-manager: overdue activities, blocked activities, waiting approvals, upcoming due dates, failed stage gates, overdue payment milestones, open high-risk RAID items, and overdue COEs. Emits one `PROJECT_DAILY_DIGEST` notification per PM with `explicitRecipients`.
- **`app/api/cron/project-digest/route.ts`** — added cron route protected by `CRON_SECRET` (same pattern as other PM crons); returns `{ success, generated, skipped }`.
- **Notification plumbing** — added `PROJECT_DAILY_DIGEST` to `lib/notifications/events.ts` (category `PROJECT`, cadence `DAILY`) and a matching rich email template in `lib/email/templates/index.ts` with KPI row and per-project issue summary.
- **Tests/docs** — added `lib/projects/project-digest.test.ts` covering empty input, overdue/blocked/waiting/upcoming activities, failed gates, overdue payments, high-risk RAID, overdue COEs, RAG tallies, and project grouping. Updated `docs/PROJECT_MANAGEMENT_MODULE_TRACKER.md` (Cron ✅ Verified 6/6), `docs/CRON.md` (07:00 entry), `docs/MASTER_REFERENCE.md` (cron table), and `docs/FEATURE_STATUS.md`.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (191 pass) · `git diff --check` (clean).

## 2026-07-15 — Project Management module: P8 — OKR Integration & Portfolio Intelligence

Implements Epic K: milestone→Key Result progress linkage, CEO portfolio dashboard, and cross-project performance reports.

- **K1 — OKR linkage** — added `lib/projects/okr-bridge.ts` with `recalcKrFromMilestones` and `recalcKrsAndAncestors`, wired into `recalcProjectRollup` so milestone percent changes propagate to linked KRs and ancestor objectives in the same transaction. Added `objectiveId` to `PATCH /api/projects/[id]` and old-KR recompute on milestone unlink/move. Built `ProjectObjectiveLinker`, `MilestoneKeyResultLinker`, and `ObjectiveDeliveryPanel` (with `GET /api/objectives/[id]/delivery`).
- **K2 — Portfolio dashboard** — added `lib/projects/portfolio-dashboard.ts` aggregation (RAG counts, weighted SPI, delay owner split, root-cause Pareto, client health, capacity forecast, escalations) and `GET /api/projects/portfolio/dashboard`. Built `PortfolioDashboard`, `PortfolioFilters`, and `PortfolioChartsLibrary` with real-data C1/C6/C9/C17/C18/C20 charts. Updated `/dashboard/projects/portfolio` to show the dashboard.
- **K3 — Cross-project performance report** — added `lib/projects/portfolio-report.ts` with `generatePortfolioReport` and `renderPortfolioReportPdfHtml`. Added `GET/POST /api/projects/portfolio/report`, detail route, and PDF export. Built `PortfolioReportPanel` and added it to the portfolio page.
- **Tests/docs:** added `lib/projects/okr-bridge.test.ts` for weighted KR recomputation/unit mapping and `lib/projects/portfolio-dashboard.test.ts` for Pareto aggregation; updated tracker, feature status, and reference docs.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (178 pass) · `git diff --check` (clean).

## 2026-07-15 — Project Management module: P7 Task 7.6 — J6 Constrained AI Assistant

Implements the constrained AI assistant for project managers.

- **Constrained assistant service** — added `lib/projects/ai-assistant.ts` with four allowed intents (`EXECUTIVE_SUMMARY`, `RISK_DETECTION`, `DELAY_PATTERN`, `ESTIMATE_SUGGESTION`), pure helpers for intent classification, cap/validation, forbidden-context rejection, and deterministic data-grounded response construction from existing project data only.
- **Guardrails enforced** — outputs are hard-capped to ≤5 bullets/≤800 chars, post-validated after generation, and marked `approved:false`/`requiresPmApproval:true`. Forbidden intents (`REQUIREMENTS`, `CLIENT_PROSE`, `AUTO_SEND`) and forbidden context phrases (requirements/spec generation, client send/email, auto-send) are rejected before generation.
- **Audit logging** — every generation is persisted via `AiGenerationLog(feature=PROJECT_AI_ASSISTANT)` through the existing `recordGenerationLog` helper; added `PROJECT_AI_ASSISTANT` to `AI_FEATURE_KEYS`.
- **API/UI** — added `POST /api/projects/[id]/ai-assistant` (writable-project scoped, Zod-validated) and `AiAssistantPanel` launched from the Gantt toolbar AI button. The panel shows intent selection, optional context, capped output, grounded-in metadata, and a PM-approval warning; the only action is copy-to-clipboard — no send/client/auto-send path exists.
- **Tests/docs:** added node:test coverage for allowed/forbidden intent classification, output cap enforcement, grounded response behavior for all four intents, and forbidden-context detection; J6 tracker row moved to ✅ Verified and P7 status moved to ✅ Verified.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (170 pass) · `git diff --check` (clean).

## 2026-07-15 — Project Management module: P7 Task 7.5 — J5 Steering, COE, Estimation & Capacity Reports

Implements R6/R7/R9/R10 management reports.

- **Management report service** — added `lib/projects/management-reports.ts` with monthly/quarterly periods, deterministic capped summaries, `AiGenerationLog(feature=PROJECT_MANAGEMENT_REPORTS)`, and `ProjectReport(type=STEERING|COE|ESTIMATION|CAPACITY)` generation.
- **R6/R7/R9/R10 templates** — R6 composes steering health, stage gates, client-obligation compliance, CRs, risks, delay-owner totals, and payment status. R7 composes COE status, overdue fixes, root-cause Pareto, lessons learned, days lost, and cost impact. R9 compares estimates to actuals from project activities and Jira when linked. R10 summarizes project-member workload, over-allocation, idle capacity, and bench candidates.
- **API/UI/PDF** — added management report list/generate/detail/update/PDF routes plus `ManagementReportsPanel` on project detail, including PM summary edits and DRAFT→PM_REVIEW→APPROVED→SENT controls.
- **Tests/docs:** added node:test coverage for monthly/quarterly periods, estimate bias boundaries, and capacity status classification; J5 tracker row moved to 🟩 Done.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (155 pass).

## 2026-07-15 — Project Management module: P7 Task 7.4 — J4 Individual & Team Performance Reports

Implements Jira-backed R3/R4 reporting.

- **Performance report service** — added `lib/projects/performance-reports.ts` generating `ProjectReport(type=INDIVIDUAL|TEAM)` for `DAILY`, `WEEKLY`, `SPRINT`, and `MONTHLY` cadences. Non-Jira projects return `hidden=true` and do not render an empty UI.
- **R3/R4 fields** — R3 rows include developer, PM, sprint date, assigned, original estimate, buffer, completed, blocked, performance %, idle days, estimate accuracy, cycle time, blocked duration, scrum attendance %, and PM-editable AI insight. R4 includes team assigned/completed/blocked, performance %, velocity/trend, individual completion breakdown, Jira adoption score, and PM-editable AI insight.
- **API/UI/PDF** — added performance report list/generate/update/PDF routes and `PerformanceReportsPanel` on Jira-linked project detail pages.
- **Performance integration** — added `lib/performance/project-performance-reports.ts` so the Performance module can auto-pull the same R3/R4 evidence.
- **Tests/docs:** added node:test coverage for four cadence windows and deterministic insight priority; J4 tracker row moved to 🟩 Done.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (151 pass).

## 2026-07-15 — Project Management module: P7 Task 7.3 — J3 Weekly Business Review Pack

Implements the portfolio-level R1 WBR pack.

- **WBR service** — added `lib/projects/wbr-report.ts` with Monday-Sunday period idempotency, portfolio SPI calculation, week-over-week deltas, delay-owner totals, pending client action counts, resource heat, escalation list, and PDF HTML rendering.
- **Red item discipline** — WBR red rows include owner and committed recovery date when available; missing recovery dates are flagged `NO RECOVERY PLAN`; prior WBR red items carry forward until the project turns GREEN, completes, or cancels.
- **Cron/API/UI** — added `app/api/cron/wbr-pack`, portfolio WBR list/create, WBR PDF export, and `PortfolioWbrPanel` on `/dashboard/projects/portfolio`.
- **Side effects:** `WBR_PACK_READY` is emitted after the WBR report row exists, to CEO/Admin/Executive plus active project PM recipients.
- **Tests/docs:** added node:test coverage for weekly period boundaries, weighted portfolio SPI, no-recovery-plan flagging, and carry-forward clearing; J3 tracker row moved to 🟩 Done; project cron count moved to 5 of 6.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (148 pass).

## 2026-07-15 — Project Management module: P7 Task 7.2 — J2 Bi-Monthly Client Report

Implements the R2 client report workflow on `ProjectReport`.

- **Report service** — added `lib/projects/client-report.ts` to assemble R2 structured facts, generate a deterministic capped summary from those facts only, validate ≤5 bullets/≤800 chars, write `AiGenerationLog(feature=PROJECT_CLIENT_REPORT)`, and render PDF HTML for the shared Puppeteer renderer.
- **Workflow APIs** — added project report list/create, report detail patch, PDF export, and `app/api/cron/client-report`. The state machine is DRAFT→PM_REVIEW→APPROVED→SENT; send is hard-blocked until APPROVED, and summary edits set `aiSummaryEdited=true`.
- **Side effects** — cron/manual draft generation notifies PMs after the report row exists; sending updates the report first, then emails `project.clientEmails` with portal/PDF links.
- **PM UI** — added `ClientReportsPanel` to project detail for generate draft, edit/save summary, submit review, approve summary, send, and download PDF.
- **Tests/docs:** added node:test coverage for summary validation/caps and bi-monthly period windows; J2 tracker row moved to 🟩 Done; project cron count moved to 4 of 6.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (144 pass) · `git diff --check` (clean).

## 2026-07-15 — Project Management module: P7 Task 7.1 — J1 Chart Library

Starts Epic J / P7 with the reusable chart catalog and export shell.

- **Chart shell** — added `features/projects/components/charts/ChartWrapper.tsx` with AP design tokens, responsive/dark presentation, and per-chart PNG export using SVG serialization plus an HTML fallback for custom chart surfaces.
- **C1-C24 catalog** — added `features/projects/components/charts/ProjectChartsLibrary.tsx` and rendered it in the project Overview tab. It includes all 24 required chart slots, using Recharts where the chart shape supports it and custom wall/grid/timeline/ring surfaces for C1/C2/C11/C13/C16/C24.
- **Priority charts** — C24 includes the completion ring plus six KPI tiles; C18 renders a root-cause Pareto with ranked bars and cumulative percentage line.
- **Data stance** — charts derive from the live project schedule and registers where available; report-source metrics that arrive in J2-J5 use stable placeholder/sample series so the catalog can be reviewed before the reporting APIs land.
- **Docs:** J1 tracker row moved to 🟩 Done, P7 status moved to 🟨 In Progress, and the shared feature status/sitemap now include the PM module and project portal/detail routes.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (139 pass) · `git diff --check` (clean).

## 2026-07-14 — Project Management module: P6 Task 6.6 — G5 Adoption Score + G6 Scrum Log

Completes Epic G / P6 with Jira adoption scoring and project scrum attendance logging.

- **Jira adoption** — added `features/projects/services/jira/adoption.ts` with the required weighted data-quality score: assignee coverage, original-estimate coverage, updated-within-3-days coverage, and story-point coverage when points are used. The spec example returns 67.5%, and scores below 60 raise the required warning.
- **Adoption API/UI** — added `GET /api/projects/[id]/jira/adoption` and surfaced the score/warning in the Jira integration panel.
- **Scrum attendance** — added `features/projects/services/scrum-attendance.ts` for per-person attendance rate, late/absent counts, team attendance rate, and <70% flags.
- **Scrum log API/UI** — added `GET/POST /api/projects/[id]/scrum-log`; POST upserts on the existing `projectId+scrumDate` unique key and audits after persistence. Added `ScrumLogWidget` to the project page with date/time/duration/facilitator, In/Late/Out attendance controls, blockers/notes, an R5-style attendance report table, and a compact C16 people-by-date heatmap.
- **Performance feeds** — added `lib/performance/project-jira-adoption.ts` and `lib/performance/project-scrum-attendance.ts` as R4/R5 import surfaces.
- **Docs:** G5/G6 tracker rows moved to 🟩 Done and P6 status moved to 🟩 Done.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (139 pass).

## 2026-07-14 — Project Management module: P6 Task 6.5 — G4 Idle Days + Estimate Accuracy

Implements Jira developer evidence metrics for idle days and estimate accuracy.

- **Metrics service** — added `features/projects/services/jira/metrics.ts` with pure working-day idle detection, per-issue `actualHours / estimateHours`, median accuracy per developer, and systematic under/over-estimation flags.
- **Data source** — DB metrics read synced Jira issues, worklogs, and transitions. The pure model accepts COMMENT events; the current DB-backed report uses Jira issue `lastActivityAt`/`jiraUpdatedAt` as the available comment/update activity signal because separate Jira comment rows are not persisted by G2.
- **Scoped API/UI** — added `GET /api/projects/[id]/jira/metrics` and a compact "Developer Jira evidence" table in the Jira integration panel. Non-Jira projects return `jiraLinked=false` and no rows.
- **Performance feed** — added `lib/performance/project-jira-metrics.ts` as the Performance module import surface for R3/review-cycle date windows.
- **Compile cleanup** — moved the portal project include helper out of a Next route module into `features/projects/services/portal-project-query.ts` so route files only export valid handlers/config.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (134 pass).

## 2026-07-14 — Project Management module: P6 Task 6.4 — G3 Jira Mapping + Rollup

Implements Jira issue mapping and activity auto-rollup without adding schema or dependencies.

- **Mapping service** — added `features/projects/services/jira/rollup.ts` with typed mappings for Manual issue keys, Epic, Label, Component, and Sprint. Existing `Activity.jiraIssueKeys` stores typed mapping tokens so no migration is required.
- **Auto-rollup** — Jira sync now applies `jiraAutoRollup` after issue ingestion inside a Prisma transaction. Rollup uses story-point weighting when points exist, falls back to issue-count completion, updates mapped activities, and recalculates project rollup in the same transaction.
- **Manual wins** — direct manual `percentComplete` edits turn `jiraAutoRollup` off in the activity PATCH route, preserving the user's manual value.
- **Mapping UI/API** — activity detail now shows Jira mapping controls for linked projects, including auto-rollup toggle and live preview via `GET /api/projects/[id]/jira/mapping-preview`.
- **Compile cleanup** — fixed an unrelated in-progress ScrumHome TypeScript break by restoring missing local form fields, icon imports, link state, and carry-forward helper without changing PM behavior.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (129 pass).

## 2026-07-14 — Project Management module: P6 Task 6.3 — G2 Jira Sync Engine

Implements Jira data ingestion without starting G3 mapping/rollup.

- **Sync service** — added `features/projects/services/jira/sync.ts` consuming Jira issue search, board/sprints, issue worklog, and issue changelog endpoints. It uses incremental JQL (`project = KEY AND updated >= -35m`), serialized 10 req/sec throttling, and exponential backoff for 429s.
- **Persistence** — sync upserts `JiraIssue` and `JiraSprint`, replaces fetched issue `JiraWorklog`/`JiraTransition` rows to avoid duplicates, resolves assignee emails to platform `User.id`, and writes a `JiraSyncLog` for every connection run.
- **Cron/manual trigger** — added `app/api/cron/jira-sync` protected by `CRON_SECRET`, plus `POST /api/projects/[id]/jira/sync` for project managers to run Sync Now.
- **Graceful failure** — failures/partials update `JiraConnection.lastSyncStatus`; the existing Jira panel now shows failure/partial banners with latest safe error text while leaving Layer 1 project data untouched.
- **Tests/docs:** added node:test coverage for incremental JQL, Jira status normalization, issue field mapping, sparse blocked issues, and assignee email resolution; G2 tracker row moved to 🟩 Done and cron summary updated to 3 of 6.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (124 pass).

## 2026-07-14 — Project Management module: P6 Task 6.2 — G1 Connect Jira

Implements the Jira connection layer without starting the sync engine.

- **Jira connection service** — added `features/projects/services/jira/connection.ts` with site URL/project-key normalization, safe connection serialization, `GET /rest/api/3/myself` validation, issue count lookup, sprint count lookup, and required 401/403/404/429 error mapping.
- **Scoped APIs** — added `GET/POST /api/projects/[id]/jira` and `POST /api/projects/[id]/jira/test`. GET returns only masked metadata; POST validates credentials, encrypts the token with the 6.1 AES-256-GCM helper, sets `project.jiraLinked=true`, and links `jiraConnectionId` in one transaction.
- **Settings UI** — added `JiraIntegrationPanel` under Project Settings → Integrations with react-hook-form fields, Test Connection, Save, success counts, masked saved-token state, and API-token help link.
- **Tests/docs:** added node:test coverage for URL/key normalization, safe serialization with no encrypted token leakage, error mapping, and mocked Jira test calls; G1 tracker row moved to 🟩 Done.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (120 pass).

## 2026-07-14 — Project Management module: P6 Task 6.1 — Jira Token Crypto Utility

Starts Epic G with the security prerequisite for Jira connections.

- **AES-256-GCM helper** — added `lib/projects/jira-crypto.ts` using Node built-in `crypto` only, with versioned ciphertext format `v1:iv:authTag:ciphertext`, 12-byte random IVs, and authenticated data.
- **Strict key handling** — token encryption reads `JIRA_TOKEN_ENCRYPTION_KEY` and requires a 32-byte base64/base64-prefixed/hex key; wrong-sized or missing keys fail closed.
- **Write-only readiness** — helper returns only encrypted token material and decrypts only for server-side Jira calls in later G tasks; future APIs should never return token plaintext.
- **Tests/docs:** added node:test coverage for round-trip encryption, no plaintext in ciphertext, non-deterministic ciphertext, tamper/wrong-key rejection, env key parsing, and invalid-key rejection; P6 moved to 🟨 In Progress with 6.1 marked 🟩 Done.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (114 pass).

## 2026-07-14 — Project Management module: P5 Task 5.3 — I3 Client Portal Dashboard

Implements build spec §I3 on top of the I2 anonymized serializer and I1 portal auth.

- **Dashboard bundle** — `/api/portal/projects/[id]` now returns serializer-backed project data, awaiting client actions, delay rows, client-visible RAID, and published report summaries without exposing raw Prisma rows.
- **Portal dashboard UI** — `/portal/projects/[id]` now renders "Awaiting Your Action" first with live business-day counters, anonymized schedule bars, honest schedule-change attribution, published reports, and visible RAID.
- **Client comments** — added portal-only activity comments API and `PortalCommentBox`; GET is SQL-filtered to `CLIENT_VISIBLE`, POST writes `isClientAuthor=true`, and PM notification emits after the comment is persisted.
- **Report view/download** — added a scoped report detail route for approved/sent client report types, with JSON attachment download of the scrubbed report payload.
- **Tests/docs:** added node:test coverage for portal dashboard helper behavior; I3 tracker row moved to 🟩 Done and P5 marked 🟩 Done.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (109 pass).

## 2026-07-14 — Project Management module: P5 Task 5.2 — I1 Client Portal Authentication

Implements build spec §I1 after the I2 anonymized serializer prerequisite.

- **Separate portal auth** — added `lib/portal-auth.ts` and `/api/portal/auth/[...nextauth]` with a distinct NextAuth credentials provider backed by `ClientPortalUser`, password hashes, portal-only session fields, and separate portal cookie names.
- **Hard scoping** — added `withPortalAuth` / `withPortalProject` guards and `/api/portal/projects` routes that enforce `projectIds + portalEnabled` and serialize only through the I2 portal serializer.
- **Dashboard block** — middleware now returns 403 for portal-only sessions attempting `/dashboard/*`, while internal sessions remain unaffected.
- **Preview flow** — added `/portal`, `/portal/projects/[id]`, and `/portal/signin`; internal users see the required "Viewing as client - this is what they see." preview banner.
- **Tests/docs:** added node:test coverage for projectIds scoping and dashboard-block behavior; I1 tracker row moved to 🟩 Done.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (106 pass).

## 2026-07-14 — Project Management module: P5 Task 5.1 — I2 Anonymized Serializer

Implements the Phase 5 data-layer prerequisite from `PROJECT_MANAGEMENT_MODULE_TASKS.md`: I2 ships before portal auth/routes.

- **Portal serializer** — added `features/projects/services/portal-serializer.ts` as the only approved future `/api/portal/*` data path, with client DTOs for projects, phases, milestones, activities, delays, RAID, comments, and attachments.
- **Anonymization rules** — owners serialize as `Your Team` or `360Ground Team`; forbidden user/cost/Jira keys are stripped recursively; configured employee names are redacted from free-text strings; comments/attachments/RAID throw if not client-visible.
- **SQL-level filters** — exported portal query helpers for `projectIds + portalEnabled`, `CLIENT_VISIBLE` comments/attachments, and `clientVisible=true` RAID rows.
- **Tests/docs:** added node:test coverage for hard scoping filters, owner anonymization, no employee-name leaks, forbidden-key stripping, and client-visible enforcement; I2 tracker row moved to 🟩 Done with the code-review checklist item.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (104 pass).

## 2026-07-14 — Project Management module: P4 Task 4.6 — H6 Payment Milestones

Implements build spec §H6 on top of activity approval and governance registers.

- **Payment milestone APIs** — added `/api/projects/[id]/payment-milestones` list/create plus item PATCH/DELETE routes with report/overdue filtering, invoice status normalization, outstanding days, and post-write activity logging.
- **Approval trigger** — activity `→APPROVED` now marks linked pending milestones `READY_TO_INVOICE` inside the same mutation transaction, then emits `PAYMENT_MILESTONE_READY` to finance/PM recipients after commit.
- **Payment service** — new `lib/projects/payment-milestones.ts` owns ready-trigger detection, >30-day overdue logic, dashboard/report Prisma filters, serialization, and finance recipient resolution.
- **Payment UI** — new `PaymentMilestonesRegister` panel captures contract clause, trigger activity, amount, planned invoice date, ready-to-invoice count, overdue CEO warning, and invoice/paid actions.
- **Tests/docs:** added node:test coverage for approval trigger, outstanding days, overdue status, effective invoice status, and overdue query filtering; H6 tracker row moved to 🟩 Done and P4 marked 🟩 Done; `MASTER_REFERENCE.md` and `COMPONENT_CATALOG.md` updated.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (97 pass).

## 2026-07-14 — Project Management module: P4 Task 4.5 — H5 Correction of Errors

Implements build spec §H5 on top of project governance registers.

- **COE APIs** — added `/api/projects/[id]/coes` list/create plus item PATCH/DELETE routes with report/overdue filtering, deterministic `COE-###` codes, and post-write activity logging.
- **COE service** — new `lib/projects/coe.ts` detects milestone slip >10 days and RED-project prompts, validates 5 complete Why/Answer pairs before `DONE`, computes root-cause Pareto counts, overdue flags, and Lessons Learned rows.
- **COE UI** — new `CorrectionOfErrorsRegister` panel surfaces auto-prompts, CEO overdue warnings, 5-Whys entry, systemic fix/template feedback, root-cause counts, and Lessons Learned output.
- **Tests/docs:** added node:test coverage for trigger detection, code generation, closure validation, and Pareto counts; H5 tracker row moved to 🟩 Done; `MASTER_REFERENCE.md` and `COMPONENT_CATALOG.md` updated.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (92 pass).

## 2026-07-14 — Project Management module: P4 Task 4.4 — H4 Client Obligations & SLA Tracking

Implements build spec §H4 on top of the existing C3 approval clock.

- **Client obligation APIs** — added `/api/projects/[id]/client-obligations` list/create plus item PATCH/DELETE routes with report mode for contractual/R6 obligations.
- **Compliance service** — new `lib/projects/client-obligations.ts` computes compliance rate, Client Health score/tone, CEO warning state, and serializes obligation health flags.
- **Approval-clock wiring** — `applyApprovalClock()` now recomputes APPROVAL obligation compliance inside the same transaction that records approval-wait DelayEvents and SLA breaches.
- **Obligations UI** — new `ClientObligationsRegister` panel captures named responsible person/email, SLA business days, contractual flag, notes, breach count, compliance, Client Health score, and CEO warning below 60.
- **Tests/docs:** added node:test coverage for compliance, health score/tone, and report filtering; H4 tracker row moved to 🟩 Done; `MASTER_REFERENCE.md` and `COMPONENT_CATALOG.md` updated.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (87 pass).

## 2026-07-14 — Project Management module: P4 Task 4.3 — H3 Stage Gates

Implements build spec §H3 on top of the project detail page and activity status mutation path.

- **Stage-gate APIs** — added `/api/projects/[id]/stage-gates` list/create plus item PATCH/DELETE routes with checklist parsing and status validation.
- **Gate rules** — `PASSED` requires exit criteria; `WAIVED` requires `waiverReason` and logs `GATE_WAIVED`; report queries expose pending/passed/failed/waived gates.
- **Soft block** — activity PATCH now blocks `→STARTED` when the previous phase has an unpassed gate. The view switcher and activity drawer prompt for an override reason and retry with `gateOverrideReason`, which is recorded in activity audit metadata.
- **Stage Gate UI** — new `StageGateRegister` panel creates per-phase gates and manages entry/exit criteria, deliverables, approvals, pass/fail/waive status, and waiver reasons.
- **Tests/docs:** added node:test coverage for checklist parsing, pass/waive validation, and report filtering; H3 tracker row moved to 🟩 Done; `MASTER_REFERENCE.md` and `COMPONENT_CATALOG.md` updated.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (83 pass).

## 2026-07-14 — Project Management module: P4 Task 4.2 — H2 Change Control Board

Implements build spec §H2 on top of the project detail page.

- **CCB APIs** — added `/api/projects/[id]/change-requests` list/create plus item PATCH/DELETE workflow routes.
- **Workflow service** — new `lib/projects/change-requests.ts` owns CR codes, transition guards, pending-report filtering, scope-volatility totals, affected-activity schedule shifting, and approval side effects.
- **Approval side effects** — approving a CR runs in one transaction: CR status/decision fields update, affected activities' `currentEnd` shifts by `scheduleImpactDays`, one `DelayEvent` is created with `reason=SCOPE_ADDITION` and `owner=CLIENT`, and project rollup recalculates.
- **CCB UI** — new `ChangeControlBoard` panel creates CRs, selects affected activities, shows pending count/scope volatility, captures client sign-off, and drives review/approve/reject/implement actions.
- **Tests/docs:** added node:test coverage for workflow transitions, pending report query, scope volatility, and schedule shifts; H2 tracker row moved to 🟩 Done; `MASTER_REFERENCE.md` and `COMPONENT_CATALOG.md` updated.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (79 pass).

## 2026-07-14 — Project Management module: P4 Task 4.1 — H1 RAID register

Implements build spec §H1 on top of the project detail page.

- **RAID APIs** — added list/create/update/delete routes under `/api/projects/[id]/raid`, plus `POST /api/projects/[id]/raid/[raidId]/delay` for overdue client dependencies.
- **RAID service** — extended `lib/projects/raid.ts` with score, risk tone, days-open, ref-code, overdue-client-dependency, serializer, and query-level portal filter helpers.
- **Governance UI** — new `RaidRegister` component provides Risks/Assumptions/Issues/Dependencies tabs, type-specific create fields, status/client-visible controls, and a 5×5 risk matrix with red/amber/green scoring.
- **Confidence/delays** — open red risks trigger project-health recompute so B2 confidence is penalized immediately; overdue client dependencies can generate a `BLOCKED` DelayEvent with `CLIENT_DEPENDENCY_NOT_PROVIDED`.
- **Tests/docs:** added node:test coverage for score bands, days-open, overdue dependency detection, and SQL-level `clientVisible` filtering; H1 tracker row moved to 🟩 Done; `MASTER_REFERENCE.md` and `COMPONENT_CATALOG.md` updated.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (74 pass).

## 2026-07-14 — Project Management module: P3 Task 3.7 — F2 activity comments with visibility

Implements build spec §F2 on top of the F1 activity drawer.

- **Comment APIs** — added `GET/POST /api/projects/[id]/activities/[activityId]/comments` plus `PATCH/DELETE` for individual comments, scoped through project read/write access and activity ownership.
- **Visibility rule** — new `lib/projects/activity-comments.ts` centralizes comment/attachment Prisma `where` builders; portal reads inject `visibility: CLIENT_VISIBLE` before querying, not after serialization.
- **Threaded UI** — `ActivityDetailPanel` now loads real threaded comments, posts through the existing TipTap `MentionEditor`, defaults to `INTERNAL`, supports replies, PM visibility toggles, deletes, and client-author badges.
- **Mentions** — comment create/update extracts TipTap mention ids and text mentions, stores them on `ActivityComment.mentions`, and emits `USER_MENTIONED` after the DB write. Project mention deep links now honor `data.deepLink`.
- **Tests/docs:** added node:test coverage for SQL-level visibility filters and mention-id extraction; F2 tracker row moved to 🟩 Done; `MASTER_REFERENCE.md` and `COMPONENT_CATALOG.md` updated.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (69 pass).

## 2026-07-14 — Project Management module: P3 Task 3.6 — F1 activity detail panel

Implements build spec §F1 on top of the E1 view switcher.

- **Activity drawer** — new `features/projects/components/activity/ActivityDetailPanel.tsx` uses `SideDrawer` and opens from Gantt bars, Table rows, and Board cards.
- **Header actions** — Mark done, Outdent, Indent, Convert to Milestone, Color, Delete, and Close are wired to existing project mutations; saves show an undo toast.
- **Editable fields** — title, description, assignee, dates, status, percent complete, owner party, effort/cost metrics, priority, and risk are editable in the drawer.
- **Approval clock/C4** — `APPROVAL_REQUESTED` activities show live business-days waiting and SLA breach styling; baselined date edits open the slip reason/owner modal before saving.
- **Subtasks/comments** — panel lists subtasks, can add a one-level subtask, and includes the comment-thread shell with INTERNAL/CLIENT_VISIBLE visibility choice for the F2 CRUD implementation.
- **Backend** — activity PATCH now accepts validated `parentActivityId` updates for one-level indent/outdent and continues to run rollup inside the mutation transaction.
- **Docs:** F1 tracker row moved to 🟩 Done; `MASTER_REFERENCE.md` and `COMPONENT_CATALOG.md` updated.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (66 pass).

## 2026-07-14 — Project Management module: P3 Task 3.5 — E1 view switcher

Implements build spec §E1 on top of the D1–D4 Gantt surface.

- **View layer** — new `ProjectViewSwitcher` replaces the always-visible Gantt/tree stack with six tabs: Gantt, Table, Board, Workload, Mindmap, and Overview.
- **Persisted filters** — new Zustand store `lib/stores/project-view-store.ts` persists active view, search, and status filter across view switches.
- **Table view** — `@tanstack/react-table` schedule table with sorting, inline status/% edits, row selection, and bulk status changes.
- **Board view** — six status columns. Drag/drop calls the existing activity PATCH route, so moving to `APPROVAL_REQUESTED` starts the C3 approval clock and emits notifications post-commit through the already-verified route.
- **Workload view** — new `GET /api/projects/workload` computes a people×weeks heatmap across all readable active projects; >100% allocation renders red.
- **Mindmap/Overview** — ReactFlow radial Project→Phase→Milestone→Activity map plus C24-style Expected vs Actual completion ring, KPI cards, and risk/approval/slip registers.
- **Docs:** E1 tracker row moved to 🟩 Done; `MASTER_REFERENCE.md` and `COMPONENT_CATALOG.md` updated.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (66 pass).

## 2026-07-14 — Project Management module: P3 Task 3.4 — D4 Gantt toolbar/export

Implements build spec §D4 on the custom PM Gantt.

- **Gantt toolbar** — added grouped Export, Baseline, Options, Columns, Segments, sort/scale/zoom, undo, critical path, duplicate, comments, minimap, legend, share, and J6 AI placeholder controls without replacing the D1–D3 virtualized scheduling surface.
- **Options** — baseline ghosts, dependencies, progress fill, weekend shading, today marker, comments badges, and minimap can now be toggled. Column preferences persist and include Assignee, EH, Start, Due, Status, Priority, Risk, %, Owner Party, and Slip Days.
- **Critical path** — reuses `lib/projects/scheduling.ts::criticalPath()` to highlight the current CPM path in red.
- **Exports** — new `GET /api/projects/[id]/gantt/export?format=pdf|png|csv|xml` returns authenticated Gantt exports. PDF and PNG reuse the shared Puppeteer browser pool; CSV and MS Project XML are generated server-side from the project tree.
- **Puppeteer helper** — `lib/letter-pdf-puppeteer.ts` now also exposes `renderHtmlToPng()` for trusted HTML exports.
- **Docs:** D4 tracker row moved to 🟩 Done; `MASTER_REFERENCE.md` and `COMPONENT_CATALOG.md` updated.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (66 pass).

## 2026-07-13 — Project Management module: P3 Task 3.3 — D3 drag, resize, dependencies

Implements build spec §D3 on top of the custom Gantt.

- **New** `lib/projects/scheduling.ts` — pure scheduling helpers: `shiftSuccessors()` cascades transitive successor shifts, `wouldCreateDependencyCycle()`/`assertNoDependencyCycle()` prevent circular dependencies, `criticalPath()` computes a CPM-style longest dependency path, plus date/duration helpers.
- **Tests** — new `lib/projects/scheduling.test.ts` with 6 node:test cases covering date shift, inclusive duration, direct FS successor shift, transitive A→B→C cascade, circular-dependency blocking, and critical path.
- **Backend routes** — project detail now includes `dependencies`; new `GET/POST /api/projects/[id]/dependencies` and `DELETE /api/projects/[id]/dependencies/[dependencyId]`; new `PATCH /api/projects/[id]/activities/schedule` persists drag/resize changes and cascaded successor shifts in one transaction, runs C4 `recordSlipDelayEvent()` for baselined date changes, then `recalcProjectRollup()` in the same transaction.
- **Gantt UI** — bars can be dragged horizontally or resized from either edge with a live date tooltip; baselined drops open the C4 reason/owner modal before persisting and cancel clears the preview; connector handles create dependencies with FS/SS/FF/SF selector; dependency arrows render and delete via confirm dialog.
- **Docs:** D3 tracker row moved to 🟩 Done; `MASTER_REFERENCE.md` and `COMPONENT_CATALOG.md` updated.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (66 pass).

## 2026-07-13 — Project Management module: P3 Task 3.2 — D2 Gantt bars, baseline overlay, colors

Implements build spec §D2 on top of the custom D1 Gantt, without starting D3 drag/dependencies.

- **Changed** `features/projects/components/gantt/GanttChart.tsx` — enriched the virtualized row model with `baselineStart/baselineEnd`, `isMilestone`, and `waitingSince`; phase and milestone rows derive actual/baseline spans from child activity dates when available.
- **Bars** — actual activity bars render with the existing exact `project-status-*` Tailwind tokens; phase rows render dark summary bars with bracket ends; milestone rows and activity rows with `isMilestone` render as diamonds.
- **Baseline overlay** — when the project is baselined, the frozen baseline span renders as a `project-baseline` ghost at 40% opacity below the actual bar, so slips are visually apparent.
- **Progress and signals** — actual bars include a darker progress fill sized to `percentComplete`; `APPROVAL_REQUESTED` bars show a clock badge with business-days-waiting via `businessDaysBetween()`; high-risk rows get the subtle danger-ring tint for D2's red signal.
- **Docs:** D2 tracker row moved to 🟩 Done; `MASTER_REFERENCE.md` and `COMPONENT_CATALOG.md` Gantt notes updated.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (60 pass).

## 2026-07-13 — Project Management module: P2 verification, C5 PDF closeout, P3 Task 3.1 D1 Gantt layout

Takeover pass for the Project Management module: independently verified the P2 gate, closed the two requested P2 gaps, then completed only P3 subtask 3.1 and stopped for review.

- **P2 gate verified:** `npx tsc --noEmit`; `npm run test:projects` (60 pass); `scripts/verify-c1.ts`, `verify-c2.ts`, `verify-c4.ts`, `verify-c5.ts`, and `verify-approval-cron.ts` all pass. Confirmed Invariant #1 via route guards (`baseline*` raw PATCH payloads return 403 on project/phase/milestone/activity routes). Confirmed Invariant #2 in the activity route (`currentStart/currentEnd` move on a baselined project returns 403 without `slipReason`+`slipOwner`; gated path creates `DelayEvent`). Confirmed re-baseline preserves v1 + v2 snapshots; approval cron dedup stamps `Activity.approvalEscalationLevel` and resolution resets it to 0.
- **C5 PDF export:** reused the existing Puppeteer pattern in `lib/letter-pdf-puppeteer.ts` by adding `renderHtmlToPdf()` on the shared warm browser pool. Added `lib/projects/delay-ledger-pdf.ts` (trusted HTML renderer with filtered rows + server totals) and `GET /api/projects/[id]/delays/pdf` (auth-scoped, Node runtime, no new PDF dep). `DelayLedgerTable.tsx` now has an `Export PDF` button beside CSV using the same active filters.
- **Approval escalation unit test:** confirmed the requested node:test coverage already exists in `lib/projects/delay-ledger.test.ts` for level 0 below SLA, level 1 at SLA, level 2 at SLA+3, and level 3 at SLA+7; re-run green.
- **P3 D1 Gantt layout:** installed the approved `@tanstack/react-virtual` dependency after checking the existing Gantt setup (only `/dashboard/plans` uses `dhtmlx-gantt`; no existing PM custom virtualized Gantt). Added `features/projects/components/gantt/GanttChart.tsx`: custom virtualized schedule surface with synced left/timeline rows, persisted resizable left pane, persisted configurable columns, row types, collapse/expand, search, sort, 5 timeline scales, zoom, today marker, two-row header, and minimap. Rendered it above the existing schedule tree without replacing completed P2 editing flows.
- **Docs:** C5 tracker note updated to include PDF; D1 tracker row moved to 🟩 Done; P3 phase marked 🟨 In Progress; `MASTER_REFERENCE.md` updated for `@tanstack/react-virtual`, C5 PDF helpers, and the D1 Gantt component.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (60 pass) · `npx tsx scripts/verify-c1.ts` · `npx tsx scripts/verify-c2.ts` · `npx tsx scripts/verify-c4.ts` · `npx tsx scripts/verify-c5.ts` · `npx tsx scripts/verify-approval-cron.ts`.

## 2026-07-13 — Project Management module: Task 2.5 — approval-clock cron (P2 complete ⭐)

Finishes Epic C: the SLA escalation sweep for the Approval Clock (build spec §C3 "fire at SLA, SLA+3, SLA+7").

- **Schema** — `Activity.approvalEscalationLevel Int @default(0)` (0=none, 1=SLA, 2=SLA+3, 3=SLA+7) for per-wait dedupe; `prisma db push` + `generate` (additive, no data loss).
- **Changed** `lib/projects/delay-ledger.ts` — pure `approvalEscalationLevel(daysWaited, sla)` + `APPROVAL_ESCALATION_OFFSETS`; the clock's RESOLVED branch now also resets `approvalEscalationLevel = 0` so a future wait re-escalates.
- **New** `lib/projects/approval-escalations.ts` — `runApprovalEscalations(now)`: finds all `APPROVAL_REQUESTED` activities with `waitingSince`, joins each project's APPROVAL-type `ClientObligation` SLA, computes business days waited (reusing `business-days.ts`), and for each newly crossed threshold stamps the level and emits `CLIENT_APPROVAL_SLA_BREACH` (level/threshold/daysOverSla in payload) — single writes, no transactions, same emit pattern as `health.ts`. Kept in its own module so `delay-ledger.ts` stays client-bundle-safe (DelayLedgerTable imports its CSV helper).
- **New** `app/api/cron/approval-clock/route.ts` — CRON_SECRET pattern copied from `project-health`; `GET = POST`.
- **Tests** — 2 new unit tests (threshold boundaries 0/1/2/3, stays at max); new E2E `scripts/verify-approval-cron.ts`: 5d waited/SLA 3 → level 1 fires once (dedupe on re-run), 8d → level 2, 12d → level 3, no-obligation project never escalates, resolution resets level + still records the 12-day APPROVAL_WAIT DelayEvent — all pass.
- **Docs:** C3 tracker row note updated (cron ✅); P2 phase row + all C rows ✅ Verified; `MASTER_REFERENCE.md` §14 cron table (approval-clock + the previously-unlisted project-health); `docs/CRON.md` VPS crontab entries; TASKS cron summary (2/6 done).
- Tests run: `npm run test:projects` (60 pass: 58 + 2 new) · `npx tsc --noEmit` (clean) · `tsx scripts/verify-approval-cron.ts` (pass) · HTTP smoke: cron compiles, runs without secret (200, `{checked:0}`).
- **⭐ P2 GATE:** all five E2E scripts re-run green — `verify-c1` (commit + snapshot v1 + slipDays), `verify-c2` (re-baseline versions retained), `verify-c4` (gated slip → BASELINE_SLIP DelayEvent w/ phase), `verify-c5` (request→approve across a weekend → APPROVAL_WAIT + SLA breach + ledger totals/filters/CSV), `verify-approval-cron` (SLA/+3/+7 escalations). C1–C5 all ✅ Verified. P3 (Gantt) is next and unblocked.

## 2026-07-13 — Project Management module: Task 2.4 — C5 Delay Ledger table

Implements build spec §C5: one screen answering "why are we late?" with server-computed owner totals.

- **Changed** `lib/projects/delay-ledger.ts` — new `listDelayLedger(db, projectId, filters)`: filtered DelayEvent query joined to activity title/baseline/current/slipDays, SLA-breach days mapped per activity from `ApprovalSlaBreach`, **owner totals computed server-side over the filtered set** (header always matches visible rows), and unfiltered facets (owners/reasons/phases) so filter dropdowns stay stable; `db` is a minimal `Pick<PrismaClient, …>` (type-only imports — module stays client-safe). New pure helpers `computeDelayOwnerTotals()` (canonical CLIENT/360GROUND/SHARED buckets + any extra owner; `total === Σ byOwner`) and `delaysToCsv()` (quoted escaping, nulls empty).
- **New** `app/api/projects/[id]/delays/route.ts` — GET (`getReadableProject`, `?owner&reason&phase` filters) → `{rows, totals, facets}`; PATCH (`getWritableProject`, Zod) edits one event's `recoveryPlan/recoveryOwner/recoveryDate` with an inline change-map audit (`PROJECT_DELAY_EVENT`).
- **New** `features/projects/components/DelayLedgerTable.tsx` — `@tanstack/react-table` (first use; already-installed dep) with columns Activity (auto badge for clock-detected rows + ⚠ when >7d without a recovery plan) · Phase · Baseline · Current · Slip · Reason (humanized via `SLIP_REASON_LABEL`) · Owner (tone-colored) · SLA (red +Nd-over badge) · Recovery (inline plan/owner/date editor when `canEdit`); owner-colored header totals; three filter selects; CSV export of the visible rows. Rendered as a "Delay Ledger" section on the project detail page. Barrel export added.
- **Hooks** — `useDelayLedger(id, filters)` (query key includes filters) + `useUpdateDelayRecovery(id)` in `features/projects/hooks/useProject.ts`.
- **Tests** — 5 new unit tests (totals arithmetic/empty/unknown-owner; CSV header+rows/comma-quote escaping/nulls); new E2E `scripts/verify-c5.ts` driving real flows (approval clock → APPROVAL_WAIT + 7-days-over SLA breach; gated slip → BASELINE_SLIP) then asserting totals 10/10, owner/reason filters, stable facets, breach flag, and filtered CSV — all pass.
- **Docs:** C5 tracker row → ✅ Verified; `MASTER_REFERENCE.md` §15.3 delay-ledger row updated. Deferred (noted in tracker): PDF export (P7 report stack) and portal rendering (P5).
- Tests run: `npm run test:projects` (58 pass: 53 + 5 new) · `npx tsc --noEmit` (clean) · `tsx scripts/verify-c5.ts` (pass) · HTTP smoke: `GET/PATCH /api/projects/:id/delays` compile, 401 unauth; detail page compiles.

## 2026-07-13 — Project Management module: Task 2.3 — C4 Slip attribution → DelayEvent

Implements build spec §C4: every date move on a baselined project is attributed to an owner + reason and lands in the delay ledger.

- **Changed** `lib/projects/delay-ledger.ts` — new `recordSlipDelayEvent(tx, params)` creates the PM-tagged `DelayEvent` (`eventType: 'BASELINE_SLIP'`, owner/reason/`reasonDetail`, `phaseAtTime` resolved from the activity's phase, `daysLost = max(0, newSlip − oldSlip)`, `isAutoDetected: false`, `startedAt = baselineEnd`, `endedAt = new end`, `recordedById`) inside the caller's transaction; plus the pure `computeSlipDaysLost()` helper.
- **Changed** `app/api/projects/[id]/activities/[activityId]/route.ts` — the existing Invariant #2 gate (403 without `slipReason`+`slipOwner`) is now followed, inside the same transaction, by the DelayEvent creation (reusing rollup's `computeSlipDays` for the post-move slip; rollup still recomputes `slipDays`). New optional `slipDetail` field in the PATCH schema.
- **Changed** `features/projects/components/ScheduleTree.tsx` — activity rows now show start/end **date inputs** for editors (plain date text for viewers). On a **baselined** project, any date change opens the new `SlipReasonDialog` instead of saving: shows activity + baseline end vs new end with ±Nd delta, owner radio (360Ground/Client/Shared), the 9-reason select with `SLIP_REASON_OWNER` auto-suggest (overridable), optional detail; **Cancel writes nothing** and the input reverts (data-bound). Non-baselined projects edit freely — no modal, no event.
- **Tests** — 2 new unit tests in `lib/projects/delay-ledger.test.ts` (`computeSlipDaysLost`: increase counts, earlier/unchanged → 0); new E2E `scripts/verify-c4.ts` mirroring the route's gated branch: free edit pre-baseline → no event; gated +10d move → event with phase/owner/reason/detail + `slipDays`=10; second move → incremental daysLost 5; earlier move → daysLost 0 — all asserts pass.
- **Docs:** C4 tracker row → ✅ Verified; `MASTER_REFERENCE.md` §15.3 delay-ledger row updated. Gantt bar snap-back on cancel remains a P3 concern (the tree input reverts via data binding).
- Tests run: `npm run test:projects` (53 pass: 51 + 2 new) · `npx tsc --noEmit` (clean) · `tsx scripts/verify-c4.ts` (pass) · HTTP smoke: activity PATCH route + detail page compile, 401 unauth.

## 2026-07-13 — Project Management module: Task 2.2 — C2 Re-Baseline

Implements build spec §C2: re-baselining as a formal, versioned, reason-required event.

- **Changed** `lib/projects/baseline.ts` — new `rebaseline(tx, projectId, {actorId, approverId, reason})`: reads current `baselineVersion`, copies current→baseline again (shared `copyCurrentToBaseline`/`buildSnapshotJson` helpers, refactored out of `commitBaseline`), increments the version, and writes a **new** `BaselineSnapshot` — prior snapshots are never touched; throws if no baseline committed. New pure helpers `computeRebaselineDiff()` (old→new per changed activity) and `datesEqual()`.
- **New** `app/api/projects/[id]/baseline/rebaseline/route.ts` — GET: diff preview (`getReadableProject`, 409 if uncommitted) → `{changes}`; POST: `getWritableProject`, Zod `reason` ≥20 chars + optional `approverId` (validated; defaults to first EXECUTIVE, else actor), runs `rebaseline` in one txn, then **post-commit** audit `REBASELINED` + `PROJECT_REBASELINED` emit (CEO channel).
- **UI** (`ProjectDetailClient.tsx`) — "Baseline vN" pill next to Schedule of Record; "Re-Baseline" button (editors, post-commit projects) opens a warning `ConfirmDialog` with the diff preview (fetched on open via new `useRebaselineDiff`), a reason textarea with live `n/20` counter (confirm disabled until ≥20), and an approver select (`useUsersForSelection`, EXECUTIVE/ADMIN). New `useRebaseline` hook.
- **Tests** — 4 new unit tests in `lib/projects/baseline.test.ts` (unchanged→empty diff, moved date→old/new ISO, null→date counts, `datesEqual` null-safety); new E2E `scripts/verify-c2.ts` (commit → move → diff=1 → re-baseline → v2 with both snapshots retained, v1 original dates intact, live baseline updated, uncommitted guard throws) — all asserts pass.
- **Concurrent-session repair (not feature work):** a parallel scrum/perf workstream landed schema + code mid-task that broke `tsc`: ran `prisma db push` (new unique constraints only, no column drops — used `--accept-data-loss` after inspection) + `prisma generate`; applied mechanical type-only fixes to `app/api/scrum/updates{,/[id]}/route.ts` (truthy-guard `result.forbidden`/`result.error`), `app/api/scrum/saved-views/route.ts` (`filtersJson as Prisma.InputJsonValue`), and `features/scrum/services/blocker-lifecycle.ts` (dropped dead `status !== 'RESOLVED'` clause). Two further breakage waves from that session (`EvaluationMetricSource` unique-constraint name collision, `managerAssignment`/`ScrumHome` in-flight edits) were resolved by the other session itself within minutes; final state re-verified clean. No logic changes made by this session.
- **Docs:** C2 tracker row → ✅ Verified; `MASTER_REFERENCE.md` §15.3 baseline row updated. Deferred to P7: report-side baseline-version *selector* UI (snapshots are stored per version; v1 remains the default for client variance).
- Tests run: `npm run test:projects` (51 pass: 47 + 4 new) · `npx tsc --noEmit` (clean) · `tsx scripts/verify-c2.ts` + re-run `verify-c1.ts` (pass) · HTTP smoke: rebaseline GET/POST compile, 401 unauth; detail page compiles.

## 2026-07-13 — Project Management module: Task 2.1 — C1 Commit Baseline

Implements build spec §C1: freeze the agreed schedule as an immutable baseline at kickoff.

- **New** `lib/projects/baseline.ts` — `commitBaseline(tx, projectId, {actorId, notes?, now?})` copies `current*→baseline*` for every Phase/Milestone/Activity, stamps the project (`baselineCommittedAt`, `baselineVersion=1`), and writes a full-schedule `BaselineSnapshot` v1 (Dates serialized to ISO strings) — all inside the caller's transaction; plus the pure `hasBaselineFieldWrite()` guard + `BASELINE_FIELD_NAMES`.
- **New** `POST /api/projects/[id]/baseline` (`app/api/projects/[id]/baseline/route.ts`) — `withAuth` + `getWritableProject`, 409 if already committed, Zod-validated optional `notes`; audit `BASELINE_COMMITTED` and `PROJECT_BASELINE_COMMITTED` emit fire **after** the transaction commits (Standing Rule #1).
- **Invariant #1 server guard** — all four schedule PATCH routes (`/api/projects/[id]`, `…/phases/[phaseId]`, `…/milestones/[milestoneId]`, `…/activities/[activityId]`) now reject raw payloads containing any baseline field (`baselineStart/End/Date`, `baselineCommittedAt/Version`) with **403** before Zod stripping. The only baseline writers are C1 commit and (later) C2 re-baseline.
- **UI** — the amber "Baseline not committed" banner in `ProjectDetailClient.tsx` gains a "Commit Baseline →" button (visible to editors) opening a warning `ConfirmDialog`: activity count + the three spec bullets + optional baseline-notes textarea; new `useCommitBaseline` hook in `features/projects/hooks/useProject.ts` (invalidates detail + list, success toast).
- **New** `lib/projects/baseline.test.ts` (5 tests: every frozen field rejected incl. null, normal edits allowed, non-object/array payloads safe, mixed payload rejected, nested keys not top-level writes) and `scripts/verify-c1.ts` E2E (template project → commit → all `baseline*==current*`, snapshot v1 with notes, slipDays 0 at commit → 10 after +10d move via `recalcProjectRollup`; cleans up).
- **Docs:** C1 tracker row → ✅ Verified; `MASTER_REFERENCE.md` §15.3 row for `lib/projects/baseline.ts`.
- Tests run: `npm run test:projects` (47 pass: 42 + 5 new) · `npx tsc --noEmit` (clean) · `tsx scripts/verify-c1.ts` (all asserts pass) · HTTP smoke: route compiles, `POST /api/projects/:id/baseline` 401 unauth, detail page compiles (307→login).

## 2026-07-13 — Project Management module: Task 2.0 — C3 emit-in-transaction fix

Review follow-up on the C3 Approval Clock slice (Standing Rule #1: side-effects fire AFTER the transaction commits, never inside `prisma.$transaction`).

- **Changed** `lib/projects/delay-ledger.ts` — `applyApprovalClock` no longer imports or calls `emit()`. It now returns an `ApprovalClockResult { decision, notifications }`, where `notifications` are intents (`{ eventKey: 'CLIENT_APPROVAL_PENDING' | 'CLIENT_APPROVAL_SLA_BREACH', payload }`) built inside the txn but fired by the caller post-commit. All DB reads/writes still use the `tx` client only; the pure `decideApprovalClockTransition` is unchanged.
- **Changed** `app/api/projects/[id]/activities/[activityId]/route.ts` — the activity PATCH captures the clock result as the `prisma.$transaction` return value and loops `emit(n.eventKey, n.payload)` after the commit, before the audit log write.
- **Docs:** C3 tracker row flipped to ✅ Verified (escalation cron remains Task 2.5; live T3 counter is P3 UI).
- Tests run: `npm run test:projects` (42 pass) · `npx tsc --noEmit` (clean) · HTTP smoke: dev server booted, `PATCH /api/projects/:id/activities/:activityId` returns 401 unauth (route compiles/loads).

## 2026-07-13 — Project Management module: C3 "The Approval Clock" (scoped slice of P2)

Implements the core of build spec §Epic C, C3 — the automatic client-approval delay clock — as an isolated, reviewable slice. Escalation cron (SLA/+3/+7) and the live T3 "days waiting" counter remain deferred (tracked in the C3 tracker row).

- **New** `lib/projects/delay-ledger.ts` — the Approval Clock state machine. `decideApprovalClockTransition()` is the pure, DB-free decision logic (`START` on →APPROVAL_REQUESTED · `RESOLVED` with business-day wait + SLA overrun on APPROVAL_REQUESTED→APPROVED|REJECTED · `NOOP` otherwise); `applyApprovalClock(tx, activity, nextStatus, opts)` is the persistence wrapper that runs entirely inside the caller's `prisma.$transaction`: sets `waitingSince`/`ownerParty=CLIENT` + emits `CLIENT_APPROVAL_PENDING` on clock start; on resolution creates the auto-detected `DelayEvent(APPROVAL_WAIT, owner=CLIENT, reason=CLIENT_APPROVAL_DELAY, phaseAtTime, startedAt=waitingSince, endedAt=now)`, and — when the project's APPROVAL-type `ClientObligation` SLA is exceeded — creates the `ApprovalSlaBreach(daysOverSla)`, increments `obligation.breachCount`, and emits `CLIENT_APPROVAL_SLA_BREACH`; always clears `waitingSince`. Reuses `lib/projects/business-days.ts::businessDaysBetween` (holidays pass-through supported). No new dependencies.
- **Changed** `app/api/projects/[id]/activities/[activityId]/route.ts` — the PATCH route now calls `applyApprovalClock` inside the existing transaction (at the former `NOTE (P2)` marker) and records the audit actions `APPROVAL_REQUESTED` / `APPROVAL_RESOLVED` (already in `lib/activity-log.ts`) instead of a generic `STATUS_CHANGED` for approval transitions.
- **New** `lib/projects/delay-ledger.test.ts` — 8 unit tests (Node built-in `node:test` + `node:assert/strict`, same style as the other `lib/projects/*.test.ts`): spec's Monday→next-Monday = 5 business days (weekend excluded), SLA 3 with 5 days ⇒ breach `daysOverSla = 2`, within-SLA no-breach, REJECTED still records, non-approval transitions are no-ops, re-request no-op, and the missing-`waitingSince` anomaly guard.
- **Docs:** C3 row in `docs/PROJECT_MANAGEMENT_MODULE_TRACKER.md` flipped to 🟨 In Progress with progress notes and file list.
- Tests run: `npm run test:projects` (42 pass: 34 existing + 8 new) · `npx tsc --noEmit` (clean).

## 2026-07-13 — Daily Scrum module: P0 foundation

Foundation pass for `docs/daily_scrum_module_IMPLEMENTATION_STRATEGY.md` and `docs/SCRUM_MODULE_TRACKER.md`. The referenced `docs/daily_scrum_module_BUILD_SPEC.md` is not present in this workspace, so story-level rows remain not-started and spec-dependent details are tracked as partial.

- **Schema:** added Daily Scrum models to `prisma/schema.prisma`: `ScrumUpdate`, `ScrumComment`, `ScrumAbsence`, `ScrumSettings`, and `ScrumUpdateLink` with OKR back-relations on `Objective`, `KeyResult`, and `Todo`; no `User` back-relations added. Applied with `npx prisma db push` to local Postgres `okr_system`.
- **Shared contracts:** added `types/scrum.ts`, `features/scrum/{index.ts,types.ts}`, root `features/index.ts` namespace export, and `lib/stores/scrum-store.ts`.
- **Services/tests:** added `features/scrum/services/working-days.ts` and `scrum-serializer.ts` plus focused tests for working-day math and mood privacy.
- **Seeds:** added and ran `scripts/seed-scrum-permissions.ts` and `scripts/seed-scrum-settings.ts`; permissions upserted 5 doctypes, 8 sensitive fields, and 20 role permission rows; settings seeded the default row with 10 public holidays.
- **Platform wiring:** added Scrum nav entry and `/dashboard/scrum` foundation page; registered activity actions/entity types; registered `SCRUM` notification category/event keys/deep links/redaction and basic email templates for scrum cron/event notifications.
- **Docs:** updated `SCRUM_MODULE_TRACKER.md`, `FEATURE_STATUS.md`, `SITEMAP.md`, `COMPONENT_CATALOG.md`, and this changelog.
- Tests run: `npx prisma validate`, `npx prisma db push`, `npm run db:seed:scrum-permissions`, `npm run db:seed:scrum-settings`, `npm run test:scrum` (9 pass), `npx tsc --noEmit`.

## 2026-07-13 — Project Management module: P1 Foundation (Epics A + B)

Second phase of `docs/project_management_module_BUILD_SPEC.md` (see P0 entry below). Delivers project creation, seeded templates, the schedule-of-record CRUD with transactional rollup, and confidence/RAG/EVM. Verified end-to-end (unit tests + service E2E + HTTP smoke).

- **A2 templates** — **New** `lib/projects/templates.ts` (3 system delivery lifecycles: Standard Software Delivery [7 phases, every approval `ownerParty=CLIENT`], Consulting/Advisory, Government Tender + `instantiateTemplateStructure()` copy-on-create) · `prisma/seed-project-templates.ts` (`npm run db:seed:project-templates`) · `GET /api/projects/templates`.
- **A1 create project** — **New** `lib/projects/service.ts` (`generateProjectCode` txn-safe `PRJ-{YYYY}-{NNN}`; `createProjectWithTemplate` — project + PM member + template tree in one txn) · `POST/GET /api/projects` (Zod, role-scoped list, PROJECT_CREATED emit + audit) · **New** `features/projects/components/CreateProjectWizard.tsx` (3-step react-hook-form) + `ProjectsListClient.tsx` + `hooks/useProjects.ts` · `app/dashboard/projects/page.tsx`.
- **B1 schedule CRUD + rollup** — **New** `lib/projects/rollup.ts` (`recalcProjectRollup`/`recalcActivityAndAncestors`, run in the same txn as every mutation — Invariant #9) · `lib/projects/access.ts` (record scoping) · project detail + nested phase/milestone/activity routes under `app/api/projects/[id]/…` (each recomputes rollup in-txn; activity PATCH enforces the baseline-date immutability + slip-reason gate, Invariants #1/#2) · **New** `features/projects/components/{ProjectDetailClient,ScheduleTree,ProjectBadges}.tsx` + `hooks/useProject.ts` · `app/dashboard/projects/[id]/page.tsx`.
- **B2 confidence + EVM** — **New** `lib/projects/health.ts` (gathers inputs, computes confidence/RAG/SPI/CPI/EAC, emits RAG-change/went-RED) · `app/api/cron/project-health/route.ts` (daily, CRON_SECRET). Confidence/SPI surfaced on the detail StatCards.
- **Design system** — new UI uses only existing tokens/primitives (`PageHeader`, `StatCard`, `EmptyState`, `Modal`, `ConfirmDialog`, Skeleton, `.btn`/`.input`, `surface-*`/`ink-*`/semantic tokens); the 6 activity-status colors use the `project-status-*` tokens (safelisted in `tailwind.config.js`). Sidebar gains a "Delivery" group (`lib/dashboard-navigation.ts`); portfolio placeholder page added.
- **Shared plumbing** — extended `EntityType`/`EventPayload` in `lib/notifications/{events,deep-link,redact}.ts` to include `PROJECT` (+ deep-link mapping). Barrel `features/projects/index.ts` exports components/hooks/types; registered in `features/index.ts`.
- Verification: `npm run test:projects` (34 pass) · `scripts/verify-p1.ts` E2E (7 phases/9 milestones/24 activities, all 4 approvals `ownerParty=CLIENT`, PM auto-added, rollup 6.7%, confidence 62.5→AMBER, cleanup) · `npx tsc --noEmit` clean · HTTP smoke on `next dev` (`/dashboard/projects` 200, `/api/projects*` 401 unauth, `/api/cron/project-health` 200).
- Deferred (tracked): A2 drag-drop **template builder UI** + clone endpoint; C24 ring (P7). P2 (baselines/delay ledger) is next and gates P3.

## 2026-07-12 — Project Management & Delivery Intelligence module: P0 groundwork

Implements the foundation ("Step 0") of `docs/project_management_module_BUILD_SPEC.md`, phase-gated per §6.1. No feature UI/routes yet — this lands the schema, guardrails, core algorithms, and cross-cutting registrations that every later phase builds on.

- **New** `docs/PROJECT_MANAGEMENT_MODULE_TRACKER.md` — per-feature tracker (A1…K3 + cross-cutting) with user story · requirements · acceptance criteria · UI/UX · DoD · status · files; seeded from the spec. This is the authoritative build-status doc for the module.
- **Changed** `CLAUDE.md` — appended "Project Management Module — Guardrails" (general dev rules + the spec's 10 Critical Invariants: baseline immutability, slip-reason hard gate, automatic approval clock, portal no-employee-name serializer + test, SQL-level comment visibility, capped AI, Jira read-only, works-without-Jira, same-txn rollup, always-audit).
- **Changed** `prisma/schema.prisma` — added 30 module models (Project, Phase, Milestone, Activity, ActivityDependency, ActivityComment/Attachment/Tag, ProjectMember, DelayEvent, BaselineSnapshot, RaidItem, ChangeRequest, StageGate, ClientObligation, ApprovalSlaBreach, CorrectionOfError, PaymentMilestone, Jira{Connection,Issue,Sprint,Worklog,Transition,SyncLog}, ProjectTemplate, ScrumLog, ProjectReport, ClientPortalUser); back-relations `Objective.projects`, `KeyResult.milestones` (Epic K); `ActivityLog.projectId` column + index + relation. Applied via `prisma db push` (local Postgres) + `prisma generate`.
- **Changed** `tailwind.config.js` — added named tokens `project-status-*` (6 exact Instagantt status colors) + `project-baseline` (ghost bar) so the spec's hard color requirements are met without inline hex.
- **New** `features/projects/types.ts` — module enums/value-sets (statuses, owner parties, slip-reason→owner taxonomy, dependency types, visibility, report types, AI caps) as the single source of truth; `features/projects/index.ts` barrel; registered in `features/index.ts`.
- **New** `lib/projects/{business-days,rollup,confidence,evm}.ts` — pure, unit-tested core algorithms: business-day math (approval clock/SLA/idle), weighted rollup + planned% + slip days + transactional `recalcProjectRollup`/`recalcActivityAndAncestors`, confidence penalty model + RAG derivation, EVM SPI/CPI/EAC. `lib/projects/*.test.ts` — 34 tests (Node built-in runner via `tsx`, **no new deps**), all passing; `npm run test:projects`.
- **Changed** `lib/activity-log.ts` — added project entity types + actions and `projectId` to `recordActivity()`.
- **Changed** `lib/notifications/events.ts` — new `PROJECT` category + 22 event keys (incl. ⭐`CLIENT_APPROVAL_PENDING`, `CLIENT_APPROVAL_SLA_BREACH`) with EVENT_META.
- **New** `scripts/seed-project-permissions.ts` (`npm run db:seed:project-permissions`) — idempotent seed of 15 DocTypes, 12 sensitive fields, and the §5.1 default role matrix (60 rows). Run against local DB.
- **New** dependency approved by reuse audit for later phases: `@tanstack/react-virtual` (Gantt virtualization, P3) — not yet installed.
- Tests run: `npm run test:projects` (34 pass), `npx prisma validate`, `npx tsc --noEmit` (clean).

## 2026-07-12 — Performance module UI: scoring-grid UX, scoped cycles, bilingual anchors, evaluation activity panel, excuse action

- **Changed** `features/performance/components/ScoringWorkspace.tsx` — (a) ArrowUp/ArrowDown (plus Enter) move focus between `[data-score-input]` cells with `preventDefault` so number inputs don't increment; (b) header shows a live running raw total across all tiers (draft rubric/manual scores + auto-metric computed scores via `useQueries` sharing the `['performance','metric-actual',…]` cache keys with each `MetricActualCell`; caption honestly notes "rubric + manual only" / "N metric scores unresolved" while metric scores are pending), tabular-nums; (c) debounced autosave — dirty criterion ids tracked, one batched `saveScores` flush ~3s after the last keystroke, ids cleared on flush and on blur-save so rows never double-save; (d) subtle outline "Excuse evaluation" header action (gated `canFeature('module.performance') && canDo('evaluation','canSubmit')`, hidden for EXCUSED/FINALIZED; server 403 remains authoritative) opening a danger ConfirmDialog with required reason, POSTing to the new excuse endpoint; (e) renders `EvaluationActivityPanel` at the bottom of both the scoring and report views.
- **Changed** `features/performance/components/CyclesWorkspace.tsx` — create-cycle form gains a scope selector: "All company" (default) vs "Specific departments" with a Checkbox multi-select fed by the shared `useDepartments` hook (react-hook-form validated: scoped cycles require ≥ 1 department). Sends `allCompany: false, departmentIds: [...]` (matches `POST /api/performance/cycles`). Cycle rows now show scoped department names (Building2 icon) from the already-returned `departments`.
- **Changed** `features/performance/components/TemplateBuilder.tsx` — rubric anchors (0/4/7/10) are now bilingual: English textarea + optional Amharic textarea ("አማርኛ" placeholder) per level. Persists `{ en, am }` when Amharic is present, plain string otherwise (matches `RubricAnchors` in `lib/performance/types.ts`); loading handles both shapes. Builder PUT (`app/api/performance/templates/[id]/builder/route.ts`) passes `anchorJson` through unchanged — verified, no route change needed.
- **New** `GET /api/performance/evaluations/[id]/activity` (`app/api/performance/evaluations/[id]/activity/route.ts`) — withAuth; allowed for `isPerformanceAdmin` OR `canViewCalibration` (evaluators/employee do NOT see the trail); returns latest 50 `ActivityLog` rows for the evaluation with actor `{ id, name, avatar }`.
- **New** `features/performance/components/EvaluationActivityPanel.tsx` — collapsible SectionCard audit trail (humanized action, actor avatar/name, date-fns relative time, compact metadata summary); gates client-side like CalibrationPanel and hides entirely on 403/empty.
- **New** `features/performance/hooks/ui-extras.ts` — self-contained hooks (pattern of `useTemplateSettings.ts`): `useEvaluationActivity` (non-retrying) and `useExcuseEvaluation` (toast + invalidates evaluation/evaluations/activity queries).
- **Changed** `features/performance/types.ts` — appended `EvaluationActivityEntry`.
- Note: `EvaluationActivityPanel` is not yet exported from `features/performance/index.ts` (barrel owned by a concurrent session); it is consumed internally by ScoringWorkspace.
- Tests run: `npx tsc --noEmit` passes.

## 2026-07-12 — Performance module: settings page/API, configurable reward rules, remark attribution, nudge day, EXCUSED flow

- **New** `GET/PATCH /api/performance/settings` (`app/api/performance/settings/route.ts`) — PerformanceSettings singleton (upserted with defaults on first read). PATCH validates `varianceThreshold` (> 0), `improvementFocusLimit` (int 1–5), `remarkAttributionEnabled` (bool), `weeklyNudgeDay` (ISO weekday 1–7, Monday=1 per schema), `recommendationRulesJson` (object/null; boolean rule keys + `criterionTrainingThreshold` 0–5, unknown keys rejected). Gated by `isPerformanceAdmin`; changes audit-logged (entity `PERFORMANCE_SETTINGS`, action `SETTINGS_UPDATED`). Response includes effective `recommendationRules` (stored JSON merged over defaults).
- **New** `/dashboard/performance/settings` page (`app/dashboard/performance/settings/page.tsx`, gated via `requirePerformancePage('page.settings.performance', 'performance_settings', 'write')`) rendering **new** `features/performance/components/PerformanceSettingsPanel.tsx` — react-hook-form with inline validation, SectionCard idiom, structured editor for the recommendation rules (four toggles + training threshold). **New** self-contained hooks `features/performance/hooks/useSettings.ts` (`usePerformanceSettings`, `useSavePerformanceSettings`); barrel exports appended in `features/performance/index.ts`; sidebar nav entry added in `lib/dashboard-navigation.ts` (featureKey `page.settings.performance`).
- **Changed** `lib/performance/finalization.ts` — hardcoded recommendation block replaced with configurable rules from `settings.recommendationRulesJson` (defaults documented in `DEFAULT_RECOMMENDATION_RULES`: `{ readyPromotionRequiresImprovingTrend: true, readySalaryAdjustment: true, readyTopTierBonus: true, onTrackBonus: true, criterionTrainingThreshold: 4 }`; new `resolveRecommendationRules()` merges stored JSON over defaults). **Fixed spec gap:** Ready band + gatekeeper pass now recommends BOTH `SALARY_ADJUSTMENT` and a top-tier `BONUS` (detailJson `{ tier: 'top' }`) when enabled. Dedup and never-auto-execute behavior unchanged. `RecommendationRules` type appended to `lib/performance/types.ts`.
- **Changed** `lib/performance/report-builder.ts` — respects `remarkAttributionEnabled`: when on, per-criterion feedback is attributed ("Name: remark; Name2: remark"); when off, unattributed as before. Numeric scores are never included either way.
- **Changed** `app/api/cron/performance-nudge/route.ts` — skips with `{ success: true, skipped: true, reason }` when today's UTC ISO weekday doesn't match `weeklyNudgeDay`; `?force=1` bypasses the day gate for manual runs. CRON_SECRET and per-week idempotency unchanged.
- **New** `POST /api/performance/evaluations/[id]/excuse` — body `{ reason }` (required); admin-only (`isPerformanceAdmin`); state-machine-validated transition to `EXCUSED` (400 on invalid); sets `excusedAt`/`excusedReason`; audit-logged (`EVALUATION_EXCUSED`).
- **Changed** `lib/activity-log.ts` — appended entity type `PERFORMANCE_SETTINGS` and actions `EVALUATION_EXCUSED`, `SETTINGS_UPDATED`; `prisma/schema.prisma` ActivityLog `entityType` comment updated (comment only — no db push needed).
- Docs updated: `docs/MASTER_REFERENCE.md` (settings + excuse API rows, settings page row), `docs/SITEMAP.md`.
- Tests run: `npx tsc --noEmit` passes.

## 2026-07-12 — Performance module: A8 template seed from source Excel workbooks (P6)

- **New** `prisma/performance-templates-seed.json` — all eight role scorecards parsed from `Engineering Team Scorecard v1.xlsx` (Software Engineer, UI-UX Designer, WordPress Developer, Project Manager, System Analyst, CEO) and `Sales_Engineering_OKR_Scorecard 2025-2026 OKR.xlsx` (Sales Engineering rubric + SE OKR metric scorecard). Rubric templates: 4 tiers (40/40/20/60), 10 role criteria + C1–C6 culture criteria with full 0/4/7/10 anchors, gatekeeper Tier 1 ≥ 25, bands 85 "Ready" / 70 "On Track" / 0 "Not Ready". SE OKR: 6 tiers, 210 max points, 14 `LINEAR_CAPPED` metrics with unit/period/target, 1 `INVERSE_BANDS` (compliance errors 0→10, 1→5, else 0), culture tier as `MANUAL`.
- **New** `prisma/seed-performance-templates.ts` (`npm run db:seed:performance`) — idempotent (skips existing families), runs each template through `validateTemplateForPublish` before creating it as v1 PUBLISHED, owned by the earliest active ADMIN. KR links for SE OKR metrics are per-employee `MetricSourceMapping` and left for HR to wire (flagged `METRIC_SOURCE_MISSING` at cycle open), per spec A8.
- Tests run: `npx tsc --noEmit` passes; seeder run twice against local dev DB (8× SEED then 8× SKIP).

## 2026-07-12 — Performance module: correctness bugs (P1) + notifications & audit logging (P2)

Full audit of the module against `docs/performance_scorecard_module_requirements_detailed.md` (per-requirement statuses + findings appendix added there). Backend fixes:

- **Fixed** `app/api/performance/evaluations/[id]/calibration/route.ts` — resolve now requires status `CALIBRATION` and asserts the state-machine transition; previously it could demote a FINALIZED evaluation back to CONSOLIDATED.
- **Fixed** `app/api/performance/evaluations/[id]/panel/route.ts` — diff-based panel update (add/remove/role-change) replaces delete-all-recreate, so retained SUBMITTED evaluators keep their status and `submittedAt`; panel changes now also require the cycle to be OPEN (closed cycles were writable).
- **Fixed** `app/api/performance/evaluations/[id]/route.ts` — the evaluated employee always gets the sealed/consolidated employee branch of their own evaluation, even when they are a performance admin (spec F1 "never sees own raw evaluator scores").
- **Fixed** `features/performance/components/ScoringWorkspace.tsx` — inputs lock client-side once the caller's own assignment is SUBMITTED (server already 403'd).
- **New** graceful `ACTUAL_UNAVAILABLE` flow: `MetricActualUnavailableError` (lib/performance/metric-resolver.ts); consolidation pre-flights every auto metric, creates deduplicated `ACTUAL_UNAVAILABLE` ReviewCycleIssues and blocks with a typed error instead of a 500 (lib/performance/consolidation.ts); submit route reports `consolidationBlocked` while preserving the submission; successful consolidation auto-resolves stale issues.
- **New** `POST /api/performance/evaluations/[id]/consolidate` — manual consolidation retry (lead/admin): refreshes frozen `EvaluationMetricSource` snapshots from current mappings, re-runs consolidation. Policy: `canTriggerConsolidation`.
- **New** `PATCH /api/performance/cycles/[id]/issues/[issueId]` — resolve/waive/reopen review-cycle issues (previously the issue lifecycle had no write path). Policy: `canResolveCycleIssue`.
- **New** notifications: `PERFORMANCE` category + `PERF_CYCLE_OPENED`, `PERF_PANEL_COMPLETE`, `PERF_DRAFT_SHARED`, `PERF_DISPUTE_RAISED`, `PERF_ACTION_RECOMMENDED`, `PERF_WEEKLY_FOCUS` in `lib/notifications/events.ts` with dispatcher routing (explicit recipients), deep links, and email templates. Emitted from cycle open, last-submitter consolidation, share-draft, dispute, and finalize (recommended actions → performance admins via new `resolvePerformanceAdmins()` in `lib/performance/notifications.ts`).
- **Changed** `app/api/cron/performance-nudge/route.ts` — weekly nudge now routes through the dispatcher (`emit`), so the email half actually delivers (in-app row + email/digest per user prefs); the old `emailMode: 'DIGEST_WEEKLY'` dead flag had no consumer. Weekly idempotency via `PerformanceNudgeDelivery` unchanged; payload stays score-free.
- **New** audit logging across the module (was entirely absent): `ActivityLog.evaluationId` column + relation (schema — **requires `prisma db push`**), `EVALUATION`/`REVIEW_CYCLE`/`DEVELOPMENT_ACTION` entity types and performance lifecycle actions in `lib/activity-log.ts`; `recordActivity` calls on cycle open/close (incl. override reason), panel updates, consolidation (auto + retry), calibration resolve, draft share, acknowledge, dispute, finalize (incl. recommended action types), issue resolution, and development-action approve/reject/execute.
- Tests run: `npx tsc --noEmit` passes; `npx prisma validate` passes; `npx next build` run at end of session.

## 2026-07-12 — Performance module UI-consistency restyle (Apple Pro idiom; behavior-preserving)

- **Updated** `features/performance/components/PerformanceStatusBadge.tsx` — reworked to the shared `StatusPill` visual language: colored dot + humanized label ("Draft shared"), `rounded-full text-[11px] font-semibold`, AP rgba tints per status (ASSIGNED/IN_PROGRESS blue, CONSOLIDATED/CONSOLIDATING/EXECUTED teal, CALIBRATION warning, DRAFT_SHARED purple, FINALIZED/PUBLISHED/RESOLVED/SUBMITTED/APPROVED success, REJECTED danger, EXCUSED/DRAFT/ARCHIVED/PLANNED/CLOSED/WAIVED/PENDING neutral). Exports `humanizeEnum()` used to humanize cadence/type/role enum text in CyclesWorkspace, ActionsWorkspace, EvaluatorQueue, ScoringWorkspace.
- **New** `features/performance/components/SectionCard.tsx` — feature-internal Apple Pro section card (rounded-[14px], `var(--ap-border)`, uppercase kicker header) replacing generic shadcn `Card` across all performance workspaces.
- **New** `features/performance/components/NativeSelect.tsx` — single styled native `<select>` (forwardRef, matches shared `Input`) replacing 7 hand-rolled `<select className="h-9 ...">` copies (CyclesWorkspace, RoleMappingManager, MetricMappingManager ×2, PanelManager, TemplateBuilder ×3, TemplateScoringSettings).
- **New** `app/dashboard/performance/loading.tsx` — route-level skeleton (hero + KPI cards + rows) mirroring `app/dashboard/objectives/loading.tsx`.
- **Updated** all 7 `app/dashboard/performance/**/page.tsx` — `PageHeader` replaced with the MyOKRsPage hero-card header (`rounded-[14px] border var(--ap-border)`, 24px −0.02em title, 13px muted description); breadcrumb back-links on `templates/[id]` (kept) and **new** on `evaluations/[id]/score` → Evaluation Queue.
- **Updated** `ActionsWorkspace.tsx` — Approve/Reject/Execute now go through `ConfirmDialog` (Reject styled danger) with the decision/execution note field inside the dialog; loading skeletons; humanized action types.
- **Updated** `RoleMappingManager.tsx` — react-hook-form for the add-mapping form; `ConfirmDialog` (danger) on mapping delete; `NativeSelect`; EmptyState icon.
- **Updated** `MetricMappingManager.tsx` — react-hook-form for criterion/employee/search fields; shared `Checkbox` replaces raw `<input type="checkbox">`; skeleton loading; EmptyState icons.
- **Updated** `PerformanceHome.tsx` — StatGrid/StatCard row replaced with `KpiCard` (tabular-nums, AP tints); weekly-step form migrated to react-hook-form with shared `Input`/`Button` and inline required error; SectionCards + skeletons.
- **Updated** `PerformanceReport.tsx` — KpiCard stat row; acknowledge/dispute comment migrated to react-hook-form with required-on-dispute inline error (dispute button no longer silently disabled); SectionCards; tabular-nums scores.
- **Updated** `ScoringWorkspace.tsx` — rubric-anchor JSON.stringify tooltip replaced with a formatted anchor popover (keys sorted numerically 0/4/7/10; `{en, am}` values render `.en`); client-side score clamp on blur with a brief inline hint (server validation unchanged); metric-actual warning banner → shared `Alert` (warning tokens kept); page-level and metric-cell skeletons; EmptyStates gained icons/descriptions; header + tier cards restyled to AP idiom.
- **Updated** `CalibrationPanel.tsx`, `CyclesWorkspace.tsx`, `CycleIssuesModal.tsx`, `EvaluatorQueue.tsx`, `TemplatesWorkspace.tsx`, `TemplateBuilder.tsx`, `TemplateScoringSettings.tsx`, `PanelManager.tsx`, `OkrAttainmentSection.tsx` — SectionCard/AP card conversion, skeleton loaders, NativeSelect, humanized enums, `var(--ap-border)` borders, first/last row padding fixes.
- **Updated** `CompetencyRadar.tsx`, `PerformanceTrend.tsx` — hardcoded hex chart colors replaced with AP CSS vars (`var(--ap-accent)`, `var(--ap-fg-subtle)`, `var(--ap-border)`, `var(--ap-bg-raised)`).
- No changes to data flow, API calls, hooks/queries, or permission checks — behavior-preserving restyle only.
- Tests run: `npx tsc --noEmit` — passes clean.

## 2026-07-12 — Performance module: report charts (radar/trend/OKR attainment), My Performance dashboard charts, builder scoring rules/reordering/gatekeeper editor

- **Updated** `lib/performance/report-builder.ts` — `createEvaluationReport` contentJson now also includes `trend` (prior FINALIZED evaluations' `{ cycleId, cycleName, periodEnd, normalized }`, ordered by period) and `okrAttainment` (`{ periodStart, periodEnd, objectives[] }` — employee-owned objectives whose timeframe overlaps the cycle period, with their key results' start/target/current values and progress).
- **New** `features/performance/components/CompetencyRadar.tsx` — recharts RadarChart of consolidated scores as % of max; `radarItemsFromTierBreakdown()` picks tier-level axes (≥3 tiers) or falls back to criterion-level.
- **New** `features/performance/components/PerformanceTrend.tsx` — multi-cycle normalized-score LineChart; single-point series shows a "more data needed" note.
- **New** `features/performance/components/OkrAttainmentSection.tsx` — compact OKR attainment card (objectives + KRs with progress bars, `getProgressColor` tokens).
- **Updated** `features/performance/components/PerformanceReport.tsx` — renders competency radar, cross-cycle trend (prior trend points + current report score), and OKR attainment section above the tier breakdown.
- **Updated** `app/api/performance/me/route.ts` — adds `cycle.status` to evaluation rows and a `latestReport` field (latest FINALIZED evaluation's SHARED/FINAL report contentJson only — consolidated data, never raw evaluator scores; sealing behavior unchanged).
- **Updated** `features/performance/components/PerformanceHome.tsx` — radar (latest finalized report) + trend charts for employees with ≥1 finalized evaluation, and an "Evaluation in progress — results sealed" alert when a sealed evaluation exists in an OPEN/CONSOLIDATING cycle.
- **Updated** `features/performance/components/TemplateBuilder.tsx` — metric scoring-rule picker (LINEAR_CAPPED with maxScore, INVERSE_BANDS with editable `{ maxActual, score }` band list, MANUAL), new `periodLabel` input, and move-up/move-down reordering for tiers and criteria (position persists via the full-replace builder PUT).
- **New** `features/performance/components/TemplateScoringSettings.tsx` — gatekeeper (`{ tierName, threshold }`) and decision-bands (`[{ min, label }]`) editor with inline validation matching `lib/performance/scoring.ts` rules, saved via PATCH `/api/performance/templates/[id]` (`{ gatekeeper, bands }`).
- **New** `features/performance/hooks/useTemplateSettings.ts` — `useSaveTemplateSettings` mutation for the template PATCH.
- **Updated** `features/performance/types.ts` (append-only) — `PerformanceTrendPoint`, `OkrAttainmentKeyResult`, `OkrAttainmentObjective`, `OkrAttainment`, `EvaluationReportContent`, `MyPerformanceChartData`.
- **Updated** `docs/COMPONENT_CATALOG.md` — new performance component rows.
- Tests run: `npx tsc --noEmit` — passes clean.

## 2026-07-12 — Performance module UI: close cycle, cycle issues, panel management, calibration comparison, consolidation retry

- **Updated** `features/performance/types.ts` — added `CycleIssueType`, `CycleIssueStatus`, `ReviewCycleIssue`, `ReviewCycleDetail`, `PanelMember`, `PanelAssignment`, `CalibrationDetail`.
- **Updated** `features/performance/services/api.ts` — added `getCycle`, `closeCycle`, `updateCycleIssue`, `savePanel`, `getCalibration`, `retryConsolidation`.
- **Updated** `features/performance/hooks/queries.ts` — added `useReviewCycle`, `useCloseReviewCycle`, `useUpdateCycleIssue`, `useSavePanel`, `useCalibrationDetail`, `useRetryConsolidation`, and exported `getErrorDetailIds` helper for structured 400 details.
- **Updated** `features/performance/components/CyclesWorkspace.tsx` — Close-cycle action for OPEN/CONSOLIDATING cycles with incomplete-evaluation override dialog (`ConfirmDialog` + required override reason), View-issues button per cycle, and inline form validation errors on the create-cycle form.
- **New** `features/performance/components/CycleIssuesModal.tsx` — per-cycle issue list with type labels, employee, detail, status badge, and Resolve/Waive actions (PATCH `/api/performance/cycles/[id]/issues/[issueId]`).
- **New** `features/performance/components/PanelManager.tsx` — evaluator panel editor (add via `useUsersForSelection`, remove, set exactly one LEAD) saving via PUT `/api/performance/evaluations/[id]/panel`, with confirm-and-resubmit (`confirmDiscardSubmitted: true`) when removing submitted evaluators.
- **Updated** `features/performance/components/ScoringWorkspace.tsx` — header now hosts PanelManager (permission-gated, ASSIGNED/IN_PROGRESS + open cycle) and a Retry-consolidation button when all evaluators submitted but the evaluation is not consolidated (POST `/api/performance/evaluations/[id]/consolidate`).
- **Updated** `features/performance/components/CalibrationPanel.tsx` — side-by-side evaluator score comparison table (columns per evaluator, flagged rows highlighted) from GET `/api/performance/evaluations/[id]/calibration`; the query is permission-gated and non-retrying, so 403s just hide the table.
- **Updated** `features/performance/index.ts` — exported `CycleIssuesModal` and `PanelManager`.
- **Updated** `docs/COMPONENT_CATALOG.md` — performance component rows updated/added.
- Tests run: `npx tsc --noEmit` — passes clean.

## 2026-06-09 — Permission system fallback + letter duplicate + fonts + settings nav + CI fixes

- **Fixed** `lib/permission-resolver.ts` — `fetchActiveUserRoles` synthesizes a `legacy-<ROLE>` entry from `User.role` when `UserRole` table has no rows, ensuring the ADMIN shortcut fires for admin users even before seed runs.
- **Fixed** `lib/rbac.ts` — DB returning `false` from `resolveDocTypePermission` no longer short-circuits to `return false`; now falls through to legacy hardcoded role logic.
- **Fixed** `lib/letter-permissions.ts` — `checkLetterPermissionV2` counts active `UserRole` rows first; if zero, skips resolver and uses `DEFAULT_LETTER_MATRIX` keyed by `User.role`. Added `legacyLetterCheck` helper. Added `prisma` import.
- **Fixed** `lib/api/withAuth.ts` — `withRoleOrFeature` catch now fails open (runs handler) instead of returning 403 when feature-permission DB unavailable.
- **Fixed** `scripts/benchmark-permissions.ts` — replaced `BigInt`/`hrtime.bigint()` with `process.hrtime()` for `es5` tsconfig compat.
- **Fixed** `scripts/migrate-letter-permissions.ts` — `actorId`/`changes` changed from `null` to `undefined`.
- **Fixed** `app/api/permissions/export/route.ts` — changed `new Response` to `new NextResponse` to match `withRole` handler type.
- **Fixed** `components/settings/permissions/ByDocTypeTab.tsx` — flatten `dtRes.data?.modules` via `Object.values(...).flat()` to fix `p.reduce is not a function`.
- **Fixed** `components/settings/permissions/FieldLevelsTab.tsx` — same modules-flatten fix.
- **Fixed** `app/dashboard/settings/layout.tsx` — rendered `SettingsNav` in sidebar so Permission Manager menu is visible.
- **Added** `app/api/letters/[id]/duplicate/route.ts` — `POST` endpoint to copy a letter as DRAFT.
- **Added** `lib/activity-log.ts` — `LETTER_DUPLICATED` action type.
- **Added** `features/letters/services/lettersApi.ts` — `duplicateLetter()` API call.
- **Updated** `features/letters/components/LettersTable.tsx` — copy icon button per row to duplicate a letter.
- **Updated** `features/letters/components/LetterFormClient.tsx` — Duplicate button in PageHeader; removed `FontPicker` and `font`/`setFont` from context.
- **Updated** `features/letters/i18n.ts` — 10 fonts with Noto Sans Ethiopic as default; simplified `LetterLangContext` (removed font/setFont).
- **Updated** `lib/letter-html.tsx` — `GOOGLE_FONTS_IMPORT` for 10 fonts; `DEFAULT_FONT = 'Noto Sans Ethiopic'`; NotoSansEthiopic TTF font-faces.
- Tests run: `npx tsc --noEmit` — passes clean.

## 2026-06-07 — Precise kanban drag-and-drop with insertion-line indicator

- **Schema** `prisma/schema.prisma` — added `sortOrder Int @default(0)` to `Todo` model + `@@index([status, sortOrder])`.
- **Updated** `app/api/sprints/[id]/board/route.ts` — `orderBy` now `[sprintPosition ASC, createdAt ASC]`.
- **Updated** `app/api/todos/route.ts` — `orderBy` now `[sortOrder ASC, createdAt ASC]`.
- **Updated** `app/api/todos/[id]/route.ts` — PATCH now accepts and persists `sprintPosition` and `sortOrder`.
- **New** `app/api/sprints/[id]/board/reorder/route.ts` — `POST { columnOrders }` writes sprintPosition for sprint lanes.
- **New** `app/api/todos/reorder/route.ts` — `POST { columnOrders }` writes sortOrder for global todo kanban.
- **New** `components/shared/KanbanDropLine.tsx` — animated 2 px insertion-line indicator with circle cap.
- **Updated** `features/sprints/components/TaskCardTrello.tsx` — added `onDragEnd` + `isDragging` props.
- **Rewritten** `features/sprints/components/SprintBoardClient.tsx` — full DnD: localColumns optimistic state, per-column onDragOver card-rect scan, KanbanDropLine between cards, empty-column highlighted drop zone, cross-column status + position persistence.
- **Rewritten** `components/todos-page/TodoKanbanView.tsx` — same DnD pattern; localRows optimistic state; onReorder prop.
- **Updated** `lib/stores/todo-store.ts` — added `reorder(columnOrders)` action.
- **Updated** `components/todos-page/TodosPageClient.tsx` — passes `onReorder` to `TodoKanbanView`.
- **Tests:** not run

## 2026-06-07 — Performance permission and role-design alignment

- Replaced hardcoded Performance `ADMIN` checks with effective permission policy: module feature + workflow feature + DocType action + mandatory relationship/lifecycle/privacy predicate.
- Added module-scoped `PERFORMANCE_ADMIN` system role/profile, all 22 Performance DocTypes, 11 sensitive field definitions, and 32 Performance page/action feature keys to the idempotent permission seed.
- Updated effective permission resolution to include active direct roles and role-profile memberships; feature resolution now honors `enabled` and user overrides.
- Updated record scoping and field filtering to use the same effective role set.
- Enforced permissions across all Performance list/detail/workflow APIs, including draft template visibility, score create/write/submit, panel management, calibration, reports, acknowledgement/dispute, and development actions.
- Preserved server-side blind evaluation and score sealing; employee acknowledgement override is restricted to a Performance administrator.
- Added permission-aware Performance navigation, server page guards, and workflow action visibility.
- Verification: targeted syntax transpilation passed across 64 files; structural audit confirms 22 Performance DocTypes, 32 Performance feature/action keys, and 29 Performance API routes; `git diff --check` passed. Full TypeScript check remains blocked by the unrelated `hooks/useIdleTimeout.ts` JSX parse error.

## 2026-06-07 — User dropdown menu + session idle timeout

- **Updated** `lib/auth.ts` — added `maxAge: 14400` (4 hours) to NextAuth session config so JWTs expire server-side after 4 hours of inactivity regardless of client state.
- **New route** `app/api/auth/change-password/route.ts` — `POST` handler using `withAuth`; verifies current password via bcrypt, validates new != current, hashes and persists new password.
- **New hook** `hooks/useIdleTimeout.ts` — monitors `mousedown`, `mousemove`, `keydown`, `scroll`, `touchstart` events; shows a warning toast with "Stay signed in" button at T−5 min; calls `signOut` at T=4 hours.
- **Updated** `hooks/index.ts` — exports `useIdleTimeout`.
- **Updated** `components/layout/Header.tsx` — expanded user dropdown: added "My OKRs" (`/dashboard/okrs?owner=me`), "My To-Dos" (`/dashboard/todos`), "Change Password" (inline modal), proper group separators, destructive styling on Sign Out. Change Password modal uses `react-hook-form`, calls `/api/auth/change-password`, shows inline field errors and success toast.
- **Updated** `components/layout/DashboardShell.tsx` — mounts `useIdleTimeout()` so the idle timer covers all authenticated pages.
- **Tests:** not run

## 2026-06-07 — Per-field R/W permission storage and cache invalidation

- **Schema** `prisma/schema.prisma`
  - Added `fieldPermissions RoleDocTypeFieldPermission[]` relation to `Role` model.
  - Added new `RoleDocTypeFieldPermission` model (table `role_doctype_field_permissions`) with fields `id, roleId, doctypeKey, fieldName, canRead, canWrite`, unique constraint `[roleId, doctypeKey, fieldName]`, and cascade-delete via `Role`.
- **New route** `app/api/permissions/roles/[id]/field-permissions/[doctypeKey]/route.ts`
  - `GET`: returns all `RoleDocTypeFieldPermission` rows for `(roleId, doctypeKey)`.
  - `PUT`: bulk-upserts `{ fieldPerms: [{fieldName, canRead, canWrite}] }` in a `$transaction`, then calls `permissionCache.invalidateAll()`. Both handlers use `withRole(['ADMIN'])`.
- **Updated** `app/api/permissions/doctypes/[key]/fields/route.ts`
  - After upsert, now also calls `invalidateAllFieldPermLevelCache()` (dynamic import, best-effort) to flush the module-local numeric permLevel cache and per-field R/W cache in `field-filter.ts`.
- **Updated** `lib/field-filter.ts`
  - Added module-local `fieldRwCache` (Map keyed by sorted roleIds + doctypeKey) with 30-second TTL and LRU eviction at 5,000 entries.
  - Exported new `invalidateAllFieldPermLevelCache()` that clears both `permLevelCache` and `fieldRwCache`.
  - Added `getFieldRwPermissions(roleIds, doctypeKey)`: fetches `RoleDocTypeFieldPermission` rows, merges most-permissive-wins across roles, caches result.
  - Added `getPerFieldRedactSet(userId, doctypeKey, operation)`: resolves user's active role IDs, calls `getFieldRwPermissions`, returns Set of field names to redact based on `canRead` (read ops) or `canWrite` (write ops).
  - Updated `filterFieldsByPermLevel` and `filterArrayByPermLevel` with new optional 4th param `operation: 'read' | 'write' = 'read'`. Both now run permLevel and per-field R/W checks in combination; both lookups run in parallel via `Promise.all`.
- **Tests:** not run

## 2026-06-07 — Add per-field Read/Write toggles to FieldLevelsTab

- **Updated** `components/settings/permissions/FieldLevelsTab.tsx`
  - Added `useRef` import for debounce timer.
  - Added `FieldReadWrite` interface `{ canRead, canWrite }`.
  - Added `fieldPerms` state (`Map<string, FieldReadWrite>`) and `fieldPermsLoading` state, plus `debounceRef`.
  - Added new `useEffect` that fetches `GET /api/permissions/roles/[selectedRole]/field-permissions/[selectedDoctype]` whenever both selectors are set; populates `fieldPerms` map; clears map when either selector is cleared.
  - Added `handleFieldPermChange` callback: optimistically updates `fieldPerms`, debounces 800 ms, then fires `PUT /api/permissions/roles/[selectedRole]/field-permissions/[selectedDoctype]` with full `{ fieldPerms: Array<{fieldName,canRead,canWrite}> }` body.
  - Added two new `<th>` columns — "Read" and "Write" — after the existing Mandatory column.
  - Added corresponding `<td>` checkboxes per row: Read defaults to `true`, Write defaults to `false` when a field has no stored entry.
  - Added explanatory note `<p className="text-xs text-muted-foreground mb-2">` above the table.
  - All existing permLevel (visible/editable/mandatory) toggle logic left intact.
- **Tests:** not run

## 2026-06-07 — Performance & Scorecard module implementation

- Added the performance implementation proposal and requirement-level status tracker.
- Added the Prisma performance domain: versioned templates, criteria library, role/employee/metric mappings, review cycles/issues, evaluations/panels/scores/results, reports/acknowledgements, improvement focuses/nudge delivery, and development actions.
- Added fail-closed performance policy, scoring, validation, cycle-opening, metric resolution, consolidation, report, finalization, and recommendation services under `lib/performance/`.
- Added 29 performance API routes covering template lifecycle, culture block insertion, mappings, cycles, evaluator panels, live OKR actuals, scoring, consolidation/calibration, reports, acknowledgement/dispute/finalization, focuses, and action transitions.
- Added the `features/performance/` client module and seven dashboard routes for My Performance, evaluation queue/workspace, templates/builder, cycles, and development actions.
- Added Performance navigation, DocTypes, and feature permission seed entries.
- Verification: `prisma validate`, `prisma generate`, performance-focused TypeScript check, and scoped `git diff --check` pass. Full build compiles Next.js but is blocked by the pre-existing unrelated type error at `app/api/permissions/export/route.ts:17`.
- Remaining partial/blocked scope is recorded in `docs/PERFORMANCE_SCORECARD_IMPLEMENTATION_STATUS.md`, including Excel seed source absence, report visuals, dispatcher/email wiring, and performance ActivityLog integration.

## 2026-06-07 — Verify FeaturesTab orphan + wire filterFieldsByPermLevel into API routes

- **Task A — FeaturesTab.tsx** (`components/settings/permissions/FeaturesTab.tsx`)
  - Verified the file contains only `export { default } from './FeaturesNavTab'` (re-export, no unique content).
  - Confirmed no file in the codebase imports `FeaturesTab`; `PermissionManager.tsx` does not exist as a discoverable file importing it. No changes needed.
- **Task B — Wire filterFieldsByPermLevel into additional routes**
  - **Updated** `app/api/keyresults/[id]/route.ts`: added `import { filterFieldsByPermLevel } from '@/lib/field-filter'`; GET handler now runs `filterFieldsByPermLevel(processedKeyResult, 'key_result', session.user.id)` before returning.
  - **Updated** `app/api/objectives/[id]/route.ts`: added `import { filterFieldsByPermLevel } from '@/lib/field-filter'`; GET handler now runs `filterFieldsByPermLevel(processedObjective, 'objective', session.user.id)` before returning.
  - **Updated** `app/api/users/route.ts`: added `import { filterArrayByPermLevel } from '@/lib/field-filter'`; GET handler signature updated to receive `(_request, { session })`; users array passed through `filterArrayByPermLevel(users, 'user', session.user.id)` before returning.
- **Tests:** not run

## 2026-06-07 — Fix RecordScopingTab API paths + add live preview

- **Updated** `components/settings/permissions/RecordScopingTab.tsx`
  - Fixed all four wrong API paths (`/api/permissions/scope-rules`, `/api/permissions/scope-rules/[id]`) — replaced with correct role-scoped routes: `GET/POST /api/permissions/roles/[selectedRoleId]/scope-rules` and `PUT/DELETE /api/permissions/roles/[selectedRoleId]/scope-rules/[ruleId]`
  - Introduced `selectedRoleId` state as the role selector driving all rule fetches; rules reload on role change
  - Updated `ScopeRule` interface to match the real `RecordScopeRule` Prisma model (`doctypeKey`, `fieldName`, `operator`, `valueType`, `staticValue`, `isActive`) — removed non-existent `defaultScope`, `allowedScopes`, `conditions`, `roleName` fields
  - Client-side `doctypeFilter` input filters the fetched rule list by `doctypeKey` without extra API calls
  - Updated POST body fields to match what the API actually accepts (`doctypeKey`, `fieldName`, `operator`, `valueType`, `staticValue`)
  - Replaced scope toggle (PUT `defaultScope`) with `isActive` toggle; PUT body is now `{ isActive: boolean }` matching the API
  - Added live preview section: user search (client-side filter over `/api/users/for-selection`), DocType picker, runs `GET /api/permissions/preview/[userId]` and reads `effectivePermissions.doctypePermissions[key].applyScoping` to show whether scoping is ON or OFF for that user+doctype
- **Tests:** not run

## 2026-06-07 — Fix FeaturesNavTab API paths and add module cascade-hide

- **Updated** `components/settings/permissions/FeaturesNavTab.tsx`
  - TASK A: replaced wrong `GET /api/permissions/features` with `GET /api/permissions/roles/[selectedRoleId]/features` (fetched when role selector changes)
  - TASK A: replaced wrong `PUT /api/permissions/features/[id]` with bulk `PUT /api/permissions/roles/[selectedRoleId]/features` sending full `{ features: [{ featureKey, visible, enabled }] }` array on every toggle
  - TASK A: added role selector dropdown (fetched from existing `GET /api/permissions/roles`); features reload whenever selected role changes
  - TASK B: added `MODULE_CHILDREN` hierarchy map; when a `module.*` key is toggled off, all child page/button/tab keys in the map are also set `visible = false` in local state before the bulk PUT
  - TASK B: added amber cascade note banner: "Hidden modules auto-hide their pages and buttons"
  - Replaced cross-role `roleAccess` data model with per-role `FeaturePermission[]` matching the real API shape `{ id, roleId, featureKey, visible, enabled }`
  - Re-grouped display by key prefix (module / page / button / tab / other) instead of the old `category` field that no longer comes from the API
- **Tests:** not run

## 2026-06-07 — Fix can() DB deny short-circuit in lib/rbac.ts

- **Updated** `lib/rbac.ts` — FIX A: replaced broken short-circuit logic in the DOCTYPE_ACTION_MAP DB check; previously a `false` DB result fell through to hardcoded logic which could still grant access; now both directions are terminal: `if (dbResult) return true; return false` — safe because `resolveDocTypePermission` already checks UserPermissionOverride grants before returning
- FIX B: audited the `Action` type — no `sprint.*`, `letter.*`, or `dtp.*` actions exist in the type definition; no DOCTYPE_ACTION_MAP entries were added
- **Tests:** not run

## 2026-06-07 — Add ExplainPanel "Permission Check" tab to PermissionManager

- **Created** `components/settings/permissions/ExplainPanel.tsx` — self-contained panel; fetches user list from `/api/users/for-selection`; three selectors (User, DocType, Action); calls `GET /api/permissions/explain`; renders allowed/denied badge, explanation, and full details breakdown (adminBypass, explicitDeny, explicitGrant, roleGrants, scopingApplied, scopeRules)
- **Updated** `components/settings/PermissionManager.tsx` — added `'permission-check'` to Tab union and TABS array; imported `ExplainPanel`; rendered it when the new tab is active
- **Updated** `docs/COMPONENT_CATALOG.md` — added `ExplainPanel` row to Permission Manager Tabs table
- **Tests:** not run

## 2026-06-07 — Add permission cache/resolver performance benchmark script

- **Created** `scripts/benchmark-permissions.ts` — standalone tsx/ts-node script that benchmarks `resolveDocTypePermission()` and `permissionCache.get()` with nanosecond precision (`process.hrtime.bigint()`); reports cache MISS time (target ≤10 ms), cache HIT avg over 99 warm runs (target ≤1 ms), and pure `permissionCache.get()` avg over 10,000 calls (target ≤0.1 ms); exits 0 if DB unreachable, exits 1 if any target is missed
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`

## 2026-06-07 — Wire buildScopeFilter into remaining list API routes

- **Updated** `app/api/letters/route.ts` — GET handler: imported `buildScopeFilter`, added `scopeFilter = await buildScopeFilter(session.user.id, 'letter')`, spread into both `findMany` and `count` where clauses
- **Updated** `app/api/sprints/route.ts` — GET handler: imported `buildScopeFilter`, destructured `{ session }` from handler context (was missing), added `scopeFilter = await buildScopeFilter(session.user.id, 'sprint')`, spread into `findMany` where clause
- **Updated** `app/api/dtp/plans/route.ts` — GET handler: imported `buildScopeFilter`, added `scopeFilter = await buildScopeFilter(session.user.id, 'daily_trip_plan')`, spread into both `findMany` and `count` where clauses (after existing role-based visibility scoping block)
- **Updated** `app/api/keyresults/route.ts` — GET handler: imported `buildScopeFilter`, added `scopeFilter = await buildScopeFilter(session.user.id, 'key_result')`, spread into both `findMany` and `count` where clauses
- All POST handlers left untouched; null-coalescing pattern `...(scopeFilter ?? {})` used throughout so routes remain unaffected when no scope rules apply
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`

## 2026-06-07 — Wire filterFieldsByPermLevel into sensitive API routes

- **Updated** `app/api/users/[id]/route.ts` — GET handler now destructures `session` from ctx, imports `filterFieldsByPermLevel`, and awaits it on the fetched user record before returning; doctype key `'user'`
- **Updated** `app/api/letters/[id]/route.ts` — GET handler now destructures `session` from ctx, imports `filterFieldsByPermLevel`, and awaits it on the fetched letter record before returning; doctype key `'letter'`
- **Updated** `app/api/dtp/drivers/route.ts` — GET handler now destructures `session` from ctx (replacing unused `_ctx`), imports `filterArrayByPermLevel`, and awaits it on the full drivers list before returning; doctype key `'driver'`
- POST/PATCH/DELETE handlers in all three files left unchanged
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`

## 2026-06-07 — Add canFeature DB-backed gate to DTP workflow action routes

- **Updated** `app/api/dtp/plans/[id]/approve/route.ts` — imported `canFeature` from `@/lib/rbac`; added dual-gate check (`button.dtp.approve` feature key OR `ADMIN`/`DEPARTMENT_LEAD` role) after existing `canActAsCoordinator` guard
- **Updated** `app/api/dtp/plans/[id]/reject/route.ts` — same pattern with feature key `button.dtp.reject`
- **Updated** `app/api/dtp/plans/[id]/endorse/route.ts` — same pattern with feature key `button.dtp.endorse`, placed after existing manager-relationship guard
- Skipped `app/api/letters/[id]/approve/route.ts` — already uses `checkLetterPermissionV2('letter.approve')` which is the correct feature check
- All existing auth/ownership/coordinator checks remain intact; canFeature is additive (fails open on DB error)
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`

## 2026-06-07 — Expand DOCTYPE_ACTION_MAP in lib/rbac.ts

- **Updated** `lib/rbac.ts` — replaced the partial `DOCTYPE_ACTION_MAP` (11 entries) with a complete map covering all Action values: objective (9), keyResult (7), todo (6), comment (3), watcher (2), user (3), department (3), timeframe (1) — 34 entries total; no other code changed
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`

## 2026-06-07 — Permission explain endpoint

- **Created** `app/api/permissions/explain/route.ts` — `GET /api/permissions/explain` (ADMIN only); accepts `userId`, `doctypeKey`, `action` query params; traces the full decision chain: admin bypass → explicit deny override → explicit grant override → role grants via `RoleDocTypePermission` → scope rules via `RecordScopeRule`; returns `{ allowed, explanation, details }` with plain-English explanation strings
- **Updated** `docs/SITEMAP.md` — added new route entry under Permissions API section
- **Tests:** TypeScript check passed (`npx tsc --noEmit` — zero errors on new file)
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/SITEMAP.md`

## 2026-06-07 — Field-level permission filtering for API responses

- **Created** `lib/field-filter.ts` — `getUserFieldPermLevel`, `filterFieldsByPermLevel`, `filterArrayByPermLevel`, and `invalidateFieldPermLevelCache`; resolves effective permLevel from UserRole → RoleDocTypePermission (MAX), respects UserPermissionOverride grant/deny, caches results in a module-local numeric cache (TTL 30 s, LRU 10k entries); strips fields from API response objects whose DocTypeFieldRegistry permLevel exceeds the caller's effective level
- **Tests:** TypeScript check passed (`npx tsc --noEmit` — zero errors in `lib/field-filter.ts`)
- **Docs updated:** `docs/CHANGELOG_AI.md`

## Format

```
## YYYY-MM-DD — [Summary]
- **[Action]** Description — `path/to/file`
- **Tests:** [ran / not run / passed / failed with reason]
- **Docs updated:** [list which docs were updated]
```

---

## 2026-06-07 — Implement record-scope filter builder and wire into list API routes

- **Created** `lib/apply-scope.ts` — Exports `buildScopeFilter(userId, doctypeKey)` which queries `RecordScopeRule`, `UserRole`, and `RoleDocTypePermission` to produce a Prisma WHERE fragment for row-level scoping. Supports operators `equals`, `is_owner`, `is_child_of`, and `in` with value types `user_id`, `user_department`, and `user_primary_dept`. Department subtree traversal (`is_child_of`) uses BFS limited to depth 5 via `getDeptAndDescendants`. Multiple rules within a role are AND-ed; multiple roles are OR-ed. Returns `null` (no-op) when no rules exist or any role has `applyScoping=false`.
- **Edited** `app/api/objectives/route.ts` — Added `buildScopeFilter(session.user.id, 'objective')` call after auth-based where construction; merges scope filter via top-level `AND` wrapping.
- **Edited** `app/api/todos/route.ts` — Added `buildScopeFilter(session.user.id, 'todo')` call before `prisma.todo.findMany`; appends to existing `where.AND` array.
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md

---

## 2026-06-07 — Add EffectivePermissionsPreview modal and "Preview as User" button

- **Created** `components/settings/permissions/EffectivePermissionsPreview.tsx` — Modal overlay (fixed inset-0, max-w-3xl) showing three sections: (1) Nav Preview — simulated sidebar listing all module.* features with green/gray dots + collapsible page sub-items for visible modules; (2) "Why can/can't they do X?" — DocType selector + Action selector with [Check] button that resolves against effectivePermissions and outputs a plain-English ok/warn/no message; (3) DocType Permissions Table — grouped by module, collapsible, columns Read/Write/Create/Delete/Submit + Scope. Fetches `GET /api/permissions/preview/{userId}`.
- **Modified** `components/settings/permissions/UserRolesPanel.tsx` — Added `userName` to Props, `showPreview` state, `Eye` icon import, `EffectivePermissionsPreview` import, "Preview as User" button in the Effective Permissions section header, and conditional render of the preview modal.
- **Modified** `components/settings/UserManagement.tsx` — Passed `userName={detailUser.name}` to `<UserRolesPanel>` to satisfy new prop.
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md, COMPONENT_CATALOG.md

## 2026-06-07 — Add DTP coordinator permission migration script

- **Created** `scripts/migrate-dtp-coordinators.ts` — Idempotent one-shot migration that reads `DtpSettings.poolCoordinatorIds` (CSV) and `DtpDepartmentApproval.primaryCoordinatorId`, then creates `UserPermissionOverride` grant rows for the appropriate DTP feature keys (`button.dtp.assign-driver`, `page.dtp.pool` from pool coordinators; `button.dtp.approve`, `button.dtp.reject` from department approval coordinators). Uses `findFirst` + `create` pattern (no composite unique index on the model). Validates each user ID exists before inserting. Writes a summary `ActivityLog` entry on completion. Run with `tsx scripts/migrate-dtp-coordinators.ts`.
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md

## 2026-06-07 — Rewrite Audit Logs page to show real ActivityLog data with category filter

- **Modified** `app/dashboard/settings/audit-logs/page.tsx` — Replaced broken `prisma.systemSettings.findMany` query with `prisma.activityLog.findMany` (take 200, orderBy createdAt desc, includes actor name/email). Passes typed logs to `AuditLogsView`.
- **Modified** `components/settings/AuditLogsView.tsx` — Rewrote entirely. New `ActivityLogEntry` type with actor relation. Added category filter tabs [All, OKR, Letters, DTP, Sprints, Permissions, System] with entry counts. Category bucketing by `entityType`. Updated table columns to Timestamp | Actor | Entity Type | Action | Details. Shield icon prefix for Permissions entityType column. `formatChangesPreview` shows first 2 JSON keys with truncation and "+N more" suffix. Action badge colored by create/update/delete. Search filters entityType, action, actor name/email. Uses `useMemo` for filtered/counted results.
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md

## 2026-06-07 — Add Export/Import control bar with confirmation modal to PermissionManager

- **Modified** `components/settings/PermissionManager.tsx` — Added `importData`, `showImportModal`, `importDiff`, `importLoading`, `importError` state. Added action bar with Export (POST /api/permissions/export → browser download) and Import (file picker → FileReader → POST /api/permissions/import dryRun:true → diff preview modal → POST dryRun:false on confirm) buttons. Modal uses `components/ui/Modal`; toast via `react-hot-toast`.
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md

## 2026-06-07 — Add withFeature and withRoleOrFeature to withAuth.ts

- **Modified** `lib/api/withAuth.ts` — Added `withFeature<P>` and `withRoleOrFeature<P>` exports. Added import for `resolveFeaturePermission` from `../permission-resolver`. `withFeature` authenticates via `withAuth`, ADMIN always passes, non-admin calls `resolveFeaturePermission` (fail-open on DB error). `withRoleOrFeature` allows access if role is in `allowedRoles` OR `resolveFeaturePermission` returns true; falls back to role-only check on DB error.
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md

## 2026-06-07 — Integrate DB-backed permission resolution into can()

- **Modified** `lib/rbac.ts` — Added `DOCTYPE_ACTION_MAP` block at the top of `can()` body (after actor destructuring). For 11 mapped action→doctype pairs (objective CRUD, keyResult CRUD, todo create/edit/delete), the function now calls `resolveDocTypePermission()` first. If DB returns true, the function short-circuits with `return true`. If DB returns false, execution falls through to the existing hardcoded role logic (preserving ownership-based overrides). DB errors are caught silently and fall through to hardcoded logic. Both imports (`resolveDocTypePermission` and `DocTypeAction`) were already present from a prior session.
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md

---

## 2026-06-07 — Add Roles tab to User Management

- **Created** `components/settings/permissions/UserRolesPanel.tsx` — Self-contained panel with four sections: Role Profiles (assign/remove via `/api/permissions/users/{id}/profiles`), Individually Assigned Roles (assign with optional expiry/revoke via `/api/permissions/users/{id}/roles`), User-Specific Overrides (add/remove via `/api/permissions/users/{id}/overrides` with doctypeKey, featureKey, action, overrideType, reason, expiresAt), Effective Permissions (read-only table from the GET response). Shows a self-modification banner and hides all action buttons when `userId === currentUserId`. Props: `{ userId: string, currentUserId: string }`.
- **Modified** `components/settings/UserManagement.tsx` — Added `currentUserId: string` prop, added `UserDetailTab` type and state for `isUserDetailOpen`/`userDetailTab`/`detailUser`, added purple Shield button per row that calls `handleOpenRoles`, added `<Modal size="xl">` containing a tab strip (Roles | Info) and renders `<UserRolesPanel>` in the Roles tab. Imports `cn`, `Modal`, `UserRolesPanel`.
- **Modified** `app/dashboard/settings/users/page.tsx` — Passes `currentUserId={session.user.id}` to `<UserManagement>`.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/COMPONENT_CATALOG.md`

---

## 2026-06-07 — Add User Permission Management API routes

- **Created** `app/api/permissions/users/[id]/route.ts` — GET returns user's full permission picture: basic info, direct `userRoles` (with full `Role`), `userRoleProfiles` (with profile + memberships + roles), all `permissionOverrides`, and `effectivePermissions` (union of all active roles' `RoleDocTypePermission` grouped by `doctypeKey`). Uses `withRole(['ADMIN'])`.
- **Created** `app/api/permissions/users/[id]/roles/route.ts` — POST assigns a role to a user (`upsert UserRole`); validates `roleId`, validates `expiresAt` is future if provided, blocks self-modification, verifies user and role exist, calls `permissionCache.invalidateUser`. Uses `withRole(['ADMIN'])`.
- **Created** `app/api/permissions/users/[id]/roles/[roleId]/route.ts` — DELETE removes a role assignment; blocks self-modification, returns 404 if assignment not found, calls `permissionCache.invalidateUser`. Uses `withRole(['ADMIN'])`.
- **Created** `app/api/permissions/users/[id]/profiles/route.ts` — POST assigns a RoleProfile to a user (`upsert UserRoleProfile`); validates `profileId`, blocks self-modification, verifies user and profile exist, calls `permissionCache.invalidateUser`. Uses `withRole(['ADMIN'])`.
- **Created** `app/api/permissions/users/[id]/profiles/[profileId]/route.ts` — DELETE removes a profile assignment; blocks self-modification, returns 404 if assignment not found, calls `permissionCache.invalidateUser`. Uses `withRole(['ADMIN'])`.
- **Created** `app/api/permissions/users/[id]/overrides/route.ts` — GET lists all `UserPermissionOverride` rows for the user. POST creates an override; validates `overrideType` enum (`grant|deny`), validates `reason` (min 10 chars), validates `expiresAt` future if provided, blocks self-modification, calls `permissionCache.invalidateUser`. Uses `withRole(['ADMIN'])`.
- **Created** `app/api/permissions/users/[id]/overrides/[overrideId]/route.ts` — DELETE removes an override; blocks self-modification, verifies override belongs to the target user before deletion, calls `permissionCache.invalidateUser`. Uses `withRole(['ADMIN'])`.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/SITEMAP.md`

---

## 2026-06-07 — Add RecordScopingTab and FeaturesTab for Permission Manager

- **Created** `components/settings/permissions/RecordScopingTab.tsx` — Role + DocType selectors; fetches `GET /api/permissions/roles` and `GET /api/permissions/doctypes` on mount; when both selected fetches `GET /api/permissions/roles/{id}/scope-rules` and filters client-side by doctypeKey. Renders rules table (#, Field, Operator, Value Type, Status, Actions); toggle fires `PUT .../scope-rules/{ruleId}` with optimistic update; delete fires `DELETE .../scope-rules/{ruleId}`. Inline Add Rule form (fieldName input, operator select, valueType select, staticValue input) submits via `POST .../scope-rules`. Note below table when multiple rules present.
- **Created** `components/settings/permissions/FeaturesTab.tsx` — Role selector; fetches `GET /api/permissions/roles/{id}/features`; two-panel layout (left 40%, right 60%). Left panel: feature tree grouped into Modules, Pages (OKR), Pages (Letters), Pages (DTP), Admin, Widgets with green/gray dot per visible state. Right panel: featureKey label, visible toggle, enabled toggle; each toggle auto-saves via `PUT .../features` with 500ms debounce; shows "Inherited from parent: {label} (OFF)" amber banner when parent is hidden.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/COMPONENT_CATALOG.md`

---

## 2026-06-07 — Add ByDocTypeTab and FieldLevelsTab for Permission Manager

- **Created** `components/settings/permissions/ByDocTypeTab.tsx` — DocType selector (grouped optgroup by module), fetches `GET /api/permissions/doctypes` + `GET /api/permissions/roles` on mount; on DocType select fetches `GET /api/permissions/doctypes/{key}`; renders Role × 9-actions grid with checkbox cells (optimistic toggle + rollback via `PUT /api/permissions/roles/{roleId}/permissions`) and a per-row Scope dropdown (own/department/all) that propagates to all granted actions for that role.
- **Created** `components/settings/permissions/FieldLevelsTab.tsx` — DocType selector (same grouped optgroup); on select fetches `GET /api/permissions/doctypes/{key}` for fields list; renders fieldName/displayLabel/permLevel dropdown (0–3)/isSensitive checkbox table; Save button fires `PUT /api/permissions/doctypes/{key}/fields`; preview panel below shows Level 0 and Level 0+1 visibility field lists derived from live local state.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/COMPONENT_CATALOG.md`

## 2026-06-07 — Add Roles CRUD API routes for permission management system

- **Created** `app/api/permissions/roles/route.ts` — GET lists all roles with `_count.userRoles`; POST creates a new role (key auto-uppercased/slugified, unique name+key enforced with 400 on conflict). Both use `withRole(['ADMIN'])`.
- **Created** `app/api/permissions/roles/[id]/route.ts` — GET returns role detail with `doctypePermissions` (+ doctype), `featurePermissions`, and `_count.userRoles`; PUT updates editable fields (blocks key change on `isSystem` roles); DELETE guards against `isSystem` (400) and roles with assigned users (409 `HAS_USERS`). All use `withRole(['ADMIN'])`.
- **Created** `app/api/permissions/roles/[id]/clone/route.ts` — POST clones a role: copies `RoleDocTypePermission`, `FeaturePermission`, and `RecordScopeRule` rows inside a `$transaction`, returns `{ newRole }`. Uses `withRole(['ADMIN'])`.
- **Fixed** `prisma/schema.prisma` — removed invalid `scopeRules RecordScopeRule[]` virtual relation from `Role` model (polymorphic `targetType`/`targetId` table has no Prisma back-relation); ran `prisma generate` to regenerate client.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/FEATURE_STATUS.md`, `docs/SITEMAP.md`

## 2026-06-07 — Add permission system seed script

- **Created** `scripts/seed-permissions.ts` — Idempotent seed script that bootstraps the full permission system in 6 steps: (1) upserts 4 system roles (ADMIN, EXECUTIVE, DEPARTMENT_LEAD, EMPLOYEE); (2) syncs existing `User.role` string field into `UserRole` junction table; (3) upserts all 58 doctypes into `DocTypeRegistry`; (4) upserts 232 `RoleDocTypePermission` rows covering the full role/doctype access matrix (all, readOnly, readScoped, none, and custom flag combinations); (5) upserts 144 `FeaturePermission` rows for 36 feature keys across all 4 roles; (6) creates 5 default `RecordScopeRule` rows (FR-4.1) with existence-check idempotency. Compiles clean with `tsc --noEmit`.
- **Tests:** not run (script runs against live DB — execute with `tsx scripts/seed-permissions.ts`)
- **Docs updated:** `docs/CHANGELOG_AI.md`

## 2026-06-07 — Add permission-cleanup cron route

- **Created** `app/api/cron/permission-cleanup/route.ts` — POST handler protected by `CRON_SECRET` (Bearer header or `x-cron-secret`). Deletes expired `UserRole` rows and expired `UserPermissionOverride` rows, calls `permissionCache.invalidateAll()`, logs each revoked record via `recordActivity` (best-effort), returns `{ ok, revokedUserRoles, revokedOverrides, timestamp }`.
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md

## 2026-06-07 — Add API routes for RecordScopeRule (role scope rules)

- **Created** `app/api/permissions/roles/[id]/scope-rules/route.ts` — GET returns all `RecordScopeRule` rows where `targetType='role'` and `targetId` matches the route param; POST creates a new rule with full validation (operator enum, valueType enum, doctypeKey existence check via `DocTypeRegistry`). Both handlers use `withRole(['ADMIN'])`.
- **Created** `app/api/permissions/roles/[id]/scope-rules/[ruleId]/route.ts` — PUT partial-updates a rule (validates enums and `staticValue` constraint when `valueType='static'`, returns 400 if no fields supplied); DELETE removes the rule. Both verify `targetId === role id` via `findFirst` before acting, returning 404 on mismatch. Both use `withRole(['ADMIN'])`.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/SITEMAP.md`

---

## 2026-06-07 — Add miscellaneous permission API routes (me, export, import, preview)

- **Created** `app/api/permissions/me/route.ts` — GET (withAuth): fetches all active UserRoles for the caller, iterates nested `doctypePermissions` and `featurePermissions` on each role, OR-merges them into flat maps (`{ doctypePermissions: { [key]: {...} }, featurePermissions: { [key]: {visible, enabled} } }`). No admin required; any authenticated user may call this.
- **Created** `app/api/permissions/export/route.ts` — POST (withRole ADMIN): parallel-fetches roles, roleDocTypePermissions, featurePermissions, recordScopeRules, and docTypeRegistry (with fields) then returns a raw `Response` with `Content-Type: application/json` and `Content-Disposition: attachment; filename=permissions-{YYYY-MM-DD}.json`. Snapshot includes `exportedAt`, `exportedBy`, and `version` metadata fields.
- **Created** `app/api/permissions/import/route.ts` — POST (withRole ADMIN): accepts `{ data, dryRun? }`. Validates that data has all five required top-level arrays; `dryRun=true` returns per-table `{ added, modified, unchanged }` diff counts without writing. Live import runs a `$transaction` upsert over all five tables in dependency order (roles → doctypes → fields → roleDocTypePerms → featurePerms → scopeRules); skips overwriting system role keys (ADMIN/EXECUTIVE/DEPARTMENT_LEAD/EMPLOYEE) on `role.isSystem` rows; calls `permissionCache.invalidateAll()` on success.
- **Created** `app/api/permissions/preview/[userId]/route.ts` — GET (withRole ADMIN): loads the target user, their active UserRoles (direct), UserRoleProfiles (with memberships), and UserPermissionOverrides; deduplicates roles by id; computes the same OR-merged effective permission maps as `/me`; returns `{ user, activeRoles, effectivePermissions, overrides: { grant, deny }, visibleFeatures, hiddenFeatures }`.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/SITEMAP.md`

---

## 2026-06-07 — Add RoleDocTypePermission and FeaturePermission API routes

- **Created** `app/api/permissions/roles/[id]/permissions/route.ts` — GET returns all `RoleDocTypePermission` rows for the role joined with `DocTypeRegistry` (key, displayName, module), grouped by module into `{ role, byModule }`. PUT accepts `{ permissions: [...] }`, validates doctypeKeys against `DocTypeRegistry`, bulk-upserts via `prisma.$transaction` on the `@@unique([roleId, doctypeKey, permLevel])` constraint, then calls `permissionCache.invalidateAll()` and returns the updated `byModule` map.
- **Created** `app/api/permissions/roles/[id]/features/route.ts` — GET returns all `FeaturePermission` rows for the role as `{ role, features }`. PUT accepts `{ features: [...] }`, validates each entry has boolean `visible`/`enabled`, bulk-upserts via `prisma.$transaction` on the `@@unique([roleId, featureKey])` constraint, calls `permissionCache.invalidateAll()`, and returns `{ features: [...] }`. Both routes use `withRole(['ADMIN'])`, `resolveParams`, and the standard response envelope.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`

---

## 2026-06-07 — Add Role Profile API routes (GET/POST collection, GET/PUT/DELETE detail)

- **Created** `app/api/permissions/profiles/route.ts` — GET returns all RoleProfiles with role memberships (id, name, key, color). POST creates a profile and bulk-creates RoleProfileMembership rows in a $transaction; validates non-empty name and that all supplied roleIds exist before touching the DB. Returns 201 with the created profile including memberships.
- **Created** `app/api/permissions/profiles/[id]/route.ts` — GET returns profile detail with memberships and _count.userProfiles. PUT updates scalar fields and, when roleIds is provided, replaces all memberships atomically in a $transaction. DELETE guards against assigned users (_count.userProfiles > 0) and returns 409 `{ error: 'HAS_USERS' }` if any exist; otherwise deletes memberships then the profile. All handlers use withRole(['ADMIN']), resolveParams, and the standard apiSuccess/apiNotFound/apiBadRequest/apiError envelope.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/SITEMAP.md`

---

## 2026-06-07 — Extend lib/rbac.ts with canDocType and canFeature helpers

- **Updated** `lib/rbac.ts` — Added two new imports (`resolveDocTypePermission`, `resolveFeaturePermission`, `getUserActiveRoleKeys` from `./permission-resolver`; `DocTypeAction` type). Added two new exported async functions: `canDocType(userId, doctypeKey, action, fallbackRole?)` which resolves document-type permissions with a graceful fallback to `getUserActiveRoleKeys` when the permission-resolver throws; `canFeature(userId, featureKey)` which resolves feature-gate access and fails open (returns `true`) on any error. All existing exports, types, and the `can()` signature are unchanged.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`

---

## 2026-06-07 — Refactor AddUserModal and EditUserModal to use react-hook-form

- **Updated** `components/settings/UserManagement.tsx` — Replaced raw `useState` form state (`formData`, `errors`, `isLoading`) and manual `validateForm` logic in `AddUserModal` and `EditUserModal` with `useForm` from react-hook-form. Uses `register` with inline validation rules, `handleSubmit`, `formState: { errors, isSubmitting }`, `setError` for server-side errors, and `reset()` after successful creation. Outer `UserManagement` component and `DeleteUserModal`/`PasswordResetModal` are unchanged.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`

---

## 2026-06-07 — Dedup todo status toggle + alignment type helper text

- **Created** `features/todos/components/useTodoStatusToggle.ts` — Extracted shared `useTodoStatusToggle` hook from the copy-pasted `handleToggleTodo` in ToDoList and MyTasksList. Accepts an `onSuccess` callback so each consumer handles its own post-toggle behaviour (local state update vs page reload).
- **Updated** `features/todos/components/ToDoList.tsx` — Replaced inline `handleToggleTodo` with `useTodoStatusToggle`; removed duplicate fetch/toast logic. Dropped unused `toast` import from toggle path (toast still used elsewhere in the file).
- **Updated** `features/todos/components/MyTasksList.tsx` — Replaced inline `handleToggleTodo` with `useTodoStatusToggle`; removed `useSession` and `toast` imports that were only used by the old function.
- **Updated** `features/objectives/components/EditObjectiveModal.tsx` — Added dynamic helper text beneath the Alignment mode select: "Visual alignment only — progress does not roll up to parent." for LOOSE and "Progress rolls up to parent using the configured rollup calculation." for STRICT_DEPENDENCY. Uses existing `text-xs text-muted-foreground` classes.
- **Note:** `CreateObjectiveModal.tsx` has no `alignmentType` field — no change needed there.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`

---

## 2026-06-07 — Replaced inline empty-state blocks with shared EmptyState component

- **Updated** `features/goals/components/GoalsTable.tsx` — Fixed import path from `@/components/ui/EmptyState` to barrel `@/components/ui`.
- **Updated** `features/goals/components/GoalsFeedView.tsx` — Added `EmptyState` import; replaced inline `<div className="text-center py-12 ..."><p>...</p></div>` with `<EmptyState title="No goals found" description="..." />`.
- **Updated** `features/goals/components/MyTeamView.tsx` — Fixed import path to barrel; replaced inline `<p>No goals yet</p>` inside each user card with `<EmptyState bare title="No goals yet" />`.
- **Updated** `components/settings/TeamsManagement.tsx` — Added `EmptyState` import; replaced inline icon + h3 + p block with `<EmptyState icon={Building2} title="No teams found" description="..." />`.
- **Updated** `components/settings/AuditLogsView.tsx` — Added `EmptyState` import; replaced inline icon + h3 + p block (with dynamic description) with `<EmptyState icon={Settings} title="No audit logs found" description={...} />`.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`

---

## 2026-06-07 — Removed deprecated SprintActivity, SprintActivityComment, SprintActivityTask models from schema

- **Updated** `prisma/schema.prisma` — Deleted the three deprecated model blocks (`SprintActivity`, `SprintActivityComment`, `SprintActivityTask`) and removed all back-relation fields pointing to them: `ownedSprintActivities`/`sprintActivityComments`/`assignedSprintActivityTasks` on `User`; `activities SprintActivity[]` on `Sprint`; `activities SprintActivity[]` on `SprintColumn`; `sprintActivities SprintActivity[]` on `KeyResult`; `sprintActivities SprintActivity[] @relation("SprintActivityObjective")` on `Objective`.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`

---

## 2026-06-07 — Added helper text distinguishing manual vs auto-calculated confidence

- **Updated** `features/key-results/components/CreateCheckInModal.tsx` — Extended the existing "Calculated automatically from pace vs plan." helper under the Confidence section to also note that the system computes a separate bi-weekly confidence snapshot (velocity + cadence + initiatives), so users understand the check-in value is a momentary pace-based figure, not the periodic auto score.
- **Updated** `features/key-results/components/KeyResultDetailClient.tsx` — Added `(auto)` qualifier to the "Confidence" stat-strip label; when the latest check-in carries a `confidenceScore`, a secondary `Manual: N/100` line is shown directly below the bar so users see both values side-by-side.
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`

---

## 2026-06-07 — Created MASTER_REFERENCE.md — comprehensive system reference

- **Added** `docs/MASTER_REFERENCE.md` — full-system reference covering all 20 sections: system overview, tech stack, project structure, all feature modules, 50+ pages/sitemap, 58 database models, 170+ API routes, all components (UI primitives, shared, feature barrels, DTP), shared hooks, Zustand stores, RBAC matrix, notification event table, email/digest system, cron schedule, library utilities, design conventions, deployment, feature status summary, and refactor backlog
- **Tests:** not run (documentation only)
- **Docs updated:** `docs/MASTER_REFERENCE.md` (created), `MEMORY.md` + `project_master_reference.md` in project memory

---

## 2026-05-14 — Letter Permissions: DB-driven role/permission management UI

- **Added** `lib/letter-permissions.ts` — canonical permission key list, labels, role labels, and default matrix (shared constants, no business logic)
- **Added** Prisma schema: `LetterRolePermission` + `LetterUserPermission` models + back-relations on `User` — `prisma/schema.prisma`
- **Added** `prisma/seed-letter-permissions.ts` — idempotent seed script; run after `prisma db push` to populate default matrix
- **Added** API route `GET|PUT /api/settings/letter-permissions/roles` — fetch/update role × permission matrix (ADMIN only) — `app/api/settings/letter-permissions/roles/route.ts`
- **Added** API route `GET|POST /api/settings/letter-permissions/users` — fetch/create per-user overrides — `app/api/settings/letter-permissions/users/route.ts`
- **Added** API route `GET|DELETE /api/settings/letter-permissions/users/[userId]` — per-user override detail + delete — `app/api/settings/letter-permissions/users/[userId]/route.ts`
- **Added** `components/settings/LetterPermissionsManagement.tsx` — 3-tab settings component: Role Matrix (toggle grid), User Overrides (per-user exception panel), Letter Types (LetterTypeDef CRUD)
- **Added** `app/dashboard/settings/letter-permissions/page.tsx` — settings page (ADMIN only)
- **Updated** `lib/permissions.ts` — letter permission helpers now use DB-driven `checkLetterPermission()` async resolver with static fallback; synchronous shims preserved for non-async callers
- **Updated** `components/settings/SettingsNav.tsx` — added "Letter Permissions" nav item (ADMIN only, ShieldCheck icon)
- **Updated** `lib/dashboard-navigation.ts` — added "Letter Permissions" entry under Settings group
- **Tests:** not run
- **Docs updated:** `docs/CHANGELOG_AI.md`, `docs/FEATURE_STATUS.md`, `docs/SITEMAP.md`, `docs/COMPONENT_CATALOG.md`

## 2026-05-14 — Letters: language-aware letterhead labels + historical import

- **Fix** `lib/letter-html.tsx` — extracted `LABELS` map (`en`/`am`) and replaced all hardcoded label strings (To/ለ, Subject/ጉዳዩ, Reference/ቁጥር, Date/ቀን, Address/አድራሻ, Telephone/ስልክ, Email·Web, Mailing/ፖስታ ሣጥን, Enclosures/ተያያዥ ሰነዶች, Sincerely/ከሰላምታ ጋር) with `lbl.*` lookups driven by the `lang` URL param. Signature closing now falls back to `lbl.sincerely` only when `letter.closing` is empty.
- **Data** Imported 914 historical letters from Eldix legacy system (`EL/CL/...` reference format) into `letters` table via server-side Python script. Stripped `<div class="ql-editor read-mode">` wrapper from `bodyContent` and `closing` fields (907 rows updated) to match system's plain-HTML storage format.
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md

## 2026-05-18 — Letters: fix all Amharic label rendering (tofu boxes) + Amharic name/title fields

- **Fix** `lib/letter-html.tsx` — Root cause of broken-box (tofu) labels: `JetBrains Mono` has zero Ethiopic glyph coverage. For `lang=am` the label font now switches to `'Noto Sans Ethiopic', sans-serif` on all three label rules (header ref/date, right-rail info, enclosures heading). Also suppresses `text-transform:uppercase` and `letter-spacing` for Amharic (Ethiopic has no uppercase form and spacing looks wrong). The previous commit only partially fixed this (suppressed transform, but left JetBrains Mono).
- **Feat** `prisma/schema.prisma` — Added `nameAmharic String?` and `designationAmharic String?` to `User`; added `signatoryTitleAmharic String?` to `Letter`. `prisma db push` applied.
- **Feat** `lib/letter-html.tsx` — `renderLetterHtml` now uses signatory's `nameAmharic`/`designationAmharic` and letter's `signatoryTitleAmharic` when `lang=am` and the fields are populated, falling back to English values.
- **Feat** `app/api/letters/[id]/html/route.ts`, `pdf/route.ts` — signatory select now includes `nameAmharic`, `designation`, `designationAmharic`.
- **Feat** `app/api/letters/[id]/route.ts` — GET includes Amharic fields; `signatoryTitleAmharic` added to `EDITABLE_FIELDS`.
- **Feat** `app/api/users/route.ts`, `[id]/route.ts` — list + PATCH now select/accept/save `nameAmharic` and `designationAmharic`.
- **Feat** `components/settings/UserManagement.tsx` — Edit User modal now shows "Amharic Letterhead Fields" section with Name (አማርኛ) and Designation (አማርኛ) inputs.
- **Feat** `features/letters/components/LetterFormClient.tsx` — Letter form now shows Signatory Title (አማርኛ) input and saves `signatoryTitleAmharic`.
- **Feat** `types/index.ts` — `CreateLetterForm` / `UpdateLetterForm` now includes `signatoryTitleAmharic`.
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md

---

## 2026-05-12 — Letters: fix Amharic text clipping and multi-page truncation

- **Fix** Removed `position:absolute;inset` from `.lh .pad` — replaced with `padding` so content flows naturally and is never clipped — `lib/letter-html.tsx`
- **Fix** Set `align-self:start` on `.rail` so it doesn't stretch to full grid height — `lib/letter-html.tsx`
- **Fix** Added `@media print { .lh .pad { min-height:0 } }` so print page sizing is natural — `lib/letter-html.tsx`
- **Fix** Iframe auto-resizes to content `scrollHeight` on load so multi-page letters display in full — `features/letters/components/PdfPreviewPanel.tsx`
- **Tests:** not run
- **Docs updated:** CHANGELOG_AI.md

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

## 2026-07-15 — Project Management module: A2 — Project Template Builder UI + Clone Endpoint

Completes the A2 project templates feature with a full builder UI, CRUD/clone API, and permission wiring.

- **Backend** — added `templateActivitySchema`, `templateMilestoneSchema`, `templatePhaseSchema`, `templateStructureSchema`, `normalizeTemplateStructure`, `cloneTemplateStructure`, `countTemplateNodes`, `emptyTemplateStructure`, and `createTemplateClone` to `lib/projects/templates.ts`. Added `GET/POST /api/projects/templates`, `GET/PATCH/DELETE /api/projects/templates/[id]`, and `POST /api/projects/templates/[id]/clone`. System templates are blocked from edit/delete; cloning any template produces an editable `isSystem=false` copy. `recordActivity` calls use `PROJECT_TEMPLATE` / `CREATED|UPDATED|DELETED` with `templateId` in metadata.
- **Permissions** — added `project_template` DocType and a matrix row to `scripts/seed-project-permissions.ts` so `ADMIN`/`EXECUTIVE`/`DEPARTMENT_LEAD` can manage templates.
- **Hooks** — extended `features/projects/hooks/useProjects.ts` with `useProjectTemplates`, `useProjectTemplate(id)`, `useCreateProjectTemplate`, `useUpdateProjectTemplate`, `useDeleteProjectTemplate`, and `useCloneProjectTemplate`, plus client-facing template types.
- **UI** — built `TemplateListClient` (card grid, search, create/clone/delete modals) and `TemplateBuilderClient` (name/description editor, left phase/milestone/activity tree, right properties panel, native HTML5 drag-and-drop reorder). Added pages at `/dashboard/projects/templates`, `/dashboard/projects/templates/new`, and `/dashboard/projects/templates/[id]`. System templates open read-only with a Clone button.
- **Docs** — updated `docs/PROJECT_MANAGEMENT_MODULE_TRACKER.md`: A2 marked ✅ Verified and file list expanded.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (197 pass) · `git diff --check` (clean).

## 2026-07-15 — Performance module: Template builder drag-and-drop

Adds native HTML5 drag-and-drop reorder to the scorecard template builder.

- **UI** — added `GripVertical` drag handles to tier headers and criterion cards in `features/performance/components/TemplateBuilder.tsx`. Tier handles reorder the full tier list; criterion handles reorder criteria within the same tier. Existing up/down arrow buttons remain as fallback.
- **State** — reordering updates the local `tiers` array via the existing `moveItem` helper; the next `Save builder` click persists the new order through the existing `useSaveTemplateBuilder` mutation.
- **Docs** — updated `docs/PERFORMANCE_SCORECARD_IMPLEMENTATION_STATUS.md` (A2 → DONE, Phase 2 note refined) and `docs/FEATURE_STATUS.md` (template management note updated).
- Tests run: `npx tsc --noEmit` (clean) · `git diff --check` (clean).

## 2026-07-15 — Performance module: Culture Library seed + admin editor

Completes A5 Culture Block by adding install-time seeding and an admin editor for reusable criterion-library entries.

- **Seed** — added `prisma/seed-culture-library.ts` (idempotent upsert of C1-C6 into `CriterionLibraryEntry`), `package.json` script `db:seed:culture-library`, and integration into `prisma/seed.ts` for fresh demo databases.
- **API** — added `GET/POST /api/performance/culture-library` and `PUT/PATCH /api/performance/culture-library/[id]` with `isPerformanceAdmin`/`criterion_library_entry` permission checks.
- **UI** — added `CultureLibraryManager` component and `/dashboard/performance/culture-library` page; bilingual (EN/AM) anchor editor for 0/4/7/10 rubric anchors; create new entries and toggle active state; "Manage library" link from `TemplateBuilder`.
- **Permissions** — added feature keys `page.performance.culture-library`, `button.performance.culture-library.create`, `button.performance.culture-library.edit` to `scripts/seed-permissions.ts`; `criterion_library_entry` ADMIN matrix already grants full access.
- **Shared helpers** — extracted `anchorEn`, `anchorAm`, `buildAnchorValue`, and `AnchorValue` type into `features/performance/components/anchor-helpers.ts` and updated `TemplateBuilder` to import them.
- **Docs** — updated `PERFORMANCE_SCORECARD_IMPLEMENTATION_STATUS.md` (A5 → DONE, Phase 2 → DONE), `FEATURE_STATUS.md`, `SITEMAP.md`, `COMPONENT_CATALOG.md`, `MASTER_REFERENCE.md`.
- Tests run: `npx tsc --noEmit` (clean) · `npm run test:projects` (197/0) · `git diff --check` (clean).
