import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { canAdministerLetters, checkLetterPermissionV2 } from '@/lib/letter-permissions'
import { letterReadGuard } from '@/lib/letter-access'
import { validateUpload, MAX_FILE_BYTES } from '@/lib/attachments/file-types'
import { LETTER_ENCLOSURE_MIME } from '@/lib/letter-enclosures'
import { deleteEnclosureFile, persistEnclosureFile } from '@/lib/letter-enclosure-storage'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

const LETTER_MIME = new Set<string>(LETTER_ENCLOSURE_MIME)

/** Display name only — never used as a path. Strips directories and control chars. */
function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || 'enclosure'
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255) || 'enclosure'
}

/**
 * FR-6: attach an enclosure (multipart/form-data, field `file`).
 *
 * The bytes pass the platform upload allowlist (extension + declared MIME +
 * magic bytes, executable types refused, size cap) and then the FR-6 letter
 * list (PDF, DOCX, XLSX, PNG, JPG). They are written to the private letters
 * root under a server-generated name; the row records the canonical type,
 * never the uploader's claim. The old JSON "register metadata" body is no
 * longer accepted — it let the client pick `storagePath`.
 */
export const POST = withAuth<RouteIdParams>(async (req: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const denied = await letterReadGuard(session.user.id, id)
  if (denied) return denied

  const letter = await prisma.letter.findUnique({ where: { id } })
  if (!letter) return apiNotFound('Letter not found')
  const canAdminEnc = await canAdministerLetters(session.user.id)
  const canWriteEnc = canAdminEnc || (
    await checkLetterPermissionV2(session.user.id, 'letter.write') &&
    letter.status === 'DRAFT' &&
    letter.preparedById === session.user.id
  )
  if (!canWriteEnc) {
    return apiForbidden('Enclosures can only be added to letters you can edit (DRAFT)')
  }

  if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data')) {
    return apiBadRequest('Upload the file as multipart/form-data (field "file")')
  }
  const formData = await req.formData().catch(() => null)
  const file = formData?.get('file')
  if (!(file instanceof File)) return apiBadRequest('No file provided')
  if (file.size > MAX_FILE_BYTES) {
    return apiBadRequest(`File exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB limit`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileName = cleanFileName(file.name)
  const verdict = validateUpload({
    filename: fileName,
    declaredMime: file.type,
    size: buffer.byteLength,
    head: new Uint8Array(buffer.subarray(0, 64)),
  })
  if (!verdict.ok) return apiBadRequest(verdict.message)
  if (!LETTER_MIME.has(verdict.type.mime)) {
    return apiBadRequest('Unsupported file type. Allowed: PDF, DOCX, XLSX, PNG, JPG')
  }

  // Bytes first, then the row; a failed insert removes the file again.
  const storagePath = await persistEnclosureFile(verdict.extension, buffer)
  let enclosure
  try {
    enclosure = await prisma.letterEnclosure.create({
      data: {
        letterId: id,
        fileName,
        fileSize: buffer.byteLength,
        mimeType: verdict.type.mime,
        storagePath,
        uploadedById: session.user.id,
      },
      include: { uploadedBy: { select: { id: true, name: true, avatar: true } } },
    })
  } catch (err) {
    await deleteEnclosureFile(storagePath)
    throw err
  }

  await recordActivity({
    entityType: 'LETTER',
    letterId: id,
    action: 'LETTER_ENCLOSURE_ADDED',
    actorId: session.user.id,
    metadata: {
      enclosureId: enclosure.id,
      fileName: enclosure.fileName,
      fileSize: enclosure.fileSize,
      mimeType: enclosure.mimeType,
    },
  })
  return apiSuccess(enclosure, { status: 201 })
})
