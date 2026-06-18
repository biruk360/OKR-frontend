import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { checkLetterPermissionV2 } from '@/lib/letter-permissions'
import { recordActivity } from '@/lib/activity-log'
import { ensureLetterDocumentDefaultFont } from '@/lib/letter-docx-font'
import { convertLetterDocxToHtml } from '@/lib/letter-docx-html'
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiSuccess,
  withAuth,
} from '@/lib/api'

// Force Node runtime — we read & write binary blobs (Buffer) and call
// mammoth on PUT for the HTML mirror.
export const runtime = 'nodejs'

// GET /api/letters/[id]/docx — stream the .docx blob for SuperDoc to load.
// Returns an empty-template docx (just a single paragraph) for letters that
// have never been saved through SuperDoc yet.
export const GET = withAuth<RouteIdParams>(async (_req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const letter = await prisma.letter.findUnique({
    where: { id },
    select: { id: true, bodyDocx: true, bodyContent: true, referenceNumber: true },
  })
  if (!letter) return apiNotFound('Letter not found')

  // Pick the freshest source of truth in order:
  //   1. bodyDocx — set after first SuperDoc save; authoritative OOXML
  //   2. bodyContent (HTML template/mirror) — present on freshly created
  //      letters that have never been edited; convert HTML → DOCX on the fly
  //   3. empty single-paragraph docx — fallback
  let buffer: Buffer
  if (letter.bodyDocx) {
    buffer = Buffer.from(letter.bodyDocx)
  } else if (letter.bodyContent && letter.bodyContent.trim()) {
    try {
      // Use the `docx` lib (real OOXML) rather than html-docx-js-typescript
      // (which produces altChunk-wrapped MHTML that mammoth + SuperDoc can't
      // round-trip correctly — symptom: blank body after first save).
      const { htmlToDocxBuffer } = await import('@/lib/html-to-docx')
      buffer = await htmlToDocxBuffer(letter.bodyContent)
    } catch (err) {
      console.warn('[docx-get] html→docx conversion failed, returning empty', err)
      buffer = await (await import('@/lib/empty-docx')).emptyDocxBuffer()
    }
  } else {
    buffer = await (await import('@/lib/empty-docx')).emptyDocxBuffer()
  }

  try {
    buffer = await ensureLetterDocumentDefaultFont(buffer)
  } catch (err) {
    // A malformed styles.xml must not make an otherwise readable letter unavailable.
    console.warn('[docx-get] failed to apply default letter font', err)
  }

  const filename = `${(letter.referenceNumber || letter.id).replace(/[^A-Za-z0-9._-]+/g, '_')}.docx`
  const body = new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  })
})

// PUT /api/letters/[id]/docx — receive the .docx blob from the client after
// a SuperDoc save, persist it, AND re-derive the HTML mirror via mammoth so
// the existing PDF / placeholder pipeline keeps working.
export const PUT = withAuth<RouteIdParams>(async (req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const letter = await prisma.letter.findUnique({ where: { id } })
  if (!letter) return apiNotFound('Letter not found')
  const canAdminDocx = await checkLetterPermissionV2(session.user.id, 'letter.view_all')
  const canWriteDocx = canAdminDocx || (
    await checkLetterPermissionV2(session.user.id, 'letter.write') &&
    letter.status === 'DRAFT' &&
    letter.preparedById === session.user.id
  )
  if (!canWriteDocx) {
    return apiForbidden('Letter is not editable in its current state')
  }

  const arrayBuffer = await req.arrayBuffer()
  let buf: Buffer = Buffer.from(arrayBuffer)
  if (buf.length === 0) return apiBadRequest('Empty body')
  // Sanity check: a real .docx is a ZIP — starts with "PK\x03\x04".
  if (!(buf[0] === 0x50 && buf[1] === 0x4b)) {
    return apiBadRequest('Body is not a valid .docx (not a ZIP)')
  }
  if (buf.length > 25 * 1024 * 1024) {
    return apiBadRequest('Body exceeds 25 MB limit')
  }

  try {
    buf = await ensureLetterDocumentDefaultFont(buf)
  } catch (err) {
    // Preserve the user's valid DOCX even if its styles.xml cannot be normalized.
    console.warn('[docx-save] failed to apply default letter font', err)
  }

  // Derive the HTML mirror. Failures here should not block the save — they
  // just mean the placeholder/PDF pipeline will fall back to whatever HTML
  // was previously stored.
  //
  // Mammoth returns an empty string when it can't read a docx (e.g. an
  // altChunk-wrapped doc). We MUST NOT overwrite the previous bodyContent
  // in that case, or the user's already-rendered content disappears from
  // the PDF preview. This bug shipped once; the guard below prevents it
  // from happening again.
  let bodyContent: string | undefined
  let mammothWarnings: unknown = null
  try {
    const result = await convertLetterDocxToHtml(buf)
    mammothWarnings = result.messages

    const htmlValue = result.html
    if (htmlValue && htmlValue.trim().length > 0) {
      bodyContent = htmlValue
    } else {
      console.warn('[docx-save] mammoth returned empty HTML; keeping previous bodyContent', {
        letterId: id,
        messages: result.messages,
      })
    }
  } catch (err) {
    console.warn('[docx-save] mammoth conversion failed', err)
  }

  const updated = await prisma.letter.update({
    where: { id },
    data: {
      bodyDocx: buf,
      ...(bodyContent !== undefined ? { bodyContent } : {}),
    },
    select: { id: true, updatedAt: true },
  })
  await recordActivity({
    entityType: 'LETTER',
    letterId: id,
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: {
      fields: bodyContent !== undefined ? ['bodyDocx', 'bodyContent'] : ['bodyDocx'],
      size: buf.length,
      mammothWarnings: mammothWarnings ?? undefined,
    },
  })

  return apiSuccess({ id: updated.id, updatedAt: updated.updatedAt, htmlMirrored: bodyContent !== undefined })
})
