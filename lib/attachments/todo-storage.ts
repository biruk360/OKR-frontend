/**
 * Where card (to-do) attachment bytes live, and how a `TodoAttachment` row
 * maps to a file.
 *
 * Card uploads used to be written to `public/uploads/todos/`, which Next
 * serves statically from the app's own origin with no session check: anyone
 * with the URL could read a card's files, and an uploaded .html/.svg ran as
 * the app (stored XSS). New uploads go to a private root beside the comment
 * attachment root (see storage.ts) and are only reachable through
 * GET /api/todos/[id]/attachments/[attachmentId], which re-runs the card
 * access check and pins the Content-Type.
 *
 * `TodoAttachment` has no storage-key column, so the row's `url` says where
 * the bytes are:
 *   - `/api/todos/<todoId>/attachments/<id>` — private; the file is
 *     `<TODO_UPLOAD_ROOT>/<id>` (no extension: the served type comes from the
 *     validated `mimeType`, never from a name on disk).
 *   - `/uploads/todos/<name>` — legacy, still under public/ until
 *     scripts/migrate-todo-attachments-private.ts moves it. Read-only support.
 * Anything else resolves to nothing, so a doctored `url` cannot point the
 * route at an arbitrary file.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md UPL-4, UPL-7;
 *       docs/attachment_viewer_REQUIREMENTS.md NRG-1.
 */

import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'
import { resolveInside } from './storage'

/** Private root for card attachments. Override with TODO_UPLOAD_DIR for a mounted volume. */
export const TODO_UPLOAD_ROOT =
  process.env.TODO_UPLOAD_DIR || path.join(process.cwd(), 'var', 'uploads', 'todos')

/** Where pre-fix uploads were written. Read (and deleted) only; never written. */
export const LEGACY_TODO_PUBLIC_ROOT = path.join(process.cwd(), 'public', 'uploads', 'todos')

export const LEGACY_TODO_URL_PREFIX = '/uploads/todos/'

/** Ids are server-generated cuids; anything else is not a file name we made. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

/** The authenticated URL a card attachment is read through. */
export function todoAttachmentApiUrl(todoId: string, attachmentId: string): string {
  return `/api/todos/${todoId}/attachments/${attachmentId}`
}

export interface TodoAttachmentLocationRow {
  id: string
  todoId: string
  url: string
}

export interface TodoAttachmentLocation {
  kind: 'private' | 'legacy'
  path: string
}

export interface TodoStorageRoots {
  privateRoot: string
  legacyRoot: string
}

const DEFAULT_ROOTS: TodoStorageRoots = {
  privateRoot: TODO_UPLOAD_ROOT,
  legacyRoot: LEGACY_TODO_PUBLIC_ROOT,
}

/**
 * Where this row's bytes are, or null when the row does not describe a file we
 * wrote. Pure — no filesystem access — so the traversal rules are unit-tested.
 */
export function resolveTodoAttachmentPath(
  row: TodoAttachmentLocationRow,
  roots: TodoStorageRoots = DEFAULT_ROOTS,
): TodoAttachmentLocation | null {
  try {
    if (SAFE_ID.test(row.id) && row.url === todoAttachmentApiUrl(row.todoId, row.id)) {
      return { kind: 'private', path: resolveInside(roots.privateRoot, row.id) }
    }
    if (row.url.startsWith(LEGACY_TODO_URL_PREFIX)) {
      // Exactly one segment after the prefix; resolveInside rejects the rest
      // (`..`, separators, encoded-then-stored oddities with a slash, NUL).
      const name = row.url.slice(LEGACY_TODO_URL_PREFIX.length)
      return { kind: 'legacy', path: resolveInside(roots.legacyRoot, name) }
    }
  } catch {
    return null
  }
  return null
}

/** Write a new card attachment into the private root under its row id. */
export async function persistTodoFile(
  attachmentId: string,
  bytes: Buffer,
  root: string = TODO_UPLOAD_ROOT,
): Promise<string> {
  if (!SAFE_ID.test(attachmentId)) throw new Error('Invalid attachment id')
  const full = resolveInside(root, attachmentId)
  await mkdir(root, { recursive: true })
  await writeFile(full, bytes)
  return full
}

/** Best-effort delete of wherever this row's bytes are. */
export async function deleteTodoFile(row: TodoAttachmentLocationRow): Promise<void> {
  const loc = resolveTodoAttachmentPath(row)
  if (!loc) return
  try {
    await unlink(loc.path)
  } catch {
    /* already gone */
  }
}
