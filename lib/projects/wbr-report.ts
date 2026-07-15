import type { Prisma, ProjectReport } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { businessDaysBetween } from './business-days'

export const WBR_REPORT_TYPE = 'WBR'

export interface WbrRedItem {
  projectId: string
  projectCode: string
  projectName: string
  ragStatus: string
  ownerName: string
  committedRecoveryDate: string | null
  noRecoveryPlan: boolean
  reason: string
  carriedForward: boolean
}

export interface WbrContent {
  header: {
    title: 'Weekly Business Review'
    reportingDate: string
    period: string
    version: number
  }
  portfolioHeadline: string
  portfolioSpi: number | null
  weekOverWeek: {
    spiDelta: number | null
    redCountDelta: number
    delayDaysDelta: number
  }
  redItems: WbrRedItem[]
  delayLedgerSummary: {
    totalDaysLost: number
    byOwner: Record<string, number>
    noRecoveryPlanCount: number
  }
  pendingClientActions: Array<{
    projectCode: string
    projectName: string
    count: number
    maxDaysWaiting: number
  }>
  resourceHeat: Array<{
    ownerName: string
    allocationPct: number
    projectCount: number
  }>
  escalations: string[]
}

export function currentWeeklyPeriod(now = new Date()): { start: Date; end: Date } {
  const day = now.getUTCDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday, 0, 0, 0, 0))
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  end.setUTCHours(23, 59, 59, 999)
  return { start, end }
}

export function portfolioSpi(projects: readonly { spi: number | null; contractValue: number | null }[]): number | null {
  const withSpi = projects.filter((project) => project.spi != null)
  if (withSpi.length === 0) return null
  const totalWeight = withSpi.reduce((sum, project) => sum + Math.max(0, project.contractValue ?? 0), 0)
  const weighted = totalWeight > 0
    ? withSpi.reduce((sum, project) => sum + (project.spi ?? 0) * Math.max(0, project.contractValue ?? 0), 0) / totalWeight
    : withSpi.reduce((sum, project) => sum + (project.spi ?? 0), 0) / withSpi.length
  return round2(weighted)
}

export function markRecoveryPlan(item: Omit<WbrRedItem, 'noRecoveryPlan'>): WbrRedItem {
  return {
    ...item,
    noRecoveryPlan: !item.committedRecoveryDate,
  }
}

export function mergeCarryForwardRedItems(
  current: readonly WbrRedItem[],
  previous: readonly WbrRedItem[],
  currentProjectState: Map<string, { ragStatus: string; status: string }>
): WbrRedItem[] {
  const byProject = new Map(current.map((item) => [item.projectId, item]))
  for (const item of previous) {
    if (byProject.has(item.projectId)) continue
    const state = currentProjectState.get(item.projectId)
    if (!state || state.ragStatus === 'GREEN' || state.status === 'COMPLETED' || state.status === 'CANCELLED') continue
    byProject.set(item.projectId, markRecoveryPlan({ ...item, carriedForward: true }))
  }
  return [...byProject.values()].sort((a, b) => Number(b.noRecoveryPlan) - Number(a.noRecoveryPlan) || a.projectCode.localeCompare(b.projectCode))
}

export async function generateWbrPack(opts: { actorId?: string; now?: Date } = {}): Promise<{
  report: ProjectReport
  created: boolean
  recipients: string[]
}> {
  const now = opts.now ?? new Date()
  const period = currentWeeklyPeriod(now)
  const existing = await prisma.projectReport.findFirst({
    where: { projectId: null, type: WBR_REPORT_TYPE, periodStart: period.start, periodEnd: period.end },
    orderBy: { generatedAt: 'desc' },
  })
  const recipients = await resolveWbrRecipients()
  if (existing) return { report: existing, created: false, recipients }

  const content = await buildWbrContent(period.start, period.end, now)
  const report = await prisma.projectReport.create({
    data: {
      projectId: null,
      type: WBR_REPORT_TYPE,
      periodStart: period.start,
      periodEnd: period.end,
      status: 'DRAFT',
      aiSummary: content.portfolioHeadline,
      contentJson: content as unknown as Prisma.InputJsonValue,
    },
  })
  return { report, created: true, recipients }
}

