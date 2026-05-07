/**
 * Append-only audit writer for DTP. Every state transition + every Coordinator
 * field edit goes through here. Failures are logged but never thrown — the
 * caller's primary action must not break if audit logging hiccups.
 */

import { prisma } from '@/lib/prisma'
import type { DtpAction, DtpStatus } from '@/types/dtp'

interface AuditInput {
  planId: string
  actorId?: string | null
  action: DtpAction
  fromStatus?: DtpStatus | null
  toStatus?: DtpStatus | null
  payload?: Record<string, unknown> | null
  ip?: string | null
  userAgent?: string | null
}

export async function recordDtpEvent(input: AuditInput): Promise<void> {
  try {
    await prisma.dtpEvent.create({
      data: {
        planId: input.planId,
        actorId: input.actorId ?? null,
        action: input.action,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        payload: input.payload ? JSON.stringify(input.payload) : null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
  } catch (err) {
    console.error('[dtp.audit] failed to write event', input.action, err)
  }
}
