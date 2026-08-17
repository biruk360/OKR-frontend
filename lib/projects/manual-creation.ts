import {
  createEmptyProjectCreationScheduleJson,
  projectCreationScheduleJsonSchema,
  type ProjectCreationScheduleJson,
} from './creation-normalize'
import type { TemplateStructure } from './templates'

const MANUAL_TEMPLATE_SOURCE_ID = 'manual-template-selection'
const MANUAL_TEMPLATE_REFERENCE_PREFIX = 'project-template:'

/**
 * Store the Manual branch's lifecycle choice inside the provider-neutral schedule
 * slice. This keeps Start blank represented by an actually empty schedule and lets a
 * saved draft resume its selected template without adding provider-specific fields.
 */
export function createManualScheduleJson(templateId: string | null): ProjectCreationScheduleJson {
  const schedule = createEmptyProjectCreationScheduleJson()
  if (!templateId) return schedule

  return projectCreationScheduleJsonSchema.parse({
    ...schedule,
    sources: [{
      id: MANUAL_TEMPLATE_SOURCE_ID,
      type: 'TEMPLATE',
      reference: `${MANUAL_TEMPLATE_REFERENCE_PREFIX}${templateId}`,
      excerpt: null,
      targetPaths: ['schedule'],
      basis: 'USER_DECISION',
      confidence: 'HIGH',
      lastEditor: 'USER',
    }],
  })
}

export function getManualTemplateId(
  schedule: ProjectCreationScheduleJson | null,
): string | null {
  const source = schedule?.sources.find((candidate) => (
    candidate.id === MANUAL_TEMPLATE_SOURCE_ID
    && candidate.type === 'TEMPLATE'
    && candidate.reference.startsWith(MANUAL_TEMPLATE_REFERENCE_PREFIX)
  ))
  const templateId = source?.reference.slice(MANUAL_TEMPLATE_REFERENCE_PREFIX.length).trim()
  return templateId || null
}

/**
 * Copy a selected lifecycle into the normalized private draft before review.
 * Dates deliberately remain unset: templates define structure, while the reviewer
 * retains control of every proposed schedule date and assignment.
 */
export function createManualReviewScheduleJson(
  templateId: string | null,
  structure?: TemplateStructure | null,
): ProjectCreationScheduleJson {
  const schedule = createManualScheduleJson(templateId)
  if (!templateId || !structure) return schedule

  structure.phases.forEach((phase, phaseIndex) => {
    const phaseId = `manual-phase-${phaseIndex + 1}`
    schedule.phases.push({
      id: phaseId,
      name: phase.name,
      position: phaseIndex,
      weight: phase.weight,
      plannedStart: null,
      plannedEnd: null,
    })
    phase.milestones.forEach((milestone, milestoneIndex) => {
      const milestoneId = `manual-milestone-${phaseIndex + 1}-${milestoneIndex + 1}`
      schedule.milestones.push({
        id: milestoneId,
        phaseId,
        name: milestone.name,
        position: milestoneIndex,
        weight: milestone.weight ?? 1,
        isKeyMilestone: milestone.isKeyMilestone ?? false,
        dueDate: null,
      })
      milestone.activities.forEach((activity, activityIndex) => {
        schedule.activities.push({
          id: `manual-activity-${phaseIndex + 1}-${milestoneIndex + 1}-${activityIndex + 1}`,
          sourceRowId: null,
          milestoneId,
          parentActivityId: null,
          position: activityIndex,
          title: activity.title,
          description: null,
          ownerParty: activity.ownerParty ?? '360GROUND',
          assigneeId: null,
          assigneeEmail: null,
          suggestedRole: null,
          startDate: null,
          endDate: null,
          weight: activity.weight ?? 1,
          estimatedHours: null,
          priority: null,
          risk: null,
          isBlocked: false,
          blockerDetails: null,
          isApproval: activity.isApproval ?? false,
        })
      })
    })
  })
  return projectCreationScheduleJsonSchema.parse(schedule)
}
