import { createHash } from 'crypto'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import {
  createEmptyProjectCreationScheduleJson,
  createEmptyProjectCreationValidationJson,
  projectCreationScheduleJsonSchema,
  type ProjectCreationScheduleJson,
  type ProjectCreationValidationJson,
} from '@/lib/projects/creation-normalize'
import {
  SCHEDULE_IMPORT_HEADERS,
  parseScheduleRows,
  type ParsedScheduleRow,
  type ScheduleImportRecord,
} from '@/lib/projects/schedule-import'
import {
  hasBlockingProjectCreationIssues,
  resolveActiveProjectCreationAssigneeEmails,
  validateProjectCreationImport,
} from '@/lib/projects/creation-validate'

export type ProjectCreationImportHeader = (typeof SCHEDULE_IMPORT_HEADERS)[number]
export type ProjectCreationImportMappingMatch = 'EXACT' | 'ALIAS' | 'AI' | 'UNMAPPED'

export const PROJECT_CREATION_IMPORT_REQUIRED_HEADERS = [
  'Row ID',
  'Phase',
  'Milestone',
  'Activity',
] as const satisfies readonly ProjectCreationImportHeader[]

export const PROJECT_CREATION_IMPORT_MAX_FILE_BYTES_DEFAULT = 10 * 1024 * 1024
export const PROJECT_CREATION_IMPORT_MAX_ROWS_DEFAULT = 2_000

const SUPPORTED_EXTENSIONS = ['csv', 'xls', 'xlsx'] as const
const SUPPORTED_IMPORT_EXTENSIONS = ['csv', 'xls', 'xlsx', 'docx'] as const
const SUPPORTED_MIME_TYPES: Record<(typeof SUPPORTED_EXTENSIONS)[number], ReadonlySet<string>> = {
  csv: new Set(['text/csv', 'text/plain', 'application/csv', 'application/octet-stream']),
  xls: new Set(['application/vnd.ms-excel', 'application/octet-stream']),
  xlsx: new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ]),
}
const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
])

const HEADER_ALIASES: Partial<Record<ProjectCreationImportHeader, readonly string[]>> = {
  'Row ID': ['id', 'rowid', 'taskid', 'activityid', 'workitemid'],
  Phase: ['phasename', 'projectphase', 'stage', 'workstream'],
  'Phase Weight': ['phaseweightpercent', 'phasepercent', 'stageweight'],
  Milestone: ['milestonename', 'projectmilestone', 'checkpoint', 'gate'],
  'Milestone Weight': ['milestoneweightpercent', 'milestonepercent'],
  'Key Milestone': ['iskeymilestone', 'keymilestoneflag', 'keymilestoneindicator'],
  Activity: ['activityname', 'task', 'taskname', 'workitem'],
  'Parent Row ID': ['parentid', 'parentrow', 'parenttaskid', 'parentactivityid'],
  Description: ['activitydescription', 'taskdescription', 'details', 'notes'],
  'Owner Party': ['owner', 'responsibility', 'responsibleparty', 'ownership'],
  'Assignee Email': ['assignee', 'assignedto', 'assigneeemailaddress', 'resourceemail'],
  'Start Date': ['start', 'begin', 'begindate', 'plannedstart', 'plannedstartdate', 'activitystart'],
  'End Date': ['end', 'finish', 'finishdate', 'plannedend', 'plannedenddate'],
  'Activity Weight': ['weight', 'taskweight', 'activityweightpercent'],
  Priority: ['prioritylevel'],
  Risk: ['risklevel'],
  'Is Blocked': ['blocked', 'blockedflag'],
  'Blocker Details': ['blocker', 'blockerreason', 'blockerdetail'],
  'Predecessor Row IDs': ['predecessors', 'predecessorids', 'dependson', 'dependencies'],
  'Dependency Types': ['dependencytype', 'relationshiptype', 'linktype'],
  'Lag Days': ['lag', 'dependencylag', 'dependencylagdays'],
  Deliverable: ['deliverablename', 'deliverableindicator', 'output'],
  'Estimated Hours': ['estimatehours', 'efforthours', 'estimatedeffort', 'hours'],
  'Assumptions / Source Notes': ['assumptions', 'sourcenotes', 'assumptionnotes', 'sourcecomments'],
}

