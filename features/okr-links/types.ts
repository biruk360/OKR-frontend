/**
 * OKR links UI — client-side JSON shapes.
 *
 * `OkrLinkViewDto` / `OkrLinkListDto` mirror `OkrLinkView` / `OkrLinkList` in
 * `lib/okr-links/service.ts` (server-only, so it cannot be imported here) as they
 * cross the API boundary: `GET /api/okr-links?type=&id=` returns `OkrLinkListDto`.
 */
import type { ConnectionItem } from '@/lib/connections/types'
import type { OkrLinkEntityType, OkrLinkKind, OkrLinkSubKind } from '@/types/package'

export interface OkrLinkViewDto {
  id: string
  kind: OkrLinkKind
  subKind: OkrLinkSubKind | null
  isPrimary: boolean
  note: string | null
  createdAt: string
  /** OUTGOING: the subject is FROM. INCOMING: the subject is TO. */
  direction: 'OUTGOING' | 'INCOMING'
  /** The other end, redacted per CON-8 when the viewer may not see it. */
  counterpart: ConnectionItem
  /** Viewer may delete this link. */
  canDelete: boolean
}

export interface OkrLinkListDto {
  links: OkrLinkViewDto[]
  permissions: { canCreate: boolean }
}

/** Body of `POST /api/okr-links`. */
export interface CreateOkrLinkPayload {
  fromType: OkrLinkEntityType
  fromId: string
  toType: OkrLinkEntityType
  toId: string
  kind: OkrLinkKind
  subKind?: OkrLinkSubKind | null
  isPrimary?: boolean
  note?: string | null
  /** LNK-4: objective → company KR with no parent also sets parentObjectiveId. */
  setParent?: boolean
}

/** The item links start from (always the FROM end of a new link). */
export interface OkrLinkSubject {
  type: OkrLinkEntityType
  id: string
  title?: string | null
  /** Subject's timeframe: CONTRIBUTES_TO targets must share it (LNK-1). */
  timeframeId?: string | null
}

/** One pickable target in LinkManagerModal. */
export interface LinkTargetOption {
  type: OkrLinkEntityType
  id: string
  title: string
  level: string | null
  timeframeId: string | null
  timeframeName: string | null
  progress: number | null
  ownerName: string | null
  /** KR only: its objective. */
  objectiveId: string | null
  objectiveTitle: string | null
}
