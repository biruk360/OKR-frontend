# Card Comments, Link Previews and the Board Assignee Filter

> Status: **IMPLEMENTED** 2026-09-25 — see the matching entry in `docs/CHANGELOG_AI.md`. A3 done 2026-09-25: OKR comments (`OkrComments`) render `LinkPreviewList` under each body (OKR comments have no replies).
> Owner: TBD. Last updated: 2026-09-25.
>
> Legend: **[V]** verified against code in this repo · **[A]** assumption needing confirmation.
> Every requirement has an ID and Given/When/Then acceptance criteria.

---

## Context

Three reports against the to-do / task card modal and the sprint board:

1. *Saving a comment on the card modal takes a while and is not instant.*
2. *A pasted URL should show the page title, header info, description, thumbnail and favicon, so
   the link is visible.*
3. *On the sprint board the assignee filter has no users. It should list people and allow filtering
   by one or several of them from a dropdown.*

---

## 1. Current implementation **[V]**

### 1.1 Comment save — why it is slow

`TodoCardModal.postComment()` (`components/todos/TodoCardModal.tsx`) is fully pessimistic:

1. uploads each pending file **one after another** (`for … await fetch`);
2. `POST /api/todos/[id]/comments`;
3. only when that resolves does the comment appear and the composer clear.

`POST /api/todos/[id]/comments` does all of this **before it responds**:

| Step | Cost |
|---|---|
| `todoComment.create` + attachment hydrate | 2 queries — needed |
| `recordActivity` | 1 insert — needed (invariant: every mutation audits) |
| `resolveMentions` | 1–2 queries |
| `emit('USER_MENTIONED')` | recipient resolution + per-recipient pref lookup, `notification.create`, **Pusher `trigger` round-trip**, **IMMEDIATE SMTP send** — sequential per recipient |
| `sendMail` loop to each mentioned user | **one SMTP round-trip per user, sequential** |
| `resolveTodoStakeholders` + `emit('COMMENT_ON_OWNED_ENTITY')` | as `emit` above, once per stakeholder |

So a comment on a card with four stakeholders and one mention waits on ~6 network round-trips to
Pusher and SMTP before the author sees it. Replies (`postReply`) and edits (`saveCommentEdit`) are
also pessimistic. Delete is already optimistic.

### 1.2 Links in comments

`MentionEditor` uses `@tiptap/extension-link`, whose defaults (`autolink`, `linkOnPaste`) turn a
pasted URL into `<a href>`; `RichTextContent` keeps `a[href]` through DOMPurify. So a URL renders
as a plain underlined link. **Nothing in the repo fetches page metadata** — no link-preview route,
no OG parser, no SSRF-safe fetch helper, and no dependency (`cheerio`, `open-graph-scraper`, …).

### 1.3 Sprint board assignee filter

