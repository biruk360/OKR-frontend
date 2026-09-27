/**
 * OKR realtime — channel naming, event contract and the pure channel-auth
 * verdict for objective / key-result detail pages.
 *
 * Pure (no Pusher, no Prisma import) so the server broadcaster (lib/pusher.ts),
 * the channel-auth route (app/api/pusher/auth) and the detail pages agree on one
 * contract, and so the rules can be unit-tested.
 *
 * Channels are PRIVATE and authorised per viewer:
 *   - `private-objective-<id>` — allowed only when `canViewObjective` returns
 *     canView && !isRedacted;
 *   - `private-keyresult-<id>` — allowed only when `canViewKeyResult` returns
 *     canView && !isRedacted.
 * A viewer who would see the entity REDACTED is refused, so the existence and
 * timing of changes to a private OKR never reach them live.
 *
 * Payloads are SIGNALS, not data: entity kind + ids + event kind + actorId + a
 * timestamp. Never titles, descriptions, values, comment bodies. The page
 * refetches through its normal permission-checked path (router.refresh()).
 */

export const OBJECTIVE_CHANNEL_PREFIX = 'private-objective-'
export const KEY_RESULT_CHANNEL_PREFIX = 'private-keyresult-'

/** Event names triggered on OKR channels (one Pusher event per kind). */
export const OKR_REALTIME_EVENTS = {
  UPDATED: 'okr:updated',
  CHECK_IN_CREATED: 'okr:check-in-created',
  KR_PROGRESS_CHANGED: 'okr:kr-progress-changed',
  COMMENT_ADDED: 'okr:comment-added',
  CLOSED: 'okr:closed',
  REOPENED: 'okr:reopened',
  ARCHIVED: 'okr:archived',
  UNARCHIVED: 'okr:unarchived',
  DELETED: 'okr:deleted',
} as const

export type OkrRealtimeEvent = (typeof OKR_REALTIME_EVENTS)[keyof typeof OKR_REALTIME_EVENTS]

/** Every OKR event name — what a detail page binds. */
export const OKR_REALTIME_EVENT_NAMES: readonly OkrRealtimeEvent[] = Object.values(OKR_REALTIME_EVENTS)

export type OkrRealtimeEntity = 'objective' | 'keyResult'

// cuid/uuid-shaped ids only — keeps odd channel names out of the DB lookup.
const OKR_ID = /^[A-Za-z0-9_-]{1,64}$/

export function objectiveRealtimeChannel(objectiveId: string): string {
  return `${OBJECTIVE_CHANNEL_PREFIX}${objectiveId}`
}

export function keyResultRealtimeChannel(keyResultId: string): string {
  return `${KEY_RESULT_CHANNEL_PREFIX}${keyResultId}`
}

/**
 * The entity a channel name refers to, or null when the name is not a
 * well-formed OKR channel. Used by the channel-auth route.
 */
export function parseOkrRealtimeChannel(
  channel: unknown,
): { entity: OkrRealtimeEntity; id: string } | null {
  if (typeof channel !== 'string') return null
  let entity: OkrRealtimeEntity
  let id: string
  if (channel.startsWith(OBJECTIVE_CHANNEL_PREFIX)) {
    entity = 'objective'
    id = channel.slice(OBJECTIVE_CHANNEL_PREFIX.length)
  } else if (channel.startsWith(KEY_RESULT_CHANNEL_PREFIX)) {
    entity = 'keyResult'
    id = channel.slice(KEY_RESULT_CHANNEL_PREFIX.length)
  } else {
    return null
  }
  return OKR_ID.test(id) ? { entity, id } : null
}

/**
 * Channel-auth verdict. `verdict` is the result of canViewObjective /
 * canViewKeyResult, or null when the entity is missing or DELETED (reads as
 * 403, like a forbidden one, so the endpoint cannot probe which ids exist).
 * Client-portal sessions never get OKR channels.
 */
export function canSubscribeToOkrChannel(
  verdict: { canView: boolean; isRedacted: boolean } | null,
  opts: { userType?: string | null } = {},
): boolean {
  if (opts.userType === 'CLIENT_PORTAL') return false
  if (!verdict) return false
  return verdict.canView === true && verdict.isRedacted === false
}

/** The whole payload of an OKR realtime event — ids and kinds only. */
export interface OkrRealtimePayload {
  entity: OkrRealtimeEntity
  /** The entity whose channel the change originated on. */
  id: string
  /** Parent objective id — set on key-result events. */
  objectiveId?: string
  /** Set when the event is relayed to a parent objective channel. */
  keyResultId?: string
  kind: OkrRealtimeEvent
  actorId: string | null
  /** ISO timestamp. */
  at: string
}

/**
 * Build a payload from explicit fields only. Anything else a caller might pass
 * (a title, a value, a comment body) is dropped — the whitelist is the contract.
 */
export function buildOkrRealtimePayload(input: {
  entity: OkrRealtimeEntity
  id: string
  kind: OkrRealtimeEvent
  actorId?: string | null
  objectiveId?: string | null
  keyResultId?: string | null
  at?: Date
}): OkrRealtimePayload {
  const payload: OkrRealtimePayload = {
    entity: input.entity,
    id: String(input.id),
    kind: input.kind,
    actorId: typeof input.actorId === 'string' && input.actorId ? input.actorId : null,
    at: (input.at ?? new Date()).toISOString(),
  }
  if (input.objectiveId) payload.objectiveId = String(input.objectiveId)
  if (input.keyResultId) payload.keyResultId = String(input.keyResultId)
  return payload
}

/**
 * Channels one key-result event is sent to: the KR's own channel, plus the
 * parent objective's channel (the objective page lists the KR and shows its
 * progress, so any KR change is relevant there).
 */
export function keyResultEventChannels(keyResultId: string, objectiveId?: string | null): string[] {
  const channels = [keyResultRealtimeChannel(keyResultId)]
  if (objectiveId) channels.push(objectiveRealtimeChannel(objectiveId))
  return channels
}