export interface ProjectCreationImportSourceColumn {
  key: string
  header: string
  columnIndex: number
  sampleValues: string[]
}

export interface ProjectCreationImportMappingRow {
  target: ProjectCreationImportHeader
  sourceColumnKey: string | null
  match: ProjectCreationImportMappingMatch
  required: boolean
  aiProposal?: {
    originalSourceColumnKey: string | null
    proposedSourceColumnKey: string
    reason: string
    confidence: number
  }
}

export interface ProjectCreationSpreadsheetInspection {
  sheetNames: string[]
  selectedSheetName: string | null
  requiresSheetSelection: boolean
  headerRowNumber: number | null
  sourceColumns: ProjectCreationImportSourceColumn[]
  mapping: ProjectCreationImportMappingRow[]
  requiresMapping: boolean
  dataRowCount: number
}

interface InternalSpreadsheetInspection extends ProjectCreationSpreadsheetInspection {
  dataRows: unknown[][]
}

export interface ProjectCreationImportMappingSelection {
  target: ProjectCreationImportHeader
  sourceColumnKey: string | null
}

export interface ProjectCreationImportSummary {
  phases: number
  milestones: number
  activities: number
  dependencies: number
  deliverables: number
}

export interface NormalizedProjectCreationImport {
  scheduleJson: ProjectCreationScheduleJson
  validationJson: ProjectCreationValidationJson
  summary: ProjectCreationImportSummary
}

export interface ValidatedProjectCreationImport extends NormalizedProjectCreationImport {
  hasBlockingErrors: boolean
}

export class ProjectCreationImportError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'INVALID_FILE'
      | 'FILE_TOO_LARGE'
      | 'UNREADABLE_FILE'
      | 'INVALID_SHEET'
      | 'INVALID_MAPPING'
      | 'ROW_LIMIT_EXCEEDED'
      | 'PARSE_FAILED',
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ProjectCreationImportError'
  }
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function displayValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value ?? '').trim()
}

function isClearlyEmptyRow(row: unknown[]): boolean {
  return row.every((value) => displayValue(value) === '')
}

function exactHeader(value: unknown): ProjectCreationImportHeader | null {
  const normalized = normalizeHeader(value)
  return SCHEDULE_IMPORT_HEADERS.find((header) => normalizeHeader(header) === normalized) ?? null
}

function aliasHeader(value: unknown): ProjectCreationImportHeader | null {
  const normalized = normalizeHeader(value)
  return SCHEDULE_IMPORT_HEADERS.find((header) => HEADER_ALIASES[header]?.includes(normalized)) ?? null
}

function detectHeaderRow(rows: unknown[][]): number {
  const candidates = rows.slice(0, 50).map((row, index) => {
    const values = row.filter((value) => displayValue(value) !== '')
    const exact = values.filter((value) => exactHeader(value)).length
    const aliases = values.filter((value) => !exactHeader(value) && aliasHeader(value)).length
    return { index, exact, aliases, populated: values.length }
  }).filter((candidate) => candidate.populated > 0)
  if (candidates.length === 0) {
    throw new ProjectCreationImportError('The selected sheet is empty.', 'UNREADABLE_FILE')
  }
  const recognized = [...candidates].sort((a, b) =>
    (b.exact + b.aliases) - (a.exact + a.aliases) || b.populated - a.populated || a.index - b.index,
  )[0]
  if (recognized.exact + recognized.aliases >= 2) return recognized.index
  return [...candidates].sort((a, b) => b.populated - a.populated || a.index - b.index)[0].index
}