`SprintBoardClient` renders a native `<select>` fed from `data.participants`, which the board API
builds from `SprintParticipant` rows. Those rows are written only when a sprint is created/updated
with explicit `participantIds` (`app/api/sprints/[id]/route.ts`) — most sprints have none, so the
list is **empty**. Worse, the filter matches `t.assigneeId` only, while Trello-style cards are
created unassigned and carry people as **`members`** (`AddTaskInline`: "No assigneeId —
Trello-style cards start unassigned"). Even a populated list would hide most cards. The header
avatar stack reads the same empty `participants`.

---

## 2. Conflict check against existing specs **[V]**

| Existing requirement | Relationship |
|---|---|
| `trello_parity_sprint_board_REQUIREMENTS.md` **BRD-2** — one Filter popover: assignee (multi), label (multi), due, OKR linkage, watching | **Delivers the assignee (multi) part** of BRD-2. The label / due / watching facets and folding the linked/unlinked control into one popover remain open under BRD-2. Nothing here contradicts it. |
| Same doc **BRD-3** — filters persist per sprint in `localStorage` | Kept. Same key `sprint-filters-${sprintId}`; the saved shape gains `assignees: string[]` and reads the legacy `assignee` value (AFL-6). |
| **CDM-6 / CDM-7** — comment edit/delete/reply, server-side moderation | Unchanged. Optimistic UI applies to the same routes; permissions still enforced server-side. |
| **CDM-11** — closed sprint renders read-only | Unchanged. Previews are read-only content and still render on closed sprints. |
| **SEC-6** — comment bodies rendered through `RichTextContent` (DOMPurify) | Unchanged. Previews are rendered from API data as text nodes, never as HTML. |
| `notification_email_batching_REQUIREMENTS.md` **MEN-***, **BAT-*** | Notifications keep the same events, recipients and payloads; only *when* they run changes (after the response). No cadence or template is touched. |
| `attachment_viewer_REQUIREMENTS.md` **AVW-1**, **NRG-AC-1** | Unchanged. Optimistic comments reuse the same attachment rendering path. |
| `components/ui/FilterSelect` — "single-select only; multi-select is a checkbox group" | Honoured: the new control is a separate `FilterMultiSelect` built on Radix `DropdownMenuCheckboxItem` (`menuitemcheckbox`), not a hand-rolled div list. |

**Observed, not changed (flagged):** `USER_MENTIONED` is `IMMEDIATE` and sent by `emit()`, and the
to-do comment route *also* calls `sendMail` for each mentioned user — so a mention can produce two
emails. That belongs to the email-batching spec (EML-*) and is left for it.

---

## 3. Requirements

### 3.1 Instant comments — `CPF`

| ID | Requirement |
|---|---|
| CPF-1 | Posting a comment inserts it into the thread **immediately** (optimistic), clears the composer and pending files, and marks it "Sending…". No wait on the network before the author sees their comment. |
| CPF-2 | When the server responds, the optimistic row is replaced in place by the saved row (real id, server timestamp, hydrated attachments). |
| CPF-3 | On failure the optimistic row is removed, the draft and pending files are restored to the composer (if the author has not started a new one), and a toast explains the failure. Nothing is lost. |
| CPF-4 | While a row is pending, Reply / Edit / Delete are hidden for it — the server id does not exist yet. |
| CPF-5 | Comment attachments upload **in parallel**, not one after another. |
| CPF-6 | Replies and edits are optimistic on the same terms (insert/apply immediately, reconcile, roll back on failure). |
| CPF-7 | `POST /api/todos/[id]/comments` responds once the comment row, its attachment hydration and its `ActivityLog` entry are written. Mention resolution, `emit()` calls and mention emails run **after the response** via a shared `runAfterResponse()` helper that logs and swallows errors. |
| CPF-8 | Deferred work never changes *what* is sent: same events, recipients, payloads and deep links as before. |

- **CPF-AC-1** — *Given* the card modal, *when* the author presses Save or ⌘↵, *then* the comment is
  visible in the thread in the same frame and the composer is empty.
- **CPF-AC-2** — *Given* the server returns 500, *then* the optimistic comment disappears, the text is
  back in the composer, and an error toast shows.
- **CPF-AC-3** — *Given* a comment mentioning user B, *when* it is posted, *then* the response returns
  without waiting on SMTP/Pusher, and B still receives the in-app notification and email.
- **CPF-AC-4** — *Given* three files attached, *then* they upload concurrently.

### 3.2 Link previews — `LPV`

| ID | Requirement |
|---|---|
| LPV-1 | For every comment, reply and the saved card description in the card modal, extract up to **3** distinct `http(s)` URLs — from `<a href>` and from bare URLs in text — and render a preview card beneath the content. Same-origin (in-app) links, `mailto:` and mention markup are ignored. |
| LPV-2 | A preview card shows: **favicon** + **site name** (or domain) as its header, the **page title** (link), the **description** (clamped to 2 lines), the **thumbnail** (`og:image`/`twitter:image`), and the **URL's domain** so the destination is always visible. The whole card opens the URL in a new tab with `rel="noopener noreferrer"`. |
| LPV-3 | While loading, a skeleton of the card's shape shows (skeletons over spinners). If metadata cannot be fetched, a compact fallback row still shows favicon (or a globe icon), domain and the full URL — the link is never invisible. |
| LPV-4 | `GET /api/link-preview?url=` — `withAuth`, standard envelope, returns `{ url, finalUrl, domain, siteName, title, description, image, favicon }`. |
| LPV-5 | **SSRF-safe fetch.** Only `http:`/`https:`, default ports only, no credentials in the URL. Every connection — including each redirect hop — resolves DNS through a lookup that **rejects** loopback, private (RFC 1918), link-local (incl. cloud metadata `169.254.169.254`), CGNAT, multicast, reserved, unspecified, IPv6 ULA/link-local, and IPv4-mapped forms of those. Validation happens at connect time, so DNS rebinding cannot bypass it. At most 3 redirects; 5 s total timeout; at most 512 KB read; only `text/html`/`application/xhtml+xml` parsed; no cookies forwarded. |
| LPV-6 | **Parsing.** Title: `og:title` → `twitter:title` → `<title>`. Description: `og:description` → `twitter:description` → `meta[name=description]`. Image: `og:image(:secure_url)` → `twitter:image`. Favicon: `link[rel~=icon]` / `apple-touch-icon` → `/favicon.ico`. Site name: `og:site_name` → hostname. All relative URLs resolved against the final URL; entities decoded; whitespace collapsed; title ≤ 200 and description ≤ 300 chars. |
| LPV-7 | Images and favicons are shown only when `https:` (no mixed content), with `referrerPolicy="no-referrer"` and `loading="lazy"`; a broken image is hidden rather than left as a dead box. |
| LPV-8 | **Caching.** Server: in-process LRU of 500 entries, 24 h for successes, 10 min for failures. Client: React Query keyed by URL, 24 h `staleTime`, so re-opening a card makes no request. |
| LPV-9 | Rendering is text-only from API data — nothing from a fetched page is ever injected as HTML. |

- **LPV-AC-1** — *Given* a comment containing `https://github.com/vercel/next.js`, *then* a card with
  GitHub's favicon, "GitHub" header, repo title, description and thumbnail renders beneath it.
- **LPV-AC-2** — *Given* `http://169.254.169.254/latest/meta-data`, `http://localhost:3000`, or a
  public hostname that resolves to `10.0.0.5`, *then* the API refuses to connect and the UI shows the
  fallback row.
- **LPV-AC-3** — *Given* a URL that 404s or times out, *then* the fallback row shows the domain and URL.
- **LPV-AC-4** — *Given* a page whose `og:image` is `/img/card.png`, *then* the returned image is the
  absolute `https://host/img/card.png`.

### 3.3 Sprint board assignee filter — `AFL`

| ID | Requirement |
|---|---|
| AFL-1 | The assignee options are **the people on the board**: every card's assignee and members, the sprint participants and the sprint owner — de-duplicated, the current user first as "Me", the rest by name. Each option shows avatar, name and the number of cards on the board they are on (unfiltered, so a count never changes as other facets are toggled). |
| AFL-2 | An **Unassigned** option matches cards with no assignee and no members. |
| AFL-3 | The control is a dropdown with a checkbox per person — **one or many** may be selected — plus a search box once the list exceeds 6, and a Clear action. The menu stays open while toggling. |
| AFL-4 | A card matches when its assignee **or any member** is selected (OR within the facet). The facet combines with the linked/unlinked filter by AND. |
| AFL-5 | The trigger reads "All assignees", the single selected name, or "N assignees"; the Filter badge counts the facet once when anything is selected; "Clear filters" resets it. |
| AFL-6 | Selection persists per sprint (BRD-3) as `assignees: string[]`; a legacy saved `assignee: string` is read as a one-item selection. |
| AFL-7 | Saved ids no longer on the board are dropped once the board loads, so a stale selection can never silently hide every card. |
| AFL-8 | The header avatar stack shows the same board people (it was reading the empty participant list). |
| AFL-9 | The control is the reusable `components/ui/FilterMultiSelect` (zero business logic), built on Radix `DropdownMenuCheckboxItem` for `menuitemcheckbox` semantics, keyboard roving and type-ahead. |

- **AFL-AC-1** — *Given* a sprint with no `SprintParticipant` rows and cards whose members are A and
  B, *when* the dropdown opens, *then* A and B are listed with counts.
- **AFL-AC-2** — *Given* A and B are selected, *then* only cards with A or B as assignee or member show.
- **AFL-AC-3** — *Given* a saved filter from the old single-select, *when* the board loads, *then* that
  person is pre-selected.
- **AFL-AC-4** — *Given* a saved selection for a user no longer on any card, *then* it is dropped and
  cards are not hidden by it.

---

## 4. Reuse audit **[V]**

| Need | Reused | New (gap it fills) |
|---|---|---|
| Popover-style dropdown with checkbox rows | `components/ui/dropdown-menu` (`DropdownMenuCheckboxItem`, currently unused) | `components/ui/FilterMultiSelect` — `FilterSelect` is single-only by design; `FilterBar`'s multi is hand-rolled and feature-local |
| Avatars | `components/shared/UserAvatar` | — |
| Board people / cards | `GET /api/sprints/[id]/board` already returns `assignee` + `members` per card, `participants`, `owner` | No API change |
| Comment POST/PATCH | Existing routes and permission checks | `lib/background.ts` `runAfterResponse()` — no deferred-work helper existed |
| Rich-text rendering | `RichTextContent` (DOMPurify) | — |
| Server data fetching in UI | TanStack Query | `hooks/useLinkPreview.ts` |
| HTML/URL parsing | Node `http`/`https`/`dns`/`net`/`zlib`, WHATWG `URL` | `lib/link-preview/*` — no SSRF-safe fetcher or OG parser existed. **No new dependency.** |
| Preview card UI | Design tokens, `Skeleton` pattern | `components/shared/LinkPreview.tsx` |

---

## 5. Assumptions

| # | Assumption |
|---|---|
| A1 | Production runs as a long-lived Node process (PM2 on the VPS), so work scheduled after the response completes. On a serverless host it could be frozen; `runAfterResponse` is the single place to swap in `after()` when Next is upgraded. |
| A2 | Filter options are *people on the board*, not every active user — listing people with zero cards would only offer filters that empty the board. |
| A3 | Link previews are in scope for the card modal (comments, replies, description). OKR comments (`OkrComments`) can adopt `LinkPreviewList` later with one line; not done here. |
| A4 | Thumbnails and favicons load directly from the third-party host in the viewer's browser (no image proxy), with no referrer. The page fetch itself is server-side. |
| A5 | No per-user rate limit on `/api/link-preview` beyond authentication and caching. |
