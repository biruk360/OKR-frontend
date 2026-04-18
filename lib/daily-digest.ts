import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { isCheckInOverdue, nextCheckInDue, type CheckInCadence } from '@/lib/check-in-cadence'
import { absoluteUrl } from '@/lib/notifications/deep-link'

function objectiveLink(id: string): string {
  return absoluteUrl(`/dashboard/objectives/${id}`)
}
function krLink(id: string): string {
  return absoluteUrl(`/dashboard/key-results/${id}`)
}
function initiativeLink(id: string): string {
  return absoluteUrl(`/dashboard/todos?open=${id}`)
}
function dashboardLink(): string {
  return absoluteUrl('/dashboard')
}

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

interface ActionItem {
  kind: 'CHECKIN_TODAY' | 'CHECKIN_OVERDUE' | 'TODO_DUE_TODAY' | 'TODO_OVERDUE' | 'KR_AT_RISK' | 'KR_OFF_TRACK'
  entityKind: 'OBJECTIVE' | 'KEY_RESULT' | 'TODO'
  id: string
  title: string
  detail: string // e.g. "Last check-in 8 days ago"
  href: string
}

interface YesterdayEvent {
  kind: 'CHECKIN_RECORDED' | 'COMMENT_ON_MINE' | 'TODO_ASSIGNED' | 'CONFIDENCE_CHANGED'
  title: string
  detail: string
  href: string
  at: Date
}

interface UpcomingItem {
  kind: 'CHECKIN_SOON' | 'TODO_DUE_SOON'
  entityKind: 'OBJECTIVE' | 'KEY_RESULT' | 'TODO'
  id: string
  title: string
  when: Date // due date
  daysAway: number
  href: string
}

interface DailyDigestData {
  actionsToday: ActionItem[]
  yesterdayActivity: YesterdayEvent[]
  upcomingThisWeek: UpcomingItem[]
  dayLabel: string   // e.g. "Friday, April 18"
  atRiskKrs: Array<{ id: string; title: string; progress: number; confidence: string }>
  offTrackKrs: Array<{ id: string; title: string; progress: number; confidence: string }>
}

// ───────────────────────────────────────────────────────────
// Build
// ───────────────────────────────────────────────────────────

