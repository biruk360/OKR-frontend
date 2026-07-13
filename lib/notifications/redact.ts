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
  entityType?: 'OBJECTIVE' | 'KEY_RESULT' | 'TODO' | 'TIMEFRAME' | 'USER' | 'SCRUM_UPDATE'
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

/** Strip sensitive values (numbers, descriptions) from a template data blob. */
export function redactData<T extends Record<string, unknown>>(data: T, redacted: boolean): T {
  if (!redacted) return data
  const out: Record<string, unknown> = { ...data }
  for (const k of ['description', 'currentValue', 'startValue', 'targetValue', 'unit', 'analysis', 'content']) {
    if (k in out) out[k] = undefined
  }
  return out as T
}
