import type { Prisma, ProjectReport } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { businessDaysBetween, toDateKey } from './business-days'
import { getJiraAdoption } from '@/features/projects/services/jira/adoption'
import { getJiraDeveloperMetrics } from '@/features/projects/services/jira/metrics'
import { getProjectScrumLogData } from '@/features/projects/services/scrum-attendance'

export const PERFORMANCE_REPORT_TYPES = ['INDIVIDUAL', 'TEAM'] as const
export const PERFORMANCE_CADENCES = ['DAILY', 'WEEKLY', 'SPRINT', 'MONTHLY'] as const
export type PerformanceReportType = (typeof PERFORMANCE_REPORT_TYPES)[number]
export type PerformanceCadence = (typeof PERFORMANCE_CADENCES)[number]

export interface IndividualPerformanceRow {
  developerName: string
  userId: string | null
  email: string | null
  pm: string
  sprintDate: string
  assignedTasks: number
  originalEstimateHours: number
  bufferHours: number
  completed: number
  blocked: number
  performancePct: number
  idleDays: number
  estimateAccuracy: number | null
  cycleTimeDays: number | null
  blockedDurationDays: number
  scrumAttendancePct: number | null
  aiInsight: string
}

export interface TeamPerformanceContent {
  cadence: PerformanceCadence
  projectId: string
  projectName: string
  pm: string
  sprintDate: string
  assigned: number
  completed: number
  blocked: number
  teamPerformancePct: number
  velocity: number
  velocityTrend: number | null
  individualCompletionBreakdown: Array<{ developerName: string; completed: number; assigned: number; completionPct: number }>
  jiraAdoptionScore: number
  aiInsight: string
}

export interface IndividualPerformanceContent {
  cadence: PerformanceCadence
  projectId: string
  projectName: string
  pm: string
  sprintDate: string
  rows: IndividualPerformanceRow[]
}

export interface PerformanceReportBundle {
  jiraLinked: boolean
  hidden: boolean
  individualReport: ProjectReport | null
  teamReport: ProjectReport | null
}

export function performancePeriod(cadence: PerformanceCadence, now = new Date()): { start: Date; end: Date; label: string } {
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
  let start: Date
  let end: Date
  if (cadence === 'DAILY') {
    start = startToday
    end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))
  } else if (cadence === 'WEEKLY' || cadence === 'SPRINT') {
    const day = now.getUTCDay()
    const diffToMonday = day === 0 ? -6 : 1 - day
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday, 0, 0, 0, 0))
    end = new Date(start)
    end.setUTCDate(start.getUTCDate() + (cadence === 'SPRINT' ? 13 : 6))
    end.setUTCHours(23, 59, 59, 999)
  } else {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
    end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))
  }
  return { start, end, label: `${toDateKey(start)} to ${toDateKey(end)}` }
}

export function individualInsight(row: Pick<IndividualPerformanceRow, 'performancePct' | 'idleDays' | 'estimateAccuracy' | 'scrumAttendancePct'>): string {
  if (row.scrumAttendancePct != null && row.scrumAttendancePct < 70) return 'Attendance below 70%; PM should review availability and blockers.'
  if (row.idleDays >= 3) return 'Idle-day pattern detected; confirm Jira activity hygiene and unblock work.'
  if (row.estimateAccuracy != null && row.estimateAccuracy >= 1.25) return 'Consistently under-estimating effort; recalibrate future estimates with actuals.'
  if (row.performancePct >= 90) return 'Strong completion performance for this period.'
  return 'Performance is within normal range; continue monitoring trend.'
}

export function teamInsight(input: { teamPerformancePct: number; jiraAdoptionScore: number; blocked: number; velocityTrend: number | null }): string {
  if (input.jiraAdoptionScore < 60) return 'Jira data quality is below threshold; report evidence may be incomplete.'
  if (input.blocked > 0) return 'Blocked work remains visible; PM should confirm recovery owners and dates.'
  if (input.velocityTrend != null && input.velocityTrend < 0) return 'Velocity decreased versus the prior comparable period; review scope and capacity.'
  if (input.teamPerformancePct >= 90) return 'Team completion performance is strong for this period.'
  return 'Team performance is stable; continue monitoring Jira adoption and cycle time.'
}

