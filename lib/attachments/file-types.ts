/**
 * Upload allowlist, magic-byte verification and image dimensions.
 *
 * Deliberately dependency-free. `file-type` would do the sniffing, but it is
 * ESM-only in current versions (awkward in this runtime) and for a list this
 * small an explicit signature table is shorter, auditable, and cannot drift
 * with a transitive upgrade.
 *
 * The rule this file exists to enforce: a browser must never be able to
 * execute an uploaded file. Extension, declared MIME and actual bytes must all
 * agree, and the union excludes every script-bearing format.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md UPL-2, UPL-3, ATT-5.
 */

export interface AllowedType {
  /** Canonical content type we serve the file back as — never the caller's. */
  mime: string
  extensions: string[]
  kind: 'IMAGE' | 'PDF' | 'DOCUMENT' | 'TEXT'
  /** Byte signature(s); `offset` defaults to 0. Empty = no reliable signature. */
  signatures: { bytes: number[]; offset?: number }[]
}

export const ALLOWED_TYPES: AllowedType[] = [
  { mime: 'image/png',  extensions: ['.png'],           kind: 'IMAGE', signatures: [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }] },
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'],  kind: 'IMAGE', signatures: [{ bytes: [0xff, 0xd8, 0xff] }] },
  { mime: 'image/gif',  extensions: ['.gif'],           kind: 'IMAGE', signatures: [{ bytes: [0x47, 0x49, 0x46, 0x38] }] },
  { mime: 'image/webp', extensions: ['.webp'],          kind: 'IMAGE', signatures: [{ bytes: [0x52, 0x49, 0x46, 0x46] }, { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }] },
  { mime: 'application/pdf', extensions: ['.pdf'],      kind: 'PDF',   signatures: [{ bytes: [0x25, 0x50, 0x44, 0x46] }] },
  // OOXML files are ZIP containers, so the signature only proves "a zip".
  // Extension + declared MIME carry the rest; none of these execute in a browser.
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['.docx'], kind: 'DOCUMENT', signatures: [{ bytes: [0x50, 0x4b, 0x03, 0x04] }] },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',      extensions: ['.xlsx'], kind: 'DOCUMENT', signatures: [{ bytes: [0x50, 0x4b, 0x03, 0x04] }] },
  { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extensions: ['.pptx'], kind: 'DOCUMENT', signatures: [{ bytes: [0x50, 0x4b, 0x03, 0x04] }] },
  { mime: 'text/plain', extensions: ['.txt', '.log', '.md'], kind: 'TEXT', signatures: [] },
  { mime: 'text/csv',   extensions: ['.csv'],           kind: 'TEXT', signatures: [] },
]

/**
 * Formats a browser will execute or render as active content. Checked by
 * extension *and* by declared MIME, because either alone is trivial to dodge.
 * `.svg` is here because it carries `<script>`; it is an image everywhere else.
 */
const FORBIDDEN_EXTENSIONS = new Set([
  '.html', '.htm', '.xhtml', '.shtml', '.svg', '.svgz', '.xml', '.xsl',
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.php', '.phtml', '.asp', '.aspx',
  '.jsp', '.cgi', '.pl', '.py', '.rb', '.sh', '.bash', '.exe', '.dll',
  '.bat', '.cmd', '.com', '.msi', '.jar', '.app', '.deb', '.rpm', '.scr',
  '.vbs', '.ps1', '.wsf', '.hta',
])

/**
 * Exact MIME types a browser will execute. Matched exactly rather than by
 * substring: a loose /xml/i test also matches
 * `application/vnd.openxmlformats-officedocument…`, which would have rejected
 * every legitimate .docx, .xlsx and .pptx as dangerous. A unit test caught it.
 */
const FORBIDDEN_MIME = new Set([
  'text/html', 'application/xhtml+xml', 'text/xml', 'application/xml',
  'image/svg+xml', 'image/svg',
  'application/javascript', 'text/javascript', 'application/ecmascript',
  'text/ecmascript', 'application/x-javascript',
  'application/x-httpd-php', 'application/x-httpd-php-source',
  'application/x-sh', 'application/x-shellscript', 'application/x-csh',
  'application/x-msdownload', 'application/x-msdos-program',
  'application/vnd.microsoft.portable-executable',
  'application/x-executable', 'application/x-mach-binary',
  'application/java-archive', 'application/x-java-archive',
])

