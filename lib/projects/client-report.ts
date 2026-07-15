import type { Prisma, ProjectReport } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { businessDaysBetween } from './business-days'
import { AI_SUMMARY_MAX_BULLETS, AI_SUMMARY_MAX_CHARS } from '@/features/projects/types'

export const CLIENT_REPORT_TYPE = 'CLIENT_BIMONTHLY'
export const CLIENT_REPORT_FEATURE = 'PROJECT_CLIENT_REPORT'

export interface ClientReportContent {
  header: {
    project: string
    projectCode: string
    client: string
    company: 'Eldix IT Technology PLC'
    reportingDate: string
    period: string
    pmName: string
    version: number
  }
  overallHealth: {
    percentComplete: number
    percentPlanned: number
    spi: number | null
    rag: string
    confidence: number
    daysBehind: number
  }
  completedThisPeriod: Array<{
    activity: string
    ownerParty: string
    plannedDate: string | null
    actualDate: string | null
    varianceDays: number
  }>
  delayed: Array<{
    activity: string
    delayOwner: string
    originalDate: string | null
    currentDate: string | null
    daysSlipped: number
    reason: string
  }>
  pendingClientAction: Array<{
    deliverable: string
    sentOn: string | null
    daysWaiting: number
    slaBusinessDays: number | null
    breached: boolean
  }>
  upcomingMilestones: Array<{
    milestone: string
    dueDate: string | null
    needFromClient: string
  }>
  changeRequests: Array<{
    cr: string
    impactDays: number
    costImpact: number
    status: string
  }>
  risks: Array<{
    risk: string
    probability: number | null
    impact: number | null
    mitigation: string | null
  }>
}

export interface SummaryValidation {
  valid: boolean
  bullets: number
  chars: number
  errors: string[]
}

export function validateAiSummary(summary: string | null | undefined): SummaryValidation {
  const text = (summary ?? '').trim()
  const bullets = countSummaryBullets(text)
  const errors: string[] = []
  if (!text) errors.push('Summary is required')
  if (bullets > AI_SUMMARY_MAX_BULLETS) errors.push(`Summary must be ${AI_SUMMARY_MAX_BULLETS} bullets or fewer`)
  if (text.length > AI_SUMMARY_MAX_CHARS) errors.push(`Summary must be ${AI_SUMMARY_MAX_CHARS} characters or fewer`)
  return { valid: errors.length === 0, bullets, chars: text.length, errors }
}

