/**
 * Deterministic DOCX → draft schedule extraction (no AI).
 *
 * Rules (docs/PROJECT_CREATION_IMPORT_AI_REQUIREMENTS.md §8.5):
 * 1. Tables whose header row maps (with the shared CSV/XLSX exact/alias matcher,
 *    plus a few document-specific aliases such as Duration/Due/Responsible/Type)
 *    to an Activity/Task column are schedule tables; each data row is an activity.
 *    Tables with a Milestone column and no Activity column are milestone tables;
 *    tables with only a Deliverable column are deliverable tables.
 * 2. Rows whose Type column (or title prefix) says "Milestone" become milestones and
 *    close the group of preceding activities in the same phase; "Deliverable"/"Output"
 *    rows become deliverables.
 * 3. Phase = the row's Phase column, else the nearest heading naming a phase/stage/
 *    work package, else the nearest non-generic heading, else "Work plan".
 * 4. Bulleted/numbered paragraphs under a phase, activity, milestone or deliverable
 *    heading (or any paragraph labelled "Milestone:"/"Deliverable:"/"Task:") become
 *    items of that kind, with dates read from the text.
 * 5. Dates: ISO, d/m/y (day-first when ambiguous, flagged LOW), "1 Sep 2026",
 *    "Sep 1, 2026", ranges ("… to …"). Duration fills a missing start/end using
 *    working days and is recorded as an assumption.
 * 6. Every extracted row carries a DOCX source record (table/paragraph reference,
 *    excerpt, confidence) and the draft gets an unacknowledged review warning, so the
 *    user must review before Create Project is enabled. Nothing is committed here.
 *
 * Records are fed through the same `parseScheduleRows` → validation →
 * `normalizeProjectCreationParsedRows` pipeline as CSV/XLSX import.
 */
import {
  parseScheduleRows,
  type ParsedScheduleRow,
  type ScheduleImportRecord,
} from './schedule-import'
import {
  matchProjectCreationImportHeader,
  normalizeProjectCreationParsedRows,
  type ProjectCreationImportHeader,
  type ProjectCreationImportSummary,
} from './creation-import'
import {
  hasBlockingProjectCreationIssues,
  validateProjectCreationImport,
} from './creation-validate'
import { addBusinessDays, isWorkingDay } from './business-days'
import {
  projectCreationDocxExtractionToSchedule,
  type ProjectCreationDocxBlock,
  type ProjectCreationDocxExtraction,
} from './docx-extract'
import {
  createEmptyProjectCreationValidationJson,
  projectCreationScheduleJsonSchema,
  projectCreationValidationJsonSchema,
  type ProjectCreationScheduleJson,
  type ProjectCreationValidationJson,
} from './creation-normalize'

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
type DocxColumn = ProjectCreationImportHeader | 'Duration' | 'Type' | 'Date'
type ItemKind = 'ACTIVITY' | 'MILESTONE' | 'DELIVERABLE'
type Source = ProjectCreationScheduleJson['sources'][number]
type Warning = ProjectCreationValidationJson['warnings'][number]
type Assumption = ProjectCreationValidationJson['assumptions'][number]

export interface ProjectCreationDocxScheduleResult {
  scheduleJson: ProjectCreationScheduleJson
  validationJson: ProjectCreationValidationJson
  summary: ProjectCreationImportSummary
  hasBlockingErrors: boolean
}

const CONFIDENCE_RANK: Record<Confidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
const MAX_ITEMS = 2_000
const MAX_WARNINGS = 400

/** Document-only header aliases, applied after the shared CSV/XLSX matcher. */
const DOCX_HEADER_ALIASES: Record<string, DocxColumn> = {
  activities: 'Activity',
  tasks: 'Activity',
  keyactivities: 'Activity',
  mainactivities: 'Activity',
  activitytask: 'Activity',
  activitiestasks: 'Activity',
  taskactivity: 'Activity',
  responsible: 'Owner Party',
  responsibleperson: 'Owner Party',
  responsibleparties: 'Owner Party',
  lead: 'Owner Party',
  accountable: 'Owner Party',
  owners: 'Owner Party',
  party: 'Owner Party',
  bywhom: 'Owner Party',
  who: 'Owner Party',
  due: 'End Date',
  duedate: 'End Date',
  deadline: 'End Date',
  targetdate: 'End Date',
  completiondate: 'End Date',
  deliverydate: 'End Date',
  submissiondate: 'End Date',
  date: 'Date',
  dates: 'Date',
  timeline: 'Date',
  timing: 'Date',
  timeframe: 'Date',
  period: 'Date',
  duration: 'Duration',
  durationdays: 'Duration',
  days: 'Duration',
  workingdays: 'Duration',
  durationworkingdays: 'Duration',
  durationweeks: 'Duration',
  weeks: 'Duration',
  type: 'Type',
  itemtype: 'Type',
  rowtype: 'Type',
  kind: 'Type',
  no: 'Row ID',
  sn: 'Row ID',
  sno: 'Row ID',
  ref: 'Row ID',
  refno: 'Row ID',
  wbs: 'Row ID',
  wbsid: 'Row ID',
  wbscode: 'Row ID',
  milestones: 'Milestone',
  deliverables: 'Deliverable',
  outputs: 'Deliverable',
  phases: 'Phase',
  stages: 'Phase',
  workpackage: 'Phase',
  component: 'Phase',
  predecessor: 'Predecessor Row IDs',
  dependency: 'Predecessor Row IDs',
}

