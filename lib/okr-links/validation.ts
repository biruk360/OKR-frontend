/**
 * OKR links (LNK) — pure validation and lineage helpers.
 *
 * No Prisma here: the service (`lib/okr-links/service.ts`) loads the facts for
 * both ends of a link (`OkrNodeFacts`) and asks these functions for a verdict, so
 * every rule is unit-tested in `validation.test.ts` without a database.
 *
 * Rules (docs/employee_operating_package_REQUIREMENTS.md §3.2):
 *   - Direction: `from` is the newer or lower item, `to` the older or higher one.
 *     "FY26/27 C5 SUCCEEDS FY25/26 4WCHWG", "EDN-O1 CONTRIBUTES_TO company KR1.3".
 *   - No self-links.
 *   - LNK-1: SUCCEEDS may cross timeframes; CONTRIBUTES_TO must stay inside one.
 *   - SUCCEEDS: `from` must not be older than `to` (its timeframe may not start
 *     earlier; inside one timeframe it may not have been created earlier).
 *   - CONTRIBUTES_TO: `from` must not sit at a higher level than `to`
 *     (INDIVIDUAL < DEPARTMENT < COMPANY; a KR has its objective's level), a KR
 *     may not contribute to its own objective and an objective not to one of its
 *     own KRs (that relation already exists structurally), and two items may not
 *     contribute to each other.
 *   - subKind and isPrimary only apply to SUCCEEDS.
 *   - LNK-2: a primary SUCCEEDS between two items of the same type mirrors into
 *     `rolledFromId` / `lineageRootId` / `lineageDepth` on the newer item.
 */
import {
  isOkrLinkEntityType,
  isOkrLinkKind,
  isOkrLinkSubKind,
  type OkrLinkEntityType,
  type OkrLinkKind,
  type OkrLinkSubKind,
} from '@/types/package'

export const OKR_LINK_NOTE_MAX = 500

export interface OkrLinkInput {
  fromType: OkrLinkEntityType
  fromId: string
  toType: OkrLinkEntityType
  toId: string
  kind: OkrLinkKind
  subKind?: OkrLinkSubKind | null
  isPrimary?: boolean
  note?: string | null
}

/** Everything the rules need about one end of a link. */
export interface OkrNodeFacts {
  type: OkrLinkEntityType
  id: string
  /** Objective id: the objective itself, or the KR's parent objective. */
  objectiveId: string
  timeframeId: string
  timeframeStart: Date
  /** Objective level (a KR inherits its objective's level). */
  level: string
  status: string
  createdAt: Date
  ownerId: string
  isLocked: boolean
  rolledFromId: string | null
  lineageRootId: string | null
  lineageDepth: number
}

export type OkrLinkErrorCode =
  | 'INVALID_TYPE'
  | 'INVALID_KIND'
  | 'INVALID_SUB_KIND'
  | 'SELF_LINK'
  | 'DELETED_ITEM'
  | 'TIMEFRAME_MISMATCH'
  | 'WRONG_DIRECTION'
  | 'STRUCTURAL_LINK'
  | 'REVERSE_EXISTS'
  | 'NOTE_TOO_LONG'

export interface OkrLinkViolation {
  code: OkrLinkErrorCode
  message: string
}

const LEVEL_RANK: Record<string, number> = { INDIVIDUAL: 1, DEPARTMENT: 2, COMPANY: 3 }

/** INDIVIDUAL 1 · DEPARTMENT 2 · COMPANY 3 · unknown 0 (treated as the lowest). */
export function levelRank(level: string | null | undefined): number {
  return (level && LEVEL_RANK[level]) || 0
}

