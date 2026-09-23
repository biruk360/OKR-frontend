import { readFile, unlink } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound, withAuth } from '@/lib/api'
import type { UserRole } from '@/types'
import { ALLOWED_TYPES, dispositionFor } from '@/lib/attachments/file-types'
import { canAccessAttachmentScope } from '@/lib/attachments/access'

type Params = { id: string; attachmentId: string }

/**
 * GET — stream a card attachment.
 *
 * These files were written into `public/uploads/todos/`, where Next serves
 * them statically with no session check: anyone with the URL could read them,
 * and an uploaded .html or .svg would execute on the app's own origin. Reading
 * them through here instead means the permission check runs on every request
 * and the content type is the one we validated, not the one the uploader
 * claimed.
 *
 * It also removes the dependency on `public/` static-serving semantics, which
 * is where the broken thumbnails were coming from — bytes on disk that the
 * static handler would not return.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md ATT-4, UPL-7.
 */
export const GET = withAuth<Params>(async (_req, { session, params }) => {
  const { id: todoId, attachmentId } = await resolveParams(params)
  if (!todoId || !attachmentId) return apiBadRequest('Invalid id')

  const attachment = await prisma.todoAttachment.findUnique({
    where: { id: attachmentId },
    select: { todoId: true, url: true, filename: true, mimeType: true },
  })
  // Same answer for missing and forbidden, so ids cannot be probed.
  if (!attachment || attachment.todoId !== todoId) return apiNotFound('Attachment not available')

  const allowed = await canAccessAttachmentScope('TODO', todoId, {
    id: session.user.id,
    role: session.user.role as UserRole,
  })
  if (!allowed) return apiNotFound('Attachment not available')

  // `url` is a legacy public path like /uploads/todos/<name>. Only the basename
  // is used, so a doctored value cannot walk out of the upload directory.
  const base = path.basename(attachment.url)
  if (!base || base.includes('..')) return apiNotFound('Attachment not available')

  let bytes: Buffer
  try {
    bytes = await readFile(path.join(process.cwd(), 'public', 'uploads', 'todos', base))
  } catch {
    return apiNotFound('Attachment not available')
  }

  // Serve the validated type when we recognise it; otherwise force a download
  // rather than letting the browser sniff a legacy file into something active.
  const known = ALLOWED_TYPES.find((t) => t.mime === attachment.mimeType)
  const contentType = known ? known.mime : 'application/octet-stream'
  const disposition = known ? dispositionFor(known) : 'attachment'
  const safeName = attachment.filename.replace(/["\\\r\n]/g, '_')

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `${disposition}; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
})

export const DELETE = withAuth<Params>(async (_req, { session, params }) => {
  const { attachmentId } = await resolveParams(params)
  if (!attachmentId) return apiBadRequest('Invalid attachment id')

  const attachment = await prisma.todoAttachment.findUnique({ where: { id: attachmentId } })
  if (!attachment) return apiNotFound('Attachment not found')
  if (attachment.uploadedById !== session.user.id && session.user.role !== 'ADMIN')
    return apiForbidden('Not your attachment')

  // Delete file from disk
  try {
    const filePath = path.join(process.cwd(), 'public', attachment.url)
    await unlink(filePath)
  } catch {
    // File may already be gone — proceed with DB deletion
  }

  await prisma.todoAttachment.delete({ where: { id: attachmentId } })
  return apiSuccess(null)
})
