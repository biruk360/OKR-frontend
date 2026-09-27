// Server-only: imports Prisma. Do not re-export from the features/key-results
// barrel, which client components import. (The `server-only` package is not
// installed; this comment is the marker.)
/**
 * Loader for /dashboard/key-results/[id]. Moved verbatim from the page
 * (CLAUDE.md: routes are thin composition). A missing / DELETED key result, or
 * one whose objective or itself the viewer cannot see, renders not-found; a
 * redacted view withholds title, values, check-ins, initiatives and the
 * parent objective's title, and gets no delete/clone.
 */

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import {
  canViewObjective,
  canViewKeyResult,
  canEditKeyResultWithObjectiveContext,
  canDeleteKeyResult,
  canCloneKeyResult,
} from '@/lib/permissions'
import type { BreadcrumbNode } from '@/components/shared/OkrBreadcrumb'

export async function loadKeyResultDetail(viewer: { id: string; role: string }, id: string) {
  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    include: {
      owner: {
        select: { id: true, name: true, avatar: true },
      },
      objective: {
        select: {
          id: true,
          title: true,
          level: true,
          ownerId: true,
          departmentId: true,
          isPrivate: true,
          parentObjectiveId: true,
          owner: { select: { id: true, name: true, avatar: true } },
          timeframe: true,
          department: { select: { id: true, name: true } },
        },
      },
      checkIns: {
        orderBy: { asOfDate: 'asc' },
        include: {
          createdBy: { select: { id: true, name: true, avatar: true } },
        },
      },
      _count: {
        select: { todos: true },
      },
      rolledFrom: {
        select: {
          id: true, title: true, finalGrade: true, finalProgress: true, finalConfidence: true,
          closureNote: true, unit: true,
          objective: { select: { timeframe: true } },
          retrospective: true,
          checkIns: { orderBy: { asOfDate: 'asc' }, include: { createdBy: { select: { id: true, name: true, avatar: true } } } },
        },
      },
      rolledTo: { select: { id: true, title: true, objective: { select: { timeframe: true } } }, take: 1 },
    },
  })

  if (!keyResult || keyResult.status === 'DELETED') {
    notFound()
  }

  const objective = keyResult.objective

  const objectiveVisibility = await canViewObjective(
    viewer.role as any,
    viewer.id,
    {
      level: objective.level,
      ownerId: objective.ownerId,
      departmentId: objective.departmentId,
      isPrivate: objective.isPrivate,
    }
  )

  if (!objectiveVisibility.canView) {
    notFound()
  }

  const krVisibility = await canViewKeyResult(
    viewer.role as any,
    viewer.id,
    {
      ownerId: keyResult.ownerId,
      objectiveId: keyResult.objectiveId,
      isPrivate: keyResult.isPrivate,
    }
  )

  if (!krVisibility.canView) {
    notFound()
  }

  const isRedacted = krVisibility.isRedacted || objectiveVisibility.isRedacted
  // The parent objective's own title is private when the viewer's objective
  // view is redacted — even if this KR itself is visible in full.
  const objectiveTitle = objectiveVisibility.isRedacted ? '[Private Objective]' : objective.title
  const checkInsForClient = isRedacted ? [] : keyResult.checkIns

  // Hydrate the owner's email for the sidebar; the KR include has only a narrow selection.
  const krOwnerFull = await prisma.user.findUnique({
    where: { id: keyResult.ownerId },
    select: { id: true, name: true, avatar: true, email: true },
  })

  const krForClient = {
    id: keyResult.id,
    title: isRedacted ? '[Private Key Result]' : keyResult.title,
    description: isRedacted ? null : keyResult.description,
    startValue: isRedacted ? 0 : keyResult.startValue,
    targetValue: isRedacted ? 0 : keyResult.targetValue,
    currentValue: isRedacted ? 0 : keyResult.currentValue,
    unit: isRedacted ? '' : keyResult.unit,
    confidence: keyResult.confidence,
    progress: keyResult.progress,
    status: keyResult.status,
    ownerId: keyResult.ownerId,
    objectiveId: keyResult.objectiveId,
    isPrivate: keyResult.isPrivate,
    createdAt: keyResult.createdAt,
    updatedAt: keyResult.updatedAt,
    archivedAt: keyResult.archivedAt,
    closureStatus: keyResult.closureStatus,
    isLocked: keyResult.isLocked,
    outcome: keyResult.outcome,
    finalGrade: keyResult.finalGrade,
    finalValue: keyResult.finalValue,
    finalProgress: keyResult.finalProgress,
    reopenCount: keyResult.reopenCount,
    rolledTo: isRedacted ? [] : keyResult.rolledTo,
    owner: krOwnerFull ?? keyResult.owner,
  }

  const canEdit = await canEditKeyResultWithObjectiveContext(
    viewer.role as any,
    viewer.id,
    {
      ownerId: keyResult.ownerId,
      objectiveId: keyResult.objectiveId,
    },
    {
      level: objective.level,
      ownerId: objective.ownerId,
      departmentId: objective.departmentId,
    }
  )

  const role = viewer.role as any
  const canDelete = !isRedacted && canDeleteKeyResult(role, viewer.id, objective.ownerId)
  const canClone = !isRedacted && canCloneKeyResult(role, viewer.id, objective.ownerId)

  const siblings = await prisma.keyResult.findMany({
    where: {
      objectiveId: keyResult.objectiveId,
      status: { not: 'DELETED' },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: { id: true },
  })

  const idx = siblings.findIndex((s) => s.id === keyResult.id)
  const siblingNav = {
    index: idx >= 0 ? idx : 0,
    total: siblings.length,
    prevId: idx > 0 ? siblings[idx - 1].id : null,
    nextId: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null,
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  const objFull = objective

  // Initiatives for this KR's kanban view.
  // Initiative titles of a redacted KR are private too — don't ship them.
  const krInitiatives = isRedacted
    ? []
    : await prisma.todo.findMany({
        where: { keyResultId: keyResult.id, status: { not: 'CANCELLED' } },
        select: { id: true, title: true, status: true, keyResultId: true },
        orderBy: { updatedAt: 'desc' },
      })

  // Build breadcrumb: objective ancestors → objective → KR
  const ancestors: Array<{ id: string; title: string }> = []
  if (!objectiveVisibility.isRedacted) {
    let cursorId: string | null = objFull.parentObjectiveId
    const seen = new Set<string>()
    while (cursorId && !seen.has(cursorId)) {
      seen.add(cursorId)
      const parent = await prisma.objective.findUnique({
        where: { id: cursorId },
        select: { id: true, title: true, parentObjectiveId: true },
      })
      if (!parent) break
      ancestors.unshift({ id: parent.id, title: parent.title })
      cursorId = parent.parentObjectiveId
    }
  }
  const breadcrumbNodes: BreadcrumbNode[] = [
    ...ancestors.map((a) => ({
      id: a.id,
      title: a.title,
      kind: 'OBJ' as const,
      href: `/dashboard/objectives/${a.id}`,
    })),
    {
      id: objFull.id,
      title: objectiveTitle,
      kind: 'OBJ',
      href: `/dashboard/objectives/${objFull.id}`,
    },
    {
      id: keyResult.id,
      title: krForClient.title,
      kind: 'KR',
      progress: keyResult.progress,
      status: keyResult.confidence,
      ownerName: keyResult.owner.name ?? undefined,
    },
  ]

  return {
    keyResult,
    objective: objFull,
    objectiveTitle,
    isRedacted,
    krForClient,
    checkInsForClient,
    siblingNav,
    canEdit,
    canDelete,
    canClone,
    users,
    krInitiatives,
    breadcrumbNodes,
  }
}
