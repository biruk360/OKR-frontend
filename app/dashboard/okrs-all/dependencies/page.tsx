import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getServerSessionSafe } from '@/lib/auth'
import { resolveFeaturePermission } from '@/lib/permission-resolver'
import { PageHeader } from '@/components/ui/PageHeader'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import DependencyMapClient from './DependencyMapClient'
import { DependencyMapSkeleton } from './DependencyMapSkeleton'

/**
 * Company Dependency Map (DEP-6 + CON-4 company graph).
 *
 *   ?timeframeId= &status= &type= &providerId= &neederId= &due= &linkedType=&linkedId= &q= &scope= &mine=
 *   ?view=table|graph   ?dependency=<id> (or ?focus=<id>) opens one dependency
 *
 * Every employee may open it (§8: titles + status for rows they are not part
 * of); record-level detail is decided by GET /api/dependencies.
 */
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dependency Map' }

export default async function DependencyMapPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') {
    const allowed = await Promise.all([
      resolveFeaturePermission(session.user.id, PACKAGE_FEATURE_KEYS.module).catch(() => false),
      resolveFeaturePermission(session.user.id, PACKAGE_FEATURE_KEYS.pageDependencyMap).catch(() => false),
    ])
    if (!allowed.every(Boolean)) redirect('/dashboard')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        className="mb-0"
        breadcrumb={
          <Link
            href="/dashboard/okrs-all"
            className="inline-flex items-center gap-1 text-caption text-[var(--ap-fg-subtle)] hover:underline ap-focus-ring"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            OKR Explorer
          </Link>
        }
        title="Dependency Map"
        description="Who needs what from whom, by when, and what it unblocks. Late items are flagged; export the filtered list to CSV or switch to the graph."
      />
      {/* DependencyMapClient reads its filters from useSearchParams. */}
      <Suspense fallback={<DependencyMapSkeleton bare />}>
        <DependencyMapClient />
      </Suspense>
    </div>
  )
}
