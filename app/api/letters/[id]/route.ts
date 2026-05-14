import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UpdateLetterForm } from '@/types'
import { canAdminLetter, canEditLetter } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

const EDITABLE_FIELDS = [
  'subject',
  'date',
  'customerName',
  'odooPartnerId',
  'recipientAddress',
  'salutation',
  'closing',
  'senderDepartment',
  'signatoryId',
  'signatoryTitle',
  'bodyContent',
] as const

export const GET = withAuth<RouteIdParams>(async (_req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const letter = await prisma.letter.findUnique({
    where: { id },
    include: {
      preparedBy: { select: { id: true, name: true, avatar: true, email: true } },
      signatory: { select: { id: true, name: true, avatar: true, email: true } },
      enclosures: {
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { id: true, name: true, avatar: true } } },
      },
    },
  })
  if (!letter) return apiNotFound('Letter not found')

  return apiSuccess(letter)
})

export const PATCH = withAuth<RouteIdParams>(async (req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const letter = await prisma.letter.findUnique({ where: { id } })
  if (!letter) return apiNotFound('Letter not found')

  if (!canEditLetter(session.user.role, session.user.id, letter)) {
    return apiForbidden('You cannot edit this letter in its current state')
  }

  const body = (await req.json()) as UpdateLetterForm & Record<string, unknown>
  const data: Record<string, unknown> = {}
  for (const key of EDITABLE_FIELDS) {
    if (key in body) data[key] = (body as any)[key]
  }
  if ('subject' in data) {
    const s = String(data.subject || '').trim()
    if (s.length < 3 || s.length > 255) return apiBadRequest('Subject must be 3–255 characters')
    data.subject = s
  }
  if ('date' in data && data.date) {
    const d = new Date(data.date as string)
    if (Number.isNaN(d.getTime())) return apiBadRequest('Invalid date')
    data.date = d
  }

  // Letter type is locked after submission (spec FR-4); we don't include it in
  // EDITABLE_FIELDS so it's already excluded. Customer & body are locked once
  // status leaves DRAFT (FR-3, FR-5) — admins can still edit via canEditLetter.
  const stateLocksContent = letter.status !== 'DRAFT' && !canAdminLetter(session.user.role)
  if (stateLocksContent) {
    for (const locked of ['customerName', 'odooPartnerId', 'bodyContent', 'recipientAddress']) {
      delete (data as any)[locked]
    }
  }

  const updated = await prisma.letter.update({
    where: { id },
    data,
    include: {
      preparedBy: { select: { id: true, name: true, avatar: true } },
      signatory: { select: { id: true, name: true, avatar: true } },
    },
  })

  await recordActivity({
    entityType: 'LETTER',
    letterId: id,
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: { fields: Object.keys(data) },
  })

  return apiSuccess(updated)
})

export const DELETE = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const letter = await prisma.letter.findUnique({ where: { id } })
  if (!letter) return apiNotFound('Letter not found')

  // Hard-delete only allowed for admins on DRAFT letters.
  if (!canAdminLetter(session.user.role) && !(letter.preparedById === session.user.id && letter.status === 'DRAFT')) {
    return apiForbidden('Cannot delete this letter')
  }

  await prisma.letter.delete({ where: { id } })
  return apiSuccess({ id })
})
