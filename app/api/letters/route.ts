import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreateLetterForm, LetterStatus, LetterType } from '@/types'
import { canCreateLetter } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
import { allocateLetterReference, LETTER_TEMPLATES } from '@/lib/letters'
import {
  apiSuccess,
  apiPaginated,
  apiBadRequest,
  apiForbidden,
  withAuth,
} from '@/lib/api'

const LETTER_TYPES: LetterType[] = ['COVER', 'OFFER', 'GUARANTEE']
const LETTER_STATUSES: LetterStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'ARCHIVED']

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const letterType = searchParams.get('letterType')
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
  if (letterType && LETTER_TYPES.includes(letterType as LetterType)) {
    where.letterType = letterType
  }
  if (search) {
    where.OR = [
      { referenceNumber: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
      { customerName: { contains: search, mode: 'insensitive' } },
    ]
  }

  const skip = (page - 1) * limit
  const [letters, total] = await Promise.all([
    prisma.letter.findMany({
      where,
      orderBy: { date: 'desc' },
      skip,
      take: limit,
      include: {
        preparedBy: { select: { id: true, name: true, avatar: true } },
        signatory: { select: { id: true, name: true, avatar: true } },
        _count: { select: { enclosures: true } },
      },
    }),
    prisma.letter.count({ where }),
  ])

  return apiPaginated(letters, { page, limit, total })
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  if (!canCreateLetter(session.user.role)) {
    return apiForbidden('You are not permitted to create letters')
  }

  const body = (await request.json()) as CreateLetterForm
  const subject = (body.subject || '').trim()
  if (subject.length < 3 || subject.length > 255) {
    return apiBadRequest('Subject must be 3–255 characters')
  }
  if (!body.letterType || !LETTER_TYPES.includes(body.letterType)) {
    return apiBadRequest('Invalid letterType')
  }
  // Customer is optional — letters can be drafted with no customer pinned yet
  // (e.g. an internal cover letter or a draft awaiting recipient details).
  const customerName = (body.customerName || '').trim()

  const date = body.date ? new Date(body.date) : new Date()
  if (Number.isNaN(date.getTime())) return apiBadRequest('Invalid date')

  const referenceNumber = await allocateLetterReference(body.letterType, date)

  const letter = await prisma.letter.create({
    data: {
      referenceNumber,
      subject,
      letterType: body.letterType,
      status: 'DRAFT',
      date,
      customerName,
      odooPartnerId: body.odooPartnerId ?? null,
      recipientAddress: body.recipientAddress ?? null,
      salutation: body.salutation ?? null,
      closing: body.closing ?? null,
      senderDepartment: body.senderDepartment ?? null,
      signatoryId: body.signatoryId ?? null,
      bodyContent: body.bodyContent ?? LETTER_TEMPLATES[body.letterType],
      preparedById: session.user.id,
    },
    include: {
      preparedBy: { select: { id: true, name: true, avatar: true } },
      signatory: { select: { id: true, name: true, avatar: true } },
    },
  })

  await recordActivity({
    entityType: 'LETTER',
    letterId: letter.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { referenceNumber: letter.referenceNumber, letterType: letter.letterType },
  })

  return apiSuccess(letter, { status: 201 })
})