export async function buildWbrContent(periodStart: Date, periodEnd: Date, now = new Date()): Promise<WbrContent> {
  const [projects, delays, previous] = await Promise.all([
    prisma.project.findMany({
      where: { archivedAt: null, status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] } },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        ragStatus: true,
        spi: true,
        contractValue: true,
        projectManagerId: true,
        percentComplete: true,
        percentPlanned: true,
      },
      orderBy: { code: 'asc' },
    }),
    prisma.delayEvent.findMany({
      where: { createdAt: { lte: periodEnd } },
      select: {
        projectId: true,
        daysLost: true,
        owner: true,
        reason: true,
        recoveryOwner: true,
        recoveryDate: true,
        project: { select: { code: true, name: true, ragStatus: true, status: true, projectManagerId: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.projectReport.findFirst({
      where: { projectId: null, type: WBR_REPORT_TYPE, periodEnd: { lt: periodEnd } },
      orderBy: { periodEnd: 'desc' },
    }),
  ])

  const pmIds = [...new Set(projects.map((project) => project.projectManagerId))]
  const users = await prisma.user.findMany({ where: { id: { in: pmIds } }, select: { id: true, name: true, email: true } })
  const userById = new Map(users.map((user) => [user.id, user]))
  const latestDelayByProject = new Map<string, (typeof delays)[number]>()
  for (const delay of delays) {
    if (!latestDelayByProject.has(delay.projectId)) latestDelayByProject.set(delay.projectId, delay)
  }

  const currentRedItems = projects
    .filter((project) => project.ragStatus === 'RED' || project.status === 'ON_HOLD')
    .map((project) => {
      const delay = latestDelayByProject.get(project.id)
      const owner = delay?.recoveryOwner || userById.get(project.projectManagerId)?.name || userById.get(project.projectManagerId)?.email || 'Project Manager'
      return markRecoveryPlan({
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        ragStatus: project.ragStatus,
        ownerName: owner,
        committedRecoveryDate: isoDate(delay?.recoveryDate),
        reason: delay ? humanize(delay.reason) : `${project.ragStatus} project health`,
        carriedForward: false,
      })
    })
  const currentProjectState = new Map(projects.map((project) => [project.id, { ragStatus: project.ragStatus, status: project.status }]))
  const previousContent = previous?.contentJson as Partial<WbrContent> | null | undefined
  const redItems = mergeCarryForwardRedItems(currentRedItems, previousContent?.redItems ?? [], currentProjectState)

  const spi = portfolioSpi(projects)
  const totalDaysLost = round1(delays.reduce((sum, delay) => sum + delay.daysLost, 0))
  const byOwner = delays.reduce<Record<string, number>>((acc, delay) => {
    acc[delay.owner] = round1((acc[delay.owner] ?? 0) + delay.daysLost)
    return acc
  }, {})
  const pendingClientActions = await pendingApprovalRows(now)
  const resourceHeat = await resourceHeatRows()

  const prev = previousContent
  const redCountDelta = redItems.length - (prev?.redItems?.length ?? 0)
  const delayDaysDelta = round1(totalDaysLost - (prev?.delayLedgerSummary?.totalDaysLost ?? 0))
  const spiDelta = spi == null || prev?.portfolioSpi == null ? null : round2(spi - prev.portfolioSpi)
  const escalations = [
    ...redItems.filter((item) => item.noRecoveryPlan).map((item) => `${item.projectCode}: NO RECOVERY PLAN`),
    ...pendingClientActions.filter((row) => row.maxDaysWaiting >= 5).map((row) => `${row.projectCode}: client action waiting ${row.maxDaysWaiting} business days`),
    ...resourceHeat.filter((row) => row.allocationPct > 100).map((row) => `${row.ownerName}: ${row.allocationPct}% allocation`),
  ]

  return {
    header: {
      title: 'Weekly Business Review',
      reportingDate: isoDate(now) ?? '',
      period: `${isoDate(periodStart)} to ${isoDate(periodEnd)}`,
      version: 1,
    },
    portfolioHeadline: `${projects.length} active projects · Portfolio SPI ${spi == null ? 'n/a' : spi.toFixed(2)} · ${redItems.length} red item${redItems.length === 1 ? '' : 's'} · ${redItems.filter((item) => item.noRecoveryPlan).length} without recovery plan`,
    portfolioSpi: spi,
    weekOverWeek: { spiDelta, redCountDelta, delayDaysDelta },
    redItems,
    delayLedgerSummary: {
      totalDaysLost,
      byOwner,
      noRecoveryPlanCount: redItems.filter((item) => item.noRecoveryPlan).length,
    },
    pendingClientActions,
    resourceHeat,
    escalations,
  }
}

export async function resolveWbrRecipients(): Promise<string[]> {
  const [settings, execs, pms] = await Promise.all([
    prisma.organizationSettings.findUnique({ where: { id: 'singleton' }, select: { companyCeoUserId: true } }).catch(() => null),
    prisma.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'EXECUTIVE'] } }, select: { id: true } }),
    prisma.project.findMany({
      where: { archivedAt: null, status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] } },
      select: { projectManagerId: true },
    }),
  ])
  return [...new Set([
    settings?.companyCeoUserId,
    ...execs.map((user) => user.id),
    ...pms.map((project) => project.projectManagerId),
  ].filter((id): id is string => Boolean(id)))]
}

