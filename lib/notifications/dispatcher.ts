/**
 * emit(event, payload) — single entry point domain code uses to fire a
 * notification event. The dispatcher:
 *   1. Resolves recipients per the email-matrix rule for this event.
 *   2. Looks up each recipient's effective preference (in-app + email cadence).
 *   3. Builds a redacted variant per recipient (per isPrivate rule).
 *   4. Writes in-app Notification rows.
 *   5. Sends IMMEDIATE emails via lib/email.sendMail or enqueues to EmailDigestQueue.
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

type RecipientRoleTag = 'OWNER' | 'MANAGER' | 'PARENT_OWNER' | 'ADMIN' | 'WATCHER' | 'TEAM' | 'EXPLICIT' | 'ASSIGNEE'

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
          add(todo.assigneeId, 'ASSIGNEE')
          for (const m of await resolveManagersOf(todo.assigneeId)) add(m, 'MANAGER')
        }
      }
      break
    }

    case 'TODO_COMPLETED': {
      if (p.entityId) {
        const todo = await prisma.todo.findUnique({ where: { id: p.entityId }, select: { assigneeId: true } })
        if (todo) {
          for (const m of await resolveManagersOf(todo.assigneeId)) add(m, 'MANAGER')
          for (const w of await resolveWatchers('TODO', p.entityId)) add(w, 'WATCHER')
        }
      }
      break
    }

    case 'SPRINT_TASK_ASSIGNED':
    case 'SPRINT_STARTING_TOMORROW':
    case 'SPRINT_ENDING_SOON':
    case 'SPRINT_ENDED_BY_USER':
    case 'INITIATIVE_CARRIED_OVER':
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
 * Fire an event. Safe to await — never throws. Recipients, channels, and cadence
 * are resolved entirely inside this function; callers only provide the event
 * payload.
 */
export async function emit(eventKey: EventKey, payload: EventPayload): Promise<void> {
  try {
    const meta = EVENT_META[eventKey]
    if (!meta) {
      console.warn('[notifications] unknown event key', eventKey)
      return
    }

    const recipients = await resolveRecipients(eventKey, payload)
    if (recipients.size === 0) return

    const userIds = Array.from(recipients.keys())
    const [users, prefs] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds }, isActive: true },
        select: { id: true, email: true, name: true, role: true },
      }),
      getUserPrefsBulk(userIds, meta.category),
    ])
    const userById = new Map(users.map((u) => [u.id, u]))

    // Collect IDs of managers for redaction scoping (owners' managers see full detail).
    const entityOwnerId = (payload.entityType === 'USER' || payload.entityType === 'TIMEFRAME')
      ? payload.entityId
      : undefined
    let managerIds: string[] = []
    if (payload.entityType === 'OBJECTIVE' && payload.entityId) {
      const owners = await resolveOwnersOfObjective(payload.entityId)
      for (const o of owners) managerIds.push(...(await resolveManagersOf(o)))
    } else if (payload.entityType === 'KEY_RESULT' && payload.entityId) {
      const krOwner = await resolveOwnerOfKeyResult(payload.entityId)
      if (krOwner) managerIds = await resolveManagersOf(krOwner)
    }

    for (const [uid, tags] of Array.from(recipients.entries())) {
      const user = userById.get(uid)
      if (!user) continue
      const pref = prefs.get(uid)!
      if (!pref.inApp && !pref.email) continue

      const redacted = meta.redactable && shouldRedact({
        recipientId: uid,
        entityOwnerId,
        entityManagerIds: managerIds,
        recipientRole: user.role as any,
        isPrivate: payload.isPrivate ?? false,
        entityType: payload.entityType,
        entityTitle: payload.entityTitle,
      })

      const title = displayTitle({
        recipientId: uid,
        entityOwnerId,
        entityManagerIds: managerIds,
        recipientRole: user.role as any,
        isPrivate: payload.isPrivate ?? false,
        entityType: payload.entityType,
        entityTitle: payload.entityTitle,
      })

      // Auto-attach a deep link for every event so the email always points back to
      // the page that initiated it. Caller-supplied data.deepLink wins if present.
      const autoDeepLink = buildDeepLink({
        eventKey,
        entityType: payload.entityType,
        entityId: payload.entityId,
        data: payload.data ?? {},
      })
      const templateData = redactData({
        ...payload.data,
        deepLink: (payload.data?.deepLink as string | undefined) || autoDeepLink,
        entityTitle: title,
        entityType: payload.entityType,
        entityId: payload.entityId,
        recipientRole: Array.from(tags),
      }, redacted)

      const rendered = renderTemplate(eventKey, {
        recipientName: user.name,
        ...templateData,
      })

      // In-app row
      if (pref.inApp) {
        await prisma.notification.create({
          data: {
            type: eventKey,
            eventKey,
            category: meta.category,
            title: rendered.subject,
            message: rendered.text.split('\n').slice(0, 3).join(' ').slice(0, 280),
            userId: uid,
            metadata: JSON.stringify({
              entityType: payload.entityType,
              entityId: payload.entityId,
              actorId: payload.actorId,
              redacted,
              tags: Array.from(tags),
            }),
            redacted,
            emailMode: pref.email ? (pref.emailCadence === 'IMMEDIATE' ? 'IMMEDIATE' : `DIGEST_${pref.emailCadence}`) : 'DISABLED',
          },
        })
      }

      // Email
      if (!pref.email) continue
      if (pref.emailCadence === 'IMMEDIATE') {
        const res = await sendMail({
          to: user.email,
          toName: user.name,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          template: eventKey,
          metadata: { userId: uid, eventKey, redacted },
        })
        if (pref.inApp) {
          await prisma.notification.updateMany({
            where: { userId: uid, eventKey, emailSent: false },
            data: { emailSent: res.status === 'SENT' || res.status === 'LOGGED_ONLY', emailAt: new Date(), outboundEmailId: res.id },
          })
        }
      } else {
        await prisma.emailDigestQueue.create({
          data: {
            userId: uid,
            cadence: pref.emailCadence,
            category: meta.category,
            eventKey,
            subject: rendered.subject,
            bodyText: rendered.text,
            bodyHtml: rendered.html ?? null,
            metadata: JSON.stringify({
              entityType: payload.entityType,
              entityId: payload.entityId,
              redacted,
              deepLink: templateData.deepLink,
            }),
          },
        })
      }
    }
  } catch (err) {
    console.error('[notifications] emit failed', eventKey, err)
  }
}
