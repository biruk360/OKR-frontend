/**
 * Where letter enclosure bytes live. Server-only.
 *
 * Private root (never under public/): files are only reachable through
 * GET /api/letters/[id]/enclosures/[enclosureId], which re-runs the letter
 * read scope on every request. Path handling reuses the platform attachment
 * primitives — `generateStoredName` (name shares nothing with the upload) and
 * `resolveInside` (one segment, contained in the root).
 *
 * Override with LETTER_UPLOAD_DIR for a mounted volume.
 */
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import path from 'path'
import { generateStoredName, resolveInside } from './attachments/storage'
import { LETTER_ENCLOSURE_STORAGE_PREFIX, enclosureStoredName } from './letter-enclosures'

export const LETTER_UPLOAD_ROOT =
  process.env.LETTER_UPLOAD_DIR || path.join(process.cwd(), 'var', 'uploads', 'letters')

/** Write the bytes; returns the `storagePath` value to record on the row. */
export async function persistEnclosureFile(
  validatedExtension: string,
  bytes: Buffer,
  root: string = LETTER_UPLOAD_ROOT,
): Promise<string> {
  const storedName = generateStoredName(validatedExtension)
  const full = resolveInside(root, storedName)
  await mkdir(root, { recursive: true })
  await writeFile(full, bytes)
  return `${LETTER_ENCLOSURE_STORAGE_PREFIX}${storedName}`
}

/** Absolute path for a row's bytes, or null for metadata-only rows. */
export function resolveEnclosurePath(storagePath: string, root: string = LETTER_UPLOAD_ROOT): string | null {
  const name = enclosureStoredName(storagePath)
  if (!name) return null
  try {
    return resolveInside(root, name)
  } catch {
    return null
  }
}

export async function readEnclosureFile(storagePath: string, root?: string): Promise<Buffer | null> {
  const full = resolveEnclosurePath(storagePath, root)
  if (!full) return null
  try {
    return await readFile(full)
  } catch {
    return null
  }
}

/** Best-effort delete; metadata-only rows have nothing to remove. */
export async function deleteEnclosureFile(storagePath: string, root?: string): Promise<void> {
  const full = resolveEnclosurePath(storagePath, root)
  if (!full) return
  try {
    await unlink(full)
  } catch {
    /* already gone */
  }
}
