import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  EditObjectiveButton,
  CloneObjectiveButton,
  ObjectiveActionsMenu,
} from '@/features/objectives'
import OkrBreadcrumb from '@/components/shared/OkrBreadcrumb'
import type { BreadcrumbNode } from '@/components/shared/OkrBreadcrumb'
import WorkItemsKanban from '@/components/shared/WorkItemsKanban'
import { PageTitleSetter } from '@/components/layout/DashboardTitleContext'
import { computeExpectedProgress, countUnassignedKRs } from '@/lib/okr/compute'
import { daysUntilDeadline, daysSince, weekLabel } from '@/lib/okr/dates'

import CriticalBanner from '@/components/objective-detail/CriticalBanner'
import ObjectiveHero from '@/components/objective-detail/ObjectiveHero'
import KRList from '@/components/objective-detail/KRList'
import AlignmentCard from '@/components/objective-detail/AlignmentCard'
import ObjectiveDetailsCard from '@/components/objective-detail/ObjectiveDetailsCard'
import ObjectiveProgressTimeline from '../ObjectiveProgressTimeline'
import ActivityTabs from '@/components/objective-detail/ActivityTabs'

interface Props {
  params: { id: string } | Promise<{ id: string }>
}

export default async function ObjectiveDetailV2({ params }: Props) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  const objective = await prisma.objective.findUnique({
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
    },
  })

  if (!objective) notFound()

  // Breadcrumb ancestors
  const ancestors: Array<{ id: string; title: string }> = []
  {
    let cursorId: string | null = objective.parentObjectiveId
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

  // Kanban initiatives
  const krIds = objective.keyResults.map(k => k.id)
  const kanbanInitiatives = await prisma.todo.findMany({
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

  const breadcrumbNodes: BreadcrumbNode[] = [
    ...ancestors.map(a => ({
      id: a.id, title: a.title, kind: 'OBJ' as const,
      href: `/dashboard/objectives/${a.id}/v2`,
    })),
    {
      id: objective.id, title: objective.title, kind: 'OBJ' as const,
      progress: objective.progress, status: objective.goalStatus,
      ownerName: objective.owner.name ?? undefined,
    },
  ]

  const showCriticalBanner =
    (expectedProgress - objective.progress > 20) ||
    unassignedKrCount > 0 ||
    lastUpdatedDays > 14

  return (
    <>
      <PageTitleSetter title={objective.title} />
      <div className="space-y-4">
        {/* Top bar: back + actions */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/objectives"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4 mr-1" /> Back to Objectives
          </Link>
          <div className="flex items-center gap-2">
            {objective.status !== 'ARCHIVED' && (
              <>
                <CloneObjectiveButton objective={objective} timeframes={timeframes} className="px-3 py-2" />
                <EditObjectiveButton objective={objective} className="px-3 py-2" />
              </>
            )}
            <ObjectiveActionsMenu objective={objective} />
          </div>
        </div>

        {/* Critical banner — full width */}
        {showCriticalBanner && (
          <CriticalBanner
            progress={objective.progress}
            expectedProgress={expectedProgress}
            unassignedCount={unassignedKrCount}
            lastUpdatedDays={lastUpdatedDays}
          />
        )}

        {/* Breadcrumb — full width */}
        <OkrBreadcrumb nodes={breadcrumbNodes} />

        {/* ═══ MAIN 2-COLUMN GRID: content left, sidebar right ═══ */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">

          {/* ─── LEFT COLUMN ─── */}
          <div className="min-w-0 space-y-4">
            {/* Hero card */}
            <ObjectiveHero
              objective={objective}
              expectedProgress={expectedProgress}
              daysLeft={daysLeft}
              activeKrCount={activeKrs.length}
              unassignedKrCount={unassignedKrCount}
              weekLabel={wkLabel}
            />

            {/* Key Results */}
            <KRList keyResults={objective.keyResults} objectiveId={objective.id} />

            {/* Work items kanban */}
            <WorkItemsKanban
              keyResults={objective.keyResults.map(kr => ({
                id: kr.id, title: kr.title, progress: kr.progress,
                confidence: kr.confidence, status: kr.status,
              }))}
              initiatives={kanbanInitiatives.map(i => ({
                id: i.id, title: i.title,
                status: i.status as any,
                keyResultId: i.keyResultId,
              }))}
            />

            {/* Activity / Comments tabs */}
            <ActivityTabs
              objectiveId={objective.id}
              activityElementId={`obj-activity-${objective.id}`}
              users={users}
            />
          </div>

          {/* ─── RIGHT SIDEBAR ─── */}
          <div className="space-y-4">
            {/* Progress Timeline (reuses existing chart) */}
            <section className="rounded-xl border border-border bg-card">
              <header className="px-4 py-3 border-b border-border">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Progress Timeline</h3>
                <p className="text-[11px] text-muted-foreground">Expected vs actual</p>
              </header>
              <div className="p-3">
                <ObjectiveProgressTimeline
                  snapshots={snapshots}
                  currentProgress={objective.progress}
                  timeframeStart={objective.timeframe.startDate}
                  timeframeEnd={objective.timeframe.endDate}
                />
              </div>
            </section>

            {/* Objective Details (owner, contributors, timeframe, dept) */}
            <ObjectiveDetailsCard
              owner={objective.owner}
              contributors={contributorUsers}
              timeframe={objective.timeframe}
              department={objective.department}
              collaborators={collaborators}
              unassignedKrCount={unassignedKrCount}
            />

            {/* Alignment (parent + children) */}
            <AlignmentCard
              parentObjective={objective.parentObjective}
              childObjectives={objective.childObjectives.map(c => ({
                id: c.id, title: c.title, level: c.level,
                goalStatus: c.goalStatus, progress: c.progress,
              }))}
            />
          </div>
        </div>
      </div>
    </>
  )
}