const PHASE_HEADING = /\b(phase|stage|work ?package|work ?stream|component|sprint|iteration|release)\b/i
const GENERIC_HEADING = /^(?:[\d.]+\s*)?(?:(?:project|implementation|detailed|proposed)\s+)?(?:activities|activity|tasks?|work ?plan|schedule|timeline|milestones?|deliverables?|overview|dates?|time ?frame|plan|methodology|approach|outputs?)(?:\s+(?:and|&)\s+[a-z]+)?\s*$/i
const LABEL_PREFIX = /^(milestone|deliverable|output|activity|task)\s*\d*\s*[:\-–—]\s*/i

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const MONTH_PATTERN = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DATE_TOKEN = new RegExp([
  '\\d{4}-\\d{1,2}-\\d{1,2}',
  '\\d{1,2}[/.]\\d{1,2}[/.]\\d{2,4}',
  '\\d{1,2}-\\d{1,2}-\\d{4}',
  `\\d{1,2}(?:st|nd|rd|th)?[\\s-]+${MONTH_PATTERN}\\.?[\\s,-]+\\d{4}`,
  `${MONTH_PATTERN}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}`,
].join('|'), 'gi')
const MONTH_YEAR = new RegExp(`^(${MONTH_PATTERN})\\.?\\s+(\\d{4})$`, 'i')

interface ParsedDate {
  iso: string
  ambiguous: boolean
}

function normalizeHeaderKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

function monthNumber(value: string): number | null {
  return MONTHS[value.slice(0, 3).toLowerCase()] ?? null
}

/** Parses one date token. Day-first is assumed for d/m/y when both parts are ≤ 12 (flagged ambiguous). */
export function parseProjectCreationDocxDate(token: string): ParsedDate | null {
  const value = token.trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/\s+/g, ' ')
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  if (match) {
    const iso = isoFromParts(Number(match[1]), Number(match[2]), Number(match[3]))
    return iso ? { iso, ambiguous: false } : null
  }
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(value)
  if (match) {
    const a = Number(match[1])
    const b = Number(match[2])
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
    if (a > 12) {
      const iso = isoFromParts(year, b, a)
      return iso ? { iso, ambiguous: false } : null
    }
    if (b > 12) {
      const iso = isoFromParts(year, a, b)
      return iso ? { iso, ambiguous: false } : null
    }
    const iso = isoFromParts(year, b, a)
    return iso ? { iso, ambiguous: a !== b } : null
  }
  match = new RegExp(`^(\\d{1,2})[\\s-]+(${MONTH_PATTERN})\\.?[\\s,-]+(\\d{4})$`, 'i').exec(value)
  if (match) {
    const month = monthNumber(match[2])
    const iso = month ? isoFromParts(Number(match[3]), month, Number(match[1])) : null
    return iso ? { iso, ambiguous: false } : null
  }
  match = new RegExp(`^(${MONTH_PATTERN})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})$`, 'i').exec(value)
  if (match) {
    const month = monthNumber(match[1])
    const iso = month ? isoFromParts(Number(match[3]), month, Number(match[2])) : null
    return iso ? { iso, ambiguous: false } : null
  }
  return null
}

interface DateCell {
  dates: ParsedDate[]
  /** A month-only value ("September 2026") resolved to its first/last day. */
  monthOnly: { first: string; last: string } | null
  unparsed: boolean
}

function readDateCell(raw: string): DateCell {
  const text = raw.trim()
  if (!text) return { dates: [], monthOnly: null, unparsed: false }
  const dates = (text.match(DATE_TOKEN) ?? [])
    .map(parseProjectCreationDocxDate)
    .filter((date): date is ParsedDate => date !== null)
  if (dates.length > 0) return { dates, monthOnly: null, unparsed: false }
  const monthYear = MONTH_YEAR.exec(text)
  if (monthYear) {
    const month = monthNumber(monthYear[1])!
    const year = Number(monthYear[2])
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return {
      dates: [],
      monthOnly: { first: isoFromParts(year, month, 1)!, last: isoFromParts(year, month, last)! },
      unparsed: false,
    }
  }
  return { dates: [], monthOnly: null, unparsed: true }
}

function parseDurationDays(raw: string, headerUnit: 'DAYS' | 'WEEKS'): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*(working days?|business days?|days?|d|wd|weeks?|wks?|w|months?|mos?)?\.?$/i.exec(raw.trim())
  if (!match) return null
  const amount = Number(match[1])
  const unit = (match[2] ?? '').toLowerCase()
  const multiplier = /^(w|wk|wks|week|weeks)$/.test(unit)
    ? 5
    : /^(month|months|mo|mos)$/.test(unit)
    ? 21
    : unit
    ? 1
    : headerUnit === 'WEEKS' ? 5 : 1
  const days = Math.ceil(amount * multiplier)
  return days >= 1 && days <= 2_000 ? days : null
}

function subtractBusinessDays(end: Date, count: number): Date {
  let ms = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  let remaining = count
  while (remaining > 0) {
    ms -= 86_400_000
    if (isWorkingDay(new Date(ms))) remaining -= 1
  }
  return new Date(ms)
}

