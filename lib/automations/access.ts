/**
 * Access control for the Automations module.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §3, §7, §13.
 *
 * Four distinct questions, deliberately kept separate:
 *   canAuthor          — may this user create automations at all? (feature capability)
 *   canManage          — may this user edit/run/delete THIS automation? (owner, or ADMIN)
 *   canReadBriefing    — may this user read THIS briefing? (owner, admin, or recipient)
 *   canApproveToolGrants — may this user hand out a Tier-2 tool grant? (ADMIN only)
 *
 * A recipient can read a Briefing but never the plan, the transcript, or the cost.
 *
 * STRUCTURE — every predicate below is split in two halves:
 *   a PURE verdict function (`*Verdict`) holding all of the branching, and
 *   a thin async wrapper that does the prisma read and, for a CHECK_DOCTYPE
 *   verdict, awaits `canDocType`.
 * The branching is what privilege bugs hide in, so it is unit-tested directly in
 * access.test.ts without a database. `canDocType` itself is DB-backed and fails
 * closed; it is deliberately not re-implemented here.
 */

import { prisma } from '@/lib/prisma'
import { canDocType, canFeature } from '@/lib/rbac'
import type { AutomationRecipient, ToolGrant, ToolId } from '@/types/automations'
import type { UserRole } from '@/types'

export const AUTOMATION_DOCTYPE = 'automation'
export const BRIEFING_DOCTYPE = 'automation_briefing'
export const SETTINGS_DOCTYPE = 'automation_settings'
export const AUTHOR_FEATURE = 'canAuthorAutomations'
/** Seeded to ADMIN only by scripts/seed-automation-permissions.ts. */
export const GRANT_APPROVAL_FEATURE = 'canApproveAutomationGrants'

export interface Principal {
  userId: string
  role: UserRole
}

/**
 * Verdict of a pure authorisation predicate.
 *   ALLOW          — permitted outright, no further lookup.
 *   DENY           — refused; no doctype permission can override it.
 *   CHECK_DOCTYPE  — permitted only if the doctype matrix also allows the action.
 */
export type AccessVerdict = 'ALLOW' | 'DENY' | 'CHECK_DOCTYPE'

/**
 * Read-side admin. EXECUTIVE sees everything by design, so this stays in use for
 * read surfaces — but NOT for write/run/delete on someone else's automation (see
 * `automationManageVerdict`).
 */
export function isAdminRole(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'EXECUTIVE'
}

// ---------------------------------------------------------------------------
// Tool grants — the security boundary (spec §7, §13)
// ---------------------------------------------------------------------------

/**
 * Tier-0 tools an author may grant their own automation without approval.
 * `okr.query` is safe because it is re-scoped to the OWNER's live RBAC ceiling at
 * run time. Everything else (odoo.search, web.*, mail.*, site.login) reaches a
 * shared service account or the public internet, so the grantee must never be the
 * grantor: those require an ADMIN.
 */
export const SELF_SERVICE_TOOL_IDS: readonly ToolId[] = ['okr.query'] as const

export function isSelfServiceTool(tool: ToolId): boolean {
  return SELF_SERVICE_TOOL_IDS.includes(tool)
}

/**
 * The distinct tools in `grants` that a non-admin may not grant themselves.
 * Pure — order preserved, deduplicated, so the error message can name them.
 */
export function toolGrantsRequiringApproval(
  grants: ReadonlyArray<Pick<ToolGrant, 'tool'>> | null | undefined
): ToolId[] {
  const denied: ToolId[] = []
  for (const grant of grants ?? []) {
    if (!grant) continue
    if (isSelfServiceTool(grant.tool)) continue
    if (denied.includes(grant.tool)) continue
    denied.push(grant.tool)
  }
  return denied
}

/**
 * Pure gate for a requested grant list.
 * `approver` is the answer to "may this principal approve Tier-2 grants?".
 */
export function toolGrantVerdict(
  grants: ReadonlyArray<Pick<ToolGrant, 'tool'>> | null | undefined,
  approver: boolean
): { allowed: true } | { allowed: false; denied: ToolId[] } {
  const denied = toolGrantsRequiringApproval(grants)
  if (approver || denied.length === 0) return { allowed: true }
  return { allowed: false, denied }
}

/** Human-readable refusal naming the offending tools. */
export function toolGrantDenialMessage(denied: ToolId[]): string {
  const list = denied.join(', ')
  return `Tool grant requires administrator approval: ${list}. ` +
    `You may grant ${SELF_SERVICE_TOOL_IDS.join(', ')} yourself; ask an administrator to grant the rest.`
}

/**
 * May this principal hand out a Tier-2 grant? ADMIN outright; otherwise BOTH the
 * seeded capability AND the settings-write doctype, because `canFeature` fails
 * OPEN on an un-seeded table and must never be the only gate on a grant.
 */
