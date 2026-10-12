/**
 * Single source of truth for "where does this event live in the app?".
 *
 * The dispatcher calls `buildDeepLink()` to auto-attach a clickable URL to
 * every email, and `absoluteUrl()` ensures every path that lands in a template
 * is prefixed with NEXTAUTH_URL so it is clickable from a mail client.
 */

import type { EventKey, NotificationEntityType } from './events'
import { PACKAGE_EVENT_KEYS } from './events'
import { decisionHref, dependencyMapHref, keyResultHref, profileTabHref } from '@/lib/package/links'

export type EntityType = NotificationEntityType

export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

/** Convert a relative path or absolute URL into an absolute URL using NEXTAUTH_URL. */
export function absoluteUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return appBaseUrl()
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${appBaseUrl()}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
}

/**
 * Pick the "right" page for an event so the email recipient lands on the page
 * that initiated it. Always returns an absolute URL.
 *
 * - Comments / mentions on a KR or objective → the KR/objective detail page
 * - Initiative-related events → the parent KR if linked, else /dashboard/todos
 * - Account events → /dashboard/settings/account
 * - Admin events → relevant admin page
 */
export function buildDeepLink(args: {
  eventKey: EventKey
  entityType?: EntityType
  entityId?: string
  /** Optional fallback if entity not enough (e.g. parent objective for KR). */
  data?: Record<string, unknown>
}): string {
  return absoluteUrl(buildDeepLinkPath(args))
}

/** Same as buildDeepLink but returns the relative in-app path (for in-app notification rows). */
export function buildDeepLinkPath(args: {
  eventKey: EventKey
  entityType?: EntityType
  entityId?: string
  data?: Record<string, unknown>
}): string {
  const { eventKey, entityType, entityId, data = {} } = args
  return pickPath(eventKey, entityType, entityId, data)
}

