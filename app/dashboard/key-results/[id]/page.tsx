import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { resolveParams } from '@/lib/resolve-route-params'
import { KeyResultDetailClient } from '@/features/key-results'
import { loadKeyResultDetail } from '@/features/key-results/services/key-result-detail.server'
import { ScrumActivityPanel } from '@/features/scrum'
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
      <div className="mx-auto max-w-6xl px-4 pt-4">
        {!isRedacted && (
          <RolledFromBanner
            entityType="key-result"
            previous={keyResult.rolledFrom ? { ...keyResult.rolledFrom, timeframe: keyResult.rolledFrom.objective.timeframe } : null}
            next={keyResult.rolledTo[0] ? { ...keyResult.rolledTo[0], timeframe: keyResult.rolledTo[0].objective.timeframe } : null}
            lineageDepth={keyResult.lineageDepth}
          />
        )}
        {keyResult.isLocked && <div className="mt-4"><OkrLockBanner entityType="Key Result" reopenCount={keyResult.reopenCount} closedAt={keyResult.closedAt} /></div>}
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
      />
      {!isRedacted && (
        <div className="mx-auto max-w-6xl px-4 pb-6">
          <ScrumActivityPanel keyResultId={keyResult.id} />
        </div>
      )}
    </div>
  )
}
