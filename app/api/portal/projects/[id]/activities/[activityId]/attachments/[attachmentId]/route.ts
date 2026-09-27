import { readFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiNotFound } from '@/lib/api'
import { withPortalProject } from '@/lib/api/withPortalAuth'
import { resolveProjectAttachmentPath } from '@/lib/attachments/project-storage'
import { attachmentResponseHeaders, serveTypeFor } from '@/lib/attachments/serve'
import {
  loadPortalForbiddenNames,
  portalActivityAttachmentWhere,
  portalProjectActivityWhere,
  serializeAttachmentForClient,
} from '@/features/projects/services/portal-serializer'

type Params = { id: string; activityId: string; attachmentId: string }

/**
 * GET — stream one client-visible attachment to a portal session.
 *
 * The row is found only when it is CLIENT_VISIBLE (`portalActivityAttachmentWhere`,
 * in SQL — invariant 5) and its activity belongs to a portal-enabled, unarchived
 * project in this session's scope; an INTERNAL or foreign id gets the same 404 as
 * a missing one. Bytes are served exactly like the internal reader
 * (app/api/projects/[id]/activities/[activityId]/attachments/[attachmentId]):
 * contained path resolution, bytes re-verified against the allowlist, sandboxed
 * CSP, nosniff, private caching. The download name is the scrubbed one (invariant 4).
 */
export const GET = withPortalProject<Params>(async (_req, { session, params }) => {
  const attachment = await prisma.activityAttachment.findFirst({
    where: {
      id: params.attachmentId,
      ...portalActivityAttachmentWhere(params.activityId),
      activity: portalProjectActivityWhere(params.id, session.user.projectIds),
    },
  })
  if (!attachment) return apiNotFound('Attachment not available')

  const location = resolveProjectAttachmentPath({ ...attachment, projectId: params.id })
  if (!location) return apiNotFound('Attachment not available')

  let bytes: Buffer
  try {
    bytes = await readFile(location.path)
  } catch {
    return apiNotFound('Attachment not available')
  }

  const forbiddenEmployeeNames = await loadPortalForbiddenNames(prisma)
  const dto = serializeAttachmentForClient(attachment, { forbiddenEmployeeNames })
  const type = serveTypeFor({ filename: attachment.fileName, mimeType: attachment.mimeType, bytes: new Uint8Array(bytes) })
  return new NextResponse(new Uint8Array(bytes), {
    headers: attachmentResponseHeaders({ type, filename: dto.fileName, size: bytes.byteLength }),
  })
})
