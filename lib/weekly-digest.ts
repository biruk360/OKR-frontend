import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { isCheckInOverdue, type CheckInCadence } from '@/lib/check-in-cadence'
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

interface DigestObjective {
  id: string
  title: string
  level: string
  progress: number
  goalStatus: string
  cadence: CheckInCadence
  lastUpdate: Date
  timeframeName: string
  timeframeId: string
  timeframeEnd: Date
  closureStatus: string
  keyResults: DigestKeyResult[]
}

interface DigestKeyResult {
  id: string
  title: string
  progress: number
  confidence: string
  cadence: CheckInCadence
  lastUpdate: Date
  currentValue: number
  targetValue: number
  unit: string
  objectiveId: string
  closureStatus: string
}

interface DigestInitiative {
  id: string
  title: string
  status: string
  dueDate: Date | null
  keyResultTitle: string | null
}

interface DigestData {
  objectives: DigestObjective[]
  keyResults: DigestKeyResult[]
  initiatives: DigestInitiative[]
  // Derived metrics
  avgProgress: number
  confidenceScore: number
  onTrackCount: number
  atRiskCount: number
  offTrackCount: number
  overdueCheckIns: Array<{ kind: 'OBJECTIVE' | 'KEY_RESULT'; id: string; title: string; lastUpdate: Date; cadence: CheckInCadence }>
  overdueTodos: DigestInitiative[]
  dueThisWeek: DigestInitiative[]
  daysLeftInCycle: number | null
  cycleName: string | null
  periodCloseReminder: { timeframeId: string; timeframeName: string; endDate: Date; openCount: number } | null
}