export async function generatePerformanceReports(projectId: string, cadence: PerformanceCadence, actorId: string, now = new Date()): Promise<PerformanceReportBundle> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, projectManagerId: true, jiraLinked: true, jiraConnectionId: true },
  })
  if (!project?.jiraLinked || !project.jiraConnectionId) {
    return { jiraLinked: false, hidden: true, individualReport: null, teamReport: null }
  }
  const period = performancePeriod(cadence, now)
  const existing = await prisma.projectReport.findMany({
    where: {
      projectId,
      type: { in: [...PERFORMANCE_REPORT_TYPES] },
      periodStart: period.start,
      periodEnd: period.end,
      contentJson: { path: ['cadence'], equals: cadence },
    },
  })
  const existingIndividual = existing.find((report) => report.type === 'INDIVIDUAL') ?? null
  const existingTeam = existing.find((report) => report.type === 'TEAM') ?? null
  if (existingIndividual && existingTeam) return { jiraLinked: true, hidden: false, individualReport: existingIndividual, teamReport: existingTeam }

  const { individual, team } = await buildPerformanceReportContent(projectId, cadence, period.start, period.end, now)
  const [individualReport, teamReport] = await prisma.$transaction([
    existingIndividual ? prisma.projectReport.update({ where: { id: existingIndividual.id }, data: { contentJson: individual as unknown as Prisma.InputJsonValue } }) : prisma.projectReport.create({
      data: {
        projectId,
        type: 'INDIVIDUAL',
        periodStart: period.start,
        periodEnd: period.end,
        status: 'DRAFT',
        aiSummary: `R3 ${cadence.toLowerCase()} individual performance report`,
        contentJson: individual as unknown as Prisma.InputJsonValue,
      },
    }),
    existingTeam ? prisma.projectReport.update({ where: { id: existingTeam.id }, data: { contentJson: team as unknown as Prisma.InputJsonValue } }) : prisma.projectReport.create({
      data: {
        projectId,
        type: 'TEAM',
        periodStart: period.start,
        periodEnd: period.end,
        status: 'DRAFT',
        aiSummary: team.aiInsight,
        contentJson: team as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.aiGenerationLog.create({
      data: {
        userId: actorId,
        feature: 'PROJECT_PERFORMANCE_REPORT',
        provider: 'openai',
        modelId: 'deterministic-structured-insight',
        inputTokens: JSON.stringify({ individual, team }).length,
        outputTokens: individual.rows.reduce((sum, row) => sum + row.aiInsight.length, 0) + team.aiInsight.length,
        status: 'OK',
        responseJson: { cadence, projectId, individualInsights: individual.rows.length, teamInsight: team.aiInsight } as unknown as Prisma.InputJsonValue,
      },
    }),
  ])
  return { jiraLinked: true, hidden: false, individualReport, teamReport }
}

export async function buildPerformanceReportContent(
  projectId: string,
  cadence: PerformanceCadence,
  periodStart: Date,
  periodEnd: Date,
  now = new Date(),
): Promise<{ individual: IndividualPerformanceContent; team: TeamPerformanceContent }> {
  const [project, metrics, adoption, scrum, issues, previousTeam] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, projectManagerId: true } }),
    getJiraDeveloperMetrics(prisma, { projectId, from: periodStart, to: periodEnd }),
    getJiraAdoption(prisma, projectId, now),
    getProjectScrumLogData(prisma, projectId),
    jiraIssuesForPeriod(projectId, periodStart, periodEnd),
    prisma.projectReport.findFirst({
      where: { projectId, type: 'TEAM', periodEnd: { lt: periodEnd }, contentJson: { path: ['cadence'], equals: cadence } },
      orderBy: { periodEnd: 'desc' },
    }),
  ])
  if (!project) throw new Error('Project not found')
  const pm = await prisma.user.findUnique({ where: { id: project.projectManagerId }, select: { name: true, email: true } })
  const pmName = pm?.name ?? pm?.email ?? 'Project Manager'
  const sprintDate = `${toDateKey(periodStart)} to ${toDateKey(periodEnd)}`
  const issuesByPerson = groupIssuesByPerson(issues)
  const attendanceByUser = new Map(scrum.summary.rows.map((row) => [row.userId, row.attendanceRate]))
  const rows = metrics.rows.map((metric) => {
    const key = metric.userId ? `user:${metric.userId}` : metric.email ? `email:${metric.email.toLowerCase()}` : `name:${metric.name}`
    const issueRows = issuesByPerson.get(key) ?? []
    const completed = issueRows.filter((issue) => issue.statusCategory === 'DONE').length
    const blocked = issueRows.filter((issue) => issue.isBlocked).length
    const originalEstimateHours = round1(issueRows.reduce((sum, issue) => sum + (issue.originalEstimateSeconds ?? 0) / 3600, 0))
    const cycleTimes = issueRows.filter((issue) => issue.resolvedAt).map((issue) => businessDaysBetween(issue.jiraCreatedAt, issue.resolvedAt!))
    const blockedDurationDays = issueRows.reduce((sum, issue) => sum + (issue.blockedSince ? businessDaysBetween(issue.blockedSince, periodEnd) : 0), 0)
    const performancePct = pct(completed, Math.max(1, metric.assignedIssues))
    const row: IndividualPerformanceRow = {
      developerName: metric.name,
      userId: metric.userId,
      email: metric.email,
      pm: pmName,
      sprintDate,
      assignedTasks: metric.assignedIssues,
      originalEstimateHours,
      bufferHours: round1(originalEstimateHours * 0.2),
      completed,
      blocked,
      performancePct,
      idleDays: metric.idleDays,
      estimateAccuracy: metric.medianEstimateAccuracy,
      cycleTimeDays: cycleTimes.length ? round1(cycleTimes.reduce((sum, value) => sum + value, 0) / cycleTimes.length) : null,
      blockedDurationDays,
      scrumAttendancePct: metric.userId ? attendanceByUser.get(metric.userId) ?? null : null,
      aiInsight: '',
    }
    row.aiInsight = individualInsight(row)
    return row
  })

  const assigned = rows.reduce((sum, row) => sum + row.assignedTasks, 0)
  const completed = rows.reduce((sum, row) => sum + row.completed, 0)
  const blocked = rows.reduce((sum, row) => sum + row.blocked, 0)
  const teamPerformancePct = pct(completed, Math.max(1, assigned))
  const previousVelocity = ((previousTeam?.contentJson as unknown as Partial<TeamPerformanceContent> | null)?.velocity) ?? null
  const velocity = completed
  const velocityTrend = previousVelocity == null ? null : round1(velocity - previousVelocity)
  const team: TeamPerformanceContent = {
    cadence,
    projectId,
    projectName: project.name,
    pm: pmName,
    sprintDate,
    assigned,
    completed,
    blocked,
    teamPerformancePct,
    velocity,
    velocityTrend,
    individualCompletionBreakdown: rows.map((row) => ({
      developerName: row.developerName,
      completed: row.completed,
      assigned: row.assignedTasks,
      completionPct: pct(row.completed, Math.max(1, row.assignedTasks)),
    })),
    jiraAdoptionScore: adoption.project.score,
    aiInsight: '',
  }
  team.aiInsight = teamInsight({ teamPerformancePct, jiraAdoptionScore: team.jiraAdoptionScore, blocked, velocityTrend })
  return {
    individual: { cadence, projectId, projectName: project.name, pm: pmName, sprintDate, rows },
    team,
  }
}

