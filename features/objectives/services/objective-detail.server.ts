// Server-only: imports Prisma. Do not re-export from the features/objectives
// barrel, which client components import. (The `server-only` package is not
// installed; this comment is the marker.)
/**
 * Loader for /dashboard/objectives/[id]. Moved verbatim from the page
 * (CLAUDE.md: routes are thin composition). Same gate as the Key Result page
 * and GET /api/objectives/[id]: a missing / DELETED / unviewable objective
 * renders not-found (no existence probe); a private objective viewed from
 * outside its owner/manager chain renders redacted, with every KR, initiative
 * title and write action withheld.
 */

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import {
  canViewObjective,
  canViewKeyResult,
  canEditObjective,
  canCreateKeyResultForObjective,
  canDeleteObjective,
  canCloneObjective,
  redactObjective,
  redactKeyResult,
  type UserRole,
} from '@/lib/permissions'
import { computeExpectedProgress, countUnassignedKRs } from '@/lib/okr/compute'
import { daysUntilDeadline, daysSince, weekLabel } from '@/lib/okr/dates'
import {
  NO_OBJECTIVE_PERMISSIONS,
  type ObjectivePermissionFlags,
} from './objective-permission-flags'

export async function loadObjectiveDetail(viewer: { id: string; role: string }, id: string) {
  const found = await prisma.objective.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, avatar: true, email: true } },
      timeframe: true,
      department: { select: { id: true, name: true } },
      parentObjective: {
        select: { id: true, title: true, level: true, goalStatus: true, progress: true },
      },
      contributors: {
        include: { user: { select: { id: true, name: true, avatar: true, email: true } } },
      },
      childObjectives: {
        where: { status: 'ACTIVE' },
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
          department: { select: { id: true, name: true } },
          _count: { select: { keyResults: true } },
        },
        orderBy: { updatedAt: 'desc' },
      },
      keyResults: {
        include: { owner: { select: { id: true, name: true, avatar: true } } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      },
      _count: { select: { keyResults: true, childObjectives: true } },
      rolledFrom: {
        select: { id: true, title: true, finalGrade: true, finalProgress: true, finalConfidence: true, closureNote: true, timeframe: true, retrospective: true },
      },
      rolledTo: {
        select: { id: true, title: true, timeframe: true },
        take: 1,
      },
    },
  })

  if (!found || found.status === 'DELETED') notFound()

  // Same gate as the Key Result page and GET /api/objectives/[id]: not viewable
  // renders not-found (no existence probe); a private objective viewed from
  // outside its owner/manager chain renders redacted.
  const role = viewer.role as UserRole
  const visibility = await canViewObjective(role, viewer.id, {
    level: found.level,
    ownerId: found.ownerId,
    departmentId: found.departmentId,
    isPrivate: found.isPrivate,
  })
  if (!visibility.canView) notFound()
  const isRedacted = visibility.isRedacted

  // Per-KR redaction mirrors GET /api/objectives/[id]: everything is redacted on
  // a redacted objective; otherwise only private KRs the viewer may not see in full.
  type KrRow = (typeof found.keyResults)[number]
  const redactedKrIds = new Set<string>()
  const keyResults: KrRow[] = await Promise.all(
    found.keyResults.map(async (kr): Promise<KrRow> => {
      let redact = isRedacted
      if (!redact && kr.isPrivate) {
        const krVisibility = await canViewKeyResult(role, viewer.id, {
          ownerId: kr.ownerId,
          objectiveId: kr.objectiveId,
          isPrivate: kr.isPrivate,
        })
        redact = krVisibility.isRedacted
      }
      if (!redact) return kr
      redactedKrIds.add(kr.id)
      return redactKeyResult(kr) as KrRow
    }),
  )
  const objective = {
    ...(isRedacted ? (redactObjective(found) as typeof found) : found),
    keyResults,
  }

  // Action permissions — same helpers the API routes enforce. A redacted view
  // gets no write actions at all.
  const objectiveCtx = { level: found.level, ownerId: found.ownerId, departmentId: found.departmentId }
  const isPrivileged = role === 'ADMIN' || role === 'EXECUTIVE'
  const [canEdit, canCreateKr] = isRedacted
    ? [false, false]
    : await Promise.all([
        canEditObjective(role, viewer.id, objectiveCtx),
        canCreateKeyResultForObjective(role, viewer.id, { id: found.id, ...objectiveCtx }),
      ])
  const permissions: ObjectivePermissionFlags = isRedacted
    ? NO_OBJECTIVE_PERMISSIONS
    : {
        canEdit,
        canDelete: canDeleteObjective(role, viewer.id, found),
        // The reopen route allows owner/manager (within the window) and ADMIN/EXECUTIVE;
        // canEditObjective covers owner + managing lead, the server checks the window.
        canReopen: isPrivileged || canEdit,
        canClone: canCloneObjective(role),
      }

  // Kanban initiatives
  const krIds = objective.keyResults.map(k => k.id)
  const allKanbanInitiatives = await prisma.todo.findMany({
    where: {
      status: { not: 'CANCELLED' },
      OR: [
        { objectiveId: id },
        krIds.length > 0 ? { keyResultId: { in: krIds } } : { id: '___none___' },
      ],
    },
    select: { id: true, title: true, status: true, keyResultId: true },
    orderBy: { updatedAt: 'desc' },
  })
  // Initiative titles of a redacted objective / KR are private too.
  const kanbanInitiatives = allKanbanInitiatives.filter(i =>
    i.keyResultId ? !redactedKrIds.has(i.keyResultId) : !isRedacted,
  )

  // Snapshots for timeline chart
  const snapshots = await prisma.confidenceSnapshot.findMany({
    where: { entityType: 'OBJECTIVE', entityId: objective.id },
    orderBy: { periodStart: 'asc' },
    select: { periodStart: true, score: true },
  })

  // Contributors (distinct from KR owners)
  const contributorUsers = (objective.contributors ?? [])
    .map((c: any) => c.user)
    .filter((u: any) => u && u.id !== objective.ownerId)

  const collaboratorsMap = new Map<string, { id: string; name: string; avatar: string | null; source: string }>()
  for (const u of contributorUsers) {
    collaboratorsMap.set(u.id, { id: u.id, name: u.name, avatar: u.avatar, source: 'contributor' })
  }
  for (const kr of objective.keyResults) {
    if (kr.owner.id === objective.ownerId) continue
    if (!collaboratorsMap.has(kr.owner.id)) {
      collaboratorsMap.set(kr.owner.id, { ...kr.owner, source: 'kr-owner' })
    }
  }
  const collaborators = Array.from(collaboratorsMap.values())

  const timeframes = await prisma.timeframe.findMany({ orderBy: { startDate: 'desc' } })
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  // Computed values
  const cycleStart = new Date(objective.timeframe.startDate)
  const cycleEnd = new Date(objective.timeframe.endDate)
  const expectedProgress = computeExpectedProgress(cycleStart, cycleEnd)
  const daysLeft = daysUntilDeadline(cycleEnd)
  const lastUpdatedDays = daysSince(objective.updatedAt)
  const activeKrs = objective.keyResults.filter(kr => kr.status === 'ACTIVE')
  const unassignedKrCount = countUnassignedKRs(objective.keyResults)
  const wkLabel = weekLabel(cycleStart, cycleEnd)

  // Owner OKR summary for hover card
  const [ownerObjCount, ownerKrAgg] = await Promise.all([
    prisma.objective.count({ where: { ownerId: objective.ownerId, status: 'ACTIVE' } }),
    prisma.keyResult.aggregate({
      where: { ownerId: objective.ownerId, status: 'ACTIVE' },
      _avg: { progress: true },
      _count: { _all: true },
    }),
  ])
  const ownerSummary = {
    objectiveCount: ownerObjCount,
    krCount: ownerKrAgg._count._all,
    avgProgress: Math.round(ownerKrAgg._avg.progress ?? 0),
  }

  const showCriticalBanner =
    (expectedProgress - objective.progress > 20) ||
    unassignedKrCount > 0 ||
    lastUpdatedDays > 14

  return {
    objective,
    isRedacted,
    permissions,
    canEdit,
    canCreateKr,
    kanbanInitiatives,
    snapshots,
    collaborators,
    timeframes,
    users,
    expectedProgress,
    daysLeft,
    lastUpdatedDays,
    activeKrs,
    unassignedKrCount,
    wkLabel,
    ownerSummary,
    showCriticalBanner,
  }
}
