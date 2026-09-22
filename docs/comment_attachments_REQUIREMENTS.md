# Comment Attachments — Files and Photos, with Preview

> Status: SPECIFIED, NOT STARTED. Owner: TBD. Last updated: 2026-09-22.
>
> Legend: **[V]** verified against code in this repo · **[A]** assumption needing confirmation.

---

## Context

The ask: *attach files and photos to comments, with preview, opening as a modal or a tab as
appropriate — implemented globally.*

"Globally" is the hard part. There are four comment surfaces built on three different models, only
one of which supports attachments at all, and the one that does has a storage design that is both
hard to query and **unsafe to serve**.

---

## 1. Current implementation **[V]**

| Surface | Comment model | Attachments today | Preview |
|---|---|---|---|
| To-do comments | `TodoComment` | ✅ `commentAttachments` — a **JSON string of ids** pointing at `TodoAttachment` | inline `<img>` or a filename chip; no viewer |
| Objective comments | `Comment` | ❌ none | — |
| Key-result comments | `Comment` (same model) | ❌ none | — |
| Project activity comments | `ActivityComment` | ❌ — `ActivityAttachment` hangs off the **activity**, not the comment | — |
| Scrum comments | — | ❌ none | — |

There is **no image viewer or lightbox component anywhere in the repo** [V].

### 1.1 Three problems with the one implementation that exists

1. **`TodoComment.commentAttachments` is a JSON string, not a relation** [V]. It cannot be joined,
   counted or cascaded. Deleting a comment leaves its files behind; deleting an attachment leaves a
   dangling id in the string.

2. **The upload endpoint has no type allowlist** [V]. `POST /api/todos/[id]/attachments` accepts any
   file, keeps the caller's extension, and writes into `public/uploads/todos/`, which Next serves
   statically from the app's own origin. Uploading `.html` or `.svg` therefore yields **stored XSS
   on the application origin** — the file runs with access to the session cookie. This is a live
   defect, independent of this feature.

3. **The endpoint authorises nothing beyond existence** [V]. It checks the to-do exists, not that
   the caller may see it. Any signed-in user can attach a file to any to-do by id, and every
   uploaded file is readable by anyone with the URL, signed in or not.

---

## 2. Requirements

### 2.1 Data model — `ATT`

| ID | Requirement |
|---|---|
| ATT-1 | One polymorphic `CommentAttachment` model serving every surface: `{ id, commentType, commentId, uploadedById, filename, storedName, url, mimeType, size, width?, height?, createdAt }`. `commentType` ∈ `TODO \| OKR \| ACTIVITY \| SCRUM`. |
| ATT-2 | Indexed on `(commentType, commentId)` so a comment's attachments load in one query. |
| ATT-3 | Deleting a comment deletes its attachment rows **and** their stored files. No orphans in either direction. |
| ATT-4 | `TodoComment.commentAttachments` is migrated into `CommentAttachment` and then ignored. It is left in place, unread, for one release as a rollback path. |
| ATT-5 | Image dimensions are captured at upload so the UI can reserve space and avoid layout shift. |

### 2.2 Upload and storage — `UPL`

| ID | Requirement |
|---|---|
| UPL-1 | One endpoint, `POST /api/comment-attachments`, taking `{ commentType, entityId }` — the parent entity, since the comment may not exist yet while composing. |
| UPL-2 | **Allowlist by both MIME type and extension**, cross-checked against the file's magic bytes. Images (png/jpeg/gif/webp), PDF, plain text, CSV, and Office documents. Everything else is rejected. |
| UPL-3 | **`.html`, `.htm`, `.svg` and any script-bearing type are rejected outright**, closing the stored-XSS hole in §1.1.2. |
| UPL-4 | Stored filenames are generated server-side; the caller's name is kept only as a display label and never used for a path. |
| UPL-5 | Per-file cap 20 MB (matching today), and a per-comment count cap. |
| UPL-6 | The caller must pass the **same permission check as commenting on that entity**, not merely prove it exists. |
| UPL-7 | Files are served through an authenticated route that sets `Content-Disposition: attachment` for anything non-image and an explicit safe `Content-Type` — never from `public/` where the origin executes them. **[A]** Existing `public/uploads/*` files are migrated behind the same route; confirm before moving them. |
| UPL-8 | Upload failures never lose the comment draft. |

### 2.3 Composer — `CMP`

