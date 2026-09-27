/**
 * Response headers for streaming an attachment from our own origin.
 *
 * Pure — no Next or filesystem imports — so the header policy is unit-tested
 * directly. Used by GET /api/todos/[id]/attachments/[attachmentId].
 *
 * The policy, per served type:
 *   - Content-Type is the allowlisted canonical type, never the uploader's
 *     claim; anything we cannot re-verify is `application/octet-stream`.
 *   - `X-Content-Type-Options: nosniff` everywhere, so a browser never
 *     second-guesses the type into something active.
 *   - Images render inline under a sandboxed CSP (no script, no plugins, no
 *     same-origin privileges even if one were ever opened as a document).
 *   - PDFs render inline WITHOUT `sandbox`: Chrome's built-in PDF viewer
 *     refuses to load in a sandboxed context, which would break the viewer's
 *     `<object type="application/pdf">` preview. A PDF served as
 *     application/pdf with nosniff cannot run script on our origin.
 *   - Everything else (Office, text, CSV, unknown) is a download
 *     (`Content-Disposition: attachment`) under `sandbox; default-src 'none'`.
 *   - `Cache-Control: private` — permission is re-checked per request, so no
 *     shared cache may keep a copy.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md UPL-7, UPL-AC-4.
 */

import { validateUpload, dispositionFor, type AllowedType } from './file-types'

export const SANDBOX_CSP = "sandbox; default-src 'none'"
export const IMAGE_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"

/**
 * Re-verify stored bytes against the allowlist (extension, recorded MIME and
 * magic bytes). Legacy card uploads were never validated and recorded the
 * uploader's claimed MIME, so a row saying `image/png` may hold HTML — those
 * come back null and are served as an opaque download.
 */
export function serveTypeFor(args: {
  filename: string
  mimeType: string
  bytes: Uint8Array
}): AllowedType | null {
  const verdict = validateUpload({
    filename: args.filename,
    declaredMime: args.mimeType,
    size: args.bytes.byteLength,
    head: args.bytes.subarray(0, 64),
  })
  return verdict.ok ? verdict.type : null
}

/**
 * `filename="…"` with an ASCII fallback plus RFC 5987 `filename*` for the
 * real name. Header values must be Latin-1, so a raw non-ASCII name (Amharic,
 * accented, emoji) would otherwise throw when the response is built.
 */
export function contentDispositionHeader(disposition: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/["\\\r\n]/g, '_').replace(/[^\x20-\x7e]/g, '_') || 'attachment'
  let encoded: string
  try {
    encoded = encodeURIComponent(filename.replace(/[\r\n]/g, '_'))
  } catch {
    return `${disposition}; filename="${ascii}"`   // lone surrogate — fall back to ASCII only
  }
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

export function attachmentResponseHeaders(args: {
  type: AllowedType | null
  filename: string
  size: number
}): Record<string, string> {
  const { type, filename, size } = args
  const disposition = type ? dispositionFor(type) : 'attachment'
  const csp = !type || disposition === 'attachment'
    ? SANDBOX_CSP
    : type.kind === 'IMAGE'
      ? IMAGE_CSP
      : null   // inline PDF — see header comment

  const headers: Record<string, string> = {
    'Content-Type': type ? type.mime : 'application/octet-stream',
    'Content-Length': String(size),
    'Content-Disposition': contentDispositionHeader(disposition, filename),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=0, must-revalidate',
  }
  if (csp) headers['Content-Security-Policy'] = csp
  return headers
}
