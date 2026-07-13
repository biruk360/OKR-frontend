/**
 * Daily Scrum module value sets.
 *
 * Prisma stores enum-like values as strings in this repo. These const arrays are
 * the shared source of truth for validation, route schemas, services, and UI.
 */

export const SCRUM_UPDATE_STATUSES = ['DRAFT', 'SUBMITTED', 'LATE', 'ABSENT', 'EXCUSED', 'CONFIRMED', 'AMENDED'] as const
export type ScrumUpdateStatus = (typeof SCRUM_UPDATE_STATUSES)[number]

export const SCRUM_MOODS = ['GOOD', 'OKAY', 'STRUGGLING'] as const
export type ScrumMood = (typeof SCRUM_MOODS)[number]

export const SCRUM_BLOCKER_STATUSES = ['OPEN', 'RECURRING', 'ESCALATED', 'RESOLVED'] as const
export type ScrumBlockerStatus = (typeof SCRUM_BLOCKER_STATUSES)[number]

export const SCRUM_BLOCKER_CATEGORIES = [
  'EXTERNAL_DEPENDENCY',
  'CLIENT_APPROVAL',
  'INTERNAL_DEPENDENCY',
  'TECHNICAL',
  'ENVIRONMENT_ACCESS',
  'UNCLEAR_REQUIREMENTS',
  'RESOURCE_CAPACITY',
  'TOOLING',
  'OTHER',
] as const
export type ScrumBlockerCategory = (typeof SCRUM_BLOCKER_CATEGORIES)[number]

export const SCRUM_PROXY_REASONS = [
  'IN_CLIENT_MEETING',
  'TRAVELLING',
  'SICK',
  'ON_LEAVE',
  'NO_CONNECTIVITY',
  'VERBAL_UPDATE_IN_STANDUP',
  'OTHER',
] as const
export type ScrumProxyReason = (typeof SCRUM_PROXY_REASONS)[number]

export const SCRUM_ABSENCE_TYPES = ['LEAVE', 'SICK', 'HOLIDAY', 'CLIENT_MEETING', 'TRAVEL', 'OTHER'] as const
export type ScrumAbsenceType = (typeof SCRUM_ABSENCE_TYPES)[number]

export const SCRUM_LINK_TYPES = ['OBJECTIVE', 'KEY_RESULT', 'TODO'] as const
export type ScrumLinkType = (typeof SCRUM_LINK_TYPES)[number]

export const SCRUM_LINK_CONTEXTS = ['TODAY', 'BLOCKER', 'WIN', 'YESTERDAY'] as const
export type ScrumLinkContext = (typeof SCRUM_LINK_CONTEXTS)[number]

export const SCRUM_DEFAULT_SETTINGS_ID = 'default'
export const SCRUM_DEFAULT_TIMEZONE = 'Africa/Addis_Ababa'
export const SCRUM_DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5] as const

export const SCRUM_PERFORMANCE_METRICS = [
  'SCRUM_SUBMISSION_RATE',
  'SCRUM_PUNCTUALITY_RATE',
  'SCRUM_WIN_COUNT',
  'SCRUM_BLOCKER_RESOLUTION_DAYS',
] as const
export type ScrumPerformanceMetric = (typeof SCRUM_PERFORMANCE_METRICS)[number]

export const SCRUM_PERFORMANCE_METRIC_LABELS: Record<ScrumPerformanceMetric, string> = {
  SCRUM_SUBMISSION_RATE: 'Daily Scrum submission rate',
  SCRUM_PUNCTUALITY_RATE: 'Daily Scrum punctuality rate',
  SCRUM_WIN_COUNT: 'Daily Scrum win count',
  SCRUM_BLOCKER_RESOLUTION_DAYS: 'Daily Scrum blocker resolution days',
}

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
