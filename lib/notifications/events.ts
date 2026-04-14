/**
 * Canonical event registry — every row in docs/User_Permissions.md email matrix
 * has exactly one entry here. The event KEY is the stable contract used by the
 * dispatcher, in-app Notification rows, and email templates.
 *
 * Adding a new event: add the literal to `EventKey`, add a row to EVENT_META,
 * and add a template in lib/email/templates (dispatcher looks it up by key).
 */

export type EventCategory =
  | 'ACCOUNT'
  | 'OBJECTIVE'
  | 'KEY_RESULT'
  | 'CHECK_IN'
  | 'TODO'
  | 'TIMEFRAME'
  | 'ALIGNMENT'
  | 'COMMENT'
  | 'ADMIN'

export type EventKey =
  // Account
  | 'ACCOUNT_INVITE'
  | 'ACCOUNT_VERIFY_EMAIL'
  | 'ACCOUNT_PASSWORD_RESET_REQUESTED'
  | 'ACCOUNT_PASSWORD_CHANGED'
  | 'ACCOUNT_ROLE_CHANGED'
  | 'ACCOUNT_DEACTIVATED'
  // Objective
  | 'OBJECTIVE_ASSIGNED'
  | 'OBJECTIVE_CREATED_IN_TEAM'
  | 'OBJECTIVE_ALIGNED_CHILD_ADDED'
  | 'OBJECTIVE_EDITED'
  | 'OBJECTIVE_ARCHIVED'
  | 'OBJECTIVE_VISIBILITY_CHANGED'
  // Key result
  | 'KR_ASSIGNED'
  | 'KR_ADDED_TO_OBJECTIVE'
  | 'KR_PROGRESS_UPDATED'
  | 'KR_AT_RISK'
  | 'KR_COMPLETED'
  | 'KR_ARCHIVED'
  // Check-in reminders
  | 'CHECKIN_WEEKLY_DUE'
  | 'CHECKIN_MISSED_7D'
  | 'CHECKIN_MISSED_14D'
  // Todo
  | 'TODO_ASSIGNED'
  | 'TODO_REASSIGNED_AWAY'
  | 'TODO_DUE_TOMORROW'
  | 'TODO_OVERDUE'
  | 'TODO_COMPLETED'
  // Timeframe
  | 'TIMEFRAME_OPENED'
  | 'TIMEFRAME_ENDING_7D'
  | 'TIMEFRAME_CLOSING_1D'
  | 'TIMEFRAME_CLOSED'
  // Alignment
  | 'ALIGNMENT_REQUESTED'
  | 'ALIGNMENT_DECISION'
  | 'PARENT_OBJECTIVE_ARCHIVED_ORPHAN'
  // Comments / mentions
  | 'USER_MENTIONED'
  | 'COMMENT_ON_OWNED_ENTITY'
  // Admin / system
  | 'ADMIN_USER_CREATED'
  | 'ADMIN_BULK_JOB_DONE'
  | 'ADMIN_SECURITY_ALERT'
  | 'ADMIN_WEEKLY_HEALTH_DIGEST'
  | 'ADMIN_MONTHLY_EXEC_SUMMARY'

export type DefaultCadence = 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'

export interface EventMeta {
  key: EventKey
  category: EventCategory
  defaultCadence: DefaultCadence
  /** Whether redaction rules (isPrivate) should apply to this event's payload. */
  redactable: boolean
  /** Short human label for the in-app feed / preference UI. */
  label: string
}

