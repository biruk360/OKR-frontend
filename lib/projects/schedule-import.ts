export const SCHEDULE_IMPORT_HEADERS = [
  'Row ID',
  'Phase',
  'Phase Weight',
  'Milestone',
  'Milestone Weight',
  'Key Milestone',
  'Activity',
  'Parent Row ID',
  'Description',
  'Owner Party',
  'Assignee Email',
  'Start Date',
  'End Date',
  'Activity Weight',
  'Priority',
  'Risk',
  'Is Blocked',
  'Blocker Details',
  'Predecessor Row IDs',
  'Dependency Types',
  'Lag Days',
] as const

export type ScheduleImportRecord = Record<string, unknown>

export interface ParsedScheduleRow {
  sourceRow: number
  rowId: string
  phase: string
  phaseWeight: number
  milestone: string
  milestoneWeight: number
  keyMilestone: boolean
  activity: string
  parentRowId: string | null
  description: string | null
  ownerParty: '360GROUND' | 'CLIENT' | 'SHARED'
  assigneeEmail: string | null
  startDate: Date | null
  endDate: Date | null
  activityWeight: number
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | null
  isBlocked: boolean
  blockerDetails: string | null
  dependencies: { predecessorRowId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lagDays: number }[]
}

export interface ScheduleImportParseResult {
  rows: ParsedScheduleRow[]
  errors: string[]
}

const text = (value: unknown) => String(value ?? '').trim()
const upper = (value: unknown) => text(value).toUpperCase()

function numberValue(value: unknown, fallback: number, label: string, row: number, errors: string[]): number {
  if (text(value) === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    errors.push(`Row ${row}: ${label} must be a non-negative number.`)
    return fallback
  }
  return parsed
}

function booleanValue(value: unknown): boolean {
  return ['TRUE', 'YES', 'Y', '1'].includes(upper(value))
}

function dateValue(value: unknown, label: string, row: number, errors: string[]): Date | null {
  if (value == null || text(value) === '') return null
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) {
    errors.push(`Row ${row}: ${label} must use YYYY-MM-DD format.`)
    return null
  }
  return date
}

function splitList(value: unknown): string[] {
  return text(value).split(/[;,]/).map((item) => item.trim()).filter(Boolean)
}

