/**
 * KR definition form (KRX-4): values, validation and the PATCH body builder.
 * Pure. Limits mirror krExtensionFieldsSchema in lib/okr/kr-commitment.ts (F2).
 */
import { z } from 'zod'
import { KR_COMMITMENTS, KR_DIRECTIONS, isKrCommitment } from '@/types/package'
import type { KrDefinitionDTO, UpdateKrDefinitionInput } from '../checkpoints/checkpoint-types'

export const DEFINITION_LIMITS = {
  baselineText: 2000,
  targetText: 2000,
  measuredBy: 1000,
  dueText: 500,
} as const

const text = (max: number, label: string) =>
  z.string().max(max, `${label} must be ${max.toLocaleString('en-US')} characters or fewer`)

const numeric = z
  .string()
  .trim()
  .refine((v) => v === '' || Number.isFinite(Number(v)), 'Enter a number')

export const definitionFormSchema = z
  .object({
    commitment: z.union([z.enum(KR_COMMITMENTS), z.literal('')]),
    direction: z.enum(KR_DIRECTIONS),
    baselineText: text(DEFINITION_LIMITS.baselineText, 'Baseline'),
    targetText: text(DEFINITION_LIMITS.targetText, 'Target'),
    measuredBy: text(DEFINITION_LIMITS.measuredBy, 'Measured by'),
    dueText: text(DEFINITION_LIMITS.dueText, 'Due'),
    dueDate: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Pick a valid date'),
    startValue: numeric,
    targetValue: numeric,
  })
  .superRefine((v, ctx) => {
    // KRX-1: same rule as parseStartAndTarget — the span must point the KR's way.
    if (v.startValue === '' || v.targetValue === '') return
    const start = Number(v.startValue)
    const target = Number(v.targetValue)
    if (v.direction === 'INCREASE' && !(target > start)) {
      ctx.addIssue({ code: 'custom', path: ['targetValue'], message: 'For an increasing KR the target must be above the start' })
    }
    if (v.direction === 'DECREASE' && !(target < start)) {
      ctx.addIssue({ code: 'custom', path: ['targetValue'], message: 'For a decreasing KR the target must be below the start' })
    }
  })

export type DefinitionFormValues = z.input<typeof definitionFormSchema>

/** `yyyy-mm-dd` of a stored KR due date (UTC calendar day), or ''. */
function dayKey(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

const numText = (v: number | null) => (v == null ? '' : String(v))

export function definitionToFormValues(def: KrDefinitionDTO): DefinitionFormValues {
  return {
    commitment: isKrCommitment(def.commitment) ? def.commitment : '',
    direction: def.direction === 'DECREASE' ? 'DECREASE' : 'INCREASE',
    baselineText: def.baselineText ?? '',
    targetText: def.targetText ?? '',
    measuredBy: def.measuredBy ?? '',
    dueText: def.dueText ?? '',
    dueDate: dayKey(def.dueDate),
    startValue: numText(def.startValue),
    targetValue: numText(def.targetValue),
  }
}

/**
 * PATCH body with only the keys that changed ('' clears a text field). Start
 * and target go with it when either changed or the direction flipped (the
 * route re-validates the span against the new direction). Returns null when
 * nothing changed.
 */
export function buildDefinitionPatch(def: KrDefinitionDTO, values: DefinitionFormValues): UpdateKrDefinitionInput | null {
  const before = definitionToFormValues(def)
  const body: UpdateKrDefinitionInput = {}
  const textKeys = ['baselineText', 'targetText', 'measuredBy', 'dueText'] as const
  for (const key of textKeys) {
    const next = values[key].trim()
    if (next !== before[key].trim()) body[key] = next === '' ? null : next
  }
  if (values.commitment !== before.commitment) body.commitment = values.commitment === '' ? null : values.commitment
  if (values.dueDate !== before.dueDate) body.dueDate = values.dueDate === '' ? null : `${values.dueDate}T00:00:00.000Z`
  const directionChanged = values.direction !== before.direction
  if (directionChanged) body.direction = values.direction
  const numbersChanged =
    values.startValue.trim() !== before.startValue || values.targetValue.trim() !== before.targetValue
  if ((directionChanged || numbersChanged) && values.startValue.trim() !== '' && values.targetValue.trim() !== '') {
    body.startValue = Number(values.startValue)
    body.targetValue = Number(values.targetValue)
  }
  return Object.keys(body).length > 0 ? body : null
}