function isForbiddenMime(declared: string): boolean {
  const mime = declared.trim().toLowerCase().split(';')[0]
  if (FORBIDDEN_MIME.has(mime)) return true
  // `+xml` suffix covers SVG-alikes without touching the OOXML vendor types,
  // whose subtype ends in `.document` / `.sheet` / `.presentation`.
  if (mime.endsWith('+xml')) return true
  return false
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_COMMENT = 10

export type RejectionReason =
  | 'EMPTY'
  | 'TOO_LARGE'
  | 'FORBIDDEN_TYPE'
  | 'UNSUPPORTED_TYPE'
  | 'CONTENT_MISMATCH'

export interface ValidationOk { ok: true; type: AllowedType; extension: string }
export interface ValidationFail { ok: false; reason: RejectionReason; message: string }
export type ValidationResult = ValidationOk | ValidationFail

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i === -1 ? '' : filename.slice(i).toLowerCase()
}

function matchesSignature(head: Uint8Array, type: AllowedType): boolean {
  if (type.signatures.length === 0) return true   // no reliable signature (text)
  return type.signatures.every(({ bytes, offset = 0 }) =>
    bytes.every((b, i) => head[offset + i] === b),
  )
}

/**
 * Validate an upload. `head` is the first bytes of the file (≥16 is plenty).
 *
 * Order matters: the forbidden check runs before the allowlist so a rejection
 * of `.html` reports FORBIDDEN_TYPE rather than the vaguer UNSUPPORTED_TYPE.
 */
export function validateUpload(args: {
  filename: string
  declaredMime: string
  size: number
  head: Uint8Array
}): ValidationResult {
  const { filename, declaredMime, size, head } = args
  const ext = extensionOf(filename)

  if (size <= 0) {
    return { ok: false, reason: 'EMPTY', message: `“${filename}” is empty.` }
  }
  if (size > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: 'TOO_LARGE',
      message: `“${filename}” is ${(size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    }
  }
  if (FORBIDDEN_EXTENSIONS.has(ext) || isForbiddenMime(declaredMime)) {
    return {
      ok: false,
      reason: 'FORBIDDEN_TYPE',
      message: `“${filename}” is a type that can run code in the browser, so it cannot be attached.`,
    }
  }

  const byExt = ALLOWED_TYPES.filter((t) => t.extensions.includes(ext))
  if (byExt.length === 0) {
    return { ok: false, reason: 'UNSUPPORTED_TYPE', message: `“${filename}” is not a supported file type.` }
  }

  // Prefer the candidate whose declared MIME also agrees; .docx/.xlsx/.pptx all
  // share the ZIP signature, so the extension is what separates them.
  const candidate = byExt.find((t) => t.mime === declaredMime) ?? byExt[0]

  if (!matchesSignature(head, candidate)) {
    return {
      ok: false,
      reason: 'CONTENT_MISMATCH',
      message: `“${filename}” does not contain the kind of data its name claims.`,
    }
  }
  return { ok: true, type: candidate, extension: candidate.extensions[0] }
}

/**
 * Pixel dimensions straight from the header (ATT-5), so the UI can reserve
 * space and avoid layout shift. No decoding, no image library.
 */
export function readImageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  try {
    if (mime === 'image/png' && bytes.length >= 24) {
      return { width: dv.getUint32(16), height: dv.getUint32(20) }
    }
    if (mime === 'image/gif' && bytes.length >= 10) {
      return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) }
    }
    if (mime === 'image/jpeg') {
      let o = 2
      while (o + 9 < bytes.length) {
        if (bytes[o] !== 0xff) { o++; continue }
        const marker = bytes[o + 1]
        // SOF0..SOF15, excluding the non-frame markers in that range.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: dv.getUint16(o + 5), width: dv.getUint16(o + 7) }
        }
        o += 2 + dv.getUint16(o + 2)
      }
      return null
    }
    if (mime === 'image/webp' && bytes.length > 30) {
      const fourcc = String.fromCharCode(...Array.from(bytes.slice(12, 16)))
      if (fourcc === 'VP8X') return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) }
      if (fourcc === 'VP8 ') return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff }
      if (fourcc === 'VP8L') {
        const b = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }
      }
      return null
    }
  } catch {
    return null   // a truncated or malformed header is not worth failing an upload over
  }
  return null
}

/** Content-Disposition for the serve route: only images render inline. */
export function dispositionFor(type: AllowedType): 'inline' | 'attachment' {
  return type.kind === 'IMAGE' || type.kind === 'PDF' ? 'inline' : 'attachment'
}