export async function updatePerformanceReportInsights(reportId: string, input: {
  teamInsight?: string
  individualInsights?: Record<string, string>
}): Promise<ProjectReport> {
  const report = await prisma.projectReport.findUnique({ where: { id: reportId } })
  if (!report || !PERFORMANCE_REPORT_TYPES.includes(report.type as PerformanceReportType)) throw new Error('Performance report not found')
  if (report.type === 'TEAM') {
    const content = report.contentJson as unknown as TeamPerformanceContent
    return prisma.projectReport.update({
      where: { id: reportId },
      data: {
        aiSummary: input.teamInsight ?? content.aiInsight,
        aiSummaryEdited: true,
        contentJson: { ...content, aiInsight: input.teamInsight ?? content.aiInsight } as unknown as Prisma.InputJsonValue,
      },
    })
  }
  const content = report.contentJson as unknown as IndividualPerformanceContent
  const patches = input.individualInsights ?? {}
  return prisma.projectReport.update({
    where: { id: reportId },
    data: {
      aiSummaryEdited: true,
      contentJson: {
        ...content,
        rows: content.rows.map((row) => ({
          ...row,
          aiInsight: patches[row.userId ?? row.email ?? row.developerName] ?? row.aiInsight,
        })),
      } as unknown as Prisma.InputJsonValue,
    },
  })
}

export async function listPerformanceReports(projectId: string, cadence?: PerformanceCadence): Promise<PerformanceReportBundle & { reports: ProjectReport[] }> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { jiraLinked: true, jiraConnectionId: true } })
  if (!project?.jiraLinked || !project.jiraConnectionId) return { jiraLinked: false, hidden: true, individualReport: null, teamReport: null, reports: [] }
  const reports = await prisma.projectReport.findMany({
    where: {
      projectId,
      type: { in: [...PERFORMANCE_REPORT_TYPES] },
      ...(cadence ? { contentJson: { path: ['cadence'], equals: cadence } } : {}),
    },
    orderBy: [{ periodEnd: 'desc' }, { type: 'asc' }],
    take: 24,
  })
  return {
    jiraLinked: true,
    hidden: false,
    individualReport: reports.find((report) => report.type === 'INDIVIDUAL') ?? null,
    teamReport: reports.find((report) => report.type === 'TEAM') ?? null,
    reports,
  }
}

