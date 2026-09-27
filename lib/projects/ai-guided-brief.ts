import { z } from 'zod'
import { PROJECT_TYPES } from '@/features/projects/types'
import {
  projectCreationIsoDateSchema,
  type NormalizedProjectCreationDraft,
} from './creation-normalize'

/**
 * Story 3.1 / 3.2 — the guided AI brief (requirements §9.1) and pasted TOR (§9.2).
 *
 * The brief is persisted inside the existing draft JSON — no schema change:
 *   - common metadata goes to `project.*` exactly like Manual/Import;
 *   - every other brief field is a `USER_INPUT` source (`brief-*` ids, target path
 *     `brief.<field>`), which also gives generated rows a "brief field" source
 *     reference as §10.3 requires.
 */

export const AI_GUIDED_BRIEF_MODES = ['BRIEF', 'TOR'] as const
export const AI_GUIDED_DETAIL_LEVELS = ['SUMMARY', 'STANDARD', 'DETAILED'] as const
export const AI_GUIDED_WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
export const AI_GUIDED_PROJECT_TYPES = [...PROJECT_TYPES, 'OTHER'] as const

export const AI_GUIDED_BRIEF_LIMITS = {
  deliverables: 20,
  knownMilestones: 20,
  team: 20,
  scopeItems: 20,
  nonWorkingDates: 60,
  text: 1_000,
  notes: 2_000,
  torMin: 200,
  torMax: 20_000,
} as const

export type AiGuidedDetailLevel = (typeof AI_GUIDED_DETAIL_LEVELS)[number]

const text = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => text(max).nullable()

const aiGuidedBriefObject = z.object({
  mode: z.enum(AI_GUIDED_BRIEF_MODES),
  name: z.string().trim().min(3).max(200),
  projectType: z.enum(AI_GUIDED_PROJECT_TYPES).nullable(),
  projectTypeOther: optionalText(200),
  plannedStart: projectCreationIsoDateSchema,
  plannedEnd: projectCreationIsoDateSchema,
  clientName: optionalText(200),
  objective: optionalText(AI_GUIDED_BRIEF_LIMITS.text),
  businessOutcome: optionalText(AI_GUIDED_BRIEF_LIMITS.text),
  scopeIncluded: z.array(text(500)).max(AI_GUIDED_BRIEF_LIMITS.scopeItems),
  scopeExcluded: z.array(text(500)).max(AI_GUIDED_BRIEF_LIMITS.scopeItems),
  deliverables: z.array(z.object({
    name: text(300),
    approvalCriteria: optionalText(500),
  }).strict()).max(AI_GUIDED_BRIEF_LIMITS.deliverables),
  knownMilestones: z.array(z.object({
    name: text(300),
    date: projectCreationIsoDateSchema.nullable(),
  }).strict()).max(AI_GUIDED_BRIEF_LIMITS.knownMilestones),
  methodology: optionalText(AI_GUIDED_BRIEF_LIMITS.text),
  team: z.array(z.object({
    role: text(100),
    name: optionalText(200),
    email: z.string().trim().toLowerCase().email().max(320).nullable(),
  }).strict()).max(AI_GUIDED_BRIEF_LIMITS.team),
  clientResponsibilities: optionalText(AI_GUIDED_BRIEF_LIMITS.text),
  internalResponsibilities: optionalText(AI_GUIDED_BRIEF_LIMITS.text),
  dependenciesConstraints: optionalText(AI_GUIDED_BRIEF_LIMITS.text),
  approvalProcess: optionalText(AI_GUIDED_BRIEF_LIMITS.text),
  risksAssumptions: optionalText(AI_GUIDED_BRIEF_LIMITS.text),
  workingDays: z.array(z.enum(AI_GUIDED_WEEKDAYS)).min(1).max(7)
    .refine((days) => new Set(days).size === days.length, 'Working days must be unique'),
  nonWorkingDates: z.array(projectCreationIsoDateSchema).max(AI_GUIDED_BRIEF_LIMITS.nonWorkingDates),
  allowNonWorkingDates: z.boolean(),
  detailLevel: z.enum(AI_GUIDED_DETAIL_LEVELS),
  notes: optionalText(AI_GUIDED_BRIEF_LIMITS.notes),
  torText: z.string().max(AI_GUIDED_BRIEF_LIMITS.torMax).nullable(),
}).strict()

export const aiGuidedBriefSchema = aiGuidedBriefObject.superRefine((brief, context) => {
  if (brief.plannedEnd <= brief.plannedStart) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['plannedEnd'], message: 'Planned end must be after planned start' })
  }
  if (brief.mode === 'BRIEF') {
    if (!brief.projectType) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectType'], message: 'Project type is required' })
    }
    if (brief.deliverables.length < 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['deliverables'], message: 'Add at least one expected deliverable or outcome' })
    }
  }
  if (brief.mode === 'TOR' && (brief.torText?.trim().length ?? 0) < AI_GUIDED_BRIEF_LIMITS.torMin) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['torText'],
      message: `Paste at least ${AI_GUIDED_BRIEF_LIMITS.torMin} characters of TOR text`,
    })
  }
  if (brief.projectType === 'OTHER' && !brief.projectTypeOther) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectTypeOther'], message: 'Describe the project type' })
  }
})

