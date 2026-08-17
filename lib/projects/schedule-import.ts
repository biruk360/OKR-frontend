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
  'Deliverable',
  'Estimated Hours',
  'Assumptions / Source Notes',
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
  deliverableName: string | null
  estimatedHours: number | null
  assumptionsOrSourceNotes: string | null
  dependencies: { predecessorRowId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lagDays: number }[]
}

export interface ScheduleImportParseResult {
  rows: ParsedScheduleRow[]
  errors: string[]
  issues: ScheduleImportParseIssue[]
}

export interface ScheduleImportParseIssue {
  sourceRow: number | null
  field: string | null
  originalValue?: string | number | boolean | null
  code: string
  message: string
  suggestedCorrection: string
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

function optionalNumberValue(value: unknown, label: string, row: number, errors: string[]): number | null {
  if (text(value) === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    errors.push(`Row ${row}: ${label} must be a non-negative number.`)
    return null
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

function deliverableName(value: unknown, milestone: string): string | null {
  const raw = text(value)
  if (!raw || ['NO', 'FALSE', 'N', '0'].includes(raw.toUpperCase())) return null
  if (['YES', 'TRUE', 'Y', '1'].includes(raw.toUpperCase())) return milestone || null
  return raw
}

function issueField(message: string): string | null {
  if (/Row ID|duplicated/i.test(message)) return 'Row ID'
  if (/Phase Weight/i.test(message)) return 'Phase Weight'
  if (/Phase is required/i.test(message)) return 'Phase'
  if (/Milestone Weight/i.test(message)) return 'Milestone Weight'
  if (/Milestone is required/i.test(message)) return 'Milestone'
  if (/Activity Weight/i.test(message)) return 'Activity Weight'
  if (/Activity is required/i.test(message)) return 'Activity'
  if (/Owner Party/i.test(message)) return 'Owner Party'
  if (/Priority/i.test(message)) return 'Priority'
  if (/Risk/i.test(message)) return 'Risk'
  if (/End Date/i.test(message)) return 'End Date'
  if (/Start Date/i.test(message)) return 'Start Date'
  if (/Parent Row ID|own parent|one level of subtasks|parent activity/i.test(message)) return 'Parent Row ID'
  if (/Dependency Types|dependency type/i.test(message)) return 'Dependency Types'
  if (/Lag Days|dependency lag/i.test(message)) return 'Lag Days'
  if (/predecessor|depend on itself/i.test(message)) return 'Predecessor Row IDs'
  if (/Estimated Hours/i.test(message)) return 'Estimated Hours'
  if (/no activity rows/i.test(message)) return 'Activity'
  return null
}

function issueCode(message: string): string {
  if (/duplicated/i.test(message)) return 'DUPLICATE_ROW_ID'
  if (/was not found/i.test(message) && /Parent/i.test(message)) return 'MISSING_PARENT'
  if (/was not found/i.test(message) && /predecessor/i.test(message)) return 'MISSING_PREDECESSOR'
  if (/required/i.test(message)) return 'REQUIRED_VALUE_MISSING'
  if (/Date|date/i.test(message)) return 'INVALID_DATE'
  if (/Owner Party/i.test(message)) return 'INVALID_OWNER'
  if (/Weight|Hours|number/i.test(message)) return 'INVALID_NUMBER'
  if (/dependency/i.test(message) || /predecessor/i.test(message)) return 'INVALID_DEPENDENCY'
  if (/parent/i.test(message)) return 'INVALID_PARENT'
  if (/no activity rows/i.test(message)) return 'NO_ACTIVITY_ROWS'
  return 'INVALID_VALUE'
}

function correctionFor(field: string | null, message: string): string {
  if (/duplicated/i.test(message)) return 'Use a unique Row ID for every non-empty activity row.'
  if (/was not found/i.test(message)) return 'Reference a Row ID that exists in this schedule.'
  if (/own parent|depend on itself/i.test(message)) return 'Reference a different activity row.'
  if (/End Date cannot be before/i.test(message)) return 'Set End Date on or after Start Date.'
  if (field === 'Start Date' || field === 'End Date') return 'Enter a real date in YYYY-MM-DD format.'
  if (field === 'Owner Party') return 'Choose 360GROUND, CLIENT, or SHARED.'
  if (field === 'Priority') return 'Choose LOW, MEDIUM, HIGH, or CRITICAL.'
  if (field === 'Risk') return 'Choose LOW, MEDIUM, or HIGH.'
  if (field === 'Dependency Types') return 'Use FS, SS, FF, or SF once per predecessor.'
  if (field === 'Lag Days') return 'Enter an integer from -365 to 365 once per predecessor.'
  if (/no activity rows/i.test(message)) return 'Add at least one non-empty activity row.'
  if (/required/i.test(message)) return `Enter a valid ${field ?? 'value'}.`
  if (/non-negative number/i.test(message)) return `Enter ${field ?? 'the value'} as a number greater than or equal to zero.`
  return 'Correct this source value and validate the file again.'
}

function originalIssueValue(
  records: ScheduleImportRecord[],
  sourceRow: number | null,
  sourceRowOffset: number,
  field: string | null,
): string | number | boolean | null | undefined {
  if (sourceRow === null || field === null) return undefined
  const value = records[sourceRow - sourceRowOffset]?.[field]
  if (value === undefined) return undefined
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

function structuredIssues(
  errors: string[],
  records: ScheduleImportRecord[],
  sourceRowOffset: number,
): ScheduleImportParseIssue[] {
  return errors.map((error) => {
    const match = /^Row (\d+):\s*(.*)$/.exec(error)
    const sourceRow = match ? Number(match[1]) : null
    const message = match?.[2] ?? error
    const field = issueField(message)
    return {
      sourceRow,
      field,
      originalValue: originalIssueValue(records, sourceRow, sourceRowOffset, field),
      code: issueCode(message),
      message,
      suggestedCorrection: correctionFor(field, message),
    }
  })
}

export function parseScheduleRows(
  records: ScheduleImportRecord[],
  options: { sourceRowOffset?: number } = {},
): ScheduleImportParseResult {
  const errors: string[] = []
  const rows: ParsedScheduleRow[] = []
  const rowIds = new Set<string>()
  const sourceRowOffset = options.sourceRowOffset ?? 2

  records.forEach((record, index) => {
    const sourceRow = index + sourceRowOffset
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
    const parsedDeliverableName = deliverableName(record.Deliverable, milestone)
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
      deliverableName: parsedDeliverableName,
      estimatedHours: optionalNumberValue(record['Estimated Hours'], 'Estimated Hours', sourceRow, errors),
      assumptionsOrSourceNotes: text(record['Assumptions / Source Notes']) || null,
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
  return { rows, errors, issues: structuredIssues(errors, records, sourceRowOffset) }
}
