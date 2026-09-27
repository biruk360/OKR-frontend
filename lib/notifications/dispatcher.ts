/**
 * emit(event, payload) — single entry point domain code uses to fire a
 * notification event. The dispatcher:
 *   1. Resolves recipients per the email-matrix rule for this event.   ─┐ awaited by
 *      (plus the owner/manager scope redaction needs)                   ─┘ the caller
 *   2. Looks up each recipient's effective preference (in-app + email cadence). ─┐
 *   3. Builds a redacted variant per recipient (per isPrivate rule).             │ after the
 *   4. Writes in-app Notification rows (one INSERT … RETURNING).                 │ response
 *   5. Enqueues digest rows (one dedupe read + one INSERT).                      │ (runAfterResponse),
 *   6. Pushes to Pusher and sends IMMEDIATE email, 5 recipients at a time.      ─┘ see ./fanout.ts
 *
 * `emitNow` runs all six before resolving — for cron jobs and scripts.
 *
 * Errors are logged but never thrown — notification failure must not break the
 * user's primary action (creating an objective, saving a KR, etc.).
 */

import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { EVENT_META, type EventKey, type EventPayload } from './events'
import { getUserPrefsBulk } from './preferences'
import { displayTitle, redactData, shouldRedact } from './redact'
import {
  resolveAdmins, resolveManagersOf, resolveOwnerOfKeyResult, resolveOwnersOfObjective,
  resolveParentObjectiveOwner, resolveTeamMembers, resolveWatchers, uniqueIds,
} from './recipients'
import { renderTemplate } from '@/lib/email/templates'
import { buildDeepLink } from './deep-link'
import { broadcastUserNotification } from '@/lib/pusher'
import { toNotificationRow } from './row'
import { createEmitter, mapWithConcurrency, RECIPIENT_CONCURRENCY } from './fanout'

type RecipientRoleTag = 'OWNER' | 'MANAGER' | 'PARENT_OWNER' | 'ADMIN' | 'WATCHER' | 'TEAM' | 'EXPLICIT' | 'ASSIGNEE'

/**
 * Cron-fired reminders that must NEVER send IMMEDIATE email — they re-fire every
 * cron run for the same overdue entity, so respecting an IMMEDIATE pref produces
 * one email per day per item. These always coalesce into the user's DAILY digest.
 */
const FORCE_DIGEST_EVENTS: ReadonlySet<EventKey> = new Set<EventKey>([
  'CHECKIN_MISSED_7D', 'CHECKIN_MISSED_14D', 'CHECKIN_WEEKLY_DUE',
  'TODO_DUE_TOMORROW', 'TODO_DUE_TODAY', 'TODO_OVERDUE',
])

/**
 * The mirror of the above: time-critical events that must NEVER be coalesced
 * into a digest, whatever the user's cadence pref. A lead-time reminder the user
 * set for themselves ("5 minutes before") is worthless once batched into a daily
 * or weekly send — it would arrive hours or days after the deadline it exists to
 * warn about. Unlike FORCE_DIGEST_EVENTS these fire exactly once per entity
 * (guarded by Todo.dueReminderSentAt), so forcing IMMEDIATE cannot spam.
 */
const FORCE_IMMEDIATE_EVENTS: ReadonlySet<EventKey> = new Set<EventKey>([
  'TODO_DUE_REMINDER',
])

interface ResolvedRecipient {
  userId: string
  tags: RecipientRoleTag[]
}

/**
 * Resolve the recipient set for a given event — mirrors the email matrix.
 * Returns a Map userId → tags so templates can address "as owner" vs "as watcher".
 */