export type AiGuidedBrief = z.infer<typeof aiGuidedBriefSchema>

type DraftSource = NormalizedProjectCreationDraft['sources'][number]

export const AI_GUIDED_BRIEF_SOURCE_PREFIX = 'brief-'

const TEXT_FIELDS = [
  ['methodology', 'Delivery approach'],
  ['clientResponsibilities', 'Client responsibilities'],
  ['internalResponsibilities', 'Internal responsibilities'],
  ['dependenciesConstraints', 'Dependencies and constraints'],
  ['approvalProcess', 'Approval process'],
  ['risksAssumptions', 'Known risks and assumptions'],
] as const

const CHUNK_SIZE = 950

/** Normalizes pasted TOR/notes whitespace so chunked storage is lossless. */
export function normalizeAiGuidedLongText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Source excerpts are trimmed by the normalized schema. Each chunk therefore
 * carries a `[n/N] ` prefix (protects leading whitespace) and never ends in
 * whitespace (the whitespace moves to the next chunk), so join is exact.
 */
export function chunkAiGuidedLongText(value: string, size = CHUNK_SIZE): string[] {
  const chunks: string[] = []
  let rest = value
  while (rest.length > 0) {
    let end = Math.min(size, rest.length)
    while (end > 1 && end < rest.length && /\s/.test(rest[end - 1])) end -= 1
    chunks.push(rest.slice(0, end))
    rest = rest.slice(end)
  }
  return chunks.map((chunk, index) => `[${index + 1}/${chunks.length}] ${chunk}`)
}

export function joinAiGuidedLongText(excerpts: string[]): string {
  return excerpts.map((excerpt) => excerpt.replace(/^\[\d+\/\d+\] /, '')).join('')
}

function briefSource(id: string, field: string, reference: string, excerpt: string): DraftSource {
  return {
    id: `${AI_GUIDED_BRIEF_SOURCE_PREFIX}${id}`,
    type: 'USER_INPUT',
    reference: `Brief: ${reference}`.slice(0, 500),
    excerpt,
    targetPaths: [`brief.${field}`],
    basis: 'SOURCE_FACT',
    confidence: 'HIGH',
    lastEditor: 'USER',
  }
}

function pad(index: number) {
  return String(index + 1).padStart(3, '0')
}

export function aiGuidedBriefSources(brief: AiGuidedBrief): DraftSource[] {
  const sources: DraftSource[] = [
    briefSource('settings', 'settings', 'Mode and schedule detail', JSON.stringify({
      mode: brief.mode,
      detailLevel: brief.detailLevel,
    })),
  ]
  brief.deliverables.forEach((item, index) => {
    sources.push(briefSource(`deliverable-${pad(index)}`, 'deliverables', `Deliverable ${index + 1}`, JSON.stringify(item)))
  })
  brief.knownMilestones.forEach((item, index) => {
    sources.push(briefSource(`milestone-${pad(index)}`, 'knownMilestones', `Known milestone ${index + 1}`, JSON.stringify(item)))
  })
  brief.team.forEach((item, index) => {
    sources.push(briefSource(`team-${pad(index)}`, 'team', `Team role ${index + 1}`, JSON.stringify(item)))
  })
  for (const [field, label] of TEXT_FIELDS) {
    const value = brief[field]
    if (value) sources.push(briefSource(field, field, label, value))
  }
  if (brief.notes) {
    chunkAiGuidedLongText(normalizeAiGuidedLongText(brief.notes)).forEach((chunk, index) => {
      sources.push(briefSource(`notes-${pad(index)}`, 'notes', 'Additional notes', chunk))
    })
  }
  if (brief.torText && brief.torText.trim()) {
    chunkAiGuidedLongText(normalizeAiGuidedLongText(brief.torText)).forEach((chunk, index) => {
      sources.push(briefSource(`tor-${pad(index)}`, 'torText', `Pasted TOR part ${index + 1}`, chunk))
    })
  }
  return sources
}

function workingCalendarMode(brief: AiGuidedBrief): 'ORGANIZATION' | 'CUSTOM' {
  const standard = ['MON', 'TUE', 'WED', 'THU', 'FRI']
  const sameDays = brief.workingDays.length === standard.length
    && standard.every((day) => brief.workingDays.includes(day as (typeof AI_GUIDED_WEEKDAYS)[number]))
  return sameDays && brief.nonWorkingDates.length === 0 && !brief.allowNonWorkingDates ? 'ORGANIZATION' : 'CUSTOM'
}