export function countSummaryBullets(summary: string): number {
  const lines = summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return 0
  const bulletLines = lines.filter((line) => /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
  return bulletLines.length || lines.length
}

export function buildDeterministicClientSummary(facts: ClientReportContent): string {
  const items = [
    `- Overall progress is ${round(facts.overallHealth.percentComplete)}% against ${round(facts.overallHealth.percentPlanned)}% planned, with SPI ${facts.overallHealth.spi == null ? 'not yet available' : facts.overallHealth.spi.toFixed(2)} and ${facts.overallHealth.rag} health.`,
    `- ${facts.completedThisPeriod.length} deliverable${facts.completedThisPeriod.length === 1 ? '' : 's'} completed this period; ${facts.delayed.length} delayed item${facts.delayed.length === 1 ? '' : 's'} remain visible in the ledger.`,
    `- ${facts.pendingClientAction.length} item${facts.pendingClientAction.length === 1 ? '' : 's'} are awaiting your action, including ${facts.pendingClientAction.filter((row) => row.breached).length} SLA breach${facts.pendingClientAction.filter((row) => row.breached).length === 1 ? '' : 'es'}.`,
    `- ${facts.upcomingMilestones.length} milestone${facts.upcomingMilestones.length === 1 ? '' : 's'} are due next period; client inputs are listed beside each milestone.`,
    `- ${facts.changeRequests.length} change request${facts.changeRequests.length === 1 ? '' : 's'} and ${facts.risks.length} client-visible risk${facts.risks.length === 1 ? '' : 's'} are included for decision visibility.`,
  ]
  return enforceSummaryCaps(items)
}

export function enforceSummaryCaps(items: string[]): string {
  const capped = items.slice(0, AI_SUMMARY_MAX_BULLETS).map((item) => item.trim()).filter(Boolean)
  while (capped.join('\n').length > AI_SUMMARY_MAX_CHARS && capped.length > 1) capped.pop()
  let text = capped.join('\n')
  if (text.length > AI_SUMMARY_MAX_CHARS) {
    text = `${text.slice(0, AI_SUMMARY_MAX_CHARS - 1).trimEnd()}…`
  }
  return text
}

export function currentBiMonthlyPeriod(now = new Date()): { start: Date; end: Date } {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()
  const startDay = day <= 15 ? 1 : 16
  const endDay = day <= 15 ? 15 : new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return {
    start: new Date(Date.UTC(year, month, startDay, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, endDay, 23, 59, 59, 999)),
  }
}

export async function generateClientReportDraft(
  projectId: string,
  opts: { actorId: string; periodStart?: Date; periodEnd?: Date; now?: Date }
): Promise<{ report: ProjectReport; created: boolean; notifyProjectManagerId: string; projectName: string }> {
  const now = opts.now ?? new Date()
  const period = opts.periodStart && opts.periodEnd ? { start: opts.periodStart, end: opts.periodEnd } : currentBiMonthlyPeriod(now)
  const existing = await prisma.projectReport.findFirst({
    where: {
      projectId,
      type: CLIENT_REPORT_TYPE,
      periodStart: period.start,
      periodEnd: period.end,
      status: { in: ['DRAFT', 'PM_REVIEW', 'APPROVED'] },
    },
    orderBy: { generatedAt: 'desc' },
  })
  if (existing) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true, projectManagerId: true } })
    return { report: existing, created: false, notifyProjectManagerId: project?.projectManagerId ?? opts.actorId, projectName: project?.name ?? 'Project' }
  }

  const facts = await buildClientReportContent(projectId, period.start, period.end, now)
  const summary = buildDeterministicClientSummary(facts)
  const validation = validateAiSummary(summary)
  if (!validation.valid) {
    throw new Error(`Generated summary failed validation: ${validation.errors.join(', ')}`)
  }

  const result = await prisma.$transaction(async (tx) => {
    const report = await tx.projectReport.create({
      data: {
        projectId,
        type: CLIENT_REPORT_TYPE,
        periodStart: period.start,
        periodEnd: period.end,
        status: 'DRAFT',
        aiSummary: summary,
        contentJson: facts as unknown as Prisma.InputJsonValue,
      },
    })
    await tx.aiGenerationLog.create({
      data: {
        userId: opts.actorId,
        feature: CLIENT_REPORT_FEATURE,
        provider: 'openai',
        modelId: 'deterministic-structured-summary',
        inputTokens: JSON.stringify(facts).length,
        outputTokens: summary.length,
        status: 'OK',
        responseJson: { summary, validation } as unknown as Prisma.InputJsonValue,
      },
    })
    return report
  })

  return {
    report: result,
    created: true,
    notifyProjectManagerId: await projectManagerId(projectId),
    projectName: facts.header.project,
  }
}