async function resolveRecipients(eventKey: EventKey, p: EventPayload): Promise<Map<string, Set<RecipientRoleTag>>> {
  const map = new Map<string, Set<RecipientRoleTag>>()
  const add = (id: string | null | undefined, tag: RecipientRoleTag) => {
    if (!id) return
    if (p.actorId && id === p.actorId && tag !== 'EXPLICIT') return // never self-notify for derived tags
    if (!map.has(id)) map.set(id, new Set())
    map.get(id)!.add(tag)
  }

  for (const id of p.explicitRecipients ?? []) add(id, 'EXPLICIT')

  // Per-event routing table — keep in sync with docs/User_Permissions.md matrix.
  switch (eventKey) {
    case 'ACCOUNT_INVITE':
    case 'ACCOUNT_VERIFY_EMAIL':
    case 'ACCOUNT_PASSWORD_RESET_REQUESTED':
      // target user only — must be passed as explicitRecipients
      break

    case 'ACCOUNT_PASSWORD_CHANGED':
      // Self-only — security-sensitive. Other roles do NOT get notified.
      if (p.entityId) add(p.entityId, 'EXPLICIT')
      break
    case 'ACCOUNT_ROLE_CHANGED':
    case 'ACCOUNT_DEACTIVATED':
      if (p.entityId) {
        add(p.entityId, 'EXPLICIT')
        for (const m of await resolveManagersOf(p.entityId)) add(m, 'MANAGER')
      }
      for (const a of await resolveAdmins()) add(a, 'ADMIN')
      break

    case 'OBJECTIVE_ASSIGNED':
    case 'KR_ASSIGNED': {
      const ownerId = p.entityType === 'KEY_RESULT' && p.entityId
        ? await resolveOwnerOfKeyResult(p.entityId)
        : p.entityId ? (await resolveOwnersOfObjective(p.entityId))[0] : null
      add(ownerId, 'OWNER')
      if (ownerId) for (const m of await resolveManagersOf(ownerId)) add(m, 'MANAGER')
      break
    }

    case 'OBJECTIVE_CREATED_IN_TEAM':
    case 'OBJECTIVE_EDITED':
    case 'OBJECTIVE_ARCHIVED':
    case 'OBJECTIVE_VISIBILITY_CHANGED': {
      if (p.entityId) {
        const owners = await resolveOwnersOfObjective(p.entityId)
        for (const o of owners) add(o, 'OWNER')
        if (owners[0]) for (const m of await resolveManagersOf(owners[0])) add(m, 'MANAGER')
        if (eventKey === 'OBJECTIVE_ARCHIVED' || eventKey === 'OBJECTIVE_EDITED') {
          const parent = await resolveParentObjectiveOwner(p.entityId)
          if (parent) add(parent, 'PARENT_OWNER')
        }
        for (const w of await resolveWatchers('OBJECTIVE', p.entityId)) add(w, 'WATCHER')
      }
      if (eventKey === 'OBJECTIVE_ARCHIVED') {
        for (const a of await resolveAdmins()) add(a, 'ADMIN')
      }
      break
    }

    case 'OBJECTIVE_ALIGNED_CHILD_ADDED': {
      // p.data.parentObjectiveId and childObjectiveId
      const parentId = p.data?.parentObjectiveId as string | undefined
      const childId = p.data?.childObjectiveId as string | undefined
      if (parentId) {
        for (const o of await resolveOwnersOfObjective(parentId)) add(o, 'PARENT_OWNER')
        for (const w of await resolveWatchers('OBJECTIVE', parentId)) add(w, 'WATCHER')
      }
      if (childId) {
        for (const o of await resolveOwnersOfObjective(childId)) add(o, 'OWNER')
      }
      break
    }

    case 'KR_ADDED_TO_OBJECTIVE':
    case 'KR_PROGRESS_UPDATED':
    case 'KR_AT_RISK':
    case 'KR_COMPLETED':
    case 'KR_ARCHIVED': {
      if (p.entityId) {
        const krOwner = await resolveOwnerOfKeyResult(p.entityId)
        add(krOwner, 'OWNER')
        if (krOwner) for (const m of await resolveManagersOf(krOwner)) add(m, 'MANAGER')
        const objectiveId = p.data?.objectiveId as string | undefined
        if (objectiveId) {
          const parent = await resolveParentObjectiveOwner(objectiveId)
          if (parent) add(parent, 'PARENT_OWNER')
        }
        for (const w of await resolveWatchers('KEY_RESULT', p.entityId)) add(w, 'WATCHER')
      }
      break
    }

    case 'CHECKIN_WEEKLY_DUE':
      if (p.entityId) add(p.entityId, 'OWNER') // entityId = userId here
      break

    case 'CHECKIN_MISSED_7D':
    case 'CHECKIN_MISSED_14D':
      if (p.entityId) {
        add(p.entityId, 'OWNER')
        for (const m of await resolveManagersOf(p.entityId)) add(m, 'MANAGER')
        if (eventKey === 'CHECKIN_MISSED_14D') {
          for (const a of await resolveAdmins()) add(a, 'ADMIN')
        }
      }
      break

    case 'TODO_ASSIGNED':
    case 'TODO_REASSIGNED_AWAY':
    case 'TODO_DUE_TOMORROW':
      if (p.entityId) {
        const todo = await prisma.todo.findUnique({ where: { id: p.entityId }, select: { assigneeId: true } })
        if (todo) add(todo.assigneeId, 'ASSIGNEE')
      }
      break

    case 'TODO_OVERDUE': {
      if (p.entityId) {
        const todo = await prisma.todo.findUnique({
          where: { id: p.entityId },
          select: { assigneeId: true, keyResult: { select: { ownerId: true } }, objective: { select: { ownerId: true } } },
        })
        if (todo) {
          if (todo.assigneeId) {
            add(todo.assigneeId, 'ASSIGNEE')
            for (const m of await resolveManagersOf(todo.assigneeId)) add(m, 'MANAGER')
          }
        }
      }
      break
    }

    case 'TODO_COMPLETED': {
      if (p.entityId) {
        const todo = await prisma.todo.findUnique({ where: { id: p.entityId }, select: { assigneeId: true } })
        if (todo) {
          if (todo.assigneeId) {
            for (const m of await resolveManagersOf(todo.assigneeId)) add(m, 'MANAGER')
          }
          for (const w of await resolveWatchers('TODO', p.entityId)) add(w, 'WATCHER')
        }
      }
      break
    }

    case 'SPRINT_TASK_ASSIGNED':
    case 'SPRINT_STARTING_TOMORROW':
    case 'SPRINT_ENDING_SOON':
    case 'SPRINT_ENDED_BY_USER':
    case 'SPRINT_REOPENED':
    case 'INITIATIVE_CARRIED_OVER':
    case 'INITIATIVE_CANCELLED_AT_CLOSE':
    case 'TODO_DUE_TODAY':
      // Recipients passed via explicitRecipients (sprint participants / assignees).
      break

    case 'TIMEFRAME_OPENED': {
      const rows = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } })
      for (const u of rows) add(u.id, 'EXPLICIT')
      break
    }

    case 'TIMEFRAME_ENDING_7D':
    case 'TIMEFRAME_CLOSING_1D':
    case 'TIMEFRAME_CLOSED': {
      // notify owners of objectives in the timeframe + their managers + (on CLOSING_1D/CLOSED) admins
      const timeframeId = p.entityId
      if (timeframeId) {
        const objectives = await prisma.objective.findMany({
          where: { timeframeId, status: 'ACTIVE' },
          select: { ownerId: true },
        })
        const ownerIds = uniqueIds(objectives.map((o) => o.ownerId))
        for (const id of ownerIds) {
          add(id, 'OWNER')
          for (const m of await resolveManagersOf(id)) add(m, 'MANAGER')
        }
        if (eventKey !== 'TIMEFRAME_ENDING_7D') {
          for (const a of await resolveAdmins()) add(a, 'ADMIN')
        }
      }
      break
    }

    case 'ALIGNMENT_REQUESTED': {
      const reportId = p.actorId
      if (reportId) for (const m of await resolveManagersOf(reportId)) add(m, 'MANAGER')
      break
    }

    case 'ALIGNMENT_DECISION': {
      if (p.entityId) {
        for (const o of await resolveOwnersOfObjective(p.entityId)) add(o, 'OWNER')
        const parentId = p.data?.parentObjectiveId as string | undefined
        if (parentId) for (const o of await resolveOwnersOfObjective(parentId)) add(o, 'PARENT_OWNER')
      }
      break
    }

    case 'PARENT_OBJECTIVE_ARCHIVED_ORPHAN': {
      const orphanedObjectiveId = p.data?.orphanedObjectiveId as string | undefined
      if (orphanedObjectiveId) {
        const owners = await resolveOwnersOfObjective(orphanedObjectiveId)
        for (const o of owners) {
          add(o, 'OWNER')
          for (const m of await resolveManagersOf(o)) add(m, 'MANAGER')
        }
      }
      break
    }

    case 'USER_MENTIONED':
      // explicitRecipients carries the mentioned user id(s)
      break

    case 'COMMENT_ON_OWNED_ENTITY': {
      const entType = p.data?.ownedEntityType as 'OBJECTIVE' | 'KEY_RESULT' | 'TODO' | undefined
      const entId = p.data?.ownedEntityId as string | undefined
      if (entType === 'OBJECTIVE' && entId) {
        for (const o of await resolveOwnersOfObjective(entId)) add(o, 'OWNER')
        for (const w of await resolveWatchers('OBJECTIVE', entId)) add(w, 'WATCHER')
      } else if (entType === 'KEY_RESULT' && entId) {
        const krOwner = await resolveOwnerOfKeyResult(entId)
        add(krOwner, 'OWNER')
        for (const w of await resolveWatchers('KEY_RESULT', entId)) add(w, 'WATCHER')
      } else if (entType === 'TODO' && entId) {
        const t = await prisma.todo.findUnique({ where: { id: entId }, select: { assigneeId: true, creatorId: true } })
        if (t) { add(t.assigneeId, 'OWNER'); add(t.creatorId, 'OWNER') }
        for (const w of await resolveWatchers('TODO', entId)) add(w, 'WATCHER')
      }
      break
    }

    case 'PERF_CYCLE_OPENED':
    case 'PERF_PANEL_COMPLETE':
    case 'PERF_DRAFT_SHARED':
    case 'PERF_DISPUTE_RAISED':
    case 'PERF_ACTION_RECOMMENDED':
    case 'PERF_WEEKLY_FOCUS':
      // Performance recipients are precisely known by the caller (evaluators,
      // lead, employee, performance admins) — always passed as explicitRecipients.
      break

    case 'ADMIN_USER_CREATED':
    case 'ADMIN_BULK_JOB_DONE':
    case 'ADMIN_SECURITY_ALERT':
    case 'ADMIN_WEEKLY_HEALTH_DIGEST':
    case 'ADMIN_MONTHLY_EXEC_SUMMARY':
      for (const a of await resolveAdmins()) add(a, 'ADMIN')
      if (eventKey === 'ADMIN_USER_CREATED' && p.data?.departmentId) {
        for (const u of await resolveTeamMembers(String(p.data.departmentId))) add(u, 'TEAM')
      }
      break
  }

  return map
}