/** Shape checks that need no database facts (types, kind, self-link, subKind, note). */
export function validateOkrLinkShape(input: {
  fromType: unknown
  fromId: unknown
  toType: unknown
  toId: unknown
  kind: unknown
  subKind?: unknown
  isPrimary?: unknown
  note?: unknown
}): OkrLinkViolation | null {
  if (!isOkrLinkEntityType(input.fromType) || !isOkrLinkEntityType(input.toType)) {
    return { code: 'INVALID_TYPE', message: 'Links connect objectives and key results only.' }
  }
  if (!isOkrLinkKind(input.kind)) {
    return { code: 'INVALID_KIND', message: 'Link kind must be SUCCEEDS or CONTRIBUTES_TO.' }
  }
  if (input.fromType === input.toType && input.fromId === input.toId) {
    return { code: 'SELF_LINK', message: 'An item cannot be linked to itself.' }
  }
  if (input.subKind != null && input.subKind !== '') {
    if (input.kind !== 'SUCCEEDS') {
      return { code: 'INVALID_SUB_KIND', message: 'Only SUCCEEDS links take a sub-kind.' }
    }
    if (!isOkrLinkSubKind(input.subKind)) {
      return { code: 'INVALID_SUB_KIND', message: 'Unknown SUCCEEDS sub-kind.' }
    }
  }
  if (input.isPrimary === true && input.kind !== 'SUCCEEDS') {
    return { code: 'INVALID_KIND', message: 'Only SUCCEEDS links can be primary.' }
  }
  if (typeof input.note === 'string' && input.note.length > OKR_LINK_NOTE_MAX) {
    return { code: 'NOTE_TOO_LONG', message: `Note must be ${OKR_LINK_NOTE_MAX} characters or fewer.` }
  }
  return null
}

/**
 * Full LNK-1 / direction validation with both ends loaded.
 * `reverseExists` — a link of the same kind already points the other way (to → from).
 */
export function validateOkrLink(
  input: Pick<OkrLinkInput, 'kind' | 'subKind' | 'isPrimary' | 'note'>,
  from: OkrNodeFacts,
  to: OkrNodeFacts,
  opts: { reverseExists?: boolean } = {},
): OkrLinkViolation | null {
  const shape = validateOkrLinkShape({
    fromType: from.type,
    fromId: from.id,
    toType: to.type,
    toId: to.id,
    kind: input.kind,
    subKind: input.subKind,
    isPrimary: input.isPrimary,
    note: input.note,
  })
  if (shape) return shape

  if (from.status === 'DELETED' || to.status === 'DELETED') {
    return { code: 'DELETED_ITEM', message: 'Deleted items cannot be linked.' }
  }

  if (input.kind === 'CONTRIBUTES_TO') {
    if (from.timeframeId !== to.timeframeId) {
      return {
        code: 'TIMEFRAME_MISMATCH',
        message: 'A "contributes to" link must stay inside one timeframe.',
      }
    }
    // A KR already contributes to its own objective; an objective already owns its KRs.
    const structural =
      (from.type === 'KEY_RESULT' && to.type === 'OBJECTIVE' && from.objectiveId === to.id) ||
      (from.type === 'OBJECTIVE' && to.type === 'KEY_RESULT' && to.objectiveId === from.id)
    if (structural) {
      return {
        code: 'STRUCTURAL_LINK',
        message: 'This item already rolls up to the target through its objective.',
      }
    }
    if (levelRank(from.level) > levelRank(to.level)) {
      return {
        code: 'WRONG_DIRECTION',
        message: 'Link from the lower-level item to the higher-level one (individual → department → company).',
      }
    }
  } else {
    const fromStart = from.timeframeStart.getTime()
    const toStart = to.timeframeStart.getTime()
    const fromIsOlder =
      fromStart < toStart ||
      (from.timeframeId === to.timeframeId && from.createdAt.getTime() < to.createdAt.getTime())
    if (fromIsOlder) {
      return {
        code: 'WRONG_DIRECTION',
        message: 'Link from the newer item to the one it succeeds.',
      }
    }
  }

  if (opts.reverseExists) {
    return {
      code: 'REVERSE_EXISTS',
      message: 'These items are already linked the other way round.',
    }
  }
  return null
}

/** LNK-2 applies only to a primary SUCCEEDS between two items of the same type. */
export function shouldMirrorLineage(link: {
  kind: string
  isPrimary: boolean
  fromType: string
  toType: string
}): boolean {
  return link.kind === 'SUCCEEDS' && link.isPrimary && link.fromType === link.toType
}

export interface LineageFields {
  rolledFromId: string | null
  lineageRootId: string | null
  lineageDepth: number
}

/** The lineage fields the newer item takes when it succeeds `predecessor` (same as the clone routes). */
export function lineageFromPredecessor(predecessor: {
  id: string
  lineageRootId: string | null
  lineageDepth: number
}): LineageFields {
  return {
    rolledFromId: predecessor.id,
    lineageRootId: predecessor.lineageRootId || predecessor.id,
    lineageDepth: (predecessor.lineageDepth ?? 0) + 1,
  }
}

/** Lineage fields of an item with no predecessor. */
export const EMPTY_LINEAGE: LineageFields = { rolledFromId: null, lineageRootId: null, lineageDepth: 0 }
