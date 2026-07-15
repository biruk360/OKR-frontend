import type { Prisma, ProjectReport } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { AI_SUMMARY_MAX_BULLETS, AI_SUMMARY_MAX_CHARS } from '@/features/projects/types'
import { businessDaysBetween, toDateKey } from './business-days'
import { clientHealthScore, clientHealthTone } from './client-obligations'
import { isOverdueCoe, parseWhys, rootCausePareto } from './coe'
import { effectiveInvoiceStatus } from './payment-milestones'

export const MANAGEMENT_REPORT_TYPES = ['STEERING', 'COE', 'ESTIMATION', 'CAPACITY'] as const
export const MANAGEMENT_REPORT_CADENCES = ['MONTHLY', 'QUARTERLY'] as const

export type ManagementReportType = (typeof MANAGEMENT_REPORT_TYPES)[number]
export type ManagementReportCadence = (typeof MANAGEMENT_REPORT_CADENCES)[number]

interface BaseManagementContent {
  cadence: ManagementReportCadence
  projectId: string
  projectCode: string
  projectName: string
  clientName: string
  periodLabel: string
  generatedOn: string
}

export interface SteeringReportContent extends BaseManagementContent {
  template: 'R6_STEERING_PACK'
  cadence: ManagementReportCadence
  health: {
    ragStatus: string
    confidence: number
    percentComplete: number
    percentPlanned: number
    spi: number | null
    cpi: number | null
    scheduleVariancePct: number
  }
  stageGates: Array<{
    phase: string
    gate: string
    status: string
    gateDate: string | null
    requiredDeliverables: string[]
    requiredApprovals: string[]
    waiverReason: string | null
  }>
  clientObligations: {
    complianceRate: number | null
    breachCount: number
    ceoWarning: boolean
    rows: Array<{
      obligation: string
      responsiblePerson: string
      slaBusinessDays: number
      breachCount: number
      complianceRate: number | null
      healthTone: string
    }>
  }
  changeRequests: Array<{ crCode: string; title: string; status: string; scheduleImpactDays: number; costImpact: number; clientSignOff: boolean }>
  topRisks: Array<{ refCode: string; title: string; score: number | null; status: string; mitigation: string | null }>
  delays: { totalDaysLost: number; byOwner: Array<{ owner: string; daysLost: number }> }
  paymentMilestones: { readyToInvoice: number; overdue: number; outstandingAmount: number; currency: string }
  aiSummary: string
}

export interface CoeReportContent extends BaseManagementContent {
  template: 'R7_COE_REPORT'
  totals: { open: number; inProgress: number; done: number; overdue: number; lessonsLearned: number; costImpact: number; daysLost: number }
  rootCausePareto: Array<{ rootCauseClass: string; count: number }>
  rows: Array<{
    coeCode: string
    trigger: string
    daysLost: number
    costImpact: number | null
    rootCauseClass: string
    whysComplete: boolean
    systemicFix: string
    fixStatus: string
    fixDueDate: string
    isOverdue: boolean
    fedIntoTemplate: boolean
  }>
  aiSummary: string
}

export interface EstimationReportContent extends BaseManagementContent {
  template: 'R9_ESTIMATION_LEARNING'
  jiraLinked: boolean
  totals: { estimatedItems: number; actualItems: number; averageAccuracy: number | null; underEstimated: number; overEstimated: number; balanced: number }
  trend: Array<{ period: string; averageAccuracy: number | null; itemCount: number }>
  rows: Array<{
    source: 'PROJECT_ACTIVITY' | 'JIRA'
    key: string
    title: string
    owner: string | null
    estimateHours: number
    actualHours: number
    accuracy: number
    bias: 'UNDER' | 'OVER' | 'BALANCED'
  }>
  aiSummary: string
}

export interface CapacityReportContent extends BaseManagementContent {
  template: 'R10_CAPACITY_BENCH'
  weeks: string[]
  totals: { people: number; overAllocatedPeople: number; idlePeople: number; totalHours: number; benchCandidates: number }
  people: Array<{
    userId: string | null
    name: string
    role: string | null
    totalHours: number
    maxAllocationPct: number
    status: 'OVER_ALLOCATED' | 'HEALTHY' | 'IDLE'
    cells: Array<{ weekStart: string; hours: number; allocationPct: number; projectCount: number }>
  }>
  aiSummary: string
}

export interface ManagementReportBundle {
  cadence: ManagementReportCadence
  reports: ProjectReport[]
  steeringReport: ProjectReport | null
  coeReport: ProjectReport | null
  estimationReport: ProjectReport | null
  capacityReport: ProjectReport | null
}