/**
 * Everything delivery needs, captured while the caller is still awaiting.
 * Recipients and the redaction scope read entity state the caller has just
 * changed, so they are resolved here — not after the response, when a later
 * request may already have moved the entity on.
 */
interface EmitPlan {
  eventKey: EventKey
  payload: EventPayload
  recipients: Array<[string, RecipientRoleTag[]]>
  entityOwnerId: string | undefined
  managerIds: string[]
}

async function planEmit(eventKey: EventKey, payload: EventPayload): Promise<EmitPlan | null> {
  const meta = EVENT_META[eventKey]
  if (!meta) {
    console.warn('[notifications] unknown event key', eventKey)
    return null
  }
  if (!payload || typeof payload !== 'object') {
    console.warn('[notifications] emit called without a payload', eventKey)
    return null
  }

  // Snapshot: delivery runs after the caller returns, and callers reuse payload
  // objects across emits (keyresults check-ins sends one `emitBase` three times).
  const snapshot: EventPayload = {
    ...payload,
    explicitRecipients: payload.explicitRecipients ? [...payload.explicitRecipients] : undefined,
    data: payload.data ? { ...payload.data } : undefined,
  }

  const recipients = await resolveRecipients(eventKey, snapshot)
  if (recipients.size === 0) return null

  // Collect IDs of managers for redaction scoping (owners' managers see full detail).
  const entityOwnerId = (snapshot.entityType === 'USER' || snapshot.entityType === 'TIMEFRAME')
    ? snapshot.entityId
    : undefined
  let managerIds: string[] = []
  if (snapshot.isPrivate) {
    // Only consulted by shouldRedact/displayTitle, which both short-circuit
    // when the entity is not private — skip the owner/manager lookups otherwise.
    if (snapshot.entityType === 'OBJECTIVE' && snapshot.entityId) {
      const owners = await resolveOwnersOfObjective(snapshot.entityId)
      for (const o of owners) managerIds.push(...(await resolveManagersOf(o)))
    } else if (snapshot.entityType === 'KEY_RESULT' && snapshot.entityId) {
      const krOwner = await resolveOwnerOfKeyResult(snapshot.entityId)
      if (krOwner) managerIds = await resolveManagersOf(krOwner)
    }
  }

  return {
    eventKey,
    payload: snapshot,
    recipients: Array.from(recipients.entries()).map(([uid, tags]) => [uid, Array.from(tags)]),
    entityOwnerId,
    managerIds,
  }
}

