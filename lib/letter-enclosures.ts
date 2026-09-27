/**
 * Letter enclosure helpers that are safe on the client (no fs / prisma).
 *
 * `LetterEnclosure.storagePath` has two shapes:
 *   - `letter-enclosure:<storedName>` — a real file in the private letters
 *     upload root (lib/letter-enclosure-storage.ts), readable only through
 *     GET /api/letters/[id]/enclosures/[enclosureId].
 *   - anything else (historically `/mock/letters/...`) — a metadata-only row
 *     from before binary upload existed. Displayed, never downloadable.
 */

export const LETTER_ENCLOSURE_STORAGE_PREFIX = 'letter-enclosure:'

/** Stored names are server-generated: `<ms>-<hex><.ext>`. Nothing else is accepted. */
const STORED_NAME = /^[0-9]{10,16}-[0-9a-f]{24}\.[a-z0-9]{2,5}$/

/** The stored file name for a row, or null for metadata-only / tampered rows. Pure. */
export function enclosureStoredName(storagePath: string | null | undefined): string | null {
  if (!storagePath || !storagePath.startsWith(LETTER_ENCLOSURE_STORAGE_PREFIX)) return null
  const name = storagePath.slice(LETTER_ENCLOSURE_STORAGE_PREFIX.length)
  return STORED_NAME.test(name) ? name : null
}

export function enclosureHasFile(storagePath: string | null | undefined): boolean {
  return enclosureStoredName(storagePath) !== null
}

export function letterEnclosureDownloadUrl(letterId: string, enclosureId: string): string {
  return `/api/letters/${encodeURIComponent(letterId)}/enclosures/${encodeURIComponent(enclosureId)}`
}

/**
 * FR-6 allowed formats: PDF, DOCX, XLSX, PNG, JPG. Applied on top of the
 * platform upload allowlist (validateUpload), which already rejects anything
 * executable and verifies magic bytes.
 */
export const LETTER_ENCLOSURE_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
] as const

export const LETTER_ENCLOSURE_ACCEPT = `.pdf,.docx,.xlsx,.png,.jpg,.jpeg,${LETTER_ENCLOSURE_MIME.join(',')}`