export function renderWbrPdfHtml(report: ProjectReport): string {
  const content = report.contentJson as unknown as WbrContent
  const redRows = content.redItems.map((item) => `<tr class="${item.noRecoveryPlan ? 'danger' : ''}"><td>${escapeHtml(item.projectCode)}</td><td>${escapeHtml(item.projectName)}</td><td>${escapeHtml(item.ownerName)}</td><td>${item.committedRecoveryDate ?? 'NO RECOVERY PLAN'}</td><td>${escapeHtml(item.reason)}</td><td>${item.carriedForward ? 'Yes' : 'No'}</td></tr>`).join('')
  const actionRows = content.pendingClientActions.map((row) => `<tr><td>${escapeHtml(row.projectCode)}</td><td>${escapeHtml(row.projectName)}</td><td>${row.count}</td><td>${row.maxDaysWaiting}d</td></tr>`).join('')
  const heatRows = content.resourceHeat.map((row) => `<tr class="${row.allocationPct > 100 ? 'danger' : ''}"><td>${escapeHtml(row.ownerName)}</td><td>${row.allocationPct}%</td><td>${row.projectCount}</td></tr>`).join('')
  const delayRows = Object.entries(content.delayLedgerSummary.byOwner).map(([owner, days]) => `<tr><td>${escapeHtml(owner)}</td><td>${days}d</td></tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8" />
    <style>
      body { font-family: Inter, Arial, sans-serif; color: #172033; margin: 28px; font-size: 12px; }
      h1 { font-size: 25px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 22px 0 8px; }
      .muted { color: #667085; } .headline { border: 1px solid #d0d5dd; border-radius: 8px; padding: 12px; background: #f8fafc; font-size: 14px; }
      .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
      .kpi { border: 1px solid #d0d5dd; border-radius: 8px; padding: 8px; } .kpi b { display: block; font-size: 18px; }
      table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #e4e7ec; padding: 6px; text-align: left; vertical-align: top; }
      th { color: #475467; font-size: 11px; text-transform: uppercase; background: #f8fafc; } .danger td { color: #b42318; font-weight: 700; }
    </style></head><body>
    <h1>Weekly Business Review</h1>
    <div class="muted">${content.header.period} · Generated ${content.header.reportingDate}</div>
    <h2>Portfolio Headline</h2><div class="headline">${escapeHtml(content.portfolioHeadline)}</div>
    <div class="kpis">
      <div class="kpi"><span>Portfolio SPI</span><b>${content.portfolioSpi == null ? '-' : content.portfolioSpi.toFixed(2)}</b></div>
      <div class="kpi"><span>Red Items</span><b>${content.redItems.length}</b></div>
      <div class="kpi"><span>No Recovery Plan</span><b>${content.delayLedgerSummary.noRecoveryPlanCount}</b></div>
      <div class="kpi"><span>Delay Days</span><b>${content.delayLedgerSummary.totalDaysLost}</b></div>
    </div>
    ${table('Red Items', ['Project', 'Name', 'Owner', 'Recovery date', 'Reason', 'Carry-forward'], redRows)}
    ${table('Delay Ledger Summary', ['Owner', 'Days lost'], delayRows)}
    ${table('Pending Client Actions', ['Project', 'Name', 'Count', 'Max wait'], actionRows)}
    ${table('Resource Heat', ['Owner', 'Allocation', 'Projects'], heatRows)}
    <h2>Escalations</h2><ul>${content.escalations.map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li class="muted">No escalations.</li>'}</ul>
  </body></html>`
}

async function pendingApprovalRows(now: Date): Promise<WbrContent['pendingClientActions']> {
  const activities = await prisma.activity.findMany({
    where: {
      status: 'APPROVAL_REQUESTED',
      milestone: { phase: { project: { archivedAt: null, status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] } } } },
    },
    select: {
      waitingSince: true,
      milestone: { select: { phase: { select: { project: { select: { id: true, code: true, name: true } } } } } },
    },
  })
  const byProject = new Map<string, { projectCode: string; projectName: string; count: number; maxDaysWaiting: number }>()
  for (const activity of activities) {
    const project = activity.milestone.phase.project
    const row = byProject.get(project.id) ?? { projectCode: project.code, projectName: project.name, count: 0, maxDaysWaiting: 0 }
    row.count += 1
    row.maxDaysWaiting = Math.max(row.maxDaysWaiting, activity.waitingSince ? businessDaysBetween(activity.waitingSince, now) : 0)
    byProject.set(project.id, row)
  }
  return [...byProject.values()].sort((a, b) => b.maxDaysWaiting - a.maxDaysWaiting)
}