| ID | Requirement |
|---|---|
| CMP-1 | Every comment composer gets one shared attach control: click to pick, **drag-and-drop onto the composer**, and **paste an image from the clipboard**. |
| CMP-2 | Files upload immediately and show as staged chips with progress; posting the comment links the staged ids. |
| CMP-3 | Removing a staged chip deletes the uploaded file — abandoning a draft must not leak storage. |
| CMP-4 | A rejected file explains why (type or size), naming the file, and leaves the others staged. |
| CMP-5 | One component used by all four surfaces. Per CLAUDE.md, no per-surface copy. |

### 2.4 Rendering and preview — `PRV`

| ID | Requirement |
|---|---|
| PRV-1 | Images render as inline thumbnails, capped in height, with the filename available on hover. |
| PRV-2 | Non-images render as a chip: type icon, filename, human-readable size. |
| PRV-3 | Clicking an **image** opens a modal lightbox: fit-to-viewport, filename and size, download, and next/previous across the images of that comment. |
| PRV-4 | Clicking a **PDF** opens the same modal with an embedded viewer. **[A]** If embedding proves unreliable, it falls back to a new tab. |
| PRV-5 | Everything else opens in a **new tab** — the "as necessary" half of the ask. |
| PRV-6 | The lightbox closes on Escape and on backdrop click, traps focus, restores focus to the thumbnail, and supports ←/→ between images. |
| PRV-7 | A broken or deleted file shows a placeholder, not a broken-image icon. |

### 2.5 Cross-cutting — `XCT`

| ID | Requirement |
|---|---|
| XCT-1 | Apple Pro tokens only; the lightbox is built on `components/ui/Modal`, so it inherits the focus trap. |
| XCT-2 | Attaching a file writes to `ActivityLog` like any other mutation. |
| XCT-3 | Mobile: thumbnails reflow, the lightbox is full-screen, and the attach control stays reachable. |
| XCT-4 | Client-portal comments must **never** expose an internal attachment — portal serialisation rules are unchanged and still enforced at the SQL level. |
| XCT-5 | Existing to-do comment attachments keep rendering after the migration. |

---

## 3. Acceptance criteria

**ATT-AC-1** — *Given* a comment with two attachments, *when* the comment is deleted, *then* both
rows are gone and both files are removed from storage.

**ATT-AC-2** — *Given* existing to-do comments with `commentAttachments` JSON, *when* the migration
runs, *then* every referenced attachment appears as a `CommentAttachment` row and still renders.

**UPL-AC-1** — *Given* a file named `payload.html`, *when* uploaded, *then* it is rejected and nothing
is written to disk.

**UPL-AC-2** — *Given* a `.png` renamed to `.pdf`, *when* uploaded, *then* the magic-byte check
rejects the mismatch.

**UPL-AC-3** — *Given* a user with no access to a to-do, *when* they upload against its id, *then*
the response is 403 and nothing is written. (Today this succeeds.)

**UPL-AC-4** — *Given* an uploaded file, *when* it is requested without a session, *then* the request
is refused.

**CMP-AC-1** — *Given* an image pasted from the clipboard into a composer, *then* it stages as a
thumbnail and posts with the comment.

**CMP-AC-2** — *Given* a staged file removed before posting, *then* the stored file is deleted.

**CMP-AC-3** — *Given* a 25 MB file, *then* it is rejected by name with a size message and other
staged files survive.

**PRV-AC-1** — *Given* a comment with three images, *when* the second is clicked, *then* the lightbox
opens on it and ←/→ move between all three.

**PRV-AC-2** — *Given* a `.docx` attachment, *when* clicked, *then* it opens in a new tab and
downloads rather than rendering.

**PRV-AC-3** — *Given* the lightbox open, *when* Escape is pressed, *then* it closes and focus
returns to the thumbnail that opened it.

**XCT-AC-1** — *Given* an internal comment with an attachment, *when* the portal serialises that
activity, *then* neither the attachment nor its URL appears.

---

## 4. Assumptions

| # | Assumption |
|---|---|
| A1 | Local disk storage continues; no S3/object store in this phase. |
| A2 | Serving through an authenticated route is acceptable despite losing static-CDN caching. |
| A3 | Migrating existing `public/uploads/*` files behind the authenticated route is in scope. If not, old files stay public and only new ones are protected. |
| A4 | Scrum comments are in scope. They have no attachment support today and their own recipient rules. |
| A5 | No image resizing/thumbnail generation in this phase — the browser scales; `width`/`height` only prevent layout shift. |

## 5. Suggested build order

1. `CommentAttachment` model + migration of the to-do JSON column.
2. Upload endpoint with allowlist, magic-byte check and permission check (closes the XSS and authz holes on its own).
3. Authenticated serve route.
4. Shared composer control + chips.
5. Lightbox.
6. Wire the four surfaces.
