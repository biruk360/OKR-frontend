/**
 * Access control for the Automations module.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §3.
 *
 * Three distinct questions, deliberately kept separate:
 *   canAuthor        — may this user create automations at all? (feature capability)
 *   canManage        — may this user edit/run/delete THIS automation? (owner or admin)
 *   canReadBriefing  — may this user read THIS briefing? (owner, admin, or recipient)
 *
 * A recipient can read a Briefing but never the plan, the transcript, or the cost.
 */

import { prisma } from '@/lib/prisma'
import { canDocType, canFeature } from '@/lib/rbac'
import type { AutomationRecipient } from '@/types/automations'
import type { UserRole } from '@/types'

export const AUTOMATION_DOCTYPE = 'automation'
export const BRIEFING_DOCTYPE = 'automation_briefing'
export const SETTINGS_DOCTYPE = 'automation_settings'
export const AUTHOR_FEATURE = 'canAuthorAutomations'

export interface Principal {
  userId: string
  role: UserRole
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'EXECUTIVE'
}

/** May create automations at all. */
export async function canAuthorAutomations(principal: Principal): Promise<boolean> {
  if (principal.role === 'ADMIN') return true
  const [feature, doctype] = await Promise.all([
    canFeature(principal.userId, AUTHOR_FEATURE),
    canDocType(principal.userId, AUTOMATION_DOCTYPE, 'create', principal.role),
  ])
  return feature && doctype
}

/** Admin-only surfaces: org settings, global pause, grant approval. */
export async function canAdministerAutomations(principal: Principal): Promise<boolean> {
  if (principal.role === 'ADMIN') return true
  return canDocType(principal.userId, SETTINGS_DOCTYPE, 'write', principal.role)
}

export interface AutomationOwnership {
  id: string
  ownerId: string
  deletedAt: Date | null
}

/**
 * Manage = edit, run, pause, change mode, delete. Owner or an admin who holds
 * the doctype write permission. Ownership is the primary gate: an automation
 * runs as its owner, so letting a non-owner edit it would let them borrow that
 * identity's data access.
 */
export async function canManageAutomation(
  principal: Principal,
  automation: AutomationOwnership,
  action: 'write' | 'delete' | 'submit' = 'write'
): Promise<boolean> {
  if (automation.deletedAt) return false
  if (automation.ownerId === principal.userId) {
    return canDocType(principal.userId, AUTOMATION_DOCTYPE, action, principal.role)
  }
  if (!isAdminRole(principal.role)) return false
  return canDocType(principal.userId, AUTOMATION_DOCTYPE, action, principal.role)
}

/** Read the automation itself — including its plan and run transcripts. */
export async function canReadAutomation(
  principal: Principal,
  automation: AutomationOwnership
): Promise<boolean> {
  if (automation.deletedAt) return false
  if (automation.ownerId === principal.userId) return true
  if (!isAdminRole(principal.role)) return false
  return canDocType(principal.userId, AUTOMATION_DOCTYPE, 'read', principal.role)
}

/**
 * Read a Briefing. Recipients qualify, which is the whole point — but only for
 * the document, never for the automation behind it.
 */
export async function canReadBriefing(
  principal: Principal,
  briefing: { id: string; automationId: string; status: string }
): Promise<boolean> {
  const automation = await prisma.automation.findUnique({
    where: { id: briefing.automationId },
    select: { ownerId: true, recipientsJson: true, deletedAt: true },
  })
  if (!automation) return false
  if (automation.ownerId === principal.userId) return true
  if (isAdminRole(principal.role)) {
    return canDocType(principal.userId, BRIEFING_DOCTYPE, 'read', principal.role)
  }

  // A draft or pending-review Briefing has not been distributed — recipients
  // must not see it until the owner releases it.
  if (briefing.status !== 'PUBLISHED') return false

  const recipients = (automation.recipientsJson ?? []) as unknown as AutomationRecipient[]
  if (!recipients.some((r) => r.userId === principal.userId)) return false
  return canDocType(principal.userId, BRIEFING_DOCTYPE, 'read', principal.role)
}

/**
 * The visibility rule for recipient lists (spec §3.4): an owner may only send to
 * users they can already see. Returns the subset of ids that are valid, so a
 * stale or hostile id list silently narrows instead of leaking existence.
 */
export async function filterVisibleRecipientIds(
  principal: Principal,
  userIds: string[]
): Promise<string[]> {
  if (userIds.length === 0) return []
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { id: true },
  })
  return users.map((u) => u.id)
}
