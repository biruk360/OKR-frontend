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
import WorkItemsKanban from '@/components/shared/WorkItemsKanban'
import { PageTitleSetter } from '@/components/layout/DashboardTitleContext'
import { computeExpectedProgress, countUnassignedKRs } from '@/lib/okr/compute'
import { daysUntilDeadline, daysSince, weekLabel } from '@/lib/okr/dates'

import CriticalBanner from '@/components/objective-detail/CriticalBanner'
import ObjectiveHero from '@/components/objective-detail/ObjectiveHero'
import KRList from '@/components/objective-detail/KRList'
import ProgressConfidenceCard from '@/components/objective-detail/ProgressConfidenceCard'
import PerKrProgressCard from '@/components/objective-detail/PerKrProgressCard'
import ActivityTabs from '@/components/objective-detail/ActivityTabs'
import { ScrumActivityPanel } from '@/features/scrum'
import { ObjectiveDeliveryPanel } from '@/features/projects'
import RolledFromBanner from '@/components/shared/RolledFromBanner'
import OkrLockBanner from '@/components/shared/OkrLockBanner'

interface ObjectiveDetailPageProps {
  params: { id: string } | Promise<{ id: string }>
}

export default async function ObjectiveDetailPage({ params }: ObjectiveDetailPageProps) {
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
      rolledFrom: {
        select: { id: true, title: true, finalGrade: true, finalProgress: true, finalConfidence: true, closureNote: true, timeframe: true, retrospective: true },
      },
      rolledTo: {
        select: { id: true, title: true, timeframe: true },
        take: 1,
      },
    },
  })

  if (!objective) notFound()

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
                {!objective.isLocked && <EditObjectiveButton objective={objective} className="px-3 py-2" />}
              </>
            )}
            <ObjectiveActionsMenu objective={objective} />
          </div>
        </div>

        <RolledFromBanner entityType="objective" previous={objective.rolledFrom} next={objective.rolledTo[0]} lineageDepth={objective.lineageDepth} />
        {objective.isLocked && <OkrLockBanner entityType="Objective" reopenCount={objective.reopenCount} closedAt={objective.closedAt} />}

        {/* ═══ MAIN 2-COLUMN GRID ═══ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">

          {/* ─── LEFT COLUMN ─── */}
          <div className="min-w-0 space-y-4">
            {showCriticalBanner && (
              <CriticalBanner
                progress={objective.progress}
                expectedProgress={expectedProgress}
                unassignedCount={unassignedKrCount}
                lastUpdatedDays={lastUpdatedDays}
              />
            )}

            <ObjectiveHero
              objective={objective as any}
              expectedProgress={expectedProgress}
              daysLeft={daysLeft}
              activeKrCount={activeKrs.length}
              unassignedKrCount={unassignedKrCount}
              weekLabel={wkLabel}
              ownerSummary={ownerSummary}
            />

            <KRList keyResults={objective.keyResults} objectiveId={objective.id} />

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
          </div>

          {/* ─── RIGHT SIDEBAR ─── */}
          <div className="space-y-3">
            <ProgressConfidenceCard
              snapshots={snapshots.map(s => ({ periodStart: s.periodStart, score: s.score }))}
              currentProgress={objective.progress}
              expectedProgress={expectedProgress}
              timeframeStart={objective.timeframe.startDate}
              timeframeEnd={objective.timeframe.endDate}
            />

            <PerKrProgressCard
              keyResults={objective.keyResults.map(k => ({
                id: k.id, title: k.title, progress: k.progress,
                confidence: k.confidence, status: k.status,
              }))}
            />

            <ScrumActivityPanel objectiveId={objective.id} compact />

            <ObjectiveDeliveryPanel objectiveId={objective.id} />

            <ActivityTabs
              objectiveId={objective.id}
              activityElementId={`obj-activity-${objective.id}`}
              users={users}
              details={{
                owner: objective.owner,
                timeframe: objective.timeframe,
                department: objective.department,
                parentObjective: objective.parentObjective ?? null,
                childObjectives: objective.childObjectives.map(c => ({ id: c.id, title: c.title })),
                collaborators: [
                  { id: objective.owner.id, name: objective.owner.name, avatar: objective.owner.avatar, email: objective.owner.email },
                  ...collaborators,
                ],
                measurementCount: objective.keyResults.length,
              }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
