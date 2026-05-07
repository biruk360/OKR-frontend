/**
 * Common helpers for DTP API routes — JSON parsing, plan lookup with auth,
 * status transition wrapper that auto-writes the audit row.
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiNotFound, apiForbidden } from '@/lib/api'
import type { Session } from 'next-auth'
import { canTransition } from './state-machine'
import { recordDtpEvent } from './audit'
import type { DtpStatus, DtpAction } from '@/types/dtp'
import { canReadPlan } from './permissions'

export async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}

/** Strip surrounding whitespace, return null for empty strings. */
export function trimOrNull(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const t = s.trim()
  return t.length === 0 ? null : t
}

/** Parse the URL-path date segment (YYYY-MM-DD) into a UTC midnight Date. */
export function parsePathDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

type Plan = NonNullable<Awaited<ReturnType<typeof prisma.dailyTripPlan.findUnique>>> & {
  stops: Awaited<ReturnType<typeof prisma.tripStop.findMany>>
  requester: { id: string; name: string; email: string }
  decidedBy: { id: string; name: string } | null
}

type LoadResult =
  | { ok: true; plan: Plan }
  | { ok: false; error: ReturnType<typeof apiNotFound> }

/** Fetch a plan + verify the session can read it. Returns a tagged union so
 * the caller can branch with `if (!r.ok) return r.error`. */
export async function loadReadablePlan(planId: string, session: Session): Promise<LoadResult> {
  const plan = await prisma.dailyTripPlan.findUnique({
    where: { id: planId },
    include: {
      stops: { orderBy: { seq: 'asc' } },
      requester: { select: { id: true, name: true, email: true } },
      decidedBy: { select: { id: true, name: true } },
    },
  })
  if (!plan || plan.deletedAt) return { ok: false, error: apiNotFound('Plan not found') }
  if (!(await canReadPlan(session, plan))) {
    return { ok: false, error: apiForbidden('You do not have access to this plan') }
  }
  return { ok: true, plan: plan as unknown as Plan }
}

/** Apply a status transition + write an audit row in one DB transaction.
 * Returns the updated plan or null if the transition was invalid. */
export async function transitionPlan(args: {
  planId: string
  from: DtpStatus
  to: DtpStatus
  action: DtpAction
  actorId: string | null
  payload?: Record<string, unknown> | null
  patch?: Record<string, unknown>
}) {
  if (!canTransition(args.from, args.to)) return null
  const updated = await prisma.dailyTripPlan.update({
    where: { id: args.planId },
    data: { status: args.to, ...(args.patch ?? {}) },
  })
  await recordDtpEvent({
    planId: args.planId,
    actorId: args.actorId,
    action: args.action,
    fromStatus: args.from,
    toStatus: args.to,
    payload: args.payload ?? null,
  })
  return updated
}

export function badStatus(): ReturnType<typeof apiBadRequest> {
  return apiBadRequest('Plan is not in a state where this action is allowed', { reason: 'INVALID_STATE' })
}