export async function canApproveToolGrants(principal: Principal): Promise<boolean> {
  if (principal.role === 'ADMIN') return true
  const [feature, administers] = await Promise.all([
    canFeature(principal.userId, GRANT_APPROVAL_FEATURE),
    canAdministerAutomations(principal),
  ])
  return feature && administers
}

// ---------------------------------------------------------------------------
// Capability gates
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Per-automation predicates
// ---------------------------------------------------------------------------

/**
 * Manage = edit, run, pause, change mode, delete.
 *
 * Ownership is the primary gate: an automation runs as its owner, so letting a
 * non-owner edit it would let them borrow that identity's data access. That is
 * why the non-owner branch requires role ADMIN specifically and not
 * `isAdminRole` — an EXECUTIVE must not be able to repoint an ADMIN-owned
 * automation's grants, cost caps or recipients and then run it as that ADMIN.
 */
export function automationManageVerdict(
  principal: Principal,
  automation: Pick<AutomationOwnership, 'ownerId' | 'deletedAt'>
): AccessVerdict {
  if (automation.deletedAt) return 'DENY'
  if (automation.ownerId === principal.userId) return 'CHECK_DOCTYPE'
  if (principal.role !== 'ADMIN') return 'DENY'
  return 'CHECK_DOCTYPE'
}

export async function canManageAutomation(
  principal: Principal,
  automation: Pick<AutomationOwnership, 'ownerId' | 'deletedAt'>,
  action: 'write' | 'delete' | 'submit' = 'write'
): Promise<boolean> {
  const verdict = automationManageVerdict(principal, automation)
  if (verdict !== 'CHECK_DOCTYPE') return verdict === 'ALLOW'
  return canDocType(principal.userId, AUTOMATION_DOCTYPE, action, principal.role)
}

/** Read the automation itself — including its plan and run transcripts. */
export function automationReadVerdict(
  principal: Principal,
  automation: Pick<AutomationOwnership, 'ownerId' | 'deletedAt'>
): AccessVerdict {
  if (automation.deletedAt) return 'DENY'
  if (automation.ownerId === principal.userId) return 'ALLOW'
  if (!isAdminRole(principal.role)) return 'DENY'
  return 'CHECK_DOCTYPE'
}

export async function canReadAutomation(
  principal: Principal,
  automation: Pick<AutomationOwnership, 'ownerId' | 'deletedAt'>
): Promise<boolean> {
  const verdict = automationReadVerdict(principal, automation)
  if (verdict !== 'CHECK_DOCTYPE') return verdict === 'ALLOW'
  return canDocType(principal.userId, AUTOMATION_DOCTYPE, 'read', principal.role)
}

export interface BriefingReadInput {
  /** Owner of the automation the briefing belongs to. */
  ownerId: string
  /** Soft-delete marker of that automation. */
  deletedAt: Date | null
  /** Briefing status; only PUBLISHED has been distributed. */
  status: string
  /** User ids on the automation's recipient list. */
  recipientIds: string[]
}

/**
 * Read a Briefing. Recipients qualify, which is the whole point — but only for
 * the document, never for the automation behind it.
 *
 * `deletedAt` is a hard DENY for everyone, matching `automationReadVerdict` and
 * the briefings list route (which already filters `automation.deletedAt: null`).
 * Deleting an automation therefore withdraws its briefings from the detail,
 * export and promote routes too; the rows themselves survive for the retention
 * window as an audit record, they are simply no longer served.
 */
export function briefingReadVerdict(
  principal: Principal,
  briefing: BriefingReadInput
): AccessVerdict {
  if (briefing.deletedAt) return 'DENY'
  if (briefing.ownerId === principal.userId) return 'ALLOW'
  if (isAdminRole(principal.role)) return 'CHECK_DOCTYPE'

  // A draft or pending-review Briefing has not been distributed — recipients
  // must not see it until the owner releases it. This check MUST stay above the
  // recipient check: it is the whole of REVIEW mode.
  if (briefing.status !== 'PUBLISHED') return 'DENY'

  if (!briefing.recipientIds.includes(principal.userId)) return 'DENY'
  return 'CHECK_DOCTYPE'
}

export async function canReadBriefing(
  principal: Principal,
  briefing: { id: string; automationId: string; status: string }
): Promise<boolean> {
  const automation = await prisma.automation.findUnique({
    where: { id: briefing.automationId },
    select: { ownerId: true, recipientsJson: true, deletedAt: true },
  })
  if (!automation) return false

  const recipients = (automation.recipientsJson ?? []) as unknown as AutomationRecipient[]
  const verdict = briefingReadVerdict(principal, {
    ownerId: automation.ownerId,
    deletedAt: automation.deletedAt,
    status: briefing.status,
    recipientIds: Array.isArray(recipients)
      ? recipients.map((r) => r?.userId).filter((id): id is string => typeof id === 'string')
      : [],
  })
  if (verdict !== 'CHECK_DOCTYPE') return verdict === 'ALLOW'
  return canDocType(principal.userId, BRIEFING_DOCTYPE, 'read', principal.role)
}

