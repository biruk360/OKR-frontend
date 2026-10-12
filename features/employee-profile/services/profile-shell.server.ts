// Server-only (Prisma + permission resolver). Import by direct path from app/ only.
/**
 * Employee profile shell loaders (PRF-1, PRF-3, PRF-5):
 *  - the selected timeframe (`?tf=`, else the default/active one),
 *  - which tabs the viewer may see (§8 matrix in lib/package/access.ts, gated by
 *    the `module.package` + `page.people.package` feature keys).
 *
 * Tab data itself is fetched by each tab's client component through its own API
 * (which re-applies access and redaction), so only the active tab loads.
 */
import { prisma } from '@/lib/prisma'
import { resolveDefaultTimeframe } from '@/lib/okr/active-timeframe'
import { resolveFeaturePermission } from '@/lib/permission-resolver'
import { getPackageAreaAccess, loadPackageViewer, type PackageAreaAccess } from '@/lib/package/access'
import { isClientPortalUser } from '@/lib/todos/visibility'
import { PACKAGE_FEATURE_KEYS, type ProfileTab } from '@/types/package'
import { isProfileTimeframeEnded, visibleProfileTabs } from './profile-shell'

export interface ProfileTimeframe {
  id: string
  name: string
  startDate: string
  endDate: string
  /** Closed timeframe → read-only (PRF-3). */
  ended: boolean
}

export interface ProfileTimeframeSelection {
  /** The timeframe every tab uses; null only when no timeframe exists at all. */
  selected: ProfileTimeframe | null
  /** The default (active) timeframe; `?tf=` equal to it is dropped from links. */
  defaultId: string | null
}

function toProfileTimeframe(tf: { id: string; name: string; startDate: Date; endDate: Date }, now: Date): ProfileTimeframe {
  return {
    id: tf.id,
    name: tf.name,
    startDate: tf.startDate.toISOString(),
    endDate: tf.endDate.toISOString(),
    ended: isProfileTimeframeEnded(tf.endDate, now),
  }
}

/**
 * PRF-3: the requested timeframe when it exists, otherwise the default active one
 * (lib/okr/active-timeframe.ts — the same default the OKR profile API uses).
 * An unknown `?tf=` silently falls back to the default.
 */
export async function resolveProfileTimeframe(
  requestedId: string | null,
  now: Date = new Date(),
): Promise<ProfileTimeframeSelection> {
  const select = { id: true, name: true, startDate: true, endDate: true } as const
  const [requested, fallback] = await Promise.all([
    requestedId ? prisma.timeframe.findUnique({ where: { id: requestedId }, select }) : Promise.resolve(null),
    resolveDefaultTimeframe(),
  ])
  const picked = requested ?? fallback
  return {
    selected: picked ? toProfileTimeframe(picked, now) : null,
    defaultId: fallback?.id ?? null,
  }
}

export interface ProfileShellViewer {
  id: string
  role: string
  userType?: 'INTERNAL' | 'CLIENT_PORTAL' | null
}

export interface ProfileShellAccess {
  visibleTabs: ProfileTab[]
  /** Viewer holds the package module (and the people-package page key). */
  packageModule: boolean
  /** §8 verdicts for the pair; null when the package module is off for the viewer. */
  areas: PackageAreaAccess | null
}

async function hasPackageModule(viewer: ProfileShellViewer): Promise<boolean> {
  if (viewer.role === 'ADMIN') return true
  const checks = await Promise.all([
    resolveFeaturePermission(viewer.id, PACKAGE_FEATURE_KEYS.module).catch(() => false),
    resolveFeaturePermission(viewer.id, PACKAGE_FEATURE_KEYS.pagePeoplePackage).catch(() => false),
  ])
  return checks.every(Boolean)
}

/** PRF-1: tabs the viewer may see on `subjectUserId`'s profile (hidden, never disabled). */
export async function loadProfileShellAccess(viewer: ProfileShellViewer, subjectUserId: string): Promise<ProfileShellAccess> {
  const okrAllowed = !isClientPortalUser({ userType: viewer.userType ?? undefined })
  const packageModule = okrAllowed && (await hasPackageModule(viewer))
  let areas: PackageAreaAccess | null = null
  if (packageModule) {
    const packageViewer = await loadPackageViewer({ id: viewer.id, role: viewer.role })
    areas = await getPackageAreaAccess(packageViewer, subjectUserId)
  }
  return {
    visibleTabs: visibleProfileTabs({
      // OKRs are readable by every signed-in internal user (§8 footnote ²).
      view: areas?.view ?? { okr: true },
      packageModule,
      okrAllowed,
    }),
    packageModule,
    areas,
  }
}
