/**
 * Daily Scrum module value sets.
 *
 * Prisma stores enum-like values as strings in this repo. These const arrays are
 * the shared source of truth for validation, route schemas, services, and UI.
 */

export const SCRUM_UPDATE_STATUSES = ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'AMENDED'] as const
export type ScrumUpdateStatus = (typeof SCRUM_UPDATE_STATUSES)[number]

export const SCRUM_MOODS = ['GREAT', 'GOOD', 'OKAY', 'STRESSED', 'BLOCKED'] as const
export type ScrumMood = (typeof SCRUM_MOODS)[number]

export const SCRUM_BLOCKER_STATUSES = ['OPEN', 'RECURRING', 'ESCALATED', 'RESOLVED'] as const
export type ScrumBlockerStatus = (typeof SCRUM_BLOCKER_STATUSES)[number]

export const SCRUM_BLOCKER_CATEGORIES = [
  'TECHNICAL',
  'CLIENT_APPROVAL',
  'EXTERNAL_DEPENDENCY',
  'INTERNAL_CAPACITY',
  'REQUIREMENT_CLARITY',
  'ACCESS',
  'QA',
  'DEPLOYMENT',
  'OTHER',
] as const
export type ScrumBlockerCategory = (typeof SCRUM_BLOCKER_CATEGORIES)[number]

export const SCRUM_PROXY_REASONS = ['MANAGER_ENTRY', 'PTO', 'FIELD_WORK', 'SYSTEM_ISSUE', 'OTHER'] as const
export type ScrumProxyReason = (typeof SCRUM_PROXY_REASONS)[number]

export const SCRUM_ABSENCE_TYPES = ['EXCUSED', 'PTO', 'SICK', 'TRAVEL', 'HOLIDAY', 'OTHER'] as const
export type ScrumAbsenceType = (typeof SCRUM_ABSENCE_TYPES)[number]

export const SCRUM_LINK_TYPES = ['OBJECTIVE', 'KEY_RESULT', 'TODO'] as const
export type ScrumLinkType = (typeof SCRUM_LINK_TYPES)[number]

export const SCRUM_LINK_CONTEXTS = ['TODAY', 'BLOCKER', 'WIN', 'YESTERDAY'] as const
export type ScrumLinkContext = (typeof SCRUM_LINK_CONTEXTS)[number]

export const SCRUM_DEFAULT_SETTINGS_ID = 'default'
export const SCRUM_DEFAULT_TIMEZONE = 'Africa/Addis_Ababa'
export const SCRUM_DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5] as const

export interface ScrumViewer {
  id: string
  role?: string
}

export interface ScrumSerializableUpdate {
  id: string
  userId: string
  managerId?: string | null
  mood?: ScrumMood | string | null
  [key: string]: unknown
}