/** Build the digest payload for a single user — comprehensive week-in-review. */
export async function buildUserDigest(userId: string): Promise<DigestData | null> {
  const now = new Date()
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7)

  const [objectives, initiatives] = await Promise.all([
    prisma.objective.findMany({
      where: { ownerId: userId, status: 'ACTIVE' },
      include: {
        timeframe: { select: { name: true, endDate: true } },
        keyResults: {
          where: { status: 'ACTIVE' },
          select: {
            id: true, title: true, progress: true, confidence: true,
            checkInCadence: true, updatedAt: true,
            currentValue: true, targetValue: true, unit: true,
            objectiveId: true,
            closureStatus: true,
          },
          orderBy: [{ confidence: 'asc' }, { progress: 'asc' }],
        },
      },
      orderBy: [{ level: 'asc' }, { progress: 'asc' }],
    }),
    prisma.todo.findMany({
      where: {
        OR: [{ assigneeId: userId }, { creatorId: userId }],
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      select: {
        id: true, title: true, status: true, dueDate: true,
        keyResult: { select: { title: true } },
      },
      orderBy: [{ dueDate: 'asc' }],
      take: 50,
    }),
  ])

  const digestObjectives: DigestObjective[] = objectives.map((o) => ({
    id: o.id,
    title: o.title,
    level: o.level,
    progress: o.progress,
    goalStatus: o.goalStatus,
    cadence: (o.checkInCadence as CheckInCadence) || 'WEEKLY',
    lastUpdate: o.updatedAt,
    timeframeName: o.timeframe.name,
    timeframeId: o.timeframeId,
    timeframeEnd: o.timeframe.endDate,
    closureStatus: o.closureStatus,
    keyResults: o.keyResults.map((kr) => ({
      id: kr.id,
      title: kr.title,
      progress: kr.progress,
      confidence: kr.confidence,
      cadence: (kr.checkInCadence as CheckInCadence) || 'WEEKLY',
      lastUpdate: kr.updatedAt,
      currentValue: kr.currentValue,
      targetValue: kr.targetValue,
      unit: kr.unit,
      objectiveId: kr.objectiveId,
      closureStatus: kr.closureStatus,
    })),
  }))

  const allKrs = digestObjectives.flatMap((o) => o.keyResults)
  const digestInitiatives: DigestInitiative[] = initiatives.map((i) => ({
    id: i.id,
    title: i.title,
    status: i.status,
    dueDate: i.dueDate,
    keyResultTitle: i.keyResult?.title ?? null,
  }))

  // Nothing to report — skip this user
  if (digestObjectives.length === 0 && digestInitiatives.length === 0) return null

  // Derived metrics
  const avgProgress = allKrs.length > 0
    ? Math.round(allKrs.reduce((s, k) => s + k.progress, 0) / allKrs.length)
    : 0
  const confidenceScore = allKrs.length > 0
    ? Math.round(allKrs.reduce((s, k) => s + (k.confidence === 'ON_TRACK' ? 100 : k.confidence === 'AT_RISK' ? 50 : 0), 0) / allKrs.length)
    : 0
  const onTrackCount = allKrs.filter((k) => k.confidence === 'ON_TRACK').length
  const atRiskCount = allKrs.filter((k) => k.confidence === 'AT_RISK').length
  const offTrackCount = allKrs.filter((k) => k.confidence === 'OFF_TRACK').length

  const overdueCheckIns: DigestData['overdueCheckIns'] = []
  for (const o of digestObjectives) {
    if (isCheckInOverdue(o.cadence, o.lastUpdate)) {
      overdueCheckIns.push({ kind: 'OBJECTIVE', id: o.id, title: o.title, lastUpdate: o.lastUpdate, cadence: o.cadence })
    }
  }
  for (const kr of allKrs) {
    if (isCheckInOverdue(kr.cadence, kr.lastUpdate)) {
      overdueCheckIns.push({ kind: 'KEY_RESULT', id: kr.id, title: kr.title, lastUpdate: kr.lastUpdate, cadence: kr.cadence })
    }
  }

  const overdueTodos = digestInitiatives.filter((i) => i.dueDate && i.dueDate < now)
  const dueThisWeek = digestInitiatives.filter((i) => i.dueDate && i.dueDate >= now && i.dueDate <= weekEnd)

  // Cycle end metrics (pick the most immediate active timeframe)
  const earliestEnd = digestObjectives
    .map((o) => objectives.find((x) => x.id === o.id)?.timeframe.endDate)
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0]
  const daysLeftInCycle = earliestEnd
    ? Math.max(0, Math.ceil((earliestEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : null
  const cycleName = digestObjectives[0]?.timeframeName ?? null
  const endedPeriods = new Map<string, { timeframeId: string; timeframeName: string; endDate: Date; openCount: number }>()
  for (const objective of digestObjectives) {
    if (objective.timeframeEnd > now) continue
    const current = endedPeriods.get(objective.timeframeId) || { timeframeId: objective.timeframeId, timeframeName: objective.timeframeName, endDate: objective.timeframeEnd, openCount: 0 }
    if (objective.closureStatus !== 'CLOSED') current.openCount++
    current.openCount += objective.keyResults.filter((kr) => kr.closureStatus !== 'CLOSED').length
    endedPeriods.set(objective.timeframeId, current)
  }
  const periodCloseReminder = [...endedPeriods.values()].filter((item) => item.openCount > 0).sort((a, b) => a.endDate.getTime() - b.endDate.getTime())[0] || null

  return {
    objectives: digestObjectives,
    keyResults: allKrs,
    initiatives: digestInitiatives,
    avgProgress, confidenceScore,
    onTrackCount, atRiskCount, offTrackCount,
    overdueCheckIns, overdueTodos, dueThisWeek,
    daysLeftInCycle, cycleName,
    periodCloseReminder,
  }
}

// ───────────────────────────────────────────────────────────
// TEXT VERSION
// ───────────────────────────────────────────────────────────

function renderDigestText(name: string, d: DigestData): string {
  const lines: string[] = []
  lines.push(`Hi ${name},`)
  lines.push('')
  lines.push('Here is your weekly OKR digest — a full week-in-review of everything you own.')
  lines.push('')

  lines.push('━━ HEADLINE ━━')
  lines.push(`Average progress: ${d.avgProgress}%`)
  lines.push(`Confidence score: ${d.confidenceScore}/100`)
  lines.push(`On track: ${d.onTrackCount}  ·  At risk: ${d.atRiskCount}  ·  Off track: ${d.offTrackCount}`)
  if (d.daysLeftInCycle !== null && d.cycleName) {
    lines.push(`${d.cycleName}: ${d.daysLeftInCycle} days remaining`)
  }
  if (d.periodCloseReminder) lines.push(`${d.periodCloseReminder.openCount} OKR(s) still open in ${d.periodCloseReminder.timeframeName} — close the period: ${absoluteUrl(`/dashboard/okrs-all/period-report/${d.periodCloseReminder.timeframeId}`)}`)
  lines.push('')

  if (d.overdueCheckIns.length > 0 || d.overdueTodos.length > 0 || d.atRiskCount > 0 || d.offTrackCount > 0) {
    lines.push('━━ NEEDS YOUR ATTENTION ━━')
    if (d.offTrackCount > 0) lines.push(`• ${d.offTrackCount} key result(s) off track`)
    if (d.atRiskCount > 0) lines.push(`• ${d.atRiskCount} key result(s) at risk`)
    if (d.overdueCheckIns.length > 0) lines.push(`• ${d.overdueCheckIns.length} check-in(s) overdue`)
    if (d.overdueTodos.length > 0) lines.push(`• ${d.overdueTodos.length} initiative(s) past due`)
    if (d.dueThisWeek.length > 0) lines.push(`• ${d.dueThisWeek.length} initiative(s) due this week`)
    lines.push('')
  }

  lines.push('━━ YOUR OBJECTIVES ━━')
  for (const o of d.objectives) {
    lines.push(`${o.title}  [${o.goalStatus}] — ${Math.round(o.progress)}%`)
    lines.push(`  Open: ${objectiveLink(o.id)}`)
    for (const kr of o.keyResults) {
      const statusTag = kr.confidence === 'OFF_TRACK' ? '❌' : kr.confidence === 'AT_RISK' ? '⚠️' : '✓'
      lines.push(`  ${statusTag} ${kr.title}`)
      lines.push(`     ${kr.currentValue}/${kr.targetValue} ${kr.unit}  ·  ${Math.round(kr.progress)}%  ·  ${kr.confidence.replace('_', ' ').toLowerCase()}`)
    }
    lines.push('')
  }

  if (d.initiatives.length > 0) {
    lines.push('━━ OPEN INITIATIVES ━━')
    for (const i of d.initiatives.slice(0, 20)) {
      const due = i.dueDate ? ` · due ${i.dueDate.toISOString().slice(0, 10)}` : ''
      lines.push(`• ${i.title} [${i.status}]${due}`)
    }
    lines.push('')
  }

  lines.push(`Open your dashboard: ${dashboardLink()}`)
  lines.push('')
  lines.push('— OKR Management System')
  return lines.join('\n')
}

// ───────────────────────────────────────────────────────────
// HTML VERSION — email-client safe: tables, inline styles
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

function confColors(conf: string) {
  if (conf === 'ON_TRACK') return { fg: C.success, bg: C.successBg, label: 'On track' }
  if (conf === 'AT_RISK') return { fg: C.warning, bg: C.warningBg, label: 'At risk' }
  if (conf === 'OFF_TRACK') return { fg: C.danger, bg: C.dangerBg, label: 'Off track' }
  return { fg: C.textMuted, bg: C.muted, label: conf }
}

function progressBar(pct: number, barColor: string, width = '100%'): string {
  const w = Math.max(0, Math.min(100, Math.round(pct)))
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="width:${width};border-collapse:collapse;">
    <tr><td style="background:${C.border};height:6px;border-radius:3px;overflow:hidden;">
      <div style="background:${barColor};height:6px;width:${w}%;border-radius:3px;"></div>
    </td></tr>
  </table>`
}

function kpiCard(label: string, value: string, color: string, helper?: string): string {
  return `<td valign="top" style="padding:14px 12px;border:1px solid ${C.border};background:${C.card};border-radius:8px;width:33.33%;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${C.textMuted};margin-bottom:4px;">${label}</div>
    <div style="font-size:26px;font-weight:700;color:${color};line-height:1;">${value}</div>
    ${helper ? `<div style="font-size:11px;color:${C.textMuted};margin-top:4px;">${helper}</div>` : ''}
  </td>`
}

function renderKpiGrid(d: DigestData): string {
  const progColor = d.avgProgress >= 70 ? C.success : d.avgProgress >= 40 ? C.warning : C.danger
  const confColor = d.confidenceScore >= 65 ? C.success : d.confidenceScore >= 35 ? C.warning : C.danger
  return `<table role="presentation" cellspacing="8" cellpadding="0" style="width:100%;border-collapse:separate;margin-bottom:8px;">
    <tr>
      ${kpiCard('Progress', `${d.avgProgress}%`, progColor, progressBar(d.avgProgress, progColor))}
      ${kpiCard('Confidence', `${d.confidenceScore}`, confColor, `${d.onTrackCount} on, ${d.atRiskCount} risk, ${d.offTrackCount} off`)}
      ${kpiCard('Cycle left', d.daysLeftInCycle !== null ? `${d.daysLeftInCycle}d` : '—', C.text, d.cycleName ?? 'No active cycle')}
    </tr>
  </table>`
}

function renderAttentionBox(d: DigestData): string {
  const items: string[] = []
  if (d.offTrackCount > 0) items.push(`<strong style="color:${C.danger};">${d.offTrackCount}</strong> key result${d.offTrackCount === 1 ? '' : 's'} off track`)
  if (d.atRiskCount > 0) items.push(`<strong style="color:${C.warning};">${d.atRiskCount}</strong> key result${d.atRiskCount === 1 ? '' : 's'} at risk`)
  if (d.overdueCheckIns.length > 0) items.push(`<strong style="color:${C.danger};">${d.overdueCheckIns.length}</strong> check-in${d.overdueCheckIns.length === 1 ? '' : 's'} overdue`)
  if (d.overdueTodos.length > 0) items.push(`<strong style="color:${C.danger};">${d.overdueTodos.length}</strong> initiative${d.overdueTodos.length === 1 ? '' : 's'} past due`)
  if (d.dueThisWeek.length > 0) items.push(`<strong style="color:${C.warning};">${d.dueThisWeek.length}</strong> initiative${d.dueThisWeek.length === 1 ? '' : 's'} due this week`)
  if (d.periodCloseReminder) items.push(`<strong style="color:${C.warning};">${d.periodCloseReminder.openCount}</strong> OKR${d.periodCloseReminder.openCount === 1 ? '' : 's'} still open in <a href="${absoluteUrl(`/dashboard/okrs-all/period-report/${d.periodCloseReminder.timeframeId}`)}" style="color:${C.primary};">${d.periodCloseReminder.timeframeName}</a>`)

  if (items.length === 0) {
    return `<div style="background:${C.successBg};border:1px solid ${C.success};border-radius:8px;padding:14px 16px;margin:16px 0;">
      <div style="font-size:14px;font-weight:600;color:${C.success};">🎉 Everything is on track!</div>
      <div style="font-size:13px;color:${C.text};margin-top:4px;">No overdue items, no at-risk KRs. Keep the momentum going.</div>
    </div>`
  }

  return `<div style="background:${C.warningBg};border:1px solid ${C.warning};border-radius:8px;padding:14px 16px;margin:16px 0;">
    <div style="font-size:14px;font-weight:700;color:${C.text};margin-bottom:8px;">⚠️ Needs your attention</div>
    <ul style="margin:0;padding-left:18px;color:${C.text};font-size:13px;line-height:1.7;">
      ${items.map((i) => `<li>${i}</li>`).join('')}
    </ul>
  </div>`
}

function renderObjective(o: DigestObjective): string {
  const statusC = confColors(o.goalStatus)
  const progColor = o.progress >= 70 ? C.success : o.progress >= 40 ? C.warning : C.danger
  const levelLabel = o.level === 'COMPANY' ? 'Company' : o.level === 'DEPARTMENT' ? 'Department' : 'Individual'

  const krRows = o.keyResults.map((kr) => {
    const c = confColors(kr.confidence)
    const krProgColor = kr.progress >= 70 ? C.success : kr.progress >= 40 ? C.warning : C.danger
    return `<tr>
      <td style="padding:10px 12px;border-top:1px solid ${C.border};vertical-align:top;">
        <div style="display:flex;align-items:start;">
          <div style="flex:1;min-width:0;">
            <a href="${krLink(kr.id)}" style="color:${C.text};text-decoration:none;font-size:13px;font-weight:500;line-height:1.3;">${escapeHtml(kr.title)}</a>
            <div style="font-size:11px;color:${C.textMuted};margin-top:3px;">
              ${kr.currentValue} / ${kr.targetValue} ${escapeHtml(kr.unit)}
            </div>
          </div>
        </div>
        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin-top:6px;border-collapse:collapse;">
          <tr>
            <td style="width:100%;padding-right:8px;">${progressBar(kr.progress, krProgColor)}</td>
            <td style="white-space:nowrap;font-size:11px;font-weight:600;color:${C.text};">${Math.round(kr.progress)}%</td>
            <td style="padding-left:8px;"><span style="display:inline-block;padding:2px 6px;border-radius:4px;background:${c.bg};color:${c.fg};font-size:10px;font-weight:700;">${c.label}</span></td>
          </tr>
        </table>
      </td>
    </tr>`
  }).join('')

  return `<div style="margin-bottom:16px;border:1px solid ${C.border};border-radius:8px;overflow:hidden;background:${C.card};">
    <div style="padding:14px 16px;background:${C.muted};border-bottom:1px solid ${C.border};">
      <div style="display:flex;align-items:center;margin-bottom:6px;">
        <span style="font-size:10px;font-weight:700;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.04em;margin-right:6px;">${levelLabel}</span>
        <span style="display:inline-block;padding:2px 6px;border-radius:4px;background:${statusC.bg};color:${statusC.fg};font-size:10px;font-weight:700;">${statusC.label.toUpperCase()}</span>
      </div>
      <a href="${objectiveLink(o.id)}" style="font-size:15px;font-weight:600;color:${C.text};text-decoration:none;line-height:1.3;">${escapeHtml(o.title)}</a>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin-top:8px;border-collapse:collapse;">
        <tr>
          <td style="width:100%;padding-right:10px;">${progressBar(o.progress, progColor)}</td>
          <td style="white-space:nowrap;font-size:13px;font-weight:700;color:${C.text};">${Math.round(o.progress)}%</td>
        </tr>
      </table>
    </div>
    ${krRows ? `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${krRows}</table>` : `<div style="padding:12px 16px;font-size:12px;color:${C.textMuted};font-style:italic;">No key results yet.</div>`}
  </div>`
}

function renderInitiatives(initiatives: DigestInitiative[]): string {
  if (initiatives.length === 0) return ''
  const now = new Date()
  const rows = initiatives.slice(0, 15).map((i) => {
    const isOverdue = i.dueDate && i.dueDate < now
    const dueStr = i.dueDate ? i.dueDate.toISOString().slice(0, 10) : '—'
    const dueColor = isOverdue ? C.danger : C.textMuted
    const statusBadge = i.status === 'IN_PROGRESS'
      ? `<span style="padding:1px 6px;border-radius:4px;background:${C.primaryBg};color:${C.primary};font-size:10px;font-weight:700;">IN PROGRESS</span>`
      : `<span style="padding:1px 6px;border-radius:4px;background:${C.muted};color:${C.textMuted};font-size:10px;font-weight:700;">TO DO</span>`
    return `<tr>
      <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;">
        <a href="${initiativeLink(i.id)}" style="color:${C.text};text-decoration:none;font-weight:500;">${escapeHtml(i.title)}</a>
        ${i.keyResultTitle ? `<div style="font-size:11px;color:${C.textMuted};margin-top:2px;">→ ${escapeHtml(i.keyResultTitle)}</div>` : ''}
      </td>
      <td style="padding:8px 12px;border-top:1px solid ${C.border};white-space:nowrap;">${statusBadge}</td>
      <td style="padding:8px 12px;border-top:1px solid ${C.border};white-space:nowrap;font-size:12px;color:${dueColor};font-weight:${isOverdue ? '700' : '400'};">${isOverdue ? '⚠ ' : ''}${dueStr}</td>
    </tr>`
  }).join('')

  return `<div style="border:1px solid ${C.border};border-radius:8px;overflow:hidden;background:${C.card};margin-bottom:16px;">
    <div style="padding:12px 16px;background:${C.muted};border-bottom:1px solid ${C.border};font-size:13px;font-weight:700;color:${C.text};">
      Open initiatives (${initiatives.length})
    </div>
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${rows}</table>
  </div>`
}

function renderOverdueCheckIns(d: DigestData): string {
  if (d.overdueCheckIns.length === 0) return ''
  const rows = d.overdueCheckIns.slice(0, 10).map((o) => {
    const link = o.kind === 'OBJECTIVE' ? objectiveLink(o.id) : krLink(o.id)
    const kindLabel = o.kind === 'OBJECTIVE' ? 'Objective' : 'Key result'
    const daysSince = Math.floor((Date.now() - o.lastUpdate.getTime()) / (24 * 60 * 60 * 1000))
    return `<tr>
      <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:11px;color:${C.textMuted};white-space:nowrap;">${kindLabel}</td>
      <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;"><a href="${link}" style="color:${C.text};text-decoration:none;">${escapeHtml(o.title)}</a></td>
      <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:11px;color:${C.danger};font-weight:600;white-space:nowrap;">${daysSince}d ago</td>
    </tr>`
  }).join('')
  return `<div style="border:1px solid ${C.danger};border-radius:8px;overflow:hidden;background:${C.card};margin-bottom:16px;">
    <div style="padding:12px 16px;background:${C.dangerBg};border-bottom:1px solid ${C.danger};font-size:13px;font-weight:700;color:${C.danger};">
      Overdue check-ins (${d.overdueCheckIns.length})
    </div>
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${rows}</table>
  </div>`
}

function renderDigestHtml(name: string, d: DigestData): string {
  const objectivesHtml = d.objectives.map(renderObjective).join('')

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
  <body style="margin:0;padding:20px;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;margin:0 auto;border-collapse:collapse;">
      <tr><td>

        <!-- Header -->
        <div style="background:linear-gradient(135deg, ${C.primary} 0%, #1e40af 100%);border-radius:12px 12px 0 0;padding:28px 28px 20px;color:#fff;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8;margin-bottom:6px;">Weekly OKR Digest</div>
          <div style="font-size:22px;font-weight:700;line-height:1.2;margin-bottom:4px;">Hi ${escapeHtml(name)},</div>
          <div style="font-size:14px;opacity:0.9;line-height:1.4;">
            Here's your complete week-in-review across ${d.objectives.length} objective${d.objectives.length === 1 ? '' : 's'} and ${d.keyResults.length} key result${d.keyResults.length === 1 ? '' : 's'}.
          </div>
        </div>

        <!-- Body -->
        <div style="background:${C.bg};padding:16px;border-radius:0 0 12px 12px;">

          <!-- KPI Grid -->
          ${renderKpiGrid(d)}

          <!-- Needs attention / all-clear -->
          ${renderAttentionBox(d)}

          <!-- Overdue check-ins (priority section) -->
          ${renderOverdueCheckIns(d)}

          <!-- Objectives with their KRs -->
          ${d.objectives.length > 0 ? `<div style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${C.textMuted};margin:20px 0 10px;padding:0 4px;">Your Objectives (${d.objectives.length})</div>${objectivesHtml}` : ''}

          <!-- Open initiatives -->
          ${renderInitiatives(d.initiatives)}

          <!-- CTA -->
          <div style="text-align:center;margin:24px 0 8px;">
            <a href="${dashboardLink()}" style="display:inline-block;padding:12px 24px;background:${C.primary};color:#fff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;">Open Dashboard →</a>
          </div>

          <div style="text-align:center;font-size:11px;color:${C.textSubtle};margin-top:16px;padding-top:16px;border-top:1px solid ${C.border};">
            Sent by the OKR Management System &middot; Weekly digest
          </div>

        </div>

      </td></tr>
    </table>
  </body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

/**
 * Generate and queue digests for every active user. Idempotent within a calendar day.
 */
export async function runWeeklyDigest(): Promise<{ generated: number; skipped: number; errors: number }> {
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
      const state = await prisma.emailDigestState.findUnique({ where: { userId: user.id } })
      if (state?.lastSentAt && state.lastSentAt >= startOfToday) {
        skipped++
        continue
      }

      const digest = await buildUserDigest(user.id)
      if (!digest) {
        skipped++
        continue
      }

      const text = renderDigestText(user.name, digest)
      const html = renderDigestHtml(user.name, digest)

      await sendMail({
        to: user.email,
        toName: user.name,
        subject: `Your weekly OKR digest — ${digest.avgProgress}% progress, ${digest.confidenceScore}/100 confidence`,
        text,
        html,
        template: 'weekly-digest',
        metadata: {
          userId: user.id,
          avgProgress: digest.avgProgress,
          confidenceScore: digest.confidenceScore,
          overdueCount: digest.overdueCheckIns.length,
          ownedObjectives: digest.objectives.length,
          ownedKeyResults: digest.keyResults.length,
        },
      })

      await prisma.emailDigestState.upsert({
        where: { userId: user.id },
        create: { userId: user.id, lastSentAt: new Date(), lastDigestCadence: 'WEEKLY' },
        update: { lastSentAt: new Date(), lastDigestCadence: 'WEEKLY' },
      })
      generated++
    } catch (err) {
      console.error('[weekly-digest] error for user', user.id, err)
      errors++
    }
  }

  return { generated, skipped, errors }
}
