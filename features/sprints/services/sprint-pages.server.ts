// Server-only: imports Prisma. Do not re-export from the features/sprints
// barrel, which client components import. (The `server-only` package is not
// installed; this comment is the marker.)
/**
 * Data loaders for the sprint pages under app/dashboard/sprints/[id]/**.
 * Moved verbatim from the pages (CLAUDE.md: routes are thin composition) —
 * the same queries and the same invite-only view gate (CPM-9, canViewSprint).
 *
 * Unlike most loaders these call notFound() themselves: a missing sprint or a
 * viewer who may not see it renders the not-found page, exactly as before.
 * lib/security/card-access-invariants.test.ts asserts on this file.
 */

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { canViewSprint, canEditSprint, canDeleteSprint, type UserRole } from '@/lib/permissions'

interface SprintViewer {
  id: string
  role: string
}

// ─── /dashboard/sprints/[id] ───

/** Gate for the sprint board page; throws notFound() when missing or denied. */
export async function assertSprintBoardAccess(viewer: SprintViewer, id: string): Promise<void> {
  const sprint = await prisma.sprint.findUnique({
    where: { id },
    select: { id: true, ownerId: true, departmentId: true, participants: { select: { userId: true } } },
  })
  if (!sprint) notFound()

  // CPM-9 — a user who may not view the sprint gets the not-found page, the
  // same pattern the key-result and objective detail pages use.
  const allowed = await canViewSprint(viewer.role as UserRole, viewer.id, {
    ownerId: sprint.ownerId,
    departmentId: sprint.departmentId,
    participants: sprint.participants,
  })
  if (!allowed) notFound()
}

// ─── /dashboard/sprints/[id]/report ───

/** Gate + edit/delete rights for the sprint report page; throws notFound() when missing or denied. */
export async function loadSprintReportAccess(
  viewer: SprintViewer,
  id: string,
): Promise<{ canEdit: boolean; canDelete: boolean }> {
  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: { participants: { select: { userId: true } } },
  })
  if (!sprint) notFound()

  const role = viewer.role as UserRole
  const ctx = {
    ownerId: sprint.ownerId,
    departmentId: sprint.departmentId,
    participants: sprint.participants,
  }
  // CPM-9 — same gate as the board page: a user who may not view the sprint
  // gets the not-found page rather than a shell whose API calls all 403.
  const allowed = await canViewSprint(role, viewer.id, ctx)
  if (!allowed) notFound()

  const canEdit = await canEditSprint(role, viewer.id, ctx)
  const canDelete = (await canDeleteSprint(role, viewer.id, ctx)) || sprint.ownerId === viewer.id

  return { canEdit, canDelete }
}
