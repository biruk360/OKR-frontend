/**
 * Role definition — profile summary (profile composition contract, PRF-2 / PRF-4).
 * Server-only; import by direct path from `app/` or the profile loader.
 */
import { prisma } from '@/lib/prisma'
import { canViewPackageArea, loadPackageViewer } from '@/lib/package/access'
import type { RoleDefinitionProfileSummary } from '../types'
import { listRoleDefinitions, isRoleDefinitionError } from './role-definitions.server'
import { countVacantSeats, topAccountabilities } from './rules'

/**
 * `{ seatTitle, reportsTo, purpose, topAccountabilities[], status }` for the
 * subject's current role definition in `timeframeId` (plus the ROL-3 / ROL-4
 * flags), or `null` when the viewer may not see the role area or there is no
 * role definition.
 */
export async function getRoleDefinitionProfileSummary(
  viewerId: string,
  userId: string,
  timeframeId: string,
): Promise<RoleDefinitionProfileSummary | null> {
  const viewer = await loadPackageViewer(viewerId)
  if (!(await canViewPackageArea(viewer, userId, 'role'))) return null

  // Unknown / empty timeframe ids fall back to evergreen definitions instead of failing the card.
  let scopedTimeframeId: string | null = timeframeId || null
  if (scopedTimeframeId) {
    const exists = await prisma.timeframe.findUnique({ where: { id: scopedTimeframeId }, select: { id: true } })
    if (!exists) scopedTimeframeId = null
  }

  let data
  try {
    data = await listRoleDefinitions(viewer, userId, scopedTimeframeId)
  } catch (error) {
    if (isRoleDefinitionError(error)) return null
    throw error
  }
  const current = data.current
  if (!current) return null

  const accountabilities = current.items.filter((item) => item.section === 'ACCOUNTABILITY')
  const reportsTo = current.reportsTo
    ? { id: current.reportsTo.id, name: current.reportsTo.name }
    : current.reportsToText
      ? { id: null, name: current.reportsToText }
      : null

  return {
    id: current.id,
    seatTitle: current.seatTitle,
    reportsTo,
    purpose: current.purpose,
    topAccountabilities: topAccountabilities(current.items, 3),
    accountabilityCount: accountabilities.length,
    status: current.status,
    reportingLineMismatch: data.reportingLine.state === 'MISMATCH',
    vacantSeats: countVacantSeats(data.seats),
  }
}
