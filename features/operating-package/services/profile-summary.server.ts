/**
 * Overview "Package summary" card data (profile composition contract, PRF-2).
 * Server-only; import by direct path from `app/` / the profile loader.
 */
import { prisma } from '@/lib/prisma'
import { canViewPackageArea, loadPackageViewer } from '@/lib/package/access'
import type { PackageProfileSummary } from '../types'
import { computePackageSummary } from './packages.server'
import { normalizePackageStatus } from './rules'

/**
 * `{ status, version, reviewed, total, disputesOpen }` for the person's
 * package in the timeframe, or null when the viewer may not see it (§8
 * `package` area). A person without a package still gets a summary with
 * `status: null` and the item count (PKG-5).
 */
export async function getPackageProfileSummary(
  viewerId: string,
  userId: string,
  timeframeId: string,
): Promise<PackageProfileSummary | null> {
  if (!viewerId || !userId || !timeframeId) return null
  const viewer = await loadPackageViewer(viewerId)
  if (!(await canViewPackageArea(viewer, userId, 'package'))) return null

  const pkg = await prisma.operatingPackage.findUnique({
    where: { userId_timeframeId: { userId, timeframeId } },
    select: { id: true, userId: true, timeframeId: true, status: true, version: true },
  })
  const summary = await computePackageSummary(pkg, userId, timeframeId)
  return {
    packageId: pkg?.id ?? null,
    status: pkg ? normalizePackageStatus(pkg.status) : null,
    version: pkg?.version ?? null,
    reviewed: summary.reviewed,
    total: summary.total,
    disputesOpen: summary.disputesOpen,
  }
}