export async function buildClientReportContent(
  projectId: string,
  periodStart: Date,
  periodEnd: Date,
  now = new Date()
): Promise<ClientReportContent> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      phases: {
        orderBy: { position: 'asc' },
        include: {
          milestones: {
            orderBy: { position: 'asc' },
            include: { activities: { orderBy: { position: 'asc' } } },
          },
        },
      },
      delayEvents: { where: { createdAt: { lte: periodEnd } }, orderBy: { createdAt: 'desc' } },
      changeRequests: { orderBy: { createdAt: 'desc' } },
      raidItems: { where: { type: 'RISK', clientVisible: true, status: { not: 'CLOSED' } }, orderBy: { createdAt: 'desc' } },
      clientObligations: { where: { type: 'APPROVAL' }, orderBy: { slaBusinessDays: 'asc' } },
    },
  })
  if (!project) throw new Error('Project not found')

  const activities = project.phases.flatMap((phase) =>
    phase.milestones.flatMap((milestone) =>
      milestone.activities.map((activity) => ({ phase, milestone, activity }))
    )
  )
  const approvalSla = project.clientObligations[0]?.slaBusinessDays ?? null
  const completedThisPeriod = activities
    .filter(({ activity }) => {
      const end = activity.currentEnd
      return Boolean(end && end >= periodStart && end <= periodEnd && (activity.status === 'FINISHED' || activity.status === 'APPROVED' || activity.percentComplete >= 100))
    })
    .slice(0, 20)
    .map(({ activity }) => ({
      activity: activity.title,
      ownerParty: ownerLabel(activity.ownerParty),
      plannedDate: isoDate(activity.baselineEnd),
      actualDate: isoDate(activity.currentEnd),
      varianceDays: businessDaysBetween(activity.baselineEnd ?? activity.currentEnd ?? periodStart, activity.currentEnd ?? periodStart),
    }))

  const delayByActivity = new Map(project.delayEvents.filter((delay) => delay.activityId).map((delay) => [delay.activityId!, delay]))
  const delayed = activities
    .filter(({ activity }) => activity.slipDays > 0 || delayByActivity.has(activity.id))
    .slice(0, 20)
    .map(({ activity }) => {
      const delay = delayByActivity.get(activity.id)
      return {
        activity: activity.title,
        delayOwner: ownerLabel(delay?.owner ?? activity.slipOwner ?? activity.ownerParty),
        originalDate: isoDate(activity.baselineEnd ?? delay?.startedAt ?? null),
        currentDate: isoDate(activity.currentEnd ?? delay?.endedAt ?? null),
        daysSlipped: activity.slipDays || Math.round(delay?.daysLost ?? 0),
        reason: humanize(delay?.reason ?? activity.slipReason ?? 'SCHEDULE_VARIANCE'),
      }
    })

  const pendingClientAction = activities
    .filter(({ activity }) => activity.status === 'APPROVAL_REQUESTED')
    .slice(0, 20)
    .map(({ activity }) => {
      const daysWaiting = activity.waitingSince ? businessDaysBetween(activity.waitingSince, now) : 0
      return {
        deliverable: activity.title,
        sentOn: isoDate(activity.waitingSince),
        daysWaiting,
        slaBusinessDays: approvalSla,
        breached: approvalSla != null ? daysWaiting > approvalSla : false,
      }
    })

  const nextPeriodEnd = new Date(periodEnd)
  nextPeriodEnd.setUTCDate(nextPeriodEnd.getUTCDate() + 15)
  const upcomingMilestones = project.phases
    .flatMap((phase) => phase.milestones.map((milestone) => ({ phase, milestone })))
    .filter(({ milestone }) => milestone.currentDate && milestone.currentDate > periodEnd && milestone.currentDate <= nextPeriodEnd)
    .slice(0, 12)
    .map(({ milestone }) => ({
      milestone: milestone.name,
      dueDate: isoDate(milestone.currentDate),
      needFromClient: pendingClientAction[0]?.deliverable ?? 'Timely review of submitted deliverables',
    }))

  return {
    header: {
      project: project.name,
      projectCode: project.code,
      client: project.clientName,
      company: 'Eldix IT Technology PLC',
      reportingDate: isoDate(now) ?? '',
      period: `${isoDate(periodStart)} to ${isoDate(periodEnd)}`,
      pmName: '360Ground Project Manager',
      version: 1,
    },
    overallHealth: {
      percentComplete: project.percentComplete,
      percentPlanned: project.percentPlanned,
      spi: project.spi,
      rag: project.ragStatus,
      confidence: project.confidence,
      daysBehind: Math.max(0, Math.round(project.percentPlanned - project.percentComplete)),
    },
    completedThisPeriod,
    delayed,
    pendingClientAction,
    upcomingMilestones,
    changeRequests: project.changeRequests.slice(0, 20).map((cr) => ({
      cr: cr.crCode,
      impactDays: cr.scheduleImpactDays,
      costImpact: cr.costImpact,
      status: cr.status,
    })),
    risks: project.raidItems.slice(0, 20).map((risk) => ({
      risk: risk.title,
      probability: risk.probability,
      impact: risk.impact,
      mitigation: risk.mitigation,
    })),
  }
}

export async function updateClientReportSummary(reportId: string, summary: string): Promise<ProjectReport> {
  const validation = validateAiSummary(summary)
  if (!validation.valid) throw new Error(validation.errors.join('; '))
  return prisma.projectReport.update({
    where: { id: reportId },
    data: { aiSummary: summary.trim(), aiSummaryEdited: true },
  })
}

