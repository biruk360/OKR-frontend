# OKR Quick-View Modals — Requirements (QV)

**Date:** 2026-09-27
**Surfaces:** `/dashboard/key-results?tab=…` and every other Filters-workspace view (`features/filters/components/ResultsList.tsx`)
**Components:** `ObjectiveDetailModal`, `KeyResultDetailModal`, shared `quick-view-parts`
**Reference (source of truth for content):** full pages `/dashboard/key-results/[id]` (`KeyResultDetailClient`) and `/dashboard/objectives/[id]`

## 1. Problem

The two modals opened from a result row were built as design mock-ups and never wired to the real data model. Specifically:

| # | Defect | Root cause |
|---|--------|------------|
| D1 | KR check-in list shows no author, no note, and the "Progress over time" line can run backwards | Modal reads `createdAt` / `author` / `note`; the check-in API returns `asOfDate` / `createdBy` / `analysis` |
| D2 | KR "% complete" disagrees with the full page (28% vs 35%) | Modal computes `(cur−start)/(target−start)`; the full page and the list use `cur/target` |
| D3 | Objective status is always "Pending", and "Net Confidence Score" is always 0 | `Objective.confidence` is an **Int 0–100**; status lives in `goalStatus`. The modal compared `confidence === 'ON_TRACK'` |
| D4 | Objective "Initiatives" donut shows a made-up ratio (`count / (krs×3)`) | Fabricated formula |
| D5 | "Quick AI Mode" chips do nothing; "Relationships" and "Tags" always read "No dependencies" / "None" | Hard-coded placeholders |
| D6 | No comments in either modal | Never wired |
| D7 | Breadcrumb, parent objective, and owner are plain text, not links | Never wired |
| D8 | The sidebar is a fixed `w-72`, so the layout breaks below ~900px | No responsive stacking |
| D9 | Fast row switching can show the previous item's data; a 403/404 shows "Failed to load" with no way forward | No request cancellation; API errors are not handled |
| S1 | **Leak:** a redacted (private) KR still returns full check-in history and initiative titles | `GET /api/keyresults/[id]/check-ins` has no redaction branch; `redactKeyResult` spreads `todos` |
| S2 | **Leak:** a redacted objective still returns its comment thread and KR initiatives | `redactObjective` spreads `comments`; per-KR `todos` survive `redactKeyResult` |

## 2. Goals

- **G1:** The modals are a fast, accurate **quick view**. They agree with the full page on every number they show.
- **G2:** Everything that looks interactive works: links, comments, and objective ↔ KR navigation.
- **G3:** One obvious way to go deeper: a **"View full page"** primary action. Sections the modal trims end in a "View all …" link to the full page.
- **G4:** No private data reaches a redacted viewer, whether through the modal or the API.

## 3. Non-goals

- No editing, check-in posting, archive, or delete from the modal. Those stay on the full page, which already has the permission-checked flows.
- No AI actions. The Quick AI chips are removed until a real backend exists.
- No new dependencies.

## 4. Requirements

### QV-1 Shared shell
- Uses `components/ui/Modal` (size `2xl`). Header: breadcrumb (left); **View full page** (primary, a real `<Link>` so Cmd/Ctrl-click opens a new tab) and Close (right).
- Body: main column plus a 320px right rail on `lg+`. It stacks to a single column below `lg`.
- Loading uses skeletons. An error state shows the API message, a **Retry** button, and a **View full page** link.
- In-flight requests are cancelled when the id changes or the modal closes.

