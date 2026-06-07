import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreateLetterForm, LetterStatus } from '@/types'
import { checkLetterPermissionV2 } from '@/lib/letter-permissions'
import { recordActivity } from '@/lib/activity-log'
import { allocateLetterReference, LETTER_TEMPLATES } from '@/lib/letters'
import {
  apiSuccess,
  apiPaginated,
  apiBadRequest,
  apiForbidden,
  withAuth,
} from '@/lib/api'
import { buildScopeFilter } from '@/lib/apply-scope'

const LETTER_STATUSES: LetterStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'ARCHIVED']

// Legacy enum codes the original migration shipped with; kept for back-compat
// when a request still sends one of these via `letterType` (string).
const LEGACY_TYPE_CODES: Record<string, string> = {
  COVER: 'CL',
  OFFER: 'OF',
  GUARANTEE: 'GR',
}

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const letterTypeId = searchParams.get('letterTypeId')
  const legacyLetterType = searchParams.get('letterType')
  const search = searchParams.get('search')
  const mine = searchParams.get('mine') === 'true'
  const includeArchived = searchParams.get('includeArchived') === 'true'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))

  const where: any = {}
  if (mine) where.preparedById = session.user.id
  if (status && LETTER_STATUSES.includes(status as LetterStatus)) {
    where.status = status
  } else if (!includeArchived && !status) {
    where.status = { not: 'ARCHIVED' }
  }
  if (letterTypeId) where.letterTypeId = letterTypeId
  else if (legacyLetterType) where.letterType = legacyLetterType
  if (search) {
    where.OR = [
      { referenceNumber: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
      { customerName: { contains: search, mode: 'insensitive' } },
    ]
  }

  const scopeFilter = await buildScopeFilter(session.user.id, 'letter')

  const skip = (page - 1) * limit
  const [letters, total] = await Promise.all([
    prisma.letter.findMany({
      where: { ...where, ...(scopeFilter ?? {}) },
      orderBy: { date: 'desc' },
      skip,
      take: limit,
      include: {
        preparedBy: { select: { id: true, name: true, avatar: true } },
        signatory: { select: { id: true, name: true, avatar: true } },
        letterTypeDef: { select: { id: true, code: true, name: true } },
        _count: { select: { enclosures: true } },
      },
    }),
    prisma.letter.count({ where: { ...where, ...(scopeFilter ?? {}) } }),
  ])

  return apiPaginated(letters, { page, limit, total })
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  if (!(await checkLetterPermissionV2(session.user.id, 'letter.create'))) {
    return apiForbidden('You are not permitted to create letters')
  }

  const body = (await request.json()) as CreateLetterForm & { letterTypeId?: string }
  const subject = (body.subject || '').trim()
  if (subject.length < 3 || subject.length > 255) {
    return apiBadRequest('Subject must be 3–255 characters')
  }

  // Resolve the letter type. Two paths for compatibility:
  //   1. Modern: letterTypeId — look up the LetterTypeDef row directly.
  //   2. Legacy: letterType in {COVER, OFFER, GUARANTEE} — find by code.
  let typeDef: { id: string; code: string; name: string } | null = null
  if (body.letterTypeId) {
    const row = await prisma.letterTypeDef.findUnique({
      where: { id: body.letterTypeId },
      select: { id: true, code: true, name: true },
    })
    if (!row) return apiBadRequest('Unknown letter type')
    typeDef = row
  } else if (body.letterType && body.letterType in LEGACY_TYPE_CODES) {
    const code = LEGACY_TYPE_CODES[body.letterType]
    const row = await prisma.letterTypeDef.findUnique({
      where: { code },
      select: { id: true, code: true, name: true },
    })
    typeDef = row
  }
  if (!typeDef) return apiBadRequest('Letter type is required')

  const customerName = (body.customerName || '').trim()
  const date = body.date ? new Date(body.date) : new Date()
  if (Number.isNaN(date.getTime())) return apiBadRequest('Invalid date')

  const referenceNumber = await allocateLetterReference(typeDef.code, date)

  const letter = await prisma.letter.create({
    data: {
      referenceNumber,
      subject,
      // Keep the legacy column populated with one of the built-in literals
      // so older callers (or PDF renderer fallback paths) still resolve a
      // human label. For custom types we use the code itself.
      letterType: body.letterType && body.letterType in LEGACY_TYPE_CODES
        ? body.letterType
        : typeDef.code,
      letterTypeId: typeDef.id,
      status: 'DRAFT',
      date,
      customerName,
      odooPartnerId: body.odooPartnerId ?? null,
      // recipientAddress / salutation / closing / senderDepartment are no
      // longer collected via the UI; columns retained for any existing
      // letters and for future extension. Pass-through if the client sends
      // them but otherwise leave null.
      recipientAddress: body.recipientAddress ?? null,
      salutation: body.salutation ?? null,
      closing: body.closing ?? null,
      senderDepartment: body.senderDepartment ?? null,
      signatoryId: body.signatoryId ?? null,
      bodyContent:
        body.bodyContent ??
        (body.letterType && body.letterType in LETTER_TEMPLATES
          ? LETTER_TEMPLATES[body.letterType as keyof typeof LETTER_TEMPLATES]
          : `<p>Write the body of this ${typeDef.name.toLowerCase()} here.</p>`),
      preparedById: session.user.id,
    },
    include: {
      preparedBy: { select: { id: true, name: true, avatar: true } },
      signatory: { select: { id: true, name: true, avatar: true } },
      letterTypeDef: { select: { id: true, code: true, name: true } },
    },
  })

  await recordActivity({
    entityType: 'LETTER',
    letterId: letter.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { referenceNumber: letter.referenceNumber, letterType: typeDef.code },
  })

  return apiSuccess(letter, { status: 201 })
})