export async function transitionClientReport(
  reportId: string,
  action: 'SUBMIT_REVIEW' | 'APPROVE',
  actorId: string
): Promise<ProjectReport> {
  const report = await prisma.projectReport.findUnique({ where: { id: reportId } })
  if (!report || report.type !== CLIENT_REPORT_TYPE) throw new Error('Report not found')
  const validation = validateAiSummary(report.aiSummary)
  if (!validation.valid) throw new Error(validation.errors.join('; '))
  if (action === 'SUBMIT_REVIEW') {
    if (report.status !== 'DRAFT') throw new Error('Only draft reports can move to review')
    return prisma.projectReport.update({ where: { id: reportId }, data: { status: 'PM_REVIEW' } })
  }
  if (report.status !== 'PM_REVIEW') throw new Error('Report must be in PM review before approval')
  return prisma.projectReport.update({
    where: { id: reportId },
    data: { status: 'APPROVED', approvedById: actorId, approvedAt: new Date() },
  })
}

export async function sendClientReport(reportId: string): Promise<{ report: ProjectReport; emails: string[] }> {
  const report = await prisma.projectReport.findUnique({ where: { id: reportId } })
  if (!report || report.type !== CLIENT_REPORT_TYPE || !report.projectId) throw new Error('Report not found')
  if (report.status !== 'APPROVED') throw new Error('Report must be approved before it can be sent')
  const validation = validateAiSummary(report.aiSummary)
  if (!validation.valid) throw new Error(validation.errors.join('; '))

  const project = await prisma.project.findUnique({
    where: { id: report.projectId },
    select: { id: true, code: true, name: true, clientName: true, clientEmails: true },
  })
  if (!project) throw new Error('Project not found')
  const emails = project.clientEmails.map((email) => email.trim()).filter(Boolean)
  if (emails.length === 0) throw new Error('Project has no client report email recipients')

  const sent = await prisma.projectReport.update({
    where: { id: reportId },
    data: { status: 'SENT', sentAt: new Date(), sentToEmails: emails },
  })

  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const portalLink = `${base}/portal/projects/${project.id}`
  const pdfLink = `${base}/api/projects/${project.id}/reports/${report.id}/pdf`
  await Promise.all(emails.map((email) => sendMail({
    to: email,
    subject: `${project.code} client project report`,
    text: `The latest client project report for ${project.name} is ready.\n\nPortal: ${portalLink}\nPDF: ${pdfLink}`,
    html: `<p>The latest client project report for <strong>${escapeHtml(project.name)}</strong> is ready.</p><p><a href="${portalLink}">Open the client portal</a></p><p><a href="${pdfLink}">Download PDF</a></p>`,
    template: 'project-client-report',
    metadata: { projectId: project.id, reportId: report.id },
  })))

  return { report: sent, emails }
}

export async function generateClientReportDraftsForActiveProjects(actorId = 'system'): Promise<{
  scanned: number
  created: number
  existing: number
  reportIds: string[]
  notifications: Array<{ projectId: string; projectName: string; projectManagerId: string; reportId: string }>
}> {
  const projects = await prisma.project.findMany({
    where: { archivedAt: null, status: { in: ['ACTIVE'] } },
    select: { id: true },
  })
  const notifications: Array<{ projectId: string; projectName: string; projectManagerId: string; reportId: string }> = []
  const reportIds: string[] = []
  let created = 0
  let existing = 0
  for (const project of projects) {
    const result = await generateClientReportDraft(project.id, { actorId })
    reportIds.push(result.report.id)
    if (result.created) {
      created += 1
      notifications.push({ projectId: project.id, projectName: result.projectName, projectManagerId: result.notifyProjectManagerId, reportId: result.report.id })
    } else {
      existing += 1
    }
  }
  return { scanned: projects.length, created, existing, reportIds, notifications }
}

