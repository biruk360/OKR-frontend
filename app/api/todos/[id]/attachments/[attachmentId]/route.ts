import { unlink } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound, withAuth } from '@/lib/api'

type Params = { id: string; attachmentId: string }

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