export function managementReportPeriod(cadence: ManagementReportCadence, now = new Date()): { start: Date; end: Date; label: string } {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const quarterStartMonth = Math.floor(month / 3) * 3
  const startMonth = cadence === 'QUARTERLY' ? quarterStartMonth : month
  const endMonth = cadence === 'QUARTERLY' ? quarterStartMonth + 3 : month + 1
  const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, endMonth, 0, 23, 59, 59, 999))
  return { start, end, label: `${toDateKey(start)} to ${toDateKey(end)}` }
}

export function estimationBias(accuracy: number): 'UNDER' | 'OVER' | 'BALANCED' {
  if (accuracy >= 1.15) return 'UNDER'
  if (accuracy <= 0.85) return 'OVER'
  return 'BALANCED'
}

export function capacityStatus(maxAllocationPct: number, totalHours: number): 'OVER_ALLOCATED' | 'HEALTHY' | 'IDLE' {
  if (maxAllocationPct > 100) return 'OVER_ALLOCATED'
  if (totalHours <= 0 || maxAllocationPct === 0) return 'IDLE'
  return 'HEALTHY'
}

export async function listManagementReports(projectId: string, cadence?: ManagementReportCadence): Promise<ManagementReportBundle> {
  const where: Prisma.ProjectReportWhereInput = {
    projectId,
    type: { in: [...MANAGEMENT_REPORT_TYPES] },
    ...(cadence ? { contentJson: { path: ['cadence'], equals: cadence } } : {}),
  }
  const reports = await prisma.projectReport.findMany({
    where,
    orderBy: [{ periodEnd: 'desc' }, { type: 'asc' }],
    take: 40,
  })
  return bundleReports(cadence ?? latestCadence(reports), reports)
}

export async function generateManagementReports(projectId: string, cadence: ManagementReportCadence, actorId: string, now = new Date()): Promise<ManagementReportBundle> {
  const period = managementReportPeriod(cadence, now)
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) throw new Error('Project not found')

  const existing = await prisma.projectReport.findMany({
    where: {
      projectId,
      type: { in: [...MANAGEMENT_REPORT_TYPES] },
      periodStart: period.start,
      periodEnd: period.end,
      contentJson: { path: ['cadence'], equals: cadence },
    },
  })
  if (MANAGEMENT_REPORT_TYPES.every((type) => existing.some((report) => report.type === type))) {
    return bundleReports(cadence, existing)
  }

  const contents = await buildManagementReportContent(projectId, cadence, period.start, period.end, now)
  const byType: Record<ManagementReportType, SteeringReportContent | CoeReportContent | EstimationReportContent | CapacityReportContent> = {
    STEERING: contents.steering,
    COE: contents.coe,
    ESTIMATION: contents.estimation,
    CAPACITY: contents.capacity,
  }
  const operations: Prisma.PrismaPromise<unknown>[] = MANAGEMENT_REPORT_TYPES.map((type) => {
    const prior = existing.find((report) => report.type === type)
    const content = byType[type]
    const data = {
      projectId,
      type,
      periodStart: period.start,
      periodEnd: period.end,
      status: 'DRAFT',
      aiSummary: content.aiSummary,
      contentJson: content as unknown as Prisma.InputJsonValue,
    }
    return prior
      ? prisma.projectReport.update({ where: { id: prior.id }, data: { aiSummary: content.aiSummary, contentJson: data.contentJson } })
      : prisma.projectReport.create({ data })
  })
  operations.push(prisma.aiGenerationLog.create({
    data: {
      userId: actorId,
      feature: 'PROJECT_MANAGEMENT_REPORTS',
      provider: 'openai',
      modelId: 'deterministic-structured-summary',
      inputTokens: JSON.stringify(contents).length,
      outputTokens: Object.values(byType).reduce((sum, content) => sum + content.aiSummary.length, 0),
      status: 'OK',
      responseJson: { projectId, cadence, reportTypes: [...MANAGEMENT_REPORT_TYPES] } as unknown as Prisma.InputJsonValue,
    },
  }))
  await prisma.$transaction(operations)

  const reports = await prisma.projectReport.findMany({
    where: {
      projectId,
      type: { in: [...MANAGEMENT_REPORT_TYPES] },
      periodStart: period.start,
      periodEnd: period.end,
      contentJson: { path: ['cadence'], equals: cadence },
    },
    orderBy: { type: 'asc' },
  })
  return bundleReports(cadence, reports)
}