function normalizeOwner(raw: string): { party: '' | '360GROUND' | 'CLIENT' | 'SHARED'; unrecognized: string | null } {
  const value = raw.trim()
  if (!value) return { party: '', unrecognized: null }
  const upper = value.toUpperCase()
  if (['360GROUND', 'CLIENT', 'SHARED'].includes(upper)) return { party: upper as '360GROUND' | 'CLIENT' | 'SHARED', unrecognized: null }
  const client = /\b(client|customer|employer|beneficiary)\b/i.test(value)
  const us = /\b(360\s*ground|360g|consultants?|contractors?|vendors?|suppliers?|service providers?)\b/i.test(value)
  if (/\b(joint(ly)?|shared|both|all parties)\b/i.test(value) || (client && us)) return { party: 'SHARED', unrecognized: null }
  if (client) return { party: 'CLIENT', unrecognized: null }
  if (us) return { party: '360GROUND', unrecognized: null }
  return { party: '', unrecognized: value.slice(0, 100) }
}

function numberText(raw: string): string {
  const match = /-?\d+(?:\.\d+)?/.exec(raw.replace(/,/g, ''))
  return match ? match[0] : ''
}

function lowerConfidence(current: Confidence, next: Confidence): Confidence {
  return CONFIDENCE_RANK[next] > CONFIDENCE_RANK[current] ? next : current
}

function headingPhase(headingPath: readonly string[]): { name: string; strong: boolean } | null {
  for (let index = headingPath.length - 1; index >= 0; index -= 1) {
    if (PHASE_HEADING.test(headingPath[index])) return { name: headingPath[index], strong: true }
  }
  for (let index = headingPath.length - 1; index >= 0; index -= 1) {
    if (!GENERIC_HEADING.test(headingPath[index])) return { name: headingPath[index], strong: false }
  }
  return headingPath.length ? { name: headingPath[headingPath.length - 1], strong: false } : null
}

function safeName(value: string, fallback: string, max = 300): string {
  const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, max)
  return trimmed.length >= 2 ? trimmed : fallback
}

interface TableColumns {
  columns: Map<DocxColumn, number>
  durationUnit: 'DAYS' | 'WEEKS'
}

function mapTableColumns(header: readonly string[]): TableColumns {
  const columns = new Map<DocxColumn, number>()
  let durationUnit: 'DAYS' | 'WEEKS' = 'DAYS'
  header.forEach((cell, index) => {
    const shared = matchProjectCreationImportHeader(cell)
    const key = normalizeHeaderKey(cell)
    const target: DocxColumn | null = shared?.target ?? DOCX_HEADER_ALIASES[key] ?? null
    if (!target || columns.has(target)) return
    columns.set(target, index)
    if (target === 'Duration' && key.includes('week')) durationUnit = 'WEEKS'
  })
  return { columns, durationUnit }
}

interface DocxItem {
  kind: ItemKind
  block: ProjectCreationDocxBlock
  rowNumber: number | null
  excerpt: string
  phase: string
  /** Phase came from a Phase column, a phase heading, or an activity table's context. */
  anchored: boolean
  /** A milestone row listed among activities (closes the preceding activity group). */
  inline: boolean
  explicitMilestone: string | null
  title: string
  cells: Partial<Record<DocxColumn, string>>
  start: string | null
  end: string | null
  durationDays: number | null
  confidence: Confidence
  reasons: string[]
  derivedDate: boolean
  owner: ReturnType<typeof normalizeOwner>
  milestone: string | null
  milestoneGrouping: 'EXPLICIT' | 'CLOSED_BY_ROW' | 'BY_DATE' | 'GENERATED' | 'FLOATING' | null
}

function cellValue(row: readonly string[], columns: Map<DocxColumn, number>, column: DocxColumn): string {
  const index = columns.get(column)
  return index === undefined ? '' : (row[index] ?? '').trim()
}

function applyDates(item: DocxItem, input: { start?: string; end?: string; date?: string; duration?: string; durationUnit?: 'DAYS' | 'WEEKS' }) {
  const startCell = readDateCell(input.start ?? '')
  const endCell = readDateCell(input.end ?? '')
  const dateCell = readDateCell(input.date ?? '')
  const note = (confidence: Confidence, reason: string) => {
    item.confidence = lowerConfidence(item.confidence, confidence)
    item.reasons.push(reason)
  }
  for (const [label, cell] of [['start', startCell], ['end', endCell], ['date', dateCell]] as const) {
    if (cell.unparsed) note('LOW', `the ${label} date text could not be read as a calendar date`)
    if (cell.dates.some((date) => date.ambiguous)) note('LOW', `the ${label} date is ambiguous (read day-first)`)
    if (cell.monthOnly) note('LOW', `the ${label} date names only a month`)
  }
  let start = startCell.dates[0]?.iso ?? startCell.monthOnly?.first ?? null
  let end = endCell.dates[endCell.dates.length - 1]?.iso ?? endCell.monthOnly?.last ?? null
  if (dateCell.dates.length >= 2) {
    start ??= dateCell.dates[0].iso
    end ??= dateCell.dates[dateCell.dates.length - 1].iso
  } else if (dateCell.dates.length === 1) {
    end ??= dateCell.dates[0].iso
  } else if (dateCell.monthOnly) {
    start ??= dateCell.monthOnly.first
    end ??= dateCell.monthOnly.last
  }
  if (input.duration?.trim()) {
    const days = parseDurationDays(input.duration, input.durationUnit ?? 'DAYS')
    if (days === null) note('MEDIUM', 'the duration could not be read')
    item.durationDays = days
    if (days !== null && start && !end) {
      end = addBusinessDays(new Date(`${start}T00:00:00.000Z`), days - 1).toISOString().slice(0, 10)
      item.derivedDate = true
      note('MEDIUM', `the end date was derived from a ${days}-working-day duration`)
    } else if (days !== null && end && !start) {
      start = subtractBusinessDays(new Date(`${end}T00:00:00.000Z`), days - 1).toISOString().slice(0, 10)
      item.derivedDate = true
      note('MEDIUM', `the start date was derived from a ${days}-working-day duration`)
    }
  }
  item.start = start
  item.end = end
}

