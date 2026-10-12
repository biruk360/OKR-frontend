/**
 * Employee profile (PRF-1…11) — client-safe barrel.
 *
 * The profile page (app/dashboard/org/users/[id]) composes the vertical tabs
 * (duties, role definition, KPIs, development, dependencies, decisions, package)
 * itself, because features never import each other. This feature owns the shell
 * pieces and the OKR profile tab.
 *
 * Server code — import by direct path from app/ only:
 *   - services/profile-shell.server.ts (resolveProfileTimeframe, loadProfileShellAccess)
 *   - components/okr-profile/okr-profile.server.ts (loadOkrProfile, getOkrProfileSummary)
 *   - components/okr-profile/okr-profile-initiatives.server.ts (createProfileInitiative)
 */
export { OkrProfileTab } from './components/okr-profile/OkrProfileTab'
export type { OkrProfileTabProps } from './components/okr-profile/OkrProfileTab'
export type { OkrProfileItemRef } from './components/okr-profile/OkrProfileTree'
export { ProfileTimeframeSwitcher } from './components/ProfileTimeframeSwitcher'
export type { ProfileTimeframeSwitcherProps } from './components/ProfileTimeframeSwitcher'
export {
  PROFILE_TAB_PARAM,
  PROFILE_TIMEFRAME_PARAM,
  firstParam,
  isProfileTimeframeEnded,
  parseProfileTimeframeParam,
  profileShellHref,
  profileTabLinks,
  resolveActiveProfileTab,
  visibleProfileTabs,
} from './services/profile-shell'
export type { ProfileTabLink, ProfileTabVisibilityInput } from './services/profile-shell'