// ---------------------------------------------------------------------------
// Recipient visibility (spec §3.3, §3.4)
// ---------------------------------------------------------------------------

/**
 * The facts a visibility decision needs, gathered in one place so the decision
 * itself stays pure and testable.
 */
export interface RecipientVisibilityFacts {
  /** Requested ids that exist and are active. */
  activeIds: string[]
  /** Requested ids sharing at least one current department with the principal. */
  departmentPeerIds: string[]
  /** Requested ids that are current direct reports of the principal. */
  directReportIds: string[]
  /** Requested ids that are current managers of the principal. */
  managerIds: string[]
}

export type RecipientVisibilityLoader = (
  principal: Principal,
  userIds: string[]
) => Promise<RecipientVisibilityFacts>

/**
 * The visibility rule for recipient lists (spec §3.3): an owner may only send to
 * users they can already see. A stale or hostile id list silently narrows instead
 * of leaking existence.
 *
 * ADMIN/EXECUTIVE see the whole org. Everyone else may address themselves, the
 * people in their own department(s), their direct reports and their own
 * manager(s) — the same population the user picker shows them. Anything else is
 * dropped, which is what stops an author from mailing AI-authored, company-
 * branded briefings to arbitrary user ids scraped from /api/users.
 */
export function visibleRecipientIds(
  principal: Principal,
  requestedIds: string[],
  facts: RecipientVisibilityFacts
): string[] {
  const active = new Set(facts.activeIds)
  const requested = requestedIds.filter((id) => active.has(id))
  if (isAdminRole(principal.role)) return dedupe(requested)

  const visible = new Set<string>([
    principal.userId,
    ...facts.departmentPeerIds,
    ...facts.directReportIds,
    ...facts.managerIds,
  ])
  return dedupe(requested.filter((id) => visible.has(id)))
}

function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids))
}

/** The prisma half of the visibility rule. Injectable so the rule is testable. */
export const loadRecipientVisibilityFacts: RecipientVisibilityLoader = async (
  principal,
  userIds
) => {
  const activeUsers = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { id: true },
  })
  const activeIds = activeUsers.map((u) => u.id)

  // Admins address the whole org; the relationship lookups would be wasted work.
  if (isAdminRole(principal.role) || activeIds.length === 0) {
    return { activeIds, departmentPeerIds: [], directReportIds: [], managerIds: [] }
  }

  const myDepartments = await prisma.departmentMembership.findMany({
    where: { userId: principal.userId, endedAt: null },
    select: { departmentId: true },
  })
  const departmentIds = myDepartments.map((m) => m.departmentId)

  const [peers, reports, managers] = await Promise.all([
    departmentIds.length > 0
      ? prisma.departmentMembership.findMany({
          where: { departmentId: { in: departmentIds }, endedAt: null, userId: { in: activeIds } },
          select: { userId: true },
        })
      : Promise.resolve([] as { userId: string }[]),
    prisma.managerRelationship.findMany({
      where: { managerId: principal.userId, endedAt: null, directReportId: { in: activeIds } },
      select: { directReportId: true },
    }),
    prisma.managerRelationship.findMany({
      where: { directReportId: principal.userId, endedAt: null, managerId: { in: activeIds } },
      select: { managerId: true },
    }),
  ])

  return {
    activeIds,
    departmentPeerIds: peers.map((p) => p.userId),
    directReportIds: reports.map((r) => r.directReportId),
    managerIds: managers.map((m) => m.managerId),
  }
}

/**
 * Narrow a requested recipient id list to the ids the principal may address.
 * Every write path (POST and PATCH) must run its recipients through this.
 */
export async function filterVisibleRecipientIds(
  principal: Principal,
  userIds: string[],
  load: RecipientVisibilityLoader = loadRecipientVisibilityFacts
): Promise<string[]> {
  if (userIds.length === 0) return []
  const facts = await load(principal, dedupe(userIds))
  return visibleRecipientIds(principal, userIds, facts)
}

/** Convenience for routes: drop recipient rows whose user the principal cannot see. */
export async function filterVisibleRecipients<T extends { userId: string }>(
  principal: Principal,
  recipients: T[],
  load: RecipientVisibilityLoader = loadRecipientVisibilityFacts
): Promise<T[]> {
  if (recipients.length === 0) return []
  const visible = await filterVisibleRecipientIds(
    principal,
    recipients.map((r) => r.userId),
    load
  )
  const allowed = new Set(visible)
  return recipients.filter((r) => allowed.has(r.userId))
}