function stripDates(text: string): string {
  let value = text.replace(DATE_TOKEN, ' ')
  for (let pass = 0; pass < 2; pass += 1) {
    value = value
      .replace(/\b(by|due|on|from|until|to|between|and|starting|ending)\s*(?=[-–—:,.;)]|$)/gi, ' ')
      .replace(/\(\s*[-–—]?\s*\)/g, ' ')
      .replace(/\s*[-–—:,;]\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }
  return value
}

function kindFromText(value: string): ItemKind | null {
  if (/^milestone\b|^m\d+\s*[:\-–—]/i.test(value)) return 'MILESTONE'
  if (/^(deliverable|output)\b|^d\d+\s*[:\-–—]/i.test(value)) return 'DELIVERABLE'
  return null
}

function kindFromType(value: string): ItemKind | null {
  if (/milestone|gate|checkpoint/i.test(value)) return 'MILESTONE'
  if (/deliverable|output|submission/i.test(value)) return 'DELIVERABLE'
  if (/activity|task/i.test(value)) return 'ACTIVITY'
  return null
}

function newItem(kind: ItemKind, block: ProjectCreationDocxBlock, rowNumber: number | null, excerpt: string, phase: { name: string; anchored: boolean }): DocxItem {
  return {
    kind,
    block,
    rowNumber,
    excerpt: excerpt.slice(0, 1_000),
    phase: phase.name,
    anchored: phase.anchored,
    inline: false,
    explicitMilestone: null,
    title: '',
    cells: {},
    start: null,
    end: null,
    durationDays: null,
    confidence: 'HIGH',
    reasons: [],
    derivedDate: false,
    owner: { party: '', unrecognized: null },
    milestone: null,
    milestoneGrouping: null,
  }
}

function tableItems(block: ProjectCreationDocxBlock): DocxItem[] {
  if (block.rows.length < 2) return []
  const { columns, durationUnit } = mapTableColumns(block.rows[0])
  const tableKind: ItemKind | null = columns.has('Activity')
    ? 'ACTIVITY'
    : columns.has('Milestone')
    ? 'MILESTONE'
    : columns.has('Deliverable')
    ? 'DELIVERABLE'
    : null
  if (!tableKind) return []
  const context = headingPhase(block.headingPath)
  const items: DocxItem[] = []
  block.rows.slice(1).forEach((row, index) => {
    if (row.every((cell) => !cell.trim())) return
    const explicitPhase = cellValue(row, columns, 'Phase')
    const titleColumn: DocxColumn = tableKind === 'ACTIVITY' ? 'Activity' : tableKind === 'MILESTONE' ? 'Milestone' : 'Deliverable'
    const rawTitle = cellValue(row, columns, titleColumn)
    const typeKind = kindFromType(cellValue(row, columns, 'Type'))
    const kind = tableKind === 'ACTIVITY' ? (typeKind ?? kindFromText(rawTitle) ?? 'ACTIVITY') : tableKind
    const phaseName = explicitPhase || context?.name || 'Work plan'
    const item = newItem(kind, block, index + 2, row.join(' | '), {
      name: safeName(phaseName, 'Work plan'),
      anchored: Boolean(explicitPhase) || tableKind === 'ACTIVITY' || Boolean(context?.strong),
    })
    item.title = rawTitle.replace(LABEL_PREFIX, '').trim()
    item.inline = tableKind === 'ACTIVITY'
    for (const column of columns.keys()) item.cells[column] = cellValue(row, columns, column)
    if (tableKind === 'ACTIVITY' && kind === 'ACTIVITY') {
      const milestone = cellValue(row, columns, 'Milestone')
      item.explicitMilestone = milestone ? safeName(milestone, milestone) : null
    }
    if (tableKind === 'DELIVERABLE' || kind === 'DELIVERABLE') {
      const milestone = cellValue(row, columns, 'Milestone')
      item.explicitMilestone = milestone ? safeName(milestone, milestone) : null
    }
    item.owner = normalizeOwner(cellValue(row, columns, 'Owner Party'))
    if (item.owner.unrecognized) {
      item.confidence = lowerConfidence(item.confidence, 'MEDIUM')
      item.reasons.push(`the owner "${item.owner.unrecognized}" is not a recognised party and was kept as the suggested role`)
    }
    applyDates(item, {
      start: cellValue(row, columns, 'Start Date'),
      end: cellValue(row, columns, 'End Date'),
      date: cellValue(row, columns, 'Date'),
      duration: cellValue(row, columns, 'Duration'),
      durationUnit,
    })
    items.push(item)
  })
  return items
}

function paragraphItem(block: ProjectCreationDocxBlock): DocxItem | null {
  const labelled = LABEL_PREFIX.test(block.text)
  const nearest = block.headingPath[block.headingPath.length - 1] ?? ''
  const context = headingPhase(block.headingPath)
  const scheduleContext = Boolean(context?.strong)
    || /\b(activit|task|work ?plan|schedule|milestone|deliverable|output)/i.test(nearest)
  if (!labelled && !(block.isListItem && scheduleContext)) return null
  if (block.text.length > 400) return null
  const kind = kindFromText(block.text)
    ?? (/milestone/i.test(nearest) && !context?.strong ? 'MILESTONE' : null)
    ?? (/deliverable|output/i.test(nearest) && !context?.strong ? 'DELIVERABLE' : null)
    ?? 'ACTIVITY'
  const item = newItem(kind, block, null, block.text, {
    name: safeName(context?.name ?? 'Work plan', 'Work plan'),
    anchored: Boolean(context?.strong) || kind === 'ACTIVITY',
  })
  item.inline = Boolean(context?.strong) && !/milestone/i.test(nearest)
  const dates = (block.text.match(DATE_TOKEN) ?? [])
  item.title = stripDates(block.text.replace(LABEL_PREFIX, ''))
  item.confidence = 'MEDIUM'
  item.reasons.push('read from a document paragraph rather than a table')
  applyDates(item, dates.length >= 2
    ? { start: dates[0], end: dates[dates.length - 1] }
    : { date: dates[0] ?? '' })
  return item
}

