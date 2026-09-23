# Attachment Viewing — One Contract, Every Surface

> Status: SPECIFIED. Owner: TBD. Last updated: 2026-09-23.
>
> Legend: **[V]** verified against code · **[A]** assumption needing confirmation.

---

## Context

Reported: the card's **Attachments** thumbnail renders but clicking it does nothing.

That is one symptom of a broader problem. Attachments are displayed in four places and **behave
differently in all four**. Fixing only the reported one would leave three inconsistencies and
guarantee the same report again from a different screen.

## 1. Current behaviour **[V]**

| # | Surface | File | Image click | Non-image click | Keyboard | Download |
|---|---|---|---|---|---|---|
| 1 | Card **Attachments** grid | `TodoCardModal.tsx:2251` | **nothing** — plain `<img>`, no handler | opens raw file in a tab | **unreachable** | none |
| 2 | To-do **comment** attachments | `TodoCardModal.tsx:2510` | new tab, raw file | new tab | link, so reachable | browser-dependent |
| 3 | OKR / KR comment attachments | `CommentAttachments.tsx:52` | **lightbox** ✓ | new tab | button ✓ | in lightbox ✓ |
| 4 | Project activity files | `ActivityDetailPanel.tsx:560` | new tab via `storagePath` | new tab | link | none |

Only surface 3 does what the reporter expected, because that is the only one built after the
lightbox existed. Surfaces 1, 2 and 4 pre-date it.

A second problem sits behind surface 4: it links `attachment.storagePath` directly, the same
serve-from-disk pattern that produced the broken thumbnails and that the authenticated route
replaced for to-dos. **[A]** — project attachments have client-portal rules, so migrating them is
called out but not assumed.

## 2. Requirements

### 2.1 One contract — `AVW`

| ID | Requirement |
|---|---|
| AVW-1 | One component renders an attachment wherever one appears. No surface re-implements a thumbnail, a chip or a click handler. |
| AVW-2 | **Images and PDFs open in the lightbox.** Everything else opens in a new tab, where the serve route's `Content-Disposition: attachment` makes it a download. |
| AVW-3 | Every attachment is a real `<button>` or `<a>` — focusable, Enter/Space activatable, with an accessible name that includes the filename. Surface 1 is currently unreachable by keyboard entirely. |
| AVW-4 | Arrow keys move between **all previewable attachments in the same group**, so a card with four screenshots is browsable without closing the viewer. |
| AVW-5 | The lightbox offers download, shows filename and size, and states position ("2 of 4") when the group has more than one. |
| AVW-6 | A file that fails to load shows a placeholder and its filename, never the browser's broken-image glyph. |
| AVW-7 | Thumbnails reserve their box from stored dimensions where known, so a thread does not reflow as images arrive. |
| AVW-8 | Escape closes; focus returns to the thumbnail that opened it. |

### 2.2 Applying it — `APL`

| ID | Requirement |
|---|---|
| APL-1 | Surface 1 (card Attachments grid) adopts AVW-1. This is the reported defect. |
| APL-2 | Surface 2 (to-do comment attachments) adopts AVW-1, replacing its new-tab link. |
| APL-3 | Surface 3 already conforms; it is the reference, and must not regress. |
| APL-4 | Surface 4 (project activity) — **[A]** out of scope pending confirmation: its files are served from `storagePath` and carry client-portal visibility rules that must not be loosened. Flagged, not changed. |
| APL-5 | Delete/remove controls stay where they already are. Viewing and managing are separate concerns. |

### 2.3 Non-regression — `NRG`

| ID | Requirement |
|---|---|
| NRG-1 | All attachment reads continue through the authenticated route. No surface reverts to a raw `/uploads/...` path. |
| NRG-2 | The card grid keeps its existing delete control and layout density. |
| NRG-3 | Comment attachments keep rendering for both storage shapes — the legacy `TodoAttachment` ids and the newer `CommentAttachment` rows. |

## 3. Acceptance criteria

**AVW-AC-1** — *Given* a card with an image attachment, *when* the thumbnail is clicked, *then* the
lightbox opens on that image. (Today: nothing happens.)

**AVW-AC-2** — *Given* the same thumbnail, *when* it is focused and Enter is pressed, *then* the
lightbox opens. (Today: it cannot be focused.)

**AVW-AC-3** — *Given* a card with three images and a `.docx`, *when* the first image is opened and
→ pressed twice, *then* the third image shows and the `.docx` is not in the rotation.

**AVW-AC-4** — *Given* the `.docx`, *when* it is clicked, *then* a new tab opens and the file
downloads rather than rendering.

**AVW-AC-5** — *Given* an attachment whose file is missing, *then* a placeholder with the filename
shows, and no broken-image glyph appears.

**AVW-AC-6** — *Given* the lightbox open, *when* Escape is pressed, *then* it closes and focus
returns to the thumbnail.

**NRG-AC-1** — *Given* the whole UI, *when* the source is searched, *then* no component renders an
attachment from a raw `/uploads/` path.

## 4. Assumptions

| # | Assumption |
|---|---|
| A1 | Project activity attachments (surface 4) stay as they are until their portal visibility rules are reviewed. |
| A2 | No thumbnail generation — the browser scales, and stored dimensions only prevent reflow. |
| A3 | The card grid keeps its two-column compact layout; only the interaction changes. |
