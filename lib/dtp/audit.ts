/**
 * Append-only audit writer for DTP. Every state transition + every Coordinator
 * field edit goes through here. Failures are logged but never thrown — the
 * caller's primary action must not break if audit logging hiccups.
 */

import { prisma } from '@/lib/prisma'
import type { DtpAction, DtpStatus } from '@/types/dtp'

export interface AuditInput {
  planId: string
  actorId?: string | null
  action: DtpAction
  fromStatus?: DtpStatus | null
  toStatus?: DtpStatus | null
  payload?: Record<string, unknown> | null
  ip?: string | null
  userAgent?: string | null
}

/** The `DtpEvent` row for an audit input. Exported so callers that need the
 * audit write inside their own transaction (transitionPlan) can create it on
 * the transaction client — where a failure must roll back, not be swallowed. */
export function dtpEventData(input: AuditInput) {
  return {
    planId: input.planId,
    actorId: input.actorId ?? null,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    payload: input.payload ? JSON.stringify(input.payload) : null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  }
}

export async function recordDtpEvent(input: AuditInput): Promise<void> {
  try {
    await prisma.dtpEvent.create({ data: dtpEventData(input) })
  } catch (err) {
    console.error('[dtp.audit] failed to write event', input.action, err)
  }
}