### QV-2 Key-result quick view
- **Header breadcrumb:** objective title. Clicking it opens the objective quick view in place, then `› Key result`.
- **Hero:** chips (level · timeframe · Private). Title. "Aligned to *objective*" link. Description clamped to 3 lines. Owner avatar and name link to `/dashboard/org/users/[id]`. Due date with days left or "past due".
- **Stat strip (4):** Progress (ring, `cur/target`, same formula as the full page), Status (`confidence` tier pill), Confidence (latest check-in `confidenceScore`, falling back to the tier proxy 85/55/25), Last check-in (relative time and author).
- **Check-ins:** the 3 most recent, using the shared `CheckInTimeline` (correct fields, deltas, analysis). "View all N check-ins" links to the full page.
- **Initiatives:** up to 5 (non-cancelled), each with a status dot, assignee avatar, and status label. Clicking one opens the existing initiative drawer (`useInitiativeDetailStore`). "View all N" links to the full page.
- **Comments:** the shared `OkrComments` (rich text, attachments, @mentions, realtime), identical to the full page.
- **Right rail:** the shared `KrProgressConfidenceCard` (when the timeframe has dates), plus a Details card (Owner, Timeframe with dates, Parent objective link, Measurement start → target, current).
- **Redacted KR:** hero title and progress only. Check-ins, initiatives, comments, and measurement are hidden, with a one-line "private" notice.

### QV-3 Objective quick view
- **Header breadcrumb:** parent objective, if any (opens that objective's quick view), then `› Objective`.
- **Hero:** chips (level · timeframe · department · Private). Title. Status pill (`goalStatus`). Description clamped to 3 lines. Owner link.
- **Stat strip (4):** Progress (ring, `objective.progress` rounded), Status (`goalStatus`), Confidence (`objective.confidence` /100), Key results (count, with "N on track").
- **Key results list:** every KR, showing status dot, title, `cur / target unit`, progress bar, and owner avatar. Clicking one opens the KR quick view in place. Redacted KRs render as "Private key result" and are still clickable (the KR view then shows its redacted state).
- **Comments:** shared `OkrComments` (endpoint `objectives`).
- **Right rail:** a Details card (Owner, Timeframe with dates, Team, Parent objective link, Level, Initiatives total). Contributors are shown when present.
- **Redacted objective:** title, progress, and owner only. KRs, comments, and description are hidden.
- Removed: the fabricated NCS donut, the fabricated initiatives donut, and the Relationships and Tags placeholders.

### QV-4 Modal-to-modal navigation (ResultsList)
- KR → objective and objective → KR swap the open modal (never stack two dialogs).
- Closing either modal returns to the list.

### QV-5 Live data
- The KR and objective quick views subscribe to their private realtime channel (`useRealtimeRefresh`). A change by another user triggers a silent refetch. Comments already refresh live through `OkrComments`.

### QV-6 API hardening (S1, S2)
- `GET /api/keyresults/[id]`: adds `isRedacted: boolean`. When redacted, returns `todos: []`.
- `GET /api/keyresults/[id]/check-ins`: when redacted, returns `[]`, matching the full page, which hides history for a redacted KR.
- `GET /api/objectives/[id]`: adds `isRedacted: boolean`. When redacted, returns `comments: []` and each KR with `todos: []`. A KR that is individually redacted also returns `todos: []`.
- All changes are additive. Unredacted responses are unchanged apart from the new flag.

## 5. RBAC / global defaults checklist
- Reads go through the existing permission-checked routes (`canViewObjective`, `canViewKeyResult`, `canAccessOkrComments`). No client-only gating of data.
- No mutations are added, so no new `ActivityLog` rows are needed. Comment posting reuses the existing audited route.
- Apple Pro tokens only (`--ap-*`), with light and dark parity. One primary action per surface (View full page).

## 6. Acceptance
1. Open an off-track KR from `…segment=kr-all-off-track`. Progress %, status, confidence, check-in values, authors, and initiative count match `/dashboard/key-results/[id]`.
2. Post a comment in the modal. It appears in the modal and on the full page, and the mention notification fires.
3. Breadcrumb objective → objective quick view → click a KR → KR quick view. No stacked dialogs.
4. "View full page" navigates. Cmd-click opens a new tab.
5. As a user with only redacted access to a private KR, the modal and the raw API return no check-ins, initiatives, or comments.
6. At 768px width the rail stacks under the main column with no horizontal scroll.
