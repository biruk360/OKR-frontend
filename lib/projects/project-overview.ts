import type { ActivityNode, ProjectDetail } from '@/features/projects/hooks/useProject'
import { ACTIVITY_STATUS_LABEL, type ActivityStatus } from '@/features/projects/types'

interface FlatActivity {
  id: string
  phase: string
  status: ActivityStatus
  ownerParty: string
  priority: string | null
  risk: string | null
  slipDays: number
  estimatedHours: number | null
  actualHours: number | null
  estimatedCost: number | null
  actualCost: number | null
}

export interface ProjectOverviewReport {
  statusDistribution: Array<{ status: ActivityStatus; name: string; value: number }>
  phaseCompletion: Array<{ name: string; completion: number }>
  sectionCompletion: Array<{ name: string; completion: number }>
  delayByOwner: Array<{ name: string; days: number }>
  hoursByPhase: Array<{ name: string; estimated: number; actual: number }>
  costByPhase: Array<{ name: string; estimated: number; actual: number }>
  riskPriority: Array<{ name: string; risk: number; priority: number }>
  estimateAccuracy: Array<{ estimated: number; actual: number; name: string }>
}

export function buildProjectOverviewReport(project: ProjectDetail): ProjectOverviewReport {
  const activities = flatten(project)
  const statusDistribution = (Object.keys(ACTIVITY_STATUS_LABEL) as ActivityStatus[])
    .map((status) => ({ status, name: ACTIVITY_STATUS_LABEL[status], value: activities.filter((activity) => activity.status === status).length }))
    .filter((row) => row.value > 0)

  const aggregateByPhase = (fields: Array<'estimatedHours' | 'actualHours' | 'estimatedCost' | 'actualCost'>) => project.phases.map((phase) => {
    const phaseActivities = activities.filter((activity) => activity.phase === phase.name)
    const row: Record<string, string | number> = { name: phase.name }
    for (const field of fields) row[field] = sumEntered(phaseActivities.map((activity) => activity[field]))
    return row
  })

  const ownerLabels: Record<string, string> = { CLIENT: 'Client', '360GROUND': '360Ground', SHARED: 'Shared' }
  const delayByOwner = Object.entries(ownerLabels).map(([ownerParty, name]) => ({
    name,
    days: activities.filter((activity) => activity.ownerParty === ownerParty && activity.slipDays > 0).reduce((sum, activity) => sum + activity.slipDays, 0),
  })).filter((row) => row.days > 0)

  const levels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  const riskPriority = levels.map((level) => ({
    name: level.charAt(0) + level.slice(1).toLowerCase(),
    risk: activities.filter((activity) => activity.risk === level).length,
    priority: activities.filter((activity) => activity.priority === level).length,
  })).filter((row) => row.risk > 0 || row.priority > 0)

  return {
    statusDistribution,
    phaseCompletion: project.phases.map((phase) => ({ name: phase.name, completion: round1(phase.percentComplete) })),
    sectionCompletion: project.phases.flatMap((phase) => phase.milestones.map((section) => ({ name: section.name, completion: round1(section.percentComplete) }))),
    delayByOwner,
    hoursByPhase: aggregateByPhase(['estimatedHours', 'actualHours'])
      .map((row) => ({ name: String(row.name), estimated: Number(row.estimatedHours), actual: Number(row.actualHours) }))
      .filter((row) => row.estimated > 0 || row.actual > 0),
    costByPhase: aggregateByPhase(['estimatedCost', 'actualCost'])
      .map((row) => ({ name: String(row.name), estimated: Number(row.estimatedCost), actual: Number(row.actualCost) }))
      .filter((row) => row.estimated > 0 || row.actual > 0),
    riskPriority,
    estimateAccuracy: activities
      .filter((activity) => activity.estimatedHours != null && activity.actualHours != null)
      .map((activity) => ({ estimated: activity.estimatedHours!, actual: activity.actualHours!, name: activity.id })),
  }
}

function flatten(project: ProjectDetail): FlatActivity[] {
  return project.phases.flatMap((phase) => phase.milestones.flatMap((section) => section.activities.map((activity) => toFlatActivity(activity, phase.name))))
}

function toFlatActivity(activity: ActivityNode, phase: string): FlatActivity {
  return {
    id: activity.id,
    phase,
    status: activity.status,
    ownerParty: activity.ownerParty,
    priority: activity.priority,
    risk: activity.risk,
    slipDays: activity.slipDays,
    estimatedHours: activity.estimatedHours,
    actualHours: activity.actualHours,
    estimatedCost: activity.estimatedCost,
    actualCost: activity.actualCost,
  }
}

function sumEntered(values: Array<number | null>): number {
  return Math.round(values.reduce<number>((sum, value) => sum + (value ?? 0), 0) * 100) / 100
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
