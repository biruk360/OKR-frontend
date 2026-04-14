/**
 * Single source of truth for "where does this event live in the app?".
 *
 * The dispatcher calls `buildDeepLink()` to auto-attach a clickable URL to
 * every email, and `absoluteUrl()` ensures every path that lands in a template
 * is prefixed with NEXTAUTH_URL so it is clickable from a mail client.
 */

import type { EventKey } from './events'

export type EntityType = 'OBJECTIVE' | 'KEY_RESULT' | 'TODO' | 'TIMEFRAME' | 'USER'

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
  const { eventKey, entityType, entityId, data = {} } = args
  const path = pickPath(eventKey, entityType, entityId, data)
  return absoluteUrl(path)
}

function pickPath(eventKey: EventKey, entityType: EntityType | undefined, entityId: string | undefined, data: Record<string, unknown>): string {
  // ── Account ──
  if (eventKey === 'ACCOUNT_INVITE') return String(data.activationUrl ?? '/auth/reset-password')
  if (eventKey === 'ACCOUNT_VERIFY_EMAIL') return String(data.verifyUrl ?? '/auth/verify')
  if (eventKey === 'ACCOUNT_PASSWORD_RESET_REQUESTED') return String(data.resetUrl ?? '/auth/reset-password')
  if (eventKey === 'ACCOUNT_PASSWORD_CHANGED') return '/dashboard/settings/account'
  if (eventKey === 'ACCOUNT_ROLE_CHANGED' || eventKey === 'ACCOUNT_DEACTIVATED') {
    return entityId ? `/dashboard/org/users/${entityId}` : '/dashboard/settings/users'
  }

  // ── Admin / system ──
  if (eventKey === 'ADMIN_USER_CREATED') return entityId ? `/dashboard/org/users/${entityId}` : '/dashboard/settings/users'
  if (eventKey === 'ADMIN_BULK_JOB_DONE') return '/dashboard/settings'
  if (eventKey === 'ADMIN_SECURITY_ALERT') return '/dashboard/settings/audit-logs'
  if (eventKey === 'ADMIN_WEEKLY_HEALTH_DIGEST' || eventKey === 'ADMIN_MONTHLY_EXEC_SUMMARY') return '/dashboard/reports'

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
    return parent ? `/dashboard/objectives/${parent}` : '/dashboard/alignment-map'
  }
  if (eventKey === 'PARENT_OBJECTIVE_ARCHIVED_ORPHAN') {
    const orphan = data.orphanedObjectiveId as string | undefined
    return orphan ? `/dashboard/objectives/${orphan}` : '/dashboard/alignment-map'
  }
  if (eventKey === 'ALIGNMENT_REQUESTED' || eventKey === 'ALIGNMENT_DECISION') {
    return entityId ? `/dashboard/objectives/${entityId}` : '/dashboard/alignment-map'
  }

  // ── Comments / mentions: link to the entity the comment lives on ──
  if (eventKey === 'USER_MENTIONED' || eventKey === 'COMMENT_ON_OWNED_ENTITY') {
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