export function parseScheduleRows(records: ScheduleImportRecord[]): ScheduleImportParseResult {
  const errors: string[] = []
  const rows: ParsedScheduleRow[] = []
  const rowIds = new Set<string>()

  records.forEach((record, index) => {
    const sourceRow = index + 2
    const rowId = text(record['Row ID'])
    const phase = text(record.Phase)
    const milestone = text(record.Milestone)
    const activity = text(record.Activity)
    if (!rowId && !phase && !milestone && !activity) return
    if (!rowId) errors.push(`Row ${sourceRow}: Row ID is required.`)
    else if (rowIds.has(rowId)) errors.push(`Row ${sourceRow}: Row ID "${rowId}" is duplicated.`)
    else rowIds.add(rowId)
    if (phase.length < 2) errors.push(`Row ${sourceRow}: Phase is required (minimum 2 characters).`)
    if (milestone.length < 2) errors.push(`Row ${sourceRow}: Milestone is required (minimum 2 characters).`)
    if (activity.length < 3) errors.push(`Row ${sourceRow}: Activity is required (minimum 3 characters).`)

    const owner = upper(record['Owner Party']) || '360GROUND'
    if (!['360GROUND', 'CLIENT', 'SHARED'].includes(owner)) errors.push(`Row ${sourceRow}: Owner Party must be 360GROUND, CLIENT, or SHARED.`)
    const priority = upper(record.Priority)
    if (priority && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) errors.push(`Row ${sourceRow}: Priority must be LOW, MEDIUM, HIGH, or CRITICAL.`)
    const risk = upper(record.Risk)
    if (risk && !['LOW', 'MEDIUM', 'HIGH'].includes(risk)) errors.push(`Row ${sourceRow}: Risk must be LOW, MEDIUM, or HIGH.`)
    const startDate = dateValue(record['Start Date'], 'Start Date', sourceRow, errors)
    const endDate = dateValue(record['End Date'], 'End Date', sourceRow, errors)
    if (startDate && endDate && endDate < startDate) errors.push(`Row ${sourceRow}: End Date cannot be before Start Date.`)

    const predecessors = splitList(record['Predecessor Row IDs'])
    const types = splitList(record['Dependency Types']).map((v) => v.toUpperCase())
    const lags = splitList(record['Lag Days'])
    if (types.length > 1 && types.length !== predecessors.length) errors.push(`Row ${sourceRow}: Dependency Types count must match Predecessor Row IDs.`)
    if (lags.length > 1 && lags.length !== predecessors.length) errors.push(`Row ${sourceRow}: Lag Days count must match Predecessor Row IDs.`)
    const dependencies = predecessors.map((predecessorRowId, depIndex) => {
      const type = (types[depIndex] ?? types[0] ?? 'FS')
      const lag = Number(lags[depIndex] ?? lags[0] ?? 0)
      if (!['FS', 'SS', 'FF', 'SF'].includes(type)) errors.push(`Row ${sourceRow}: dependency type "${type}" is invalid.`)
      if (!Number.isInteger(lag) || lag < -365 || lag > 365) errors.push(`Row ${sourceRow}: dependency lag must be an integer from -365 to 365.`)
      return { predecessorRowId, type: (['FS', 'SS', 'FF', 'SF'].includes(type) ? type : 'FS') as 'FS' | 'SS' | 'FF' | 'SF', lagDays: Number.isInteger(lag) ? lag : 0 }
    })

    const blockerDetails = text(record['Blocker Details']) || null
    const description = text(record.Description) || null
    rows.push({
      sourceRow,
      rowId,
      phase,
      phaseWeight: numberValue(record['Phase Weight'], 0, 'Phase Weight', sourceRow, errors),
      milestone,
      milestoneWeight: numberValue(record['Milestone Weight'], 0, 'Milestone Weight', sourceRow, errors),
      keyMilestone: booleanValue(record['Key Milestone']),
      activity,
      parentRowId: text(record['Parent Row ID']) || null,
      description,
      ownerParty: (['360GROUND', 'CLIENT', 'SHARED'].includes(owner) ? owner : '360GROUND') as ParsedScheduleRow['ownerParty'],
      assigneeEmail: text(record['Assignee Email']).toLowerCase() || null,
      startDate,
      endDate,
      activityWeight: numberValue(record['Activity Weight'], 1, 'Activity Weight', sourceRow, errors),
      priority: (priority || null) as ParsedScheduleRow['priority'],
      risk: (risk || null) as ParsedScheduleRow['risk'],
      isBlocked: booleanValue(record['Is Blocked']) || Boolean(blockerDetails),
      blockerDetails,
      dependencies,
    })
  })

  const knownIds = new Set(rows.map((row) => row.rowId))
  const rowById = new Map(rows.map((row) => [row.rowId, row]))
  const dependencyPairs = new Set<string>()
  for (const row of rows) {
    if (row.parentRowId && !knownIds.has(row.parentRowId)) errors.push(`Row ${row.sourceRow}: Parent Row ID "${row.parentRowId}" was not found.`)
    if (row.parentRowId === row.rowId) errors.push(`Row ${row.sourceRow}: an activity cannot be its own parent.`)
    if (row.parentRowId && rowById.get(row.parentRowId)?.parentRowId) errors.push(`Row ${row.sourceRow}: only one level of subtasks is supported.`)
    if (row.parentRowId) {
      const parent = rowById.get(row.parentRowId)
      if (parent && (parent.phase !== row.phase || parent.milestone !== row.milestone)) errors.push(`Row ${row.sourceRow}: parent activity must use the same Phase and Milestone.`)
    }
    for (const dep of row.dependencies) {
      if (!knownIds.has(dep.predecessorRowId)) errors.push(`Row ${row.sourceRow}: predecessor "${dep.predecessorRowId}" was not found.`)
      if (dep.predecessorRowId === row.rowId) errors.push(`Row ${row.sourceRow}: an activity cannot depend on itself.`)
      const pair = `${dep.predecessorRowId}\u0000${row.rowId}`
      if (dependencyPairs.has(pair)) errors.push(`Row ${row.sourceRow}: predecessor "${dep.predecessorRowId}" is listed more than once.`)
      dependencyPairs.add(pair)
    }
  }
  if (rows.length === 0) errors.push('The schedule file contains no activity rows.')
  return { rows, errors }
}
