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
  | 'PERFORMANCE'
  | 'SCRUM'

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
  | 'TODO_DUE_TODAY'
  | 'TODO_OVERDUE'
  | 'TODO_COMPLETED'
  // Sprint v2
  | 'SPRINT_TASK_ASSIGNED'
  | 'SPRINT_STARTING_TOMORROW'
  | 'SPRINT_ENDING_SOON'
  | 'SPRINT_ENDED_BY_USER'
  | 'INITIATIVE_CARRIED_OVER'
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
  // Performance & scorecard — payloads must stay score-free until the draft is
  // shared (spec F1); callers only pass names, cycle labels, and deep links.
  | 'PERF_CYCLE_OPENED'
  | 'PERF_PANEL_COMPLETE'
  | 'PERF_DRAFT_SHARED'
  | 'PERF_DISPUTE_RAISED'
  | 'PERF_ACTION_RECOMMENDED'
  | 'PERF_WEEKLY_FOCUS'
  // Admin / system
  | 'ADMIN_USER_CREATED'
  | 'ADMIN_BULK_JOB_DONE'
  | 'ADMIN_SECURITY_ALERT'
  | 'ADMIN_WEEKLY_HEALTH_DIGEST'
  | 'ADMIN_MONTHLY_EXEC_SUMMARY'
  // Daily Scrum module
  | 'SCRUM_REMINDER'
  | 'SCRUM_NUDGE'
  | 'SCRUM_MANAGER_DIGEST'
  | 'SCRUM_WEEKLY_DIGEST'
  | 'SCRUM_BLOCKER_RAISED'
  | 'SCRUM_BLOCKER_RECURRING'
  | 'SCRUM_BLOCKER_ESCALATED'
  | 'SCRUM_BLOCKER_RESOLVED'
  | 'SCRUM_PROXY_SUBMITTED'
  | 'SCRUM_PROXY_CONFIRMED'
  | 'SCRUM_UPDATE_AMENDED'
  | 'SCRUM_COMMENT_ADDED'
  | 'SCRUM_WIN_CELEBRATED'
  | 'SCRUM_TEAM_MOOD_ALERT'
  | 'SCRUM_OBJECTIVE_NEGLECTED'

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
  TODO_DUE_TODAY: { key: 'TODO_DUE_TODAY', category: 'TODO', defaultCadence: 'DAILY', redactable: false, label: 'To-do due today' },
  TODO_OVERDUE: { key: 'TODO_OVERDUE', category: 'TODO', defaultCadence: 'DAILY', redactable: false, label: 'To-do overdue' },
  TODO_COMPLETED: { key: 'TODO_COMPLETED', category: 'TODO', defaultCadence: 'DAILY', redactable: false, label: 'To-do completed' },
  SPRINT_TASK_ASSIGNED: { key: 'SPRINT_TASK_ASSIGNED', category: 'TODO', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Task assigned in a sprint' },
  SPRINT_STARTING_TOMORROW: { key: 'SPRINT_STARTING_TOMORROW', category: 'TODO', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Sprint starting tomorrow' },
  SPRINT_ENDING_SOON: { key: 'SPRINT_ENDING_SOON', category: 'TODO', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Sprint ending soon' },
  SPRINT_ENDED_BY_USER: { key: 'SPRINT_ENDED_BY_USER', category: 'TODO', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Sprint ended' },
  INITIATIVE_CARRIED_OVER: { key: 'INITIATIVE_CARRIED_OVER', category: 'TODO', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Initiative carried over to next sprint' },

  TIMEFRAME_OPENED: { key: 'TIMEFRAME_OPENED', category: 'TIMEFRAME', defaultCadence: 'IMMEDIATE', redactable: false, label: 'New timeframe opened' },
  TIMEFRAME_ENDING_7D: { key: 'TIMEFRAME_ENDING_7D', category: 'TIMEFRAME', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Timeframe ending in 7 days' },
  TIMEFRAME_CLOSING_1D: { key: 'TIMEFRAME_CLOSING_1D', category: 'TIMEFRAME', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Timeframe closing tomorrow' },
  TIMEFRAME_CLOSED: { key: 'TIMEFRAME_CLOSED', category: 'TIMEFRAME', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Timeframe closed' },

  ALIGNMENT_REQUESTED: { key: 'ALIGNMENT_REQUESTED', category: 'ALIGNMENT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Alignment request from report' },
  ALIGNMENT_DECISION: { key: 'ALIGNMENT_DECISION', category: 'ALIGNMENT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Alignment approved/rejected' },
  PARENT_OBJECTIVE_ARCHIVED_ORPHAN: { key: 'PARENT_OBJECTIVE_ARCHIVED_ORPHAN', category: 'ALIGNMENT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Parent objective archived — your OKR is orphaned' },

  USER_MENTIONED: { key: 'USER_MENTIONED', category: 'COMMENT', defaultCadence: 'IMMEDIATE', redactable: true, label: 'You were mentioned' },
  COMMENT_ON_OWNED_ENTITY: { key: 'COMMENT_ON_OWNED_ENTITY', category: 'COMMENT', defaultCadence: 'DAILY', redactable: true, label: 'Comment on your OKR / KR / to-do' },

  PERF_CYCLE_OPENED: { key: 'PERF_CYCLE_OPENED', category: 'PERFORMANCE', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Review cycle opened — evaluations assigned to you' },
  PERF_PANEL_COMPLETE: { key: 'PERF_PANEL_COMPLETE', category: 'PERFORMANCE', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Evaluator panel complete — ready for review' },
  PERF_DRAFT_SHARED: { key: 'PERF_DRAFT_SHARED', category: 'PERFORMANCE', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Your performance draft report is ready' },
  PERF_DISPUTE_RAISED: { key: 'PERF_DISPUTE_RAISED', category: 'PERFORMANCE', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Evaluation disputed by employee' },
  PERF_ACTION_RECOMMENDED: { key: 'PERF_ACTION_RECOMMENDED', category: 'PERFORMANCE', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Reward / development action recommended' },
  PERF_WEEKLY_FOCUS: { key: 'PERF_WEEKLY_FOCUS', category: 'PERFORMANCE', defaultCadence: 'WEEKLY', redactable: false, label: 'Weekly growth focus' },

  ADMIN_USER_CREATED: { key: 'ADMIN_USER_CREATED', category: 'ADMIN', defaultCadence: 'IMMEDIATE', redactable: false, label: 'New user created' },
  ADMIN_BULK_JOB_DONE: { key: 'ADMIN_BULK_JOB_DONE', category: 'ADMIN', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Bulk import / export done' },
  ADMIN_SECURITY_ALERT: { key: 'ADMIN_SECURITY_ALERT', category: 'ADMIN', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Security alert' },
  ADMIN_WEEKLY_HEALTH_DIGEST: { key: 'ADMIN_WEEKLY_HEALTH_DIGEST', category: 'ADMIN', defaultCadence: 'WEEKLY', redactable: false, label: 'Weekly org OKR health' },
  ADMIN_MONTHLY_EXEC_SUMMARY: { key: 'ADMIN_MONTHLY_EXEC_SUMMARY', category: 'ADMIN', defaultCadence: 'MONTHLY', redactable: false, label: 'Monthly executive summary' },

  // Daily Scrum module.
  SCRUM_REMINDER: { key: 'SCRUM_REMINDER', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Daily scrum reminder' },
  SCRUM_NUDGE: { key: 'SCRUM_NUDGE', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Daily scrum nudge' },
  SCRUM_MANAGER_DIGEST: { key: 'SCRUM_MANAGER_DIGEST', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Manager scrum digest' },
  SCRUM_WEEKLY_DIGEST: { key: 'SCRUM_WEEKLY_DIGEST', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Weekly scrum digest' },
  SCRUM_BLOCKER_RAISED: { key: 'SCRUM_BLOCKER_RAISED', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Scrum blocker raised' },
  SCRUM_BLOCKER_RECURRING: { key: 'SCRUM_BLOCKER_RECURRING', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Recurring scrum blocker' },
  SCRUM_BLOCKER_ESCALATED: { key: 'SCRUM_BLOCKER_ESCALATED', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Scrum blocker escalated' },
  SCRUM_BLOCKER_RESOLVED: { key: 'SCRUM_BLOCKER_RESOLVED', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Scrum blocker resolved' },
  SCRUM_PROXY_SUBMITTED: { key: 'SCRUM_PROXY_SUBMITTED', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Scrum submitted by proxy' },
  SCRUM_PROXY_CONFIRMED: { key: 'SCRUM_PROXY_CONFIRMED', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Proxy scrum confirmed' },
  SCRUM_UPDATE_AMENDED: { key: 'SCRUM_UPDATE_AMENDED', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Scrum update amended' },
  SCRUM_COMMENT_ADDED: { key: 'SCRUM_COMMENT_ADDED', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: true, label: 'Scrum comment added' },
  SCRUM_WIN_CELEBRATED: { key: 'SCRUM_WIN_CELEBRATED', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Scrum win celebrated' },
  SCRUM_TEAM_MOOD_ALERT: { key: 'SCRUM_TEAM_MOOD_ALERT', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Team mood alert' },
  SCRUM_OBJECTIVE_NEGLECTED: { key: 'SCRUM_OBJECTIVE_NEGLECTED', category: 'SCRUM', defaultCadence: 'IMMEDIATE', redactable: false, label: 'Objective neglected in daily scrum' },
}

export const ALL_CATEGORIES: EventCategory[] = [
  'ACCOUNT', 'OBJECTIVE', 'KEY_RESULT', 'CHECK_IN', 'TODO', 'TIMEFRAME', 'ALIGNMENT', 'COMMENT', 'ADMIN', 'PERFORMANCE', 'SCRUM',
]

/** Categories the user may NOT disable (account/security emails bypass prefs). */
export const MANDATORY_CATEGORIES: EventCategory[] = ['ACCOUNT']

/** Shape of data a dispatcher caller passes for a given event. */
export interface EventPayload {
  actorId?: string
  entityType?: 'OBJECTIVE' | 'KEY_RESULT' | 'TODO' | 'TIMEFRAME' | 'USER' | 'SCRUM_UPDATE'
  entityId?: string
  entityTitle?: string
  /** If the entity is private, the dispatcher redacts titles/values before sending. */
  isPrivate?: boolean
  /** Direct-recipient overrides (e.g. mention target). If omitted, recipients are derived by role. */
  explicitRecipients?: string[]
  /** Arbitrary event-specific data forwarded to templates. */
  data?: Record<string, unknown>
}