function createMapping(
  sourceColumns: ProjectCreationImportSourceColumn[],
): { mapping: ProjectCreationImportMappingRow[]; requiresMapping: boolean } {
  const claimedTargets = new Set<ProjectCreationImportHeader>()
  const duplicateTargets = new Set<ProjectCreationImportHeader>()
  const byTarget = new Map<ProjectCreationImportHeader, { sourceColumnKey: string; match: ProjectCreationImportMappingMatch }>()
  let hasNonExactSource = false

  for (const source of sourceColumns) {
    const exact = exactHeader(source.header)
    const alias = exact ? null : aliasHeader(source.header)
    const target = exact ?? alias
    if (!exact) hasNonExactSource = true
    if (!target) continue
    if (claimedTargets.has(target)) {
      duplicateTargets.add(target)
      continue
    }
    claimedTargets.add(target)
    byTarget.set(target, {
      sourceColumnKey: source.key,
      match: exact ? 'EXACT' : 'ALIAS',
    })
  }

  const mapping = SCHEDULE_IMPORT_HEADERS.map((target) => {
    const proposed = byTarget.get(target)
    return {
      target,
      sourceColumnKey: duplicateTargets.has(target) ? null : proposed?.sourceColumnKey ?? null,
      match: duplicateTargets.has(target) ? 'UNMAPPED' : proposed?.match ?? 'UNMAPPED',
      required: PROJECT_CREATION_IMPORT_REQUIRED_HEADERS.includes(
        target as (typeof PROJECT_CREATION_IMPORT_REQUIRED_HEADERS)[number],
      ),
    }
  })
  const missingRequired = mapping.some((row) => row.required && !row.sourceColumnKey)
  return {
    mapping,
    requiresMapping: hasNonExactSource || duplicateTargets.size > 0 || missingRequired,
  }
}