export function renderClientReportPdfHtml(report: ProjectReport): string {
  const content = report.contentJson as unknown as ClientReportContent
  const rows = {
    completed: content.completedThisPeriod.map((row) => `<tr><td>${escapeHtml(row.activity)}</td><td>${row.ownerParty}</td><td>${row.plannedDate ?? '-'}</td><td>${row.actualDate ?? '-'}</td><td>${row.varianceDays}d</td></tr>`).join(''),
    delayed: content.delayed.map((row) => `<tr><td>${escapeHtml(row.activity)}</td><td>${row.delayOwner}</td><td>${row.originalDate ?? '-'}</td><td>${row.currentDate ?? '-'}</td><td>${row.daysSlipped}d</td><td>${escapeHtml(row.reason)}</td></tr>`).join(''),
    pending: content.pendingClientAction.map((row) => `<tr><td>${escapeHtml(row.deliverable)}</td><td>${row.sentOn ?? '-'}</td><td>${row.daysWaiting}d</td><td>${row.slaBusinessDays ?? '-'}</td><td>${row.breached ? 'Yes' : 'No'}</td></tr>`).join(''),
    milestones: content.upcomingMilestones.map((row) => `<tr><td>${escapeHtml(row.milestone)}</td><td>${row.dueDate ?? '-'}</td><td>${escapeHtml(row.needFromClient)}</td></tr>`).join(''),
    crs: content.changeRequests.map((row) => `<tr><td>${escapeHtml(row.cr)}</td><td>${row.impactDays}d</td><td>${row.costImpact}</td><td>${escapeHtml(row.status)}</td></tr>`).join(''),
    risks: content.risks.map((row) => `<tr><td>${escapeHtml(row.risk)}</td><td>${row.probability ?? '-'}</td><td>${row.impact ?? '-'}</td><td>${escapeHtml(row.mitigation ?? '-')}</td></tr>`).join(''),
  }
  return `<!doctype html><html><head><meta charset="utf-8" />
    <style>
      body { font-family: Inter, Arial, sans-serif; color: #172033; margin: 28px; font-size: 12px; }
      h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 22px 0 8px; }
      .muted { color: #667085; } .summary { border: 1px solid #d0d5dd; border-radius: 8px; padding: 12px; background: #f8fafc; white-space: pre-line; }
      .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin: 14px 0; }
      .kpi { border: 1px solid #d0d5dd; border-radius: 8px; padding: 8px; } .kpi b { display: block; font-size: 17px; }
      table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #e4e7ec; padding: 6px; text-align: left; vertical-align: top; }
      th { color: #475467; font-size: 11px; text-transform: uppercase; background: #f8fafc; }
    </style></head><body>
    <h1>${escapeHtml(content.header.project)} Client Report</h1>
    <div class="muted">${escapeHtml(content.header.projectCode)} · ${escapeHtml(content.header.client)} · ${content.header.company} · ${content.header.period} · Version ${content.header.version}</div>
    <h2>AI Executive Summary</h2><div class="summary">${escapeHtml(report.aiSummary ?? '')}</div>
    <h2>Overall Health</h2><div class="kpis">
      <div class="kpi"><span>Complete</span><b>${round(content.overallHealth.percentComplete)}%</b></div>
      <div class="kpi"><span>Planned</span><b>${round(content.overallHealth.percentPlanned)}%</b></div>
      <div class="kpi"><span>SPI</span><b>${content.overallHealth.spi == null ? '-' : content.overallHealth.spi.toFixed(2)}</b></div>
      <div class="kpi"><span>RAG</span><b>${content.overallHealth.rag}</b></div>
      <div class="kpi"><span>Confidence</span><b>${content.overallHealth.confidence}</b></div>
      <div class="kpi"><span>Behind</span><b>${content.overallHealth.daysBehind}d</b></div>
    </div>
    ${section('Completed This Period', ['Activity', 'Owner Party', 'Planned', 'Actual', 'Variance'], rows.completed)}
    ${section('At-Risk / Delayed', ['Activity', 'Delay Owner', 'Original', 'Current', 'Slipped', 'Reason'], rows.delayed)}
    ${section('Pending YOUR Action', ['Deliverable', 'Sent on', 'Days waiting', 'SLA', 'Breach?'], rows.pending)}
    ${section('Upcoming Milestones', ['Milestone', 'Due date', 'Need from client'], rows.milestones)}
    ${section('Change Requests', ['CR', 'Impact days', 'Cost impact', 'Status'], rows.crs)}
    ${section('Client-Visible Risks', ['Risk', 'Probability', 'Impact', 'Mitigation'], rows.risks)}
  </body></html>`
}

function section(title: string, headers: string[], rows: string): string {
  const head = headers.map((h) => `<th>${h}</th>`).join('')
  return `<h2>${title}</h2><table><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="muted">None for this period.</td></tr>`}</tbody></table>`
}

async function projectManagerId(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { projectManagerId: true } })
  return project?.projectManagerId ?? 'system'
}

function ownerLabel(value: string | null | undefined): string {
  if (value === 'CLIENT') return 'Client'
  if (value === 'SHARED') return 'Shared'
  return '360Ground'
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function isoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
}