export async function buildManagementReportContent(
  projectId: string,
  cadence: ManagementReportCadence,
  periodStart: Date,
  periodEnd: Date,
  now = new Date(),
): Promise<{
  steering: SteeringReportContent
  coe: CoeReportContent
  estimation: EstimationReportContent
  capacity: CapacityReportContent
}> {
  const [steering, coe, estimation, capacity] = await Promise.all([
    buildSteeringReport(projectId, cadence, periodStart, periodEnd, now),
    buildCoeReport(projectId, cadence, periodStart, periodEnd, now),
    buildEstimationReport(projectId, cadence, periodStart, periodEnd, now),
    buildCapacityReport(projectId, cadence, periodStart, periodEnd, now),
  ])
  return { steering, coe, estimation, capacity }
}

export function renderManagementReportPdfHtml(report: ProjectReport): string {
  const content = report.contentJson as unknown as { template?: string; aiSummary?: string; projectName?: string; periodLabel?: string }
  const title = reportTitle(report.type)
  if (report.type === 'STEERING') return renderSteeringPdf(content as SteeringReportContent)
  if (report.type === 'COE') return renderCoePdf(content as CoeReportContent)
  if (report.type === 'ESTIMATION') return renderEstimationPdf(content as EstimationReportContent)
  if (report.type === 'CAPACITY') return renderCapacityPdf(content as CapacityReportContent)
  return basePdf(title, content.projectName ?? 'Project', content.periodLabel ?? '', `<pre>${escapeHtml(JSON.stringify(content, null, 2))}</pre>`)
}

