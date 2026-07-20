import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import {
  canViewObjective,
  canViewKeyResult,
  canEditKeyResultWithObjectiveContext,
} from '@/lib/permissions'
import { KeyResultDetailClient } from '@/features/key-results'
import { ScrumActivityPanel } from '@/features/scrum'
import type { BreadcrumbNode } from '@/components/shared/OkrBreadcrumb'
import RolledFromBanner from '@/components/shared/RolledFromBanner'
import OkrLockBanner from '@/components/shared/OkrLockBanner'

interface PageProps {
  params: { id: string } | Promise<{ id: string }>
}

export default async function KeyResultDetailPage({ params }: PageProps) {
  const session = await getServerSessionSafe()
  if (!session?.user) {
    redirect('/auth/signin')
  }

  const { id } = await resolveParams(params)
  if (!id) {
    notFound()
  }

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
    session.user.role as any,
    session.user.id,
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
    session.user.role as any,
    session.user.id,
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
    rolledTo: keyResult.rolledTo,
    owner: krOwnerFull ?? keyResult.owner,
  }

  const canEdit = await canEditKeyResultWithObjectiveContext(
    session.user.role as any,
    session.user.id,
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
  const krInitiatives = await prisma.todo.findMany({
    where: { keyResultId: keyResult.id, status: { not: 'CANCELLED' } },
    select: { id: true, title: true, status: true, keyResultId: true },
    orderBy: { updatedAt: 'desc' },
  })

  // Build breadcrumb: objective ancestors → objective → KR
  const ancestors: Array<{ id: string; title: string }> = []
  {
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
      title: objFull.title,
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

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-6xl px-4 pt-4">
        <RolledFromBanner
          entityType="key-result"
          previous={keyResult.rolledFrom ? { ...keyResult.rolledFrom, timeframe: keyResult.rolledFrom.objective.timeframe } : null}
          next={keyResult.rolledTo[0] ? { ...keyResult.rolledTo[0], timeframe: keyResult.rolledTo[0].objective.timeframe } : null}
          lineageDepth={keyResult.lineageDepth}
        />
        {keyResult.isLocked && <div className="mt-4"><OkrLockBanner entityType="Key Result" reopenCount={keyResult.reopenCount} closedAt={keyResult.closedAt} /></div>}
      </div>
      <KeyResultDetailClient
        keyResult={krForClient}
        objective={{
          id: objFull.id,
          title: objFull.title,
          level: objFull.level,
          timeframe: objFull.timeframe,
          department: objFull.department,
          owner: objFull.owner,
        }}
        checkIns={checkInsForClient}
        siblingNav={siblingNav}
        canEdit={canEdit}
        users={users}
        isRedacted={isRedacted}
        todoCount={keyResult._count.todos}
        breadcrumbNodes={breadcrumbNodes}
        initiatives={krInitiatives}
      />
      {!isRedacted && (
        <div className="mx-auto max-w-6xl px-4 pb-6">
          <ScrumActivityPanel keyResultId={keyResult.id} />
        </div>
      )}
    </div>
  )
}
