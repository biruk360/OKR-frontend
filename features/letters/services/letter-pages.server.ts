// Server-only: imports Prisma. Do not re-export from the features/letters
// barrel, which client components import. (The `server-only` package is not
// installed; this comment is the marker.)
/**
 * Data loader for the letter detail page (/dashboard/letters/[id]). Moved
 * verbatim from the page (CLAUDE.md: routes are thin composition) — the same
 * read scope and the same query. Returns `null` when the viewer is out of
 * scope or the letter is missing; the page turns that into notFound().
 */

import { prisma } from '@/lib/prisma'
import { checkLetterReadAccess } from '@/lib/letter-access'
import { canAdministerLetters } from '@/lib/letter-permissions'
import type { LetterDetail } from '../types'

// ─── /dashboard/letters/[id] ───

export async function loadLetterDetail(
  viewerId: string,
  id: string,
): Promise<{ letter: LetterDetail; canAdminister: boolean } | null> {
  // Same read scope as GET /api/letters/[id]; out-of-scope reads as not found.
  const access = await checkLetterReadAccess(viewerId, id)
  if (access !== 'ok') return null

  const [letter, canAdminister] = await Promise.all([
    prisma.letter.findUnique({
      where: { id },
      include: {
        preparedBy: { select: { id: true, name: true, avatar: true, email: true } },
        signatory: { select: { id: true, name: true, avatar: true, email: true } },
        enclosures: {
          orderBy: { createdAt: 'desc' },
          include: { uploadedBy: { select: { id: true, name: true, avatar: true } } },
        },
      },
    }),
    canAdministerLetters(viewerId),
  ])
  if (!letter) return null

  return { letter: letter as unknown as LetterDetail, canAdminister }
}