export function renderPerformanceReportPdfHtml(report: ProjectReport): string {
  if (report.type === 'TEAM') return renderTeamPdf(report.contentJson as unknown as TeamPerformanceContent)
  return renderIndividualPdf(report.contentJson as unknown as IndividualPerformanceContent)
}

async function jiraIssuesForPeriod(projectId: string, from: Date, to: Date) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { jiraConnectionId: true } })
  if (!project?.jiraConnectionId) return []
  return prisma.jiraIssue.findMany({
    where: {
      connectionId: project.jiraConnectionId,
      OR: [
        { jiraUpdatedAt: { gte: from, lte: to } },
        { resolvedAt: { gte: from, lte: to } },
        { jiraCreatedAt: { lte: to } },
      ],
    },
    select: {
      jiraKey: true,
      statusCategory: true,
      assigneeUserId: true,
      assigneeEmail: true,
      originalEstimateSeconds: true,
      isBlocked: true,
      blockedSince: true,
      jiraCreatedAt: true,
      resolvedAt: true,
    },
  })
}

function groupIssuesByPerson(issues: Awaited<ReturnType<typeof jiraIssuesForPeriod>>) {
  const map = new Map<string, typeof issues>()
  for (const issue of issues) {
    const key = issue.assigneeUserId ? `user:${issue.assigneeUserId}` : issue.assigneeEmail ? `email:${issue.assigneeEmail.toLowerCase()}` : 'unassigned'
    const bucket = map.get(key) ?? []
    bucket.push(issue)
    map.set(key, bucket)
  }
  return map
}

function renderIndividualPdf(content: IndividualPerformanceContent): string {
  const rows = content.rows.map((row) => `<tr><td>${escapeHtml(row.developerName)}</td><td>${row.assignedTasks}</td><td>${row.originalEstimateHours}</td><td>${row.bufferHours}</td><td>${row.completed}</td><td>${row.blocked}</td><td>${row.performancePct}%</td><td>${row.idleDays}</td><td>${row.estimateAccuracy ?? '-'}</td><td>${row.cycleTimeDays ?? '-'}</td><td>${row.blockedDurationDays}</td><td>${row.scrumAttendancePct ?? '-'}</td><td>${escapeHtml(row.aiInsight)}</td></tr>`).join('')
  return basePdf('Individual Performance Report', content.projectName, content.sprintDate, table(['Developer', 'Assigned', 'Estimate', 'Buffer', 'Completed', 'Blocked', 'Perf %', 'Idle', 'Accuracy', 'Cycle', 'Blocked days', 'Scrum %', 'AI insight'], rows))
}

function renderTeamPdf(content: TeamPerformanceContent): string {
  const rows = content.individualCompletionBreakdown.map((row) => `<tr><td>${escapeHtml(row.developerName)}</td><td>${row.assigned}</td><td>${row.completed}</td><td>${row.completionPct}%</td></tr>`).join('')
  const kpis = `<div class="kpis"><div><b>${content.assigned}</b><span>Assigned</span></div><div><b>${content.completed}</b><span>Completed</span></div><div><b>${content.blocked}</b><span>Blocked</span></div><div><b>${content.teamPerformancePct}%</b><span>Team perf</span></div><div><b>${content.velocity}</b><span>Velocity</span></div><div><b>${content.jiraAdoptionScore}</b><span>Jira adoption</span></div></div><p><strong>AI insight:</strong> ${escapeHtml(content.aiInsight)}</p>`
  return basePdf('Team Performance Report', content.projectName, content.sprintDate, `${kpis}${table(['Developer', 'Assigned', 'Completed', 'Completion %'], rows)}`)
}

function basePdf(title: string, projectName: string, period: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><style>body{font-family:Inter,Arial,sans-serif;color:#172033;margin:28px;font-size:12px}h1{font-size:24px;margin:0 0 4px}.muted{color:#667085}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #e4e7ec;padding:6px;text-align:left;vertical-align:top}th{background:#f8fafc;color:#475467;text-transform:uppercase;font-size:10px}.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:16px 0}.kpis div{border:1px solid #d0d5dd;border-radius:8px;padding:8px}.kpis b{display:block;font-size:18px}</style></head><body><h1>${title}</h1><div class="muted">${escapeHtml(projectName)} · ${period}</div>${body}</body></html>`
}

function table(headers: string[], rows: string): string {
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">No rows.</td></tr>`}</tbody></table>`
}

function pct(value: number, total: number): number {
  return Math.round((value / total) * 1000) / 10
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
}
