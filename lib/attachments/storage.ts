/**
 * Where attachment bytes live.
 *
 * Deliberately NOT `public/`. Anything under public/ is served statically by
 * Next from the application's own origin, with no session check — which is how
 * the existing to-do uploader ended up letting any signed-in user read any
 * file by URL, and letting an uploaded .html run with access to the session
 * cookie. Files here are only reachable through
 * GET /api/comment-attachments/[id], which re-runs the permission check.
 *
 * Override with UPLOAD_DIR for a mounted volume. The default sits beside the
 * app so a deploy that wipes .next leaves uploads untouched.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md UPL-4, UPL-7.
 */

import { randomBytes } from 'crypto'
import { mkdir, writeFile, unlink, stat } from 'fs/promises'
import path from 'path'

export const UPLOAD_ROOT =
  process.env.UPLOAD_DIR || path.join(process.cwd(), 'var', 'uploads', 'comments')

/**
 * A filesystem-safe name that shares nothing with what the caller sent.
 * The extension comes from the validated type, not from the upload, so a
 * doctored name cannot influence the path or what we later serve it as.
 */
export function generateStoredName(validatedExtension: string): string {
  return `${Date.now()}-${randomBytes(12).toString('hex')}${validatedExtension}`
}

/** Absolute path for a stored name, guarding against traversal. */
export function resolveStoredPath(storedName: string): string {
  // storedName is server-generated, but this is the function that turns a
  // database value into a filesystem path — worth being certain.
  if (storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) {
    throw new Error('Invalid stored name')
  }
  const full = path.join(UPLOAD_ROOT, storedName)
  if (!full.startsWith(path.resolve(UPLOAD_ROOT) + path.sep) && full !== path.join(UPLOAD_ROOT, storedName)) {
    throw new Error('Path escapes the upload root')
  }
  return full
}

export async function persistFile(storedName: string, bytes: Buffer): Promise<void> {
  await mkdir(UPLOAD_ROOT, { recursive: true })
  await writeFile(resolveStoredPath(storedName), bytes)
}

/** Best-effort delete — a missing file is not an error worth surfacing. */
export async function deleteFile(storedName: string): Promise<void> {
  try {
    await unlink(resolveStoredPath(storedName))
  } catch {
    /* already gone */
  }
}

export async function fileExists(storedName: string): Promise<boolean> {
  try {
    await stat(resolveStoredPath(storedName))
    return true
  } catch {
    return false
  }
}
