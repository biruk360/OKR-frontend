/**
 * PKG-3 helper: "was this edit made after the package was approved?"
 *
 * Item edits stay allowed after APPROVED (OKRs evolve), but each one is logged
 * with `metadata.editedAfterApproval = true` so it shows in the package
 * history. Pass the result straight into lib/package/audit.ts:
 *
 *   const mark = await markPackageEditIfApproved(ownerId, timeframeId)
 *   await recordPackageUpdateIfChanged({ ..., packageId: mark.packageId, editedAfterApproval: mark.editedAfterApproval })
 *
 * Server-only. Other verticals cannot import features/operating-package
 * (features never import features) — this is reported as a follow-up to move
 * into lib/package/ so duties / KPIs / development / role definition can share it.
 */
import { prisma } from '@/lib/prisma'

export interface PackageEditMark {
  /** The person's package for the timeframe, or null when there is none (PKG-5). */
  packageId: string | null
  /** True when that package is APPROVED. */
  editedAfterApproval: boolean
}

type Db = Pick<typeof prisma, 'operatingPackage'>

export async function markPackageEditIfApproved(
  userId: string,
  timeframeId: string | null | undefined,
  db: Db = prisma,
): Promise<PackageEditMark> {
  if (!userId || !timeframeId) return { packageId: null, editedAfterApproval: false }
  const pkg = await db.operatingPackage.findUnique({
    where: { userId_timeframeId: { userId, timeframeId } },
    select: { id: true, status: true },
  })
  return { packageId: pkg?.id ?? null, editedAfterApproval: pkg?.status === 'APPROVED' }
}