export function validateManagementSummary(summaryText: string | null | undefined): { valid: boolean; bullets: number; chars: number; errors: string[] } {
  const text = (summaryText ?? '').trim()
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const bulletLines = lines.filter((line) => /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
  const bullets = bulletLines.length || lines.length
  const errors: string[] = []
  if (!text) errors.push('Summary is required')
  if (bullets > AI_SUMMARY_MAX_BULLETS) errors.push(`Summary must be ${AI_SUMMARY_MAX_BULLETS} bullets or fewer`)
  if (text.length > AI_SUMMARY_MAX_CHARS) errors.push(`Summary must be ${AI_SUMMARY_MAX_CHARS} characters or fewer`)
  return { valid: errors.length === 0, bullets, chars: text.length, errors }
}

export async function updateManagementReportSummary(reportId: string, summaryText: string): Promise<ProjectReport> {
  const validation = validateManagementSummary(summaryText)
  if (!validation.valid) throw new Error(validation.errors.join('; '))
  const report = await prisma.projectReport.findUnique({ where: { id: reportId } })
  if (!report || !MANAGEMENT_REPORT_TYPES.includes(report.type as ManagementReportType)) throw new Error('Management report not found')
  if (report.status === 'SENT') throw new Error('Sent reports cannot be edited')
  const content = report.contentJson as Record<string, unknown>
  return prisma.projectReport.update({
    where: { id: reportId },
    data: {
      aiSummary: summaryText.trim(),
      aiSummaryEdited: true,
      contentJson: { ...content, aiSummary: summaryText.trim() } as Prisma.InputJsonValue,
    },
  })
}

export async function transitionManagementReport(
  reportId: string,
  action: 'SUBMIT_REVIEW' | 'APPROVE' | 'SEND',
  actorId: string,
): Promise<ProjectReport> {
  const report = await prisma.projectReport.findUnique({ where: { id: reportId } })
  if (!report || !MANAGEMENT_REPORT_TYPES.includes(report.type as ManagementReportType)) throw new Error('Management report not found')
  const validation = validateManagementSummary(report.aiSummary)
  if (!validation.valid) throw new Error(validation.errors.join('; '))
  if (action === 'SUBMIT_REVIEW') {
    if (report.status !== 'DRAFT') throw new Error('Only draft reports can move to review')
    return prisma.projectReport.update({ where: { id: reportId }, data: { status: 'PM_REVIEW' } })
  }
  if (action === 'APPROVE') {
    if (report.status !== 'PM_REVIEW') throw new Error('Report must be in PM review before approval')
    return prisma.projectReport.update({ where: { id: reportId }, data: { status: 'APPROVED', approvedById: actorId, approvedAt: new Date() } })
  }
  if (report.status !== 'APPROVED') throw new Error('Report must be approved before it can be marked sent')
  return prisma.projectReport.update({ where: { id: reportId }, data: { status: 'SENT', sentAt: new Date() } })
}

async function buildSteeringReport(projectId: string, cadence: ManagementReportCadence, periodStart: Date, periodEnd: Date, now: Date): Promise<SteeringReportContent> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      stageGates: { include: { phase: { select: { name: true, position: true } } }, orderBy: { phase: { position: 'asc' } } },
      clientObligations: { where: { isContractual: true }, orderBy: { breachCount: 'desc' } },
      changeRequests: { where: { requestDate: { lte: periodEnd } }, orderBy: { createdAt: 'desc' } },
      raidItems: { where: { type: 'RISK', status: { not: 'CLOSED' } }, orderBy: [{ score: 'desc' }, { createdAt: 'desc' }] },
      delayEvents: { where: { createdAt: { lte: periodEnd } } },
      paymentMilestones: true,
    },
  })
  if (!project) throw new Error('Project not found')
  const obligationRates = project.clientObligations.map((row) => row.complianceRate)
  const complianceRate = clientHealthScore(obligationRates)
  const obligationRows = project.clientObligations.map((row) => ({
    obligation: row.obligation,
    responsiblePerson: row.responsiblePerson,
    slaBusinessDays: row.slaBusinessDays,
    breachCount: row.breachCount,
    complianceRate: row.complianceRate,
    healthTone: row.complianceRate == null ? 'GREEN' : clientHealthTone(row.complianceRate),
  }))
  const payments = project.paymentMilestones.map((row) => ({ ...row, invoiceStatus: effectiveInvoiceStatus(row, now) }))
  const byOwner = groupSum(project.delayEvents, (row) => row.owner, (row) => row.daysLost)
  const content: SteeringReportContent = {
    ...baseContent(project, cadence, periodStart, periodEnd, now),
    template: 'R6_STEERING_PACK',
    health: {
      ragStatus: project.ragStatus,
      confidence: project.confidence,
      percentComplete: round1(project.percentComplete),
      percentPlanned: round1(project.percentPlanned),
      spi: project.spi == null ? null : round2(project.spi),
      cpi: project.cpi == null ? null : round2(project.cpi),
      scheduleVariancePct: round1(project.percentComplete - project.percentPlanned),
    },
    stageGates: project.stageGates.map((gate) => ({
      phase: gate.phase.name,
      gate: gate.name,
      status: gate.status,
      gateDate: isoDate(gate.gateDate),
      requiredDeliverables: gate.requiredDeliverables,
      requiredApprovals: gate.requiredApprovals,
      waiverReason: gate.waiverReason,
    })),
    clientObligations: {
      complianceRate,
      breachCount: project.clientObligations.reduce((sum, row) => sum + row.breachCount, 0),
      ceoWarning: complianceRate < 60,
      rows: obligationRows,
    },
    changeRequests: project.changeRequests.slice(0, 20).map((row) => ({
      crCode: row.crCode,
      title: row.title,
      status: row.status,
      scheduleImpactDays: row.scheduleImpactDays,
      costImpact: row.costImpact,
      clientSignOff: row.clientSignOff,
    })),
    topRisks: project.raidItems.slice(0, 10).map((row) => ({
      refCode: row.refCode,
      title: row.title,
      score: row.score,
      status: row.status,
      mitigation: row.mitigation,
    })),
    delays: {
      totalDaysLost: round1(project.delayEvents.reduce((sum, row) => sum + row.daysLost, 0)),
      byOwner,
    },
    paymentMilestones: {
      readyToInvoice: payments.filter((row) => row.invoiceStatus === 'READY_TO_INVOICE').length,
      overdue: payments.filter((row) => row.invoiceStatus === 'OVERDUE').length,
      outstandingAmount: round1(payments.filter((row) => row.paymentStatus !== 'PAID').reduce((sum, row) => sum + row.amount, 0)),
      currency: project.currency,
    },
    aiSummary: '',
  }
  content.aiSummary = summary([
    `- ${project.ragStatus} steering health at ${round1(project.percentComplete)}% complete against ${round1(project.percentPlanned)}% planned.`,
    `- ${content.stageGates.filter((row) => row.status === 'PENDING' || row.status === 'FAILED').length} stage gate item(s) need steering visibility.`,
    `- Client obligation compliance is ${content.clientObligations.complianceRate}% with ${content.clientObligations.breachCount} breach(es).`,
    `- ${content.changeRequests.length} change request(s), ${content.topRisks.length} open risk(s), and ${content.delays.totalDaysLost} delay day(s) are included.`,
    `- Payments show ${content.paymentMilestones.readyToInvoice} ready-to-invoice and ${content.paymentMilestones.overdue} overdue milestone(s).`,
  ])
  return content
}

