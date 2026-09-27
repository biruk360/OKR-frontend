import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { canAdministerLetters, checkLetterPermissionV2 } from '@/lib/letter-permissions'
import { letterReadGuard } from '@/lib/letter-access'
import { attachmentResponseHeaders, serveTypeFor } from '@/lib/attachments/serve'
import { deleteEnclosureFile, readEnclosureFile } from '@/lib/letter-enclosure-storage'
import { enclosureHasFile } from '@/lib/letter-enclosures'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

type Params = { id: string; enclosureId: string }

/**
 * GET — stream an enclosure. The letter read scope (letterReadGuard) runs on
 * every request; out-of-scope letters answer 404. Metadata-only rows (from
 * before binary upload) have no file and also answer 404. Bytes are
 * re-verified against the allowlist before a type is chosen, and served with
 * nosniff, private caching, a sandboxed CSP and `attachment` disposition for
 * anything that is not an image or PDF (lib/attachments/serve.ts).
 */
export const GET = withAuth<Params>(async (_req, { session, params }) => {
  const { id, enclosureId } = await resolveParams(params)
  if (!id || !enclosureId) return apiBadRequest('Invalid ids')

  const denied = await letterReadGuard(session.user.id, id)
  if (denied) return denied

  const enclosure = await prisma.letterEnclosure.findUnique({
    where: { id: enclosureId },
    select: { id: true, letterId: true, fileName: true, mimeType: true, storagePath: true },
  })
  if (!enclosure || enclosure.letterId !== id) return apiNotFound('Enclosure not found')

  const bytes = await readEnclosureFile(enclosure.storagePath)
  if (!bytes) return apiNotFound('This enclosure has no stored file')

  const type = serveTypeFor({
    filename: enclosure.fileName,
    mimeType: enclosure.mimeType,
    bytes: new Uint8Array(bytes),
  })
  return new NextResponse(new Uint8Array(bytes), {
    headers: attachmentResponseHeaders({ type, filename: enclosure.fileName, size: bytes.byteLength }),
  })
})

export const DELETE = withAuth<Params>(async (_req, { session, params }) => {
  const resolved = await resolveParams(params)
  if (!resolved.id || !resolved.enclosureId) return apiBadRequest('Invalid ids')

  const denied = await letterReadGuard(session.user.id, resolved.id)
  if (denied) return denied

  const enclosure = await prisma.letterEnclosure.findUnique({
    where: { id: resolved.enclosureId },
    include: { letter: true },
  })
  if (!enclosure || enclosure.letterId !== resolved.id) return apiNotFound('Enclosure not found')

  // FR-6: delete only in DRAFT, only by the uploader (with letter.write on a
  // letter they prepared) or a letter admin.
  const isUploader = enclosure.uploadedById === session.user.id
  const canAdminEnc = await canAdministerLetters(session.user.id)
  const canWriteEnc = canAdminEnc || (
    await checkLetterPermissionV2(session.user.id, 'letter.write') &&
    enclosure.letter.status === 'DRAFT' &&
    enclosure.letter.preparedById === session.user.id
  )
  if (!canWriteEnc || (!isUploader && !canAdminEnc)) {
    return apiForbidden('You cannot delete this enclosure')
  }

  // Row first, then bytes: a stray file is harmless, a row whose file is gone
  // is a broken download.
  await prisma.letterEnclosure.delete({ where: { id: resolved.enclosureId } })
  await deleteEnclosureFile(enclosure.storagePath)
  await recordActivity({
    entityType: 'LETTER',
    letterId: enclosure.letterId,
    action: 'LETTER_ENCLOSURE_REMOVED',
    actorId: session.user.id,
    metadata: { enclosureId: enclosure.id, fileName: enclosure.fileName, hadFile: enclosureHasFile(enclosure.storagePath) },
  })
  return apiSuccess({ id: resolved.enclosureId })
})