function collectItems(extraction: ProjectCreationDocxExtraction): DocxItem[] {
  const items: DocxItem[] = []
  for (const block of extraction.blocks) {
    if (block.type === 'TABLE') items.push(...tableItems(block))
    else if (block.type === 'PARAGRAPH') {
      const item = paragraphItem(block)
      if (item) items.push(item)
    }
    if (items.length > MAX_ITEMS) break
  }
  return items.slice(0, MAX_ITEMS)
}

interface MilestoneEntry {
  phase: string
  name: string
  due: string | null
  item: DocxItem | null
  grouping: 'EXPLICIT' | 'CLOSED_BY_ROW' | 'BY_DATE' | 'GENERATED'
}

/** Assigns every activity/deliverable to a milestone following rules 2–3. */
function groupItems(items: DocxItem[]): { milestones: MilestoneEntry[]; phaseOrder: string[]; unattached: DocxItem[] } {
  const phaseOrder: string[] = []
  const milestones: MilestoneEntry[] = []
  const pending = new Map<string, DocxItem[]>()
  const floatingMilestones: DocxItem[] = []
  const floatingDeliverables: DocxItem[] = []
  const unattached: DocxItem[] = []
  const notePhase = (phase: string) => { if (!phaseOrder.includes(phase)) phaseOrder.push(phase) }
  const milestoneKey = (phase: string, name: string) => `${phase}\u0000${name.toLowerCase()}`
  const addMilestone = (entry: MilestoneEntry) => {
    const key = milestoneKey(entry.phase, entry.name)
    const existing = milestones.find((candidate) => milestoneKey(candidate.phase, candidate.name) === key)
    if (existing) {
      existing.due ??= entry.due
      existing.item ??= entry.item
      return existing
    }
    milestones.push(entry)
    notePhase(entry.phase)
    return entry
  }

  for (const item of items) {
    if (item.kind === 'MILESTONE') {
      if (!item.inline) { floatingMilestones.push(item); continue }
      notePhase(item.phase)
      const name = safeName(item.title, `${item.phase} milestone`)
      addMilestone({ phase: item.phase, name, due: item.end ?? item.start, item, grouping: 'CLOSED_BY_ROW' })
      for (const waiting of pending.get(item.phase) ?? []) {
        waiting.milestone = name
        waiting.milestoneGrouping = 'CLOSED_BY_ROW'
      }
      pending.set(item.phase, [])
      continue
    }
    if (item.explicitMilestone) {
      notePhase(item.phase)
      addMilestone({ phase: item.phase, name: item.explicitMilestone, due: null, item: null, grouping: 'EXPLICIT' })
      item.milestone = item.explicitMilestone
      item.milestoneGrouping = 'EXPLICIT'
      continue
    }
    if (item.kind === 'DELIVERABLE' && !item.anchored) { floatingDeliverables.push(item); continue }
    notePhase(item.phase)
    const waiting = pending.get(item.phase) ?? []
    waiting.push(item)
    pending.set(item.phase, waiting)
  }

  // Floating milestone tables: place each in the phase whose dates contain it (else the last phase),
  // then group that phase's still-unassigned activities under it by date.
  const phaseRange = (phase: string) => {
    const dates = items.filter((item) => item.phase === phase && item.kind === 'ACTIVITY')
      .flatMap((item) => [item.start, item.end]).filter((date): date is string => Boolean(date)).sort()
    return dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null
  }
  for (const floating of floatingMilestones) {
    const due = floating.end ?? floating.start
    let target = floating.phase
    if (!floating.anchored) {
      target = (due ? phaseOrder.find((phase) => {
        const range = phaseRange(phase)
        return range && range.first <= due && due <= range.last
      }) : undefined) ?? phaseOrder[phaseOrder.length - 1] ?? floating.phase
      floating.phase = target
      floating.confidence = lowerConfidence(floating.confidence, phaseOrder.length > 1 && !due ? 'LOW' : 'MEDIUM')
      floating.reasons.push(`placed in phase "${target}" ${due ? 'by its date' : 'because the document does not name its phase'}`)
    }
    addMilestone({ phase: target, name: safeName(floating.title, `${target} milestone`), due, item: floating, grouping: 'BY_DATE' })
  }
  for (const [phase, waiting] of pending) {
    const dated = milestones.filter((entry) => entry.phase === phase && entry.grouping === 'BY_DATE' && entry.due)
      .sort((a, b) => (a.due! < b.due! ? -1 : 1))
    const leftovers: DocxItem[] = []
    for (const item of waiting) {
      const finish = item.end ?? item.start
      const target = finish ? dated.find((entry) => finish <= entry.due!) : undefined
      if (target) {
        item.milestone = target.name
        item.milestoneGrouping = 'BY_DATE'
      } else {
        leftovers.push(item)
      }
    }
    if (leftovers.length > 0) {
      const name = safeName(`${phase} activities`, 'Work plan activities')
      addMilestone({ phase, name, due: null, item: null, grouping: 'GENERATED' })
      for (const item of leftovers) {
        item.milestone = name
        item.milestoneGrouping = 'GENERATED'
      }
    }
  }
  for (const deliverable of floatingDeliverables) {
    const due = deliverable.end ?? deliverable.start
    const sorted = [...milestones].filter((entry) => entry.due).sort((a, b) => (a.due! < b.due! ? -1 : 1))
    const target = (due ? sorted.find((entry) => due <= entry.due!) : undefined) ?? milestones[milestones.length - 1]
    if (!target) { unattached.push(deliverable); continue }
    deliverable.phase = target.phase
    deliverable.milestone = target.name
    deliverable.milestoneGrouping = 'FLOATING'
    deliverable.confidence = lowerConfidence(deliverable.confidence, 'LOW')
    deliverable.reasons.push(`attached to milestone "${target.name}" because the document does not link it to one`)
  }
  return { milestones, phaseOrder, unattached }
}

