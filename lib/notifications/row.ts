/**
 * One shape for a notification as the UI consumes it, derived in one place.
 *
 * The full-page list and the header bell both need the same row, and the four
 * writers in this codebase disagree about where they put the link: the
 * dispatcher writes `entityType`/`entityId`, `lib/comments.ts` writes `href`,
 * `lib/automations/delivery.ts` writes `url`, and some callers pre-compute
 * `deepLink`. Reading only a subset — which the page used to do — silently
 * renders those rows as unclickable. Everything funnels through here instead.
 */

import type { EntityType } from './deep-link'

export interface NotificationRow {
  id: string
  title: string
  message: string
  type: string
  category: string | null
  isRead: boolean
  createdAt: string
  deepLink: string | null
}

/** The persisted columns this module needs. Deliberately narrower than the model. */
export interface NotificationLike {
  id: string
  title: string
  message: string
  type: string
  category?: string | null
  isRead: boolean
  createdAt: Date
  metadata?: string | null
}

function linkForEntity(entityType: string | undefined, entityId: string | undefined): string | null {
  if (!entityId) return null
  switch (entityType as EntityType) {
    case 'OBJECTIVE': return `/dashboard/objectives/${entityId}`
    case 'KEY_RESULT': return `/dashboard/key-results/${entityId}`
    // Matches buildDeepLink: the to-dos page reads `?open=` and opens the card
    // modal. Dropping the id — as the page used to — lands on an unfiltered list.
    case 'TODO': return `/dashboard/todos?open=${entityId}`
    case 'PROJECT': return `/dashboard/projects/${entityId}`
    case 'SCRUM_UPDATE': return `/dashboard/scrum`
    default: return null
  }
}

/** Resolve the click target for a stored notification, or null if it has none. */
export function notificationDeepLink(metadata: string | null | undefined): string | null {
  if (!metadata) return null
  let m: Record<string, unknown>
  try {
    m = JSON.parse(metadata) as Record<string, unknown>
  } catch {
    return null // metadata is not JSON — nothing to derive
  }
  for (const key of ['deepLink', 'href', 'url'] as const) {
    const v = m[key]
    // Only same-origin paths: a stored absolute URL would let a writer point a
    // click anywhere, and every in-app destination is a path.
    if (typeof v === 'string' && v.startsWith('/')) return v
  }
  return linkForEntity(
    typeof m.entityType === 'string' ? m.entityType : undefined,
    typeof m.entityId === 'string' ? m.entityId : undefined,
  )
}

export function toNotificationRow(n: NotificationLike): NotificationRow {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    category: n.category ?? null,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
    deepLink: notificationDeepLink(n.metadata),
  }
}