async function buildCoeReport(projectId: string, cadence: ManagementReportCadence, periodStart: Date, periodEnd: Date, now: Date): Promise<CoeReportContent> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, code: true, name: true, clientName: true, coeRecords: { orderBy: { createdAt: 'desc' } } },
  })
  if (!project) throw new Error('Project not found')
  const rows = project.coeRecords.map((row) => {
    const whys = parseWhys(row.whys)
    return {
      coeCode: row.coeCode,
      trigger: row.trigger,
      daysLost: row.daysLost,
      costImpact: row.costImpact,
      rootCauseClass: row.rootCauseClass,
      whysComplete: whys.filter((why) => why.why && why.answer).length >= 5,
      systemicFix: row.systemicFix,
      fixStatus: row.fixStatus,
      fixDueDate: toDateKey(row.fixDueDate),
      isOverdue: isOverdueCoe(row, now),
      fedIntoTemplate: row.fedIntoTemplate,
    }
  })
  const content: CoeReportContent = {
    ...baseContent(project, cadence, periodStart, periodEnd, now),
    template: 'R7_COE_REPORT',
    totals: {
      open: rows.filter((row) => row.fixStatus === 'OPEN').length,
      inProgress: rows.filter((row) => row.fixStatus === 'IN_PROGRESS').length,
      done: rows.filter((row) => row.fixStatus === 'DONE').length,
      overdue: rows.filter((row) => row.isOverdue).length,
      lessonsLearned: rows.filter((row) => row.fedIntoTemplate).length,
      costImpact: round1(rows.reduce((sum, row) => sum + (row.costImpact ?? 0), 0)),
      daysLost: round1(rows.reduce((sum, row) => sum + row.daysLost, 0)),
    },
    rootCausePareto: rootCausePareto(project.coeRecords),
    rows,
    aiSummary: '',
  }
  content.aiSummary = summary([
    `- ${rows.length} COE record(s) are in scope, with ${content.totals.overdue} overdue systemic fix(es).`,
    `- COEs account for ${content.totals.daysLost} lost day(s) and ${content.totals.costImpact} cost impact.`,
    `- Root-cause leader: ${content.rootCausePareto[0]?.rootCauseClass ?? 'none recorded'}.`,
    `- ${content.totals.lessonsLearned} lesson(s) have been fed back into templates.`,
  ])
  return content
}

async function buildEstimationReport(projectId: string, cadence: ManagementReportCadence, periodStart: Date, periodEnd: Date, now: Date): Promise<EstimationReportContent> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      phases: { include: { milestones: { include: { activities: true } } } },
      jiraConnection: { select: { id: true } },
    },
  })
  if (!project) throw new Error('Project not found')
  const activityRows = project.phases.flatMap((phase) =>
    phase.milestones.flatMap((milestone) =>
      milestone.activities
        .filter((activity) => activity.estimatedHours != null && activity.actualHours != null)
        .map((activity) => toEstimateRow({
          source: 'PROJECT_ACTIVITY' as const,
          key: activity.id,
          title: activity.title,
          owner: activity.assigneeId,
          estimateHours: activity.estimatedHours ?? 0,
          actualHours: activity.actualHours ?? 0,
        }))
    )
  )
  const jiraRows = project.jiraConnection?.id
    ? (await prisma.jiraIssue.findMany({
      where: { connectionId: project.jiraConnection.id, originalEstimateSeconds: { not: null }, timeSpentSeconds: { not: null } },
      orderBy: { jiraUpdatedAt: 'desc' },
      take: 200,
    })).map((issue) => toEstimateRow({
      source: 'JIRA' as const,
      key: issue.jiraKey,
      title: issue.summary,
      owner: issue.assigneeEmail ?? issue.assigneeUserId,
      estimateHours: (issue.originalEstimateSeconds ?? 0) / 3600,
      actualHours: (issue.timeSpentSeconds ?? 0) / 3600,
    }))
    : []
  const rows = [...activityRows, ...jiraRows].filter((row) => row.estimateHours > 0 || row.actualHours > 0)
  const accuracies = rows.map((row) => row.accuracy).filter((value) => Number.isFinite(value))
  const trend = estimationTrend(rows, periodEnd, cadence)
  const content: EstimationReportContent = {
    ...baseContent(project, cadence, periodStart, periodEnd, now),
    template: 'R9_ESTIMATION_LEARNING',
    jiraLinked: Boolean(project.jiraConnection?.id),
    totals: {
      estimatedItems: rows.filter((row) => row.estimateHours > 0).length,
      actualItems: rows.filter((row) => row.actualHours > 0).length,
      averageAccuracy: accuracies.length ? round2(accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length) : null,
      underEstimated: rows.filter((row) => row.bias === 'UNDER').length,
      overEstimated: rows.filter((row) => row.bias === 'OVER').length,
      balanced: rows.filter((row) => row.bias === 'BALANCED').length,
    },
    trend,
    rows: rows.slice(0, 80),
    aiSummary: '',
  }
  content.aiSummary = summary([
    `- ${content.totals.estimatedItems} estimated item(s) and ${content.totals.actualItems} actual item(s) are available for learning.`,
    `- Average estimate accuracy is ${content.totals.averageAccuracy ?? 'not available'}x actual effort.`,
    `- ${content.totals.underEstimated} item(s) under-estimated and ${content.totals.overEstimated} item(s) over-estimated.`,
    `- Jira evidence is ${content.jiraLinked ? 'included' : 'not linked for this project'}.`,
  ])
  return content
}