/** Applies a validated brief to the common draft metadata and brief sources. */
export function applyAiGuidedBrief(
  draft: NormalizedProjectCreationDraft,
  input: AiGuidedBrief,
): NormalizedProjectCreationDraft {
  const brief = aiGuidedBriefSchema.parse(input)
  const next = structuredClone(draft)
  const clientChanged = next.project.clientName !== brief.clientName
  next.project = {
    ...next.project,
    name: brief.name,
    projectType: brief.projectType,
    projectTypeOther: brief.projectType === 'OTHER' ? brief.projectTypeOther : null,
    plannedStart: brief.plannedStart,
    plannedEnd: brief.plannedEnd,
    clientName: brief.clientName,
    clientId: clientChanged ? null : next.project.clientId,
    objective: brief.objective,
    businessOutcome: brief.businessOutcome,
    scopeIncluded: brief.scopeIncluded,
    scopeExcluded: brief.scopeExcluded,
    workingCalendar: {
      mode: workingCalendarMode(brief),
      timezone: next.project.workingCalendar.timezone,
      workingDays: [...brief.workingDays],
      nonWorkingDates: [...new Set(brief.nonWorkingDates)].sort(),
      allowNonWorkingDates: brief.allowNonWorkingDates,
    },
  }
  next.sources = [
    ...next.sources.filter((source) => !source.id.startsWith(AI_GUIDED_BRIEF_SOURCE_PREFIX)),
    ...aiGuidedBriefSources(brief),
  ]
  return next
}

function parseJsonExcerpt<T>(excerpt: string | null, schema: z.ZodType<T>): T | null {
  if (!excerpt) return null
  try {
    const parsed = schema.safeParse(JSON.parse(excerpt))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const settingsSchema = z.object({
  mode: z.enum(AI_GUIDED_BRIEF_MODES),
  detailLevel: z.enum(AI_GUIDED_DETAIL_LEVELS),
}).strict()

/**
 * Restores the saved brief from the draft. Returns null until a brief has been
 * saved (the settings source is written by every brief save).
 */
export function readAiGuidedBrief(draft: NormalizedProjectCreationDraft): AiGuidedBrief | null {
  const byPrefix = (prefix: string) => draft.sources
    .filter((source) => source.id.startsWith(`${AI_GUIDED_BRIEF_SOURCE_PREFIX}${prefix}`))
    .sort((left, right) => left.id.localeCompare(right.id))
  const settings = parseJsonExcerpt(byPrefix('settings')[0]?.excerpt ?? null, settingsSchema)
  if (!settings) return null
  const project = draft.project
  if (!project.name || !project.plannedStart || !project.plannedEnd) return null
  const textField = (field: string) => byPrefix(field)[0]?.excerpt ?? null
  const longText = (prefix: string) => {
    const parts = byPrefix(prefix).map((source) => source.excerpt ?? '')
    return parts.length > 0 ? joinAiGuidedLongText(parts) : null
  }
  const deliverableSchema = aiGuidedBriefObject.shape.deliverables.element
  const milestoneSchema = aiGuidedBriefObject.shape.knownMilestones.element
  const teamSchema = aiGuidedBriefObject.shape.team.element
  const projectType = AI_GUIDED_PROJECT_TYPES.includes(project.projectType as never)
    ? project.projectType as AiGuidedBrief['projectType']
    : null
  return {
    mode: settings.mode,
    name: project.name,
    projectType,
    projectTypeOther: project.projectTypeOther,
    plannedStart: project.plannedStart,
    plannedEnd: project.plannedEnd,
    clientName: project.clientName,
    objective: project.objective,
    businessOutcome: project.businessOutcome,
    scopeIncluded: project.scopeIncluded.slice(0, AI_GUIDED_BRIEF_LIMITS.scopeItems),
    scopeExcluded: project.scopeExcluded.slice(0, AI_GUIDED_BRIEF_LIMITS.scopeItems),
    deliverables: byPrefix('deliverable-')
      .map((source) => parseJsonExcerpt(source.excerpt, deliverableSchema))
      .filter((item): item is AiGuidedBrief['deliverables'][number] => item !== null),
    knownMilestones: byPrefix('milestone-')
      .map((source) => parseJsonExcerpt(source.excerpt, milestoneSchema))
      .filter((item): item is AiGuidedBrief['knownMilestones'][number] => item !== null),
    methodology: textField('methodology'),
    team: byPrefix('team-')
      .map((source) => parseJsonExcerpt(source.excerpt, teamSchema))
      .filter((item): item is AiGuidedBrief['team'][number] => item !== null),
    clientResponsibilities: textField('clientResponsibilities'),
    internalResponsibilities: textField('internalResponsibilities'),
    dependenciesConstraints: textField('dependenciesConstraints'),
    approvalProcess: textField('approvalProcess'),
    risksAssumptions: textField('risksAssumptions'),
    workingDays: [...project.workingCalendar.workingDays],
    nonWorkingDates: project.workingCalendar.nonWorkingDates.slice(0, AI_GUIDED_BRIEF_LIMITS.nonWorkingDates),
    allowNonWorkingDates: project.workingCalendar.allowNonWorkingDates,
    detailLevel: settings.detailLevel,
    notes: longText('notes-'),
    torText: longText('tor-'),
  }
}
