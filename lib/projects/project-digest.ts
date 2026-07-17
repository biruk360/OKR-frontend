/**
 * Daily project digest (build spec §5.3).
 *
 * Sends each project manager a 07:00 digest of overdue activities, blocked
 * work, waiting approvals, upcoming due dates, failed gates, overdue payments,
 * open high-risk RAID items, and overdue COEs for the projects they manage.
 */

import { prisma } from '@/lib/prisma'
import { emit } from '@/lib/notifications'
import { businessDaysBetween } from './business-days'
import { isPaymentMilestoneOverdue } from './payment-milestones'
import type { RagStatus } from '@/features/projects/types'

const ACTIVE_PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD'] as const
const TERMINAL_STATUSES = ['FINISHED', 'APPROVED']

export interface ProjectDigestIssueCounts {
  overdue: number
  blocked: number
  waitingApproval: number
  upcoming: number
  highRisks: number
  overduePayments: number
  overdueCoes: number
  failedGates: number
}

export interface ProjectDigestRow extends ProjectDigestIssueCounts {
  id: string
  code: string
  name: string
  ragStatus: RagStatus
  deepLink: string
}

export interface PmDigest {
  dayLabel: string
  projectCount: number
  redCount: number
  amberCount: number
  greenCount: number
  overdueCount: number
  blockedCount: number
  waitingApprovalCount: number
  upcomingCount: number
  projects: ProjectDigestRow[]
}

interface ActivityDigestShape {
  id: string
  title: string
  status: string
  currentEnd: Date | null
  isBlocked: boolean
  waitingSince: Date | null
  milestone: { phase: { projectId: string } }
}

interface StageGateDigestShape {
  projectId: string
  status: string
}

interface PaymentMilestoneDigestShape {
  projectId: string
  actualInvoiceDate: Date | null
  invoiceStatus: string
  paymentStatus: string
}

interface RaidItemDigestShape {
  projectId: string
  type: string
  status: string
  score: number | null
}

interface CoeDigestShape {
  projectId: string
  fixStatus: string
  fixDueDate: Date | null
}

interface AggregateDigestInput {
  projects: Array<{ id: string; code: string; name: string; ragStatus: RagStatus }>
  activities: ActivityDigestShape[]
  stageGates: StageGateDigestShape[]
  paymentMilestones: PaymentMilestoneDigestShape[]
  raidItems: RaidItemDigestShape[]
  coes: CoeDigestShape[]
  now: Date
}

/** Pure aggregation used by the runner and unit-tested without a database. */
export function aggregatePmDigest(input: AggregateDigestInput): PmDigest {
  const { projects, activities, stageGates, paymentMilestones, raidItems, coes, now } = input

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const upcomingCutoff = new Date(todayStart)
  upcomingCutoff.setDate(upcomingCutoff.getDate() + 4)

  const activitiesByProject = groupBy(activities, (a) => a.milestone.phase.projectId)
  const gatesByProject = groupBy(stageGates, (g) => g.projectId)
  const paymentsByProject = groupBy(paymentMilestones, (p) => p.projectId)
  const raidsByProject = groupBy(raidItems, (r) => r.projectId)
  const coesByProject = groupBy(coes, (c) => c.projectId)

  let redCount = 0
  let amberCount = 0
  let greenCount = 0
  let overdueCount = 0
  let blockedCount = 0
  let waitingApprovalCount = 0
  let upcomingCount = 0

  const rows: ProjectDigestRow[] = []

  for (const project of projects) {
    const projectActivities = activitiesByProject.get(project.id) ?? []
    const projectGates = gatesByProject.get(project.id) ?? []
    const projectPayments = paymentsByProject.get(project.id) ?? []
    const projectRaids = raidsByProject.get(project.id) ?? []
    const projectCoes = coesByProject.get(project.id) ?? []

    const counts: ProjectDigestIssueCounts = {
      overdue: 0,
      blocked: 0,
      waitingApproval: 0,
      upcoming: 0,
      highRisks: 0,
      overduePayments: 0,
      overdueCoes: 0,
      failedGates: 0,
    }

    for (const a of projectActivities) {
      if (a.isBlocked) {
        counts.blocked++
        blockedCount++
      }
      if (a.status === 'APPROVAL_REQUESTED' && a.waitingSince) {
        counts.waitingApproval++
        waitingApprovalCount++
      }
      if (a.currentEnd && !TERMINAL_STATUSES.includes(a.status)) {
        if (a.currentEnd < todayStart) {
          counts.overdue++
          overdueCount++
        } else if (a.currentEnd >= tomorrowStart && a.currentEnd < upcomingCutoff) {
          counts.upcoming++
          upcomingCount++
        }
      }
    }

    counts.failedGates = projectGates.filter((g) => g.status === 'FAILED').length
    counts.highRisks = projectRaids.filter(
      (r) => r.type === 'RISK' && ['OPEN', 'MITIGATING'].includes(r.status) && (r.score ?? 0) >= 15,
    ).length
    counts.overduePayments = projectPayments.filter((p) =>
      isPaymentMilestoneOverdue(
        { actualInvoiceDate: p.actualInvoiceDate, invoiceStatus: p.invoiceStatus, paymentStatus: p.paymentStatus },
        now,
      ),
    ).length
    counts.overdueCoes = projectCoes.filter((c) => c.fixStatus !== 'DONE' && c.fixDueDate && c.fixDueDate < now).length

    if (project.ragStatus === 'RED') redCount++
    else if (project.ragStatus === 'AMBER') amberCount++
    else if (project.ragStatus === 'GREEN') greenCount++

    rows.push({
      ...project,
      deepLink: `/dashboard/projects/${project.id}`,
      ...counts,
    })
  }

  const dayLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return {
    dayLabel,
    projectCount: projects.length,
    redCount,
    amberCount,
    greenCount,
    overdueCount,
    blockedCount,
    waitingApprovalCount,
    upcomingCount,
    projects: rows,
  }
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return map
}

