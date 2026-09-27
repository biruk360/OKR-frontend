/**
 * Where project activity attachment bytes live, and how an
 * `ActivityAttachment` row maps to a file.
 *
 * The same fix as card attachments (todo-storage.ts), applied to the project
 * module. Activity uploads used to be written to
 * `public/uploads/project-activities/`, which Next serves statically from the
 * app's own origin with no session check: an uploaded .html/.svg ran as the
 * app (stored XSS), and any file, INTERNAL or not, was readable by URL with no
 * sign-in. New uploads go to a private root and are only reachable through
 * GET /api/projects/[id]/activities/[activityId]/attachments/[attachmentId],
 * which re-runs the project read check and pins the Content-Type.
 *
 * `ActivityAttachment.storagePath` says where the bytes are:
 *   - `/api/projects/<projectId>/activities/<activityId>/attachments/<id>` —
 *     private; the file is `<PROJECT_UPLOAD_ROOT>/<id>` (no extension: the
 *     served type comes from the validated `mimeType`, never a name on disk).
 *   - `/uploads/project-activities/<name>` — legacy, still under public/ until
 *     scripts/migrate-project-attachments-private.ts moves it. Read-only.
 * Anything else resolves to nothing, so a doctored `storagePath` cannot point
 * the route at an arbitrary file.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md UPL-4, UPL-7;
 *       docs/attachment_viewer_REQUIREMENTS.md NRG-1, A1.
 */

import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'
import { resolveInside } from './storage'

/** Private root for project activity attachments. Override with PROJECT_UPLOAD_DIR for a mounted volume. */
export const PROJECT_UPLOAD_ROOT =
  process.env.PROJECT_UPLOAD_DIR || path.join(process.cwd(), 'var', 'uploads', 'project-activities')

/** Where pre-fix uploads were written. Read (and deleted) only; never written. */
export const LEGACY_PROJECT_PUBLIC_ROOT = path.join(process.cwd(), 'public', 'uploads', 'project-activities')

export const LEGACY_PROJECT_URL_PREFIX = '/uploads/project-activities/'

/** Ids are server-generated cuids; anything else is not a file name we made. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

/** The authenticated URL an activity attachment is read through. */
export function projectAttachmentApiUrl(projectId: string, activityId: string, attachmentId: string): string {
  return `/api/projects/${projectId}/activities/${activityId}/attachments/${attachmentId}`
}

export interface ProjectAttachmentLocationRow {
  id: string
  activityId: string
  /** The project the caller has verified (in SQL) that this activity belongs to. */
  projectId: string
  storagePath: string
}

export interface ProjectAttachmentLocation {
  kind: 'private' | 'legacy'
  path: string
}

export interface ProjectStorageRoots {
  privateRoot: string
  legacyRoot: string
}

const DEFAULT_ROOTS: ProjectStorageRoots = {
  privateRoot: PROJECT_UPLOAD_ROOT,
  legacyRoot: LEGACY_PROJECT_PUBLIC_ROOT,
}

/**
 * Where this row's bytes are, or null when the row does not describe a file we
 * wrote. Pure — no filesystem access — so the traversal rules are unit-tested.
 */
export function resolveProjectAttachmentPath(
  row: ProjectAttachmentLocationRow,
  roots: ProjectStorageRoots = DEFAULT_ROOTS,
): ProjectAttachmentLocation | null {
  try {
    if (
      SAFE_ID.test(row.id) &&
      row.storagePath === projectAttachmentApiUrl(row.projectId, row.activityId, row.id)
    ) {
      return { kind: 'private', path: resolveInside(roots.privateRoot, row.id) }
    }
    if (row.storagePath.startsWith(LEGACY_PROJECT_URL_PREFIX)) {
      // Exactly one segment after the prefix; resolveInside rejects the rest
      // (`..`, separators, NUL).
      const name = row.storagePath.slice(LEGACY_PROJECT_URL_PREFIX.length)
      return { kind: 'legacy', path: resolveInside(roots.legacyRoot, name) }
    }
  } catch {
    return null
  }
  return null
}

/** Write a new activity attachment into the private root under its row id. */
export async function persistProjectFile(
  attachmentId: string,
  bytes: Buffer,
  root: string = PROJECT_UPLOAD_ROOT,
): Promise<string> {
  if (!SAFE_ID.test(attachmentId)) throw new Error('Invalid attachment id')
  const full = resolveInside(root, attachmentId)
  await mkdir(root, { recursive: true })
  await writeFile(full, bytes)
  return full
}

/** Best-effort delete of wherever this row's bytes are. */
export async function deleteProjectFile(row: ProjectAttachmentLocationRow): Promise<void> {
  const loc = resolveProjectAttachmentPath(row)
  if (!loc) return
  try {
    await unlink(loc.path)
  } catch {
    /* already gone */
  }
}