async function buildCapacityReport(projectId: string, cadence: ManagementReportCadence, periodStart: Date, periodEnd: Date, now: Date): Promise<CapacityReportContent> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      code: true,
      name: true,
      clientName: true,
      members: { select: { userId: true, role: true, allocationPct: true } },
    },
  })
  if (!project) throw new Error('Project not found')
  const weeks = Array.from({ length: cadence === 'QUARTERLY' ? 12 : 8 }, (_, index) => toDateKey(addDays(startOfWeek(now), index * 7)))
  const memberIds = project.members.map((member) => member.userId)
  const activities = await prisma.activity.findMany({
    where: {
      status: { notIn: ['FINISHED', 'APPROVED'] },
      assigneeId: { in: memberIds.length ? memberIds : ['__none__'] },
      milestone: { phase: { project: { archivedAt: null, status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] } } } },
    },
    select: {
      assigneeId: true,
      estimatedHours: true,
      currentStart: true,
      currentEnd: true,
      milestone: { select: { phase: { select: { projectId: true } } } },
    },
  })
  const users = memberIds.length
    ? await prisma.user.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true, email: true } })
    : []
  const userById = new Map(users.map((user) => [user.id, user]))
  const memberRole = new Map(project.members.map((member) => [member.userId, member.role]))
  const people = new Map<string, CapacityReportContent['people'][number]>()
  for (const member of project.members) {
    const user = userById.get(member.userId)
    people.set(member.userId, {
      userId: member.userId,
      name: user?.name ?? user?.email ?? 'Unassigned',
      role: member.role,
      totalHours: 0,
      maxAllocationPct: 0,
      status: 'IDLE',
      cells: weeks.map((weekStart) => ({ weekStart, hours: 0, allocationPct: 0, projectCount: 0 })),
    })
  }
  const from = new Date(`${weeks[0]}T00:00:00.000Z`)
  for (const activity of activities) {
    if (!activity.assigneeId || !people.has(activity.assigneeId)) continue
    const person = people.get(activity.assigneeId)!
    const activityStart = startOfDay(activity.currentStart ?? from)
    const activityEnd = startOfDay(activity.currentEnd ?? activity.currentStart ?? addDays(from, 7))
    const overlapWeeks = weeks
      .map((weekStart, index) => ({ index, start: new Date(`${weekStart}T00:00:00.000Z`), end: addDays(new Date(`${weekStart}T00:00:00.000Z`), 7) }))
      .filter((week) => activityEnd >= week.start && activityStart < week.end)
    const hours = activity.estimatedHours ?? Math.max(8, (businessDaysBetween(activityStart, activityEnd) + 1) * 4)
    const hoursPerWeek = hours / Math.max(1, overlapWeeks.length)
    person.totalHours += hours
    for (const week of overlapWeeks) {
      const cell = person.cells[week.index]
      cell.hours += hoursPerWeek
      cell.projectCount += activity.milestone.phase.projectId ? 1 : 0
      cell.allocationPct = Math.round((cell.hours / 40) * 100)
      person.maxAllocationPct = Math.max(person.maxAllocationPct, cell.allocationPct)
    }
  }
  const rows = [...people.values()].map((person) => {
    const totalHours = round1(person.totalHours)
    const status = capacityStatus(person.maxAllocationPct, totalHours)
    return {
      ...person,
      role: person.role ?? memberRole.get(person.userId ?? '') ?? null,
      totalHours,
      status,
      cells: person.cells.map((cell) => ({ ...cell, hours: round1(cell.hours) })),
    }
  }).sort((a, b) => b.maxAllocationPct - a.maxAllocationPct || a.name.localeCompare(b.name))
  const content: CapacityReportContent = {
    ...baseContent(project, cadence, periodStart, periodEnd, now),
    template: 'R10_CAPACITY_BENCH',
    weeks,
    totals: {
      people: rows.length,
      overAllocatedPeople: rows.filter((row) => row.status === 'OVER_ALLOCATED').length,
      idlePeople: rows.filter((row) => row.status === 'IDLE').length,
      totalHours: round1(rows.reduce((sum, row) => sum + row.totalHours, 0)),
      benchCandidates: rows.filter((row) => row.status === 'IDLE').length,
    },
    people: rows,
    aiSummary: '',
  }
  content.aiSummary = summary([
    `- ${rows.length} project member(s) are included in capacity review.`,
    `- ${content.totals.overAllocatedPeople} person(s) are over 100% allocation and ${content.totals.idlePeople} are idle in the visible window.`,
    `- Planned workload totals ${content.totals.totalHours} hour(s) across ${weeks.length} week(s).`,
    `- Bench candidates: ${content.totals.benchCandidates}.`,
  ])
  return content
}

