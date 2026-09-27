/**
 * Redaction helper — mirrors the `isPrivate` rule from docs/User_Permissions.md
 * for email bodies and in-app notification text. Returns the strings the
 * dispatcher should use for each recipient.
 */

export interface RedactInput {
  recipientId: string
  entityOwnerId?: string
  entityManagerIds?: string[]
  /** Admins always see full details. */
  recipientRole?: 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE'
  isPrivate: boolean
  entityType?: 'OBJECTIVE' | 'KEY_RESULT' | 'TODO' | 'TIMEFRAME' | 'USER' | 'PROJECT' | 'SCRUM_UPDATE'
  entityTitle?: string
}

export function shouldRedact(input: RedactInput): boolean {
  if (!input.isPrivate) return false
  if (input.recipientRole === 'ADMIN' || input.recipientRole === 'EXECUTIVE') return false
  if (input.entityOwnerId && input.entityOwnerId === input.recipientId) return false
  if (input.entityManagerIds?.includes(input.recipientId)) return false
  return true
}

export function displayTitle(input: RedactInput): string {
  if (!shouldRedact(input)) return input.entityTitle ?? '(untitled)'
  switch (input.entityType) {
    case 'OBJECTIVE': return '[Private Objective]'
    case 'KEY_RESULT': return '[Private Key Result]'
    case 'TODO': return '[Private To-do]'
    case 'SCRUM_UPDATE': return '[Private scrum update]'
    default: return '[Private item]'
  }
}

/**
 * Template-data keys that can carry a private entity's content: numbers,
 * descriptions, and the free-text previews templates print (comment `snippet`
 * for USER_MENTIONED / COMMENT_ON_OWNED_ENTITY, scrum `commentPreview` /
 * `blockerSummary`, and the aligned child objective's `childTitle`).
 */
export const REDACTED_DATA_KEYS = [
  'description', 'currentValue', 'startValue', 'targetValue', 'unit', 'analysis', 'content',
  'snippet', 'commentPreview', 'blockerSummary', 'childTitle',
] as const

/** Strip sensitive values (numbers, descriptions, free-text previews) from a template data blob. */
export function redactData<T extends Record<string, unknown>>(data: T, redacted: boolean): T {
  if (!redacted) return data
  const out: Record<string, unknown> = { ...data }
  for (const k of REDACTED_DATA_KEYS) {
    if (k in out) out[k] = undefined
  }
  return out as T
}
