import { readFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound, withAuth } from '@/lib/api'
import type { UserRole } from '@/types'
import { canAccessAttachmentScope } from '@/lib/attachments/access'
import { todoWriteGuard } from '@/lib/todos/access'
import { resolveTodoAttachmentPath, deleteTodoFile } from '@/lib/attachments/todo-storage'
import { attachmentResponseHeaders, serveTypeFor } from '@/lib/attachments/serve'

type Params = { id: string; attachmentId: string }

/**
 * GET — stream a card attachment.
 *
 * This route is the only way to read one. New uploads live in the private
 * TODO_UPLOAD_ROOT; rows from before that still point at
 * `public/uploads/todos/` until scripts/migrate-todo-attachments-private.ts
 * moves them, and middleware 404s that static path meanwhile. Either way the
 * card access check runs on every request, the path is resolved by
 * `resolveTodoAttachmentPath` (one segment, contained in its root), and the
 * bytes are re-verified against the allowlist before we choose a type — a
 * legacy row recorded whatever MIME the uploader claimed.
 *
 * Headers (lib/attachments/serve.ts): canonical Content-Type, nosniff,
 * private caching, sandboxed CSP, and `attachment` disposition for anything
 * that is not an image or PDF.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md ATT-4, UPL-7, UPL-AC-4;
 *       docs/attachment_viewer_REQUIREMENTS.md NRG-1.
 */
export const GET = withAuth<Params>(async (_req, { session, params }) => {
  const { id: todoId, attachmentId } = await resolveParams(params)
  if (!todoId || !attachmentId) return apiBadRequest('Invalid id')

  const attachment = await prisma.todoAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, todoId: true, url: true, filename: true, mimeType: true },
  })
  // Same answer for missing and forbidden, so ids cannot be probed.
  if (!attachment || attachment.todoId !== todoId) return apiNotFound('Attachment not available')

  // Card read rule (canAccessAttachmentScope('TODO', …, 'read') = canReadTodo).
  const allowed = await canAccessAttachmentScope('TODO', todoId, {
    id: session.user.id,
    role: session.user.role as UserRole,
    userType: session.user.userType,
  }, 'read')
  if (!allowed) return apiNotFound('Attachment not available')

  const location = resolveTodoAttachmentPath(attachment)
  if (!location) return apiNotFound('Attachment not available')

  let bytes: Buffer
  try {
    bytes = await readFile(location.path)
  } catch {
    return apiNotFound('Attachment not available')
  }

  const type = serveTypeFor({
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    bytes: new Uint8Array(bytes),
  })
  return new NextResponse(new Uint8Array(bytes), {
    headers: attachmentResponseHeaders({ type, filename: attachment.filename, size: bytes.byteLength }),
  })
})

export const DELETE = withAuth<Params>(async (_req, { session, params }) => {
  const { id: todoId, attachmentId } = await resolveParams(params)
  if (!attachmentId) return apiBadRequest('Invalid attachment id')

  const attachment = await prisma.todoAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, todoId: true, url: true, uploadedById: true },
  })
  // The attachment must belong to the card in the URL.
  if (!attachment || attachment.todoId !== todoId) return apiNotFound('Attachment not found')
  // Deleting is a card write: 404 without read, 403 without canWriteTodo, 409
  // SPRINT_CLOSED on a closed sprint — then the uploader/ADMIN rule below.
  const denied = await todoWriteGuard(todoId, session.user, 'You do not have access to this card')
  if (denied) return denied
  if (attachment.uploadedById !== session.user.id && session.user.role !== 'ADMIN')
    return apiForbidden('Not your attachment')

  // Row first, then bytes: a stray file is harmless, a row whose file is gone
  // is a broken thumbnail. The bytes are removed from wherever this row keeps
  // them (private root or the legacy public dir) via the same contained
  // resolver as GET — `url` is never joined onto a path directly.
  await prisma.todoAttachment.delete({ where: { id: attachmentId } })
  await deleteTodoFile(attachment)
  return apiSuccess(null)
})