export function resolveProjectCreationImportLimits(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { maxFileBytes: number; maxRows: number } {
  const fileBytes = Number(env.PROJECT_CREATION_IMPORT_MAX_FILE_BYTES)
  const rows = Number(env.PROJECT_CREATION_IMPORT_MAX_ROWS)
  return {
    maxFileBytes: Number.isInteger(fileBytes) && fileBytes >= 1_048_576 && fileBytes <= 104_857_600
      ? fileBytes
      : PROJECT_CREATION_IMPORT_MAX_FILE_BYTES_DEFAULT,
    maxRows: Number.isInteger(rows) && rows >= 1 && rows <= 10_000
      ? rows
      : PROJECT_CREATION_IMPORT_MAX_ROWS_DEFAULT,
  }
}

export function validateProjectCreationSpreadsheetFile(input: {
  name: string
  type: string
  size: number
  maxFileBytes?: number
}): { extension: (typeof SUPPORTED_EXTENSIONS)[number]; mimeType: string; safeFileName: string } {
  const safeFileName = input.name.split(/[\\/]/).pop()?.trim() ?? ''
  const extension = safeFileName.split('.').pop()?.toLowerCase()
  const maxFileBytes = input.maxFileBytes ?? PROJECT_CREATION_IMPORT_MAX_FILE_BYTES_DEFAULT
  if (!SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) {
    throw new ProjectCreationImportError('Choose a CSV, XLS, or XLSX schedule file.', 'INVALID_FILE')
  }
  if (!Number.isInteger(input.size) || input.size < 1) {
    throw new ProjectCreationImportError('The selected schedule file is empty.', 'INVALID_FILE')
  }
  if (input.size > maxFileBytes) {
    throw new ProjectCreationImportError(
      `Schedule files must be ${Math.floor(maxFileBytes / 1_048_576)} MB or smaller.`,
      'FILE_TOO_LARGE',
    )
  }
  const mimeType = input.type.trim().toLowerCase() || (
    extension === 'csv'
      ? 'text/csv'
      : extension === 'xls'
      ? 'application/vnd.ms-excel'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  if (!SUPPORTED_MIME_TYPES[extension as (typeof SUPPORTED_EXTENSIONS)[number]].has(mimeType)) {
    throw new ProjectCreationImportError('The schedule file type does not match CSV, XLS, or XLSX.', 'INVALID_FILE')
  }
  return {
    extension: extension as (typeof SUPPORTED_EXTENSIONS)[number],
    mimeType,
    safeFileName,
  }
}

export function validateProjectCreationImportFile(input: {
  name: string
  type: string
  size: number
  maxFileBytes?: number
}): {
  extension: (typeof SUPPORTED_IMPORT_EXTENSIONS)[number]
  mimeType: string
  safeFileName: string
  kind: 'SPREADSHEET' | 'DOCX'
} {
  const safeFileName = input.name.split(/[\\/]/).pop()?.trim() ?? ''
  const extension = safeFileName.split('.').pop()?.toLowerCase()
  const maxFileBytes = input.maxFileBytes ?? PROJECT_CREATION_IMPORT_MAX_FILE_BYTES_DEFAULT
  if (!SUPPORTED_IMPORT_EXTENSIONS.includes(extension as (typeof SUPPORTED_IMPORT_EXTENSIONS)[number])) {
    throw new ProjectCreationImportError('Choose a CSV, XLS, XLSX, or DOCX project file.', 'INVALID_FILE')
  }
  if (!Number.isInteger(input.size) || input.size < 1) {
    throw new ProjectCreationImportError('The selected project file is empty.', 'INVALID_FILE')
  }
  if (input.size > maxFileBytes) {
    throw new ProjectCreationImportError(
      `Project files must be ${Math.floor(maxFileBytes / 1_048_576)} MB or smaller.`,
      'FILE_TOO_LARGE',
    )
  }
  if (extension !== 'docx') {
    return {
      ...validateProjectCreationSpreadsheetFile(input),
      kind: 'SPREADSHEET',
    }
  }
  const mimeType = input.type.trim().toLowerCase()
    || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (!DOCX_MIME_TYPES.has(mimeType)) {
    throw new ProjectCreationImportError('The project file type does not match DOCX.', 'INVALID_FILE')
  }
  return { extension: 'docx', mimeType, safeFileName, kind: 'DOCX' }
}

export function hashProjectCreationImport(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function inspectProjectCreationSpreadsheet(
  bytes: Uint8Array,
  options: { sheetName?: string | null } = {},
): InternalSpreadsheetInspection {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(bytes, { type: 'array', cellDates: true })
  } catch {
    throw new ProjectCreationImportError(
      'The schedule file could not be read. Download a fresh template and try again.',
      'UNREADABLE_FILE',
    )
  }
  const sheetNames = workbook.SheetNames.filter((name) => Boolean(workbook.Sheets[name]))
  if (sheetNames.length === 0) {
    throw new ProjectCreationImportError('The workbook does not contain a readable sheet.', 'UNREADABLE_FILE')
  }
  const selectedSheetName = sheetNames.includes('Schedule')
    ? 'Schedule'
    : options.sheetName
    ? options.sheetName
    : sheetNames.length === 1
    ? sheetNames[0]
    : null
  if (options.sheetName && !sheetNames.includes(options.sheetName)) {
    throw new ProjectCreationImportError('Choose one of the workbook sheets shown.', 'INVALID_SHEET')
  }
  if (!selectedSheetName) {
    return {
      sheetNames,
      selectedSheetName: null,
      requiresSheetSelection: true,
      headerRowNumber: null,
      sourceColumns: [],
      mapping: [],
      requiresMapping: false,
      dataRowCount: 0,
      dataRows: [],
    }
  }

  const sheet = workbook.Sheets[selectedSheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
  const headerRowIndex = detectHeaderRow(rows)
  const headerRow = rows[headerRowIndex] ?? []
  // Keep empty rows in the internal sequence so parser source-row numbers stay
  // aligned with the workbook. They are excluded from counts and ignored by
  // parseScheduleRows.
  const dataRows = rows.slice(headerRowIndex + 1)
  const sourceColumns = headerRow.flatMap((value, columnIndex) => {
    const header = displayValue(value)
    if (!header) return []
    const samples = dataRows
      .map((row) => displayValue(row[columnIndex]))
      .filter(Boolean)
      .slice(0, 3)
    return [{ key: `column-${columnIndex}`, header, columnIndex, sampleValues: samples }]
  })
  if (sourceColumns.length === 0) {
    throw new ProjectCreationImportError('A header row could not be found in the selected sheet.', 'UNREADABLE_FILE')
  }
  const proposal = createMapping(sourceColumns)
  return {
    sheetNames,
    selectedSheetName,
    requiresSheetSelection: false,
    headerRowNumber: headerRowIndex + 1,
    sourceColumns,
    mapping: proposal.mapping,
    requiresMapping: proposal.requiresMapping,
    dataRowCount: dataRows.filter((row) => !isClearlyEmptyRow(row)).length,
    dataRows,
  }
}

export function toPublicProjectCreationSpreadsheetInspection(
  inspection: InternalSpreadsheetInspection,
): ProjectCreationSpreadsheetInspection {
  const { dataRows: _dataRows, ...publicInspection } = inspection
  return publicInspection
}

function recordsFromMapping(
  inspection: InternalSpreadsheetInspection,
  mapping: ProjectCreationImportMappingSelection[],
): ScheduleImportRecord[] {
  const selectedTargets = new Set<ProjectCreationImportHeader>()
  const selectedSources = new Set<string>()
  const sourceByKey = new Map(inspection.sourceColumns.map((column) => [column.key, column]))
  const indexByTarget = new Map<ProjectCreationImportHeader, number>()

  for (const item of mapping) {
    if (!SCHEDULE_IMPORT_HEADERS.includes(item.target)) {
      throw new ProjectCreationImportError('The column mapping contains an unsupported target.', 'INVALID_MAPPING')
    }
    if (selectedTargets.has(item.target)) {
      throw new ProjectCreationImportError(`Map ${item.target} only once.`, 'INVALID_MAPPING')
    }
    selectedTargets.add(item.target)
    if (!item.sourceColumnKey) continue
    const source = sourceByKey.get(item.sourceColumnKey)
    if (!source) {
      throw new ProjectCreationImportError('The column mapping references a missing source column.', 'INVALID_MAPPING')
    }
    if (selectedSources.has(source.key)) {
      throw new ProjectCreationImportError(`Source column "${source.header}" cannot map to more than one field.`, 'INVALID_MAPPING')
    }
    selectedSources.add(source.key)
    indexByTarget.set(item.target, source.columnIndex)
  }
  for (const required of PROJECT_CREATION_IMPORT_REQUIRED_HEADERS) {
    if (!indexByTarget.has(required)) {
      throw new ProjectCreationImportError(`${required} must be mapped before continuing.`, 'INVALID_MAPPING')
    }
  }
  return inspection.dataRows.map((row) => Object.fromEntries(
    SCHEDULE_IMPORT_HEADERS.map((header) => [header, indexByTarget.has(header) ? row[indexByTarget.get(header)!] : '']),
  ))
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

function earliest(values: Array<Date | null>): string | null {
  const dates = values.filter((value): value is Date => value !== null)
  return dates.length ? isoDate(new Date(Math.min(...dates.map((date) => date.getTime())))) : null
}

function latest(values: Array<Date | null>): string | null {
  const dates = values.filter((value): value is Date => value !== null)
  return dates.length ? isoDate(new Date(Math.max(...dates.map((date) => date.getTime())))) : null
}

function normalizeParsedRows(rows: ParsedScheduleRow[], sheetName: string): NormalizedProjectCreationImport {
  const phaseIdByName = new Map<string, string>()
  const milestoneIdByKey = new Map<string, string>()
  const activityIdByRowId = new Map<string, string>()
  const phaseRows = new Map<string, ParsedScheduleRow[]>()
  const milestoneRows = new Map<string, ParsedScheduleRow[]>()

  for (const row of rows) {
    const phaseRowsForName = phaseRows.get(row.phase) ?? []
    phaseRowsForName.push(row)
    phaseRows.set(row.phase, phaseRowsForName)
    const milestoneKey = `${row.phase}\u0000${row.milestone}`
    const milestoneRowsForKey = milestoneRows.get(milestoneKey) ?? []
    milestoneRowsForKey.push(row)
    milestoneRows.set(milestoneKey, milestoneRowsForKey)
  }

  const phases = [...phaseRows.entries()].map(([name, groupedRows], position) => {
    const id = `phase-${position + 1}`
    phaseIdByName.set(name, id)
    return {
      id,
      name,
      position,
      weight: groupedRows[0].phaseWeight,
      plannedStart: earliest(groupedRows.map((row) => row.startDate)),
      plannedEnd: latest(groupedRows.map((row) => row.endDate)),
    }
  })

  const milestonePositionByPhase = new Map<string, number>()
  const milestones = [...milestoneRows.entries()].map(([key, groupedRows], index) => {
    const first = groupedRows[0]
    const position = milestonePositionByPhase.get(first.phase) ?? 0
    milestonePositionByPhase.set(first.phase, position + 1)
    const id = `milestone-${index + 1}`
    milestoneIdByKey.set(key, id)
    return {
      id,
      phaseId: phaseIdByName.get(first.phase)!,
      name: first.milestone,
      position,
      weight: first.milestoneWeight,
      isKeyMilestone: groupedRows.some((row) => row.keyMilestone || Boolean(row.deliverableName)),
      dueDate: latest(groupedRows.map((row) => row.endDate)),
    }
  })

  const activityPositionByMilestone = new Map<string, number>()
  const activities: ProjectCreationScheduleJson['activities'] = rows.map((row, index) => {
    const milestoneKey = `${row.phase}\u0000${row.milestone}`
    const milestoneId = milestoneIdByKey.get(milestoneKey)!
    const position = activityPositionByMilestone.get(milestoneId) ?? 0
    activityPositionByMilestone.set(milestoneId, position + 1)
    const id = `activity-${index + 1}`
    activityIdByRowId.set(row.rowId, id)
    return {
      id,
      sourceRowId: row.rowId,
      milestoneId,
      parentActivityId: null,
      position,
      title: row.activity,
      description: row.description,
      ownerParty: row.ownerParty,
      assigneeId: null,
      assigneeEmail: row.assigneeEmail,
      suggestedRole: null,
      startDate: isoDate(row.startDate),
      endDate: isoDate(row.endDate),
      weight: row.activityWeight,
      estimatedHours: row.estimatedHours,
      priority: row.priority,
      risk: row.risk,
      isBlocked: row.isBlocked,
      blockerDetails: row.blockerDetails,
      isApproval: false,
    }
  })
  rows.forEach((row, index) => {
    if (row.parentRowId) activities[index].parentActivityId = activityIdByRowId.get(row.parentRowId) ?? null
  })

  const dependencies = rows.flatMap((row) => row.dependencies.map((dependency, index) => ({
    id: `dependency-${activityIdByRowId.get(row.rowId)}-${index + 1}`,
    predecessorActivityId: activityIdByRowId.get(dependency.predecessorRowId)!,
    successorActivityId: activityIdByRowId.get(row.rowId)!,
    type: dependency.type,
    lagDays: dependency.lagDays,
  })))

  const deliverables = [...milestoneRows.entries()].flatMap(([key, groupedRows], index) => {
    const named = groupedRows.find((row) => row.deliverableName)?.deliverableName
    if (!named && !groupedRows.some((row) => row.keyMilestone)) return []
    return [{
      id: `deliverable-${index + 1}`,
      milestoneId: milestoneIdByKey.get(key)!,
      name: named ?? groupedRows[0].milestone,
      producingActivityIds: groupedRows.map((row) => activityIdByRowId.get(row.rowId)!),
      dueDate: latest(groupedRows.map((row) => row.endDate)),
      ownerParty: groupedRows.find((row) => row.deliverableName)?.ownerParty ?? groupedRows[0].ownerParty,
      approvalActivityId: null,
      approvalCriteria: null,
    }]
  })

  const sources = rows.map((row, index) => ({
    id: `source-row-${index + 1}`,
    type: 'SPREADSHEET_ROW' as const,
    reference: `${sheetName}!Row ${row.sourceRow}`,
    excerpt: row.assumptionsOrSourceNotes,
    targetPaths: [`activities.${index}`],
    basis: 'SOURCE_FACT' as const,
    confidence: 'HIGH' as const,
    lastEditor: 'USER' as const,
  }))

  const scheduleJson = projectCreationScheduleJsonSchema.parse({
    schemaVersion: 1,
    phases,
    milestones,
    activities,
    dependencies,
    deliverables,
    sources,
    changes: [],
  })
  return {
    scheduleJson,
    validationJson: createEmptyProjectCreationValidationJson(),
    summary: {
      phases: phases.length,
      milestones: milestones.length,
      activities: activities.length,
      dependencies: dependencies.length,
      deliverables: deliverables.length,
    },
  }
}

export function normalizeProjectCreationSpreadsheet(
  inspection: InternalSpreadsheetInspection,
  mapping: ProjectCreationImportMappingSelection[] = inspection.mapping.map(({ target, sourceColumnKey }) => ({
    target,
    sourceColumnKey,
  })),
  options: { maxRows?: number } = {},
): NormalizedProjectCreationImport {
  if (!inspection.selectedSheetName || inspection.headerRowNumber === null) {
    throw new ProjectCreationImportError('Choose a sheet before mapping the schedule.', 'INVALID_SHEET')
  }
  const records = recordsFromMapping(inspection, mapping)
  const parsed = parseScheduleRows(records, { sourceRowOffset: inspection.headerRowNumber + 1 })
  if (parsed.errors.length > 0) {
    throw new ProjectCreationImportError(
      'The spreadsheet contains values that could not be parsed.',
      'PARSE_FAILED',
      { errors: parsed.errors },
    )
  }
  const maxRows = options.maxRows ?? PROJECT_CREATION_IMPORT_MAX_ROWS_DEFAULT
  if (parsed.rows.length > maxRows) {
    throw new ProjectCreationImportError(
      `Schedule files may contain at most ${maxRows} activity rows.`,
      'ROW_LIMIT_EXCEEDED',
    )
  }
  try {
    return normalizeParsedRows(parsed.rows, inspection.selectedSheetName)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProjectCreationImportError(
        'The parsed spreadsheet does not fit the project draft structure.',
        'PARSE_FAILED',
        { errors: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
      )
    }
    throw error
  }
}

function parsedImportSummary(rows: ParsedScheduleRow[]): ProjectCreationImportSummary {
  return {
    phases: new Set(rows.map((row) => row.phase).filter(Boolean)).size,
    milestones: new Set(rows.map((row) => `${row.phase}\u0000${row.milestone}`).filter((key) => !key.endsWith('\u0000'))).size,
    activities: rows.length,
    dependencies: rows.reduce((total, row) => total + row.dependencies.length, 0),
    deliverables: new Set(rows.filter((row) => row.deliverableName || row.keyMilestone).map((row) => `${row.phase}\u0000${row.milestone}`)).size,
  }
}

export async function validateProjectCreationSpreadsheet(
  inspection: InternalSpreadsheetInspection,
  mapping: ProjectCreationImportMappingSelection[] = inspection.mapping.map(({ target, sourceColumnKey }) => ({
    target,
    sourceColumnKey,
  })),
  options: {
    maxRows?: number
    activeAssigneeEmails?: ReadonlySet<string>
  } = {},
): Promise<ValidatedProjectCreationImport> {
  if (!inspection.selectedSheetName || inspection.headerRowNumber === null) {
    throw new ProjectCreationImportError('Choose a sheet before validating the schedule.', 'INVALID_SHEET')
  }
  const records = recordsFromMapping(inspection, mapping)
  const sourceRowOffset = inspection.headerRowNumber + 1
  const parsed = parseScheduleRows(records, { sourceRowOffset })
  const maxRows = options.maxRows ?? PROJECT_CREATION_IMPORT_MAX_ROWS_DEFAULT
  if (parsed.rows.length > maxRows) {
    throw new ProjectCreationImportError(
      `Schedule files may contain at most ${maxRows} activity rows.`,
      'ROW_LIMIT_EXCEEDED',
    )
  }
  const assigneeEmails = parsed.rows.flatMap((row) => row.assigneeEmail ? [row.assigneeEmail] : [])
  const activeAssigneeEmails = options.activeAssigneeEmails
    ?? await resolveActiveProjectCreationAssigneeEmails(assigneeEmails)
  const validationJson = validateProjectCreationImport({
    rows: parsed.rows,
    records,
    parseIssues: parsed.issues,
    sourceRowOffset,
    activeAssigneeEmails,
  })
  const structurallyInvalid = parsed.issues.length > 0 || validationJson.issues.some((item) =>
    ['INVALID_ASSIGNEE_EMAIL', 'INVALID_WEIGHT'].includes(item.code),
  )
  if (structurallyInvalid) {
    return {
      scheduleJson: createEmptyProjectCreationScheduleJson(),
      validationJson,
      summary: parsedImportSummary(parsed.rows),
      hasBlockingErrors: true,
    }
  }
  try {
    const normalized = normalizeParsedRows(parsed.rows, inspection.selectedSheetName)
    return {
      ...normalized,
      validationJson,
      hasBlockingErrors: hasBlockingProjectCreationIssues(validationJson),
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProjectCreationImportError(
        'The parsed spreadsheet does not fit the project draft structure.',
        'PARSE_FAILED',
        { errors: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
      )
    }
    throw error
  }
}
