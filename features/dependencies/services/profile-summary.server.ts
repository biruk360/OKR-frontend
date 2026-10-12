/**
 * Work dependencies — Overview "Package summary" figures (PRF-2, profile
 * composition contract). Server only.
 */
import { canViewPackageArea, loadPackageViewer } from '@/lib/package/access'
import type { DependenciesProfileSummary } from '../types'
import { listPersonDependencies } from './dependencies.server'
import { buildProfileSummary } from './rules'

/**
 * `{ inboundLate, inboundOpen, outboundDueSoon, outboundOpen, topInbound[] }` for
 * `userId` in `timeframeId`, or `null` when the viewer may not see that person's
 * dependencies (§8).
 */
export async function getDependenciesProfileSummary(
  viewerId: string,
  userId: string,
  timeframeId: string,
): Promise<DependenciesProfileSummary | null> {
  const viewer = await loadPackageViewer(viewerId)
  if (!(await canViewPackageArea(viewer, userId, 'dependencies'))) return null
  const person = await listPersonDependencies(viewer, userId, { timeframeId: timeframeId || undefined })
  return buildProfileSummary(person.inbound, person.outbound)
}
