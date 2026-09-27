import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { NextResponse } from 'next/server'
import { apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { readFile } from 'fs/promises'
import type { UserRole } from '@/types'
import { ALLOWED_TYPES } from '@/lib/attachments/file-types'
import { attachmentResponseHeaders } from '@/lib/attachments/serve'
import { resolveStoredPath } from '@/lib/attachments/storage'
import { canAccessAttachmentScope, isCommentScope } from '@/lib/attachments/access'

/**
 * GET /api/comment-attachments/[id] — stream an attachment.
 *
 * This route IS the access control. Files live outside `public/`, so this is
 * the only way to read one, and it re-runs the parent entity's permission
 * check on every request — a link that leaks grants nothing to someone who
 * cannot already open the item.
 *
 * Content-Type is the validated type from the allowlist, never what the
 * uploader claimed, and anything that is not an image or PDF is sent as a
 * download. `X-Content-Type-Options: nosniff` stops the browser second-guessing.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md UPL-7, UPL-AC-4.
 */
export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid attachment id')

  const row = await prisma.commentAttachment.findUnique({
    where: { id },
    select: {
      storedName: true, filename: true, mimeType: true,
      commentType: true, entityId: true,
    },
  })
  // Same response whether it is missing or forbidden.
  if (!row) return apiNotFound('Attachment not available')
  if (!isCommentScope(row.commentType)) return apiNotFound('Attachment not available')

  const allowed = await canAccessAttachmentScope(
    row.commentType,
    row.entityId,
    { id: session.user.id, role: session.user.role as UserRole, userType: session.user.userType },
    'read',
  )
  if (!allowed) return apiNotFound('Attachment not available')

  const type = ALLOWED_TYPES.find((t) => t.mime === row.mimeType)
  // A row whose type is no longer on the allowlist is not served at all —
  // the allowlist may have tightened since the upload.
  if (!type) return apiNotFound('Attachment not available')

  let bytes: Buffer
  try {
    bytes = await readFile(resolveStoredPath(row.storedName))
  } catch {
    return apiNotFound('Attachment not available')
  }

  // Shared header policy with the card route (lib/attachments/serve.ts):
  // nosniff, sandboxed CSP, `attachment` for anything not an image/PDF,
  // private caching (permission is re-checked per request), and an RFC 5987
  // filename so a non-ASCII display name cannot break the header.
  //
  // withAuth is typed to NextResponse; a binary body still needs a plain
  // Response, so this is cast rather than wrapped in NextResponse.json.
  return new NextResponse(new Uint8Array(bytes), {
    headers: attachmentResponseHeaders({ type, filename: row.filename, size: bytes.byteLength }),
  })
})