function baseContent(
  project: { id: string; code: string; name: string; clientName: string },
  cadence: ManagementReportCadence,
  periodStart: Date,
  periodEnd: Date,
  now: Date,
): BaseManagementContent {
  return {
    cadence,
    projectId: project.id,
    projectCode: project.code,
    projectName: project.name,
    clientName: project.clientName,
    periodLabel: `${toDateKey(periodStart)} to ${toDateKey(periodEnd)}`,
    generatedOn: toDateKey(now),
  }
}

function toEstimateRow(input: {
  source: 'PROJECT_ACTIVITY' | 'JIRA'
  key: string
  title: string
  owner: string | null
  estimateHours: number
  actualHours: number
}): EstimationReportContent['rows'][number] {
  const estimateHours = round1(input.estimateHours)
  const actualHours = round1(input.actualHours)
  const accuracy = estimateHours > 0 ? round2(actualHours / estimateHours) : actualHours > 0 ? 999 : 0
  return {
    ...input,
    estimateHours,
    actualHours,
    accuracy,
    bias: estimationBias(accuracy),
  }
}

function estimationTrend(rows: EstimationReportContent['rows'], periodEnd: Date, cadence: ManagementReportCadence): EstimationReportContent['trend'] {
  const label = cadence === 'QUARTERLY' ? 'Current quarter' : 'Current month'
  const accuracies = rows.map((row) => row.accuracy).filter((value) => Number.isFinite(value) && value < 999)
  return [{
    period: `${label} ending ${toDateKey(periodEnd)}`,
    averageAccuracy: accuracies.length ? round2(accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length) : null,
    itemCount: accuracies.length,
  }]
}

function bundleReports(cadence: ManagementReportCadence, reports: ProjectReport[]): ManagementReportBundle {
  return {
    cadence,
    reports,
    steeringReport: reports.find((report) => report.type === 'STEERING') ?? null,
    coeReport: reports.find((report) => report.type === 'COE') ?? null,
    estimationReport: reports.find((report) => report.type === 'ESTIMATION') ?? null,
    capacityReport: reports.find((report) => report.type === 'CAPACITY') ?? null,
  }
}

function latestCadence(reports: ProjectReport[]): ManagementReportCadence {
  const value = (reports[0]?.contentJson as unknown as { cadence?: string } | null)?.cadence
  return value === 'QUARTERLY' ? 'QUARTERLY' : 'MONTHLY'
}

function groupSum<T>(rows: T[], keyFn: (row: T) => string, valueFn: (row: T) => number): Array<{ owner: string; daysLost: number }> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = keyFn(row)
    map.set(key, (map.get(key) ?? 0) + valueFn(row))
  }
  return [...map.entries()].map(([owner, daysLost]) => ({ owner, daysLost: round1(daysLost) })).sort((a, b) => b.daysLost - a.daysLost)
}

function summary(items: string[]): string {
  const capped = items.slice(0, AI_SUMMARY_MAX_BULLETS).map((item) => item.trim()).filter(Boolean)
  while (capped.join('\n').length > AI_SUMMARY_MAX_CHARS && capped.length > 1) capped.pop()
  let text = capped.join('\n')
  if (text.length > AI_SUMMARY_MAX_CHARS) text = `${text.slice(0, AI_SUMMARY_MAX_CHARS - 1).trimEnd()}…`
  return text
}

function renderSteeringPdf(content: SteeringReportContent): string {
  const kpis = kpiGrid([
    ['RAG', content.health.ragStatus],
    ['Confidence', content.health.confidence],
    ['Complete', `${content.health.percentComplete}%`],
    ['Planned', `${content.health.percentPlanned}%`],
    ['SPI', content.health.spi ?? '-'],
    ['Obligation compliance', `${content.clientObligations.complianceRate}%`],
  ])
  return basePdf('R6 Steering Pack', content.projectName, content.periodLabel, `${summaryBlock(content.aiSummary)}${kpis}${table('Stage Gates', ['Phase', 'Gate', 'Status', 'Gate date', 'Waiver'], content.stageGates.map((row) => [row.phase, row.gate, row.status, row.gateDate ?? '-', row.waiverReason ?? '-']))}${table('Change Requests', ['CR', 'Title', 'Status', 'Days', 'Cost', 'Sign-off'], content.changeRequests.map((row) => [row.crCode, row.title, row.status, row.scheduleImpactDays, row.costImpact, row.clientSignOff ? 'Yes' : 'No']))}${table('Top Risks', ['Ref', 'Risk', 'Score', 'Status', 'Mitigation'], content.topRisks.map((row) => [row.refCode, row.title, row.score ?? '-', row.status, row.mitigation ?? '-']))}`)
}

