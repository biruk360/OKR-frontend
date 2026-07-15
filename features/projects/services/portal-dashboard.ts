import { businessDaysBetween } from '@/lib/projects/business-days'
import type { ClientActivity, ClientProject } from './portal-serializer'

export interface PortalActivityPath {
  phaseName: string
  milestoneName: string
  activity: ClientActivity
}

export interface PortalAwaitingAction {
  activityId: string
  title: string
  phaseName: string
  milestoneName: string
  waitingSince: string | null
  daysWaiting: number
  slaBusinessDays: number
  isOverSla: boolean
}

export interface PortalDelayRow {
  id: string
  activityId: string | null
  activityTitle: string
  originalDate: string | null
  currentDate: string | null
  daysLost: number
  reason: string
  owner: string
}

export function flattenClientActivities(project: ClientProject): PortalActivityPath[] {
  return project.phases.flatMap((phase) =>
    phase.milestones.flatMap((milestone) =>
      milestone.activities.map((activity) => ({
        phaseName: phase.name,
        milestoneName: milestone.name,
        activity,
      }))
    )
  )
}

export function awaitingClientActions(project: ClientProject, now = new Date(), slaBusinessDays = 3): PortalAwaitingAction[] {
  return flattenClientActivities(project)
    .filter(({ activity }) => activity.owner === 'Your Team' && activity.status === 'APPROVAL_REQUESTED')
    .map(({ phaseName, milestoneName, activity }) => {
      const daysWaiting = activity.waitingSince ? businessDaysBetween(new Date(activity.waitingSince), now) : 0
      return {
        activityId: activity.id,
        title: activity.title,
        phaseName,
        milestoneName,
        waitingSince: activity.waitingSince,
        daysWaiting,
        slaBusinessDays,
        isOverSla: daysWaiting > slaBusinessDays,
      }
    })
    .sort((a, b) => b.daysWaiting - a.daysWaiting || a.title.localeCompare(b.title))
}

export function activityById(project: ClientProject): Map<string, ClientActivity> {
  return new Map(flattenClientActivities(project).map(({ activity }) => [activity.id, activity]))
}

export function portalDelayRows(project: ClientProject, delays: readonly {
  id: string
  activityId: string | null
  reason: string
  owner: string
  daysLost: number
}[]): PortalDelayRow[] {
  const activities = activityById(project)
  return delays.map((delay) => {
    const activity = delay.activityId ? activities.get(delay.activityId) : null
    return {
      id: delay.id,
      activityId: delay.activityId,
      activityTitle: activity?.title ?? 'Project-level delay',
      originalDate: activity?.baselineEnd ?? null,
      currentDate: activity?.currentEnd ?? null,
      daysLost: delay.daysLost,
      reason: delay.reason,
      owner: delay.owner,
    }
  })
}