/** One recipient's fully rendered delivery. */
interface RecipientDelivery {
  uid: string
  user: { id: string; email: string; name: string }
  tags: RecipientRoleTag[]
  inApp: boolean
  email: boolean
  effectiveCadence: string
  redacted: boolean
  rendered: { subject: string; text: string; html?: string | null }
  deepLink: string
  emailMode: string
}

async function deliverEmit(plan: EmitPlan): Promise<void> {
  const { eventKey, payload, entityOwnerId, managerIds } = plan
  const meta = EVENT_META[eventKey]
  const userIds = plan.recipients.map(([uid]) => uid)

  const [users, prefs] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true, email: true, name: true, role: true },
    }),
    getUserPrefsBulk(userIds, meta.category),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))

  // Auto-attach a deep link for every event so the email always points back to
  // the page that initiated it. Caller-supplied data.deepLink wins if present.
  // Recipient-independent, so computed once.
  const autoDeepLink = buildDeepLink({
    eventKey,
    entityType: payload.entityType,
    entityId: payload.entityId,
    data: payload.data ?? {},
  })

  // 1. Pure per-recipient work: gate, redact, render.
  const deliveries: RecipientDelivery[] = []
  for (const [uid, tags] of plan.recipients) {
    try {
      const user = userById.get(uid)
      if (!user) continue
      const pref = prefs.get(uid)
      if (!pref) continue
      if (!pref.inApp && !pref.email) continue

      const redactInput = {
        recipientId: uid,
        entityOwnerId,
        entityManagerIds: managerIds,
        recipientRole: user.role as any,
        isPrivate: payload.isPrivate ?? false,
        entityType: payload.entityType,
        entityTitle: payload.entityTitle,
      }
      const redacted = meta.redactable && shouldRedact(redactInput)
      const title = displayTitle(redactInput)

      const templateData = redactData({
        ...payload.data,
        deepLink: (payload.data?.deepLink as string | undefined) || autoDeepLink,
        entityTitle: title,
        entityType: payload.entityType,
        entityId: payload.entityId,
        recipientRole: tags,
      }, redacted)

      const rendered = renderTemplate(eventKey, {
        recipientName: user.name,
        ...templateData,
      })

      // Cron-driven reminder events are forced into DAILY digest regardless of pref —
      // see FORCE_DIGEST_EVENTS for rationale.
      const effectiveCadence = FORCE_DIGEST_EVENTS.has(eventKey)
        ? 'DAILY'
        : FORCE_IMMEDIATE_EVENTS.has(eventKey)
          ? 'IMMEDIATE'
          : pref.emailCadence

      deliveries.push({
        uid,
        user,
        tags,
        inApp: pref.inApp,
        email: pref.email,
        effectiveCadence,
        redacted,
        rendered,
        deepLink: String(templateData.deepLink ?? ''),
        emailMode: pref.email ? (pref.emailCadence === 'IMMEDIATE' ? 'IMMEDIATE' : `DIGEST_${pref.emailCadence}`) : 'DISABLED',
      })
    } catch (err) {
      console.error('[notifications] render failed', eventKey, uid, err)
    }
  }
  if (deliveries.length === 0) return

  // 2. In-app rows — one INSERT for every recipient. createManyAndReturn, not
  //    createMany: the Pusher payload carries the row id, so the bell can
  //    reconcile the pushed row with the one it later fetches.
  const rowByUser = new Map<string, Awaited<ReturnType<typeof prisma.notification.createManyAndReturn>>[number]>()
  const inAppDeliveries = deliveries.filter((d) => d.inApp)
  if (inAppDeliveries.length > 0) {
    try {
      const rows = await prisma.notification.createManyAndReturn({
        data: inAppDeliveries.map((d) => ({
          type: eventKey,
          eventKey,
          category: meta.category,
          title: d.rendered.subject,
          message: d.rendered.text.split('\n').slice(0, 3).join(' ').slice(0, 280),
          userId: d.uid,
          metadata: JSON.stringify({
            entityType: payload.entityType,
            entityId: payload.entityId,
            actorId: payload.actorId,
            redacted: d.redacted,
            tags: d.tags,
          }),
          redacted: d.redacted,
          emailMode: d.emailMode,
        })),
      })
      // Recipients are unique per emit, so userId identifies the row.
      for (const r of rows) rowByUser.set(r.userId, r)
    } catch (err) {
      // Email is an independent channel — a failed insert must not also cost
      // the recipient their email.
      console.error('[notifications] in-app insert failed', eventKey, err)
    }
  }

  // 3. Digest queue — dedupe against rows still queued for the same
  //    user+event+entity with one read, then one INSERT.
  //
  // Cron-driven reminders re-fire for the same entity every run, so they
  // keep the original UTC-day bound — one row per item per day however
  // often the cron ticks.
  //
  // Everything else dedupes only against UNSENT rows with no time bound.
  // That collapses duplicates inside a window while still allowing a new
  // notification once the batch has gone out. Keeping the day bound here
  // would have been actively wrong now that BATCHED is the default: a
  // second comment on the same to-do later in the day would be silently
  // dropped.
  const queued = deliveries.filter((d) => d.email && d.effectiveCadence !== 'IMMEDIATE')
  if (queued.length > 0) {
    try {
      const dedupeFrom = FORCE_DIGEST_EVENTS.has(eventKey)
        ? (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d })()
        : undefined
      const existing = await prisma.emailDigestQueue.findMany({
        where: {
          userId: { in: queued.map((d) => d.uid) },
          eventKey,
          sentAt: null,
          ...(dedupeFrom ? { queuedAt: { gte: dedupeFrom } } : {}),
          metadata: payload.entityId ? { contains: `"entityId":"${payload.entityId}"` } : undefined,
        },
        select: { userId: true },
      })
      const alreadyQueued = new Set(existing.map((e) => e.userId))
      const fresh = queued.filter((d) => !alreadyQueued.has(d.uid))
      if (fresh.length > 0) {
        await prisma.emailDigestQueue.createMany({
          data: fresh.map((d) => ({
            userId: d.uid,
            cadence: d.effectiveCadence,
            category: meta.category,
            eventKey,
            subject: d.rendered.subject,
            bodyText: d.rendered.text,
            bodyHtml: d.rendered.html ?? null,
            metadata: JSON.stringify({
              entityType: payload.entityType,
              entityId: payload.entityId,
              redacted: d.redacted,
              deepLink: d.deepLink,
            }),
          })),
        })
      }
    } catch (err) {
      console.error('[notifications] digest enqueue failed', eventKey, err)
    }
  }

  // 4. Network calls — Pusher and IMMEDIATE SMTP — in parallel with a bound,
  //    so one slow recipient no longer delays everyone after them.
  const results = await mapWithConcurrency(deliveries, RECIPIENT_CONCURRENCY, async (d) => {
    const row = rowByUser.get(d.uid)
    // Push it to the recipient's open tabs. Never fatal — the row is already
    // persisted, so a websocket failure must not surface as a failed notification.
    if (row) await broadcastUserNotification(d.uid, { ...toNotificationRow(row) })

    if (!d.email || d.effectiveCadence !== 'IMMEDIATE') return
    const res = await sendMail({
      to: d.user.email,
      toName: d.user.name,
      subject: d.rendered.subject,
      text: d.rendered.text,
      html: d.rendered.html ?? undefined,
      template: eventKey,
      metadata: { userId: d.uid, eventKey, redacted: d.redacted },
    })
    if (row) {
      await prisma.notification.updateMany({
        where: { id: row.id },
        data: { emailSent: res.status === 'SENT' || res.status === 'LOGGED_ONLY', emailAt: new Date(), outboundEmailId: res.id },
      })
    }
  })
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error('[notifications] recipient delivery failed', eventKey, deliveries[i].uid, r.reason)
    }
  })
}

const emitter = createEmitter<[EventKey, EventPayload], EmitPlan>({
  name: 'notifications',
  plan: planEmit,
  deliver: deliverEmit,
  // Same event on the same entity → deliveries run in order, so the digest
  // dedupe (read, then insert) never races with itself inside this process.
  keyOf: (p) => `${p.eventKey}:${p.payload.entityId ?? ''}`,
  labelOf: (p) => p.eventKey,
})

/**
 * Fire an event. Safe to await — never throws.
 *
 * Resolves recipients before resolving (so they reflect the state the caller
 * just wrote), then delivers after the HTTP response: preferences, in-app rows,
 * Pusher, IMMEDIATE email and digest queueing all run via runAfterResponse. A
 * delivery failure is logged under `[notifications]`, never thrown.
 *
 * Use `emitNow` when the next step depends on delivery having happened — cron
 * jobs, digests, short-lived scripts that exit when their main() resolves.
 */
export const emit: (eventKey: EventKey, payload: EventPayload) => Promise<void> = emitter.emit

/** Like `emit`, but resolves only after delivery has finished. Never throws. */
export const emitNow: (eventKey: EventKey, payload: EventPayload) => Promise<void> = emitter.emitNow