function renderCoePdf(content: CoeReportContent): string {
  return basePdf('R7 COE Report', content.projectName, content.periodLabel, `${summaryBlock(content.aiSummary)}${kpiGrid([
    ['Open', content.totals.open],
    ['In progress', content.totals.inProgress],
    ['Done', content.totals.done],
    ['Overdue', content.totals.overdue],
    ['Days lost', content.totals.daysLost],
    ['Lessons', content.totals.lessonsLearned],
  ])}${table('COE Rows', ['COE', 'Trigger', 'Root cause', 'Days', 'Status', 'Due', 'Overdue', 'Fed to template'], content.rows.map((row) => [row.coeCode, row.trigger, row.rootCauseClass, row.daysLost, row.fixStatus, row.fixDueDate, row.isOverdue ? 'Yes' : 'No', row.fedIntoTemplate ? 'Yes' : 'No']))}`)
}

function renderEstimationPdf(content: EstimationReportContent): string {
  return basePdf('R9 Estimation Learning Report', content.projectName, content.periodLabel, `${summaryBlock(content.aiSummary)}${kpiGrid([
    ['Estimated', content.totals.estimatedItems],
    ['Actuals', content.totals.actualItems],
    ['Avg accuracy', content.totals.averageAccuracy ?? '-'],
    ['Under', content.totals.underEstimated],
    ['Over', content.totals.overEstimated],
    ['Balanced', content.totals.balanced],
  ])}${table('Estimate Learning Rows', ['Source', 'Key', 'Title', 'Estimate', 'Actual', 'Accuracy', 'Bias'], content.rows.map((row) => [row.source, row.key, row.title, row.estimateHours, row.actualHours, row.accuracy, row.bias]))}`)
}

function renderCapacityPdf(content: CapacityReportContent): string {
  return basePdf('R10 Capacity / Bench Report', content.projectName, content.periodLabel, `${summaryBlock(content.aiSummary)}${kpiGrid([
    ['People', content.totals.people],
    ['Over allocated', content.totals.overAllocatedPeople],
    ['Idle', content.totals.idlePeople],
    ['Total hours', content.totals.totalHours],
    ['Bench', content.totals.benchCandidates],
  ])}${table('Capacity Rows', ['Person', 'Role', 'Total hours', 'Max allocation', 'Status'], content.people.map((row) => [row.name, row.role ?? '-', row.totalHours, `${row.maxAllocationPct}%`, row.status]))}`)
}

function basePdf(title: string, projectName: string, period: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><style>body{font-family:Inter,Arial,sans-serif;color:#172033;margin:28px;font-size:12px}h1{font-size:24px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 8px}.muted{color:#667085}.summary{border:1px solid #d0d5dd;border-radius:8px;background:#f8fafc;padding:12px;white-space:pre-line}.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:16px 0}.kpi{border:1px solid #d0d5dd;border-radius:8px;padding:8px}.kpi b{display:block;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border-bottom:1px solid #e4e7ec;padding:6px;text-align:left;vertical-align:top}th{background:#f8fafc;color:#475467;text-transform:uppercase;font-size:10px}</style></head><body><h1>${escapeHtml(title)}</h1><div class="muted">${escapeHtml(projectName)} · ${escapeHtml(period)}</div>${body}</body></html>`
}

function summaryBlock(value: string): string {
  return `<h2>Executive Summary</h2><div class="summary">${escapeHtml(value)}</div>`
}

function kpiGrid(items: Array<[string, string | number]>): string {
  return `<div class="kpis">${items.map(([label, value]) => `<div class="kpi"><span>${escapeHtml(label)}</span><b>${escapeHtml(String(value))}</b></div>`).join('')}</div>`
}

function table(title: string, headers: string[], rows: Array<Array<string | number>>): string {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}" class="muted">None.</td></tr>`
  return `<h2>${escapeHtml(title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function reportTitle(type: string): string {
  if (type === 'STEERING') return 'R6 Steering Pack'
  if (type === 'COE') return 'R7 COE Report'
  if (type === 'ESTIMATION') return 'R9 Estimation Learning Report'
  if (type === 'CAPACITY') return 'R10 Capacity / Bench Report'
  return 'Project Report'
}

function startOfWeek(date: Date): Date {
  const day = date.getUTCDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diffToMonday, 0, 0, 0, 0))
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0))
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function isoDate(value: Date | null | undefined): string | null {
  return value ? toDateKey(value) : null
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