async function resourceHeatRows(): Promise<WbrContent['resourceHeat']> {
  const activities = await prisma.activity.findMany({
    where: {
      status: { notIn: ['FINISHED', 'APPROVED'] },
      assigneeId: { not: null },
      milestone: { phase: { project: { archivedAt: null, status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] } } } },
    },
    select: {
      assigneeId: true,
      estimatedHours: true,
      milestone: { select: { phase: { select: { projectId: true } } } },
    },
  })
  const userIds = [...new Set(activities.map((activity) => activity.assigneeId).filter(Boolean))] as string[]
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
  const userById = new Map(users.map((user) => [user.id, user]))
  const byUser = new Map<string, { ownerName: string; hours: number; projects: Set<string> }>()
  for (const activity of activities) {
    if (!activity.assigneeId) continue
    const user = userById.get(activity.assigneeId)
    const row = byUser.get(activity.assigneeId) ?? { ownerName: user?.name ?? user?.email ?? 'Assigned team member', hours: 0, projects: new Set<string>() }
    row.hours += activity.estimatedHours ?? 8
    row.projects.add(activity.milestone.phase.projectId)
    byUser.set(activity.assigneeId, row)
  }
  return [...byUser.values()]
    .map((row) => ({ ownerName: row.ownerName, allocationPct: Math.round((row.hours / 40) * 100), projectCount: row.projects.size }))
    .filter((row) => row.allocationPct >= 80)
    .sort((a, b) => b.allocationPct - a.allocationPct)
    .slice(0, 20)
}

function table(title: string, headers: string[], rows: string): string {
  return `<h2>${title}</h2><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="muted">None.</td></tr>`}</tbody></table>`
}

function isoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
}
