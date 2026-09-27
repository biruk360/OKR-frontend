import { getServerSessionSafe } from '@/lib/auth'
import { resolveParams } from '@/lib/resolve-route-params'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  EditObjectiveButton,
  CloneObjectiveButton,
  ObjectiveActionsMenu,
} from '@/features/objectives'
import { loadObjectiveDetail } from '@/features/objectives/services/objective-detail.server'
import WorkItemsKanban from '@/components/shared/WorkItemsKanban'
import OkrComments from '@/components/shared/OkrComments'
import { PageTitleSetter } from '@/components/layout/DashboardTitleContext'

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
import ObjectiveRealtimeRefresher from './ObjectiveRealtimeRefresher'

interface ObjectiveDetailPageProps {
  params: { id: string } | Promise<{ id: string }>
}

export default async function ObjectiveDetailPage({ params }: ObjectiveDetailPageProps) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  // Visibility gate (not-found / redacted), per-KR redaction, action
  // permissions and every read live in the loader.
  const {
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
  } = await loadObjectiveDetail(session.user, id)

  return (
    <>
      <PageTitleSetter title={objective.title} />
      {!isRedacted && <ObjectiveRealtimeRefresher objectiveId={objective.id} currentUserId={session.user.id} />}
      <div className="space-y-4">
        {/* Top bar: back + actions */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/okrs-all"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4 mr-1" /> Back to Objectives
          </Link>
          <div className="flex items-center gap-2">
            {!isRedacted && objective.status !== 'ARCHIVED' && (
              <>
                <CloneObjectiveButton
                  objective={objective}
                  timeframes={timeframes}
                  canClone={permissions.canClone}
                  className="px-3 py-2"
                />
                {!objective.isLocked && (
                  <EditObjectiveButton objective={objective} canEdit={permissions.canEdit} className="px-3 py-2" />
                )}
              </>
            )}
            {!isRedacted && (
              <ObjectiveActionsMenu
                objective={objective}
                permissions={permissions}
                redirectAfterDelete="/dashboard/okrs-all"
                auditLogElementId={`obj-activity-${objective.id}`}
              />
            )}
          </div>
        </div>

        {!isRedacted && (
          <RolledFromBanner entityType="objective" previous={objective.rolledFrom} next={objective.rolledTo[0]} lineageDepth={objective.lineageDepth} />
        )}
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

            <KRList
              keyResults={objective.keyResults}
              objectiveId={objective.id}
              canCreate={canCreateKr && objective.status === 'ACTIVE' && !objective.isLocked}
              users={users}
              currentUserId={session.user.id}
            />

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

            {!isRedacted && (
              <OkrComments
                endpoint="objectives"
                entityId={objective.id}
                users={users}
                currentUserId={session.user.id}
              />
            )}
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

            {!isRedacted && (
              <>
                <ScrumActivityPanel objectiveId={objective.id} compact />

                <ObjectiveDeliveryPanel objectiveId={objective.id} />

                <ActivityTabs
                  objectiveId={objective.id}
                  canReportRisk={canEdit}
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
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