/** Build the digest for a single project manager. Returns null if they have no active projects. */
export async function buildPmDigest(pmId: string, now = new Date()): Promise<PmDigest | null> {
  const projects = await prisma.project.findMany({
    where: {
      projectManagerId: pmId,
      archivedAt: null,
      status: { in: ACTIVE_PROJECT_STATUSES as unknown as string[] },
    },
    select: { id: true, code: true, name: true, ragStatus: true },
    orderBy: { code: 'asc' },
  })
  if (projects.length === 0) return null

  const projectIds = projects.map((p) => p.id)

  const [activities, stageGates, paymentMilestones, raidItems, coes] = await Promise.all([
    prisma.activity.findMany({
      where: { milestone: { phase: { projectId: { in: projectIds } } } },
      select: {
        id: true,
        title: true,
        status: true,
        currentEnd: true,
        isBlocked: true,
        waitingSince: true,
        milestone: { select: { phase: { select: { projectId: true } } } },
      },
    }),
    prisma.stageGate.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, status: true },
    }),
    prisma.paymentMilestone.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, actualInvoiceDate: true, invoiceStatus: true, paymentStatus: true },
    }),
    prisma.raidItem.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, type: true, status: true, score: true },
    }),
    prisma.correctionOfError.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, fixStatus: true, fixDueDate: true },
    }),
  ])

  return aggregatePmDigest({
    projects: projects as Array<{ id: string; code: string; name: string; ragStatus: RagStatus }>,
    activities,
    stageGates,
    paymentMilestones,
    raidItems,
    coes,
    now,
  })
}

/** Run the daily digest for all active project managers. */
export async function runProjectDigest(now = new Date()): Promise<{ generated: number; skipped: number }> {
  const pms = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
    distinct: ['id'],
  })
  // Only users who manage at least one active project are relevant.
  const pmIds = (await prisma.project.groupBy({
    by: ['projectManagerId'],
    where: { archivedAt: null, status: { in: ACTIVE_PROJECT_STATUSES as unknown as string[] } },
  })).map((g) => g.projectManagerId)

  let generated = 0
  let skipped = 0

  for (const pmId of pmIds) {
    try {
      const digest = await buildPmDigest(pmId, now)
      if (!digest || digest.projects.length === 0) {
        skipped++
        continue
      }

      await emit('PROJECT_DAILY_DIGEST', {
        actorId: 'system',
        entityType: 'PROJECT',
        entityId: 'portfolio',
        entityTitle: 'Daily project digest',
        explicitRecipients: [pmId],
        data: { ...digest, deepLink: '/dashboard/projects' },
      })
      generated++
    } catch (err) {
      console.error('[project-digest] failed for PM', pmId, err)
      skipped++
    }
  }

  return { generated, skipped }
}
