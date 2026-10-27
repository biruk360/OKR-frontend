import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { resolveParams } from '@/lib/resolve-route-params'
import { KeyResultDetailClient } from '@/features/key-results'
import { loadKeyResultDetail } from '@/features/key-results/services/key-result-detail.server'
import { ScrumActivityPanel } from '@/features/scrum'
import RolledFromBanner from '@/components/shared/RolledFromBanner'
import OkrLockBanner from '@/components/shared/OkrLockBanner'
import KrContributionSections from '@/components/key-result-detail/KrContributionSections'
import { isCompanyLevel } from '@/components/key-result-detail/kr-connections'
import { AlignmentTrail } from '@/features/okr-links'

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

  // Visibility gates (objective + KR, not-found / redacted), permission flags,
  // sibling nav, breadcrumb and every read live in the loader.
  const {
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
  } = await loadKeyResultDetail(session.user, id)

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-6xl space-y-3 px-4 pt-4">
        {/* CON-5: Company O1 › KR1.3 › … › this KR (renders nothing when nothing is above it). */}
        {!isRedacted && <AlignmentTrail entityType="KEY_RESULT" entityId={keyResult.id} variant="bar" />}
      </div>
      <KeyResultDetailClient
        keyResult={krForClient}
        objective={{
          id: objFull.id,
          title: objectiveTitle,
          level: objFull.level,
          timeframe: objFull.timeframe,
          department: objFull.department,
          owner: objFull.owner,
        }}
        checkIns={checkInsForClient}
        siblingNav={siblingNav}
        canEdit={canEdit}
        canDelete={canDelete}
        canClone={canClone}
        users={users}
        isRedacted={isRedacted}
        todoCount={keyResult._count.todos}
        breadcrumbNodes={breadcrumbNodes}
        initiatives={krInitiatives}
        currentUserId={session.user.id}
        railStatus={
          // Lineage + closed/locked status sit in the right rail (they stack below
          // the main column on narrow screens) instead of pushing the page down.
          <>
            {!isRedacted && (
              <RolledFromBanner
                variant="rail"
                entityType="key-result"
                entityId={keyResult.id}
                previous={keyResult.rolledFrom ? { ...keyResult.rolledFrom, timeframe: keyResult.rolledFrom.objective.timeframe } : null}
                next={keyResult.rolledTo[0] ? { ...keyResult.rolledTo[0], timeframe: keyResult.rolledTo[0].objective.timeframe } : null}
                lineageDepth={keyResult.lineageDepth}
              />
            )}
            {keyResult.isLocked && (
              <OkrLockBanner variant="rail" entityType="Key Result" reopenCount={keyResult.reopenCount} closedAt={keyResult.closedAt} />
            )}
          </>
        }
      />
      {!isRedacted && (
        <div className="mx-auto max-w-6xl space-y-4 px-4 pb-6">
          {/* CON-7 "Lands in" (company KRs) + CON-3 linked project milestones. */}
          <KrContributionSections keyResultId={keyResult.id} isCompany={isCompanyLevel(objFull.level)} />
          <ScrumActivityPanel keyResultId={keyResult.id} />
        </div>
      )}
    </div>
  )
}
