/**
 * Employee profile shell (PRF-1, PRF-3) — pure, client-safe helpers.
 *
 * Which tabs a viewer sees (§8 via lib/package/access.ts verdicts), which tab is
 * active, and how tab / timeframe links are spelled (`?tab=` + `?tf=`).
 */
import { PROFILE_TABS, PROFILE_TAB_LABELS, isProfileTab, profileTabHref, type PackageArea, type ProfileTab } from '@/types/package'

/** `?tf=` on /dashboard/org/users/[id] — the profile's selected timeframe (PRF-3). */
export const PROFILE_TIMEFRAME_PARAM = 'tf'
/** `?tab=` on /dashboard/org/users/[id] (PRF-1). */
export const PROFILE_TAB_PARAM = 'tab'

export interface ProfileTabVisibilityInput {
  /** §8 view verdicts for the (viewer, subject) pair — `resolvePackageAreaAccess(...).view`. */
  view: Partial<Record<PackageArea, boolean>>
  /** The viewer holds `module.package` (ADMIN always does). Off → every package tab is hidden. */
  packageModule: boolean
  /** Client-portal sessions cannot read OKR profiles (the API answers 403). */
  okrAllowed: boolean
}

/**
 * PRF-1: tabs the viewer may see, in display order. Hidden, never disabled.
 * Overview is always present (it holds the pre-existing profile content).
 */
export function visibleProfileTabs({ view, packageModule, okrAllowed }: ProfileTabVisibilityInput): ProfileTab[] {
  const can = (area: PackageArea) => view[area] === true
  return PROFILE_TABS.filter((tab) => {
    switch (tab) {
      case 'overview':
        return true
      case 'okrs':
        return okrAllowed && can('okr')
      case 'role':
        return packageModule && (can('role') || can('duties'))
      case 'kpis':
        return packageModule && can('kpis')
      case 'development':
        return packageModule && can('development')
      case 'links':
        return packageModule && can('dependencies')
      case 'decisions':
        return packageModule && can('decisions')
      default:
        return false
    }
  })
}

/** First value of a Next search param. */
export function firstParam(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** The requested tab when it is valid and visible, otherwise Overview. */
export function resolveActiveProfileTab(requested: string | string[] | null | undefined, visible: readonly ProfileTab[]): ProfileTab {
  const raw = firstParam(requested)
  if (raw && isProfileTab(raw) && visible.includes(raw)) return raw
  return 'overview'
}

/** Accept only id-shaped `?tf=` values (cuid / uuid / slug); anything else falls back to the default. */
export function parseProfileTimeframeParam(value: string | string[] | null | undefined): string | null {
  const raw = firstParam(value)?.trim()
  if (!raw) return null
  return /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null
}

/**
 * Link to a profile tab, keeping the selected timeframe. `timeframeId` is left
 * out when it is null or equals the default, so the canonical URL stays short.
 */
export function profileShellHref(
  userId: string,
  tab: ProfileTab = 'overview',
  timeframeId?: string | null,
  defaultTimeframeId?: string | null,
): string {
  const base = profileTabHref(userId, tab)
  if (!timeframeId || timeframeId === defaultTimeframeId) return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}${PROFILE_TIMEFRAME_PARAM}=${encodeURIComponent(timeframeId)}`
}

export interface ProfileTabLink {
  key: ProfileTab
  label: string
  href: string
}

/** LinkTabs items for the visible tabs. */
export function profileTabLinks(
  userId: string,
  visible: readonly ProfileTab[],
  timeframeId?: string | null,
  defaultTimeframeId?: string | null,
): ProfileTabLink[] {
  return visible.map((key) => ({
    key,
    label: PROFILE_TAB_LABELS[key],
    href: profileShellHref(userId, key, timeframeId, defaultTimeframeId),
  }))
}

/** Closed timeframe → read-only (PRF-3). Same rule as OKR period close. */
export { isTimeframeEnded as isProfileTimeframeEnded } from '@/lib/okr/period-close'