export const EVENT_META: Record<EventKey, EventMeta> = {
  ACCOUNT_INVITE: { key: 'ACCOUNT_INVITE', category: 'ACCOUNT', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Account invitation' },
  ACCOUNT_VERIFY_EMAIL: { key: 'ACCOUNT_VERIFY_EMAIL', category: 'ACCOUNT', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Verify email' },
  ACCOUNT_PASSWORD_RESET_REQUESTED: { key: 'ACCOUNT_PASSWORD_RESET_REQUESTED', category: 'ACCOUNT', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Password reset requested' },
  ACCOUNT_PASSWORD_CHANGED: { key: 'ACCOUNT_PASSWORD_CHANGED', category: 'ACCOUNT', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Password changed' },
  ACCOUNT_ROLE_CHANGED: { key: 'ACCOUNT_ROLE_CHANGED', category: 'ACCOUNT', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Role or department changed' },
  ACCOUNT_DEACTIVATED: { key: 'ACCOUNT_DEACTIVATED', category: 'ACCOUNT', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Account deactivated' },

  OBJECTIVE_ASSIGNED: { key: 'OBJECTIVE_ASSIGNED', category: 'OBJECTIVE', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Objective assigned to you' },
  OBJECTIVE_CREATED_IN_TEAM: { key: 'OBJECTIVE_CREATED_IN_TEAM', category: 'OBJECTIVE', defaultCadence: 'DAILY', redactable: true, label: 'New objective in your team' },
  OBJECTIVE_ALIGNED_CHILD_ADDED: { key: 'OBJECTIVE_ALIGNED_CHILD_ADDED', category: 'ALIGNMENT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Child objective aligned to yours' },
  OBJECTIVE_EDITED: { key: 'OBJECTIVE_EDITED', category: 'OBJECTIVE', defaultCadence: 'DAILY', redactable: true, label: 'Objective edited' },
  OBJECTIVE_ARCHIVED: { key: 'OBJECTIVE_ARCHIVED', category: 'OBJECTIVE', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Objective archived/deleted' },
  OBJECTIVE_VISIBILITY_CHANGED: { key: 'OBJECTIVE_VISIBILITY_CHANGED', category: 'OBJECTIVE', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Objective visibility changed' },

  KR_ASSIGNED: { key: 'KR_ASSIGNED', category: 'KEY_RESULT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Key result assigned to you' },
  KR_ADDED_TO_OBJECTIVE: { key: 'KR_ADDED_TO_OBJECTIVE', category: 'KEY_RESULT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Key result added to your objective' },
  KR_PROGRESS_UPDATED: { key: 'KR_PROGRESS_UPDATED', category: 'CHECK_IN', defaultCadence: 'DAILY', redactable: true, label: 'Key result progress updated' },
  KR_AT_RISK: { key: 'KR_AT_RISK', category: 'KEY_RESULT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Key result at risk' },
  KR_COMPLETED: { key: 'KR_COMPLETED', category: 'KEY_RESULT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Key result completed' },
  KR_ARCHIVED: { key: 'KR_ARCHIVED', category: 'KEY_RESULT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Key result archived' },

  CHECKIN_WEEKLY_DUE: { key: 'CHECKIN_WEEKLY_DUE', category: 'CHECK_IN', defaultCadence: 'WEEKLY', redactable: false, label: 'Weekly check-in due' },
  CHECKIN_MISSED_7D: { key: 'CHECKIN_MISSED_7D', category: 'CHECK_IN', defaultCadence: 'WEEKLY', redactable: false, label: 'Missed check-in (7 days)' },
  CHECKIN_MISSED_14D: { key: 'CHECKIN_MISSED_14D', category: 'CHECK_IN', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Missed check-in (14 days)' },

  TODO_ASSIGNED: { key: 'TODO_ASSIGNED', category: 'TODO', defaultCadence: 'IMMEDIATE', redactable: false, label: 'To-do assigned to you' },
  TODO_REASSIGNED_AWAY: { key: 'TODO_REASSIGNED_AWAY', category: 'TODO', defaultCadence: 'IMMEDIATE', redactable: false, label: 'To-do reassigned away from you' },
  TODO_DUE_TOMORROW: { key: 'TODO_DUE_TOMORROW', category: 'TODO', defaultCadence: 'DAILY', redactable: false, label: 'To-do due tomorrow' },
  TODO_OVERDUE: { key: 'TODO_OVERDUE', category: 'TODO', defaultCadence: 'DAILY', redactable: false, label: 'To-do overdue' },
  TODO_COMPLETED: { key: 'TODO_COMPLETED', category: 'TODO', defaultCadence: 'DAILY', redactable: false, label: 'To-do completed' },

  TIMEFRAME_OPENED: { key: 'TIMEFRAME_OPENED', category: 'TIMEFRAME', defaultCadence: 'IMMEDIATE', redactable: false, label: 'New timeframe opened' },
  TIMEFRAME_ENDING_7D: { key: 'TIMEFRAME_ENDING_7D', category: 'TIMEFRAME', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Timeframe ending in 7 days' },
  TIMEFRAME_CLOSING_1D: { key: 'TIMEFRAME_CLOSING_1D', category: 'TIMEFRAME', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Timeframe closing tomorrow' },
  TIMEFRAME_CLOSED: { key: 'TIMEFRAME_CLOSED', category: 'TIMEFRAME', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Timeframe closed' },

  ALIGNMENT_REQUESTED: { key: 'ALIGNMENT_REQUESTED', category: 'ALIGNMENT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Alignment request from report' },
  ALIGNMENT_DECISION: { key: 'ALIGNMENT_DECISION', category: 'ALIGNMENT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Alignment approved/rejected' },
  PARENT_OBJECTIVE_ARCHIVED_ORPHAN: { key: 'PARENT_OBJECTIVE_ARCHIVED_ORPHAN', category: 'ALIGNMENT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Parent objective archived — your OKR is orphaned' },

  USER_MENTIONED: { key: 'USER_MENTIONED', category: 'COMMENT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'You were mentioned' },
  COMMENT_ON_OWNED_ENTITY: { key: 'COMMENT_ON_OWNED_ENTITY', category: 'COMMENT', defaultCadence: 'DAILY', redactable: true, label: 'Comment on your OKR / KR / to-do' },

  ADMIN_USER_CREATED: { key: 'ADMIN_USER_CREATED', category: 'ADMIN', defaultCadence: 'IMMEDIATE', redactable: false, label: 'New user created' },
  ADMIN_BULK_JOB_DONE: { key: 'ADMIN_BULK_JOB_DONE', category: 'ADMIN', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Bulk import / export done' },
  ADMIN_SECURITY_ALERT: { key: 'ADMIN_SECURITY_ALERT', category: 'ADMIN', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Security alert' },
  ADMIN_WEEKLY_HEALTH_DIGEST: { key: 'ADMIN_WEEKLY_HEALTH_DIGEST', category: 'ADMIN', defaultCadence: 'WEEKLY', redactable: false, label: 'Weekly org OKR health' },
  ADMIN_MONTHLY_EXEC_SUMMARY: { key: 'ADMIN_MONTHLY_EXEC_SUMMARY', category: 'ADMIN', defaultCadence: 'MONTHLY', redactable: false, label: 'Monthly executive summary' },
}

export const ALL_CATEGORIES: EventCategory[] = [
  'ACCOUNT', 'OBJECTIVE', 'KEY_RESULT', 'CHECK_IN', 'TODO', 'TIMEFRAME', 'ALIGNMENT', 'COMMENT', 'ADMIN',
]

/** Categories the user may NOT disable (account/security emails bypass prefs). */
export const MANDATORY_CATEGORIES: EventCategory[] = ['ACCOUNT']

/** Shape of data a dispatcher caller passes for a given event. */
export interface EventPayload {
  actorId?: string
  entityType?: 'OBJECTIVE' | 'KEY_RESULT' | 'TODO' | 'TIMEFRAME' | 'USER'
  entityId?: string
  entityTitle?: string
  /** If the entity is private, the dispatcher redacts titles/values before sending. */
  isPrivate?: boolean
  /** Direct-recipient overrides (e.g. mention target). If omitted, recipients are derived by role. */
  explicitRecipients?: string[]
  /** Arbitrary event-specific data forwarded to templates. */
  data?: Record<string, unknown>
}
