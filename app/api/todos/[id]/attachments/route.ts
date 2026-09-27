import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { emit, resolveTodoStakeholders } from '@/lib/notifications'
import { todoWriteGuard } from '@/lib/todos/access'
import { validateUpload } from '@/lib/attachments/file-types'
import { persistTodoFile, deleteTodoFile, todoAttachmentApiUrl } from '@/lib/attachments/todo-storage'

/**
 * POST — upload a card attachment. A card write: `todoWriteGuard` (404 when the
 * caller cannot read the card, 403 without `canWriteTodo`, 409 SPRINT_CLOSED
 * once the card's sprint is closed — CDM-11 / STA-7). It previously only
 * checked the card existed, so anyone signed in could attach to any card by id.
 *
 * The file must pass `validateUpload` — extension, declared MIME and magic
 * bytes all agree on an allowlisted type, ≤ 20 MB; .html/.svg/.xml/.js and
 * every other script-bearing or unknown type is refused with 400 before
 * anything touches disk (UPL-2, UPL-3, UPL-AC-1). The bytes go to the private
 * TODO_UPLOAD_ROOT under the row id — never under public/, which Next serves
 * statically with no session check — and `url` is the authenticated route
 * that streams them back (UPL-4, UPL-7).
 */
export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')

  // Uploading is a card write: 404 / 403 canWriteTodo / 409 SPRINT_CLOSED.
  const denied = await todoWriteGuard(todoId, session.user, 'You do not have access to this card')
  if (denied) return denied

  const todo = await prisma.todo.findUnique({ where: { id: todoId }, select: { id: true, title: true } })
  if (!todo) return apiNotFound('To-do not found')

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return apiBadRequest('No file provided')

  const buffer = Buffer.from(await file.arrayBuffer())
  const verdict = validateUpload({
    filename: file.name,
    declaredMime: file.type,
    size: buffer.byteLength,
    head: new Uint8Array(buffer.subarray(0, 64)),
  })
  if (!verdict.ok) return apiBadRequest(verdict.message)

  // The row and the file land together: the file is named by the row id and
  // written inside the transaction, so a failed write leaves no row, and a
  // failure after the write removes the file.
  const written: { row?: { id: string; todoId: string; url: string } } = {}
  const attachment = await prisma.$transaction(async (tx) => {
    const created = await tx.todoAttachment.create({
      data: {
        todoId,
        uploadedById: session.user.id,
        filename: file.name.slice(0, 255),
        url: '',
        // The canonical allowlisted type, never the uploader's claim.
        mimeType: verdict.type.mime,
        size: buffer.byteLength,
      },
      select: { id: true },
    })
    const url = todoAttachmentApiUrl(todoId, created.id)
    written.row = { id: created.id, todoId, url }   // before the write, so a partial file is cleaned too
    await persistTodoFile(created.id, buffer)
    return tx.todoAttachment.update({
      where: { id: created.id },
      data: { url },
      include: { uploadedBy: { select: { id: true, name: true } } },
    })
  }).catch(async (err) => {
    // Rolled back: never leave bytes on disk with no row pointing at them.
    if (written.row) await deleteTodoFile(written.row)
    throw err
  })

  await recordActivity({
    entityType: 'TODO', todoId, action: 'INITIATIVE_ATTACHMENT_ADDED',
    actorId: session.user.id,
    metadata: { attachmentId: attachment.id, filename: attachment.filename },
  })

  // Notify everyone who has interacted with this todo (assignee, members,
  // commenters) that an attachment was added.
  const stakeholders = (await resolveTodoStakeholders(todoId)).filter((id) => id !== session.user.id)
  if (stakeholders.length > 0) {
    await emit('COMMENT_ON_OWNED_ENTITY', {
      actorId: session.user.id,
      entityType: 'TODO', entityId: todoId, entityTitle: todo.title,
      explicitRecipients: stakeholders,
      data: {
        actorName: session.user.name,
        summary: `Attached "${file.name}"`,
        deepLink: `/dashboard/todos?open=${todoId}`,
      },
    })
  }

  return apiSuccess(attachment, { status: 201 })
})
