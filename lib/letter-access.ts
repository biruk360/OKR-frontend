/**
 * Server-only letter read scope — shared by the list route and every
 * single-letter read route (GET detail, /html, /pdf, /docx, /activity,
 * duplicate). Kept apart from lib/letter-permissions.ts because that file is
 * also imported by a client component (the permissions settings UI).
 */
import type { NextResponse } from 'next/server'
import { prisma } from './prisma'
import { buildScopeFilter } from './apply-scope'
import { checkLetterPermissionV2 } from './letter-permissions'
import { apiForbidden, apiNotFound } from './api/apiResponse'

/**
 * Prisma `where` fragment for the letters `userId` may read, or `null` when
 * they lack `letter.read` entirely. Applies RecordScopeRules for the `letter`
 * doctype; the preparer and the assigned signatory always see their letter.
 */
export async function buildLetterReadWhere(userId: string): Promise<Record<string, unknown> | null> {
  if (!(await checkLetterPermissionV2(userId, 'letter.read'))) return null
  const scope = await buildScopeFilter(userId, 'letter', 'read')
  if (!scope) return {}
  return { OR: [scope, { preparedById: userId }, { signatoryId: userId }] }
}

export type LetterReadAccess = 'ok' | 'forbidden' | 'not_found'

/** Out-of-scope letters report `not_found`, so ids can't be probed. */
export async function checkLetterReadAccess(userId: string, letterId: string): Promise<LetterReadAccess> {
  const where = await buildLetterReadWhere(userId)
  if (!where) return 'forbidden'
  const row = await prisma.letter.findFirst({
    where: { AND: [{ id: letterId }, where] },
    select: { id: true },
  })
  return row ? 'ok' : 'not_found'
}

/** Route guard: `null` when the letter is readable, else the error response to return. */
export async function letterReadGuard(userId: string, letterId: string): Promise<NextResponse | null> {
  const access = await checkLetterReadAccess(userId, letterId)
  if (access === 'forbidden') return apiForbidden('You are not permitted to view letters')
  if (access === 'not_found') return apiNotFound('Letter not found')
  return null
}