function itemReference(item: DocxItem): string {
  const reference = item.rowNumber === null ? item.block.reference : `${item.block.reference}, row ${item.rowNumber}`
  return reference.slice(0, 500)
}

function toRecord(item: DocxItem, rowId: string, idMap: Map<string, string>): ScheduleImportRecord {
  const mapIds = (value: string | undefined) => (value ?? '').split(/[;,]/).map((part) => part.trim()).filter(Boolean)
    .map((part) => idMap.get(part) ?? part).join(';')
  const email = (item.cells['Assignee Email'] ?? '').trim()
  const priority = (item.cells.Priority ?? '').trim().toUpperCase()
  const risk = (item.cells.Risk ?? '').trim().toUpperCase()
  return {
    'Row ID': rowId,
    Phase: item.phase,
    'Phase Weight': numberText(item.cells['Phase Weight'] ?? ''),
    Milestone: item.milestone ?? `${item.phase} activities`,
    'Milestone Weight': numberText(item.cells['Milestone Weight'] ?? ''),
    'Key Milestone': item.cells['Key Milestone'] ?? '',
    Activity: item.title.slice(0, 300),
    'Parent Row ID': mapIds(item.cells['Parent Row ID']),
    Description: (item.cells.Description ?? '').slice(0, 2_000),
    'Owner Party': item.owner.party,
    'Assignee Email': /^\S+@\S+\.\S+$/.test(email) ? email : '',
    'Start Date': item.start ?? '',
    'End Date': item.end ?? '',
    'Activity Weight': numberText(item.cells['Activity Weight'] ?? ''),
    Priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority) ? priority : '',
    Risk: ['LOW', 'MEDIUM', 'HIGH'].includes(risk) ? risk : '',
    'Is Blocked': item.cells['Is Blocked'] ?? '',
    'Blocker Details': (item.cells['Blocker Details'] ?? '').slice(0, 1_000),
    'Predecessor Row IDs': mapIds(item.cells['Predecessor Row IDs']),
    'Dependency Types': item.cells['Dependency Types'] ?? '',
    'Lag Days': numberText(item.cells['Lag Days'] ?? ''),
    Deliverable: item.cells.Deliverable ?? '',
    'Estimated Hours': numberText(item.cells['Estimated Hours'] ?? ''),
    'Assumptions / Source Notes': (item.cells['Assumptions / Source Notes'] ?? '').slice(0, 2_000),
  }
}

function sanitizeRows(rows: ParsedScheduleRow[]): ParsedScheduleRow[] {
  const known = new Set(rows.map((row) => row.rowId))
  return rows.map((row) => {
    const seen = new Set<string>()
    return {
      ...row,
      parentRowId: row.parentRowId && known.has(row.parentRowId) && row.parentRowId !== row.rowId ? row.parentRowId : null,
      dependencies: row.dependencies.filter((dependency) => {
        if (!known.has(dependency.predecessorRowId) || dependency.predecessorRowId === row.rowId) return false
        if (seen.has(dependency.predecessorRowId)) return false
        seen.add(dependency.predecessorRowId)
        return true
      }),
    }
  })
}

/**
 * Builds a reviewable draft schedule from an ordered DOCX extraction. Every extracted
 * row keeps a DOCX source reference and confidence; inferred groupings and derived
 * dates become PROPOSED assumptions; a review warning must be acknowledged before commit.
 */
