/**
 * Common helpers for DTP API routes — JSON parsing, plan lookup with auth,
 * status transition wrapper that auto-writes the audit row.
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiNotFound, apiForbidden, apiConflict } from '@/lib/api'
import type { Session } from 'next-auth'
import { canTransition } from './state-machine'
import { dtpEventData } from './audit'
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

export interface TransitionArgs {
  planId: string
  from: DtpStatus
  to: DtpStatus
  action: DtpAction
  actorId: string | null
  payload?: Record<string, unknown> | null
  patch?: Record<string, unknown>
}

type UpdatedPlan = Awaited<ReturnType<typeof prisma.dailyTripPlan.update>>

export type TransitionResult =
  | { ok: true; plan: UpdatedPlan }
  /** INVALID_TRANSITION: the state machine forbids from→to.
   *  CONFLICT: the plan is no longer in `from` (a concurrent actor moved it, or it vanished). */
  | { ok: false; reason: 'INVALID_TRANSITION' | 'CONFLICT' }

function isRecordNotFound(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'P2025'
}

/**
 * Apply a status transition + write its audit row in ONE DB transaction.
 * The update is a compare-and-set on the current status
 * (`where: { id, status: from }`), so two concurrent actors can't both
 * transition the same plan: the loser matches no row (Prisma P2025), the
 * transaction rolls back (no audit row) and the result is CONFLICT → 409.
 */
export async function tryTransitionPlan(args: TransitionArgs): Promise<TransitionResult> {
  if (!canTransition(args.from, args.to)) return { ok: false, reason: 'INVALID_TRANSITION' }
  try {
    const plan = await prisma.$transaction(async (tx) => {
      const updated = await tx.dailyTripPlan.update({
        where: { id: args.planId, status: args.from },
        data: { status: args.to, ...(args.patch ?? {}) },
      })
      await tx.dtpEvent.create({
        data: dtpEventData({
          planId: args.planId,
          actorId: args.actorId,
          action: args.action,
          fromStatus: args.from,
          toStatus: args.to,
          payload: args.payload ?? null,
        }),
      })
      return updated
    })
    return { ok: true, plan }
  } catch (err) {
    if (isRecordNotFound(err)) return { ok: false, reason: 'CONFLICT' }
    throw err
  }
}

/** `tryTransitionPlan`, returning the updated plan or null when the transition
 * is invalid or lost a race (callers answer null with `badStatus()`). Routes
 * that want to tell the two apart use `tryTransitionPlan` + `transitionFailure`. */
export async function transitionPlan(args: TransitionArgs): Promise<UpdatedPlan | null> {
  const r = await tryTransitionPlan(args)
  return r.ok ? r.plan : null
}

/** HTTP response for a failed transition: 400 INVALID_STATE, or 409 CONFLICT
 * when another actor changed the plan's status first. */
export function transitionFailure(reason: 'INVALID_TRANSITION' | 'CONFLICT') {
  return reason === 'CONFLICT'
    ? apiConflict('This plan was changed by someone else — reload and try again', { reason: 'STATUS_CHANGED' })
    : badStatus()
}

export function badStatus(): ReturnType<typeof apiBadRequest> {
  return apiBadRequest('Plan is not in a state where this action is allowed', { reason: 'INVALID_STATE' })
}
