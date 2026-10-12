/**
 * Employee OKR profile (PRF-7…11) — client-safe exports for the profile shell
 * (P1). Server code lives in `okr-profile.server.ts` (loader + `getOkrProfileSummary`)
 * and `okr-profile-initiatives.server.ts`; import those by direct path from app/ only.
 */
export { OkrProfileTab } from './OkrProfileTab'
export type { OkrProfileTabProps } from './OkrProfileTab'
export type { OkrProfileItemRef } from './OkrProfileTree'
export { OkrProfileHeaderStrip } from './OkrProfileHeaderStrip'
export { useOkrProfile, useRefreshOkrProfile, useCreateProfileInitiative, okrProfileApi, okrProfileKeys, OkrProfileApiError } from './okr-profile-api'
export {
  applyOkrProfileFilters,
  computeHeader,
  LEVEL_BUCKET_LABELS,
  STATUS_KEY_LABELS,
  DISPOSITION_LABELS,
} from './okr-profile-utils'
export type {
  OkrProfilePayload,
  OkrProfileHeader,
  OkrProfileObjective,
  OkrProfileKeyResult,
  OkrProfileTodo,
  OkrProfileDuty,
  OkrProfilePastObjective,
  OkrProfileFilters,
} from './types'