export function buildProjectCreationDocxSchedule(
  extraction: ProjectCreationDocxExtraction,
  options: { activeAssigneeEmails?: ReadonlySet<string> } = {},
): ProjectCreationDocxScheduleResult {
  const blockSchedule = projectCreationDocxExtractionToSchedule(extraction)
  const items = collectItems(extraction)
  const warnings: Warning[] = []
  const assumptions: Assumption[] = []
  const addWarning = (code: string, message: string, affectedPaths: string[], sourceIds: string[]) => {
    if (warnings.length >= MAX_WARNINGS) return
    warnings.push({
      id: `docx-warning-${warnings.length + 1}`,
      code,
      message: message.slice(0, 2_000),
      severity: 'WARNING',
      affectedPaths: affectedPaths.slice(0, 100),
      sourceIds: sourceIds.slice(0, 100),
      acknowledged: false,
    })
  }

  const usable = items.filter((item) => {
    if (item.title.length >= 3) return true
    addWarning('DOCX_ROW_SKIPPED', `${itemReference(item)}: the row has no usable title and was not extracted.`, [], [item.block.id])
    return false
  })
  const { milestones: milestoneEntries, unattached } = groupItems(usable)

  const activityItems = usable.filter((item) => item.kind === 'ACTIVITY')
  const rowIdByItem = new Map<DocxItem, string>()
  const docIdMapsByBlock = new Map<string, Map<string, string>>()
  activityItems.forEach((item, index) => {
    const rowId = `D-${index + 1}`
    rowIdByItem.set(item, rowId)
    const documentId = (item.cells['Row ID'] ?? '').trim()
    if (documentId) {
      const map = docIdMapsByBlock.get(item.block.id) ?? new Map<string, string>()
      map.set(documentId, rowId)
      docIdMapsByBlock.set(item.block.id, map)
    }
  })
  const records = activityItems.map((item) => toRecord(
    item,
    rowIdByItem.get(item)!,
    docIdMapsByBlock.get(item.block.id) ?? new Map(),
  ))

  let schedule: ProjectCreationScheduleJson = { ...blockSchedule }
  let validation: ProjectCreationValidationJson = createEmptyProjectCreationValidationJson()
  if (records.length > 0) {
    const parsed = parseScheduleRows(records, { sourceRowOffset: 1 })
    validation = validateProjectCreationImport({
      rows: parsed.rows,
      records,
      parseIssues: parsed.issues,
      sourceRowOffset: 1,
      activeAssigneeEmails: options.activeAssigneeEmails,
    })
    const normalized = normalizeProjectCreationParsedRows(sanitizeRows(parsed.rows), 'DOCX')
    schedule = { ...normalized.scheduleJson, sources: [] }
  }

  // Milestones named by milestone rows/tables (including ones with no activities).
  const phaseIdByName = new Map(schedule.phases.map((phase) => [phase.name, phase.id]))
  const milestoneIdByKey = new Map(schedule.milestones.map((milestone) => {
    const phase = schedule.phases.find((candidate) => candidate.id === milestone.phaseId)
    return [`${phase?.name}\u0000${milestone.name}`, milestone.id]
  }))
  let generatedId = 0
  for (const entry of milestoneEntries) {
    const key = `${entry.phase}\u0000${entry.name}`
    let milestoneId = milestoneIdByKey.get(key)
    if (!milestoneId && entry.grouping !== 'GENERATED') {
      let phaseId = phaseIdByName.get(entry.phase)
      if (!phaseId) {
        phaseId = `docx-phase-${++generatedId}`
        schedule.phases.push({ id: phaseId, name: entry.phase, position: schedule.phases.length, weight: 0, plannedStart: null, plannedEnd: null })
        phaseIdByName.set(entry.phase, phaseId)
      }
      milestoneId = `docx-milestone-${++generatedId}`
      schedule.milestones.push({
        id: milestoneId,
        phaseId,
        name: entry.name,
        position: schedule.milestones.filter((milestone) => milestone.phaseId === phaseId).length,
        weight: 0,
        isKeyMilestone: true,
        dueDate: entry.due,
      })
      milestoneIdByKey.set(key, milestoneId)
    } else if (milestoneId && entry.item) {
      const milestone = schedule.milestones.find((candidate) => candidate.id === milestoneId)!
      milestone.isKeyMilestone = true
      if (entry.due) milestone.dueDate = entry.due
    }
  }

  const sources: Source[] = []
  const addSource = (item: DocxItem, targetPath: string) => {
    sources.push({
      id: `docx-item-${sources.length + 1}`,
      type: item.block.type === 'TABLE' ? 'DOCX_TABLE' : 'DOCX_PARAGRAPH',
      reference: itemReference(item),
      excerpt: item.excerpt || null,
      targetPaths: [targetPath],
      basis: 'SOURCE_FACT',
      confidence: item.confidence,
      lastEditor: 'USER',
    })
    return sources[sources.length - 1].id
  }

  // Activities: provenance, suggested role for unrecognised owners.
  const activityIdByRowId = new Map(schedule.activities.map((activity) => [activity.sourceRowId, activity.id]))
  const derivedPaths: string[] = []
  const derivedSources: string[] = []
  for (const item of activityItems) {
    const activityId = activityIdByRowId.get(rowIdByItem.get(item)!)
    if (!activityId) continue
    const activity = schedule.activities.find((candidate) => candidate.id === activityId)!
    if (item.owner.unrecognized) activity.suggestedRole = item.owner.unrecognized
    const sourceId = addSource(item, `activities.${activityId}`)
    if (item.derivedDate) {
      derivedPaths.push(`activities.${activityId}`)
      derivedSources.push(sourceId)
    }
    if (item.confidence === 'LOW') {
      addWarning('DOCX_LOW_CONFIDENCE', `${itemReference(item)}: low confidence — ${item.reasons.join('; ')}. Check this activity against the document.`, [`activities.${activityId}`], [sourceId])
    }
  }
  for (let index = 0; index < derivedPaths.length; index += 100) {
    assumptions.push({
      id: `docx-assumption-${assumptions.length + 1}`,
      text: 'Missing start or end dates were derived from the document\'s durations using working days (Monday–Friday). Confirm or edit these dates.',
      category: 'DATE',
      affectedPaths: derivedPaths.slice(index, index + 100),
      sourceIds: derivedSources.slice(index, index + 100),
      status: 'PROPOSED',
    })
  }

  // Milestone provenance and inferred groupings.
  for (const entry of milestoneEntries) {
    const milestoneId = milestoneIdByKey.get(`${entry.phase}\u0000${entry.name}`)
    if (!milestoneId) continue
    const sourceIds = entry.item ? [addSource(entry.item, `milestones.${milestoneId}`)] : []
    if (entry.item?.confidence === 'LOW') {
      addWarning('DOCX_LOW_CONFIDENCE', `${itemReference(entry.item)}: low confidence — ${entry.item.reasons.join('; ')}.`, [`milestones.${milestoneId}`], sourceIds)
    }
    const grouped = usable.filter((item) => item.kind === 'ACTIVITY' && item.phase === entry.phase && item.milestone === entry.name)
    if (entry.grouping === 'GENERATED' || (entry.grouping === 'BY_DATE' && grouped.length > 0)) {
      const blockIds = [...new Set(grouped.map((item) => item.block.id))]
      assumptions.push({
        id: `docx-assumption-${assumptions.length + 1}`,
        text: entry.grouping === 'GENERATED'
          ? `The document names no milestone for ${grouped.length} ${grouped.length === 1 ? 'activity' : 'activities'} in "${entry.phase}", so they were grouped under the generated milestone "${entry.name}". Rename or regroup them if needed.`.slice(0, 2_000)
          : `Activities in "${entry.phase}" that finish on or before ${entry.due} were grouped under milestone "${entry.name}" by date.`.slice(0, 2_000),
        category: 'OTHER',
        affectedPaths: [`milestones.${milestoneId}`],
        sourceIds: [...sourceIds, ...blockIds].slice(0, 100),
        status: 'PROPOSED',
      })
    }
  }

  // Deliverables from deliverable rows/tables/paragraphs.
  const deliverableItems = usable.filter((item) => item.kind === 'DELIVERABLE' && item.milestone)
  deliverableItems.forEach((item, index) => {
    const milestoneId = milestoneIdByKey.get(`${item.phase}\u0000${item.milestone}`)
    if (!milestoneId) { unattached.push(item); return }
    const id = `docx-deliverable-${index + 1}`
    schedule.deliverables.push({
      id,
      milestoneId,
      name: safeName(item.title, 'Deliverable'),
      producingActivityIds: schedule.activities.filter((activity) => activity.milestoneId === milestoneId).map((activity) => activity.id),
      dueDate: item.end ?? item.start,
      ownerParty: item.owner.party || '360GROUND',
      approvalActivityId: null,
      approvalCriteria: null,
    })
    const sourceId = addSource(item, `deliverables.${id}`)
    if (item.milestoneGrouping === 'FLOATING') {
      assumptions.push({
        id: `docx-assumption-${assumptions.length + 1}`,
        text: `Deliverable "${schedule.deliverables[schedule.deliverables.length - 1].name}" is not linked to a milestone in the document; it was attached to the nearest milestone by date.`.slice(0, 2_000),
        category: 'DELIVERABLE',
        affectedPaths: [`deliverables.${id}`],
        sourceIds: [sourceId],
        status: 'PROPOSED',
      })
    } else if (item.confidence === 'LOW') {
      addWarning('DOCX_LOW_CONFIDENCE', `${itemReference(item)}: low confidence — ${item.reasons.join('; ')}.`, [`deliverables.${id}`], [sourceId])
    }
  })
  for (const deliverable of schedule.deliverables) {
    if (!deliverable.dueDate) {
      addWarning('DOCX_DELIVERABLE_WITHOUT_DATE', `Deliverable "${deliverable.name}" has no due date in the document. Enter one during review or acknowledge it.`, [`deliverables.${deliverable.id}.dueDate`], [])
    }
  }
  if (unattached.length > 0) {
    addWarning('DOCX_DELIVERABLES_WITHOUT_SCHEDULE', `${unattached.length} ${unattached.length === 1 ? 'deliverable was' : 'deliverables were'} found without a schedule to attach to (${unattached.slice(0, 5).map((item) => `"${item.title}"`).join(', ')}). Add them under a milestone during review.`, ['deliverables'], [...new Set(unattached.map((item) => item.block.id))])
  }

  const counts = {
    phases: schedule.phases.length,
    milestones: schedule.milestones.length,
    activities: schedule.activities.length,
    dependencies: schedule.dependencies.length,
    deliverables: schedule.deliverables.length,
  }
  if (usable.length === 0) {
    addWarning('DOCX_NO_SCHEDULE_FOUND', 'No schedule table or activity list was recognised in the document. Add phases, milestones, and activities in review, or use the spreadsheet template.', [], [])
  } else {
    warnings.unshift({
      id: 'docx-warning-review',
      code: 'DOCX_SCHEDULE_REVIEW',
      message: `${counts.phases} phases, ${counts.milestones} milestones, ${counts.activities} activities, and ${counts.deliverables} deliverables were extracted deterministically from the document. Review every row against its source reference before creating the project.`,
      severity: 'WARNING',
      affectedPaths: ['phases', 'milestones', 'activities', 'deliverables'],
      sourceIds: [...new Set(usable.map((item) => item.block.id))].slice(0, 100),
      acknowledged: false,
    })
  }

  const blockSources = blockSchedule.sources.slice(0, Math.max(0, 10_000 - sources.length))
  schedule.sources = [...blockSources, ...sources]
  validation.warnings = [...warnings, ...validation.warnings]
  validation.assumptions = assumptions.slice(0, 2_000)
  const scheduleJson = projectCreationScheduleJsonSchema.parse(schedule)
  const validationJson = projectCreationValidationJsonSchema.parse(validation)
  return {
    scheduleJson,
    validationJson,
    summary: counts,
    hasBlockingErrors: hasBlockingProjectCreationIssues(validationJson),
  }
}
