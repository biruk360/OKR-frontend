import { prisma } from '@/lib/prisma'
import { SUBMITTED_SCRUM_UPDATE_WHERE } from '@/features/scrum/services/drafts'
import { apiSuccess, withAuth } from '@/lib/api'

// Wins are deliberately visible across all teams (spec S6 — "wins are not
// private"). The feed therefore projects ONLY win fields: never the rest of the
// update (plan, blockers, remarks, comments, mood, proxy details), which stay
// behind the scoped /api/scrum/updates and /api/scrum/calendar reads.
export const GET = withAuth(async (_request, { session }) => {
  const wins = await prisma.scrumUpdate.findMany({
    where: { hasWin: true, ...SUBMITTED_SCRUM_UPDATE_WHERE },
    select: {
      id: true,
      userId: true,
      scrumDate: true,
      wins: true,
      hasWin: true,
      celebrations: { select: { id: true, userId: true, createdAt: true } },
      links: { where: { context: 'WIN' }, select: { id: true, objectiveId: true, keyResultId: true, linkType: true, context: true } },
    },
    orderBy: { scrumDate: 'desc' },
    take: 100,
  })
  // Author name/avatar only — wins are org-wide, the rest of the profile is not needed.
  const authorIds = [...new Set(wins.map((win) => win.userId))]
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, avatar: true } })
    : []
  const byId = new Map(authors.map((a) => [a.id, a]))
  return apiSuccess(wins.map((win) => ({
    ...win,
    author: byId.get(win.userId) ?? null,
    celebratedByMe: win.celebrations.some((c) => c.userId === session.user.id),
  })))
})