/** A caller-supplied relative path, or null (absolute URLs are not trusted here). */
function relativePath(v: unknown): string | null {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * Employee Operating Package events (§9). Person-scoped items open the owner's
 * profile tab (data.ownerId / data.userId); dependencies and decisions open their
 * company pages; checkpoints open the KR.
 */
function packagePath(eventKey: EventKey, entityType: EntityType | undefined, entityId: string | undefined, data: Record<string, unknown>): string {
  const explicit = relativePath(data.deepLink)
  if (explicit) return explicit
  const person = str(data.ownerId) ?? str(data.userId)
  switch (eventKey) {
    case 'KPI_READING_DUE':
      return person ? profileTabHref(person, 'kpis') : '/dashboard/my-okrs'
    case 'DEV_ITEM_DUE':
      return person ? profileTabHref(person, 'development') : '/dashboard/my-okrs'
    case 'DEPENDENCY_DUE_SOON':
    case 'DEPENDENCY_LATE':
    case 'DEPENDENCY_DONE':
      return dependencyMapHref(entityType === 'WORK_DEPENDENCY' ? entityId : str(data.dependencyId))
    case 'DECISION_REQUESTED':
    case 'DECISION_DECIDED':
      return decisionHref(entityType === 'DECISION' ? entityId : str(data.decisionId))
    case 'PACKAGE_SENT_FOR_REVIEW':
    case 'PACKAGE_APPROVED':
    case 'PACKAGE_ITEM_DISPUTED':
      return person ? profileTabHref(person) : '/dashboard'
    case 'KR_CHECKPOINT_DUE': {
      const kr = entityType === 'KEY_RESULT' ? entityId : str(data.keyResultId)
      return kr ? keyResultHref(kr) : '/dashboard/my-okrs'
    }
    default:
      return '/dashboard'
  }
}

function pickPath(eventKey: EventKey, entityType: EntityType | undefined, entityId: string | undefined, data: Record<string, unknown>): string {
  // ── Employee Operating Package ──
  if (PACKAGE_EVENT_KEYS.includes(eventKey)) return packagePath(eventKey, entityType, entityId, data)

  // ── Account ──
  if (eventKey === 'ACCOUNT_INVITE') return String(data.activationUrl ?? '/auth/reset-password')
  if (eventKey === 'ACCOUNT_VERIFY_EMAIL') return String(data.verifyUrl ?? '/auth/signin')
  if (eventKey === 'ACCOUNT_PASSWORD_RESET_REQUESTED') return String(data.resetUrl ?? '/auth/forgot-password')
  if (eventKey === 'ACCOUNT_PASSWORD_CHANGED') return '/dashboard/settings/account'
  if (eventKey === 'ACCOUNT_ROLE_CHANGED' || eventKey === 'ACCOUNT_DEACTIVATED') {
    return entityId ? `/dashboard/org/users/${entityId}` : '/dashboard/settings/users'
  }

  // ── Admin / system ──
  if (eventKey === 'ADMIN_USER_CREATED') return entityId ? `/dashboard/org/users/${entityId}` : '/dashboard/settings/users'
  if (eventKey === 'ADMIN_BULK_JOB_DONE') return '/dashboard/settings'
  if (eventKey === 'ADMIN_SECURITY_ALERT') return '/dashboard/settings/audit-logs'
  if (eventKey === 'ADMIN_WEEKLY_HEALTH_DIGEST' || eventKey === 'ADMIN_MONTHLY_EXEC_SUMMARY') return '/dashboard/insights?tab=reports'

  // ── Timeframes ──
  if (eventKey === 'TIMEFRAME_OPENED' || eventKey === 'TIMEFRAME_CLOSED') return '/dashboard'
  if (eventKey === 'TIMEFRAME_ENDING_7D' || eventKey === 'TIMEFRAME_CLOSING_1D') return '/dashboard/my-okrs'

  // ── Check-ins (entityId here is the user, but jump to the entity link in data) ──
  if (eventKey === 'CHECKIN_WEEKLY_DUE') return '/dashboard/my-okrs'
  if (eventKey === 'CHECKIN_MISSED_7D' || eventKey === 'CHECKIN_MISSED_14D') {
    if (data.deepLink) return String(data.deepLink)
    return '/dashboard/my-okrs'
  }

  // ── Alignment ──
  if (eventKey === 'OBJECTIVE_ALIGNED_CHILD_ADDED') {
    const parent = data.parentObjectiveId as string | undefined
    return parent ? `/dashboard/objectives/${parent}` : '/dashboard/okrs-all?view=map'
  }
  if (eventKey === 'PARENT_OBJECTIVE_ARCHIVED_ORPHAN') {
    const orphan = data.orphanedObjectiveId as string | undefined
    return orphan ? `/dashboard/objectives/${orphan}` : '/dashboard/okrs-all?view=map'
  }
  if (eventKey === 'ALIGNMENT_REQUESTED' || eventKey === 'ALIGNMENT_DECISION') {
    return entityId ? `/dashboard/objectives/${entityId}` : '/dashboard/okrs-all?view=map'
  }

  // ── Performance & scorecard ──
  if (eventKey === 'PERF_CYCLE_OPENED') return '/dashboard/performance/evaluations'
  if (eventKey === 'PERF_PANEL_COMPLETE' || eventKey === 'PERF_DISPUTE_RAISED') {
    const evaluationId = data.evaluationId as string | undefined
    return evaluationId ? `/dashboard/performance/evaluations/${evaluationId}/score` : '/dashboard/performance/evaluations'
  }
  if (eventKey === 'PERF_DRAFT_SHARED' || eventKey === 'PERF_WEEKLY_FOCUS') return '/dashboard/performance'
  if (eventKey === 'PERF_ACTION_RECOMMENDED') return '/dashboard/performance/actions'

  // ── Project Management module ──
  if (eventKey === 'WBR_PACK_READY') return '/dashboard/projects/portfolio'
  if (eventKey.startsWith('PROJECT_') || eventKey.startsWith('CLIENT_') || eventKey.startsWith('ACTIVITY_') ||
      eventKey === 'BASELINE_SLIPPED' || eventKey.startsWith('STAGE_GATE_') || eventKey.startsWith('CHANGE_REQUEST_') ||
      eventKey === 'RAID_HIGH_RISK_ADDED' || eventKey === 'JIRA_SYNC_FAILED' || eventKey === 'PAYMENT_MILESTONE_READY' ||
      eventKey === 'COE_REQUIRED' || eventKey === 'SCRUM_NOT_LOGGED') {
    if (data.deepLink) return String(data.deepLink)
    if (entityType === 'PROJECT' && entityId) return `/projects/${entityId}`
    return '/dashboard/projects'
  }

  // ── Daily Scrum module ──
  if (eventKey.startsWith('SCRUM_')) {
    if (data.deepLink) return String(data.deepLink)
    if (entityType === 'SCRUM_UPDATE' && entityId) return `/dashboard/scrum?update=${entityId}`
    if (eventKey === 'SCRUM_WEEKLY_DIGEST' || eventKey === 'SCRUM_TEAM_MOOD_ALERT') return '/dashboard/scrum/wins'
    if (eventKey === 'SCRUM_OBJECTIVE_NEGLECTED') {
      const objectiveId = data.objectiveId as string | undefined
      return objectiveId ? `/dashboard/objectives/${objectiveId}` : '/dashboard/scrum'
    }
    return '/dashboard/scrum'
  }

  // ── Comments / mentions: link to the entity the comment lives on ──
  if (eventKey === 'USER_MENTIONED' || eventKey === 'COMMENT_ON_OWNED_ENTITY') {
    if (data.deepLink) return String(data.deepLink)
    if (entityType === 'OBJECTIVE' && entityId) return `/dashboard/objectives/${entityId}`
    if (entityType === 'KEY_RESULT' && entityId) return `/dashboard/key-results/${entityId}`
    if (entityType === 'TODO' && entityId) return `/dashboard/todos?open=${entityId}`
    return '/dashboard'
  }

  // ── To-dos / initiatives ──
  if (entityType === 'TODO' && entityId) {
    // Initiative click in the app deep-links to /dashboard/todos with the id pre-opened in the modal.
    return `/dashboard/todos?open=${entityId}`
  }

  // ── Objectives / KRs ──
  if (entityType === 'OBJECTIVE' && entityId) return `/dashboard/objectives/${entityId}`
  if (entityType === 'KEY_RESULT' && entityId) {
    // Always go through the KR detail page (which inherits the objective shell).
    return `/dashboard/key-results/${entityId}`
  }

  // Default fallback
  return '/dashboard'
}
