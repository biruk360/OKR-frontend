import * as XLSX from 'xlsx'
import type { NormalizedProjectCreationDraft } from './creation-normalize'

export interface ProjectCreationDraftWorkbook {
  bytes: Uint8Array
  filename: string
  contentType: string
}

function sheetFromRows(rows: unknown[][], widths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = widths.map((wch) => ({ wch }))
  if (rows.length > 1 && rows[0].length > 0) {
    sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(rows[0].length - 1)}${rows.length}` }
  }
  return sheet
}

/** Create the user-controlled review workbook. No production project data is read or written. */
export function createProjectCreationDraftWorkbook(
  draft: NormalizedProjectCreationDraft,
  draftId = 'draft',
): ProjectCreationDraftWorkbook {
  const workbook = XLSX.utils.book_new()
  const project = draft.project
  XLSX.utils.book_append_sheet(workbook, sheetFromRows([
    ['Field', 'Value'],
    ['Name', project.name ?? ''],
    ['Code', project.code ?? ''],
    ['Client', project.clientName ?? ''],
    ['Description', project.description ?? ''],
    ['Project manager ID', project.projectManagerId ?? ''],
    ['Department ID', project.departmentId ?? ''],
    ['Contract value', project.contractValue ?? ''],
    ['Currency', project.currency],
    ['Planned start', project.plannedStart ?? ''],
    ['Planned end', project.plannedEnd ?? ''],
    ['Project type', project.projectType ?? ''],
    ['Objective', project.objective ?? ''],
    ['Business outcome', project.businessOutcome ?? ''],
    ['Scope included', project.scopeIncluded.join('\n')],
    ['Scope excluded', project.scopeExcluded.join('\n')],
  ], [24, 70]), 'Project Details')

  const phaseById = new Map(draft.phases.map((item) => [item.id, item]))
  const milestoneById = new Map(draft.milestones.map((item) => [item.id, item]))
  XLSX.utils.book_append_sheet(workbook, sheetFromRows([
    ['Phase', 'Milestone', 'Activity', 'Description', 'Owner', 'Assignee ID', 'Start', 'End', 'Weight', 'Hours', 'Priority', 'Risk', 'Blocked', 'Approval'],
    ...draft.activities.map((activity) => {
      const milestone = milestoneById.get(activity.milestoneId)
      const phase = milestone ? phaseById.get(milestone.phaseId) : undefined
      return [phase?.name ?? '', milestone?.name ?? '', activity.title, activity.description ?? '', activity.ownerParty, activity.assigneeId ?? '', activity.startDate ?? '', activity.endDate ?? '', activity.weight, activity.estimatedHours ?? '', activity.priority ?? '', activity.risk ?? '', activity.isBlocked ? 'YES' : 'NO', activity.isApproval ? 'YES' : 'NO']
    }),
  ], [24, 24, 32, 42, 14, 24, 13, 13, 10, 10, 12, 10, 10, 10]), 'Schedule')

  XLSX.utils.book_append_sheet(workbook, sheetFromRows([
    ['Name', 'Milestone', 'Producing activity IDs', 'Due date', 'Owner', 'Approval activity ID', 'Approval criteria'],
    ...draft.deliverables.map((item) => [item.name, milestoneById.get(item.milestoneId)?.name ?? item.milestoneId, item.producingActivityIds.join('; '), item.dueDate ?? '', item.ownerParty, item.approvalActivityId ?? '', item.approvalCriteria ?? '']),
  ], [30, 24, 42, 13, 14, 26, 50]), 'Deliverables')

  const activityById = new Map(draft.activities.map((item) => [item.id, item]))
  XLSX.utils.book_append_sheet(workbook, sheetFromRows([
    ['Predecessor', 'Successor', 'Type', 'Lag days'],
    ...draft.dependencies.map((item) => [activityById.get(item.predecessorActivityId)?.title ?? item.predecessorActivityId, activityById.get(item.successorActivityId)?.title ?? item.successorActivityId, item.type, item.lagDays]),
  ], [32, 32, 10, 12]), 'Dependencies')

  XLSX.utils.book_append_sheet(workbook, sheetFromRows([
    ['Kind', 'Text', 'Category / Impact', 'Status', 'Answer', 'Affected paths'],
    ...draft.assumptions.map((item) => ['Assumption', item.text, item.category, item.status, '', item.affectedPaths.join('; ')]),
    ...draft.questions.map((item) => ['Question', item.text, item.impact, item.status, item.answer ?? '', item.affectedPaths.join('; ')]),
  ], [14, 60, 20, 28, 50, 42]), 'Assumptions Questions')

  XLSX.utils.book_append_sheet(workbook, sheetFromRows([
    ['Severity', 'Code', 'Message', 'Source row', 'Field', 'Suggested correction', 'Affected paths'],
    ...draft.issues.map((item) => [item.severity, item.code, item.message, item.sourceRow ?? '', item.field ?? '', item.suggestedCorrection ?? '', item.affectedPaths.join('; ')]),
    ...draft.warnings.map((item) => [item.severity, item.code, item.message, '', '', item.acknowledged ? 'Acknowledged' : 'Needs acknowledgement', item.affectedPaths.join('; ')]),
  ], [12, 24, 60, 12, 24, 50, 42]), 'Validation')

  XLSX.utils.book_append_sheet(workbook, sheetFromRows([
    ['Kind', 'Reference / Path', 'Excerpt / Reason', 'Basis', 'Confidence', 'Status / Editor', 'Target paths / Sources'],
    ...draft.sources.map((item) => ['Source', item.reference, item.excerpt ?? '', item.basis, item.confidence, item.lastEditor, item.targetPaths.join('; ')]),
    ...draft.changes.map((item) => ['Change', item.path, item.reason, '', item.confidence, item.status, item.sourceIds.join('; ')]),
  ], [14, 42, 60, 26, 14, 18, 48]), 'Source Changes')

  const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return {
    bytes: new Uint8Array(output),
    filename: `project-creation-${draftId}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
}

export function renumberPositions<T extends { position: number }>(items: T[]): T[] {
  return items.map((item, position) => ({ ...item, position }))
}

export function movePositionedItem<T extends { position: number }>(
  items: T[],
  index: number,
  direction: -1 | 1,
): T[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return renumberPositions(items)
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return renumberPositions(next)
}
