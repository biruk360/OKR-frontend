import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { canEditLetter } from '@/lib/permissions'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'image/png',
  'image/jpeg',
])
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB per FR-6

// FR-6: Enclosures — register metadata only. Real binary upload is out of scope
// for the vertical slice; the client sends file metadata after uploading the
// binary to its eventual storage location (mocked path for now).
export const POST = withAuth<RouteIdParams>(async (req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const letter = await prisma.letter.findUnique({ where: { id } })
  if (!letter) return apiNotFound('Letter not found')
  if (!canEditLetter(session.user.role, session.user.id, letter)) {
    return apiForbidden('Enclosures can only be added to letters you can edit (DRAFT)')
  }

  const body = (await req.json().catch(() => ({}))) as {
    fileName?: string
    fileSize?: number
    mimeType?: string
    storagePath?: string
  }
  if (!body.fileName || !body.mimeType || !body.fileSize) {
    return apiBadRequest('fileName, mimeType and fileSize are required')
  }
  if (!ALLOWED_MIME.has(body.mimeType)) {
    return apiBadRequest('Unsupported file type. Allowed: PDF, DOCX, XLSX, PNG, JPG')
  }
  if (body.fileSize > MAX_BYTES) {
    return apiBadRequest(`File exceeds 25 MB limit`)
  }

  const enclosure = await prisma.letterEnclosure.create({
    data: {
      letterId: id,
      fileName: body.fileName,
      fileSize: body.fileSize,
      mimeType: body.mimeType,
      // Mocked path — replace with real object-storage URL once that lands.
      storagePath: body.storagePath || `/mock/letters/${id}/${Date.now()}-${body.fileName}`,
      uploadedById: session.user.id,
    },
    include: { uploadedBy: { select: { id: true, name: true, avatar: true } } },
  })
  await recordActivity({
    entityType: 'LETTER',
    letterId: id,
    action: 'LETTER_ENCLOSURE_ADDED',
    actorId: session.user.id,
    metadata: { fileName: enclosure.fileName, fileSize: enclosure.fileSize },
  })
  return apiSuccess(enclosure, { status: 201 })
})