export async function buildDailyDigest(userId: string): Promise<DailyDigestData | null> {
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const threeDaysFromNow = new Date(todayStart); threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
  const sevenDaysFromNow = new Date(todayStart); sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

  // Fetch the data we need in parallel
  const [ownedObjectives, ownedKrs, myTodos, checkInsYesterday, commentsYesterday, todosAssignedYesterday, confidenceChanges] = await Promise.all([
    prisma.objective.findMany({
      where: { ownerId: userId, status: 'ACTIVE' },
      select: { id: true, title: true, progress: true, goalStatus: true, checkInCadence: true, updatedAt: true },
    }),
    prisma.keyResult.findMany({
      where: { ownerId: userId, status: 'ACTIVE' },
      select: { id: true, title: true, progress: true, confidence: true, checkInCadence: true, updatedAt: true },
    }),
    prisma.todo.findMany({
      where: {
        OR: [{ assigneeId: userId }, { creatorId: userId }],
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      select: { id: true, title: true, status: true, dueDate: true, assigneeId: true, creatorId: true, createdAt: true },
    }),
    prisma.keyResultCheckIn.findMany({
      where: {
        keyResult: { ownerId: userId },
        createdAt: { gte: yesterdayStart, lt: todayStart },
        NOT: { createdById: userId }, // someone else checked in on my KR
      },
      select: {
        id: true, createdAt: true, value: true, confidence: true,
        createdBy: { select: { name: true } },
        keyResult: { select: { id: true, title: true } },
      },
      take: 10,
    }),
    prisma.comment.findMany({
      where: {
        createdAt: { gte: yesterdayStart, lt: todayStart },
        NOT: { authorId: userId },
        OR: [
          { objective: { ownerId: userId } },
          { keyResult: { ownerId: userId } },
        ],
      },
      select: {
        id: true, createdAt: true, content: true,
        author: { select: { name: true } },
        objective: { select: { id: true, title: true } },
        keyResult: { select: { id: true, title: true } },
      },
      take: 10,
    }),
    prisma.todo.findMany({
      where: {
        assigneeId: userId,
        createdAt: { gte: yesterdayStart, lt: todayStart },
      },
      select: {
        id: true, title: true, createdAt: true,
        creator: { select: { name: true } },
      },
      take: 10,
    }),
    prisma.confidenceSnapshot.findMany({
      where: {
        entityType: 'KEY_RESULT',
        entityId: { in: [] as string[] }, // placeholder — filled below
        createdAt: { gte: yesterdayStart, lt: todayStart },
        previousConf: { not: null },
      },
      select: { entityId: true, confidence: true, previousConf: true, createdAt: true },
      take: 10,
    }),
  ])

  // Filter confidence changes to user's KRs and transitions that got WORSE
  const ownedKrIds = new Set(ownedKrs.map(k => k.id))
  const degradingConfidenceChanges = confidenceChanges
    .filter(s => ownedKrIds.has(s.entityId))
    .filter(s => {
      const order: Record<string, number> = { ON_TRACK: 2, AT_RISK: 1, OFF_TRACK: 0 }
      return (order[s.confidence] ?? 2) < (order[s.previousConf!] ?? 2)
    })

  // Since the initial query filtered by empty ID list, re-fetch with actual owned KR IDs
  // (Doing it correctly now — above was just to discover the shape.)
  const actualConfidenceChanges = ownedKrIds.size > 0 ? await prisma.confidenceSnapshot.findMany({
    where: {
      entityType: 'KEY_RESULT',
      entityId: { in: Array.from(ownedKrIds) },
      createdAt: { gte: yesterdayStart, lt: todayStart },
      previousConf: { not: null },
    },
    select: { entityId: true, confidence: true, previousConf: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  }) : []
  const krById = new Map(ownedKrs.map(k => [k.id, k]))
  const realDegradingChanges = actualConfidenceChanges.filter(s => {
    const order: Record<string, number> = { ON_TRACK: 2, AT_RISK: 1, OFF_TRACK: 0 }
    return (order[s.confidence] ?? 2) < (order[s.previousConf!] ?? 2)
  })

  // ─── ACTIONS TODAY ───────────────────────────────────────────
  const actionsToday: ActionItem[] = []

  // Overdue & due-today check-ins (based on cadence)
  for (const o of ownedObjectives) {
    const cadence = (o.checkInCadence as CheckInCadence) || 'WEEKLY'
    const nextDue = nextCheckInDue(cadence, o.updatedAt)
    if (isCheckInOverdue(cadence, o.updatedAt)) {
      const daysOverdue = Math.floor((now.getTime() - nextDue.getTime()) / (24 * 60 * 60 * 1000))
      actionsToday.push({
        kind: 'CHECKIN_OVERDUE',
        entityKind: 'OBJECTIVE',
        id: o.id, title: o.title,
        detail: `Check-in ${daysOverdue}d overdue`,
        href: objectiveLink(o.id),
      })
    } else if (nextDue >= todayStart && nextDue < tomorrowStart) {
      actionsToday.push({
        kind: 'CHECKIN_TODAY',
        entityKind: 'OBJECTIVE',
        id: o.id, title: o.title,
        detail: 'Check-in due today',
        href: objectiveLink(o.id),
      })
    }
  }
  for (const kr of ownedKrs) {
    const cadence = (kr.checkInCadence as CheckInCadence) || 'WEEKLY'
    const nextDue = nextCheckInDue(cadence, kr.updatedAt)
    if (isCheckInOverdue(cadence, kr.updatedAt)) {
      const daysOverdue = Math.floor((now.getTime() - nextDue.getTime()) / (24 * 60 * 60 * 1000))
      actionsToday.push({
        kind: 'CHECKIN_OVERDUE',
        entityKind: 'KEY_RESULT',
        id: kr.id, title: kr.title,
        detail: `Check-in ${daysOverdue}d overdue`,
        href: krLink(kr.id),
      })
    } else if (nextDue >= todayStart && nextDue < tomorrowStart) {
      actionsToday.push({
        kind: 'CHECKIN_TODAY',
        entityKind: 'KEY_RESULT',
        id: kr.id, title: kr.title,
        detail: 'Check-in due today',
        href: krLink(kr.id),
      })
    }
  }

  // Overdue + due-today todos (only those assigned to this user)
  for (const t of myTodos) {
    if (t.assigneeId !== userId) continue
    if (!t.dueDate) continue
    if (t.dueDate < todayStart) {
      const daysOverdue = Math.ceil((todayStart.getTime() - t.dueDate.getTime()) / (24 * 60 * 60 * 1000))
      actionsToday.push({
        kind: 'TODO_OVERDUE',
        entityKind: 'TODO',
        id: t.id, title: t.title,
        detail: `${daysOverdue}d overdue`,
        href: initiativeLink(t.id),
      })
    } else if (t.dueDate >= todayStart && t.dueDate < tomorrowStart) {
      actionsToday.push({
        kind: 'TODO_DUE_TODAY',
        entityKind: 'TODO',
        id: t.id, title: t.title,
        detail: 'Due today',
        href: initiativeLink(t.id),
      })
    }
  }

  // ─── YESTERDAY'S ACTIVITY ────────────────────────────────────
  const yesterdayActivity: YesterdayEvent[] = []

  for (const c of checkInsYesterday) {
    yesterdayActivity.push({
      kind: 'CHECKIN_RECORDED',
      title: c.keyResult.title,
      detail: `${c.createdBy.name} checked in — new value ${c.value} · ${c.confidence.replace('_', ' ').toLowerCase()}`,
      href: krLink(c.keyResult.id),
      at: c.createdAt,
    })
  }
  for (const cm of commentsYesterday) {
    const snippet = cm.content.length > 80 ? cm.content.slice(0, 77) + '…' : cm.content
    if (cm.objective) {
      yesterdayActivity.push({
        kind: 'COMMENT_ON_MINE',
        title: cm.objective.title,
        detail: `${cm.author.name}: "${snippet}"`,
        href: objectiveLink(cm.objective.id),
        at: cm.createdAt,
      })
    } else if (cm.keyResult) {
      yesterdayActivity.push({
        kind: 'COMMENT_ON_MINE',
        title: cm.keyResult.title,
        detail: `${cm.author.name}: "${snippet}"`,
        href: krLink(cm.keyResult.id),
        at: cm.createdAt,
      })
    }
  }
  for (const t of todosAssignedYesterday) {
    yesterdayActivity.push({
      kind: 'TODO_ASSIGNED',
      title: t.title,
      detail: `${t.creator.name} assigned this to you`,
      href: initiativeLink(t.id),
      at: t.createdAt,
    })
  }
  for (const s of realDegradingChanges) {
    const kr = krById.get(s.entityId)
    if (!kr) continue
    yesterdayActivity.push({
      kind: 'CONFIDENCE_CHANGED',
      title: kr.title,
      detail: `Confidence slipped: ${s.previousConf!.replace('_', ' ').toLowerCase()} → ${s.confidence.replace('_', ' ').toLowerCase()}`,
      href: krLink(kr.id),
      at: s.createdAt,
    })
  }
  yesterdayActivity.sort((a, b) => b.at.getTime() - a.at.getTime())

  // ─── UPCOMING (next 3 days) ──────────────────────────────────
  const upcomingThisWeek: UpcomingItem[] = []
  for (const o of ownedObjectives) {
    const cadence = (o.checkInCadence as CheckInCadence) || 'WEEKLY'
    const nextDue = nextCheckInDue(cadence, o.updatedAt)
    if (nextDue > tomorrowStart && nextDue < threeDaysFromNow) {
      upcomingThisWeek.push({
        kind: 'CHECKIN_SOON',
        entityKind: 'OBJECTIVE',
        id: o.id, title: o.title,
        when: nextDue,
        daysAway: Math.ceil((nextDue.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000)),
        href: objectiveLink(o.id),
      })
    }
  }
  for (const kr of ownedKrs) {
    const cadence = (kr.checkInCadence as CheckInCadence) || 'WEEKLY'
    const nextDue = nextCheckInDue(cadence, kr.updatedAt)
    if (nextDue > tomorrowStart && nextDue < threeDaysFromNow) {
      upcomingThisWeek.push({
        kind: 'CHECKIN_SOON',
        entityKind: 'KEY_RESULT',
        id: kr.id, title: kr.title,
        when: nextDue,
        daysAway: Math.ceil((nextDue.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000)),
        href: krLink(kr.id),
      })
    }
  }
  for (const t of myTodos) {
    if (t.assigneeId !== userId) continue
    if (!t.dueDate) continue
    if (t.dueDate > tomorrowStart && t.dueDate < sevenDaysFromNow) {
      upcomingThisWeek.push({
        kind: 'TODO_DUE_SOON',
        entityKind: 'TODO',
        id: t.id, title: t.title,
        when: t.dueDate,
        daysAway: Math.ceil((t.dueDate.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000)),
        href: initiativeLink(t.id),
      })
    }
  }
  upcomingThisWeek.sort((a, b) => a.when.getTime() - b.when.getTime())

  // ─── At-risk + off-track KRs (top focus areas) ──────────────
  const atRiskKrs = ownedKrs
    .filter(k => k.confidence === 'AT_RISK')
    .sort((a, b) => a.progress - b.progress)
    .slice(0, 3)
  const offTrackKrs = ownedKrs
    .filter(k => k.confidence === 'OFF_TRACK')
    .sort((a, b) => a.progress - b.progress)
    .slice(0, 3)

  // Skip sending if there's nothing actionable
  if (
    actionsToday.length === 0 &&
    yesterdayActivity.length === 0 &&
    upcomingThisWeek.length === 0 &&
    atRiskKrs.length === 0 &&
    offTrackKrs.length === 0
  ) {
    return null
  }

  const dayLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return {
    actionsToday, yesterdayActivity, upcomingThisWeek,
    atRiskKrs, offTrackKrs,
    dayLabel,
  }
}

// ───────────────────────────────────────────────────────────
// Render — email-client safe tables + inline styles
// ───────────────────────────────────────────────────────────

const C = {
  bg: '#f3f4f6',
  card: '#ffffff',
  border: '#e5e7eb',
  text: '#111827',
  textMuted: '#6b7280',
  textSubtle: '#9ca3af',
  primary: '#2563eb',
  primaryBg: '#dbeafe',
  success: '#059669',
  successBg: '#d1fae5',
  warning: '#d97706',
  warningBg: '#fef3c7',
  danger: '#dc2626',
  dangerBg: '#fee2e2',
  muted: '#f9fafb',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function actionIcon(kind: ActionItem['kind']): string {
  switch (kind) {
    case 'CHECKIN_OVERDUE': return '🔴'
    case 'CHECKIN_TODAY': return '📝'
    case 'TODO_OVERDUE': return '⏰'
    case 'TODO_DUE_TODAY': return '📅'
    case 'KR_AT_RISK': return '⚠️'
    case 'KR_OFF_TRACK': return '❌'
    default: return '•'
  }
}

function yesterdayIcon(kind: YesterdayEvent['kind']): string {
  switch (kind) {
    case 'CHECKIN_RECORDED': return '✅'
    case 'COMMENT_ON_MINE': return '💬'
    case 'TODO_ASSIGNED': return '📌'
    case 'CONFIDENCE_CHANGED': return '📉'
    default: return '•'
  }
}

function renderActionsToday(actions: ActionItem[]): string {
  if (actions.length === 0) return ''
  const rows = actions.slice(0, 12).map(a => {
    const overdue = a.kind === 'CHECKIN_OVERDUE' || a.kind === 'TODO_OVERDUE'
    const color = overdue ? C.danger : C.warning
    const bg = overdue ? C.dangerBg : C.warningBg
    return `<tr>
      <td style="padding:10px 12px;border-top:1px solid ${C.border};vertical-align:top;">
        <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;">
          <tr>
            <td style="width:24px;padding-right:8px;font-size:14px;">${actionIcon(a.kind)}</td>
            <td>
              <a href="${a.href}" style="color:${C.text};text-decoration:none;font-size:13px;font-weight:500;">${escapeHtml(a.title)}</a>
              <div style="margin-top:2px;"><span style="display:inline-block;padding:2px 6px;border-radius:4px;background:${bg};color:${color};font-size:10px;font-weight:700;">${a.detail}</span></div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
  }).join('')

  return `<div style="border:1px solid ${C.warning};border-radius:8px;overflow:hidden;background:${C.card};margin-bottom:16px;">
    <div style="padding:12px 16px;background:${C.warningBg};border-bottom:1px solid ${C.warning};font-size:13px;font-weight:700;color:${C.text};">
      🔴 Needs you today (${actions.length})
    </div>
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${rows}</table>
  </div>`
}

function renderYesterday(events: YesterdayEvent[]): string {
  if (events.length === 0) return ''
  const rows = events.slice(0, 10).map(e => `<tr>
    <td style="padding:8px 12px;border-top:1px solid ${C.border};vertical-align:top;">
      <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;">
        <tr>
          <td style="width:22px;padding-right:8px;font-size:13px;">${yesterdayIcon(e.kind)}</td>
          <td>
            <a href="${e.href}" style="color:${C.text};text-decoration:none;font-size:13px;font-weight:500;">${escapeHtml(e.title)}</a>
            <div style="font-size:11px;color:${C.textMuted};margin-top:2px;">${escapeHtml(e.detail)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`).join('')

  return `<div style="border:1px solid ${C.border};border-radius:8px;overflow:hidden;background:${C.card};margin-bottom:16px;">
    <div style="padding:12px 16px;background:${C.muted};border-bottom:1px solid ${C.border};font-size:13px;font-weight:700;color:${C.text};">
      📝 Yesterday's activity
    </div>
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${rows}</table>
  </div>`
}

function renderFocusAreas(atRisk: DailyDigestData['atRiskKrs'], offTrack: DailyDigestData['offTrackKrs']): string {
  const all = [
    ...offTrack.map(k => ({ ...k, tone: 'off' as const })),
    ...atRisk.map(k => ({ ...k, tone: 'risk' as const })),
  ]
  if (all.length === 0) return ''

  const rows = all.map(k => {
    const isOff = k.tone === 'off'
    const color = isOff ? C.danger : C.warning
    const bg = isOff ? C.dangerBg : C.warningBg
    const label = isOff ? 'Off Track' : 'At Risk'
    return `<tr>
      <td style="padding:10px 12px;border-top:1px solid ${C.border};">
        <a href="${krLink(k.id)}" style="color:${C.text};text-decoration:none;font-size:13px;font-weight:500;">${escapeHtml(k.title)}</a>
        <div style="font-size:11px;color:${C.textMuted};margin-top:3px;">
          <span style="display:inline-block;padding:1px 6px;border-radius:4px;background:${bg};color:${color};font-size:10px;font-weight:700;margin-right:6px;">${label.toUpperCase()}</span>
          ${Math.round(k.progress)}% complete
        </div>
      </td>
    </tr>`
  }).join('')

  return `<div style="border:1px solid ${C.border};border-radius:8px;overflow:hidden;background:${C.card};margin-bottom:16px;">
    <div style="padding:12px 16px;background:${C.muted};border-bottom:1px solid ${C.border};font-size:13px;font-weight:700;color:${C.text};">
      🎯 Priority focus
    </div>
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${rows}</table>
  </div>`
}

function renderUpcoming(items: UpcomingItem[]): string {
  if (items.length === 0) return ''
  const rows = items.slice(0, 10).map(u => {
    const dayLabel = u.daysAway === 1 ? 'tomorrow' : `in ${u.daysAway} days`
    const kindLabel = u.kind === 'CHECKIN_SOON' ? 'Check-in' : 'Initiative due'
    return `<tr>
      <td style="padding:8px 12px;border-top:1px solid ${C.border};vertical-align:top;">
        <a href="${u.href}" style="color:${C.text};text-decoration:none;font-size:13px;font-weight:500;">${escapeHtml(u.title)}</a>
        <div style="font-size:11px;color:${C.textMuted};margin-top:2px;">${kindLabel} · ${dayLabel}</div>
      </td>
    </tr>`
  }).join('')

  return `<div style="border:1px solid ${C.border};border-radius:8px;overflow:hidden;background:${C.card};margin-bottom:16px;">
    <div style="padding:12px 16px;background:${C.muted};border-bottom:1px solid ${C.border};font-size:13px;font-weight:700;color:${C.text};">
      ⏰ Coming up this week
    </div>
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${rows}</table>
  </div>`
}

function renderDailyHtml(name: string, d: DailyDigestData): string {
  const actionCount = d.actionsToday.length
  const headerSubtitle = actionCount > 0
    ? `${actionCount} item${actionCount === 1 ? '' : 's'} need your attention today.`
    : `Here's your daily roundup for ${d.dayLabel}.`

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
  <body style="margin:0;padding:20px;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;margin:0 auto;border-collapse:collapse;">
      <tr><td>
        <!-- Header -->
        <div style="background:linear-gradient(135deg, #1e40af 0%, ${C.primary} 100%);border-radius:12px 12px 0 0;padding:24px 28px;color:#fff;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;margin-bottom:4px;">Daily OKR Digest · ${d.dayLabel}</div>
          <div style="font-size:20px;font-weight:700;line-height:1.2;margin-bottom:4px;">Good morning, ${escapeHtml(name.split(' ')[0])}</div>
          <div style="font-size:13px;opacity:0.9;">${headerSubtitle}</div>
        </div>

        <!-- Body -->
        <div style="background:${C.bg};padding:16px;border-radius:0 0 12px 12px;">
          ${renderActionsToday(d.actionsToday)}
          ${renderFocusAreas(d.atRiskKrs, d.offTrackKrs)}
          ${renderYesterday(d.yesterdayActivity)}
          ${renderUpcoming(d.upcomingThisWeek)}

          <!-- CTA -->
          <div style="text-align:center;margin:24px 0 8px;">
            <a href="${dashboardLink()}" style="display:inline-block;padding:12px 24px;background:${C.primary};color:#fff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;">Open Dashboard →</a>
          </div>

          <div style="text-align:center;font-size:11px;color:${C.textSubtle};margin-top:16px;padding-top:16px;border-top:1px solid ${C.border};">
            Sent by the OKR Management System &middot; Daily digest at 7am
          </div>
        </div>
      </td></tr>
    </table>
  </body>
</html>`
}

function renderDailyText(name: string, d: DailyDigestData): string {
  const lines: string[] = []
  lines.push(`Good morning, ${name.split(' ')[0]}`)
  lines.push(`Daily OKR Digest · ${d.dayLabel}`)
  lines.push('')

  if (d.actionsToday.length > 0) {
    lines.push(`━━ NEEDS YOU TODAY (${d.actionsToday.length}) ━━`)
    for (const a of d.actionsToday.slice(0, 12)) {
      lines.push(`${actionIcon(a.kind)} ${a.title} — ${a.detail}`)
      lines.push(`   ${a.href}`)
    }
    lines.push('')
  }

  if (d.offTrackKrs.length + d.atRiskKrs.length > 0) {
    lines.push('━━ PRIORITY FOCUS ━━')
    for (const k of d.offTrackKrs) lines.push(`❌ OFF TRACK: ${k.title} (${Math.round(k.progress)}%)`)
    for (const k of d.atRiskKrs) lines.push(`⚠️ AT RISK: ${k.title} (${Math.round(k.progress)}%)`)
    lines.push('')
  }

  if (d.yesterdayActivity.length > 0) {
    lines.push('━━ YESTERDAY\'S ACTIVITY ━━')
    for (const e of d.yesterdayActivity.slice(0, 10)) {
      lines.push(`${yesterdayIcon(e.kind)} ${e.title}`)
      lines.push(`   ${e.detail}`)
    }
    lines.push('')
  }

  if (d.upcomingThisWeek.length > 0) {
    lines.push('━━ COMING UP ━━')
    for (const u of d.upcomingThisWeek.slice(0, 10)) {
      const kindLabel = u.kind === 'CHECKIN_SOON' ? 'Check-in' : 'Initiative due'
      const dayLabel = u.daysAway === 1 ? 'tomorrow' : `in ${u.daysAway} days`
      lines.push(`• ${u.title} — ${kindLabel} ${dayLabel}`)
    }
    lines.push('')
  }

  lines.push(`Open dashboard: ${dashboardLink()}`)
  lines.push('')
  lines.push('— OKR Management System')
  return lines.join('\n')
}

// ───────────────────────────────────────────────────────────
// Runner
// ───────────────────────────────────────────────────────────

export async function runDailyDigest(): Promise<{ generated: number; skipped: number; errors: number }> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, email: true, name: true },
  })

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  let generated = 0
  let skipped = 0
  let errors = 0

  for (const user of users) {
    try {
      // Idempotency: track last DAILY digest via `lastDigestCadence = 'DAILY'`
      const state = await prisma.emailDigestState.findUnique({ where: { userId: user.id } })
      if (state?.lastDigestCadence === 'DAILY' && state.lastSentAt && state.lastSentAt >= startOfToday) {
        skipped++
        continue
      }

      const digest = await buildDailyDigest(user.id)
      if (!digest) {
        skipped++
        continue
      }

      const text = renderDailyText(user.name, digest)
      const html = renderDailyHtml(user.name, digest)

      const subject = digest.actionsToday.length > 0
        ? `Daily digest — ${digest.actionsToday.length} item${digest.actionsToday.length === 1 ? '' : 's'} need you today`
        : `Daily digest — ${digest.dayLabel}`

      await sendMail({
        to: user.email,
        toName: user.name,
        subject,
        text,
        html,
        template: 'daily-digest',
        metadata: {
          userId: user.id,
          actionsToday: digest.actionsToday.length,
          yesterdayEvents: digest.yesterdayActivity.length,
          offTrackCount: digest.offTrackKrs.length,
          atRiskCount: digest.atRiskKrs.length,
        },
      })

      await prisma.emailDigestState.upsert({
        where: { userId: user.id },
        create: { userId: user.id, lastSentAt: new Date(), lastDigestCadence: 'DAILY' },
        update: { lastSentAt: new Date(), lastDigestCadence: 'DAILY' },
      })
      generated++
    } catch (err) {
      console.error('[daily-digest] error for user', user.id, err)
      errors++
    }
  }

  return { generated, skipped, errors }
}
