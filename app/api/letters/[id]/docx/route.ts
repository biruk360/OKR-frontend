import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { canEditLetter } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
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
      const { asBlob } = await import('html-docx-js-typescript')
      const out = await asBlob(letter.bodyContent)
      const raw = out instanceof Blob ? await out.arrayBuffer() : out
      buffer = Buffer.from(new Uint8Array(raw as ArrayBuffer))
    } catch (err) {
      console.warn('[docx-get] html→docx conversion failed, returning empty', err)
      buffer = await (await import('@/lib/empty-docx')).emptyDocxBuffer()
    }
  } else {
    buffer = await (await import('@/lib/empty-docx')).emptyDocxBuffer()
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
  if (!canEditLetter(session.user.role, session.user.id, letter)) {
    return apiForbidden('Letter is not editable in its current state')
  }

  const arrayBuffer = await req.arrayBuffer()
  const buf = Buffer.from(arrayBuffer)
  if (buf.length === 0) return apiBadRequest('Empty body')
  // Sanity check: a real .docx is a ZIP — starts with "PK\x03\x04".
  if (!(buf[0] === 0x50 && buf[1] === 0x4b)) {
    return apiBadRequest('Body is not a valid .docx (not a ZIP)')
  }
  if (buf.length > 25 * 1024 * 1024) {
    return apiBadRequest('Body exceeds 25 MB limit')
  }

  // Derive the HTML mirror. Failures here should not block the save — they
  // just mean the placeholder/PDF pipeline will fall back to whatever HTML
  // was previously stored.
  let bodyContent: string | undefined
  try {
    const mammoth = await import('mammoth')
    const { value } = await mammoth.convertToHtml({ buffer: buf })
    bodyContent = value
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
    metadata: { fields: ['bodyDocx', 'bodyContent'], size: buf.length },
  })

  return apiSuccess({ id: updated.id, updatedAt: updated.updatedAt, htmlMirrored: bodyContent !== undefined })
})
